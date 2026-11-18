import {
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Coins,
  Copy,
  Download,
  Eye,
  FileImage,
  FileText,
  Filter,
  History,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import type {
  BilletageCurrency,
  BilletageLine,
  BilletageRecord,
} from '../../../types/billetage';
import {
  calculateBilletage,
  createBilletage,
  getAllBilletages,
  validateBilletage,
} from '../../../services/BilletageService';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import { getAllSystemUsers, type ManagedUser } from '../../../services/SystemUserService';
import { verifyBiometricIdentity } from '../../../services/BiometricAuthService';

interface BilletageModuleProps {
  onClose?: () => void;
}

interface DenominationRow {
  id: string;
  value: number;
  quantity: number | null;
}

type AdjustmentMode = 'add' | 'remove';

interface AdjustmentState {
  mode: AdjustmentMode;
  rowId: string;
  denomination: number;
  quantity: string;
}

type GapStatusCode =
  | 'EQUILIBRE'
  | 'MANQUANT'
  | 'EXCEDENT';

interface GapStatus {
  status: GapStatusCode;
  label: string;
  amount: number;
}

interface GapHistoryEntry {
  id: string;
  montantAttendu: number;
  montantCompte: number;
  ecart: number;
  statut: GapStatusCode;
  devise: BilletageCurrency;
  auteur: string;
  date: string;
}

const USD_DENOMINATIONS: readonly number[] = [
  100,
  50,
  20,
  10,
  5,
  1,
];

const CDF_STORAGE_KEY = 'ets-amani-billetage-cdf-denominations';
const DEFAULT_CDF_DENOMINATIONS: number[] = [
  20000,
  10000,
  5000,
  1000,
  500,
  200,
  100,
  50,
];

const ADJUSTMENT_STORAGE_KEY = 'ets-amani-billetage-quick-adjustment';
const GAP_HISTORY_STORAGE_KEY = 'ets-amani-billetage-gap-history';
const ETS_AMANI_LOGO_SRC = '/logo.png';

function generateLocalId(value: number): string {
  return `denomination_${value}`;
}

function readCdfDenominations(): number[] {
  if (typeof window === 'undefined') {
    return [...DEFAULT_CDF_DENOMINATIONS];
  }
  try {
    const raw = window.localStorage.getItem(CDF_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_CDF_DENOMINATIONS];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_CDF_DENOMINATIONS];
    }
    const values = parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0 && value !== 2000);
    const uniqueValues = Array.from(new Set(values)).sort((a, b) => b - a);
    return uniqueValues.length > 0 ? uniqueValues : [...DEFAULT_CDF_DENOMINATIONS];
  } catch {
    return [...DEFAULT_CDF_DENOMINATIONS];
  }
}

function readAdjustmentSetting(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    const value = window.localStorage.getItem(ADJUSTMENT_STORAGE_KEY);
    if (value === null) {
      return true;
    }
    return value === 'true';
  } catch {
    return true;
  }
}

function readGapHistory(): GapHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(GAP_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function formatMoney(amount: number, _currency: BilletageCurrency): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function createRows(values: readonly number[]): DenominationRow[] {
  return values.map((value) => ({
    id: generateLocalId(value),
    value,
    quantity: null,
  }));
}

function copyText(text: string): Promise<void> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        resolve();
      } else {
        reject(new Error('Copie impossible.'));
      }
    } catch (copyError) {
      reject(copyError);
    }
  });
}

function getAuthorLabel(user: unknown): string {
  const candidate = user as {
    displayName?: unknown;
    name?: unknown;
    email?: unknown;
    uid?: unknown;
  };
  if (typeof candidate.displayName === 'string' && candidate.displayName.trim()) {
    return candidate.displayName.trim();
  }
  if (typeof candidate.email === 'string' && candidate.email.trim()) {
    return candidate.email.trim();
  }
  return 'Utilisateur';
}

function formatDateTime(date: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(date));
  } catch {
    return date;
  }
}

export default function BilletageModule({ onClose }: BilletageModuleProps) {
  const { user, hasPermission } = useAuth();
  const [currency, setCurrency] = useState<BilletageCurrency>('USD');
  const [cdfDenominations, setCdfDenominations] = useState<number[]>(readCdfDenominations);
  const [usdRows, setUsdRows] = useState<DenominationRow[]>(() =>
    createRows(USD_DENOMINATIONS)
  );
  const [cdfRows, setCdfRows] = useState<DenominationRow[]>(() =>
    createRows(readCdfDenominations())
  );
  const [expectedAmount, setExpectedAmount] = useState<string>('');
  const [showCdfSettings, setShowCdfSettings] = useState(false);
  const [cdfInput, setCdfInput] = useState<string>('');
  const [showBusiness, setShowBusiness] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [adjustmentEnabled, setAdjustmentEnabled] = useState<boolean>(readAdjustmentSetting);
  const [adjustment, setAdjustment] = useState<AdjustmentState | null>(null);
  const [showAdjustmentSettings, setShowAdjustmentSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [gapHistory, setGapHistory] = useState<GapHistoryEntry[]>(readGapHistory);
  const [showExportOptions, setShowExportOptions] = useState(false);

  // Supervision mode state
  const [activeModuleMode, setActiveModuleMode] = useState<'calculator' | 'supervision'>('calculator');
  const [recordedBilletages, setRecordedBilletages] = useState<BilletageRecord[]>([]);
  const [agenciesList, setAgenciesList] = useState<Agency[]>([]);
  const [systemUsersList, setSystemUsersList] = useState<ManagedUser[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [filterCurrency, setFilterCurrency] = useState<'all' | 'USD' | 'CDF'>('all');
  const [filterAgency, setFilterAgency] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [detailBilletage, setDetailBilletage] = useState<BilletageRecord | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  const loadBilletageHistory = async () => {
    setLoadingHistory(true);
    try {
      const [records, ags, usrs] = await Promise.all([
        getAllBilletages(),
        getAgencies().catch(() => []),
        getAllSystemUsers().catch(() => []),
      ]);
      setRecordedBilletages(records);
      setAgenciesList(ags);
      setSystemUsersList(usrs);
    } catch (err) {
      console.warn('Erreur chargement historique billetages:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadBilletageHistory();
  }, []);

  const handleValidateBilletage = async (b: BilletageRecord) => {
    setValidatingId(b.id);
    try {
      const actor = user
        ? { uid: user.uid, name: user.displayName, role: user.role }
        : undefined;
      await validateBilletage(b.id, actor);
      setMessage(`Billetage ${b.reference || b.id} validé avec succès.`);
      await loadBilletageHistory();
      setTimeout(() => setMessage(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur validation billetage.');
      setTimeout(() => setError(null), 3500);
    } finally {
      setValidatingId(null);
    }
  };

  const filteredBilletages = useMemo(() => {
    return recordedBilletages.filter((b) => {
      if (filterCurrency !== 'all' && b.currency !== filterCurrency) return false;
      if (filterAgency !== 'all' && b.agencyId !== filterAgency) return false;
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      const agentName = systemUsersList.find((u) => u.uid === b.userId)?.displayName || '';
      const agencyName = agenciesList.find((a) => a.id === b.agencyId)?.name || '';
      return (
        (b.reference || '').toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        agentName.toLowerCase().includes(q) ||
        agencyName.toLowerCase().includes(q)
      );
    });
  }, [recordedBilletages, filterCurrency, filterAgency, filterStatus, historySearch, systemUsersList, agenciesList]);

  const kpis = useMemo(() => {
    let totalUsd = 0;
    let totalCdf = 0;
    let validatedCount = 0;
    let pendingCount = 0;
    let discrepancyCount = 0;
    for (const b of recordedBilletages) {
      if (b.currency === 'USD') totalUsd += b.calculatedTotal;
      if (b.currency === 'CDF') totalCdf += b.calculatedTotal;
      if (b.status === 'validated') validatedCount++;
      else pendingCount++;
      if (b.discrepancy && b.discrepancy !== 0) discrepancyCount++;
    }
    return { totalUsd, totalCdf, validatedCount, pendingCount, discrepancyCount };
  }, [recordedBilletages]);

  const activeRows = currency === 'USD' ? usdRows : cdfRows;

  const lines: BilletageLine[] = useMemo(() => {
    return activeRows.map((row) => ({
      denominationId: row.id,
      currency,
      denomination: row.value,
      quantity: row.quantity ?? 0,
      subtotal: row.value * (row.quantity ?? 0),
    }));
  }, [activeRows, currency]);

  const parsedExpectedAmount = useMemo(() => {
    if (!expectedAmount.trim()) {
      return null;
    }
    const normalized = expectedAmount.replace(',', '.');
    const value = Number(normalized);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }, [expectedAmount]);

  const calculation = useMemo(() => {
    try {
      return calculateBilletage(currency, lines, null);
    } catch {
      const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
      return {
        currency,
        total,
        declaredAmount: null,
        isCoherent: true,
      };
    }
  }, [currency, lines]);

  const totalCounted =
    Number(calculation.total) ||
    lines.reduce((sum, line) => sum + line.subtotal, 0);

  const gapStatus = useMemo(() => {
    if (parsedExpectedAmount === null) {
      return null;
    }
    const rawGap = totalCounted - parsedExpectedAmount;
    const gap =
      Math.abs(rawGap) < 0.005 ? 0 : Number(rawGap.toFixed(2));
    if (gap === 0) {
      return {
        status: 'EQUILIBRE' as GapStatusCode,
        label: 'ÉQUILIBRÉ',
        amount: 0,
      };
    }
    if (gap < 0) {
      return {
        status: 'MANQUANT' as GapStatusCode,
        label: `MANQUANT : ${formatMoney(Math.abs(gap), currency)}`,
        amount: Math.abs(gap),
      };
    }
    return {
      status: 'EXCEDENT' as GapStatusCode,
      label: `EXCÉDENT : ${formatMoney(gap, currency)}`,
      amount: gap,
    };
  }, [currency, parsedExpectedAmount, totalCounted]);

  const canAccessBilletage = Boolean(user);
  const canCreateBusinessBilletage =
    hasPermission('billetage.create') ||
    user?.role === 'administrateur_systeme' ||
    user?.role === 'directeur_general' ||
    user?.role === 'administrateur_agence' ||
    user?.role === 'agent';

  const updateRows = (
    updater: (rows: DenominationRow[]) => DenominationRow[]
  ) => {
    if (currency === 'USD') {
      setUsdRows(updater);
    } else {
      setCdfRows(updater);
    }
  };

  const updateQuantity = (rowId: string, rawValue: string) => {
    const cleaned = rawValue.replace(/[^\d]/g, '');
    const quantity =
      cleaned === '' ? null : Math.max(0, Number(cleaned));
    updateRows((rows) =>
      rows.map((row) =>
        row.id === rowId ? { ...row, quantity } : row
      )
    );
  };

  const openAdjustment = (mode: AdjustmentMode, row: DenominationRow) => {
    if (!adjustmentEnabled) return;
    setError(null);
    setMessage(null);
    setAdjustment({
      mode,
      rowId: row.id,
      denomination: row.value,
      quantity: '',
    });
  };

  const applyAdjustment = () => {
    if (!adjustment) return;
    const amount = Number(adjustment.quantity);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      setError('Veuillez saisir un nombre entier de billets supérieur à 0.');
      return;
    }
    const row = activeRows.find((item) => item.id === adjustment.rowId);
    if (!row) {
      setAdjustment(null);
      return;
    }
    const currentQuantity = row.quantity ?? 0;
    if (adjustment.mode === 'remove' && amount > currentQuantity) {
      setError(
        `Impossible : vous ne pouvez pas retirer ${amount} billets. Quantité disponible : ${currentQuantity}.`
      );
      return;
    }
    const newQuantity =
      adjustment.mode === 'add'
        ? currentQuantity + amount
        : currentQuantity - amount;

    updateQuantity(adjustment.rowId, String(newQuantity));
    setAdjustment(null);
    setError(null);
    setMessage(
      adjustment.mode === 'add'
        ? `${amount} billet(s) de ${formatMoney(adjustment.denomination, currency)} ajouté(s).`
        : `${amount} billet(s) de ${formatMoney(adjustment.denomination, currency)} retiré(s).`
    );
  };

  const resetBilletage = () => {
    if (currency === 'USD') {
      setUsdRows(createRows(USD_DENOMINATIONS));
    } else {
      setCdfRows(createRows(cdfDenominations));
    }
    setExpectedAmount('');
    setMessage(null);
    setError(null);
    setAdjustment(null);
  };

  const saveCdfConfiguration = () => {
    const values = cdfInput
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((value) => Number.isFinite(value) && value > 0 && value !== 2000);
    const uniqueValues = Array.from(new Set(values)).sort((a, b) => b - a);
    if (uniqueValues.length === 0) {
      setError('Veuillez saisir au moins une coupure CDF valide.');
      return;
    }
    try {
      window.localStorage.setItem(CDF_STORAGE_KEY, JSON.stringify(uniqueValues));
    } catch {
      // ignore
    }
    setCdfDenominations(uniqueValues);
    setCdfRows(createRows(uniqueValues));
    setCdfInput('');
    setShowCdfSettings(false);
    setError(null);
    setMessage('Configuration des coupures CDF mise à jour.');
  };

  const toggleAdjustment = () => {
    const nextValue = !adjustmentEnabled;
    setAdjustmentEnabled(nextValue);
    try {
      window.localStorage.setItem(ADJUSTMENT_STORAGE_KEY, String(nextValue));
    } catch {
      // ignore
    }
    if (!nextValue) {
      setAdjustment(null);
    }
    setMessage(
      nextValue
        ? 'Les boutons d ajustement rapide sont activés.'
        : 'Les boutons d ajustement rapide sont désactivés.'
    );
  };

  const saveGapHistory = () => {
    if (parsedExpectedAmount === null || !gapStatus || !user) {
      return;
    }
    const rawGap = totalCounted - parsedExpectedAmount;
    const entry: GapHistoryEntry = {
      id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      montantAttendu: parsedExpectedAmount,
      montantCompte: totalCounted,
      ecart: Number(rawGap.toFixed(2)),
      statut: gapStatus.status,
      devise: currency,
      auteur: getAuthorLabel(user),
      date: new Date().toISOString(),
    };
    const nextHistory = [entry, ...gapHistory].slice(0, 100);
    setGapHistory(nextHistory);
    try {
      window.localStorage.setItem(GAP_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
    } catch {
      // ignore
    }
  };

  const clearGapHistory = () => {
    setGapHistory([]);
    try {
      window.localStorage.removeItem(GAP_HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const saveBusinessBilletage = async () => {
    if (!user) {
      setError('Vous devez être connecté pour enregistrer un billetage professionnel.');
      return;
    }
    if (!canCreateBusinessBilletage) {
      setError('Vous ne disposez pas de la permission nécessaire pour enregistrer un billetage professionnel.');
      return;
    }
    if (parsedExpectedAmount === null) {
      setError('Veuillez saisir le montant attendu avant d enregistrer le billetage professionnel.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Couche de vérification biométrique anti-usurpation
      await verifyBiometricIdentity({
        user,
        actionTitle: 'Validation Billetage de Caisse',
        actionDescription: `Certification officielle du comptage physique (${formatMoney(totalCounted, currency)})`,
      });

      await createBilletage({
        type: 'business',
        userId: user.uid,
        agencyId: user.agencyId || 'agence-centrale',
        currency,
        lines,
        declaredAmount: parsedExpectedAmount,
      });
      saveGapHistory();
      setMessage(
        gapStatus
          ? `Billetage professionnel certifié par empreinte et enregistré. Contrôle : ${gapStatus.label}.`
          : 'Billetage professionnel certifié et enregistré.'
      );
    } catch (saveError: any) {
      console.error('Erreur enregistrement billetage :', saveError);
      setError(saveError?.message || 'Impossible d enregistrer le billetage professionnel.');
    } finally {
      setIsSaving(false);
    }
  };

  const buildBilletageText = () => {
    const linesText = lines
      .filter((line) => line.quantity > 0)
      .map(
        (line) =>
          `${formatMoney(line.denomination, currency)} × ${line.quantity} = ${formatMoney(line.subtotal, currency)}`
      )
      .join('\n');
    const parts = [
      'Ets AMANI — Billetage',
      `Type : ${showBusiness ? 'Professionnel' : 'Personnel'}`,
      `Devise : ${currency}`,
      '',
      linesText || 'Aucune coupure saisie.',
      '',
      `Total compté : ${formatMoney(totalCounted, currency)}`,
    ];
    if (showBusiness && parsedExpectedAmount !== null) {
      parts.push(`Montant attendu : ${formatMoney(parsedExpectedAmount, currency)}`);
      if (gapStatus) {
        parts.push(`Contrôle : ${gapStatus.label}`);
      }
    }
    return parts.join('\n');
  };

  const shareBilletage = async () => {
    const text = buildBilletageText();
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Billetage Ets AMANI', text });
        setMessage('Billetage partagé avec succès.');
        return;
      }
      await copyText(text);
      setMessage('Résumé du billetage copié dans le presse-papiers.');
    } catch {
      setError('Le partage n a pas pu être effectué.');
    }
  };

  const copyTotal = async () => {
    try {
      let text = `Total compté : ${formatMoney(totalCounted, currency)}`;
      if (showBusiness && parsedExpectedAmount !== null && gapStatus) {
        text += `\nMontant attendu : ${formatMoney(parsedExpectedAmount, currency)}`;
        text += `\n${gapStatus.label}`;
      }
      await copyText(text);
      setMessage('Résumé du total copié.');
    } catch {
      setError('Impossible de copier le total.');
    }
  };

  const exportAsPdf = () => {
    setShowExportOptions(false);
    window.print();
  };

  if (!canAccessBilletage) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            <Calculator className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Billetage</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Connectez-vous pour utiliser le billetage.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <Coins className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                Billetage & Caisse
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ets AMANI — Comptage et contrôle des liquidités USD / CDF
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {user && (
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs">
                <UserAvatar user={user} size="xs" />
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800 dark:text-slate-100">{user.displayName}</p>
                  <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">Agent émetteur</p>
                </div>
              </div>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                aria-label="Fermer le billetage"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Switcher Mode: Calculateur direct vs Supervision & Historique */}
        <div className="mt-4 flex overflow-x-auto scrollbar-none border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveModuleMode('calculator')}
            className={`flex items-center gap-2 whitespace-nowrap shrink-0 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
              activeModuleMode === 'calculator'
                ? 'border-slate-900 dark:border-emerald-500 text-slate-950 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Calculator className="h-4 w-4" />
            Calculateur & Saisie Directe
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveModuleMode('supervision');
              void loadBilletageHistory();
            }}
            className={`flex items-center gap-2 whitespace-nowrap shrink-0 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
              activeModuleMode === 'supervision'
                ? 'border-slate-900 dark:border-emerald-500 text-slate-950 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="h-4 w-4" />
            <span className="tabular-nums">Supervision & Historique des Billetages ({recordedBilletages.length})</span>
          </button>
        </div>

        {activeModuleMode === 'calculator' && (
          /* Tabs */
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => {
                setShowBusiness(false);
                setExpectedAmount('');
                setError(null);
                setMessage(null);
              }}
              className={`rounded-md px-3 py-2 text-xs sm:text-sm font-semibold transition ${
                !showBusiness
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Billetage personnel
            </button>
            <button
              type="button"
              onClick={() => {
                setShowBusiness(true);
                setError(null);
                setMessage(null);
              }}
              className={`rounded-md px-3 py-2 text-xs sm:text-sm font-semibold transition ${
                showBusiness
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Billetage professionnel
            </button>
          </div>
        )}
      </div>

      {activeModuleMode === 'calculator' && (
        <>
          {/* Toolbar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => {
                setCurrency('USD');
                setExpectedAmount('');
                setError(null);
                setMessage(null);
              }}
              className={`rounded-md px-3 py-1 text-xs sm:text-sm font-semibold ${
                currency === 'USD'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrency('CDF');
                setExpectedAmount('');
                setError(null);
                setMessage(null);
              }}
              className={`rounded-md px-3 py-1 text-xs sm:text-sm font-semibold ${
                currency === 'CDF'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              CDF
            </button>
          </div>
          <button
            type="button"
            onClick={resetBilletage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={copyTotal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Copy className="h-3.5 w-3.5" />
            Copier
          </button>
          <button
            type="button"
            onClick={shareBilletage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Share2 className="h-3.5 w-3.5" />
            Partager
          </button>
          <button
            type="button"
            onClick={exportAsPdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
          >
            <Download className="h-3.5 w-3.5" />
            Imprimer / PDF
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAdjustmentSettings((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Ajustement
            </button>
            {showBusiness && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <History className="h-3.5 w-3.5" />
                Historique
              </button>
            )}
          </div>
        </div>

        {showAdjustmentSettings && (
          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Boutons d'ajustement rapide
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  + ou - ouvre une saisie numérique pour ajouter ou retirer des billets.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAdjustment}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  adjustmentEnabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    adjustmentEnabled ? 'bg-white' : 'bg-slate-500 dark:bg-slate-400'
                  }`}
                />
                {adjustmentEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Business Setup */}
      {showBusiness && (
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label
                htmlFor="expected-amount"
                className="mb-1.5 block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                Montant attendu en caisse
              </label>
              <input
                id="expected-amount"
                type="number"
                min="0"
                step={currency === 'USD' ? '0.01' : '1'}
                inputMode="decimal"
                value={expectedAmount}
                onChange={(event) => {
                  setExpectedAmount(event.target.value);
                  setError(null);
                }}
                placeholder={currency === 'USD' ? 'Ex. 1250' : 'Ex. 250000'}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-base font-semibold tabular-nums text-slate-900 dark:text-white outline-none transition focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setCdfInput(cdfDenominations.join(', '));
                  setShowCdfSettings((v) => !v);
                }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Settings2 className="h-4 w-4" />
                Coupures CDF
              </button>
            </div>
          </div>

          {showCdfSettings && (
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
              <label
                htmlFor="cdf-denominations"
                className="mb-1.5 block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                Coupures CDF disponibles (séparées par des virgules)
              </label>
              <input
                id="cdf-denominations"
                type="text"
                value={cdfInput}
                onChange={(e) => setCdfInput(e.target.value)}
                placeholder="20000, 10000, 5000, 1000, 500, 200, 100, 50"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white tabular-nums outline-none"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                La coupure 2 000 CDF est automatiquement exclue.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={saveCdfConfiguration}
                  className="rounded-lg bg-slate-900 dark:bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  onClick={() => setShowCdfSettings(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {(message || error) && (
        <div className="px-4 pt-4 sm:px-5">
          {message && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs sm:text-sm text-red-800 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Gap status */}
      {showBusiness && gapStatus && (
        <div className="px-4 pt-4 sm:px-5">
          <div
            className={`rounded-xl border px-4 py-3 ${
              gapStatus.status === 'EQUILIBRE'
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : gapStatus.status === 'MANQUANT'
                ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                : 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold tabular-nums">{gapStatus.label}</p>
                <p className="text-xs mt-0.5 opacity-90 tabular-nums">
                  Compté : {formatMoney(totalCounted, currency)} | Attendu : {formatMoney(parsedExpectedAmount ?? 0, currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={saveGapHistory}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Historiser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Denominations table */}
      <div className="px-3 py-4 sm:px-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 bg-slate-50 dark:bg-slate-950/50 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:px-4">
            <span>Coupure</span>
            <span className="text-center">Quantité</span>
            <span className="text-right">Sous-total</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activeRows.map((row) => {
              const subtotal = row.value * (row.quantity ?? 0);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:px-4"
                >
                  <div>
                    <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white sm:text-base">
                      {formatMoney(row.value, currency)}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">coupure</p>
                  </div>
                  <div className="flex items-center justify-center">
                    {adjustmentEnabled && (
                      <button
                        type="button"
                        onClick={() => openAdjustment('remove', row)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-l-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    )}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={row.quantity ?? ''}
                      onChange={(event) => updateQuantity(row.id, event.target.value)}
                      className={`h-8 ${adjustmentEnabled ? 'w-12' : 'w-16 rounded-lg border-x'} border-y border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 text-center text-sm font-bold tabular-nums text-slate-900 dark:text-white outline-none`}
                    />
                    {adjustmentEnabled && (
                      <button
                        type="button"
                        onClick={() => openAdjustment('add', row)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white sm:text-base">
                      {formatMoney(subtotal, currency)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary footer */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {showBusiness ? 'Total compté en caisse' : 'Total calculé'}
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white sm:text-3xl">
              {formatMoney(totalCounted, currency)}
            </p>
          </div>
          {showBusiness && (
            <button
              type="button"
              onClick={async () => {
                await saveBusinessBilletage();
                void loadBilletageHistory();
              }}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Enregistrement...' : 'Enregistrer le billetage'}
            </button>
          )}
        </div>
      </div>
      </>
      )}

      {/* SUPERVISION & HISTORIQUE DES BILLETAGES */}
      {activeModuleMode === 'supervision' && (
        <div className="p-4 sm:p-5 space-y-5">
          {/* Messages */}
          {(message || error) && (
            <div>
              {message && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{message}</span>
                </div>
              )}
              {error && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs text-red-800 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* Synthèse des liquidités réelles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total USD en Caisse
              </span>
              <p className="mt-1 text-lg sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
                ${kpis.totalUsd.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total CDF en Caisse
              </span>
              <p className="mt-1 text-lg sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
                {kpis.totalCdf.toLocaleString('fr-FR')} CDF
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Billetages Validés
              </span>
              <p className="mt-1 text-lg sm:text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                {kpis.validatedCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                En Attente / Écarts
              </span>
              <p className="mt-1 text-lg sm:text-xl font-black tabular-nums text-amber-700 dark:text-amber-400">
                {kpis.pendingCount} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({kpis.discrepancyCount} écarts)</span>
              </p>
            </div>
          </div>

          {/* Filtres & Recherche */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Rechercher par référence, caissier ou agence..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-4 text-xs text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-slate-400 dark:focus:border-slate-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={filterCurrency}
                onChange={(e) => setFilterCurrency(e.target.value as 'all' | 'USD' | 'CDF')}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">Toutes devises</option>
                <option value="USD">USD ($)</option>
                <option value="CDF">CDF (FC)</option>
              </select>

              <select
                value={filterAgency}
                onChange={(e) => setFilterAgency(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">Toutes les agences</option>
                {agenciesList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">Tous les statuts</option>
                <option value="validated">Validés</option>
                <option value="draft">Brouillons</option>
                <option value="completed">Finalisés</option>
              </select>

              <button
                type="button"
                onClick={loadBilletageHistory}
                disabled={loadingHistory}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
            </div>
          </div>

          {/* Table des Billetages */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-3.5">Date & Réf</th>
                  <th className="p-3.5">Agence & Caissier</th>
                  <th className="p-3.5">Type & Devise</th>
                  <th className="p-3.5 text-right">Total Compté</th>
                  <th className="p-3.5 text-right">Attendu / Écart</th>
                  <th className="p-3.5 text-center">Statut</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredBilletages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 dark:text-slate-400">
                      Aucun billetage enregistré dans le système correspondant aux filtres.
                    </td>
                  </tr>
                ) : (
                  filteredBilletages.map((b) => {
                    const agent = systemUsersList.find((u) => u.uid === b.userId);
                    const agency = agenciesList.find((a) => a.id === b.agencyId);
                    const hasDiscrepancy = b.discrepancy !== null && b.discrepancy !== undefined && b.discrepancy !== 0;

                    return (
                      <tr key={b.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3.5">
                          <p className="font-bold text-slate-900 dark:text-white">{b.reference || b.id.slice(0, 12)}</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                            {new Date(b.createdAt).toLocaleString()}
                          </p>
                        </td>
                        <td className="p-3.5">
                          <p className="font-bold text-slate-800 dark:text-slate-100">{agency?.name || 'Siège / Non spécifiée'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <UserAvatar name={agent?.displayName || 'Caissier'} photoURL={agent?.photoURL} size="xs" />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{agent?.displayName || b.userId}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`rounded px-1.5 py-0.5 font-bold ${
                              b.currency === 'USD'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                            }`}
                          >
                            {b.currency}
                          </span>
                          <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {b.type === 'business' ? 'Professionnel' : 'Personnel'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-black tabular-nums text-slate-900 dark:text-white">
                          {formatMoney(b.calculatedTotal, b.currency)}
                        </td>
                        <td className="p-3.5 text-right tabular-nums">
                          {b.declaredAmount !== null && b.declaredAmount !== undefined ? (
                            <div>
                              <p className="font-bold text-slate-700 dark:text-slate-200">{formatMoney(b.declaredAmount, b.currency)}</p>
                              {hasDiscrepancy ? (
                                <span className={`inline-block text-[10px] font-bold ${b.discrepancy! > 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {b.discrepancy! > 0 ? `+${formatMoney(b.discrepancy!, b.currency)}` : formatMoney(b.discrepancy!, b.currency)}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Équilibré</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                              b.status === 'validated'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                : b.status === 'completed'
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {b.status === 'validated' ? 'Validé' : b.status === 'completed' ? 'Finalisé' : 'Brouillon'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailBilletage(b)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
                            >
                              <Eye className="h-3 w-3" />
                              Coupures
                            </button>
                            {b.status !== 'validated' && (
                              <button
                                type="button"
                                disabled={validatingId === b.id}
                                onClick={() => void handleValidateBilletage(b)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
                              >
                                {validatingId === b.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                Valider
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Section Écarts consignés en séance */}
          {gapHistory.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  Écarts consignés en séance locale ({gapHistory.length})
                </h3>
                <button
                  type="button"
                  onClick={clearGapHistory}
                  className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                >
                  Effacer l'historique local
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {gapHistory.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {entry.statut === 'EQUILIBRE' ? 'Équilibré' : entry.statut === 'MANQUANT' ? 'Manquant en caisse' : 'Excédent en caisse'}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {new Date(entry.date).toLocaleString()} • Attendu : {formatMoney(entry.montantAttendu, entry.devise)} • Compté : {formatMoney(entry.montantCompte, entry.devise)} • {entry.auteur}
                      </p>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      Écart : {formatMoney(entry.ecart, entry.devise)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Détails des coupures d'un billetage */}
      {detailBilletage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/logo.png"
                  alt="Ets AMANI"
                  className="h-10 w-10 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                    Fiche Officielle de Billetage ({detailBilletage.currency})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                    Réf : {detailBilletage.reference || detailBilletage.id} • {new Date(detailBilletage.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailBilletage(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 font-bold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-2.5">Coupure</th>
                    <th className="p-2.5 text-center">Quantité</th>
                    <th className="p-2.5 text-right">Sous-total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detailBilletage.lines.map((line) => (
                    <tr key={line.denominationId}>
                      <td className="p-2.5 font-bold tabular-nums text-slate-800 dark:text-slate-200">
                        {formatMoney(line.denomination, detailBilletage.currency)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold tabular-nums text-slate-700 dark:text-slate-300">
                        {line.quantity}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(line.subtotal, detailBilletage.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Total calculé :</span>
                <p className="text-lg font-black tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(detailBilletage.calculatedTotal, detailBilletage.currency)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span>Imprimer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailBilletage(null)}
                  className="rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjustment modal */}
      {adjustment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {adjustment.mode === 'add' ? 'Ajouter des billets' : 'Retirer des billets'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Coupure : <strong className="text-slate-800 dark:text-slate-200">{formatMoney(adjustment.denomination, currency)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustment(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantité de billets
              </label>
              <input
                type="number"
                min="1"
                step="1"
                autoFocus
                value={adjustment.quantity}
                onChange={(e) =>
                  setAdjustment({
                    ...adjustment,
                    quantity: e.target.value.replace(/[^\d]/g, ''),
                  })
                }
                placeholder="Ex. 5"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-center text-xl font-bold tabular-nums text-slate-900 dark:text-white outline-none"
              />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjustment(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={applyAdjustment}
                className={`rounded-lg p-2.5 text-xs sm:text-sm font-bold text-white ${
                  adjustment.mode === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {adjustment.mode === 'add' ? 'Ajouter' : 'Retirer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
