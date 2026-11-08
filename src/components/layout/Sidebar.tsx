import {
  Activity,
  ArrowLeftRight,
  Bell,
  BookUser,
  Building2,
  Coins,
  FileText,
  Landmark,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Scale,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
  Users,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../common/UserAvatar';

interface SidebarProps {
  activeItem?: string;
  onNavigate?: (item: string) => void;
  onClose?: () => void;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  badge?: string;
}

const ROLE_LABELS: Record<string, string> = {
  administrateur_systeme: 'Administrateur système',
  directeur_general: 'Directeur Général',
  administrateur_agence: 'Admin Agence',
  agent: 'Agent Opérationnel',
  client: 'Client Certifié',
  abonne: 'Abonné Privilégié',
};

export default function Sidebar({
  activeItem = 'dashboard',
  onNavigate,
  onClose,
}: SidebarProps) {
  const { user, role, signOut } = useAuth();

  const handleNavigation = (item: string) => {
    onNavigate?.(item);
    if (onClose) onClose();
  };

  const isSystemAdmin = role === 'administrateur_systeme';
  const isDG = role === 'directeur_general';
  const isAgencyAdmin = role === 'administrateur_agence';
  const isAgent = role === 'agent';

  // Section 1 : PILOTAGE & ACCÈS DIRECTS (Les 5 piliers de l'application)
  const pilotageItems: NavigationItem[] = [
    { id: 'dashboard', label: 'Accueil', icon: LayoutGrid },
    { id: 'transactions', label: 'Opérations', icon: Share2 },
    { id: 'chat', label: 'Chat & Messagerie', icon: MessageSquare },
    { id: 'reports', label: 'Rapports & Synthèses', icon: FileText },
    {
      id: isAgent ? 'billetage' : 'treasury',
      label: isAgent ? 'Billetage Caisse' : 'Trésorerie & Caisse',
      icon: isAgent ? Coins : Landmark,
    },
    { id: 'transfers', label: 'Transferts Inter-Agences', icon: ArrowLeftRight },
  ];

  // Section 2 : ORGANISATION & PERSONNEL
  const organisationItems: NavigationItem[] = [
    ...(isSystemAdmin || isDG
      ? [{ id: 'agencies', label: 'Réseau des Agences', icon: Building2 }]
      : []),
    ...(isSystemAdmin || isDG || isAgencyAdmin
      ? [{ id: 'members', label: 'Gestion des Utilisateurs', icon: Users }]
      : []),
    ...(isSystemAdmin || isDG || isAgencyAdmin
      ? [{ id: 'registrations', label: 'Demandes Inscription', icon: UserCheck }]
      : []),
    {
      id: 'internal_directory',
      label: 'Répertoire interne',
      icon: BookUser,
    },
    {
      id: 'incidents',
      label: 'Incidents & Alertes',
      icon: ShieldAlert,
    },
  ];

  // Section 3 : CONTRÔLE, TRAÇABILITÉ & SYSTÈME
  const controleItems: NavigationItem[] = [
    ...(isSystemAdmin || isDG || isAgencyAdmin
      ? [{ id: 'audit', label: "Journal d'audit", icon: ShieldCheck }]
      : []),
    {
      id: 'connectivity',
      label: 'Disponibilité & Synchro',
      icon: Wifi,
    },
    {
      id: 'settings',
      label: 'Paramètres & Configuration',
      icon: Settings,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
    },
    {
      id: 'profile',
      label: 'Mon profil',
      icon: User,
    },
  ];

  const displayName = user?.displayName || 'Aimable';
  const roleLabel = (role && ROLE_LABELS[role]) || 'Administrateur système';

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col bg-[#0B192C] text-slate-200 select-none shadow-2xl border-r border-[#162A45]/50">
      {/* Brand Header avec EA doré */}
      <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-[#162A45]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#C58B39] text-[#0B192C] font-black text-sm shadow-md shadow-[#C58B39]/20">
            EA
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-wider text-white">
              AMANI
            </div>
            <div className="text-[10px] font-semibold tracking-widest text-slate-400">
              ETS · GESTION
            </div>
          </div>
        </div>

        {/* Bouton fermeture si utilisé en tiroir modal */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation Scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-700/50">
        {/* PILOTAGE */}
        <NavigationGroup
          title="PILOTAGE"
          items={pilotageItems}
          activeItem={activeItem}
          onNavigate={handleNavigation}
        />

        {/* ORGANISATION */}
        {organisationItems.length > 0 && (
          <NavigationGroup
            title="ORGANISATION"
            items={organisationItems}
            activeItem={activeItem}
            onNavigate={handleNavigation}
          />
        )}

        {/* CONTRÔLE */}
        <NavigationGroup
          title="CONTRÔLE & SYSTÈME"
          items={controleItems}
          activeItem={activeItem}
          onNavigate={handleNavigation}
        />
      </div>

      {/* Carte Utilisateur Bas de Sidebar */}
      <div className="shrink-0 p-3 border-t border-[#162A45]">
        <div className="rounded-xl bg-[#13233D] p-2.5 border border-slate-700/40 flex items-center justify-between gap-2.5 shadow-xs">
          <button
            type="button"
            onClick={() => handleNavigation('profile')}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left group"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1B3254] text-white font-bold text-xs ring-1 ring-slate-600/50">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-white group-hover:text-[#C58B39] transition-colors">
                {displayName}
              </div>
              <div className="truncate text-[10px] text-slate-400">
                {roleLabel}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => signOut()}
            title="Déconnexion sécurisée"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavigationGroup({
  title,
  items,
  activeItem,
  onNavigate,
}: {
  title: string;
  items: NavigationItem[];
  activeItem: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 px-3 text-[10px] font-bold tracking-widest uppercase text-slate-400/80">
        {title}
      </div>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeItem === item.id ||
            (item.id === 'dashboard' && (activeItem === 'overview' || activeItem === '')) ||
            (item.id === 'transactions' && (activeItem === 'operations' || activeItem === 'operations-management')) ||
            (item.id === 'chat' && (activeItem === 'internal-chat' || activeItem === 'messages')) ||
            (item.id === 'reports' && (activeItem === 'reports-center' || activeItem === 'reports_audit')) ||
            (item.id === 'treasury' && (activeItem === 'billetage' || activeItem === 'treasury')) ||
            (item.id === 'members' && activeItem === 'users') ||
            (item.id === 'audit' && (activeItem === 'audit' || activeItem === 'audit-logs'));

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={[
                'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-all',
                isActive
                  ? 'bg-[#1A2E4C] text-[#C58B39] font-bold shadow-xs ring-1 ring-white/10'
                  : 'font-medium text-slate-300 hover:bg-white/5 hover:text-white',
              ].join(' ')}
            >
              <Icon
                size={15}
                strokeWidth={isActive ? 2.2 : 1.8}
                className={
                  isActive
                    ? 'text-[#C58B39]'
                    : 'text-slate-400 transition-colors group-hover:text-slate-200'
                }
              />
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <span className="ml-auto rounded bg-[#C58B39]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#C58B39]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
