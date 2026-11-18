import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Camera,
  CheckCircle2,
  Command,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import Header from './Header';
import MobileNavigation, { type MobileNavigationItem } from './MobileNavigation';
import Sidebar from './Sidebar';
import UserAvatar from '../common/UserAvatar';
import KeyboardShortcutsModal from '../common/KeyboardShortcutsModal';
import { useViewportMode } from '../common/FramePhone';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../lib/db';
import { compressImageToDataUrl } from '../../services/UserProfileService';
import { triggerSyncNow } from '../../services/SyncWorker';
import { syncPendingSmsOperations } from '../../services/SmsOperationService';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  activeItem?: string;
  isOnline?: boolean;
  onNavigate?: (item: string) => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onNavigateToChat?: (target?: import('../common/HeaderChatSearch').ChatNavigationTarget) => void;
}

export default function AppLayout({
  children,
  title = 'Tableau de bord',
  subtitle = 'Supervision & gestion opérationnelle',
  activeItem = 'dashboard',
  isOnline: isOnlineProp,
  onNavigate,
  onNotificationsClick,
  onProfileClick,
  onNavigateToChat,
}: AppLayoutProps) {
  const navigate = useNavigate();
  const { user, signOut, updateProfilePhoto } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { displayMode } = useViewportMode();
  const isDesktopMode = displayMode === 'desktop';

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [networkOnline, setNetworkOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [activeOpsCount, setActiveOpsCount] = useState(0);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const triggerShortcutFeedback = (label: string) => {
    setShortcutFeedback(label);
    setTimeout(() => {
      setShortcutFeedback((cur) => (cur === label ? null : cur));
    }, 2200);
  };

  const isOnline = isOnlineProp ?? networkOnline;

  const loadCounts = useCallback(async () => {
    try {
      const [queue, smsQueue, ops] = await Promise.all([
        db.syncQueue.where('status').equals('pending').count(),
        db.smsSyncQueue.where('status').equals('pending').count(),
        db.operations.toArray(),
      ]);
      setPendingSyncCount(queue + smsQueue);
      const myOps = ops.filter(
        (o) =>
          o.status !== 'termine' &&
          o.status !== 'annule' &&
          o.status !== 'rejete' &&
          (!user?.agencyId || o.agencyId === user.agencyId)
      );
      setActiveOpsCount(myOps.length);
    } catch {
      // ignore
    }
  }, [user?.agencyId]);

  const handleSyncNow = async () => {
    if (isSyncingNow) return;
    setIsSyncingNow(true);
    try {
      await Promise.all([triggerSyncNow(), syncPendingSmsOperations()]);
      await loadCounts();
    } catch {
      // ignore
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUpdatingPhoto(true);
    setPhotoFeedback(null);
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.82);
      await updateProfilePhoto(dataUrl);
      setPhotoFeedback('Photo de profil mise à jour avec succès.');
      setTimeout(() => setPhotoFeedback(null), 3500);
    } catch {
      setPhotoFeedback('Impossible de mettre à jour la photo.');
    } finally {
      setIsUpdatingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = async () => {
    setIsUpdatingPhoto(true);
    setPhotoFeedback(null);
    try {
      await updateProfilePhoto(null);
      setPhotoFeedback('Photo de profil retirée.');
      setTimeout(() => setPhotoFeedback(null), 3000);
    } catch {
      setPhotoFeedback('Impossible de supprimer la photo.');
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  useEffect(() => {
    const onOnline = () => setNetworkOnline(true);
    const onOffline = () => setNetworkOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    void loadCounts();
    const interval = setInterval(() => {
      void loadCounts();
    }, 8000);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProfileModal(false);
        setShowNotificationsModal(false);
        setShowShortcutsModal(false);
        setMobileMenuOpen(false);
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if (
        !isTyping &&
        (event.key === '?' ||
          ((event.ctrlKey || event.metaKey) && event.key === '/'))
      ) {
        event.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      const isModifier = event.ctrlKey || event.metaKey || event.altKey;
      if (!isModifier) return;

      const key = event.key.toLowerCase();

      if (key === 'd') {
        event.preventDefault();
        onNavigate?.('dashboard');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Tableau de bord');
      } else if (key === 'b') {
        event.preventDefault();
        onNavigate?.('billetage');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Billetage de Caisse');
      } else if (key === 'm') {
        event.preventDefault();
        onNavigate?.('transactions');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Missions & Opérations');
      } else if (key === 'r' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        onNavigate?.('reports');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Rapports d’Activité');
      } else if (key === 'c' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        if (onNavigateToChat) {
          onNavigateToChat();
        } else {
          onNavigate?.('chat');
        }
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Messagerie Interne');
      } else if (key === 'a' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        onNavigate?.('audit');
        setMobileMenuOpen(false);
        triggerShortcutFeedback("Journal d'Audit");
      } else if (key === 's') {
        event.preventDefault();
        void handleSyncNow();
        triggerShortcutFeedback('Synchronisation lancée...');
      } else if (key === 'p' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        navigate('/profil');
        triggerShortcutFeedback('Profil Utilisateur');
      } else if (key === 'i') {
        event.preventDefault();
        setShowNotificationsModal(true);
        triggerShortcutFeedback('Diagnostic & Notifications');
      } else if (key === 't' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        toggleTheme();
        triggerShortcutFeedback(isDark ? 'Mode Clair activé' : 'Mode Sombre activé');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loadCounts]);

  const handleOpenNotifications = () => {
    if (onNotificationsClick) {
      onNotificationsClick();
    } else {
      setShowNotificationsModal(true);
    }
  };

  const handleNavigate = (item: string) => {
    setMobileMenuOpen(false);
    if (item === 'notifications') {
      handleOpenNotifications();
      return;
    }
    onNavigate?.(item);
  };

  const handleMobileMenuClick = () => {
    setMobileMenuOpen((current) => !current);
  };

  const handleOpenProfile = () => {
    if (onProfileClick) {
      onProfileClick();
    } else {
      navigate('/profil');
    }
  };

  const handleMobileBottomNavigate = (item: MobileNavigationItem) => {
    if (item === 'dashboard') {
      onNavigate?.('dashboard');
    } else if (item === 'operations') {
      onNavigate?.('transactions');
    } else if (item === 'chat') {
      if (onNavigateToChat) {
        onNavigateToChat();
      } else {
        onNavigate?.('chat');
      }
    } else if (item === 'reports') {
      onNavigate?.('reports');
    } else if (item === 'billetage') {
      onNavigate?.('billetage');
    } else if (item === 'profile') {
      handleOpenProfile();
    } else if (item === 'menu') {
      setMobileMenuOpen(true);
    }
  };

  return (
    <div className="min-h-full bg-[var(--app-bg)] text-[var(--app-text)] flex flex-col flex-1 transition-colors duration-200">
      <div className="flex min-h-full flex-1">
        {isDesktopMode && (
          <div className="no-print hidden lg:flex lg:shrink-0">
            <div className="sticky top-0 h-screen">
              <Sidebar activeItem={activeItem} onNavigate={handleNavigate} />
            </div>
          </div>
        )}

        {mobileMenuOpen && (
          <div className="no-print fixed inset-0 z-[60]">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            />
            <div className="relative z-10 h-full w-[min(17.5rem,85%)] shadow-2xl">
              <Sidebar
                activeItem={activeItem}
                onNavigate={handleNavigate}
                onClose={() => setMobileMenuOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            title={title}
            subtitle={subtitle}
            activeItem={activeItem}
            isOnline={isOnline}
            pendingSyncCount={pendingSyncCount}
            isSyncingNow={isSyncingNow}
            hideMenuButtonOnDesktop={isDesktopMode}
            notificationCount={pendingSyncCount + activeOpsCount}
            onNavigate={handleNavigate}
            onMenuClick={handleMobileMenuClick}
            onSyncNowClick={handleSyncNow}
            onNotificationsClick={handleOpenNotifications}
            onProfileClick={handleOpenProfile}
            onShortcutsClick={() => setShowShortcutsModal(true)}
            onNavigateToChat={onNavigateToChat}
          />

          <main className="min-w-0 flex-1">
            <div
              className={[
                'mx-auto w-full px-3 py-3 sm:px-5 sm:py-4',
                isDesktopMode ? 'max-w-[1440px] lg:px-6 pb-20 lg:pb-8' : 'pb-20',
              ].join(' ')}
            >
              {children}

              <footer className="no-print hidden sm:flex items-center justify-between mt-8 border-t border-slate-200/80 dark:border-slate-800/80 pt-3 pb-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium">
                  Ets AMANI — Supervision, gestion opérationnelle & contrôle interne
                </span>
                <span>Contrôle & Traçabilité • Offline-First</span>
              </footer>
            </div>
          </main>

          <div className={isDesktopMode ? 'no-print lg:hidden' : 'no-print'}>
            <MobileNavigation
              activeItem={activeItem}
              unreadNotificationsCount={pendingSyncCount}
              onNavigate={handleMobileBottomNavigate}
              onMenuClick={handleMobileMenuClick}
            />
          </div>
        </div>
      </div>

      {/* Modal Notifications & État Réel */}
      {showNotificationsModal && (
        <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Bell className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold">
                  État Opérationnel & Synchronisation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3">
                <div className="flex items-center gap-2">
                  <Wifi
                    className={`h-4 w-4 ${
                      isOnline
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Connectivité réseau
                  </span>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    isOnline
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  }`}
                >
                  {isOnline ? 'En ligne' : 'Hors-ligne'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Éléments en attente de sync
                </span>
                <span className="font-bold tabular-nums">{pendingSyncCount}</span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Opérations actives en cours
                </span>
                <span className="font-bold tabular-nums">{activeOpsCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={isSyncingNow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 px-3 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                <span>{isSyncingNow ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-bold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Profil Utilisateur */}
      {showProfileModal && user && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold">Mon Profil & Paramètres</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Identité et photo de profil Ets AMANI
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-4 text-center">
              <div className="relative">
                <UserAvatar
                  user={user}
                  size="xl"
                  statusDot={isOnline ? 'online' : 'offline'}
                  className="ring-4 ring-white dark:ring-slate-800 shadow-sm"
                />
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  title="Modifier ma photo de profil"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white dark:ring-slate-900 transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdatingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div>
                <p className="text-sm font-bold">{user.displayName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user.email || user.phone || 'Session active'}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-bold text-white dark:text-slate-900 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {user.photoURL ? 'Changer la photo' : 'Téléverser une photo'}
                </button>
                {user.photoURL && (
                  <button
                    type="button"
                    disabled={isUpdatingPhoto}
                    onClick={() => void handleRemovePhoto()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </button>
                )}
              </div>

              {photoFeedback && (
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{photoFeedback}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Rôle</span>
                <span className="font-semibold">{user.role}</span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Statut</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{user.status}</span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Agence</span>
                <span className="font-semibold">{user.agencyId || 'Siège / Global'}</span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Fonction</span>
                <span className="font-semibold">{user.function || 'Standard'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  void signOut();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 px-3.5 py-2 text-xs font-bold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60"
              >
                <LogOut className="h-3.5 w-3.5" />
                Se déconnecter
              </button>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-bold text-white dark:text-slate-900 hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {shortcutFeedback && (
        <div className="no-print fixed bottom-16 right-4 sm:bottom-5 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto z-[95] flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-slate-950/95 px-3.5 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md">
          <Command className="h-3.5 w-3.5 text-emerald-400" />
          <span>Raccourci : {shortcutFeedback}</span>
        </div>
      )}

      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        onNavigateShortcut={(target) => {
          if (target === 'toggle-theme') {
            toggleTheme();
            triggerShortcutFeedback(isDark ? 'Mode Clair activé' : 'Mode Sombre activé');
            return;
          }
          if (target === 'profile') {
            navigate('/profil');
            triggerShortcutFeedback('Profil Utilisateur');
            return;
          }
          onNavigate?.(target);
          triggerShortcutFeedback(target);
        }}
      />
    </div>
  );
}
