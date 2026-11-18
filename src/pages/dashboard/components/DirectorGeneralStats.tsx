import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileText,
  TrendingUp,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';

interface Props {
  totalAgencies?: number;
  agenciesSubtitle?: string;
  totalAgencyAdmins?: number;
  totalAgents?: number;
  totalClients?: number;
  totalSubscribers?: number;
  pendingRegistrations?: number;
  activeOperations?: number;
  completedOperations?: number;
  totalReports?: number;
  pendingValidations?: number;
  totalBilletageCountedUSD?: number;
  totalBilletageCountedCDF?: number;
  billetageCount?: number;
  onSelectModule?: (moduleId: string) => void;
}

export default function DirectorGeneralStats({
  totalAgencies = 0,
  agenciesSubtitle,
  totalAgencyAdmins = 0,
  totalAgents = 0,
  totalClients = 0,
  totalSubscribers = 0,
  pendingRegistrations = 0,
  activeOperations = 0,
  completedOperations = 0,
  totalReports = 0,
  pendingValidations = 0,
  totalBilletageCountedUSD = 0,
  totalBilletageCountedCDF = 0,
  billetageCount = 0,
  onSelectModule,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          onClick={() => onSelectModule?.('billetage')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('billetage');
            }
          }}
          className={`group rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-colors ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Billetage & Caisse (USD / CDF)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 dark:text-white">
                {totalBilletageCountedUSD > 0 || totalBilletageCountedCDF > 0
                  ? `$${totalBilletageCountedUSD.toLocaleString('fr-FR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}`
                  : '0 $'}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px]">
            <div className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
              <TrendingUp className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {totalBilletageCountedCDF > 0
                  ? `${totalBilletageCountedCDF.toLocaleString('fr-FR')} CDF (${billetageCount})`
                  : billetageCount > 0
                    ? `${billetageCount} comptage(s)`
                    : 'Aucun comptage'}
              </span>
            </div>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white" />
            )}
          </div>
        </div>

        <div
          onClick={() => onSelectModule?.('agencies')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('agencies');
            }
          }}
          className={`group rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-colors ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Agences actives
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 dark:text-white">
                {totalAgencies}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px]">
            <span className="truncate text-slate-500 dark:text-slate-400">
              {totalAgencies === 0 ? 'Aucune agence' : agenciesSubtitle || 'Réseau Ets AMANI'}
            </span>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white" />
            )}
          </div>
        </div>

        <div
          onClick={() => onSelectModule?.('operations-management')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('operations-management');
            }
          }}
          className={`group rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-colors ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Opérations en cours
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 dark:text-white">
                {activeOperations}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px]">
            <span className="truncate text-slate-500 dark:text-slate-400 tabular-nums">
              {completedOperations} terminée(s) · {activeOperations} en cours
            </span>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white" />
            )}
          </div>
        </div>

        <div
          onClick={() => onSelectModule?.('agents-management')}
          role={onSelectModule ? 'button' : undefined}
          tabIndex={onSelectModule ? 0 : undefined}
          onKeyDown={(e) => {
            if (onSelectModule && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectModule('agents-management');
            }
          }}
          className={`group rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-colors ${
            onSelectModule ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Agents actifs réseau
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-950 dark:text-white">
                {totalAgents}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px]">
            <span className="truncate text-slate-500 dark:text-slate-400 tabular-nums">
              {totalAgencyAdmins} admin(s) d&apos;agence actif(s)
            </span>
            {onSelectModule && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white" />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => onSelectModule?.('agency-admins-management')}
          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Admins d&apos;Agence
            </p>
            <p className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {totalAgencyAdmins}
            </p>
          </div>
          <UserCog className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        </button>

        <button
          type="button"
          onClick={() => onSelectModule?.('registration-requests')}
          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Clients & Abonnés
            </p>
            <p className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {totalClients + totalSubscribers}
            </p>
          </div>
          <UserCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        </button>

        <button
          type="button"
          onClick={() => onSelectModule?.('registration-requests')}
          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Demandes en attente
            </p>
            <p className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {pendingRegistrations}
            </p>
          </div>
          <ClipboardCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        </button>

        <button
          type="button"
          onClick={() => onSelectModule?.('reports-center')}
          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Rapports
            </p>
            <p className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {totalReports}
            </p>
          </div>
          <FileText className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        </button>

        <button
          type="button"
          onClick={() =>
            onSelectModule?.(pendingValidations > 0 ? 'salaries-management' : 'audit-logs')
          }
          className="col-span-2 sm:col-span-1 flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Validations & Alertes
            </p>
            <p className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {pendingValidations}
            </p>
          </div>
          {pendingValidations > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
        </button>
      </div>
    </div>
  );
}
