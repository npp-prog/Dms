import { useEffect, useRef, useState } from 'react';

// Shows a PDF inside the page (no pop-up, no download): every page drawn with pdf.js, sized to
// the space it has. While a signatory places their signature mark, tapping a page puts the mark
// there (onPlace gets the page and the rectangle in PDF points).
let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/build/pdf.min.mjs'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  return pdfjs;
}

export default function PdfViewer({ bytes, signatures = [], title = '', placing = null, mark = null, onPlace }) {
  const host = useRef(null);
  const canvases = useRef([]);
  const [doc, setDoc] = useState(null);
  const [sizes, setSizes] = useState([]); // page sizes in points
  const [error, setError] = useState('');
  const [width, setWidth] = useState(0);

  // Redraw when the space changes (rotating a tablet, opening the menu).
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth - 2 * 10)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!bytes) return undefined;
    let cancelled = false;
    let loaded = null;
    (async () => {
      try {
        setError('');
        const lib = await loadPdfjs();
        // pdf.js takes over the buffer it is given: pass a copy.
        loaded = await lib.getDocument({ data: bytes.slice() }).promise;
        const list = [];
        for (let n = 1; n <= loaded.numPages; n++) {
          const vp = (await loaded.getPage(n)).getViewport({ scale: 1 });
          list.push({ w: vp.width, h: vp.height });
        }
        if (!cancelled) { setDoc(loaded); setSizes(list); }
      } catch (e) {
        if (!cancelled) setError(`Could not show the PDF: ${e.message}`);
      }
    })();
    return () => { cancelled = true; loaded?.destroy(); };
  }, [bytes]);

  useEffect(() => {
    if (!doc || !width) return undefined;
    let cancelled = false;
    (async () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const canvas = canvases.current[n - 1];
        if (!canvas) continue;
        const page = await doc.getPage(n);
        const scale = width / page.getViewport({ scale: 1 }).width;
        const vp = page.getViewport({ scale: scale * ratio });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      }
    })().catch((e) => !cancelled && setError(`Could not show the PDF: ${e.message}`));
    return () => { cancelled = true; };
  }, [doc, width, sizes]);

  // Tap: the mark centred where tapped, kept inside the page.
  const place = (i, e) => {
    if (!placing || !onPlace) return;
    const box = e.currentTarget.getBoundingClientRect();
    const k = sizes[i].w / box.width; // points per pixel
    const x = (e.clientX - box.left) * k;
    const y = sizes[i].h - (e.clientY - box.top) * k;
    const x1 = Math.min(Math.max(0, x - placing.w / 2), sizes[i].w - placing.w);
    const y1 = Math.min(Math.max(0, y - placing.h / 2), sizes[i].h - placing.h);
    onPlace({ page: i, rect: [x1, y1, x1 + placing.w, y1 + placing.h] });
  };

  return (
    <div className={`pdf-viewer${placing ? ' placing' : ''}`} ref={host}>
      <div className="pdf-viewer-head">
        <b>{title || 'PDF'}</b>
        <span className="small muted">{sizes.length ? `${sizes.length} page${sizes.length > 1 ? 's' : ''}` : ''}</span>
        {signatures.length > 0 && (
          <span className="pdf-viewer-sigs">
            {signatures.map((s, i) => (
              <span key={i} className={`badge ${s.valid ? 'badge-green' : 'badge-red'}`} title={s.valid ? 'Signature valid' : s.problem}>
                {s.valid ? '✓' : '✗'} {s.signer?.name || 'Unknown signer'}
              </span>
            ))}
          </span>
        )}
      </div>
      {placing && <div className="pdf-place-hint">Tap the page where your signature mark goes (e.g. the Signature line of your box).</div>}
      {error && <div className="alert">{error}</div>}
      {!sizes.length && !error && <div className="spinner" />}
      <div className="pdf-pages">
        {sizes.map((s, i) => (
          <div key={i} className="pdf-page" style={{ aspectRatio: `${s.w} / ${s.h}` }} onClick={(e) => place(i, e)}>
            <canvas ref={(el) => { canvases.current[i] = el; }} aria-label={`Page ${i + 1} of ${sizes.length}`} />
            {mark && mark.page === i && (
              <div className="pdf-mark" style={{
                left: `${(mark.rect[0] / s.w) * 100}%`,
                bottom: `${(mark.rect[1] / s.h) * 100}%`,
                width: `${((mark.rect[2] - mark.rect[0]) / s.w) * 100}%`,
                height: `${((mark.rect[3] - mark.rect[1]) / s.h) * 100}%`,
              }}>
                {mark.preview && <img src={mark.preview} alt="" />}
                <span>{mark.label}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
