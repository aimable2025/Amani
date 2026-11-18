import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import {
  approveRegistration,
  getPendingRegistrationRequests,
  markRegistrationUnderReview,
  rejectRegistration,
  type FirestoreUserProfile,
} from '../../../services/UserProfileService';

type RegistrationFilter = 'all' | 'client' | 'abonne';
type RegistrationWorkflowStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

interface RegistrationRequestsModuleProps {
  onClose?: () => void;
}

function getTimestampValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function formatDate(value: unknown): string {
  const timestamp = getTimestampValue(value);
  if (!timestamp) return 'Date inconnue';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return 'Date inconnue';
  }
}

function getRegistrationStatus(registration: FirestoreUserProfile): RegistrationWorkflowStatus {
  if (registration.registrationStatus) {
    return registration.registrationStatus;
  }
  if (registration.status === 'rejected') {
    return 'rejected';
  }
  if (registration.status === 'active') {
    return 'approved';
  }
  return 'pending';
}

function getRoleLabel(role?: string): string {
  if (role === 'abonne') return 'Abonné';
  if (role === 'client') return 'Client';
  return 'Profil inconnu';
}

function getInitials(registration: FirestoreUserProfile): string {
  const first = registration.firstName?.trim().charAt(0) || '';
  const last = registration.lastName?.trim().charAt(0) || '';
  return `${first}${last}`.toUpperCase() || 'U';
}

function getFullName(registration: FirestoreUserProfile): string {
  const composed = [
    registration.firstName,
    registration.postName,
    registration.lastName,
  ]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(' ');
  return composed || registration.displayName || 'Utilisateur';
}

export default function RegistrationRequestsModule({
  onClose,
}: RegistrationRequestsModuleProps) {
  const { user, firebaseUser, isDirecteurGeneral, isAdministrateurAgence } = useAuth();
  const [registrations, setRegistrations] = useState<FirestoreUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [filter, setFilter] = useState<RegistrationFilter>('all');
  const [processingUid, setProcessingUid] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<FirestoreUserProfile | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<FirestoreUserProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const reviewerUid = user?.uid || firebaseUser?.uid || '';

  const loadRegistrations = useCallback(
    async (showRefreshIndicator = false) => {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await getPendingRegistrationRequests();
        let visible = data.filter(
          (r) => r.requestedRole === 'client' || r.requestedRole === 'abonne'
        );
        if (isAdministrateurAgence && user?.agencyId) {
          visible = visible.filter((r) => {
            if (r.requestedRole === 'client') return true;
            if (r.requestedRole === 'abonne') return r.agencyId === user.agencyId;
            return false;
          });
        }
        visible.sort(
          (a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt)
        );
        setRegistrations(visible);
      } catch {
        setError('Impossible de charger les demandes d inscription.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAdministrateurAgence, user?.agencyId]
  );

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  const filteredRegistrations = useMemo(() => {
    const normalized = searchValue.trim().toLowerCase();
    return registrations.filter((r) => {
      if (filter !== 'all' && r.requestedRole !== filter) return false;
      if (!normalized) return true;
      const content = [
        getFullName(r),
        r.displayName,
        r.email,
        r.phone,
        r.profession,
        r.agencyId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return content.includes(normalized);
    });
  }, [filter, searchValue, registrations]);

  const handleUnderReview = async (registration: FirestoreUserProfile) => {
    setProcessingUid(registration.uid);
    try {
      await markRegistrationUnderReview(registration.uid, reviewerUid);
      await loadRegistrations(true);
    } catch {
      setError('Impossible de mettre en évaluation.');
    } finally {
      setProcessingUid(null);
    }
  };

  const handleApprove = async (registration: FirestoreUserProfile) => {
    setProcessingUid(registration.uid);
    try {
      await approveRegistration(registration.uid, reviewerUid);
      setSelectedRegistration(null);
      await loadRegistrations(true);
    } catch {
      setError('Impossible de valider.');
    } finally {
      setProcessingUid(null);
    }
  };

  const handleReject = async () => {
    if (!rejectionTarget) return;
    setProcessingUid(rejectionTarget.uid);
    try {
      await rejectRegistration(rejectionTarget.uid, reviewerUid, rejectionReason);
      setRejectionTarget(null);
      setRejectionReason('');
      setSelectedRegistration(null);
      await loadRegistrations(true);
    } catch {
      setError('Impossible de rejeter.');
    } finally {
      setProcessingUid(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Demandes d'inscription</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Valider ou rejeter les demandes Client et Abonné</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRegistrations(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Rechercher un candidat..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800 p-1 text-xs overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1 font-semibold transition ${filter === 'all' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Tous ({registrations.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('client')}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1 font-semibold transition ${filter === 'client' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Clients
            </button>
            <button
              type="button"
              onClick={() => setFilter('abonne')}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1 font-semibold transition ${filter === 'abonne' ? 'bg-white dark:bg-slate-900 shadow-sm text-purple-700 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Abonnés
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400">
            <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
            <p className="text-xs">Chargement des demandes...</p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Users className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Aucune demande en attente</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRegistrations.map((r) => {
              const status = getRegistrationStatus(r);
              const isProcessing = processingUid === r.uid;
              return (
                <div key={r.uid} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      name={getFullName(r)}
                      photoURL={r.photoURL}
                      email={r.email}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{getFullName(r)}</p>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          r.requestedRole === 'abonne'
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                        }`}>
                          {getRoleLabel(r.requestedRole)}
                        </span>
                        <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                          {status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums truncate">
                        {r.phone || r.email || 'Sans coordonnées'} {r.profession ? `• ${r.profession}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedRegistration(r)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Détails
                    </button>
                    {status === 'pending' && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleUnderReview(r)}
                        className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Évaluer
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleApprove(r)}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setRejectionTarget(r)}
                      className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      Rejeter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Détails */}
      {selectedRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={getFullName(selectedRegistration)}
                  photoURL={selectedRegistration.photoURL}
                  email={selectedRegistration.email}
                  size="md"
                />
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{getFullName(selectedRegistration)}</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Demande {getRoleLabel(selectedRegistration.requestedRole)} • {formatDate(selectedRegistration.createdAt)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRegistration(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg">
                <span className="text-slate-400 block font-semibold uppercase text-[10px]">Téléphone WhatsApp</span>
                <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{selectedRegistration.phone || '—'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg">
                <span className="text-slate-400 block font-semibold uppercase text-[10px]">Email</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 break-all">{selectedRegistration.email || '—'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg">
                <span className="text-slate-400 block font-semibold uppercase text-[10px]">Province / Ville</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{selectedRegistration.province || '—'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg">
                <span className="text-slate-400 block font-semibold uppercase text-[10px]">Pièce d'identité</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{selectedRegistration.identityDocument || '—'}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedRegistration(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rejet */}
      {rejectionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-3.5">
            <h3 className="font-bold text-base text-rose-700 dark:text-rose-400">Rejeter la demande d'inscription</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Veuillez indiquer le motif du rejet pour {getFullName(rejectionTarget)} :
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Pièce d'identité illisible ou informations non conformes"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-900 dark:text-slate-100 outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRejectionTarget(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
