import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export interface WorkspaceTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
}

export interface WorkspaceNavigationHeaderProps {
  workspaceTitle: string;
  activeModuleTitle: string;
  activeModuleDescription?: string;
  onBack: () => void;
  backLabel?: string;
  tabs?: WorkspaceTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  actions?: ReactNode;
  category?: string;
  className?: string;
}

export default function WorkspaceNavigationHeader({
  workspaceTitle,
  activeModuleTitle,
  activeModuleDescription,
  onBack,
  backLabel = "Vue d'ensemble",
  tabs = [],
  activeTabId,
  onTabChange,
  actions,
  category,
  className = '',
}: WorkspaceNavigationHeaderProps) {
  return (
    <div
      className={[
        'rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 sm:px-4 sm:py-3 space-y-2',
        className,
      ].join(' ')}
    >
      {/* Ligne 1 : Retour & Fil d'Ariane + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            title={`Retourner à ${backLabel}`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{backLabel}</span>
          </button>

          <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 shrink-0 hidden sm:block" />

          <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-xs min-w-0">
            <span className="text-slate-400 font-medium truncate hidden md:inline">
              {workspaceTitle}
            </span>
            {category && (
              <>
                <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600 shrink-0 hidden md:inline" />
                <span className="text-slate-400 font-medium truncate hidden sm:inline">
                  {category}
                </span>
              </>
            )}
            <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600 shrink-0 hidden sm:inline" />
            <span className="font-bold text-slate-900 dark:text-white truncate">
              {activeModuleTitle}
            </span>
          </nav>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {activeModuleDescription && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {activeModuleDescription}
        </p>
      )}

      {/* Onglets horizontaux compacts sur une seule ligne */}
      {tabs.length > 0 && onTabChange && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={[
                    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition shrink-0',
                    isActive
                      ? 'bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C]'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  {Icon && (
                    <Icon
                      className={[
                        'h-3.5 w-3.5 shrink-0',
                        isActive
                          ? 'text-[#C58B39] dark:text-[#0B192C]'
                          : 'text-slate-400',
                      ].join(' ')}
                    />
                  )}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={[
                        'rounded px-1.5 py-0.5 text-[9px] font-bold tabular-nums leading-none',
                        isActive
                          ? 'bg-white/15 text-white dark:bg-[#0B192C]/20 dark:text-[#0B192C]'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                      ].join(' ')}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
