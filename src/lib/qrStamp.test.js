import { test } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { jsPDF } from 'jspdf';
import { PDFDocument, degrees } from 'pdf-lib';
import { hasDmsQr, withDmsQr } from './qrStamp.js';
import { signPdf, verifyPdf } from './signing.js';

const URL = 'https://dms.mgocandoni.com/v/abc123';
const LINES = ['Scan to verify', 'DMS-2026-000123'];

function p12For(cn) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 864e5);
  const dn = [{ name: 'commonName', value: cn }];
  cert.setSubject(dn); cert.setIssuer(dn); cert.sign(keys.privateKey, forge.md.sha256.create());
  return new Uint8Array(Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'secret', { algorithm: '3des' })).getBytes(), 'binary'));
}

test('QR code on any unsigned PDF: compressed (Word-like), rotated pages, every page', async () => {
  const src = await PDFDocument.create();
  for (let i = 0; i < 3; i++) src.addPage([595, 842]);
  src.getPages()[1].setRotation(degrees(90));
  const word = await src.save(); // object streams: the in-place stamp cannot read it
  assert.equal(hasDmsQr(word), false);
  const { bytes, stamped } = await withDmsQr(word, URL, LINES);
  assert.equal(stamped, true);
  assert.equal(hasDmsQr(bytes), true);
  const out = await PDFDocument.load(bytes);
  assert.equal(out.getPageCount(), 3);
  // Stamping twice adds nothing.
  assert.equal((await withDmsQr(bytes, URL, LINES)).bytes, bytes);
});

test('QR code on a signed PDF: added after the signature, which stays valid; real changes still show', async () => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.text('LETTER', 20, 20); pdf.addPage(); pdf.text('PAGE 2', 20, 20);
  const signed = await signPdf(new Uint8Array(pdf.output('arraybuffer')), p12For('ANA REYES'), 'secret');
  const { bytes, stamped } = await withDmsQr(signed, URL, LINES);
  assert.equal(stamped, true);
  assert.deepEqual(bytes.subarray(0, signed.length), signed); // the signed bytes are untouched
  const v = verifyPdf(bytes);
  assert.equal(v.allValid, true);
  assert.equal(v.changedAfterLast, false);
  assert.equal(v.qrAdded, true);
  // Anything else added after the signature is still reported.
  const tampered = new Uint8Array(Buffer.concat([Buffer.from(bytes), Buffer.from('\n99 0 obj\n<< /Evil true >>\nendobj\n')]));
  assert.equal(verifyPdf(tampered).changedAfterLast, true);
  // A page whose content was swapped along with the stamp is not "only the QR code" either.
  const text = Buffer.from(bytes).toString('latin1');
  const swapped = text.replace(/(\n\d+ 0 obj\n<<\n[^]*?\/Contents )(\d+)( 0 R[^]*?\/Annots)/, (m, a, n, b) => `${a}${Number(n) + 1}${b}`);
  assert.notEqual(swapped, text);
  assert.equal(verifyPdf(new Uint8Array(Buffer.from(swapped, 'latin1'))).changedAfterLast, true);
});
