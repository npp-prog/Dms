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
import { DEFAULT_SETTINGS, STARTER_TYPES } from '../src/lib/defaults.js';
import { SUPERADMIN_EMAILS } from '../src/lib/owner.js';

const CHECKLISTS = JSON.parse(readFileSync(new URL('../src/data/checklists.json', import.meta.url)));

export const DEMO = {
  // The superadmin is the owner's email (src/lib/owner.js, firestore.rules). Local emulator only.
  admin: { email: SUPERADMIN_EMAILS[0], password: 'admin123', displayName: 'Maria Santos', office: 'Municipal Accounting Office' },
  user: { email: 'user@fts.local', password: 'user123', displayName: 'Juan Dela Cruz', office: 'Municipal Engineering Office' },
  // Same office as Juan (sees his documents) and another office (does not).
  // The office head: sees every document of the Engineering Office (Juan sees only his own).
  colleague: { email: 'ana@fts.local', password: 'user123', displayName: 'Ana Reyes', office: 'Municipal Engineering Office', head: true },
  other: { email: 'leo@fts.local', password: 'user123', displayName: 'Leo Santos', office: 'Municipal Health Office' },
  // Offices on the route of a DV (workflow).
  acctg: { email: 'acctg@fts.local', password: 'user123', displayName: 'Rosa Accounting', office: 'Municipal Accounting Office' },
  budget: { email: 'budget@fts.local', password: 'user123', displayName: 'Ben Budget', office: 'Municipal Budget Office' },
  treasury: { email: 'treasury@fts.local', password: 'user123', displayName: 'Tess Treasury', office: "Municipal Treasurer's Office" },
  mayor: { email: 'mayor@fts.local', password: 'user123', displayName: 'Mario Mayor', office: 'Office of the Municipal Mayor' },
};

const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-fts' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function main() {
  try {
    await signInWithEmailAndPassword(auth, DEMO.admin.email, DEMO.admin.password);
    console.log('[DMS] Demo data already loaded.');
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
    email: DEMO.admin.email, displayName: DEMO.admin.displayName, office: '',
    role: 'superadmin', active: true, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'users', a.user.uid), { office: DEMO.admin.office });

  // 2. Settings and starter formats.
  await setDoc(doc(db, 'meta', 'settings'), DEFAULT_SETTINGS);
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

  // 3. End users: each registers (asking for an office), then the superadmin approves them
  //    and assigns the office.
  const approved = [];
  for (const person of [DEMO.user, DEMO.colleague, DEMO.other, DEMO.acctg, DEMO.budget, DEMO.treasury, DEMO.mayor]) {
    const u = await createUserWithEmailAndPassword(auth, person.email, person.password);
    await updateProfile(u.user, { displayName: person.displayName });
    await setDoc(doc(db, 'users', u.user.uid), {
      email: person.email, displayName: person.displayName, office: '', requestedOffice: person.office,
      role: 'user', active: false, createdAt: serverTimestamp(),
    });
    await signOut(auth);
    approved.push([u.user.uid, person.office, Boolean(person.head)]);
  }
  await signInWithEmailAndPassword(auth, DEMO.admin.email, DEMO.admin.password);
  for (const [uid, office, head] of approved) await updateDoc(doc(db, 'users', uid), { active: true, office, head });

  console.log(`
[DMS] Demo data loaded:
      Superadmin  ${DEMO.admin.email} / ${DEMO.admin.password}
      End user    ${DEMO.user.email} / ${DEMO.user.password}  (${DEMO.user.office})
      Office head ${DEMO.colleague.email} / ${DEMO.colleague.password}  (head of ${DEMO.colleague.office})
      Other office ${DEMO.other.email} / ${DEMO.other.password}  (${DEMO.other.office})
      Workflow    acctg@, budget@, treasury@, mayor@fts.local / user123  (Accounting, Budget, Treasury, Mayor's Office)
      Formats     ${STARTER_TYPES.map((t) => t.code).join(', ')}
      Checklists  ${CHECKLISTS.length} (disbursement and liquidation)
`);
}

main()
  .catch((e) => console.error('[DMS] Could not load demo data:', e.message))
  .finally(() => process.exit(0));
