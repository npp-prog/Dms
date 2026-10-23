// Paper sizes in millimetres. "Folio" is Philippine long bond paper, 8.5 x 13 in
// ("Long" is kept as an older name for it).
export const PAPER_SIZES = {
  A4: { label: 'A4', w: 210, h: 297 },
  Folio: { label: 'Folio (8.5 × 13 in)', w: 215.9, h: 330.2 },
  Letter: { label: 'Letter', w: 215.9, h: 279.4 },
  Legal: { label: 'Legal', w: 215.9, h: 355.6 },
};

export const PRINT_MARGIN_MM = 10;

export function pageSize(paperSize, orientation) {
  const key = paperSize === 'Long' ? 'Folio' : (PAPER_SIZES[paperSize] ? paperSize : 'A4');
  const { w, h } = PAPER_SIZES[key];
  const landscape = orientation === 'landscape';
  const [pw, ph] = landscape ? [h, w] : [w, h];
  return { key, w: pw, h: ph, css: `${pw}mm ${ph}mm` };
}

// Scale that makes content fit the printable area of one page.
// heightAt(widthMm) returns the content height (mm) when laid out at that width;
// the content is laid out wider by 1/scale so that, once scaled, it fills the width.
export function fitScale(heightAt, printableW, printableH, minScale = 0) {
  let s = 1;
  for (let i = 0; i < 5; i++) {
    const next = Math.min(1, printableH / heightAt(printableW / s));
    if (Math.abs(next - s) < 0.002) { s = next; break; }
    s = next;
  }
  // A hair of slack so rounding never pushes a fitted page onto a second sheet.
  return Math.max(minScale, s < 1 ? s * 0.995 : 1);
}
