// Loads demo data into the LOCAL emulators only (never a real project).
// Safe to run more than once: it does nothing if the demo admin already exists.
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, updateProfile,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { STARTER_TYPES } from '../src/lib/defaults.js';
import { SUPERADMIN_EMAILS } from '../src/lib/owner.js';

const CHECKLISTS = JSON.parse(readFileSync(new URL('../src/data/checklists.json', import.meta.url)));

export const DEMO = {
  // The superadmin is the owner's email (src/lib/owner.js, firestore.rules). Local emulator only.
  admin: { email: SUPERADMIN_EMAILS[0], password: 'admin123', displayName: 'Maria Santos', office: 'Municipal Accounting Office' },
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

  // 1. Superadmin: the owner's email, marked verified (as after Google sign-in or the email link).
  const a = await createUserWithEmailAndPassword(auth, DEMO.admin.email, DEMO.admin.password);
  await updateProfile(a.user, { displayName: DEMO.admin.displayName });
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-fts/accounts:update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: a.user.uid, emailVerified: true }),
  });
  await a.user.reload();
  await a.user.getIdToken(true);
  await setDoc(doc(db, 'users', a.user.uid), {
    email: DEMO.admin.email, displayName: DEMO.admin.displayName, office: DEMO.admin.office,
    role: 'superadmin', active: true, createdAt: serverTimestamp(),
  });

  // 2. Settings and starter formats.
  // Signatories as printed on the Appendix Forms of the Municipal Government of Candoni (change in Settings).
  await setDoc(doc(db, 'meta', 'settings'), {
    lguName: 'Municipal Government of Candoni',
    lguAddress: 'Municipal Building, Rizal St., Candoni, Negros Occidental, 6110',
    province: 'Negros Occidental',
    signatories: {
      mayor: 'CICERO D. BORROMEO', mayorPosition: 'Municipal Mayor',
      accountant: 'NEIL P. PRIOLO, CPA', accountantPosition: 'Municipal Accountant',
      budget: 'RAQUEL C. MATA', budgetPosition: 'Municipal Budget Officer',
      treasurer: 'MA. DYMPHNA T. SARMOY', treasurerPosition: 'Acting - Municipal Treasurer',
      sbSecretary: 'BENJIE M. OROT, LPT', sbSecretaryPosition: 'Secretary to the Sanggunian',
    },
  });
  const types = writeBatch(db);
  for (const t of STARTER_TYPES) {
    types.set(doc(collection(db, 'documentTypes')), {
      ...t, version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: a.user.uid,
    });
  }
  await types.commit();
  const lists = writeBatch(db);
  for (const c of CHECKLISTS) lists.set(doc(db, 'checklists', c.code), { ...c, updatedAt: serverTimestamp(), updatedBy: a.user.uid });
  await lists.commit();
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
      Checklists  ${CHECKLISTS.length} (disbursement and liquidation)
`);
}

main()
  .catch((e) => console.error('[FTS] Could not load demo data:', e.message))
  .finally(() => process.exit(0));
