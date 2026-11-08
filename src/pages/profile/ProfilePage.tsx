import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardRoute } from '../../utils/roleRedirect';
import { compressImageToDataUrl } from '../../services/UserProfileService';
import { getAgencies, type Agency } from '../../services/AgencyService';
import { REFERENCE_SYSTEM_ADMIN_EMAIL } from '../../services/AdminAuthVerificationService';
import UserAvatar from '../../components/common/UserAvatar';
import ThemeToggle from '../../components/common/ThemeToggle';

const ROLE_LABELS: Record<string, string> = {
  administrateur_systeme: 'Administrateur Système',
  directeur_general: 'Directeur Général',
  administrateur_agence: "Administrateur d'Agence",
  agent: 'Agent Opérationnel',
  client: 'Client Certifié',
  abonne: 'Abonné Privilégié',
};

const FUNCTION_LABELS: Record<string, string> = {
  guichetier: 'Agent Guichet & Caisse',
  comptable: 'Comptable & Trésorier',
  agent_operateur_mobile: 'Opérateur Flotte & Mobile Money',
  agent_change: 'Agent de Change USD/CDF',
  agent_terrain: 'Agent Terrain & Collecte',
  service_paie: 'Responsable Salaires & Paie',
  administration_agence: "Administrateur d'Agence",
  direction_generale: 'Direction Générale',
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut, updateBasicProfile, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(user?.photoURL || null);
  const [hasPhotoChanged, setHasPhotoChanged] = useState(false);

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSystemAdmin =
    user?.role === 'administrateur_systeme' ||
    user?.email?.toLowerCase() === REFERENCE_SYSTEM_ADMIN_EMAIL.toLowerCase();

  // Synchronisation des états si le profil utilisateur change
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      if (!hasPhotoChanged) {
        setPreviewPhoto(user.photoURL || null);
      }
    }
  }, [user, hasPhotoChanged]);

  // Chargement des agences pour afficher le libellé clair
  useEffect(() => {
    getAgencies()
      .then(setAgencies)
      .catch(() => {});
  }, []);

  const agencyName = React.useMemo(() => {
    if (!user?.agencyId) {
      return 'Siège Social / Direction Générale';
    }
    const found = agencies.find((a) => a.id === user.agencyId);
    return found ? `${found.name} (${found.city || 'RDC'})` : `Agence (${user.agencyId})`;
  }, [user?.agencyId, agencies]);

  const hasFormChanges = React.useMemo(() => {
    if (!user) return false;
    const nameDiffers = displayName.trim() !== (user.displayName || '');
    const emailDiffers = !isSystemAdmin && email.trim().toLowerCase() !== (user.email || '').toLowerCase();
    const phoneDiffers = phone.trim() !== (user.phone || '');
    return nameDiffers || emailDiffers || phoneDiffers || hasPhotoChanged;
  }, [displayName, email, phone, hasPhotoChanged, user, isSystemAdmin]);

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({
        type: 'error',
        message: 'Veuillez sélectionner un fichier image valide (JPEG, PNG, WebP).',
      });
      return;
    }

    setIsCompressingPhoto(true);
    setFeedback(null);
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.85);
      setPreviewPhoto(dataUrl);
      setHasPhotoChanged(true);
    } catch {
      setFeedback({
        type: 'error',
        message: 'Impossible de traiter cette image. Veuillez en choisir une autre.',
      });
    } finally {
      setIsCompressingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = () => {
    setPreviewPhoto(null);
    setHasPhotoChanged(true);
  };

  const handleResetForm = () => {
    if (!user) return;
    setDisplayName(user.displayName || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setPreviewPhoto(user.photoURL || null);
    setHasPhotoChanged(false);
    setFeedback(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!displayName.trim() || displayName.trim().length < 2) {
      setFeedback({
        type: 'error',
        message: 'Le nom d utilisateur doit comporter au moins 2 caractères.',
      });
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFeedback({
        type: 'error',
        message: 'Veuillez entrer une adresse e-mail valide.',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const result = await updateBasicProfile({
        displayName: displayName.trim(),
        email: isSystemAdmin ? user.email : email.trim(),
        phone: phone.trim(),
        photoURL: hasPhotoChanged ? previewPhoto : undefined,
      });

      if (result.success) {
        setHasPhotoChanged(false);
        setFeedback({
          type: 'success',
          message: result.message,
        });
        await refreshUser();
      } else {
        setFeedback({
          type: 'error',
          message: result.message,
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Une erreur inattendue est survenue lors de l enregistrement.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToDashboard = () => {
    const route = getDashboardRoute(user?.role);
    navigate(route);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-600" />
          <p className="text-sm font-semibold">Chargement de votre profil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Barre de navigation supérieure de la page profil */}
      <header className="sticky top-0 z-30 border-b border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs"
            title="Revenir à mon tableau de bord"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Tableau de bord</span>
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-950 dark:text-white tracking-tight">
              Mon Profil Utilisateur
            </h1>
            <p className="hidden md:block text-[11px] text-slate-500 dark:text-slate-400">
              Consultation et gestion des paramètres de compte Ets AMANI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition"
            title="Déconnexion sécurisée"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Contenu principal de la page profil */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Toast de confirmation / erreur */}
        {feedback && (
          <div
            className={`flex items-start gap-3 rounded-2xl p-4 border text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-bold">
                {feedback.type === 'success' ? 'Enregistrement réussi' : 'Attention requise'}
              </p>
              <p className="mt-0.5">{feedback.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              &times;
            </button>
          </div>
        )}

        {/* CARTE HÉROS D'IDENTITÉ */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
          {/* Lueur d'ambiance */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Avatar interactif */}
            <div className="relative shrink-0">
              <UserAvatar
                user={{ ...user, photoURL: previewPhoto || undefined }}
                size="xl"
                statusDot="online"
                className="h-24 w-24 sm:h-28 sm:w-28 text-2xl ring-4 ring-slate-100 dark:ring-slate-800 shadow-md"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressingPhoto}
                title="Changer ma photo de profil"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md ring-2 ring-white dark:ring-slate-900 transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isCompressingPhoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            {/* Informations textuelles principales */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {ROLE_LABELS[user.role] || user.role}
                </span>

                {isSystemAdmin && (
                  <span className="flex items-center gap-1 rounded-lg bg-blue-100 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-bold text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Compte Racine Ets AMANI</span>
                  </span>
                )}

                <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Statut : {user.status === 'active' ? 'Actif & Certifié' : user.status}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight truncate">
                {user.displayName || 'Utilisateur'}
              </h2>

              <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {user.email || 'Aucun e-mail renseigné'}
                </span>
                {user.phone && (
                  <>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {user.phone}
                    </span>
                  </>
                )}
                <span>&bull;</span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {agencyName}
                </span>
              </p>
            </div>

            {/* Boutons d'action pour la photo */}
            <div className="flex flex-wrap md:flex-col gap-2 shrink-0 self-stretch md:self-center justify-end">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressingPhoto}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-4 py-2.5 text-xs font-bold shadow-xs hover:bg-slate-800 dark:hover:bg-slate-100 transition disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>{previewPhoto ? 'Remplacer la photo' : 'Ajouter une photo'}</span>
              </button>

              {previewPhoto && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Retirer la photo</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* GRILLE À DEUX COLONNES : FORMULAIRE D'ÉDITION & INFORMATIONS OFFICIELLES */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLONNE GAUCHE (2 cols) : FORMULAIRE DE MODIFICATION */}
          <section className="lg:col-span-2 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Modifier mes informations de base</span>
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Mettez à jour votre nom d'affichage officiel, vos coordonnées et votre photo de profil.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Champ : Nom complet */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nom complet / Nom d'affichage officiel *
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Jean-Paul AMANI"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-3 py-2.5 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Visible sur tous les reçus de caisse, rapports opérationnels et messages internes.
                </p>
              </div>

              {/* Champ : Adresse e-mail */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Adresse e-mail de connexion
                  </label>
                  {isSystemAdmin && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                      <Lock className="h-3 w-3" />
                      Protégée
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    readOnly={isSystemAdmin}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@ets-amani.com"
                    className={`w-full rounded-xl border pl-10 pr-3 py-2.5 text-xs font-semibold focus:outline-none transition ${
                      isSystemAdmin
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500'
                    }`}
                  />
                </div>
                {isSystemAdmin ? (
                  <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                    L'adresse e-mail de l'administrateur système racine ({REFERENCE_SYSTEM_ADMIN_EMAIL}) est certifiée et protégée par la politique de sécurité.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Utilisée pour la réception des alertes et la réinitialisation de votre accès.
                  </p>
                )}
              </div>

              {/* Champ : Téléphone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Numéro de téléphone
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+243 999 000 000"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-3 py-2.5 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Numéro opérationnel pour les notifications d'urgence et la validation.
                </p>
              </div>

              {/* Barre de boutons Enregistrer / Annuler */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleResetForm}
                  disabled={!hasFormChanges || isSaving}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Annuler les modifications</span>
                </button>

                <button
                  type="submit"
                  disabled={!hasFormChanges || isSaving}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Enregistrement en cours...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Enregistrer les modifications</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* COLONNE DROITE (1 col) : RÉCAPITULATIF INSTITUTIONNEL & RBAC */}
          <section className="space-y-6">
            {/* Boîte des privilèges institutionnels */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>Statut Institutionnel & Rôle</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Rôle Attribué
                  </span>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {ROLE_LABELS[user.role] || user.role}
                  </p>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Fonction Opérationnelle
                  </span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {(user.function && FUNCTION_LABELS[user.function]) || user.function || 'Standard'}
                  </p>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Agence de Rattachement
                  </span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {agencyName}
                  </p>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Niveau d'Autorisation
                  </span>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {isSystemAdmin
                        ? 'Niveau 0 (Administration Système Intégrale)'
                        : user.role === 'directeur_general'
                        ? 'Niveau 1 (Direction Générale Réseau)'
                        : user.role === 'administrateur_agence'
                        ? 'Niveau 2 (Administration Agence)'
                        : 'Niveau Opérationnel Dédié'}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Boîte Intégrité & Synchronisation */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Intégrité des données locales</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                Vos modifications sont appliquées instantanément dans votre espace de travail et répliquées de manière sécurisée vers le registre central.
              </p>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Actualisé
                </span>
                <span>Version Ets AMANI 2.0</span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
