import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getDocument, getTypeForDocument } from '../lib/api.js';
import { acceptsDocument, effectiveChecklist, itemTypeCode } from '../lib/checklists.js';
import { fileBase, fundCode, cleanPart, ftsNo, uniqueNamer } from '../lib/naming.js';
import { pageSize } from '../lib/paper.js';
import DocumentPreview from './DocumentPreview.jsx';
import ChecklistSheet from './ChecklistSheet.jsx';
import { linkText, safeUrl } from './DocLinks.jsx';

// "Download all": one ZIP with the document (e.g. the DV), its checklist and every document
// linked to the checklist, each as a PDF named Fund_Payee_Checklist No._Type_FTS No.
// (GF_NEIL P. PRIOLO_02_OBR_FTS000003.pdf). Links to other systems (PIM, CBO, ...) cannot be
// downloaded from here; they are included as internet shortcuts with the same naming.

const frames = (n) => new Promise((resolve) => {
  const step = (i) => (i ? requestAnimationFrame(() => step(i - 1)) : resolve());
  step(n);
});

// Lays out a printable page off screen exactly as it prints, then draws it to a PDF.
async function renderPdf(element, paperSize, orientation) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;background:#fff;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(element);
    await frames(2);
    await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null
      : new Promise((r) => { img.onload = r; img.onerror = r; }))));
    await document.fonts?.ready;
    await frames(3);
    const paper = host.querySelector('.paper');
    const fit = host.querySelector('.fit');
    paper.style.transform = 'none';
    // The canvas renderer does not support CSS zoom (used to fit the page): use a transform.
    const zoom = parseFloat(fit.style.zoom || '1');
    if (zoom !== 1) {
      const h = fit.offsetHeight;
      fit.style.zoom = '';
      fit.style.transformOrigin = 'top left';
      fit.style.transform = `scale(${zoom})`;
      fit.style.height = `${(fit.offsetHeight || h) * zoom}px`;
    }
    const canvas = await html2canvas(paper, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const page = pageSize(paperSize, orientation);
    const pdf = new jsPDF({ unit: 'mm', format: [page.w, page.h], orientation: page.w > page.h ? 'landscape' : 'portrait' });
    const pageHpx = Math.round(canvas.width * (page.h / page.w));
    const orient = page.w > page.h ? 'landscape' : 'portrait';
    // A little taller than one page (the canvas renderer lays text out slightly taller than the
    // browser's print): shrink it onto one page rather than spill a sliver onto a second.
    if (canvas.height <= pageHpx * 1.15) {
      const k = Math.min(1, pageHpx / canvas.height);
      const w = page.w * k;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (page.w - w) / 2, 0, w, (canvas.height / canvas.width) * w);
      return pdf.output('blob');
    }
    const pages = Math.ceil(canvas.height / pageHpx - 0.02);
    for (let i = 0; i < pages; i++) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = pageHpx;
      const ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, i * pageHpx, canvas.width, pageHpx, 0, 0, canvas.width, pageHpx);
      if (i) pdf.addPage([page.w, page.h], orient);
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, page.w, page.h);
    }
    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}

const documentElement = (type, d, settings) => (
  <DocumentPreview type={type} data={d.data || {}} checklist={d.checklist || {}} settings={settings}
    signatories={d.signatories} controlNo={d.controlNo} preparedBy={d.createdByName} />
);

export default function BulkDownload({ docData, type, settings }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const name = uniqueNamer();
      const data = docData.data || {};
      const base = { fund: data.fund, subject: data.payee || docData.title };
      const checklist = effectiveChecklist(type, docData.transaction);
      const items = checklist?.items || [];
      const index = [`${docData.typeName} ${docData.controlNo}`, `Payee/Subject: ${base.subject || ''}`, `Fund: ${data.fund || ''}`, ''];
      const jobs = [];

      // The document itself, numbered as its own item on the checklist (e.g. 01 Disbursement Voucher).
      const ownNo = items.findIndex((i) => acceptsDocument(i, { typeCode: docData.typeCode, typeName: docData.typeName })) + 1;
      jobs.push({ label: docData.controlNo, run: async () => ({
        file: name(fileBase({ ...base, number: ownNo, type: docData.typeCode, ref: ftsNo(docData.controlNo) }), 'pdf'),
        blob: await renderPdf(documentElement(type, docData, settings), type.paperSize, type.orientation),
      }) });
      if (items.length) {
        jobs.push({ label: 'checklist', run: async () => ({
          file: name(fileBase({ ...base, number: 0, type: `CHECKLIST ${checklist.code}`, ref: ftsNo(docData.controlNo) }), 'pdf'),
          blob: await renderPdf(<ChecklistSheet checklist={checklist} state={docData.checklist} data={data}
            additional={docData.additionalDocs || []} links={docData.links || {}} settings={settings} />, 'A4', 'portrait'),
        }) });
      }
      // Every document linked to the checklist.
      items.forEach((item, i) => {
        for (const link of docData.links?.[item.id] || []) {
          if (link.kind === 'fts') {
            jobs.push({ label: link.controlNo, run: async () => {
              const linked = await getDocument(link.id);
              if (!linked) throw new Error('not found');
              const linkedType = await getTypeForDocument(linked);
              return {
                file: name(fileBase({ ...base, number: i + 1, type: linked.typeCode, ref: ftsNo(linked.controlNo) }), 'pdf'),
                blob: await renderPdf(documentElement(linkedType, linked, settings), linkedType.paperSize, linkedType.orientation),
              };
            } });
          } else if (safeUrl(link.url)) {
            jobs.push({ label: linkText(link), run: async () => ({
              file: name(fileBase({ ...base, number: i + 1, type: itemTypeCode(item), ref: `${link.system} ${link.ref || ''}` }), 'url'),
              blob: new Blob([`[InternetShortcut]\r\nURL=${safeUrl(link.url)}\r\n`], { type: 'text/plain' }),
            }) });
          } else {
            index.push(`Not downloadable (reference only): ${String(i + 1).padStart(2, '0')} ${item.label} - ${linkText(link)}`);
          }
        }
      });

      const files = [];
      for (const [n, job] of jobs.entries()) {
        setStatus(`Preparing ${n + 1} of ${jobs.length}: ${job.label}`);
        try {
          const { file, blob } = await job.run();
          zip.file(file, blob);
          files.push(file);
        } catch (e) {
          index.push(`Not included: ${job.label} (${e.code === 'permission-denied' ? 'you have no access to it' : e.message})`);
        }
      }
      if ((docData.additionalDocs || []).length) {
        index.push('', 'Additional documents (not in FTS):', ...docData.additionalDocs.map((t, i) => `  ${items.length + i + 1}. ${t}`));
      }
      zip.file('00_INDEX.txt', [...index.slice(0, 4), 'Files:', ...files.map((f) => `  ${f}`), ...index.slice(4)].join('\r\n'));
      setStatus('Zipping…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${fundCode(data.fund)}_${cleanPart(base.subject) || 'NO PAYEE'}_${ftsNo(docData.controlNo)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setStatus(`Downloaded ${files.length} file(s).`);
    } catch (e) {
      setStatus(`Download failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn btn-ghost" disabled={busy} onClick={run}
        title="The document, its checklist and every linked document as PDFs in one ZIP">
        {busy ? 'Preparing…' : 'Download all (ZIP)'}
      </button>
      {status && <span className="small muted bulk-status">{status}</span>}
    </>
  );
}
