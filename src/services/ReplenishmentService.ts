import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore as firestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type { AppUser } from '../types/auth';
import type {
  AgentFundStock,
  CurrencyCode,
  FinancialLedgerEntry,
  FinancialOperator,
  ReplenishmentRequest,
} from '../types/financialSupervision';
import { recordAuditLog } from './AuditService';
import { verifyBiometricIdentity } from './BiometricAuthService';
import {
  buildFinancialReference,
  buildIdempotencyKey,
  buildStockId,
  enqueueFinancialSync,
  formatMoney,
  getOrCreateLocalAgentStock,
  isGlobalFinancialSupervisor,
  recalculateAgentStockFromLedger,
  reconcileAndPersistAgentStock,
  roundCurrency,
  sanitizeForFirestore,
} from './FinancialLedgerService';
import { assertDelegationAllowsAmount } from './FundAllocationService';

function isOnline(): boolean {
  return (
    isFirebaseConfigured &&
    (typeof navigator === 'undefined' ? true : navigator.onLine)
  );
}

export async function submitReplenishmentRequest(params: {
  requestType: ReplenishmentRequest['requestType'];
  currency: CurrencyCode;
  requestedAmount: number;
  virtualAmountPart?: number;
  cashAmountPart?: number;
  operator?: FinancialOperator | null;
  internalNumberId?: string | null;
  reason: string;
  urgency?: ReplenishmentRequest['urgency'];
  agencyName: string;
  idempotencyKey?: string;
  agent: AppUser;
}): Promise<ReplenishmentRequest> {
  const {
    requestType,
    currency,
    requestedAmount,
    operator = null,
    internalNumberId = null,
    reason,
    urgency = 'normale',
    agencyName,
    agent,
  } = params;

  if (agent.role !== 'agent' && !isGlobalFinancialSupervisor(agent)) {
    throw new Error('Seul un agent peut soumettre une demande de réapprovisionnement.');
  }

  const amount = roundCurrency(requestedAmount);
  if (amount <= 0) {
    throw new Error('Le montant demandé doit être strictement positif.');
  }

  const idemKey =
    params.idempotencyKey || buildIdempotencyKey(`replenish-${agent.uid}-${currency}`);
  const existing = await db.replenishmentRequests
    .where('idempotencyKey')
    .equals(idemKey)
    .first();
  if (existing) {
    return existing;
  }

  const stock = await getOrCreateLocalAgentStock({
    agentId: agent.uid,
    agentName: agent.displayName,
    agencyId: agent.agencyId ?? null,
    agencyName,
    currency,
  });

  const virtualPart =
    requestType === 'credit_virtuel'
      ? amount
      : requestType === 'cash_physique'
        ? 0
        : roundCurrency(params.virtualAmountPart ?? amount);
  const cashPart =
    requestType === 'cash_physique'
      ? amount
      : requestType === 'credit_virtuel'
        ? 0
        : roundCurrency(params.cashAmountPart ?? Math.max(0, amount - virtualPart));

  const now = Date.now();
  const req: ReplenishmentRequest = {
    id: `rep-${now}-${Math.random().toString(36).slice(2, 8)}`,
    reference: buildFinancialReference('RAP'),
    idempotencyKey: idemKey,
    agentId: agent.uid,
    agentName: agent.displayName,
    agencyId: agent.agencyId ?? null,
    agencyName,
    requestType,
    currency,
    requestedAmount: amount,
    approvedAmount: null,
    virtualAmountPart: virtualPart,
    cashAmountPart: cashPart,
    operator,
    internalNumberId,
    reason: reason.trim() || 'Réapprovisionnement crédit virtuel / caisse',
    urgency,
    projectedCashAtRequest: stock.physicalCashAvailable,
    projectedVirtualCreditAtRequest: stock.virtualCreditAvailable,
    status: 'en_attente',
    centralFundingSource: null,
    reviewedByUid: null,
    reviewedByName: null,
    reviewedByRole: null,
    reviewedAt: null,
    decisionNote: null,
    rejectionReason: null,
    delegatedApproval: false,
    delegationId: null,
    linkedLedgerEntryId: null,
    history: [
      {
        id: `evt-${now}`,
        action: 'Demande soumise',
        actorUid: agent.uid,
        actorName: agent.displayName,
        actorRole: agent.role,
        note: `Montant ${formatMoney(amount, currency)} (${requestType})`,
        timestamp: now,
      },
    ],
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'replenishmentRequests', req.id),
        sanitizeForFirestore({ ...req, syncStatus: 'synced' })
      );
      req.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('replenishmentRequest', req.id, 'create');
    }
  } else {
    await enqueueFinancialSync('replenishmentRequest', req.id, 'create');
  }

  await db.replenishmentRequests.put(req);
  await recordAuditLog({
    action: 'Demande de réapprovisionnement soumise',
    category: 'finance',
    severity: urgency === 'critique' ? 'warning' : 'info',
    details: `${agent.displayName} demande ${formatMoney(amount, currency)} (${requestType}) — Motif : ${req.reason}.`,
    actorName: agent.displayName,
    actorRole: agent.role,
    actorUid: agent.uid,
    agencyId: agent.agencyId ?? undefined,
    agencyName,
  });

  return req;
}

export async function approveReplenishmentRequest(params: {
  requestId: string;
  approvedAmount?: number;
  centralFundingSource: string;
  decisionNote?: string;
  supervisor: AppUser;
}): Promise<{
  request: ReplenishmentRequest;
  entry: FinancialLedgerEntry;
  stock: AgentFundStock;
}> {
  const { requestId, centralFundingSource, decisionNote, supervisor } = params;
  const req = await db.replenishmentRequests.get(requestId);
  if (!req) {
    throw new Error('Demande de réapprovisionnement introuvable.');
  }

  if (req.agentId === supervisor.uid) {
    await recordAuditLog({
      action: 'Tentative auto-approbation réapprovisionnement bloquée',
      category: 'security',
      severity: 'security',
      details: `${supervisor.displayName} a tenté d'approuver sa propre demande ${req.reference}.`,
      actorName: supervisor.displayName,
      actorRole: supervisor.role,
      actorUid: supervisor.uid,
    });
    throw new Error(
      "Sécurité : auto-approbation interdite. Un agent ne peut pas valider sa propre demande de réapprovisionnement."
    );
  }

  if (req.status !== 'en_attente' && req.status !== 'en_examen') {
    throw new Error(
      `Cette demande a déjà été traitée (statut : ${req.status}). Double approbation bloquée.`
    );
  }

  if (!centralFundingSource.trim()) {
    throw new Error('La source de financement centrale est obligatoire pour approuver.');
  }

  const finalAmount = roundCurrency(params.approvedAmount ?? req.requestedAmount);
  if (finalAmount <= 0) {
    throw new Error('Le montant approuvé doit être strictement positif.');
  }

  const delegation = await assertDelegationAllowsAmount({
    actor: supervisor,
    agencyId: req.agencyId,
    currency: req.currency,
    amount: finalAmount,
    targetAgentId: req.agentId,
  });

  if (typeof window !== 'undefined') {
    await verifyBiometricIdentity({
      user: supervisor,
      actionTitle: `Approbation réapprovisionnement ${req.reference}`,
      actionDescription: `${formatMoney(finalAmount, req.currency)} pour ${req.agentName}`,
    });
  }

  const currentStock = await getOrCreateLocalAgentStock({
    agentId: req.agentId,
    agentName: req.agentName,
    agencyId: req.agencyId,
    agencyName: req.agencyName,
    currency: req.currency,
  });

  let cashDelta = 0;
  let virtualDelta = finalAmount;
  let category: FinancialLedgerEntry['operationCategory'] = 'attribution_credit_virtuel';

  if (req.requestType === 'cash_physique') {
    cashDelta = finalAmount;
    virtualDelta = 0;
    category = 'reception_cash';
  } else if (req.requestType === 'mixte') {
    const ratio = req.requestedAmount > 0 ? finalAmount / req.requestedAmount : 1;
    virtualDelta = roundCurrency((req.virtualAmountPart ?? finalAmount) * ratio);
    cashDelta = roundCurrency(finalAmount - virtualDelta);
    category = virtualDelta >= cashDelta ? 'attribution_credit_virtuel' : 'reception_cash';
  }

  const now = Date.now();
  let entry: FinancialLedgerEntry = {
    id: `led-${now}-${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: buildIdempotencyKey(`rep-approve-${req.id}`, req.id),
    reference: buildFinancialReference('CRD'),
    operationCategory: category,
    agentId: req.agentId,
    agentName: req.agentName,
    agencyId: req.agencyId,
    agencyName: req.agencyName,
    currency: req.currency,
    physicalCashDelta: cashDelta,
    virtualCreditDelta: virtualDelta,
    capitalDelta: roundCurrency(cashDelta + virtualDelta),
    feeDelta: 0,
    fxNetDelta: 0,
    adjustmentDelta: 0,
    physicalCashBefore: currentStock.physicalCashAvailable,
    physicalCashAfter: roundCurrency(currentStock.physicalCashAvailable + cashDelta),
    virtualCreditBefore: currentStock.virtualCreditAvailable,
    virtualCreditAfter: roundCurrency(currentStock.virtualCreditAvailable + virtualDelta),
    operator: req.operator ?? null,
    internalNumberId: req.internalNumberId ?? null,
    linkedReplenishmentId: req.id,
    centralFundingSource: centralFundingSource.trim(),
    authorUid: supervisor.uid,
    authorName: supervisor.displayName,
    authorRole: supervisor.role,
    reason: `Approbation ${req.reference} : ${req.reason}`,
    notes: decisionNote?.trim() || null,
    syncLifecycle: 'en_attente_synchro',
    syncStatus: 'pending',
    serverConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  let updatedReq: ReplenishmentRequest = {
    ...req,
    status: 'approuvee',
    approvedAmount: finalAmount,
    centralFundingSource: centralFundingSource.trim(),
    reviewedByUid: supervisor.uid,
    reviewedByName: supervisor.displayName,
    reviewedByRole: supervisor.role,
    reviewedAt: now,
    decisionNote: decisionNote?.trim() || null,
    delegatedApproval: Boolean(delegation),
    delegationId: delegation?.id ?? null,
    linkedLedgerEntryId: entry.id,
    history: [
      ...req.history,
      {
        id: `evt-${now}`,
        action: delegation ? 'Approuvée par délégation' : 'Approuvée par Direction',
        actorUid: supervisor.uid,
        actorName: supervisor.displayName,
        actorRole: supervisor.role,
        note: `${formatMoney(finalAmount, req.currency)} — Source : ${centralFundingSource}`,
        timestamp: now,
      },
    ],
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      const reqRef = doc(firestoreDb, 'replenishmentRequests', req.id);
      const ledgerRef = doc(firestoreDb, 'financialLedger', entry.id);
      const stockRef = doc(firestoreDb, 'agentFundStocks', buildStockId(req.agentId, req.currency));

      await runTransaction(firestoreDb, async (tx) => {
        const reqSnap = await tx.get(reqRef);
        if (reqSnap.exists()) {
          const remoteStatus = reqSnap.data().status;
          if (remoteStatus !== 'en_attente' && remoteStatus !== 'en_examen') {
            throw new Error(`Cette demande a déjà été traitée côté serveur (${remoteStatus}). Double approbation bloquée.`);
          }
        }
        const stockSnap = await tx.get(stockRef);
        const serverStock = stockSnap.exists()
          ? (stockSnap.data() as AgentFundStock)
          : currentStock;

        const confirmedEntry: FinancialLedgerEntry = {
          ...entry,
          physicalCashBefore: serverStock.physicalCashConfirmed,
          physicalCashAfter: roundCurrency(serverStock.physicalCashConfirmed + cashDelta),
          virtualCreditBefore: serverStock.virtualCreditConfirmed,
          virtualCreditAfter: roundCurrency(serverStock.virtualCreditConfirmed + virtualDelta),
          syncLifecycle: 'confirmee_serveur',
          syncStatus: 'synced',
          serverConfirmedAt: now,
        };
        entry = confirmedEntry;
        updatedReq = { ...updatedReq, syncStatus: 'synced' };

        const allEntries = [
          ...(await db.financialLedger
            .where('agentId')
            .equals(req.agentId)
            .filter((e) => e.currency === req.currency && e.id !== entry.id)
            .toArray()),
          confirmedEntry,
        ];
        const nextStock = recalculateAgentStockFromLedger({
          agentId: req.agentId,
          agentName: req.agentName,
          agencyId: req.agencyId,
          agencyName: req.agencyName,
          currency: req.currency,
          entries: allEntries,
          existingStock: serverStock,
        });

        tx.set(ledgerRef, sanitizeForFirestore(confirmedEntry));
        tx.set(stockRef, sanitizeForFirestore(nextStock));
        tx.set(reqRef, sanitizeForFirestore(updatedReq));
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Double approbation bloquée')) {
        throw err;
      }
      await enqueueFinancialSync('financialLedger', entry.id, 'create');
      await enqueueFinancialSync('replenishmentRequest', updatedReq.id, 'update');
      await enqueueFinancialSync('agentFundStock', buildStockId(req.agentId, req.currency), 'update');
    }
  } else {
    await enqueueFinancialSync('financialLedger', entry.id, 'create');
    await enqueueFinancialSync('replenishmentRequest', updatedReq.id, 'update');
    await enqueueFinancialSync('agentFundStock', buildStockId(req.agentId, req.currency), 'update');
  }

  await db.financialLedger.put(entry);
  await db.replenishmentRequests.put(updatedReq);
  const stock = await reconcileAndPersistAgentStock({
    agentId: req.agentId,
    agentName: req.agentName,
    agencyId: req.agencyId,
    agencyName: req.agencyName,
    currency: req.currency,
  });

  await recordAuditLog({
    action: 'Demande de réapprovisionnement approuvée',
    category: 'finance',
    severity: 'info',
    details: `${req.reference} approuvée pour ${req.agentName} : ${formatMoney(finalAmount, req.currency)} (Source : ${centralFundingSource}).`,
    actorName: supervisor.displayName,
    actorRole: supervisor.role,
    actorUid: supervisor.uid,
    agencyId: req.agencyId ?? undefined,
    agencyName: req.agencyName,
  });

  return { request: updatedReq, entry, stock };
}

export async function rejectReplenishmentRequest(params: {
  requestId: string;
  rejectionReason: string;
  supervisor: AppUser;
}): Promise<ReplenishmentRequest> {
  const { requestId, rejectionReason, supervisor } = params;
  const req = await db.replenishmentRequests.get(requestId);
  if (!req) throw new Error('Demande introuvable.');
  if (req.agentId === supervisor.uid) {
    throw new Error('Auto-décision interdite.');
  }
  if (req.status !== 'en_attente' && req.status !== 'en_examen') {
    throw new Error(`Demande déjà traitée (${req.status}).`);
  }
  if (!rejectionReason.trim()) {
    throw new Error('Un motif de rejet est obligatoire.');
  }
  if (!isGlobalFinancialSupervisor(supervisor) && supervisor.role !== 'administrateur_agence') {
    throw new Error('Rôle non autorisé pour rejeter un réapprovisionnement.');
  }
  if (supervisor.role === 'administrateur_agence' && supervisor.agencyId !== req.agencyId) {
    throw new Error('Isolation par agence : rejet interdit hors succursale.');
  }

  const now = Date.now();
  const updated: ReplenishmentRequest = {
    ...req,
    status: 'rejetee',
    reviewedByUid: supervisor.uid,
    reviewedByName: supervisor.displayName,
    reviewedByRole: supervisor.role,
    reviewedAt: now,
    rejectionReason: rejectionReason.trim(),
    history: [
      ...req.history,
      {
        id: `evt-${now}`,
        action: 'Demande rejetée',
        actorUid: supervisor.uid,
        actorName: supervisor.displayName,
        actorRole: supervisor.role,
        note: rejectionReason.trim(),
        timestamp: now,
      },
    ],
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'replenishmentRequests', updated.id),
        sanitizeForFirestore({ ...updated, syncStatus: 'synced' })
      );
      updated.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('replenishmentRequest', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('replenishmentRequest', updated.id, 'update');
  }

  await db.replenishmentRequests.put(updated);
  await recordAuditLog({
    action: 'Demande de réapprovisionnement rejetée',
    category: 'finance',
    severity: 'warning',
    details: `${req.reference} rejetée par ${supervisor.displayName} : ${rejectionReason}.`,
    actorName: supervisor.displayName,
    actorRole: supervisor.role,
    actorUid: supervisor.uid,
    agencyId: req.agencyId ?? undefined,
    agencyName: req.agencyName,
  });

  return updated;
}

export async function cancelReplenishmentRequest(params: {
  requestId: string;
  agent: AppUser;
}): Promise<ReplenishmentRequest> {
  const req = await db.replenishmentRequests.get(params.requestId);
  if (!req) throw new Error('Demande introuvable.');
  if (req.agentId !== params.agent.uid) {
    throw new Error("Seul l'agent demandeur peut annuler sa demande.");
  }
  if (req.status !== 'en_attente') {
    throw new Error('Seule une demande en attente peut être annulée.');
  }
  const now = Date.now();
  const updated: ReplenishmentRequest = {
    ...req,
    status: 'annulee',
    history: [
      ...req.history,
      {
        id: `evt-${now}`,
        action: 'Annulée par l’agent',
        actorUid: params.agent.uid,
        actorName: params.agent.displayName,
        actorRole: params.agent.role,
        timestamp: now,
      },
    ],
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'replenishmentRequests', updated.id),
        sanitizeForFirestore({ ...updated, syncStatus: 'synced' })
      );
      updated.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('replenishmentRequest', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('replenishmentRequest', updated.id, 'update');
  }
  await db.replenishmentRequests.put(updated);
  return updated;
}
