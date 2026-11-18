import {
  ClipboardList,
  Coins,
  FileText,
  LayoutGrid,
  Menu,
  MessageSquare,
  Share2,
  User,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export type MobileNavigationItem =
  | 'dashboard'
  | 'commandes'
  | 'operations'
  | 'chat'
  | 'reports'
  | 'billetage'
  | 'profile'
  | 'menu';

interface MobileNavigationProps {
  activeItem?: string;
  unreadChatCount?: number;
  unreadNotificationsCount?: number;
  onNavigate?: (item: MobileNavigationItem) => void;
  onMenuClick?: () => void;
}

interface NavButton {
  id: MobileNavigationItem;
  label: string;
  icon: typeof LayoutGrid;
}

const STAFF_NAV_ITEMS: NavButton[] = [
  { id: 'dashboard', label: 'Accueil', icon: LayoutGrid },
  { id: 'operations', label: 'Opérations', icon: Share2 },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'reports', label: 'Rapports', icon: FileText },
  { id: 'menu', label: 'Menu', icon: Menu },
];

const EXTERNAL_NAV_ITEMS: NavButton[] = [
  { id: 'dashboard', label: 'Accueil', icon: LayoutGrid },
  { id: 'commandes', label: 'Commande', icon: ClipboardList },
  { id: 'billetage', label: 'Billetage', icon: Coins },
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'menu', label: 'Menu', icon: Menu },
];

export default function MobileNavigation({
  activeItem = 'dashboard',
  unreadChatCount = 0,
  unreadNotificationsCount = 0,
  onNavigate,
  onMenuClick,
}: MobileNavigationProps) {
  const { role } = useAuth();
  const isExternal = role === 'client' || role === 'abonne';
  const navItems = isExternal ? EXTERNAL_NAV_ITEMS : STAFF_NAV_ITEMS;

  const handleItemClick = (id: MobileNavigationItem) => {
    if (id === 'menu') {
      if (onMenuClick) {
        onMenuClick();
      } else {
        onNavigate?.('menu');
      }
      return;
    }
    onNavigate?.(id);
  };

  const isItemActive = (id: MobileNavigationItem) => {
    if (id === 'dashboard') {
      return activeItem === 'dashboard' || activeItem === 'overview' || activeItem === '';
    }
    if (id === 'operations') {
      return (
        activeItem === 'operations' ||
        activeItem === 'transactions' ||
        activeItem === 'operations-management'
      );
    }
    if (id === 'chat') {
      return (
        activeItem === 'chat' ||
        activeItem === 'internal-chat' ||
        activeItem === 'messages'
      );
    }
    if (id === 'commandes') {
      return (
        activeItem === 'commandes' ||
        activeItem === 'orders' ||
        activeItem === 'client-orders'
      );
    }
    if (id === 'reports') {
      return activeItem === 'reports' || activeItem === 'reports-center';
    }
    if (id === 'billetage') {
      return activeItem === 'billetage';
    }
    if (id === 'profile') {
      return activeItem === 'profile';
    }
    return false;
  };

  return (
    <nav
      aria-label="Navigation principale mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 px-1.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around h-12">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.id);
          const showBadge =
            (item.id === 'chat' && unreadChatCount > 0) ||
            (item.id === 'menu' && unreadNotificationsCount > 0);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id)}
              className={[
                'flex flex-1 flex-col items-center justify-center py-1 gap-0.5 transition-colors relative rounded-lg active:scale-95',
                active
                  ? 'text-[#C58B39] font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium',
              ].join(' ')}
            >
              <div className="relative">
                <Icon size={18} strokeWidth={active ? 2.3 : 1.8} />
                {showBadge && (
                  <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-[#C58B39] ring-2 ring-white dark:ring-slate-900" />
                )}
              </div>
              <span className="text-[10px] leading-none tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
