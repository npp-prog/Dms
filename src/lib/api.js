import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';

// ---------- Users ----------

// Creates the profile on first sign-in. The very first account becomes the
// superadmin (claimed atomically via meta/bootstrap); everyone else starts
// inactive until approved by an admin.
export async function ensureUserProfile(user, extra = {}) {
  const ref = doc(db, 'users', user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return { id: user.uid, ...existing.data() };

  const bootstrapRef = doc(db, 'meta', 'bootstrap');
  return runTransaction(db, async (tx) => {
    const boot = await tx.get(bootstrapRef);
    const again = await tx.get(ref);
    if (again.exists()) return { id: user.uid, ...again.data() };
    const first = !boot.exists();
    const profile = {
      email: user.email,
      displayName: extra.displayName || user.displayName || user.email,
      office: extra.office || '',
      role: first ? 'superadmin' : 'user',
      active: first,
      createdAt: serverTimestamp(),
    };
    tx.set(ref, profile);
    if (first) tx.set(bootstrapRef, { superadmin: user.uid, at: serverTimestamp() });
    return { id: user.uid, ...profile };
  });
}

export async function listUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function updateUser(uid, patch) {
  return updateDoc(doc(db, 'users', uid), patch);
}

// ---------- Settings ----------

export async function getSettings() {
  const snap = await getDoc(doc(db, 'meta', 'settings'));
  return snap.exists() ? snap.data() : {};
}

export function saveSettings(settings) {
  return setDoc(doc(db, 'meta', 'settings'), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

// ---------- Document types ----------

export async function listDocumentTypes({ activeOnly = false } = {}) {
  const snap = await getDocs(collection(db, 'documentTypes'));
  const types = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  types.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  return activeOnly ? types.filter((t) => t.active !== false) : types;
}

export async function getDocumentType(id) {
  const snap = await getDoc(doc(db, 'documentTypes', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveDocumentType(id, data, user) {
  const { id: _ignored, createdAt, ...clean } = data;
  const payload = { ...clean, updatedAt: serverTimestamp(), updatedBy: user.uid };
  if (id) {
    await updateDoc(doc(db, 'documentTypes', id), { ...payload, version: (Number(data.version) || 1) + 1 });
    return id;
  }
  const ref = await addDoc(collection(db, 'documentTypes'), {
    ...payload, version: 1, createdAt: serverTimestamp(), createdBy: user.uid,
  });
  return ref.id;
}

export function deleteDocumentType(id) {
  return deleteDoc(doc(db, 'documentTypes', id));
}

export async function importDocumentTypes(types, user) {
  const batch = writeBatch(db);
  for (const t of types) {
    const { id, createdAt, updatedAt, ...clean } = t;
    batch.set(doc(collection(db, 'documentTypes')), {
      ...clean, version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid,
    });
  }
  await batch.commit();
}

// ---------- Checklist library ----------
// One document per checklist, keyed by its checklist number (e.g. "1613").

export async function listChecklists() {
  const snap = await getDocs(collection(db, 'checklists'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.code.localeCompare(b.code));
}

export async function getChecklist(code) {
  const snap = await getDoc(doc(db, 'checklists', code));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function saveChecklist(checklist, user) {
  const { id, createdAt, ...clean } = checklist;
  return setDoc(doc(db, 'checklists', clean.code), { ...clean, updatedAt: serverTimestamp(), updatedBy: user.uid });
}

export function deleteChecklist(code) {
  return deleteDoc(doc(db, 'checklists', code));
}

// Writes many checklists (e.g. the bundled library), overwriting same-numbered ones.
export async function importChecklists(list, user) {
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    for (const c of list.slice(i, i + 400)) {
      const { id, createdAt, updatedAt, ...clean } = c;
      batch.set(doc(db, 'checklists', clean.code), { ...clean, updatedAt: serverTimestamp(), updatedBy: user.uid });
    }
    await batch.commit();
  }
}

// The checklist library from the Municipal Accounting Office, bundled with the app.
// Loaded on demand so it is not part of the main bundle.
export async function loadBundledChecklists() {
  return (await import('../data/checklists.json')).default;
}

// ---------- Documents ----------

async function nextControlNo(typeCode) {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ref = doc(db, 'counters', `${typeCode}_${period}`);
  const value = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? snap.data().value + 1 : 1;
    tx.set(ref, { value: next });
    return next;
  });
  return `${typeCode}-${period}-${String(value).padStart(4, '0')}`;
}

function historyEntry(action, user, note = '') {
  return { action, note, by: user.displayName || user.email, uid: user.uid, at: new Date().toISOString() };
}

export async function createDocument(type, { data, checklist, transaction = null, signatories = null, status }, user) {
  const controlNo = await nextControlNo(type.code);
  const ref = await addDoc(collection(db, 'documents'), {
    typeId: type.id,
    typeCode: type.code,
    typeName: type.name,
    typeVersion: type.version || 1,
    // Frozen copy of the format so the document always prints as prepared,
    // even after admins revise the document type.
    typeSnapshot: snapshotType(type),
    controlNo,
    data,
    checklist,
    transaction,
    // Officials as they were when the document was prepared, so reprints match.
    signatories,
    status,
    title: summarize(type, data),
    createdBy: user.uid,
    createdByName: user.displayName || user.email,
    office: user.office || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    history: [historyEntry('created', user, status)],
  });
  return ref.id;
}

export async function updateDocument(id, type, { data, checklist, transaction = null, status }, user, history = []) {
  await updateDoc(doc(db, 'documents', id), {
    data,
    checklist,
    transaction,
    status,
    title: summarize(type, data),
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('updated', user, status)],
  });
}

export async function setDocumentStatus(id, status, user, history = [], extra = {}, note = '') {
  await updateDoc(doc(db, 'documents', id), {
    ...extra,
    status,
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry(status, user, note)],
  });
}

export async function getDocument(id) {
  const snap = await getDoc(doc(db, 'documents', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listDocuments({ uid, all = false, max = 300 } = {}) {
  const q = all
    ? query(collection(db, 'documents'), orderBy('updatedAt', 'desc'), limit(max))
    : query(collection(db, 'documents'), where('createdBy', '==', uid), limit(max));
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  docs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  return docs;
}

export function deleteDocument(id) {
  return deleteDoc(doc(db, 'documents', id));
}

export function snapshotType(type) {
  const keys = ['code', 'name', 'version', 'fields', 'steps', 'checklist', 'checklistSource', 'processing', 'copies', 'template', 'paperSize', 'orientation'];
  return Object.fromEntries(keys.filter((k) => type[k] !== undefined).map((k) => [k, type[k]]));
}

// Prefer the frozen format stored on the document; fall back to the live type.
export async function getTypeForDocument(document) {
  if (document.typeSnapshot?.template !== undefined) return { id: document.typeId, ...document.typeSnapshot };
  return getDocumentType(document.typeId);
}

// A short human-readable title (payee/supplier/purpose) for lists.
function summarize(type, data) {
  const preferred = ['payee', 'supplier', 'purpose', 'office', 'particulars', 'description'];
  for (const key of preferred) {
    const v = data?.[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  const first = (type.fields || []).find((f) => f.type === 'text' && data?.[f.key]);
  return first ? String(data[first.key]).slice(0, 120) : type.name;
}
