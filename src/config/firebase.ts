import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  terminate,
  clearIndexedDbPersistence,
  Firestore,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAuth, getAuth, browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator, getReactNativePersistence, Auth, signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Cloud Firestore con cache persistente sul web (IndexedDB): all'apertura mostra subito gli ultimi dati,
// anche offline, poi li aggiorna. Si svuota all'uscita dall'account (signOutAndClearData).
const createFirestore = (): Firestore => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      return initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (e) {
      // IndexedDB non disponibile (es. navigazione privata): resta la cache in memoria
      console.warn('Cache persistente di Firestore non disponibile:', e);
    }
  }
  return getFirestore(app);
};
export const db = createFirestore();

// Initialize Cloud Functions
export const functions = getFunctions(app, 'us-central1');

let authInstance: Auth;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  authInstance = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver
  });
} else if (Platform.OS !== 'web') {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} else {
  // Fallback for non-browser web environments.
  authInstance = getAuth(app);
}

export const auth = authInstance;

// Collega l'app agli emulatori locali durante lo sviluppo (se non disabilitato esplicitamente)
if (__DEV__ && process.env.EXPO_PUBLIC_DISABLE_EMULATORS !== 'true') {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  } catch (e) {
    console.warn("Could not connect to Firebase Emulators:", e);
  }
}

/**
 * Esce dall'account e cancella i dati del portafoglio salvati sul dispositivo (cache di Firestore),
 * così su un dispositivo condiviso non resta nulla. Sul web ricarica l'app per ripartire pulita.
 */
export const signOutAndClearData = async (): Promise<void> => {
  await signOut(auth);
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.warn('Pulizia della cache locale non riuscita:', e);
  }
  window.location.replace('/login');
};
