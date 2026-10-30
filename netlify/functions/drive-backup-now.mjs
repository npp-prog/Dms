import { admin, adminReady, archiveKeeper } from '../lib/admin.mjs';
import { driveClient, driveConfigured } from '../lib/drive.mjs';
import { backupNow } from '../lib/driveBackup.mjs';

// Archive → Google Drive → Back up now (the Records Officer or an admin): one short run now,
// besides the one every 10 minutes (drive-backup.mjs).
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!adminReady() || !driveConfigured()) return json(503, { error: 'The Google Drive backup is not set up in Netlify yet (see the README).' });
  if (!(await archiveKeeper(req))) return json(403, { error: 'Only the Records Officer or an administrator can do this.' });
  const { db, bucket } = admin();
  return json(200, await backupNow({ db, bucket, makeDrive: (t) => driveClient(t), budgetMs: 7000 }));
};
