import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { deleteObject, getBytes, getMetadata, ref as storageRef, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase.js';
import { isOwnerEmail } from './owner.js';
import { counterFor, formatControlNo } from './naming.js';
import { CHECKLIST_LIBRARY_VERSION, DEFAULT_SETTINGS, FORMAT_KEYS, STARTER_TYPES } from './defaults.js';
import { applyAction, buildWorkflow, cancelWorkflow, placement } from './workflow.js';

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

// The route of a document type (Administration > Workflow). Not part of the format: saving it
// does not change the format's version, and starter-format updates keep it.
export async function saveRoute(typeId, route, user) {
  await updateDoc(doc(db, 'documentTypes', typeId), {
    route: route.map((s) => ({ office: s.office || '', action: String(s.action || '').trim(), sign: Boolean(s.sign) })),
    routeUpdatedAt: serverTimestamp(), routeUpdatedBy: user.displayName || user.email,
  });
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

// Replaces a document type's format with the starter format DMS ships (e.g. the redrawn DV).
// Documents already prepared keep their own frozen copy.
export function applyStarterFormat(id, starter) {
  return updateDoc(doc(db, 'documentTypes', id), {
    ...Object.fromEntries(FORMAT_KEYS.map((k) => [k, starter[k] ?? null])),
    starterVersion: starter.starterVersion || 1,
    updatedAt: serverTimestamp(),
  });
}

// Runs when an admin signs in. On a new site it installs what DMS needs: the starter formats
// (DV, OBR, PR, PO, ...), the checklist library and the LGU settings. On an existing site it
// brings in what DMS has revised since: starter formats nobody has edited (version 1 = never
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

  // Documents routed before atPreparer existed: set it, so the office they wait in can see them.
  const moving = await getDocs(query(collection(db, 'documents'), where('workflow.state', '==', 'in-progress')));
  const older = moving.docs.filter((d) => d.data().atPreparer === undefined);
  for (const d of older) await updateDoc(d.ref, { atPreparer: placement(d.data().workflow, d.data()).atPreparer });
  if (older.length) done.push(`updated ${older.length} routed document(s) for the new office access`);

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

// Control number: one series for every document type, per year, e.g. DMS-2026-000001.
// 2026 continues the counter used before (counters/FTS: the FTS-/DMS-###### numbers), so no
// number repeats; each later year starts at 1 (counters/DMS-2027, ...).

async function nextControlNo() {
  const year = new Date().getFullYear();
  const ref = doc(db, 'counters', counterFor(year));
  const value = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? snap.data().value + 1 : 1;
    tx.set(ref, { value: next });
    return next;
  });
  return formatControlNo(year, value);
}

function historyEntry(action, user, note = '') {
  return { action, note, by: user.displayName || user.email, uid: user.uid, at: new Date().toISOString() };
}

export async function createDocument(type, { data, checklist, additionalDocs = [], links = {}, transaction = null, signatories = null, status }, user) {
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
    links,
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

export async function updateDocument(id, type, { data, checklist, additionalDocs = [], links = {}, transaction = null, status }, user, history = []) {
  await updateDoc(doc(db, 'documents', id), {
    data,
    checklist,
    additionalDocs,
    links,
    transaction,
    status,
    title: summarize(type, data),
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('updated', user, status)],
  });
}

// Links to supporting documents, added or removed on a saved document (also after it is
// complete). A newly linked item is ticked Y.
export async function saveDocumentLinks(id, { links, checklist }, user, history = [], note = '') {
  await updateDoc(doc(db, 'documents', id), {
    links,
    checklist,
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('linked', user, note)],
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

// ---------- Workflow ----------

// Starts the route of a document (when it is marked complete): it sits with the preparer's office,
// which releases it to the next office.
// Starts the route set for the document's type now (Administration > Workflow), not the one
// frozen in the document's copy of its format.
export async function startWorkflow(id, type, user, offices) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d || d.workflow) return;
    const live = d.typeId ? (await tx.get(doc(db, 'documentTypes', d.typeId))).data() : null;
    const start = buildWorkflow(live?.route?.length ? live : type, d, offices, user);
    if (!start) return;
    tx.update(ref, { ...start, updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry('routing started', user)] });
  });
}

// Receive, release, return or complete the current step. Runs as a transaction: the step must
// still be the one the user saw (another office may have acted meanwhile).
export async function workflowAction(id, action, user, { stage, remarks = '' } = {}) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d?.workflow) throw new Error('This document has no workflow.');
    if (stage !== undefined && d.workflow.stage !== stage) throw new Error('Someone else acted on this document first. The page has been refreshed.');
    const patch = applyAction(d, action, user, remarks);
    const label = { receive: 'received', release: 'released', return: 'returned', complete: 'processed' }[action];
    tx.update(ref, { ...patch, updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry(label, user, remarks)] });
  });
}

// ---------- PDF and digital signatures ----------
// document.pdf = { basis, files: [{ path, size, sha256, kind: 'generated' | 'signed',
//   method: 'dms' | 'upload', at, by, uid, reason, signer: { name, email, issuer, pnpki, serial, signedAt } }] }
// The newest file is the current PDF. Files in Storage are never replaced (storage.rules).

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => toHex(await crypto.subtle.digest('SHA-256', bytes));

// What the PDF was made from: if this changes, the PDF no longer shows the document as it is.
// Keys sorted: Firestore may return a map's fields in another order than they were written.
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    : JSON.stringify(v ?? null));
export async function documentBasis(d) {
  const text = stable([d.data || {}, d.checklist || {}, d.additionalDocs || [], d.transaction?.code || '', d.signatories || {}]);
  return (await sha256(new TextEncoder().encode(text))).slice(0, 16);
}

// What DMS recorded about a PDF, by the SHA-256 of the file (anyone may look one up).
export async function lookupVerification(hash) {
  const snap = await getDoc(doc(db, 'verifications', hash));
  return snap.exists() ? snap.data() : null;
}

export const sha256Hex = sha256;

// Storage errors in words an admin can act on.
const SETUP = 'See the README, Setup steps 5 to 7.';
function storageError(e, doing, what = doing === 'download' ? 'opening the file' : 'saving the file') {
  const code = e?.code || '';
  if (code === 'storage/unauthorized') {
    return new Error(`Firebase Storage refused ${what}. An admin must publish the latest storage.rules (Firebase console → Storage → Rules). ${SETUP}`);
  }
  if (['storage/retry-limit-exceeded', 'storage/unknown', 'storage/bucket-not-found', 'storage/project-not-found'].includes(code)) {
    return new Error(doing === 'download'
      ? `Could not download from Firebase Storage (${what}). If this keeps happening, an admin must allow downloads (CORS) for the storage bucket. ${SETUP}`
      : `Firebase Storage is not set up for this site yet, so DMS cannot save files. An admin must open the Firebase console → Storage → Get started (it needs the Blaze plan), then publish storage.rules. ${SETUP}`);
  }
  return e;
}

// ---------- The signatory's saved certificate ----------
// certificates/{uid}/signing.p12: the PNPKI .p12/.pfx file a user chose to keep in DMS, so they
// sign with their password only. Only that user can read, replace or remove it (storage.rules);
// the password is never stored. Who it belongs to is kept in the file's metadata.
const certRef = (uid) => storageRef(storage, `certificates/${uid}/signing.p12`);

export async function getSavedCertificate(uid) {
  try {
    const meta = await getMetadata(certRef(uid));
    const m = meta.customMetadata || {};
    return { name: m.name || '', email: m.email || '', issuer: m.issuer || '', pnpki: m.pnpki === 'true', notAfter: m.notAfter || '', serial: m.serial || '', savedAt: meta.timeCreated };
  } catch (e) {
    if (e?.code === 'storage/object-not-found') return null;
    throw storageError(e, 'download', 'checking your registered certificate');
  }
}

export async function getSavedCertificateBytes(uid) {
  try {
    return new Uint8Array(await getBytes(certRef(uid)));
  } catch (e) {
    throw storageError(e, 'download', 'reading your registered certificate');
  }
}

export async function saveCertificate(uid, bytes, info) {
  try {
    await uploadBytes(certRef(uid), bytes, {
      contentType: 'application/x-pkcs12',
      customMetadata: { name: info.name || '', email: info.email || '', issuer: info.issuer || '', pnpki: String(Boolean(info.pnpki)), notAfter: info.notAfter || '', serial: info.serial || '' },
    });
  } catch (e) {
    throw storageError(e, 'upload', 'saving your certificate');
  }
}

export async function removeSavedCertificate(uid) {
  try {
    await deleteObject(certRef(uid));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw storageError(e, 'upload', 'removing your certificate');
  }
}

// The signatory's signature mark (an image of their handwritten signature), owner only too.
const markRef = (uid) => storageRef(storage, `certificates/${uid}/mark.png`);

export async function getSavedMark(uid) {
  try {
    return new Uint8Array(await getBytes(markRef(uid)));
  } catch (e) {
    if (e?.code === 'storage/object-not-found') return null;
    throw storageError(e, 'download', 'reading your signature mark');
  }
}

export async function saveMark(uid, pngBytes) {
  try {
    await uploadBytes(markRef(uid), pngBytes, { contentType: 'image/png' });
  } catch (e) {
    throw storageError(e, 'upload', 'saving your signature mark');
  }
}

export async function removeSavedMark(uid) {
  try {
    await deleteObject(markRef(uid));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw storageError(e, 'upload', 'removing your signature mark');
  }
}

// Checks, in a few seconds, that PDFs can be stored, before spending time drawing one.
// Reading a file that does not exist answers "not found" when Storage and its rules are in place.
export async function checkStorage(docId) {
  try {
    await getMetadata(storageRef(storage, `documents/${docId}/0-generated.pdf`));
  } catch (e) {
    if (e?.code === 'storage/object-not-found') return;
    throw storageError(e, 'upload', 'checking that PDFs can be saved');
  }
}

export async function getPdfBytes(path) {
  try {
    return new Uint8Array(await getBytes(storageRef(storage, path)));
  } catch (e) {
    throw storageError(e, 'download', 'opening the PDF');
  }
}

// Stores a new version of the document's PDF (converted, or signed) and records it.
export async function addPdfVersion(id, bytes, user, { kind, method = 'dms', signer = null, reason = '', basis = null, onProgress }) {
  const docRef = doc(db, 'documents', id);
  const current = (await getDoc(docRef)).data();
  const n = current?.pdf?.files?.length || 0;
  // Files are never overwritten (storage.rules). A file can already be in this version's place if
  // an earlier attempt was stored but not recorded (e.g. the record was refused): use the next
  // free name, so that attempt cannot block signing for good.
  let slot = n;
  for (; slot < n + 20; slot++) {
    try {
      await getMetadata(storageRef(storage, `documents/${id}/${slot}-${kind}.pdf`));
    } catch (e) {
      if (e?.code === 'storage/object-not-found') break;
      throw storageError(e, 'download', 'checking where to save the PDF');
    }
  }
  const path = `documents/${id}/${slot}-${kind}.pdf`;
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), bytes, { contentType: 'application/pdf' });
    task.on('state_changed', (s) => onProgress?.(s.bytesTransferred / (s.totalBytes || 1)), (e) => reject(storageError(e, 'upload', 'saving the PDF')), resolve);
  });
  const wf = current?.workflow;
  const file = {
    path, size: bytes.length, sha256: await sha256(bytes), kind, method, reason,
    stage: wf?.state === 'in-progress' ? wf.stage : null, // the workflow step it was signed at
    at: new Date().toISOString(), by: user.displayName || user.email, uid: user.uid, signer,
  };
  const verifyRef = doc(db, 'verifications', file.sha256);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(docRef)).data();
    const known = (await tx.get(verifyRef)).exists();
    const files = d.pdf?.files || [];
    if (files.length !== n) throw new Error('Someone else added a version of this PDF first. Reload the page and try again.');
    // Public record of this exact file, for anyone verifying a copy (the Verify page).
    if (!known) tx.set(verifyRef, {
      controlNo: d.controlNo, typeCode: d.typeCode, typeName: d.typeName, version: n + 1, kind,
      signer: signer?.name || '', signatures: files.filter((f) => f.kind === 'signed').length + (kind === 'signed' ? 1 : 0),
      by: file.by, at: file.at,
    });
    const note = kind === 'signed' ? `${signer?.name || ''}${method === 'upload' ? ' — uploaded' : ''}` : '';
    tx.update(docRef, {
      // basisV 2: the basis is computed with sorted keys (older ones were not, and are not compared).
      pdf: { basis: basis ?? d.pdf?.basis ?? null, basisV: basis ? 2 : d.pdf?.basisV ?? null, files: [...files, file] },
      updatedAt: serverTimestamp(),
      history: [...(d.history || []), historyEntry(kind === 'signed' ? 'signed' : 'converted to PDF', user, note)],
    });
  });
  return file;
}

// Documents waiting in an office (all routed documents for admins: office '').
// Documents waiting for the user: in their office at a routed step, and their own documents at
// the preparer's step. The office head gets everything waiting in the office.
export async function listInbox({ office, uid, all = false, head = false, max = 300 }) {
  const docs = collection(db, 'documents');
  const queries = all
    ? [query(docs, where('workflow.state', '==', 'in-progress'), limit(max))]
    : [
      ...(office ? [head
        ? query(docs, where('currentOffice', '==', office), limit(max))
        : query(docs, where('currentOffice', '==', office), where('atPreparer', '==', false), limit(max))] : []),
      ...(uid ? [query(docs, where('createdBy', '==', uid), where('atPreparer', '==', true), limit(max))] : []),
    ];
  const byId = new Map();
  for (const snap of await Promise.all(queries.map((q) => getDocs(q)))) {
    for (const d of snap.docs) byId.set(d.id, { id: d.id, ...d.data() });
  }
  return [...byId.values()].filter((d) => d.workflow?.state === 'in-progress')
    .sort((a, b) => (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0));
}

export async function setDocumentStatus(id, status, user, history = [], extra = {}, note = '') {
  // Cancelling a routed document ends its route.
  if (status === 'cancelled') {
    const d = (await getDoc(doc(db, 'documents', id))).data();
    const end = d ? cancelWorkflow(d, user) : null;
    if (end) extra = { ...extra, ...end };
  }
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

// Admins: every document. Others: their own, their office's and those routed through their
// office (the Firestore rules allow no more), merged.
// The documents a user may see (firestore.rules): their own and those waiting in their office;
// for an office head, every document of the office and every one routed through it.
export async function listDocuments({ uid, office = '', all = false, head = false, max = 300 } = {}) {
  const docs = collection(db, 'documents');
  const queries = all
    ? [query(docs, orderBy('updatedAt', 'desc'), limit(max))]
    : [
      query(docs, where('createdBy', '==', uid), limit(max)),
      ...(office && head ? [
        query(docs, where('office', '==', office), limit(max)),
        query(docs, where('routeOffices', 'array-contains', office), limit(max)),
        query(docs, where('currentOffice', '==', office), limit(max)),
      ] : []),
      ...(office && !head ? [
        query(docs, where('currentOffice', '==', office), where('atPreparer', '==', false), limit(max)),
      ] : []),
    ];
  const byId = new Map();
  for (const snap of await Promise.all(queries.map((q) => getDocs(q)))) {
    for (const d of snap.docs) byId.set(d.id, { id: d.id, ...d.data() });
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export function deleteDocument(id) {
  return deleteDoc(doc(db, 'documents', id));
}

export function snapshotType(type) {
  const keys = ['code', 'name', 'version', 'fields', 'steps', 'checklist', 'checklistSource', 'processing', 'template', 'paperSize', 'orientation', 'bulkDownload'];
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
