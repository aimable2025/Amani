export type CurrencyCode = 'USD' | 'CDF';

export type FinancialOperator =
  | 'vodacom'
  | 'airtel'
  | 'orange'
  | 'africell'
  | 'caisse_interne';

export type SyncLifecycleState =
  | 'brouillon_local'
  | 'en_attente_synchro'
  | 'synchronisee'
  | 'confirmee_serveur'
  | 'en_conflit'
  | 'rejetee';

export type FinancialOperationCategory =
  | 'dotation_initiale'
  | 'attribution_credit_virtuel'
  | 'reception_cash'
  | 'remise_cash'
  | 'depot_client'
  | 'depot_abonne'
  | 'retrait_client'
  | 'retrait_abonne'
  | 'transaction_virtuelle'
  | 'change_devise'
  | 'commission_frais'
  | 'ecart_inventaire'
  | 'contrepassation_correction';

export interface LedgerHistoryItem {
  id: string;
  action: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  note?: string;
  timestamp: number;
}

/**
 * Journal financier immuable (append-only) : source de vérité comptable.
 * Chaque écriture concerne STRICTEMENT une seule devise (USD ou CDF).
 */
export interface FinancialLedgerEntry {
  id: string;
  idempotencyKey: string;
  reference: string;
  operationCategory: FinancialOperationCategory;
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  currency: CurrencyCode;
  /** Variation du cash physique en main (+ entrée, - sortie) */
  physicalCashDelta: number;
  /** Variation du crédit virtuel disponible (+ crédit reçu, - crédit consommé) */
  virtualCreditDelta: number;
  /** Variation nette du capital confié par la direction/trésorerie */
  capitalDelta: number;
  /** Variation nette documentée issue des frais/commissions */
  feeDelta: number;
  /** Variation nette documentée issue d'un change USD <-> CDF */
  fxNetDelta: number;
  /** Variation nette documentée issue d'un ajustement d'inventaire validé */
  adjustmentDelta: number;
  physicalCashBefore: number;
  physicalCashAfter: number;
  virtualCreditBefore: number;
  virtualCreditAfter: number;
  feeAmount?: number;
  commissionAmount?: number;
  exchangeGroupId?: string | null;
  exchangeCounterCurrency?: CurrencyCode | null;
  exchangeCounterAmount?: number | null;
  exchangeRate?: number | null;
  operator?: FinancialOperator | null;
  internalNumberId?: string | null;
  linkedTransactionId?: string | null;
  linkedSmsOperationId?: string | null;
  linkedReplenishmentId?: string | null;
  linkedHandoverId?: string | null;
  linkedInventoryId?: string | null;
  reversedEntryId?: string | null;
  counterpartyConfirmedBy?: string | null;
  counterpartyConfirmedAt?: number | null;
  centralFundingSource?: string | null;
  authorUid: string;
  authorName: string;
  authorRole: string;
  reason: string;
  notes?: string | null;
  syncLifecycle: SyncLifecycleState;
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  conflictReason?: string | null;
  serverConfirmedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Projection recalculable par (agentId, currency).
 * Ne jamais confondre le solde confirmé serveur et le delta local en attente.
 */
export interface AgentFundStock {
  id: string; // `${agentId}_${currency}`
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  currency: CurrencyCode;
  physicalCashConfirmed: number;
  virtualCreditConfirmed: number;
  physicalCashPendingDelta: number;
  virtualCreditPendingDelta: number;
  physicalCashAvailable: number;
  virtualCreditAvailable: number;
  totalInitialEndowment: number;
  totalCreditsAllocated: number;
  totalCreditsConsumed: number;
  totalDepositsCollected: number;
  totalWithdrawalsPaid: number;
  totalCashReceived: number;
  totalCashHandedOver: number;
  totalFeesCollected: number;
  totalCommissionsEarned: number;
  totalFxNet: number;
  totalInventoryAdjustments: number;
  /** Capital net confié = dotations + crédits alloués + réceptions cash - remises cash */
  netAttributedCapital: number;
  /** Écart d'invariant comptable (doit rester à 0) */
  invariantResidual: number;
  creditLowThreshold: number;
  cashHighThreshold: number;
  status: 'active' | 'frozen' | 'suspended';
  lastLedgerEntryId: string | null;
  lastSyncedAt: number | null;
  recalculatedAt: number;
  syncStatus: 'local' | 'pending' | 'synced' | 'conflict' | 'error';
  createdAt: number;
  updatedAt: number;
}

export type FinancialTransactionType =
  | 'depot_client'
  | 'depot_abonne'
  | 'retrait_client'
  | 'retrait_abonne'
  | 'transaction_virtuelle'
  | 'change_devise'
  | 'commission_frais';

export type ReconciliationStatus =
  | 'non_rapprochee'
  | 'rapprochee'
  | 'non_declaree'
  | 'declaration_sans_sms'
  | 'montant_different'
  | 'reference_differente'
  | 'reference_dupliquee'
  | 'doublon_potentiel'
  | 'a_verifier_manuellement'
  | 'validee_manuellement';

export interface FinancialTransaction {
  id: string;
  idempotencyKey: string;
  reference: string;
  externalOperatorRef?: string | null;
  transactionType: FinancialTransactionType;
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  operator: FinancialOperator;
  internalNumberId?: string | null;
  internalPhoneNumber?: string | null;
  clientUid?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  beneficiaryPhone?: string | null;
  linkedClientOrderId?: string | null;
  linkedOperationId?: string | null;
  currency: CurrencyCode;
  amount: number;
  feeAmount: number;
  feeMode?: 'cash_encaisse' | 'inclus_montant' | 'aucun';
  commissionAmount: number;
  /** Pour change_devise uniquement */
  targetCurrency?: CurrencyCode | null;
  targetAmount?: number | null;
  exchangeRate?: number | null;
  fxExecutionChannel?: 'cash_contre_cash' | 'virtuel_contre_cash' | 'cash_contre_virtuel' | null;
  physicalCashDelta: number;
  virtualCreditDelta: number;
  targetPhysicalCashDelta?: number;
  targetVirtualCreditDelta?: number;
  settlementMode?: 'cash_collecte' | 'credit_compte' | 'reglement_interne';
  reconciliationStatus: ReconciliationStatus;
  linkedSmsOperationId?: string | null;
  reconciledAt?: number | null;
  reconciledBy?: string | null;
  status: 'validee' | 'en_attente_synchro' | 'en_conflit' | 'rejetee' | 'contrepassee';
  syncLifecycle: SyncLifecycleState;
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  conflictDetails?: string | null;
  rejectionReason?: string | null;
  reversedByLedgerId?: string | null;
  notes?: string | null;
  deviceTimestamp: number;
  serverConfirmedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type ReplenishmentStatus =
  | 'en_attente'
  | 'en_examen'
  | 'approuvee'
  | 'rejetee'
  | 'annulee';

export interface ReplenishmentRequest {
  id: string;
  reference: string;
  idempotencyKey: string;
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  requestType: 'credit_virtuel' | 'cash_physique' | 'mixte';
  currency: CurrencyCode;
  requestedAmount: number;
  approvedAmount?: number | null;
  virtualAmountPart?: number;
  cashAmountPart?: number;
  operator?: FinancialOperator | null;
  internalNumberId?: string | null;
  reason: string;
  urgency: 'normale' | 'urgente' | 'critique';
  projectedCashAtRequest: number;
  projectedVirtualCreditAtRequest: number;
  status: ReplenishmentStatus;
  centralFundingSource?: string | null;
  reviewedByUid?: string | null;
  reviewedByName?: string | null;
  reviewedByRole?: string | null;
  reviewedAt?: number | null;
  decisionNote?: string | null;
  rejectionReason?: string | null;
  delegatedApproval?: boolean;
  delegationId?: string | null;
  linkedLedgerEntryId?: string | null;
  history: LedgerHistoryItem[];
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface CashHandover {
  id: string;
  reference: string;
  idempotencyKey: string;
  direction:
    | 'agent_vers_direction'
    | 'direction_vers_agent'
    | 'agent_vers_caisse_agence';
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  currency: CurrencyCode;
  amount: number;
  reason: string;
  initiatedByUid: string;
  initiatedByName: string;
  initiatedByRole: string;
  initiatedAt: number;
  status: 'en_attente_confirmation' | 'confirmee' | 'rejetee' | 'annulee';
  confirmedByUid?: string | null;
  confirmedByName?: string | null;
  confirmedByRole?: string | null;
  confirmedAt?: number | null;
  confirmationNote?: string | null;
  rejectionReason?: string | null;
  linkedLedgerEntryId?: string | null;
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface ReconciliationRecord {
  id: string;
  smsOperationId?: string | null;
  financialTransactionId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  agencyId: string | null;
  operator?: string | null;
  currency?: CurrencyCode | null;
  smsAmount?: number | null;
  declaredAmount?: number | null;
  amountDifference?: number | null;
  smsReference?: string | null;
  declaredReference?: string | null;
  timeDeltaMs?: number | null;
  confidenceScore: number;
  matchedCriteria: {
    referenceMatch: boolean;
    amountMatch: boolean;
    currencyMatch: boolean;
    typeCompatible: boolean;
    withinTimeWindow: boolean;
    operatorMatch: boolean;
    agentOrNumberMatch: boolean;
  };
  status: ReconciliationStatus;
  reviewerUid?: string | null;
  reviewerName?: string | null;
  resolutionNote?: string | null;
  resolvedAt?: number | null;
  syncStatus: 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

export type FinancialAnomalyType =
  | 'sms_sans_declaration'
  | 'declaration_sans_sms'
  | 'ecart_montant_sms'
  | 'reference_dupliquee'
  | 'doublon_suspect'
  | 'ecart_inventaire'
  | 'synchro_tardive'
  | 'activite_inhabituelle'
  | 'solde_incoherent'
  | 'tentative_credit_insuffisant'
  | 'tentative_contournement_securite';

export type FinancialAnomalyStatus =
  | 'nouvelle'
  | 'en_cours_examen'
  | 'justification_demandee'
  | 'justifiee'
  | 'confirmee'
  | 'cloturee';

export interface FinancialAnomaly {
  id: string;
  reference: string;
  dedupKey: string;
  anomalyType: FinancialAnomalyType;
  severity: 'faible' | 'moyenne' | 'elevee' | 'critique';
  status: FinancialAnomalyStatus;
  warningDisclaimer: string;
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
  agentJustification?: string | null;
  justifiedAt?: number | null;
  supervisorDecisionNote?: string | null;
  handledByUid?: string | null;
  handledByName?: string | null;
  handledAt?: number | null;
  history: LedgerHistoryItem[];
  syncStatus: 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface VirtualChannelCount {
  operator: FinancialOperator | string;
  phoneNumber?: string;
  currency: CurrencyCode;
  countedAmount: number;
}

export interface PhysicalInventory {
  id: string;
  reference: string;
  controlType: 'inopine' | 'cloture_journee' | 'periodique';
  agentId: string;
  agentName: string;
  agencyId: string | null;
  agencyName: string;
  requestedByUid: string;
  requestedByName: string;
  requestedAt: number;
  status:
    | 'en_attente_agent'
    | 'soumis_agent'
    | 'valide_conforme'
    | 'ecart_positif'
    | 'ecart_negatif'
    | 'justification_demandee'
    | 'incomplet';
  theoreticalPhysicalCashUsd: number;
  countedPhysicalCashUsd: number;
  discrepancyCashUsd: number;
  theoreticalVirtualCreditUsd: number;
  countedVirtualCreditUsd: number;
  discrepancyVirtualUsd: number;
  theoreticalPhysicalCashCdf: number;
  countedPhysicalCashCdf: number;
  discrepancyCashCdf: number;
  theoreticalVirtualCreditCdf: number;
  countedVirtualCreditCdf: number;
  discrepancyVirtualCdf: number;
  virtualChannelsBreakdown: VirtualChannelCount[];
  undeclaredOperationsCount: number;
  undeclaredOperationsNotes?: string | null;
  agentNotes?: string | null;
  submittedAt?: number | null;
  validatedByUid?: string | null;
  validatedByName?: string | null;
  validatedAt?: number | null;
  validationNotes?: string | null;
  immutableLocked: boolean;
  linkedAnomalyIds: string[];
  linkedAdjustmentLedgerIds: string[];
  syncStatus: 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface CreditDelegationScope {
  id: string;
  delegateUid: string;
  delegateName: string;
  delegateRole: string;
  agencyId: string;
  agencyName: string;
  grantedByUid: string;
  grantedByName: string;
  status: 'active' | 'revoked' | 'expired';
  canApproveReplenishment: boolean;
  maxAmountUsd: number;
  maxAmountCdf: number;
  expiresAt: number;
  revokedByUid?: string | null;
  revokedAt?: number | null;
  reason: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReconciliationToleranceConfig {
  timeWindowMinutes: number;
  amountToleranceUsd: number;
  amountToleranceCdf: number;
  creditLowThresholdUsd: number;
  creditLowThresholdCdf: number;
  cashHighThresholdUsd: number;
  cashHighThresholdCdf: number;
}

export const DEFAULT_FINANCIAL_THRESHOLDS: ReconciliationToleranceConfig = {
  timeWindowMinutes: 30,
  amountToleranceUsd: 0.5,
  amountToleranceCdf: 500,
  creditLowThresholdUsd: 200,
  creditLowThresholdCdf: 500000,
  cashHighThresholdUsd: 5000,
  cashHighThresholdCdf: 12000000,
};

export const ANOMALY_WARNING_DISCLAIMER =
  'Signalement automatique à vérifier : cet écart ou événement requiert une justification et ne constitue pas une accusation de fraude sans vérification contradictoire.';

export const INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE =
  'Transaction impossible : votre crédit virtuel disponible est insuffisant. Veuillez demander un réapprovisionnement au Directeur Général.';
