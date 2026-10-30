import { firebaseAs } from '../lib/fb.mjs';
import { driveClient, driveConfigured } from '../lib/drive.mjs';
import { backupNow } from '../lib/driveBackup.mjs';
import { backupStore } from '../lib/store.mjs';

// Every 10 minutes: back up the Archive to the connected Google Drive (netlify/lib/driveBackup.mjs).
// Does nothing until the Google OAuth client is set in Netlify and the Records Officer has
// connected a Google account (Archive → Google Drive).
export default async () => {
  if (!driveConfigured()) return new Response('Not set up.');
  const result = await backupNow({ store: backupStore(), makeSource: (t) => firebaseAs(t), makeDrive: (t) => driveClient(t), budgetMs: 22000 });
  return new Response(JSON.stringify(result));
};

export const config = { schedule: '*/10 * * * *' };
