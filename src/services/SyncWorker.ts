import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/db';
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase';
import type {
  SyncQueueItem,
  Billetage,
  LocalReport,
  LocalChatMessage,
  LocalBroadcast,
  LocalDebt,
  LocalInterAgencyTransfer,
  LocalSalaryRecord,
  LocalSalaryClaim,
  LocalSalaryAdvance,
} from '../lib/db';
import type { Operation, OperationAssignment } from '../types/operation';
import type { ClientOrder } from '../types/clientOrder';
import type { AppUser } from '../types/auth';
import type {
  AgentFundStock,
  CashHandover,
  CreditDelegationScope,
  FinancialAnomaly,
  FinancialLedgerEntry,
  FinancialTransaction,
  PhysicalInventory,
  ReconciliationRecord,
  ReplenishmentRequest,
} from '../types/financialSupervision';
import {
  buildStockId,
  recalculateAgentStockFromLedger,
  reconcileAndPersistAgentStock,
  roundCurrency,
  sanitizeForFirestore,
} from './FinancialLedgerService';
import { raiseFinancialAnomaly } from './AnomalyDetectionService';

const SYNC_INTERVAL_MS = 10000;
const MAX_ATTEMPTS = 5;

let isSyncing = false;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

async function isPendingDelete(entity: string, entityId: string): Promise<boolean> {
  try {
    const count = await db.syncQueue
      .where('status')
      .anyOf('pending', 'processing')
      .filter((item) => item.entity === entity && item.entityId === entityId && item.operation === 'delete')
      .count();
    return count > 0;
  } catch {
    return false;
  }
}

function getSessionUserContext(): { uid: string | null; role: string | null; agencyId: string | null } {
  const fbUid = auth?.currentUser?.uid ?? null;
  try {
    const raw = localStorage.getItem('ets_amani_session_user');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppUser>;
      return {
        uid: fbUid || parsed.uid || null,
        role: parsed.role || null,
        agencyId: parsed.agencyId || null,
      };
    }
  } catch {
    // ignore
  }
  return { uid: fbUid, role: null, agencyId: null };
}

async function pullRemoteDataToLocal(): Promise<void> {
  if (!isFirebaseConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }

  const sessionCtx = getSessionUserContext();
  if (!sessionCtx.uid) {
    return;
  }
  const isExternal = sessionCtx.role === 'client' || sessionCtx.role === 'abonne';
  const isGlobalSupervisor =
    sessionCtx.role === 'directeur_general' || sessionCtx.role === 'administrateur_systeme';

  // 1. Hydratation descendante des opérations (filtrée par rôle pour éviter PERMISSION_DENIED)
  try {
    const opsSnapshots = isExternal
      ? await Promise.all([
          getDocs(
            query(
              collection(firestore, 'operations'),
              where('clientUid', '==', sessionCtx.uid),
              limit(100)
            )
          ).catch(() => null),
          getDocs(
            query(
              collection(firestore, 'operations'),
              where('createdBy', '==', sessionCtx.uid),
              limit(100)
            )
          ).catch(() => null),
        ])
      : !isGlobalSupervisor && sessionCtx.agencyId
        ? [
            await getDocs(
              query(
                collection(firestore, 'operations'),
                where('agencyId', '==', sessionCtx.agencyId),
                limit(200)
              )
            ),
          ]
        : [await getDocs(query(collection(firestore, 'operations'), limit(200)))];

    for (const opsSnap of opsSnapshots) {
      if (!opsSnap) continue;
      for (const docSnap of opsSnap.docs) {
        const remoteData = docSnap.data() as Operation;
        const id = remoteData.id || docSnap.id;
        if (await isPendingDelete('operation', id)) continue;

        const localExisting = await db.operations.get(id);
        const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
        const localUpdatedAt = Number(localExisting?.updatedAt || 0);

        if (
          !localExisting ||
          localExisting.syncStatus !== 'pending' ||
          remoteUpdatedAt > localUpdatedAt
        ) {
          await db.operations.put({
            ...remoteData,
            id,
            syncStatus: 'synced',
          });
        }
      }
    }
  } catch {
    // Silencieux si hors-ligne ou règles restreintes pour le rôle courant
  }

  // 2. Hydratation descendante des affectations d'opérations
  try {
    const assignSnap = await getDocs(query(collection(firestore, 'operationAssignments'), limit(200)));
    for (const docSnap of assignSnap.docs) {
      const remoteData = docSnap.data() as OperationAssignment;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('operationAssignment', id)) continue;

      const localExisting = await db.operationAssignments.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.operationAssignments.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 3. Hydratation descendante des billetages
  try {
    const billSnap = isExternal
      ? await getDocs(
          query(
            collection(firestore, 'billetages'),
            where('userId', '==', sessionCtx.uid),
            limit(100)
          )
        )
      : !isGlobalSupervisor && sessionCtx.agencyId
        ? await getDocs(
            query(
              collection(firestore, 'billetages'),
              where('agencyId', '==', sessionCtx.agencyId),
              limit(150)
            )
          )
        : await getDocs(query(collection(firestore, 'billetages'), limit(150)));
    for (const docSnap of billSnap.docs) {
      const raw = docSnap.data();
      const id = (raw.id as string) || docSnap.id;
      if (await isPendingDelete('billetage', id)) continue;

      const localExisting = await db.billetages.get(id);
      const remoteUpdatedAt = Number(raw.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        const billetageRow: Billetage = {
          id,
          type: raw.type === 'personal' ? 'personal' : 'business',
          userId: String(raw.userId || ''),
          agencyId: raw.agencyId ? String(raw.agencyId) : null,
          currency: String(raw.currency || 'USD'),
          calculatedTotal: Number(raw.calculatedTotal || 0),
          declaredAmount: raw.declaredAmount !== undefined ? raw.declaredAmount : null,
          discrepancy: raw.discrepancy !== undefined ? raw.discrepancy : null,
          status: raw.status || 'completed',
          syncStatus: 'synced',
          transactionId: raw.transactionId ?? null,
          reference: raw.reference ?? null,
          createdAt: Number(raw.createdAt || Date.now()),
          updatedAt: Number(raw.updatedAt || Date.now()),
        };
        await db.billetages.put(billetageRow);
      }
    }
  } catch {
    // Silencieux
  }

  // 4. Hydratation descendante des rapports (reports)
  try {
    const repSnap = await getDocs(query(collection(firestore, 'reports'), limit(150)));
    for (const docSnap of repSnap.docs) {
      const remoteData = docSnap.data() as LocalReport;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('report', id)) continue;

      const localExisting = await db.reports.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.reports.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 5. Hydratation descendante des messages du chat (messages)
  try {
    const msgSnap = await getDocs(query(collection(firestore, 'messages'), limit(300)));
    for (const docSnap of msgSnap.docs) {
      const remoteData = docSnap.data() as LocalChatMessage;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('chatMessage', id)) continue;

      const localExisting = await db.chatMessages.get(id);
      if (!localExisting) {
        await db.chatMessages.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      } else if (localExisting.syncStatus !== 'pending') {
        await db.chatMessages.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      } else {
        // En attente : fusionner lectures et réactions distantes
        const mergedReactions = { ...(remoteData.reactions || {}), ...(localExisting.reactions || {}) };
        const mergedReadBy = Array.from(new Set([...(remoteData.readBy || []), ...(localExisting.readBy || [])]));
        await db.chatMessages.update(id, {
          reactions: mergedReactions,
          readBy: mergedReadBy,
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 6. Hydratation descendante des diffusions / annonces (notifications)
  try {
    const notifSnap = await getDocs(query(collection(firestore, 'notifications'), limit(100)));
    for (const docSnap of notifSnap.docs) {
      const remoteData = docSnap.data() as LocalBroadcast;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('broadcast', id)) continue;

      const localExisting = await db.broadcasts.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.broadcasts.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 7. Hydratation descendante des dettes (debts)
  try {
    const debtSnap = await getDocs(query(collection(firestore, 'debts'), limit(150)));
    for (const docSnap of debtSnap.docs) {
      const remoteData = docSnap.data() as LocalDebt;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('debt', id)) continue;

      const localExisting = await db.debts.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.debts.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 8. Hydratation descendante des transferts inter-agences (interAgencyTransfers)
  try {
    const trfSnap = await getDocs(query(collection(firestore, 'interAgencyTransfers'), limit(150)));
    for (const docSnap of trfSnap.docs) {
      const remoteData = docSnap.data() as LocalInterAgencyTransfer;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('interAgencyTransfer', id)) continue;

      const localExisting = await db.interAgencyTransfers.get(id);
      const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
      const localUpdatedAt = Number(localExisting?.updatedAt || 0);

      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        remoteUpdatedAt > localUpdatedAt
      ) {
        await db.interAgencyTransfers.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 9. Hydratation descendante des salaires (salaries) avec préservation des décisions DG plus récentes
  try {
    const salSnap = await getDocs(query(collection(firestore, 'salaries'), limit(250)));
    for (const docSnap of salSnap.docs) {
      const remoteData = docSnap.data() as LocalSalaryRecord;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('salary', id)) continue;

      const localExisting = await db.salaries.get(id);
      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        (remoteData.updatedAt && remoteData.updatedAt > localExisting.updatedAt)
      ) {
        await db.salaries.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 10. Hydratation descendante des réclamations salariales (salaryClaims)
  try {
    const clmSnap = await getDocs(query(collection(firestore, 'salaryClaims'), limit(150)));
    for (const docSnap of clmSnap.docs) {
      const remoteData = docSnap.data() as LocalSalaryClaim;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('salaryClaim', id)) continue;

      const localExisting = await db.salaryClaims.get(id);
      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        (remoteData.updatedAt && remoteData.updatedAt > localExisting.updatedAt)
      ) {
        await db.salaryClaims.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 11. Hydratation descendante des demandes d'avance sur salaire (salaryAdvances)
  try {
    const advSnap = await getDocs(query(collection(firestore, 'salaryAdvances'), limit(150)));
    for (const docSnap of advSnap.docs) {
      const remoteData = docSnap.data() as LocalSalaryAdvance;
      const id = remoteData.id || docSnap.id;
      if (await isPendingDelete('salaryAdvance', id)) continue;

      const localExisting = await db.salaryAdvances.get(id);
      if (
        !localExisting ||
        localExisting.syncStatus !== 'pending' ||
        (remoteData.updatedAt && remoteData.updatedAt > localExisting.updatedAt)
      ) {
        await db.salaryAdvances.put({
          ...remoteData,
          id,
          syncStatus: 'synced',
        });
      }
    }
  } catch {
    // Silencieux
  }

  // 12. Hydratation descendante des commandes & réclamations clients/abonnés (clientOrders)
  try {
    const orderSnapshots = isExternal
      ? [
          await getDocs(
            query(
              collection(firestore, 'clientOrders'),
              where('authorUid', '==', sessionCtx.uid),
              limit(150)
            )
          ),
        ]
      : sessionCtx.role === 'agent'
        ? await Promise.all([
            getDocs(
              query(
                collection(firestore, 'clientOrders'),
                where('assignedAgentId', '==', sessionCtx.uid),
                limit(150)
              )
            ).catch(() => null),
            ...(sessionCtx.agencyId
              ? [
                  getDocs(
                    query(
                      collection(firestore, 'clientOrders'),
                      where('agencyId', '==', sessionCtx.agencyId),
                      where('assignedAgentId', '==', null),
                      limit(150)
                    )
                  ).catch(() => null),
                ]
              : []),
          ])
        : sessionCtx.role === 'administrateur_agence' && sessionCtx.agencyId
          ? [
              await getDocs(
                query(
                  collection(firestore, 'clientOrders'),
                  where('agencyId', '==', sessionCtx.agencyId),
                  limit(200)
                )
              ),
            ]
          : isGlobalSupervisor
            ? [await getDocs(query(collection(firestore, 'clientOrders'), limit(250)))]
            : [];

    for (const orderSnap of orderSnapshots) {
      if (!orderSnap) continue;
      for (const docSnap of orderSnap.docs) {
        const remoteData = docSnap.data() as ClientOrder;
        const id = remoteData.id || docSnap.id;
        const localExisting = await db.clientOrders.get(id);
        const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
        const localUpdatedAt = Number(localExisting?.updatedAt || 0);

        if (
          !localExisting ||
          localExisting.syncStatus !== 'pending' ||
          remoteUpdatedAt > localUpdatedAt
        ) {
          await db.clientOrders.put({
            ...remoteData,
            id,
            comments: Array.isArray(remoteData.comments) ? remoteData.comments : [],
            history: Array.isArray(remoteData.history) ? remoteData.history : [],
            syncStatus: 'synced',
          });
        }
      }
    }
  } catch {
    // Silencieux si hors-ligne ou règles restreintes
  }

  // 10. Hydratation descendante Supervision Financière & Crédits Virtuels (strictement hors Client/Abonné)
  if (!isExternal && sessionCtx.role) {
    const pullScopedFinancialCollection = async <T extends { id?: string; updatedAt?: number }>(
      colName: string,
      table: {
        get: (id: string) => Promise<(T & { syncStatus?: string }) | undefined>;
        put: (val: T) => Promise<unknown>;
      },
      extraFilterField?: 'agentId' | 'delegateUid'
    ): Promise<T[]> => {
      const pulled: T[] = [];
      try {
        let qRef;
        if (isGlobalSupervisor) {
          qRef = query(collection(firestore, colName), limit(250));
        } else if (sessionCtx.role === 'administrateur_agence' && sessionCtx.agencyId) {
          qRef = query(
            collection(firestore, colName),
            where('agencyId', '==', sessionCtx.agencyId),
            limit(200)
          );
        } else if (sessionCtx.role === 'agent') {
          if (extraFilterField === 'delegateUid') return pulled;
          qRef = query(
            collection(firestore, colName),
            where('agentId', '==', sessionCtx.uid),
            limit(200)
          );
        } else {
          return pulled;
        }

        const snap = await getDocs(qRef);
        for (const d of snap.docs) {
          const remote = d.data() as T & { syncStatus?: string; syncLifecycle?: string };
          const id = remote.id || d.id;
          const local = await table.get(id);
          const remoteUpdated = Number(remote.updatedAt || 0);
          const localUpdated = Number(local?.updatedAt || 0);
          if (
            !local ||
            (local.syncStatus !== 'pending' && local.syncStatus !== 'conflict') ||
            remoteUpdated > localUpdated
          ) {
            const merged = {
              ...remote,
              id,
              syncStatus: 'synced',
            } as T;
            await table.put(merged);
            pulled.push(merged);
          }
        }
      } catch {
        // Silencieux si offline ou permissions restreintes
      }
      return pulled;
    };

    const pulledLedger = await pullScopedFinancialCollection<FinancialLedgerEntry>(
      'financialLedger',
      db.financialLedger
    );
    await pullScopedFinancialCollection<AgentFundStock>('agentFundStocks', db.agentFundStocks);
    await pullScopedFinancialCollection<FinancialTransaction>(
      'financialTransactions',
      db.financialTransactions
    );
    await pullScopedFinancialCollection<ReplenishmentRequest>(
      'replenishmentRequests',
      db.replenishmentRequests
    );
    await pullScopedFinancialCollection<CashHandover>('cashHandovers', db.cashHandovers);
    await pullScopedFinancialCollection<ReconciliationRecord>(
      'reconciliationRecords',
      db.reconciliationRecords
    );
    await pullScopedFinancialCollection<FinancialAnomaly>(
      'financialAnomalies',
      db.financialAnomalies
    );
    await pullScopedFinancialCollection<PhysicalInventory>(
      'physicalInventories',
      db.physicalInventories
    );
    await pullScopedFinancialCollection<CreditDelegationScope>(
      'financialDelegations',
      db.financialDelegations,
      'delegateUid'
    );

    // Recalcul déterministe des stocks affectés par de nouvelles écritures distantes
    const affectedPairs = new Map<string, FinancialLedgerEntry>();
    for (const entry of pulledLedger) {
      affectedPairs.set(`${entry.agentId}_${entry.currency}`, entry);
    }
    for (const entry of affectedPairs.values()) {
      await reconcileAndPersistAgentStock({
        agentId: entry.agentId,
        agentName: entry.agentName,
        agencyId: entry.agencyId,
        agencyName: entry.agencyName,
        currency: entry.currency,
      });
    }
  }
}

async function markOfflineEntryAsConflict(params: {
  entry: FinancialLedgerEntry;
  reason: string;
  observedVirtual: number;
  observedCash: number;
}): Promise<void> {
  const { entry, reason, observedVirtual, observedCash } = params;
  const now = Date.now();
  await db.financialLedger.update(entry.id, {
    syncLifecycle: 'en_conflit',
    syncStatus: 'conflict',
    conflictReason: reason,
    updatedAt: now,
  });

  if (entry.linkedTransactionId) {
    const linkedTx = await db.financialTransactions.get(entry.linkedTransactionId);
    if (linkedTx) {
      await db.financialTransactions.update(linkedTx.id, {
        status: 'en_conflit',
        syncLifecycle: 'en_conflit',
        syncStatus: 'conflict',
        conflictDetails: reason,
        updatedAt: now,
      });
    }
  }

  await reconcileAndPersistAgentStock({
    agentId: entry.agentId,
    agentName: entry.agentName,
    agencyId: entry.agencyId,
    agencyName: entry.agencyName,
    currency: entry.currency,
  });

  await raiseFinancialAnomaly({
    dedupKey: `offline-conflict:${entry.id}`,
    anomalyType:
      entry.virtualCreditDelta < 0 ? 'tentative_credit_insuffisant' : 'solde_incoherent',
    severity: 'elevee',
    agentId: entry.agentId,
    agentName: entry.agentName,
    agencyId: entry.agencyId,
    agencyName: entry.agencyName,
    currency: entry.currency,
    expectedAmount: Math.abs(
      entry.virtualCreditDelta < 0 ? entry.virtualCreditDelta : entry.physicalCashDelta
    ),
    observedAmount:
      entry.virtualCreditDelta < 0 ? observedVirtual : observedCash,
    discrepancyAmount: roundCurrency(
      Math.abs(
        entry.virtualCreditDelta < 0 ? entry.virtualCreditDelta : entry.physicalCashDelta
      ) - (entry.virtualCreditDelta < 0 ? observedVirtual : observedCash)
    ),
    linkedLedgerEntryId: entry.id,
    linkedTransactionId: entry.linkedTransactionId ?? null,
    title: `Conflit de synchronisation hors-ligne (${entry.reference})`,
    description: reason,
  });
}

/**
 * Simule ou applique la vérification serveur lors de la reconnexion d'une écriture locale.
 * Si le stock serveur confirmé est insuffisant pour absorber un débit (ex. dépense concurrente),
 * marque l'écriture et la transaction en `en_conflit` sans écraser silencieusement ni corrompre le solde.
 */
export async function reconcileOfflineLedgerPushWithServerStock(params: {
  entryId: string;
  serverStock: Pick<
    AgentFundStock,
    'virtualCreditConfirmed' | 'physicalCashConfirmed' | 'status'
  >;
}): Promise<{ status: 'confirmee_serveur' | 'en_conflit' | 'missing'; reason?: string }> {
  const entry = await db.financialLedger.get(params.entryId);
  if (!entry) return { status: 'missing' };

  const { serverStock } = params;
  if (serverStock.status !== 'active') {
    const reason = `Conflit de synchronisation : stock ${entry.currency} ${serverStock.status} sur le serveur.`;
    await markOfflineEntryAsConflict({
      entry,
      reason,
      observedVirtual: serverStock.virtualCreditConfirmed,
      observedCash: serverStock.physicalCashConfirmed,
    });
    return { status: 'en_conflit', reason };
  }

  const nextVirtual = roundCurrency(
    serverStock.virtualCreditConfirmed + entry.virtualCreditDelta
  );
  const nextCash = roundCurrency(
    serverStock.physicalCashConfirmed + entry.physicalCashDelta
  );

  if (entry.virtualCreditDelta < 0 && nextVirtual < -0.0001) {
    const reason = `Conflit de synchronisation : crédit virtuel serveur insuffisant (${serverStock.virtualCreditConfirmed} ${entry.currency}) pour absorber ${entry.virtualCreditDelta} ${entry.currency}.`;
    await markOfflineEntryAsConflict({
      entry,
      reason,
      observedVirtual: serverStock.virtualCreditConfirmed,
      observedCash: serverStock.physicalCashConfirmed,
    });
    return { status: 'en_conflit', reason };
  }

  if (entry.physicalCashDelta < 0 && nextCash < -0.0001) {
    const reason = `Conflit de synchronisation : cash physique serveur insuffisant (${serverStock.physicalCashConfirmed} ${entry.currency}) pour décaisser ${Math.abs(entry.physicalCashDelta)} ${entry.currency}.`;
    await markOfflineEntryAsConflict({
      entry,
      reason,
      observedVirtual: serverStock.virtualCreditConfirmed,
      observedCash: serverStock.physicalCashConfirmed,
    });
    return { status: 'en_conflit', reason };
  }

  const now = Date.now();
  await db.financialLedger.update(entry.id, {
    syncLifecycle: 'confirmee_serveur',
    syncStatus: 'synced',
    serverConfirmedAt: entry.serverConfirmedAt || now,
    updatedAt: now,
  });

  if (entry.linkedTransactionId) {
    const linkedTx = await db.financialTransactions.get(entry.linkedTransactionId);
    if (linkedTx) {
      await db.financialTransactions.update(linkedTx.id, {
        status: linkedTx.status === 'en_attente_synchro' ? 'validee' : linkedTx.status,
        syncLifecycle: 'confirmee_serveur',
        syncStatus: 'synced',
        serverConfirmedAt: linkedTx.serverConfirmedAt || now,
        updatedAt: now,
      });
    }
  }

  await reconcileAndPersistAgentStock({
    agentId: entry.agentId,
    agentName: entry.agentName,
    agencyId: entry.agencyId,
    agencyName: entry.agencyName,
    currency: entry.currency,
  });

  return { status: 'confirmee_serveur' };
}

async function syncSingleItem(item: SyncQueueItem): Promise<void> {
  const { entity, entityId, operation } = item;

  if (entity === 'billetage') {
    if (operation === 'delete') {
      const docRef = doc(firestore, 'billetages', entityId);
      await deleteDoc(docRef);
    } else {
      const billetage = await db.billetages.get(entityId);
      if (!billetage) {
        return;
      }
      const denominations = await db.billetageDenominations
        .where('billetageId')
        .equals(entityId)
        .toArray();

      const docRef = doc(firestore, 'billetages', entityId);
      await setDoc(
        docRef,
        {
          ...billetage,
          denominations,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );

      await db.billetages.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'operation') {
    if (operation === 'delete') {
      const docRef = doc(firestore, 'operations', entityId);
      await deleteDoc(docRef);
    } else {
      const op = await db.operations.get(entityId);
      if (!op) {
        return;
      }
      const docRef = doc(firestore, 'operations', entityId);
      await setDoc(
        docRef,
        {
          ...op,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );

      await db.operations.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'operationAssignment') {
    if (operation === 'delete') {
      const docRef = doc(firestore, 'operationAssignments', entityId);
      await deleteDoc(docRef);
    } else {
      const assignment = await db.operationAssignments.get(entityId);
      if (!assignment) {
        return;
      }
      const docRef = doc(firestore, 'operationAssignments', entityId);
      await setDoc(
        docRef,
        {
          ...assignment,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );

      await db.operationAssignments.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'report') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'reports', entityId));
    } else {
      const report = await db.reports.get(entityId);
      if (!report) return;
      await setDoc(
        doc(firestore, 'reports', entityId),
        {
          ...report,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.reports.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'chatMessage') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'messages', entityId));
    } else {
      const msg = await db.chatMessages.get(entityId);
      if (!msg) return;
      const cleanRemoteData = {
        id: msg.id,
        channelType: msg.channelType,
        channelId: msg.channelId,
        channelName: msg.channelName || '',
        agencyId: msg.agencyId || null,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        recipientId: msg.recipientId || null,
        recipientName: msg.recipientName || null,
        serviceTag: msg.serviceTag || null,
        groupName: msg.groupName || null,
        groupParticipantIds: msg.groupParticipantIds || [],
        groupParticipantNames: msg.groupParticipantNames || [],
        replyToMessageId: msg.replyToMessageId || null,
        replyToSenderName: msg.replyToSenderName || null,
        replyToExcerpt: msg.replyToExcerpt || null,
        forwardedFromSenderName: msg.forwardedFromSenderName || null,
        reactions: msg.reactions || {},
        comments: msg.comments || [],
        content: msg.content || '',
        attachmentType: msg.attachmentType || 'none',
        attachmentName: msg.attachmentName || null,
        attachmentDataUrl:
          msg.attachmentDataUrl && msg.attachmentDataUrl.length < 800000
            ? msg.attachmentDataUrl
            : null,
        readBy: msg.readBy || [msg.senderId],
        syncStatus: 'synced',
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt || Date.now(),
        syncedAt: serverTimestamp(),
      };
      await setDoc(doc(firestore, 'messages', entityId), cleanRemoteData, { merge: true });
      await db.chatMessages.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'broadcast') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'notifications', entityId));
    } else {
      const bc = await db.broadcasts.get(entityId);
      if (!bc) return;
      await setDoc(
        doc(firestore, 'notifications', entityId),
        {
          ...bc,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.broadcasts.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'debt') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'debts', entityId));
    } else {
      const debt = await db.debts.get(entityId);
      if (!debt) return;
      await setDoc(
        doc(firestore, 'debts', entityId),
        {
          ...debt,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.debts.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'interAgencyTransfer') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'interAgencyTransfers', entityId));
    } else {
      const trf = await db.interAgencyTransfers.get(entityId);
      if (!trf) return;
      await setDoc(
        doc(firestore, 'interAgencyTransfers', entityId),
        {
          ...trf,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.interAgencyTransfers.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'salary') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'salaries', entityId));
    } else {
      const sal = await db.salaries.get(entityId);
      if (!sal) return;
      await setDoc(
        doc(firestore, 'salaries', entityId),
        {
          ...sal,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.salaries.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'salaryClaim') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'salaryClaims', entityId));
    } else {
      const clm = await db.salaryClaims.get(entityId);
      if (!clm) return;
      await setDoc(
        doc(firestore, 'salaryClaims', entityId),
        {
          ...clm,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.salaryClaims.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'salaryAdvance') {
    if (operation === 'delete') {
      await deleteDoc(doc(firestore, 'salaryAdvances', entityId));
    } else {
      const adv = await db.salaryAdvances.get(entityId);
      if (!adv) return;
      await setDoc(
        doc(firestore, 'salaryAdvances', entityId),
        {
          ...adv,
          syncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );
      await db.salaryAdvances.update(entityId, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    }
  } else if (entity === 'clientOrder') {
    if (operation === 'delete') {
      // Traçabilité immuable : la suppression distante des commandes/réclamations est interdite
      return;
    }
    const order = await db.clientOrders.get(entityId);
    if (!order) return;
    const sanitizedOrder = Object.fromEntries(
      Object.entries(order).filter(([, value]) => value !== undefined),
    );
    await setDoc(
      doc(firestore, 'clientOrders', entityId),
      {
        ...sanitizedOrder,
        syncedAt: serverTimestamp(),
        syncStatus: 'synced',
      },
      { merge: true }
    );
    await db.clientOrders.update(entityId, {
      syncStatus: 'synced',
      updatedAt: Date.now(),
    });
  } else if (entity === 'financialLedger') {
    if (operation === 'delete') return;
    const entry = await db.financialLedger.get(entityId);
    if (!entry) return;
    if (entry.syncLifecycle === 'en_conflit' || entry.syncStatus === 'conflict') {
      return;
    }

    const ledgerRef = doc(firestore, 'financialLedger', entityId);
    const stockId = buildStockId(entry.agentId, entry.currency);
    const stockRef = doc(firestore, 'agentFundStocks', stockId);
    const now = Date.now();

    let serverConflictDetected: {
      reason: string;
      observedVirtual: number;
      observedCash: number;
    } | null = null;

    await runTransaction(firestore, async (rtx) => {
      const existingRemoteLedger = await rtx.get(ledgerRef);
      if (existingRemoteLedger.exists()) {
        // Idempotent : déjà confirmé sur le serveur
        return;
      }

      const remoteStockSnap = await rtx.get(stockRef);
      const localStock = await db.agentFundStocks.get(stockId);
      const baseStock: AgentFundStock | null = remoteStockSnap.exists()
        ? (remoteStockSnap.data() as AgentFundStock)
        : localStock || null;

      if (baseStock) {
        const nextVirtual = roundCurrency(
          baseStock.virtualCreditConfirmed + entry.virtualCreditDelta
        );
        const nextCash = roundCurrency(
          baseStock.physicalCashConfirmed + entry.physicalCashDelta
        );

        if (entry.virtualCreditDelta < 0 && nextVirtual < -0.0001) {
          serverConflictDetected = {
            reason: `Conflit de synchronisation : crédit virtuel serveur insuffisant (${baseStock.virtualCreditConfirmed} ${entry.currency}) pour absorber ${entry.virtualCreditDelta} ${entry.currency}.`,
            observedVirtual: baseStock.virtualCreditConfirmed,
            observedCash: baseStock.physicalCashConfirmed,
          };
          return;
        }
        if (entry.physicalCashDelta < 0 && nextCash < -0.0001) {
          serverConflictDetected = {
            reason: `Conflit de synchronisation : cash physique serveur insuffisant (${baseStock.physicalCashConfirmed} ${entry.currency}) pour décaisser ${Math.abs(entry.physicalCashDelta)} ${entry.currency}.`,
            observedVirtual: baseStock.virtualCreditConfirmed,
            observedCash: baseStock.physicalCashConfirmed,
          };
          return;
        }
      }

      const confirmedEntry: FinancialLedgerEntry = {
        ...entry,
        syncLifecycle: 'confirmee_serveur',
        syncStatus: 'synced',
        serverConfirmedAt: entry.serverConfirmedAt || now,
        updatedAt: now,
      };
      rtx.set(ledgerRef, {
        ...sanitizeForFirestore(confirmedEntry),
        syncedAt: serverTimestamp(),
      });

      if (baseStock) {
        const nextStock = recalculateAgentStockFromLedger({
          agentId: entry.agentId,
          agentName: entry.agentName,
          agencyId: entry.agencyId,
          agencyName: entry.agencyName,
          currency: entry.currency,
          entries: [
            ...(await db.financialLedger
              .where('agentId')
              .equals(entry.agentId)
              .filter((e) => e.currency === entry.currency && e.id !== entry.id)
              .toArray()),
            confirmedEntry,
          ],
          existingStock: baseStock,
        });
        rtx.set(stockRef, sanitizeForFirestore(nextStock), { merge: true });
      }
    });

    if (serverConflictDetected) {
      const conflictInfo = serverConflictDetected as {
        reason: string;
        observedVirtual: number;
        observedCash: number;
      };
      await markOfflineEntryAsConflict({
        entry,
        reason: conflictInfo.reason,
        observedVirtual: conflictInfo.observedVirtual,
        observedCash: conflictInfo.observedCash,
      });
      return;
    }

    await db.financialLedger.update(entityId, {
      syncLifecycle: 'confirmee_serveur',
      syncStatus: 'synced',
      serverConfirmedAt: entry.serverConfirmedAt || now,
      updatedAt: now,
    });
    await reconcileAndPersistAgentStock({
      agentId: entry.agentId,
      agentName: entry.agentName,
      agencyId: entry.agencyId,
      agencyName: entry.agencyName,
      currency: entry.currency,
    });
  } else if (entity === 'agentFundStock') {
    if (operation === 'delete') return;
    const stock = await db.agentFundStocks.get(entityId);
    if (!stock) return;
    if (stock.syncStatus === 'conflict') return;
    await setDoc(
      doc(firestore, 'agentFundStocks', entityId),
      sanitizeForFirestore({
        ...stock,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    await db.agentFundStocks.update(entityId, {
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      updatedAt: Date.now(),
    });
  } else if (entity === 'financialTransaction') {
    if (operation === 'delete') return;
    const tx = await db.financialTransactions.get(entityId);
    if (!tx) return;
    if (tx.status === 'en_conflit' || tx.syncLifecycle === 'en_conflit') return;
    await setDoc(
      doc(firestore, 'financialTransactions', entityId),
      sanitizeForFirestore({
        ...tx,
        status: tx.status === 'en_attente_synchro' ? 'validee' : tx.status,
        syncLifecycle: 'confirmee_serveur',
        syncStatus: 'synced',
        serverConfirmedAt: tx.serverConfirmedAt || Date.now(),
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    await db.financialTransactions.update(entityId, {
      status: tx.status === 'en_attente_synchro' ? 'validee' : tx.status,
      syncLifecycle: 'confirmee_serveur',
      syncStatus: 'synced',
      serverConfirmedAt: tx.serverConfirmedAt || Date.now(),
      updatedAt: Date.now(),
    });
  } else if (entity === 'replenishmentRequest') {
    if (operation === 'delete') return;
    const req = await db.replenishmentRequests.get(entityId);
    if (!req) return;
    await setDoc(
      doc(firestore, 'replenishmentRequests', entityId),
      sanitizeForFirestore({
        ...req,
        syncStatus: 'synced',
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    await db.replenishmentRequests.update(entityId, {
      syncStatus: 'synced',
      updatedAt: Date.now(),
    });
  } else if (entity === 'cashHandover') {
    if (operation === 'delete') return;
    const handover = await db.cashHandovers.get(entityId);
    if (!handover) return;
    await setDoc(
      doc(firestore, 'cashHandovers', entityId),
      sanitizeForFirestore({
        ...handover,
        syncStatus: 'synced',
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    await db.cashHandovers.update(entityId, {
      syncStatus: 'synced',
      updatedAt: Date.now(),
    });
  } else if (entity === 'reconciliationRecord') {
    if (operation === 'delete') return;
    const rec = await db.reconciliationRecords.get(entityId);
    if (!rec) return;
    await setDoc(
      doc(firestore, 'reconciliationRecords', entityId),
      sanitizeForFirestore({
        ...rec,
        syncStatus: 'synced',
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    await db.reconciliationRecords.update(entityId, {
      syncStatus: 'synced',
      updatedAt: Date.now(),
    });
  } else if (entity === 'financialAnomaly') {
    if (operation === 'delete') return;
    const ano = await db.financialAnomalies.get(entityId);
    if (!ano) return;
    await setDoc(
      doc(firestore, 'financialAnomalies', entityId),
      sanitizeForFirestore({
        ...ano,
        syncStatus: 'synced',
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    await db.financialAnomalies.update(entityId, {
      syncStatus: 'synced',
      updatedAt: Date.now(),
    });
  } else if (entity === 'physicalInventory') {
    if (operation === 'delete') return;
    const inv = await db.physicalInventories.get(entityId);
    if (!inv) return;
    await setDoc(
      doc(firestore, 'physicalInventories', entityId),
      sanitizeForFirestore({
        ...inv,
        syncStatus: 'synced',
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    await db.physicalInventories.update(entityId, {
      syncStatus: 'synced',
      updatedAt: Date.now(),
    });
  } else if (entity === 'financialDelegation') {
    if (operation === 'delete') return;
    const del = await db.financialDelegations.get(entityId);
    if (!del) return;
    await setDoc(
      doc(firestore, 'financialDelegations', entityId),
      sanitizeForFirestore({
        ...del,
        syncedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  }
}

export async function processSyncQueue(): Promise<{
  processed: number;
  errors: number;
}> {
  if (isSyncing) {
    return { processed: 0, errors: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, errors: 0 };
  }

  if (!isFirebaseConfigured) {
    return { processed: 0, errors: 0 };
  }

  isSyncing = true;
  let processed = 0;
  let errors = 0;

  try {
    // 1. Récupération des éléments bloqués en 'processing' (coupure inattendue, rechargement)
    const stuckItems = await db.syncQueue
      .where('status')
      .equals('processing')
      .toArray();

    for (const stuck of stuckItems) {
      if (stuck.id) {
        await db.syncQueue.update(stuck.id, {
          status: 'pending',
          lastError: stuck.lastError || 'Reprise après interruption inattendue',
          updatedAt: Date.now(),
        });
      }
    }

    // 2. Extraction des éléments éligibles
    const pendingItems = await db.syncQueue
      .where('status')
      .anyOf('pending', 'failed')
      .toArray();

    // 3. Déduplication idempotente : si plusieurs actions concernent le même document, exécuter la plus récente
    const queueMap = new Map<string, SyncQueueItem>();
    for (const item of pendingItems) {
      if (!item.id) continue;
      if (item.attempts >= MAX_ATTEMPTS && item.status === 'failed') {
        continue;
      }
      const key = `${item.entity}:${item.entityId}`;
      const existing = queueMap.get(key);
      if (!existing || (item.id && existing.id && item.id > existing.id)) {
        if (existing && existing.id) {
          await db.syncQueue.update(existing.id, {
            status: 'completed',
            updatedAt: Date.now(),
            lastError: 'Consolidé dans une opération ultérieure',
          });
        }
        queueMap.set(key, item);
      } else {
        await db.syncQueue.update(item.id, {
          status: 'completed',
          updatedAt: Date.now(),
          lastError: 'Consolidé dans une opération ultérieure',
        });
      }
    }

    const itemsToProcess = Array.from(queueMap.values());

    for (const item of itemsToProcess) {
      if (!item.id) continue;

      await db.syncQueue.update(item.id, {
        status: 'processing',
        updatedAt: Date.now(),
      });

      try {
        await syncSingleItem(item);
        await db.syncQueue.update(item.id, {
          status: 'completed',
          updatedAt: Date.now(),
        });
        processed++;
      } catch (err: unknown) {
        errors++;
        const nextAttempts = (item.attempts || 0) + 1;
        const willFail = nextAttempts >= MAX_ATTEMPTS;
        const msg = err instanceof Error ? err.message : 'Erreur inconnue lors de la synchronisation';

        await db.syncQueue.update(item.id, {
          status: willFail ? 'failed' : 'pending',
          attempts: nextAttempts,
          lastError: msg,
          updatedAt: Date.now(),
        });
      }
    }
    await pullRemoteDataToLocal();
  } catch (globalErr) {
    console.warn('[Ets AMANI SyncWorker] Erreur traitement file :', globalErr);
  } finally {
    isSyncing = false;
  }

  return { processed, errors };
}

export function startSyncWorker(): () => void {
  if (syncIntervalId) {
    return () => {
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }
    };
  }

  void processSyncQueue();

  const handleOnline = () => {
    void processSyncQueue();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  syncIntervalId = setInterval(() => {
    void processSyncQueue();
  }, SYNC_INTERVAL_MS);

  return () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
  };
}

export async function triggerSyncNow(): Promise<{
  processed: number;
  errors: number;
}> {
  return processSyncQueue();
}
