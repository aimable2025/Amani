import {
  Activity,
  ArrowLeftRight,
  ClipboardList,
  Coins,
  FileText,
  History,
  MessageSquare,
  Scale,
  UserCheck,
  Users,
  Wallet,
  WalletCards,
  Wifi,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import DashboardModuleCard from '../../components/dashboard/DashboardModuleCard';
import DashboardModuleGrid from '../../components/dashboard/DashboardModuleGrid';
import WorkspaceNavigationHeader from '../../components/dashboard/WorkspaceNavigationHeader';
import DashboardToolbar, {
  type DashboardViewMode,
} from '../../components/dashboard/DashboardToolbar';
import BilletageModule from './components/BilletageModule';
import OperationModule from './components/OperationModule';
import AgentManagementModule from './components/AgentManagementModule';
import RegistrationRequestsModule from './components/RegistrationRequestsModule';
import ConnectivityModule from './components/ConnectivityModule';
import ReportsModule from './components/ReportsModule';
import ChatModule from './components/ChatModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import SalaryModule from './components/SalaryModule';
import AuditModule from './components/AuditModule';
import CommandesClientsModule from './components/CommandesClientsModule';
import FinancialSupervisionModule from './components/FinancialSupervisionModule';
import UnifiedExecutiveOverview from '../../components/dashboard/UnifiedExecutiveOverview';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import { getAgencyUsers } from '../../services/AgencyUserService';
import { fetchScopedClientOrders } from '../../services/ClientOrderService';
import { startFinancialNotificationWatcher } from '../../services/LocalNotificationService';

type ModuleId =
  | 'funds'
  | 'billetage'
  | 'operations'
  | 'commandes'
  | 'agents'
  | 'registrations'
  | 'connectivity'
  | 'reports'
  | 'chat'
  | 'transfers'
  | 'debts'
  | 'salaries'
  | 'audit';

const AGENCY_MODULES_META: Record<
  ModuleId,
  { title: string; shortTitle: string; description: string; category: string; icon: typeof WalletCards }
> = {
  funds: {
    title: 'Crédits Virtuels & Fonds Agents',
    shortTitle: 'Crédits & Fonds',
    description: 'Soldes USD/CDF par agent, réapprovisionnements, remises cash, rapprochement SMS et inventaires.',
    category: 'Caisse & Finances',
    icon: Wallet,
  },
  billetage: {
    title: 'Billetage de Caisse & Coffre',
    shortTitle: 'Billetage',
    description: 'Comptage contradictoire quotidien des devises USD et CDF.',
    category: 'Caisse & Finances',
    icon: WalletCards,
  },
  salaries: {
    title: 'Salaires & Guichet Payeur',
    shortTitle: 'Salaires',
    description: "Décaissement des salaires et avances autorisés pour l'agence.",
    category: 'Caisse & Finances',
    icon: Coins,
  },
  operations: {
    title: 'Missions & Opérations Agence',
    shortTitle: 'Missions',
    description: 'Affectation des tâches opérationnelles aux agents et suivi.',
    category: 'Missions & Mouvements',
    icon: Activity,
  },
  commandes: {
    title: 'Commandes & Réclamations Clients',
    shortTitle: 'Commandes',
    description: 'Réception, affectation aux agents et décision sur les réclamations/restitutions.',
    category: 'Missions & Mouvements',
    icon: ClipboardList,
  },
  reports: {
    title: "Rapports d'Agence & Exports",
    shortTitle: 'Rapports',
    description: "États financiers, opérationnels et clôtures de l'agence.",
    category: 'Rapports & Audit',
    icon: FileText,
  },
  transfers: {
    title: 'Transferts Inter-Agences',
    shortTitle: 'Transferts',
    description: 'Mouvements de fonds inter-succursales et ravitaillements.',
    category: 'Missions & Mouvements',
    icon: ArrowLeftRight,
  },
  debts: {
    title: 'Suivi des Dettes & Créances',
    shortTitle: 'Dettes',
    description: 'Enregistrement et suivi des dettes clients, agents et entreprise.',
    category: 'Caisse & Finances',
    icon: Scale,
  },
  chat: {
    title: 'Chat Interne & Annonces',
    shortTitle: 'Chat & Notes',
    description: "Messagerie d'agence et notes de service officielles.",
    category: 'Personnel & Communication',
    icon: MessageSquare,
  },
  agents: {
    title: "Gestion des Agents de l'Agence",
    shortTitle: 'Agents',
    description: 'Polyvalence de guichet et affectation des services autorisés.',
    category: 'Personnel & Communication',
    icon: Users,
  },
  registrations: {
    title: 'Inscriptions Abonnés & Clients',
    shortTitle: 'Inscriptions',
    description: 'Examen et approbation des demandes de comptes locaux.',
    category: 'Personnel & Communication',
    icon: UserCheck,
  },
  connectivity: {
    title: 'Disponibilité & Synchronisation',
    shortTitle: 'Synchro',
    description: 'Stockage local sécurisé et liaison avec le siège central.',
    category: 'Rapports & Audit',
    icon: Wifi,
  },
  audit: {
    title: "Journal d'Activité & Audit",
    shortTitle: 'Audit',
    description: "Traçabilité horodatée des actions et mouvements de caisse.",
    category: 'Rapports & Audit',
    icon: History,
  },
};

const AGENCY_MODULE_CARDS: Array<{
  id: ModuleId;
  pole: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: typeof WalletCards;
  variant: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  badge?: string;
}> = [
  {
    id: 'funds',
    pole: '01. Caisse & Finances Locales',
    title: 'Crédits Virtuels & Fonds Agents',
    shortTitle: 'Crédits & Fonds',
    description: 'Supervision des stocks cash/virtuel USD & CDF, remises cash, inventaires et anomalies.',
    icon: Wallet,
    variant: 'primary',
    badge: 'USD/CDF',
  },
  {
    id: 'billetage',
    pole: '01. Caisse & Finances Locales',
    title: 'Billetage de Caisse & Coffre',
    shortTitle: 'Billetage',
    description: 'Comptage contradictoire quotidien USD et CDF.',
    icon: WalletCards,
    variant: 'success',
  },
  {
    id: 'salaries',
    pole: '01. Caisse & Finances Locales',
    title: 'Salaires & Guichet Payeur',
    shortTitle: 'Salaires',
    description: "Décaissement des salaires et avances autorisés.",
    icon: Coins,
    variant: 'success',
    badge: 'Paie',
  },
  {
    id: 'debts',
    pole: '01. Caisse & Finances Locales',
    title: 'Suivi des Dettes & Créances',
    shortTitle: 'Dettes',
    description: 'Dettes clients, agents et entreprise, et remboursements.',
    icon: Scale,
    variant: 'warning',
  },
  {
    id: 'operations',
    pole: '02. Missions & Mouvements',
    title: 'Missions & Opérations',
    shortTitle: 'Missions',
    description: 'Affectation des tâches aux agents et suivi.',
    icon: Activity,
    variant: 'primary',
  },
  {
    id: 'commandes',
    pole: '02. Missions & Mouvements',
    title: 'Commandes & Réclamations Clients',
    shortTitle: 'Commandes',
    description: 'Commandes clients/abonnés, affectation agents et restitutions.',
    icon: ClipboardList,
    variant: 'primary',
  },
  {
    id: 'transfers',
    pole: '02. Missions & Mouvements',
    title: 'Transferts Inter-Agences',
    shortTitle: 'Transferts',
    description: 'Mouvements de fonds inter-succursales.',
    icon: ArrowLeftRight,
    variant: 'primary',
  },
  {
    id: 'chat',
    pole: '03. Personnel & Communication',
    title: 'Chat Interne & Annonces',
    shortTitle: 'Chat & Notes',
    description: "Messagerie d'agence et notes de service.",
    icon: MessageSquare,
    variant: 'primary',
  },
  {
    id: 'agents',
    pole: '03. Personnel & Communication',
    title: "Gestion des Agents de l'Agence",
    shortTitle: 'Agents',
    description: 'Polyvalence de guichet et services autorisés.',
    icon: Users,
    variant: 'warning',
  },
  {
    id: 'registrations',
    pole: '03. Personnel & Communication',
    title: 'Inscriptions Abonnés & Clients',
    shortTitle: 'Inscriptions',
    description: 'Approbation des clients et abonnés locaux.',
    icon: UserCheck,
    variant: 'primary',
  },
  {
    id: 'reports',
    pole: '04. Rapports & Infrastructure',
    title: "Rapports d'Agence & Exports",
    shortTitle: 'Rapports',
    description: "États financiers et clôtures PDF / Excel.",
    icon: FileText,
    variant: 'success',
  },
  {
    id: 'connectivity',
    pole: '04. Rapports & Infrastructure',
    title: 'Disponibilité & Synchronisation',
    shortTitle: 'Synchro',
    description: 'Stockage local et liaison serveur central.',
    icon: Wifi,
    variant: 'default',
  },
  {
    id: 'audit',
    pole: '04. Rapports & Infrastructure',
    title: "Journal d'Activité & Audit",
    shortTitle: 'Audit',
    description: "Traçabilité horodatée de l'agence.",
    icon: History,
    variant: 'danger',
  },
];

export default function AdministrateurAgenceDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null);
  const [resolvedAgencyName, setResolvedAgencyName] = useState<string | null>(null);

  const agencyName = resolvedAgencyName || user?.agencyId || 'Agence Centrale';

  const [totalUsd, setTotalUsd] = useState(0);
  const [totalCdf, setTotalCdf] = useState(0);
  const [activeAgentsCount, setActiveAgentsCount] = useState(0);
  const [activeOperationsCount, setActiveOperationsCount] = useState(0);
  const [pendingClientOrdersCount, setPendingClientOrdersCount] = useState(0);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<DashboardViewMode>('grid');

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        const agencyId = user?.agencyId;
        if (agencyId) {
          const agencyDoc = await getAgency(agencyId);
          if (isMounted && agencyDoc?.name) {
            setResolvedAgencyName(agencyDoc.name);
          }
        }

        const billetages = await db.billetages.toArray();
        const agencyBilletages = agencyId
          ? billetages.filter((b) => b.agencyId === agencyId)
          : billetages;

        let usdSum = 0;
        let cdfSum = 0;
        agencyBilletages.forEach((b) => {
          const amount = b.calculatedTotal || b.declaredAmount || 0;
          if (b.currency === 'USD') usdSum += amount;
          if (b.currency === 'CDF') cdfSum += amount;
        });

        const ops = await db.operations.toArray();
        const agencyOps = ops.filter(
          (o) =>
            (!agencyId || o.agencyId === agencyId) &&
            (o.status === 'en_cours' || o.status === 'cree' || o.status === 'assigne')
        );

        let agentsCount = 0;
        if (agencyId) {
          const agencyUsers = await getAgencyUsers(agencyId);
          agentsCount = agencyUsers.filter((u) => u.status === 'active' && u.role === 'agent').length;
        }

        let pendingOrdersCount = 0;
        if (user) {
          const scopedOrders = await fetchScopedClientOrders(user, false);
          pendingOrdersCount = scopedOrders.filter(
            (o) =>
              o.status === 'soumise' ||
              o.status === 'prise_en_charge' ||
              o.status === 'en_cours' ||
              o.status === 'en_attente_info'
          ).length;
        }

        if (isMounted) {
          setTotalUsd(usdSum);
          setTotalCdf(cdfSum);
          setActiveOperationsCount(agencyOps.length);
          setActiveAgentsCount(agentsCount);
          setPendingClientOrdersCount(pendingOrdersCount);
        }
      } catch (err) {
        console.warn('[Ets AMANI] Erreur chargement statistiques agence :', err);
      }
    }

    void loadStats();
    const interval = setInterval(loadStats, 8000);
    const stopFinanceWatcher = startFinancialNotificationWatcher(user);
    return () => {
      isMounted = false;
      clearInterval(interval);
      stopFinanceWatcher();
    };
  }, [user?.agencyId, user?.uid]);

  const handleSidebarNavigate = (item: string) => {
    if (item === 'profile') {
      navigate('/profil');
      return;
    }
    const map: Record<string, ModuleId | null> = {
      dashboard: null,
      overview: null,
      funds: 'funds',
      'financial-supervision': 'funds',
      financial_supervision: 'funds',
      operations: 'operations',
      transactions: 'operations',
      commandes: 'commandes',
      orders: 'commandes',
      'client-orders': 'commandes',
      treasury: 'billetage',
      billetage: 'billetage',
      members: 'agents',
      registrations: 'registrations',
      regulations: 'registrations',
      reports: 'reports',
      transfers: 'transfers',
      debts: 'debts',
      accounting: 'transfers',
      salaries: 'salaries',
      chat: 'chat',
      audit: 'audit',
      incidents: 'audit',
      connectivity: 'connectivity',
      settings: 'connectivity',
    };
    if (item in map) {
      setActiveModule(map[item]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const sidebarActiveItem = useMemo(() => {
    if (!activeModule) return 'dashboard';
    const reverseMap: Record<ModuleId, string> = {
      funds: 'funds',
      billetage: 'treasury',
      operations: 'transactions',
      commandes: 'commandes',
      agents: 'members',
      registrations: 'registrations',
      connectivity: 'connectivity',
      reports: 'reports',
      chat: 'chat',
      transfers: 'transfers',
      debts: 'debts',
      salaries: 'salaries',
      audit: 'audit',
    };
    return reverseMap[activeModule] || activeModule;
  }, [activeModule]);

  return (
    <AppLayout
      title={`Administration — ${agencyName}`}
      subtitle="Gestion opérationnelle, caisse locale et affectation des agents"
      activeItem={sidebarActiveItem}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => {
        setActiveModule('chat');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <div className="space-y-4">
        {activeModule ? (
          <div className="space-y-4">
            <WorkspaceNavigationHeader
              workspaceTitle={`Administration — ${agencyName}`}
              activeModuleTitle={AGENCY_MODULES_META[activeModule]?.title || activeModule}
              activeModuleDescription={AGENCY_MODULES_META[activeModule]?.description}
              category={AGENCY_MODULES_META[activeModule]?.category}
              backLabel="Accueil Agence"
              onBack={() => setActiveModule(null)}
              tabs={[
                { id: 'funds', label: 'Crédits & Fonds', icon: Wallet },
                { id: 'billetage', label: 'Billetage', icon: WalletCards },
                { id: 'salaries', label: 'Salaires', icon: Coins },
                {
                  id: 'operations',
                  label: 'Missions',
                  icon: Activity,
                  badge: activeOperationsCount > 0 ? activeOperationsCount : undefined,
                },
                {
                  id: 'commandes',
                  label: 'Commandes',
                  icon: ClipboardList,
                  badge: pendingClientOrdersCount > 0 ? pendingClientOrdersCount : undefined,
                },
                { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
                { id: 'debts', label: 'Dettes', icon: Scale },
                { id: 'chat', label: 'Chat', icon: MessageSquare },
                {
                  id: 'agents',
                  label: 'Agents',
                  icon: Users,
                  badge: activeAgentsCount > 0 ? activeAgentsCount : undefined,
                },
                { id: 'registrations', label: 'Inscriptions', icon: UserCheck },
                { id: 'reports', label: 'Rapports', icon: FileText },
                { id: 'audit', label: 'Audit', icon: History },
                { id: 'connectivity', label: 'Synchro', icon: Wifi },
              ]}
              activeTabId={activeModule}
              onTabChange={(id) => {
                setActiveModule(id as ModuleId);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            <div className="relative">
              {activeModule === 'funds' && (
                <FinancialSupervisionModule
                  mode="agency_admin"
                  onClose={() => setActiveModule(null)}
                />
              )}
              {activeModule === 'billetage' && (
                <BilletageModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'operations' && (
                <OperationModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'commandes' && (
                <CommandesClientsModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'agents' && (
                <AgentManagementModule
                  currentAgencyId={user?.agencyId}
                  onClose={() => setActiveModule(null)}
                />
              )}
              {activeModule === 'registrations' && (
                <RegistrationRequestsModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'connectivity' && (
                <ConnectivityModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'reports' && (
                <ReportsModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'chat' && (
                <ChatModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'transfers' && (
                <TreasuryTransfersDebtsModule
                  mode="transfers"
                  onClose={() => setActiveModule(null)}
                />
              )}
              {activeModule === 'debts' && (
                <TreasuryTransfersDebtsModule
                  mode="debts"
                  onClose={() => setActiveModule(null)}
                />
              )}
              {activeModule === 'salaries' && (
                <SalaryModule mode="agent" onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'audit' && (
                <AuditModule
                  agencyIdFilter={user?.agencyId}
                  agencyName={agencyName || undefined}
                  onClose={() => setActiveModule(null)}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bandeau Caisse Locale synthétique */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Caisse Agence USD
                </span>
                <p className="mt-1 text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                  ${totalUsd.toLocaleString('fr-FR')}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Caisse Agence CDF
                </span>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {totalCdf.toLocaleString('fr-FR')} CDF
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Agents Actifs
                </span>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {activeAgentsCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Missions en cours
                </span>
                <p className="mt-1 text-lg font-black tabular-nums text-amber-600 dark:text-amber-400">
                  {activeOperationsCount}
                </p>
              </div>
            </div>

            <UnifiedExecutiveOverview
              kicker="ADMINISTRATION D'AGENCE"
              title={`Bonjour, ${user?.displayName?.split(' ')[0] || 'Responsable'}`}
              subtitle={`Agence ${agencyName} • Vue opérationnelle et caisse locale`}
              agencyIdFilter={user?.agencyId}
              onNewTransfer={() => setActiveModule('transfers')}
              onNewOperation={() => setActiveModule('operations')}
              onViewAgencies={() => setActiveModule('agents')}
              onViewTransfers={() => setActiveModule('transfers')}
              onViewReports={() => setActiveModule('reports')}
              onViewOperations={() => setActiveModule('operations')}
            />

            <DashboardToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher un module d'agence..."
            />

            <div className="space-y-4">
              {Array.from(new Set(AGENCY_MODULE_CARDS.map((m) => m.pole))).map((pole) => {
                const poleModules = AGENCY_MODULE_CARDS.filter(
                  (m) =>
                    m.pole === pole &&
                    (!search.trim() ||
                      m.title.toLowerCase().includes(search.toLowerCase()) ||
                      m.shortTitle.toLowerCase().includes(search.toLowerCase()) ||
                      m.description.toLowerCase().includes(search.toLowerCase()))
                );
                if (poleModules.length === 0) return null;

                return (
                  <div key={pole} className="space-y-2">
                    <div className="border-b border-slate-200/80 dark:border-slate-800 pb-1.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {pole}
                      </h3>
                    </div>
                    <DashboardModuleGrid
                      columns={4}
                      layout={viewMode === 'list' ? 'list' : 'grid'}
                    >
                      {poleModules.map((item) => (
                        <DashboardModuleCard
                          key={item.id}
                          title={item.title}
                          shortTitle={item.shortTitle}
                          description={item.description}
                          icon={item.icon}
                          variant={item.variant}
                          badge={
                            item.id === 'operations' && activeOperationsCount > 0
                              ? `${activeOperationsCount}`
                              : item.id === 'commandes' && pendingClientOrdersCount > 0
                                ? `${pendingClientOrdersCount}`
                                : item.id === 'agents' && activeAgentsCount > 0
                                  ? `${activeAgentsCount}`
                                  : item.badge
                          }
                          layout={viewMode === 'list' ? 'list' : 'tile'}
                          onClick={() => {
                            setActiveModule(item.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        />
                      ))}
                    </DashboardModuleGrid>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
