// The QR code on every PDF DMS makes: it opens the document's public check page (/v/<id>), where
// anyone, signed in or not, sees DMS's record of the document and can check a copy against it.
import QRCode from 'qrcode';

export const QR_MM = 12; // printed size of the code
export const QR_MARGIN_MM = 3; // from the right and bottom edges of the page
// Space kept free at the bottom of a converted page for the code (the page is drawn this much
// smaller, a little over 2%), so it never covers the form.
export const QR_RESERVE_MM = 7;
const MM = 72 / 25.4; // points per mm

export const verifyUrl = (docId, origin = globalThis.location?.origin || 'https://fts.mgocandoni.com') => `${origin}/v/${docId}`;

// The dark modules of the code, as horizontal runs [row, col, length] (fewer shapes to draw).
export function qrRuns(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const runs = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n;) {
      if (!modules.get(r, c)) { c++; continue; }
      let e = c;
      while (e < n && modules.get(r, e)) e++;
      runs.push([r, c, e - c]);
      c = e;
    }
  }
  return { n, runs };
}

// Draws the code in the bottom right corner of a jsPDF page (units: mm), with its caption
// ("Scan to verify" and the control no.) to its left.
export function drawQr(pdf, text, lines, pageW, pageH) {
  const { n, runs } = qrRuns(text);
  const x0 = pageW - QR_MARGIN_MM - QR_MM;
  const y0 = pageH - QR_MARGIN_MM - QR_MM;
  const k = QR_MM / n;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x0 - 1, y0 - 1, QR_MM + 2, QR_MM + 2, 'F');
  pdf.setFillColor(0, 0, 0);
  for (const [r, c, len] of runs) pdf.rect(x0 + c * k, y0 + r * k, len * k + 0.01, k + 0.01, 'F');
  pdf.setFontSize(5.5);
  pdf.setTextColor(70, 70, 70);
  lines.forEach((l, i) => pdf.text(l, x0 - 1.6, y0 + QR_MM - (lines.length - 1 - i) * 2.4 - 0.3, { align: 'right' }));
}

// The same, as a PDF appearance stream (points) for the pages of an uploaded PDF: { w, h, ops,
// margin } to draw in a box of w x h, margin from the right and bottom edges.
export function qrAppearance(text, lines) {
  const { n, runs } = qrRuns(text);
  const size = QR_MM * MM;
  const fs = 5.5;
  const capW = Math.max(...lines.map((l) => l.length)) * fs * 0.5 + 6;
  const pad = 2;
  const w = capW + size + pad * 2;
  const h = size + pad * 2;
  const k = size / n;
  const f = (v) => (Math.round(v * 100) / 100).toString();
  const qx = capW + pad;
  const top = h - pad; // PDF y grows upwards
  const esc = (s) => s.replace(/([\\()])/g, '\\$1');
  const ops = [
    '1 1 1 rg', `${f(qx - pad)} 0 ${f(size + pad * 2)} ${f(h)} re f`, '0 0 0 rg',
    ...runs.map(([r, c, len]) => `${f(qx + c * k)} ${f(top - (r + 1) * k)} ${f(len * k + 0.02)} ${f(k + 0.02)} re f`),
    '0.27 0.27 0.27 rg',
    ...lines.map((l, i) => `BT /F1 ${fs} Tf ${f(capW - 4 - l.length * fs * 0.5)} ${f(pad + (lines.length - 1 - i) * 6.8 + 1)} Td (${esc(l)}) Tj ET`),
  ];
  return { w, h, ops: `${ops.join('\n')}\n`, margin: QR_MARGIN_MM * MM - pad };
}
