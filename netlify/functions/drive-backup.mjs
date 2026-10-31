import { firebaseAs } from '../lib/fb.mjs';
import { driveClient, driveConfigured } from '../lib/drive.mjs';
import { backupNow } from '../lib/driveBackup.mjs';
import { backupStore, listAccounts } from '../lib/store.mjs';

// Every 10 minutes: back up the Archive to each connected Google Drive (netlify/lib/driveBackup.mjs),
// one after another, sharing the run's time. Does nothing until the Google OAuth client is set in
// Netlify and someone has connected a Google account (Archive → Google Drive).
export default async () => {
  if (!driveConfigured()) return new Response('Not set up.');
  const accounts = (await listAccounts(backupStore())).filter((a) => a.secret.googleRefreshToken);
  const budget = Math.max(5000, Math.floor(22000 / Math.max(1, accounts.length)));
  // Each run starts with the next account, so none is left out when time runs short.
  const first = accounts.length ? Math.floor(Date.now() / 600e3) % accounts.length : 0;
  const started = Date.now();
  const results = {};
  for (const a of [...accounts.slice(first), ...accounts.slice(0, first)]) {
    if (Date.now() - started > 22000) break;
    results[a.secret.email || a.uid] = await backupNow({ store: a.store, makeSource: (t) => firebaseAs(t), makeDrive: (t) => driveClient(t), budgetMs: budget });
  }
  return new Response(JSON.stringify(results));
};

export const config = { schedule: '*/10 * * * *' };
