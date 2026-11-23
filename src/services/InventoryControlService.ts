import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore as firestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type { AppUser } from '../types/auth';
import type {
  AgentFundStock,
  CurrencyCode,
  FinancialLedgerEntry,
  PhysicalInventory,
  VirtualChannelCount,
} from '../types/financialSupervision';
import { raiseFinancialAnomaly } from './AnomalyDetectionService';
import { recordAuditLog } from './AuditService';
import { verifyBiometricIdentity } from './BiometricAuthService';
import {
  buildFinancialReference,
  buildIdempotencyKey,
  buildStockId,
  enqueueFinancialSync,
  getOrCreateLocalAgentStock,
  isGlobalFinancialSupervisor,
  recalculateAgentStockFromLedger,
  reconcileAndPersistAgentStock,
  roundCurrency,
  sanitizeForFirestore,
} from './FinancialLedgerService';

function isOnline(): boolean {
  return (
    isFirebaseConfigured &&
    (typeof navigator === 'undefined' ? true : navigator.onLine)
  );
}

/**
 * Demande un inventaire physique et virtuel (inopiné, clôture ou périodique).
 * Fige les soldes théoriques attendus à l'instant T sans modifier les écritures.
 */
export async function requestPhysicalInventory(params: {
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  controlType: PhysicalInventory['controlType'];
  supervisor: AppUser;
}): Promise<PhysicalInventory> {
  const { agentId, agentName, agencyId, agencyName, controlType, supervisor } = params;

  if (
    !isGlobalFinancialSupervisor(supervisor) &&
    !(
      supervisor.role === 'administrateur_agence' &&
      supervisor.agencyId === agencyId &&
      supervisor.uid !== agentId
    )
  ) {
    throw new Error(
      "Accès refusé : seul un superviseur autorisé (hors auto-contrôle) peut déclencher un inventaire."
    );
  }

  const usdStock = await getOrCreateLocalAgentStock({
    agentId,
    agentName,
    agencyId,
    agencyName,
    currency: 'USD',
  });
  const cdfStock = await getOrCreateLocalAgentStock({
    agentId,
    agentName,
    agencyId,
    agencyName,
    currency: 'CDF',
  });

  const now = Date.now();
  const inv: PhysicalInventory = {
    id: `inv-${now}-${Math.random().toString(36).slice(2, 8)}`,
    reference: buildFinancialReference('INV'),
    controlType,
    agentId,
    agentName,
    agencyId,
    agencyName,
    requestedByUid: supervisor.uid,
    requestedByName: supervisor.displayName,
    requestedAt: now,
    status: 'en_attente_agent',
    theoreticalPhysicalCashUsd: usdStock.physicalCashAvailable,
    countedPhysicalCashUsd: 0,
    discrepancyCashUsd: 0,
    theoreticalVirtualCreditUsd: usdStock.virtualCreditAvailable,
    countedVirtualCreditUsd: 0,
    discrepancyVirtualUsd: 0,
    theoreticalPhysicalCashCdf: cdfStock.physicalCashAvailable,
    countedPhysicalCashCdf: 0,
    discrepancyCashCdf: 0,
    theoreticalVirtualCreditCdf: cdfStock.virtualCreditAvailable,
    countedVirtualCreditCdf: 0,
    discrepancyVirtualCdf: 0,
    virtualChannelsBreakdown: [],
    undeclaredOperationsCount: 0,
    undeclaredOperationsNotes: null,
    agentNotes: null,
    submittedAt: null,
    validatedByUid: null,
    validatedByName: null,
    validatedAt: null,
    validationNotes: null,
    immutableLocked: false,
    linkedAnomalyIds: [],
    linkedAdjustmentLedgerIds: [],
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'physicalInventories', inv.id),
        sanitizeForFirestore({ ...inv, syncStatus: 'synced' })
      );
      inv.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('physicalInventory', inv.id, 'create');
    }
  } else {
    await enqueueFinancialSync('physicalInventory', inv.id, 'create');
  }

  await db.physicalInventories.put(inv);
  await recordAuditLog({
    action: 'Contrôle d’inventaire physique & virtuel déclenché',
    category: 'finance',
    severity: controlType === 'inopine' ? 'warning' : 'info',
    details: `${inv.reference} (${controlType}) demandé pour ${agentName}.`,
    actorName: supervisor.displayName,
    actorRole: supervisor.role,
    actorUid: supervisor.uid,
    agencyId: agencyId ?? undefined,
    agencyName,
  });

  return inv;
}

/**
 * Soumission par l'agent de ses montants réellement comptés (cash USD/CDF + canaux virtuels).
 */
export async function submitAgentInventoryCount(params: {
  inventoryId: string;
  countedPhysicalCashUsd: number;
  countedPhysicalCashCdf: number;
  virtualChannelsBreakdown: VirtualChannelCount[];
  undeclaredOperationsCount?: number;
  undeclaredOperationsNotes?: string;
  agentNotes?: string;
  agent: AppUser;
}): Promise<PhysicalInventory> {
  const inv = await db.physicalInventories.get(params.inventoryId);
  if (!inv) throw new Error('Contrôle d’inventaire introuvable.');
  if (inv.immutableLocked) {
    throw new Error('Inventaire verrouillé de façon immuable après validation.');
  }
  if (inv.agentId !== params.agent.uid && !isGlobalFinancialSupervisor(params.agent)) {
    throw new Error('Seul l’agent concerné peut soumettre son comptage.');
  }

  const countedCashUsd = Math.max(0, roundCurrency(params.countedPhysicalCashUsd));
  const countedCashCdf = Math.max(0, roundCurrency(params.countedPhysicalCashCdf));

  const countedVirtualUsd = roundCurrency(
    params.virtualChannelsBreakdown
      .filter((c) => c.currency === 'USD')
      .reduce((acc, c) => acc + Math.max(0, c.countedAmount), 0)
  );
  const countedVirtualCdf = roundCurrency(
    params.virtualChannelsBreakdown
      .filter((c) => c.currency === 'CDF')
      .reduce((acc, c) => acc + Math.max(0, c.countedAmount), 0)
  );

  const discrepancyCashUsd = roundCurrency(countedCashUsd - inv.theoreticalPhysicalCashUsd);
  const discrepancyVirtualUsd = roundCurrency(
    countedVirtualUsd - inv.theoreticalVirtualCreditUsd
  );
  const discrepancyCashCdf = roundCurrency(countedCashCdf - inv.theoreticalPhysicalCashCdf);
  const discrepancyVirtualCdf = roundCurrency(
    countedVirtualCdf - inv.theoreticalVirtualCreditCdf
  );

  const now = Date.now();
  const updated: PhysicalInventory = {
    ...inv,
    status: 'soumis_agent',
    countedPhysicalCashUsd: countedCashUsd,
    discrepancyCashUsd,
    countedVirtualCreditUsd: countedVirtualUsd,
    discrepancyVirtualUsd,
    countedPhysicalCashCdf: countedCashCdf,
    discrepancyCashCdf,
    countedVirtualCreditCdf: countedVirtualCdf,
    discrepancyVirtualCdf,
    virtualChannelsBreakdown: params.virtualChannelsBreakdown,
    undeclaredOperationsCount: Math.max(0, Math.round(params.undeclaredOperationsCount ?? 0)),
    undeclaredOperationsNotes: params.undeclaredOperationsNotes?.trim() || null,
    agentNotes: params.agentNotes?.trim() || null,
    submittedAt: now,
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'physicalInventories', updated.id),
        sanitizeForFirestore({ ...updated, syncStatus: 'synced' })
      );
      updated.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('physicalInventory', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('physicalInventory', updated.id, 'update');
  }

  await db.physicalInventories.put(updated);
  return updated;
}

/**
 * Validation finale et verrouillage immuable de l'inventaire par le superviseur.
 * Crée automatiquement les anomalies d'écart et, si demandé par le DG, les écritures d'ajustement comptable.
 */
export async function validateAndLockInventory(params: {
  inventoryId: string;
  validationNotes: string;
  applyCompensatingLedgerAdjustment?: boolean;
  supervisor: AppUser;
}): Promise<PhysicalInventory> {
  const { inventoryId, validationNotes, applyCompensatingLedgerAdjustment = false, supervisor } =
    params;

  const inv = await db.physicalInventories.get(inventoryId);
  if (!inv) throw new Error('Inventaire introuvable.');
  if (inv.immutableLocked) {
    throw new Error('Cet inventaire est déjà validé et verrouillé de manière immuable.');
  }
  if (inv.agentId === supervisor.uid) {
    throw new Error('Auto-validation interdite sur votre propre inventaire.');
  }
  if (
    !isGlobalFinancialSupervisor(supervisor) &&
    !(
      supervisor.role === 'administrateur_agence' &&
      supervisor.agencyId === inv.agencyId
    )
  ) {
    throw new Error('Rôle ou succursale non autorisée pour valider cet inventaire.');
  }
  if (applyCompensatingLedgerAdjustment && !isGlobalFinancialSupervisor(supervisor)) {
    throw new Error(
      "Seul le Directeur Général ou Administrateur Système peut appliquer un ajustement comptable d'inventaire."
    );
  }

  if (typeof window !== 'undefined') {
    await verifyBiometricIdentity({
      user: supervisor,
      actionTitle: `Validation inventaire ${inv.reference}`,
      actionDescription: `Verrouillage immuable du contrôle pour ${inv.agentName}`,
    });
  }

  const totalDiscrepancyUsd = roundCurrency(
    inv.discrepancyCashUsd + inv.discrepancyVirtualUsd
  );
  const totalDiscrepancyCdf = roundCurrency(
    inv.discrepancyCashCdf + inv.discrepancyVirtualCdf
  );

  const hasNeg =
    inv.discrepancyCashUsd < -0.01 ||
    inv.discrepancyVirtualUsd < -0.01 ||
    inv.discrepancyCashCdf < -1 ||
    inv.discrepancyVirtualCdf < -1;
  const hasPos =
    inv.discrepancyCashUsd > 0.01 ||
    inv.discrepancyVirtualUsd > 0.01 ||
    inv.discrepancyCashCdf > 1 ||
    inv.discrepancyVirtualCdf > 1;

  const finalStatus: PhysicalInventory['status'] = hasNeg
    ? 'ecart_negatif'
    : hasPos
      ? 'ecart_positif'
      : 'valide_conforme';

  const linkedAnomalyIds = [...inv.linkedAnomalyIds];
  const linkedAdjustmentLedgerIds = [...inv.linkedAdjustmentLedgerIds];

  if (hasNeg || hasPos) {
    const currencyForAnomaly: CurrencyCode =
      Math.abs(totalDiscrepancyUsd) > 0.01 ? 'USD' : 'CDF';
    const gap =
      currencyForAnomaly === 'USD' ? totalDiscrepancyUsd : totalDiscrepancyCdf;
    const ano = await raiseFinancialAnomaly({
      dedupKey: `ecart_inventaire:${inv.id}`,
      anomalyType: 'ecart_inventaire',
      severity: hasNeg ? 'critique' : 'elevee',
      agentId: inv.agentId,
      agentName: inv.agentName,
      agencyId: inv.agencyId,
      agencyName: inv.agencyName,
      currency: currencyForAnomaly,
      expectedAmount:
        currencyForAnomaly === 'USD'
          ? roundCurrency(inv.theoreticalPhysicalCashUsd + inv.theoreticalVirtualCreditUsd)
          : roundCurrency(inv.theoreticalPhysicalCashCdf + inv.theoreticalVirtualCreditCdf),
      observedAmount:
        currencyForAnomaly === 'USD'
          ? roundCurrency(inv.countedPhysicalCashUsd + inv.countedVirtualCreditUsd)
          : roundCurrency(inv.countedPhysicalCashCdf + inv.countedVirtualCreditCdf),
      discrepancyAmount: gap,
      linkedInventoryId: inv.id,
      title: `Écart d'inventaire ${inv.reference} (${finalStatus})`,
      description: `USD Cash=${inv.discrepancyCashUsd}, USD Virtuel=${inv.discrepancyVirtualUsd} | CDF Cash=${inv.discrepancyCashCdf}, CDF Virtuel=${inv.discrepancyVirtualCdf}.`,
    });
    linkedAnomalyIds.push(ano.id);
  }

  // Optionnel : écritures d'ajustement comptable documentées (ecart_inventaire)
  if (applyCompensatingLedgerAdjustment) {
    const adjustments: Array<{
      currency: CurrencyCode;
      cashDelta: number;
      virtualDelta: number;
    }> = [
      {
        currency: 'USD',
        cashDelta: inv.discrepancyCashUsd,
        virtualDelta: inv.discrepancyVirtualUsd,
      },
      {
        currency: 'CDF',
        cashDelta: inv.discrepancyCashCdf,
        virtualDelta: inv.discrepancyVirtualCdf,
      },
    ];

    for (const adj of adjustments) {
      if (Math.abs(adj.cashDelta) < 0.01 && Math.abs(adj.virtualDelta) < 0.01) {
        continue;
      }
      const stock = await getOrCreateLocalAgentStock({
        agentId: inv.agentId,
        agentName: inv.agentName,
        agencyId: inv.agencyId,
        agencyName: inv.agencyName,
        currency: adj.currency,
      });

      const now = Date.now();
      const adjDelta = roundCurrency(adj.cashDelta + adj.virtualDelta);
      let entry: FinancialLedgerEntry = {
        id: `led-${now}-${Math.random().toString(36).slice(2, 8)}`,
        idempotencyKey: buildIdempotencyKey(`inv-adj-${inv.id}-${adj.currency}`, `${inv.id}:${adj.currency}`),
        reference: buildFinancialReference('AJI'),
        operationCategory: 'ecart_inventaire',
        agentId: inv.agentId,
        agentName: inv.agentName,
        agencyId: inv.agencyId,
        agencyName: inv.agencyName,
        currency: adj.currency,
        physicalCashDelta: adj.cashDelta,
        virtualCreditDelta: adj.virtualDelta,
        capitalDelta: 0,
        feeDelta: 0,
        fxNetDelta: 0,
        adjustmentDelta: adjDelta,
        physicalCashBefore: stock.physicalCashAvailable,
        physicalCashAfter: roundCurrency(stock.physicalCashAvailable + adj.cashDelta),
        virtualCreditBefore: stock.virtualCreditAvailable,
        virtualCreditAfter: roundCurrency(stock.virtualCreditAvailable + adj.virtualDelta),
        linkedInventoryId: inv.id,
        authorUid: supervisor.uid,
        authorName: supervisor.displayName,
        authorRole: supervisor.role,
        reason: `Ajustement validé suite inventaire ${inv.reference} : ${validationNotes}`,
        syncLifecycle: 'en_attente_synchro',
        syncStatus: 'pending',
        serverConfirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const existingEntries = await db.financialLedger
        .where('agentId')
        .equals(inv.agentId)
        .filter((e) => e.currency === adj.currency)
        .toArray();

      if (isOnline()) {
        try {
          const ledgerRef = doc(firestoreDb, 'financialLedger', entry.id);
          const stockRef = doc(firestoreDb, 'agentFundStocks', buildStockId(inv.agentId, adj.currency));
          await runTransaction(firestoreDb, async (tx) => {
            const sSnap = await tx.get(stockRef);
            const serverStock = sSnap.exists()
              ? (sSnap.data() as AgentFundStock)
              : stock;
            entry = {
              ...entry,
              syncLifecycle: 'confirmee_serveur',
              syncStatus: 'synced',
              serverConfirmedAt: now,
            };
            const nextStock = recalculateAgentStockFromLedger({
              agentId: inv.agentId,
              agentName: inv.agentName,
              agencyId: inv.agencyId,
              agencyName: inv.agencyName,
              currency: adj.currency,
              entries: [...existingEntries, entry],
              existingStock: serverStock,
            });
            tx.set(ledgerRef, sanitizeForFirestore(entry));
            tx.set(stockRef, sanitizeForFirestore(nextStock));
          });
        } catch {
          await enqueueFinancialSync('financialLedger', entry.id, 'create');
          await enqueueFinancialSync('agentFundStock', buildStockId(inv.agentId, adj.currency), 'update');
        }
      } else {
        await enqueueFinancialSync('financialLedger', entry.id, 'create');
        await enqueueFinancialSync('agentFundStock', buildStockId(inv.agentId, adj.currency), 'update');
      }

      await db.financialLedger.put(entry);
      await reconcileAndPersistAgentStock({
        agentId: inv.agentId,
        agentName: inv.agentName,
        agencyId: inv.agencyId,
        agencyName: inv.agencyName,
        currency: adj.currency,
      });
      linkedAdjustmentLedgerIds.push(entry.id);
    }
  }

  const now = Date.now();
  const lockedInv: PhysicalInventory = {
    ...inv,
    status: finalStatus,
    validatedByUid: supervisor.uid,
    validatedByName: supervisor.displayName,
    validatedAt: now,
    validationNotes: validationNotes.trim() || 'Inventaire contrôlé et verrouillé',
    immutableLocked: true,
    linkedAnomalyIds,
    linkedAdjustmentLedgerIds,
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'physicalInventories', lockedInv.id),
        sanitizeForFirestore({ ...lockedInv, syncStatus: 'synced' })
      );
      lockedInv.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('physicalInventory', lockedInv.id, 'update');
    }
  } else {
    await enqueueFinancialSync('physicalInventory', lockedInv.id, 'update');
  }

  await db.physicalInventories.put(lockedInv);
  await recordAuditLog({
    action: 'Inventaire physique validé et verrouillé',
    category: 'finance',
    severity: hasNeg ? 'critical' : 'info',
    details: `${lockedInv.reference} (${lockedInv.status}) verrouillé pour ${lockedInv.agentName}.`,
    actorName: supervisor.displayName,
    actorRole: supervisor.role,
    actorUid: supervisor.uid,
    agencyId: lockedInv.agencyId ?? undefined,
    agencyName: lockedInv.agencyName,
  });

  return lockedInv;
}
