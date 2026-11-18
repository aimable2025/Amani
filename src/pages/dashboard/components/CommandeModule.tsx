import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock,
  FilePlus2,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../lib/db';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import { getAgencyUsersByRole, type AgencyUser } from '../../../services/AgencyUserService';
import {
  addClientOrderComment,
  compressOrderAttachment,
  createClientOrder,
  fetchScopedClientOrders,
} from '../../../services/ClientOrderService';
import {
  CLIENT_ORDER_CATEGORY_LABELS,
  CLIENT_ORDER_STATUS_LABELS,
  CLIENT_ORDER_TRANSACTION_LABELS,
  MOBILE_MONEY_OPERATORS,
  type ClientOrder,
  type ClientOrderAttachment,
  type ClientOrderCategory,
  type ClientOrderPriority,
  type ClientOrderStatus,
  type ClientOrderTransactionType,
} from '../../../types/clientOrder';
import type { Operation } from '../../../types/operation';

export type CommandeSectionId =
  | 'nouvelle_commande'
  | 'transaction_non_recue'
  | 'reclamation_service'
  | 'restitution_argent'
  | 'mes_demandes';

type StatusFilterTab =
  | 'all'
  | 'soumise'
  | 'en_attente_info'
  | 'en_cours_group'
  | 'traitee'
  | 'cloturee'
  | 'rejetee';

interface CommandeModuleProps {
  initialSection?: CommandeSectionId;
  onClose?: () => void;
  onOrdersChanged?: () => void;
}

const SECTION_CARDS: Array<{
  id: CommandeSectionId;
  title: string;
  subtitle: string;
  icon: typeof FilePlus2;
  accent: string;
}> = [
  {
    id: 'nouvelle_commande',
    title: 'Nouvelle commande',
    subtitle: 'Demander une opération à un agent',
    icon: FilePlus2,
    accent: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  },
  {
    id: 'transaction_non_recue',
    title: 'Transaction non reçue',
    subtitle: 'Signaler des fonds attendus non reçus',
    icon: AlertCircle,
    accent: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
  {
    id: 'reclamation_service',
    title: 'Réclamation de service',
    subtitle: 'Signaler un incident sur un service',
    icon: ShieldAlert,
    accent: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  },
  {
    id: 'restitution_argent',
    title: 'Restitution d’argent',
    subtitle: 'Demander le remboursement d’un versement',
    icon: RotateCcw,
    accent: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  },
  {
    id: 'mes_demandes',
    title: 'Mes demandes',
    subtitle: 'Suivi, réponses et historique complet',
    icon: ClipboardList,
    accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
];

function getStatusBadgeClasses(status: ClientOrderStatus): string {
  switch (status) {
    case 'soumise':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300';
    case 'en_attente_info':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300';
    case 'prise_en_charge':
    case 'en_cours':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300';
    case 'traitee':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300';
    case 'cloturee':
      return 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    case 'rejetee':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

export default function CommandeModule({
  initialSection = 'mes_demandes',
  onClose,
  onOrdersChanged,
}: CommandeModuleProps) {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<CommandeSectionId>(initialSection);

  // Données référentielles
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyAgents, setAgencyAgents] = useState<AgencyUser[]>([]);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [userOperations, setUserOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Formulaire adaptatif partagé par catégorie
  const [transactionType, setTransactionType] =
    useState<ClientOrderTransactionType>('depot_mobile_money');
  const [operatorName, setOperatorName] = useState<string>(MOBILE_MONEY_OPERATORS[0]);
  const [concernedPhone, setConcernedPhone] = useState('');
  const [beneficiaryPhone, setBeneficiaryPhone] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'CDF'>('USD');
  const [approxDate, setApproxDate] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [relatedOrderId, setRelatedOrderId] = useState('');
  const [agencyId, setAgencyId] = useState<string>(user?.agencyId || '');
  const [targetAgentId, setTargetAgentId] = useState<string>('');
  const [priority, setPriority] = useState<ClientOrderPriority>('normale');
  const [description, setDescription] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [attachment, setAttachment] = useState<ClientOrderAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Étape de vérification avant envoi (Nouvelle commande)
  const [reviewMode, setReviewMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<ClientOrder | null>(null);

  // Suivi & filtres
  const [statusTab, setStatusTab] = useState<StatusFilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ClientOrderCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ClientOrder | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSection(initialSection);
    setReviewMode(false);
    setFormError(null);
  }, [initialSection]);

  const loadData = async (forceRemote = true) => {
    if (!user) return;
    setRefreshing(true);
    try {
      const [agenciesList, scopedOrders, allOps] = await Promise.all([
        getAgencies(),
        fetchScopedClientOrders(user, forceRemote),
        db.operations.toArray(),
      ]);

      const activeAgencies = agenciesList.filter((a) => a.status !== 'inactive');
      setAgencies(activeAgencies);
      if (!agencyId) {
        if (user.agencyId) {
          setAgencyId(user.agencyId);
        } else if (activeAgencies.length > 0) {
          setAgencyId(activeAgencies[0].id);
        }
      }

      setOrders(scopedOrders);

      const mineOps = allOps
        .filter(
          (op) =>
            op.createdBy === user.uid ||
            op.clientUid === user.uid ||
            (user.phone && op.accountNumber === user.phone) ||
            (user.phoneNumber && op.accountNumber === user.phoneNumber),
        )
        .sort((a, b) => b.createdAt - a.createdAt);
      setUserOperations(mineOps);

      if (selectedOrder) {
        const refreshed = scopedOrders.find((o) => o.id === selectedOrder.id) || null;
        setSelectedOrder(refreshed);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [user?.uid]);

  useEffect(() => {
    if (!agencyId) {
      setAgencyAgents([]);
      return;
    }
    getAgencyUsersByRole(agencyId, 'agent')
      .then((list) => {
        setAgencyAgents(list.filter((a) => a.status === 'active' && a.isApproved));
      })
      .catch(() => setAgencyAgents([]));
  }, [agencyId]);

  useEffect(() => {
    if (user?.phone && !concernedPhone) {
      setConcernedPhone(user.phone);
    }
  }, [user?.phone]);

  const resetFormFields = () => {
    setBeneficiaryPhone('');
    setBeneficiaryName('');
    setAmountInput('');
    setApproxDate('');
    setTransactionReference('');
    setRelatedOrderId('');
    setTargetAgentId('');
    setPriority('normale');
    setDescription('');
    setAdditionalInfo('');
    setAttachment(null);
    setAttachmentError(null);
    setFormError(null);
    setReviewMode(false);
  };

  const selectedAgencyObj = useMemo(
    () => agencies.find((a) => a.id === agencyId) || null,
    [agencies, agencyId],
  );

  const selectedAgentObj = useMemo(
    () => agencyAgents.find((a) => a.uid === targetAgentId) || null,
    [agencyAgents, targetAgentId],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setAttachmentError(null);
    if (!file) return;
    try {
      const processed = await compressOrderAttachment(file);
      setAttachment(processed);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Fichier invalide.');
    } finally {
      e.target.value = '';
    }
  };

  const isMobileMoneyOp =
    transactionType === 'depot_mobile_money' || transactionType === 'retrait_mobile_money';
  const isTransferOp = transactionType === 'transfert_inter_agence';

  const validateCurrentForm = (category: ClientOrderCategory): string | null => {
    const parsedAmount = Number(amountInput);
    if (category === 'nouvelle_commande') {
      if (!agencyId) return 'Veuillez choisir une agence Ets AMANI.';
      if (!amountInput || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return 'Veuillez indiquer un montant valide supérieur à 0.';
      }
      if (isMobileMoneyOp && !concernedPhone.trim()) {
        return 'Le numéro Mobile Money concerné est requis.';
      }
      if (isTransferOp && !beneficiaryPhone.trim() && !beneficiaryName.trim()) {
        return 'Veuillez renseigner le bénéficiaire ou son numéro.';
      }
      if (description.trim().length < 6) {
        return 'Veuillez préciser les instructions pour l’agent (au moins 6 caractères).';
      }
    } else if (category === 'transaction_non_recue') {
      if (!concernedPhone.trim() && !transactionReference.trim()) {
        return 'Indiquez au moins le numéro concerné ou la référence de la transaction.';
      }
      if (description.trim().length < 6) {
        return 'Veuillez expliquer brièvement la situation (au moins 6 caractères).';
      }
    } else if (category === 'reclamation_service') {
      if (description.trim().length < 6) {
        return 'Veuillez décrire l’objet de votre réclamation (au moins 6 caractères).';
      }
    } else if (category === 'restitution_argent') {
      if (!amountInput || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return 'Veuillez saisir le montant exact dont vous demandez la restitution.';
      }
      if (!concernedPhone.trim() && !transactionReference.trim()) {
        return 'Indiquez le numéro concerné ou la référence du paiement.';
      }
      if (description.trim().length < 8) {
        return 'Veuillez détailler le motif de votre demande de restitution (au moins 8 caractères).';
      }
    }
    return null;
  };

  const handlePreSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitSuccess(null);
    if (activeSection === 'mes_demandes') return;

    const validationError = validateCurrentForm(activeSection);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (activeSection === 'nouvelle_commande' && !reviewMode) {
      setReviewMode(true);
      return;
    }

    void executeSubmit(activeSection);
  };

  const executeSubmit = async (category: ClientOrderCategory) => {
    if (!user) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const parsedAmount = Number(amountInput);
      const created = await createClientOrder(
        {
          category,
          transactionType,
          operatorName: isMobileMoneyOp || category !== 'nouvelle_commande' ? operatorName : undefined,
          concernedPhone: concernedPhone.trim() || undefined,
          beneficiaryPhone: beneficiaryPhone.trim() || undefined,
          beneficiaryName: beneficiaryName.trim() || undefined,
          amount: !Number.isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : undefined,
          currency,
          approxDate: approxDate || undefined,
          transactionReference: transactionReference.trim() || undefined,
          relatedOrderId: relatedOrderId || undefined,
          agencyId: agencyId || user.agencyId || null,
          agencyName: selectedAgencyObj?.name || (agencyId ? `Agence ${agencyId}` : 'Réseau Ets AMANI'),
          targetAgentId: targetAgentId || null,
          targetAgentName: selectedAgentObj?.displayName || null,
          description: description.trim(),
          additionalInfo: additionalInfo.trim() || undefined,
          attachment,
          priority:
            category === 'nouvelle_commande'
              ? priority
              : category === 'restitution_argent' || category === 'transaction_non_recue'
                ? 'urgente'
                : 'normale',
        },
        user,
      );

      setSubmitSuccess(created);
      resetFormFields();
      await loadData(false);
      onOrdersChanged?.();
      setActiveSection('mes_demandes');
      setStatusTab('all');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de l’envoi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedOrder) return;
    setReplyError(null);
    setReplySubmitting(true);
    try {
      const updated = await addClientOrderComment(selectedOrder.id, replyText, user);
      setReplyText('');
      setSelectedOrder(updated);
      await loadData(false);
      onOrdersChanged?.();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Impossible d’envoyer le message.');
    } finally {
      setReplySubmitting(false);
    }
  };

  const statusCounts = useMemo(() => {
    return {
      all: orders.length,
      soumise: orders.filter((o) => o.status === 'soumise').length,
      en_attente_info: orders.filter((o) => o.status === 'en_attente_info').length,
      en_cours_group: orders.filter(
        (o) => o.status === 'prise_en_charge' || o.status === 'en_cours',
      ).length,
      traitee: orders.filter((o) => o.status === 'traitee').length,
      cloturee: orders.filter((o) => o.status === 'cloturee').length,
      rejetee: orders.filter((o) => o.status === 'rejetee').length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (categoryFilter !== 'all' && o.category !== categoryFilter) return false;
      if (statusTab === 'en_cours_group') {
        if (o.status !== 'prise_en_charge' && o.status !== 'en_cours') return false;
      } else if (statusTab !== 'all' && o.status !== statusTab) {
        return false;
      }
      if (!q) return true;
      return (
        o.reference.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.agencyName.toLowerCase().includes(q) ||
        (o.concernedPhone || '').toLowerCase().includes(q) ||
        (o.transactionReference || '').toLowerCase().includes(q)
      );
    });
  }, [orders, categoryFilter, statusTab, searchQuery]);

  const activePendingCount =
    statusCounts.soumise + statusCounts.en_attente_info + statusCounts.en_cours_group;

  return (
    <div className="space-y-4">
      {/* Barre supérieure compacte */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Commande & Réclamations
            </h2>
            {activePendingCount > 0 && (
              <span className="rounded-md bg-blue-50 dark:bg-blue-950/70 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                {activePendingCount} en suivi
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Soumettez une commande de transaction ou suivez une réclamation auprès de votre agence Ets AMANI
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-bold text-white dark:text-slate-900 hover:opacity-90"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Accueil
            </button>
          )}
        </div>
      </div>

      {/* Confirmation de soumission réussie */}
      {submitSuccess && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 p-3.5 flex items-start justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-200"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Demande enregistrée : {submitSuccess.reference}
              </p>
              <p className="mt-0.5 opacity-90">
                {CLIENT_ORDER_CATEGORY_LABELS[submitSuccess.category]} transmise à{' '}
                <strong>{submitSuccess.agencyName}</strong>. Statut actuel :{' '}
                <strong>{CLIENT_ORDER_STATUS_LABELS[submitSuccess.status]}</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSubmitSuccess(null)}
            className="rounded-lg p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Navigation claire entre les 4 catégories et Mes demandes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
        {SECTION_CARDS.map((card) => {
          const Icon = card.icon;
          const active = activeSection === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setActiveSection(card.id);
                setFormError(null);
                setReviewMode(false);
              }}
              className={[
                'text-left rounded-xl border p-3 transition flex flex-col justify-between gap-2',
                active
                  ? 'border-[#C58B39] bg-amber-50/40 dark:bg-amber-950/20 ring-1 ring-[#C58B39]/50'
                  : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {card.id === 'mes_demandes' && orders.length > 0 && (
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-700 dark:text-slate-300">
                    {orders.length}
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {card.title}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  {card.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* CONTENU : FORMULAIRES PAR CATÉGORIE */}
      {activeSection !== 'mes_demandes' ? (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {activeSection === 'nouvelle_commande' && 'A. Nouvelle commande de transaction'}
                {activeSection === 'transaction_non_recue' && 'B. Signaler une transaction non reçue'}
                {activeSection === 'reclamation_service' && 'C. Déposer une réclamation de service'}
                {activeSection === 'restitution_argent' && 'D. Demande de restitution d’argent'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {activeSection === 'nouvelle_commande' &&
                  'Demandez à un agent Ets AMANI d’exécuter une opération avec instructions précises.'}
                {activeSection === 'transaction_non_recue' &&
                  'Signalez une opération attendue mais non reçue afin qu’un agent vérifie la trace.'}
                {activeSection === 'reclamation_service' &&
                  'Remontez tout incident ou retard constaté lors d’un service.'}
                {activeSection === 'restitution_argent' &&
                  'Demandez le remboursement d’un montant remis sans réception du service attendu.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('mes_demandes')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline self-start sm:self-auto"
            >
              Voir mes demandes ({orders.length})
            </button>
          </div>

          {activeSection === 'restitution_argent' && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Procédure officielle de vérification</p>
                <p className="mt-0.5 opacity-90">
                  La soumission d’une demande de restitution enregistre une réclamation officielle. Elle ne déclenche aucun remboursement automatique et doit être examinée puis décidée par le responsable d’agence ou la Direction.
                </p>
              </div>
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-3 text-xs font-semibold text-rose-800 dark:text-rose-200"
            >
              {formError}
            </div>
          )}

          {/* Étape de confirmation avant envoi pour Nouvelle commande */}
          {activeSection === 'nouvelle_commande' && reviewMode ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200/70 dark:border-blue-800/70 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                    Récapitulatif avant soumission
                  </span>
                  <span className="rounded bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-200 uppercase">
                    {priority === 'urgente' ? 'Urgente' : 'Normale'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Service demandé
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {CLIENT_ORDER_TRANSACTION_LABELS[transactionType]}
                      {isMobileMoneyOp ? ` · ${operatorName}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Montant
                    </span>
                    <span className="font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {Number(amountInput).toLocaleString('fr-FR')} {currency}
                    </span>
                  </div>
                  {concernedPhone && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Numéro concerné
                      </span>
                      <span className="font-semibold tabular-nums">{concernedPhone}</span>
                    </div>
                  )}
                  {(beneficiaryPhone || beneficiaryName) && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Bénéficiaire
                      </span>
                      <span className="font-semibold">
                        {[beneficiaryName, beneficiaryPhone].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Agence destinataire
                    </span>
                    <span className="font-semibold">
                      {selectedAgencyObj?.name || agencyId || 'Réseau Ets AMANI'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Agent visé
                    </span>
                    <span className="font-semibold">
                      {selectedAgentObj?.displayName || 'Premier agent disponible de l’agence'}
                    </span>
                  </div>
                </div>

                <div className="text-xs pt-2 border-t border-blue-200/60 dark:border-blue-800/60">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Instructions à l’agent
                  </span>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200 whitespace-pre-line">
                    {description}
                  </p>
                  {additionalInfo && (
                    <p className="mt-1 text-slate-500 dark:text-slate-400 italic">
                      Infos complémentaires : {additionalInfo}
                    </p>
                  )}
                </div>

                {attachment && (
                  <div className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>Pièce jointe : {attachment.name}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewMode(false)}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void executeSubmit('nouvelle_commande')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-4 py-2 text-xs font-bold text-white dark:text-[#0B192C] hover:opacity-95 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting ? 'Envoi en cours...' : 'Confirmer et envoyer la commande'}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePreSubmitReview} className="space-y-4 text-xs">
              {/* Lier une commande/opération existante pour Réclamation */}
              {activeSection === 'reclamation_service' && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Commande ou opération concernée (optionnel)
                  </label>
                  <select
                    value={relatedOrderId}
                    onChange={(e) => setRelatedOrderId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  >
                    <option value="">Aucune / Réclamation générale</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.reference}>
                        {o.reference} — {CLIENT_ORDER_CATEGORY_LABELS[o.category]} (
                        {CLIENT_ORDER_STATUS_LABELS[o.status]})
                      </option>
                    ))}
                    {userOperations.map((op) => (
                      <option key={op.id} value={op.operationNumber}>
                        {op.operationNumber} — {op.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Type de transaction / service */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {activeSection === 'restitution_argent'
                      ? 'Service initial concerné *'
                      : 'Type de transaction / service *'}
                  </label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value as ClientOrderTransactionType)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  >
                    {(Object.keys(CLIENT_ORDER_TRANSACTION_LABELS) as ClientOrderTransactionType[]).map(
                      (key) => (
                        <option key={key} value={key}>
                          {CLIENT_ORDER_TRANSACTION_LABELS[key]}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                {(isMobileMoneyOp || activeSection !== 'nouvelle_commande') && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Opérateur / Canal {isMobileMoneyOp ? '*' : '(optionnel)'}
                    </label>
                    <select
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                    >
                      {MOBILE_MONEY_OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Montant + Devise + Agence */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Montant{' '}
                    {activeSection === 'nouvelle_commande' || activeSection === 'restitution_argent'
                      ? '*'
                      : '(optionnel)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="Ex: 150"
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white tabular-nums outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Devise
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'USD' | 'CDF')}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CDF">CDF (FC)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Agence Ets AMANI *
                  </label>
                  <select
                    value={agencyId}
                    onChange={(e) => {
                      setAgencyId(e.target.value);
                      setTargetAgentId('');
                    }}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  >
                    <option value="">Sélectionner une agence</option>
                    {agencies.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name}
                        {ag.city ? ` (${ag.city})` : ''}
                      </option>
                    ))}
                    {user?.agencyId && !agencies.some((a) => a.id === user.agencyId) && (
                      <option value={user.agencyId}>Mon agence ({user.agencyId})</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Numéros & Bénéficiaire adaptés */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Numéro concerné{' '}
                    {isMobileMoneyOp && activeSection === 'nouvelle_commande' ? '*' : ''}
                  </label>
                  <input
                    type="tel"
                    value={concernedPhone}
                    onChange={(e) => setConcernedPhone(e.target.value)}
                    placeholder="Ex: +243 99..."
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white tabular-nums outline-none focus:border-slate-400"
                  />
                </div>

                {(isTransferOp || activeSection === 'transaction_non_recue') && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Numéro du bénéficiaire{' '}
                      {isTransferOp && activeSection === 'nouvelle_commande'
                        ? '*'
                        : '(si applicable)'}
                    </label>
                    <input
                      type="tel"
                      value={beneficiaryPhone}
                      onChange={(e) => setBeneficiaryPhone(e.target.value)}
                      placeholder="Ex: +243 81..."
                      className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white tabular-nums outline-none focus:border-slate-400"
                    />
                  </div>
                )}

                {isTransferOp && activeSection === 'nouvelle_commande' && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nom complet du bénéficiaire
                    </label>
                    <input
                      type="text"
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
                      placeholder="Nom & prénom du destinataire"
                      className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                    />
                  </div>
                )}

                {(activeSection === 'transaction_non_recue' ||
                  activeSection === 'restitution_argent') && (
                  <>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Référence / ID transaction (optionnel)
                      </label>
                      <input
                        type="text"
                        value={transactionReference}
                        onChange={(e) => setTransactionReference(e.target.value)}
                        placeholder="Ex: MP2604... ou OP-..."
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white font-mono outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Date approximative (optionnel)
                      </label>
                      <input
                        type="date"
                        value={approxDate}
                        onChange={(e) => setApproxDate(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {activeSection === 'nouvelle_commande'
                      ? 'Agent souhaité (optionnel)'
                      : 'Agent connu (optionnel)'}
                  </label>
                  <select
                    value={targetAgentId}
                    onChange={(e) => setTargetAgentId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  >
                    <option value="">Attribution par l’agence / Non précisé</option>
                    {agencyAgents.map((ag) => (
                      <option key={ag.uid} value={ag.uid}>
                        {ag.displayName}
                        {ag.function ? ` (${ag.function.replace(/_/g, ' ')})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {activeSection === 'nouvelle_commande' && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Priorité de traitement
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as ClientOrderPriority)}
                      className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                    >
                      <option value="normale">Normale</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Description / Instructions / Motif */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {activeSection === 'nouvelle_commande'
                    ? 'Instructions utiles à l’agent *'
                    : activeSection === 'restitution_argent'
                      ? 'Motif précis de la demande de restitution *'
                      : 'Explication détaillée du problème *'}
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    activeSection === 'nouvelle_commande'
                      ? 'Précisez comment l’opération doit être effectuée (nom sur le compte, heure souhaitée, remarques)...'
                      : activeSection === 'restitution_argent'
                        ? 'Expliquez quand et comment les fonds ont été remis, et pourquoi le service attendu n’a pas été rendu...'
                        : 'Décrivez les faits avec le maximum de précision...'
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                />
              </div>

              {/* Informations complémentaires & Pièce justificative */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Informations complémentaires (optionnel)
                  </label>
                  <input
                    type="text"
                    value={additionalInfo}
                    onChange={(e) => setAdditionalInfo(e.target.value)}
                    placeholder="Remarque ou canal de rappel préféré"
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Pièce justificative / capture (optionnel)
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      <Paperclip className="h-3.5 w-3.5" />
                      <span className="truncate">
                        {attachment ? attachment.name : 'Joindre image ou PDF'}
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => void handleFileChange(e)}
                        className="hidden"
                      />
                    </label>
                    {attachment && (
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="h-9 px-2.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                        title="Retirer la pièce jointe"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {attachmentError && (
                    <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                      {attachmentError}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={resetFormFields}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Réinitialiser
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-4 py-2 font-bold text-white dark:text-[#0B192C] hover:opacity-95 disabled:opacity-50"
                >
                  {activeSection === 'nouvelle_commande' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Vérifier ma commande</span>
                    </>
                  ) : activeSection === 'restitution_argent' ? (
                    <>
                      <Banknote className="h-3.5 w-3.5" />
                      <span>
                        {submitting ? 'Envoi...' : 'Demander la restitution de mon argent'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>{submitting ? 'Envoi...' : 'Soumettre la réclamation'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* SECTION E : MES DEMANDES & HISTORIQUE */
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Suivi & Historique de mes demandes
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Consultez l’avancement réel, les réponses des agents et les décisions de restitution
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('nouvelle_commande')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C] hover:opacity-95 self-start sm:self-auto"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              Nouvelle commande
            </button>
          </div>

          {/* Onglets par statut */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {(
              [
                { id: 'all', label: 'Toutes', count: statusCounts.all },
                { id: 'soumise', label: 'Nouvelles', count: statusCounts.soumise },
                { id: 'en_attente_info', label: 'En attente', count: statusCounts.en_attente_info },
                { id: 'en_cours_group', label: 'En cours', count: statusCounts.en_cours_group },
                { id: 'traitee', label: 'Traitées', count: statusCounts.traitee },
                { id: 'cloturee', label: 'Clôturées', count: statusCounts.cloturee },
                { id: 'rejetee', label: 'Rejetées', count: statusCounts.rejetee },
              ] as Array<{ id: StatusFilterTab; label: string; count: number }>
            ).map((tab) => {
              const active = statusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusTab(tab.id)}
                  className={[
                    'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap',
                    active
                      ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
                  ].join(' ')}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono tabular-nums opacity-80">
                    ({tab.count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filtres catégorie + recherche */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par référence (CMD-..., REC-..., RST-...), numéro ou motif..."
                className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-9 pr-3 text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | ClientOrderCategory)}
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="all">Toutes les catégories</option>
              {(Object.keys(CLIENT_ORDER_CATEGORY_LABELS) as ClientOrderCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CLIENT_ORDER_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Chargement de vos demandes...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-10 text-center space-y-2">
              <ClipboardList className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Aucune demande trouvée dans cette vue
              </p>
              <p className="text-[11px] text-slate-400">
                Soumettez une nouvelle commande de transaction ou une réclamation depuis les boutons ci-dessus.
              </p>
            </div>
          ) : (
            <>
              {/* Liste compacte mobile */}
              <div className="space-y-2.5 md:hidden">
                {filteredOrders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrder(o)}
                    className="w-full text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3 space-y-2 hover:border-[#C58B39]/60 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-900 dark:text-white">
                        {o.reference}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusBadgeClasses(o.status)}`}
                      >
                        {CLIENT_ORDER_STATUS_LABELS[o.status]}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {CLIENT_ORDER_CATEGORY_LABELS[o.category]} ·{' '}
                      {CLIENT_ORDER_TRANSACTION_LABELS[o.transactionType]}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                      {o.description}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                      <span>{o.agencyName}</span>
                      <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                        {o.amount ? `${o.amount.toLocaleString('fr-FR')} ${o.currency}` : new Date(o.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Tableau structuré desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="p-2.5">Référence</th>
                      <th className="p-2.5">Catégorie & Service</th>
                      <th className="p-2.5">Agence / Agent</th>
                      <th className="p-2.5">Montant</th>
                      <th className="p-2.5">Statut</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5 text-right">Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredOrders.map((o) => (
                      <tr
                        key={o.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer"
                        onClick={() => setSelectedOrder(o)}
                      >
                        <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {o.reference}
                        </td>
                        <td className="p-2.5">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {CLIENT_ORDER_CATEGORY_LABELS[o.category]}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {CLIENT_ORDER_TRANSACTION_LABELS[o.transactionType]}
                          </p>
                        </td>
                        <td className="p-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {o.agencyName}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {o.assignedAgentName ? `Agent : ${o.assignedAgentName}` : 'En attente d’agent'}
                          </p>
                        </td>
                        <td className="p-2.5 font-bold tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
                          {o.amount ? `${o.amount.toLocaleString('fr-FR')} ${o.currency}` : '—'}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusBadgeClasses(o.status)}`}
                          >
                            {CLIENT_ORDER_STATUS_LABELS[o.status]}
                          </span>
                          {o.category === 'restitution_argent' && o.refundDecision && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              Restitution : {o.refundDecision}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="p-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrder(o);
                            }}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Ouvrir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Détail Demande */}
      {selectedOrder && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedOrder(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {selectedOrder.reference}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusBadgeClasses(selectedOrder.status)}`}
                  >
                    {CLIENT_ORDER_STATUS_LABELS[selectedOrder.status]}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-black mt-1.5">
                  {CLIENT_ORDER_CATEGORY_LABELS[selectedOrder.category]} ·{' '}
                  {CLIENT_ORDER_TRANSACTION_LABELS[selectedOrder.transactionType]}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {selectedOrder.status === 'en_attente_info' && selectedOrder.infoRequestedMessage && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 space-y-1 text-amber-900 dark:text-amber-200">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Informations complémentaires demandées par l’agence
                  </p>
                  <p>{selectedOrder.infoRequestedMessage}</p>
                  <p className="text-[11px] opacity-80">
                    Répondez dans la messagerie du dossier ci-dessous pour relancer le traitement.
                  </p>
                </div>
              )}

              {selectedOrder.resolutionNote && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 space-y-1 text-emerald-900 dark:text-emerald-200">
                  <p className="font-bold">Réponse / Résolution officielle</p>
                  <p>{selectedOrder.resolutionNote}</p>
                </div>
              )}

              {selectedOrder.rejectionReason && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 space-y-1 text-rose-900 dark:text-rose-200">
                  <p className="font-bold">Motif du rejet</p>
                  <p>{selectedOrder.rejectionReason}</p>
                </div>
              )}

              {/* Grille Infos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Agence
                  </span>
                  <span className="font-semibold">{selectedOrder.agencyName}</span>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Agent assigné
                  </span>
                  <span className="font-semibold flex items-center gap-1">
                    <UserCheck className="h-3 w-3 text-slate-400" />
                    {selectedOrder.assignedAgentName || 'En attente'}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Montant
                  </span>
                  <span className="font-bold tabular-nums">
                    {selectedOrder.amount
                      ? `${selectedOrder.amount.toLocaleString('fr-FR')} ${selectedOrder.currency}`
                      : 'Non précisé'}
                  </span>
                </div>
                {selectedOrder.concernedPhone && (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Numéro concerné
                    </span>
                    <span className="font-semibold tabular-nums">{selectedOrder.concernedPhone}</span>
                  </div>
                )}
                {selectedOrder.beneficiaryPhone && (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Bénéficiaire
                    </span>
                    <span className="font-semibold tabular-nums">
                      {[selectedOrder.beneficiaryName, selectedOrder.beneficiaryPhone]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                {selectedOrder.transactionReference && (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Référence tx
                    </span>
                    <span className="font-mono font-semibold">
                      {selectedOrder.transactionReference}
                    </span>
                  </div>
                )}
              </div>

              {selectedOrder.category === 'restitution_argent' && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 flex items-center justify-between">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    Décision sur la restitution financière :
                  </span>
                  <span className="font-bold uppercase">
                    {selectedOrder.refundDecision === 'acceptee'
                      ? 'Acceptée'
                      : selectedOrder.refundDecision === 'rejetee'
                        ? 'Rejetée'
                        : 'En examen'}
                  </span>
                </div>
              )}

              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 p-3 border border-slate-100 dark:border-slate-800 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Description / Instructions
                </span>
                <p className="whitespace-pre-line leading-relaxed">{selectedOrder.description}</p>
                {selectedOrder.additionalInfo && (
                  <p className="text-slate-500 dark:text-slate-400 italic">
                    Infos complémentaires : {selectedOrder.additionalInfo}
                  </p>
                )}
              </div>

              {selectedOrder.attachment && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      {selectedOrder.attachment.type.startsWith('image/') ? (
                        <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-blue-500" />
                      )}
                      {selectedOrder.attachment.name}
                    </span>
                    <a
                      href={selectedOrder.attachment.dataUrl}
                      download={selectedOrder.attachment.name}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Télécharger
                    </a>
                  </div>
                  {selectedOrder.attachment.type.startsWith('image/') && (
                    <img
                      src={selectedOrder.attachment.dataUrl}
                      alt={selectedOrder.attachment.name}
                      className="max-h-48 rounded-lg object-contain border border-slate-200 dark:border-slate-800"
                    />
                  )}
                </div>
              )}

              {/* Historique / Chronologie */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Historique de suivi ({selectedOrder.history.length})
                </h4>
                <div className="space-y-1.5 border-l-2 border-slate-200 dark:border-slate-800 pl-3">
                  {selectedOrder.history.map((h) => (
                    <div key={h.id} className="text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {h.action}
                        </span>
                        <span className="text-slate-400 tabular-nums">
                          {new Date(h.timestamp).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400">
                        {h.actorName}
                        {h.note ? ` — ${h.note}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fil d'échanges */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Échanges avec l’agence ({selectedOrder.comments.length})
                </h4>
                {selectedOrder.comments.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    Aucun message pour le moment.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedOrder.comments.map((c) => {
                      const isMine = c.authorUid === user?.uid;
                      return (
                        <div
                          key={c.id}
                          className={`rounded-xl p-2.5 ${
                            isMine
                              ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 ml-6'
                              : 'bg-slate-100 dark:bg-slate-800 mr-6'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {c.authorName} ({c.authorRole})
                            </span>
                            <span className="tabular-nums">
                              {new Date(c.createdAt).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          <p className="text-xs whitespace-pre-line">{c.message}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedOrder.status !== 'cloturee' && (
                  <form onSubmit={handleSendReply} className="pt-2 space-y-2">
                    {replyError && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400">{replyError}</p>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={
                          selectedOrder.status === 'en_attente_info'
                            ? 'Fournir les informations demandées...'
                            : 'Ajouter un message ou une précision...'
                        }
                        className="h-9 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-xs outline-none focus:border-slate-400"
                      />
                      <button
                        type="submit"
                        disabled={replySubmitting || !replyText.trim()}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3.5 text-xs font-bold text-white dark:text-[#0B192C] disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Envoyer
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
