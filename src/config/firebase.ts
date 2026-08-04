import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAuth, getAuth, browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator, getReactNativePersistence, Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  projectId: "finance-95e5d",
  appId: "1:177103822709:web:69493ece7ed1620c233d3c",
  storageBucket: "finance-95e5d.firebasestorage.app",
  apiKey: "AIzaSyC4MegR_fzqBWgHrOAmq5RsCdLZ6qEMaPg",
  authDomain: "finance-95e5d.firebaseapp.com",
  messagingSenderId: "177103822709",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore
export const db = getFirestore(app);

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
