import { useEffect, useRef, useState } from 'react';

// Shows a PDF inside the page (no pop-up, no download): every page drawn with pdf.js, sized to
// the space it has. Used for the document's converted / signed PDF.
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

export default function PdfViewer({ bytes, signatures = [], title = '' }) {
  const host = useRef(null);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(0);

  // Redraw when the space changes (rotating a tablet, opening the menu).
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!bytes || !width) return undefined;
    let cancelled = false;
    let doc = null;
    (async () => {
      try {
        setError('');
        const lib = await loadPdfjs();
        // pdf.js takes over the buffer it is given: pass a copy.
        doc = await lib.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) return;
        setPages(doc.numPages);
        const box = host.current.querySelector('.pdf-pages');
        box.replaceChildren();
        const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = (width - 2) / base.width;
          const vp = page.getViewport({ scale: scale * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
          canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
          box.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
      } catch (e) {
        if (!cancelled) setError(`Could not show the PDF: ${e.message}`);
      }
    })();
    return () => { cancelled = true; doc?.destroy(); };
  }, [bytes, width]);

  return (
    <div className="pdf-viewer" ref={host}>
      <div className="pdf-viewer-head">
        <b>{title || 'PDF'}</b>
        <span className="small muted">{pages ? `${pages} page${pages > 1 ? 's' : ''}` : ''}</span>
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
      {error && <div className="alert">{error}</div>}
      {!bytes && !error && <div className="spinner" />}
      <div className="pdf-pages" />
    </div>
  );
}
