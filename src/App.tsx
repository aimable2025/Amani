import React, { useEffect, useState, lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { getDashboardRoute } from './utils/roleRedirect';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ApprovalPendingPage from './pages/dashboard/ApprovalPendingPage';
import { startSyncWorker } from './services/SyncWorker';
import { startSmsSyncWorker } from './services/SmsOperationService';
import { startSmsListener } from './services/SmsListenerService';
import { registerNotificationServiceWorker } from './services/LocalNotificationService';
import FramePhone from './components/common/FramePhone';
import { ThemeProvider } from './contexts/ThemeContext';
import ThemeToggle from './components/common/ThemeToggle';

// Chargement différé (Code-Splitting) des tableaux de bord lourds
const AdministrateurSystemeDashboard = lazy(() => import('./pages/dashboard/AdministrateurSystemeDashboard'));
const DirecteurGeneralDashboard = lazy(() => import('./pages/dashboard/DirecteurGeneralDashboard'));
const AdministrateurAgenceDashboard = lazy(() => import('./pages/dashboard/AdministrateurAgenceDashboard'));
const AgentDashboard = lazy(() => import('./pages/dashboard/AgentDashboard'));
const ClientDashboard = lazy(() => import('./pages/dashboard/ClientDashboard'));
const AbonneDashboard = lazy(() => import('./pages/dashboard/AbonneDashboard'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));

// Écran de chargement intermédiaire lors de la transition de route
function PageLoader() {
  return (
    <div className="min-h-full flex-1 flex items-center justify-center bg-slate-900 text-white">
      <div className="flex flex-col items-center space-y-4">
        <img
          src="/logo.png"
          alt="Logo Ets AMANI"
          className="h-16 w-16 rounded-2xl object-contain bg-slate-950 p-2 shadow-lg ring-1 ring-white/15"
        />
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-400">Chargement du module...</p>
      </div>
    </div>
  );
}

// Helper pour vérifier si le rôle est une autorité d'administration/direction
const isPrivilegedRole = (role?: string) => {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  return normalized === 'administrateur_systeme' || normalized === 'directeur_general';
};

// Redirection intelligente pour la racine
function HomeRedirect() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-full flex-1 flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center space-y-4">
          <img
            src="/logo.png"
            alt="Logo Ets AMANI"
            className="h-16 w-16 rounded-2xl object-contain bg-slate-950 p-2 shadow-lg ring-1 ring-white/15"
          />
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">Initialisation d'Ets AMANI...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    if (
      user.status === 'suspended' ||
      user.status === 'disabled' ||
      user.status === 'rejected' ||
      !user.isApproved
    ) {
      return <Navigate to="/validation-en-attente" replace />;
    }
    return <Navigate to={getDashboardRoute(user)} replace />;
  }

  return <Navigate to="/login" replace />;
}

// Composant pour empêcher un utilisateur connecté d'accéder aux pages /login ou /register
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return null;

  if (isAuthenticated && user) {
    if (
      user.status === 'suspended' ||
      user.status === 'disabled' ||
      user.status === 'rejected' ||
      !user.isApproved
    ) {
      return <Navigate to="/validation-en-attente" replace />;
    }
    return <Navigate to={getDashboardRoute(user)} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  useEffect(() => {
    // Enregistrement du Service Worker pour les notifications push d'arrière-plan
    void registerNotificationServiceWorker();

    // Démarrage des workers de synchronisation Offline-First et du listener SMS Android
    const stopSyncWorker = startSyncWorker();
    const stopSmsWorker = startSmsSyncWorker();
    let stopSmsListenerFn: (() => Promise<void>) | null = null;

    startSmsListener()
      .then((stopFn) => {
        stopSmsListenerFn = stopFn;
      })
      .catch(() => {});

    return () => {
      stopSyncWorker();
      stopSmsWorker();
      if (stopSmsListenerFn) {
        void stopSmsListenerFn();
      }
    };
  }, []);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Route Racine */}
        <Route path="/" element={<HomeRedirect />} />

        {/* Routes Publiques (uniquement si NON connecté) */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />

        {/* Route de validation en attente */}
        <Route path="/validation-en-attente" element={<ApprovalPendingPage />} />

        {/* Rôles & Tableaux de bord avec contrôles RBAC stricts */}
        <Route
          path="/dashboard/administrateur-systeme"
          element={
            <ProtectedRoute allowedRoles={['administrateur_systeme']}>
              <AdministrateurSystemeDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/directeur-general"
          element={
            <ProtectedRoute allowedRoles={['directeur_general']}>
              <DirecteurGeneralDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/administrateur-agence"
          element={
            <ProtectedRoute allowedRoles={['administrateur_agence']}>
              <AdministrateurAgenceDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/agent"
          element={
            <ProtectedRoute allowedRoles={['agent']}>
              <AgentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/client"
          element={
            <ProtectedRoute allowedRoles={['client']}>
              <ClientDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/abonne"
          element={
            <ProtectedRoute allowedRoles={['abonne']}>
              <AbonneDashboard />
            </ProtectedRoute>
          }
        />

        {/* Page de profil utilisateur (consultation et modification) */}
        <Route
          path="/profil"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Catch-all pour les URL inconnues */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

// Responsive Layout Shell pour Ets AMANI avec Header, Main Content et Footer
function ResponsiveAppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950 transition-colors duration-200">
      {/* Header Responsif */}
      <header className="no-print hidden sm:flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white/95 text-slate-900 dark:border-slate-800/80 dark:bg-slate-900/90 dark:text-white px-4 sm:px-6 backdrop-blur-md shrink-0 z-30 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo Ets AMANI"
            className="h-8 w-8 rounded-xl object-contain bg-slate-950 p-1 ring-1 ring-white/10 shadow-xs"
          />
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-black tracking-tight text-slate-950 dark:text-white">Ets AMANI</span>
            <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 font-medium">
              Plate-forme de supervision & gestion opérationnelle
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{isOnline ? 'Système Opérationnel' : 'Mode Hors-Ligne (Stockage local)'}</span>
          </div>

          {/* Bouton bascule de thème dans le header global */}
          <ThemeToggle />

          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <span className="hidden lg:inline text-[11px]">
                {user.displayName} <span className="text-slate-400 dark:text-slate-500">({user.role})</span>
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-[11px] font-semibold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition"
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full flex flex-col relative overflow-hidden">
        {children}
      </main>

      {/* Footer Responsif */}
      <footer className="no-print hidden sm:flex h-11 w-full items-center justify-between border-t border-slate-200 bg-white/90 px-4 sm:px-6 text-[11px] text-slate-500 dark:border-slate-800/80 dark:bg-slate-900/90 dark:text-slate-400 backdrop-blur-md shrink-0 z-20 transition-colors duration-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 dark:text-slate-300">Ets AMANI</span>
          <span>&copy; {new Date().getFullYear()} &bull; Tous droits réservés</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="hidden md:inline text-slate-500 dark:text-slate-400">
            Raccourcis : <kbd className="px-1 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono text-[10px]">Ctrl+D</kbd> Accueil &bull; <kbd className="px-1 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono text-[10px]">Ctrl+B</kbd> Caisse &bull; <kbd className="px-1 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono text-[10px]">?</kbd> Aide
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Contrôle interne & Traçabilité</span>
          <span className="hidden lg:inline text-slate-400 dark:text-slate-500">RDC &bull; Offline-First</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ResponsiveAppLayout>
            <FramePhone appName="Ets AMANI">
              <AppRoutes />
            </FramePhone>
          </ResponsiveAppLayout>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
