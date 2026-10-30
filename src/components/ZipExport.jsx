import { useState } from 'react';
import { getPdfBytes } from '../lib/api.js';

const iso = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local
const dateOf = (d) => (d.createdAt?.toDate ? d.createdAt.toDate() : d.createdAt ? new Date(d.createdAt) : null);
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// All Documents (admins and the Records Officer): download, as one ZIP, the current PDF of every
// document uploaded or prepared in a date range (and matching the page's filters), in a folder
// per document type, with an index of all of them (index.csv).
export default function ZipExport({ docs }) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  const inRange = docs.filter((d) => {
    const t = dateOf(d);
    if (!t) return false;
    const day = iso(t);
    return (!from || day >= from) && (!to || day <= to);
  });
  const withPdf = inRange.filter((d) => (d.pdf?.files || []).length);

  const download = async () => {
    setBusy('Preparing…'); setMsg(null);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const rows = [['Control No.', 'Type', 'Payee / Subject', 'Office', 'Prepared / uploaded by', 'Date', 'Status', 'File'].map(csv).join(',')];
      const failed = [];
      for (const [i, d] of inRange.entries()) {
        const current = (d.pdf?.files || []).at(-1);
        let file = '';
        if (current) {
          setBusy(`Adding ${i + 1} of ${inRange.length}: ${d.controlNo}`);
          try {
            file = `${safe(d.typeCode) || 'DOC'}/${safe(`${d.controlNo} ${d.title}`)}.pdf`;
            zip.file(file, await getPdfBytes(current.path));
          } catch (e) {
            failed.push(`${d.controlNo}: ${e.message}`);
            file = 'could not be added';
          }
        } else file = 'no PDF yet';
        rows.push([d.controlNo, d.typeCode, d.title, d.office, d.createdByName, dateOf(d)?.toLocaleString('en-PH') || '', d.status, file].map(csv).join(','));
      }
      zip.file('index.csv', `﻿${rows.join('\r\n')}\r\n`);
      setBusy('Making the ZIP…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `DMS documents ${from || 'start'} to ${to || 'today'}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setMsg({ ok: !failed.length, text: failed.length
        ? `Downloaded, but ${failed.length} PDF(s) could not be added: ${failed.join('; ')}`
        : `Downloaded ${withPdf.length} PDF(s)${inRange.length > withPdf.length ? `; ${inRange.length - withPdf.length} without a PDF yet are listed in index.csv only` : ''}.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy('');
    }
  };

  if (!open) return <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>Download ZIP</button>;
  return (
    <div className="card zip-export">
      <div className="card-head"><h3>Download documents (ZIP)</h3>
        <button type="button" className="btn-icon" title="Close" onClick={() => setOpen(false)}>×</button></div>
      <p className="small muted">The current PDF of every document uploaded or prepared in these dates, among those listed below (the search
        and filters apply), in a folder per type, with an index (index.csv).</p>
      <div className="row gap wrap zip-dates">
        <label className="field"><span className="field-label">From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span className="field-label">To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="small zip-count"><b>{inRange.length}</b> document{inRange.length === 1 ? '' : 's'} · <b>{withPdf.length}</b> with a PDF</div>
        <button type="button" className="btn btn-primary" disabled={!!busy || !inRange.length || (from && to && from > to)} onClick={download}>{busy || 'Download ZIP'}</button>
      </div>
      {from && to && from > to && <div className="alert small">The From date is after the To date.</div>}
      {msg && <div className={`alert small ${msg.ok ? 'alert-ok' : ''}`}>{msg.text}</div>}
    </div>
  );
}
