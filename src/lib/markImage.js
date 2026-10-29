// Prepares a signature mark (a photo or scan of a handwritten signature) in the browser:
// trimmed to the ink, at most 600 px wide, with a transparent background (a white or light
// background is made transparent), saved as PNG. Also gives the raw pixels addSignatureMark needs.

const MAX_W = 600;

async function bitmapOf(blob) {
  if (globalThis.createImageBitmap) return createImageBitmap(blob);
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

// A user's file (PNG or JPG) -> a clean PNG mark (Uint8Array).
export async function prepareMark(file) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Choose a PNG or JPG picture of your signature.');
  const bmp = await bitmapOf(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  // Light pixels (the paper) become transparent; find the ink's bounding box.
  let minX = c.width; let minY = c.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum > 200) d[i + 3] = 0;
      else if (lum > 150) d[i + 3] = Math.round(d[i + 3] * (200 - lum) / 50);
      if (d[i + 3] > 40) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('No signature found in the picture. Use dark ink on white paper, or a PNG with a transparent background.');
  ctx.putImageData(px, 0, 0);
  const pad = 4;
  const sx = Math.max(0, minX - pad); const sy = Math.max(0, minY - pad);
  const sw = Math.min(c.width, maxX + pad + 1) - sx; const sh = Math.min(c.height, maxY + pad + 1) - sy;
  const k = Math.min(1, MAX_W / sw);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * k));
  out.height = Math.max(1, Math.round(sh * k));
  out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// A PNG mark -> { width, height, rgb, alpha } for addSignatureMark.
export async function markPixels(pngBytes) {
  const bmp = await bitmapOf(new Blob([pngBytes], { type: 'image/png' }));
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const n = c.width * c.height;
  const rgb = new Uint8Array(n * 3);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2];
    alpha[i] = d[i * 4 + 3];
  }
  return { width: c.width, height: c.height, rgb, alpha };
}
