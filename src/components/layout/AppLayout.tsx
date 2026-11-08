import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Camera, CheckCircle2, Command, Keyboard, Loader2, LogOut, RefreshCw, Trash2, User, Wifi, X } from 'lucide-react';
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
  subtitle = 'Vue d ensemble de votre activité',
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
      await Promise.all([
        triggerSyncNow(),
        syncPendingSmsOperations(),
      ]);
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
      // Échap : fermer les fenêtres modales
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

      // Ouvrir l'aide des raccourcis clavier avec '?' ou 'Ctrl + /'
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

      // 1. Navigation Tableau de bord Principal (Ctrl+D ou Alt+D)
      if (key === 'd') {
        event.preventDefault();
        onNavigate?.('dashboard');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Tableau de bord');
      }
      // 2. Navigation Billetage & Devises (Ctrl+B ou Alt+B)
      else if (key === 'b') {
        event.preventDefault();
        onNavigate?.('billetage');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Billetage de Caisse');
      }
      // 3. Navigation Missions & Opérations (Ctrl+M ou Alt+M)
      else if (key === 'm') {
        event.preventDefault();
        onNavigate?.('transactions');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Missions & Opérations');
      }
      // 4. Navigation Rapports & Synthèses (Alt+R ou Ctrl+Shift+R)
      else if (key === 'r' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        onNavigate?.('reports');
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Rapports d’Activité');
      }
      // 5. Navigation Messagerie Interne / Chat (Alt+C ou Ctrl+Shift+C)
      else if (key === 'c' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        if (onNavigateToChat) {
          onNavigateToChat();
        } else {
          onNavigate?.('chat');
        }
        setMobileMenuOpen(false);
        triggerShortcutFeedback('Messagerie Interne');
      }
      // 5b. Navigation Journal d'Audit Système & Agence (Alt+A ou Ctrl+Shift+A)
      else if (key === 'a' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        onNavigate?.('audit');
        setMobileMenuOpen(false);
        triggerShortcutFeedback("Journal d'Audit Système");
      }
      // 6. Déclenchement de la Synchronisation Immédiate (Ctrl+S ou Alt+S)
      else if (key === 's') {
        event.preventDefault();
        void handleSyncNow();
        triggerShortcutFeedback('Synchronisation lancée...');
      }
      // 7. Ouverture Profil & Paramètres (Alt+P ou Ctrl+Shift+P)
      else if (key === 'p' && (event.altKey || event.shiftKey)) {
        event.preventDefault();
        navigate('/profil');
        triggerShortcutFeedback('Profil Utilisateur');
      }
      // 8. État Réseau & Notifications (Ctrl+I ou Alt+I)
      else if (key === 'i') {
        event.preventDefault();
        setShowNotificationsModal(true);
        triggerShortcutFeedback('Diagnostic & Notifications');
      }
      // 9. Bascule Thème Clair / Sombre (Alt+T ou Ctrl+Shift+T)
      else if (key === 't' && (event.altKey || event.shiftKey)) {
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

  const handleNavigate = (item: string) => {
    onNavigate?.(item);
    setMobileMenuOpen(false);
  };

  const handleMobileMenuClick = () => {
    setMobileMenuOpen((current) => !current);
  };

  const handleOpenNotifications = () => {
    if (onNotificationsClick) {
      onNotificationsClick();
    } else {
      setShowNotificationsModal(true);
    }
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
    } else if (item === 'menu') {
      setMobileMenuOpen(true);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50 flex flex-col flex-1 transition-colors duration-200">
      <div className="flex min-h-full flex-1">
        {/* Barre latérale fixe sur grand écran uniquement si demandé, sinon navigation horizontale fluide */}
        {isDesktopMode && (
          <div className="no-print hidden lg:flex lg:shrink-0">
            <div className="sticky top-0 h-screen">
              <Sidebar
                activeItem={activeItem}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        )}

        {/* Tiroir latéral mobile / tablette / bureau (ouvert via le bouton Menu) */}
        {mobileMenuOpen && (
          <div className="no-print fixed inset-0 z-[60]">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />
            <div className="relative z-10 h-full w-[min(19rem,86%)] shadow-2xl animate-in slide-in-from-left duration-200">
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
                'mx-auto w-full px-4 py-5',
                isDesktopMode ? 'max-w-7xl sm:px-6 lg:px-8 pb-16' : 'pb-24',
              ].join(' ')}
            >
              {children}

              <footer className="mt-10 border-t border-slate-200/80 dark:border-slate-800 pt-5 pb-2 text-center text-xs text-slate-500 dark:text-slate-400">
                <p className="font-semibold text-slate-700 dark:text-slate-300 tracking-tight">
                  Ets AMANI — Ensemble, plus connectés, plus efficaces
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Système de gestion financière, de caisse et de supervision multi-agences • Offline-First
                </p>
              </footer>
            </div>
          </main>

          <div className={isDesktopMode ? 'no-print lg:hidden' : 'no-print'}>
            <MobileNavigation
              activeItem={activeItem}
              onNavigate={handleMobileBottomNavigate}
              onMenuClick={handleMobileMenuClick}
            />
          </div>
        </div>
      </div>

      {/* Modal Notifications & État Réel */}
      {showNotificationsModal && (
        <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Bell className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  État Opérationnel & Synchronisation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center gap-2.5">
                  <Wifi className={`h-4 w-4 ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className="font-semibold text-slate-700">Connectivité réseau</span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {isOnline ? 'En ligne' : 'Hors-ligne (Stockage local)'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="font-semibold text-slate-700">Éléments en attente de sync</span>
                <span className="font-bold tabular-nums text-slate-900">{pendingSyncCount}</span>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="font-semibold text-slate-700">Opérations actives en cours</span>
                <span className="font-bold tabular-nums text-slate-900">{activeOpsCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncingNow}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                <span>{isSyncingNow ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Profil Utilisateur & Paramètres Photo */}
      {showProfileModal && user && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Mon Profil & Paramètres</h3>
                <p className="text-xs text-slate-500">Identité et photo de profil Ets AMANI</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Section Avatar & Mise à jour de la photo */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-center">
              <div className="relative">
                <UserAvatar
                  user={user}
                  size="xl"
                  statusDot={isOnline ? 'online' : 'offline'}
                  className="ring-4 ring-white shadow-md"
                />
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  title="Modifier ma photo de profil"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdatingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div>
                <p className="text-base font-bold text-slate-900">{user.displayName}</p>
                <p className="text-xs text-slate-500">{user.email || user.phone || 'Session active'}</p>
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {user.photoURL ? 'Changer la photo' : 'Téléverser une photo'}
                </button>
                {user.photoURL && (
                  <button
                    type="button"
                    disabled={isUpdatingPhoto}
                    onClick={handleRemovePhoto}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </button>
                )}
              </div>

              {photoFeedback && (
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{photoFeedback}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Rôle</span>
                <span className="font-bold text-slate-800">{user.role}</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Statut</span>
                <span className="font-bold text-emerald-700">{user.status}</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Agence</span>
                <span className="font-bold text-slate-800">{user.agencyId || 'Siège / Global'}</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Fonction</span>
                <span className="font-bold text-slate-800">{user.function || 'Standard'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  void signOut();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </button>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast lors du déclenchement d'un raccourci clavier */}
      {shortcutFeedback && (
        <div className="no-print fixed bottom-16 right-4 sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto z-[95] flex items-center gap-2 rounded-2xl border border-emerald-500/50 bg-slate-950/95 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Command className="h-4 w-4 text-emerald-400" />
          <span>Raccourci activé : {shortcutFeedback}</span>
        </div>
      )}

      {/* Modal d'aide & cartographie des raccourcis clavier */}
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
