import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore as firestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type { AppUser } from '../types/auth';
import {
  ANOMALY_WARNING_DISCLAIMER,
  type CurrencyCode,
  type FinancialAnomaly,
  type FinancialAnomalyStatus,
  type FinancialAnomalyType,
} from '../types/financialSupervision';
import { recordAuditLog } from './AuditService';
import {
  buildFinancialReference,
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

/**
 * Crée ou met à jour une anomalie financière avec déduplication stricte par dedupKey.
 * Ne supprime jamais aucune anomalie.
 */
export async function raiseFinancialAnomaly(params: {
  dedupKey: string;
  anomalyType: FinancialAnomalyType;
  severity: FinancialAnomaly['severity'];
  agentId?: string | null;
  agentName?: string | null;
  agencyId: string | null;
  agencyName?: string | null;
  currency?: CurrencyCode | null;
  expectedAmount?: number | null;
  observedAmount?: number | null;
  discrepancyAmount?: number | null;
  linkedTransactionId?: string | null;
  linkedSmsOperationId?: string | null;
  linkedInventoryId?: string | null;
  linkedLedgerEntryId?: string | null;
  title: string;
  description: string;
}): Promise<FinancialAnomaly> {
  const existing = await db.financialAnomalies
    .where('dedupKey')
    .equals(params.dedupKey)
    .first();

  if (existing && existing.status !== 'cloturee') {
    return existing;
  }

  const now = Date.now();
  const anomaly: FinancialAnomaly = {
    id: `ano-${now}-${Math.random().toString(36).slice(2, 8)}`,
    reference: buildFinancialReference('ANO'),
    dedupKey: params.dedupKey,
    anomalyType: params.anomalyType,
    severity: params.severity,
    status: 'nouvelle',
    warningDisclaimer: ANOMALY_WARNING_DISCLAIMER,
    agentId: params.agentId ?? null,
    agentName: params.agentName ?? null,
    agencyId: params.agencyId ?? null,
    agencyName: params.agencyName ?? null,
    currency: params.currency ?? null,
    expectedAmount:
      params.expectedAmount !== undefined && params.expectedAmount !== null
        ? roundCurrency(params.expectedAmount)
        : null,
    observedAmount:
      params.observedAmount !== undefined && params.observedAmount !== null
        ? roundCurrency(params.observedAmount)
        : null,
    discrepancyAmount:
      params.discrepancyAmount !== undefined && params.discrepancyAmount !== null
        ? roundCurrency(params.discrepancyAmount)
        : null,
    linkedTransactionId: params.linkedTransactionId ?? null,
    linkedSmsOperationId: params.linkedSmsOperationId ?? null,
    linkedInventoryId: params.linkedInventoryId ?? null,
    linkedLedgerEntryId: params.linkedLedgerEntryId ?? null,
    title: params.title,
    description: params.description,
    agentJustification: null,
    justifiedAt: null,
    supervisorDecisionNote: null,
    handledByUid: null,
    handledByName: null,
    handledAt: null,
    history: [
      {
        id: `evt-${now}`,
        action: 'Anomalie détectée',
        actorUid: params.agentId || 'system',
        actorName: 'Moteur de supervision financière',
        actorRole: 'system',
        note: params.title,
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
        doc(firestoreDb, 'financialAnomalies', anomaly.id),
        sanitizeForFirestore({ ...anomaly, syncStatus: 'synced' })
      );
      anomaly.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('financialAnomaly', anomaly.id, 'create');
    }
  } else {
    await enqueueFinancialSync('financialAnomaly', anomaly.id, 'create');
  }

  await db.financialAnomalies.put(anomaly);
  return anomaly;
}

export async function requestAnomalyJustification(params: {
  anomalyId: string;
  note: string;
  supervisor: AppUser;
}): Promise<FinancialAnomaly> {
  const anomaly = await db.financialAnomalies.get(params.anomalyId);
  if (!anomaly) throw new Error('Anomalie introuvable.');
  if (
    !isGlobalFinancialSupervisor(params.supervisor) &&
    !(
      params.supervisor.role === 'administrateur_agence' &&
      params.supervisor.agencyId === anomaly.agencyId
    )
  ) {
    throw new Error("Accès refusé pour demander une justification sur cette anomalie.");
  }

  const now = Date.now();
  const updated: FinancialAnomaly = {
    ...anomaly,
    status: 'justification_demandee',
    supervisorDecisionNote: params.note.trim() || anomaly.supervisorDecisionNote,
    handledByUid: params.supervisor.uid,
    handledByName: params.supervisor.displayName,
    handledAt: now,
    history: [
      ...anomaly.history,
      {
        id: `evt-${now}`,
        action: 'Justification demandée à l’agent',
        actorUid: params.supervisor.uid,
        actorName: params.supervisor.displayName,
        actorRole: params.supervisor.role,
        note: params.note.trim() || 'Explication contradictoire requise',
        timestamp: now,
      },
    ],
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'financialAnomalies', updated.id),
        sanitizeForFirestore({ ...updated, syncStatus: 'synced' })
      );
      updated.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('financialAnomaly', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('financialAnomaly', updated.id, 'update');
  }

  await db.financialAnomalies.put(updated);
  return updated;
}

export async function submitAnomalyJustification(params: {
  anomalyId: string;
  justification: string;
  agent: AppUser;
}): Promise<FinancialAnomaly> {
  const anomaly = await db.financialAnomalies.get(params.anomalyId);
  if (!anomaly) throw new Error('Anomalie introuvable.');
  if (anomaly.agentId && anomaly.agentId !== params.agent.uid && !isGlobalFinancialSupervisor(params.agent)) {
    throw new Error("Vous ne pouvez justifier que vos propres signalements.");
  }
  if (!params.justification.trim()) {
    throw new Error('Veuillez saisir une explication détaillée.');
  }

  const now = Date.now();
  const updated: FinancialAnomaly = {
    ...anomaly,
    status: 'justifiee',
    agentJustification: params.justification.trim(),
    justifiedAt: now,
    history: [
      ...anomaly.history,
      {
        id: `evt-${now}`,
        action: 'Justification soumise par l’agent',
        actorUid: params.agent.uid,
        actorName: params.agent.displayName,
        actorRole: params.agent.role,
        note: params.justification.trim(),
        timestamp: now,
      },
    ],
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'financialAnomalies', updated.id),
        sanitizeForFirestore({ ...updated, syncStatus: 'synced' })
      );
      updated.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('financialAnomaly', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('financialAnomaly', updated.id, 'update');
  }

  await db.financialAnomalies.put(updated);
  await recordAuditLog({
    action: 'Justification anomalie financière soumise',
    category: 'finance',
    severity: 'info',
    details: `${anomaly.reference} justifiée par ${params.agent.displayName}.`,
    actorName: params.agent.displayName,
    actorRole: params.agent.role,
    actorUid: params.agent.uid,
  });
  return updated;
}

export async function resolveFinancialAnomaly(params: {
  anomalyId: string;
  newStatus: Extract<FinancialAnomalyStatus, 'en_cours_examen' | 'confirmee' | 'cloturee'>;
  supervisorNote: string;
  supervisor: AppUser;
}): Promise<FinancialAnomaly> {
  const anomaly = await db.financialAnomalies.get(params.anomalyId);
  if (!anomaly) throw new Error('Anomalie introuvable.');
  if (
    !isGlobalFinancialSupervisor(params.supervisor) &&
    !(
      params.supervisor.role === 'administrateur_agence' &&
      params.supervisor.agencyId === anomaly.agencyId &&
      params.supervisor.uid !== anomaly.agentId
    )
  ) {
    throw new Error('Seul un superviseur autorisé peut statuer sur une anomalie.');
  }

  const now = Date.now();
  const updated: FinancialAnomaly = {
    ...anomaly,
    status: params.newStatus,
    supervisorDecisionNote: params.supervisorNote.trim() || anomaly.supervisorDecisionNote,
    handledByUid: params.supervisor.uid,
    handledByName: params.supervisor.displayName,
    handledAt: now,
    history: [
      ...anomaly.history,
      {
        id: `evt-${now}`,
        action: `Statut mis à jour : ${params.newStatus}`,
        actorUid: params.supervisor.uid,
        actorName: params.supervisor.displayName,
        actorRole: params.supervisor.role,
        note: params.supervisorNote.trim(),
        timestamp: now,
      },
    ],
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (isOnline()) {
    try {
      await setDoc(
        doc(firestoreDb, 'financialAnomalies', updated.id),
        sanitizeForFirestore({ ...updated, syncStatus: 'synced' })
      );
      updated.syncStatus = 'synced';
    } catch {
      await enqueueFinancialSync('financialAnomaly', updated.id, 'update');
    }
  } else {
    await enqueueFinancialSync('financialAnomaly', updated.id, 'update');
  }

  await db.financialAnomalies.put(updated);
  await recordAuditLog({
    action: 'Décision supervision anomalie financière',
    category: 'finance',
    severity: params.newStatus === 'confirmee' ? 'warning' : 'info',
    details: `${anomaly.reference} -> ${params.newStatus} (${params.supervisorNote}).`,
    actorName: params.supervisor.displayName,
    actorRole: params.supervisor.role,
    actorUid: params.supervisor.uid,
  });

  return updated;
}

/**
 * Contrôle proactif :
 * - Synchronisations tardives (> 12h non confirmées)
 * - Incohérences d'invariant sur les stocks
 * - Références opérateur dupliquées sur des transactions distinctes
 */
export async function runProactiveAnomalySweep(scopeAgencyId?: string | null): Promise<FinancialAnomaly[]> {
  const created: FinancialAnomaly[] = [];
  const now = Date.now();
  const lateSyncThresholdMs = 12 * 3600 * 1000;
  const thresholds = getFinancialThresholds();

  const stocks = await db.agentFundStocks.toArray();
  for (const stock of stocks) {
    if (scopeAgencyId && stock.agencyId !== scopeAgencyId) continue;
    if (Math.abs(stock.invariantResidual) > 0.05) {
      created.push(
        await raiseFinancialAnomaly({
          dedupKey: `solde_incoherent:${stock.id}:${Math.round(stock.invariantResidual * 100)}`,
          anomalyType: 'solde_incoherent',
          severity: 'critique',
          agentId: stock.agentId,
          agentName: stock.agentName,
          agencyId: stock.agencyId,
          agencyName: stock.agencyName,
          currency: stock.currency,
          discrepancyAmount: stock.invariantResidual,
          title: `Écart d'invariant comptable détecté (${stock.currency})`,
          description: `Le stock de ${stock.agentName} présente un résidu comptable de ${stock.invariantResidual} ${stock.currency}. Vérification immédiate du journal requise.`,
        })
      );
    }
    const maxCash =
      stock.currency === 'USD'
        ? thresholds.cashHighThresholdUsd
        : thresholds.cashHighThresholdCdf;
    if (stock.physicalCashAvailable > maxCash * 1.5) {
      created.push(
        await raiseFinancialAnomaly({
          dedupKey: `high_cash:${stock.id}:${new Date().toISOString().slice(0, 10)}`,
          anomalyType: 'activite_inhabituelle',
          severity: 'moyenne',
          agentId: stock.agentId,
          agentName: stock.agentName,
          agencyId: stock.agencyId,
          agencyName: stock.agencyName,
          currency: stock.currency,
          expectedAmount: maxCash,
          observedAmount: stock.physicalCashAvailable,
          discrepancyAmount: roundCurrency(stock.physicalCashAvailable - maxCash),
          title: `Cash physique élevé en guichet (${stock.currency})`,
          description: `Le cash détenu par ${stock.agentName} dépasse fortement le seuil de sécurité (${stock.physicalCashAvailable} ${stock.currency}). Une remise vers la direction est recommandée.`,
        })
      );
    }
  }

  const txs = await db.financialTransactions.toArray();
  const refMap = new Map<string, string[]>();
  for (const tx of txs) {
    if (scopeAgencyId && tx.agencyId !== scopeAgencyId) continue;
    if (tx.status === 'contrepassee' || tx.status === 'rejetee') continue;

    if (
      tx.syncLifecycle === 'en_attente_synchro' &&
      now - tx.deviceTimestamp > lateSyncThresholdMs
    ) {
      created.push(
        await raiseFinancialAnomaly({
          dedupKey: `synchro_tardive:${tx.id}`,
          anomalyType: 'synchro_tardive',
          severity: 'moyenne',
          agentId: tx.agentId,
          agentName: tx.agentName,
          agencyId: tx.agencyId,
          agencyName: tx.agencyName,
          currency: tx.currency,
          observedAmount: tx.amount,
          linkedTransactionId: tx.id,
          title: `Synchronisation tardive : ${tx.reference}`,
          description: `Transaction saisie hors ligne depuis plus de 12h sans confirmation serveur.`,
        })
      );
    }

    if (tx.externalOperatorRef && tx.externalOperatorRef.trim().length >= 4) {
      const key = `${tx.operator}:${tx.externalOperatorRef.trim().toUpperCase()}`;
      const list = refMap.get(key) || [];
      list.push(tx.id);
      refMap.set(key, list);
      if (list.length > 1) {
        created.push(
          await raiseFinancialAnomaly({
            dedupKey: `ref_dup:${key}`,
            anomalyType: 'reference_dupliquee',
            severity: 'elevee',
            agentId: tx.agentId,
            agentName: tx.agentName,
            agencyId: tx.agencyId,
            agencyName: tx.agencyName,
            currency: tx.currency,
            observedAmount: tx.amount,
            linkedTransactionId: tx.id,
            title: `Référence opérateur dupliquée (${tx.externalOperatorRef})`,
            description: `La référence opérateur ${tx.externalOperatorRef} apparaît sur ${list.length} déclarations distinctes.`,
          })
        );
      }
    }
  }

  return created;
}
