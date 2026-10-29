// Digital signatures on a document's PDF with a DICT PNPKI certificate (.p12/.pfx).
//
// Signing happens on the signatory's computer: the certificate file and its password are read
// in the browser and never sent anywhere. Each signature is added as an incremental update
// (appended to the file), so the signatures already on the PDF stay valid, the same way Adobe
// Acrobat adds a second signature. The same functions check PDFs signed in Acrobat and uploaded.
//
// Pure functions on bytes (Uint8Array), usable in the browser and in Node (tests).
import { Buffer } from 'buffer';
import forge from 'node-forge';

// The browser's Buffer (the 'buffer' package) treats buf.lastIndexOf(value, 'utf8') as a search
// starting at offset 0, where Node reads 'utf8' as the encoding and searches from the end.
// @signpdf relies on Node's reading (to find the end of the PDF catalog); without this, the
// signature field is written outside the catalog and PDF readers do not see the signature.
export function fixBufferLastIndexOf(B) {
  const original = B.prototype.lastIndexOf;
  if (original.dmsFixed) return;
  const fixed = function lastIndexOf(value, byteOffset, encoding) {
    if (typeof byteOffset === 'string') return original.call(this, value, undefined, byteOffset);
    return original.call(this, value, byteOffset, encoding);
  };
  fixed.dmsFixed = true;
  B.prototype.lastIndexOf = fixed;
}

// The @signpdf packages expect Node's global Buffer.
async function signpdfLibs() {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  fixBufferLastIndexOf(globalThis.Buffer);
  const [{ plainAddPlaceholder }, { P12Signer }, signpdf] = await Promise.all([
    import('@signpdf/placeholder-plain'), import('@signpdf/signer-p12'), import('@signpdf/signpdf'),
  ]);
  const SignPdf = signpdf.SignPdf || signpdf.default?.SignPdf;
  return { plainAddPlaceholder, P12Signer, signpdf: new SignPdf() };
}

const OID = {
  sha1: '1.3.14.3.2.26', sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
  messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5',
};
const DIGESTS = { [OID.sha1]: 'sha1', [OID.sha256]: 'sha256', [OID.sha384]: 'sha384', [OID.sha512]: 'sha512' };

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const attr = (dn, name) => dn.getField(name)?.value || '';

// Who a certificate belongs to and who issued it.
export function certInfo(cert) {
  const email = attr(cert.subject, 'E') || attr(cert.subject, 'emailAddress')
    || (cert.getExtension('subjectAltName')?.altNames || []).find((n) => n.type === 1)?.value || '';
  const issuer = attr(cert.issuer, 'CN') || attr(cert.issuer, 'O');
  const issuerOrg = attr(cert.issuer, 'O');
  return {
    name: attr(cert.subject, 'CN'),
    email,
    org: attr(cert.subject, 'O'),
    issuer,
    issuerOrg,
    serial: cert.serialNumber,
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: cert.validity.notAfter.toISOString(),
    // Certificates of the Philippine National PKI, issued by the DICT.
    pnpki: /pnpki|philippine national|information and communications technology|\bDICT\b/i.test(`${issuer} ${issuerOrg}`),
  };
}

export function isValidAt(info, at = new Date()) {
  return new Date(info.notBefore) <= at && at <= new Date(info.notAfter);
}

// Opens a .p12/.pfx file with its password. Throws a readable error for a wrong password.
export function readCertificate(p12Bytes, password) {
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(latin1(p12Bytes)), password);
  } catch (e) {
    throw new Error(/MAC|password|Invalid/i.test(e.message) ? 'Wrong password for this certificate file.' : 'This is not a .p12/.pfx certificate file.');
  }
  const keys = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean);
  if (!keys.length || !certs.length) throw new Error('The certificate file has no private key. Use the .p12/.pfx file DICT issued to you.');
  // The signer's certificate is the one matching the private key; the others are the CA chain.
  const key = keys[0].key;
  const own = certs.find((c) => c.publicKey.n && key.n && c.publicKey.n.equals(key.n)) || certs[0];
  return certInfo(own);
}

// Adds a signature to the PDF. Returns the signed PDF (the original bytes plus an update).
export async function signPdf(pdfBytes, p12Bytes, password, { reason = '', location = '', name = '', contactInfo = '' } = {}) {
  const { plainAddPlaceholder, P12Signer, signpdf } = await signpdfLibs();
  const B = globalThis.Buffer; // the Buffer @signpdf checks against
  let withPlaceholder;
  try {
    withPlaceholder = plainAddPlaceholder({
      pdfBuffer: B.from(pdfBytes), reason, location, name, contactInfo,
      signatureLength: 16384, appName: 'Candoni.DMS', // a PDF name: no spaces
    });
  } catch (e) {
    throw new Error(`DMS cannot add a signature to this PDF (${e.message}). Download it and sign it in Adobe Acrobat instead.`);
  }
  let signer;
  try {
    signer = new P12Signer(B.from(p12Bytes), { passphrase: password });
    const signed = await signpdf.sign(withPlaceholder, signer);
    return new Uint8Array(signed);
  } catch (e) {
    if (/MAC|password|Invalid/i.test(e.message)) throw new Error('Wrong password for this certificate file.');
    throw e;
  }
}

function digestOf(algo, bytes, ranges) {
  const md = forge.md[algo].create();
  for (const [start, len] of ranges) md.update(latin1(bytes.subarray(start, start + len)));
  return md.digest().bytes();
}

// Checks one CMS (PKCS#7) signature over the given byte ranges.
// 'verified': each certificate up to a self-signed root was issued by the next one;
// 'partial': verified as far as the certificates included go; 'broken': a link does not verify.
function chainOf(cert, certs) {
  if (!cert) return { status: 'broken', names: [] };
  const names = [];
  let cur = cert;
  for (let i = 0; i < 6; i++) {
    names.push(attr(cur.subject, 'CN') || attr(cur.subject, 'O'));
    if (cur.isIssuer(cur)) {
      try { return cur.verify(cur) ? { status: 'verified', names } : { status: 'broken', names }; } catch { return { status: 'broken', names }; }
    }
    // (forge: child.isIssuer(parent) is true when parent issued child)
    const issuer = certs.find((c) => c !== cur && cur.isIssuer(c));
    if (!issuer) return { status: 'partial', names: [...names, attr(cur.issuer, 'CN') || attr(cur.issuer, 'O')] };
    try { if (!issuer.verify(cur)) return { status: 'broken', names }; } catch { return { status: 'broken', names }; }
    cur = issuer;
  }
  return { status: 'partial', names };
}

function checkCms(bytes, der, ranges) {
  const asn1 = forge.asn1.fromDer(der, { parseAllBytes: false, strict: false });
  const p7 = forge.pkcs7.messageFromAsn1(asn1);
  const cap = p7.rawCapture;
  const algo = DIGESTS[forge.asn1.derToOid(cap.digestAlgorithm)];
  const serial = forge.util.bytesToHex(cap.serial || '').replace(/^0+/, '');
  const signerCert = p7.certificates.find((c) => c.serialNumber.replace(/^0+/, '') === serial) || p7.certificates[0];
  const out = { signer: signerCert ? certInfo(signerCert) : null, signedAt: '', intact: false, valid: false, problem: '' };
  if (!algo) { out.problem = 'Unsupported digest algorithm.'; return out; }
  const attrs = cap.authenticatedAttributes || [];
  let expected = null;
  for (const a of attrs) {
    const oid = forge.asn1.derToOid(a.value[0].value);
    const val = a.value[1].value[0];
    if (oid === OID.messageDigest) expected = val.value;
    if (oid === OID.signingTime) {
      try { out.signedAt = (val.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(val.value) : forge.asn1.generalizedTimeToDate(val.value)).toISOString(); } catch { /* ignore */ }
    }
  }
  const actual = digestOf(algo, bytes, ranges);
  if (!attrs.length) {
    out.problem = 'Signature without signed attributes (not supported).';
    return out;
  }
  out.intact = expected === actual;
  if (!out.intact) { out.problem = 'The document was changed after this signature.'; return out; }
  // The signature is over the DER of the signed attributes as a SET.
  const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
  const md = forge.md[algo].create();
  md.update(forge.asn1.toDer(set).getBytes());
  try {
    out.valid = Boolean(signerCert) && signerCert.publicKey.verify(md.digest().bytes(), cap.signature);
  } catch {
    out.valid = false;
  }
  if (!out.valid) out.problem = 'The signature does not match the certificate.';
  // The certificate chain inside the signature: is the signer's certificate really issued by the
  // CA certificate that came with it? (Trust in the root itself is up to the PDF reader.)
  out.chain = chainOf(signerCert, p7.certificates);
  out.certValidWhenSigned = Boolean(out.signer) && isValidAt(out.signer, out.signedAt ? new Date(out.signedAt) : new Date());
  return out;
}

// Every signature in a PDF, oldest first: who signed, when, and whether it is intact.
export function readSignatures(pdfBytes) {
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const text = latin1(bytes);
  const found = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m;
  while ((m = re.exec(text))) {
    const [a, b, c, d] = m.slice(1).map(Number);
    if (a !== 0 || c + d > bytes.length || a + b >= c) continue;
    const hex = text.slice(a + b, c).replace(/[<>\s]/g, '');
    if (!/^[0-9a-f]+$/i.test(hex) || /^0+$/.test(hex)) continue;
    const sig = { byteRange: [a, b, c, d], coversWholeFile: c + d === bytes.length, signedUpTo: c + d };
    try {
      Object.assign(sig, checkCms(bytes, forge.util.hexToBytes(hex), [[a, b], [c, d]]));
    } catch (e) {
      Object.assign(sig, { signer: null, intact: false, valid: false, problem: `Unreadable signature (${e.message}).` });
    }
    found.push(sig);
  }
  return found.sort((x, y) => x.signedUpTo - y.signedUpTo);
}

const trimEnd = (bytes) => {
  let n = bytes.length;
  while (n && (bytes[n - 1] === 0x0a || bytes[n - 1] === 0x0d)) n -= 1;
  return bytes.subarray(0, n);
};

// Checks a signed PDF against the version it was made from (signed in DMS, or in Acrobat and
// uploaded): it must be the same file with signatures added, every signature intact, and the
// newest signature covering the whole file.
export function checkSignedVersion(previousBytes, signedBytes) {
  const prev = trimEnd(previousBytes);
  const next = signedBytes instanceof Uint8Array ? signedBytes : new Uint8Array(signedBytes);
  if (next.length <= prev.length || !Buffer.from(next.subarray(0, prev.length)).equals(Buffer.from(prev))) {
    return { ok: false, error: 'This is not the current PDF of the document with a signature added. Download the current PDF, sign it without changing anything else, and upload it again.' };
  }
  const before = readSignatures(previousBytes).length;
  const signatures = readSignatures(next);
  if (signatures.length <= before) return { ok: false, error: 'No new digital signature was found in this PDF.' };
  const bad = signatures.find((s) => !s.valid);
  if (bad) return { ok: false, error: `A signature is not valid${bad.signer ? ` (${bad.signer.name})` : ''}: ${bad.problem}` };
  if (!signatures.at(-1).coversWholeFile) return { ok: false, error: 'Something was added to the PDF after the last signature.' };
  return { ok: true, signatures, added: signatures.slice(before) };
}

// ---------- The signature mark on the face of the PDF ----------
// A signatory's mark (their handwritten signature as an image) with "Digitally signed by ..."
// and the date, drawn where they placed it (e.g. Box A). It is added as a locked stamp in an
// incremental update just before their digital signature, so that signature covers it and the
// signatures already on the PDF stay valid.

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Text for a PDF string in WinAnsi (Helvetica): escape, and replace what it cannot show.
const pdfText = (s) => String(s).normalize('NFC').replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([\\()])/g, '\\$1');
const num = (n) => (Math.round(n * 100) / 100).toString();

// The date as signatures show it: 2026.10.29 15:11:05 +08'00'
export function stampDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`;
}

// image: { width, height, rgb (width*height*3 bytes), alpha (width*height bytes, optional) }
// rect: [x1, y1, x2, y2] in PDF points on page `page` (0 = first page); lines: text under/next to it.
export async function addSignatureMark(pdfBytes, { page = 0, rect, image, lines = [] }) {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  fixBufferLastIndexOf(globalThis.Buffer);
  const B = globalThis.Buffer;
  // CommonJS modules: Node and the bundler expose their default export differently.
  const def = (m) => (typeof m.default === 'function' ? m.default : m.default?.default);
  const [readPdf, findObject, getPagesDictionaryRef] = (await Promise.all([
    import('@signpdf/placeholder-plain/dist/readPdf.js'), import('@signpdf/placeholder-plain/dist/findObject.js'),
    import('@signpdf/placeholder-plain/dist/getPagesDictionaryRef.js'),
  ])).map(def);
  const pdf = B.from(pdfBytes);
  let info;
  try {
    info = readPdf(pdf);
  } catch (e) {
    throw new Error(`DMS cannot add your signature mark to this PDF (${e.message}). Sign without the mark, or in Adobe Acrobat.`);
  }
  const kids = findObject(pdf, info.xref, getPagesDictionaryRef(info)).toString().match(/\/Kids\s*\[([^\]]*)\]/)?.[1].match(/\d+\s+\d+\s+R/g) || [];
  const pageRef = kids[page];
  if (!pageRef) throw new Error('That page is not in the PDF.');
  const pageDict = findObject(pdf, info.xref, pageRef).toString();
  if (/\/Annots\s+\d+\s+\d+\s+R/.test(pageDict)) throw new Error('DMS cannot place a mark on this page. Sign without the mark, or in Adobe Acrobat.');
  const pageIndex = Number(pageRef.split(/\s+/)[0]);

  const [x1, y1, x2, y2] = rect;
  const w = x2 - x1;
  const h = y2 - y1;
  let next = info.xref.maxIndex + 1;
  const ids = { img: next++, smask: image.alpha ? next++ : null, form: next++, annot: next++ };

  // Layout: a wide box puts the mark on the left and the text on the right (as Acrobat does);
  // otherwise the mark on top and the text below.
  const wide = w / h >= 2.2;
  const textLines = lines.filter(Boolean);
  // Font size: the lines fit the height they have and (Helvetica ~0.55 em per character) the width.
  const longest = Math.max(1, ...textLines.map((l) => l.length));
  const fs = Math.max(3.5, Math.min(8, (wide ? h : h * 0.36) / (textLines.length * 1.25 || 1), ((wide ? w * 0.5 : w) - 2) / (longest * 0.55)));
  const area = wide ? { x: 0, y: 0, w: w * 0.48, h } : { x: 0, y: textLines.length * fs * 1.25, w, h: h - textLines.length * fs * 1.25 };
  const k = Math.min(area.w / image.width, area.h / image.height);
  const iw = image.width * k;
  const ih = image.height * k;
  const ix = area.x + (area.w - iw) / 2;
  const iy = area.y + (area.h - ih) / 2;
  const tx = wide ? w * 0.5 : 1;
  const top = wide ? (h + textLines.length * fs * 1.25) / 2 - fs : textLines.length * fs * 1.25 - fs;
  const text = textLines.map((l, i) => `BT /F1 ${num(fs)} Tf ${num(tx)} ${num(top - i * fs * 1.25)} Td (${pdfText(l)}) Tj ET`).join('\n');
  const content = `q ${num(iw)} 0 0 ${num(ih)} ${num(ix)} ${num(iy)} cm /Im1 Do Q\n0 0 0.35 rg\n${text}\n`;

  const chunks = [B.from('\n')];
  let at = pdf.length + 1;
  const offsets = [];
  const put = (id, head, stream) => {
    offsets.push([id, at]);
    const parts = stream
      ? [B.from(`${id} 0 obj\n${head}\nstream\n`, 'latin1'), B.from(stream), B.from('\nendstream\nendobj\n')]
      : [B.from(`${id} 0 obj\n${head}\nendobj\n`, 'latin1')];
    for (const p of parts) { chunks.push(p); at += p.length; }
  };
  const rgb = await deflate(image.rgb);
  put(ids.img, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${ids.smask ? ` /SMask ${ids.smask} 0 R` : ''} /Length ${rgb.length} >>`, rgb);
  if (ids.smask) {
    const a = await deflate(image.alpha);
    put(ids.smask, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${a.length} >>`, a);
  }
  const body = B.from(content, 'latin1');
  put(ids.form, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${num(w)} ${num(h)}] /Resources << /XObject << /Im1 ${ids.img} 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >> >> /Length ${body.length} >>`, body);
  // Flags 4 + 128 + 512: printed, locked, contents locked.
  put(ids.annot, `<< /Type /Annot /Subtype /Stamp /Name /DMSSignatureMark /Rect [${[x1, y1, x2, y2].map(num).join(' ')}] /F 644 /P ${pageRef} /AP << /N ${ids.form} 0 R >> /Contents (${pdfText(textLines.join(' '))}) >>`);
  const annots = /\/Annots\s*\[/.test(pageDict)
    ? pageDict.replace(/\/Annots\s*\[([^\]]*)\]/, (_, refs) => `/Annots [${refs.trim()} ${ids.annot} 0 R]`)
    : `${pageDict}\n/Annots [${ids.annot} 0 R]`;
  put(pageIndex, `<<\n${annots.trim()}\n>>`);

  const xrefAt = at;
  const rows = offsets.sort((a, b) => a[0] - b[0]).map(([id, off]) => `${id} 1\n${String(off).padStart(10, '0')} 00000 n \n`).join('');
  chunks.push(B.from(`xref\n0 1\n0000000000 65535 f \n${rows}trailer\n<<\n/Size ${next}\n/Root ${info.rootRef}\n${info.infoRef ? `/Info ${info.infoRef}\n` : ''}/Prev ${info.xRefPosition}\n>>\nstartxref\n${xrefAt}\n%%EOF\n`, 'latin1'));
  return new Uint8Array(B.concat([pdf, ...chunks]));
}

// Everything a reader needs to trust a signed PDF: every signature checked, and whether anything
// was added after the last one. Runs in the browser; the file is not sent anywhere.
export function verifyPdf(pdfBytes) {
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const signatures = readSignatures(bytes);
  const last = signatures.at(-1);
  // A few bytes after the last signature (line ends) are not a change.
  const tail = last ? latin1(bytes.subarray(last.signedUpTo)).trim() : '';
  return {
    signatures,
    allValid: signatures.length > 0 && signatures.every((x) => x.valid),
    changedAfterLast: Boolean(last) && tail.length > 0,
  };
}
