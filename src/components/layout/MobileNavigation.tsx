import {
  FileText,
  LayoutGrid,
  Menu,
  MessageSquare,
  Share2,
} from 'lucide-react';

export type MobileNavigationItem =
  | 'dashboard'
  | 'operations'
  | 'chat'
  | 'reports'
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

const NAV_ITEMS: NavButton[] = [
  {
    id: 'dashboard',
    label: 'Accueil',
    icon: LayoutGrid,
  },
  {
    id: 'operations',
    label: 'Opération',
    icon: Share2,
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: MessageSquare,
  },
  {
    id: 'reports',
    label: 'Rapports',
    icon: FileText,
  },
  {
    id: 'menu',
    label: 'Menu',
    icon: Menu,
  },
];

export default function MobileNavigation({
  activeItem = 'dashboard',
  unreadChatCount = 0,
  unreadNotificationsCount = 0,
  onNavigate,
  onMenuClick,
}: MobileNavigationProps) {
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
      return (
        activeItem === 'dashboard' ||
        activeItem === 'overview' ||
        activeItem === ''
      );
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
    if (id === 'reports') {
      return (
        activeItem === 'reports' ||
        activeItem === 'reports-center'
      );
    }
    return false;
  };

  return (
    <nav
      aria-label="Navigation principale mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 px-2 shadow-[0_-4px_24px_rgba(11,25,44,0.08)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.id);
          const showDot =
            (item.id === 'chat' && unreadChatCount > 0) ||
            (item.id === 'menu' && unreadNotificationsCount > 0);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id)}
              className={[
                'flex flex-1 flex-col items-center justify-center py-1 gap-1 transition-all relative rounded-xl active:scale-95',
                active
                  ? 'text-[#C58B39] font-bold'
                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 font-medium',
              ].join(' ')}
            >
              <div className="relative">
                <Icon
                  size={19}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                {showDot && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#C58B39] ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                )}
              </div>
              <span className="text-[10px] tracking-tight">{item.label}</span>
              {active && (
                <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-[#C58B39]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
