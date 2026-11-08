import {
  Activity,
  ArrowLeftRight,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  RefreshCw,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
  Wifi,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import DashboardModuleCard from '../../components/dashboard/DashboardModuleCard';
import DashboardModuleGrid from '../../components/dashboard/DashboardModuleGrid';
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
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
import UnifiedExecutiveOverview from '../../components/dashboard/UnifiedExecutiveOverview';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import { getAgencyUsers } from '../../services/AgencyUserService';

type ModuleId =
  | 'billetage'
  | 'operations'
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
  { title: string; description: string; category: string; icon: typeof WalletCards }
> = {
  billetage: {
    title: 'Billetage de Caisse & Coffre',
    description: 'Comptage contradictoire quotidien des devises USD et Francs Congolais.',
    category: 'Caisse & Finances',
    icon: WalletCards,
  },
  salaries: {
    title: 'Salaires & Guichet Payeur',
    description: "Décaissement des salaires et avances autorisés par la Direction pour l'agence.",
    category: 'Caisse & Finances',
    icon: Coins,
  },
  operations: {
    title: 'Missions & Opérations Agence',
    description: "Affectation des tâches opérationnelles aux agents et suivi de complétion.",
    category: 'Missions & Mouvements',
    icon: Activity,
  },
  reports: {
    title: "Rapports d'Agence & Exports",
    description: "États financiers, opérationnels et clôtures de l'agence en PDF et Excel.",
    category: 'Rapports & Audit',
    icon: FileText,
  },
  transfers: {
    title: 'Transferts Inter-Agences',
    description: 'Mouvements de fonds inter-succursales (argent physique, virtuel et ravitaillements).',
    category: 'Missions & Mouvements',
    icon: ArrowLeftRight,
  },
  debts: {
    title: 'Suivi des Dettes & Créances',
    description: 'Enregistrement des dettes clients, agents et entreprise, et suivi des remboursements.',
    category: 'Caisse & Finances',
    icon: Scale,
  },
  chat: {
    title: 'Chat Interne, Annonces & IA',
    description: "Messagerie d'agence, notes de service officielles et assistant analytique.",
    category: 'Personnel & Communication',
    icon: MessageSquare,
  },
  agents: {
    title: "Gestion des Agents de l'Agence",
    description: 'Activer la polyvalence de guichet et affecter les services autorisés.',
    category: 'Personnel & Communication',
    icon: Users,
  },
  registrations: {
    title: 'Inscriptions Abonnés & Clients',
    description: 'Examen des pièces justificatives et approbation des clients locaux.',
    category: 'Personnel & Communication',
    icon: UserCheck,
  },
  connectivity: {
    title: 'Disponibilité & Synchronisation',
    description: "Vérification du stockage local sécurisé et de la liaison avec le siège central.",
    category: 'Rapports & Audit',
    icon: Wifi,
  },
  audit: {
    title: "Journal d'Activité & Audit",
    description: "Traçabilité et historique horodaté des actions et mouvements de caisse de l'agence.",
    category: 'Rapports & Audit',
    icon: History,
  },
};

const AGENCY_MODULE_CARDS: Array<{
  id: ModuleId;
  pole: string;
  title: string;
  description: string;
  icon: typeof WalletCards;
  variant: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  badge?: string;
}> = [
  {
    id: 'billetage',
    pole: '01. Caisse & Finances Locales',
    title: 'Billetage de Caisse & Coffre',
    description: 'Comptage contradictoire quotidien des devises USD et Francs Congolais.',
    icon: WalletCards,
    variant: 'success',
  },
  {
    id: 'salaries',
    pole: '01. Caisse & Finances Locales',
    title: 'Salaires & Guichet Payeur',
    description: "Décaissement des salaires et avances autorisés par la Direction pour l'agence.",
    icon: Coins,
    variant: 'success',
    badge: 'Paie Agence',
  },
  {
    id: 'debts',
    pole: '01. Caisse & Finances Locales',
    title: 'Suivi des Dettes & Créances',
    description: 'Enregistrement des dettes clients, agents et entreprise, et suivi des remboursements.',
    icon: Scale,
    variant: 'warning',
  },
  {
    id: 'operations',
    pole: '02. Missions & Mouvements',
    title: 'Missions & Opérations',
    description: 'Affectation des tâches opérationnelles aux agents et suivi de complétion.',
    icon: Activity,
    variant: 'primary',
  },
  {
    id: 'transfers',
    pole: '02. Missions & Mouvements',
    title: 'Transferts Inter-Agences',
    description: 'Mouvements de fonds inter-succursales (argent physique, virtuel et ravitaillements).',
    icon: ArrowLeftRight,
    variant: 'primary',
  },
  {
    id: 'chat',
    pole: '03. Personnel & Communication',
    title: 'Chat Interne, Annonces & IA',
    description: "Messagerie d'agence, notes de service officielles et assistant analytique.",
    icon: MessageSquare,
    variant: 'primary',
  },
  {
    id: 'agents',
    pole: '03. Personnel & Communication',
    title: "Gestion des Agents de l'Agence",
    description: 'Activer la polyvalence de guichet et affecter les services autorisés.',
    icon: Users,
    variant: 'warning',
  },
  {
    id: 'registrations',
    pole: '03. Personnel & Communication',
    title: 'Inscriptions Abonnés & Clients',
    description: 'Examen des pièces justificatives et approbation des clients locaux.',
    icon: UserCheck,
    variant: 'primary',
  },
  {
    id: 'reports',
    pole: '04. Rapports & Infrastructure',
    title: "Rapports d'Agence & Exports",
    description: "États financiers, opérationnels et clôtures de l'agence en PDF et Excel.",
    icon: FileText,
    variant: 'success',
    badge: 'PDF / Excel',
  },
  {
    id: 'connectivity',
    pole: '04. Rapports & Infrastructure',
    title: 'Disponibilité & Synchronisation',
    description: "Vérification du stockage local sécurisé et de la liaison avec le siège central.",
    icon: Wifi,
    variant: 'default',
  },
  {
    id: 'audit',
    pole: '04. Rapports & Infrastructure',
    title: "Journal d'Activité & Audit",
    description: "Traçabilité horodatée de l'ensemble des actions et opérations de l'agence.",
    icon: History,
    variant: 'danger',
    badge: 'Traçabilité',
  },
];

export default function AdministrateurAgenceDashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null);
  const [resolvedAgencyName, setResolvedAgencyName] = useState<string | null>(null);

  const agencyName = resolvedAgencyName || user?.agencyId || 'Agence Centrale';

  const [totalUsd, setTotalUsd] = useState(0);
  const [totalCdf, setTotalCdf] = useState(0);
  const [activeAgentsCount, setActiveAgentsCount] = useState(0);
  const [activeOperationsCount, setActiveOperationsCount] = useState(0);
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

        if (isMounted) {
          setTotalUsd(usdSum);
          setTotalCdf(cdfSum);
          setActiveOperationsCount(agencyOps.length);
          setActiveAgentsCount(agentsCount);
        }
      } catch (err) {
        console.warn('[Ets AMANI] Erreur chargement statistiques agence :', err);
      }
    }

    void loadStats();
    const interval = setInterval(loadStats, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.agencyId]);

  const handleSidebarNavigate = (item: string) => {
    if (item === 'profile') {
      navigate('/profil');
      return;
    }
    const map: Record<string, ModuleId | null> = {
      dashboard: null,
      operations: 'operations',
      transactions: 'operations',
      billetage: 'billetage',
      members: 'agents',
      reports: 'reports',
      transfers: 'transfers',
      debts: 'debts',
      accounting: 'transfers',
      salaries: 'salaries',
      chat: 'chat',
      audit: 'audit',
      regulations: 'registrations',
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
      billetage: 'billetage',
      operations: 'transactions',
      agents: 'members',
      registrations: 'regulations',
      connectivity: 'settings',
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
      <div className="space-y-6">
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
                { id: 'billetage', label: 'Billetage Caisse', icon: WalletCards },
                { id: 'salaries', label: 'Salaires & Paie', icon: Coins, badge: 'Paie' },
                {
                  id: 'operations',
                  label: 'Missions Agence',
                  icon: Activity,
                  badge: activeOperationsCount > 0 ? activeOperationsCount : undefined,
                },
                { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
                { id: 'debts', label: 'Suivi des Dettes', icon: Scale },
                { id: 'chat', label: 'Chat & Annonces', icon: MessageSquare },
                {
                  id: 'agents',
                  label: 'Gestion Agents',
                  icon: Users,
                  badge: activeAgentsCount > 0 ? activeAgentsCount : undefined,
                },
                { id: 'registrations', label: 'Inscriptions', icon: UserCheck },
                { id: 'reports', label: 'Rapports & Exports', icon: FileText },
                { id: 'audit', label: "Journal d'audit", icon: History },
                { id: 'connectivity', label: 'Disponibilité & Synchronisation', icon: Wifi },
              ]}
              activeTabId={activeModule}
              onTabChange={(id) => {
                setActiveModule(id as ModuleId);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              actions={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Déconnexion</span>
                  </button>
                </div>
              }
            />

            <div className="relative">
              {activeModule === 'billetage' && (
                <BilletageModule onClose={() => setActiveModule(null)} />
              )}
              {activeModule === 'operations' && (
                <OperationModule onClose={() => setActiveModule(null)} />
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
          <div className="space-y-6">
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

            <div className="space-y-8">
              {Array.from(new Set(AGENCY_MODULE_CARDS.map((m) => m.pole))).map((pole) => {
                const poleModules = AGENCY_MODULE_CARDS.filter(
                  (m) =>
                    m.pole === pole &&
                    (!search.trim() ||
                      m.title.toLowerCase().includes(search.toLowerCase()) ||
                      m.description.toLowerCase().includes(search.toLowerCase()))
                );
                if (poleModules.length === 0) return null;

                return (
                  <div key={pole} className="space-y-3.5">
                    <div className="border-b border-slate-200 pb-2">
                      <h2 className="text-sm font-bold tracking-tight text-slate-800">
                        {pole}
                      </h2>
                    </div>
                    <DashboardModuleGrid columns={3}>
                      {poleModules.map((item) => (
                        <DashboardModuleCard
                          key={item.id}
                          title={item.title}
                          description={item.description}
                          icon={item.icon}
                          variant={item.variant}
                          badge={item.badge}
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
