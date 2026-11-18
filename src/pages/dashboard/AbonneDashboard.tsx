import {
  AlertCircle,
  BellRing,
  ClipboardList,
  Coins,
  FilePlus2,
  LayoutDashboard,
  Receipt,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
import BilletageModule from './components/BilletageModule';
import CommandeModule, { type CommandeSectionId } from './components/CommandeModule';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import { fetchScopedClientOrders } from '../../services/ClientOrderService';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  startClientOrderNotificationWatcher,
} from '../../services/LocalNotificationService';
import {
  CLIENT_ORDER_CATEGORY_LABELS,
  CLIENT_ORDER_STATUS_LABELS,
  type ClientOrder,
} from '../../types/clientOrder';
import type { Operation } from '../../types/operation';

type AbonneView = 'dashboard' | 'commandes' | 'billetage';

const ABONNE_TABS: WorkspaceTab[] = [
  { id: 'dashboard', label: 'Espace Abonné', icon: LayoutDashboard },
  { id: 'commandes', label: 'Commande', icon: ClipboardList },
  { id: 'billetage', label: 'Calculateur Billetage', icon: Coins },
];

export default function AbonneDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<AbonneView>('dashboard');
  const [commandeSection, setCommandeSection] =
    useState<CommandeSectionId>('mes_demandes');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [agencyName, setAgencyName] = useState<string>('');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    getNotificationPermissionStatus(),
  );
  const [toastAlert, setToastAlert] = useState<{
    title: string;
    body: string;
    orderId: string;
  } | null>(null);

  const loadAbonneData = useCallback(async () => {
    if (!user) return;
    try {
      if (user.agencyId) {
        const ag = await getAgency(user.agencyId);
        if (ag?.name) setAgencyName(ag.name);
      }

      const [allOps, scopedOrders] = await Promise.all([
        db.operations.toArray(),
        fetchScopedClientOrders(user, true),
      ]);

      const mine = allOps
        .filter(
          (op) =>
            op.createdBy === user.uid ||
            op.clientUid === user.uid ||
            (user.phone && op.accountNumber === user.phone) ||
            (user.phoneNumber && op.accountNumber === user.phoneNumber),
        )
        .sort((a, b) => b.createdAt - a.createdAt);

      setOperations(mine);
      setOrders(scopedOrders);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    void loadAbonneData();
  }, [loadAbonneData]);

  useEffect(() => {
    if (!user) return;
    const stop = startClientOrderNotificationWatcher(user, (evt) => {
      setToastAlert({
        title: evt.title,
        body: evt.body,
        orderId: evt.order.id,
      });
      void loadAbonneData();
    });
    return () => stop();
  }, [user, loadAbonneData]);

  const openCommande = (section: CommandeSectionId = 'mes_demandes') => {
    setCommandeSection(section);
    setActiveView('commandes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSidebarNavigate = (item: string) => {
    if (item === 'profile') {
      navigate('/profil');
      return;
    }
    if (item === 'billetage') {
      setActiveView('billetage');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'commandes' || item === 'orders' || item === 'client-orders') {
      openCommande('mes_demandes');
    } else if (
      item === 'dashboard' ||
      item === 'overview' ||
      item === 'transactions' ||
      item === 'operations'
    ) {
      setActiveView('dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const activeOrdersCount = orders.filter(
    (o) => o.status !== 'traitee' && o.status !== 'cloturee' && o.status !== 'rejetee',
  ).length;

  return (
    <AppLayout
      title="Espace Abonné Privilégié — Ets AMANI"
      subtitle="Commandes prioritaires, réclamations et calculateur billetage"
      activeItem={activeView}
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
                Commandes
              </span>
              <span className="font-black text-base tabular-nums text-amber-700 dark:text-amber-400">
                {orders.length}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                En suivi
              </span>
              <span className="font-black text-base tabular-nums text-blue-600 dark:text-blue-400">
                {activeOrdersCount}
              </span>
            </div>
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

        {toastAlert && (
          <div
            role="status"
            className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 flex items-start justify-between gap-3 text-xs text-amber-900 dark:text-amber-100"
          >
            <button
              type="button"
              onClick={() => {
                setToastAlert(null);
                openCommande('mes_demandes');
              }}
              className="flex items-start gap-2.5 text-left min-w-0 flex-1"
            >
              <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold">{toastAlert.title}</p>
                <p className="opacity-90 mt-0.5 truncate">{toastAlert.body}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setToastAlert(null)}
              className="rounded-lg p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <WorkspaceNavigationHeader
          workspaceTitle="Espace Partenaire VIP"
          activeModuleTitle={
            activeView === 'billetage'
              ? 'Calculateur Billetage & Devises'
              : activeView === 'commandes'
                ? 'Module Commande & Réclamations'
                : 'Avantages, Commandes & Historique'
          }
          backLabel="Mon Compte Abonné"
          onBack={() => {
            setActiveView('dashboard');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          tabs={ABONNE_TABS.map((tab) => ({
            ...tab,
            badge:
              tab.id === 'commandes' && activeOrdersCount > 0
                ? activeOrdersCount
                : undefined,
          }))}
          activeTabId={activeView}
          onTabChange={(id) => {
            if (id === 'commandes') {
              openCommande('mes_demandes');
            } else {
              setActiveView(id as AbonneView);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        />

        {activeView === 'billetage' ? (
          <BilletageModule onClose={() => setActiveView('dashboard')} />
        ) : activeView === 'commandes' ? (
          <CommandeModule
            initialSection={commandeSection}
            onClose={() => setActiveView('dashboard')}
            onOrdersChanged={() => void loadAbonneData()}
          />
        ) : (
          <div className="space-y-4">
            {/* Actions rapides Commande VIP */}
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Espace Commande Partenaire VIP
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Transmettez vos demandes directement à votre agence de rattachement ou suivez vos dossiers
                  </p>
                </div>
                {notifPerm === 'default' && (
                  <button
                    type="button"
                    onClick={() => {
                      void requestNotificationPermission().then(setNotifPerm);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 self-start sm:self-auto"
                  >
                    <BellRing className="h-3.5 w-3.5 text-[#C58B39]" />
                    Activer les alertes de suivi
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => openCommande('nouvelle_commande')}
                  className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 hover:border-blue-400 dark:hover:border-blue-700 transition"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 mb-2">
                    <FilePlus2 className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Nouvelle commande
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Dépôt, retrait, transfert, change
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => openCommande('transaction_non_recue')}
                  className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 hover:border-amber-400 dark:hover:border-amber-700 transition"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 mb-2">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Transaction non reçue
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Vérification prioritaire
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => openCommande('reclamation_service')}
                  className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 hover:border-indigo-400 dark:hover:border-indigo-700 transition"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 mb-2">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Réclamation service
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Assistance & suivi qualité
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => openCommande('restitution_argent')}
                  className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 hover:border-rose-400 dark:hover:border-rose-700 transition"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 mb-2">
                    <RotateCcw className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Restitution d’argent
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Demande officielle de remboursement
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Mes Commandes & Réclamations
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Suivi de vos demandes en cours
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCommande('mes_demandes')}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Tout voir
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      Aucune commande ni réclamation enregistrée.
                    </p>
                    <button
                      type="button"
                      onClick={() => openCommande('nouvelle_commande')}
                      className="rounded-lg bg-[#0B192C] dark:bg-[#C58B39] px-3 py-1.5 text-xs font-bold text-white dark:text-[#0B192C]"
                    >
                      Soumettre une commande VIP
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {orders.slice(0, 5).map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => openCommande('mes_demandes')}
                        className="w-full py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded transition"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate">
                            {order.reference} · {CLIENT_ORDER_CATEGORY_LABELS[order.category]}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {order.agencyName}
                            {order.amount
                              ? ` · ${order.amount.toLocaleString('fr-FR')} ${order.currency}`
                              : ''}
                          </p>
                        </div>
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300 shrink-0">
                          {CLIENT_ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
                <div>
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
                      Traitement prioritaire de vos commandes au guichet de votre agence
                    </li>
                  </ul>
                </div>

                <div>
                  <div className="flex items-center gap-2.5 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                      <Receipt className="h-3.5 w-3.5" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Activité Récente Guichet
                    </h3>
                  </div>
                  {operations.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 text-center">
                      Aucun mouvement récent enregistré sur votre compte abonné.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {operations.slice(0, 4).map((op) => (
                        <div
                          key={op.operationNumber || op.createdAt}
                          className="py-2 flex items-center justify-between gap-2"
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
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
