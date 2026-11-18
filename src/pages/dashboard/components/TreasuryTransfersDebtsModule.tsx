import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  Clock,
  Coins,
  Plus,
  RefreshCw,
  Scale,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type { LocalDebt, LocalInterAgencyTransfer } from '../../../lib/db';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import {
  createDebtRecord,
  getAuthorizedDebts,
  getAuthorizedTransfers,
  initiateInterAgencyTransfer,
  recordDebtRepayment,
  updateInterAgencyTransferStatus,
} from '../../../services/EnterpriseOperationsService';
import { triggerSyncNow } from '../../../services/SyncWorker';
import { verifyBiometricIdentity } from '../../../services/BiometricAuthService';

interface TreasuryTransfersDebtsModuleProps {
  mode?: 'transfers' | 'debts' | 'both';
  initialTab?: 'transfers' | 'debts';
  onClose?: () => void;
}

export default function TreasuryTransfersDebtsModule({
  mode = 'both',
  initialTab = 'transfers',
  onClose,
}: TreasuryTransfersDebtsModuleProps) {
  const { user } = useAuth();
  const isGlobalRole =
    user?.role === 'administrateur_systeme' || user?.role === 'directeur_general';

  const effectiveInitialTab =
    mode === 'transfers' ? 'transfers' : mode === 'debts' ? 'debts' : initialTab;
  const [activeTab, setActiveTab] = useState<'transfers' | 'debts'>(effectiveInitialTab);

  useEffect(() => {
    if (mode === 'transfers') setActiveTab('transfers');
    if (mode === 'debts') setActiveTab('debts');
  }, [mode]);
  const [transfers, setTransfers] = useState<LocalInterAgencyTransfer[]>([]);
  const [debts, setDebts] = useState<LocalDebt[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Formulaire Transfert Inter-Agences
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferType, setTransferType] =
    useState<LocalInterAgencyTransfer['transferType']>('argent_physique');
  const [sourceAgencyId, setSourceAgencyId] = useState<string>(user?.agencyId || '');
  const [targetAgencyId, setTargetAgencyId] = useState<string>('');
  const [trfAmount, setTrfAmount] = useState<string>('');
  const [trfCurrency, setTrfCurrency] = useState<'USD' | 'CDF'>('USD');
  const [trfChannel, setTrfChannel] = useState<string>('Convoyage Coffre / Guichet');
  const [trfReason, setTrfReason] = useState<string>('');

  // Formulaire Nouvelle Dette
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [debtCategory, setDebtCategory] = useState<LocalDebt['category']>('client');
  const [debtorName, setDebtorName] = useState<string>('');
  const [debtorPhone, setDebtorPhone] = useState<string>('');
  const [debtAgencyId, setDebtAgencyId] = useState<string>(user?.agencyId || '');
  const [debtCurrency, setDebtCurrency] = useState<'USD' | 'CDF'>('USD');
  const [debtAmount, setDebtAmount] = useState<string>('');
  const [debtReason, setDebtReason] = useState<string>('');
  const [debtDueDate, setDebtDueDate] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );

  // Remboursement unitaire sur une dette
  const [repayingDebtId, setRepayingDebtId] = useState<string | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState<string>('');
  const [repaymentNote, setRepaymentNote] = useState<string>('');

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [trfList, debtList, agList] = await Promise.all([
        getAuthorizedTransfers(user),
        getAuthorizedDebts(user),
        getAgencies(),
      ]);
      setTransfers(trfList);
      setDebts(debtList);
      setAgencies(agList);
      if (!sourceAgencyId && (user.agencyId || agList[0]?.id)) {
        setSourceAgencyId(user.agencyId || agList[0]?.id || '');
      }
      if (!debtAgencyId && (user.agencyId || agList[0]?.id)) {
        setDebtAgencyId(user.agencyId || agList[0]?.id || '');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.uid, user?.agencyId]);

  const resolveAgencyName = (id: string): string => {
    const found = agencies.find((a) => a.id === id);
    return found ? `${found.name} (${found.code})` : id || 'Agence Centrale';
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    try {
      const srcId = isGlobalRole ? sourceAgencyId : user.agencyId || sourceAgencyId;
      if (!srcId || !targetAgencyId) {
        throw new Error('Veuillez sélectionner les agences source et destinataire.');
      }

      // Vérification biométrique pour autoriser le transfert de trésorerie
      await verifyBiometricIdentity({
        user,
        actionTitle: 'Transfert de Fonds Inter-Agences',
        actionDescription: `Autorisation de transfert de ${Number(trfAmount).toLocaleString('fr-FR')} ${trfCurrency} vers ${resolveAgencyName(targetAgencyId)}`,
      });

      const created = await initiateInterAgencyTransfer(
        {
          transferType,
          sourceAgencyId: srcId,
          sourceAgencyName: resolveAgencyName(srcId),
          targetAgencyId,
          targetAgencyName: resolveAgencyName(targetAgencyId),
          amount: Number(trfAmount),
          currency: trfCurrency,
          operatorOrChannel: trfChannel,
          reason: trfReason,
        },
        user
      );
      setTrfAmount('');
      setTrfReason('');
      setShowTransferForm(false);
      setFeedback(`Transfert ${created.reference} enregistré.`);
      setTimeout(() => setFeedback(null), 3500);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de transfert.');
    }
  };

  const handleTransferAction = async (
    trfId: string,
    nextStatus: 'valide' | 'recu' | 'rejete'
  ) => {
    if (!user) return;
    try {
      await updateInterAgencyTransferStatus(trfId, nextStatus, user);
      setFeedback(`Statut du transfert mis à jour : ${nextStatus}.`);
      setTimeout(() => setFeedback(null), 3500);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Action refusée.');
    }
  };

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    try {
      const agId = isGlobalRole ? debtAgencyId : user.agencyId || debtAgencyId;
      const created = await createDebtRecord(
        {
          category: debtCategory,
          debtorName,
          debtorPhone,
          agencyId: agId,
          agencyName: resolveAgencyName(agId),
          currency: debtCurrency,
          initialAmount: Number(debtAmount),
          reason: debtReason,
          dueDate: new Date(debtDueDate).getTime(),
        },
        user
      );
      setDebtorName('');
      setDebtorPhone('');
      setDebtAmount('');
      setDebtReason('');
      setShowDebtForm(false);
      setFeedback(`Dette ${created.reference} enregistrée.`);
      setTimeout(() => setFeedback(null), 3500);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur création dette.');
    }
  };

  const handleRepayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !repayingDebtId || !repaymentAmount) return;
    setErrorMsg(null);
    try {
      // Vérification biométrique pour encaisser et imputer un remboursement de dette
      await verifyBiometricIdentity({
        user,
        actionTitle: 'Encaissement Remboursement Dette',
        actionDescription: `Validation d'encaissement de ${Number(repaymentAmount).toLocaleString('fr-FR')} pour la créance`,
      });

      await recordDebtRepayment(
        repayingDebtId,
        Number(repaymentAmount),
        repaymentNote || 'Remboursement enregistré au guichet',
        user
      );
      setRepayingDebtId(null);
      setRepaymentAmount('');
      setRepaymentNote('');
      setFeedback('Remboursement imputé avec succès.');
      setTimeout(() => setFeedback(null), 3500);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur remboursement.');
    }
  };

  const debtTotals = useMemo(() => {
    let usd = 0;
    let cdf = 0;
    for (const d of debts) {
      if (d.status !== 'rembourse') {
        if (d.currency === 'USD') usd += d.remainingAmount;
        if (d.currency === 'CDF') cdf += d.remainingAmount;
      }
    }
    return { usd, cdf };
  }, [debts]);

  return (
    <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {mode === 'transfers' ? 'FLUX & CAISSE' : mode === 'debts' ? 'ENGAGEMENTS' : 'TRÉSORERIE RÉSEAU'}
          </p>
          <h2 className="mt-0.5 text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {mode === 'transfers'
              ? 'Transferts'
              : mode === 'debts'
                ? 'Dettes & Créances'
                : 'Transferts & Trésorerie'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'transfers'
              ? 'Mouvements de fonds inter-succursales (espèces, virtuel et ravitaillements).'
              : mode === 'debts'
                ? 'Suivi des dettes clients, agents et entreprise, échéances et remboursements.'
                : 'Mouvements de fonds inter-succursales, ravitaillements et recouvrement des créances.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'both' && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab('transfers')}
                className={`whitespace-nowrap shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === 'transfers'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Transferts ({transfers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('debts')}
                className={`whitespace-nowrap shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === 'debts'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
                }`}
              >
                <Scale className="h-3.5 w-3.5" />
                Dettes & Créances ({debts.filter((d) => d.status !== 'rembourse').length})
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={loadData}
            className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ONGLET 1 : TRANSFERTS INTER-AGENCES */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Traçabilité complète des transferts d'espèces, monnaie virtuelle et ravitaillements entre agences.
            </p>
            <button
              type="button"
              onClick={() => setShowTransferForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <Plus className="h-3.5 w-3.5" />
              {showTransferForm ? 'Fermer' : 'Initier un Transfert'}
            </button>
          </div>

          {showTransferForm && (
            <form
              onSubmit={handleCreateTransfer}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3.5"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nature du transfert
                  </label>
                  <select
                    value={transferType}
                    onChange={(e) =>
                      setTransferType(
                        e.target.value as LocalInterAgencyTransfer['transferType']
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="argent_physique">Argent Physique (Caisse/Coffre)</option>
                    <option value="argent_virtuel">Argent Virtuel (Flotte Mobile Money)</option>
                    <option value="ravitaillement">Ravitaillement Trésorerie</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Agence Source (Émettrice)
                  </label>
                  <select
                    value={isGlobalRole ? sourceAgencyId : user?.agencyId || sourceAgencyId}
                    disabled={!isGlobalRole && Boolean(user?.agencyId)}
                    onChange={(e) => setSourceAgencyId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800"
                  >
                    <option value="">Sélectionner l'agence source</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Agence Destinataire (Bénéficiaire)
                  </label>
                  <select
                    required
                    value={targetAgencyId}
                    onChange={(e) => setTargetAgencyId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="">Sélectionner l'agence cible</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Montant
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={trfAmount}
                    onChange={(e) => setTrfAmount(e.target.value)}
                    placeholder="Ex: 5000"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Devise
                  </label>
                  <select
                    value={trfCurrency}
                    onChange={(e) => setTrfCurrency(e.target.value as 'USD' | 'CDF')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CDF">CDF (Franc Congolais)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Canal / Opérateur
                  </label>
                  <input
                    type="text"
                    value={trfChannel}
                    onChange={(e) => setTrfChannel(e.target.value)}
                    placeholder="Ex: M-Pesa, Airtel Money, Convoyeur..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motif justificatif
                </label>
                <input
                  type="text"
                  required
                  value={trfReason}
                  onChange={(e) => setTrfReason(e.target.value)}
                  placeholder="Ex: Ravitaillement liquidités guichet principal..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferForm(false)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
                >
                  Enregistrer le transfert
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {transfers.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucun transfert inter-agences enregistré.
              </p>
            ) : (
              transfers.map((trf) => (
                <div
                  key={trf.id}
                  className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                        {trf.reference}
                      </span>
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 font-semibold uppercase text-[10px]">
                        {trf.transferType.replace('_', ' ')}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          trf.status === 'recu'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : trf.status === 'valide'
                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                              : trf.status === 'rejete'
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {trf.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {trf.amount.toLocaleString('fr-FR')} {trf.currency} •{' '}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {trf.sourceAgencyName} → {trf.targetAgencyName}
                      </span>
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">{trf.reason}</p>
                    <p className="text-[11px] tabular-nums text-slate-400">
                      Initié par {trf.initiatedByName} le{' '}
                      {new Date(trf.createdAt).toLocaleString('fr-FR')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {trf.status === 'en_attente_validation' && isGlobalRole && (
                      <button
                        type="button"
                        onClick={() => handleTransferAction(trf.id, 'valide')}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-500"
                      >
                        Valider (DG)
                      </button>
                    )}
                    {(trf.status === 'valide' || trf.status === 'en_attente_validation') &&
                      (isGlobalRole || user?.agencyId === trf.targetAgencyId) && (
                        <button
                          type="button"
                          onClick={() => handleTransferAction(trf.id, 'recu')}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirmer Réception
                        </button>
                      )}
                    {trf.status === 'en_attente_validation' && isGlobalRole && (
                      <button
                        type="button"
                        onClick={() => handleTransferAction(trf.id, 'rejete')}
                        className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 font-bold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950"
                      >
                        Rejeter
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ONGLET 2 : SUIVI DES DETTES & REMBOURSEMENTS */}
      {activeTab === 'debts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5">
              <span className="text-[11px] font-bold uppercase text-amber-800 dark:text-amber-300">
                Encours Total USD à recouvrer
              </span>
              <p className="mt-1 text-lg font-bold tabular-nums text-amber-950 dark:text-amber-100">
                ${debtTotals.usd.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5">
              <span className="text-[11px] font-bold uppercase text-amber-800 dark:text-amber-300">
                Encours Total CDF à recouvrer
              </span>
              <p className="mt-1 text-lg font-bold tabular-nums text-amber-950 dark:text-amber-100">
                {debtTotals.cdf.toLocaleString('fr-FR')} CDF
              </p>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowDebtForm((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-500"
              >
                <Plus className="h-3.5 w-3.5" />
                {showDebtForm ? 'Fermer' : 'Enregistrer une Dette / Créance'}
              </button>
            </div>
          </div>

          {showDebtForm && (
            <form
              onSubmit={handleCreateDebt}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Catégorie de débiteur
                  </label>
                  <select
                    value={debtCategory}
                    onChange={(e) => setDebtCategory(e.target.value as LocalDebt['category'])}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="client">Client / Abonné</option>
                    <option value="agent">Agent (Manquant caisse / Avance)</option>
                    <option value="entreprise">Partenaire / Entreprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nom complet du débiteur
                  </label>
                  <input
                    type="text"
                    required
                    value={debtorName}
                    onChange={(e) => setDebtorName(e.target.value)}
                    placeholder="Nom du client, agent ou société"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    value={debtorPhone}
                    onChange={(e) => setDebtorPhone(e.target.value)}
                    placeholder="+243..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Montant initial
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={debtAmount}
                    onChange={(e) => setDebtAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Devise
                  </label>
                  <select
                    value={debtCurrency}
                    onChange={(e) => setDebtCurrency(e.target.value as 'USD' | 'CDF')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CDF">CDF</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Échéance
                  </label>
                  <input
                    type="date"
                    required
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Agence de rattachement
                  </label>
                  <select
                    value={isGlobalRole ? debtAgencyId : user?.agencyId || debtAgencyId}
                    disabled={!isGlobalRole && Boolean(user?.agencyId)}
                    onChange={(e) => setDebtAgencyId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800"
                  >
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <input
                type="text"
                required
                value={debtReason}
                onChange={(e) => setDebtReason(e.target.value)}
                placeholder="Motif de la dette ou référence d'opération..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDebtForm(false)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Enregistrer la Dette
                </button>
              </div>
            </form>
          )}

          {/* Modal / Formulaire de remboursement partiel ou total */}
          {repayingDebtId && (
            <form
              onSubmit={handleRepayDebt}
              className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                  Enregistrer un remboursement (partiel ou total)
                </h4>
                <button type="button" onClick={() => setRepayingDebtId(null)}>
                  <X className="h-4 w-4 text-emerald-800 dark:text-emerald-300" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  placeholder="Montant encaissé"
                  className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={repaymentNote}
                  onChange={(e) => setRepaymentNote(e.target.value)}
                  placeholder="Référence reçu / Observation"
                  className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600"
                >
                  Valider l'encaissement
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {debts.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune dette ou créance enregistrée.
              </p>
            ) : (
              debts.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        {d.reference}
                      </span>
                      <span className="rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 font-bold uppercase text-[10px] text-blue-700 dark:text-blue-300">
                        {d.category}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          d.status === 'rembourse'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : d.status === 'en_retard'
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {d.status.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-slate-400">• {d.agencyName}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {d.debtorName}{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        — Reste à payer :{' '}
                        <strong className="text-amber-700 dark:text-amber-400 tabular-nums">
                          {d.remainingAmount.toLocaleString('fr-FR')} {d.currency}
                        </strong>{' '}
                        (sur <span className="tabular-nums">{d.initialAmount.toLocaleString('fr-FR')} {d.currency}</span>)
                      </span>
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">{d.reason}</p>
                    <p className="text-[11px] tabular-nums text-slate-400">
                      Échéance : {new Date(d.dueDate).toLocaleDateString('fr-FR')} •{' '}
                      {d.repayments?.length || 0} remboursement(s) enregistré(s)
                    </p>
                  </div>

                  {d.status !== 'rembourse' && (
                    <button
                      type="button"
                      onClick={() => {
                        setRepayingDebtId(d.id);
                        setRepaymentAmount(String(d.remainingAmount));
                      }}
                      className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-bold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white shrink-0"
                    >
                      Enregistrer Remboursement
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
