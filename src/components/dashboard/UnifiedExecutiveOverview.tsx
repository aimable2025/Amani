import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  Clock,
  CreditCard,
  FileText,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { db, type LocalReport, type LocalInterAgencyTransfer } from '../../lib/db';
import { getAgencies, type Agency } from '../../services/AgencyService';
import { getAllSystemUsers, type ManagedUser } from '../../services/SystemUserService';
import type { Operation } from '../../types/operation';

interface UnifiedExecutiveOverviewProps {
  kicker?: string;
  title?: string;
  subtitle?: string;
  onNewTransfer?: () => void;
  onNewOperation?: () => void;
  onViewAgencies?: () => void;
  onViewTransfers?: () => void;
  onViewReports?: () => void;
  onViewOperations?: () => void;
  agencyIdFilter?: string | null;
}

export default function UnifiedExecutiveOverview({
  kicker = 'SUPERVISION INSTITUTIONNELLE',
  title = 'Tableau de bord',
  subtitle = "Vue consolidée de l'ensemble des agences du réseau.",
  onNewTransfer,
  onNewOperation,
  onViewAgencies,
  onViewTransfers,
  onViewReports,
  onViewOperations,
  agencyIdFilter,
}: UnifiedExecutiveOverviewProps) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [transfers, setTransfers] = useState<LocalInterAgencyTransfer[]>([]);
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [agencyList, userList, opList, trList, repList] = await Promise.all([
          getAgencies(),
          getAllSystemUsers(),
          db.operations.toArray(),
          db.interAgencyTransfers.toArray(),
          db.reports.toArray(),
        ]);

        if (!isMounted) return;

        setAgencies(agencyList);
        setUsers(userList);
        setOperations(
          agencyIdFilter ? opList.filter((o: Operation) => o.agencyId === agencyIdFilter) : opList
        );
        setTransfers(
          agencyIdFilter
            ? trList.filter(
                (t: LocalInterAgencyTransfer) =>
                  t.sourceAgencyId === agencyIdFilter ||
                  t.targetAgencyId === agencyIdFilter
              )
            : trList
        );
        setReports(
          agencyIdFilter ? repList.filter((r: LocalReport) => r.agencyId === agencyIdFilter) : repList
        );
      } catch (err) {
        console.warn('[Ets AMANI] Erreur chargement statistiques unifiées :', err);
      }
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [agencyIdFilter]);

  const metrics = useMemo(() => {
    const activeAgencies = agencies.filter((a) => a.status === 'active' || !a.status);
    const agentsCount = users.filter((u) => u.role === 'agent').length;
    const abonnesCount = users.filter((u) => u.role === 'abonne').length;
    const clientsCount = users.filter((u) => u.role === 'client').length;

    const executedOps = operations.filter(
      (o) => o.status === 'termine' || o.status === 'valide'
    ).length;
    const pendingOps = operations.filter(
      (o) => o.status === 'cree' || o.status === 'en_cours'
    ).length;

    const inProgressTransfers = transfers.filter(
      (t) => t.status === 'en_attente_validation'
    ).length;
    const executedTransfers = transfers.filter(
      (t) => t.status === 'valide' || t.status === 'recu'
    ).length;

    const pendingReports = reports.filter(
      (r) => r.status === 'soumis' || r.status === 'en_examen'
    ).length;

    const returnedOrRejectedReports = reports.filter(
      (r) => r.status === 'retourne' || r.status === 'rejete'
    ).length;

    return {
      activeAgenciesCount: activeAgencies.length,
      totalUsersCount: users.length,
      agentsCount,
      abonnesCount,
      clientsCount,
      totalOperations: operations.length,
      executedOps,
      pendingOpsTotal: pendingOps + inProgressTransfers,
      inProgressTransfers,
      executedTransfers,
      pendingReports,
      returnedOrRejectedReports,
    };
  }, [agencies, users, operations, transfers, reports]);

  const last7DaysData = useMemo(() => {
    const days: Array<{
      date: Date;
      label: string;
      opsCount: number;
      transfersCount: number;
    }> = [];

    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const endOfDay = startOfDay + 86400000;

      const opsCount = operations.filter((op) => {
        const time = op.createdAt ? new Date(op.createdAt).getTime() : 0;
        return time >= startOfDay && time < endOfDay;
      }).length;

      const transfersCount = transfers.filter((tr) => {
        const time = tr.createdAt ? new Date(tr.createdAt).getTime() : 0;
        return time >= startOfDay && time < endOfDay;
      }).length;

      const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'short' });
      days.push({
        date: d,
        label: dayLabel,
        opsCount,
        transfersCount,
      });
    }

    return days;
  }, [operations, transfers]);

  // Volumes réels par agence (aucune donnée fictive si base vide)
  const agencyListWithVolumes = useMemo(() => {
    return agencies.map((ag) => {
      const agTransfers = transfers.filter(
        (t) => t.sourceAgencyId === ag.id || t.targetAgencyId === ag.id
      );
      const volumeUSD = agTransfers.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return {
        id: ag.id,
        name: ag.name,
        city: ag.city || 'RDC',
        code: ag.code,
        amountUSD: volumeUSD,
      };
    });
  }, [agencies, transfers]);

  return (
    <div className="space-y-4">
      {/* En-tête & Actions Rapides */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <span className="text-[10px] font-extrabold tracking-widest text-[#C58B39] uppercase">
            {kicker}
          </span>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>

        {(onNewTransfer || onNewOperation) && (
          <div className="flex items-center gap-2 shrink-0">
            {onNewTransfer && (
              <button
                type="button"
                onClick={onNewTransfer}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition whitespace-nowrap"
              >
                Nouveau transfert
              </button>
            )}
            {onNewOperation && (
              <button
                type="button"
                onClick={onNewOperation}
                className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C] hover:opacity-95 transition whitespace-nowrap"
              >
                Nouvelle opération
              </button>
            )}
          </div>
        )}
      </div>

      {/* 8 KPI Cards Compactes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={onViewAgencies}
          className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              AGENCES
            </span>
            <Building2 size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.activeAgenciesCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">Réseau Ets AMANI</div>
        </button>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              UTILISATEURS
            </span>
            <Users size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.totalUsersCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {metrics.agentsCount} agents enregistrés
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              CLIENTS
            </span>
            <CreditCard size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.clientsCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {metrics.abonnesCount} abonnés
          </div>
        </div>

        <button
          type="button"
          onClick={onViewOperations}
          className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              OPÉRATIONS
            </span>
            <ArrowLeftRight size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.totalOperations}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {metrics.executedOps} exécutées
          </div>
        </button>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              EN ATTENTE
            </span>
            <Clock size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.pendingOpsTotal}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">À valider / traiter</div>
        </div>

        <button
          type="button"
          onClick={onViewTransfers}
          className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              TRANSFERTS
            </span>
            <ArrowLeftRight size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.inProgressTransfers}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {metrics.executedTransfers} exécutés
          </div>
        </button>

        <button
          type="button"
          onClick={onViewReports}
          className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              RAPPORTS
            </span>
            <FileText size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.pendingReports}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">En attente d'examen</div>
        </button>

        <button
          type="button"
          onClick={onViewReports}
          className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              RETOURS / ALERTES
            </span>
            <ShieldAlert size={14} className="text-slate-400" />
          </div>
          <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white mt-1">
            {metrics.returnedOrRejectedReports}
          </div>
          <div
            className={`text-[10px] mt-0.5 truncate font-medium ${
              metrics.returnedOrRejectedReports > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {metrics.returnedOrRejectedReports > 0
              ? 'Rapports retournés/rejetés'
              : 'Aucune alerte ouverte'}
          </div>
        </button>
      </div>

      {/* Activité 7 jours & Réseau d'agences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Activité des 7 derniers jours
                </h3>
                <p className="text-[10px] text-slate-400">Enregistrements réels par jour</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-[#0B192C] dark:bg-slate-300" />
                  Opérations
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-[#C58B39]" />
                  Transferts
                </span>
              </div>
            </div>

            <div className="mt-3 relative h-28 flex flex-col justify-between">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[9px] text-slate-300 dark:text-slate-700">
                {[4, 2, 0].map((val) => (
                  <div key={val} className="flex items-center w-full">
                    <span className="w-3 shrink-0 text-slate-400 tabular-nums">{val}</span>
                    <div className="flex-1 border-b border-dotted border-slate-200 dark:border-slate-800" />
                  </div>
                ))}
              </div>

              <div className="absolute inset-x-4 bottom-4 top-1 flex items-end justify-between">
                {last7DaysData.map((d, index) => {
                  const maxVal = Math.max(
                    4,
                    ...last7DaysData.map((x) => Math.max(x.opsCount, x.transfersCount))
                  );
                  const opHeightPercent = Math.min(100, (d.opsCount / maxVal) * 100);
                  const trHeightPercent = Math.min(100, (d.transfersCount / maxVal) * 100);

                  return (
                    <div
                      key={index}
                      onMouseEnter={() => setHoveredDayIndex(index)}
                      onMouseLeave={() => setHoveredDayIndex(null)}
                      className="flex flex-col items-center flex-1 h-full justify-end cursor-pointer group"
                    >
                      <div className="flex items-end gap-1 h-full">
                        <div
                          style={{ height: `${Math.max(4, opHeightPercent)}%` }}
                          className="w-2 sm:w-2.5 rounded-t-sm bg-[#0B192C] dark:bg-slate-300 transition-all group-hover:opacity-80"
                        />
                        <div
                          style={{ height: `${Math.max(4, trHeightPercent)}%` }}
                          className="w-2 sm:w-2.5 rounded-t-sm bg-[#C58B39] transition-all group-hover:opacity-80"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {hoveredDayIndex !== null && (
                <div
                  style={{ left: `calc(${(hoveredDayIndex / 6) * 80 + 10}%)` }}
                  className="absolute top-1 -translate-x-1/2 z-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 shadow-md text-xs pointer-events-none"
                >
                  <div className="font-bold text-slate-900 dark:text-white capitalize">
                    {last7DaysData[hoveredDayIndex].label}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-300 tabular-nums">
                    Opérations : <strong>{last7DaysData[hoveredDayIndex].opsCount}</strong>
                  </div>
                  <div className="text-[10px] text-[#C58B39] tabular-nums">
                    Transferts : <strong>{last7DaysData[hoveredDayIndex].transfersCount}</strong>
                  </div>
                </div>
              )}

              <div className="flex justify-between pl-4 pr-1 pt-1.5 border-t border-slate-200/80 dark:border-slate-800 text-[10px] text-slate-400 font-medium">
                {last7DaysData.map((d, index) => (
                  <span key={index} className="capitalize">
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              Répartition des opérations par type
            </h3>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[
                { type: 'depot', label: 'Dépôts' },
                { type: 'retrait', label: 'Retraits' },
                { type: 'change', label: 'Change' },
                { type: 'virement', label: 'Virements' },
              ].map(({ type, label }) => {
                const count = operations.filter((o) => o.type === type).length;
                return (
                  <div
                    key={type}
                    className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-2 text-center"
                  >
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                      {label}
                    </span>
                    <span className="text-base font-black tabular-nums text-slate-900 dark:text-white mt-0.5 block">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Réseau & Volumes par Agence
              </h3>
              {onViewAgencies && (
                <button
                  type="button"
                  onClick={onViewAgencies}
                  className="text-[11px] font-bold text-[#C58B39] hover:underline"
                >
                  Voir les agences
                </button>
              )}
            </div>

            {agencyListWithVolumes.length === 0 ? (
              <div className="py-5 text-center">
                <p className="text-xs text-slate-400">Aucune agence enregistrée pour le moment</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 pt-1">
                {agencyListWithVolumes.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={onViewAgencies}
                    className="w-full py-2 flex items-center justify-between text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/30 px-1 rounded-lg transition"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.city} • Code: {item.code}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                      ${item.amountUSD.toLocaleString('en-US')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Derniers transferts de fonds
              </h3>
              {onViewTransfers && (
                <button
                  type="button"
                  onClick={onViewTransfers}
                  className="text-[11px] font-bold text-[#C58B39] hover:underline"
                >
                  Tout voir
                </button>
              )}
            </div>

            {transfers.length === 0 ? (
              <div className="py-5 text-center">
                <p className="text-xs text-slate-400">Aucun transfert récent enregistré</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 pt-1">
                {transfers.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={onViewTransfers}
                    className="w-full py-2 flex items-center justify-between text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/30 px-1 rounded-lg transition"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {t.reference || t.id}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {t.sourceAgencyName || 'Origine'} &rarr; {t.targetAgencyName || 'Destination'}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                      {t.amount.toLocaleString('fr-FR')} {t.currency}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
