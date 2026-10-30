import { randomBytes } from 'node:crypto';
import { keepsArchive, userFromRequest } from '../lib/fb.mjs';
import { authUrl, driveConfigured, exchangeCode, revoke } from '../lib/drive.mjs';
import { backupStore } from '../lib/store.mjs';

// Connecting the Google account the Archive is backed up to (Archive → Google Drive). The backup
// reads the archive as the Records Officer who connects it (their DMS sign-in, kept with the
// Google access in Netlify's private storage), so no service account key is needed.
//   POST { action: 'start', firebaseRefreshToken } → { url }: Google's consent page
//   GET  ?code&state                                ← Google, after consent; back to /archive
//   POST { action: 'disconnect' }                   forgets the account (its files stay in its Drive)
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const back = (result) => new Response(null, { status: 302, headers: { location: `/archive?drive=${result}` } });

export default async (req) => {
  if (!driveConfigured()) {
    return req.method === 'GET' ? back('not-set-up') : json(503, { error: 'The Google Drive backup is not set up in Netlify yet (see the README).' });
  }
  const store = backupStore();
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const pending = await store.get('pending');
    if (!pending || pending.state !== (url.searchParams.get('state') || '') || Date.now() > pending.exp) return back('expired');
    await store.delete('pending');
    if (url.searchParams.get('error')) return back('cancelled');
    try {
      const { refreshToken, email } = await exchangeCode(url.searchParams.get('code') || '');
      if (!refreshToken) return back('no-token');
      const before = await store.get('secret');
      await store.set('secret', { googleRefreshToken: refreshToken, firebaseRefreshToken: pending.firebaseRefreshToken, email, by: pending.name, uid: pending.uid, at: new Date().toISOString() });
      // Another Google account: back everything up afresh there.
      if (before?.email && before.email !== email) {
        await store.clearDocs();
        await store.set('state', {});
      }
      return back('connected');
    } catch {
      return back('failed');
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const me = await userFromRequest(req);
  if (!me || !keepsArchive(me.profile)) return json(403, { error: 'Only the Records Officer or an administrator can do this.' });
  const body = await req.json().catch(() => ({}));
  if (body.action === 'start') {
    if (!body.firebaseRefreshToken) return json(400, { error: 'Sign in to DMS again, then connect.' });
    const state = randomBytes(24).toString('hex');
    await store.set('pending', { state, uid: me.uid, name: me.profile.displayName || me.profile.email || '', firebaseRefreshToken: body.firebaseRefreshToken, exp: Date.now() + 10 * 60e3 });
    return json(200, { url: authUrl(state) });
  }
  if (body.action === 'disconnect') {
    const secret = await store.get('secret');
    if (secret?.googleRefreshToken) await revoke(secret.googleRefreshToken);
    await store.delete('secret');
    return json(200, { ok: true });
  }
  return json(400, { error: 'Unknown action.' });
};
