import { docFolder, filesOf, isArchived } from '../../src/lib/archiveFiles.js';

// The automatic backup of the Archive to Google Drive. Each run goes on from where the last one
// stopped (documents in the order they last changed), for as long as its time allows: a processed
// document gets a folder (DMS Archive / year / type / control no. and payee) with each of its
// files, uploaded once, and record.json, replaced whenever the document changes.
//
// source: the Records Officer's DMS access (lib/fb.mjs firebaseAs); drive: lib/drive.mjs;
// store: where the backup keeps its state (Netlify Blobs; a Map-like { get, set } in tests):
//   'state'          { rootId, folders, cursor, lastRunAt, lastError, documents, files, caughtUp }
//   'doc/<id>'       { folder, parent, record, files: { key: driveId }, at }

const key = (path) => path.replace(/[^A-Za-z0-9]/g, '_');

export async function runBackup({ source, drive, store, budgetMs = 20000, now = () => Date.now() }) {
  const started = now();
  const state = (await store.get('state')) || {};
  const folders = { ...(state.folders || {}) };
  let rootId = state.rootId || '';
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

  let cursor = state.cursor || null; // { at, id }
  let documents = 0;
  let files = 0;
  let more = true;
  const missing = [];
  while (more && now() - started < budgetMs) {
    const rows = await source.documentsAfter(cursor, 20);
    if (!rows.length) { more = false; break; }
    for (const row of rows) {
      if (now() - started >= budgetMs) break;
      const d = { id: row.id, ...row.data };
      if (isArchived(d)) {
        const kept = (await store.get(`doc/${row.id}`)) || { files: {} };
        const parts = docFolder(d);
        const parent = await folderFor(parts.slice(0, 2));
        const same = kept.parent === parent;
        const folder = same && kept.folder ? kept.folder : await drive.folder(parts[2], parent);
        const uploaded = { ...(same ? kept.files : {}) };
        for (const f of filesOf(d)) {
          if (uploaded[key(f.path)]) continue;
          const [sub, name] = f.name.includes('/') ? f.name.split(/\/(.+)/) : ['', f.name];
          let bytes;
          try { bytes = await source.download(f.path); } catch { missing.push(`${d.controlNo} ${name}`); continue; } // tried again when the document changes
          const into = sub ? await drive.folder(sub, folder) : folder;
          uploaded[key(f.path)] = await drive.upload({ name, parent: into, bytes, type: f.pdf ? 'application/pdf' : 'application/octet-stream' });
          files++;
        }
        const { typeSnapshot, ...record } = d;
        const json = Buffer.from(JSON.stringify({ ...record, type: { code: typeSnapshot?.code, name: typeSnapshot?.name } }, null, 2));
        const recordId = await drive.upload({ name: 'record.json', parent: folder, bytes: json, type: 'application/json', id: same ? kept.record : '' });
        await store.set(`doc/${row.id}`, { folder, parent, record: recordId, files: uploaded, at: new Date().toISOString() });
        documents++;
      }
      cursor = { at: row.raw, id: row.id };
    }
    if (rows.length < 20 && cursor?.id === rows.at(-1).id) more = false;
  }
  const next = {
    ...state, rootId, folders, cursor, lastRunAt: new Date().toISOString(), lastError: '', caughtUp: !more,
    documents: (state.documents || 0) + documents, files: (state.files || 0) + files,
    ...(missing.length ? { lastMissing: missing.slice(0, 20) } : {}),
  };
  await store.set('state', next);
  return { documents, files, caughtUp: !more, missing: missing.length };
}

// Run once with the connected accounts; records a failure in the state.
export async function backupNow({ store, makeSource, makeDrive, budgetMs }) {
  const secret = await store.get('secret');
  if (!secret?.googleRefreshToken) return { skipped: 'Google Drive is not connected.' };
  try {
    const [source, drive] = await Promise.all([makeSource(secret.firebaseRefreshToken), makeDrive(secret.googleRefreshToken)]);
    return await runBackup({ source, drive, store, budgetMs });
  } catch (e) {
    const state = (await store.get('state')) || {};
    await store.set('state', { ...state, lastRunAt: new Date().toISOString(), lastError: String(e.message).slice(0, 300) });
    return { error: e.message };
  }
}
