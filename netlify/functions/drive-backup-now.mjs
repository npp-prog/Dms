import { firebaseAs, keepsArchive, userFromRequest } from '../lib/fb.mjs';
import { driveClient, driveConfigured } from '../lib/drive.mjs';
import { backupNow } from '../lib/driveBackup.mjs';
import { accountStore, backupStore, listAccounts } from '../lib/store.mjs';

// Archive → Google Drive (the Records Officer or an admin):
//   POST { action: 'status' }        → every connected account and its last run
//   POST { action: 'run', uid? }     → one short run now for one connection (one's own by default),
//                                      besides the one every 10 minutes
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!driveConfigured()) return json(200, { configured: false });
  const me = await userFromRequest(req);
  if (!me || !keepsArchive(me.profile)) return json(403, { error: 'Only the Records Officer or an administrator can do this.' });
  const base = backupStore();
  const { action, uid } = await req.json().catch(() => ({}));
  if (action === 'run') {
    const store = accountStore(base, uid || me.uid);
    return json(200, await backupNow({ store, makeSource: (t) => firebaseAs(t), makeDrive: (t) => driveClient(t), budgetMs: 4500 }));
  }
  const accounts = (await listAccounts(base)).filter((a) => a.secret.googleRefreshToken).map(({ uid: id, secret, state }) => ({
    uid: id, mine: id === me.uid, email: secret.email || '', by: secret.by || '', at: secret.at || '',
    lastRunAt: state.lastRunAt || '', lastError: state.lastError || '', caughtUp: state.caughtUp ?? null,
    documents: state.documents || 0, files: state.files || 0, lastMissing: state.lastMissing || [],
  })).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  return json(200, { configured: true, accounts });
};
