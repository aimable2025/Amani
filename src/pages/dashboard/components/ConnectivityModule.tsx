import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  collection,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';
import { db as dexieDb } from '../../../lib/db';
import { db as firestoreDb } from '../../../lib/firebase';
import { recordAuditLog } from '../../../services/AuditService';
import { triggerSyncNow } from '../../../services/SyncWorker';
import { syncInternalNumbers } from '../../../services/InternalNumberSyncService';
import { processSmsSyncQueue } from '../../../services/SmsOperationService';

interface LocalDbStats {
  billetagesTotal: number;
  billetagesPending: number;
  operationsTotal: number;
  operationsPending: number;
  internalNumbersCount: number;
  smsOperationsCount: number;
  syncQueuePending: number;
  syncQueueFailed: number;
  smsSyncQueuePending: number;
  smsSyncQueueFailed: number;
}

interface ConnectivityModuleProps {
  onClose?: () => void;
}

export default function ConnectivityModule({ onClose }: ConnectivityModuleProps) {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isTestingLatency, setIsTestingLatency] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncQueueItems, setSyncQueueItems] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<LocalDbStats>({
    billetagesTotal: 0,
    billetagesPending: 0,
    operationsTotal: 0,
    operationsPending: 0,
    internalNumbersCount: 0,
    smsOperationsCount: 0,
    syncQueuePending: 0,
    syncQueueFailed: 0,
    smsSyncQueuePending: 0,
    smsSyncQueueFailed: 0,
  });

  const loadStats = useCallback(async () => {
    try {
      const [
        billetagesTotal,
        billetagesPending,
        operationsTotal,
        operationsPending,
        internalNumbersCount,
        smsOperationsCount,
        syncQueueItemsList,
        smsSyncQueuePending,
        smsSyncQueueFailed,
      ] = await Promise.all([
        dexieDb.billetages.count(),
        dexieDb.billetages.where('syncStatus').anyOf('local', 'pending').count().catch(() => 0),
        dexieDb.operations.count().catch(() => 0),
        dexieDb.operations.where('syncStatus').anyOf('pending', 'error').count().catch(() => 0),
        dexieDb.internalNumbers.count().catch(() => 0),
        dexieDb.smsOperations.count().catch(() => 0),
        dexieDb.syncQueue.toArray().catch(() => []),
        dexieDb.smsSyncQueue.where('status').equals('pending').count().catch(() => 0),
        dexieDb.smsSyncQueue.where('status').equals('failed').count().catch(() => 0),
      ]);

      const syncQueuePending = syncQueueItemsList.filter((item) => item.status === 'pending' || item.status === 'processing').length;
      const syncQueueFailed = syncQueueItemsList.filter((item) => item.status === 'failed').length;

      setDbStats({
        billetagesTotal,
        billetagesPending,
        operationsTotal,
        operationsPending,
        internalNumbersCount,
        smsOperationsCount,
        syncQueuePending,
        syncQueueFailed,
        smsSyncQueuePending,
        smsSyncQueueFailed,
      });
      setSyncQueueItems(syncQueueItemsList.slice(-20).reverse());
    } catch (err) {
      console.warn('Erreur lecture statistiques Dexie locales:', err);
    }
  }, []);

  const testLatency = useCallback(async () => {
    if (!navigator.onLine) {
      setLatencyMs(null);
      return;
    }
    setIsTestingLatency(true);
    const start = performance.now();
    try {
      const testQuery = query(collection(firestoreDb, 'agencies'), limit(1));
      await getDocs(testQuery);
      const diff = Math.round(performance.now() - start);
      setLatencyMs(diff);
    } catch {
      try {
        await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
        const diff = Math.round(performance.now() - start);
        setLatencyMs(diff);
      } catch {
        setLatencyMs(null);
      }
    } finally {
      setIsTestingLatency(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      testLatency();
      loadStats();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setLatencyMs(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    loadStats();
    testLatency();

    const interval = setInterval(() => {
      loadStats();
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [loadStats, testLatency]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const failedItems = await dexieDb.syncQueue.where('status').equals('failed').toArray().catch(() => []);
      for (const item of failedItems) {
        if (item.id) {
          await dexieDb.syncQueue.update(item.id, {
            status: 'pending',
            attempts: 0,
            lastError: null,
          });
        }
      }
      const syncResult = await triggerSyncNow();
      const smsResult = await processSmsSyncQueue().catch(() => ({ processed: 0, failed: 0 }));
      await syncInternalNumbers().catch(() => {});
      await loadStats();
      await testLatency();
      const totalProcessed = syncResult.processed + smsResult.processed;
      const totalErrors = syncResult.errors + smsResult.failed;
      await recordAuditLog({
        action: 'Déclenchement manuel de la synchronisation',
        category: 'sync',
        severity: 'info',
        details: `Traitement des files d'attente Offline-First (${totalProcessed} synchronisés, ${totalErrors} erreurs).`,
        actorName: 'Administrateur Système',
        actorRole: 'administrateur_systeme',
      });
      setSyncFeedback(
        `Synchronisation terminée (${totalProcessed} élément(s) synchronisé(s), ${totalErrors} erreur(s)).`
      );
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err) {
      console.error('Erreur déclenchement sync:', err);
      setSyncFeedback('Erreur lors du déclenchement de la synchronisation.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurgeCompleted = async () => {
    try {
      await dexieDb.syncQueue.where('status').equals('completed').delete();
      await dexieDb.smsSyncQueue.where('status').equals('completed').delete();
      await loadStats();
      setSyncFeedback('Éléments terminés purgés de la mémoire locale.');
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err) {
      console.warn('Erreur purge:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isOnline ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}`}>
              {isOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Disponibilité & Synchronisation</h1>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  isOnline
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                }`}>
                  {isOnline ? 'Connecté au serveur central' : 'Mode autonome hors-ligne'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Superviser le stockage local autonome et la transmission vers le serveur central.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Synchroniser
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

        {syncFeedback && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-2.5 text-xs text-slate-700 dark:text-slate-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p>{syncFeedback}</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">État Réseau</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <p className="text-base font-bold text-slate-900 dark:text-white">
                {isOnline ? 'Connectivité normale' : 'Connexion coupée'}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isOnline ? 'Liaison avec le serveur central opérationnelle.' : 'Enregistrement local autonome sécurisé.'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Latence Serveur</p>
              <button
                type="button"
                onClick={testLatency}
                disabled={isTestingLatency || !isOnline}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                {isTestingLatency ? 'Test en cours...' : 'Tester'}
              </button>
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {latencyMs !== null ? `${latencyMs} ms` : isOnline ? '—' : 'N/A'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Temps de réponse avec le serveur central.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">File de synchronisation</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {dbStats.syncQueuePending + dbStats.smsSyncQueuePending} en attente
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {dbStats.syncQueueFailed + dbStats.smsSyncQueueFailed} élément(s) en échec
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Espaces de stockage locaux</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Volumétrie des tables locales sur l'appareil</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadStats}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Rafraîchir
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Billetages caisse</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{dbStats.billetagesTotal}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-amber-600 dark:text-amber-400">{dbStats.billetagesPending} à synchroniser</p>
          </div>
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Opérations agence</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{dbStats.operationsTotal}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-amber-600 dark:text-amber-400">{dbStats.operationsPending} à synchroniser</p>
          </div>
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Numéros internes</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{dbStats.internalNumbersCount}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">En cache local</p>
          </div>
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Opérations SMS</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{dbStats.smsOperationsCount}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Capturées sur flotte</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Éléments récents dans la file</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">File d'attente Offline-First vers le serveur central</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePurgeCompleted}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Trash2 className="h-3.5 w-3.5 text-slate-400" />
            Purger les terminés
          </button>
        </div>

        {syncQueueItems.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Toutes les données sont synchronisées</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">La file d'attente locale est actuellement vide.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {syncQueueItems.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${
                    item.status === 'completed'
                      ? 'bg-emerald-500'
                      : item.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                  }`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                      Entité : {item.entity} — ID : <span className="font-mono">{item.entityId}</span>
                    </p>
                    <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      Action : {item.operation} | Tentatives : {item.attempts || 0}
                      {item.lastError && <span className="ml-2 text-red-600 dark:text-red-400">({item.lastError})</span>}
                    </p>
                  </div>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold shrink-0 ${
                  item.status === 'completed'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : item.status === 'failed'
                    ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
