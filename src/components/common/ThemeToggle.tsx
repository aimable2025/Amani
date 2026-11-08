import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export default function ThemeToggle({
  className = '',
  showLabel = false,
}: ThemeToggleProps) {
  const { theme, isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        isDark
          ? 'Basculer vers le mode clair'
          : 'Basculer vers le mode sombre'
      }
      title={
        isDark
          ? 'Mode sombre actif — Cliquer pour activer le mode clair'
          : 'Mode clair actif — Cliquer pour activer le mode sombre'
      }
      className={[
        'group relative flex h-10 items-center justify-center rounded-xl border px-2.5 transition-all duration-200 select-none shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        isDark
          ? 'border-slate-700/80 bg-slate-800/90 text-amber-300 hover:bg-slate-700 hover:text-amber-200 hover:border-slate-600'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950 hover:border-slate-300',
        showLabel ? 'gap-2 px-3' : 'w-10 px-0',
        className,
      ].join(' ')}
    >
      <div className="relative flex h-5 w-5 items-center justify-center">
        {isDark ? (
          <Moon className="h-4 w-4 text-blue-400 transition-all duration-300 animate-in spin-in-180 zoom-in-75" />
        ) : (
          <Sun className="h-4 w-4 text-amber-500 transition-all duration-300 animate-in spin-in-180 zoom-in-75" />
        )}
      </div>

      {showLabel && (
        <span className="text-xs font-semibold">
          {isDark ? 'Mode Sombre' : 'Mode Clair'}
        </span>
      )}
    </button>
  );
}
