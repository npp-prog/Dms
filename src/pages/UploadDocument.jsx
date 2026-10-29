import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { addPdfVersion, createUploadedDocument, deleteDocument, getDocument, listDocumentTypes, setDocumentStatus, startWorkflow } from '../lib/api.js';
import Select from '../components/Select.jsx';
import { addQrStamps, readSignatures } from '../lib/signing.js';
import { qrAppearance, verifyUrl } from '../lib/qr.js';

// A document that is not prepared in DMS but already exists as a file: a scanned OBR, a letter,
// a PDF made in another system. It gets a DMS control number, its file becomes its PDF (a photo
// or scan is turned into one), and it follows the route of its type like a prepared document.
const OTHER = { id: '', code: 'DOC', name: 'Other document', fields: [], steps: [], processing: [], template: '' };
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const size = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// A picture (photo or scan) as a one-page A4 PDF.
async function imageToPdf(file) {
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

export default function UploadDocument() {
  const { actor, settings } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const [types, setTypes] = useState(null);
  const [typeId, setTypeId] = useState('');
  const [form, setForm] = useState({ title: '', fund: '', notes: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  useEffect(() => { listDocumentTypes({ activeOnly: true }).then(setTypes).catch((e) => setError(e.message)); }, []);
  const type = (types || []).find((t) => t.id === typeId) || OTHER;
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'notes' ? e.target.value : e.target.value.toUpperCase() });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (!file) throw new Error('Choose the file to upload.');
      if (!ACCEPT.split(',').includes(file.type)) throw new Error('Upload a PDF, or a photo or scan (JPG or PNG).');
      if (file.size > 25 * 1024 * 1024) throw new Error('The file is larger than 25 MB.');
      if (!form.title.trim()) throw new Error('Type the payee or subject.');
      setBusy('Preparing the PDF…');
      const pdf = file.type === 'application/pdf' ? new Uint8Array(await file.arrayBuffer()) : await imageToPdf(file);
      if (file.type === 'application/pdf' && !/^%PDF-/.test(new TextDecoder('latin1').decode(pdf.subarray(0, 5)))) throw new Error('This file is not a PDF.');
      setBusy('Saving…');
      // A draft until its file is stored: if the upload fails, the draft is removed again.
      const created = await createUploadedDocument(type, { ...form, title: form.title.trim(), fileName: file.name }, actor);
      // The QR code of its public check page on every page, unless the PDF is already signed
      // (anything added after a signature shows as a change to it).
      let stamped = pdf;
      try {
        if (!readSignatures(pdf).length) stamped = await addQrStamps(pdf, qrAppearance(verifyUrl(created.id), ['Scan to verify', created.controlNo]));
      } catch { stamped = pdf; }
      try {
        await addPdfVersion(created.id, stamped, actor, { kind: 'uploaded', onProgress: (x) => setBusy(`Uploading… ${Math.round(x * 100)}%`) });
      } catch (err) {
        await deleteDocument(created.id).catch(() => {});
        throw err;
      }
      await setDocumentStatus(created.id, 'complete', actor, (await getDocument(created.id))?.history || [], {}, file.name);
      // It follows its route (Administration > Workflow) at once, like a document converted to PDF.
      if ((type.route || type.processing || []).length) await startWorkflow(created.id, type, actor, settings.offices || []);
      navigate(`/documents/${created.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/documents">Documents</Link> / Upload</div>
          <h1>Upload a document</h1>
          <p className="muted">For a document that already exists as a file: a scanned or signed form, a letter, a PDF from another system.
            It gets a DMS control number, follows the workflow of its type, and can be signed, forwarded and linked like a prepared document.</p>
        </div>
      </div>
      <form className="card upload-form" onSubmit={submit}>
        <div className="field upload-wide">
          <label className="field-label" htmlFor={`${id}-t`}>Document type</label>
          <Select id={`${id}-t`} value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={!types}>
            <option value="">Other document (no workflow)</option>
            {(types || []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}{t.uploadOnly ? ' (upload only)' : ''}</option>)}
          </Select>
          <span className="small muted">{type.id
            ? 'It follows the workflow set for this type in Administration → Workflow.'
            : 'Kept in DMS with a control number; it is not routed.'}</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-s`}>Payee / Subject</label>
          <input id={`${id}-s`} className="caps" value={form.title} onChange={set('title')} placeholder="e.g. NEIL P. PRIOLO" required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-f`}>Fund <span className="muted">(optional)</span></label>
          <input id={`${id}-f`} className="caps" value={form.fund} onChange={set('fund')} placeholder="e.g. GENERAL FUND" />
        </div>
        <div className="field upload-wide">
          <label className="field-label" htmlFor={`${id}-n`}>Notes <span className="muted">(optional)</span></label>
          <input id={`${id}-n`} value={form.notes} onChange={set('notes')} placeholder="e.g. Signed copy from the Budget Office" />
        </div>

        <div className="field upload-wide">
          <span className="field-label">File</span>
          {file ? (
            <div className="file-chosen">
              <span className="file-icon"><Icon name="doc" /></span>
              <div className="file-meta">
                <b>{file.name}</b>
                <span className="small muted">{file.type === 'application/pdf' ? 'PDF' : 'Picture: becomes a PDF'} · {size(file.size)}</span>
              </div>
              <label className="btn btn-ghost btn-sm">
                Change
                <input type="file" hidden accept={ACCEPT} onChange={(e) => e.target.files[0] && setFile(e.target.files[0])} />
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>Remove</button>
            </div>
          ) : (
            <label className={`drop-zone${drag ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}>
              <input id={`${id}-file`} type="file" hidden accept={ACCEPT} onChange={(e) => setFile(e.target.files[0] || null)} />
              <span className="drop-icon"><Icon name="new" /></span>
              <b>Choose a file</b>
              <span className="small muted">or drop it here · PDF, or a photo or scan (JPG, PNG) · up to 25 MB</span>
            </label>
          )}
          <span className="small muted">A PDF signed elsewhere keeps its signatures; DMS shows and checks them.</span>
        </div>

        {error && <div className="alert upload-wide">{error}</div>}
        <div className="upload-actions upload-wide">
          <Link className="btn btn-ghost" to="/documents">Cancel</Link>
          <button className="btn btn-primary" disabled={!!busy || !file}>{busy || 'Upload document'}</button>
        </div>
      </form>
    </div>
  );
}

