export type ClientOrderCategory =
  | 'nouvelle_commande'
  | 'transaction_non_recue'
  | 'reclamation_service'
  | 'restitution_argent';

export type ClientOrderTransactionType =
  | 'depot_mobile_money'
  | 'retrait_mobile_money'
  | 'transfert_inter_agence'
  | 'change_devises'
  | 'paiement_service'
  | 'autre';

export type ClientOrderStatus =
  | 'soumise'
  | 'en_attente_info'
  | 'prise_en_charge'
  | 'en_cours'
  | 'traitee'
  | 'cloturee'
  | 'rejetee';

export type ClientOrderPriority = 'normale' | 'urgente';

export type RefundDecisionStatus = 'en_attente' | 'acceptee' | 'rejetee';

export interface ClientOrderAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface ClientOrderComment {
  id: string;
  authorUid: string;
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: number;
}

export interface ClientOrderHistoryEntry {
  id: string;
  action: string;
  fromStatus?: ClientOrderStatus | null;
  toStatus?: ClientOrderStatus | null;
  actorUid: string;
  actorName: string;
  actorRole: string;
  note?: string;
  timestamp: number;
}

export interface ClientOrder {
  id: string;
  reference: string;
  category: ClientOrderCategory;
  transactionType: ClientOrderTransactionType;
  operatorName?: string;
  concernedPhone?: string;
  beneficiaryPhone?: string;
  beneficiaryName?: string;
  amount?: number;
  currency?: 'USD' | 'CDF';
  approxDate?: string;
  transactionReference?: string;
  relatedOrderId?: string;
  agencyId: string | null;
  agencyName: string;
  targetAgentId?: string | null;
  targetAgentName?: string | null;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  assignedByUid?: string | null;
  assignedByName?: string | null;
  assignedAt?: number | null;
  description: string;
  additionalInfo?: string;
  attachment?: ClientOrderAttachment | null;
  status: ClientOrderStatus;
  priority: ClientOrderPriority;
  authorUid: string;
  authorName: string;
  authorRole: 'client' | 'abonne';
  authorPhone?: string;
  authorEmail?: string;
  resolutionNote?: string | null;
  refundDecision?: RefundDecisionStatus | null;
  rejectionReason?: string | null;
  infoRequestedMessage?: string | null;
  comments: ClientOrderComment[];
  history: ClientOrderHistoryEntry[];
  resolvedByUid?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: number | null;
  closedByUid?: string | null;
  closedByName?: string | null;
  closedAt?: number | null;
  syncStatus: 'local' | 'pending' | 'synced' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface CreateClientOrderInput {
  category: ClientOrderCategory;
  transactionType: ClientOrderTransactionType;
  operatorName?: string;
  concernedPhone?: string;
  beneficiaryPhone?: string;
  beneficiaryName?: string;
  amount?: number;
  currency?: 'USD' | 'CDF';
  approxDate?: string;
  transactionReference?: string;
  relatedOrderId?: string;
  agencyId: string | null;
  agencyName: string;
  targetAgentId?: string | null;
  targetAgentName?: string | null;
  description: string;
  additionalInfo?: string;
  attachment?: ClientOrderAttachment | null;
  priority?: ClientOrderPriority;
}

export const CLIENT_ORDER_CATEGORY_LABELS: Record<ClientOrderCategory, string> = {
  nouvelle_commande: 'Nouvelle commande',
  transaction_non_recue: 'Transaction non reçue',
  reclamation_service: 'Réclamation de service',
  restitution_argent: 'Restitution d’argent',
};

export const CLIENT_ORDER_TRANSACTION_LABELS: Record<ClientOrderTransactionType, string> = {
  depot_mobile_money: 'Dépôt Mobile Money',
  retrait_mobile_money: 'Retrait Mobile Money',
  transfert_inter_agence: 'Transfert inter-agences',
  change_devises: 'Change USD / CDF',
  paiement_service: 'Paiement / Règlement',
  autre: 'Autre service',
};

export const CLIENT_ORDER_STATUS_LABELS: Record<ClientOrderStatus, string> = {
  soumise: 'Nouvelle',
  en_attente_info: 'Infos requises',
  prise_en_charge: 'Prise en charge',
  en_cours: 'En cours',
  traitee: 'Traitée',
  cloturee: 'Clôturée',
  rejetee: 'Rejetée',
};

export const MOBILE_MONEY_OPERATORS: readonly string[] = [
  'Vodacom M-Pesa',
  'Airtel Money',
  'Orange Money',
  'Afrimoney',
  'Autre / Guichet',
];
