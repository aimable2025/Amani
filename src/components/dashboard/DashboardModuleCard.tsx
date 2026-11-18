import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Lock } from 'lucide-react';

export interface DashboardModuleCardProps {
  title: string;
  shortTitle?: string;
  description?: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  badge?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  showArrow?: boolean;
  layout?: 'tile' | 'list' | 'detailed';
  className?: string;
}

const variantStyles = {
  default: {
    icon: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  primary: {
    icon: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  },
  success: {
    icon: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
  danger: {
    icon: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  },
};

export default function DashboardModuleCard({
  title,
  shortTitle,
  description,
  icon: Icon,
  onClick,
  disabled = false,
  locked = false,
  badge,
  variant = 'default',
  showArrow = true,
  layout = 'tile',
  className = '',
}: DashboardModuleCardProps) {
  const isUnavailable = disabled || locked;
  const tileLabel = shortTitle || title;

  if (layout === 'list') {
    const listClasses = [
      'group flex items-center justify-between gap-3 w-full rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left transition-colors',
      isUnavailable
        ? 'cursor-not-allowed opacity-60'
        : 'hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/70 dark:hover:bg-slate-800/40',
      className,
    ].join(' ');

    const inner = (
      <>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              variantStyles[variant].icon,
            ].join(' ')}
          >
            {locked ? (
              <Lock className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Icon className="h-4 w-4" strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-[#C58B39] transition-colors">
              {title}
            </h3>
            {description && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge && (
            <span
              className={[
                'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums',
                variantStyles[variant].badge,
              ].join(' ')}
            >
              {badge}
            </span>
          )}
          {showArrow && !locked && (
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-[#C58B39] transition" />
          )}
        </div>
      </>
    );

    if (isUnavailable || !onClick) {
      return (
        <div className={listClasses} aria-disabled={isUnavailable}>
          {inner}
        </div>
      );
    }

    return (
      <button type="button" onClick={onClick} className={listClasses}>
        {inner}
      </button>
    );
  }

  // Mode Tuile Compacte (3 ou 4 colonnes) par défaut
  const tileClasses = [
    'group relative flex flex-col items-center justify-center text-center w-full min-h-[88px] sm:min-h-[96px] rounded-xl border border-slate-200/85 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-2.5 sm:p-3 transition-all active:scale-[0.98]',
    isUnavailable
      ? 'cursor-not-allowed opacity-60'
      : 'hover:border-[#C58B39]/60 dark:hover:border-[#C58B39]/50 hover:bg-slate-50/70 dark:hover:bg-slate-800/60',
    className,
  ].join(' ');

  const tileContent = (
    <>
      {badge && (
        <span
          className={[
            'absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold tabular-nums leading-none',
            variantStyles[variant].badge,
          ].join(' ')}
        >
          {badge}
        </span>
      )}

      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-150',
          variantStyles[variant].icon,
          !isUnavailable && 'group-hover:scale-105',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {locked ? (
          <Lock className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Icon className="h-4 w-4" strokeWidth={2} />
        )}
      </div>

      <span className="mt-1.5 text-[11px] sm:text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100 line-clamp-2 group-hover:text-[#C58B39] transition-colors">
        {tileLabel}
      </span>
    </>
  );

  if (isUnavailable || !onClick) {
    return (
      <div className={tileClasses} aria-disabled={isUnavailable} title={description || title}>
        {tileContent}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={tileClasses}
      title={description || title}
    >
      {tileContent}
    </button>
  );
}
