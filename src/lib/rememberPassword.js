// "Remember my certificate password on this device" (My Profile). The password is never sent to
// the server: it is encrypted with an AES-GCM key that this browser generated as non-extractable
// (it cannot be read out, only used), and both are kept in this browser's IndexedDB, for one user
// and one certificate, until a time limit. Signing still needs the user's own DMS session.

const DB = 'dms-signing';
const STORE = 'remembered';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

// Which certificate a remembered password belongs to.
export const certId = (c) => c?.serial || `${c?.name}|${c?.notAfter}`;

export const REMEMBER_CHOICES = [
  { days: 1 / 3, label: '8 hours' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 182, label: '6 months' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
];

// Remembers the password of this user's certificate (serial) until now + days, but never past
// the certificate's own expiry (notAfter).
export async function rememberPassword(uid, serial, password, days, notAfter = '') {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(password));
  const chosen = Date.now() + days * 864e5;
  const expires = notAfter ? new Date(notAfter).getTime() : Infinity;
  const until = new Date(Math.min(chosen, expires)).toISOString();
  await tx('readwrite', (s) => s.put({ key, iv, data, serial, until }, uid));
  return until;
}

// { until } if a password is remembered for this user and certificate and has not expired.
export async function rememberedStatus(uid, serial) {
  try {
    const r = await tx('readonly', (s) => s.get(uid));
    if (!r) return null;
    if (r.serial !== serial || new Date(r.until) < new Date()) {
      await forgetPassword(uid);
      return null;
    }
    return { until: r.until };
  } catch {
    return null; // private browsing or storage blocked: ask every time
  }
}

export async function rememberedPassword(uid, serial) {
  if (!(await rememberedStatus(uid, serial))) return null;
  const r = await tx('readonly', (s) => s.get(uid));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, r.key, r.data);
  return new TextDecoder().decode(plain);
}

export async function forgetPassword(uid) {
  try { await tx('readwrite', (s) => s.delete(uid)); } catch { /* nothing remembered */ }
}
