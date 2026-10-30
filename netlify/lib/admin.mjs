import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { firebaseConfig } from '../../src/firebase-config.js';

// Firebase Admin for the server functions (the Google Drive backup). It acts as the project
// itself, past firestore.rules, so it only runs here, with the service account key kept in Netlify:
//   FIREBASE_CLIENT_EMAIL  the service account's client_email
//   FIREBASE_PRIVATE_KEY   its private_key (the whole -----BEGIN PRIVATE KEY----- ... text)
// (Firebase console → Project settings → Service accounts → Generate new private key.)

export const adminReady = () => Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) || Boolean(process.env.FIRESTORE_EMULATOR_HOST);

export function admin() {
  if (!getApps().length) {
    initializeApp({
      projectId: process.env.FIRESTORE_EMULATOR_HOST ? 'demo-fts' : firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      ...(process.env.FIREBASE_PRIVATE_KEY ? {
        credential: cert({
          projectId: firebaseConfig.projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      } : {}),
    });
  }
  return { db: getFirestore(), bucket: getStorage().bucket(), auth: getAuth() };
}

// The signed-in user (Firebase ID token) if they are active and the Records Officer or an admin.
export async function archiveKeeper(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { db, auth } = admin();
    const { uid } = await auth.verifyIdToken(token);
    const p = (await db.doc(`users/${uid}`).get()).data();
    if (!p?.active) return null;
    const ok = ['admin', 'superadmin'].includes(p.role) || (p.positions || []).includes('Records Officer');
    return ok ? { uid, name: p.displayName || p.email || '' } : null;
  } catch {
    return null;
  }
}
