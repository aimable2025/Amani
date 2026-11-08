import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileText,
  Flame,
  KeyRound,
  LogOut,
  MessageSquare,
  RefreshCw,
  Search,
  Server,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  UserCheck,
  UserPlus,
  Users,
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
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
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
import UnifiedExecutiveOverview from '../../components/dashboard/UnifiedExecutiveOverview';
import { getAgencies, type Agency } from '../../services/AgencyService';
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
  | 'operations'
  | 'transfers'
  | 'reports'
  | 'chat'
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
    description: "Supervision technique, sécurité & gestion des comptes privilégiés",
    category: "Console",
  },
  operations: {
    title: 'Opérations de Caisse & Réseau',
    description: 'Gestion des dépôts, retraits, changes et virements',
    category: 'Opérations',
  },
  transfers: {
    title: 'Transferts Inter-Agences',
    description: 'Ordres de transferts, validations et traçabilité des fonds',
    category: 'Trésorerie',
  },
  reports: {
    title: 'Rapports & Synthèses d’Activité',
    description: 'Centralisation des rapports d’activité, soumissions et validations hiérarchiques',
    category: 'Rapports',
  },
  chat: {
    title: "Chat Interne & Notes Officielles",
    description: "Messagerie instantanée interne et diffusion des notes de service",
    category: "Communication",
  },
  dg_governance: {
    title: "Gouvernance du Directeur Général",
    description: "Supervision statutaire, nomination, suspension, remplacement et historique du DG",
    category: "Gouvernance",
  },
  agencies: {
    title: "Réseau des Agences",
    description: "Gestion des succursales, guichets et administrateurs d'agence",
    category: "Réseau",
  },
  users: {
    title: "Gestion des Comptes & Rôles",
    description: "Attribution des privilèges, statuts d'activité et affectations aux agences",
    category: "Personnel",
  },
  registrations: {
    title: "Demandes d'inscription",
    description: "Examen des pièces justificatives et approbation des nouveaux comptes",
    category: "Conformité",
  },
  audit: {
    title: "Journal d'audit système",
    description: "Traçabilité immuable de l'ensemble des événements techniques et administratifs",
    category: "Audit & Sécurité",
  },
  connectivity: {
    title: "Synchronisation & Stockage Local",
    description: "État de la base de données locale et transmission vers le serveur central",
    category: "Infrastructure",
  },
  firebase: {
    title: "Serveur Central Sécurisé",
    description: "État de la liaison et synchronisation avec les données centrales de l'entreprise",
    category: "Infrastructure",
  },
  config: {
    title: "Configuration Système",
    description: "Paramétrage global des modules opérationnels et des fonctionnalités DG",
    category: "Paramètres",
  },
  security: {
    title: "Politique de Sécurité",
    description: "Règles d'authentification, durée des sessions et contrôle d'accès",
    category: "Audit & Sécurité",
  },
};

const SYSTEM_MODULE_CARDS: Array<{
  id: ActiveView;
  pole: string;
  title: string;
  description: string;
  icon: typeof MessageSquare;
  variant: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  badge?: string;
}> = [
  {
    id: 'chat',
    pole: '01. Gouvernance & Communication',
    title: 'Chat Interne & Notes Officielles',
    description: 'Communiquer avec la Direction Générale, les agences, les services et diffuser des notes.',
    icon: MessageSquare,
    variant: 'primary',
  },
  {
    id: 'dg_governance',
    pole: '01. Gouvernance & Communication',
    title: 'Gouvernance du Directeur Général',
    description: 'Supervision statutaire, nomination, suspension, remplacement et historique du DG.',
    icon: Shield,
    variant: 'warning',
    badge: 'Statuts DG',
  },
  {
    id: 'agencies',
    pole: '01. Gouvernance & Communication',
    title: 'Réseau des Agences',
    description: 'Création, modification et supervision des succursales et responsables d agence.',
    icon: Building2,
    variant: 'primary',
  },
  {
    id: 'users',
    pole: '02. Personnel & Habilitations',
    title: 'Gestion des Comptes & Rôles',
    description: 'Consulter, activer, bloquer et modifier les attributions de privilèges.',
    icon: Users,
    variant: 'primary',
  },
  {
    id: 'registrations',
    pole: '02. Personnel & Habilitations',
    title: "Demandes d'inscription",
    description: 'Valider les nouveaux comptes clients et abonnés en attente de vérification.',
    icon: UserCheck,
    variant: 'warning',
    badge: 'Conformité',
  },
  {
    id: 'audit',
    pole: '03. Audit & Sécurité Immuable',
    title: "Journal d'audit système",
    description: 'Traçabilité continue de l ensemble des événements techniques et administratifs.',
    icon: ShieldCheck,
    variant: 'danger',
    badge: 'Immuable',
  },
  {
    id: 'security',
    pole: '03. Audit & Sécurité Immuable',
    title: 'Politique de Sécurité',
    description: 'Expiration des sessions, double facteur obligatoire et forçage de reconnexion.',
    icon: Shield,
    variant: 'danger',
  },
  {
    id: 'connectivity',
    pole: '04. Infrastructure & Données Centrales',
    title: 'Disponibilité & Stockage Local',
    description: 'Supervision du stockage autonome et de la file de transmission vers le serveur central.',
    icon: Wifi,
    variant: 'success',
    badge: 'Hors-Ligne',
  },
  {
    id: 'firebase',
    pole: '04. Infrastructure & Données Centrales',
    title: 'Liaison Serveur Central',
    description: 'Supervision de la liaison centrale, des droits d’accès et des données distantes.',
    icon: Flame,
    variant: 'warning',
  },
  {
    id: 'config',
    pole: '04. Moteur de Données & Cloud',
    title: 'Configuration & Modules DG',
    description: 'Activer ou masquer des modules de gestion pour le Directeur Général.',
    icon: Sliders,
    variant: 'default',
  },
];

export default function AdministrateurSystemeDashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
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
    fetchUsers();
  }, []);

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
      operations: 'operations',
      transactions: 'operations',
      transfers: 'transfers',
      treasury: 'transfers',
      billetage: 'operations',
      reports: 'reports',
      chat: 'chat',
      agencies: 'agencies',
      members: 'users',
      users: 'users',
      registrations: 'registrations',
      audit: 'audit',
      alerts: 'audit',
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
      title="Console Administrateur Système"
      subtitle="Supervision technique, sécurité & gestion des comptes privilégiés"
      activeItem={activeView === 'overview' ? 'dashboard' : activeView}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => {
        setActiveView('chat');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <div className="space-y-6">
        {/* MODE 1 : VUE D'ENSEMBLE (TABLEAU DE BORD CENTRAL) */}
        {activeView === 'overview' ? (
          <div className="space-y-6">
            {/* Vue d'ensemble unifiée conforme aux captures d'écran de référence */}
            <UnifiedExecutiveOverview
              kicker="ADMINISTRATEUR SYSTÈME"
              title={`Bonjour, ${user?.displayName?.split(' ')[0] || 'Aimable'}`}
              subtitle="Vue consolidée de l'ensemble des agences du réseau."
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
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p>{feedback}</p>
              </div>
            )}

            {/* Barre d'outils et recherche des modules */}
            <DashboardToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              searchValue={moduleSearch}
              onSearchChange={setModuleSearch}
              searchPlaceholder="Rechercher un module système..."
            />

            {/* Pôles fonctionnels des modules */}
            <div className="space-y-8">
              {Array.from(new Set(SYSTEM_MODULE_CARDS.map((m) => m.pole))).map((pole) => {
                const poleModules = SYSTEM_MODULE_CARDS.filter(
                  (m) =>
                    m.pole === pole &&
                    (!moduleSearch.trim() ||
                      m.title.toLowerCase().includes(moduleSearch.toLowerCase()) ||
                      m.description.toLowerCase().includes(moduleSearch.toLowerCase()))
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
          /* MODE 2 : ESPACE DE TRAVAIL IMMÉDIAT DU MODULE SÉLECTIONNÉ */
          <div className="space-y-4">
            <WorkspaceNavigationHeader
              workspaceTitle="Console Système"
              activeModuleTitle={SYSTEM_VIEWS_META[activeView]?.title || activeView}
              activeModuleDescription={SYSTEM_VIEWS_META[activeView]?.description}
              category={SYSTEM_VIEWS_META[activeView]?.category}
              backLabel="Vue d'ensemble"
              onBack={() => setActiveView('overview')}
              tabs={[
                { id: 'operations', label: 'Opérations', icon: Share2 },
                { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
                { id: 'reports', label: 'Rapports', icon: FileText },
                { id: 'chat', label: 'Chat & Notes', icon: MessageSquare },
                { id: 'dg_governance', label: 'Gouvernance DG', icon: Shield },
                { id: 'agencies', label: 'Agences', icon: Building2, badge: agencies.length },
                { id: 'users', label: 'Comptes & Rôles', icon: Users, badge: systemUsers.length },
                { id: 'registrations', label: 'Inscriptions', icon: UserCheck },
                { id: 'audit', label: "Journal d'audit", icon: ShieldCheck },
                { id: 'connectivity', label: 'Stockage Local', icon: Wifi },
                { id: 'firebase', label: 'Serveur Central', icon: Flame },
                { id: 'config', label: 'Configuration', icon: Sliders },
                { id: 'security', label: 'Sécurité', icon: Shield },
              ]}
              activeTabId={activeView}
              onTabChange={(tabId) => {
                setActiveView(tabId as ActiveView);
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

        {/* VUE USERS */}
        {activeView === 'users' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Utilisateurs & Droits d'Accès
                </h2>
                <p className="text-xs text-slate-500">
                  {systemUsers.length} comptes enregistrés dans le système.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchUsers}
                  disabled={loadingUsers}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                  Actualiser
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Nouveau Compte
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Rechercher par nom, email, rôle..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-xs text-slate-900 outline-none focus:bg-white"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
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
                <thead className="border-b border-slate-100 bg-slate-50 font-bold uppercase text-slate-600">
                  <tr>
                    <th className="p-3">Utilisateur</th>
                    <th className="p-3">Rôle & Agence</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar
                            name={u.displayName}
                            photoURL={u.photoURL}
                            email={u.email}
                            size="sm"
                          />
                          <div>
                            <p className="font-bold text-slate-900">{u.displayName}</p>
                            <p className="text-[11px] text-slate-400">{u.email || u.phone || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-bold uppercase text-slate-700">
                          {u.role}
                        </span>
                        {u.function && (
                          <span className="ml-1 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                            {u.function.replace(/_/g, ' ')}
                          </span>
                        )}
                        {u.agencyId && (
                          <span className="ml-1 text-[11px] text-slate-500">({u.agencyId})</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-bold ${
                            u.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : u.status === 'disabled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1">
                        {u.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(u.uid, 'disabled')}
                            className="rounded-lg border border-red-200 px-2 py-1 font-semibold text-red-600 hover:bg-red-50"
                          >
                            Désactiver
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(u.uid, 'active')}
                            className="rounded-lg bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700"
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

        {/* AUTRES VUES */}
        {activeView === 'operations' && (
          <OperationModule onClose={() => setActiveView('overview')} />
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Nomination du Directeur Général
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Le DG dispose des prérogatives de gestion globale du réseau Ets AMANI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDgModal(false)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  title="Fermer (Échap)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAppointDg} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nom & Prénom du DG *
                  </label>
                  <input
                    type="text"
                    required
                    value={dgName}
                    onChange={(e) => setDgName(e.target.value)}
                    placeholder="Ex: Jean-Paul AMANI"
                    className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Adresse Email professionnelle *
                  </label>
                  <input
                    type="email"
                    required
                    value={dgEmail}
                    onChange={(e) => setDgEmail(e.target.value)}
                    placeholder="dg@ets-amani.com"
                    className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Numéro de Téléphone
                  </label>
                  <input
                    type="tel"
                    value={dgPhone}
                    onChange={(e) => setDgPhone(e.target.value)}
                    placeholder="+243 970 000 001"
                    className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
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
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-2.5 pr-10 font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDgPassword((prev) => !prev)}
                      aria-label={showDgPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      {showDgPassword ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowDgModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isAppointingDg}
                    className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Créer un Utilisateur
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Attribution de tous les rôles métier Ets AMANI (à l'exception de l'Administrateur Système).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  title="Fermer (Échap)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Ex: David Kasongo"
                    className="w-full rounded-xl border border-slate-200 p-2.5 outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="utilisateur@ets-amani.com"
                      className="w-full rounded-xl border border-slate-200 p-2.5 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="+243 970 000 000"
                      className="w-full rounded-xl border border-slate-200 p-2.5 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
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
                    className="w-full rounded-xl border border-slate-200 p-2.5 outline-none font-bold"
                  >
                    <optgroup label="Direction & Gouvernance">
                      <option value="directeur_general">Directeur Général (DG)</option>
                      <option value="administrateur_agence">Administrateur d'Agence</option>
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
                      <option value="agent:cleaner">Agent — Agent d'Entretien (Cleaner)</option>
                    </optgroup>
                    <optgroup label="Membres Externes">
                      <option value="abonne">Abonné Privilégié</option>
                      <option value="client">Client Certifié</option>
                    </optgroup>
                  </select>
                </div>
                {newUserRole !== 'directeur_general' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Agence de rattachement
                    </label>
                    {agencies.length > 0 ? (
                      <select
                        value={newUserAgencyId}
                        onChange={(e) => setNewUserAgencyId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 p-2.5 outline-none"
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
                        className="w-full rounded-xl border border-slate-200 p-2.5 outline-none"
                      />
                    )}
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
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
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-2.5 pr-10 font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewUserPassword((prev) => !prev)}
                      aria-label={showNewUserPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      {showNewUserPassword ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white hover:bg-slate-800 disabled:opacity-50"
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
