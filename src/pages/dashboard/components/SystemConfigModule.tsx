import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Info,
  Layers,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db as firestoreDb } from '../../../lib/firebase';
import {
  DG_FEATURE_DEFINITIONS,
  DEFAULT_DG_FEATURES,
  type DgFeatureKey,
  type DgFeatures,
} from '../../../types/management';
import {
  getDgFeatures,
  resetDgFeatures,
  toggleDgFeature,
} from '../../../services/DgFeatureService';
import { recordAuditLog } from '../../../services/AuditService';

interface SystemConfigModuleProps {
  onClose?: () => void;
}

const GLOBAL_CONFIG_STORAGE_KEY = 'ets_amani_global_system_config';

export default function SystemConfigModule({ onClose }: SystemConfigModuleProps) {
  const [features, setFeatures] = useState<DgFeatures>(DEFAULT_DG_FEATURES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'features' | 'limits' | 'branding'>('features');
  const [confirmReset, setConfirmReset] = useState(false);

  const [maxOfflineDays, setMaxOfflineDays] = useState(30);
  const [autoSyncIntervalSec, setAutoSyncIntervalSec] = useState(15);
  const [appBrandName, setAppBrandName] = useState('Ets AMANI');
  const [supportPhone, setSupportPhone] = useState('');

  useEffect(() => {
    let isMounted = true;
    try {
      const cached = localStorage.getItem(GLOBAL_CONFIG_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed.maxOfflineDays === 'number') setMaxOfflineDays(parsed.maxOfflineDays);
        if (typeof parsed.autoSyncIntervalSec === 'number') setAutoSyncIntervalSec(parsed.autoSyncIntervalSec);
        if (typeof parsed.appBrandName === 'string') setAppBrandName(parsed.appBrandName);
        if (typeof parsed.supportPhone === 'string') setSupportPhone(parsed.supportPhone);
      }
    } catch {
      // ignore
    }

    getDoc(doc(firestoreDb, 'systemControls', 'globalConfig'))
      .then((snap) => {
        if (isMounted && snap.exists()) {
          const data = snap.data();
          if (typeof data.maxOfflineDays === 'number') setMaxOfflineDays(data.maxOfflineDays);
          if (typeof data.autoSyncIntervalSec === 'number') setAutoSyncIntervalSec(data.autoSyncIntervalSec);
          if (typeof data.appBrandName === 'string') setAppBrandName(data.appBrandName);
          if (typeof data.supportPhone === 'string') setSupportPhone(data.supportPhone);
        }
      })
      .catch(() => {});

    getDgFeatures()
      .then((loaded) => {
        if (isMounted) {
          setFeatures(loaded);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Erreur chargement des features DG:', err);
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const persistGlobalConfig = async (label: string) => {
    const payload = {
      maxOfflineDays,
      autoSyncIntervalSec,
      appBrandName: appBrandName.trim() || 'Ets AMANI',
      supportPhone: supportPhone.trim(),
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(GLOBAL_CONFIG_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    try {
      await setDoc(doc(firestoreDb, 'systemControls', 'globalConfig'), payload, { merge: true });
    } catch {
      // ignore offline
    }
    await recordAuditLog({
      action: `Mise à jour configuration globale (${label})`,
      category: 'config',
      severity: 'info',
      details: `Rétention: ${maxOfflineDays}j, Sync: ${autoSyncIntervalSec}s, Marque: ${payload.appBrandName}.`,
      actorName: 'Administrateur Système',
      actorRole: 'administrateur_systeme',
    });
    setSavedFeedback(`${label} sauvegardés avec succès.`);
    setTimeout(() => setSavedFeedback(null), 3000);
  };

  const handleToggle = async (key: DgFeatureKey) => {
    try {
      const next = await toggleDgFeature(key);
      setFeatures(next);
      setSavedFeedback(`Option « ${DG_FEATURE_DEFINITIONS[key].label} » modifiée.`);
      setTimeout(() => setSavedFeedback(null), 3000);
      await recordAuditLog({
        action: `Bascule configuration système (${key})`,
        category: 'config',
        severity: 'info',
        details: `L option ${key} est désormais fixée à ${next[key]}.`,
        actorName: 'Administrateur Système',
        actorRole: 'administrateur_systeme',
      });
    } catch (err) {
      setErrorMessage('Erreur lors de la mise à jour de la configuration.');
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setConfirmReset(false);
    try {
      const reset = await resetDgFeatures();
      setFeatures(reset);
      setSavedFeedback('Options réinitialisées aux valeurs par défaut.');
      setTimeout(() => setSavedFeedback(null), 3000);
      await recordAuditLog({
        action: 'Réinitialisation des options DG',
        category: 'config',
        severity: 'warning',
        details: 'Toutes les fonctionnalités optionnelles du Directeur Général ont été remises à l état par défaut.',
        actorName: 'Administrateur Système',
        actorRole: 'administrateur_systeme',
      });
    } catch {
      setErrorMessage('Impossible de réinitialiser les options.');
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = Object.values(features).filter(Boolean).length;
  const totalCount = Object.keys(DG_FEATURE_DEFINITIONS).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-800 text-white">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Configuration Globale & Modules DG</h1>
                <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-800 dark:text-blue-300">
                  {enabledCount}/{totalCount} activés
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Pilotage des modules opérationnels du Directeur Général, paramètres de synchronisation et marque.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving || loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Réinitialiser
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {savedFeedback && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p>{savedFeedback}</p>
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900/60">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="mt-4 flex overflow-x-auto scrollbar-none border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className={`whitespace-nowrap shrink-0 border-b-2 px-3.5 py-2.5 transition ${
              activeTab === 'features'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Modules & Menus du DG
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('limits')}
            className={`whitespace-nowrap shrink-0 border-b-2 px-3.5 py-2.5 transition ${
              activeTab === 'limits'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Seuils & Offline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`whitespace-nowrap shrink-0 border-b-2 px-3.5 py-2.5 transition ${
              activeTab === 'branding'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Identité & Support
          </button>
        </div>
      </div>

      {activeTab === 'features' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.entries(DG_FEATURE_DEFINITIONS) as [DgFeatureKey, typeof DG_FEATURE_DEFINITIONS[DgFeatureKey]][]).map(
            ([key, def]) => {
              const isEnabled = features[key];
              return (
                <div
                  key={key}
                  className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                    isEnabled
                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
                      : 'border-slate-200/70 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/50 opacity-80'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {def.module}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggle(key)}
                        className={`transition ${
                          isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'
                        }`}
                        title={isEnabled ? 'Désactiver' : 'Activer'}
                      >
                        {isEnabled ? (
                          <ToggleRight className="h-7 w-7" />
                        ) : (
                          <ToggleLeft className="h-7 w-7" />
                        )}
                      </button>
                    </div>
                    <h3 className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">{def.label}</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{def.description}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5 text-[11px] text-slate-400">
                    <span className="font-mono">Clé : {key}</span>
                    <span className={isEnabled ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                      {isEnabled ? 'Actif dans l interface DG' : 'Masqué'}
                    </span>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      {activeTab === 'limits' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Paramètres de fonctionnement Offline-First</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Comportement du cache local et de la file d attente</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Période de rétention locale (jours)
              </label>
              <input
                type="number"
                min="7"
                max="90"
                value={maxOfflineDays}
                onChange={(e) => setMaxOfflineDays(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm tabular-nums text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Durée pendant laquelle les opérations locales archivées restent stockées dans la mémoire locale sécurisée.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Fréquence du service de synchronisation (secondes)
              </label>
              <input
                type="number"
                min="5"
                max="120"
                value={autoSyncIntervalSec}
                onChange={(e) => setAutoSyncIntervalSec(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm tabular-nums text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Intervalle régulier d examen de la file d attente vers le serveur central lorsque la connexion réseau est disponible.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => void persistGlobalConfig('Paramètres offline')}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
            >
              <Save className="h-3.5 w-3.5" />
              Enregistrer les seuils
            </button>
          </div>
        </div>
      )}

      {activeTab === 'branding' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Identité institutionnelle & Support</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Personnalisation des coordonnées de l entreprise</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">Raison Sociale</label>
              <input
                type="text"
                value={appBrandName}
                onChange={(e) => setAppBrandName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">Ligne d'assistance / Téléphone d'urgence</label>
              <input
                type="text"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                placeholder="Ex. +243..."
                className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm tabular-nums text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => void persistGlobalConfig('Informations institutionnelles')}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
            >
              <Save className="h-3.5 w-3.5" />
              Enregistrer l'identité
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
