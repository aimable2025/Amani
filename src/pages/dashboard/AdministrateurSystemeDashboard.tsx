import {
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  Flame,
  MessageSquare,
  RefreshCw,
  Search,
  Share2,
  Shield,
  ShieldCheck,
  Sliders,
  Smartphone,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import DashboardModuleCard from '../../components/dashboard/DashboardModuleCard';
import DashboardModuleGrid from '../../components/dashboard/DashboardModuleGrid';
import WorkspaceNavigationHeader from '../../components/dashboard/WorkspaceNavigationHeader';
import DashboardToolbar, {
  type DashboardViewMode,
} from '../../components/dashboard/DashboardToolbar';
import ChatModule from './components/ChatModule';
import AuditModule from './components/AuditModule';
import OperationModule from './components/OperationModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import ReportsModule from './components/ReportsModule';
import ConnectivityModule from './components/ConnectivityModule';
import SystemConfigModule from './components/SystemConfigModule';
import SystemFirebaseModule from './components/SystemFirebaseModule';
import SystemSecurityModule from './components/SystemSecurityModule';
import RegistrationRequestsModule from './components/RegistrationRequestsModule';
import DirectorGeneralGovernanceModule from './components/DirectorGeneralGovernanceModule';
import AgenciesModule from './components/AgenciesModule';
import InternalNumbersModule from './components/InternalNumbersModule';
import CommandesClientsModule from './components/CommandesClientsModule';
import FinancialSupervisionModule from './components/FinancialSupervisionModule';
import UnifiedExecutiveOverview from '../../components/dashboard/UnifiedExecutiveOverview';
import { getAgencies, type Agency } from '../../services/AgencyService';
import { startFinancialNotificationWatcher } from '../../services/LocalNotificationService';
import {
  appointDirectorGeneral,
  createAdministrativeUser,
  getAllSystemUsers,
  updateManagedUserStatus,
  type ManagedUser,
} from '../../services/SystemUserService';
import type { AccountStatus, UserCategory, UserFunction, UserRole } from '../../types/auth';

type ActiveView =
  | 'overview'
  | 'financial_supervision'
  | 'operations'
  | 'commandes'
  | 'transfers'
  | 'reports'
  | 'chat'
  | 'internal_numbers'
  | 'dg_governance'
  | 'agencies'
  | 'users'
  | 'audit'
  | 'connectivity'
  | 'firebase'
  | 'config'
  | 'security'
  | 'registrations';

const SYSTEM_VIEWS_META: Record<
  ActiveView,
  { title: string; description: string; category: string }
> = {
  overview: {
    title: "Vue d'ensemble",
    description: 'Supervision technique, sécurité & gestion des comptes privilégiés',
    category: 'Console',
  },
  financial_supervision: {
    title: 'Crédits Virtuels & Supervision Financière',
    description: 'Dotations, suivi USD/CDF par agent, rapprochement SMS, inventaires et grand livre immuable',
    category: 'Supervision Financière',
  },
  operations: {
    title: 'Opérations de Caisse & Réseau',
    description: 'Gestion des dépôts, retraits, changes et virements',
    category: 'Opérations',
  },
  commandes: {
    title: 'Commandes & Réclamations Clients',
    description: 'Supervision des commandes, réclamations et demandes de restitution clients & abonnés',
    category: 'Opérations',
  },
  transfers: {
    title: 'Transferts Inter-Agences',
    description: 'Ordres de transferts, validations et traçabilité des fonds',
    category: 'Trésorerie',
  },
  reports: {
    title: 'Rapports & Synthèses d’Activité',
    description: 'Centralisation des rapports d’activité, soumissions et validations',
    category: 'Rapports',
  },
  chat: {
    title: 'Chat Interne & Notes Officielles',
    description: 'Messagerie instantanée interne et diffusion des notes de service',
    category: 'Communication',
  },
  internal_numbers: {
    title: 'Flotte Numéros & Supervision SMS',
    description: 'Supervision de la flotte téléphonique interne et flux SMS',
    category: 'Infrastructure',
  },
  dg_governance: {
    title: 'Gouvernance du Directeur Général',
    description: 'Supervision statutaire, nomination, suspension et remplacement du DG',
    category: 'Gouvernance',
  },
  agencies: {
    title: 'Réseau des Agences',
    description: "Gestion des succursales, guichets et administrateurs d'agence",
    category: 'Réseau',
  },
  users: {
    title: 'Gestion des Comptes & Rôles',
    description: "Attribution des privilèges, statuts d'activité et affectations aux agences",
    category: 'Personnel',
  },
  registrations: {
    title: "Demandes d'inscription",
    description: 'Examen des pièces justificatives et approbation des nouveaux comptes',
    category: 'Conformité',
  },
  audit: {
    title: "Journal d'audit système",
    description: "Traçabilité immuable de l'ensemble des événements techniques et administratifs",
    category: 'Audit & Sécurité',
  },
  connectivity: {
    title: 'Synchronisation & Stockage Local',
    description: 'État de la base locale et transmission vers le serveur central',
    category: 'Infrastructure',
  },
  firebase: {
    title: 'Serveur Central Sécurisé',
    description: "État de la liaison et synchronisation avec les données centrales de l'entreprise",
    category: 'Infrastructure',
  },
  config: {
    title: 'Configuration Système',
    description: 'Paramétrage global des modules opérationnels et fonctionnalités DG',
    category: 'Paramètres',
  },
  security: {
    title: 'Politique de Sécurité',
    description: "Règles d'authentification, durée des sessions et contrôle d'accès",
    category: 'Audit & Sécurité',
  },
};

const SYSTEM_MODULE_CARDS: Array<{
  id: ActiveView;
  pole: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: typeof MessageSquare;
  variant: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  badge?: string;
}> = [
  {
    id: 'users',
    pole: '01. Gouvernance, Personnel & Agences',
    title: 'Gestion des Comptes & Rôles',
    shortTitle: 'Utilisateurs',
    description: 'Consulter, activer, bloquer et modifier les attributions de privilèges.',
    icon: Users,
    variant: 'primary',
  },
  {
    id: 'registrations',
    pole: '01. Gouvernance, Personnel & Agences',
    title: "Demandes d'inscription",
    shortTitle: 'Inscriptions',
    description: 'Valider les nouveaux comptes clients et abonnés en attente.',
    icon: UserCheck,
    variant: 'warning',
  },
  {
    id: 'dg_governance',
    pole: '01. Gouvernance, Personnel & Agences',
    title: 'Gouvernance du Directeur Général',
    shortTitle: 'Gouvernance DG',
    description: 'Nomination, suspension, remplacement et historique du DG.',
    icon: Shield,
    variant: 'warning',
    badge: 'DG',
  },
  {
    id: 'agencies',
    pole: '01. Gouvernance, Personnel & Agences',
    title: 'Réseau des Agences',
    shortTitle: 'Agences',
    description: "Création, modification et supervision des succursales et responsables.",
    icon: Building2,
    variant: 'primary',
  },
  {
    id: 'financial_supervision',
    pole: '02. Supervision & Communication',
    title: 'Crédits Virtuels & Fonds Agents',
    shortTitle: 'Crédits & Fonds',
    description: 'Dotations, rapprochement SMS, inventaires, délégations DG et grand livre USD/CDF.',
    icon: Wallet,
    variant: 'primary',
    badge: 'USD/CDF',
  },
  {
    id: 'operations',
    pole: '02. Supervision & Communication',
    title: 'Opérations Réseau',
    shortTitle: 'Opérations',
    description: 'Supervision des dépôts, retraits, changes et missions.',
    icon: Share2,
    variant: 'primary',
  },
  {
    id: 'commandes',
    pole: '02. Supervision & Communication',
    title: 'Commandes & Réclamations Clients',
    shortTitle: 'Commandes',
    description: 'Supervision des demandes de transactions, réclamations et restitutions.',
    icon: ClipboardList,
    variant: 'primary',
  },
  {
    id: 'transfers',
    pole: '02. Supervision & Communication',
    title: 'Transferts Inter-Agences',
    shortTitle: 'Transferts',
    description: 'Suivi des ordres de transferts et validations entre agences.',
    icon: ArrowLeftRight,
    variant: 'primary',
  },
  {
    id: 'reports',
    pole: '02. Supervision & Communication',
    title: 'Rapports & Synthèses',
    shortTitle: 'Rapports',
    description: 'Centralisation des rapports et validations hiérarchiques.',
    icon: FileText,
    variant: 'success',
  },
  {
    id: 'chat',
    pole: '02. Supervision & Communication',
    title: 'Chat Interne & Notes Officielles',
    shortTitle: 'Chat & Notes',
    description: 'Messagerie multi-canaux et diffusion des notes de service.',
    icon: MessageSquare,
    variant: 'primary',
  },
  {
    id: 'audit',
    pole: '03. Sécurité, Audit & Infrastructure',
    title: "Journal d'audit système",
    shortTitle: 'Audit',
    description: "Traçabilité immuable des événements techniques et administratifs.",
    icon: ShieldCheck,
    variant: 'danger',
  },
  {
    id: 'security',
    pole: '03. Sécurité, Audit & Infrastructure',
    title: 'Politique de Sécurité',
    shortTitle: 'Sécurité',
    description: 'Sessions, double facteur et contrôle d’accès.',
    icon: Shield,
    variant: 'danger',
  },
  {
    id: 'connectivity',
    pole: '03. Sécurité, Audit & Infrastructure',
    title: 'Disponibilité & Stockage Local',
    shortTitle: 'Synchro',
    description: 'Stockage local autonome et file de synchronisation.',
    icon: Wifi,
    variant: 'success',
  },
  {
    id: 'firebase',
    pole: '03. Sécurité, Audit & Infrastructure',
    title: 'Liaison Serveur Central',
    shortTitle: 'Serveur',
    description: 'Supervision de la liaison centrale et des données distantes.',
    icon: Flame,
    variant: 'warning',
  },
  {
    id: 'internal_numbers',
    pole: '03. Sécurité, Audit & Infrastructure',
    title: 'Flotte Numéros & SMS',
    shortTitle: 'Flotte & SMS',
    description: 'Gestion des numéros internes et supervision SMS.',
    icon: Smartphone,
    variant: 'warning',
  },
  {
    id: 'config',
    pole: '03. Sécurité, Audit & Infrastructure',
    title: 'Configuration & Modules DG',
    shortTitle: 'Configuration',
    description: 'Activer ou masquer des modules pour la Direction Générale.',
    icon: Sliders,
    variant: 'default',
  },
];

export default function AdministrateurSystemeDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [systemUsers, setSystemUsers] = useState<ManagedUser[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState('');
  const [viewMode, setViewMode] = useState<DashboardViewMode>('grid');

  // Modal DG
  const [showDgModal, setShowDgModal] = useState(false);
  const [dgName, setDgName] = useState('');
  const [dgEmail, setDgEmail] = useState('');
  const [dgPhone, setDgPhone] = useState('');
  const [dgPassword, setDgPassword] = useState('');
  const [showDgPassword, setShowDgPassword] = useState(false);
  const [isAppointingDg, setIsAppointingDg] = useState(false);

  // Modal Add User
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('administrateur_agence');
  const [newUserCategory, setNewUserCategory] = useState<UserCategory>('administrateur_agence');
  const [newUserFunction, setNewUserFunction] = useState<UserFunction>('guichetier');
  const [newUserRoleOption, setNewUserRoleOption] = useState<string>('administrateur_agence');
  const [newUserAgencyId, setNewUserAgencyId] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDgModal(false);
        setShowAddUserModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const [list, agencyList] = await Promise.all([
        getAllSystemUsers(),
        getAgencies(),
      ]);
      setSystemUsers(list);
      setAgencies(agencyList);
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
    const stopFinanceWatcher = startFinancialNotificationWatcher(user);
    return () => {
      stopFinanceWatcher();
    };
  }, [user?.uid]);

  const currentDg = useMemo(() => {
    return systemUsers.find(
      (u) => u.role === 'directeur_general' && u.status === 'active'
    );
  }, [systemUsers]);

  const filteredUsers = useMemo(() => {
    return systemUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [systemUsers, roleFilter, userSearch]);

  const handleStatusChange = async (targetUid: string, nextStatus: AccountStatus) => {
    if (!user) return;
    try {
      await updateManagedUserStatus(
        targetUid,
        nextStatus,
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      setFeedback(`Statut mis à jour vers « ${nextStatus} ».`);
      setTimeout(() => setFeedback(null), 3000);
      await fetchUsers();
    } catch {
      setFeedback('Erreur lors de la mise à jour du statut.');
    }
  };

  const handleAppointDg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !dgName.trim() || !dgEmail.trim()) return;
    setIsAppointingDg(true);
    try {
      await appointDirectorGeneral(
        {
          displayName: dgName.trim(),
          email: dgEmail.trim(),
          phone: dgPhone.trim() || undefined,
          password: dgPassword,
        },
        { uid: user.uid, name: user.displayName, role: user.role },
        currentDg?.uid
      );
      setShowDgModal(false);
      setDgName('');
      setDgEmail('');
      setDgPhone('');
      setDgPassword('');
      setFeedback('Le Directeur Général a été nommé avec succès.');
      setTimeout(() => setFeedback(null), 3500);
      await fetchUsers();
    } catch {
      setFeedback('Impossible de nommer le Directeur Général.');
    } finally {
      setIsAppointingDg(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newUserName.trim() || !newUserEmail.trim()) return;
    setIsCreatingUser(true);
    try {
      await createAdministrativeUser(
        {
          displayName: newUserName.trim(),
          email: newUserEmail.trim(),
          phone: newUserPhone.trim() || undefined,
          role: newUserRole,
          category: newUserCategory,
          function: newUserRole === 'agent' ? newUserFunction : undefined,
          agencyId:
            newUserRole === 'directeur_general'
              ? null
              : newUserAgencyId.trim() || null,
          password: newUserPassword,
        },
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      setShowAddUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserPassword('');
      setFeedback('Nouvel utilisateur créé avec succès.');
      setTimeout(() => setFeedback(null), 3500);
      await fetchUsers();
    } catch {
      setFeedback("Erreur lors de la création de l'utilisateur.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleSidebarNavigate = (item: string) => {
    if (item === 'profile') {
      navigate('/profil');
      return;
    }
    const map: Record<string, ActiveView> = {
      dashboard: 'overview',
      overview: 'overview',
      funds: 'financial_supervision',
      'financial-supervision': 'financial_supervision',
      financial_supervision: 'financial_supervision',
      operations: 'operations',
      transactions: 'operations',
      commandes: 'commandes',
      orders: 'commandes',
      'client-orders': 'commandes',
      transfers: 'transfers',
      treasury: 'transfers',
      billetage: 'operations',
      reports: 'reports',
      chat: 'chat',
      internal_directory: 'internal_numbers',
      agencies: 'agencies',
      members: 'users',
      users: 'users',
      registrations: 'registrations',
      audit: 'audit',
      alerts: 'audit',
      incidents: 'audit',
      regulations: 'security',
      settings: 'config',
      connectivity: 'connectivity',
      firebase: 'firebase',
      security: 'security',
      dg_governance: 'dg_governance',
    };
    if (item in map) {
      setActiveView(map[item]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <AppLayout
      title="Administration Système — Ets AMANI"
      subtitle="Supervision technique, sécurité & gestion des comptes privilégiés"
      activeItem={
        activeView === 'overview'
          ? 'dashboard'
          : activeView === 'financial_supervision'
            ? 'funds'
            : activeView
      }
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => {
        setActiveView('chat');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <div className="space-y-4">
        {activeView === 'overview' ? (
          <div className="space-y-4">
            <UnifiedExecutiveOverview
              kicker="ADMINISTRATEUR SYSTÈME"
              title={`Bonjour, ${user?.displayName?.split(' ')[0] || 'Administrateur'}`}
              subtitle="Supervision technique, comptes privilégiés et infrastructure du réseau."
              onNewTransfer={() => {
                setActiveView('transfers');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNewOperation={() => {
                setActiveView('operations');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewAgencies={() => {
                setActiveView('agencies');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewTransfers={() => {
                setActiveView('transfers');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewReports={() => {
                setActiveView('reports');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewOperations={() => {
                setActiveView('operations');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            {feedback && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p>{feedback}</p>
              </div>
            )}

            <DashboardToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              searchValue={moduleSearch}
              onSearchChange={setModuleSearch}
              searchPlaceholder="Rechercher un module système..."
            >
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-2.5 py-1.5 text-[11px] font-bold text-white dark:text-[#0B192C] hover:opacity-95 transition whitespace-nowrap"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Nouveau compte</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDgModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition whitespace-nowrap"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>{currentDg ? 'Remplacer DG' : 'Nommer DG'}</span>
                </button>
              </div>
            </DashboardToolbar>

            <div className="space-y-4">
              {Array.from(new Set(SYSTEM_MODULE_CARDS.map((m) => m.pole))).map((pole) => {
                const poleModules = SYSTEM_MODULE_CARDS.filter(
                  (m) =>
                    m.pole === pole &&
                    (!moduleSearch.trim() ||
                      m.title.toLowerCase().includes(moduleSearch.toLowerCase()) ||
                      m.shortTitle.toLowerCase().includes(moduleSearch.toLowerCase()) ||
                      m.description.toLowerCase().includes(moduleSearch.toLowerCase()))
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
                            item.id === 'users'
                              ? `${systemUsers.length}`
                              : item.id === 'agencies'
                                ? `${agencies.length}`
                                : item.badge
                          }
                          layout={viewMode === 'list' ? 'list' : 'tile'}
                          onClick={() => {
                            setActiveView(item.id);
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
        ) : (
          <div className="space-y-4">
            <WorkspaceNavigationHeader
              workspaceTitle="Console Système"
              activeModuleTitle={SYSTEM_VIEWS_META[activeView]?.title || activeView}
              activeModuleDescription={SYSTEM_VIEWS_META[activeView]?.description}
              category={SYSTEM_VIEWS_META[activeView]?.category}
              backLabel="Vue d'ensemble"
              onBack={() => setActiveView('overview')}
              tabs={[
                { id: 'financial_supervision', label: 'Crédits & Fonds', icon: Wallet },
                { id: 'users', label: 'Utilisateurs', icon: Users, badge: systemUsers.length },
                { id: 'registrations', label: 'Inscriptions', icon: UserCheck },
                { id: 'dg_governance', label: 'Gouvernance DG', icon: Shield },
                { id: 'agencies', label: 'Agences', icon: Building2, badge: agencies.length },
                { id: 'operations', label: 'Opérations', icon: Share2 },
                { id: 'commandes', label: 'Commandes', icon: ClipboardList },
                { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
                { id: 'reports', label: 'Rapports', icon: FileText },
                { id: 'chat', label: 'Chat & Notes', icon: MessageSquare },
                { id: 'internal_numbers', label: 'Flotte & SMS', icon: Smartphone },
                { id: 'audit', label: 'Audit', icon: ShieldCheck },
                { id: 'connectivity', label: 'Stockage', icon: Wifi },
                { id: 'firebase', label: 'Serveur', icon: Flame },
                { id: 'config', label: 'Config', icon: Sliders },
                { id: 'security', label: 'Sécurité', icon: Shield },
              ]}
              activeTabId={activeView}
              onTabChange={(tabId) => {
                setActiveView(tabId as ActiveView);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            {/* VUE USERS */}
            {activeView === 'users' && (
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Utilisateurs & Droits d&apos;Accès
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {systemUsers.length} comptes enregistrés dans le système
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void fetchUsers()}
                      disabled={loadingUsers}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                      Actualiser
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDgModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                    >
                      <Shield className="h-3.5 w-3.5" />
                      {currentDg ? 'Remplacer DG' : 'Nommer DG'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3.5 py-1.5 text-xs font-bold text-white dark:text-[#0B192C] hover:opacity-95"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Nouveau compte
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Rechercher par nom, email, téléphone, rôle..."
                      className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-9 pr-3 text-xs text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800"
                    />
                  </div>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                  >
                    <option value="all">Tous les rôles</option>
                    <option value="administrateur_systeme">Administrateur Système</option>
                    <option value="directeur_general">Directeur Général</option>
                    <option value="administrateur_agence">Admin Agence</option>
                    <option value="agent">Agent</option>
                    <option value="client">Client</option>
                    <option value="abonne">Abonné</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-bold uppercase text-slate-500 dark:text-slate-400 text-[10px]">
                      <tr>
                        <th className="p-2.5">Utilisateur</th>
                        <th className="p-2.5">Rôle & Agence</th>
                        <th className="p-2.5">Statut</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u) => (
                        <tr key={u.uid} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="p-2.5">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar
                                name={u.displayName}
                                photoURL={u.photoURL}
                                email={u.email}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 dark:text-white truncate">
                                  {u.displayName}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {u.email || u.phone || '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5">
                            <span className="inline-block rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                              {u.role}
                            </span>
                            {u.function && (
                              <span className="ml-1 inline-block rounded bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                                {u.function.replace(/_/g, ' ')}
                              </span>
                            )}
                            {u.agencyId && (
                              <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400">
                                ({u.agencyId})
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                u.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                  : u.status === 'disabled'
                                    ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            {u.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(u.uid, 'disabled')}
                                className="rounded-lg border border-red-200 dark:border-red-800 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                              >
                                Désactiver
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(u.uid, 'active')}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                              >
                                Activer
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeView === 'financial_supervision' && (
              <FinancialSupervisionModule
                mode="system_admin"
                onClose={() => setActiveView('overview')}
              />
            )}
            {activeView === 'operations' && (
              <OperationModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'commandes' && (
              <CommandesClientsModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'transfers' && (
              <TreasuryTransfersDebtsModule mode="transfers" onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'reports' && (
              <ReportsModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'chat' && (
              <ChatModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'internal_numbers' && (
              <InternalNumbersModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'dg_governance' && (
              <DirectorGeneralGovernanceModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'agencies' && (
              <AgenciesModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'registrations' && (
              <RegistrationRequestsModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'audit' && (
              <AuditModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'connectivity' && (
              <ConnectivityModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'firebase' && (
              <SystemFirebaseModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'config' && (
              <SystemConfigModule onClose={() => setActiveView('overview')} />
            )}
            {activeView === 'security' && (
              <SystemSecurityModule onClose={() => setActiveView('overview')} />
            )}
          </div>
        )}

        {/* Modal DG */}
        {showDgModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowDgModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          >
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold">
                    Nomination du Directeur Général
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Le DG dispose des prérogatives de gestion globale du réseau Ets AMANI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDgModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Fermer (Échap)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAppointDg} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nom & Prénom du DG *
                  </label>
                  <input
                    type="text"
                    required
                    value={dgName}
                    onChange={(e) => setDgName(e.target.value)}
                    placeholder="Ex: Jean-Paul AMANI"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Adresse Email professionnelle *
                  </label>
                  <input
                    type="email"
                    required
                    value={dgEmail}
                    onChange={(e) => setDgEmail(e.target.value)}
                    placeholder="dg@ets-amani.com"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Numéro de Téléphone
                  </label>
                  <input
                    type="tel"
                    value={dgPhone}
                    onChange={(e) => setDgPhone(e.target.value)}
                    placeholder="+243 970 000 001"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mot de passe initial *
                  </label>
                  <div className="relative">
                    <input
                      type={showDgPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={dgPassword}
                      onChange={(e) => setDgPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 py-2.5 pl-2.5 pr-10 font-mono text-slate-900 dark:text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDgPassword((prev) => !prev)}
                      aria-label={showDgPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                    >
                      {showDgPassword ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowDgModal(false)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isAppointingDg}
                    className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isAppointingDg ? 'Nomination en cours...' : 'Confirmer la nomination'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Créer Utilisateur */}
        {showAddUserModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAddUserModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          >
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold">Créer un Utilisateur</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Attribution des rôles métier Ets AMANI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Fermer (Échap)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Ex: David Kasongo"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="utilisateur@ets-amani.com"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="+243 970 000 000"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rôle *
                  </label>
                  <select
                    value={newUserRoleOption}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewUserRoleOption(val);
                      if (val === 'directeur_general') {
                        setNewUserRole('directeur_general');
                        setNewUserCategory('direction');
                      } else if (val === 'administrateur_agence') {
                        setNewUserRole('administrateur_agence');
                        setNewUserCategory('administrateur_agence');
                      } else if (val.startsWith('agent:')) {
                        const fn = val.replace('agent:', '') as UserFunction;
                        setNewUserRole('agent');
                        setNewUserCategory('agent');
                        setNewUserFunction(fn);
                      } else if (val === 'agent') {
                        setNewUserRole('agent');
                        setNewUserCategory('agent');
                        setNewUserFunction('guichetier');
                      } else if (val === 'abonne') {
                        setNewUserRole('abonne');
                        setNewUserCategory('abonne');
                      } else if (val === 'client') {
                        setNewUserRole('client');
                        setNewUserCategory('client');
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none font-bold"
                  >
                    <optgroup label="Direction & Gouvernance">
                      <option value="directeur_general">Directeur Général (DG)</option>
                      <option value="administrateur_agence">Administrateur d&apos;Agence</option>
                    </optgroup>
                    <optgroup label="Agents Opérationnels & Services">
                      <option value="agent:guichetier">Agent — Guichetier / Caissier</option>
                      <option value="agent:comptable">Agent — Comptable</option>
                      <option value="agent:agent_change">Agent — Agent de Change (USD / CDF)</option>
                      <option value="agent:agent_virtuel">Agent — Agent Virtuel</option>
                      <option value="agent:agent_vodae">Agent — Agent Vodacom / M-Pesa</option>
                      <option value="agent:agent_operateur_mobile">Agent — Agent Opérateur Mobile</option>
                      <option value="agent:agent_terrain">Agent — Agent de Terrain</option>
                      <option value="agent:chauffeur">Agent — Chauffeur</option>
                      <option value="agent:cleaner">Agent — Agent d&apos;Entretien (Cleaner)</option>
                    </optgroup>
                    <optgroup label="Membres Externes">
                      <option value="abonne">Abonné Privilégié</option>
                      <option value="client">Client Certifié</option>
                    </optgroup>
                  </select>
                </div>
                {newUserRole !== 'directeur_general' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Agence de rattachement
                    </label>
                    {agencies.length > 0 ? (
                      <select
                        value={newUserAgencyId}
                        onChange={(e) => setNewUserAgencyId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none"
                      >
                        <option value="">Aucune agence (Global)</option>
                        {agencies.map((ag) => (
                          <option key={ag.id} value={ag.id}>
                            {ag.name} ({ag.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={newUserAgencyId}
                        onChange={(e) => setNewUserAgencyId(e.target.value)}
                        placeholder="Identifiant agence (facultatif)"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-900 dark:text-white outline-none"
                      />
                    )}
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mot de passe initial *
                  </label>
                  <div className="relative">
                    <input
                      type={showNewUserPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 py-2.5 pl-2.5 pr-10 font-mono text-slate-900 dark:text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewUserPassword((prev) => !prev)}
                      aria-label={showNewUserPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                    >
                      {showNewUserPassword ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-4 py-2 font-bold text-white dark:text-[#0B192C] hover:opacity-95 disabled:opacity-50"
                  >
                    {isCreatingUser ? 'Création...' : "Créer l'utilisateur"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
