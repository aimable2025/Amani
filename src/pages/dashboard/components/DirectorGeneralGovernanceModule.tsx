import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  Lock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Unlock,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import {
  appointDirectorGeneral,
  getCurrentDirectorGeneral,
  getDirectorGeneralConfig,
  getDirectorGeneralHistory,
  reactivateDirectorGeneral,
  revokeDirectorGeneral,
  suspendDirectorGeneral,
  type DirectorGeneralConfig,
  type DirectorGeneralHistoryEntry,
  type DirectorGeneralRecord,
} from '../../../services/DirectorGeneralService';
import {
  getDgFeatures,
  resetDgFeatures,
  toggleDgFeature,
} from '../../../services/DgFeatureService';
import {
  DG_FEATURE_DEFINITIONS,
  type DgFeatureKey,
  type DgFeatures,
} from '../../../types/management';

interface DirectorGeneralGovernanceModuleProps {
  onClose?: () => void;
}

type ModalType = 'suspend' | 'reactivate' | 'replace' | 'revoke' | null;

export default function DirectorGeneralGovernanceModule({
  onClose,
}: DirectorGeneralGovernanceModuleProps) {
  const { user } = useAuth();

  const [currentDg, setCurrentDg] = useState<DirectorGeneralRecord | null>(null);
  const [dgConfig, setDgConfig] = useState<DirectorGeneralConfig | null>(null);
  const [history, setHistory] = useState<DirectorGeneralHistoryEntry[]>([]);
  const [features, setFeatures] = useState<DgFeatures | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale d'action
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [reasonInput, setReasonInput] = useState('');

  // Formulaire de remplacement / nouvelle nomination
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmResetFeatures, setConfirmResetFeatures] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dgRecord, configData, historyData, featuresData] = await Promise.all([
        getCurrentDirectorGeneral(),
        getDirectorGeneralConfig(),
        getDirectorGeneralHistory(),
        getDgFeatures(),
      ]);

      setCurrentDg(dgRecord);
      setDgConfig(configData);
      setHistory(historyData);
      setFeatures(featuresData);
    } catch (err) {
      console.warn('[Ets AMANI] Erreur chargement gouvernance DG :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4500);
  };

  // Suspension
  const handleSuspend = async () => {
    if (!user || !currentDg?.uid || !reasonInput.trim()) return;
    setSubmitting(true);
    try {
      await suspendDirectorGeneral(
        currentDg.uid,
        reasonInput.trim(),
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      showFeedback('success', 'Le mandat du Directeur Général a été suspendu.');
      setActiveModal(null);
      setReasonInput('');
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la suspension du DG.');
    } finally {
      setSubmitting(false);
    }
  };

  // Réactivation
  const handleReactivate = async () => {
    if (!user || !currentDg?.uid) return;
    setSubmitting(true);
    try {
      await reactivateDirectorGeneral(
        currentDg.uid,
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      showFeedback('success', 'Le Directeur Général a été réactivé avec succès.');
      setActiveModal(null);
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la réactivation du DG.');
    } finally {
      setSubmitting(false);
    }
  };

  // Révocation / Suppression logique
  const handleRevoke = async () => {
    if (!user || !currentDg?.uid || !reasonInput.trim()) return;
    setSubmitting(true);
    try {
      await revokeDirectorGeneral(
        currentDg.uid,
        reasonInput.trim(),
        { uid: user.uid, name: user.displayName, role: user.role }
      );
      showFeedback('success', 'Le mandat du Directeur Général a été révoqué.');
      setActiveModal(null);
      setReasonInput('');
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la révocation du mandat.');
    } finally {
      setSubmitting(false);
    }
  };

  // Remplacement / Nomination
  const handleReplaceOrAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim() || !newEmail.trim()) return;
    setSubmitting(true);
    try {
      await appointDirectorGeneral(
        {
          displayName: newName.trim(),
          email: newEmail.trim(),
          phone: newPhone.trim() || undefined,
          password: newPassword,
        },
        { uid: user.uid, name: user.displayName, role: user.role },
        currentDg?.uid
      );
      showFeedback('success', 'Le nouveau Directeur Général a été nommé avec succès.');
      setActiveModal(null);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      await loadData();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erreur lors de la nomination du DG.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Feature DG
  const handleToggleFeature = async (key: DgFeatureKey) => {
    try {
      const updated = await toggleDgFeature(key);
      setFeatures(updated);
      showFeedback('success', `Prérogative « ${key} » mise à jour.`);
    } catch {
      showFeedback('error', 'Impossible de modifier la prérogative.');
    }
  };

  // Réinitialiser prérogatives
  const handleResetFeatures = async () => {
    try {
      setConfirmResetFeatures(false);
      const reset = await resetDgFeatures();
      setFeatures(reset);
      showFeedback('success', 'Prérogatives réinitialisées aux valeurs par défaut.');
    } catch {
      showFeedback('error', 'Erreur lors de la réinitialisation.');
    }
  };

  const isSuspended = currentDg?.status === 'suspended' || dgConfig?.status === 'suspended';
  const isActive = currentDg?.status === 'active' && !isSuspended;

  return (
    <div className="space-y-4">
      {/* En-tête du module */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Gouvernance du Directeur Général (DG)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supervision statutaire, nomination, suspension, révocation et habilitations exclusives.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message de feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2.5 rounded-xl p-3 text-xs font-semibold border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/60'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          )}
          <p>{feedback.message}</p>
        </div>
      )}

      {/* Carte du Mandat DG Actuel */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <UserAvatar
              name={currentDg?.displayName || dgConfig?.displayName || 'Directeur Général'}
              photoURL={currentDg?.photoURL || dgConfig?.photoURL}
              email={currentDg?.email || dgConfig?.email}
              size="lg"
              showStatus
              isOnline={isActive}
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {currentDg?.displayName || dgConfig?.displayName || 'Aucun DG nommé'}
                </h3>
                {isActive && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Mandat Actif
                  </span>
                )}
                {isSuspended && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    <PauseCircle className="h-3 w-3" />
                    Mandat Suspendu
                  </span>
                )}
                {!isActive && !isSuspended && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <UserMinus className="h-3 w-3" />
                    Poste Vacant / Inactif
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Email : <strong className="text-slate-800 dark:text-slate-200">{currentDg?.email || dgConfig?.email || '—'}</strong> • Téléphone :{' '}
                <strong className="tabular-nums text-slate-800 dark:text-slate-200">{currentDg?.phone || dgConfig?.phone || '—'}</strong>
              </p>

              {currentDg?.appointedByName && (
                <p className="text-[11px] text-slate-400 tabular-nums">
                  Nommé par : <span className="font-semibold text-slate-600 dark:text-slate-300">{currentDg.appointedByName}</span>
                  {currentDg.appointedAt && (
                    <> le {new Date(currentDg.appointedAt).toLocaleDateString('fr-FR')}</>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Boutons d'actions administratives */}
          <div className="flex flex-wrap items-center gap-2">
            {isActive && (
              <button
                type="button"
                onClick={() => {
                  setReasonInput('');
                  setActiveModal('suspend');
                }}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                Suspendre le DG
              </button>
            )}

            {isSuspended && (
              <button
                type="button"
                onClick={() => setActiveModal('reactivate')}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Réactiver le DG
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setNewName('');
                setNewEmail('');
                setNewPhone('');
                setActiveModal('replace');
              }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {currentDg ? 'Remplacer le DG' : 'Nommer un DG'}
            </button>

            {currentDg && (
              <button
                type="button"
                onClick={() => {
                  setReasonInput('');
                  setActiveModal('revoke');
                }}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Révoquer
              </button>
            )}
          </div>
        </div>

        {/* Bannière en cas de suspension */}
        {isSuspended && (
          <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Attention : Le Directeur Général fait l'objet d'une mesure de suspension.</p>
                <p className="mt-1 text-amber-800 dark:text-amber-300">
                  Motif enregistré : <em>« {dgConfig?.suspensionReason || currentDg?.suspensionReason || 'Procédure administrative'} »</em>
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                  Ses privilèges d'accès aux modules décisionnels sont momentanément verrouillés jusqu'à réactivation formelle par l'Administrateur Système.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grille : Prérogatives DG (Toggles) + Historique de Gouvernance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Colonne 1 : Contrôle des Prérogatives DG */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Prérogatives Fonctionnelles du DG
                </h3>
                <p className="text-[11px] text-slate-400">
                  Activez ou limitez les modules accessibles au Directeur Général.
                </p>
              </div>
            </div>

            {confirmResetFeatures ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleResetFeatures}
                  className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetFeatures(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetFeatures(true)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shrink-0"
              >
                <RotateCcw className="h-3 w-3" />
                Défaut
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-1.5">
            {(Object.entries(DG_FEATURE_DEFINITIONS) as [DgFeatureKey, (typeof DG_FEATURE_DEFINITIONS)[DgFeatureKey]][]).map(
              ([key, def]) => {
                const isEnabled = features ? features[key] : true;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-2.5 transition hover:bg-white dark:hover:bg-slate-900 rounded-lg"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{def.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {def.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(key)}
                      className="shrink-0 text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                    >
                      {isEnabled ? (
                        <ToggleRight className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Colonne 2 : Historique des Actions de Gouvernance */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Journal de Gouvernance DG
              </h3>
              <p className="text-[11px] text-slate-400">
                Traçabilité immuable des nominations, suspensions et révocations.
              </p>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1">
            {history.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Aucune action de gouvernance enregistrée pour le moment.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={item.targetName} size="xs" />
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-bold uppercase text-[10px] ${
                          item.action === 'nomination'
                            ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                            : item.action === 'suspension'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : item.action === 'reactivation'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : item.action === 'remplacement'
                            ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300'
                            : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                        }`}
                      >
                        {item.action}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.targetName}
                      </span>
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-400">
                      {new Date(item.timestamp).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {item.reason && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 border border-slate-100 dark:border-slate-800">
                      Motif : {item.reason}
                    </p>
                  )}

                  <p className="text-[10px] text-slate-400">
                    Auteur : <strong className="text-slate-600 dark:text-slate-300">{item.actorName}</strong> ({item.actorRole})
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* MODALE : SUSPENSION */}
      {activeModal === 'suspend' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <PauseCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Suspendre le Directeur Général
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              La suspension désactive temporairement l'accès de <strong>{currentDg?.displayName}</strong> aux fonctionnalités décisionnelles.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motif réglementaire de la suspension *
              </label>
              <textarea
                rows={3}
                required
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Ex: Enquête d'audit interne, contrôle de conformité caisse..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSuspend}
                disabled={submitting || !reasonInput.trim()}
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? 'Suspension...' : 'Confirmer la suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE : RÉACTIVATION */}
      {activeModal === 'reactivate' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <PlayCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Réactiver le Directeur Général
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Confirmez-vous la levée de la mesure de suspension pour{' '}
              <strong>{currentDg?.displayName}</strong> ? Ses accès complets seront immédiatement rétablis.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReactivate}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Réactivation...' : 'Confirmer la réactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE : RÉVOCATION */}
      {activeModal === 'revoke' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Révocation du Mandat DG
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Cette action met définitivement fin au mandat de{' '}
              <strong>{currentDg?.displayName}</strong> et déclare le poste vacant.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motif de la révocation *
              </label>
              <textarea
                rows={3}
                required
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Ex: Fin de mandat, décision du Conseil d'Administration..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={submitting || !reasonInput.trim()}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Révocation...' : 'Confirmer la révocation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE : NOMINATION / REMPLACEMENT */}
      {activeModal === 'replace' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {currentDg ? 'Remplacement du Directeur Général' : 'Nomination du Directeur Général'}
                </h3>
                {currentDg && (
                  <p className="text-[11px] text-slate-400">
                    L'actuel DG ({currentDg.displayName}) verra son mandat clôturé automatiquement.
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleReplaceOrAppoint} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nom complet du Directeur Général *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Jean-Paul AMANI"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Adresse email professionnelle *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="dg@ets-amani.com"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Téléphone mobile officiel
                </label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+243 970 000 001"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 tabular-nums text-slate-900 dark:text-white outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mot de passe de première connexion *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 caractères"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 pl-2.5 pr-10 text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Enregistrement...' : 'Confirmer la nomination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
