import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { firebaseConfig as fileConfig } from './firebase-config.js';

// The config comes from src/firebase-config.js. VITE_FIREBASE_* environment variables,
// when set (e.g. by `npm run local` for the emulators), take precedence.
const env = import.meta.env;
const firebaseConfig = env.VITE_FIREBASE_API_KEY
  ? {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
  : fileConfig;

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
  && !String(firebaseConfig.apiKey).startsWith('PASTE_');

const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

// Local development against the Firebase emulators (`npm run local` sets VITE_USE_EMULATOR=true).
if (app && env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
