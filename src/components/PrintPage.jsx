import { useEffect, useRef } from 'react';
import { PRINT_MARGIN_MM, fitScale, pageSize } from '../lib/paper.js';

const PX_PER_MM = 96 / 25.4;

// A printable page. On screen it shows the sheet at its real size; when printing,
// the content is scaled to fit one page ("fit to page"). Content that would need to
// shrink below minScale is printed at minScale over several pages instead.
export default function PrintPage({ paperSize, orientation, minScale = 0.5, children }) {
  const ref = useRef(null);
  const page = pageSize(paperSize, orientation);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const printableW = page.w - 2 * PRINT_MARGIN_MM;
    const printableH = page.h - 2 * PRINT_MARGIN_MM;
    const fit = () => {
      el.style.zoom = '';
      const heightAt = (widthMm) => {
        el.style.width = `${widthMm}mm`;
        return el.scrollHeight / PX_PER_MM;
      };
      const s = fitScale(heightAt, printableW, printableH, minScale);
      el.style.width = `${printableW / s}mm`;
      el.style.zoom = String(s);
    };
    const reset = () => { el.style.zoom = ''; el.style.width = ''; };
    const media = window.matchMedia('print');
    const onMedia = (e) => (e.matches ? fit() : reset());
    window.addEventListener('beforeprint', fit);
    window.addEventListener('afterprint', reset);
    media.addEventListener?.('change', onMedia);
    return () => {
      window.removeEventListener('beforeprint', fit);
      window.removeEventListener('afterprint', reset);
      media.removeEventListener?.('change', onMedia);
    };
  }, [page.w, page.h, minScale]);

  return (
    <div className="print-area">
      <style>{`@media print { @page { size: ${page.css}; margin: ${PRINT_MARGIN_MM}mm; } }`}</style>
      <div className="paper" style={{ width: `${page.w}mm`, minHeight: `${page.h}mm`, padding: `${PRINT_MARGIN_MM}mm` }}>
        <div ref={ref} className="fit">{children}</div>
      </div>
    </div>
  );
}
