import { Coins, CreditCard, LayoutDashboard, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
import BilletageModule from './components/BilletageModule';
import { db } from '../../lib/db';
import type { Operation } from '../../types/operation';

const CLIENT_TABS: WorkspaceTab[] = [
  { id: 'dashboard', label: 'Mes Opérations', icon: LayoutDashboard },
  { id: 'billetage', label: 'Calculateur Billetage', icon: Coins },
];

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showBilletage, setShowBilletage] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);

  useEffect(() => {
    if (!user) return;
    db.operations
      .toArray()
      .then((all) => {
        const mine = all.filter(
          (op) =>
            op.createdBy === user.uid ||
            (user.phone && op.accountNumber === user.phone) ||
            (user.phoneNumber && op.accountNumber === user.phoneNumber)
        );
        mine.sort((a, b) => b.createdAt - a.createdAt);
        setOperations(mine);
      })
      .catch(() => {});
  }, [user]);

  const handleSidebarNavigate = (item: string) => {
    if (item === 'profile') {
      navigate('/profil');
      return;
    }
    if (item === 'billetage') {
      setShowBilletage(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'dashboard' || item === 'transactions' || item === 'operations') {
      setShowBilletage(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <AppLayout
      title="Espace Client — Ets AMANI"
      subtitle="Consultation de vos transactions, transferts et paiements"
      activeItem={showBilletage ? 'billetage' : 'dashboard'}
      onNavigate={handleSidebarNavigate}
    >
      <div className="space-y-4">
        {/* Identité Client compacte */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar user={user} size="md" showStatus isOnline className="shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  Bienvenue, {user?.displayName || 'Client'}
                </h2>
                <span className="rounded bg-blue-50 dark:bg-blue-950/70 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
                  Client Certifié
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Compte Client Ets AMANI · Guichet & services de change
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Opérations
              </span>
              <span className="font-black text-base tabular-nums text-slate-900 dark:text-white">
                {operations.length}
              </span>
            </div>
          </div>
        </div>

        <WorkspaceNavigationHeader
          workspaceTitle="Espace Client"
          activeModuleTitle={showBilletage ? 'Calculateur Billetage & Devises' : 'Historique des Opérations'}
          backLabel="Mes Opérations"
          onBack={() => {
            setShowBilletage(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          tabs={CLIENT_TABS}
          activeTabId={showBilletage ? 'billetage' : 'dashboard'}
          onTabChange={(id) => {
            setShowBilletage(id === 'billetage');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />

        {showBilletage ? (
          <BilletageModule onClose={() => setShowBilletage(false)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Dernières Opérations
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Historique de vos opérations au guichet
                  </p>
                </div>
              </div>
              {operations.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Aucune opération récente enregistrée.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {operations.map((op) => (
                    <div
                      key={op.operationNumber || op.createdAt}
                      className="py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">
                          {op.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                          {op.operationNumber} · {op.agencyName}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {op.amount !== undefined && (
                          <p className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {op.amount.toLocaleString('fr-FR')} {op.currency}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 tabular-nums">
                          {new Date(op.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Services Disponibles
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Présentez-vous en agence pour vos transactions
                  </p>
                </div>
              </div>
              <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                <li className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-lg">
                  Change manuel devises USD / CDF aux meilleurs taux
                </li>
                <li className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-lg">
                  Dépôts et retraits Mobile Money (Airtel Money, M-Pesa, Orange Money)
                </li>
                <li className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-lg">
                  Transferts inter-agences sécurisés avec notification instantanée
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
