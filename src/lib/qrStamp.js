// The document's QR code on every page of an uploaded PDF, for PDFs the in-place stamp
// (signing.js addQrStamps) cannot handle: saved from Word or Excel, scanners, nested pages, rotated
// pages. The PDF is rewritten (pdf-lib), so this is only for PDFs that are not signed.
import { QR_MARGIN_MM, QR_MM, qrRuns } from './qr.js';

const MM = 72 / 25.4;

// Visual (as shown, after /Rotate) to page coordinates, for a box x, y, w, h.
function toPage(angle, { x, y, width, height }) {
  switch (((angle % 360) + 360) % 360) {
    case 90: return [0, 1, -1, 0, x + width, y];
    case 180: return [-1, 0, 0, -1, x + width, y + height];
    case 270: return [0, -1, 1, 0, x, y + height];
    default: return [1, 0, 0, 1, x, y];
  }
}

export async function stampQrAnyPdf(bytes, url, lines) {
  // Loaded only when a QR code is added (it is large).
  const { PDFDocument, PDFName, PDFString, StandardFonts, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { n, runs } = qrRuns(url);
  const size = QR_MM * MM;
  const margin = QR_MARGIN_MM * MM;
  const k = size / n;
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const box = page.getCropBox();
    const angle = page.getRotation().angle;
    const sideways = [90, 270].includes(((angle % 360) + 360) % 360);
    const vw = sideways ? box.height : box.width;
    // Whatever the page's own content leaves behind (a transform, a colour) does not move the code.
    page.node.wrapContentStreams(ctx.register(ctx.stream('q')), ctx.register(ctx.stream('Q')));
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...toPage(angle, box)));
    const x0 = vw - margin - size;
    const y0 = margin;
    page.drawRectangle({ x: x0 - 2, y: y0 - 2, width: size + 4, height: size + 4, color: rgb(1, 1, 1) });
    for (const [r, c, len] of runs) {
      page.drawRectangle({ x: x0 + c * k, y: y0 + size - (r + 1) * k, width: len * k + 0.02, height: k + 0.02, color: rgb(0, 0, 0) });
    }
    lines.forEach((l, i) => {
      const w = font.widthOfTextAtSize(l, 5.5);
      page.drawText(l, { x: x0 - 4 - w, y: y0 + (lines.length - 1 - i) * 6.8 + 1, size: 5.5, font, color: rgb(0.27, 0.27, 0.27) });
    });
    page.pushOperators(popGraphicsState());
  }
  // Marks the file as carrying its DMS code (looked for by hasDmsQr).
  doc.getInfoDict().set(PDFName.of('DMSQR'), PDFString.of(url));
  return doc.save({ useObjectStreams: false });
}

// Does this PDF already carry its DMS QR code (either way of stamping)?
export function hasDmsQr(bytes) {
  const text = new TextDecoder('latin1').decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return text.includes('/DMSVerify') || text.includes('/DMSQR');
}

// The QR code for an uploaded PDF, whatever kind it is: { bytes, stamped }.
// Not signed: on every page (rewritten with pdf-lib; the in-place stamp if that fails).
// Signed: in an update after the signatures (the signed bytes stay as they are; DMS's check of the
// signatures recognises that update as only its QR code), where the PDF allows it.
export async function withDmsQr(pdf, url, lines) {
  const [{ addQrStamps, readSignatures }, { qrAppearance }] = await Promise.all([import('./signing.js'), import('./qr.js')]);
  if (hasDmsQr(pdf)) return { bytes: pdf, stamped: true };
  const inPlace = async () => {
    try { const out = await addQrStamps(pdf, qrAppearance(url, lines)); return { bytes: out, stamped: out !== pdf }; } catch { return { bytes: pdf, stamped: false }; }
  };
  let signed = false;
  try { signed = readSignatures(pdf).length > 0; } catch { signed = false; }
  if (signed) return inPlace();
  try { return { bytes: await stampQrAnyPdf(pdf, url, lines), stamped: true }; } catch { return inPlace(); }
}
