import type { ReactNode } from 'react';
import {
  Grid2X2,
  List,
  Search,
} from 'lucide-react';

export type DashboardViewMode = 'list' | 'grid' | 'compact';

export interface DashboardToolbarProps {
  viewMode: DashboardViewMode;
  onViewModeChange: (mode: DashboardViewMode) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  className?: string;
}

export default function DashboardToolbar({
  viewMode,
  onViewModeChange,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Rechercher...',
  children,
  className = '',
}: DashboardToolbarProps) {
  return (
    <div
      className={[
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
        'rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 sm:p-2.5',
        'shadow-2xs',
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onSearchChange && (
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
            />
            <input
              type="search"
              value={searchValue}
              onChange={(event) =>
                onSearchChange(event.target.value)
              }
              placeholder={searchPlaceholder}
              className={[
                'h-8.5 w-full rounded-xl border border-slate-200 dark:border-slate-700/80',
                'bg-slate-50 dark:bg-slate-800/60 pl-8.5 pr-3 text-xs text-slate-900 dark:text-white',
                'outline-none transition',
                'placeholder:text-slate-400',
                'focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800',
              ].join(' ')}
            />
          </div>
        )}
        {children}
      </div>
      <div className="flex shrink-0 items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5">
        <button
          type="button"
          onClick={() => onViewModeChange('list')}
          aria-label="Afficher en liste"
          aria-pressed={viewMode === 'list'}
          className={[
            'flex h-7.5 items-center gap-1.5 rounded-lg px-2.5',
            'text-[11px] font-bold transition',
            viewMode === 'list'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white',
          ].join(' ')}
        >
          <List className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">Liste</span>
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          aria-label="Afficher en grille"
          aria-pressed={viewMode === 'grid'}
          className={[
            'flex h-7.5 items-center gap-1.5 rounded-lg px-2.5',
            'text-[11px] font-bold transition',
            viewMode === 'grid'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white',
          ].join(' ')}
        >
          <Grid2X2 className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">Grille</span>
        </button>
      </div>
    </div>
  );
}
