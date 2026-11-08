import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileClock,
  FileSpreadsheet,
  Filter,
  History,
  Info,
  Layers,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db as firestoreDb } from '../../../lib/firebase';
import UserAvatar from '../../../components/common/UserAvatar';
import {
  getLocalAuditLogs,
  recordAuditLog,
  type AuditCategory,
  type AuditLogEntry,
  type AuditSeverity,
} from '../../../services/AuditService';
import { useAuth } from '../../../contexts/AuthContext';

export { recordAuditLog };

export interface AuditModuleProps {
  onClose?: () => void;
  agencyIdFilter?: string | null;
  agencyName?: string | null;
}

type PeriodFilter = 'all' | 'today' | '7days' | '30days';

/**
 * Formate un horodatage précis avec date et heure à la seconde près.
 */
function formatExactTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Calcule le temps relatif pour une lecture humaine immédiate.
 */
function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 45) return "À l'instant";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Libellés et icônes conviviaux par catégorie métier.
 */
function getCategoryInfo(category: string) {
  switch (category) {
    case 'auth':
      return { label: 'Authentification', icon: Lock, bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
    case 'security':
      return { label: 'Sécurité & Droits', icon: Shield, bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'operations':
      return { label: 'Opérations', icon: History, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'billetage':
      return { label: 'Billetage & Caisse', icon: WalletCards, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'reports':
      return { label: 'Rapports & Audit', icon: FileClock, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case 'rbac':
      return { label: 'Gestion Rôles', icon: User, bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' };
    case 'sync':
      return { label: 'Synchronisation', icon: Wifi, bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' };
    case 'config':
      return { label: 'Configuration', icon: Layers, bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    default:
      return { label: 'Système', icon: Info, bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  }
}

export default function AuditModule({ onClose, agencyIdFilter, agencyName }: AuditModuleProps) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('all');
  const [selectedAgency, setSelectedAgency] = useState<string>(agencyIdFilter || 'all');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'security' | 'operations' | 'auth'>('all');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let combined: AuditLogEntry[] = [];
      try {
        const auditRef = collection(firestoreDb, 'auditLogs');
        const q = query(auditRef, orderBy('timestamp', 'desc'), limit(150));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          combined = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            let timestamp = Date.now();
            if (data.timestamp?.seconds) {
              timestamp = data.timestamp.seconds * 1000;
            } else if (typeof data.timestamp === 'number') {
              timestamp = data.timestamp;
            } else if (typeof data.createdAtClient === 'number') {
              timestamp = data.createdAtClient;
            }
            return {
              id: docSnap.id,
              action: data.action || 'Action administrative',
              category: (data.category as AuditLogEntry['category']) || 'security',
              severity: (data.severity as AuditSeverity) || 'info',
              details: data.details || '',
              actorName: data.actorName || 'Système',
              actorRole: data.actorRole || 'administrateur_systeme',
              actorUid: data.actorUid,
              agencyId: data.agencyId,
              agencyName: data.agencyName,
              timestamp,
              metadata: data.metadata,
            };
          });
        }
      } catch (err) {
        console.warn('Lecture auditLogs Firestore non disponible (mode hors-ligne), fallback local:', err);
      }

      const local = getLocalAuditLogs();
      const ids = new Set(combined.map((l) => l.id));
      for (const loc of local) {
        if (!ids.has(loc.id)) {
          combined.push(loc);
        }
      }
      combined.sort((a, b) => b.timestamp - a.timestamp);
      setLogs(combined);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Extraire les agences uniques pour le sélecteur d'agence
  const availableAgencies = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.agencyName) set.add(l.agencyName);
      else if (l.agencyId) set.add(l.agencyId);
    });
    return Array.from(set);
  }, [logs]);

  // Filtrage combiné (Recherche, Onglet rapide, Catégorie, Sévérité, Période, Agence)
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    return logs.filter((log) => {
      // Filtre d'agence imposé en prop (ex: Admin Agence)
      if (agencyIdFilter && log.agencyId && log.agencyId !== agencyIdFilter) {
        return false;
      }

      // Filtre d'agence interactif (si sélectionné)
      if (selectedAgency !== 'all') {
        const matchesAgency =
          log.agencyId === selectedAgency || log.agencyName === selectedAgency;
        if (!matchesAgency) return false;
      }

      // Filtre onglet rapide
      if (activeTab === 'security' && log.category !== 'security' && log.category !== 'auth' && log.category !== 'rbac') {
        return false;
      }
      if (activeTab === 'operations' && log.category !== 'operations' && log.category !== 'billetage') {
        return false;
      }
      if (activeTab === 'auth' && log.category !== 'auth') {
        return false;
      }

      // Filtre catégorie
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }

      // Filtre sévérité
      if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) {
        return false;
      }

      // Filtre période
      if (selectedPeriod === 'today') {
        const d = new Date(log.timestamp);
        const today = new Date();
        if (d.toDateString() !== today.toDateString()) return false;
      } else if (selectedPeriod === '7days') {
        if (now - log.timestamp > 7 * 86400000) return false;
      } else if (selectedPeriod === '30days') {
        if (now - log.timestamp > 30 * 86400000) return false;
      }

      // Recherche textuelle libre
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.actorName.toLowerCase().includes(q) ||
        log.actorRole.toLowerCase().includes(q) ||
        (log.agencyName && log.agencyName.toLowerCase().includes(q)) ||
        (log.actorUid && log.actorUid.toLowerCase().includes(q))
      );
    });
  }, [logs, agencyIdFilter, selectedAgency, activeTab, selectedCategory, selectedSeverity, selectedPeriod, search]);

  // Statistiques synthétiques
  const stats = useMemo(() => {
    const total = logs.length;
    const critical = logs.filter((l) => l.severity === 'critical' || l.severity === 'security').length;
    const warning = logs.filter((l) => l.severity === 'warning').length;
    const today = logs.filter((l) => {
      const d = new Date(l.timestamp);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    return { total, critical, warning, today };
  }, [logs]);

  // Export CSV avec BOM UTF-8
  const handleExportCSV = () => {
    const headers = [
      'Identifiant',
      'Horodatage ISO',
      'Date & Heure',
      'Acteur',
      'Rôle',
      'Catégorie',
      'Gravité',
      'Action',
      'Détails',
      'Agence',
    ];
    const rows = filteredLogs.map((l) => [
      `"${l.id}"`,
      `"${new Date(l.timestamp).toISOString()}"`,
      `"${formatExactTimestamp(l.timestamp)}"`,
      `"${l.actorName.replace(/"/g, '""')}"`,
      `"${l.actorRole}"`,
      `"${l.category}"`,
      `"${l.severity}"`,
      `"${l.action.replace(/"/g, '""')}"`,
      `"${l.details.replace(/"/g, '""')}"`,
      `"${l.agencyName || l.agencyId || 'Siège/Global'}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `journal-audit-ets-amani-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export JSON
  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `journal-audit-ets-amani-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const severityBadge = (severity: AuditSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
            <AlertCircle className="h-3 w-3" /> Critique
          </span>
        );
      case 'security':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800">
            <ShieldAlert className="h-3 w-3" /> Sécurité
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            <AlertTriangle className="h-3 w-3" /> Avertissement
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
            <CheckCircle2 className="h-3 w-3" /> Information
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête Principal & Titre Conforme au Design System */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B192C] text-[#C58B39] font-black shadow-sm">
              <History className="h-6 w-6 text-[#C58B39]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[#C58B39]">
                  CONTRÔLE & CONFORMITÉ
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  Horodatage certifié
                </span>
                {agencyName && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                    <Building2 className="h-3 w-3" />
                    {agencyName}
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Journal d'Activité & d'Audit
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl">
                Registre chronologique complet et infalsifiable des actions administratives, mouvements de caisse, authentifications et modifications de comptes.
              </p>
            </div>
          </div>

          {/* Boutons d'action rapides */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={isLoading}
              title="Rafraîchir les enregistrements"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              title="Exporter sous format Excel / CSV"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportJSON}
              title="Exporter en JSON"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B192C] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              <span>JSON</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Fermer le journal d'audit"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* 4 Cartes de statistiques synthétiques */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Événements</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{stats.total}</p>
            <p className="mt-1 text-[11px] text-slate-500">Traçabilité continue</p>
          </div>
          <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Sécurité & Alertes</p>
            <p className="mt-1 text-2xl font-black text-purple-900">{stats.critical}</p>
            <p className="mt-1 text-[11px] text-purple-600">Points de vigilance</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Avertissements</p>
            <p className="mt-1 text-2xl font-black text-amber-900">{stats.warning}</p>
            <p className="mt-1 text-[11px] text-amber-600">Anomalies légères</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Aujourd'hui</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{stats.today}</p>
            <p className="mt-1 text-[11px] text-emerald-600">Dernières 24 heures</p>
          </div>
        </div>

        {/* Onglets de navigation rapide */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === 'all'
                ? 'bg-[#0B192C] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tous les événements ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === 'security'
                ? 'bg-[#0B192C] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Sécurité & Privilèges
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('operations')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === 'operations'
                ? 'bg-[#0B192C] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Caisse & Opérations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === 'auth'
                ? 'bg-[#0B192C] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Connexions & Sessions
          </button>
        </div>

        {/* Barre de Recherche et Filtres Détaillés */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12 items-center">
          <div className="relative sm:col-span-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par action, acteur, détail..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-8 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="sm:col-span-7 flex flex-wrap items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as AuditCategory)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none flex-1 min-w-[120px]"
            >
              <option value="all">Toutes catégories</option>
              <option value="auth">Authentification</option>
              <option value="security">Sécurité système</option>
              <option value="operations">Opérations</option>
              <option value="billetage">Billetage de Caisse</option>
              <option value="reports">Rapports d'activité</option>
              <option value="rbac">Droits d'accès & Habilitations</option>
              <option value="sync">Synchronisation</option>
              <option value="config">Configuration</option>
            </select>

            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none flex-1 min-w-[110px]"
            >
              <option value="all">Tous niveaux</option>
              <option value="info">Info</option>
              <option value="warning">Avertissement</option>
              <option value="security">Sécurité</option>
              <option value="critical">Critique</option>
            </select>

            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as PeriodFilter)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none min-w-[100px]"
            >
              <option value="all">Toute période</option>
              <option value="today">Aujourd'hui</option>
              <option value="7days">7 derniers jours</option>
              <option value="30days">30 derniers jours</option>
            </select>

            {availableAgencies.length > 0 && !agencyIdFilter && (
              <select
                value={selectedAgency}
                onChange={(e) => setSelectedAgency(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none min-w-[110px]"
              >
                <option value="all">Toutes succursales</option>
                {availableAgencies.map((ag) => (
                  <option key={ag} value={ag}>
                    {ag}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Liste Chronologique des Événements avec Horodatage Précis */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-xs font-bold text-slate-600">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <span>Événements horodatés ({filteredLogs.length})</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Triés du plus récent au plus ancien
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <FileClock className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 font-bold text-slate-700">Aucun événement d'audit ne correspond à vos filtres</p>
            <p className="mt-1 text-xs text-slate-500">
              Modifiez votre recherche ou réinitialisez les critères de filtrage.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
                setSelectedSeverity('all');
                setSelectedPeriod('all');
                setActiveTab('all');
              }}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const catInfo = getCategoryInfo(log.category);
              const CatIcon = catInfo.icon;
              const exactTime = formatExactTimestamp(log.timestamp);
              const relativeTime = formatRelativeTime(log.timestamp);

              return (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="group flex flex-col gap-3 p-4 transition hover:bg-slate-50/90 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                >
                  <div className="flex min-w-0 items-start gap-3.5">
                    {/* Icône de catégorie colorée */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${catInfo.border} ${catInfo.bg} ${catInfo.text} shadow-2xs mt-0.5`}
                    >
                      <CatIcon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Ligne 1 : Badges + Action Principale */}
                      <div className="flex flex-wrap items-center gap-2">
                        {severityBadge(log.severity)}
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${catInfo.bg} ${catInfo.text}`}
                        >
                          {catInfo.label}
                        </span>
                        <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-900 transition-colors">
                          {log.action}
                        </h3>
                      </div>

                      {/* Ligne 2 : Détails */}
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600 leading-relaxed">
                        {log.details}
                      </p>

                      {/* Ligne 3 : Métadonnées Acteur + Horodatage Précis */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                          <UserAvatar name={log.actorName} size="xs" />
                          <span>{log.actorName}</span>
                          <span className="text-[11px] font-normal text-slate-400">
                            ({log.actorRole})
                          </span>
                        </div>

                        {log.agencyName && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                              <Building2 className="h-3 w-3 text-slate-400" />
                              {log.agencyName}
                            </span>
                          </>
                        )}

                        <span className="text-slate-300">•</span>

                        {/* Horodatage précis (date + heure + seconde) */}
                        <div className="flex items-center gap-1.5 font-semibold text-slate-600">
                          <Clock className="h-3.5 w-3.5 text-[#C58B39]" />
                          <span>{exactTime}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-500">
                            {relativeTime}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bouton Détail */}
                  <div className="flex items-center justify-end sm:justify-center shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 group-hover:border-slate-300 group-hover:bg-slate-100 transition">
                      <span>Examiner</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal d'Inspection Détaillée de l'Événement d'Audit */}
      {selectedLog && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedLog(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header Modal */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {severityBadge(selectedLog.severity)}
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-extrabold uppercase text-slate-700">
                    {getCategoryInfo(selectedLog.category).label}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {selectedLog.id}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900">{selectedLog.action}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fermer le détail"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Horodatage Précis Multi-Formats */}
            <div className="rounded-2xl border border-[#C58B39]/20 bg-[#C58B39]/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#8C6226]">
                <Clock className="h-4 w-4" />
                <span>Horodatage Certifié & Traçabilité</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">Date et heure locale :</span>
                  <p className="font-bold text-slate-900">{formatExactTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Délai relatif :</span>
                  <p className="font-bold text-slate-900">{formatRelativeTime(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Format international ISO 8601 :</span>
                  <p className="font-mono text-[11px] text-slate-700">
                    {new Date(selectedLog.timestamp).toISOString()}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Timestamp epoch UNIX :</span>
                  <p className="font-mono text-[11px] text-slate-700">{selectedLog.timestamp} ms</p>
                </div>
              </div>
            </div>

            {/* Détails de l'Action */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Description de l'action
              </p>
              <div className="rounded-2xl bg-slate-50 p-3.5 text-xs text-slate-800 leading-relaxed border border-slate-100">
                {selectedLog.details}
              </div>
            </div>

            {/* Acteur & Rôle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acteur Responsable</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <UserAvatar name={selectedLog.actorName} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">{selectedLog.actorName}</p>
                    <p className="truncate text-[11px] text-slate-500">{selectedLog.actorRole}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Périmètre / Agence</p>
                <div className="mt-2 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {selectedLog.agencyName || selectedLog.agencyId || 'Réseau Central ETS AMANI'}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">Succursale rattachée</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Données de Contexte / Métadonnées structurées */}
            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Données contextuelles & Paramètres
                </p>
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden text-xs">
                  <table className="w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50 text-slate-500 font-bold">
                      <tr>
                        <th className="px-3 py-2 text-left">Propriété</th>
                        <th className="px-3 py-2 text-left">Valeur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(selectedLog.metadata).map(([k, v]) => (
                        <tr key={k}>
                          <td className="px-3 py-2 font-mono text-slate-600 font-semibold">{k}</td>
                          <td className="px-3 py-2 text-slate-800">
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer Modal */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                Enregistrement conservé dans les tables immuables
              </span>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl bg-[#0B192C] px-5 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
