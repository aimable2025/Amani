import { doc, setDoc } from 'firebase/firestore';
import { db, type LocalSmsOperation } from '../lib/db';
import { firestore as firestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type { AppUser } from '../types/auth';
import type {
  CurrencyCode,
  FinancialTransaction,
  ReconciliationRecord,
  ReconciliationStatus,
  ReconciliationToleranceConfig,
} from '../types/financialSupervision';
import { raiseFinancialAnomaly } from './AnomalyDetectionService';
import {
  enqueueFinancialSync,
  getFinancialThresholds,
  isGlobalFinancialSupervisor,
  roundCurrency,
  sanitizeForFirestore,
} from './FinancialLedgerService';

function isOnline(): boolean {
  return (
    isFirebaseConfigured &&
    (typeof navigator === 'undefined' ? true : navigator.onLine)
  );
}

export interface SmsMatchEvaluation {
  compatible: boolean;
  status: ReconciliationStatus;
  confidenceScore: number;
  amountDifference: number;
  timeDeltaMs: number;
  matchedCriteria: ReconciliationRecord['matchedCriteria'];
}

function normalizeRef(ref?: string | null): string {
  return (ref || '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Polarité Mobile Money Ets AMANI :
 * - Dépôt client au guichet : l'agent envoie du virtuel -> SMS opérateur sortant ('retrait' / 'envoyé' / 'transfert').
 * - Retrait client au guichet : le client envoie du virtuel à l'agent -> SMS opérateur entrant ('depot' / 'reçu').
 * - En cas d'ambiguité ou type inconnu dans le SMS, on autorise la correspondance uniquement si la référence exacte correspond,
 *   sinon on classe en vérification manuelle.
 */
export function isSmsTypeCompatibleWithTransaction(
  smsType: string | undefined,
  txType: FinancialTransaction['transactionType']
): boolean {
  const s = (smsType || '').toLowerCase();
  if (!s || s === 'inconnu' || s === 'autre') {
    return true;
  }
  if (txType === 'depot_client' || txType === 'depot_abonne' || txType === 'transaction_virtuelle') {
    return s === 'retrait' || s === 'transfert' || s === 'paiement';
  }
  if (txType === 'retrait_client' || txType === 'retrait_abonne') {
    return s === 'depot' || s === 'transfert';
  }
  return true;
}

/**
 * Évaluation pure et déterministe entre un SMS opérateur et une transaction agent.
 * Ne rapproche JAMAIS automatiquement sur le seul montant sans référence ni numéro/opérateur + fenêtre horaire.
 */
export function evaluateSmsTransactionMatch(
  sms: Pick<
    LocalSmsOperation,
    | 'id'
    | 'internalNumberId'
    | 'agencyId'
    | 'operator'
    | 'transactionReference'
    | 'amount'
    | 'currency'
    | 'transactionType'
    | 'operationDate'
    | 'receivedAt'
  >,
  tx: Pick<
    FinancialTransaction,
    | 'id'
    | 'agentId'
    | 'agencyId'
    | 'operator'
    | 'internalNumberId'
    | 'externalOperatorRef'
    | 'reference'
    | 'transactionType'
    | 'amount'
    | 'currency'
    | 'deviceTimestamp'
  >,
  config: ReconciliationToleranceConfig = getFinancialThresholds()
): SmsMatchEvaluation {
  const smsRef = normalizeRef(sms.transactionReference);
  const txOpRef = normalizeRef(tx.externalOperatorRef);
  const txInternalRef = normalizeRef(tx.reference);
  const referenceMatch =
    Boolean(smsRef) &&
    ((Boolean(txOpRef) && smsRef === txOpRef) ||
      (Boolean(txInternalRef) && smsRef === txInternalRef));

  const smsAmount = typeof sms.amount === 'number' ? roundCurrency(sms.amount) : 0;
  const txAmount = roundCurrency(tx.amount);
  const amountDifference = roundCurrency(Math.abs(smsAmount - txAmount));
  const tolerance =
    tx.currency === 'USD' ? config.amountToleranceUsd : config.amountToleranceCdf;
  const amountMatch = smsAmount > 0 && amountDifference <= tolerance;

  const smsCurrency = (sms.currency || '').toUpperCase();
  const currencyMatch = !smsCurrency || smsCurrency === tx.currency;

  const smsTime = sms.operationDate || sms.receivedAt;
  const timeDeltaMs = Math.abs(smsTime - tx.deviceTimestamp);
  const withinTimeWindow = timeDeltaMs <= config.timeWindowMinutes * 60 * 1000;

  const operatorMatch = !sms.operator || sms.operator === tx.operator;
  const typeCompatible = isSmsTypeCompatibleWithTransaction(
    sms.transactionType,
    tx.transactionType
  );
  const agentOrNumberMatch = Boolean(
    (tx.internalNumberId && sms.internalNumberId && tx.internalNumberId === sms.internalNumberId) ||
      (tx.agencyId && sms.agencyId && tx.agencyId === sms.agencyId)
  );

  let confidenceScore = 0;
  if (referenceMatch) confidenceScore += 45;
  if (amountMatch) confidenceScore += 25;
  if (currencyMatch) confidenceScore += 10;
  if (withinTimeWindow) confidenceScore += 10;
  if (operatorMatch) confidenceScore += 5;
  if (typeCompatible) confidenceScore += 5;

  const matchedCriteria: ReconciliationRecord['matchedCriteria'] = {
    referenceMatch,
    amountMatch,
    currencyMatch,
    typeCompatible,
    withinTimeWindow,
    operatorMatch,
    agentOrNumberMatch,
  };

  if (!currencyMatch || !operatorMatch) {
    return {
      compatible: false,
      status: 'non_rapprochee',
      confidenceScore: 0,
      amountDifference,
      timeDeltaMs,
      matchedCriteria,
    };
  }

  // Cas 1 : Référence exacte + montant concordant dans la fenêtre (rapprochement automatique sûr)
  if (referenceMatch && amountMatch && typeCompatible) {
    return {
      compatible: true,
      status: withinTimeWindow ? 'rapprochee' : 'a_verifier_manuellement',
      confidenceScore,
      amountDifference,
      timeDeltaMs,
      matchedCriteria,
    };
  }

  // Cas 2 : Référence exacte mais montant différent -> écart de montant critique !
  if (referenceMatch && !amountMatch) {
    return {
      compatible: true,
      status: 'montant_different',
      confidenceScore: Math.max(40, confidenceScore),
      amountDifference,
      timeDeltaMs,
      matchedCriteria,
    };
  }

  // Cas 3 : Pas de référence concordante mais même numéro interne + montant exact + fenêtre courte + type compatible
  if (
    !smsRef &&
    !txOpRef &&
    amountMatch &&
    withinTimeWindow &&
    typeCompatible &&
    tx.internalNumberId &&
    sms.internalNumberId === tx.internalNumberId
  ) {
    return {
      compatible: true,
      status: 'rapprochee',
      confidenceScore: Math.max(70, confidenceScore),
      amountDifference,
      timeDeltaMs,
      matchedCriteria,
    };
  }

  // Cas 4 : Même numéro interne et référence SMS différente de la référence saisie
  if (
    smsRef &&
    txOpRef &&
    smsRef !== txOpRef &&
    amountMatch &&
    withinTimeWindow &&
    tx.internalNumberId &&
    sms.internalNumberId === tx.internalNumberId
  ) {
    return {
      compatible: true,
      status: 'reference_differente',
      confidenceScore: 55,
      amountDifference,
      timeDeltaMs,
      matchedCriteria,
    };
  }

  return {
    compatible: false,
    status: 'non_rapprochee',
    confidenceScore,
    amountDifference,
    timeDeltaMs,
    matchedCriteria,
  };
}

async function persistReconciliationRecord(rec: ReconciliationRecord): Promise<void> {
  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'reconciliationRecords', rec.id),
        sanitizeForFirestore({ ...rec, syncStatus: 'synced' })
      );
      rec.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('reconciliationRecord', rec.id, 'create');
    }
  } else {
    await enqueueFinancialSync('reconciliationRecord', rec.id, 'create');
  }
  await db.reconciliationRecords.put(rec);
}

/**
 * Tente de rapprocher automatiquement une transaction financière nouvellement déclarée
 * avec les SMS Mobile Money déjà captés localement.
 */
export async function reconcileTransactionWithSmsOperations(
  tx: FinancialTransaction,
  config: ReconciliationToleranceConfig = getFinancialThresholds()
): Promise<ReconciliationRecord | null> {
  if (tx.transactionType === 'change_devise' || tx.transactionType === 'commission_frais') {
    return null;
  }

  const normalizedTxRef = normalizeRef(tx.externalOperatorRef);
  if (normalizedTxRef) {
    const duplicateReconciledSms = await db.smsOperations
      .filter(
        (sms) =>
          sms.operator === tx.operator &&
          normalizeRef(sms.transactionReference) === normalizedTxRef &&
          Boolean(sms.reconciledOperationId) &&
          sms.reconciledOperationId !== tx.id
      )
      .first();

    const siblingDuplicateTx = await db.financialTransactions
      .filter(
        (other) =>
          other.id !== tx.id &&
          other.operator === tx.operator &&
          other.status !== 'rejetee' &&
          other.status !== 'contrepassee' &&
          normalizeRef(other.externalOperatorRef) === normalizedTxRef
      )
      .first();

    if (duplicateReconciledSms || siblingDuplicateTx) {
      const now = Date.now();
      const dupRecord: ReconciliationRecord = {
        id: `rec-dup-${tx.id}`,
        smsOperationId: duplicateReconciledSms?.id ?? null,
        financialTransactionId: tx.id,
        agentId: tx.agentId,
        agentName: tx.agentName,
        agencyId: tx.agencyId,
        operator: tx.operator,
        currency: tx.currency,
        smsAmount: duplicateReconciledSms?.amount ?? null,
        declaredAmount: tx.amount,
        amountDifference: duplicateReconciledSms?.amount
          ? roundCurrency(Math.abs(duplicateReconciledSms.amount - tx.amount))
          : 0,
        smsReference: duplicateReconciledSms?.transactionReference ?? tx.externalOperatorRef ?? null,
        declaredReference: tx.externalOperatorRef ?? tx.reference,
        timeDeltaMs: null,
        confidenceScore: 0,
        matchedCriteria: {
          referenceMatch: true,
          amountMatch: false,
          currencyMatch: true,
          typeCompatible: false,
          withinTimeWindow: false,
          operatorMatch: true,
          agentOrNumberMatch: false,
        },
        status: 'reference_dupliquee',
        reviewerUid: null,
        reviewerName: null,
        resolutionNote: duplicateReconciledSms
          ? `Référence ${tx.externalOperatorRef} déjà rapprochée avec l'opération ${duplicateReconciledSms.reconciledOperationId}.`
          : `Référence ${tx.externalOperatorRef} déjà déclarée sur la transaction ${siblingDuplicateTx?.reference}.`,
        resolvedAt: null,
        syncStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await persistReconciliationRecord(dupRecord);
      await db.financialTransactions.put({
        ...tx,
        reconciliationStatus: 'reference_dupliquee',
        updatedAt: now,
      });
      await raiseFinancialAnomaly({
        dedupKey: `ref_dup:${tx.operator}:${normalizedTxRef}`,
        anomalyType: 'reference_dupliquee',
        severity: 'elevee',
        agentId: tx.agentId,
        agentName: tx.agentName,
        agencyId: tx.agencyId,
        agencyName: tx.agencyName,
        currency: tx.currency,
        expectedAmount: duplicateReconciledSms?.amount ?? siblingDuplicateTx?.amount ?? null,
        observedAmount: tx.amount,
        linkedTransactionId: tx.id,
        linkedSmsOperationId: duplicateReconciledSms?.id ?? null,
        title: `Référence opérateur dupliquée (${tx.externalOperatorRef})`,
        description: dupRecord.resolutionNote || 'Référence opérateur déjà utilisée.',
      });
      return dupRecord;
    }
  }

  const candidates = await db.smsOperations
    .filter(
      (sms) =>
        (!sms.reconciledOperationId || sms.reconciledOperationId === tx.id) &&
        sms.operator === tx.operator
    )
    .toArray();

  const evaluated = candidates
    .map((sms) => ({ sms, evalRes: evaluateSmsTransactionMatch(sms, tx, config) }))
    .filter((item) => item.evalRes.compatible)
    .sort((a, b) => b.evalRes.confidenceScore - a.evalRes.confidenceScore);

  if (evaluated.length === 0) {
    // Si aucune correspondance immédiate et la transaction dépasse la fenêtre -> signaler declaration_sans_sms
    const ageMs = Date.now() - tx.deviceTimestamp;
    if (ageMs > config.timeWindowMinutes * 60 * 1000 && tx.operator !== 'caisse_interne') {
      await db.financialTransactions.put({
        ...tx,
        reconciliationStatus: 'declaration_sans_sms',
        updatedAt: Date.now(),
      });
      await raiseFinancialAnomaly({
        dedupKey: `declaration_sans_sms:${tx.id}`,
        anomalyType: 'declaration_sans_sms',
        severity: 'moyenne',
        agentId: tx.agentId,
        agentName: tx.agentName,
        agencyId: tx.agencyId,
        agencyName: tx.agencyName,
        currency: tx.currency,
        expectedAmount: tx.amount,
        linkedTransactionId: tx.id,
        title: `Déclaration sans SMS opérateur (${tx.reference})`,
        description: `La transaction ${tx.reference} (${tx.amount} ${tx.currency} sur ${tx.operator}) ne correspond à aucun SMS Mobile Money capté dans la fenêtre de ${config.timeWindowMinutes} min.`,
      });
    }
    return null;
  }

  const best = evaluated[0];
  const isAmbiguousDuplicate =
    evaluated.length > 1 &&
    Math.abs(evaluated[0].evalRes.confidenceScore - evaluated[1].evalRes.confidenceScore) < 10 &&
    !best.evalRes.matchedCriteria.referenceMatch;

  const finalStatus: ReconciliationStatus = isAmbiguousDuplicate
    ? 'doublon_potentiel'
    : best.evalRes.status;

  const now = Date.now();
  const record: ReconciliationRecord = {
    id: `rec-${tx.id}-${best.sms.id}`,
    smsOperationId: best.sms.id,
    financialTransactionId: tx.id,
    agentId: tx.agentId,
    agentName: tx.agentName,
    agencyId: tx.agencyId,
    operator: tx.operator,
    currency: tx.currency,
    smsAmount: best.sms.amount ?? null,
    declaredAmount: tx.amount,
    amountDifference: best.evalRes.amountDifference,
    smsReference: best.sms.transactionReference ?? null,
    declaredReference: tx.externalOperatorRef ?? tx.reference,
    timeDeltaMs: best.evalRes.timeDeltaMs,
    confidenceScore: best.evalRes.confidenceScore,
    matchedCriteria: best.evalRes.matchedCriteria,
    status: finalStatus,
    reviewerUid: null,
    reviewerName: null,
    resolutionNote: isAmbiguousDuplicate
      ? `Plusieurs SMS similaires détectés (${evaluated.length}). Vérification humaine requise.`
      : null,
    resolvedAt: finalStatus === 'rapprochee' ? now : null,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await persistReconciliationRecord(record);

  await db.financialTransactions.put({
    ...tx,
    reconciliationStatus: finalStatus,
    linkedSmsOperationId: finalStatus === 'rapprochee' ? best.sms.id : tx.linkedSmsOperationId,
    reconciledAt: finalStatus === 'rapprochee' ? now : tx.reconciledAt,
    updatedAt: now,
  });

  if (finalStatus === 'rapprochee') {
    await db.smsOperations.put({
      ...best.sms,
      status: 'matched',
      reconciliationStatus: 'matched',
      reconciledOperationId: tx.id,
      reconciledAt: now,
      updatedAt: now,
    });
  } else if (finalStatus === 'montant_different') {
    await db.smsOperations.put({
      ...best.sms,
      status: 'flagged',
      reconciliationStatus: 'discrepancy',
      discrepancyReason: `Écart montant avec ${tx.reference} (${best.sms.amount} vs ${tx.amount})`,
      updatedAt: now,
    });
    await raiseFinancialAnomaly({
      dedupKey: `ecart_montant_sms:${tx.id}:${best.sms.id}`,
      anomalyType: 'ecart_montant_sms',
      severity: 'elevee',
      agentId: tx.agentId,
      agentName: tx.agentName,
      agencyId: tx.agencyId,
      agencyName: tx.agencyName,
      currency: tx.currency,
      expectedAmount: best.sms.amount ?? null,
      observedAmount: tx.amount,
      discrepancyAmount: best.evalRes.amountDifference,
      linkedTransactionId: tx.id,
      linkedSmsOperationId: best.sms.id,
      title: `Écart montant SMS ↔ Déclaration (${tx.reference})`,
      description: `SMS ${best.sms.transactionReference || best.sms.id} indique ${best.sms.amount} ${best.sms.currency || tx.currency}, alors que l'agent a déclaré ${tx.amount} ${tx.currency}.`,
    });
  } else if (finalStatus === 'doublon_potentiel' || finalStatus === 'reference_differente') {
    await raiseFinancialAnomaly({
      dedupKey: `doublon_suspect:${tx.id}:${best.sms.id}`,
      anomalyType: 'doublon_suspect',
      severity: 'moyenne',
      agentId: tx.agentId,
      agentName: tx.agentName,
      agencyId: tx.agencyId,
      agencyName: tx.agencyName,
      currency: tx.currency,
      expectedAmount: best.sms.amount ?? null,
      observedAmount: tx.amount,
      linkedTransactionId: tx.id,
      linkedSmsOperationId: best.sms.id,
      title: `Correspondance SMS ambiguë à vérifier (${tx.reference})`,
      description:
        record.resolutionNote ||
        `Conflit ou ambiguïté détecté entre la déclaration ${tx.reference} et le SMS ${best.sms.transactionReference || best.sms.id}.`,
    });
  }

  return record;
}

/**
 * Appelé automatiquement lorsqu'un SMS Mobile Money est capturé par SmsListenerService.
 * Important : un SMS seul ne modifie JAMAIS les soldes agentFundStocks — il rapproche ou signale une anomalie.
 */
export async function reconcileSmsOperationWithTransactions(
  sms: LocalSmsOperation,
  config: ReconciliationToleranceConfig = getFinancialThresholds()
): Promise<ReconciliationRecord | null> {
  if (sms.reconciledOperationId) {
    return null;
  }

  const candidateTxs = await db.financialTransactions
    .filter(
      (tx) =>
        tx.operator === sms.operator &&
        tx.status !== 'rejetee' &&
        tx.status !== 'contrepassee' &&
        (!tx.linkedSmsOperationId || tx.reconciliationStatus !== 'rapprochee')
    )
    .toArray();

  const evaluated = candidateTxs
    .map((tx) => ({ tx, evalRes: evaluateSmsTransactionMatch(sms, tx, config) }))
    .filter((item) => item.evalRes.compatible)
    .sort((a, b) => b.evalRes.confidenceScore - a.evalRes.confidenceScore);

  if (evaluated.length > 0) {
    return reconcileTransactionWithSmsOperations(evaluated[0].tx, config);
  }

  // Vérifier si ce SMS est associé à un numéro interne reconnu
  const internalNum = sms.internalNumberId
    ? await db.internalNumbers.get(sms.internalNumberId)
    : undefined;
  const agentId = internalNum?.assignedUserId ?? null;
  const agentName = internalNum?.assignedUserName ?? null;
  const smsCurrency: CurrencyCode | null =
    sms.currency === 'USD' || sms.currency === 'CDF' ? sms.currency : null;

  // Créer un enregistrement de rapprochement "non_declaree" + anomalie active (sans modifier le stock !)
  const now = Date.now();
  const unmatchedRec: ReconciliationRecord = {
    id: `rec-sms-${sms.id}`,
    smsOperationId: sms.id,
    financialTransactionId: null,
    agentId,
    agentName,
    agencyId: sms.agencyId ?? internalNum?.agencyId ?? null,
    operator: sms.operator,
    currency: smsCurrency,
    smsAmount: sms.amount ?? null,
    declaredAmount: null,
    amountDifference: sms.amount ?? null,
    smsReference: sms.transactionReference ?? null,
    declaredReference: null,
    timeDeltaMs: null,
    confidenceScore: 0,
    matchedCriteria: {
      referenceMatch: false,
      amountMatch: false,
      currencyMatch: false,
      typeCompatible: false,
      withinTimeWindow: false,
      operatorMatch: true,
      agentOrNumberMatch: Boolean(internalNum),
    },
    status: 'non_declaree',
    reviewerUid: null,
    reviewerName: null,
    resolutionNote: internalNum
      ? 'SMS capté sur numéro interne sans déclaration agent correspondante.'
      : 'SMS capté sur numéro non encore rattaché ou sans déclaration agent.',
    resolvedAt: null,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await persistReconciliationRecord(unmatchedRec);

  await raiseFinancialAnomaly({
    dedupKey: `sms_sans_declaration:${sms.id}`,
    anomalyType: 'sms_sans_declaration',
    severity: (sms.amount ?? 0) > 0 ? 'elevee' : 'moyenne',
    agentId,
    agentName,
    agencyId: sms.agencyId ?? internalNum?.agencyId ?? null,
    currency: smsCurrency,
    expectedAmount: sms.amount ?? null,
    observedAmount: null,
    discrepancyAmount: sms.amount ?? null,
    linkedSmsOperationId: sms.id,
    title: `SMS opérateur sans déclaration (${sms.operator.toUpperCase()})`,
    description: `Un SMS ${sms.operator.toUpperCase()} (${sms.amount ?? '?'} ${sms.currency || ''}, réf ${sms.transactionReference || 'N/A'}) n'est rattaché à aucune transaction déclarée.`,
  });

  return unmatchedRec;
}

export async function scanAndReconcileAll(
  agencyId?: string | null
): Promise<{ matched: number; anomaliesCreated: number }> {
  const config = getFinancialThresholds();
  const txs = await db.financialTransactions.toArray();
  let matched = 0;

  for (const tx of txs) {
    if (agencyId && tx.agencyId !== agencyId) continue;
    if (tx.reconciliationStatus === 'rapprochee' || tx.reconciliationStatus === 'validee_manuellement') {
      continue;
    }
    const rec = await reconcileTransactionWithSmsOperations(tx, config);
    if (rec && rec.status === 'rapprochee') {
      matched += 1;
    }
  }

  const smsList = await db.smsOperations.toArray();
  let anomaliesCreated = 0;
  for (const sms of smsList) {
    if (agencyId && sms.agencyId !== agencyId) continue;
    if (sms.reconciledOperationId) continue;
    const rec = await reconcileSmsOperationWithTransactions(sms, config);
    if (rec?.status === 'rapprochee') {
      matched += 1;
    } else if (rec?.status === 'non_declaree') {
      anomaliesCreated += 1;
    }
  }

  return { matched, anomaliesCreated };
}

export async function resolveReconciliationManually(params: {
  recordId: string;
  resolutionNote: string;
  supervisor: AppUser;
}): Promise<ReconciliationRecord> {
  const rec = await db.reconciliationRecords.get(params.recordId);
  if (!rec) throw new Error('Enregistrement de rapprochement introuvable.');
  if (
    !isGlobalFinancialSupervisor(params.supervisor) &&
    !(
      params.supervisor.role === 'administrateur_agence' &&
      params.supervisor.agencyId === rec.agencyId &&
      params.supervisor.uid !== rec.agentId
    )
  ) {
    throw new Error('Seul un superviseur autorisé peut valider manuellement un rapprochement.');
  }

  const now = Date.now();
  const updated: ReconciliationRecord = {
    ...rec,
    status: 'validee_manuellement',
    reviewerUid: params.supervisor.uid,
    reviewerName: params.supervisor.displayName,
    resolutionNote: params.resolutionNote.trim() || 'Validée manuellement après contrôle',
    resolvedAt: now,
    syncStatus: 'pending',
    updatedAt: now,
  };

  await persistReconciliationRecord(updated);

  if (updated.financialTransactionId) {
    const tx = await db.financialTransactions.get(updated.financialTransactionId);
    if (tx) {
      await db.financialTransactions.put({
        ...tx,
        reconciliationStatus: 'validee_manuellement',
        linkedSmsOperationId: updated.smsOperationId ?? tx.linkedSmsOperationId,
        reconciledAt: now,
        reconciledBy: params.supervisor.uid,
        updatedAt: now,
      });
    }
  }

  if (updated.smsOperationId) {
    const sms = await db.smsOperations.get(updated.smsOperationId);
    if (sms) {
      await db.smsOperations.put({
        ...sms,
        status: 'validated',
        reconciliationStatus: 'validated',
        reconciledOperationId: updated.financialTransactionId ?? sms.reconciledOperationId,
        reconciledBy: params.supervisor.uid,
        reconciledAt: now,
        updatedAt: now,
      });
    }
  }

  return updated;
}
