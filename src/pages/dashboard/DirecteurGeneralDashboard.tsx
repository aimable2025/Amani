import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileText,
  Grid2X2,
  LayoutGrid,
  List,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import DashboardModuleCard from '../../components/dashboard/DashboardModuleCard';
import DashboardModuleGrid from '../../components/dashboard/DashboardModuleGrid';
import WorkspaceNavigationHeader from '../../components/dashboard/WorkspaceNavigationHeader';
import { type DashboardViewMode } from '../../components/dashboard/DashboardToolbar';
import {
  DG_MODULES,
  type DgModuleCategory,
  type DgModuleItem,
} from './components/DirectorGeneralModules';
import BilletageModule from './components/BilletageModule';
import InternalNumbersModule from './components/InternalNumbersModule';
import OperationModule from './components/OperationModule';
import ConnectivityModule from './components/ConnectivityModule';
import AgentManagementModule from './components/AgentManagementModule';
import RegistrationRequestsModule from './components/RegistrationRequestsModule';
import AuditModule from './components/AuditModule';
import SystemConfigModule from './components/SystemConfigModule';
import AgenciesModule from './components/AgenciesModule';
import ReportsModule from './components/ReportsModule';
import ChatModule from './components/ChatModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import SalaryModule from './components/SalaryModule';
import CommandesClientsModule from './components/CommandesClientsModule';
import FinancialSupervisionModule from './components/FinancialSupervisionModule';
import { getDgFeatures } from '../../services/DgFeatureService';
import { getAgencies, type Agency } from '../../services/AgencyService';
import { getAllSystemUsers, type ManagedUser } from '../../services/SystemUserService';
import { db, type LocalInterAgencyTransfer, type LocalReport } from '../../lib/db';
import { startFinancialNotificationWatcher } from '../../services/LocalNotificationService';
import {
  subscribeToDirectorGeneralConfig,
  type DirectorGeneralConfig,
} from '../../services/DirectorGeneralService';
import type { DgFeatures } from '../../types/management';
import type { Operation } from '../../types/operation';

interface ExecutivePoleSection {
  key: DgModuleCategory;
  index: string;
  title: string;
  subtitle: string;
}

const EXECUTIVE_POLES: ExecutivePoleSection[] = [
  {
    key: 'finance',
    index: '01',
    title: 'Finance, Paie & Trésorerie',
    subtitle: 'Salaires, avances, transferts inter-agences, dettes et états certifiés.',
  },
  {
    key: 'operations',
    index: '02',
    title: 'Opérations & Contrôle de Caisse',
    subtitle: 'Billetage USD/CDF, affectation des missions et supervision flotte SMS.',
  },
  {
    key: 'network',
    index: '03',
    title: 'Réseau, Équipes & Communication',
    subtitle: 'Agences, administrateurs, agents, chat interne et synchronisation.',
  },
  {
    key: 'oversight',
    index: '04',
    title: 'Gouvernance, Conformité & Audit',
    subtitle: 'Validations clients/abonnés et journal d’audit immuable.',
  },
  {
    key: 'settings',
    index: '05',
    title: 'Paramètres de Direction',
    subtitle: 'Configuration générale et préférences du poste DG.',
  },
];

const CATEGORY_FILTER_TABS: Array<{ id: DgModuleCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'finance', label: 'Finance & Paie' },
  { id: 'operations', label: 'Opérations & Caisse' },
  { id: 'network', label: 'Réseau & Équipes' },
  { id: 'oversight', label: 'Audit & Conformité' },
  { id: 'settings', label: 'Configuration' },
];

export default function DirecteurGeneralDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DgModuleCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<DashboardViewMode>('grid');
  const [features, setFeatures] = useState<DgFeatures | undefined>(undefined);
  const [dgConfig, setDgConfig] = useState<DirectorGeneralConfig | null>(null);

  // Données institutionnelles réelles (4 niveaux)
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [transfers, setTransfers] = useState<LocalInterAgencyTransfer[]>([]);
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [totalBilletageUSD, setTotalBilletageUSD] = useState(0);
  const [totalBilletageCDF, setTotalBilletageCDF] = useState(0);
  const [pendingSalaryClaimsCount, setPendingSalaryClaimsCount] = useState(0);
  const [pendingClientOrdersCount, setPendingClientOrdersCount] = useState(0);

  const loadDashboardStats = async () => {
    try {
      const [
        agenciesList,
        usersList,
        opsList,
        billetagesList,
        transfersList,
        reportsList,
        advancesList,
        claimsList,
        clientOrdersList,
      ] = await Promise.all([
        getAgencies(),
        getAllSystemUsers(),
        db.operations.toArray(),
        db.billetages.toArray(),
        db.interAgencyTransfers.toArray(),
        db.reports.toArray(),
        db.salaryAdvances.toArray(),
        db.salaryClaims.toArray(),
        db.clientOrders.toArray(),
      ]);

      setAgencies(agenciesList);
      setUsers(usersList);
      setOperations(opsList);
      setTransfers(transfersList);
      setReports(reportsList);

      let usdSum = 0;
      let cdfSum = 0;
      for (const b of billetagesList) {
        const val = b.calculatedTotal || b.declaredAmount || 0;
        if (b.currency === 'USD') usdSum += val;
        if (b.currency === 'CDF') cdfSum += val;
      }
      setTotalBilletageUSD(usdSum);
      setTotalBilletageCDF(cdfSum);

      const pendingAdv = advancesList.filter(
        (a) => a.status === 'soumise' || a.status === 'en_examen'
      ).length;
      const pendingClm = claimsList.filter(
        (c) => c.status === 'reclamation_envoyee' || c.status === 'en_examen'
      ).length;
      setPendingSalaryClaimsCount(pendingAdv + pendingClm);

      const pendingClientOrders = clientOrdersList.filter(
        (o) =>
          o.status === 'soumise' ||
          o.status === 'prise_en_charge' ||
          o.status === 'en_cours' ||
          o.status === 'en_attente_info'
      ).length;
      setPendingClientOrdersCount(pendingClientOrders);
    } catch (err) {
      console.warn('[Ets AMANI] Chargement statistiques DG :', err);
    }
  };

  useEffect(() => {
    getDgFeatures().then(setFeatures).catch(() => {});
    void loadDashboardStats();
    const statsInterval = setInterval(loadDashboardStats, 12000);
    const unsub = subscribeToDirectorGeneralConfig((cfg) => {
      setDgConfig(cfg);
    });
    const stopFinanceWatcher = startFinancialNotificationWatcher(user);
    return () => {
      clearInterval(statsInterval);
      unsub();
      stopFinanceWatcher();
    };
  }, [activeModuleId, user?.uid]);

  const isSuspended =
    user?.status === 'suspended' || dgConfig?.status === 'suspended';

  // Métriques calculées sur données réelles
  const metrics = useMemo(() => {
    const activeAgencies = agencies.filter((a) => a.status !== 'inactive');
    const activeAgents = users.filter((u) => u.role === 'agent' && u.status === 'active').length;
    const agencyAdmins = users.filter(
      (u) => u.role === 'administrateur_agence' && u.status === 'active'
    ).length;
    const clientsAndSubscribers = users.filter(
      (u) => u.role === 'client' || u.role === 'abonne'
    ).length;
    const pendingRegistrations = users.filter(
      (u) => !u.isApproved && u.status !== 'rejected'
    ).length;

    const activeOps = operations.filter(
      (o) =>
        o.status !== 'termine' &&
        o.status !== 'annule' &&
        o.status !== 'rejete' &&
        o.status !== 'archive'
    ).length;
    const completedOps = operations.filter(
      (o) => o.status === 'termine' || o.status === 'valide'
    ).length;

    const pendingTransfers = transfers.filter(
      (t) => t.status === 'en_attente_validation'
    ).length;
    const pendingReports = reports.filter(
      (r) => r.status === 'soumis' || r.status === 'en_examen'
    ).length;
    const returnedReports = reports.filter(
      (r) => r.status === 'retourne' || r.status === 'rejete'
    ).length;

    return {
      activeAgenciesCount: activeAgencies.length,
      activeAgents,
      agencyAdmins,
      clientsAndSubscribers,
      pendingRegistrations,
      totalOperations: operations.length,
      activeOps,
      completedOps,
      pendingTransfers,
      totalTransfers: transfers.length,
      pendingReports,
      returnedReports,
    };
  }, [agencies, users, operations, transfers, reports]);

  const last7DaysData = useMemo(() => {
    const days: Array<{ label: string; opsCount: number; transfersCount: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const endOfDay = startOfDay + 86400000;

      const opsCount = operations.filter((op) => {
        const time = op.createdAt ? new Date(op.createdAt).getTime() : 0;
        return time >= startOfDay && time < endOfDay;
      }).length;

      const transfersCount = transfers.filter((tr) => {
        const time = tr.createdAt ? new Date(tr.createdAt).getTime() : 0;
        return time >= startOfDay && time < endOfDay;
      }).length;

      days.push({
        label: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        opsCount,
        transfersCount,
      });
    }
    return days;
  }, [operations, transfers]);

  const recentOperations = useMemo(() => {
    return [...operations].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4);
  }, [operations]);

  const agencySummaries = useMemo(() => {
    return agencies.slice(0, 4).map((ag) => {
      const agOps = operations.filter((o) => o.agencyId === ag.id).length;
      const agTransfers = transfers
        .filter((t) => t.sourceAgencyId === ag.id || t.targetAgencyId === ag.id)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return {
        id: ag.id,
        name: ag.name,
        city: ag.city || 'RDC',
        code: ag.code,
        agOps,
        agTransfers,
      };
    });
  }, [agencies, operations, transfers]);

  const availableModules = useMemo(() => {
    return DG_MODULES.filter((mod) =>
      mod.isAvailable ? mod.isAvailable(features) : true
    );
  }, [features]);

  const visibleModules = useMemo(() => {
    return availableModules.filter((mod) => {
      if (selectedCategory !== 'all' && mod.category !== selectedCategory) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        mod.title.toLowerCase().includes(q) ||
        mod.shortTitle.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q)
      );
    });
  }, [availableModules, selectedCategory, search]);

  const activeModuleMeta = useMemo(
    () => DG_MODULES.find((m) => m.id === activeModuleId) || null,
    [activeModuleId]
  );

  const siblingModules = useMemo(() => {
    if (!activeModuleMeta) return [];
    return availableModules.filter((m) => m.category === activeModuleMeta.category);
  }, [availableModules, activeModuleMeta]);

  const handleOpenModule = (id: string) => {
    if (id === 'profile') {
      navigate('/profil');
      return;
    }
    setActiveModuleId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSidebarNavigate = (item: string) => {
    if (item === 'profile') {
      navigate('/profil');
      return;
    }
    const map: Record<string, string | null> = {
      dashboard: null,
      overview: null,
      funds: 'financial-supervision',
      'financial-supervision': 'financial-supervision',
      financial_supervision: 'financial-supervision',
      operations: 'operations-management',
      transactions: 'operations-management',
      commandes: 'client-orders',
      orders: 'client-orders',
      'client-orders': 'client-orders',
      treasury: 'billetage',
      billetage: 'billetage',
      agencies: 'agencies',
      agency_admins: 'agency-admins-management',
      members: 'agents-management',
      registrations: 'registration-requests',
      regulations: 'registration-requests',
      reports: 'reports-center',
      transfers: 'inter-agency-transfers',
      debts: 'debts-management',
      accounting: 'inter-agency-transfers',
      salaries: 'salaries-management',
      commissions: 'operations-management',
      chat: 'internal-chat',
      internal_directory: 'internal-numbers',
      connectivity: 'connectivity-sync',
      audit: 'audit-logs',
      alerts: 'audit-logs',
      incidents: 'audit-logs',
      settings: 'dg-config',
    };
    if (item in map) {
      setActiveModuleId(map[item]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getModuleBadge = (mod: DgModuleItem): string | undefined => {
    if (mod.id === 'registration-requests' && metrics.pendingRegistrations > 0) {
      return `${metrics.pendingRegistrations}`;
    }
    if (mod.id === 'reports-center' && metrics.pendingReports > 0) {
      return `${metrics.pendingReports}`;
    }
    if (mod.id === 'inter-agency-transfers' && metrics.pendingTransfers > 0) {
      return `${metrics.pendingTransfers}`;
    }
    if (mod.id === 'salaries-management' && pendingSalaryClaimsCount > 0) {
      return `${pendingSalaryClaimsCount}`;
    }
    if (mod.id === 'operations-management' && metrics.activeOps > 0) {
      return `${metrics.activeOps}`;
    }
    if (mod.id === 'client-orders' && pendingClientOrdersCount > 0) {
      return `${pendingClientOrdersCount}`;
    }
    return mod.badge;
  };

  const renderModuleItems = (items: DgModuleItem[]) => {
    return (
      <DashboardModuleGrid
        columns={4}
        layout={viewMode === 'list' ? 'list' : 'grid'}
      >
        {items.map((item) => (
          <DashboardModuleCard
            key={item.id}
            title={item.title}
            shortTitle={item.shortTitle}
            description={item.description}
            icon={item.icon}
            variant={item.variant}
            badge={getModuleBadge(item)}
            layout={viewMode === 'list' ? 'list' : 'tile'}
            onClick={() => handleOpenModule(item.id)}
          />
        ))}
      </DashboardModuleGrid>
    );
  };

  const sidebarActiveItem = useMemo(() => {
    if (!activeModuleId) return 'dashboard';
    const reverseMap: Record<string, string> = {
      'financial-supervision': 'funds',
      'operations-management': 'transactions',
      'client-orders': 'commandes',
      billetage: 'treasury',
      agencies: 'agencies',
      'agency-admins-management': 'members',
      'agents-management': 'members',
      'salaries-management': 'salaries',
      'reports-center': 'reports',
      'inter-agency-transfers': 'transfers',
      'debts-management': 'debts',
      'internal-chat': 'chat',
      'internal-numbers': 'internal_directory',
      'connectivity-sync': 'connectivity',
      'audit-logs': 'audit',
      'registration-requests': 'registrations',
      'dg-config': 'settings',
    };
    return reverseMap[activeModuleId] || activeModuleId;
  }, [activeModuleId]);

  const totalPendingInterventions =
    metrics.pendingRegistrations +
    metrics.pendingReports +
    metrics.pendingTransfers +
    pendingSalaryClaimsCount +
    pendingClientOrdersCount +
    metrics.returnedReports;

  return (
    <AppLayout
      title="Direction Générale — Ets AMANI"
      subtitle="Pilotage exécutif, trésorerie multi-devises et supervision réseau"
      activeItem={sidebarActiveItem}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => {
        setActiveModuleId('internal-chat');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <div className="space-y-4">
        {activeModuleId ? (
          <section className="space-y-4">
            <WorkspaceNavigationHeader
              workspaceTitle="Direction Générale"
              activeModuleTitle={activeModuleMeta?.title || activeModuleId}
              activeModuleDescription={activeModuleMeta?.description}
              category={
                activeModuleMeta?.category
                  ? EXECUTIVE_POLES.find((p) => p.key === activeModuleMeta.category)?.title
                  : undefined
              }
              onBack={() => setActiveModuleId(null)}
              backLabel="Centre de pilotage"
              tabs={
                siblingModules.length > 1
                  ? siblingModules.map((mod) => ({
                      id: mod.id,
                      label: mod.shortTitle,
                      icon: mod.icon,
                    }))
                  : availableModules.map((mod) => ({
                      id: mod.id,
                      label: mod.shortTitle,
                      icon: mod.icon,
                    }))
              }
              activeTabId={activeModuleId}
              onTabChange={(id) => handleOpenModule(id)}
            />

            <div className="relative">
              {activeModuleId === 'billetage' && (
                <BilletageModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'operations-management' && (
                <OperationModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'client-orders' && (
                <CommandesClientsModule
                  onClose={() => setActiveModuleId(null)}
                  onOrdersUpdated={() => void loadDashboardStats()}
                />
              )}
              {activeModuleId === 'internal-numbers' && (
                <InternalNumbersModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'connectivity-sync' && (
                <ConnectivityModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'agencies' && (
                <AgenciesModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'agency-admins-management' && (
                <AgentManagementModule
                  canManageAllAgencies
                  initialTab="agency_admins"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'agents-management' && (
                <AgentManagementModule
                  canManageAllAgencies
                  initialTab="agents"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'registration-requests' && (
                <RegistrationRequestsModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'audit-logs' && (
                <AuditModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'dg-config' && (
                <SystemConfigModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'reports-center' && (
                <ReportsModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'inter-agency-transfers' && (
                <TreasuryTransfersDebtsModule
                  mode="transfers"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'debts-management' && (
                <TreasuryTransfersDebtsModule
                  mode="debts"
                  onClose={() => setActiveModuleId(null)}
                />
              )}
              {activeModuleId === 'internal-chat' && (
                <ChatModule onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'salaries-management' && (
                <SalaryModule mode="dg" onClose={() => setActiveModuleId(null)} />
              )}
              {activeModuleId === 'financial-supervision' && (
                <FinancialSupervisionModule mode="dg" onClose={() => setActiveModuleId(null)} />
              )}
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            {/* En-tête de Direction & Actions Directes */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div>
                <span className="text-[10px] font-extrabold tracking-widest text-[#C58B39] uppercase">
                  DIRECTION GÉNÉRALE • CENTRE DE PILOTAGE
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Bonjour, {user?.displayName?.split(' ')[0] || 'Directeur Général'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Supervision consolidée des agences, caisse, missions et contrôle interne
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenModule('financial-supervision')}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition whitespace-nowrap"
                >
                  Crédits &amp; Fonds
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenModule('inter-agency-transfers')}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition whitespace-nowrap"
                >
                  Transferts
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenModule('operations-management')}
                  className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C] hover:opacity-95 transition whitespace-nowrap"
                >
                  Nouvelle mission
                </button>
              </div>
            </div>

            {isSuspended && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3.5 text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold">
                      Mandat de Direction Générale momentanément suspendu
                    </p>
                    <p className="text-[11px] opacity-90">
                      Motif : « {dgConfig?.suspensionReason || 'Procédure administrative en cours'} » — consultation uniquement.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* NIVEAU 1 : Situation générale (KPIs unifiés et non redondants) */}
            <section aria-label="Situation générale" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <button
                type="button"
                onClick={() => handleOpenModule('billetage')}
                className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Caisse USD</span>
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white truncate">
                  ${totalBilletageUSD.toLocaleString('fr-FR')}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {totalBilletageCDF.toLocaleString('fr-FR')} CDF
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModule('agencies')}
                className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Agences</span>
                  <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {metrics.activeAgenciesCount}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {metrics.agencyAdmins} admin(s) actifs
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModule('agents-management')}
                className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Agents</span>
                  <Users className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                </div>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {metrics.activeAgents}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {metrics.clientsAndSubscribers} clients/abonnés
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModule('operations-management')}
                className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Missions</span>
                  <Activity className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {metrics.activeOps}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {metrics.completedOps} terminée(s)
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModule('inter-agency-transfers')}
                className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Transferts</span>
                  <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {metrics.pendingTransfers}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {metrics.totalTransfers} au total
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModule('reports-center')}
                className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Rapports</span>
                  <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {reports.length}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {metrics.pendingReports} à valider
                </p>
              </button>
            </section>

            {/* NIVEAU 2 : Alertes & interventions en attente */}
            <section
              aria-label="Alertes et interventions en attente"
              className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {totalPendingInterventions > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    Alertes & interventions en attente
                  </h3>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                  {totalPendingInterventions === 0
                    ? 'Aucune action urgente'
                    : `${totalPendingInterventions} dossier(s) à traiter`}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenModule('registration-requests')}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-2.5 py-2 text-left hover:border-[#C58B39]/60 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCheck className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                      Inscriptions
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                    {metrics.pendingRegistrations}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenModule('reports-center')}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-2.5 py-2 text-left hover:border-[#C58B39]/60 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                      Rapports soumis
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                    {metrics.pendingReports}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenModule('inter-agency-transfers')}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-2.5 py-2 text-left hover:border-[#C58B39]/60 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                      Transferts en attente
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                    {metrics.pendingTransfers}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenModule('salaries-management')}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-2.5 py-2 text-left hover:border-[#C58B39]/60 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Wallet className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                      Avances / Paie
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                    {pendingSalaryClaimsCount}
                  </span>
                </button>
              </div>
            </section>

            {/* NIVEAU 3 : Activités récentes, opérations & réseau d'agences */}
            <section aria-label="Activités récentes et suivi réseau" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Activité 7j + dernières missions */}
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Activité des 7 derniers jours & missions récentes
                    </h3>
                    <p className="text-[10px] text-slate-400">Données locales & synchronisées</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenModule('operations-management')}
                    className="text-[11px] font-bold text-[#C58B39] hover:underline"
                  >
                    Opérations
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1.5 items-end h-16 pt-1 border-b border-slate-100 dark:border-slate-800 pb-2">
                  {last7DaysData.map((d, i) => {
                    const maxVal = Math.max(
                      4,
                      ...last7DaysData.map((x) => x.opsCount + x.transfersCount)
                    );
                    const pct = Math.min(100, ((d.opsCount + d.transfersCount) / maxVal) * 100);
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 h-full justify-end">
                        <div className="w-full max-w-[18px] flex items-end justify-center gap-0.5 h-10">
                          <div
                            style={{ height: `${Math.max(10, pct)}%` }}
                            className="w-2 rounded-t-xs bg-[#0B192C] dark:bg-slate-300"
                            title={`${d.opsCount} op. / ${d.transfersCount} tr.`}
                          />
                        </div>
                        <span className="text-[9px] capitalize text-slate-400">{d.label}</span>
                      </div>
                    );
                  })}
                </div>

                {recentOperations.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 text-center">
                    Aucune opération récente enregistrée.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {recentOperations.map((op) => (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => handleOpenModule('operations-management')}
                        className="w-full py-1.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 px-1 rounded transition"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {op.title}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate tabular-nums">
                            {op.operationNumber} · {op.agencyName || 'Réseau'}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 shrink-0">
                          {op.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Réseau d'agences & derniers transferts */}
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    Supervision des agences & transferts récents
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleOpenModule('agencies')}
                    className="text-[11px] font-bold text-[#C58B39] hover:underline"
                  >
                    Agences
                  </button>
                </div>

                {agencySummaries.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Aucune agence enregistrée dans le réseau.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {agencySummaries.map((ag) => (
                      <button
                        key={ag.id}
                        type="button"
                        onClick={() => handleOpenModule('agencies')}
                        className="w-full py-1.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 px-1 rounded transition"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {ag.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {ag.city} · Code {ag.code} · {ag.agOps} op.
                          </p>
                        </div>
                        <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                          ${ag.agTransfers.toLocaleString('en-US')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* NIVEAU 4 : Accès rapide — Grille compacte 3 / 4 colonnes */}
            <section aria-label="Accès rapide aux modules" className="space-y-3">
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                  {CATEGORY_FILTER_TABS.map((tab) => {
                    const active = selectedCategory === tab.id;
                    const count =
                      tab.id === 'all'
                        ? availableModules.length
                        : availableModules.filter((m) => m.category === tab.id).length;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedCategory(tab.id)}
                        className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                          active
                            ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="font-mono text-[10px] tabular-nums opacity-75">
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher un module..."
                      className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-8 pr-7 text-xs text-slate-900 dark:text-white outline-none transition focus:border-slate-400 dark:focus:border-slate-500"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      aria-label="Affichage en grille"
                      className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
                        viewMode === 'grid'
                          ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      aria-label="Affichage en liste"
                      className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
                        viewMode === 'list'
                          ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {visibleModules.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 text-center">
                  <Grid2X2 className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                  <p className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    Aucun module ne correspond à votre recherche
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('all');
                      setSearch('');
                    }}
                    className="mt-3 rounded-lg bg-slate-900 dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C]"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : selectedCategory === 'all' && !search.trim() ? (
                <div className="space-y-4">
                  {EXECUTIVE_POLES.map((pole) => {
                    const poleModules = visibleModules.filter(
                      (m) => m.category === pole.key
                    );
                    if (poleModules.length === 0) return null;
                    return (
                      <div key={pole.key} className="space-y-2">
                        <div className="flex items-baseline justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-1.5">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            {pole.index}. {pole.title}
                          </h3>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {poleModules.length} module(s)
                          </span>
                        </div>
                        {renderModuleItems(poleModules)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                renderModuleItems(visibleModules)
              )}
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
