import { admin, adminReady } from '../lib/admin.mjs';
import { driveClient, driveConfigured } from '../lib/drive.mjs';
import { backupNow } from '../lib/driveBackup.mjs';

// Every 10 minutes: back up the Archive to the connected Google Drive (netlify/lib/driveBackup.mjs).
// Does nothing until the service account and the Google OAuth client are set in Netlify and the
// Records Officer has connected a Google account (Archive → Google Drive).
export default async () => {
  if (!adminReady() || !driveConfigured()) return new Response('Not set up.');
  const { db, bucket } = admin();
  const result = await backupNow({ db, bucket, makeDrive: (t) => driveClient(t), budgetMs: 22000 });
  return new Response(JSON.stringify(result));
};

export const config = { schedule: '*/10 * * * *' };
