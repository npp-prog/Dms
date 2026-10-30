import nodemailer from 'nodemailer';
import { getStore } from '@netlify/blobs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { firebaseConfig } from '../../src/firebase-config.js';

// Emails DMS notifications (users/{uid}/notifications). The browser that just wrote them sends
// their ids with the signed-in user's Firebase ID token; this function reads each one with that
// token (firestore.rules let only the recipient and its sender read it), checks it was sent by
// that user, looks up the recipient's email in the directory, and sends it. So nobody can email
// anything but the DMS notifications they sent, and only to DMS users.
//
// The mailbox it sends from is set in Netlify (Site configuration → Environment variables):
//   SMTP_USER   the address, e.g. the office's Gmail address
//   SMTP_PASS   its password (for Gmail: an App Password, not the account password)
//   SMTP_HOST   optional, default smtp.gmail.com; SMTP_PORT optional, default 465
//   EMAIL_FROM  optional, default "DMS <SMTP_USER>"
// Without them nothing is emailed (notifications still show in DMS).

const PROJECT = firebaseConfig.projectId;
const KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MAX = 500;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const str = (f, k) => f?.[k]?.stringValue || '';

async function read(path, token) {
  const r = await fetch(`${BASE}/${path}`, { headers: { authorization: `Bearer ${token}` } });
  return r.ok ? (await r.json()).fields || {} : null;
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return json(200, { sent: 0, reason: 'Email is not set up (SMTP_USER and SMTP_PASS in Netlify).' });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let uid;
  try {
    uid = (await jwtVerify(token, KEYS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT })).payload.sub;
  } catch {
    return json(401, { error: 'Please sign in again.' });
  }
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request.' }); }
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX)
    .filter((x) => /^[A-Za-z0-9]{10,40}$/.test(x?.to || '') && /^[A-Za-z0-9]{10,40}$/.test(x?.id || ''));

  // Each notification, as stored, sent by this user; grouped by text so a circular to many
  // offices goes out as one email (Bcc). Each is emailed once only (ids kept in Netlify Blobs).
  const sentStore = getStore('email-sent');
  const groups = new Map();
  const sending = [];
  await Promise.all(items.map(async ({ to, id }) => {
    if (await sentStore.get(`${to}/${id}`)) return;
    const [n, person] = await Promise.all([read(`users/${to}/notifications/${id}`, token), read(`directory/${to}`, token)]);
    const email = str(person, 'email');
    if (!n || str(n, 'from') !== uid || !email) return;
    sending.push(`${to}/${id}`);
    const key = `${str(n, 'text')}\n${str(n, 'link')}`;
    if (!groups.has(key)) groups.set(key, { text: str(n, 'text'), link: str(n, 'link'), kind: str(n, 'kind'), fromName: str(n, 'fromName'), to: [] });
    groups.get(key).to.push(email);
  }));
  if (!groups.size) return json(200, { sent: 0 });
  await Promise.all(sending.map((k) => sentStore.set(k, '1')));

  const port = Number(process.env.SMTP_PORT || 465);
  const mail = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const from = process.env.EMAIL_FROM || `DMS <${process.env.SMTP_USER}>`;
  const site = (process.env.URL || '').replace(/\/$/, '');
  const LABEL = { document: 'Your document', circular: 'Circular', community: 'Community' };
  let sent = 0;
  for (const g of groups.values()) {
    const url = site && g.link.startsWith('/') ? `${site}${g.link}` : '';
    const subject = `DMS · ${LABEL[g.kind] || 'Update'}: ${g.text.slice(0, 90)}${g.text.length > 90 ? '…' : ''}`;
    const text = `${g.text}\n\n${g.fromName ? `From ${g.fromName}\n` : ''}${url ? `Open it in DMS: ${url}\n` : ''}\nDocument Management System, Municipal Government of Candoni`;
    const html = `<p style="font:15px/1.5 Arial,sans-serif">${escape(g.text)}</p>
      ${g.fromName ? `<p style="font:13px Arial,sans-serif;color:#555">From ${escape(g.fromName)}</p>` : ''}
      ${url ? `<p><a href="${escape(url)}" style="font:14px Arial,sans-serif;background:#2f5f7a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open in DMS</a></p>` : ''}
      <p style="font:12px Arial,sans-serif;color:#888">Document Management System, Municipal Government of Candoni</p>`;
    // One recipient: To; several: Bcc, in groups of 50 (so nobody sees the others' addresses).
    const lists = g.to.length === 1 ? [g.to] : Array.from({ length: Math.ceil(g.to.length / 50) }, (_, i) => g.to.slice(i * 50, i * 50 + 50));
    for (const list of lists) {
      try {
        await mail.sendMail(list.length === 1 ? { from, to: list[0], subject, text, html } : { from, to: from, bcc: list, subject, text, html });
        sent += list.length;
      } catch (e) {
        console.error('email failed', e.message);
      }
    }
  }
  return json(200, { sent });
};
