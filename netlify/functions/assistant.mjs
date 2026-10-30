import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { firebaseConfig } from '../../src/firebase-config.js';

// The "Ask DMS" help assistant. The browser sends the signed-in user's Firebase ID token and the
// conversation; this function checks the token and that the account is active, then streams
// Claude's answer back as plain text. The Anthropic API key stays here, in the Netlify
// environment variable ANTHROPIC_API_KEY; it never reaches the browser.

const PROJECT = firebaseConfig.projectId;
const KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const MAX_TURNS = 20;
const MAX_CHARS = 4000;

// The user guide (docs/LOCALHOST.md, from "Using DMS as an end user" on) is what the assistant knows.
function loadGuide() {
  for (const p of [resolve(process.cwd(), 'docs/LOCALHOST.md'), new URL('../../docs/LOCALHOST.md', import.meta.url)]) {
    try {
      const text = readFileSync(p, 'utf8');
      const at = text.indexOf('## 4.');
      return at >= 0 ? text.slice(at) : text;
    } catch { /* try the next place */ }
  }
  return '';
}
const GUIDE = loadGuide();

const SYSTEM = `You are "Ask DMS", the help assistant inside DMS, the Document Management System of the Municipal Government of Candoni (Negros Occidental, Philippines). Staff use DMS to prepare, upload, route, sign (PNPKI digital signatures), track and file documents such as disbursement vouchers.

Your job: help people use DMS. Explain where things are and the steps to do something, using the menu and button names the user sees. Base your answers on the user guide below. If the guide does not cover something, say you are not sure and suggest asking the DMS administrator; do not invent screens, buttons or rules.

You cannot see or change the user's documents, accounts or data, and you do not know the status of any document. When asked about a specific document, explain where in DMS the user can look it up (for example Tracking, Inbox or All Documents).

For questions unrelated to DMS or the user's office work with it, briefly say you can only help with using DMS. Never ask for passwords, certificate files or PINs.

Answer in the language the user writes in (English, Filipino, Hiligaynon or Ilocano). Keep answers short and practical: a sentence or two, or a few numbered steps. Use plain text with simple **bold** for button and menu names; no tables or headings.

<user_guide>
${GUIDE}
</user_guide>`;

const text = (status, body) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

async function signedInUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, KEYS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
    // The user's own profile, read with their own token: firestore.rules decide, as in the app.
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${payload.sub}`,
      { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const f = (await r.json()).fields || {};
    if (!f.active?.booleanValue) return null;
    return { name: f.displayName?.stringValue || '', role: f.role?.stringValue || 'user', office: f.office?.stringValue || '' };
  } catch {
    return null;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return text(405, 'Use POST.');
  if (!process.env.ANTHROPIC_API_KEY) return text(503, 'The assistant is not set up yet: an administrator must add ANTHROPIC_API_KEY in Netlify (Site configuration → Environment variables) and redeploy.');
  const user = await signedInUser(req);
  if (!user) return text(401, 'Please sign in again.');

  let body;
  try { body = await req.json(); } catch { return text(400, 'Bad request.'); }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages.at(-1).role !== 'user') return text(400, 'Ask a question.');

  const page = typeof body.page === 'string' ? body.page.slice(0, 100) : '';
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: 'low' },
    // A declined request is retried server-side on the model Anthropic recommends.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // The guide is the same for everyone: cached. Who is asking comes after it.
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `The user: ${user.name || 'a DMS user'}, role ${user.role}${user.office ? `, office ${user.office}` : ''}. They are on the DMS page ${page || '/'}.` },
    ],
    messages,
  });

  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(ctrl) {
      stream.on('text', (t) => ctrl.enqueue(enc.encode(t)));
      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') ctrl.enqueue(enc.encode('\n\nSorry, I can’t help with that. Ask me about using DMS.'));
        else if (final.stop_reason === 'max_tokens') ctrl.enqueue(enc.encode('…'));
      } catch (e) {
        console.error('assistant', e);
        ctrl.enqueue(enc.encode(e instanceof Anthropic.RateLimitError
          ? '\n\nThe assistant is busy. Please try again in a minute.'
          : '\n\nThe assistant could not answer just now. Please try again.'));
      }
      ctrl.close();
    },
    cancel() { stream.abort(); },
  });
  return new Response(out, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
};
