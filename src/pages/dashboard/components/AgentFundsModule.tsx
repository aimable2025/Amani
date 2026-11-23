import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Download,
  FileSpreadsheet,
  HandCoins,
  History,
  RefreshCw,
  Send,
  ShieldAlert,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { db, type LocalInternalNumber } from '../../../lib/db';
import type {
  AgentFundStock,
  CashHandover,
  CurrencyCode,
  FinancialAnomaly,
  FinancialLedgerEntry,
  FinancialOperator,
  FinancialTransaction,
  FinancialTransactionType,
  PhysicalInventory,
  ReplenishmentRequest,
  VirtualChannelCount,
} from '../../../types/financialSupervision';
import { getAgency } from '../../../services/AgencyService';
import { recordAgentTransaction } from '../../../services/AgentTransactionService';
import { submitAnomalyJustification } from '../../../services/AnomalyDetectionService';
import {
  formatMoney,
  getAuthorizedAgentFundStocks,
  getAuthorizedFinancialLedger,
  reconcileAndPersistAgentStock,
} from '../../../services/FinancialLedgerService';
import {
  confirmCashHandover,
  initiateCashHandover,
  rejectCashHandover,
} from '../../../services/FundAllocationService';
import { submitAgentInventoryCount } from '../../../services/InventoryControlService';
import {
  cancelReplenishmentRequest,
  submitReplenishmentRequest,
} from '../../../services/ReplenishmentService';
import { triggerSyncNow } from '../../../services/SyncWorker';

type AgentFundsTab =
  | 'guichet'
  | 'reappro'
  | 'handovers'
  | 'inventories'
  | 'anomalies'
  | 'ledger';

const TX_TYPE_LABELS: Record<FinancialTransactionType, string> = {
  depot_client: 'Dépôt Client (Cash reçu → Virtuel envoyé)',
  depot_abonne: 'Dépôt Abonné (Cash reçu → Virtuel envoyé)',
  retrait_client: 'Retrait Client (Virtuel reçu → Cash décaissé)',
  retrait_abonne: 'Retrait Abonné (Virtuel reçu → Cash décaissé)',
  transaction_virtuelle: 'Transaction Virtuelle / Transfert Guichet',
  change_devise: 'Change de Devises (USD ↔ CDF)',
  commission_frais: 'Frais / Commission documentée',
};

const OPERATORS: Array<{ id: FinancialOperator; label: string }> = [
  { id: 'vodacom', label: 'Vodacom M-Pesa' },
  { id: 'airtel', label: 'Airtel Money' },
  { id: 'orange', label: 'Orange Money' },
  { id: 'africell', label: 'Afrimoney' },
  { id: 'caisse_interne', label: 'Caisse Interne Ets AMANI' },
];

export default function AgentFundsModule({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AgentFundsTab>('guichet');
  const [agencyName, setAgencyName] = useState<string>('Agence');
  const [stocks, setStocks] = useState<AgentFundStock[]>([]);
  const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [replenishments, setReplenishments] = useState<ReplenishmentRequest[]>([]);
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [inventories, setInventories] = useState<PhysicalInventory[]>([]);
  const [anomalies, setAnomalies] = useState<FinancialAnomaly[]>([]);
  const [internalNumbers, setInternalNumbers] = useState<LocalInternalNumber[]>([]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Formulaire transaction guichet
  const [txType, setTxType] = useState<FinancialTransactionType>('depot_client');
  const [txOperator, setTxOperator] = useState<FinancialOperator>('vodacom');
  const [txInternalNumId, setTxInternalNumId] = useState<string>('');
  const [txCurrency, setTxCurrency] = useState<CurrencyCode>('USD');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txFeeAmount, setTxFeeAmount] = useState<string>('0');
  const [txCommissionAmount, setTxCommissionAmount] = useState<string>('0');
  const [txTargetCurrency, setTxTargetCurrency] = useState<CurrencyCode>('CDF');
  const [txTargetAmount, setTxTargetAmount] = useState<string>('');
  const [txFxChannel, setTxFxChannel] =
    useState<FinancialTransaction['fxExecutionChannel']>('cash_contre_cash');
  const [txOpRef, setTxOpRef] = useState<string>('');
  const [txClientName, setTxClientName] = useState<string>('');
  const [txClientPhone, setTxClientPhone] = useState<string>('');
  const [txNotes, setTxNotes] = useState<string>('');

  // Formulaire réapprovisionnement
  const [repType, setRepType] = useState<ReplenishmentRequest['requestType']>('credit_virtuel');
  const [repCurrency, setRepCurrency] = useState<CurrencyCode>('USD');
  const [repAmount, setRepAmount] = useState<string>('');
  const [repOperator, setRepOperator] = useState<FinancialOperator>('vodacom');
  const [repUrgency, setRepUrgency] = useState<ReplenishmentRequest['urgency']>('normale');
  const [repReason, setRepReason] = useState<string>('');

  // Formulaire remise de cash
  const [handoverDirection, setHandoverDirection] =
    useState<CashHandover['direction']>('agent_vers_direction');
  const [handoverCurrency, setHandoverCurrency] = useState<CurrencyCode>('USD');
  const [handoverAmount, setHandoverAmount] = useState<string>('');
  const [handoverReason, setHandoverReason] = useState<string>('');

  // Inventaire actif sélectionné pour saisie
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [invCashUsd, setInvCashUsd] = useState<string>('0');
  const [invCashCdf, setInvCashCdf] = useState<string>('0');
  const [invVirtualUsd, setInvVirtualUsd] = useState<string>('0');
  const [invVirtualCdf, setInvVirtualCdf] = useState<string>('0');
  const [invUndeclaredCount, setInvUndeclaredCount] = useState<string>('0');
  const [invNotes, setInvNotes] = useState<string>('');

  // Justification anomalie
  const [justifyingAnomalyId, setJustifyingAnomalyId] = useState<string | null>(null);
  const [justificationText, setJustificationText] = useState<string>('');

  // Filtre journal
  const [ledgerCurrencyFilter, setLedgerCurrencyFilter] = useState<'ALL' | CurrencyCode>('ALL');

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 6500);
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let resolvedAgency = user.agencyId || 'Agence';
      if (user.agencyId) {
        const ag = await getAgency(user.agencyId);
        if (ag?.name) resolvedAgency = ag.name;
      }
      setAgencyName(resolvedAgency);

      // S'assurer que les projections USD et CDF existent et sont recalculées à partir du journal
      await Promise.all([
        reconcileAndPersistAgentStock({
          agentId: user.uid,
          agentName: user.displayName,
          agencyId: user.agencyId ?? null,
          agencyName: resolvedAgency,
          currency: 'USD',
        }),
        reconcileAndPersistAgentStock({
          agentId: user.uid,
          agentName: user.displayName,
          agencyId: user.agencyId ?? null,
          agencyName: resolvedAgency,
          currency: 'CDF',
        }),
      ]);

      const [
        authorizedStocks,
        authorizedLedger,
        txList,
        repList,
        handList,
        invList,
        anoList,
        nums,
      ] = await Promise.all([
        getAuthorizedAgentFundStocks(user),
        getAuthorizedFinancialLedger(user),
        db.financialTransactions
          .where('agentId')
          .equals(user.uid)
          .toArray()
          .then((r) => r.sort((a, b) => b.createdAt - a.createdAt)),
        db.replenishmentRequests
          .where('agentId')
          .equals(user.uid)
          .toArray()
          .then((r) => r.sort((a, b) => b.createdAt - a.createdAt)),
        db.cashHandovers
          .where('agentId')
          .equals(user.uid)
          .toArray()
          .then((r) => r.sort((a, b) => b.createdAt - a.createdAt)),
        db.physicalInventories
          .where('agentId')
          .equals(user.uid)
          .toArray()
          .then((r) => r.sort((a, b) => b.createdAt - a.createdAt)),
        db.financialAnomalies
          .where('agentId')
          .equals(user.uid)
          .toArray()
          .then((r) => r.sort((a, b) => b.createdAt - a.createdAt)),
        db.internalNumbers
          .filter((n) => n.status === 'active')
          .toArray(),
      ]);

      setStocks(authorizedStocks);
      setLedger(authorizedLedger);
      setTransactions(txList);
      setReplenishments(repList);
      setHandovers(handList);
      setInventories(invList);
      setAnomalies(anoList);

      const scopedNums = nums.filter(
        (n) => n.assignedUserId === user.uid || (user.agencyId && n.agencyId === user.agencyId)
      );
      setInternalNumbers(scopedNums);
      if (!txInternalNumId && scopedNums.length > 0) {
        setTxInternalNumId(scopedNums[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [user, txInternalNumId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const usdStock = useMemo(
    () => stocks.find((s) => s.currency === 'USD') || null,
    [stocks]
  );
  const cdfStock = useMemo(
    () => stocks.find((s) => s.currency === 'CDF') || null,
    [stocks]
  );

  const pendingInventoriesCount = useMemo(
    () =>
      inventories.filter(
        (i) => i.status === 'en_attente_agent' || i.status === 'justification_demandee'
      ).length,
    [inventories]
  );
  const pendingHandoversIncoming = useMemo(
    () =>
      handovers.filter(
        (h) =>
          h.status === 'en_attente_confirmation' &&
          h.direction === 'direction_vers_agent' &&
          h.initiatedByUid !== user?.uid
      ).length,
    [handovers, user?.uid]
  );
  const openAnomaliesCount = useMemo(
    () => anomalies.filter((a) => a.status !== 'cloturee').length,
    [anomalies]
  );

  const handleRecordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const selectedNum = internalNumbers.find((n) => n.id === txInternalNumId);
      const res = await recordAgentTransaction({
        transactionType: txType,
        operator: txType === 'change_devise' ? 'caisse_interne' : txOperator,
        internalNumberId: selectedNum?.id ?? null,
        internalPhoneNumber: selectedNum?.phoneNumber ?? null,
        externalOperatorRef: txOpRef || null,
        clientName: txClientName || null,
        clientPhone: txClientPhone || null,
        currency: txCurrency,
        amount: Number(txAmount),
        feeAmount: Number(txFeeAmount || 0),
        commissionAmount: Number(txCommissionAmount || 0),
        targetCurrency: txType === 'change_devise' ? txTargetCurrency : null,
        targetAmount: txType === 'change_devise' ? Number(txTargetAmount || 0) : null,
        exchangeRate:
          txType === 'change_devise' && Number(txAmount) > 0
            ? Number(txTargetAmount || 0) / Number(txAmount)
            : null,
        fxExecutionChannel: txType === 'change_devise' ? txFxChannel : null,
        notes: txNotes || null,
        agencyName,
        agent: user,
      });

      setTxAmount('');
      setTxTargetAmount('');
      setTxOpRef('');
      setTxNotes('');
      notify(
        'success',
        `Transaction ${res.transaction.reference} enregistrée (${res.transaction.syncLifecycle}).`
      );
      await loadData();
    } catch (err) {
      notify(
        'error',
        err instanceof Error ? err.message : 'Erreur lors de la validation de la transaction.'
      );
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReplenishment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const req = await submitReplenishmentRequest({
        requestType: repType,
        currency: repCurrency,
        requestedAmount: Number(repAmount),
        operator: repOperator,
        urgency: repUrgency,
        reason: repReason,
        agencyName,
        agent: user,
      });
      setRepAmount('');
      setRepReason('');
      notify('success', `Demande ${req.reference} transmise au Directeur Général.`);
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Impossible de soumettre la demande.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitiateHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const h = await initiateCashHandover({
        direction: handoverDirection,
        agent: {
          uid: user.uid,
          displayName: user.displayName,
          agencyId: user.agencyId ?? null,
          agencyName,
        },
        currency: handoverCurrency,
        amount: Number(handoverAmount),
        reason: handoverReason,
        actor: user,
      });
      setHandoverAmount('');
      setHandoverReason('');
      notify(
        'success',
        `Remise ${h.reference} initiée. En attente de confirmation par la contrepartie.`
      );
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur remise de cash.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmHandover = async (handoverId: string) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const res = await confirmCashHandover({ handoverId, confirmer: user });
      notify('success', `Réception ${res.handover.reference} confirmée et inscrite au journal.`);
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Confirmation refusée.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectHandover = async (handoverId: string) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await rejectCashHandover({
        handoverId,
        rejectionReason: 'Montant ou remise non conforme au guichet',
        actor: user,
      });
      notify('success', 'Remise marquée comme rejetée.');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur rejet.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedInvId) return;
    setSubmitting(true);
    try {
      const channels: VirtualChannelCount[] = [
        { operator: 'vodacom', currency: 'USD', countedAmount: Number(invVirtualUsd || 0) },
        { operator: 'vodacom', currency: 'CDF', countedAmount: Number(invVirtualCdf || 0) },
      ];
      const updated = await submitAgentInventoryCount({
        inventoryId: selectedInvId,
        countedPhysicalCashUsd: Number(invCashUsd || 0),
        countedPhysicalCashCdf: Number(invCashCdf || 0),
        virtualChannelsBreakdown: channels,
        undeclaredOperationsCount: Number(invUndeclaredCount || 0),
        agentNotes: invNotes,
        agent: user,
      });
      setSelectedInvId(null);
      notify('success', `Comptage ${updated.reference} transmis pour validation finale.`);
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur soumission inventaire.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJustifyAnomaly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !justifyingAnomalyId) return;
    setSubmitting(true);
    try {
      await submitAnomalyJustification({
        anomalyId: justifyingAnomalyId,
        justification: justificationText,
        agent: user,
      });
      setJustifyingAnomalyId(null);
      setJustificationText('');
      notify('success', 'Justification transmise à la supervision.');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur justification.');
    } finally {
      setSubmitting(false);
    }
  };

  const exportLedgerCsv = () => {
    const filtered =
      ledgerCurrencyFilter === 'ALL'
        ? ledger
        : ledger.filter((l) => l.currency === ledgerCurrencyFilter);
    const headers = [
      'Reference',
      'Date',
      'Categorie',
      'Devise',
      'Delta_Cash',
      'Delta_Virtuel',
      'Cash_Apres',
      'Virtuel_Apres',
      'Cycle_Synchro',
      'Motif',
    ];
    const rows = filtered.map((e) => [
      e.reference,
      new Date(e.createdAt).toISOString(),
      e.operationCategory,
      e.currency,
      e.physicalCashDelta,
      e.virtualCreditDelta,
      e.physicalCashAfter,
      e.virtualCreditAfter,
      e.syncLifecycle,
      `"${(e.reason || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-fonds-${user?.displayName || 'agent'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLedger = useMemo(
    () =>
      ledgerCurrencyFilter === 'ALL'
        ? ledger
        : ledger.filter((e) => e.currency === ledgerCurrencyFilter),
    [ledger, ledgerCurrencyFilter]
  );

  return (
    <div className="space-y-4">
      {/* En-tête & Actions synchronisation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#C58B39]">
            CAISSE PHYSIQUE & CRÉDIT VIRTUEL · {agencyName}
          </p>
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
            Gestion des Fonds Agent & Contrôle Guichet
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              void triggerSyncNow().then(() => loadData());
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Synchroniser</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Retour
            </button>
          )}
        </div>
      </div>

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

      {/* Deux blocs strictement séparés par devise : USD et CDF */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[
          { code: 'USD' as CurrencyCode, stock: usdStock },
          { code: 'CDF' as CurrencyCode, stock: cdfStock },
        ].map(({ code, stock }) => {
          const isCreditLow =
            stock && stock.virtualCreditAvailable < stock.creditLowThreshold;
          const isCashHigh =
            stock && stock.physicalCashAvailable > stock.cashHighThreshold;
          const hasPending =
            stock &&
            (Math.abs(stock.physicalCashPendingDelta) > 0.001 ||
              Math.abs(stock.virtualCreditPendingDelta) > 0.001);

          return (
            <section
              key={code}
              aria-label={`Fonds ${code}`}
              className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#C58B39]" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Portefeuille {code}
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {stock?.status === 'frozen'
                    ? 'Gelé'
                    : stock?.status === 'suspended'
                      ? 'Suspendu'
                      : hasPending
                        ? 'En attente synchro'
                        : 'Confirmé serveur'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Cash physique disponible
                  </p>
                  <p className="mt-0.5 text-lg font-black tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(stock?.physicalCashAvailable ?? 0, code)}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Serveur : {formatMoney(stock?.physicalCashConfirmed ?? 0, code)}
                    {stock && stock.physicalCashPendingDelta !== 0
                      ? ` · Local : ${stock.physicalCashPendingDelta > 0 ? '+' : ''}${formatMoney(stock.physicalCashPendingDelta, code)}`
                      : ''}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Crédit virtuel disponible
                  </p>
                  <p
                    className={`mt-0.5 text-lg font-black tabular-nums ${
                      (stock?.virtualCreditAvailable ?? 0) <= 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatMoney(stock?.virtualCreditAvailable ?? 0, code)}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Serveur : {formatMoney(stock?.virtualCreditConfirmed ?? 0, code)}
                    {stock && stock.virtualCreditPendingDelta !== 0
                      ? ` · Local : ${stock.virtualCreditPendingDelta > 0 ? '+' : ''}${formatMoney(stock.virtualCreditPendingDelta, code)}`
                      : ''}
                  </p>
                </div>
              </div>

              {(isCreditLow || isCashHigh || stock?.syncStatus === 'conflict') && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                  <span className="text-amber-700 dark:text-amber-400 font-semibold">
                    {stock?.syncStatus === 'conflict'
                      ? 'Conflit serveur à résoudre avant toute nouvelle écriture.'
                      : isCreditLow
                        ? `Crédit virtuel bas (< ${formatMoney(stock.creditLowThreshold, code)}).`
                        : `Cash physique élevé (> ${formatMoney(stock!.cashHighThreshold, code)}).`}
                  </span>
                  {isCreditLow && (
                    <button
                      type="button"
                      onClick={() => {
                        setRepCurrency(code);
                        setRepType('credit_virtuel');
                        setActiveTab('reappro');
                      }}
                      className="font-bold text-[#C58B39] hover:underline whitespace-nowrap"
                    >
                      Demander réapprovisionnement →
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Onglets opérationnels agent */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'guichet' as AgentFundsTab, label: 'Saisie Guichet', icon: Send },
          { id: 'reappro' as AgentFundsTab, label: 'Réapprovisionnement', icon: Coins },
          {
            id: 'handovers' as AgentFundsTab,
            label:
              pendingHandoversIncoming > 0
                ? `Remises Cash (${pendingHandoversIncoming})`
                : 'Remises Cash',
            icon: HandCoins,
          },
          {
            id: 'inventories' as AgentFundsTab,
            label:
              pendingInventoriesCount > 0
                ? `Inventaires (${pendingInventoriesCount})`
                : 'Inventaires',
            icon: ClipboardCheck,
          },
          {
            id: 'anomalies' as AgentFundsTab,
            label:
              openAnomaliesCount > 0
                ? `Alertes (${openAnomaliesCount})`
                : 'Alertes & Justifications',
            icon: ShieldAlert,
          },
          { id: 'ledger' as AgentFundsTab, label: 'Journal Personnel', icon: History },
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

      {/* CONTENU DES ONGLETS */}
      {activeTab === 'guichet' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <form
            onSubmit={handleRecordTx}
            className="lg:col-span-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Déclarer une transaction guichet
            </h4>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Nature de l&apos;opération
              </label>
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as FinancialTransactionType)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
              >
                {Object.entries(TX_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Opérateur / Canal
                </label>
                <select
                  value={txOperator}
                  onChange={(e) => setTxOperator(e.target.value as FinancialOperator)}
                  disabled={txType === 'change_devise'}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {OPERATORS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Numéro interne flotte
                </label>
                <select
                  value={txInternalNumId}
                  onChange={(e) => setTxInternalNumId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">Aucun / Non applicable</option>
                  {internalNumbers.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.phoneNumber} ({n.operator})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {txType === 'change_devise' ? 'Devise reçue' : 'Devise'}
                </label>
                <select
                  value={txCurrency}
                  onChange={(e) => {
                    const next = e.target.value as CurrencyCode;
                    setTxCurrency(next);
                    setTxTargetCurrency(next === 'USD' ? 'CDF' : 'USD');
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="USD">USD ($)</option>
                  <option value="CDF">CDF (FC)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Montant *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {txType === 'change_devise' && (
              <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Devise remise ({txTargetCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={txTargetAmount}
                    onChange={(e) => setTxTargetAmount(e.target.value)}
                    placeholder="Montant remis"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Canal change
                  </label>
                  <select
                    value={txFxChannel || 'cash_contre_cash'}
                    onChange={(e) =>
                      setTxFxChannel(
                        e.target.value as FinancialTransaction['fxExecutionChannel']
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="cash_contre_cash">Cash ↔ Cash</option>
                    <option value="virtuel_contre_cash">Virtuel reçu → Cash remis</option>
                    <option value="cash_contre_virtuel">Cash reçu → Virtuel remis</option>
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Frais encaissés
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={txFeeAmount}
                  onChange={(e) => setTxFeeAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs tabular-nums text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Réf. SMS Opérateur
                </label>
                <input
                  type="text"
                  value={txOpRef}
                  onChange={(e) => setTxOpRef(e.target.value)}
                  placeholder="Ex. MPESA839201"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={txClientName}
                onChange={(e) => setTxClientName(e.target.value)}
                placeholder="Nom client / abonné"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="tel"
                value={txClientPhone}
                onChange={(e) => setTxClientPhone(e.target.value)}
                placeholder="Téléphone client"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <input
              type="text"
              value={txNotes}
              onChange={(e) => setTxNotes(e.target.value)}
              placeholder="Note / commentaire (facultatif)"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#0B192C] dark:bg-[#C58B39] py-2.5 text-xs font-black text-white dark:text-[#0B192C] hover:opacity-95 disabled:opacity-50"
            >
              {submitting ? 'Contrôle des stocks & enregistrement...' : 'Valider la transaction'}
            </button>
          </form>

          {/* Historique des transactions déclarées */}
          <div className="lg:col-span-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Dernières transactions ({transactions.length})
              </h4>
            </div>
            {transactions.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Aucune transaction financière enregistrée sur ce guichet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[520px] overflow-y-auto">
                {transactions.slice(0, 40).map((tx) => (
                  <div key={tx.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        {tx.reference} · {tx.transactionType.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {tx.operator.toUpperCase()} · {tx.externalOperatorRef || 'Sans réf. SMS'} ·{' '}
                        {new Date(tx.createdAt).toLocaleString('fr-FR')}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Rapprochement :{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {tx.reconciliationStatus}
                        </span>{' '}
                        · Synchro : {tx.syncLifecycle}
                      </p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <p className="font-black text-slate-900 dark:text-white">
                        {formatMoney(tx.amount, tx.currency)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Cash {tx.physicalCashDelta >= 0 ? '+' : ''}
                        {tx.physicalCashDelta} · Virt {tx.virtualCreditDelta >= 0 ? '+' : ''}
                        {tx.virtualCreditDelta}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'reappro' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <form
            onSubmit={handleSubmitReplenishment}
            className="lg:col-span-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Nouvelle demande au Directeur Général
            </h4>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Type demandé
                </label>
                <select
                  value={repType}
                  onChange={(e) =>
                    setRepType(e.target.value as ReplenishmentRequest['requestType'])
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="credit_virtuel">Crédit Virtuel</option>
                  <option value="cash_physique">Cash Physique</option>
                  <option value="mixte">Mixte</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Devise
                </label>
                <select
                  value={repCurrency}
                  onChange={(e) => setRepCurrency(e.target.value as CurrencyCode)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="USD">USD ($)</option>
                  <option value="CDF">CDF (FC)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Montant demandé *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={repAmount}
                  onChange={(e) => setRepAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Urgence
                </label>
                <select
                  value={repUrgency}
                  onChange={(e) =>
                    setRepUrgency(e.target.value as ReplenishmentRequest['urgency'])
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="normale">Normale</option>
                  <option value="urgente">Urgente</option>
                  <option value="critique">Critique (Rupture)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Opérateur ciblé
              </label>
              <select
                value={repOperator}
                onChange={(e) => setRepOperator(e.target.value as FinancialOperator)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              >
                {OPERATORS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Justification / Besoin client *
              </label>
              <textarea
                rows={3}
                required
                value={repReason}
                onChange={(e) => setRepReason(e.target.value)}
                placeholder="Ex. Forte demande dépôts M-Pesa USD au guichet..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#0B192C] dark:bg-[#C58B39] py-2.5 text-xs font-black text-white dark:text-[#0B192C] hover:opacity-95 disabled:opacity-50"
            >
              Envoyer la demande de réapprovisionnement
            </button>
          </form>

          <div className="lg:col-span-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Mes demandes ({replenishments.length})
            </h4>
            {replenishments.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Aucune demande soumise pour le moment.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {replenishments.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {r.reference} · {formatMoney(r.requestedAmount, r.currency)} ({r.requestType})
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Statut : <span className="font-bold uppercase">{r.status}</span> ·{' '}
                        {new Date(r.createdAt).toLocaleString('fr-FR')}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        {r.reason}
                      </p>
                      {r.rejectionReason && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                          Motif rejet : {r.rejectionReason}
                        </p>
                      )}
                    </div>
                    {r.status === 'en_attente' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!user) return;
                          void cancelReplenishmentRequest({ requestId: r.id, agent: user }).then(
                            () => loadData()
                          );
                        }}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'handovers' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <form
            onSubmit={handleInitiateHandover}
            className="lg:col-span-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Remise de cash physique (validation bilatérale)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Votre cash disponible ne sera déduit qu&apos;après confirmation expresse du destinataire.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Destination
              </label>
              <select
                value={handoverDirection}
                onChange={(e) =>
                  setHandoverDirection(e.target.value as CashHandover['direction'])
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="agent_vers_direction">Remise vers Direction Générale</option>
                <option value="agent_vers_caisse_agence">Remise vers Caisse Agence</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Devise
                </label>
                <select
                  value={handoverCurrency}
                  onChange={(e) => setHandoverCurrency(e.target.value as CurrencyCode)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="USD">USD ($)</option>
                  <option value="CDF">CDF (FC)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Montant remis *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={handoverAmount}
                  onChange={(e) => setHandoverAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <input
              type="text"
              required
              value={handoverReason}
              onChange={(e) => setHandoverReason(e.target.value)}
              placeholder="Bordereau / Motif de versement *"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#0B192C] dark:bg-[#C58B39] py-2.5 text-xs font-black text-white dark:text-[#0B192C] hover:opacity-95 disabled:opacity-50"
            >
              Déclarer la remise de cash
            </button>
          </form>

          <div className="lg:col-span-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Mouvements cash en attente & historique ({handovers.length})
            </h4>
            {handovers.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Aucune remise ou réception enregistrée.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {handovers.map((h) => {
                  const canConfirm =
                    h.status === 'en_attente_confirmation' &&
                    h.direction === 'direction_vers_agent' &&
                    h.initiatedByUid !== user?.uid;
                  return (
                    <div key={h.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {h.direction === 'direction_vers_agent' ? (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          <span>
                            {h.reference} · {formatMoney(h.amount, h.currency)}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {h.direction.replace(/_/g, ' ')} · Statut :{' '}
                          <span className="font-bold">{h.status}</span>
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">{h.reason}</p>
                      </div>
                      {canConfirm && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleConfirmHandover(h.id)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90 whitespace-nowrap"
                          >
                            Confirmer réception
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRejectHandover(h.id)}
                            className="rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 whitespace-nowrap"
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

      {activeTab === 'inventories' && (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Contrôles d&apos;inventaire & Clôtures ({inventories.length})
            </h4>
          </div>

          {selectedInvId && (
            <form
              onSubmit={handleSubmitInventory}
              className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-4 space-y-3"
            >
              <p className="text-xs font-black text-slate-900 dark:text-white">
                Saisie contradictoire d&apos;inventaire physique et virtuel
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label className="block font-bold mb-1">Cash compté USD</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={invCashUsd}
                    onChange={(e) => setInvCashUsd(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Virtuel total USD</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={invVirtualUsd}
                    onChange={(e) => setInvVirtualUsd(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Cash compté CDF</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={invCashCdf}
                    onChange={(e) => setInvCashCdf(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Virtuel total CDF</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={invVirtualCdf}
                    onChange={(e) => setInvVirtualCdf(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="block font-bold mb-1">Opérations non encore déclarées</label>
                  <input
                    type="number"
                    min="0"
                    value={invUndeclaredCount}
                    onChange={(e) => setInvUndeclaredCount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1">Observations d&apos;inventaire</label>
                  <input
                    type="text"
                    value={invNotes}
                    onChange={(e) => setInvNotes(e.target.value)}
                    placeholder="Billets abîmés, opérations en cours de synchro..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedInvId(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-4 py-1.5 text-xs font-black text-white dark:text-[#0B192C]"
                >
                  Transmettre le comptage
                </button>
              </div>
            </form>
          )}

          {inventories.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              Aucun contrôle d&apos;inventaire assigné.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {inventories.map((inv) => (
                <div key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {inv.reference} · {inv.controlType.toUpperCase()} · Statut : {inv.status}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Demandé par {inv.requestedByName} le{' '}
                      {new Date(inv.requestedAt).toLocaleString('fr-FR')}
                    </p>
                    {inv.submittedAt && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums mt-0.5">
                        Écarts USD (Cash {inv.discrepancyCashUsd} / Virt {inv.discrepancyVirtualUsd}) ·
                        CDF (Cash {inv.discrepancyCashCdf} / Virt {inv.discrepancyVirtualCdf})
                      </p>
                    )}
                  </div>
                  {(inv.status === 'en_attente_agent' || inv.status === 'justification_demandee') &&
                    !inv.immutableLocked && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInvId(inv.id);
                          setInvCashUsd(String(inv.theoreticalPhysicalCashUsd));
                          setInvCashCdf(String(inv.theoreticalPhysicalCashCdf));
                          setInvVirtualUsd(String(inv.theoreticalVirtualCreditUsd));
                          setInvVirtualCdf(String(inv.theoreticalVirtualCreditCdf));
                        }}
                        className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C] whitespace-nowrap"
                      >
                        Saisir comptage
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
            Anomalies & Demandes de justification ({anomalies.length})
          </h4>
          {anomalies.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              Aucune alerte active sur votre compte.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {anomalies.map((ano) => (
                <div key={ano.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {ano.reference} · {ano.title} ({ano.status})
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        {ano.description}
                      </p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 italic mt-1">
                        {ano.warningDisclaimer}
                      </p>
                      {ano.agentJustification && (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                          Votre justification : {ano.agentJustification}
                        </p>
                      )}
                    </div>
                    {ano.status !== 'cloturee' && ano.status !== 'justifiee' && (
                      <button
                        type="button"
                        onClick={() => {
                          setJustifyingAnomalyId(ano.id);
                          setJustificationText(ano.agentJustification || '');
                        }}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 text-[11px] font-bold hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        Justifier
                      </button>
                    )}
                  </div>

                  {justifyingAnomalyId === ano.id && (
                    <form onSubmit={handleJustifyAnomaly} className="flex gap-2 pt-1">
                      <input
                        type="text"
                        required
                        value={justificationText}
                        onChange={(e) => setJustificationText(e.target.value)}
                        placeholder="Expliquez la cause exacte de cet écart ou retard..."
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap"
                      >
                        Envoyer
                      </button>
                      <button
                        type="button"
                        onClick={() => setJustifyingAnomalyId(null)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#C58B39]" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Journal comptable immuable ({filteredLedger.length})
              </h4>
            </div>
            <div className="flex items-center gap-2">
              {(['ALL', 'USD', 'CDF'] as const).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setLedgerCurrencyFilter(cur)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    ledgerCurrencyFilter === cur
                      ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {cur === 'ALL' ? 'Toutes devises' : cur}
                </button>
              ))}
              <button
                type="button"
                onClick={exportLedgerCsv}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                  <th className="py-2 pr-3">Réf. & Date</th>
                  <th className="py-2 pr-3">Catégorie</th>
                  <th className="py-2 pr-3">Devise</th>
                  <th className="py-2 pr-3 text-right">Δ Cash</th>
                  <th className="py-2 pr-3 text-right">Δ Virtuel</th>
                  <th className="py-2 pr-3 text-right">Soldes après</th>
                  <th className="py-2">Cycle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLedger.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <p className="font-mono font-bold text-slate-900 dark:text-white">
                        {e.reference}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(e.createdAt).toLocaleString('fr-FR')}
                      </p>
                    </td>
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {e.operationCategory.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[10px] text-slate-400 max-w-xs truncate">{e.reason}</p>
                    </td>
                    <td className="py-2 pr-3 font-bold">{e.currency}</td>
                    <td
                      className={`py-2 pr-3 text-right font-bold tabular-nums ${
                        e.physicalCashDelta > 0
                          ? 'text-emerald-600'
                          : e.physicalCashDelta < 0
                            ? 'text-rose-600'
                            : 'text-slate-400'
                      }`}
                    >
                      {e.physicalCashDelta > 0 ? '+' : ''}
                      {e.physicalCashDelta}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-bold tabular-nums ${
                        e.virtualCreditDelta > 0
                          ? 'text-emerald-600'
                          : e.virtualCreditDelta < 0
                            ? 'text-rose-600'
                            : 'text-slate-400'
                      }`}
                    >
                      {e.virtualCreditDelta > 0 ? '+' : ''}
                      {e.virtualCreditDelta}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[11px] text-slate-700 dark:text-slate-300">
                      Cash {e.physicalCashAfter} · Virt {e.virtualCreditAfter}
                    </td>
                    <td className="py-2 text-[10px] font-semibold text-slate-500">
                      {e.syncLifecycle}
                    </td>
                  </tr>
                ))}
                {filteredLedger.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Aucune écriture comptable enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
