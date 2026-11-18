import {
  Activity,
  ArrowLeftRight,
  Building2,
  ClipboardList,
  FileText,
  MessageSquare,
  Scale,
  Settings,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  WalletCards,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DgFeatures } from '../../../types/management';

export type DgModuleCategory =
  | 'operations'
  | 'finance'
  | 'network'
  | 'oversight'
  | 'settings';

export interface DgModuleItem {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: LucideIcon;
  category: DgModuleCategory;
  badge?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  isAvailable?: (features?: DgFeatures) => boolean;
}

export const DG_MODULES: DgModuleItem[] = [
  {
    id: 'operations-management',
    title: 'Opérations Réseau',
    shortTitle: 'Opérations',
    description: "Création, affectation et suivi des missions opérationnelles d'agence.",
    icon: Activity,
    category: 'operations',
    variant: 'primary',
  },
  {
    id: 'client-orders',
    title: 'Commandes & Réclamations Clients',
    shortTitle: 'Commandes',
    description: 'Supervision des commandes, réclamations et demandes de restitution clients & abonnés.',
    icon: ClipboardList,
    category: 'operations',
    variant: 'primary',
    isAvailable: (f) => (f ? f.transactionsManage || f.clientsManage : true),
  },
  {
    id: 'billetage',
    title: 'Billetage & Liquidités',
    shortTitle: 'Billetage',
    description: 'Comptage contradictoire, réconciliation des devises USD / CDF et contrôle caisse.',
    icon: WalletCards,
    category: 'operations',
    variant: 'success',
    isAvailable: (f) => f?.billetageAccess ?? true,
  },
  {
    id: 'salaries-management',
    title: 'Salaires, Avances & Paie',
    shortTitle: 'Salaires & Paie',
    description: 'Fixation des salaires par période, autorisation, désignation du payeur, réclamations et avances.',
    icon: Wallet,
    category: 'finance',
    variant: 'success',
    badge: 'Paie',
  },
  {
    id: 'reports-center',
    title: 'Rapports & Exports Certifiés',
    shortTitle: 'Rapports',
    description: 'Synthèses financières, opérationnelles et analytiques avec exports PDF et Excel.',
    icon: FileText,
    category: 'finance',
    variant: 'success',
    badge: 'PDF/XLS',
    isAvailable: (f) => f?.reportsManage ?? true,
  },
  {
    id: 'inter-agency-transfers',
    title: 'Transferts Inter-Agences',
    shortTitle: 'Transferts',
    description: 'Mouvements de fonds inter-succursales (argent physique, virtuel et ravitaillements).',
    icon: ArrowLeftRight,
    category: 'finance',
    variant: 'primary',
    isAvailable: (f) => f?.transactionsManage ?? true,
  },
  {
    id: 'debts-management',
    title: 'Suivi des Dettes & Créances',
    shortTitle: 'Dettes',
    description: 'Gestion des dettes clients, agents et entreprise, échéances et remboursements.',
    icon: Scale,
    category: 'finance',
    variant: 'warning',
    isAvailable: (f) => f?.transactionsManage ?? true,
  },
  {
    id: 'internal-chat',
    title: 'Chat Interne & Annonces',
    shortTitle: 'Chat & Notes',
    description: 'Messagerie multi-canaux (privé, agence, service, global) et notes officielles.',
    icon: MessageSquare,
    category: 'network',
    variant: 'primary',
    isAvailable: (f) => f?.communicationManage ?? true,
  },
  {
    id: 'internal-numbers',
    title: 'Numéros Flotte & Supervision SMS',
    shortTitle: 'Flotte & SMS',
    description: 'Gestion de la flotte téléphonique interne et suivi des flux SMS opérateurs.',
    icon: Smartphone,
    category: 'operations',
    variant: 'warning',
    isAvailable: (f) => f?.internalNumbersManage ?? true,
  },
  {
    id: 'connectivity-sync',
    title: 'Disponibilité & Synchronisation',
    shortTitle: 'Synchro',
    description: 'État du réseau, latence, intégrité du stockage local et transmission centrale.',
    icon: Wifi,
    category: 'network',
    variant: 'primary',
  },
  {
    id: 'agencies',
    title: 'Gestion des Agences',
    shortTitle: 'Agences',
    description: 'Supervision des agences, état opérationnel, responsables, agents rattachés et opérations.',
    icon: Building2,
    category: 'network',
    isAvailable: (f) => f?.agenciesManage ?? true,
  },
  {
    id: 'agency-admins-management',
    title: "Administrateurs d'Agence",
    shortTitle: 'Admin Agence',
    description: "Supervision, création, affectations d'agences et statuts des Administrateurs d'Agence.",
    icon: UserPlus,
    category: 'network',
    variant: 'primary',
  },
  {
    id: 'agents-management',
    title: 'Gestion des Agents',
    shortTitle: 'Agents',
    description: 'Vision globale des agents, fonctions/services, polyvalence au guichet et missions.',
    icon: Users,
    category: 'network',
  },
  {
    id: 'registration-requests',
    title: 'Validations Inscriptions',
    shortTitle: 'Inscriptions',
    description: 'Approbation ou rejet des demandes de comptes clients et abonnés.',
    icon: UserCheck,
    category: 'oversight',
    variant: 'primary',
    isAvailable: (f) => (f ? f.membersManage || f.clientsManage : true),
  },
  {
    id: 'audit-logs',
    title: "Journal d'Audit",
    shortTitle: 'Audit',
    description: "Traçabilité immuable de l'ensemble des actions système et modifications de statut.",
    icon: ShieldCheck,
    category: 'oversight',
    variant: 'danger',
    isAvailable: (f) => f?.auditRead ?? true,
  },
  {
    id: 'dg-config',
    title: 'Configuration DG',
    shortTitle: 'Config DG',
    description: 'Paramètres des modules opérationnels, délais de rétention et identité.',
    icon: Settings,
    category: 'settings',
  },
];
