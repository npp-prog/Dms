import { getStore } from '@netlify/blobs';

// The Google Drive backup's private storage (Netlify Blobs: only these server functions read it;
// it holds the connected accounts' tokens, so never Firestore).
//   pending/<state>        a connection waiting for Google's consent (10 minutes)
//   acct/<uid>/...         one connection per DMS user (the Records Officer, an administrator):
//                          'secret', 'state', 'doc/<id>' (lib/driveBackup.mjs), backed up apart.
export function backupStore() {
  // Strong: a connection just made shows at once (the default may lag up to a minute).
  const s = getStore({ name: 'drive-backup', consistency: 'strong' });
  return {
    get: (k) => s.get(k, { type: 'json' }),
    set: (k, v) => s.setJSON(k, v),
    delete: (k) => s.delete(k),
    async keys(prefix) {
      const { blobs } = await s.list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}

// One connection's storage: the keys driveBackup.mjs uses, under acct/<uid>/.
export function accountStore(base, uid) {
  const p = `acct/${uid}/`;
  return {
    get: (k) => base.get(p + k),
    set: (k, v) => base.set(p + k, v),
    delete: (k) => base.delete(p + k),
    async clearDocs() {
      await Promise.all((await base.keys(`${p}doc/`)).map((k) => base.delete(k)));
    },
    async clearAll() {
      await Promise.all((await base.keys(p)).map((k) => base.delete(k)));
    },
  };
}

// The DMS users who have connected a Google account, with what they connected.
export async function listAccounts(base) {
  const uids = (await base.keys('acct/')).filter((k) => k.endsWith('/secret')).map((k) => k.split('/')[1]);
  return Promise.all(uids.map(async (uid) => {
    const store = accountStore(base, uid);
    const [secret, state] = await Promise.all([store.get('secret'), store.get('state')]);
    return { uid, store, secret: secret || {}, state: state || {} };
  }));
}
