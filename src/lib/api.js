import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { isOwnerEmail } from './owner.js';
import { CHECKLIST_LIBRARY_VERSION, DEFAULT_SETTINGS, FORMAT_KEYS, STARTER_TYPES } from './defaults.js';

// ---------- Users ----------

// Creates the profile on first sign-in. The owner's email (lib/owner.js), once
// verified by Firebase, is the superadmin; everyone else starts inactive until an
// admin approves them. The Firestore rules enforce the same.
export async function ensureUserProfile(user, extra = {}) {
  const ref = doc(db, 'users', user.uid);
  const owner = isOwnerEmail(user.email) && user.emailVerified;
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const p = existing.data();
    if (owner && (p.role !== 'superadmin' || !p.active)) {
      await updateDoc(ref, { role: 'superadmin', active: true });
      return { id: user.uid, ...p, role: 'superadmin', active: true };
    }
    return { id: user.uid, ...p };
  }
  const profile = {
    email: user.email,
    displayName: extra.displayName || user.displayName || user.email,
    // The office decides which documents the user sees, so an admin assigns it; what the
    // user typed at registration is only a request.
    office: '',
    requestedOffice: extra.office || '',
    role: owner ? 'superadmin' : 'user',
    active: owner,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
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
  // edited: changed in the editor, so library updates leave it alone.
  return setDoc(doc(db, 'checklists', clean.code), { ...clean, edited: true, updatedAt: serverTimestamp(), updatedBy: user.uid });
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
      batch.set(doc(db, 'checklists', clean.code), { ...clean, edited: false, updatedAt: serverTimestamp(), updatedBy: user.uid });
    }
    await batch.commit();
  }
}

// The checklist library from the Municipal Accounting Office, bundled with the app.
// Loaded on demand so it is not part of the main bundle.
export async function loadBundledChecklists() {
  return (await import('../data/checklists.json')).default;
}

// ---------- Setup and updates ----------

// Replaces a document type's format with the starter format FTS ships (e.g. the redrawn DV).
// Documents already prepared keep their own frozen copy.
export function applyStarterFormat(id, starter) {
  return updateDoc(doc(db, 'documentTypes', id), {
    ...Object.fromEntries(FORMAT_KEYS.map((k) => [k, starter[k] ?? null])),
    starterVersion: starter.starterVersion || 1,
    updatedAt: serverTimestamp(),
  });
}

// Runs when an admin signs in. On a new site it installs what FTS needs: the starter formats
// (DV, OBR, PR, PO, ...), the checklist library and the LGU settings. On an existing site it
// brings in what FTS has revised since: starter formats nobody has edited (version 1 = never
// saved in the editor) and library checklists nobody has edited. Returns what it did.
export async function setupSite(user) {
  const done = [];
  const types = await listDocumentTypes();
  if (!types.length) {
    await importDocumentTypes(STARTER_TYPES, user);
    done.push(`installed ${STARTER_TYPES.length} document formats (${STARTER_TYPES.map((t) => t.code).join(', ')})`);
  } else {
    const updated = [];
    for (const t of types) {
      const starter = STARTER_TYPES.find((s) => s.code === t.code);
      if (starter && (t.starterVersion || 1) < (starter.starterVersion || 1) && (Number(t.version) || 1) === 1) {
        await applyStarterFormat(t.id, starter);
        updated.push(t.code);
      }
    }
    if (updated.length) done.push(`updated the ${updated.join(', ')} format`);
  }

  const settings = await getSettings();
  if (settings.lguName && !settings.offices) {
    await saveSettings({ offices: DEFAULT_SETTINGS.offices });
    done.push('added the list of offices (Settings)');
  }
  const libraryVersion = settings.checklistLibraryVersion || 1;
  if ((await getDocs(query(collection(db, 'checklists'), limit(1)))).empty) {
    const library = await loadBundledChecklists();
    await importChecklists(library, user);
    done.push(`installed ${library.length} checklists`);
  } else if (libraryVersion < CHECKLIST_LIBRARY_VERSION) {
    const edited = new Set((await listChecklists()).filter((c) => c.edited).map((c) => c.code));
    const library = (await loadBundledChecklists()).filter((c) => !edited.has(c.code));
    await importChecklists(library, user);
    done.push(`updated ${library.length} checklists to the latest version`);
  }

  if (!settings.lguName) {
    await saveSettings({ ...DEFAULT_SETTINGS, ...settings, checklistLibraryVersion: CHECKLIST_LIBRARY_VERSION });
    done.push('installed the LGU settings and signatories');
  } else if (libraryVersion < CHECKLIST_LIBRARY_VERSION) {
    await saveSettings({ checklistLibraryVersion: CHECKLIST_LIBRARY_VERSION });
  }
  return done;
}

// ---------- Documents ----------

// FTS control number: one series for every document type, e.g. FTS-000001.
async function nextControlNo() {
  const ref = doc(db, 'counters', 'FTS');
  const value = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? snap.data().value + 1 : 1;
    tx.set(ref, { value: next });
    return next;
  });
  return `FTS-${String(value).padStart(6, '0')}`;
}

function historyEntry(action, user, note = '') {
  return { action, note, by: user.displayName || user.email, uid: user.uid, at: new Date().toISOString() };
}

export async function createDocument(type, { data, checklist, additionalDocs = [], transaction = null, signatories = null, status }, user) {
  const controlNo = await nextControlNo();
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
    additionalDocs,
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

export async function updateDocument(id, type, { data, checklist, additionalDocs = [], transaction = null, status }, user, history = []) {
  await updateDoc(doc(db, 'documents', id), {
    data,
    checklist,
    additionalDocs,
    transaction,
    status,
    title: summarize(type, data),
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('updated', user, status)],
  });
}

// The Accounting Office's entries on a saved document (DV No., date, deductions).
export async function saveAccountingEntries(id, data, user, history = []) {
  await updateDoc(doc(db, 'documents', id), {
    data,
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('accounting', user, 'DV No., date or deductions')],
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

// Admins: every document. Others: their own and their office's (the Firestore rules allow
// no more), merged.
export async function listDocuments({ uid, office = '', all = false, max = 300 } = {}) {
  const queries = all
    ? [query(collection(db, 'documents'), orderBy('updatedAt', 'desc'), limit(max))]
    : [
      query(collection(db, 'documents'), where('createdBy', '==', uid), limit(max)),
      ...(office ? [query(collection(db, 'documents'), where('office', '==', office), limit(max))] : []),
    ];
  const byId = new Map();
  for (const snap of await Promise.all(queries.map((q) => getDocs(q)))) {
    for (const d of snap.docs) byId.set(d.id, { id: d.id, ...d.data() });
  }
  const docs = [...byId.values()];
  docs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  return docs;
}

export function deleteDocument(id) {
  return deleteDoc(doc(db, 'documents', id));
}

export function snapshotType(type) {
  const keys = ['code', 'name', 'version', 'fields', 'steps', 'checklist', 'checklistSource', 'processing', 'template', 'paperSize', 'orientation'];
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
