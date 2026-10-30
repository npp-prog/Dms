import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackup } from '../../netlify/lib/driveBackup.mjs';

// A fake Drive and a fake archive: what the automatic Google Drive backup uploads, and when.
function fakes(docs) {
  const items = new Map(); let n = 0; const log = [];
  const drive = {
    async folder(name, parent) { for (const [id, it] of items) if (it.folder && it.name === name && it.parent === (parent || '')) return id; const id = `f${++n}`; items.set(id, { name, parent: parent || '', folder: true }); return id; },
    async upload({ name, parent, id }) { if (id) { log.push(`replace ${items.get(id).name}`); return id; } const nid = `u${++n}`; items.set(nid, { name, parent }); log.push(`new ${name}`); return nid; },
    async exists(id) { return items.has(id); },
  };
  const source = {
    async documentsAfter(cursor, limit) {
      const sorted = [...docs].sort((a, b) => a.raw.localeCompare(b.raw) || a.id.localeCompare(b.id));
      const from = cursor ? sorted.findIndex((d) => d.raw > cursor.at || (d.raw === cursor.at && d.id > cursor.id)) : 0;
      return from < 0 ? [] : sorted.slice(from, from + limit);
    },
    async download(path) { if (path.includes('missing')) throw new Error('404'); return Buffer.from(path); },
  };
  const blobs = new Map();
  const store = { get: async (k) => blobs.get(k) ?? null, set: async (k, v) => { blobs.set(k, v); } };
  const pathOf = (id) => { const p = []; let it = items.get(id); while (it) { p.unshift(it.name); it = items.get(it.parent); } return p.join('/'); };
  const files = () => [...items.keys()].filter((k) => !items.get(k).folder).map(pathOf).sort();
  return { drive, source, store, log, files };
}

test('automatic Google Drive backup: each processed document once, then only what changed', async () => {
  const done = { controlNo: 'DMS-2026-000123', typeCode: 'DV', title: 'NEIL PRIOLO', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-10-30T01:00:00Z' }] },
    pdf: { files: [{ path: 'documents/a/0-generated.pdf', kind: 'generated' }, { path: 'documents/a/1-signed.pdf', kind: 'signed' }] },
    links: { x: [{ kind: 'file', path: 'documents/a/attachments/x/or.pdf', name: 'Official receipt.pdf' }] } };
  const docs = [
    { id: 'a', raw: '2026-10-30T01:00:00Z', data: done },
    { id: 'b', raw: '2026-10-30T02:00:00Z', data: { controlNo: 'DMS-2026-000124', status: 'draft' } },
  ];
  const f = fakes(docs);
  assert.deepEqual(await f.source.documentsAfter(null, 20).then((r) => r.length), 2);
  let r = await runBackup({ ...f });
  assert.deepEqual(r, { documents: 1, files: 3, caughtUp: true, missing: 0 });
  assert.deepEqual(f.files(), [
    'DMS Archive/2026/DV/DMS-2026-000123 NEIL PRIOLO/PDF 01 generated.pdf',
    'DMS Archive/2026/DV/DMS-2026-000123 NEIL PRIOLO/PDF 02 signed.pdf',
    'DMS Archive/2026/DV/DMS-2026-000123 NEIL PRIOLO/attachments/Official receipt.pdf',
    'DMS Archive/2026/DV/DMS-2026-000123 NEIL PRIOLO/record.json',
  ]);
  f.log.length = 0;
  r = await runBackup({ ...f });
  assert.deepEqual(r, { documents: 0, files: 0, caughtUp: true, missing: 0 }, 'nothing changed: nothing uploaded');
  // Filed in the archive (the document changes): only its record is replaced.
  docs[0] = { ...docs[0], raw: '2026-10-30T03:00:00Z', data: { ...done, archive: { location: 'Cabinet 2' } } };
  r = await runBackup({ ...f });
  assert.deepEqual(f.log, ['replace record.json']);
  // A file that cannot be read is left for later; the rest goes on.
  docs.push({ id: 'c', raw: '2026-10-30T04:00:00Z', data: { ...done, controlNo: 'DMS-2026-000125', pdf: { files: [{ path: 'documents/c/missing.pdf', kind: 'generated' }] }, links: {} } });
  r = await runBackup({ ...f });
  assert.equal(r.missing, 1);
  assert.equal(r.documents, 1);
});

test('a run stops when its time is up and the next one goes on from there', async () => {
  const docs = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, raw: `2026-10-30T0${i}:00:00Z`,
    data: { controlNo: `DMS-${i}`, typeCode: 'DV', title: 'X', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-10-30' }] } } }));
  const f = fakes(docs);
  let t = 0;
  const r1 = await runBackup({ ...f, budgetMs: 3, now: () => t++ });
  assert.equal(r1.caughtUp, false);
  const r2 = await runBackup({ ...f });
  assert.equal(r1.documents + r2.documents, 5);
  assert.equal(r2.caughtUp, true);
});
