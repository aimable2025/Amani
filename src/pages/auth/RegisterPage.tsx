import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import { getAgencies, type Agency } from '../../services/AgencyService';
import { compressImageToDataUrl } from '../../services/UserProfileService';
import type { PublicRegistrationRole } from '../../types/auth';

export default function RegisterPage() {
  const { registerPublicUser } = useAuth();
  const navigate = useNavigate();

  const [requestedRole, setRequestedRole] = useState<PublicRegistrationRole>('client');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [province, setProvince] = useState('Nord-Kivu');
  const [profession, setProfession] = useState('');
  const [agencyId, setAgencyId] = useState('agence-goma-centre');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    getAgencies()
      .then((list) => {
        if (!active) return;
        setAgencies(list);
        if (list.length > 0) {
          setAgencyId(list[0].id);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.82);
      setPhotoURL(dataUrl);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !password) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await registerPublicUser({
        email: email.trim(),
        password,
        phone: phone.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        requestedRole,
        province,
        profession: profession.trim() || undefined,
        agencyId: requestedRole === 'abonne' ? agencyId : undefined,
        photoURL: photoURL || undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la création de la demande d inscription.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-xl font-black text-slate-900 dark:text-white">Demande enregistrée</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Votre demande d'inscription en tant que <strong className="text-slate-700 dark:text-slate-200">{requestedRole === 'abonne' ? 'Abonné' : 'Client'}</strong> a été transmise aux services de supervision d'Ets AMANI.
          </p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Vous pourrez accéder à vos fonctionnalités dès validation par notre équipe d'agence.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-6 w-full rounded-lg bg-slate-900 dark:bg-white py-2.5 text-xs font-bold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition"
          >
            Aller à la page de connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-5 py-8 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg space-y-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à la connexion
            </Link>
            <img
              src="/logo.png"
              alt="Logo Ets AMANI"
              className="h-10 w-10 rounded-xl object-contain bg-slate-950 p-1.5 shadow-sm ring-1 ring-slate-800"
            />
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">Demande d'inscription</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ouvrez un compte Client ou Abonné auprès d'Ets AMANI.
            </p>
          </div>

          {/* Sélecteur de rôle demandé */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setRequestedRole('client')}
              className={`rounded-lg py-2 text-xs font-bold transition ${
                requestedRole === 'client'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Compte Client
            </button>
            <button
              type="button"
              onClick={() => setRequestedRole('abonne')}
              className={`rounded-lg py-2 text-xs font-bold transition ${
                requestedRole === 'abonne'
                  ? 'bg-white dark:bg-slate-900 text-purple-900 dark:text-purple-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Compte Abonné VIP
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar
                  name={`${firstName} ${lastName}`.trim() || 'Nouveau Profil'}
                  photoURL={photoURL}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Photo de profil (optionnelle)
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Visible par l'agence lors de la validation
                  </p>
                </div>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <Camera className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>{photoURL ? 'Modifier' : 'Choisir'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Prénom *
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jean"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-600 dark:focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Nom de famille *
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Kasongo"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-600 dark:focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Adresse Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jean.kasongo@gmail.com"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-600 dark:focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Numéro WhatsApp / Téléphone *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+243 970 000 000"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-600 dark:focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Province
                </label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-600 dark:focus:border-blue-500"
                >
                  <option value="Nord-Kivu">Nord-Kivu (Goma)</option>
                  <option value="Sud-Kivu">Sud-Kivu (Bukavu)</option>
                  <option value="Kinshasa">Kinshasa</option>
                  <option value="Haut-Katanga">Haut-Katanga (Lubumbashi)</option>
                  <option value="Ituri">Ituri (Bunia)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Profession / Activité
                </label>
                <input
                  type="text"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder="Commerçant, Agent..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-600 dark:focus:border-blue-500"
                />
              </div>
            </div>

            {requestedRole === 'abonne' && (
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Agence de rattachement *
                </label>
                <select
                  value={agencyId}
                  onChange={(e) => setAgencyId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-600 dark:focus:border-blue-500"
                >
                  {agencies.length > 0 ? (
                    agencies.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} {ag.city ? `(${ag.city})` : ''}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="agence-goma-centre">Agence Goma Centre (Nord-Kivu)</option>
                      <option value="agence-bukavu-ville">Agence Bukavu Ville (Sud-Kivu)</option>
                      <option value="agence-kinshasa-gombe">Agence Kinshasa Gombe</option>
                    </>
                  )}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Mot de passe *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 pl-3 pr-11 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-600 dark:focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    title={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Confirmer le mot de passe *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 pl-3 pr-11 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-600 dark:focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    title={
                      showConfirmPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    aria-label={
                      showConfirmPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-950 dark:bg-white py-3 text-sm font-bold text-white dark:text-slate-900 shadow-lg transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50"
            >
              {loading ? 'Soumission en cours...' : 'Envoyer ma demande d inscription'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
