import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Projet Firebase officiel Ets AMANI
export const REQUIRED_FIREBASE_PROJECT_ID = 'ets-amani';
export const REQUIRED_PROJECT_NUMBER = '697171148070';
export const REQUIRED_STORAGE_BUCKET = 'ets-amani.firebasestorage.app';

export const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyCte0umcFfJNPBdzlT0MbXwDFaEruRv9lI',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'ets-amani.firebaseapp.com',
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || REQUIRED_FIREBASE_PROJECT_ID,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || REQUIRED_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || REQUIRED_PROJECT_NUMBER,
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:697171148070:web:bd1150821e623991ad55e7',
};

// Vérification stricte du projet officiel
if (firebaseConfig.projectId !== REQUIRED_FIREBASE_PROJECT_ID) {
  throw new Error(
    `[Ets AMANI] Configuration Firebase invalide : projet "${firebaseConfig.projectId}" au lieu de "${REQUIRED_FIREBASE_PROJECT_ID}".`
  );
}

// Vérification des paramètres indispensables
const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
];

export const isFirebaseConfigured = requiredConfig.every(
  (value) => typeof value === 'string' && value.trim().length > 0
);

if (!isFirebaseConfigured) {
  throw new Error('[Ets AMANI] La configuration Firebase est incomplète.');
}

// Initialisation unique de Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Authentification
export const auth = getAuth(app);

// Firestore : initialisation unique avec persistance locale
const firestoreInstance = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('already')
    ) {
      return getFirestore(app);
    }
    throw error;
  }
})();

export const firestore = firestoreInstance;
export const firestoreDb = firestore;
export const db = firestore;

// Cloud Storage
export const storage = getStorage(app);

// Application Firebase
export default app;
