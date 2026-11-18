import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db as firestoreDb } from '../../../lib/firebase';
import { db } from '../../../lib/db';
import type { LocalReport, Billetage } from '../../../lib/db';
import type { Operation } from '../../../types/operation';
import {
  createAdministrativeUser,
  getAllSystemUsers,
  updateManagedUserProfile,
  updateManagedUserStatus,
  type ManagedUser,
} from '../../../services/SystemUserService';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import { getCombinedAuditLogs, type AuditLogEntry } from '../../../services/AuditService';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import type { AppUser, UserFunction } from '../../../types/auth';

interface Props {
  users?: AppUser[];
  currentAgencyId?: string | null;
  canManageAllAgencies?: boolean;
  initialTab?: 'agents' | 'agency_admins';
  onClose?: () => void;
}

export const AVAILABLE_SERVICES: { value: UserFunction; label: string }[] = [
  { value: 'comptabilite', label: 'Comptabilité (Direction/Service)' },
  { value: 'caisse', label: 'Caisse Principale' },
  { value: 'guichetier', label: 'Guichetier (Caisse Guichet)' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'agent_change', label: 'Agent de Change (Devises)' },
  { value: 'agent_operateur_mobile', label: 'Opérateur Mobile Money' },
  { value: 'agent_vodae', label: 'Agent Voda-E' },
  { value: 'agent_virtuel', label: 'Agent Virtuel' },
  { value: 'chauffeur', label: 'Chauffeur / Logistique' },
  { value: 'cleaner', label: 'Hygiène & Entretien' },
  { value: 'agent_terrain', label: 'Agent de Terrain' },
];

export default function AgentManagementModule({
  users,
  currentAgencyId,
  canManageAllAgencies = false,
  initialTab = 'agency_admins',
  onClose,
}: Props) {
  const { user: currentLoggedUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'agency_admins' | 'agents'>(initialTab);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAgency, setFilterAgency] = useState<string>('all');
  const [filterService, setFilterService] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Agent Service Config modal
  const [editingAgent, setEditingAgent] = useState<AppUser | null>(null);

  // Agent Detail Supervision modal
  const [supervisingAgent, setSupervisingAgent] = useState<ManagedUser | null>(null);
  const [agentOperations, setAgentOperations] = useState<Operation[]>([]);
  const [agentReports, setAgentReports] = useState<LocalReport[]>([]);
  const [agentBilletages, setAgentBilletages] = useState<Billetage[]>([]);
  const [agentAuditLogs, setAgentAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAgentData, setLoadingAgentData] = useState(false);

  // Agency Admin Create Modal
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminAgencyId, setNewAdminAgencyId] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);

  // Agency Admin Edit Modal
  const [editingAdmin, setEditingAdmin] = useState<ManagedUser | null>(null);
  const [editAdminName, setEditAdminName] = useState('');
  const [editAdminPhone, setEditAdminPhone] = useState('');
  const [editAdminAgencyId, setEditAdminAgencyId] = useState('');

  // Agency Admin Supervision Modal
  const [supervisingAdmin, setSupervisingAdmin] = useState<ManagedUser | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAdminAudit, setLoadingAdminAudit] = useState(false);

  const actor = useMemo(() => {
    return currentLoggedUser
      ? { uid: currentLoggedUser.uid, name: currentLoggedUser.displayName, role: currentLoggedUser.role }
      : { uid: 'system', name: 'Directeur Général', role: 'directeur_general' };
  }, [currentLoggedUser]);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [allUsers, allAgencies] = await Promise.all([
        getAllSystemUsers(),
        getAgencies().catch(() => []),
      ]);
      setManagedUsers(allUsers);
      setAgencies(allAgencies);
    } catch (err) {
      console.error('[Ets AMANI] Erreur chargement personnel :', err);
      setErrorMessage('Impossible de charger les données du personnel.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Agency Admins list
  const agencyAdmins = useMemo(() => {
    return managedUsers.filter((u) => {
      if (u.role !== 'administrateur_agence') return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const agencyName = agencies.find((a) => a.id === u.agencyId)?.name || '';
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        agencyName.toLowerCase().includes(q)
      );
    });
  }, [managedUsers, search, agencies]);

  // Agents list
  const agents = useMemo(() => {
    return managedUsers.filter((u) => {
      if (u.role !== 'agent') return false;
      if (!canManageAllAgencies && currentAgencyId && u.agencyId && u.agencyId !== currentAgencyId) {
        return false;
      }
      if (filterAgency !== 'all' && u.agencyId !== filterAgency) {
        return false;
      }
      if (filterStatus !== 'all' && u.status !== filterStatus) {
        return false;
      }
      if (filterService !== 'all') {
        const hasService =
          u.function === filterService ||
          ((u as unknown as AppUser).serviceAssignments || []).some(
            (s) => s.service === filterService && s.active
          );
        if (!hasService) return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const agencyName = agencies.find((a) => a.id === u.agencyId)?.name || '';
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        agencyName.toLowerCase().includes(q) ||
        (u.function || '').toLowerCase().includes(q)
      );
    });
  }, [managedUsers, search, filterAgency, filterService, filterStatus, canManageAllAgencies, currentAgencyId, agencies]);

  // Toggle multi-service polyvalence
  const handleToggleMultiService = async (targetUser: ManagedUser) => {
    const nextVal = !(targetUser as unknown as AppUser).multiServiceEnabled;
    try {
      const userRef = doc(firestoreDb, 'users', targetUser.uid);
      await updateDoc(userRef, { multiServiceEnabled: nextVal });
    } catch (err) {
      console.warn('Mise à jour polyvalence en mode local:', err);
    }
    setManagedUsers((prev) =>
      prev.map((u) =>
        u.uid === targetUser.uid ? ({ ...u, multiServiceEnabled: nextVal } as ManagedUser) : u
      )
    );
    if (editingAgent?.uid === targetUser.uid) {
      setEditingAgent({ ...editingAgent, multiServiceEnabled: nextVal });
    }
  };

  // Toggle specific service assignment
  const handleToggleService = async (targetUser: AppUser, serviceVal: UserFunction) => {
    const existing = targetUser.serviceAssignments || [];
    const hasService = existing.some((s) => s.service === serviceVal && s.active);
    let updatedAssignments;
    if (hasService) {
      updatedAssignments = existing.map((s) =>
        s.service === serviceVal ? { ...s, active: false } : s
      );
    } else {
      const found = existing.find((s) => s.service === serviceVal);
      if (found) {
        updatedAssignments = existing.map((s) =>
          s.service === serviceVal ? { ...s, active: true } : s
        );
      } else {
        updatedAssignments = [
          ...existing,
          {
            id: `assign_${Date.now()}_${serviceVal}`,
            service: serviceVal,
            type: 'permanent' as const,
            status: 'approved' as const,
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            assignedAt: Date.now(),
            agencyId: targetUser.agencyId || currentAgencyId || 'siege',
          },
        ];
      }
    }

    try {
      const userRef = doc(firestoreDb, 'users', targetUser.uid);
      await updateDoc(userRef, { serviceAssignments: updatedAssignments });
    } catch (err) {
      console.warn('Mise à jour services en mode local:', err);
    }

    setManagedUsers((prev) =>
      prev.map((u) =>
        u.uid === targetUser.uid
          ? ({ ...u, serviceAssignments: updatedAssignments } as unknown as ManagedUser)
          : u
      )
    );
    if (editingAgent?.uid === targetUser.uid) {
      setEditingAgent({ ...editingAgent, serviceAssignments: updatedAssignments });
    }
    setSuccessMessage(`Services de ${targetUser.displayName} mis à jour.`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Create new agency admin
  const handleCreateAgencyAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim() || !newAdminEmail.trim()) {
      setErrorMessage('Nom et email sont obligatoires.');
      return;
    }
    setIsSavingAdmin(true);
    setErrorMessage(null);
    try {
      await createAdministrativeUser(
        {
          displayName: newAdminName.trim(),
          email: newAdminEmail.trim(),
          phone: newAdminPhone.trim() || undefined,
          role: 'administrateur_agence',
          category: 'direction',
          agencyId: newAdminAgencyId || null,
          password: newAdminPassword.trim() || undefined,
        },
        actor
      );
      setSuccessMessage(`Administrateur d'Agence « ${newAdminName.trim()} » créé avec succès.`);
      setShowCreateAdminModal(false);
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPhone('');
      setNewAdminAgencyId('');
      setNewAdminPassword('');
      await loadData();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur création Administrateur d\'Agence.');
    } finally {
      setIsSavingAdmin(false);
    }
  };

  // Open Edit Admin modal
  const handleOpenEditAdmin = (admin: ManagedUser) => {
    setEditingAdmin(admin);
    setEditAdminName(admin.displayName);
    setEditAdminPhone(admin.phone || '');
    setEditAdminAgencyId(admin.agencyId || '');
  };

  // Save Edit Admin
  const handleSaveEditAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    try {
      await updateManagedUserProfile(
        editingAdmin.uid,
        {
          displayName: editAdminName.trim(),
          phone: editAdminPhone.trim() || null,
          agencyId: editAdminAgencyId || null,
        },
        actor
      );
      setSuccessMessage(`Profil de ${editAdminName.trim()} mis à jour.`);
      setEditingAdmin(null);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch {
      setErrorMessage('Impossible de modifier le profil.');
    }
  };

  // Change Admin Status
  const handleToggleAdminStatus = async (admin: ManagedUser) => {
    const nextStatus = admin.status === 'active' ? 'suspended' : 'active';
    try {
      await updateManagedUserStatus(admin.uid, nextStatus, actor);
      setSuccessMessage(
        nextStatus === 'active'
          ? `Administrateur d'Agence ${admin.displayName} réactivé.`
          : `Administrateur d'Agence ${admin.displayName} suspendu.`
      );
      await loadData();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch {
      setErrorMessage('Impossible de modifier le statut.');
    }
  };

  // Open Admin Supervision & Audit Modal
  const handleOpenSuperviseAdmin = async (admin: ManagedUser) => {
    setSupervisingAdmin(admin);
    setLoadingAdminAudit(true);
    try {
      const logs = await getCombinedAuditLogs();
      const filtered = logs.filter(
        (l) => l.actorUid === admin.uid || l.details.includes(admin.uid) || l.details.includes(admin.displayName)
      );
      setAdminAuditLogs(filtered);
    } catch {
      setAdminAuditLogs([]);
    } finally {
      setLoadingAdminAudit(false);
    }
  };

  // Open Agent Supervision Modal
  const handleOpenSuperviseAgent = async (agentUser: ManagedUser) => {
    setSupervisingAgent(agentUser);
    setLoadingAgentData(true);
    try {
      const [ops, reps, bills, logs] = await Promise.all([
        db.operations.where('createdBy').equals(agentUser.uid).reverse().sortBy('createdAt').catch(() => []),
        db.reports.where('createdBy').equals(agentUser.uid).reverse().sortBy('createdAt').catch(() => []),
        db.billetages.where('userId').equals(agentUser.uid).reverse().sortBy('createdAt').catch(() => []),
        getCombinedAuditLogs().catch(() => []),
      ]);
      setAgentOperations(ops);
      setAgentReports(reps);
      setAgentBilletages(bills);
      setAgentAuditLogs(
        logs.filter(
          (l) => l.actorUid === agentUser.uid || l.details.includes(agentUser.uid) || l.details.includes(agentUser.displayName)
        )
      );
    } catch (e) {
      console.warn('Erreur chargement détails agent:', e);
    } finally {
      setLoadingAgentData(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Module Header Card */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-800 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Direction des Administrateurs & Agents
                </h1>
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  {managedUsers.length} comptes
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Supervision des Administrateurs d'Agence, gestion du personnel opérationnel, affectations et services.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            {activeTab === 'agency_admins' && (
              <button
                type="button"
                onClick={() => setShowCreateAdminModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-emerald-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvel Administrateur d'Agence
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Feedback messages */}
        {successMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p>{successMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs font-medium text-red-800 dark:text-red-300">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Tab switcher */}
        <div className="mt-5 flex overflow-x-auto scrollbar-none border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('agency_admins')}
            className={`flex items-center gap-2 whitespace-nowrap shrink-0 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
              activeTab === 'agency_admins'
                ? 'border-slate-900 dark:border-emerald-500 text-slate-950 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span className="tabular-nums">Administrateurs d'Agence ({agencyAdmins.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-2 whitespace-nowrap shrink-0 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
              activeTab === 'agents'
                ? 'border-slate-900 dark:border-emerald-500 text-slate-950 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span className="tabular-nums">Agents de l'Entreprise ({agents.length})</span>
          </button>
        </div>

        {/* Filters and search bar */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === 'agency_admins'
                  ? "Rechercher un Administrateur d'Agence par nom, email, agence..."
                  : 'Rechercher un agent par nom, email, service...'
              }
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
            />
          </div>

          {activeTab === 'agents' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterAgency}
                onChange={(e) => setFilterAgency(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">Toutes les agences</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">Tous les services</option>
                {AVAILABLE_SERVICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">Tous les statuts</option>
                <option value="active">Actifs</option>
                <option value="suspended">Suspendus</option>
                <option value="disabled">Désactivés</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: ADMINISTRATEURS D'AGENCE */}
      {activeTab === 'agency_admins' && (
        <div className="overflow-hidden rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="p-3.5">Administrateur d'Agence</th>
                  <th className="p-3.5">Agence Assignée</th>
                  <th className="p-3.5">Statut</th>
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {agencyAdmins.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">
                      {search ? 'Aucun Administrateur d’Agence ne correspond à votre recherche.' : "Aucun Administrateur d’Agence enregistré. Cliquez sur « Nouvel Administrateur d'Agence »."}
                    </td>
                  </tr>
                ) : (
                  agencyAdmins.map((admin) => {
                    const assignedAgency = agencies.find((a) => a.id === admin.agencyId);
                    const isSuspended = admin.status === 'suspended';
                    return (
                      <tr key={admin.uid} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <UserAvatar user={admin} size="sm" showStatus isOnline={admin.status === 'active'} />
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{admin.displayName}</p>
                              <span className="inline-block rounded bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                Administrateur d'Agence
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          {assignedAgency ? (
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{assignedAgency.name}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{assignedAgency.code || assignedAgency.city}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic">Non affecté</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                              admin.status === 'active'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                : isSuspended
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                            }`}
                          >
                            {admin.status === 'active' ? 'Actif' : isSuspended ? 'Suspendu' : 'Désactivé'}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300 tabular-nums">
                          <p>{admin.email || '—'}</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">{admin.phone || ''}</p>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleOpenSuperviseAdmin(admin)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 whitespace-nowrap"
                            >
                              <Eye className="h-3 w-3" />
                              Détails & Audit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditAdmin(admin)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
                            >
                              <Edit3 className="h-3 w-3" />
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleAdminStatus(admin)}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                                admin.status === 'active'
                                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
                                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950'
                              }`}
                            >
                              {admin.status === 'active' ? 'Suspendre' : 'Réactiver'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: AGENTS DE L'ENTREPRISE */}
      {activeTab === 'agents' && (
        <div className="overflow-hidden rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="p-3.5">Agent</th>
                  <th className="p-3.5">Agence de Rattachement</th>
                  <th className="p-3.5">Fonction Principale</th>
                  <th className="p-3.5">Polyvalence</th>
                  <th className="p-3.5">Services Actifs</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                      Aucun agent trouvé selon les critères de recherche.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent) => {
                    const agentAppUser = agent as unknown as AppUser;
                    const activeAssignments = (agentAppUser.serviceAssignments || []).filter((s) => s.active);
                    const assignedAgency = agencies.find((a) => a.id === agent.agencyId);
                    return (
                      <tr key={agent.uid} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              user={agent}
                              size="sm"
                              showStatus
                              isOnline={agent.status === 'active'}
                            />
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{agent.displayName}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{agent.email || agent.phone || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          {assignedAgency ? (
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{assignedAgency.name}</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic">Non affecté</span>
                          )}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {agent.function || 'Agent standard'}
                        </td>
                        <td className="p-3.5">
                          <button
                            type="button"
                            onClick={() => void handleToggleMultiService(agent)}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition whitespace-nowrap ${
                              agentAppUser.multiServiceEnabled
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${agentAppUser.multiServiceEnabled ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-slate-400'}`} />
                            {agentAppUser.multiServiceEnabled ? 'Activée' : 'Désactivée'}
                          </button>
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-wrap gap-1">
                            {activeAssignments.length === 0 ? (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">Aucun service</span>
                            ) : (
                              activeAssignments.map((a) => (
                                <span
                                  key={a.service}
                                  className="rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300"
                                >
                                  {a.service}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleOpenSuperviseAgent(agent)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 whitespace-nowrap"
                            >
                              <Eye className="h-3 w-3" />
                              Superviser
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAgent(agentAppUser)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
                            >
                              <Settings className="h-3 w-3" />
                              Services
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Créer un Administrateur d'Agence */}
      {showCreateAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Créer un Administrateur d'Agence
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateAdminModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAgencyAdmin} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nom et prénom du responsable *
                </label>
                <input
                  type="text"
                  required
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  placeholder="Ex: Jean Mukendi"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Adresse email officielle *
                </label>
                <input
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="jean.mukendi@ets-amani.cd"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Numéro de téléphone
                </label>
                <input
                  type="tel"
                  value={newAdminPhone}
                  onChange={(e) => setNewAdminPhone(e.target.value)}
                  placeholder="+243..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white tabular-nums outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Affectation à une agence
                </label>
                <select
                  value={newAdminAgencyId}
                  onChange={(e) => setNewAdminAgencyId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400 dark:focus:border-slate-500"
                >
                  <option value="">Sélectionner une agence (optionnel)</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mot de passe initial (facultatif si auth locale)
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="Mot de passe sécurisé..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateAdminModal(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdmin}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isSavingAdmin && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Créer l'Administrateur d'Agence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Modifier le profil d'un Administrateur d'Agence */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Modifier Administrateur d'Agence
              </h3>
              <button
                type="button"
                onClick={() => setEditingAdmin(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAdmin} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  required
                  value={editAdminName}
                  onChange={(e) => setEditAdminName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={editAdminPhone}
                  onChange={(e) => setEditAdminPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white tabular-nums outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Agence assignée
                </label>
                <select
                  value={editAdminAgencyId}
                  onChange={(e) => setEditAdminAgencyId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400 dark:focus:border-slate-500"
                >
                  <option value="">Non assigné</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 dark:bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Détails & Journal d'Audit Administrateur d'Agence */}
      {supervisingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-5">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar user={supervisingAdmin} size="md" />
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{supervisingAdmin.displayName}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Administrateur d'Agence • {agencies.find((a) => a.id === supervisingAdmin.agencyId)?.name || 'Non rattaché'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupervisingAdmin(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4">
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Email :</span>
                  <p className="font-bold text-slate-900 dark:text-white break-all">{supervisingAdmin.email || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Téléphone :</span>
                  <p className="font-bold text-slate-900 dark:text-white tabular-nums">{supervisingAdmin.phone || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Statut :</span>
                  <p className="font-bold text-slate-900 dark:text-white uppercase">{supervisingAdmin.status}</p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Rôle officiel :</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Administrateur d'Agence</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">Historique d'audit & Traçabilité</h4>
                {loadingAdminAudit ? (
                  <div className="py-6 text-center text-slate-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1" />
                    Chargement de l'historique...
                  </div>
                ) : adminAuditLogs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-slate-400 dark:text-slate-500">
                    Aucun événement d'audit enregistré pour cet administrateur.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                    {adminAuditLogs.map((log) => (
                      <div key={log.id} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-800 dark:text-slate-100">{log.action}</p>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">{log.details}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setSupervisingAdmin(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Superviser un Agent (Opérations, Rapports, Billetages) */}
      {supervisingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-5">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar user={supervisingAgent} size="md" />
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{supervisingAgent.displayName}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Agent • Fonction : {supervisingAgent.function || 'Standard'} • Agence : {agencies.find((a) => a.id === supervisingAgent.agencyId)?.name || 'Non rattaché'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupervisingAgent(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 text-xs space-y-5">
              {loadingAgentData ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
                  Chargement des activités de l'agent...
                </div>
              ) : (
                <>
                  {/* Operations section */}
                  <div>
                    <h4 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white mb-2 tabular-nums">
                      <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Opérations & Missions ({agentOperations.length})
                    </h4>
                    {agentOperations.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-3 text-slate-400 dark:text-slate-500">
                        Aucune opération initiée par cet agent.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                        {agentOperations.map((op) => (
                          <div key={op.id} className="flex items-center justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate">{op.title || op.operationNumber}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">N° {op.operationNumber}</p>
                            </div>
                            <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                              {op.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reports section */}
                  <div>
                    <h4 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white mb-2 tabular-nums">
                      <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Rapports soumis ({agentReports.length})
                    </h4>
                    {agentReports.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-3 text-slate-400 dark:text-slate-500">
                        Aucun rapport soumis par cet agent.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                        {agentReports.map((rep) => (
                          <div key={rep.id} className="flex items-center justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate">{rep.title}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">Réf : {rep.reference}</p>
                            </div>
                            <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                              {rep.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Billetages section */}
                  <div>
                    <h4 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white mb-2 tabular-nums">
                      <WalletCards className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      Comptages de Billetage ({agentBilletages.length})
                    </h4>
                    {agentBilletages.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-3 text-slate-400 dark:text-slate-500">
                        Aucun billetage enregistré par cet agent.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                        {agentBilletages.map((b) => (
                          <div key={b.id} className="flex items-center justify-between gap-2 p-3">
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white tabular-nums">
                                {b.currency} {b.calculatedTotal.toLocaleString('fr-FR')}
                              </p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                                {new Date(b.createdAt).toLocaleDateString()} • {b.type === 'business' ? 'Professionnel' : 'Personnel'}
                              </p>
                            </div>
                            <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                              {b.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setSupervisingAgent(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Configurer Services Agent */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar user={editingAgent} size="md" />
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                    Services de {editingAgent.displayName}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cochez les services opérationnels que cet agent a l'autorisation d'exécuter.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingAgent(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Polyvalence multi-services</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Permet à l'agent de basculer dynamiquement entre plusieurs postes au guichet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const m = managedUsers.find((u) => u.uid === editingAgent.uid);
                  if (m) void handleToggleMultiService(m);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  editingAgent.multiServiceEnabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {editingAgent.multiServiceEnabled ? 'Activée' : 'Désactivée'}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {AVAILABLE_SERVICES.map(({ value, label }) => {
                const isChecked = (editingAgent.serviceAssignments || []).some(
                  (s) => s.service === value && s.active
                );
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void handleToggleService(editingAgent, value)}
                    className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                      isChecked
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold">{label}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{value}</p>
                    </div>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                        isChecked
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isChecked && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingAgent(null)}
                className="rounded-lg bg-slate-900 dark:bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
              >
                Terminé
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
