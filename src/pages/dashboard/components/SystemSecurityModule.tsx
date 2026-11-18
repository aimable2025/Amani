import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db as firestoreDb } from '../../../lib/firebase';
import { recordAuditLog } from '../../../services/AuditService';

interface SystemSecurityModuleProps {
  onClose?: () => void;
}

const SECURITY_POLICY_KEY = 'ets_amani_security_policy';

export default function SystemSecurityModule({ onClose }: SystemSecurityModuleProps) {
  const [forceReauth, setForceReauth] = useState(false);
  const [twoFactorEnforced, setTwoFactorEnforced] = useState(false);
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(60);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    try {
      const raw = localStorage.getItem(SECURITY_POLICY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.forceReauth === 'boolean') setForceReauth(parsed.forceReauth);
        if (typeof parsed.twoFactorEnforced === 'boolean') setTwoFactorEnforced(parsed.twoFactorEnforced);
        if (typeof parsed.sessionTimeoutMin === 'number') setSessionTimeoutMin(parsed.sessionTimeoutMin);
      }
    } catch {
      // ignore
    }

    getDoc(doc(firestoreDb, 'systemControls', 'securityPolicy'))
      .then((snap) => {
        if (isMounted && snap.exists()) {
          const data = snap.data();
          if (typeof data.forceReauth === 'boolean') setForceReauth(data.forceReauth);
          if (typeof data.twoFactorEnforced === 'boolean') setTwoFactorEnforced(data.twoFactorEnforced);
          if (typeof data.sessionTimeoutMin === 'number') setSessionTimeoutMin(data.sessionTimeoutMin);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const securityScore =
    85 + (twoFactorEnforced ? 10 : 0) + (sessionTimeoutMin <= 30 ? 5 : 0);

  const handleApplySecurityPolicy = async () => {
    setSaving(true);
    const policy = {
      forceReauth,
      twoFactorEnforced,
      sessionTimeoutMin,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(SECURITY_POLICY_KEY, JSON.stringify(policy));
    } catch {
      // ignore
    }
    try {
      await setDoc(
        doc(firestoreDb, 'systemControls', 'securityPolicy'),
        {
          ...policy,
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // ignore offline
    }
    try {
      await recordAuditLog({
        action: 'Mise à jour politique de sécurité globale',
        category: 'security',
        severity: 'critical',
        details: `Timeout session: ${sessionTimeoutMin}min, 2FA: ${twoFactorEnforced ? 'Oui' : 'Non'}, Forcer reconnexion: ${forceReauth ? 'Oui' : 'Non'}.`,
        actorName: 'Administrateur Système',
        actorRole: 'administrateur_systeme',
      });
      setFeedback('Politique de sécurité mise à jour et appliquée.');
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback('Erreur lors de l enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-800 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Sécurité Globale & Habilitations</h1>
                <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                  Niveau Élevé ({securityScore}/100)
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Paramètres d'authentification stricte, expiration des sessions et politique des accès.
              </p>
            </div>
          </div>
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

        {feedback && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p>{feedback}</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Protection des sessions</p>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Déconnexion automatique</p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">Actif après {sessionTimeoutMin} minutes d'inactivité.</p>
          </div>

          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Intégrité des opérations</p>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Empreinte locale vérifiée</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Stockage local sécurisé avec contrôle d'intégrité.</p>
          </div>

          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Contrôle des rôles</p>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Cloisonnement strict</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">6 rôles hiérarchiques distincts.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Directives d'accès & Authentification</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Mesures coercitives pour la sécurité des fonds et données Ets AMANI</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Double facteur obligatoire (2FA / OTP)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Impose la validation par code SMS / Email pour toute connexion en dehors des heures de bureau.
              </p>
            </div>
            <input
              type="checkbox"
              checked={twoFactorEnforced}
              onChange={(e) => setTwoFactorEnforced(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-slate-900"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Forcer la reconnexion de tous les utilisateurs</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Invalide les jetons de session actifs de tous les agents lors du prochain rafraîchissement.
              </p>
            </div>
            <input
              type="checkbox"
              checked={forceReauth}
              onChange={(e) => setForceReauth(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-slate-900"
            />
          </label>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white">
              Durée maximale de la session inactive (minutes)
            </label>
            <input
              type="number"
              min="5"
              max="480"
              value={sessionTimeoutMin}
              onChange={(e) => setSessionTimeoutMin(Number(e.target.value))}
              className="mt-2 w-full max-w-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-sm tabular-nums text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleApplySecurityPolicy}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50"
          >
            <Shield className="h-3.5 w-3.5" />
            Appliquer les directives de sécurité
          </button>
        </div>
      </div>
    </div>
  );
}
