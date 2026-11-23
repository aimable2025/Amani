import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Download,
  Eye,
  FileSpreadsheet,
  HandCoins,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../lib/db';
import type {
  AgentFundStock,
  CashHandover,
  CreditDelegationScope,
  CurrencyCode,
  FinancialAnomaly,
  FinancialLedgerEntry,
  FinancialTransaction,
  PhysicalInventory,
  ReconciliationRecord,
  ReconciliationToleranceConfig,
  ReplenishmentRequest,
} from '../../../types/financialSupervision';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import { getAllSystemUsers, type ManagedUser } from '../../../services/SystemUserService';
import {
  requestAnomalyJustification,
  resolveFinancialAnomaly,
  runProactiveAnomalySweep,
} from '../../../services/AnomalyDetectionService';
import {
  formatMoney,
  getAuthorizedAgentFundStocks,
  getAuthorizedFinancialLedger,
  getFinancialThresholds,
  isGlobalFinancialSupervisor,
  reconcileAndPersistAgentStock,
  roundCurrency,
  saveFinancialThresholds,
} from '../../../services/FinancialLedgerService';
import {
  allocateInitialEndowment,
  allocateVirtualCredit,
  confirmCashHandover,
  createCompensatingReversal,
  getActiveDelegationForUser,
  grantCreditDelegation,
  initiateCashHandover,
  rejectCashHandover,
  revokeCreditDelegation,
} from '../../../services/FundAllocationService';
import {
  requestPhysicalInventory,
  validateAndLockInventory,
} from '../../../services/InventoryControlService';
import {
  approveReplenishmentRequest,
  rejectReplenishmentRequest,
} from '../../../services/ReplenishmentService';
import {
  resolveReconciliationManually,
  scanAndReconcileAll,
} from '../../../services/SmsReconciliationService';
import { triggerSyncNow } from '../../../services/SyncWorker';

type SupervisionTab =
  | 'overview'
  | 'allocations'
  | 'requests'
  | 'reconciliation'
  | 'inventories'
  | 'anomalies'
  | 'governance';

export default function FinancialSupervisionModule({
  mode,
  onClose,
}: {
  mode: 'dg' | 'agency_admin' | 'system_admin';
  onClose?: () => void;
}) {
  const { user } = useAuth();
  const isGlobal = mode !== 'agency_admin' && isGlobalFinancialSupervisor(user);

  const [activeTab, setActiveTab] = useState<SupervisionTab>('overview');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stocks, setStocks] = useState<AgentFundStock[]>([]);
  const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [replenishments, setReplenishments] = useState<ReplenishmentRequest[]>([]);
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationRecord[]>([]);
  const [anomalies, setAnomalies] = useState<FinancialAnomaly[]>([]);
  const [inventories, setInventories] = useState<PhysicalInventory[]>([]);
  const [delegations, setDelegations] = useState<CreditDelegationScope[]>([]);
  const [activeOwnDelegation, setActiveOwnDelegation] = useState<CreditDelegationScope | null>(
    null
  );

  const [agencyFilter, setAgencyFilter] = useState<string>(
    mode === 'agency_admin' && user?.agencyId ? user.agencyId : 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Drill-down agent sélectionné
  const [drillAgentUid, setDrillAgentUid] = useState<string | null>(null);

  // Formulaire dotation initiale / attribution crédit
  const [allocMode, setAllocMode] = useState<'dotation' | 'credit'>('credit');
  const [targetAgentUid, setTargetAgentUid] = useState<string>('');
  const [allocCurrency, setAllocCurrency] = useState<CurrencyCode>('USD');
  const [allocCashAmount, setAllocCashAmount] = useState<string>('0');
  const [allocVirtualAmount, setAllocVirtualAmount] = useState<string>('');
  const [allocSource, setAllocSource] = useState<string>('Trésorerie Centrale DG');
  const [allocReason, setAllocReason] = useState<string>('');

  // Formulaire envoi cash direction -> agent
  const [sendCashAgentUid, setSendCashAgentUid] = useState<string>('');
  const [sendCashCurrency, setSendCashCurrency] = useState<CurrencyCode>('USD');
  const [sendCashAmount, setSendCashAmount] = useState<string>('');
  const [sendCashReason, setSendCashReason] = useState<string>('');

  // Formulaire déclenchement inventaire
  const [invAgentUid, setInvAgentUid] = useState<string>('');
  const [invType, setInvType] = useState<PhysicalInventory['controlType']>('inopine');

  // Formulaire délégation (DG / Admin Sys)
  const [delAdminUid, setDelAdminUid] = useState<string>('');
  const [delMaxUsd, setDelMaxUsd] = useState<string>('1000');
  const [delMaxCdf, setDelMaxCdf] = useState<string>('2500000');
  const [delHours, setDelHours] = useState<string>('24');
  const [delReason, setDelReason] = useState<string>('');

  // Seuils & tolérances
  const [thresholds, setThresholds] = useState<ReconciliationToleranceConfig>(
    getFinancialThresholds()
  );

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 6500);
  };

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const scopeAgencyId = !isGlobal ? user.agencyId ?? null : null;
      const [
        agenciesList,
        usersList,
        authStocks,
        authLedger,
        allTxs,
        allReps,
        allHandovers,
        allRecs,
        allAnos,
        allInvs,
        allDels,
        ownDel,
      ] = await Promise.all([
        getAgencies(),
        getAllSystemUsers(),
        getAuthorizedAgentFundStocks(user),
        getAuthorizedFinancialLedger(user),
        db.financialTransactions.toArray(),
        db.replenishmentRequests.toArray(),
        db.cashHandovers.toArray(),
        db.reconciliationRecords.toArray(),
        db.financialAnomalies.toArray(),
        db.physicalInventories.toArray(),
        db.financialDelegations.toArray(),
        mode === 'agency_admin'
          ? getActiveDelegationForUser(user.uid, user.agencyId ?? null)
          : Promise.resolve(null),
      ]);

      setAgencies(agenciesList);
      setUsers(usersList);
      setStocks(authStocks);
      setLedger(authLedger);

      const filterByScope = <T extends { agencyId?: string | null }>(list: T[]) =>
        scopeAgencyId ? list.filter((x) => x.agencyId === scopeAgencyId) : list;

      setTransactions(filterByScope(allTxs).sort((a, b) => b.createdAt - a.createdAt));
      setReplenishments(filterByScope(allReps).sort((a, b) => b.createdAt - a.createdAt));
      setHandovers(filterByScope(allHandovers).sort((a, b) => b.createdAt - a.createdAt));
      setReconciliations(filterByScope(allRecs).sort((a, b) => b.createdAt - a.createdAt));
      setAnomalies(filterByScope(allAnos).sort((a, b) => b.createdAt - a.createdAt));
      setInventories(filterByScope(allInvs).sort((a, b) => b.createdAt - a.createdAt));
      setDelegations(
        scopeAgencyId ? allDels.filter((d) => d.agencyId === scopeAgencyId) : allDels
      );
      setActiveOwnDelegation(ownDel);
    } finally {
      setLoading(false);
    }
  }, [user, isGlobal, mode]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeAgents = useMemo(() => {
    return users.filter(
      (u) =>
        u.role === 'agent' &&
        u.status === 'active' &&
        (isGlobal || (user?.agencyId && u.agencyId === user.agencyId))
    );
  }, [users, isGlobal, user?.agencyId]);

  const agencyAdmins = useMemo(
    () =>
      users.filter((u) => u.role === 'administrateur_agence' && u.status === 'active'),
    [users]
  );

  const getAgencyName = useCallback(
    (agencyId: string | null | undefined) => {
      if (!agencyId) return 'Global';
      return agencies.find((a) => a.id === agencyId)?.name || agencyId;
    },
    [agencies]
  );

  // Agrégation consolidée par devise (JAMAIS mélangée USD + CDF)
  const consolidatedTotals = useMemo(() => {
    const visibleStocks =
      agencyFilter === 'ALL'
        ? stocks
        : stocks.filter((s) => s.agencyId === agencyFilter);

    const sumByCurrency = (cur: CurrencyCode) => {
      const list = visibleStocks.filter((s) => s.currency === cur);
      return {
        cash: roundCurrency(list.reduce((a, s) => a + s.physicalCashAvailable, 0)),
        virtual: roundCurrency(list.reduce((a, s) => a + s.virtualCreditAvailable, 0)),
        capital: roundCurrency(list.reduce((a, s) => a + s.netAttributedCapital, 0)),
      };
    };

    return {
      usd: sumByCurrency('USD'),
      cdf: sumByCurrency('CDF'),
      pendingReplenishments: replenishments.filter(
        (r) => r.status === 'en_attente' || r.status === 'en_examen'
      ).length,
      pendingHandovers: handovers.filter((h) => h.status === 'en_attente_confirmation')
        .length,
      openAnomalies: anomalies.filter((a) => a.status !== 'cloturee').length,
      unmatchedRecords: reconciliations.filter(
        (r) => r.status !== 'rapprochee' && r.status !== 'validee_manuellement'
      ).length,
    };
  }, [stocks, agencyFilter, replenishments, handovers, anomalies, reconciliations]);

  // Synthèse consolidée par agent (USD + CDF séparés sur la même ligne)
  const agentRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeAgents
      .filter((ag) => {
        if (agencyFilter !== 'ALL' && ag.agencyId !== agencyFilter) return false;
        if (!q) return true;
        return (
          ag.displayName.toLowerCase().includes(q) ||
          getAgencyName(ag.agencyId).toLowerCase().includes(q)
        );
      })
      .map((ag) => {
        const sUsd = stocks.find((s) => s.agentId === ag.uid && s.currency === 'USD');
        const sCdf = stocks.find((s) => s.agentId === ag.uid && s.currency === 'CDF');
        const agAnomalies = anomalies.filter(
          (a) => a.agentId === ag.uid && a.status !== 'cloturee'
        ).length;
        return {
          agent: ag,
          agencyName: getAgencyName(ag.agencyId),
          usd: sUsd,
          cdf: sCdf,
          openAnomalies: agAnomalies,
        };
      });
  }, [activeAgents, agencyFilter, searchQuery, stocks, anomalies, getAgencyName]);

  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !targetAgentUid) return;
    const target = users.find((u) => u.uid === targetAgentUid);
    if (!target) return;
    setBusy(true);
    try {
      const descriptor = {
        uid: target.uid,
        displayName: target.displayName,
        agencyId: target.agencyId ?? null,
        agencyName: getAgencyName(target.agencyId),
      };
      if (allocMode === 'dotation') {
        const res = await allocateInitialEndowment({
          targetAgent: descriptor,
          currency: allocCurrency,
          initialPhysicalCash: Number(allocCashAmount || 0),
          initialVirtualCredit: Number(allocVirtualAmount || 0),
          centralFundingSource: allocSource,
          reason: allocReason || 'Dotation initiale agent',
          actor: user,
        });
        notify('success', `Dotation ${res.entry.reference} enregistrée pour ${target.displayName}.`);
      } else {
        const res = await allocateVirtualCredit({
          targetAgent: descriptor,
          currency: allocCurrency,
          amount: Number(allocVirtualAmount || 0),
          centralFundingSource: allocSource,
          reason: allocReason || 'Attribution crédit virtuel',
          actor: user,
        });
        notify('success', `Crédit virtuel ${res.entry.reference} alloué à ${target.displayName}.`);
      }
      setAllocCashAmount('0');
      setAllocVirtualAmount('');
      setAllocReason('');
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur attribution fonds.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveRep = async (req: ReplenishmentRequest) => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await approveReplenishmentRequest({
        requestId: req.id,
        centralFundingSource: 'Trésorerie Centrale Ets AMANI',
        decisionNote: 'Validé après contrôle des stocks agent',
        supervisor: user,
      });
      notify(
        'success',
        `Demande ${req.reference} approuvée (+${formatMoney(res.request.approvedAmount || req.requestedAmount, req.currency)}).`
      );
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Approvisionnement refusé.');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectRep = async (req: ReplenishmentRequest) => {
    if (!user) return;
    setBusy(true);
    try {
      await rejectReplenishmentRequest({
        requestId: req.id,
        rejectionReason: 'Solde actuel ou niveau d’activité ne justifiant pas ce montant',
        supervisor: user,
      });
      notify('success', `Demande ${req.reference} rejetée.`);
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur rejet.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendCashToAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !sendCashAgentUid) return;
    const target = users.find((u) => u.uid === sendCashAgentUid);
    if (!target) return;
    setBusy(true);
    try {
      const h = await initiateCashHandover({
        direction: 'direction_vers_agent',
        agent: {
          uid: target.uid,
          displayName: target.displayName,
          agencyId: target.agencyId ?? null,
          agencyName: getAgencyName(target.agencyId),
        },
        currency: sendCashCurrency,
        amount: Number(sendCashAmount),
        reason: sendCashReason || 'Approvisionnement cash physique guichet',
        actor: user,
      });
      setSendCashAmount('');
      setSendCashReason('');
      notify('success', `Envoi cash ${h.reference} initié. Confirmation de ${target.displayName} requise.`);
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur envoi cash.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !invAgentUid) return;
    const target = users.find((u) => u.uid === invAgentUid);
    if (!target) return;
    setBusy(true);
    try {
      const inv = await requestPhysicalInventory({
        agentId: target.uid,
        agentName: target.displayName,
        agencyId: target.agencyId ?? null,
        agencyName: getAgencyName(target.agencyId),
        controlType: invType,
        supervisor: user,
      });
      notify('success', `Inventaire ${inv.reference} (${invType}) envoyé à ${target.displayName}.`);
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur déclenchement inventaire.');
    } finally {
      setBusy(false);
    }
  };

  const handleGrantDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !delAdminUid) return;
    const adm = agencyAdmins.find((a) => a.uid === delAdminUid);
    if (!adm || !adm.agencyId) {
      notify('error', "Sélectionnez un Administrateur d'Agence rattaché à une succursale.");
      return;
    }
    setBusy(true);
    try {
      const d = await grantCreditDelegation({
        delegateUid: adm.uid,
        delegateName: adm.displayName,
        delegateRole: adm.role,
        agencyId: adm.agencyId,
        agencyName: getAgencyName(adm.agencyId),
        maxAmountUsd: Number(delMaxUsd || 0),
        maxAmountCdf: Number(delMaxCdf || 0),
        durationHours: Number(delHours || 24),
        reason: delReason || 'Délégation plafonnée de réapprovisionnement',
        actor: user,
      });
      setDelReason('');
      notify('success', `Délégation active accordée à ${d.delegateName} (${d.agencyName}).`);
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur délégation.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunSmsAndAnomalyScan = async () => {
    setBusy(true);
    try {
      const scope = !isGlobal ? user?.agencyId : null;
      const [recRes, anoRes] = await Promise.all([
        scanAndReconcileAll(scope),
        runProactiveAnomalySweep(scope),
      ]);
      notify(
        'success',
        `Contrôle terminé : ${recRes.matched} rapprochement(s), ${recRes.anomaliesCreated + anoRes.length} alerte(s) détectée(s).`
      );
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors du contrôle.');
    } finally {
      setBusy(false);
    }
  };

  const exportGlobalLedgerCsv = () => {
    const headers = [
      'Reference',
      'Date',
      'Agent',
      'Agence',
      'Categorie',
      'Devise',
      'Delta_Cash',
      'Delta_Virtuel',
      'Delta_Capital',
      'Delta_Frais',
      'Delta_FX',
      'Delta_Ajustement',
      'Cycle_Synchro',
      'Motif',
    ];
    const rows = ledger.map((e) => [
      e.reference,
      new Date(e.createdAt).toISOString(),
      `"${e.agentName.replace(/"/g, '""')}"`,
      `"${e.agencyName.replace(/"/g, '""')}"`,
      e.operationCategory,
      e.currency,
      e.physicalCashDelta,
      e.virtualCreditDelta,
      e.capitalDelta,
      e.feeDelta,
      e.fxNetDelta,
      e.adjustmentDelta,
      e.syncLifecycle,
      `"${(e.reason || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supervision-financiere-ets-amani.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const drillAgent = useMemo(
    () => activeAgents.find((a) => a.uid === drillAgentUid) || null,
    [activeAgents, drillAgentUid]
  );

  return (
    <div className="space-y-4">
      {/* En-tête supervision */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#C58B39]">
            {isGlobal
              ? 'DIRECTION GÉNÉRALE · SUPERVISION FINANCIÈRE CONSOLIDÉE'
              : `ADMINISTRATION AGENCE · ${getAgencyName(user?.agencyId)}`}
          </p>
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
            Crédits Virtuels, Cash Physique & Contrôle SMS
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRunSmsAndAnomalyScan()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <ScanLine className="h-3.5 w-3.5 text-[#C58B39]" />
            <span>Rapprochement & Audit</span>
          </button>
          <button
            type="button"
            onClick={() => void triggerSyncNow().then(() => loadAll())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Fermer
            </button>
          )}
        </div>
      </div>

      {mode === 'agency_admin' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3.5 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {activeOwnDelegation
              ? `Délégation DG active : plafond ${formatMoney(activeOwnDelegation.maxAmountUsd, 'USD')} / ${formatMoney(activeOwnDelegation.maxAmountCdf, 'CDF')} (expire le ${new Date(activeOwnDelegation.expiresAt).toLocaleString('fr-FR')}).`
              : 'Mode supervision d’agence : vous pouvez contrôler les inventaires, confirmations cash et alertes. Aucune délégation active du DG pour allouer du crédit virtuel.'}
          </span>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold flex items-start gap-2 ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200'
              : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Bandeau KPI consolidé — Devises USD et CDF strictement séparées */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Cash Physique USD
          </p>
          <p className="mt-1 text-base font-black tabular-nums text-slate-900 dark:text-white">
            {formatMoney(consolidatedTotals.usd.cash, 'USD')}
          </p>
          <p className="text-[10px] text-slate-400 tabular-nums">
            Capital : {formatMoney(consolidatedTotals.usd.capital, 'USD')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Crédit Virtuel USD
          </p>
          <p className="mt-1 text-base font-black tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(consolidatedTotals.usd.virtual, 'USD')}
          </p>
          <p className="text-[10px] text-slate-400">Stock opérationnel</p>
        </div>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Cash Physique CDF
          </p>
          <p className="mt-1 text-base font-black tabular-nums text-slate-900 dark:text-white">
            {formatMoney(consolidatedTotals.cdf.cash, 'CDF')}
          </p>
          <p className="text-[10px] text-slate-400 tabular-nums">
            Capital : {formatMoney(consolidatedTotals.cdf.capital, 'CDF')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Crédit Virtuel CDF
          </p>
          <p className="mt-1 text-base font-black tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(consolidatedTotals.cdf.virtual, 'CDF')}
          </p>
          <p className="text-[10px] text-slate-400">Stock opérationnel</p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Demandes / Remises
          </p>
          <p className="mt-1 text-base font-black tabular-nums text-amber-600 dark:text-amber-400">
            {consolidatedTotals.pendingReplenishments} · {consolidatedTotals.pendingHandovers}
          </p>
          <p className="text-[10px] text-slate-400">Réappro · Cash à valider</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('anomalies')}
          className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-[#C58B39]/60 transition"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Alertes & Écarts
          </p>
          <p className="mt-1 text-base font-black tabular-nums text-rose-600 dark:text-rose-400">
            {consolidatedTotals.openAnomalies} · {consolidatedTotals.unmatchedRecords}
          </p>
          <p className="text-[10px] text-slate-400">Anomalies · SMS non rapprochés</p>
        </button>
      </div>

      {/* Navigation des 7 sous-modules */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'overview' as SupervisionTab, label: 'Fonds par Agent', icon: Wallet },
          { id: 'allocations' as SupervisionTab, label: 'Dotations & Crédits', icon: Coins },
          {
            id: 'requests' as SupervisionTab,
            label: `Réappros & Cash (${consolidatedTotals.pendingReplenishments + consolidatedTotals.pendingHandovers})`,
            icon: HandCoins,
          },
          {
            id: 'reconciliation' as SupervisionTab,
            label: `Rapprochement SMS (${consolidatedTotals.unmatchedRecords})`,
            icon: ScanLine,
          },
          { id: 'inventories' as SupervisionTab, label: 'Inventaires Physiques', icon: ClipboardCheck },
          {
            id: 'anomalies' as SupervisionTab,
            label: `Anomalies (${consolidatedTotals.openAnomalies})`,
            icon: ShieldAlert,
          },
          { id: 'governance' as SupervisionTab, label: 'Journal, Délégations & Seuils', icon: Lock },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. VUE AGENTS */}
      {activeTab === 'overview' && (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un agent ou une agence..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
            {isGlobal && (
              <select
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
              >
                <option value="ALL">Toutes les agences ({agencies.length})</option>
                {agencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                  <th className="py-2 pr-3">Agent & Agence</th>
                  <th className="py-2 pr-3 text-right">Cash USD</th>
                  <th className="py-2 pr-3 text-right">Virtuel USD</th>
                  <th className="py-2 pr-3 text-right">Cash CDF</th>
                  <th className="py-2 pr-3 text-right">Virtuel CDF</th>
                  <th className="py-2 pr-3 text-center">Anomalies</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {agentRows.map(({ agent, agencyName, usd, cdf, openAnomalies }) => (
                  <tr key={agent.uid}>
                    <td className="py-2.5 pr-3">
                      <p className="font-bold text-slate-900 dark:text-white">{agent.displayName}</p>
                      <p className="text-[10px] text-slate-400">
                        {agencyName} · {agent.function || 'guichetier'}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(usd?.physicalCashAvailable ?? 0, 'USD')}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatMoney(usd?.virtualCreditAvailable ?? 0, 'USD')}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(cdf?.physicalCashAvailable ?? 0, 'CDF')}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatMoney(cdf?.virtualCreditAvailable ?? 0, 'CDF')}
                    </td>
                    <td className="py-2.5 pr-3 text-center tabular-nums">
                      <span
                        className={`font-bold ${
                          openAnomalies > 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {openAnomalies}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setDrillAgentUid(agent.uid)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Détails</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetAgentUid(agent.uid);
                          setAllocMode('credit');
                          setActiveTab('allocations');
                        }}
                        className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-2 py-1 text-[11px] font-bold text-white dark:text-[#0B192C]"
                      >
                        + Crédit
                      </button>
                    </td>
                  </tr>
                ))}
                {agentRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Aucun agent actif dans ce périmètre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. DOTATIONS & CRÉDITS */}
      {activeTab === 'allocations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form
            onSubmit={handleAllocateSubmit}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Dotation initiale & Attribution crédit virtuel
              </h4>
              {isGlobal && (
                <div className="flex gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAllocMode('credit')}
                    className={`rounded-md px-2 py-0.5 font-bold ${
                      allocMode === 'credit'
                        ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                        : 'text-slate-500'
                    }`}
                  >
                    Crédit virtuel
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllocMode('dotation')}
                    className={`rounded-md px-2 py-0.5 font-bold ${
                      allocMode === 'dotation'
                        ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                        : 'text-slate-500'
                    }`}
                  >
                    Dotation initiale
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Agent bénéficiaire *
              </label>
              <select
                required
                value={targetAgentUid}
                onChange={(e) => setTargetAgentUid(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="">Sélectionner un agent...</option>
                {activeAgents.map((a) => (
                  <option key={a.uid} value={a.uid}>
                    {a.displayName} ({getAgencyName(a.agencyId)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Devise
                </label>
                <select
                  value={allocCurrency}
                  onChange={(e) => setAllocCurrency(e.target.value as CurrencyCode)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="USD">USD ($)</option>
                  <option value="CDF">CDF (FC)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Crédit virtuel alloué ({allocCurrency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={allocVirtualAmount}
                  onChange={(e) => setAllocVirtualAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {allocMode === 'dotation' && isGlobal && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Cash physique initial ({allocCurrency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={allocCashAmount}
                  onChange={(e) => setAllocCashAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Source centrale / Compte opérateur émetteur *
              </label>
              <input
                type="text"
                required
                value={allocSource}
                onChange={(e) => setAllocSource(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <input
              type="text"
              required
              value={allocReason}
              onChange={(e) => setAllocReason(e.target.value)}
              placeholder="Motif comptable / référence pièce *"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            />

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#0B192C] dark:bg-[#C58B39] py-2.5 text-xs font-black text-white dark:text-[#0B192C] hover:opacity-95 disabled:opacity-50"
            >
              Valider l&apos;attribution (Confirmation biométrique)
            </button>
          </form>

          {/* Envoi de cash Direction -> Agent */}
          <form
            onSubmit={handleSendCashToAgent}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Envoyer du cash physique vers un agent
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Le stock de cash physique de l&apos;agent ne sera crédité qu&apos;après confirmation bilatérale de réception.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Agent destinataire *
              </label>
              <select
                required
                value={sendCashAgentUid}
                onChange={(e) => setSendCashAgentUid(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="">Sélectionner un agent...</option>
                {activeAgents.map((a) => (
                  <option key={a.uid} value={a.uid}>
                    {a.displayName} ({getAgencyName(a.agencyId)})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={sendCashCurrency}
                onChange={(e) => setSendCashCurrency(e.target.value as CurrencyCode)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold"
              >
                <option value="USD">USD ($)</option>
                <option value="CDF">CDF (FC)</option>
              </select>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={sendCashAmount}
                onChange={(e) => setSendCashAmount(e.target.value)}
                placeholder="Montant cash"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold tabular-nums"
              />
            </div>
            <input
              type="text"
              required
              value={sendCashReason}
              onChange={(e) => setSendCashReason(e.target.value)}
              placeholder="Référence bordereau / motif *"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 py-2.5 text-xs font-black text-white hover:opacity-95 disabled:opacity-50"
            >
              Initier l&apos;envoi de cash physique
            </button>
          </form>
        </div>
      )}

      {/* 3. REAPPROVISIONNEMENTS & REMISES CASH */}
      {activeTab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Demandes de réapprovisionnement ({replenishments.length})
            </h4>
            {replenishments.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">Aucune demande enregistrée.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto text-xs">
                {replenishments.map((r) => (
                  <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {r.reference} · {r.agentName} ({r.agencyName})
                      </p>
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatMoney(r.requestedAmount, r.currency)} · {r.requestType} · {r.urgency}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{r.reason}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Statut : {r.status}</p>
                    </div>
                    {(r.status === 'en_attente' || r.status === 'en_examen') &&
                      r.agentId !== user?.uid && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleApproveRep(r)}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:opacity-90 whitespace-nowrap"
                          >
                            Approuver
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRejectRep(r)}
                            className="rounded-lg border border-rose-300 px-3 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 whitespace-nowrap"
                          >
                            Rejeter
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Remises de cash bilatérales ({handovers.length})
            </h4>
            {handovers.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">Aucune remise enregistrée.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto text-xs">
                {handovers.map((h) => {
                  const canConfirm =
                    h.status === 'en_attente_confirmation' &&
                    h.initiatedByUid !== user?.uid &&
                    (h.direction !== 'direction_vers_agent' || isGlobal);
                  return (
                    <div key={h.id} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                          {h.direction === 'direction_vers_agent' ? (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          <span>
                            {h.reference} · {h.agentName} · {formatMoney(h.amount, h.currency)}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {h.direction.replace(/_/g, ' ')} · Initié par {h.initiatedByName}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          {h.reason} · <span className="font-bold">{h.status}</span>
                        </p>
                      </div>
                      {canConfirm && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void confirmCashHandover({
                                handoverId: h.id,
                                confirmer: user!,
                              })
                                .then(() => {
                                  notify('success', `Remise ${h.reference} confirmée.`);
                                  return loadAll();
                                })
                                .catch((e) =>
                                  notify('error', e instanceof Error ? e.message : 'Erreur')
                                )
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white whitespace-nowrap"
                          >
                            Confirmer réception
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void rejectCashHandover({
                                handoverId: h.id,
                                rejectionReason: 'Montant non reçu physiquement',
                                actor: user!,
                              }).then(() => loadAll())
                            }
                            className="rounded-lg border border-rose-300 px-3 py-1 text-[11px] font-bold text-rose-600 whitespace-nowrap"
                          >
                            Rejeter
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. RAPPROCHEMENT SMS */}
      {activeTab === 'reconciliation' && (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Rapprochement Automatique SMS Opérateurs ↔ Transactions Agents ({reconciliations.length})
            </h4>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRunSmsAndAnomalyScan()}
              className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C]"
            >
              Lancer le scan SMS
            </button>
          </div>
          {reconciliations.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              Aucun rapprochement ou écart SMS enregistré.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {reconciliations.map((rec) => (
                <div key={rec.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      Statut : {rec.status} · Score {rec.confidenceScore}/100 ·{' '}
                      {rec.operator?.toUpperCase() || 'OPÉRATEUR'}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      SMS : {rec.smsAmount ?? '—'} {rec.currency || ''} (Réf :{' '}
                      {rec.smsReference || 'N/A'}) ↔ Déclaré : {rec.declaredAmount ?? '—'}{' '}
                      {rec.currency || ''} (Réf : {rec.declaredReference || 'N/A'})
                    </p>
                    {rec.resolutionNote && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {rec.resolutionNote}
                      </p>
                    )}
                  </div>
                  {rec.status !== 'rapprochee' && rec.status !== 'validee_manuellement' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void resolveReconciliationManually({
                          recordId: rec.id,
                          resolutionNote: 'Validé manuellement par la supervision',
                          supervisor: user!,
                        }).then(() => loadAll())
                      }
                      className="rounded-lg border border-emerald-400 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 whitespace-nowrap"
                    >
                      Valider manuellement
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. INVENTAIRES PHYSIQUES */}
      {activeTab === 'inventories' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form
            onSubmit={handleRequestInventory}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Déclencher un contrôle d&apos;inventaire
            </h4>
            <select
              required
              value={invAgentUid}
              onChange={(e) => setInvAgentUid(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"
            >
              <option value="">Sélectionner un agent...</option>
              {activeAgents.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.displayName} ({getAgencyName(a.agencyId)})
                </option>
              ))}
            </select>
            <select
              value={invType}
              onChange={(e) => setInvType(e.target.value as PhysicalInventory['controlType'])}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold"
            >
              <option value="inopine">Contrôle inopiné (surprise)</option>
              <option value="cloture_journee">Clôture de journée</option>
              <option value="periodique">Audit périodique</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#0B192C] dark:bg-[#C58B39] py-2.5 text-xs font-black text-white dark:text-[#0B192C]"
            >
              Déclencher le comptage agent
            </button>
          </form>

          <div className="lg:col-span-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Inventaires physiques & virtuels ({inventories.length})
            </h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {inventories.map((inv) => (
                <div key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {inv.reference} · {inv.agentName} · {inv.controlType} · {inv.status}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      Théorique USD : Cash {inv.theoreticalPhysicalCashUsd} / Virt{' '}
                      {inv.theoreticalVirtualCreditUsd} · CDF : Cash {inv.theoreticalPhysicalCashCdf}{' '}
                      / Virt {inv.theoreticalVirtualCreditCdf}
                    </p>
                    {inv.submittedAt && (
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                        Écarts constatés → USD ({inv.discrepancyCashUsd} / {inv.discrepancyVirtualUsd})
                        · CDF ({inv.discrepancyCashCdf} / {inv.discrepancyVirtualCdf})
                      </p>
                    )}
                  </div>
                  {inv.status === 'soumis_agent' && !inv.immutableLocked && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void validateAndLockInventory({
                            inventoryId: inv.id,
                            validationNotes: 'Validation contradictoire superviseur',
                            applyCompensatingLedgerAdjustment: false,
                            supervisor: user!,
                          })
                            .then(() => {
                              notify('success', `Inventaire ${inv.reference} verrouillé.`);
                              return loadAll();
                            })
                            .catch((e) =>
                              notify('error', e instanceof Error ? e.message : 'Erreur')
                            )
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white whitespace-nowrap"
                      >
                        Valider & Verrouiller
                      </button>
                      {isGlobal && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void validateAndLockInventory({
                              inventoryId: inv.id,
                              validationNotes: 'Verrouillage DG avec ajustement comptable documenté',
                              applyCompensatingLedgerAdjustment: true,
                              supervisor: user!,
                            })
                              .then(() => {
                                notify(
                                  'success',
                                  `Inventaire ${inv.reference} verrouillé et ajusté.`
                                );
                                return loadAll();
                              })
                              .catch((e) =>
                                notify('error', e instanceof Error ? e.message : 'Erreur')
                              )
                          }
                          className="rounded-lg border border-amber-400 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap"
                        >
                          Verrouiller + Ajuster
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {inventories.length === 0 && (
                <p className="py-8 text-center text-slate-400">Aucun inventaire déclenché.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. ANOMALIES */}
      {activeTab === 'anomalies' && (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Centre d&apos;alertes & anomalies financières ({anomalies.length})
            </h4>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {anomalies.map((ano) => (
              <div key={ano.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {ano.reference} · [{ano.severity.toUpperCase()}] {ano.title} ({ano.status})
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {ano.agentName ? `${ano.agentName} · ` : ''}
                    {ano.description}
                  </p>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 italic mt-0.5">
                    {ano.warningDisclaimer}
                  </p>
                  {ano.agentJustification && (
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                      Justification agent : « {ano.agentJustification} »
                    </p>
                  )}
                </div>
                {ano.status !== 'cloturee' && (
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {ano.agentId && ano.status !== 'justification_demandee' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void requestAnomalyJustification({
                            anomalyId: ano.id,
                            note: 'Merci de fournir les justificatifs de cette anomalie.',
                            supervisor: user!,
                          }).then(() => loadAll())
                        }
                        className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] font-bold"
                      >
                        Demander justification
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void resolveFinancialAnomaly({
                          anomalyId: ano.id,
                          newStatus: 'cloturee',
                          supervisorNote: 'Clôturée après vérification contradictoire',
                          supervisor: user!,
                        }).then(() => loadAll())
                      }
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      Clôturer
                    </button>
                  </div>
                )}
              </div>
            ))}
            {anomalies.length === 0 && (
              <p className="py-8 text-center text-slate-400">Aucune anomalie enregistrée.</p>
            )}
          </div>
        </div>
      )}

      {/* 7. GOUVERNANCE : JOURNAL IMMUABLE, DELEGATIONS & SEUILS */}
      {activeTab === 'governance' && (
        <div className="space-y-4">
          {isGlobal && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Délégations temporaires */}
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <KeyRound className="h-3.5 w-3.5 text-[#C58B39]" />
                  <span>Délégation plafonnée Admin d&apos;Agence (DG uniquement)</span>
                </h4>
                <form onSubmit={handleGrantDelegation} className="space-y-2.5 text-xs">
                  <select
                    required
                    value={delAdminUid}
                    onChange={(e) => setDelAdminUid(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
                  >
                    <option value="">Choisir un Administrateur d&apos;Agence...</option>
                    {agencyAdmins.map((a) => (
                      <option key={a.uid} value={a.uid}>
                        {a.displayName} ({getAgencyName(a.agencyId)})
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold mb-1">Plafond USD</label>
                      <input
                        type="number"
                        min="0"
                        value={delMaxUsd}
                        onChange={(e) => setDelMaxUsd(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold mb-1">Plafond CDF</label>
                      <input
                        type="number"
                        min="0"
                        value={delMaxCdf}
                        onChange={(e) => setDelMaxCdf(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold mb-1">Durée (h)</label>
                      <input
                        type="number"
                        min="1"
                        value={delHours}
                        onChange={(e) => setDelHours(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 tabular-nums"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    value={delReason}
                    onChange={(e) => setDelReason(e.target.value)}
                    placeholder="Motif de la délégation *"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-lg bg-[#0B192C] dark:bg-[#C58B39] py-2 font-bold text-white dark:text-[#0B192C]"
                  >
                    Accorder délégation temporaire
                  </button>
                </form>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                  {delegations.map((d) => (
                    <div key={d.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold">
                          {d.delegateName} ({d.agencyName}) · {d.status}
                        </p>
                        <p className="text-slate-500 tabular-nums">
                          Max {formatMoney(d.maxAmountUsd, 'USD')} /{' '}
                          {formatMoney(d.maxAmountCdf, 'CDF')} · Expire{' '}
                          {new Date(d.expiresAt).toLocaleString('fr-FR')}
                        </p>
                      </div>
                      {d.status === 'active' && (
                        <button
                          type="button"
                          onClick={() =>
                            void revokeCreditDelegation(d.id, user!).then(() => loadAll())
                          }
                          className="rounded-md border border-rose-300 px-2 py-1 text-[10px] font-bold text-rose-600"
                        >
                          Révoquer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Paramètres de tolérance SMS & seuils */}
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <Settings className="h-3.5 w-3.5 text-[#C58B39]" />
                  <span>Tolérances rapprochement SMS & Seuils alertes</span>
                </h4>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold mb-1">
                      Fenêtre SMS (minutes)
                    </label>
                    <input
                      type="number"
                      value={thresholds.timeWindowMinutes}
                      onChange={(e) =>
                        setThresholds({
                          ...thresholds,
                          timeWindowMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1">Tolérance montant USD</label>
                    <input
                      type="number"
                      step="0.1"
                      value={thresholds.amountToleranceUsd}
                      onChange={(e) =>
                        setThresholds({
                          ...thresholds,
                          amountToleranceUsd: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1">Seuil bas crédit USD</label>
                    <input
                      type="number"
                      value={thresholds.creditLowThresholdUsd}
                      onChange={(e) =>
                        setThresholds({
                          ...thresholds,
                          creditLowThresholdUsd: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1">Seuil haut cash USD</label>
                    <input
                      type="number"
                      value={thresholds.cashHighThresholdUsd}
                      onChange={(e) =>
                        setThresholds({
                          ...thresholds,
                          cashHighThresholdUsd: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    saveFinancialThresholds(thresholds);
                    notify('success', 'Seuils de supervision financière enregistrés.');
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                >
                  Enregistrer les seuils
                </button>
              </div>
            </div>
          )}

          {/* Journal comptable immuable */}
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-[#C58B39]" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Journal Comptable Immuable (Append-Only · {ledger.length} écritures)
                </h4>
              </div>
              <button
                type="button"
                onClick={exportGlobalLedgerCsv}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-bold"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exporter CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-2 pr-3">Réf. & Date</th>
                    <th className="py-2 pr-3">Agent / Agence</th>
                    <th className="py-2 pr-3">Opération</th>
                    <th className="py-2 pr-3">Dev.</th>
                    <th className="py-2 pr-3 text-right">Δ Cash</th>
                    <th className="py-2 pr-3 text-right">Δ Virtuel</th>
                    <th className="py-2 text-right">Correction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ledger.slice(0, 80).map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <p className="font-mono font-bold">{e.reference}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(e.createdAt).toLocaleString('fr-FR')}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-semibold">{e.agentName}</p>
                        <p className="text-[10px] text-slate-400">{e.agencyName}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <p>{e.operationCategory.replace(/_/g, ' ')}</p>
                        <p className="text-[10px] text-slate-400 max-w-xs truncate">{e.reason}</p>
                      </td>
                      <td className="py-2 pr-3 font-bold">{e.currency}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-bold">
                        {e.physicalCashDelta > 0 ? '+' : ''}
                        {e.physicalCashDelta}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-bold">
                        {e.virtualCreditDelta > 0 ? '+' : ''}
                        {e.virtualCreditDelta}
                      </td>
                      <td className="py-2 text-right">
                        {isGlobal &&
                          e.operationCategory !== 'contrepassation_correction' &&
                          !e.reversedEntryId && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void createCompensatingReversal({
                                  targetEntryId: e.id,
                                  reason: 'Contrepassation DG suite vérification comptable',
                                  actor: user!,
                                })
                                  .then(() => {
                                    notify(
                                      'success',
                                      `Contrepassation créée pour ${e.reference}.`
                                    );
                                    return loadAll();
                                  })
                                  .catch((err) =>
                                    notify(
                                      'error',
                                      err instanceof Error ? err.message : 'Erreur'
                                    )
                                  )
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Contrepasser</span>
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Drill-down Agent */}
      {drillAgent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-[#C58B39]">
                  FICHE FINANCIÈRE AGENT · {getAgencyName(drillAgent.agencyId)}
                </p>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {drillAgent.displayName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setDrillAgentUid(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {(['USD', 'CDF'] as CurrencyCode[]).map((cur) => {
                const st = stocks.find(
                  (s) => s.agentId === drillAgent.uid && s.currency === cur
                );
                return (
                  <div
                    key={cur}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1"
                  >
                    <p className="font-black text-slate-900 dark:text-white">Stock {cur}</p>
                    <p className="tabular-nums">
                      Cash physique :{' '}
                      <strong>{formatMoney(st?.physicalCashAvailable ?? 0, cur)}</strong>
                    </p>
                    <p className="tabular-nums">
                      Crédit virtuel :{' '}
                      <strong className="text-emerald-600">
                        {formatMoney(st?.virtualCreditAvailable ?? 0, cur)}
                      </strong>
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      Dotations : {formatMoney(st?.totalInitialEndowment ?? 0, cur)} · Crédits
                      reçus : {formatMoney(st?.totalCreditsAllocated ?? 0, cur)}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      Résidu invariant : {st?.invariantResidual ?? 0} {cur}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetAgentUid(drillAgent.uid);
                  setAllocMode('dotation');
                  setDrillAgentUid(null);
                  setActiveTab('allocations');
                }}
                className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C]"
              >
                Dotation / Crédit
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvAgentUid(drillAgent.uid);
                  setDrillAgentUid(null);
                  setActiveTab('inventories');
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-bold"
              >
                Déclencher inventaire
              </button>
              <button
                type="button"
                onClick={() => {
                  void Promise.all([
                    reconcileAndPersistAgentStock({
                      agentId: drillAgent.uid,
                      agentName: drillAgent.displayName,
                      agencyId: drillAgent.agencyId ?? null,
                      agencyName: getAgencyName(drillAgent.agencyId),
                      currency: 'USD',
                    }),
                    reconcileAndPersistAgentStock({
                      agentId: drillAgent.uid,
                      agentName: drillAgent.displayName,
                      agencyId: drillAgent.agencyId ?? null,
                      agencyName: getAgencyName(drillAgent.agencyId),
                      currency: 'CDF',
                    }),
                  ]).then(() => {
                    notify('success', 'Soldes recalculés depuis le journal immuable.');
                    return loadAll();
                  });
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-bold"
              >
                Recalculer depuis le journal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
