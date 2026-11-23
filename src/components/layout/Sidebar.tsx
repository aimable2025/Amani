import {
  ArrowLeftRight,
  Bell,
  Building2,
  ClipboardList,
  Coins,
  FileText,
  Landmark,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Scale,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  User,
  UserCheck,
  Users,
  Wallet,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
  const isExternal = role === 'client' || role === 'abonne';

  let pilotageItems: NavigationItem[] = [];
  let organisationItems: NavigationItem[] = [];
  let controleItems: NavigationItem[] = [];

  if (isExternal) {
    pilotageItems = [
      { id: 'dashboard', label: 'Accueil & Opérations', icon: LayoutGrid },
      { id: 'commandes', label: 'Commande', icon: ClipboardList },
      { id: 'billetage', label: 'Calculateur Billetage', icon: Coins },
    ];
    controleItems = [
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'profile', label: 'Mon profil', icon: User },
    ];
  } else if (isAgent) {
    pilotageItems = [
      { id: 'dashboard', label: 'Accueil & Missions', icon: LayoutGrid },
      { id: 'funds', label: 'Crédits & Fonds', icon: Wallet },
      { id: 'transactions', label: 'Missions & Opérations', icon: Share2 },
      { id: 'commandes', label: 'Commandes Clients', icon: ClipboardList },
      { id: 'billetage', label: 'Billetage Caisse', icon: Coins },
      { id: 'salaries', label: 'Mon Salaire', icon: WalletCards },
      { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
      { id: 'debts', label: 'Dettes & Avances', icon: Scale },
    ];
    organisationItems = [
      { id: 'chat', label: 'Chat & Annonces', icon: MessageSquare },
      { id: 'reports', label: 'Rapports', icon: FileText },
    ];
    controleItems = [
      { id: 'connectivity', label: 'Disponibilité & Synchro', icon: Wifi },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'profile', label: 'Mon profil', icon: User },
    ];
  } else if (isAgencyAdmin) {
    pilotageItems = [
      { id: 'dashboard', label: 'Accueil Agence', icon: LayoutGrid },
      { id: 'funds', label: 'Crédits & Fonds', icon: Wallet },
      { id: 'transactions', label: 'Opérations', icon: Share2 },
      { id: 'commandes', label: 'Commandes Clients', icon: ClipboardList },
      { id: 'treasury', label: 'Billetage & Caisse', icon: Coins },
      { id: 'salaries', label: 'Salaires & Paie', icon: WalletCards },
      { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
      { id: 'debts', label: 'Dettes & Créances', icon: Scale },
    ];
    organisationItems = [
      { id: 'members', label: 'Agents & Équipe', icon: Users },
      { id: 'registrations', label: 'Inscriptions', icon: UserCheck },
      { id: 'chat', label: 'Chat & Annonces', icon: MessageSquare },
      { id: 'reports', label: 'Rapports', icon: FileText },
    ];
    controleItems = [
      { id: 'audit', label: "Journal d'audit", icon: ShieldCheck },
      { id: 'connectivity', label: 'Disponibilité & Synchro', icon: Wifi },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'profile', label: 'Mon profil', icon: User },
    ];
  } else if (isDG) {
    pilotageItems = [
      { id: 'dashboard', label: 'Vue Globale', icon: LayoutGrid },
      { id: 'funds', label: 'Crédits & Fonds', icon: Wallet },
      { id: 'transactions', label: 'Opérations Réseau', icon: Share2 },
      { id: 'commandes', label: 'Commandes Clients', icon: ClipboardList },
      { id: 'treasury', label: 'Billetage & Caisse', icon: Landmark },
      { id: 'salaries', label: 'Salaires & Paie', icon: WalletCards },
      { id: 'transfers', label: 'Transferts Inter-Agences', icon: ArrowLeftRight },
      { id: 'debts', label: 'Dettes & Créances', icon: Scale },
    ];
    organisationItems = [
      { id: 'agencies', label: 'Réseau des Agences', icon: Building2 },
      { id: 'members', label: 'Utilisateurs & Agents', icon: Users },
      { id: 'registrations', label: 'Inscriptions', icon: UserCheck },
      { id: 'internal_directory', label: 'Flotte & SMS', icon: Smartphone },
      { id: 'chat', label: 'Chat & Notes', icon: MessageSquare },
      { id: 'reports', label: 'Rapports & Synthèses', icon: FileText },
    ];
    controleItems = [
      { id: 'audit', label: "Journal d'audit", icon: ShieldCheck },
      { id: 'connectivity', label: 'Disponibilité & Synchro', icon: Wifi },
      { id: 'settings', label: 'Configuration DG', icon: Settings },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'profile', label: 'Mon profil', icon: User },
    ];
  } else {
    // Administrateur Système (ou défaut interne)
    pilotageItems = [
      { id: 'dashboard', label: 'Vue Système', icon: LayoutGrid },
      { id: 'funds', label: 'Crédits & Fonds', icon: Wallet },
      { id: 'members', label: 'Utilisateurs & Rôles', icon: Users },
      { id: 'registrations', label: 'Inscriptions', icon: UserCheck },
      ...(isSystemAdmin
        ? [{ id: 'dg_governance', label: 'Gouvernance DG', icon: ShieldCheck }]
        : []),
      { id: 'agencies', label: 'Réseau des Agences', icon: Building2 },
    ];
    organisationItems = [
      { id: 'transactions', label: 'Opérations', icon: Share2 },
      { id: 'commandes', label: 'Commandes Clients', icon: ClipboardList },
      { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
      { id: 'internal_directory', label: 'Flotte & SMS', icon: Smartphone },
      { id: 'chat', label: 'Chat & Notes', icon: MessageSquare },
      { id: 'reports', label: 'Rapports', icon: FileText },
    ];
    controleItems = [
      { id: 'audit', label: "Journal d'audit", icon: ShieldCheck },
      { id: 'connectivity', label: 'Disponibilité & Synchro', icon: Wifi },
      { id: 'settings', label: 'Configuration', icon: Settings },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'profile', label: 'Mon profil', icon: User },
    ];
  }

  const displayName = user?.displayName || 'Utilisateur';
  const roleLabel = (role && ROLE_LABELS[role]) || 'Compte actif';

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-[#0B192C] text-slate-200 select-none border-r border-[#162A45]/70">
      {/* Brand Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-[#162A45]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C58B39] text-[#0B192C] font-black text-xs">
            EA
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-wider text-white leading-none">
              Ets AMANI
            </div>
            <div className="text-[10px] font-semibold tracking-widest text-slate-400 mt-0.5 truncate">
              SUPERVISION & CONTRÔLE
            </div>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"
            aria-label="Fermer le menu"
          >
            <X size={17} />
          </button>
        )}
      </div>

      {/* Navigation Scrollable */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3.5 space-y-4 scrollbar-thin">
        <NavigationGroup
          title="PILOTAGE"
          items={pilotageItems}
          activeItem={activeItem}
          onNavigate={handleNavigation}
        />

        {organisationItems.length > 0 && (
          <NavigationGroup
            title="ORGANISATION"
            items={organisationItems}
            activeItem={activeItem}
            onNavigate={handleNavigation}
          />
        )}

        <NavigationGroup
          title={isExternal ? 'COMPTE' : 'CONTRÔLE & SYSTÈME'}
          items={controleItems}
          activeItem={activeItem}
          onNavigate={handleNavigation}
        />
      </div>

      {/* Carte Utilisateur Bas de Sidebar */}
      <div className="shrink-0 p-2.5 border-t border-[#162A45]">
        <div className="rounded-xl bg-[#13233D] p-2 border border-slate-700/40 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => handleNavigation('profile')}
            className="flex items-center gap-2 min-w-0 flex-1 text-left group"
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
            onClick={() => void signOut()}
            title="Déconnexion sécurisée"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition"
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
      <div className="mb-1 px-2.5 text-[10px] font-bold tracking-widest uppercase text-slate-400/80">
        {title}
      </div>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeItem === item.id ||
            (item.id === 'dashboard' && (activeItem === 'overview' || activeItem === '')) ||
            (item.id === 'commandes' && (activeItem === 'commandes' || activeItem === 'orders' || activeItem === 'client-orders')) ||
            (item.id === 'transactions' && (activeItem === 'operations' || activeItem === 'operations-management')) ||
            (item.id === 'chat' && (activeItem === 'internal-chat' || activeItem === 'messages')) ||
            (item.id === 'reports' && (activeItem === 'reports-center' || activeItem === 'reports_audit')) ||
            (item.id === 'treasury' && (activeItem === 'billetage' || activeItem === 'treasury')) ||
            (item.id === 'salaries' && (activeItem === 'salaries' || activeItem === 'salaries-management')) ||
            (item.id === 'internal_directory' && (activeItem === 'internal-numbers' || activeItem === 'internal_directory')) ||
            (item.id === 'connectivity' && (activeItem === 'connectivity-sync' || activeItem === 'connectivity')) ||
            (item.id === 'members' && (activeItem === 'users' || activeItem === 'agents-management' || activeItem === 'members')) ||
            (item.id === 'audit' && (activeItem === 'audit' || activeItem === 'audit-logs'));

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={[
                'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                isActive
                  ? 'bg-[#1A2E4C] text-[#C58B39] font-bold ring-1 ring-white/10'
                  : 'font-medium text-slate-300 hover:bg-white/5 hover:text-white',
              ].join(' ')}
            >
              <Icon
                size={15}
                strokeWidth={isActive ? 2.2 : 1.8}
                className={
                  isActive
                    ? 'text-[#C58B39] shrink-0'
                    : 'text-slate-400 shrink-0 transition-colors group-hover:text-slate-200'
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
