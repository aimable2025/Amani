import { Coins, LayoutDashboard, Receipt, ShieldCheck } from 'lucide-react';
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
import { getAgency } from '../../services/AgencyService';
import type { Operation } from '../../types/operation';

const ABONNE_TABS: WorkspaceTab[] = [
  { id: 'dashboard', label: 'Espace Abonné', icon: LayoutDashboard },
  { id: 'billetage', label: 'Calculateur Billetage', icon: Coins },
];

export default function AbonneDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showBilletage, setShowBilletage] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [agencyName, setAgencyName] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    if (user.agencyId) {
      getAgency(user.agencyId)
        .then((ag) => {
          if (ag?.name) setAgencyName(ag.name);
        })
        .catch(() => {});
    }
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
      title="Espace Abonné Privilégié — Ets AMANI"
      subtitle="Compte Partenaire & facilitation des transferts de fonds"
      activeItem={showBilletage ? 'billetage' : 'dashboard'}
      onNavigate={handleSidebarNavigate}
    >
      <div className="space-y-4">
        {/* Identité Abonné compacte */}
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar user={user} size="md" showStatus isOnline className="shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {user?.displayName || 'Abonné'}
                </h2>
                <span className="rounded bg-amber-50 dark:bg-amber-950/70 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                  Partenaire VIP
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Agence de rattachement :{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {agencyName || user?.agencyId || 'Centrale'}
                </strong>
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
          workspaceTitle="Espace Partenaire VIP"
          activeModuleTitle={showBilletage ? 'Calculateur Billetage & Devises' : 'Avantages & Historique'}
          backLabel="Mon Compte Abonné"
          onBack={() => {
            setShowBilletage(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          tabs={ABONNE_TABS}
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
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Avantages Abonné
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Conditions préférentielles sur le réseau
                  </p>
                </div>
              </div>
              <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                <li className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-lg">
                  Taux de change préférentiels négociés avec la Direction
                </li>
                <li className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-lg">
                  Traitement prioritaire au guichet de votre agence de rattachement
                </li>
                <li className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-lg">
                  Ligne directe avec le responsable d&apos;agence et assistance personnalisée
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Activité Récente
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mouvements de fonds enregistrés
                  </p>
                </div>
              </div>
              {operations.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Aucun mouvement récent enregistré sur votre compte abonné.
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
          </div>
        )}
      </div>
    </AppLayout>
  );
}
