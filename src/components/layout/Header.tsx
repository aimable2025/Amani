import {
  Bell,
  ChevronDown,
  Keyboard,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Smartphone,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useViewportMode } from '../common/FramePhone';
import HeaderChatSearch, { type ChatNavigationTarget } from '../common/HeaderChatSearch';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  activeItem?: string;
  isOnline?: boolean;
  pendingSyncCount?: number;
  isSyncingNow?: boolean;
  notificationCount?: number;
  unreadChatCount?: number;
  hideMenuButtonOnDesktop?: boolean;
  onNavigate?: (item: string) => void;
  onMenuClick?: () => void;
  onSyncNowClick?: () => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onShortcutsClick?: () => void;
  onNavigateToChat?: (target?: ChatNavigationTarget) => void;
}

const ROLE_LABELS: Record<string, string> = {
  administrateur_systeme: 'Administrateur système',
  directeur_general: 'Directeur Général',
  administrateur_agence: "Admin d'Agence",
  agent: 'Agent',
  client: 'Client',
  abonne: 'Abonné',
};

export default function Header({
  title = 'Tableau de bord',
  isOnline = true,
  pendingSyncCount = 0,
  isSyncingNow = false,
  notificationCount = 0,
  hideMenuButtonOnDesktop = false,
  onMenuClick,
  onSyncNowClick,
  onNotificationsClick,
  onProfileClick,
  onShortcutsClick,
  onNavigateToChat,
}: HeaderProps) {
  const { user, role } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { displayMode, toggleDisplayMode } = useViewportMode();

  const displayName = user?.displayName || 'Utilisateur';
  const roleLabel = (role && ROLE_LABELS[role]) || 'Compte actif';
  const initial = displayName.charAt(0).toUpperCase();
  const isStaff = role !== 'client' && role !== 'abonne';

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 transition-colors duration-200">
      <div className="flex h-14 items-center justify-between gap-2 sm:gap-4 px-3 sm:px-5 lg:px-6">
        {/* Partie Gauche : Menu mobile/tablette + Contexte page */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Ouvrir le menu"
              className={[
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition',
                hideMenuButtonOnDesktop ? 'lg:hidden' : '',
              ].join(' ')}
            >
              <Menu size={19} strokeWidth={2} />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#C58B39] text-[#0B192C] font-black text-xs lg:hidden">
              EA
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  {title}
                </h1>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-600">/</span>
                <span className="hidden sm:inline truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Partie Centrale : Recherche rapide Chat (Desktop pour rôles internes) */}
        {isStaff && onNavigateToChat && (
          <div className="hidden xl:block flex-1 max-w-md mx-2">
            <HeaderChatSearch onNavigateToChat={onNavigateToChat} />
          </div>
        )}

        {/* Partie Droite : Actions rapides & Profil */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Statut Réseau & Synchro */}
          <button
            type="button"
            onClick={onSyncNowClick}
            disabled={isSyncingNow}
            className={[
              'flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition whitespace-nowrap shrink-0',
              isOnline
                ? pendingSyncCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
            ].join(' ')}
            title={
              isOnline
                ? pendingSyncCount > 0
                  ? `${pendingSyncCount} élément(s) en attente de synchronisation`
                  : 'Connecté & synchronisé'
                : 'Mode autonome hors-ligne'
            }
          >
            {isSyncingNow ? (
              <RefreshCw size={13} className="animate-spin text-blue-600 dark:text-blue-400" />
            ) : isOnline ? (
              <Wifi size={13} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff size={13} className="text-amber-600 dark:text-amber-400" />
            )}
            <span className="hidden md:inline">
              {isSyncingNow ? 'Synchro...' : isOnline ? 'En ligne' : 'Hors-ligne'}
            </span>
            {pendingSyncCount > 0 && (
              <span className="tabular-nums font-bold text-amber-700 dark:text-amber-300">
                ({pendingSyncCount})
              </span>
            )}
          </button>

          {/* Aperçu Mobile / Bureau (optionnel sur grand écran) */}
          <button
            type="button"
            onClick={toggleDisplayMode}
            title={
              displayMode === 'desktop'
                ? 'Basculer vers aperçu Mobile (420px)'
                : 'Basculer vers mode Bureau plein écran'
            }
            aria-label="Changer le mode d'affichage"
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
          >
            {displayMode === 'desktop' ? <Smartphone size={15} /> : <Monitor size={15} />}
          </button>

          {/* Raccourcis Clavier */}
          {onShortcutsClick && (
            <button
              type="button"
              onClick={onShortcutsClick}
              aria-label="Raccourcis clavier"
              title="Raccourcis clavier (?)"
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
            >
              <Keyboard size={15} />
            </button>
          )}

          {/* Mode Clair / Sombre */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Passer au mode clair' : 'Passer au mode sombre'}
            title={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label="Notifications"
            title="État opérationnel & notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            <Bell size={15} />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#C58B39] text-[#0B192C] text-[9px] font-black tabular-nums">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          {/* Profil */}
          <button
            type="button"
            onClick={onProfileClick}
            className="group flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Mon profil"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0B192C] text-white dark:bg-[#C58B39] dark:text-[#0B192C] font-black text-xs">
              {initial}
            </div>
            <span className="hidden md:inline max-w-[110px] truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
              {displayName}
            </span>
            <ChevronDown
              size={13}
              className="text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition"
            />
          </button>
        </div>
      </div>
    </header>
  );
}
