import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyBuRfa47FdTj7kd4O6uNE-PmWiFEZfkRo4",
  authDomain: "tigon-iot.firebaseapp.com",
  projectId: "tigon-iot",
  storageBucket: "tigon-iot.firebasestorage.app",
  messagingSenderId: "470095494000",
  appId: "1:470095494000:web:2a26f0f8a2b7336608edb5",
  measurementId: "G-1VN3C3ZDBT"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = createDb();
export const storage = getStorage(app);
export const functions = getFunctions(app);

/**
 * Firestore with an offline cache (IndexedDB, shared by all open tabs): reads come from the cache when
 * offline and writes are queued and sent when the connection comes back. Falls back to a memory cache
 * where IndexedDB isn't available (some private-browsing modes).
 */
function createDb(): Firestore {
  if (typeof indexedDB !== 'undefined') {
    try {
      return initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (e) {
      console.warn('Offline cache unavailable, using memory cache', e);
    }
  }
  return initializeFirestore(app, { localCache: memoryLocalCache() });
}

export default app;
