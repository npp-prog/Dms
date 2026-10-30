import { getStore } from '@netlify/blobs';

// The Google Drive backup's private storage (Netlify Blobs: only these server functions read it;
// it holds the connected accounts' tokens, so never Firestore).
export function backupStore() {
  const s = getStore('drive-backup');
  return {
    get: (k) => s.get(k, { type: 'json' }),
    set: (k, v) => s.setJSON(k, v),
    delete: (k) => s.delete(k),
    async clearDocs() {
      const { blobs } = await s.list({ prefix: 'doc/' });
      await Promise.all(blobs.map((b) => s.delete(b.key)));
    },
  };
}
