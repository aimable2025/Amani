import React, { useEffect, lazy, Suspense } from 'react';
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

const AdministrateurSystemeDashboard = lazy(() => import('./pages/dashboard/AdministrateurSystemeDashboard'));
const DirecteurGeneralDashboard = lazy(() => import('./pages/dashboard/DirecteurGeneralDashboard'));
const AdministrateurAgenceDashboard = lazy(() => import('./pages/dashboard/AdministrateurAgenceDashboard'));
const AgentDashboard = lazy(() => import('./pages/dashboard/AgentDashboard'));
const ClientDashboard = lazy(() => import('./pages/dashboard/ClientDashboard'));
const AbonneDashboard = lazy(() => import('./pages/dashboard/AbonneDashboard'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));

function PageLoader() {
  return (
    <div className="min-h-screen flex-1 flex items-center justify-center bg-[var(--app-bg)] text-[var(--app-text)]">
      <div className="flex flex-col items-center space-y-3">
        <img
          src="/logo.png"
          alt="Logo Ets AMANI"
          className="h-14 w-14 rounded-xl object-contain bg-[#0B192C] p-2 shadow-sm border border-slate-200 dark:border-slate-800"
        />
        <div className="w-7 h-7 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Chargement du module...</p>
      </div>
    </div>
  );
}

function HomeRedirect() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex-1 flex items-center justify-center bg-[var(--app-bg)] text-[var(--app-text)]">
        <div className="flex flex-col items-center space-y-3">
          <img
            src="/logo.png"
            alt="Logo Ets AMANI"
            className="h-14 w-14 rounded-xl object-contain bg-[#0B192C] p-2 shadow-sm border border-slate-200 dark:border-slate-800"
          />
          <div className="w-7 h-7 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Initialisation d'Ets AMANI...</p>
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
    void registerNotificationServiceWorker();

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
        <Route path="/" element={<HomeRedirect />} />

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

        <Route path="/validation-en-attente" element={<ApprovalPendingPage />} />

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

        <Route
          path="/profil"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen w-full bg-[var(--app-bg)] text-[var(--app-text)] font-sans selection:bg-emerald-500 selection:text-slate-950 transition-colors duration-200">
            <FramePhone appName="Ets AMANI">
              <AppRoutes />
            </FramePhone>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
