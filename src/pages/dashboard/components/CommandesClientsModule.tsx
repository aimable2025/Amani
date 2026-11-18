import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import { getAgencyUsersByRole, type AgencyUser } from '../../../services/AgencyUserService';
import {
  addClientOrderComment,
  assignClientOrder,
  canUserDecideRefund,
  fetchScopedClientOrders,
  takeChargeClientOrder,
  updateClientOrderStatus,
} from '../../../services/ClientOrderService';
import {
  CLIENT_ORDER_CATEGORY_LABELS,
  CLIENT_ORDER_STATUS_LABELS,
  CLIENT_ORDER_TRANSACTION_LABELS,
  type ClientOrder,
  type ClientOrderCategory,
  type ClientOrderStatus,
  type RefundDecisionStatus,
} from '../../../types/clientOrder';

interface CommandesClientsModuleProps {
  onClose?: () => void;
  onOrdersUpdated?: () => void;
}

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

export default function CommandesClientsModule({
  onClose,
  onOrdersUpdated,
}: CommandesClientsModuleProps) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtres
  const [statusFilter, setStatusFilter] = useState<'all' | 'actionable' | ClientOrderStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ClientOrderCategory>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de traitement
  const [selectedOrder, setSelectedOrder] = useState<ClientOrder | null>(null);
  const [agencyAgents, setAgencyAgents] = useState<AgencyUser[]>([]);
  const [selectedAssignAgentId, setSelectedAssignAgentId] = useState('');
  const [actionMode, setActionMode] = useState<
    null | 'info' | 'resolve' | 'reject'
  >(null);
  const [actionText, setActionText] = useState('');
  const [refundDecisionChoice, setRefundDecisionChoice] =
    useState<RefundDecisionStatus>('acceptee');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const isGlobalRole =
    user?.role === 'directeur_general' || user?.role === 'administrateur_systeme';
  const canAssign =
    user?.role === 'administrateur_agence' ||
    user?.role === 'directeur_general' ||
    user?.role === 'administrateur_systeme';
  const canDecideRefund = user ? canUserDecideRefund(user) : false;

  const loadOrders = async (forceRemote = true) => {
    if (!user) return;
    setRefreshing(true);
    try {
      const [scopedOrders, agenciesList] = await Promise.all([
        fetchScopedClientOrders(user, forceRemote),
        isGlobalRole ? getAgencies() : Promise.resolve([]),
      ]);
      setOrders(scopedOrders);
      if (isGlobalRole) {
        setAgencies(agenciesList);
      }
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
    void loadOrders(true);
  }, [user?.uid, user?.role, user?.agencyId]);

  useEffect(() => {
    setActionMode(null);
    setActionText('');
    setActionError(null);
    if (!selectedOrder || !canAssign || !selectedOrder.agencyId) {
      setAgencyAgents([]);
      setSelectedAssignAgentId('');
      return;
    }
    setSelectedAssignAgentId(selectedOrder.assignedAgentId || '');
    getAgencyUsersByRole(selectedOrder.agencyId, 'agent')
      .then((list) => {
        setAgencyAgents(list.filter((a) => a.status === 'active' && a.isApproved));
      })
      .catch(() => setAgencyAgents([]));
  }, [selectedOrder?.id, selectedOrder?.agencyId, canAssign]);

  const metrics = useMemo(() => {
    const newCount = orders.filter((o) => o.status === 'soumise').length;
    const activeCount = orders.filter(
      (o) =>
        o.status === 'prise_en_charge' ||
        o.status === 'en_cours' ||
        o.status === 'en_attente_info',
    ).length;
    const refundPendingCount = orders.filter(
      (o) =>
        o.category === 'restitution_argent' &&
        o.status !== 'traitee' &&
        o.status !== 'cloturee' &&
        o.status !== 'rejetee',
    ).length;
    const resolvedCount = orders.filter(
      (o) => o.status === 'traitee' || o.status === 'cloturee',
    ).length;
    return { newCount, activeCount, refundPendingCount, resolvedCount };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter === 'actionable') {
        if (o.status === 'traitee' || o.status === 'cloturee' || o.status === 'rejetee') {
          return false;
        }
      } else if (statusFilter !== 'all' && o.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && o.category !== categoryFilter) return false;
      if (isGlobalRole && agencyFilter !== 'all' && o.agencyId !== agencyFilter) return false;
      if (!q) return true;
      return (
        o.reference.toLowerCase().includes(q) ||
        o.authorName.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        (o.concernedPhone || '').toLowerCase().includes(q) ||
        (o.transactionReference || '').toLowerCase().includes(q) ||
        o.agencyName.toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, categoryFilter, agencyFilter, isGlobalRole, searchQuery]);

  const handleTakeCharge = async () => {
    if (!user || !selectedOrder) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await takeChargeClientOrder(selectedOrder.id, user);
      setSelectedOrder(updated);
      setActionFeedback('Dossier pris en charge.');
      await loadOrders(false);
      onOrdersUpdated?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur lors de la prise en charge.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignAgent = async () => {
    if (!user || !selectedOrder || !selectedAssignAgentId) return;
    const target = agencyAgents.find((a) => a.uid === selectedAssignAgentId);
    if (!target) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await assignClientOrder(
        selectedOrder.id,
        { uid: target.uid, displayName: target.displayName },
        user,
      );
      setSelectedOrder(updated);
      setActionFeedback(`Dossier affecté à ${target.displayName}.`);
      await loadOrders(false);
      onOrdersUpdated?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur lors de l’affectation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransition = async (
    nextStatus: ClientOrderStatus,
    options?: {
      resolutionNote?: string;
      rejectionReason?: string;
      infoRequestedMessage?: string;
      refundDecision?: RefundDecisionStatus;
    },
  ) => {
    if (!user || !selectedOrder) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await updateClientOrderStatus(selectedOrder.id, nextStatus, user, options);
      setSelectedOrder(updated);
      setActionMode(null);
      setActionText('');
      setActionFeedback(`Statut mis à jour : ${CLIENT_ORDER_STATUS_LABELS[nextStatus]}.`);
      await loadOrders(false);
      onOrdersUpdated?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Impossible de mettre à jour le statut.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendStaffReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedOrder || !replyText.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await addClientOrderComment(selectedOrder.id, replyText, user);
      setReplyText('');
      setSelectedOrder(updated);
      await loadOrders(false);
      onOrdersUpdated?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur d’envoi du message.');
    } finally {
      setActionLoading(false);
    }
  };

  const isSelectedRefundLockedForAgent =
    selectedOrder?.category === 'restitution_argent' && !canDecideRefund;

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">
            Commandes & Réclamations Clients / Abonnés
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {user?.role === 'agent'
              ? 'Demandes affectées à votre poste ou en attente de prise en charge dans votre agence'
              : user?.role === 'administrateur_agence'
                ? 'Supervision, affectation et décisions de votre agence'
                : 'Supervision globale des commandes, réclamations et demandes de restitution'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadOrders(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100"
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
              Retour
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nouvelles à prendre
          </span>
          <p className="mt-1 text-xl font-black tabular-nums text-blue-600 dark:text-blue-400">
            {metrics.newCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            En cours / Attente info
          </span>
          <p className="mt-1 text-xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">
            {metrics.activeCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Restitutions ouvertes
          </span>
          <p className="mt-1 text-xl font-black tabular-nums text-rose-600 dark:text-rose-400">
            {metrics.refundPendingCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Traitées & Clôturées
          </span>
          <p className="mt-1 text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            {metrics.resolvedCount}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Référence, client, tél, motif..."
              className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-9 pr-3 text-xs outline-none focus:border-slate-400"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'actionable' | ClientOrderStatus)
            }
            className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-xs font-semibold outline-none"
          >
            <option value="all">Tous les statuts ({orders.length})</option>
            <option value="actionable">À traiter uniquement</option>
            {(Object.keys(CLIENT_ORDER_STATUS_LABELS) as ClientOrderStatus[]).map((s) => (
              <option key={s} value={s}>
                {CLIENT_ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | ClientOrderCategory)}
            className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-xs font-semibold outline-none"
          >
            <option value="all">Toutes catégories</option>
            {(Object.keys(CLIENT_ORDER_CATEGORY_LABELS) as ClientOrderCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CLIENT_ORDER_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>

          {isGlobalRole && (
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-xs font-semibold outline-none"
            >
              <option value="all">Toutes les agences</option>
              {agencies.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Chargement des commandes & réclamations...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-10 text-center space-y-1.5">
            <ClipboardCheck className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Aucune demande dans ce périmètre
            </p>
          </div>
        ) : (
          <>
            {/* Mobile compact cards */}
            <div className="space-y-2.5 md:hidden">
              {filteredOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setActionFeedback(null);
                    setSelectedOrder(o);
                  }}
                  className="w-full text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold">{o.reference}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusBadgeClasses(o.status)}`}
                    >
                      {CLIENT_ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </div>
                  <p className="text-xs font-bold">
                    {o.authorName} ({o.authorRole}) · {CLIENT_ORDER_CATEGORY_LABELS[o.category]}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                    {o.description}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                    <span>{o.agencyName}</span>
                    <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                      {o.amount ? `${o.amount.toLocaleString('fr-FR')} ${o.currency}` : '—'}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-2.5">Référence</th>
                    <th className="p-2.5">Client / Abonné</th>
                    <th className="p-2.5">Catégorie & Service</th>
                    <th className="p-2.5">Agence / Affectation</th>
                    <th className="p-2.5">Montant</th>
                    <th className="p-2.5">Statut</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => {
                        setActionFeedback(null);
                        setSelectedOrder(o);
                      }}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="p-2.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {o.reference}
                        </span>
                        {o.priority === 'urgente' && (
                          <span className="ml-1.5 rounded bg-rose-100 dark:bg-rose-950/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-700 dark:text-rose-300">
                            Urgent
                          </span>
                        )}
                      </td>
                      <td className="p-2.5">
                        <p className="font-bold text-slate-900 dark:text-white">{o.authorName}</p>
                        <p className="text-[11px] text-slate-400 uppercase">
                          {o.authorRole} {o.authorPhone ? `· ${o.authorPhone}` : ''}
                        </p>
                      </td>
                      <td className="p-2.5">
                        <p className="font-bold">{CLIENT_ORDER_CATEGORY_LABELS[o.category]}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {CLIENT_ORDER_TRANSACTION_LABELS[o.transactionType]}
                        </p>
                      </td>
                      <td className="p-2.5">
                        <p className="font-semibold">{o.agencyName}</p>
                        <p className="text-[11px] text-slate-400">
                          {o.assignedAgentName
                            ? `Assignée : ${o.assignedAgentName}`
                            : o.targetAgentName
                              ? `Souhait : ${o.targetAgentName}`
                              : 'Non assignée'}
                        </p>
                      </td>
                      <td className="p-2.5 font-bold tabular-nums whitespace-nowrap">
                        {o.amount ? `${o.amount.toLocaleString('fr-FR')} ${o.currency}` : '—'}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusBadgeClasses(o.status)}`}
                        >
                          {CLIENT_ORDER_STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionFeedback(null);
                            setSelectedOrder(o);
                          }}
                          className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-2.5 py-1 text-[11px] font-bold text-white dark:text-[#0B192C]"
                        >
                          Traiter
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

      {/* Modal Traitement Staff */}
      {selectedOrder && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedOrder(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden">
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
                  {selectedOrder.authorName} ({selectedOrder.authorRole}) —{' '}
                  {CLIENT_ORDER_CATEGORY_LABELS[selectedOrder.category]}
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

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {actionFeedback && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 p-2.5 text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{actionFeedback}</span>
                </div>
              )}

              {actionError && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-2.5 text-rose-800 dark:text-rose-200 font-semibold">
                  {actionError}
                </div>
              )}

              {isSelectedRefundLockedForAgent && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 flex items-start gap-2 text-amber-900 dark:text-amber-200">
                  <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Contrôle financier actif (Restitution d’argent)</p>
                    <p className="mt-0.5 opacity-90">
                      Vous pouvez prendre en charge, vérifier ou demander des informations complémentaires. La décision finale d’acceptation, rejet ou clôture est réservée à l’Administrateur d’agence ou à la Direction.
                    </p>
                  </div>
                </div>
              )}

              {/* Fiche synthèse */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Service
                  </span>
                  <span className="font-bold">
                    {CLIENT_ORDER_TRANSACTION_LABELS[selectedOrder.transactionType]}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Montant
                  </span>
                  <span className="font-black tabular-nums">
                    {selectedOrder.amount
                      ? `${selectedOrder.amount.toLocaleString('fr-FR')} ${selectedOrder.currency}`
                      : 'Non précisé'}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Agence
                  </span>
                  <span className="font-semibold">{selectedOrder.agencyName}</span>
                </div>
                {selectedOrder.concernedPhone && (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Tél. concerné
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

              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 p-3 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Contenu de la demande
                </span>
                <p className="whitespace-pre-line leading-relaxed">{selectedOrder.description}</p>
                {selectedOrder.additionalInfo && (
                  <p className="text-slate-500 italic">
                    Complément : {selectedOrder.additionalInfo}
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

              {/* Affectation à un agent (Responsables) */}
              {canAssign &&
                selectedOrder.status !== 'cloturee' &&
                selectedOrder.status !== 'rejetee' &&
                agencyAgents.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0 flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5" />
                      Affecter à un agent :
                    </span>
                    <select
                      value={selectedAssignAgentId}
                      onChange={(e) => setSelectedAssignAgentId(e.target.value)}
                      className="h-8 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs outline-none"
                    >
                      <option value="">Choisir un agent de l’agence...</option>
                      {agencyAgents.map((ag) => (
                        <option key={ag.uid} value={ag.uid}>
                          {ag.displayName}
                          {ag.function ? ` (${ag.function.replace(/_/g, ' ')})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={actionLoading || !selectedAssignAgentId}
                      onClick={() => void handleAssignAgent()}
                      className="h-8 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 font-bold text-white dark:text-slate-900 disabled:opacity-50"
                    >
                      Assigner
                    </button>
                  </div>
                )}

              {/* Actions de cycle de vie */}
              {selectedOrder.status !== 'cloturee' && selectedOrder.status !== 'rejetee' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Actions de traitement
                  </span>

                  <div className="flex flex-wrap gap-2">
                    {selectedOrder.status === 'soumise' && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => void handleTakeCharge()}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Prendre en charge
                      </button>
                    )}

                    {(selectedOrder.status === 'prise_en_charge' ||
                      selectedOrder.status === 'en_attente_info') && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => void handleTransition('en_cours')}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Passer en cours
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setActionMode('info');
                        setActionText('');
                      }}
                      className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 font-bold text-amber-800 dark:text-amber-200"
                    >
                      Demander des infos
                    </button>

                    {!isSelectedRefundLockedForAgent && selectedOrder.status !== 'traitee' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionMode('resolve');
                          setActionText('');
                          setRefundDecisionChoice('acceptee');
                        }}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700"
                      >
                        {selectedOrder.category === 'restitution_argent'
                          ? 'Décider & Traiter la restitution'
                          : 'Marquer comme traitée'}
                      </button>
                    )}

                    {!isSelectedRefundLockedForAgent && selectedOrder.status === 'traitee' && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => void handleTransition('cloturee')}
                        className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 font-bold text-white dark:text-slate-900"
                      >
                        Clôturer le dossier
                      </button>
                    )}

                    {!isSelectedRefundLockedForAgent && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionMode('reject');
                          setActionText('');
                        }}
                        className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 font-bold text-rose-700 dark:text-rose-200"
                      >
                        Rejeter
                      </button>
                    )}
                  </div>

                  {actionMode === 'info' && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <label className="font-bold block">
                        Informations complémentaires demandées au client *
                      </label>
                      <textarea
                        rows={2}
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="Précisez la pièce, référence ou donnée manquante..."
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setActionMode(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void handleTransition('en_attente_info', {
                              infoRequestedMessage: actionText,
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold"
                        >
                          Envoyer la demande d’infos
                        </button>
                      </div>
                    </div>
                  )}

                  {actionMode === 'resolve' && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {selectedOrder.category === 'restitution_argent' && (
                        <div>
                          <label className="font-bold block mb-1">
                            Décision financière officielle *
                          </label>
                          <select
                            value={refundDecisionChoice}
                            onChange={(e) =>
                              setRefundDecisionChoice(e.target.value as RefundDecisionStatus)
                            }
                            className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5"
                          >
                            <option value="acceptee">Restitution acceptée (remboursement validé)</option>
                            <option value="rejetee">Restitution refusée</option>
                          </select>
                        </div>
                      )}
                      <label className="font-bold block">
                        Note officielle de résolution / référence opération exécutée *
                      </label>
                      <textarea
                        rows={2}
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="Ex: Dépôt effectué avec succès, réf M-Pesa... / Restitution effectuée au guichet..."
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setActionMode(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void handleTransition(
                              selectedOrder.category === 'restitution_argent' &&
                                refundDecisionChoice === 'rejetee'
                                ? 'rejetee'
                                : 'traitee',
                              selectedOrder.category === 'restitution_argent' &&
                                refundDecisionChoice === 'rejetee'
                                ? {
                                    rejectionReason: actionText,
                                    refundDecision: 'rejetee',
                                  }
                                : {
                                    resolutionNote: actionText,
                                    refundDecision:
                                      selectedOrder.category === 'restitution_argent'
                                        ? refundDecisionChoice
                                        : undefined,
                                  },
                            )
                          }
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                        >
                          Valider la résolution
                        </button>
                      </div>
                    </div>
                  )}

                  {actionMode === 'reject' && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <label className="font-bold block">Motif explicite du rejet *</label>
                      <textarea
                        rows={2}
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="Expliquez clairement pourquoi cette demande est rejetée..."
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setActionMode(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void handleTransition('rejetee', { rejectionReason: actionText })
                          }
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold"
                        >
                          Confirmer le rejet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Historique */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Journal de suivi ({selectedOrder.history.length})
                </h4>
                <div className="space-y-1.5 border-l-2 border-slate-200 dark:border-slate-800 pl-3">
                  {selectedOrder.history.map((h) => (
                    <div key={h.id} className="text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{h.action}</span>
                        <span className="text-slate-400 tabular-nums">
                          {new Date(h.timestamp).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400">
                        {h.actorName} ({h.actorRole}){h.note ? ` — ${h.note}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Échanges */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Messages du dossier ({selectedOrder.comments.length})
                </h4>
                {selectedOrder.comments.map((c) => {
                  const isStaff = c.authorRole !== 'client' && c.authorRole !== 'abonne';
                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl p-2.5 ${
                        isStaff
                          ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 ml-6'
                          : 'bg-slate-100 dark:bg-slate-800 mr-6'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {c.authorName} ({c.authorRole})
                        </span>
                        <span className="tabular-nums">
                          {new Date(c.createdAt).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <p className="whitespace-pre-line">{c.message}</p>
                    </div>
                  );
                })}

                {selectedOrder.status !== 'cloturee' && (
                  <form onSubmit={handleSendStaffReply} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Répondre au client / abonné..."
                      className="h-9 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-xs outline-none focus:border-slate-400"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !replyText.trim()}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3.5 text-xs font-bold text-white dark:text-[#0B192C] disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Envoyer
                    </button>
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
