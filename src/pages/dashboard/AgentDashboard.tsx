import {
  ArrowLeftRight,
  Bell,
  BellRing,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  Coins,
  Database,
  Eye,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Scale,
  Search,
  Users,
  Wallet,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
import BilletageModule from './components/BilletageModule';
import AgentFundsModule from './components/AgentFundsModule';
import ChatModule from './components/ChatModule';
import ConnectivityModule from './components/ConnectivityModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import SalaryModule from './components/SalaryModule';
import ReportsModule from './components/ReportsModule';
import CommandesClientsModule from './components/CommandesClientsModule';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import { fetchScopedClientOrders } from '../../services/ClientOrderService';
import { triggerSyncNow } from '../../services/SyncWorker';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  startAgentNotificationWatcher,
  startClientOrderNotificationWatcher,
  startFinancialNotificationWatcher,
  triggerTestUrgentNotification,
} from '../../services/LocalNotificationService';
import {
  getCachedOperations,
  getCachedOperationsSummary,
  syncOperationsToIndexedDBCache,
  formatRelativeCacheTime,
  getCacheMetadata,
  type CacheMetadata,
} from '../../services/LocalOperationsCacheService';
import type { Operation } from '../../types/operation';

type AgentView =
  | 'overview'
  | 'funds'
  | 'commandes'
  | 'billetage'
  | 'salary'
  | 'transfers'
  | 'debts'
  | 'chat'
  | 'reports'
  | 'connectivity';

const AGENT_TABS: WorkspaceTab[] = [
  { id: 'overview', label: 'Missions', icon: LayoutDashboard },
  { id: 'funds', label: 'Crédits & Fonds', icon: Wallet },
  { id: 'commandes', label: 'Commandes Clients', icon: ClipboardList },
  { id: 'reports', label: 'Rapports', icon: FileText },
  { id: 'billetage', label: 'Billetage', icon: Coins },
  { id: 'salary', label: 'Mon Salaire', icon: WalletCards },
  { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
  { id: 'debts', label: 'Dettes', icon: Scale },
  { id: 'chat', label: 'Messagerie', icon: Users },
  { id: 'connectivity', label: 'Synchro', icon: Wifi },
];

export default function AgentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<AgentView>('overview');
  const [assignedOperations, setAssignedOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [agencyLabel, setAgencyLabel] = useState<string>('');
  const [pendingReportsBadge, setPendingReportsBadge] = useState<number>(0);
  const [pendingClientOrdersCount, setPendingClientOrdersCount] = useState<number>(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    getNotificationPermissionStatus()
  );
  const [toastAlert, setToastAlert] = useState<{
    title: string;
    message: string;
    isUrgent?: boolean;
    operationId?: string;
  } | null>(null);
  const [testNotificationLoading, setTestNotificationLoading] = useState(false);

  const [cacheMetadata, setCacheMetadata] = useState<CacheMetadata>(getCacheMetadata());
  const [cacheSummary, setCacheSummary] = useState<{
    total: number;
    pending: number;
    urgent: number;
    completed: number;
    lastSync: number | null;
    totalUsdAmount: number;
    totalCdfAmount: number;
  }>({
    total: 0,
    pending: 0,
    urgent: 0,
    completed: 0,
    lastSync: null,
    totalUsdAmount: 0,
    totalCdfAmount: 0,
  });
  const [cacheSyncLoading, setCacheSyncLoading] = useState(false);
  const [offlineFilter, setOfflineFilter] = useState<'all' | 'pending' | 'urgent' | 'termine'>('all');
  const [offlineSearchQuery, setOfflineSearchQuery] = useState('');
  const [selectedOperationDetail, setSelectedOperationDetail] = useState<Operation | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const loadOperations = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (user.agencyId) {
        const ag = await getAgency(user.agencyId);
        if (ag?.name) setAgencyLabel(ag.name);
      }

      const cachedOps = await getCachedOperations({
        agentId: user.uid,
        agencyId: user.agencyId || undefined,
        status:
          offlineFilter === 'pending'
            ? 'cree'
            : offlineFilter === 'termine'
              ? 'termine'
              : undefined,
        priority: offlineFilter === 'urgent' ? 'urgent' : undefined,
        searchQuery: offlineSearchQuery,
      });

      setAssignedOperations(cachedOps);

      const summary = await getCachedOperationsSummary(user.uid);
      setCacheSummary(summary);
      setCacheMetadata(getCacheMetadata());

      const allRep = await db.reports.toArray();
      const myAlerts = allRep.filter(
        (r) => r.createdBy === user.uid && (r.status === 'retourne' || r.status === 'brouillon')
      );
      setPendingReportsBadge(myAlerts.length);

      const scopedOrders = await fetchScopedClientOrders(user, false);
      const actionableOrders = scopedOrders.filter(
        (o) =>
          o.status === 'soumise' ||
          o.status === 'prise_en_charge' ||
          o.status === 'en_cours' ||
          o.status === 'en_attente_info'
      );
      setPendingClientOrdersCount(actionableOrders.length);
    } catch (err) {
      console.warn('Erreur chargement opérations en cache local :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    void loadOperations();
  }, [user, offlineFilter, offlineSearchQuery]);

  useEffect(() => {
    if (!user?.uid) return;

    const stopWatcher = startAgentNotificationWatcher(user.uid, (newOp) => {
      setToastAlert({
        title: `Mission prioritaire : ${newOp.title}`,
        message: `${newOp.operationNumber} · Affectée à votre guichet (${newOp.agencyName || 'Agence'}).`,
        isUrgent:
          newOp.priority === 'maintenant' ||
          newOp.priority === 'tres_urgent' ||
          newOp.priority === 'urgent',
        operationId: newOp.id,
      });
      void loadOperations();
    });

    const stopOrderWatcher = startClientOrderNotificationWatcher(user, (evt) => {
      setToastAlert({
        title: evt.title,
        message: evt.body,
        isUrgent: evt.order.priority === 'urgente',
      });
      void loadOperations();
    });

    const stopFinanceWatcher = startFinancialNotificationWatcher(user, (evt) => {
      setToastAlert({
        title: evt.title,
        message: evt.body,
        isUrgent: evt.severity === 'critical' || evt.severity === 'warning',
      });
    });

    return () => {
      stopWatcher();
      stopOrderWatcher();
      stopFinanceWatcher();
    };
  }, [user?.uid]);

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      setToastAlert({
        title: 'Notifications Push Activées',
        message: 'Vous recevrez désormais les alertes des opérations urgentes.',
        isUrgent: false,
      });
    } else {
      setToastAlert({
        title: 'Autorisation requise',
        message: 'Veuillez autoriser les notifications dans les paramètres de votre navigateur.',
        isUrgent: true,
      });
    }
  };

  const handleTestNotification = async () => {
    setTestNotificationLoading(true);
    try {
      const ok = await triggerTestUrgentNotification(user?.displayName);
      if (ok) {
        setNotificationPermission('granted');
        setToastAlert({
          title: 'Notification locale émise',
          message: 'Une notification push de test a été envoyée avec succès.',
          isUrgent: false,
        });
      }
    } finally {
      setTestNotificationLoading(false);
    }
  };

  const handleManualCacheSync = async () => {
    setCacheSyncLoading(true);
    try {
      const res = await syncOperationsToIndexedDBCache({
        agentId: user?.uid,
        agencyId: user?.agencyId || undefined,
      });
      await loadOperations();
      setToastAlert({
        title: 'Données locales synchronisées',
        message: `${res.syncedCount} opérations synchronisées et disponibles hors-ligne.`,
        isUrgent: false,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Inconnue';
      setToastAlert({
        title: 'Erreur de synchronisation',
        message: `Synchronisation du cache interrompue : ${msg}`,
        isUrgent: true,
      });
    } finally {
      setCacheSyncLoading(false);
    }
  };

  const handleMarkComplete = async (opId: string) => {
    setCompletingId(opId);
    try {
      await db.operations.update(opId, {
        status: 'termine',
        updatedAt: Date.now(),
        syncStatus: 'pending',
      });
      await db.syncQueue.add({
        entity: 'operation',
        entityId: opId,
        operation: 'update',
        attempts: 0,
        lastError: null,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await loadOperations();
      void triggerSyncNow();
    } catch {
      // ignore
    } finally {
      setCompletingId(null);
    }
  };

  const handleSelectView = (view: AgentView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSidebarNavigate = (item: string) => {
    if (item === 'profile') {
      navigate('/profil');
      return;
    }
    if (item === 'reports') {
      handleSelectView('reports');
    } else if (
      item === 'funds' ||
      item === 'financial-supervision' ||
      item === 'financial_supervision'
    ) {
      handleSelectView('funds');
    } else if (item === 'commandes' || item === 'orders' || item === 'client-orders') {
      handleSelectView('commandes');
    } else if (item === 'billetage' || item === 'accounting' || item === 'treasury') {
      handleSelectView('billetage');
    } else if (item === 'salaries') {
      handleSelectView('salary');
    } else if (item === 'transfers') {
      handleSelectView('transfers');
    } else if (item === 'debts') {
      handleSelectView('debts');
    } else if (item === 'chat') {
      handleSelectView('chat');
    } else if (item === 'connectivity' || item === 'settings') {
      handleSelectView('connectivity');
    } else if (item === 'dashboard' || item === 'transactions' || item === 'operations') {
      handleSelectView('overview');
    }
  };

  const sidebarActiveItem =
    activeView === 'overview'
      ? 'dashboard'
      : activeView === 'salary'
        ? 'salaries'
        : activeView;

  const pendingOps = assignedOperations.filter((o) => o.status !== 'termine');
  const pendingOpsCount = pendingOps.length;
  const urgentOpsCount = pendingOps.filter(
    (o) =>
      o.priority === 'maintenant' ||
      o.priority === 'tres_urgent' ||
      o.priority === 'urgent'
  ).length;

  return (
    <AppLayout
      title="Espace Agent — Ets AMANI"
      subtitle="Guichet, exécution des opérations & tenue de caisse locale"
      activeItem={sidebarActiveItem}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => handleSelectView('chat')}
    >
      <div className="space-y-4">
        {/* En-tête Agent compact */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold tracking-widest text-[#C58B39] uppercase">
              POSTE OPÉRATIONNEL · {agencyLabel || user?.agencyId || 'AGENCE'}
            </p>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Bonjour, {user?.displayName?.split(' ')[0] || 'Agent'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Guichet, missions affectées, billetage et déclarations d&apos;activité
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectView('funds')}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition whitespace-nowrap"
            >
              Fonds &amp; Guichet
            </button>
            <button
              type="button"
              onClick={() => handleSelectView('transfers')}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition whitespace-nowrap"
            >
              Nouveau transfert
            </button>
            <button
              type="button"
              onClick={() => handleSelectView('billetage')}
              className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C] hover:opacity-95 transition whitespace-nowrap"
            >
              Billetage caisse
            </button>
          </div>
        </div>

        {/* Navigation par onglets */}
        <WorkspaceNavigationHeader
          workspaceTitle="Espace Agent"
          category={agencyLabel || 'Guichet Local'}
          activeModuleTitle={
            activeView === 'overview'
              ? 'Missions & Opérations'
              : activeView === 'funds'
                ? 'Crédits Virtuels, Caisse & Guichet'
                : activeView === 'commandes'
                  ? 'Commandes & Réclamations Clients'
                  : activeView === 'reports'
                    ? "Mes Rapports d'Activité"
                    : activeView === 'billetage'
                      ? 'Billetage & Tenue de Caisse'
                      : activeView === 'salary'
                        ? 'Mon Salaire'
                        : activeView === 'transfers'
                          ? 'Transferts Inter-Agences'
                          : activeView === 'debts'
                            ? 'Engagements & Dettes'
                            : activeView === 'connectivity'
                              ? 'Disponibilité & Synchro'
                              : 'Messagerie & Annonces'
          }
          backLabel="Missions"
          onBack={() => handleSelectView('overview')}
          tabs={AGENT_TABS.map((tab) => ({
            ...tab,
            badge:
              tab.id === 'overview' && pendingOpsCount > 0
                ? pendingOpsCount
                : tab.id === 'commandes' && pendingClientOrdersCount > 0
                  ? pendingClientOrdersCount
                  : tab.id === 'reports' && pendingReportsBadge > 0
                    ? pendingReportsBadge
                    : undefined,
          }))}
          activeTabId={activeView}
          onTabChange={(id) => handleSelectView(id as AgentView)}
        />

        {activeView === 'funds' && (
          <AgentFundsModule onClose={() => handleSelectView('overview')} />
        )}
        {activeView === 'commandes' && (
          <CommandesClientsModule
            onClose={() => handleSelectView('overview')}
            onOrdersUpdated={() => void loadOperations()}
          />
        )}
        {activeView === 'reports' && (
          <ReportsModule
            onClose={() => handleSelectView('overview')}
            onOpenBilletage={() => handleSelectView('billetage')}
          />
        )}
        {activeView === 'billetage' && (
          <BilletageModule onClose={() => handleSelectView('overview')} />
        )}
        {activeView === 'salary' && (
          <SalaryModule mode="agent" onClose={() => handleSelectView('overview')} />
        )}
        {activeView === 'transfers' && (
          <TreasuryTransfersDebtsModule
            mode="transfers"
            onClose={() => handleSelectView('overview')}
          />
        )}
        {activeView === 'debts' && (
          <TreasuryTransfersDebtsModule
            mode="debts"
            onClose={() => handleSelectView('overview')}
          />
        )}
        {activeView === 'chat' && (
          <ChatModule onClose={() => handleSelectView('overview')} />
        )}
        {activeView === 'connectivity' && (
          <ConnectivityModule onClose={() => handleSelectView('overview')} />
        )}

        {activeView === 'overview' && (
          <div className="space-y-4">
            {toastAlert && (
              <div
                role="alert"
                className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-xs ${
                  toastAlert.isUrgent
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-950 dark:text-rose-200'
                    : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <BellRing className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-bold">{toastAlert.title}</p>
                    <p className="opacity-90 mt-0.5">{toastAlert.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToastAlert(null)}
                  className="rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10"
                  title="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* 4 KPIs Guichet Compacts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Missions affectées
                </span>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
                  {pendingOpsCount}
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">À exécuter</p>
              </div>

              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Urgentes
                </span>
                <p className="mt-1 text-xl font-black tabular-nums text-rose-600 dark:text-rose-400">
                  {urgentOpsCount}
                </p>
                <p className="text-[10px] text-slate-400">Priorité immédiate</p>
              </div>

              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Terminées
                </span>
                <p className="mt-1 text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  {cacheSummary.completed}
                </p>
                <p className="text-[10px] text-slate-400">Enregistrées</p>
              </div>

              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Cache local
                </span>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
                  {cacheSummary.total}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {cacheSummary.totalUsdAmount > 0
                    ? `${cacheSummary.totalUsdAmount.toLocaleString('fr-FR')} USD`
                    : isOnline
                      ? 'En ligne'
                      : 'Hors-ligne'}
                </p>
              </div>
            </div>

            {/* Barre unique compacte Synchro & Alertes Push */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Database className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>
                    Synchro : {formatRelativeCacheTime(cacheMetadata.lastSyncTimestamp)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Wifi
                    className={`h-3.5 w-3.5 ${
                      isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                    }`}
                  />
                  <span>{isOnline ? 'Réseau actif' : 'Mode hors-ligne'}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {notificationPermission !== 'granted' ? (
                  <button
                    type="button"
                    onClick={() => void handleEnableNotifications()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    <span>Activer alertes</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={testNotificationLoading}
                    onClick={() => void handleTestNotification()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    <span>{testNotificationLoading ? 'Test...' : 'Alertes actives'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleManualCacheSync()}
                  disabled={cacheSyncLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${cacheSyncLoading ? 'animate-spin' : ''}`} />
                  <span>{cacheSyncLoading ? 'Synchro...' : 'Synchroniser'}</span>
                </button>
              </div>
            </div>

            {/* Liste des Missions & Opérations */}
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Missions & Opérations au Guichet
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Consultables et clôturables même hors-ligne
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadOperations()}
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Actualiser</span>
                </button>
              </div>

              <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={offlineSearchQuery}
                    onChange={(e) => setOfflineSearchQuery(e.target.value)}
                    placeholder="Rechercher (N° opération, client, agence, libellé)..."
                    className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-9 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:bg-white dark:focus:bg-slate-800"
                  />
                  {offlineSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOfflineSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('all')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      offlineFilter === 'all'
                        ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Toutes ({cacheSummary.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('pending')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      offlineFilter === 'pending'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    En attente ({cacheSummary.pending})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('urgent')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      offlineFilter === 'urgent'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    Urgentes ({cacheSummary.urgent})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfflineFilter('termine')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      offlineFilter === 'termine'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    Terminées ({cacheSummary.completed})
                  </button>
                </div>
              </div>

              {assignedOperations.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Briefcase className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Aucune opération trouvée
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {offlineSearchQuery
                      ? 'Aucun résultat ne correspond à votre recherche.'
                      : 'Aucune tâche en attente dans votre cache local.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {assignedOperations.map((op) => {
                    const isUrgent =
                      op.priority === 'maintenant' ||
                      op.priority === 'tres_urgent' ||
                      op.priority === 'urgent';

                    return (
                      <div
                        key={op.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                              {op.operationNumber}
                            </span>
                            <span className="rounded bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 font-bold uppercase text-blue-700 dark:text-blue-300 text-[10px]">
                              {op.type}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 font-semibold text-[10px] ${
                                op.status === 'termine'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                              }`}
                            >
                              {op.status === 'termine' ? 'Terminé' : 'En attente'}
                            </span>
                            {isUrgent && (
                              <span className="rounded bg-rose-100 dark:bg-rose-950/70 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">
                                {op.priority === 'maintenant'
                                  ? 'Immédiat'
                                  : op.priority === 'tres_urgent'
                                    ? 'Très urgent'
                                    : 'Urgent'}
                              </span>
                            )}
                          </div>

                          <p className="font-bold text-slate-900 dark:text-white truncate">
                            {op.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {op.amount !== undefined && (
                              <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {op.amount.toLocaleString('fr-FR')} {op.currency}
                              </span>
                            )}
                            {op.operatorName && <span>Opérateur : {op.operatorName}</span>}
                            {op.accountNumber && <span>Compte : {op.accountNumber}</span>}
                            <span>Agence : {op.agencyName || 'Locale'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                          <button
                            type="button"
                            onClick={() => setSelectedOperationDetail(op)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Détails</span>
                          </button>

                          {op.status !== 'termine' && (
                            <button
                              type="button"
                              disabled={completingId === op.id}
                              onClick={() => void handleMarkComplete(op.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] dark:bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 dark:text-white" />
                              <span>{completingId === op.id ? 'Clôture...' : 'Valider'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal d'inspection détaillée */}
            {selectedOperationDetail && (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-[2px]"
              >
                <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl text-slate-900 dark:text-slate-100 space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <span className="font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200">
                        {selectedOperationDetail.operationNumber}
                      </span>
                      <h3 className="text-base font-bold mt-1.5">
                        {selectedOperationDetail.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedOperationDetail(null)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Type
                        </span>
                        <span className="font-bold uppercase">
                          {selectedOperationDetail.type}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Priorité
                        </span>
                        <span className="font-bold uppercase">
                          {selectedOperationDetail.priority}
                        </span>
                      </div>
                    </div>

                    {selectedOperationDetail.amount !== undefined && (
                      <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 p-3 text-emerald-900 dark:text-emerald-200">
                        <span className="text-[10px] uppercase font-bold block">
                          Montant opération
                        </span>
                        <span className="text-lg font-black tabular-nums">
                          {selectedOperationDetail.amount.toLocaleString('fr-FR')}{' '}
                          {selectedOperationDetail.currency}
                        </span>
                      </div>
                    )}

                    <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-3 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Description
                        </span>
                        <p className="mt-0.5 leading-relaxed">
                          {selectedOperationDetail.description || 'Aucune description détaillée.'}
                        </p>
                      </div>
                      {selectedOperationDetail.comments && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Commentaires
                          </span>
                          <p className="mt-0.5 italic">{selectedOperationDetail.comments}</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Agence
                        </span>
                        <span className="font-semibold">
                          {selectedOperationDetail.agencyName || 'Locale'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Enregistré le
                        </span>
                        <span className="font-semibold tabular-nums">
                          {new Date(selectedOperationDetail.createdAt).toLocaleString('fr-FR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedOperationDetail(null)}
                      className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-1.5 text-xs font-bold text-white dark:text-slate-900"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
