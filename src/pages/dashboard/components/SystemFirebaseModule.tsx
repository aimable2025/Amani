import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  Info,
  Key,
  Layers,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';
import {
  db as firestoreDb,
  firebaseConfig,
  isFirebaseConfigured,
} from '../../../lib/firebase';
import { recordAuditLog } from '../../../services/AuditService';

interface SystemFirebaseModuleProps {
  onClose?: () => void;
}

interface CollectionCheck {
  name: string;
  count: number;
  status: 'ok' | 'empty' | 'error';
  sampleId?: string;
}

export default function SystemFirebaseModule({ onClose }: SystemFirebaseModuleProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionCheck[]>([]);

  const trackedCollections = [
    'users',
    'agencies',
    'billetages',
    'operations',
    'internalNumbers',
    'smsOperations',
    'auditLogs',
    'system',
  ];

  const checkCollections = async () => {
    setTesting(true);
    setTestResult(null);
    const results: CollectionCheck[] = [];

    for (const colName of trackedCollections) {
      try {
        const q = query(collection(firestoreDb, colName), limit(5));
        const snap = await getDocs(q);
        results.push({
          name: colName,
          count: snap.size,
          status: snap.empty ? 'empty' : 'ok',
          sampleId: snap.docs[0]?.id,
        });
      } catch (err: any) {
        results.push({
          name: colName,
          count: 0,
          status: 'error',
        });
      }
    }

    setCollections(results);
    setTesting(false);
    setTestResult('Contrôle de connectivité du registre central terminé.');
  };

  useEffect(() => {
    checkCollections();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Infrastructure & Registre Central</h1>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  isFirebaseConfigured
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                }`}>
                  {isFirebaseConfigured ? 'Serveur Connecté' : 'Non Connecté'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Supervision des droits d'accès, permissions de lecture/écriture et intégrité des données centrales.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={checkCollections}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
              Tester l'accès
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

        {testResult && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-xs text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p>{testResult}</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Project ID</p>
            <p className="mt-1 font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
              {firebaseConfig.projectId || 'Non défini'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Identifiant GCP du projet</p>
          </div>

          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Auth Domain</p>
            <p className="mt-1 font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
              {firebaseConfig.authDomain || 'Non défini'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Domaine OAuth et vérification</p>
          </div>

          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Stockage & Règles</p>
            <p className="mt-1 font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
              {firebaseConfig.storageBucket || 'Défaut'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Bucket Cloud Storage</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">État des registres de données centraux</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Validation de l'intégrité et disponibilité des registres</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((col) => (
            <div
              key={col.name}
              className={`rounded-lg border p-3.5 transition ${
                col.status === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : col.status === 'empty'
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
                  : 'border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">/{col.name}</span>
                {col.status === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : col.status === 'empty' ? (
                  <Info className="h-4 w-4 text-slate-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                )}
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-slate-600 dark:text-slate-300">
                {col.status === 'ok'
                  ? `Documents accessibles (${col.count}+)`
                  : col.status === 'empty'
                  ? 'Collection vide ou en attente d initialisation'
                  : 'Erreur d accès ou règles restrictives'}
              </p>
              {col.sampleId && (
                <p className="mt-1 font-mono text-[10px] text-slate-400 truncate">
                  Réf: {col.sampleId.slice(0, 10)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Contrôle d'Accès & Sécurité des Données</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Règles de conformité et contrôle d'accès selon les fonctions autorisées</p>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <Key className="mt-0.5 h-4 w-4 text-slate-700 dark:text-slate-300 shrink-0" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Contrôle d'accès par habilitations actif</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Les agents ne peuvent lire que les données relatives à leur agence ou aux opérations qui leur sont explicitement affectées. Le Directeur Général et l'Administrateur Système disposent d'un droit de supervision global.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
