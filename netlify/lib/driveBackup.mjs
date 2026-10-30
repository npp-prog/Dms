import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { docFolder, filesOf, isArchived } from '../../src/lib/archiveFiles.js';

// The automatic backup of the Archive to Google Drive. Each run goes on from where the last one
// stopped (documents in the order they last changed), for as long as its time allows:
// a processed document gets a folder (DMS Archive / year / type / control no. and payee) with
// each of its files, uploaded once, and record.json, replaced whenever the document changes.
//
// Firestore (written here only; firestore.rules let no browser write them):
//   secrets/drive        { refreshToken, email, by, at }       never readable by browsers
//   meta/driveBackup     { connected, email, rootId, folders, cursor, lastRunAt, lastError,
//                          documents, files }                   the Records Officer reads it
//   driveFiles/{docId}   { folder, record, files: { key: driveId }, at }

const key = (path) => path.replace(/[^A-Za-z0-9]/g, '_');

export async function runBackup({ db, bucket, drive, budgetMs = 20000, now = () => Date.now() }) {
  const started = now();
  const metaRef = db.doc('meta/driveBackup');
  const meta = (await metaRef.get()).data() || {};
  const folders = { ...(meta.folders || {}) };
  let rootId = meta.rootId || '';
  if (!rootId || !(await drive.exists(rootId))) {
    rootId = await drive.folder('DMS Archive');
    Object.keys(folders).forEach((k) => delete folders[k]);
  }
  const folderFor = async (parts) => {
    let parent = rootId;
    for (let i = 0; i < parts.length; i++) {
      const k = parts.slice(0, i + 1).join('/');
      if (!folders[k]) folders[k] = await drive.folder(parts[i], parent);
      parent = folders[k];
    }
    return parent;
  };

  let cursor = meta.cursor || null; // { at: Timestamp, id }
  let documents = 0;
  let files = 0;
  let more = true;
  while (more && now() - started < budgetMs) {
    let q = db.collection('documents').orderBy('updatedAt').orderBy(FieldPath.documentId()).limit(20);
    if (cursor) q = q.startAfter(cursor.at, cursor.id);
    const snap = await q.get();
    if (snap.empty) { more = false; break; }
    for (const s of snap.docs) {
      if (now() - started >= budgetMs) { more = true; break; }
      const d = { id: s.id, ...s.data() };
      if (isArchived(d)) {
        const ref = db.doc(`driveFiles/${s.id}`);
        const kept = (await ref.get()).data() || { files: {} };
        const parts = docFolder(d);
        const folder = await folderFor(parts.slice(0, 2));
        const docFolderId = kept.folder && kept.parent === folder ? kept.folder : await drive.folder(parts[2], folder);
        const uploaded = { ...(kept.parent === folder ? kept.files : {}) };
        for (const f of filesOf(d)) {
          if (uploaded[key(f.path)]) continue;
          const [sub, name] = f.name.includes('/') ? f.name.split(/\/(.+)/) : ['', f.name];
          const parent = sub ? await drive.folder(sub, docFolderId) : docFolderId;
          let bytes;
          try { [bytes] = await bucket.file(f.path).download(); } catch { continue; } // missing file: tried again next time
          uploaded[key(f.path)] = await drive.upload({ name, parent, bytes, type: f.pdf ? 'application/pdf' : 'application/octet-stream' });
          files++;
        }
        const { typeSnapshot, ...record } = d;
        const json = Buffer.from(JSON.stringify({
          ...record, createdAt: d.createdAt?.toDate?.().toISOString() || '', updatedAt: d.updatedAt?.toDate?.().toISOString() || '',
          type: { code: typeSnapshot?.code, name: typeSnapshot?.name },
        }, null, 2));
        const recordId = await drive.upload({ name: 'record.json', parent: docFolderId, bytes: json, type: 'application/json', id: kept.parent === folder ? kept.record : '' });
        await ref.set({ folder: docFolderId, parent: folder, record: recordId, files: uploaded, at: new Date().toISOString() });
        documents++;
      }
      cursor = { at: s.data().updatedAt || Timestamp.fromMillis(0), id: s.id };
    }
    if (snap.size < 20) more = false;
  }
  await metaRef.set({
    rootId, folders, cursor, lastRunAt: new Date().toISOString(), lastError: '', caughtUp: !more,
    documents: (meta.documents || 0) + documents, files: (meta.files || 0) + files,
  }, { merge: true });
  return { documents, files, caughtUp: !more };
}

// Run once, with the connected account; records a failure in meta/driveBackup.
export async function backupNow({ db, bucket, makeDrive, budgetMs }) {
  const secret = (await db.doc('secrets/drive').get()).data();
  if (!secret?.refreshToken) return { skipped: 'Google Drive is not connected.' };
  try {
    const drive = await makeDrive(secret.refreshToken);
    return await runBackup({ db, bucket, drive, budgetMs });
  } catch (e) {
    await db.doc('meta/driveBackup').set({ lastRunAt: new Date().toISOString(), lastError: e.message.slice(0, 300) }, { merge: true });
    return { error: e.message };
  }
}
