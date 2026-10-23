// Loads demo data into the LOCAL emulators only (never a real project).
// Safe to run more than once: it does nothing if the demo admin already exists.
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, updateProfile,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { STARTER_TYPES } from '../src/lib/defaults.js';

export const DEMO = {
  admin: { email: 'admin@fts.local', password: 'admin123', displayName: 'Maria Santos', office: 'Municipal Accounting Office' },
  user: { email: 'user@fts.local', password: 'user123', displayName: 'Juan Dela Cruz', office: 'Municipal Engineering Office' },
};

const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-fts' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function main() {
  try {
    await signInWithEmailAndPassword(auth, DEMO.admin.email, DEMO.admin.password);
    console.log('[FTS] Demo data already loaded.');
    return;
  } catch {
    // not seeded yet
  }

  // 1. Superadmin (first account claims the bootstrap document, as in the app).
  const a = await createUserWithEmailAndPassword(auth, DEMO.admin.email, DEMO.admin.password);
  await updateProfile(a.user, { displayName: DEMO.admin.displayName });
  const boot = writeBatch(db);
  boot.set(doc(db, 'users', a.user.uid), {
    email: DEMO.admin.email, displayName: DEMO.admin.displayName, office: DEMO.admin.office,
    role: 'superadmin', active: true, createdAt: serverTimestamp(),
  });
  boot.set(doc(db, 'meta', 'bootstrap'), { superadmin: a.user.uid, at: serverTimestamp() });
  await boot.commit();

  // 2. Settings and starter formats.
  await setDoc(doc(db, 'meta', 'settings'), {
    lguName: 'Municipal Government of Candoni', lguAddress: 'Candoni, Negros Occidental', province: 'Negros Occidental',
  });
  const types = writeBatch(db);
  for (const t of STARTER_TYPES) {
    types.set(doc(collection(db, 'documentTypes')), {
      ...t, version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: a.user.uid,
    });
  }
  await types.commit();
  await signOut(auth);

  // 3. An end user (registers, then the superadmin approves them).
  const u = await createUserWithEmailAndPassword(auth, DEMO.user.email, DEMO.user.password);
  await updateProfile(u.user, { displayName: DEMO.user.displayName });
  await setDoc(doc(db, 'users', u.user.uid), {
    email: DEMO.user.email, displayName: DEMO.user.displayName, office: DEMO.user.office,
    role: 'user', active: false, createdAt: serverTimestamp(),
  });
  await signOut(auth);
  await signInWithEmailAndPassword(auth, DEMO.admin.email, DEMO.admin.password);
  await updateDoc(doc(db, 'users', u.user.uid), { active: true });

  console.log(`
[FTS] Demo data loaded:
      Superadmin  ${DEMO.admin.email} / ${DEMO.admin.password}
      End user    ${DEMO.user.email} / ${DEMO.user.password}
      Formats     ${STARTER_TYPES.map((t) => t.code).join(', ')}
`);
}

main()
  .catch((e) => console.error('[FTS] Could not load demo data:', e.message))
  .finally(() => process.exit(0));
