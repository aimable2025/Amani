import React from 'react';
import {
  Activity,
  ArrowRight,
  Command,
  FileText,
  HelpCircle,
  Keyboard,
  MessageSquare,
  RefreshCw,
  User,
  WalletCards,
  Wifi,
  Sun,
  ShieldCheck,
  X,
} from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateShortcut?: (target: string) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  actionId?: string;
  icon: typeof Activity;
  badge?: string;
}

export default function KeyboardShortcutsModal({
  isOpen,
  onClose,
  onNavigateShortcut,
}: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const navigationShortcuts: ShortcutItem[] = [
    {
      keys: [modKey, 'D'],
      description: 'Tableau de bord principal / Vue générale',
      actionId: 'dashboard',
      icon: Activity,
      badge: 'Principal',
    },
    {
      keys: [modKey, 'B'],
      description: 'Billetage de Caisse & Devises USD/CDF',
      actionId: 'billetage',
      icon: WalletCards,
      badge: 'Trésorerie',
    },
    {
      keys: [modKey, 'M'],
      description: 'Missions & Opérations Réseau',
      actionId: 'transactions',
      icon: Activity,
      badge: 'Missions',
    },
    {
      keys: ['Alt', 'R'],
      description: 'Rapports d’Activité & Synthèses d’Agence',
      actionId: 'reports',
      icon: FileText,
      badge: 'Rapports',
    },
    {
      keys: ['Alt', 'C'],
      description: 'Messagerie Interne & Notes Officielles',
      actionId: 'chat',
      icon: MessageSquare,
      badge: 'Chat',
    },
    {
      keys: ['Alt', 'A'],
      description: "Journal d'Activité & Audit Système (Administrateurs)",
      actionId: 'audit',
      icon: ShieldCheck,
      badge: 'Audit',
    },
  ];

  const actionShortcuts: ShortcutItem[] = [
    {
      keys: [modKey, 'S'],
      description: 'Synchronisation immédiate vers le serveur central',
      icon: RefreshCw,
      badge: 'Synchronisation',
    },
    {
      keys: [modKey, 'P'],
      description: 'Mon Profil & Paramètres Photo',
      icon: User,
      badge: 'Compte',
    },
    {
      keys: ['Alt', 'T'],
      description: 'Basculer le thème (Mode Clair / Mode Sombre)',
      actionId: 'toggle-theme',
      icon: Sun,
      badge: 'Thème',
    },
    {
      keys: [modKey, 'I'],
      description: 'État du Réseau & File de Synchronisation',
      icon: Wifi,
      badge: 'Diagnostic',
    },
    {
      keys: ['?'],
      description: 'Afficher cette aide des raccourcis clavier',
      icon: HelpCircle,
      badge: 'Aide',
    },
    {
      keys: ['Échap'],
      description: 'Fermer les fenêtres modales / annuler',
      icon: X,
      badge: 'Fermeture',
    },
  ];

  const handleRun = (actionId?: string) => {
    if (actionId && onNavigateShortcut) {
      onNavigateShortcut(actionId);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-2xl">
        {/* Lueur supérieure */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-44 w-80 rounded-full bg-emerald-500/15 blur-3xl" />

        {/* En-tête du modal */}
        <div className="relative z-10 flex items-center justify-between border-b border-slate-800/90 px-6 py-4.5 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-slate-950 shadow-md">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight text-white">
                  Raccourcis Clavier Globaux
                </h3>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                  Mode Expert
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Naviguez instantanément dans les tableaux de bord et déclenchez vos actions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white transition"
            title="Fermer (Échap)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps des raccourcis */}
        <div className="relative z-10 p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Section Navigation Rapide */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Command className="h-3.5 w-3.5 text-emerald-400" />
                Navigation directe entre modules
              </span>
              <span className="text-[11px] text-slate-500">
                Fonctionne depuis n'importe quel écran
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {navigationShortcuts.map((sc) => {
                const Icon = sc.icon;
                return (
                  <button
                    key={sc.description}
                    type="button"
                    onClick={() => handleRun(sc.actionId)}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3 text-left transition hover:border-emerald-500/50 hover:bg-slate-900 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 group-hover:bg-emerald-500 group-hover:text-slate-950 transition">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                          {sc.description}
                        </p>
                        {sc.badge && (
                          <span className="text-[10px] text-slate-400">
                            {sc.badge}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {sc.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[24px] px-1.5 py-0.5 rounded-lg border border-slate-700 bg-slate-800 text-[11px] font-mono font-bold text-slate-200 shadow-inner text-center"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Actions Systèmes */}
          <div className="space-y-3 pt-2 border-t border-slate-800/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
                Actions Rapides & Productivité
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {actionShortcuts.map((sc) => {
                const Icon = sc.icon;
                return (
                  <div
                    key={sc.description}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3 text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">
                          {sc.description}
                        </p>
                        {sc.badge && (
                          <span className="text-[10px] text-slate-400">
                            {sc.badge}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {sc.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[24px] px-1.5 py-0.5 rounded-lg border border-slate-700 bg-slate-800 text-[11px] font-mono font-bold text-slate-200 shadow-inner text-center"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Astuce de compatibilité */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3 text-[11px] text-slate-400 flex items-start gap-2.5">
            <span className="text-emerald-400 font-bold shrink-0">💡 Astuce :</span>
            <span>
              Les combinaisons <kbd className="px-1 py-0.2 rounded bg-slate-800 text-slate-200 font-mono">Alt + Lettre</kbd> sont également prises en charge pour éviter tout conflit avec les raccourcis natifs du navigateur.
            </span>
          </div>
        </div>

        {/* Pied de page */}
        <div className="relative z-10 border-t border-slate-800/90 bg-slate-950/80 px-6 py-3 flex items-center justify-between text-xs text-slate-400">
          <span>Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px]">Échap</kbd> pour fermer</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-1.5 font-bold text-white hover:bg-slate-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
