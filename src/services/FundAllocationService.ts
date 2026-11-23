import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore as firestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type { AppUser } from '../types/auth';
import type {
  AgentFundStock,
  CashHandover,
  CreditDelegationScope,
  CurrencyCode,
  FinancialLedgerEntry,
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

export interface TargetAgentDescriptor {
  uid: string;
  displayName: string;
  agencyId: string | null;
  agencyName: string;
}

function isOnline(): boolean {
  return (
    isFirebaseConfigured &&
    (typeof navigator === 'undefined' ? true : navigator.onLine)
  );
}

async function runSensitiveBiometricCheck(params: {
  actor: AppUser;
  actionTitle: string;
  actionDescription: string;
}): Promise<void> {
  if (typeof window === 'undefined') {
    // Environnement serveur / tests unitaires Node sans DOM
    return;
  }
  const res = await verifyBiometricIdentity({
    user: params.actor,
    actionTitle: params.actionTitle,
    actionDescription: params.actionDescription,
  });
  if (!res.verified) {
    throw new Error('Vérification biométrique requise et refusée.');
  }
}

export async function getActiveDelegationForUser(
  delegateUid: string,
  agencyId: string | null
): Promise<CreditDelegationScope | null> {
  if (!agencyId) return null;
  const now = Date.now();
  const id = `${delegateUid}_${agencyId}`;
  const exact = await db.financialDelegations.get(id);
  if (
    exact &&
    exact.status === 'active' &&
    exact.expiresAt > now &&
    exact.canApproveReplenishment
  ) {
    return exact;
  }
  const all = await db.financialDelegations
    .where('delegateUid')
    .equals(delegateUid)
    .toArray();
  const active = all.find(
    (d) =>
      d.agencyId === agencyId &&
      d.status === 'active' &&
      d.expiresAt > now &&
      d.canApproveReplenishment
  );
  return active ?? null;
}

export async function assertDelegationAllowsAmount(params: {
  actor: AppUser;
  agencyId: string | null;
  currency: CurrencyCode;
  amount: number;
  targetAgentId?: string;
}): Promise<CreditDelegationScope | null> {
  const { actor, agencyId, currency, amount, targetAgentId } = params;
  if (targetAgentId && targetAgentId === actor.uid) {
    throw new Error("Sécurité : auto-attribution de crédit virtuel strictement interdite.");
  }
  if (isGlobalFinancialSupervisor(actor)) {
    return null;
  }
  if (actor.role !== 'administrateur_agence') {
    throw new Error(
      "Seul le Directeur Général, l'Administrateur Système ou un Administrateur d'Agence explicitement délégué peut allouer du crédit virtuel."
    );
  }
  if (!actor.agencyId || actor.agencyId !== agencyId) {
    throw new Error("Isolation par agence : délégation limitée à votre propre succursale.");
  }
  const delegation = await getActiveDelegationForUser(actor.uid, agencyId);
  if (!delegation) {
    throw new Error(
      'Aucune délégation active du Directeur Général trouvée pour attribuer du crédit virtuel dans cette agence.'
    );
  }
  const ceiling =
    currency === 'USD' ? delegation.maxAmountUsd : delegation.maxAmountCdf;
  if (amount > ceiling) {
    throw new Error(
      `Plafond de délégation dépassé : maximum autorisé ${formatMoney(ceiling, currency)}. Validation directe du Directeur Général requise.`
    );
  }
  return delegation;
}

/**
 * Attribution initiale (cash physique et/ou crédit virtuel) lors de l'activation financière d'un agent.
 * Strictement réservée au DG / Administrateur Système.
 */
export async function allocateInitialEndowment(params: {
  targetAgent: TargetAgentDescriptor;
  currency: CurrencyCode;
  initialPhysicalCash: number;
  initialVirtualCredit: number;
  centralFundingSource: string;
  reason: string;
  idempotencyKey?: string;
  actor: AppUser;
}): Promise<{ entry: FinancialLedgerEntry; stock: AgentFundStock }> {
  const {
    targetAgent,
    currency,
    initialPhysicalCash,
    initialVirtualCredit,
    centralFundingSource,
    reason,
    actor,
  } = params;

  if (!isGlobalFinancialSupervisor(actor)) {
    throw new Error(
      'Accès refusé : seul le Directeur Général ou Administrateur Système peut effectuer une dotation initiale.'
    );
  }
  if (targetAgent.uid === actor.uid) {
    throw new Error('Sécurité : auto-dotation strictement interdite.');
  }

  const cashAmt = roundCurrency(initialPhysicalCash);
  const virtualAmt = roundCurrency(initialVirtualCredit);
  if (cashAmt < 0 || virtualAmt < 0 || (cashAmt === 0 && virtualAmt === 0)) {
    throw new Error(
      'Veuillez saisir un montant valide positif pour le cash physique et/ou le crédit virtuel.'
    );
  }
  if (!centralFundingSource.trim()) {
    throw new Error('La source de financement centrale est obligatoire.');
  }

  const idemKey =
    params.idempotencyKey || buildIdempotencyKey(`dotation-${targetAgent.uid}-${currency}`);
  const existingEntry = await db.financialLedger
    .where('idempotencyKey')
    .equals(idemKey)
    .first();
  if (existingEntry) {
    const stock = await reconcileAndPersistAgentStock({
      agentId: targetAgent.uid,
      agentName: targetAgent.displayName,
      agencyId: targetAgent.agencyId,
      agencyName: targetAgent.agencyName,
      currency,
    });
    return { entry: existingEntry, stock };
  }

  await runSensitiveBiometricCheck({
    actor,
    actionTitle: `Dotation initiale ${currency} (${targetAgent.displayName})`,
    actionDescription: `Cash ${formatMoney(cashAmt, currency)} / Virtuel ${formatMoney(virtualAmt, currency)}`,
  });

  const currentStock = await getOrCreateLocalAgentStock({
    agentId: targetAgent.uid,
    agentName: targetAgent.displayName,
    agencyId: targetAgent.agencyId,
    agencyName: targetAgent.agencyName,
    currency,
  });

  const now = Date.now();
  const entryId = `led-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const capitalDelta = roundCurrency(cashAmt + virtualAmt);

  let entry: FinancialLedgerEntry = {
    id: entryId,
    idempotencyKey: idemKey,
    reference: buildFinancialReference('DOT'),
    operationCategory: 'dotation_initiale',
    agentId: targetAgent.uid,
    agentName: targetAgent.displayName,
    agencyId: targetAgent.agencyId,
    agencyName: targetAgent.agencyName,
    currency,
    physicalCashDelta: cashAmt,
    virtualCreditDelta: virtualAmt,
    capitalDelta,
    feeDelta: 0,
    fxNetDelta: 0,
    adjustmentDelta: 0,
    physicalCashBefore: currentStock.physicalCashAvailable,
    physicalCashAfter: roundCurrency(currentStock.physicalCashAvailable + cashAmt),
    virtualCreditBefore: currentStock.virtualCreditAvailable,
    virtualCreditAfter: roundCurrency(currentStock.virtualCreditAvailable + virtualAmt),
    centralFundingSource: centralFundingSource.trim(),
    authorUid: actor.uid,
    authorName: actor.displayName,
    authorRole: actor.role,
    reason: reason.trim() || 'Dotation initiale de démarrage agent',
    syncLifecycle: 'en_attente_synchro',
    syncStatus: 'pending',
    serverConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      const stockId = buildStockId(targetAgent.uid, currency);
      const ledgerRef = doc(firestoreDb, 'financialLedger', entry.id);
      const stockRef = doc(firestoreDb, 'agentFundStocks', stockId);

      await runTransaction(firestoreDb, async (tx) => {
        const existingSnap = await tx.get(ledgerRef);
        if (existingSnap.exists()) return;
        const stockSnap = await tx.get(stockRef);
        const serverStock = stockSnap.exists()
          ? (stockSnap.data() as AgentFundStock)
          : currentStock;

        const confirmedEntry: FinancialLedgerEntry = {
          ...entry,
          physicalCashBefore: serverStock.physicalCashConfirmed,
          physicalCashAfter: roundCurrency(serverStock.physicalCashConfirmed + cashAmt),
          virtualCreditBefore: serverStock.virtualCreditConfirmed,
          virtualCreditAfter: roundCurrency(serverStock.virtualCreditConfirmed + virtualAmt),
          syncLifecycle: 'confirmee_serveur',
          syncStatus: 'synced',
          serverConfirmedAt: now,
        };
        entry = confirmedEntry;

        const allEntries = [
          ...(await db.financialLedger
            .where('agentId')
            .equals(targetAgent.uid)
            .filter((e) => e.currency === currency && e.id !== entry.id)
            .toArray()),
          confirmedEntry,
        ];
        const nextStock = recalculateAgentStockFromLedger({
          agentId: targetAgent.uid,
          agentName: targetAgent.displayName,
          agencyId: targetAgent.agencyId,
          agencyName: targetAgent.agencyName,
          currency,
          entries: allEntries,
          existingStock: serverStock,
        });

        tx.set(ledgerRef, sanitizeForFirestore(confirmedEntry));
        tx.set(stockRef, sanitizeForFirestore(nextStock));
      });
    } catch {
      // Fallback hors ligne vers file syncQueue
      await enqueueFinancialSync('financialLedger', entry.id, 'create');
      await enqueueFinancialSync('agentFundStock', buildStockId(targetAgent.uid, currency), 'update');
    }
  } else {
    await enqueueFinancialSync('financialLedger', entry.id, 'create');
    await enqueueFinancialSync('agentFundStock', buildStockId(targetAgent.uid, currency), 'update');
  }

  await db.financialLedger.put(entry);
  const stock = await reconcileAndPersistAgentStock({
    agentId: targetAgent.uid,
    agentName: targetAgent.displayName,
    agencyId: targetAgent.agencyId,
    agencyName: targetAgent.agencyName,
    currency,
  });

  await recordAuditLog({
    action: 'Dotation initiale fonds agent',
    category: 'finance',
    severity: 'info',
    details: `${targetAgent.displayName} doté en ${currency} — Cash: ${formatMoney(cashAmt, currency)}, Crédit virtuel: ${formatMoney(virtualAmt, currency)} (Source: ${centralFundingSource}).`,
    actorName: actor.displayName,
    actorRole: actor.role,
    actorUid: actor.uid,
    agencyId: targetAgent.agencyId ?? undefined,
    agencyName: targetAgent.agencyName,
  });

  return { entry, stock };
}

/**
 * Attribution directe de crédit virtuel (DG / Admin Système / Admin Agence avec délégation valide).
 */
export async function allocateVirtualCredit(params: {
  targetAgent: TargetAgentDescriptor;
  currency: CurrencyCode;
  amount: number;
  centralFundingSource: string;
  reason: string;
  linkedReplenishmentId?: string | null;
  idempotencyKey?: string;
  actor: AppUser;
}): Promise<{ entry: FinancialLedgerEntry; stock: AgentFundStock }> {
  const {
    targetAgent,
    currency,
    amount,
    centralFundingSource,
    reason,
    linkedReplenishmentId = null,
    actor,
  } = params;

  const creditAmt = roundCurrency(amount);
  if (creditAmt <= 0) {
    throw new Error('Le montant du crédit virtuel à allouer doit être strictement positif.');
  }
  if (!centralFundingSource.trim()) {
    throw new Error('Veuillez préciser la source centrale ou le compte opérateur émetteur.');
  }

  await assertDelegationAllowsAmount({
    actor,
    agencyId: targetAgent.agencyId,
    currency,
    amount: creditAmt,
    targetAgentId: targetAgent.uid,
  });

  const idemKey =
    params.idempotencyKey || buildIdempotencyKey(`credit-${targetAgent.uid}-${currency}`);
  const existingEntry = await db.financialLedger
    .where('idempotencyKey')
    .equals(idemKey)
    .first();
  if (existingEntry) {
    const stock = await reconcileAndPersistAgentStock({
      agentId: targetAgent.uid,
      agentName: targetAgent.displayName,
      agencyId: targetAgent.agencyId,
      agencyName: targetAgent.agencyName,
      currency,
    });
    return { entry: existingEntry, stock };
  }

  await runSensitiveBiometricCheck({
    actor,
    actionTitle: `Attribution crédit virtuel ${formatMoney(creditAmt, currency)}`,
    actionDescription: `Bénéficiaire : ${targetAgent.displayName} (${targetAgent.agencyName})`,
  });

  const currentStock = await getOrCreateLocalAgentStock({
    agentId: targetAgent.uid,
    agentName: targetAgent.displayName,
    agencyId: targetAgent.agencyId,
    agencyName: targetAgent.agencyName,
    currency,
  });

  const now = Date.now();
  let entry: FinancialLedgerEntry = {
    id: `led-${now}-${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: idemKey,
    reference: buildFinancialReference('CRD'),
    operationCategory: 'attribution_credit_virtuel',
    agentId: targetAgent.uid,
    agentName: targetAgent.displayName,
    agencyId: targetAgent.agencyId,
    agencyName: targetAgent.agencyName,
    currency,
    physicalCashDelta: 0,
    virtualCreditDelta: creditAmt,
    capitalDelta: creditAmt,
    feeDelta: 0,
    fxNetDelta: 0,
    adjustmentDelta: 0,
    physicalCashBefore: currentStock.physicalCashAvailable,
    physicalCashAfter: currentStock.physicalCashAvailable,
    virtualCreditBefore: currentStock.virtualCreditAvailable,
    virtualCreditAfter: roundCurrency(currentStock.virtualCreditAvailable + creditAmt),
    linkedReplenishmentId,
    centralFundingSource: centralFundingSource.trim(),
    authorUid: actor.uid,
    authorName: actor.displayName,
    authorRole: actor.role,
    reason: reason.trim() || 'Attribution de crédit virtuel',
    syncLifecycle: 'en_attente_synchro',
    syncStatus: 'pending',
    serverConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      const stockId = buildStockId(targetAgent.uid, currency);
      const ledgerRef = doc(firestoreDb, 'financialLedger', entry.id);
      const stockRef = doc(firestoreDb, 'agentFundStocks', stockId);

      await runTransaction(firestoreDb, async (tx) => {
        const existingSnap = await tx.get(ledgerRef);
        if (existingSnap.exists()) return;
        const stockSnap = await tx.get(stockRef);
        const serverStock = stockSnap.exists()
          ? (stockSnap.data() as AgentFundStock)
          : currentStock;

        const confirmedEntry: FinancialLedgerEntry = {
          ...entry,
          physicalCashBefore: serverStock.physicalCashConfirmed,
          physicalCashAfter: serverStock.physicalCashConfirmed,
          virtualCreditBefore: serverStock.virtualCreditConfirmed,
          virtualCreditAfter: roundCurrency(serverStock.virtualCreditConfirmed + creditAmt),
          syncLifecycle: 'confirmee_serveur',
          syncStatus: 'synced',
          serverConfirmedAt: now,
        };
        entry = confirmedEntry;

        const allEntries = [
          ...(await db.financialLedger
            .where('agentId')
            .equals(targetAgent.uid)
            .filter((e) => e.currency === currency && e.id !== entry.id)
            .toArray()),
          confirmedEntry,
        ];
        const nextStock = recalculateAgentStockFromLedger({
          agentId: targetAgent.uid,
          agentName: targetAgent.displayName,
          agencyId: targetAgent.agencyId,
          agencyName: targetAgent.agencyName,
          currency,
          entries: allEntries,
          existingStock: serverStock,
        });

        tx.set(ledgerRef, sanitizeForFirestore(confirmedEntry));
        tx.set(stockRef, sanitizeForFirestore(nextStock));
      });
    } catch {
      await enqueueFinancialSync('financialLedger', entry.id, 'create');
      await enqueueFinancialSync('agentFundStock', buildStockId(targetAgent.uid, currency), 'update');
    }
  } else {
    await enqueueFinancialSync('financialLedger', entry.id, 'create');
    await enqueueFinancialSync('agentFundStock', buildStockId(targetAgent.uid, currency), 'update');
  }

  await db.financialLedger.put(entry);
  const stock = await reconcileAndPersistAgentStock({
    agentId: targetAgent.uid,
    agentName: targetAgent.displayName,
    agencyId: targetAgent.agencyId,
    agencyName: targetAgent.agencyName,
    currency,
  });

  await recordAuditLog({
    action: 'Attribution de crédit virtuel',
    category: 'finance',
    severity: 'info',
    details: `+${formatMoney(creditAmt, currency)} de crédit virtuel attribué à ${targetAgent.displayName} (Source: ${centralFundingSource}).`,
    actorName: actor.displayName,
    actorRole: actor.role,
    actorUid: actor.uid,
    agencyId: targetAgent.agencyId ?? undefined,
    agencyName: targetAgent.agencyName,
  });

  return { entry, stock };
}

/**
 * Initie une remise ou réception de cash physique avec double validation obligatoire.
 * Aucun solde n'est modifié tant que la contrepartie n'a pas confirmé.
 */
export async function initiateCashHandover(params: {
  direction: CashHandover['direction'];
  agent: TargetAgentDescriptor;
  currency: CurrencyCode;
  amount: number;
  reason: string;
  actor: AppUser;
}): Promise<CashHandover> {
  const { direction, agent, currency, reason, actor } = params;
  const amt = roundCurrency(params.amount);
  if (amt <= 0) {
    throw new Error('Le montant de remise de cash doit être strictement positif.');
  }

  if (direction === 'direction_vers_agent') {
    if (!isGlobalFinancialSupervisor(actor) && actor.role !== 'administrateur_agence') {
      throw new Error('Seule la direction ou administration peut initier un envoi de cash vers un agent.');
    }
    if (actor.role === 'administrateur_agence' && actor.agencyId !== agent.agencyId) {
      throw new Error("Isolation par agence : succursale non autorisée.");
    }
  } else {
    if (actor.role === 'agent' && actor.uid !== agent.uid) {
      throw new Error("Un agent ne peut déclarer qu'une remise provenant de sa propre caisse.");
    }
    const stock = await getOrCreateLocalAgentStock({
      agentId: agent.uid,
      agentName: agent.displayName,
      agencyId: agent.agencyId,
      agencyName: agent.agencyName,
      currency,
    });
    if (stock.physicalCashAvailable + 0.0001 < amt) {
      throw new Error(
        `Remise impossible : cash physique disponible (${formatMoney(stock.physicalCashAvailable, currency)}) inférieur au montant saisi.`
      );
    }
  }

  const now = Date.now();
  const handover: CashHandover = {
    id: `hnd-${now}-${Math.random().toString(36).slice(2, 8)}`,
    reference: buildFinancialReference('CSH'),
    idempotencyKey: buildIdempotencyKey(`handover-${agent.uid}-${currency}`),
    direction,
    agentId: agent.uid,
    agentName: agent.displayName,
    agencyId: agent.agencyId,
    agencyName: agent.agencyName,
    currency,
    amount: amt,
    reason: reason.trim() || 'Mouvement de cash physique',
    initiatedByUid: actor.uid,
    initiatedByName: actor.displayName,
    initiatedByRole: actor.role,
    initiatedAt: now,
    status: 'en_attente_confirmation',
    confirmedByUid: null,
    confirmedByName: null,
    confirmedByRole: null,
    confirmedAt: null,
    confirmationNote: null,
    rejectionReason: null,
    linkedLedgerEntryId: null,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(doc(firestoreDb, 'cashHandovers', handover.id), sanitizeForFirestore({ ...handover, syncStatus: 'synced' }));
      handover.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('cashHandover', handover.id, 'create');
    }
  } else {
    await enqueueFinancialSync('cashHandover', handover.id, 'create');
  }

  await db.cashHandovers.put(handover);
  return handover;
}

/**
 * Confirmation bilatérale d'une remise / réception de cash physique.
 * Bloque l'auto-confirmation par l'initiateur.
 */
export async function confirmCashHandover(params: {
  handoverId: string;
  confirmationNote?: string;
  confirmer: AppUser;
}): Promise<{ handover: CashHandover; entry: FinancialLedgerEntry; stock: AgentFundStock }> {
  const { handoverId, confirmationNote, confirmer } = params;
  const handover = await db.cashHandovers.get(handoverId);
  if (!handover) {
    throw new Error('Remise de cash introuvable.');
  }
  if (handover.status !== 'en_attente_confirmation') {
    throw new Error(`Cette remise a déjà le statut '${handover.status}'. Double confirmation impossible.`);
  }
  if (handover.initiatedByUid === confirmer.uid) {
    await recordAuditLog({
      action: 'Tentative auto-confirmation remise cash bloquée',
      category: 'security',
      severity: 'security',
      details: `${confirmer.displayName} a tenté de confirmer sa propre remise ${handover.reference}.`,
      actorName: confirmer.displayName,
      actorRole: confirmer.role,
      actorUid: confirmer.uid,
    });
    throw new Error(
      'Sécurité : double validation bilatérale obligatoire. L’initiateur ne peut pas confirmer sa propre remise.'
    );
  }

  if (handover.direction === 'direction_vers_agent') {
    const allowed =
      (confirmer.role === 'agent' && confirmer.uid === handover.agentId) ||
      isGlobalFinancialSupervisor(confirmer);
    if (!allowed) {
      throw new Error("Seul l'agent destinataire ou la Direction Générale peut confirmer la réception.");
    }
  } else {
    const allowed =
      isGlobalFinancialSupervisor(confirmer) ||
      (confirmer.role === 'administrateur_agence' && confirmer.agencyId === handover.agencyId);
    if (!allowed) {
      throw new Error('Seul un superviseur financier autorisé peut confirmer cette remise de cash.');
    }
  }

  await runSensitiveBiometricCheck({
    actor: confirmer,
    actionTitle: `Confirmation cash ${formatMoney(handover.amount, handover.currency)}`,
    actionDescription: `Référence ${handover.reference} — ${handover.agentName}`,
  });

  const currentStock = await getOrCreateLocalAgentStock({
    agentId: handover.agentId,
    agentName: handover.agentName,
    agencyId: handover.agencyId,
    agencyName: handover.agencyName,
    currency: handover.currency,
  });

  const isOutgoingFromAgent =
    handover.direction === 'agent_vers_direction' ||
    handover.direction === 'agent_vers_caisse_agence';
  if (isOutgoingFromAgent && currentStock.physicalCashAvailable + 0.0001 < handover.amount) {
    throw new Error(
      `Cash physique insuffisant chez ${handover.agentName} pour valider la remise (${formatMoney(currentStock.physicalCashAvailable, handover.currency)} disponible).`
    );
  }

  const now = Date.now();
  const delta = isOutgoingFromAgent ? -handover.amount : handover.amount;

  let entry: FinancialLedgerEntry = {
    id: `led-${now}-${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: buildIdempotencyKey(`handover-confirm-${handover.id}`, handover.id),
    reference: buildFinancialReference(isOutgoingFromAgent ? 'REM' : 'REC'),
    operationCategory: isOutgoingFromAgent ? 'remise_cash' : 'reception_cash',
    agentId: handover.agentId,
    agentName: handover.agentName,
    agencyId: handover.agencyId,
    agencyName: handover.agencyName,
    currency: handover.currency,
    physicalCashDelta: delta,
    virtualCreditDelta: 0,
    capitalDelta: delta,
    feeDelta: 0,
    fxNetDelta: 0,
    adjustmentDelta: 0,
    physicalCashBefore: currentStock.physicalCashAvailable,
    physicalCashAfter: roundCurrency(currentStock.physicalCashAvailable + delta),
    virtualCreditBefore: currentStock.virtualCreditAvailable,
    virtualCreditAfter: currentStock.virtualCreditAvailable,
    linkedHandoverId: handover.id,
    counterpartyConfirmedBy: confirmer.uid,
    counterpartyConfirmedAt: now,
    authorUid: confirmer.uid,
    authorName: confirmer.displayName,
    authorRole: confirmer.role,
    reason: handover.reason,
    notes: confirmationNote || null,
    syncLifecycle: 'en_attente_synchro',
    syncStatus: 'pending',
    serverConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  let updatedHandover: CashHandover = {
    ...handover,
    status: 'confirmee',
    confirmedByUid: confirmer.uid,
    confirmedByName: confirmer.displayName,
    confirmedByRole: confirmer.role,
    confirmedAt: now,
    confirmationNote: confirmationNote?.trim() || null,
    linkedLedgerEntryId: entry.id,
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      const stockId = buildStockId(handover.agentId, handover.currency);
      const handoverRef = doc(firestoreDb, 'cashHandovers', handover.id);
      const ledgerRef = doc(firestoreDb, 'financialLedger', entry.id);
      const stockRef = doc(firestoreDb, 'agentFundStocks', stockId);

      await runTransaction(firestoreDb, async (tx) => {
        const hSnap = await tx.get(handoverRef);
        if (hSnap.exists() && hSnap.data().status !== 'en_attente_confirmation') {
          throw new Error('Remise déjà traitée côté serveur.');
        }
        const sSnap = await tx.get(stockRef);
        const serverStock = sSnap.exists()
          ? (sSnap.data() as AgentFundStock)
          : currentStock;
        if (isOutgoingFromAgent && serverStock.physicalCashConfirmed + 0.0001 < handover.amount) {
          throw new Error('Cash physique confirmé serveur insuffisant pour cette remise.');
        }

        const confirmedEntry: FinancialLedgerEntry = {
          ...entry,
          physicalCashBefore: serverStock.physicalCashConfirmed,
          physicalCashAfter: roundCurrency(serverStock.physicalCashConfirmed + delta),
          virtualCreditBefore: serverStock.virtualCreditConfirmed,
          virtualCreditAfter: serverStock.virtualCreditConfirmed,
          syncLifecycle: 'confirmee_serveur',
          syncStatus: 'synced',
          serverConfirmedAt: now,
        };
        entry = confirmedEntry;
        updatedHandover = { ...updatedHandover, syncStatus: 'synced' };

        const allEntries = [
          ...(await db.financialLedger
            .where('agentId')
            .equals(handover.agentId)
            .filter((e) => e.currency === handover.currency && e.id !== entry.id)
            .toArray()),
          confirmedEntry,
        ];
        const nextStock = recalculateAgentStockFromLedger({
          agentId: handover.agentId,
          agentName: handover.agentName,
          agencyId: handover.agencyId,
          agencyName: handover.agencyName,
          currency: handover.currency,
          entries: allEntries,
          existingStock: serverStock,
        });

        tx.set(ledgerRef, sanitizeForFirestore(confirmedEntry));
        tx.set(stockRef, sanitizeForFirestore(nextStock));
        tx.set(handoverRef, sanitizeForFirestore(updatedHandover));
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Remise déjà traitée')) {
        throw err;
      }
      await enqueueFinancialSync('financialLedger', entry.id, 'create');
      await enqueueFinancialSync('cashHandover', updatedHandover.id, 'update');
      await enqueueFinancialSync('agentFundStock', buildStockId(handover.agentId, handover.currency), 'update');
    }
  } else {
    await enqueueFinancialSync('financialLedger', entry.id, 'create');
    await enqueueFinancialSync('cashHandover', updatedHandover.id, 'update');
    await enqueueFinancialSync('agentFundStock', buildStockId(handover.agentId, handover.currency), 'update');
  }

  await db.financialLedger.put(entry);
  await db.cashHandovers.put(updatedHandover);
  const stock = await reconcileAndPersistAgentStock({
    agentId: handover.agentId,
    agentName: handover.agentName,
    agencyId: handover.agencyId,
    agencyName: handover.agencyName,
    currency: handover.currency,
  });

  await recordAuditLog({
    action: 'Confirmation bilatérale mouvement cash',
    category: 'finance',
    severity: 'info',
    details: `${handover.reference} (${handover.direction}) confirmé : ${formatMoney(handover.amount, handover.currency)} pour ${handover.agentName}.`,
    actorName: confirmer.displayName,
    actorRole: confirmer.role,
    actorUid: confirmer.uid,
    agencyId: handover.agencyId ?? undefined,
    agencyName: handover.agencyName,
  });

  return { handover: updatedHandover, entry, stock };
}

export async function rejectCashHandover(params: {
  handoverId: string;
  rejectionReason: string;
  actor: AppUser;
}): Promise<CashHandover> {
  const { handoverId, rejectionReason, actor } = params;
  const handover = await db.cashHandovers.get(handoverId);
  if (!handover) throw new Error('Remise introuvable.');
  if (handover.status !== 'en_attente_confirmation') {
    throw new Error('Seule une remise en attente peut être rejetée.');
  }
  if (handover.initiatedByUid === actor.uid) {
    throw new Error('Utilisez l’annulation pour votre propre remise.');
  }
  if (!rejectionReason.trim()) {
    throw new Error('Le motif de rejet est obligatoire.');
  }

  const updated: CashHandover = {
    ...handover,
    status: 'rejetee',
    confirmedByUid: actor.uid,
    confirmedByName: actor.displayName,
    confirmedByRole: actor.role,
    confirmedAt: Date.now(),
    rejectionReason: rejectionReason.trim(),
    syncStatus: 'pending',
    updatedAt: Date.now(),
  };

  if (isOnline()) {
    try {
      await setDoc(doc(firestoreDb, 'cashHandovers', updated.id), sanitizeForFirestore({ ...updated, syncStatus: 'synced' }));
      updated.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('cashHandover', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('cashHandover', updated.id, 'update');
  }

  await db.cashHandovers.put(updated);
  return updated;
}

/**
 * Contrepassation comptable immuable : ne modifie ni ne supprime JAMAIS l'écriture cible.
 * Crée une nouvelle écriture inverse exacte dans financialLedger.
 */
export async function createCompensatingReversal(params: {
  targetEntryId: string;
  reason: string;
  actor: AppUser;
}): Promise<{ reversalEntry: FinancialLedgerEntry; stock: AgentFundStock }> {
  const { targetEntryId, reason, actor } = params;
  if (!isGlobalFinancialSupervisor(actor)) {
    throw new Error(
      'Accès refusé : seul le Directeur Général ou Administrateur Système peut exécuter une contrepassation comptable.'
    );
  }
  if (!reason.trim()) {
    throw new Error('Un motif détaillé est obligatoire pour toute contrepassation.');
  }

  const target = await db.financialLedger.get(targetEntryId);
  if (!target) {
    throw new Error('Écriture comptable cible introuvable.');
  }

  const alreadyReversed = await db.financialLedger
    .where('agentId')
    .equals(target.agentId)
    .filter((e) => e.reversedEntryId === target.id && e.syncLifecycle !== 'rejetee')
    .first();
  if (alreadyReversed) {
    throw new Error(`Cette écriture a déjà été contrepassee (${alreadyReversed.reference}).`);
  }

  await runSensitiveBiometricCheck({
    actor,
    actionTitle: `Contrepassation ${target.reference}`,
    actionDescription: `Annulation comptable compensatoire pour ${target.agentName} (${target.currency})`,
  });

  const stockBefore = await getOrCreateLocalAgentStock({
    agentId: target.agentId,
    agentName: target.agentName,
    agencyId: target.agencyId,
    agencyName: target.agencyName,
    currency: target.currency,
  });

  const invCash = roundCurrency(-target.physicalCashDelta);
  const invCredit = roundCurrency(-target.virtualCreditDelta);

  if (stockBefore.physicalCashAvailable + invCash < -0.0001) {
    throw new Error(
      `Contrepassation bloquée : elle rendrait le cash physique négatif (${formatMoney(stockBefore.physicalCashAvailable + invCash, target.currency)}). Effectuez d'abord un apport compensatoire.`
    );
  }
  if (stockBefore.virtualCreditAvailable + invCredit < -0.0001) {
    throw new Error(
      `Contrepassation bloquée : elle rendrait le crédit virtuel négatif (${formatMoney(stockBefore.virtualCreditAvailable + invCredit, target.currency)}).`
    );
  }

  const now = Date.now();
  let reversalEntry: FinancialLedgerEntry = {
    id: `led-${now}-${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: buildIdempotencyKey(`reversal-${target.id}`, target.id),
    reference: buildFinancialReference('CTR'),
    operationCategory: 'contrepassation_correction',
    agentId: target.agentId,
    agentName: target.agentName,
    agencyId: target.agencyId,
    agencyName: target.agencyName,
    currency: target.currency,
    physicalCashDelta: invCash,
    virtualCreditDelta: invCredit,
    capitalDelta: roundCurrency(-target.capitalDelta),
    feeDelta: roundCurrency(-target.feeDelta),
    fxNetDelta: roundCurrency(-target.fxNetDelta),
    adjustmentDelta: roundCurrency(-target.adjustmentDelta),
    physicalCashBefore: stockBefore.physicalCashAvailable,
    physicalCashAfter: roundCurrency(stockBefore.physicalCashAvailable + invCash),
    virtualCreditBefore: stockBefore.virtualCreditAvailable,
    virtualCreditAfter: roundCurrency(stockBefore.virtualCreditAvailable + invCredit),
    linkedTransactionId: target.linkedTransactionId ?? null,
    reversedEntryId: target.id,
    authorUid: actor.uid,
    authorName: actor.displayName,
    authorRole: actor.role,
    reason: `Contrepassation de ${target.reference} : ${reason.trim()}`,
    syncLifecycle: 'en_attente_synchro',
    syncStatus: 'pending',
    serverConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      const stockId = buildStockId(target.agentId, target.currency);
      const ledgerRef = doc(firestoreDb, 'financialLedger', reversalEntry.id);
      const stockRef = doc(firestoreDb, 'agentFundStocks', stockId);

      await runTransaction(firestoreDb, async (tx) => {
        const sSnap = await tx.get(stockRef);
        const serverStock = sSnap.exists()
          ? (sSnap.data() as AgentFundStock)
          : stockBefore;

        const confirmedEntry: FinancialLedgerEntry = {
          ...reversalEntry,
          syncLifecycle: 'confirmee_serveur',
          syncStatus: 'synced',
          serverConfirmedAt: now,
        };
        reversalEntry = confirmedEntry;

        const allEntries = [
          ...(await db.financialLedger
            .where('agentId')
            .equals(target.agentId)
            .filter((e) => e.currency === target.currency && e.id !== reversalEntry.id)
            .toArray()),
          confirmedEntry,
        ];
        const nextStock = recalculateAgentStockFromLedger({
          agentId: target.agentId,
          agentName: target.agentName,
          agencyId: target.agencyId,
          agencyName: target.agencyName,
          currency: target.currency,
          entries: allEntries,
          existingStock: serverStock,
        });
        tx.set(ledgerRef, sanitizeForFirestore(confirmedEntry));
        tx.set(stockRef, sanitizeForFirestore(nextStock));
      });
    } catch {
      await enqueueFinancialSync('financialLedger', reversalEntry.id, 'create');
      await enqueueFinancialSync('agentFundStock', buildStockId(target.agentId, target.currency), 'update');
    }
  } else {
    await enqueueFinancialSync('financialLedger', reversalEntry.id, 'create');
    await enqueueFinancialSync('agentFundStock', buildStockId(target.agentId, target.currency), 'update');
  }

  await db.financialLedger.put(reversalEntry);

  if (target.linkedTransactionId) {
    const tx = await db.financialTransactions.get(target.linkedTransactionId);
    if (tx) {
      await db.financialTransactions.put({
        ...tx,
        status: 'contrepassee',
        reversedByLedgerId: reversalEntry.id,
        updatedAt: now,
      });
    }
  }

  const stock = await reconcileAndPersistAgentStock({
    agentId: target.agentId,
    agentName: target.agentName,
    agencyId: target.agencyId,
    agencyName: target.agencyName,
    currency: target.currency,
  });

  await recordAuditLog({
    action: 'Contrepassation comptable enregistrée',
    category: 'finance',
    severity: 'warning',
    details: `${reversalEntry.reference} annule comptablement ${target.reference} pour ${target.agentName} (${reason}).`,
    actorName: actor.displayName,
    actorRole: actor.role,
    actorUid: actor.uid,
    agencyId: target.agencyId ?? undefined,
    agencyName: target.agencyName,
  });

  return { reversalEntry, stock };
}

/**
 * Délégation explicite, temporaire et plafonnée accordée par le DG à un Administrateur d'Agence.
 */
export async function grantCreditDelegation(params: {
  delegateUid: string;
  delegateName: string;
  delegateRole: string;
  agencyId: string;
  agencyName: string;
  maxAmountUsd: number;
  maxAmountCdf: number;
  durationHours: number;
  reason: string;
  actor: AppUser;
}): Promise<CreditDelegationScope> {
  if (!isGlobalFinancialSupervisor(params.actor)) {
    throw new Error('Seul le Directeur Général ou Administrateur Système peut accorder une délégation financière.');
  }
  if (params.delegateUid === params.actor.uid) {
    throw new Error('Auto-délégation interdite.');
  }
  if (params.delegateRole !== 'administrateur_agence') {
    throw new Error("La délégation de réapprovisionnement n'est possible que pour un Administrateur d'Agence.");
  }

  const now = Date.now();
  const delegation: CreditDelegationScope = {
    id: `${params.delegateUid}_${params.agencyId}`,
    delegateUid: params.delegateUid,
    delegateName: params.delegateName,
    delegateRole: params.delegateRole,
    agencyId: params.agencyId,
    agencyName: params.agencyName,
    grantedByUid: params.actor.uid,
    grantedByName: params.actor.displayName,
    status: 'active',
    canApproveReplenishment: true,
    maxAmountUsd: Math.max(0, roundCurrency(params.maxAmountUsd)),
    maxAmountCdf: Math.max(0, roundCurrency(params.maxAmountCdf)),
    expiresAt: now + Math.max(1, params.durationHours) * 3600 * 1000,
    revokedByUid: null,
    revokedAt: null,
    reason: params.reason.trim() || 'Délégation opérationnelle temporaire',
    createdAt: now,
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(doc(firestoreDb, 'financialDelegations', delegation.id), sanitizeForFirestore(delegation));
    } catch {
      await enqueueFinancialSync('financialDelegation', delegation.id, 'create');
    }
  } else {
    await enqueueFinancialSync('financialDelegation', delegation.id, 'create');
  }

  await db.financialDelegations.put(delegation);
  await recordAuditLog({
    action: 'Délégation crédit virtuel accordée',
    category: 'finance',
    severity: 'warning',
    details: `Délégation accordée à ${delegation.delegateName} (${delegation.agencyName}) : max ${formatMoney(delegation.maxAmountUsd, 'USD')} / ${formatMoney(delegation.maxAmountCdf, 'CDF')}.`,
    actorName: params.actor.displayName,
    actorRole: params.actor.role,
    actorUid: params.actor.uid,
    agencyId: delegation.agencyId,
    agencyName: delegation.agencyName,
  });

  return delegation;
}

export async function revokeCreditDelegation(
  delegationId: string,
  actor: AppUser
): Promise<CreditDelegationScope> {
  if (!isGlobalFinancialSupervisor(actor)) {
    throw new Error('Seul le Directeur Général ou Administrateur Système peut révoquer une délégation.');
  }
  const existing = await db.financialDelegations.get(delegationId);
  if (!existing) throw new Error('Délégation introuvable.');
  const now = Date.now();
  const updated: CreditDelegationScope = {
    ...existing,
    status: 'revoked',
    revokedByUid: actor.uid,
    revokedAt: now,
    updatedAt: now,
  };
  if (isOnline()) {
    try {
      await setDoc(doc(firestoreDb, 'financialDelegations', updated.id), sanitizeForFirestore(updated));
    } catch {
      await enqueueFinancialSync('financialDelegation', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('financialDelegation', updated.id, 'update');
  }
  await db.financialDelegations.put(updated);
  return updated;
}
