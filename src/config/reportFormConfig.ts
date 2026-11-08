import type { UserFunction, UserRole } from '../types/auth';
import type {
  AgentCategorySpecificData,
  AgentReportCategory,
  ReportPriority,
  ReportType,
} from '../types/report';

export type ReportUserProfile =
  | 'agent_comptable'
  | 'guichetier'
  | 'caissier'
  | 'agent_change'
  | 'agent_virtuel'
  | 'agent_terrain'
  | 'agent_polyvalent'
  | 'direction_agence'
  | 'general';

export type ReportFormSectionKey =
  | 'general'
  | 'summary'
  | 'metrics'
  | 'category'
  | 'activities'
  | 'results'
  | 'difficulties'
  | 'recom'
  | 'billetage'
  | 'certification';

export interface ReportFormSectionRule {
  visible: boolean;
  required?: boolean;
  title?: string;
  description?: string;
}

export interface ActivityTemplate {
  title: string;
  description: string;
  result: string;
}

export interface QuantitativeIndicatorTemplate {
  indicator: string;
  planned: number;
  unit: string;
}

export interface ReportFormConfiguration {
  profile: ReportUserProfile;
  label: string;
  shortLabel: string;
  badge: {
    text: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
  };
  description: string;
  defaultReportType: ReportType;
  allowedReportTypes: Array<{ value: ReportType; label: string }>;
  defaultCategory: AgentReportCategory;
  defaultPriority: ReportPriority;
  titlePlaceholder: string;
  summaryPlaceholder: string;
  summaryHelperText: string;
  sections: {
    general: ReportFormSectionRule;
    summary: ReportFormSectionRule;
    metrics: ReportFormSectionRule & {
      showMissions: boolean;
      showBilletage: boolean;
      showDiscrepancy: boolean;
    };
    category: ReportFormSectionRule & {
      allowedFields: Array<keyof AgentCategorySpecificData>;
    };
    activities: ReportFormSectionRule & {
      defaultTemplates: ActivityTemplate[];
    };
    results: ReportFormSectionRule & {
      defaultIndicators: QuantitativeIndicatorTemplate[];
    };
    difficulties: ReportFormSectionRule;
    recom: ReportFormSectionRule;
    billetage: ReportFormSectionRule & {
      explanation: string;
    };
    certification: ReportFormSectionRule & {
      statement: string;
    };
  };
}

/**
 * Configurations centralisées des formulaires de rapport par profil métier.
 */
export const REPORT_FORM_CONFIGURATIONS: Record<ReportUserProfile, ReportFormConfiguration> = {
  // 1. AGENT COMPTABLE
  agent_comptable: {
    profile: 'agent_comptable',
    label: 'Agent Comptable & Rapprochement',
    shortLabel: 'Comptable',
    badge: {
      text: 'Comptabilité & Contrôle',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950/40',
      textColor: 'text-indigo-700 dark:text-indigo-300',
      borderColor: 'border-indigo-200 dark:border-indigo-800',
    },
    description: 'Rapprochements bancaires, pointage des écritures, pièces justificatives et régularisations.',
    defaultReportType: 'financier',
    allowedReportTypes: [
      { value: 'financier', label: 'Rapport Financier & Rapprochement' },
      { value: 'analytique', label: 'Rapport Analytique & Écritures' },
      { value: 'quotidien', label: 'Pointage Journalier' },
      { value: 'mensuel', label: 'Clôture Comptable Mensuelle' },
      { value: 'incident', label: 'Anomalie / Écart Comptable' },
    ],
    defaultCategory: 'comptable',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Rapport journalier de rapprochement et régularisation des écritures',
    summaryPlaceholder: 'Synthèse des comptes arrêtés, volumes rapprochés, justificatifs en attente et régularisations...',
    summaryHelperText: 'Présentez à la direction l\'état des rapprochements et les éventuels écarts de balance.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations Générales & Période' },
      summary: { visible: true, required: true, title: '2. Synthèse Comptable & Balance' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: true,
        showDiscrepancy: true,
        title: '3. Soldes & Métriques Financières Vérifiées',
      },
      category: {
        visible: true,
        title: '4. Volet Métier Comptable',
        allowedFields: [
          'accountingPeriodName',
          'filesProcessedCount',
          'operationsBookedCount',
          'reconciliationsDoneCount',
          'discrepanciesCount',
          'missingReceiptsCount',
          'accountingCorrectiveActions',
          'accountingObservations',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Travaux Comptables Réalisés',
        defaultTemplates: [
          {
            title: 'Rapprochement des opérations de caisse & bordereaux',
            description: 'Vérification de concordance entre les déclarations physiques et le journal d\'écritures.',
            result: 'Concordance vérifiée sur les opérations du jour.',
          },
          {
            title: 'Pointage des justificatifs et pièces comptables',
            description: 'Contrôle des signatures, reçus et décharges pour chaque décaissement.',
            result: 'Pièces classées et archivées selon les normes internes.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Indicateurs de Production Comptable',
        defaultIndicators: [
          { indicator: 'Dossiers comptables pointés', planned: 25, unit: 'dossiers' },
          { indicator: 'Écritures régularisées', planned: 10, unit: 'écritures' },
          { indicator: 'Pièces justificatives vérifiées', planned: 30, unit: 'pièces' },
        ],
      },
      difficulties: { visible: true, title: '7. Écarts & Litiges Comptables' },
      recom: { visible: true, title: '8. Recommandations de Gestion' },
      billetage: {
        visible: true,
        required: false,
        title: '9. Contrôle Billetage Lié',
        explanation: 'Associer le billetage de caisse vérifié pour figer l\'audit.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie la sincérité des écritures pointées et la réalité des soldes déclarés.',
      },
    },
  },

  // 2. GUICHETIER
  guichetier: {
    profile: 'guichetier',
    label: 'Guichetier & Accueil Clientèle',
    shortLabel: 'Guichetier',
    badge: {
      text: 'Guichet & Opérations',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
      textColor: 'text-emerald-700 dark:text-emerald-300',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
    },
    description: 'Accueil du public, exécution des dépôts, retraits, transferts et vérification des pièces d\'identité.',
    defaultReportType: 'operationnel',
    allowedReportTypes: [
      { value: 'operationnel', label: 'Rapport Journalier de Guichet' },
      { value: 'activite', label: 'Rapport d\'Activité Clientèle' },
      { value: 'quotidien', label: 'Rapport de Fin de Journée' },
      { value: 'incident', label: 'Incident Guichet / Client' },
      { value: 'autre', label: 'Autre déclaration' },
    ],
    defaultCategory: 'guichetier',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Rapport journalier des opérations de guichet et accueil clients',
    summaryPlaceholder: 'Affluence de la journée, temps de traitement, nombre de clients servis, anomalies éventuelles...',
    summaryHelperText: 'Résumez le déroulement de votre service au guichet.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations Générales' },
      summary: { visible: true, required: true, title: '2. Synthèse du Guichet' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: false,
        showDiscrepancy: false,
        title: '3. Volume d\'Opérations Traitées',
      },
      category: {
        visible: true,
        title: '4. Volet Guichetier',
        allowedFields: [
          'tellerOperationsCount',
          'clientsServedCount',
          'pendingTransactionsCount',
          'cancelledOrRejectedCount',
          'tellerAnomaliesNotes',
          'technicalDifficultiesNotes',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Activités de Guichet Réalisées',
        defaultTemplates: [
          {
            title: 'Traitement des retraits et dépôts clientèle',
            description: 'Accueil des clients, vérification d\'identité et validation dans le système.',
            result: 'Opérations exécutées avec conformité des pièces.',
          },
          {
            title: 'Gestion des réclamations clients au guichet',
            description: 'Orientation et prise en charge des questions des usagers.',
            result: 'Clients renseignés et orientés sans retard.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Objectifs de Service',
        defaultIndicators: [
          { indicator: 'Clients servis au guichet', planned: 30, unit: 'clients' },
          { indicator: 'Opérations validées', planned: 25, unit: 'opérations' },
        ],
      },
      difficulties: { visible: true, title: '7. Difficultés Rencontrées au Guichet' },
      recom: { visible: true, title: '8. Suggestions pour le Guichet' },
      billetage: {
        visible: false,
        required: false,
        title: '9. Billetage',
        explanation: 'La tenue physique de coffre est assurée par la caisse.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie que toutes les opérations renseignées correspondent aux clients effectivement servis.',
      },
    },
  },

  // 3. CAISSIER
  caissier: {
    profile: 'caissier',
    label: 'Caissier & Gestionnaire de Coffre',
    shortLabel: 'Caissier',
    badge: {
      text: 'Caisse & Trésorerie',
      bgColor: 'bg-amber-50 dark:bg-amber-950/40',
      textColor: 'text-amber-800 dark:text-amber-300',
      borderColor: 'border-amber-200 dark:border-amber-800',
    },
    description: 'Gestion des encaissements/décaissements, comptage physique USD/CDF et équilibre de coffre.',
    defaultReportType: 'cloture_caisse',
    allowedReportTypes: [
      { value: 'cloture_caisse', label: 'Procès-Verbal de Clôture de Caisse' },
      { value: 'financier', label: 'Journal des Mouvements de Caisse' },
      { value: 'quotidien', label: 'Rapport Journalier de Caisse' },
      { value: 'incident', label: 'Rapport d\'Écart ou Incident Caisse' },
    ],
    defaultCategory: 'caisse',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Procès-verbal de clôture journalière de la caisse locale',
    summaryPlaceholder: 'Solde initial, total des entrées, total des sorties, solde final physique et justification de tout écart...',
    summaryHelperText: 'Consignez les montants réels en coffre et confirmez l\'alignement avec le billetage.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations Générales' },
      summary: { visible: true, required: true, title: '2. Synthèse de Clôture' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: true,
        showDiscrepancy: true,
        title: '3. Soldes & Écarts Automatiques',
      },
      category: {
        visible: true,
        title: '4. Volet Caisse & Coffre',
        allowedFields: [
          'cashRegisterIdentifier',
          'cashOperationsCount',
          'authorizedReceiptsUSD',
          'authorizedReceiptsCDF',
          'authorizedDisbursementsUSD',
          'authorizedDisbursementsCDF',
          'cashDiscrepancyReason',
          'cashIncidentsNotes',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Opérations de Caisse Exécutées',
        defaultTemplates: [
          {
            title: 'Ouverture et comptage physique initial de coffre',
            description: 'Vérification du fond de caisse USD et CDF au début du service.',
            result: 'Fond de caisse vérifié conforme.',
          },
          {
            title: 'Clôture, comptage des coupures et scellement du coffre',
            description: 'Comptage physique des billets USD et CDF et établissement du billetage.',
            result: 'Billetage arrêté et coffre sécurisé.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Contrôles Chiffrés',
        defaultIndicators: [
          { indicator: 'Comptages de contrôle effectués', planned: 2, unit: 'comptages' },
          { indicator: 'Billetages rédigés', planned: 1, unit: 'billetage' },
        ],
      },
      difficulties: { visible: true, title: '7. Écarts Constatés & Justifications' },
      recom: { visible: true, title: '8. Besoins de Ravitaillement' },
      billetage: {
        visible: true,
        required: true,
        title: '9. Raccordement Obligatoire au Billetage',
        explanation: 'Chaque clôture de caisse doit être rattachée à son billetage physique conforme.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie l\'exactitude des montants en espèces dénombrés physiquement dans le coffre.',
      },
    },
  },

  // 4. AGENT DE CHANGE
  agent_change: {
    profile: 'agent_change',
    label: 'Agent de Change & Devises',
    shortLabel: 'Change',
    badge: {
      text: 'Change & Devises',
      bgColor: 'bg-teal-50 dark:bg-teal-950/40',
      textColor: 'text-teal-700 dark:text-teal-300',
      borderColor: 'border-teal-200 dark:border-teal-800',
    },
    description: 'Opérations de conversion de devises USD/CDF, taux appliqués et marges de change.',
    defaultReportType: 'financier',
    allowedReportTypes: [
      { value: 'financier', label: 'Journal des Opérations de Change' },
      { value: 'operationnel', label: 'Rapport d\'Activité Change' },
      { value: 'quotidien', label: 'Rapport Journalier Devises' },
      { value: 'incident', label: 'Alerte Taux ou Faux Billets' },
    ],
    defaultCategory: 'agent_change',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Rapport journalier des opérations de change USD/CDF',
    summaryPlaceholder: 'Volume de change traité, taux moyen du jour, marge brute dégagée, disponibilité des devises...',
    summaryHelperText: 'Précisez les volumes convertis et le respect de la grille officielle des taux.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations Générales' },
      summary: { visible: true, required: true, title: '2. Synthèse du Marché & Taux' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: true,
        showDiscrepancy: false,
        title: '3. Volumes Devises Déclarés',
      },
      category: {
        visible: true,
        title: '4. Volet Change & Devises',
        allowedFields: [
          'exchangeCurrencies',
          'exchangeOperationsCount',
          'exchangeVolumeUSD',
          'exchangeVolumeCDF',
          'exchangeAnomaliesNotes',
          'pendingExchangeOpsCount',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Activités de Change Réalisées',
        defaultTemplates: [
          {
            title: 'Affichage des cours et exécution des conversions',
            description: 'Application des taux officiels du réseau et vérification de l\'authenticité des billets.',
            result: 'Opérations exécutées sans faux billets détectés.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Volumes Traités',
        defaultIndicators: [
          { indicator: 'Opérations de change exécutées', planned: 15, unit: 'opérations' },
        ],
      },
      difficulties: { visible: true, title: '7. Anomalies de Devises' },
      recom: { visible: true, title: '8. Ajustements de Taux Proposés' },
      billetage: {
        visible: true,
        required: false,
        title: '9. Billetage des Devises en Caisse',
        explanation: 'Associer le billetage multidevise pour traçabilité.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie la conformité des taux appliqués et l\'authenticité des devises converties.',
      },
    },
  },

  // 5. AGENT VIRTUEL & FLOTTE
  agent_virtuel: {
    profile: 'agent_virtuel',
    label: 'Agent Virtuel & Mobile Money',
    shortLabel: 'Flotte Mobile',
    badge: {
      text: 'Flotte SMS & Mobile Money',
      bgColor: 'bg-purple-50 dark:bg-purple-950/40',
      textColor: 'text-purple-700 dark:text-purple-300',
      borderColor: 'border-purple-200 dark:border-purple-800',
    },
    description: 'Gestion des soldes virtuels (Airtel Money, M-Pesa, Orange Money), recharges et passerelles SMS.',
    defaultReportType: 'operationnel',
    allowedReportTypes: [
      { value: 'operationnel', label: 'Rapport Flotte & Monnaie Virtuelle' },
      { value: 'financier', label: 'Rapprochement Soldes Opérateurs' },
      { value: 'quotidien', label: 'Pointage Journalier Flotte' },
      { value: 'incident', label: 'Incident Réseau Opérateur' },
    ],
    defaultCategory: 'agent_virtuel',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Rapport journalier de flotte monnaie virtuelle et SMS',
    summaryPlaceholder: 'Soldes initiaux/finaux par opérateur, recharges traitées, temps de rétablissement des incidents réseau...',
    summaryHelperText: 'Indiquez les soldes de flotte disponibles et la disponibilité des réseaux opérateurs.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations Générales' },
      summary: { visible: true, required: true, title: '2. Synthèse Flotte Virtuelle' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: false,
        showDiscrepancy: false,
        title: '3. Opérations Virtuelles Détectées',
      },
      category: {
        visible: true,
        title: '4. Volet Flotte Virtuelle',
        allowedFields: [
          'virtualOperationsCount',
          'requestsReceivedCount',
          'requestsResolvedCount',
          'pendingVirtualFilesCount',
          'technicalIncidentsCount',
          'connectionIssuesCount',
          'virtualActionsTaken',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Suivi des Flottes & Transactions',
        defaultTemplates: [
          {
            title: 'Pointage des soldes et ravitaillement des puces',
            description: 'Vérification des balances Airtel Money, Vodacash et Orange Money.',
            result: 'Soldes de flotte équilibrés et opérationnels.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Taux de Disponibilité',
        defaultIndicators: [
          { indicator: 'Transactions virtuelles traitées', planned: 40, unit: 'transactions' },
        ],
      },
      difficulties: { visible: true, title: '7. Pannes Réseau & Délais Opérateurs' },
      recom: { visible: true, title: '8. Réallocation de Flotte Suggérée' },
      billetage: {
        visible: false,
        required: false,
        title: '9. Billetage Caisse',
        explanation: 'Non applicable aux soldes virtuels.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie l\'exactitude des soldes de flotte relevés sur les cartes SIM officielles.',
      },
    },
  },

  // 6. AGENT DE TERRAIN & LOGISTIQUE
  agent_terrain: {
    profile: 'agent_terrain',
    label: 'Agent de Terrain & Logistique',
    shortLabel: 'Terrain & Logistique',
    badge: {
      text: 'Terrain & Missions',
      bgColor: 'bg-orange-50 dark:bg-orange-950/40',
      textColor: 'text-orange-800 dark:text-orange-300',
      borderColor: 'border-orange-200 dark:border-orange-800',
    },
    description: 'Missions de transport de fonds, livraisons, courses d\'agence et logistique locale.',
    defaultReportType: 'activite',
    allowedReportTypes: [
      { value: 'activite', label: 'Rapport de Mission de Terrain' },
      { value: 'ponctuel', label: 'Compte-Rendu de Déplacement' },
      { value: 'incident', label: 'Incident Route / Véhicule' },
      { value: 'autre', label: 'Rapport Logistique' },
    ],
    defaultCategory: 'agent_terrain',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Compte-rendu de mission de transport et logistique',
    summaryPlaceholder: 'Itinéraires empruntés, état du véhicule, accomplissement des courses et incidents de circulation...',
    summaryHelperText: 'Détaillez les points d\'intervention et les objectifs atteints.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations de Mission' },
      summary: { visible: true, required: true, title: '2. Synthèse de la Mission' },
      metrics: {
        visible: false,
        showMissions: true,
        showBilletage: false,
        showDiscrepancy: false,
        title: '3. Métriques',
      },
      category: {
        visible: true,
        title: '4. Volet Terrain & Déplacements',
        allowedFields: [
          'assignedMissionTitle',
          'missionObjective',
          'interventionLocation',
          'fieldActivitiesCompleted',
          'fieldResultsObtained',
          'fieldRecommendations',
          'fieldProofDocumentName',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Déplacements & Courses Réalisées',
        defaultTemplates: [
          {
            title: 'Exécution des courses administratives et logistiques',
            description: 'Déplacement selon l\'ordre de mission validé par l\'agence.',
            result: 'Courses effectuées sans retard ni incident.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Missions Accomplies',
        defaultIndicators: [
          { indicator: 'Missions de terrain terminées', planned: 3, unit: 'missions' },
        ],
      },
      difficulties: { visible: true, title: '7. Problèmes Mécaniques ou Routiers' },
      recom: { visible: true, title: '8. Besoins d\'Entretien Véhicule' },
      billetage: {
        visible: false,
        required: false,
        title: '9. Billetage',
        explanation: 'Non applicable aux agents de terrain.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie avoir exécuté les déplacements conformément aux consignes de sécurité.',
      },
    },
  },

  // 7. AGENT POLYVALENT
  agent_polyvalent: {
    profile: 'agent_polyvalent',
    label: 'Agent Polyvalent (Multi-Attributions)',
    shortLabel: 'Polyvalent',
    badge: {
      text: 'Multi-Attributions',
      bgColor: 'bg-blue-50 dark:bg-blue-950/40',
      textColor: 'text-blue-700 dark:text-blue-300',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    description: 'Agents combinant plusieurs attributions (ex: Guichet + Caisse + Flotte) avec traçabilité séparée.',
    defaultReportType: 'activite',
    allowedReportTypes: [
      { value: 'activite', label: 'Rapport Global Multi-Activités' },
      { value: 'cloture_caisse', label: 'Clôture de Caisse & Guichet' },
      { value: 'operationnel', label: 'Synthèse des Opérations Réalisées' },
      { value: 'quotidien', label: 'Rapport Journalier Polyvalent' },
      { value: 'incident', label: 'Rapport d\'Anomalie' },
    ],
    defaultCategory: 'polyvalent',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Rapport journalier d\'activité polyvalente guichet et caisse',
    summaryPlaceholder: 'Synthèse des différentes fonctions assurées, répartition du temps et bilans par pôle...',
    summaryHelperText: 'Décrivez les différentes casquettes exercées sans double comptabilisation.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations Générales' },
      summary: { visible: true, required: true, title: '2. Synthèse Globale' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: true,
        showDiscrepancy: true,
        title: '3. Données Consolidées Dexie',
      },
      category: {
        visible: true,
        title: '4. Volets Métier Combinés',
        allowedFields: [
          'activeSelectedCategories',
          'tellerOperationsCount',
          'clientsServedCount',
          'pendingTransactionsCount',
          'cancelledOrRejectedCount',
          'tellerAnomaliesNotes',
          'cashRegisterIdentifier',
          'cashOperationsCount',
          'authorizedReceiptsUSD',
          'authorizedReceiptsCDF',
          'authorizedDisbursementsUSD',
          'authorizedDisbursementsCDF',
          'cashDiscrepancyReason',
          'virtualOperationsCount',
          'requestsResolvedCount',
          'exchangeOperationsCount',
          'exchangeVolumeUSD',
          'exchangeVolumeCDF',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Activités Réalisées par Pôle',
        defaultTemplates: [
          {
            title: 'Accueil clientèle & opérations de guichet',
            description: 'Exécution des transactions de guichet et tenue du registre.',
            result: 'Transactions traitées dans le respect des délais.',
          },
          {
            title: 'Pointage de caisse & clôture physique',
            description: 'Rapprochement des billets et vérification des totaux.',
            result: 'Caisse arrêtée et justifiée.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Objectifs et Ratios',
        defaultIndicators: [
          { indicator: 'Tâches globales exécutées', planned: 20, unit: 'tâches' },
        ],
      },
      difficulties: { visible: true, title: '7. Difficultés Rencontrées' },
      recom: { visible: true, title: '8. Recommandations' },
      billetage: {
        visible: true,
        required: false,
        title: '9. Raccordement Billetage Caisse',
        explanation: 'Liez votre billetage si vous avez tenu une caisse physique.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie l\'exactitude de l\'ensemble des activités renseignées dans ce rapport polyvalent.',
      },
    },
  },

  // 8. DIRECTION D'AGENCE
  direction_agence: {
    profile: 'direction_agence',
    label: 'Direction d\'Agence & Supervision',
    shortLabel: 'Direction Agence',
    badge: {
      text: 'Supervision & Agence',
      bgColor: 'bg-slate-100 dark:bg-slate-800',
      textColor: 'text-slate-800 dark:text-slate-200',
      borderColor: 'border-slate-300 dark:border-slate-700',
    },
    description: 'Synthèses d\'agence, supervision des guichets, suivi des incidents et transmissions hiérarchiques.',
    defaultReportType: 'global',
    allowedReportTypes: [
      { value: 'global', label: 'Rapport de Synthèse Générale d\'Agence' },
      { value: 'supervision', label: 'Rapport de Contrôle & Supervision' },
      { value: 'hebdomadaire', label: 'Rapport Hebdomadaire Consolidé' },
      { value: 'mensuel', label: 'Rapport Mensuel d\'Agence' },
      { value: 'incident', label: 'Rapport d\'Incident Majeur' },
    ],
    defaultCategory: 'polyvalent',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Synthèse hebdomadaire des opérations et de la trésorerie de l\'agence',
    summaryPlaceholder: 'Performance globale de l\'agence, climat de travail, solvabilité, incidents marquants et plans d\'action...',
    summaryHelperText: 'Rapport consolidé destiné à la Direction Générale et à l\'audit interne.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations de l\'Agence' },
      summary: { visible: true, required: true, title: '2. Synthèse de Supervision' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: true,
        showDiscrepancy: true,
        title: '3. Performance Globale Agence',
      },
      category: {
        visible: true,
        title: '4. Volet Supervision Agence',
        allowedFields: [
          'activeSelectedCategories',
          'accountingPeriodName',
          'cashOperationsCount',
          'tellerOperationsCount',
          'virtualOperationsCount',
          'exchangeOperationsCount',
          'accountingObservations',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Actions de Supervision Réalisées',
        defaultTemplates: [
          {
            title: 'Contrôle inopiné des caisses et coffres de l\'agence',
            description: 'Vérification physique des encaisses de chaque guichetier.',
            result: 'Tous les guichetiers sont en conformité de caisse.',
          },
          {
            title: 'Briefing d\'équipe et consignes de conformité',
            description: 'Rappel des protocoles de sécurité et de vigilance anti-fraude.',
            result: 'Équipe sensibilisée et consignes appliquées.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Indicateurs Clés de l\'Agence',
        defaultIndicators: [
          { indicator: 'Contrôles de caisse menés', planned: 5, unit: 'contrôles' },
          { indicator: 'Rapports d\'agents examinés', planned: 10, unit: 'rapports' },
        ],
      },
      difficulties: { visible: true, title: '7. Incidents & Points de Blocage Agence' },
      recom: { visible: true, title: '8. Demandes de Moyens & Arbitrages DG' },
      billetage: {
        visible: true,
        required: false,
        title: '9. Clôture Globale de l\'Agence',
        explanation: 'Consolidation des caisses de l\'agence.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'En qualité de Responsable d\'Agence, je certifie la fidélité de ce rapport consolidé.',
      },
    },
  },

  // 9. GÉNÉRAL / AUTRE
  general: {
    profile: 'general',
    label: 'Standard / Collaborateur',
    shortLabel: 'Standard',
    badge: {
      text: 'Rapport Standard',
      bgColor: 'bg-slate-100 dark:bg-slate-800',
      textColor: 'text-slate-700 dark:text-slate-300',
      borderColor: 'border-slate-200 dark:border-slate-700',
    },
    description: 'Formulaire complet polyvalent pour tout collaborateur du réseau ETS AMANI.',
    defaultReportType: 'activite',
    allowedReportTypes: [
      { value: 'activite', label: 'Rapport d\'Activité' },
      { value: 'quotidien', label: 'Rapport Journalier' },
      { value: 'operationnel', label: 'Rapport Opérationnel' },
      { value: 'incident', label: 'Rapport d\'Incident' },
      { value: 'autre', label: 'Autre document' },
    ],
    defaultCategory: 'guichetier',
    defaultPriority: 'normal',
    titlePlaceholder: 'Ex: Rapport d\'activité professionnelle',
    summaryPlaceholder: 'Résumé des faits marquants et résultats de la période...',
    summaryHelperText: 'Présentez une synthèse claire de votre travail.',
    sections: {
      general: { visible: true, required: true, title: '1. Informations Générales' },
      summary: { visible: true, required: true, title: '2. Synthèse Exécutive' },
      metrics: {
        visible: true,
        showMissions: true,
        showBilletage: true,
        showDiscrepancy: true,
        title: '3. Métriques Enregistrées',
      },
      category: {
        visible: true,
        title: '4. Volet Spécifique',
        allowedFields: [
          'tellerOperationsCount',
          'clientsServedCount',
          'pendingTransactionsCount',
        ],
      },
      activities: {
        visible: true,
        required: true,
        title: '5. Activités Réalisées',
        defaultTemplates: [
          {
            title: 'Exécution des tâches professionnelles assignées',
            description: 'Mise en œuvre des directives du responsable de service.',
            result: 'Tâches accomplies selon le planning.',
          },
        ],
      },
      results: {
        visible: true,
        title: '6. Objectifs et Ratios',
        defaultIndicators: [
          { indicator: 'Tâches finalisées', planned: 10, unit: 'tâches' },
        ],
      },
      difficulties: { visible: true, title: '7. Difficultés Éventuelles' },
      recom: { visible: true, title: '8. Propositions' },
      billetage: {
        visible: true,
        required: false,
        title: '9. Billetage Associé',
        explanation: 'Associer un enregistrement de caisse si pertinent.',
      },
      certification: {
        visible: true,
        required: true,
        statement: 'Je certifie l\'exactitude des renseignements fournis.',
      },
    },
  },
};

/**
 * Résout le profil de rapport adéquat selon la fonction de l'utilisateur, son rôle et ses options.
 */
export function resolveReportUserProfile(
  userFunction?: UserFunction | string | null,
  userRole?: UserRole | string | null,
  multiServiceEnabled?: boolean
): ReportUserProfile {
  if (multiServiceEnabled) {
    return 'agent_polyvalent';
  }

  // 1. Rôles de Direction
  if (userRole === 'administrateur_agence' || userRole === 'directeur_general' || userRole === 'administrateur_systeme') {
    return 'direction_agence';
  }

  // 2. Fonctions opérationnelles
  switch (userFunction) {
    case 'comptable':
    case 'comptabilite':
      return 'agent_comptable';

    case 'caisse':
      return 'caissier';

    case 'guichetier':
      return 'guichetier';

    case 'agent_change':
      return 'agent_change';

    case 'agent_virtuel':
    case 'agent_vodae':
    case 'agent_operateur_mobile':
      return 'agent_virtuel';

    case 'agent_terrain':
    case 'chauffeur':
    case 'cleaner':
      return 'agent_terrain';

    default:
      return 'general';
  }
}

/**
 * Obtient la configuration centralisée pour un utilisateur donné ou un profil spécifique.
 */
export function getReportFormConfig(
  userFunctionOrProfile?: string | null,
  userRole?: string | null,
  multiServiceEnabled?: boolean
): ReportFormConfiguration {
  if (userFunctionOrProfile && userFunctionOrProfile in REPORT_FORM_CONFIGURATIONS) {
    return REPORT_FORM_CONFIGURATIONS[userFunctionOrProfile as ReportUserProfile];
  }

  const profile = resolveReportUserProfile(userFunctionOrProfile, userRole, multiServiceEnabled);
  return REPORT_FORM_CONFIGURATIONS[profile] || REPORT_FORM_CONFIGURATIONS.general;
}

/**
 * Détermine dynamiquement si une section est visible dans le formulaire.
 * En mode personnalisé, l'utilisateur a accès à toutes les sections s'il le souhaite.
 */
export function isSectionVisible(
  config: ReportFormConfiguration,
  sectionKey: ReportFormSectionKey,
  formMode: 'guide' | 'personnalise' = 'guide'
): boolean {
  if (formMode === 'personnalise') {
    return true; // En mode personnalisé, toutes les sections sont déployables
  }
  return config.sections[sectionKey]?.visible ?? true;
}

/**
 * Détermine si un champ spécifique de la catégorie adaptative doit être visible.
 * En mode guidé, seuls les champs pertinents pour le profil sont visibles.
 */
export function isCategoryFieldVisible(
  config: ReportFormConfiguration,
  fieldKey: keyof AgentCategorySpecificData,
  formMode: 'guide' | 'personnalise' = 'guide'
): boolean {
  if (formMode === 'personnalise') {
    return true;
  }
  return config.sections.category.allowedFields.includes(fieldKey);
}
