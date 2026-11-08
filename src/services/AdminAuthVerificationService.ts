import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { recordAuditLog } from './AuditService';
import type { AppUser, UserRole } from '../types/auth';

export const REFERENCE_SYSTEM_ADMIN_EMAIL = 'etsamaniadmin@gmail.com';
export const OFFICIAL_SYSTEM_ADMIN_UID = 'ENoolWWLMnSl0dCqYoEPKQFgcjM2';
export const SYSTEM_ADMIN_ROLE: UserRole = 'administrateur_systeme';

export const SYSTEM_ADMIN_CANONICAL_PERMISSIONS = [
  '*',
  'system.all',
  'users.read',
  'users.manage',
  'registrations.validate',
  'agencies.manage',
  'transactions.manage',
  'billetage.access',
  'reports.manage',
  'commissions.manage',
  'audit.read',
  'internal_numbers.manage',
  'notifications.manage',
  'communication.manage',
  'operations.manage',
  'salaries.manage',
  'dg.governance',
  'security.policy',
];

export interface SystemAdminVerificationResult {
  isVerifiedAdmin: boolean;
  realUid: string | null;
  email: string | null;
  hasCustomClaimAdmin: boolean;
  customClaims: Record<string, unknown>;
  userProfile: AppUser | null;
  statusMessage: string;
  isFirstTimeInitialized?: boolean;
}

/**
 * Vérifie si une adresse e-mail correspond au compte de référence officiel.
 */
export function isReferenceSystemAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === REFERENCE_SYSTEM_ADMIN_EMAIL;
}

/**
 * Vérifie si un utilisateur est protégé contre toute suppression ou rétrogradation.
 */
export function isProtectedSystemAdmin(user: {
  role?: string;
  email?: string | null;
  uid?: string;
}): boolean {
  if (user.uid === OFFICIAL_SYSTEM_ADMIN_UID || isReferenceSystemAdminEmail(user.email)) return true;
  return user.role === SYSTEM_ADMIN_ROLE;
}

/**
 * Protège le compte administrateur système contre les modifications ou suspensions non autorisées.
 */
export function validateSystemAdminModification(
  actor: { role?: string; email?: string | null; uid?: string },
  target: { role?: string; email?: string | null; uid?: string },
  actionType: 'status' | 'profile' | 'delete'
): { allowed: boolean; reason?: string } {
  // Protection absolue du compte officiel de référence
  if (target.uid === OFFICIAL_SYSTEM_ADMIN_UID || isReferenceSystemAdminEmail(target.email)) {
    if (actionType === 'delete') {
      return {
        allowed: false,
        reason: 'Sécurité système : Le compte de référence etsamaniadmin@gmail.com (UID: ENoolWWLMnSl0dCqYoEPKQFgcjM2) ne peut pas être supprimé.',
      };
    }
    if (actionType === 'status' && actor.uid !== target.uid) {
      return {
        allowed: false,
        reason: 'Sécurité système : Le compte de référence etsamaniadmin@gmail.com ne peut être suspendu par aucun autre compte.',
      };
    }
  }

  // Protection contre la rétrogradation du rôle administrateur_systeme par un tiers
  if (target.role === SYSTEM_ADMIN_ROLE && actor.role !== SYSTEM_ADMIN_ROLE) {
    return {
      allowed: false,
      reason: "Seul un Administrateur Système Niveau 0 peut administrer un compte d'administrateur système.",
    };
  }

  return { allowed: true };
}

/**
 * Procédure d'authentification et de contrôle en 7 étapes :
 * 1. Vérification de l'existence du compte dans Firebase Authentication
 * 2. Récupération de son véritable UID Firebase
 * 3. Vérification de son document dans la collection "users"
 * 4. Correction contrôlée sans écraser ses autres données
 * 5. Attribution du rôle "administrateur_systeme" uniquement après vérification
 * 6. Lecture des Custom Claims (tokenResult.claims)
 * 7. Protection de l'attribution et de l'accès global
 */
export async function verifyAndEnsureSystemAdmin(
  fbUser: User
): Promise<SystemAdminVerificationResult> {
  if (!fbUser || !fbUser.uid) {
    return {
      isVerifiedAdmin: false,
      realUid: null,
      email: null,
      hasCustomClaimAdmin: false,
      customClaims: {},
      userProfile: null,
      statusMessage: 'Échec de vérification : utilisateur Firebase Authentication non fourni.',
    };
  }

  const realUid = fbUser.uid;
  const normalizedEmail = fbUser.email?.trim().toLowerCase() || '';

  // Étape 1 & 6 : Vérifier l'identité Firebase Auth et lire les Custom Claims
  let customClaims: Record<string, unknown> = {};
  let hasCustomClaimAdmin = false;

  try {
    const idTokenResult = await fbUser.getIdTokenResult(true);
    customClaims = idTokenResult.claims || {};
    hasCustomClaimAdmin =
      customClaims.role === SYSTEM_ADMIN_ROLE ||
      customClaims.admin === true ||
      customClaims.system_admin === true;
  } catch (claimErr) {
    console.warn('[Ets AMANI] Impossible de rafraîchir les Custom Claims (mode hors-ligne ou réseau restreint):', claimErr);
  }

  const isOfficialReference = realUid === OFFICIAL_SYSTEM_ADMIN_UID || normalizedEmail === REFERENCE_SYSTEM_ADMIN_EMAIL;

  // L'utilisateur doit correspondre soit à l'adresse de référence vérifiée, soit à l'UID officiel, soit à un Custom Claim serveur
  if (!isOfficialReference && !hasCustomClaimAdmin) {
    return {
      isVerifiedAdmin: false,
      realUid,
      email: normalizedEmail,
      hasCustomClaimAdmin: false,
      customClaims,
      userProfile: null,
      statusMessage: `Le compte '${normalizedEmail}' (UID: ${realUid}) n'est pas autorisé pour le rôle administrateur_systeme.`,
    };
  }

  // Étape 3 : Vérifier si le document utilisateur existe dans la collection "users"
  let existingProfile: AppUser | null = null;
  let isFirstTimeInitialized = false;

  if (isFirebaseConfigured) {
    try {
      const userRef = doc(db, 'users', realUid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        // Étape 4 & 5 : Le document n'existe pas encore -> Initialisation contrôlée
        const initialDocData = {
          uid: realUid,
          displayName: fbUser.displayName || 'Administrateur Système',
          email: REFERENCE_SYSTEM_ADMIN_EMAIL,
          phone: fbUser.phoneNumber || null,
          photoURL: fbUser.photoURL || null,
          category: 'direction',
          role: SYSTEM_ADMIN_ROLE,
          agencyId: null, // Contrôle global : aucune agence ne limite l'administrateur système
          status: 'active',
          isApproved: true,
          registrationStatus: 'approved',
          permissions: SYSTEM_ADMIN_CANONICAL_PERMISSIONS,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(userRef, initialDocData);
        isFirstTimeInitialized = true;

        await recordAuditLog({
          action: 'INITIALISATION_ADMINISTRATEUR_SYSTEME',
          category: 'rbac',
          severity: 'critical',
          details: `Reconnaissance et initialisation du compte de référence '${REFERENCE_SYSTEM_ADMIN_EMAIL}' (UID: ${realUid}) avec rôle '${SYSTEM_ADMIN_ROLE}'.`,
          actorName: 'Système Firebase Ets AMANI',
          actorRole: 'administrateur_systeme',
          actorUid: realUid,
        });

        existingProfile = {
          uid: realUid,
          displayName: fbUser.displayName || 'Administrateur Système',
          email: REFERENCE_SYSTEM_ADMIN_EMAIL,
          phone: fbUser.phoneNumber || undefined,
          photoURL: fbUser.photoURL || undefined,
          category: 'direction',
          role: SYSTEM_ADMIN_ROLE,
          agencyId: null,
          status: 'active',
          isApproved: true,
          registrationStatus: 'approved',
          permissions: SYSTEM_ADMIN_CANONICAL_PERMISSIONS,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      } else {
        // Le document existe -> Vérifier s'il est incomplet et effectuer une correction contrôlée
        const data = snap.data();
        const needsRepair =
          data.role !== SYSTEM_ADMIN_ROLE ||
          data.status !== 'active' ||
          data.isApproved !== true ||
          data.agencyId !== null ||
          !Array.isArray(data.permissions) ||
          !data.permissions.includes('*');

        if (needsRepair) {
          await updateDoc(userRef, {
            role: SYSTEM_ADMIN_ROLE,
            category: 'direction',
            status: 'active',
            isApproved: true,
            registrationStatus: 'approved',
            agencyId: null, // Suppression de toute restriction d'agence
            permissions: SYSTEM_ADMIN_CANONICAL_PERMISSIONS,
            updatedAt: serverTimestamp(),
          });

          await recordAuditLog({
            action: 'CONFORMITE_ADMINISTRATEUR_SYSTEME',
            category: 'rbac',
            severity: 'warning',
            details: `Mise en conformité contrôlée du document '${realUid}' pour garantir le contrôle administratif complet de la plateforme.`,
            actorName: 'Sécurité Ets AMANI',
            actorRole: 'administrateur_systeme',
            actorUid: realUid,
          });
        }

        existingProfile = {
          uid: realUid,
          displayName: data.displayName || fbUser.displayName || 'Administrateur Système',
          email: data.email || REFERENCE_SYSTEM_ADMIN_EMAIL,
          phone: data.phone || fbUser.phoneNumber || undefined,
          photoURL: data.photoURL || fbUser.photoURL || undefined,
          category: 'direction',
          role: SYSTEM_ADMIN_ROLE,
          agencyId: null,
          status: 'active',
          isApproved: true,
          registrationStatus: 'approved',
          permissions: SYSTEM_ADMIN_CANONICAL_PERMISSIONS,
          createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
          updatedAt: Date.now(),
        };
      }
    } catch (dbErr) {
      console.warn('[Ets AMANI] Erreur lors du contrôle Firestore du profil admin :', dbErr);
    }
  }

  // Si Firestore n'était pas joignable mais que Firebase Auth a vérifié le mot de passe réel
  if (!existingProfile) {
    existingProfile = {
      uid: realUid,
      displayName: fbUser.displayName || 'Administrateur Système',
      email: REFERENCE_SYSTEM_ADMIN_EMAIL,
      phone: fbUser.phoneNumber || undefined,
      photoURL: fbUser.photoURL || undefined,
      category: 'direction',
      role: SYSTEM_ADMIN_ROLE,
      agencyId: null,
      status: 'active',
      isApproved: true,
      registrationStatus: 'approved',
      permissions: SYSTEM_ADMIN_CANONICAL_PERMISSIONS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return {
    isVerifiedAdmin: true,
    realUid,
    email: normalizedEmail,
    hasCustomClaimAdmin,
    customClaims,
    userProfile: existingProfile,
    isFirstTimeInitialized,
    statusMessage: isFirstTimeInitialized
      ? 'Compte Administrateur Système reconnu et document initialisé avec succès.'
      : 'Compte Administrateur Système authentifié et privilèges vérifiés.',
  };
}
