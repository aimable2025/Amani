import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore as firestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type { AppUser } from '../types/auth';
import {
  INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE,
  type AgentFundStock,
  type CurrencyCode,
  type FinancialLedgerEntry,
  type FinancialOperator,
  type FinancialTransaction,
  type FinancialTransactionType,
} from '../types/financialSupervision';
import { raiseFinancialAnomaly } from './AnomalyDetectionService';
import { recordAuditLog } from './AuditService';
import {
  assertFinancialRoleWriteScope,
  assertSufficientStocksForOperation,
  buildFinancialReference,
  buildIdempotencyKey,
  buildStockId,
  enqueueFinancialSync,
  getOrCreateLocalAgentStock,
  recalculateAgentStockFromLedger,
  reconcileAndPersistAgentStock,
  roundCurrency,
  sanitizeForFirestore,
} from './FinancialLedgerService';
import { reconcileTransactionWithSmsOperations } from './SmsReconciliationService';

function isOnline(): boolean {
  return (
    isFirebaseConfigured &&
    (typeof navigator === 'undefined' ? true : navigator.onLine)
  );
}

export interface RecordAgentTransactionInput {
  transactionType: FinancialTransactionType;
  operator: FinancialOperator;
  internalNumberId?: string | null;
  internalPhoneNumber?: string | null;
  externalOperatorRef?: string | null;
  clientUid?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  beneficiaryPhone?: string | null;
  linkedClientOrderId?: string | null;
  linkedOperationId?: string | null;
  currency: CurrencyCode;
  amount: number;
  feeAmount?: number;
  feeMode?: FinancialTransaction['feeMode'];
  commissionAmount?: number;
  /** Requis uniquement pour change_devise */
  targetCurrency?: CurrencyCode | null;
  targetAmount?: number | null;
  exchangeRate?: number | null;
  fxExecutionChannel?: FinancialTransaction['fxExecutionChannel'];
  settlementMode?: FinancialTransaction['settlementMode'];
  notes?: string | null;
  agencyName: string;
  idempotencyKey?: string;
  agent: AppUser;
  /** Pour tests ou mode offline strict : force exécution locale sans appel réseau */
  forceOffline?: boolean;
}

export interface RecordAgentTransactionResult {
  transaction: FinancialTransaction;
  ledgerEntries: FinancialLedgerEntry[];
  stocks: AgentFundStock[];
}

export async function recordAgentTransaction(
  input: RecordAgentTransactionInput
): Promise<RecordAgentTransactionResult> {
  const {
    transactionType,
    operator,
    internalNumberId = null,
    internalPhoneNumber = null,
    externalOperatorRef = null,
    clientUid = null,
    clientName = null,
    clientPhone = null,
    beneficiaryPhone = null,
    linkedClientOrderId = null,
    linkedOperationId = null,
    currency,
    feeMode = 'cash_encaisse',
    commissionAmount = 0,
    targetCurrency = null,
    targetAmount = null,
    exchangeRate = null,
    fxExecutionChannel = 'cash_contre_cash',
    settlementMode = 'cash_collecte',
    notes = null,
    agencyName,
    agent,
    forceOffline = false,
  } = input;

  assertFinancialRoleWriteScope({
    actor: agent,
    targetAgencyId: agent.agencyId ?? null,
    targetAgentId: agent.uid,
  });

  const amount = roundCurrency(input.amount);
  const feeAmount = Math.max(0, roundCurrency(input.feeAmount ?? 0));
  const commAmount = Math.max(0, roundCurrency(commissionAmount));

  if (amount <= 0) {
    throw new Error('Le montant de la transaction doit être strictement positif.');
  }

  const idemKey =
    input.idempotencyKey ||
    buildIdempotencyKey(`tx-${agent.uid}-${transactionType}-${currency}`);

  const existingTx = await db.financialTransactions
    .where('idempotencyKey')
    .equals(idemKey)
    .first();
  if (existingTx) {
    const existingLedger = await db.financialLedger
      .where('linkedTransactionId')
      .equals(existingTx.id)
      .toArray();
    const s = await reconcileAndPersistAgentStock({
      agentId: agent.uid,
      agentName: agent.displayName,
      agencyId: agent.agencyId ?? null,
      agencyName,
      currency: existingTx.currency,
    });
    const stocks = [s];
    if (existingTx.targetCurrency && existingTx.targetCurrency !== existingTx.currency) {
      stocks.push(
        await reconcileAndPersistAgentStock({
          agentId: agent.uid,
          agentName: agent.displayName,
          agencyId: agent.agencyId ?? null,
          agencyName,
          currency: existingTx.targetCurrency,
        })
      );
    }
    return { transaction: existingTx, ledgerEntries: existingLedger, stocks };
  }

  const primaryStock = await getOrCreateLocalAgentStock({
    agentId: agent.uid,
    agentName: agent.displayName,
    agencyId: agent.agencyId ?? null,
    agencyName,
    currency,
  });

  // Calcul des impacts comptables par type d'opération
  let physicalCashDelta = 0;
  let virtualCreditDelta = 0;
  let feeDelta = feeMode === 'cash_encaisse' ? feeAmount : 0;
  let fxNetDelta = 0;
  let targetPhysicalCashDelta = 0;
  let targetVirtualCreditDelta = 0;
  let targetFxNetDelta = 0;
  let targetStock: AgentFundStock | null = null;

  if (transactionType === 'depot_client' || transactionType === 'depot_abonne') {
    // Le client remet du cash physique ; l'agent envoie du crédit virtuel.
    physicalCashDelta = roundCurrency(amount + (feeMode === 'cash_encaisse' ? feeAmount : 0));
    virtualCreditDelta = roundCurrency(-amount);
  } else if (transactionType === 'retrait_client' || transactionType === 'retrait_abonne') {
    // Le client envoie du virtuel à l'agent ; l'agent remet du cash physique au client.
    virtualCreditDelta = roundCurrency(amount);
    physicalCashDelta = roundCurrency(-amount + (feeMode === 'cash_encaisse' ? feeAmount : 0));
  } else if (transactionType === 'transaction_virtuelle') {
    // Service purement virtuel consommé sur le stock virtuel de l'agent.
    virtualCreditDelta = roundCurrency(-amount);
    physicalCashDelta =
      settlementMode === 'cash_collecte'
        ? roundCurrency(amount + (feeMode === 'cash_encaisse' ? feeAmount : 0))
        : feeMode === 'cash_encaisse'
          ? feeAmount
          : 0;
    // Note : si settlementMode !== 'cash_collecte', il s'agit d'une sortie nette de crédit sans entrée cash équivalente ;
    // afin de préserver l'invariant, toute opération sans contrepartie cash doit être tracée avec capital/fx/commission ou ajustement explicite.
    if (settlementMode !== 'cash_collecte') {
      throw new Error(
        'Une transaction virtuelle de guichet doit collecter une contrepartie (cash collecté) ou passer par un réapprovisionnement.'
      );
    }
  } else if (transactionType === 'commission_frais') {
    physicalCashDelta = feeMode === 'cash_encaisse' ? amount : 0;
    virtualCreditDelta = feeMode === 'cash_encaisse' ? 0 : amount;
    feeDelta = amount;
  } else if (transactionType === 'change_devise') {
    if (!targetCurrency || targetCurrency === currency) {
      throw new Error('Veuillez sélectionner deux devises distinctes (USD et CDF) pour un change.');
    }
    const tAmount = roundCurrency(targetAmount ?? 0);
    if (tAmount <= 0) {
      throw new Error('Le montant remis dans la devise cible doit être strictement positif.');
    }
    targetStock = await getOrCreateLocalAgentStock({
      agentId: agent.uid,
      agentName: agent.displayName,
      agencyId: agent.agencyId ?? null,
      agencyName,
      currency: targetCurrency,
    });

    // L'agent reçoit `amount` en `currency` et remet `tAmount` en `targetCurrency`
    if (fxExecutionChannel === 'virtuel_contre_cash') {
      virtualCreditDelta = amount;
      targetPhysicalCashDelta = -tAmount;
    } else if (fxExecutionChannel === 'cash_contre_virtuel') {
      physicalCashDelta = roundCurrency(amount + (feeMode === 'cash_encaisse' ? feeAmount : 0));
      targetVirtualCreditDelta = -tAmount;
    } else {
      physicalCashDelta = roundCurrency(amount + (feeMode === 'cash_encaisse' ? feeAmount : 0));
      targetPhysicalCashDelta = -tAmount;
    }
    fxNetDelta = roundCurrency(physicalCashDelta + virtualCreditDelta - feeDelta);
    targetFxNetDelta = roundCurrency(targetPhysicalCashDelta + targetVirtualCreditDelta);
  }

  // Vérification bloquante des stocks disponibles AVANT écriture
  try {
    assertSufficientStocksForOperation({
      stock: primaryStock,
      virtualCreditRequired: virtualCreditDelta < 0 ? Math.abs(virtualCreditDelta) : 0,
      physicalCashRequired: physicalCashDelta < 0 ? Math.abs(physicalCashDelta) : 0,
    });
    if (targetStock) {
      assertSufficientStocksForOperation({
        stock: targetStock,
        virtualCreditRequired:
          targetVirtualCreditDelta < 0 ? Math.abs(targetVirtualCreditDelta) : 0,
        physicalCashRequired:
          targetPhysicalCashDelta < 0 ? Math.abs(targetPhysicalCashDelta) : 0,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE;
    if (message === INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE) {
      await raiseFinancialAnomaly({
        dedupKey: `credit_insuffisant:${agent.uid}:${currency}:${Math.floor(Date.now() / 60000)}`,
        anomalyType: 'tentative_credit_insuffisant',
        severity: 'moyenne',
        agentId: agent.uid,
        agentName: agent.displayName,
        agencyId: agent.agencyId ?? null,
        agencyName,
        currency,
        expectedAmount: amount,
        observedAmount: primaryStock.virtualCreditAvailable,
        discrepancyAmount: roundCurrency(amount - primaryStock.virtualCreditAvailable),
        title: `Tentative de transaction sans crédit virtuel suffisant (${currency})`,
        description: `${agent.displayName} a tenté ${transactionType} de ${amount} ${currency} avec ${primaryStock.virtualCreditAvailable} ${currency} disponible.`,
      });
    }
    throw new Error(message);
  }

  const now = Date.now();
  const txId = `ftx-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const txRef = buildFinancialReference('TXN');
  const exchangeGroupId = transactionType === 'change_devise' ? `fx-${txId}` : null;

  let transaction: FinancialTransaction = {
    id: txId,
    idempotencyKey: idemKey,
    reference: txRef,
    externalOperatorRef: externalOperatorRef?.trim() || null,
    transactionType,
    agentId: agent.uid,
    agentName: agent.displayName,
    agencyId: agent.agencyId ?? null,
    agencyName,
    operator,
    internalNumberId,
    internalPhoneNumber,
    clientUid,
    clientName: clientName?.trim() || null,
    clientPhone: clientPhone?.trim() || null,
    beneficiaryPhone: beneficiaryPhone?.trim() || null,
    linkedClientOrderId,
    linkedOperationId,
    currency,
    amount,
    feeAmount,
    feeMode,
    commissionAmount: commAmount,
    targetCurrency: targetCurrency ?? null,
    targetAmount: targetAmount ? roundCurrency(targetAmount) : null,
    exchangeRate: exchangeRate ?? null,
    fxExecutionChannel: transactionType === 'change_devise' ? fxExecutionChannel : null,
    physicalCashDelta,
    virtualCreditDelta,
    targetPhysicalCashDelta: targetStock ? targetPhysicalCashDelta : 0,
    targetVirtualCreditDelta: targetStock ? targetVirtualCreditDelta : 0,
    settlementMode,
    reconciliationStatus: 'non_rapprochee',
    linkedSmsOperationId: null,
    reconciledAt: null,
    reconciledBy: null,
    status: 'en_attente_synchro',
    syncLifecycle: 'en_attente_synchro',
    syncStatus: 'pending',
    conflictDetails: null,
    rejectionReason: null,
    reversedByLedgerId: null,
    notes: notes?.trim() || null,
    deviceTimestamp: now,
    serverConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  let primaryEntry: FinancialLedgerEntry = {
    id: `led-${now}-${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: buildIdempotencyKey(`led-${txId}-${currency}`, `${idemKey}:${currency}`),
    reference: buildFinancialReference('JRN'),
    operationCategory: transactionType,
    agentId: agent.uid,
    agentName: agent.displayName,
    agencyId: agent.agencyId ?? null,
    agencyName,
    currency,
    physicalCashDelta,
    virtualCreditDelta,
    capitalDelta: 0,
    feeDelta,
    fxNetDelta,
    adjustmentDelta: 0,
    physicalCashBefore: primaryStock.physicalCashAvailable,
    physicalCashAfter: roundCurrency(primaryStock.physicalCashAvailable + physicalCashDelta),
    virtualCreditBefore: primaryStock.virtualCreditAvailable,
    virtualCreditAfter: roundCurrency(primaryStock.virtualCreditAvailable + virtualCreditDelta),
    feeAmount,
    commissionAmount: commAmount,
    exchangeGroupId,
    exchangeCounterCurrency: targetCurrency ?? null,
    exchangeCounterAmount: targetAmount ? roundCurrency(targetAmount) : null,
    exchangeRate: exchangeRate ?? null,
    operator,
    internalNumberId,
    linkedTransactionId: txId,
    authorUid: agent.uid,
    authorName: agent.displayName,
    authorRole: agent.role,
    reason: notes?.trim() || `${transactionType} (${operator})`,
    syncLifecycle: 'en_attente_synchro',
    syncStatus: 'pending',
    serverConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  let secondaryEntry: FinancialLedgerEntry | null = null;
  if (targetStock && targetCurrency) {
    secondaryEntry = {
      id: `led-${now + 1}-${Math.random().toString(36).slice(2, 8)}`,
      idempotencyKey: buildIdempotencyKey(
        `led-${txId}-${targetCurrency}`,
        `${idemKey}:${targetCurrency}`
      ),
      reference: buildFinancialReference('JRN'),
      operationCategory: 'change_devise',
      agentId: agent.uid,
      agentName: agent.displayName,
      agencyId: agent.agencyId ?? null,
      agencyName,
      currency: targetCurrency,
      physicalCashDelta: targetPhysicalCashDelta,
      virtualCreditDelta: targetVirtualCreditDelta,
      capitalDelta: 0,
      feeDelta: 0,
      fxNetDelta: targetFxNetDelta,
      adjustmentDelta: 0,
      physicalCashBefore: targetStock.physicalCashAvailable,
      physicalCashAfter: roundCurrency(
        targetStock.physicalCashAvailable + targetPhysicalCashDelta
      ),
      virtualCreditBefore: targetStock.virtualCreditAvailable,
      virtualCreditAfter: roundCurrency(
        targetStock.virtualCreditAvailable + targetVirtualCreditDelta
      ),
      exchangeGroupId,
      exchangeCounterCurrency: currency,
      exchangeCounterAmount: amount,
      exchangeRate: exchangeRate ?? null,
      operator: 'caisse_interne',
      linkedTransactionId: txId,
      authorUid: agent.uid,
      authorName: agent.displayName,
      authorRole: agent.role,
      reason: `Change devise ${currency} -> ${targetCurrency}`,
      syncLifecycle: 'en_attente_synchro',
      syncStatus: 'pending',
      serverConfirmedAt: null,
      createdAt: now + 1,
      updatedAt: now + 1,
    };
  }

  const localEntriesPrimary = await db.financialLedger
    .where('agentId')
    .equals(agent.uid)
    .filter((e) => e.currency === currency)
    .toArray();
  const localEntriesTarget =
    targetCurrency && targetStock
      ? await db.financialLedger
          .where('agentId')
          .equals(agent.uid)
          .filter((e) => e.currency === targetCurrency)
          .toArray()
      : [];

  let serverCommitted = false;

  if (!forceOffline && isOnline()) {
    try {
      const txRefDoc = doc(firestoreDb, 'financialTransactions', transaction.id);
      const primaryLedgerDoc = doc(firestoreDb, 'financialLedger', primaryEntry.id);
      const primaryStockDoc = doc(
        firestoreDb,
        'agentFundStocks',
        buildStockId(agent.uid, currency)
      );
      const secondaryLedgerDoc = secondaryEntry
        ? doc(firestoreDb, 'financialLedger', secondaryEntry.id)
        : null;
      const targetStockDoc =
        targetStock && targetCurrency
          ? doc(firestoreDb, 'agentFundStocks', buildStockId(agent.uid, targetCurrency))
          : null;

      await runTransaction(firestoreDb, async (rtx) => {
        const existingServerTx = await rtx.get(txRefDoc);
        if (existingServerTx.exists()) {
          serverCommitted = true;
          return;
        }
        const pStockSnap = await rtx.get(primaryStockDoc);
        const pServerStock = pStockSnap.exists()
          ? (pStockSnap.data() as AgentFundStock)
          : primaryStock;

        const tStockSnap = targetStockDoc ? await rtx.get(targetStockDoc) : null;
        const tServerStock =
          tStockSnap && tStockSnap.exists()
            ? (tStockSnap.data() as AgentFundStock)
            : targetStock;

        assertSufficientStocksForOperation({
          stock: pServerStock,
          virtualCreditRequired: virtualCreditDelta < 0 ? Math.abs(virtualCreditDelta) : 0,
          physicalCashRequired: physicalCashDelta < 0 ? Math.abs(physicalCashDelta) : 0,
          allowConfirmedOnly: true,
        });
        if (tServerStock) {
          assertSufficientStocksForOperation({
            stock: tServerStock,
            virtualCreditRequired:
              targetVirtualCreditDelta < 0 ? Math.abs(targetVirtualCreditDelta) : 0,
            physicalCashRequired:
              targetPhysicalCashDelta < 0 ? Math.abs(targetPhysicalCashDelta) : 0,
            allowConfirmedOnly: true,
          });
        }

        primaryEntry = {
          ...primaryEntry,
          physicalCashBefore: pServerStock.physicalCashConfirmed,
          physicalCashAfter: roundCurrency(
            pServerStock.physicalCashConfirmed + physicalCashDelta
          ),
          virtualCreditBefore: pServerStock.virtualCreditConfirmed,
          virtualCreditAfter: roundCurrency(
            pServerStock.virtualCreditConfirmed + virtualCreditDelta
          ),
          syncLifecycle: 'confirmee_serveur',
          syncStatus: 'synced',
          serverConfirmedAt: now,
        };

        if (secondaryEntry && tServerStock) {
          secondaryEntry = {
            ...secondaryEntry,
            physicalCashBefore: tServerStock.physicalCashConfirmed,
            physicalCashAfter: roundCurrency(
              tServerStock.physicalCashConfirmed + targetPhysicalCashDelta
            ),
            virtualCreditBefore: tServerStock.virtualCreditConfirmed,
            virtualCreditAfter: roundCurrency(
              tServerStock.virtualCreditConfirmed + targetVirtualCreditDelta
            ),
            syncLifecycle: 'confirmee_serveur',
            syncStatus: 'synced',
            serverConfirmedAt: now,
          };
        }

        transaction = {
          ...transaction,
          status: 'validee',
          syncLifecycle: 'confirmee_serveur',
          syncStatus: 'synced',
          serverConfirmedAt: now,
        };

        const nextPrimaryStock = recalculateAgentStockFromLedger({
          agentId: agent.uid,
          agentName: agent.displayName,
          agencyId: agent.agencyId ?? null,
          agencyName,
          currency,
          entries: [...localEntriesPrimary, primaryEntry],
          existingStock: pServerStock,
        });

        rtx.set(primaryLedgerDoc, sanitizeForFirestore(primaryEntry));
        rtx.set(primaryStockDoc, sanitizeForFirestore(nextPrimaryStock));

        if (secondaryEntry && secondaryLedgerDoc && targetStockDoc && tServerStock && targetCurrency) {
          const nextTargetStock = recalculateAgentStockFromLedger({
            agentId: agent.uid,
            agentName: agent.displayName,
            agencyId: agent.agencyId ?? null,
            agencyName,
            currency: targetCurrency,
            entries: [...localEntriesTarget, secondaryEntry],
            existingStock: tServerStock,
          });
          rtx.set(secondaryLedgerDoc, sanitizeForFirestore(secondaryEntry));
          rtx.set(targetStockDoc, sanitizeForFirestore(nextTargetStock));
        }

        rtx.set(txRefDoc, sanitizeForFirestore(transaction));
        serverCommitted = true;
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE ||
          err.message.includes('cash physique disponible') ||
          err.message.includes('gelé') ||
          err.message.includes('suspendu'))
      ) {
        throw err;
      }
      // Échec réseau ou indisponibilité Firestore : bascule Offline-First sûre
      serverCommitted = false;
    }
  }

  if (!serverCommitted) {
    await enqueueFinancialSync('financialLedger', primaryEntry.id, 'create');
    if (secondaryEntry) {
      await enqueueFinancialSync('financialLedger', secondaryEntry.id, 'create');
    }
    await enqueueFinancialSync('financialTransaction', transaction.id, 'create');
    await enqueueFinancialSync('agentFundStock', buildStockId(agent.uid, currency), 'update');
    if (targetCurrency) {
      await enqueueFinancialSync(
        'agentFundStock',
        buildStockId(agent.uid, targetCurrency),
        'update'
      );
    }
  }

  await db.financialLedger.put(primaryEntry);
  if (secondaryEntry) {
    await db.financialLedger.put(secondaryEntry);
  }
  await db.financialTransactions.put(transaction);

  const updatedStocks: AgentFundStock[] = [];
  updatedStocks.push(
    await reconcileAndPersistAgentStock({
      agentId: agent.uid,
      agentName: agent.displayName,
      agencyId: agent.agencyId ?? null,
      agencyName,
      currency,
    })
  );
  if (targetCurrency) {
    updatedStocks.push(
      await reconcileAndPersistAgentStock({
        agentId: agent.uid,
        agentName: agent.displayName,
        agencyId: agent.agencyId ?? null,
        agencyName,
        currency: targetCurrency,
      })
    );
  }

  // Rapprochement SMS automatique (jamais bloquant)
  try {
    await reconcileTransactionWithSmsOperations(transaction);
  } catch {
    // ignore
  }

  await recordAuditLog({
    action: 'Transaction financière agent enregistrée',
    category: 'finance',
    severity: 'info',
    details: `${transaction.reference} (${transactionType}) : ${amount} ${currency} via ${operator} [${transaction.syncLifecycle}].`,
    actorName: agent.displayName,
    actorRole: agent.role,
    actorUid: agent.uid,
    agencyId: agent.agencyId ?? undefined,
    agencyName,
  });

  const refreshedTx = (await db.financialTransactions.get(transaction.id)) || transaction;
  return {
    transaction: refreshedTx,
    ledgerEntries: secondaryEntry ? [primaryEntry, secondaryEntry] : [primaryEntry],
    stocks: updatedStocks,
  };
}
