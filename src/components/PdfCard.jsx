import { useEffect, useId, useRef, useState } from 'react';
import { addPdfVersion, checkStorage, documentBasis, getPdfBytes, startWorkflow } from '../lib/api.js';
import { checkSignedVersion, isValidAt, readCertificate, readSignatures, signPdf } from '../lib/signing.js';
import { documentPdf, pdfFileName } from './printables.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const readFile = (file) => file.arrayBuffer().then((b) => new Uint8Array(b));

function saveAs(bytes, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// The document as a PDF and its digital signatures (DICT PNPKI). The preparer converts the
// finished document to PDF; then each signatory, while the document is in their office, signs
// it in DMS with their certificate file, or signs it in Adobe Acrobat and uploads it back.
// Every version is kept; the newest is the current PDF.
export default function PdfCard({ docData, type, settings, actor, canConvert, canSign, reason, onChanged }) {
  const id = useId();
  const files = docData.pdf?.files || [];
  const current = files.at(-1);
  const signedFiles = files.filter((f) => f.kind === 'signed');
  const [bytes, setBytes] = useState(null);
  const made = useRef({}); // path -> bytes of versions made in this page
  const [signatures, setSignatures] = useState(null);
  const [stale, setStale] = useState(false);
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [p12, setP12] = useState(null);
  const [password, setPassword] = useState('');
  const [why, setWhy] = useState(reason || '');

  // Load the current PDF and check every signature in it.
  useEffect(() => {
    let live = true;
    setBytes(null); setSignatures(null);
    if (current) {
      // A version made in this page is already here: no need to download it again.
      (made.current[current.path] ? Promise.resolve(made.current[current.path]) : getPdfBytes(current.path))
        .then((b) => { if (live) { setBytes(b); setSignatures(readSignatures(b)); } })
        .catch((e) => live && setError(`Could not open the PDF: ${e.message}`));
    }
    documentBasis(docData).then((b) => live && setStale(Boolean(docData.pdf?.basis) && b !== docData.pdf.basis));
    return () => { live = false; };
  }, [current?.path, docData]);
  useEffect(() => setWhy(reason || ''), [reason]);

  const signed = (signatures || []).length > 0 || files.some((f) => f.kind === 'signed');
  const run = async (label, fn) => {
    setBusy(label); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const uploading = (p) => setBusy(`Saving… ${Math.round(p * 100)}%`);
  const convert = () => run('Checking file storage…', async () => {
    await checkStorage(docData.id); // fails in seconds if Storage is not set up, before drawing
    const blob = await documentPdf(type, docData, settings, setBusy);
    const pdf = new Uint8Array(await blob.arrayBuffer());
    uploading(0);
    const file = await addPdfVersion(docData.id, pdf, actor, { kind: 'generated', basis: await documentBasis(docData), onProgress: uploading });
    made.current[file.path] = pdf;
    // The PDF now follows the document's route (Administration > Workflow).
    if (!docData.workflow) await startWorkflow(docData.id, type, actor, settings.offices || []);
    setNotice(docData.workflow ? 'Converted to PDF again.' : 'Converted to PDF. It now follows its workflow: sign it if your office signs, then release it to the next office.');
    onChanged();
  });

  const signHere = () => run('Signing…', async () => {
    if (!p12) throw new Error('Choose your certificate file (.p12 or .pfx).');
    const key = await readFile(p12);
    const cert = readCertificate(key, password);
    if (!isValidAt(cert)) throw new Error(`Your certificate is not valid today (valid ${when(cert.notBefore)} to ${when(cert.notAfter)}). Renew it with DICT.`);
    if (!cert.pnpki && !window.confirm(`This certificate was issued by "${cert.issuer}", not by the DICT PNPKI. Sign with it anyway?`)) return;
    const out = await signPdf(bytes, key, password, { reason: why.trim(), location: settings.lguName || 'Municipal Government of Candoni', name: cert.name, contactInfo: cert.email });
    const check = checkSignedVersion(bytes, out);
    if (!check.ok) throw new Error(check.error);
    made.current[(await addPdfVersion(docData.id, out, actor, { kind: 'signed', method: 'dms', onProgress: uploading, reason: why.trim(), signer: { ...signerOf(check.added.at(-1)), name: cert.name } })).path] = out;
    setP12(null); setPassword(''); setMode('');
    setNotice(`Signed by ${cert.name}.`);
    onChanged();
  });

  const upload = (file) => run('Checking…', async () => {
    if (!file) return;
    const out = await readFile(file);
    const check = checkSignedVersion(bytes, out);
    if (!check.ok) throw new Error(check.error);
    const last = check.added.at(-1);
    made.current[(await addPdfVersion(docData.id, out, actor, { kind: 'signed', method: 'upload', onProgress: uploading, reason: why.trim(), signer: signerOf(last) })).path] = out;
    setMode('');
    setNotice(`Signature of ${last.signer?.name || 'the signatory'} checked and saved.`);
    onChanged();
  });

  const open = () => window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank', 'noopener');

  return (
    <section className="card pdf-card">
      <div className="card-head">
        <h3>PDF and digital signatures</h3>
        {current && <span className={`badge ${signed ? 'badge-green' : 'badge-blue'}`}>{signed ? `${(signatures || []).length || ''} signed`.trim() : 'Not signed yet'}</span>}
      </div>
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {!current && (
        <>
          <p className="small muted">When the document is final, convert it to PDF. The signatories then sign the PDF with their
            DICT PNPKI digital signature as it moves through their offices.</p>
          {canConvert
            ? <button className="btn btn-primary" disabled={!!busy} onClick={convert}>{busy || 'Convert to PDF'}</button>
            : <p className="small muted">{docData.status === 'draft' ? 'Mark the document complete first.' : 'The preparer converts it to PDF.'}</p>}
        </>
      )}

      {current && (
        <>
          {stale && !signed && (
            <div className="alert-info small">The document was changed after it was converted.
              {canConvert && <> <button className="link" disabled={!!busy} onClick={convert}>Convert again</button></>}</div>
          )}
          {stale && signed && <div className="alert-info small">The document was changed after it was signed. The signed PDF shows it as it was signed.</div>}

          {!signatures && !error && <div className="spinner" />}
          {signatures && (
            signatures.length === 0
              ? <p className="small muted">No signature yet.</p>
              : (
                <ol className="sig-list">
                  {signatures.map((s, i) => (
                    <li key={i} className={s.valid ? 'sig-ok' : 'sig-bad'}>
                      <span className="sig-mark">{s.valid ? '✓' : '✗'}</span>
                      <div>
                        <b>{s.signer?.name || 'Unknown signer'}</b>
                        {s.signer && (s.signer.pnpki
                          ? <span className="badge badge-green">DICT PNPKI</span>
                          : <span className="badge badge-yellow" title={s.signer.issuer}>Not PNPKI</span>)}
                        <div className="small muted">
                          {[s.signedAt && when(s.signedAt), signedFiles[i]?.reason].filter(Boolean).join(' · ')}
                        </div>
                        <div className="small muted">Issued by {s.signer?.issuer || '—'}{s.signer?.email ? ` · ${s.signer.email}` : ''}</div>
                        {!s.valid && <div className="small sig-problem">{s.problem}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )
          )}

          <div className="row gap wrap">
            <button className="btn btn-ghost btn-sm" disabled={!bytes} onClick={open}>Open PDF</button>
            <button className="btn btn-ghost btn-sm" disabled={!bytes} onClick={() => saveAs(bytes, pdfFileName(type, docData))}>Download PDF</button>
            {canSign && bytes && mode !== 'sign' && <button className="btn btn-primary btn-sm" onClick={() => setMode('sign')}>Sign with PNPKI</button>}
            {canSign && bytes && mode !== 'upload' && <button className="btn btn-ghost btn-sm" onClick={() => setMode('upload')}>Upload signed PDF</button>}
          </div>

          {canSign && mode && (
            <div className="sign-panel">
              <div className="field field-wide">
                <label className="field-label" htmlFor={`${id}-why`}>Reason (shown in the signature)</label>
                <input id={`${id}-why`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Box A: Certified" />
              </div>
              {mode === 'sign' ? (
                <>
                  <p className="small muted">Your certificate file and password stay on this computer: DMS signs here, in your browser,
                    and uploads only the signed PDF.</p>
                  <div className="field field-wide">
                    <label className="field-label" htmlFor={`${id}-p12`}>Your PNPKI certificate file (.p12 or .pfx)</label>
                    <input id={`${id}-p12`} type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setP12(e.target.files[0] || null)} />
                  </div>
                  <div className="field field-wide">
                    <label className="field-label" htmlFor={`${id}-pw`}>Certificate password</label>
                    <input id={`${id}-pw`} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && signHere()} />
                  </div>
                  <div className="row gap">
                    <button className="btn btn-primary" disabled={!!busy || !p12} onClick={signHere}>{busy || 'Sign PDF'}</button>
                    <button className="btn btn-ghost" onClick={() => { setMode(''); setPassword(''); }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <ol className="small steps-mini">
                    <li><button className="link" onClick={() => saveAs(bytes, pdfFileName(type, docData))}>Download the current PDF</button>.</li>
                    <li>Open it in Adobe Acrobat (or Foxit) and sign it with your PNPKI certificate. Change nothing else.</li>
                    <li>Upload the signed PDF here. DMS checks that it is this PDF with your signature added.</li>
                  </ol>
                  <div className="field field-wide">
                    <label className="field-label" htmlFor={`${id}-up`}>Signed PDF</label>
                    <input id={`${id}-up`} type="file" accept="application/pdf,.pdf" disabled={!!busy} onChange={(e) => upload(e.target.files[0])} />
                  </div>
                  {busy && <div className="small muted">{busy}</div>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setMode('')}>Cancel</button>
                </>
              )}
            </div>
          )}

          <details className="small pdf-versions">
            <summary>Versions ({files.length})</summary>
            <ol>
              {files.map((f, i) => (
                <li key={f.path}>
                  {f.kind === 'generated' ? 'Converted' : `Signed${f.signer?.name ? ` by ${f.signer.name}` : ''}${f.method === 'upload' ? ' (uploaded)' : ''}`}
                  {' · '}{f.by} · {when(f.at)}{i === files.length - 1 ? ' · current' : ''}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}

const signerOf = (s) => (s?.signer ? {
  name: s.signer.name, email: s.signer.email, issuer: s.signer.issuer, pnpki: s.signer.pnpki, serial: s.signer.serial, signedAt: s.signedAt,
} : null);
