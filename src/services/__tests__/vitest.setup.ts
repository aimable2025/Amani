import 'fake-indexeddb/auto';
import { vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    },
    configurable: true,
  });
}

vi.mock('../../lib/firebase', () => ({
  REQUIRED_FIREBASE_PROJECT_ID: 'ets-amani',
  REQUIRED_PROJECT_NUMBER: '697171148070',
  REQUIRED_STORAGE_BUCKET: 'ets-amani.firebasestorage.app',
  firebaseConfig: { projectId: 'ets-amani' },
  isFirebaseConfigured: false,
  auth: { currentUser: null },
  firestore: {},
  firestoreDb: {},
  db: {},
  storage: {},
  default: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col: string, id: string) => ({ path: `${col}/${id}` })),
  collection: vi.fn((_db, col: string) => ({ path: col })),
  query: vi.fn((ref) => ref),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  addDoc: vi.fn(async () => ({ id: 'mock-doc' })),
  setDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  runTransaction: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => Date.now()),
}));
