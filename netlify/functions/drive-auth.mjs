import { randomBytes } from 'node:crypto';
import { admin, adminReady, archiveKeeper } from '../lib/admin.mjs';
import { authUrl, driveConfigured, exchangeCode, revoke } from '../lib/drive.mjs';

// Connecting the Google account the Archive is backed up to (Archive → Google Drive):
//   POST { action: 'start' }       → { url }: the Google consent page (Records Officer or admin)
//   GET  ?code&state               ← Google, after consent: keeps the refresh token, back to /archive
//   POST { action: 'disconnect' }  forgets the account (the files stay in its Drive)
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const back = (result) => new Response(null, { status: 302, headers: { location: `/archive?drive=${result}` } });

export default async (req) => {
  if (!adminReady() || !driveConfigured()) {
    return req.method === 'GET' ? back('not-set-up') : json(503, { error: 'The Google Drive backup is not set up in Netlify yet (see the README).' });
  }
  const { db } = admin();
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const state = url.searchParams.get('state') || '';
    const pending = (await db.doc('secrets/driveAuth').get()).data();
    if (!pending || pending.state !== state || Date.now() > pending.exp) return back('expired');
    await db.doc('secrets/driveAuth').delete();
    if (url.searchParams.get('error')) return back('cancelled');
    try {
      const { refreshToken, email } = await exchangeCode(url.searchParams.get('code') || '');
      if (!refreshToken) return back('no-token');
      const before = (await db.doc('secrets/drive').get()).data();
      await db.doc('secrets/drive').set({ refreshToken, email, by: pending.name, at: new Date().toISOString() });
      // Another account: start its backup afresh (the folders DMS made are in the other Drive).
      const fresh = before?.email && before.email !== email;
      if (fresh) {
        const kept = await db.collection('driveFiles').limit(500).get();
        const batch = db.batch(); kept.docs.forEach((d) => batch.delete(d.ref)); await batch.commit();
      }
      await db.doc('meta/driveBackup').set({
        connected: true, email, connectedBy: pending.name, connectedAt: new Date().toISOString(), lastError: '',
        ...(fresh ? { rootId: '', folders: {}, cursor: null, documents: 0, files: 0 } : {}),
      }, { merge: true });
      return back('connected');
    } catch (e) {
      await db.doc('meta/driveBackup').set({ lastError: e.message.slice(0, 300) }, { merge: true });
      return back('failed');
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const who = await archiveKeeper(req);
  if (!who) return json(403, { error: 'Only the Records Officer or an administrator can do this.' });
  const { action } = await req.json().catch(() => ({}));
  if (action === 'start') {
    const state = randomBytes(24).toString('hex');
    await db.doc('secrets/driveAuth').set({ state, uid: who.uid, name: who.name, exp: Date.now() + 10 * 60e3 });
    return json(200, { url: authUrl(state) });
  }
  if (action === 'disconnect') {
    const secret = (await db.doc('secrets/drive').get()).data();
    if (secret?.refreshToken) await revoke(secret.refreshToken);
    await db.doc('secrets/drive').delete();
    await db.doc('meta/driveBackup').set({ connected: false, email: '', disconnectedBy: who.name, disconnectedAt: new Date().toISOString() }, { merge: true });
    return json(200, { ok: true });
  }
  return json(400, { error: 'Unknown action.' });
};
