import { test } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { jsPDF } from 'jspdf';
import { Buffer as BrowserBuffer } from 'buffer/index.js';
import jsQR from 'jsqr';
import { qrAppearance, qrRuns, verifyUrl } from './qr.js';
import { checkRecord, CHECK_KEYS } from './publicRecord.js';
import { addNotes, addQrStamps, addSignatureField, checkSignedVersion, fixBufferLastIndexOf, noteBox, readCertificate, readSignatures, signPdf, stampDate, verifyPdf, wrapNote } from './signing.js';

// Test certificates only: a CA named like the PNPKI and one signer, plus a non-PNPKI signer.
function makeP12(cn, issuerDn, password = 'secret') {
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '0a1b';
  cert.validity.notBefore = new Date(Date.now() - 864e5);
  cert.validity.notAfter = new Date(Date.now() + 864e5);
  cert.setSubject([{ name: 'commonName', value: cn }, { name: 'emailAddress', value: 'x@candoni.gov.ph' }]);
  cert.setIssuer(issuerDn);
  cert.sign(ca.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  return new Uint8Array(Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
}
// The broken output had the signature field and widget written after the dictionary's end.
const wellFormed = (bytes) => {
  const text = Buffer.from(bytes).toString('latin1');
  assert.match(text, /\/AcroForm \d+ 0 R\n>>\nendobj/);
  assert.doesNotMatch(text, />>\s*\/AcroForm/);
  assert.doesNotMatch(text, />>\s*\/Annots/);
};
const PNPKI = [{ name: 'commonName', value: 'PNPKI Test CA' }, { name: 'organizationName', value: 'Department of Information and Communications Technology' }];
const OTHER = [{ name: 'commonName', value: 'Some Other CA' }];

function unsignedPdf() {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.text('DISBURSEMENT VOUCHER DMS-000001', 20, 20);
  pdf.addPage();
  pdf.text('CHECKLIST', 20, 20);
  return new Uint8Array(pdf.output('arraybuffer'));
}

test('reads a PNPKI certificate file and rejects a wrong password', () => {
  const p12 = makeP12('JUAN DELA CRUZ', PNPKI);
  const info = readCertificate(p12, 'secret');
  assert.equal(info.name, 'JUAN DELA CRUZ');
  assert.equal(info.email, 'x@candoni.gov.ph');
  assert.equal(info.pnpki, true);
  assert.equal(readCertificate(makeP12('A', OTHER), 'secret').pnpki, false);
  assert.throws(() => readCertificate(p12, 'wrong'), /Wrong password/);
  assert.throws(() => readCertificate(new Uint8Array([1, 2, 3]), 'x'), /not a \.p12/);
});

test('two signatories sign in turn; both signatures stay valid', async () => {
  const v0 = unsignedPdf();
  assert.deepEqual(readSignatures(v0), []);
  const v1 = await signPdf(v0, makeP12('JUAN DELA CRUZ', PNPKI), 'secret', { reason: 'Box A' });
  const c1 = checkSignedVersion(v0, v1);
  assert.equal(c1.ok, true, c1.error);
  assert.equal(c1.added[0].signer.name, 'JUAN DELA CRUZ');
  const v2 = await signPdf(v1, makeP12('ROSA ACCOUNTING', PNPKI), 'secret', { reason: 'Box B' });
  const c2 = checkSignedVersion(v1, v2);
  assert.equal(c2.ok, true, c2.error);
  assert.deepEqual(c2.signatures.map((s) => [s.signer.name, s.valid, s.coversWholeFile]),
    [['JUAN DELA CRUZ', true, false], ['ROSA ACCOUNTING', true, true]]);
  // The signature field is inside the catalog (PDF readers find it).
  wellFormed(v2);
});

test('changed, unsigned or unrelated uploads are refused', async () => {
  const v0 = unsignedPdf();
  const v1 = await signPdf(v0, makeP12('JUAN DELA CRUZ', PNPKI), 'secret');
  const tampered = new Uint8Array(v1);
  tampered[300] ^= 1;
  assert.equal(readSignatures(tampered)[0].valid, false);
  assert.match(checkSignedVersion(v0, tampered).error, /not valid|not the current PDF/);
  assert.match(checkSignedVersion(v0, v0).error, /not the current PDF/);
  assert.match(checkSignedVersion(v0, unsignedPdf()).error, /not the current PDF/);
  const appended = new Uint8Array([...v1, ...new TextEncoder().encode('\n% added\n')]);
  assert.match(checkSignedVersion(v0, appended).error, /after the last signature/);
});

test("browser Buffer: lastIndexOf(value, 'utf8') searches from the end, as in Node", async () => {
  const b = BrowserBuffer.from('<< /A 1 >> x >>');
  fixBufferLastIndexOf(BrowserBuffer);
  assert.equal(b.lastIndexOf('>>', 'utf8'), 13);
  assert.equal(b.lastIndexOf('>>', 5), -1); // a numeric start still searches back from there
  // Signing with the browser Buffer writes a valid catalog too.
  const NodeBuffer = globalThis.Buffer;
  globalThis.Buffer = BrowserBuffer;
  try {
    const v1 = await signPdf(unsignedPdf(), makeP12('JUAN DELA CRUZ', PNPKI), 'secret');
    wellFormed(v1);
  } finally {
    globalThis.Buffer = NodeBuffer;
  }
});

test('visible signature: the mark is the signature field, on the chosen page; earlier signatures intact', async () => {
  const v0 = unsignedPdf();
  const v1 = await signPdf(v0, makeP12('JUAN DELA CRUZ', PNPKI), 'secret');
  const W = 40; const H = 12;
  const image = { width: W, height: H, rgb: new Uint8Array(W * H * 3).fill(30), alpha: new Uint8Array(W * H).fill(255) };
  const mark = { page: 1, rect: [50, 60, 200, 102], image, lines: ['Digitally signed by', 'ROSA (ACCOUNTING)', stampDate(new Date(2026, 9, 29, 15, 11, 5))] };
  const placeholder = Buffer.from(await addSignatureField(v1, { mark })).toString('latin1');
  assert.match(placeholder, /\/Subtype \/Widget \/FT \/Sig \/T \(Signature2\) \/V \d+ 0 R \/Rect \[50 60 200 102\] \/F 132 \/P \d+ 0 R \/AP << \/N \d+ 0 R >>/);
  assert.match(placeholder, /\(ROSA \\\(ACCOUNTING\\\)\) Tj/); // parentheses escaped
  assert.match(placeholder, /\(2026\.10\.29 15:11\) Tj/);
  assert.match(placeholder, /\/Fields \[\d+ 0 R \d+ 0 R\]/); // both fields in the form
  const v2 = await signPdf(v1, makeP12('ROSA ACCOUNTING', PNPKI), 'secret', { mark });
  const check = checkSignedVersion(v1, v2);
  assert.equal(check.ok, true, check.error);
  assert.deepEqual(check.signatures.map((s) => s.valid), [true, true]);
  wellFormed(v2);
});

test('verify a copy: valid, tampered, changed after signing, and the certificate chain', async () => {
  // A CA and a signer issued by it, both in the .p12 (as DICT issues them).
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const caCert = forge.pki.createCertificate();
  caCert.publicKey = ca.publicKey; caCert.serialNumber = '01';
  caCert.validity.notBefore = new Date(Date.now() - 864e5); caCert.validity.notAfter = new Date(Date.now() + 864e5);
  caCert.setSubject(PNPKI); caCert.setIssuer(PNPKI); caCert.sign(ca.privateKey, forge.md.sha256.create());
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '02';
  cert.validity.notBefore = caCert.validity.notBefore; cert.validity.notAfter = caCert.validity.notAfter;
  cert.setSubject([{ name: 'commonName', value: 'ANA REYES' }]); cert.setIssuer(PNPKI); cert.sign(ca.privateKey, forge.md.sha256.create());
  const p12 = new Uint8Array(Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert, caCert], 'secret', { algorithm: '3des' })).getBytes(), 'binary'));

  const signed = await signPdf(unsignedPdf(), p12, 'secret');
  const ok = verifyPdf(signed);
  assert.equal(ok.allValid, true);
  assert.equal(ok.changedAfterLast, false);
  assert.equal(ok.signatures[0].chain.status, 'verified');
  assert.deepEqual(ok.signatures[0].chain.names, ['ANA REYES', 'PNPKI Test CA']);
  assert.equal(ok.signatures[0].certValidWhenSigned, true);

  const tampered = new Uint8Array(signed); tampered[400] ^= 1;
  assert.equal(verifyPdf(tampered).allValid, false);
  const added = new Uint8Array([...signed, ...new TextEncoder().encode('\n9 0 obj\n<<>>\nendobj\n')]);
  assert.equal(verifyPdf(added).changedAfterLast, true);
  assert.equal(verifyPdf(unsignedPdf()).signatures.length, 0);
});

test('text added with a signature: on any page, covered by the signature, beside the mark', async () => {
  assert.deepEqual(wrapNote('Approved for payment subject to the submission of the official receipt', 30),
    ['Approved for payment subject', 'to the submission of the', 'official receipt']);
  const lines = wrapNote('Approved (with remarks)');
  const box = noteBox(lines, 10);
  const note = { page: 0, rect: [300, 500, 300 + box.w, 500 + box.h], lines, size: 10 };
  const W = 4; const H = 2;
  const image = { width: W, height: H, rgb: new Uint8Array(W * H * 3).fill(30), alpha: null };
  const v0 = unsignedPdf();
  // The mark on page 2, the text on page 1: both pages get their annotation.
  const mark = { page: 1, rect: [50, 60, 200, 102], image, lines: ['Digitally signed by', 'ROSA'] };
  const placeholder = Buffer.from(await addSignatureField(v0, { mark, note, name: 'ROSA' })).toString('latin1');
  assert.match(placeholder, /\/Subtype \/FreeText \/Rect \[300 500 [\d.]+ [\d.]+\] \/Contents \(Approved \\\(with remarks\\\)\) \/T \(ROSA\)/);
  assert.match(placeholder, /\/F 196/);
  assert.equal((placeholder.match(/\/Annots \[/g) || []).length, 2);
  const v1 = await signPdf(v0, makeP12('ROSA ACCOUNTING', PNPKI), 'secret', { mark, note, name: 'ROSA' });
  const check = checkSignedVersion(v0, v1);
  assert.equal(check.ok, true, check.error);
  assert.equal(check.signatures[0].valid, true);
  wellFormed(v1);
  // Text only, with an invisible signature; then a second signature keeps the first valid.
  const v2 = await signPdf(v1, makeP12('JUAN DELA CRUZ', PNPKI), 'secret', { note: { ...note, page: 1 } });
  const check2 = checkSignedVersion(v1, v2);
  assert.equal(check2.ok, true, check2.error);
  assert.deepEqual(check2.signatures.map((s) => s.valid), [true, true]);
  wellFormed(v2);
});

test('QR code: decodes to the check page; stamped on an upload as an update, which can then be signed', async () => {
  const url = verifyUrl('AbCdEfGhIjKlMnOpQrSt', 'https://fts.mgocandoni.com');
  assert.equal(url, 'https://fts.mgocandoni.com/v/AbCdEfGhIjKlMnOpQrSt');
  // Draw the runs as an image (4 px a module, quiet zone of 4 modules) and read it back.
  const { n, runs } = qrRuns(url);
  const px = 4; const q = 4; const size = (n + q * 2) * px;
  const img = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const [r, c, len] of runs) {
    for (let y = (r + q) * px; y < (r + q + 1) * px; y++) {
      for (let x = (c + q) * px; x < (c + q + len) * px; x++) img.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
    }
  }
  assert.equal(jsQR(img, size, size)?.data, url);

  const v0 = unsignedPdf();
  const stamped = await addQrStamps(v0, qrAppearance(url, ['Scan to verify', 'DMS-2026-000001']));
  const text = Buffer.from(stamped).toString('latin1');
  assert.ok(Buffer.from(stamped.subarray(0, v0.length)).equals(Buffer.from(v0)), 'the original bytes stay as they are');
  assert.equal((text.match(/\/Subtype \/Stamp \/Name \/DMSVerify/g) || []).length, 2, 'one on each page');
  assert.match(text, /\(Scan to verify\) Tj ET\nBT \/F1 5.5 Tf [\d.]+ [\d.]+ Td \(DMS-2026-000001\) Tj/);
  const v1 = await signPdf(stamped, makeP12('JUAN DELA CRUZ', PNPKI), 'secret');
  const check = checkSignedVersion(stamped, v1);
  assert.equal(check.ok, true, check.error);
  assert.equal(check.signatures[0].valid, true);
});

test('public record: only what confirms the document, no amounts or data fields', () => {
  const d = {
    controlNo: 'DMS-2026-000007', typeCode: 'DV', typeName: 'Disbursement Voucher', title: 'NEIL P. PRIOLO', office: 'Municipal Engineering Office',
    status: 'complete', createdBy: 'u1', data: { amount: 10000, payee: 'NEIL P. PRIOLO' },
    refNos: { dvNo: { label: 'Disbursement No.', value: 'GF-2026-10-0001' }, dvDate: { label: 'Date', value: '2026-10-29', of: 'dvNo' } },
    pdf: { files: [{ kind: 'generated', sha256: 'aa', at: 't0' }, { kind: 'signed', sha256: 'bb', at: 't1', reason: 'Box A', signer: { name: 'JUAN', pnpki: true, signedAt: 't1' } }] },
    workflow: { state: 'in-progress', stage: 1, steps: [{ routedTo: '', action: 'Box A', sign: true }, { routedTo: 'Municipal Accounting Office', action: 'Box B' }], events: [] },
  };
  const r = checkRecord(d, 'now');
  assert.deepEqual(Object.keys(r).sort(), [...CHECK_KEYS].sort());
  assert.equal(r.now, 'Municipal Accounting Office');
  assert.deepEqual(r.steps.map((s) => [s.office, s.done, s.current]), [['Municipal Engineering Office', true, false], ['Municipal Accounting Office', false, true]]);
  assert.deepEqual(r.signatures, [{ name: 'JUAN', at: 't1', reason: 'Box A', pnpki: true }]);
  assert.deepEqual(r.versions.map((v) => v.sha256), ['aa', 'bb']);
  assert.deepEqual(r.refNos, ['Disbursement No. GF-2026-10-0001']);
  assert.ok(!JSON.stringify(r).includes('10000'));
});

test('reference no. stamped on its own, then signed; or with the signature', async () => {
  const lines = ['Disbursement No. GF-2026-10-0012', 'Date: Oct 30, 2026'];
  const box = noteBox(lines, 10);
  const ref = { page: 0, rect: [380, 760, 380 + box.w, 760 + box.h], lines, size: 10 };
  const v0 = unsignedPdf();
  const stamped = await addNotes(v0, [ref], { name: 'ROSA' });
  assert.ok(Buffer.from(stamped.subarray(0, v0.length)).equals(Buffer.from(v0)));
  assert.match(Buffer.from(stamped).toString('latin1'), /\/Subtype \/FreeText .*\/Contents \(Disbursement No\. GF-2026-10-0012 Date: Oct 30, 2026\)/);
  const v1 = await signPdf(stamped, makeP12('ROSA ACCOUNTING', PNPKI), 'secret');
  assert.equal(checkSignedVersion(stamped, v1).ok, true);
  // With the signature: the number and an added text in the same update.
  const v2 = await signPdf(v0, makeP12('ROSA ACCOUNTING', PNPKI), 'secret', { notes: [ref, { ...ref, page: 1, lines: ['Noted'] }] });
  const check = checkSignedVersion(v0, v2);
  assert.equal(check.ok, true, check.error);
  assert.equal((Buffer.from(v2).toString('latin1').match(/\/Subtype \/FreeText/g) || []).length, 2);
  wellFormed(v2);
});
