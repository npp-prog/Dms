import { firebaseAs, keepsArchive, userFromRequest } from '../lib/fb.mjs';
import { driveClient, driveConfigured } from '../lib/drive.mjs';
import { backupNow } from '../lib/driveBackup.mjs';
import { backupStore } from '../lib/store.mjs';

// Archive → Google Drive (the Records Officer or an admin):
//   POST { action: 'status' }  → the connected account and the last run
//   POST { action: 'run' }     → one short run now, besides the one every 10 minutes
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!driveConfigured()) return json(200, { configured: false });
  const me = await userFromRequest(req);
  if (!me || !keepsArchive(me.profile)) return json(403, { error: 'Only the Records Officer or an administrator can do this.' });
  const store = backupStore();
  const { action } = await req.json().catch(() => ({}));
  if (action === 'run') return json(200, await backupNow({ store, makeSource: (t) => firebaseAs(t), makeDrive: (t) => driveClient(t), budgetMs: 7000 }));
  const [secret, state] = await Promise.all([store.get('secret'), store.get('state')]);
  return json(200, {
    configured: true, connected: Boolean(secret?.googleRefreshToken), email: secret?.email || '', by: secret?.by || '', at: secret?.at || '',
    lastRunAt: state?.lastRunAt || '', lastError: state?.lastError || '', caughtUp: state?.caughtUp ?? null,
    documents: state?.documents || 0, files: state?.files || 0, lastMissing: state?.lastMissing || [],
  });
};
