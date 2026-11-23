import { db } from '../lib/db';
import type { AppUser } from '../types/auth';
import {
  DEFAULT_FINANCIAL_THRESHOLDS,
  INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE,
  type AgentFundStock,
  type CurrencyCode,
  type FinancialLedgerEntry,
  type ReconciliationToleranceConfig,
  type SyncLifecycleState,
} from '../types/financialSupervision';

const FINANCIAL_THRESHOLDS_KEY = 'ets_amani_financial_thresholds';

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (currency === 'USD') {
    return `${safe.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} $`;
  }
  return `${Math.round(safe).toLocaleString('fr-FR')} FC`;
}

export function buildStockId(agentId: string, currency: CurrencyCode): string {
  return `${agentId}_${currency}`;
}

export function buildFinancialReference(prefix: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export function buildIdempotencyKey(scope: string, seed?: string): string {
  const unique =
    seed ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return `${scope}:${unique}`;
}

/**
 * Supprime récursivement les champs undefined avant écriture Firestore
 * tout en préservant les sentinelles FieldValue, Date, tableaux et valeurs nulles.
 */
export function sanitizeForFirestore<T>(input: T): T {
  if (input === null || input === undefined) {
    return null as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForFirestore(item)) as T;
  }
  if (typeof input === 'object') {
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) {
      return input;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned as T;
  }
  return input;
}

export function getFinancialThresholds(): ReconciliationToleranceConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FINANCIAL_THRESHOLDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ReconciliationToleranceConfig>;
        return { ...DEFAULT_FINANCIAL_THRESHOLDS, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_FINANCIAL_THRESHOLDS };
}

export function saveFinancialThresholds(
  config: Partial<ReconciliationToleranceConfig>
): ReconciliationToleranceConfig {
  const merged = { ...getFinancialThresholds(), ...config };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FINANCIAL_THRESHOLDS_KEY, JSON.stringify(merged));
    }
  } catch {
    // ignore
  }
  return merged;
}

export function isGlobalFinancialSupervisor(user: Pick<AppUser, 'role'> | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'directeur_general' || user.role === 'administrateur_systeme';
}

export function canAccessFinancialSupervision(user: Pick<AppUser, 'role'> | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === 'directeur_general' ||
    user.role === 'administrateur_systeme' ||
    user.role === 'administrateur_agence' ||
    user.role === 'agent'
  );
}

export function isConfirmedLifecycle(
  syncLifecycle: SyncLifecycleState,
  syncStatus?: FinancialLedgerEntry['syncStatus']
): boolean {
  return (
    syncLifecycle === 'confirmee_serveur' ||
    syncLifecycle === 'synchronisee' ||
    syncStatus === 'synced'
  );
}

/**
 * Projection comptable pure et déterministe pour un couple (agentId, currency).
 * Garantit l'invariant comptable :
 *   physicalCashAvailable + virtualCreditAvailable
 *   == netAttributedCapital + totalFeesCollected + totalFxNet + totalInventoryAdjustments
 * (hors écritures rejetées ou en conflit bloqué).
 */
export function recalculateAgentStockFromLedger(params: {
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  currency: CurrencyCode;
  entries: FinancialLedgerEntry[];
  existingStock?: Partial<AgentFundStock> | null;
}): AgentFundStock {
  const {
    agentId,
    agentName,
    agencyId,
    agencyName,
    currency,
    entries,
    existingStock,
  } = params;

  const thresholds = getFinancialThresholds();
  const now = Date.now();

  const sortedEntries = [...entries]
    .filter((e) => e.agentId === agentId && e.currency === currency)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  let physicalCashConfirmed = 0;
  let virtualCreditConfirmed = 0;
  let physicalCashPendingDelta = 0;
  let virtualCreditPendingDelta = 0;

  let totalInitialEndowment = 0;
  let totalCreditsAllocated = 0;
  let totalCreditsConsumed = 0;
  let totalDepositsCollected = 0;
  let totalWithdrawalsPaid = 0;
  let totalCashReceived = 0;
  let totalCashHandedOver = 0;
  let totalFeesCollected = 0;
  let totalCommissionsEarned = 0;
  let totalFxNet = 0;
  let totalInventoryAdjustments = 0;
  let netAttributedCapital = 0;

  let lastLedgerEntryId: string | null = existingStock?.lastLedgerEntryId ?? null;
  let lastSyncedAt: number | null = existingStock?.lastSyncedAt ?? null;
  let hasConflict = false;

  for (const entry of sortedEntries) {
    if (entry.syncLifecycle === 'rejetee') {
      continue;
    }
    if (entry.syncLifecycle === 'en_conflit' || entry.syncStatus === 'conflict') {
      hasConflict = true;
      continue;
    }

    const confirmed = isConfirmedLifecycle(entry.syncLifecycle, entry.syncStatus);
    if (confirmed) {
      physicalCashConfirmed = roundCurrency(physicalCashConfirmed + entry.physicalCashDelta);
      virtualCreditConfirmed = roundCurrency(virtualCreditConfirmed + entry.virtualCreditDelta);
      if (entry.serverConfirmedAt && (!lastSyncedAt || entry.serverConfirmedAt > lastSyncedAt)) {
        lastSyncedAt = entry.serverConfirmedAt;
      }
    } else {
      physicalCashPendingDelta = roundCurrency(physicalCashPendingDelta + entry.physicalCashDelta);
      virtualCreditPendingDelta = roundCurrency(
        virtualCreditPendingDelta + entry.virtualCreditDelta
      );
    }

    netAttributedCapital = roundCurrency(netAttributedCapital + (entry.capitalDelta || 0));
    totalFeesCollected = roundCurrency(totalFeesCollected + (entry.feeDelta || 0));
    totalCommissionsEarned = roundCurrency(
      totalCommissionsEarned + (entry.commissionAmount || 0)
    );
    totalFxNet = roundCurrency(totalFxNet + (entry.fxNetDelta || 0));
    totalInventoryAdjustments = roundCurrency(
      totalInventoryAdjustments + (entry.adjustmentDelta || 0)
    );

    switch (entry.operationCategory) {
      case 'dotation_initiale':
        totalInitialEndowment = roundCurrency(
          totalInitialEndowment + entry.physicalCashDelta + entry.virtualCreditDelta
        );
        break;
      case 'attribution_credit_virtuel':
        totalCreditsAllocated = roundCurrency(totalCreditsAllocated + entry.virtualCreditDelta);
        break;
      case 'reception_cash':
        totalCashReceived = roundCurrency(totalCashReceived + entry.physicalCashDelta);
        break;
      case 'remise_cash':
        totalCashHandedOver = roundCurrency(totalCashHandedOver + Math.abs(entry.physicalCashDelta));
        break;
      case 'depot_client':
      case 'depot_abonne':
        totalDepositsCollected = roundCurrency(
          totalDepositsCollected + Math.max(0, entry.physicalCashDelta - (entry.feeDelta || 0))
        );
        totalCreditsConsumed = roundCurrency(
          totalCreditsConsumed + Math.max(0, -entry.virtualCreditDelta)
        );
        break;
      case 'transaction_virtuelle':
        totalCreditsConsumed = roundCurrency(
          totalCreditsConsumed + Math.max(0, -entry.virtualCreditDelta)
        );
        break;
      case 'retrait_client':
      case 'retrait_abonne':
        totalWithdrawalsPaid = roundCurrency(
          totalWithdrawalsPaid + Math.max(0, -entry.physicalCashDelta)
        );
        break;
      default:
        break;
    }

    lastLedgerEntryId = entry.id;
  }

  const physicalCashAvailable = roundCurrency(physicalCashConfirmed + physicalCashPendingDelta);
  const virtualCreditAvailable = roundCurrency(
    virtualCreditConfirmed + virtualCreditPendingDelta
  );

  const expectedTotal = roundCurrency(
    netAttributedCapital + totalFeesCollected + totalFxNet + totalInventoryAdjustments
  );
  const observedTotal = roundCurrency(physicalCashAvailable + virtualCreditAvailable);
  const invariantResidual = roundCurrency(observedTotal - expectedTotal);

  const defaultCreditLow =
    currency === 'USD'
      ? thresholds.creditLowThresholdUsd
      : thresholds.creditLowThresholdCdf;
  const defaultCashHigh =
    currency === 'USD'
      ? thresholds.cashHighThresholdUsd
      : thresholds.cashHighThresholdCdf;

  return {
    id: buildStockId(agentId, currency),
    agentId,
    agentName: existingStock?.agentName || agentName,
    agencyId: agencyId ?? existingStock?.agencyId ?? null,
    agencyName: agencyName || existingStock?.agencyName || 'Agence',
    currency,
    physicalCashConfirmed,
    virtualCreditConfirmed,
    physicalCashPendingDelta,
    virtualCreditPendingDelta,
    physicalCashAvailable,
    virtualCreditAvailable,
    totalInitialEndowment,
    totalCreditsAllocated,
    totalCreditsConsumed,
    totalDepositsCollected,
    totalWithdrawalsPaid,
    totalCashReceived,
    totalCashHandedOver,
    totalFeesCollected,
    totalCommissionsEarned,
    totalFxNet,
    totalInventoryAdjustments,
    netAttributedCapital,
    invariantResidual,
    creditLowThreshold: existingStock?.creditLowThreshold ?? defaultCreditLow,
    cashHighThreshold: existingStock?.cashHighThreshold ?? defaultCashHigh,
    status: existingStock?.status ?? 'active',
    lastLedgerEntryId,
    lastSyncedAt,
    recalculatedAt: now,
    syncStatus: hasConflict
      ? 'conflict'
      : physicalCashPendingDelta !== 0 || virtualCreditPendingDelta !== 0
        ? 'pending'
        : existingStock?.syncStatus ?? 'synced',
    createdAt: existingStock?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function reconcileAndPersistAgentStock(params: {
  agentId: string;
  agentName?: string;
  agencyId?: string | null;
  agencyName?: string;
  currency: CurrencyCode;
}): Promise<AgentFundStock> {
  const stockId = buildStockId(params.agentId, params.currency);
  const existing = await db.agentFundStocks.get(stockId);
  const entries = await db.financialLedger
    .where('agentId')
    .equals(params.agentId)
    .filter((entry) => entry.currency === params.currency)
    .toArray();

  const recalculated = recalculateAgentStockFromLedger({
    agentId: params.agentId,
    agentName: params.agentName || existing?.agentName || 'Agent',
    agencyId: params.agencyId !== undefined ? params.agencyId : existing?.agencyId ?? null,
    agencyName: params.agencyName || existing?.agencyName || 'Agence',
    currency: params.currency,
    entries,
    existingStock: existing,
  });

  await db.agentFundStocks.put(recalculated);
  return recalculated;
}

export async function getOrCreateLocalAgentStock(params: {
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  currency: CurrencyCode;
}): Promise<AgentFundStock> {
  const stockId = buildStockId(params.agentId, params.currency);
  const existing = await db.agentFundStocks.get(stockId);
  if (existing) {
    return existing;
  }
  return reconcileAndPersistAgentStock(params);
}

export function assertSufficientStocksForOperation(params: {
  stock: AgentFundStock;
  physicalCashRequired?: number;
  virtualCreditRequired?: number;
  allowConfirmedOnly?: boolean;
}): void {
  const {
    stock,
    physicalCashRequired = 0,
    virtualCreditRequired = 0,
    allowConfirmedOnly = false,
  } = params;

  if (stock.status !== 'active') {
    throw new Error(
      `Compte de fonds ${stock.currency} actuellement ${stock.status === 'frozen' ? 'gelé' : 'suspendu'}. Opération bloquée par supervision financière.`
    );
  }

  if (stock.syncStatus === 'conflict') {
    throw new Error(
      `Conflit de synchronisation actif sur le stock ${stock.currency}. Résolution par la supervision requise avant toute nouvelle écriture.`
    );
  }

  const availableVirtual = allowConfirmedOnly
    ? stock.virtualCreditConfirmed
    : stock.virtualCreditAvailable;
  const availableCash = allowConfirmedOnly
    ? stock.physicalCashConfirmed
    : stock.physicalCashAvailable;

  if (virtualCreditRequired > 0 && availableVirtual + 0.0001 < virtualCreditRequired) {
    throw new Error(INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE);
  }

  if (physicalCashRequired > 0 && availableCash + 0.0001 < physicalCashRequired) {
    throw new Error(
      `Transaction impossible : votre cash physique disponible (${formatMoney(availableCash, stock.currency)}) est insuffisant pour décaisser ${formatMoney(physicalCashRequired, stock.currency)}.`
    );
  }
}

export async function enqueueFinancialSync(
  entity:
    | 'agentFundStock'
    | 'financialLedger'
    | 'financialTransaction'
    | 'replenishmentRequest'
    | 'cashHandover'
    | 'reconciliationRecord'
    | 'financialAnomaly'
    | 'physicalInventory'
    | 'financialDelegation',
  entityId: string,
  operation: 'create' | 'update'
): Promise<void> {
  const existing = await db.syncQueue
    .where('status')
    .anyOf('pending', 'processing')
    .filter((item) => item.entity === entity && item.entityId === entityId)
    .first();
  if (existing) {
    return;
  }
  const now = Date.now();
  await db.syncQueue.add({
    entity,
    entityId,
    operation,
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export async function getAuthorizedAgentFundStocks(user: AppUser): Promise<AgentFundStock[]> {
  if (!canAccessFinancialSupervision(user)) {
    return [];
  }
  const all = await db.agentFundStocks.toArray();
  if (isGlobalFinancialSupervisor(user)) {
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  if (user.role === 'administrateur_agence') {
    if (!user.agencyId) return [];
    return all
      .filter((s) => s.agencyId === user.agencyId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return all
    .filter((s) => s.agentId === user.uid)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getAuthorizedFinancialLedger(
  user: AppUser,
  filters?: { agentId?: string; agencyId?: string; currency?: CurrencyCode }
): Promise<FinancialLedgerEntry[]> {
  if (!canAccessFinancialSupervision(user)) {
    return [];
  }
  let rows = await db.financialLedger.toArray();
  if (isGlobalFinancialSupervisor(user)) {
    // accès global
  } else if (user.role === 'administrateur_agence') {
    rows = user.agencyId ? rows.filter((r) => r.agencyId === user.agencyId) : [];
  } else {
    rows = rows.filter((r) => r.agentId === user.uid);
  }

  if (filters?.agentId) {
    rows = rows.filter((r) => r.agentId === filters.agentId);
  }
  if (filters?.agencyId) {
    rows = rows.filter((r) => r.agencyId === filters.agencyId);
  }
  if (filters?.currency) {
    rows = rows.filter((r) => r.currency === filters.currency);
  }

  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export function assertFinancialRoleWriteScope(params: {
  actor: AppUser;
  targetAgencyId: string | null;
  targetAgentId?: string;
}): void {
  const { actor, targetAgencyId, targetAgentId } = params;
  if (!canAccessFinancialSupervision(actor)) {
    throw new Error('Accès refusé : rôle non autorisé pour les opérations financières.');
  }
  if (isGlobalFinancialSupervisor(actor)) {
    return;
  }
  if (actor.role === 'administrateur_agence') {
    if (!actor.agencyId || actor.agencyId !== targetAgencyId) {
      throw new Error("Isolation par agence : accès refusé hors de votre succursale.");
    }
    return;
  }
  if (actor.role === 'agent') {
    if (targetAgentId && targetAgentId !== actor.uid) {
      throw new Error("Isolation agent : impossible d'agir sur les fonds d'un autre agent.");
    }
    if (actor.agencyId && targetAgencyId && actor.agencyId !== targetAgencyId) {
      throw new Error("Isolation par agence : succursale incompatible.");
    }
  }
}
