// A picture (photo or scan) as a one-page A4 PDF.
export async function imageToPdf(file) {
  const [{ jsPDF }, bmp] = await Promise.all([import('jspdf'), createImageBitmap(file)]);
  const c = document.createElement('canvas');
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const landscape = c.width > c.height;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  const pw = landscape ? 297 : 210;
  const ph = landscape ? 210 : 297;
  const s = Math.min((pw - 20) / c.width, (ph - 20) / c.height);
  pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', (pw - c.width * s) / 2, (ph - c.height * s) / 2, c.width * s, c.height * s);
  return new Uint8Array(pdf.output('arraybuffer'));
}

