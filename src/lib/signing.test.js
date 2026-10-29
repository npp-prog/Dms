import { test } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { jsPDF } from 'jspdf';
import { Buffer as BrowserBuffer } from 'buffer/index.js';
import { checkSignedVersion, fixBufferLastIndexOf, readCertificate, readSignatures, signPdf } from './signing.js';

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
