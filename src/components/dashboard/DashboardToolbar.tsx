import type { ReactNode } from 'react';
import { Grid2X2, List, Search } from 'lucide-react';

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
  searchPlaceholder = 'Rechercher un module...',
  children,
  className = '',
}: DashboardToolbarProps) {
  return (
    <div
      className={[
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
        'rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-2',
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onSearchChange && (
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
            />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 pl-8 pr-3 text-xs text-slate-900 dark:text-white outline-none transition placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800"
            />
          </div>
        )}
        {children}
      </div>

      <div className="flex shrink-0 items-center self-end sm:self-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          aria-label="Afficher en grille"
          aria-pressed={viewMode === 'grid'}
          className={[
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold transition whitespace-nowrap shrink-0',
            viewMode === 'grid'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          ].join(' ')}
        >
          <Grid2X2 className="h-3.5 w-3.5" strokeWidth={2} />
          <span>Grille</span>
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('list')}
          aria-label="Afficher en liste"
          aria-pressed={viewMode === 'list'}
          className={[
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold transition whitespace-nowrap shrink-0',
            viewMode === 'list'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          ].join(' ')}
        >
          <List className="h-3.5 w-3.5" strokeWidth={2} />
          <span>Liste</span>
        </button>
      </div>
    </div>
  );
}
