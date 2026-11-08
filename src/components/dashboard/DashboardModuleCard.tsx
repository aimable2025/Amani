import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Lock,
} from 'lucide-react';

export interface DashboardModuleCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  badge?: string;
  variant?:
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger';
  showArrow?: boolean;
  className?: string;
}

const variantStyles = {
  default: {
    icon: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
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
  description,
  icon: Icon,
  onClick,
  disabled = false,
  locked = false,
  badge,
  variant = 'default',
  showArrow = true,
  className = '',
}: DashboardModuleCardProps) {
  const isUnavailable = disabled || locked;

  const content = (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* En-tête de la carte : Icône et indicateurs */}
        <div className="flex items-center justify-between gap-2.5">
          <div
            className={[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
              variantStyles[variant].icon,
              !isUnavailable && 'group-hover:scale-105 group-hover:shadow-2xs',
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

          <div className="flex items-center gap-1.5 shrink-0">
            {badge && (
              <span
                className={[
                  'rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  variantStyles[variant].badge,
                ].join(' ')}
              >
                {badge}
              </span>
            )}
            {showArrow && !locked && (
              <ArrowRight
                className={[
                  'h-4 w-4 shrink-0 transition-transform duration-200',
                  isUnavailable
                    ? 'text-slate-300 dark:text-slate-600'
                    : 'text-slate-400 group-hover:translate-x-0.5 group-hover:text-[#C58B39] dark:group-hover:text-[#C58B39]',
                ].join(' ')}
              />
            )}
          </div>
        </div>

        {/* Corps : Titre et Description métier */}
        <div className="mt-3">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-[#C58B39] transition-colors">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const classes = [
    'group flex flex-col justify-between w-full h-full rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4',
    'text-left shadow-2xs transition-all duration-200 active:scale-[0.99]',
    isUnavailable
      ? 'cursor-not-allowed opacity-60'
      : 'hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs hover:-translate-y-0.5',
    className,
  ].join(' ');

  if (isUnavailable || !onClick) {
    return (
      <div
        className={classes}
        aria-disabled={isUnavailable}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={classes}
    >
      {content}
    </button>
  );
}
