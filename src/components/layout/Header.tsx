import {
  Bell,
  ChevronDown,
  FileText,
  Keyboard,
  LayoutGrid,
  Menu,
  MessageSquare,
  Moon,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
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
  subtitle = 'Vue d ensemble de votre activité',
  activeItem = 'dashboard',
  isOnline = true,
  pendingSyncCount = 0,
  isSyncingNow = false,
  notificationCount = 0,
  unreadChatCount = 0,
  hideMenuButtonOnDesktop = false,
  onNavigate,
  onMenuClick,
  onSyncNowClick,
  onNotificationsClick,
  onProfileClick,
  onShortcutsClick,
  onNavigateToChat,
}: HeaderProps) {
  const { user, role } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const displayName = user?.displayName || 'Aimable';
  const roleLabel = (role && ROLE_LABELS[role]) || 'Administrateur système';
  const initial = displayName.charAt(0).toUpperCase();

  const isTabActive = (tabId: string) => {
    if (tabId === 'dashboard') {
      return activeItem === 'dashboard' || activeItem === 'overview' || activeItem === '';
    }
    if (tabId === 'operations') {
      return (
        activeItem === 'operations' ||
        activeItem === 'transactions' ||
        activeItem === 'operations-management'
      );
    }
    if (tabId === 'chat') {
      return activeItem === 'chat' || activeItem === 'internal-chat';
    }
    if (tabId === 'reports') {
      return activeItem === 'reports' || activeItem === 'reports-center';
    }
    return false;
  };

  const handleDesktopNavClick = (tabId: string) => {
    if (tabId === 'menu') {
      onMenuClick?.();
      return;
    }
    if (tabId === 'chat' && onNavigateToChat) {
      onNavigateToChat();
      return;
    }
    onNavigate?.(tabId);
  };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 transition-colors duration-200">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
        {/* Partie Gauche : Hamburger + Brand EA / AMANI */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Ouvrir le menu"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
            >
              <Menu size={20} strokeWidth={2} />
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#C58B39] text-[#0B192C] font-black text-xs shadow-xs">
              EA
            </div>
            <div className="flex items-center gap-1.5 truncate text-xs">
              <span className="font-extrabold tracking-wider text-slate-900 dark:text-white uppercase">
                AMANI
              </span>
              <span className="text-slate-300 dark:text-slate-600 font-light">/</span>
              <span className="truncate font-medium text-slate-500 dark:text-slate-400 hidden xs:inline">
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Partie Centrale : Les 5 Menus Principaux Horizontaux (Desktop / Écran large) */}
        <nav
          aria-label="Navigation principale bureau"
          className="hidden md:flex items-center gap-1 rounded-2xl bg-slate-100/90 dark:bg-slate-800/80 p-1 border border-slate-200/60 dark:border-slate-700/60"
        >
          <button
            type="button"
            onClick={() => handleDesktopNavClick('dashboard')}
            className={[
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              isTabActive('dashboard')
                ? 'bg-white dark:bg-slate-900 text-[#C58B39] shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            <LayoutGrid size={14} strokeWidth={isTabActive('dashboard') ? 2.3 : 1.8} />
            <span>Accueil</span>
          </button>

          <button
            type="button"
            onClick={() => handleDesktopNavClick('operations')}
            className={[
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              isTabActive('operations')
                ? 'bg-white dark:bg-slate-900 text-[#C58B39] shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            <Share2 size={14} strokeWidth={isTabActive('operations') ? 2.3 : 1.8} />
            <span>Opération</span>
          </button>

          <button
            type="button"
            onClick={() => handleDesktopNavClick('chat')}
            className={[
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all relative',
              isTabActive('chat')
                ? 'bg-white dark:bg-slate-900 text-[#C58B39] shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            <MessageSquare size={14} strokeWidth={isTabActive('chat') ? 2.3 : 1.8} />
            <span>Chat</span>
            {unreadChatCount > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#C58B39]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleDesktopNavClick('reports')}
            className={[
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              isTabActive('reports')
                ? 'bg-white dark:bg-slate-900 text-[#C58B39] shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            <FileText size={14} strokeWidth={isTabActive('reports') ? 2.3 : 1.8} />
            <span>Rapports</span>
          </button>

          <button
            type="button"
            onClick={() => handleDesktopNavClick('menu')}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all"
            title="Ouvrir le menu complet des modules et paramètres"
          >
            <SlidersHorizontal size={14} strokeWidth={1.8} />
            <span>Menu</span>
          </button>
        </nav>

        {/* Partie Droite : Actions rapides, Statut Synchro, Mode Nuit, Notifications, Profil */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Badge état synchronisation */}
          <button
            type="button"
            onClick={onSyncNowClick}
            disabled={isSyncingNow}
            className={[
              'flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[11px] font-semibold transition',
              isOnline
                ? pendingSyncCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
            ].join(' ')}
            title={
              isOnline
                ? pendingSyncCount > 0
                  ? `${pendingSyncCount} élément(s) en attente`
                  : 'Connecté & synchronisé'
                : 'Mode autonome hors-ligne'
            }
          >
            {isSyncingNow ? (
              <RefreshCw size={12} className="animate-spin text-blue-600" />
            ) : isOnline ? (
              <Wifi size={12} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff size={12} className="text-amber-600" />
            )}
            {pendingSyncCount > 0 && (
              <span className="tabular-nums font-bold text-amber-700 dark:text-amber-400">
                {pendingSyncCount}
              </span>
            )}
          </button>

          {/* Raccourcis Clavier (Desktop) */}
          {onShortcutsClick && (
            <button
              type="button"
              onClick={onShortcutsClick}
              aria-label="Raccourcis clavier"
              title="Raccourcis clavier (? ou Ctrl+D)"
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 transition"
            >
              <Keyboard size={15} />
            </button>
          )}

          {/* Bouton Thème Clair / Sombre */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Passer au mode clair' : 'Passer au mode sombre'}
            title={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label="Notifications"
            title="Notifications & alertes"
            className="relative flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            <Bell size={15} />
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#C58B39] ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          {/* Profil */}
          <button
            type="button"
            onClick={onProfileClick}
            className="group flex items-center gap-1 rounded-xl py-1 pl-1 pr-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Consulter mon profil"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0B192C] text-white font-black text-xs shadow-xs">
              {initial}
            </div>
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
