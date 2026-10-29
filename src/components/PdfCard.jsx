import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BASIS_VERSION, addPdfVersion, checkStorage, documentBasis, getPdfBytes, getSavedCertificate, getSavedCertificateBytes, getSavedMark, startWorkflow,
} from '../lib/api.js';
import { checkSignedVersion, isValidAt, noteBox, readCertificate, readSignatures, signPdf, stampDate, wrapNote } from '../lib/signing.js';
import { markPixels } from '../lib/markImage.js';
import { certId, forgetPassword, rememberedPassword, rememberedStatus } from '../lib/rememberPassword.js';
import { documentPdf, pdfFileName } from './printables.jsx';

// Mark sizes in points (width, height): small fits a DV signature line.
const MARK_SIZES = { S: [110, 30], M: [150, 42], L: [200, 56] };
const MARK_LABELS = { S: 'Small', M: 'Medium', L: 'Large' };
// Font sizes (points) of text added with a signature.
const NOTE_SIZES = { S: 8, M: 10, L: 12 };

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
export default function PdfCard({ docData, type, settings, actor, canConvert, canSign, reason, onChanged, onLoaded, onView, placements = {}, onPlacing }) {
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
  const [password, setPassword] = useState('');
  const [why, setWhy] = useState(reason || '');
  // Registered once in My Profile: the user's certificate (null: none) and signature mark.
  const [saved, setSaved] = useState(undefined);
  // The signature mark: a picture of the signatory's signature, placed on the face of the PDF.
  const [mark, setMark] = useState(undefined); // PNG bytes (null: none yet)
  const [useMark, setUseMark] = useState(true);
  const [size, setSize] = useState('M');
  // Text the signatory adds anywhere on the PDF with their signature (e.g. "Approved for payment").
  const [addText, setAddText] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSize, setNoteSize] = useState('M');
  const [target, setTarget] = useState('mark'); // what a tap on the PDF places
  const placement = placements.mark;

  // Load the current PDF and check every signature in it.
  useEffect(() => {
    let live = true;
    setBytes(null); setSignatures(null);
    if (current) {
      // A version made in this page is already here: no need to download it again.
      (made.current[current.path] ? Promise.resolve(made.current[current.path]) : getPdfBytes(current.path))
        .then((b) => { if (live) { const s = readSignatures(b); setBytes(b); setSignatures(s); onLoaded?.({ bytes: b, signatures: s }); } })
        .catch((e) => live && setError(`Could not open the PDF: ${e.message}`));
    }
    // Only bases computed the current way are compared; older ones could differ in how, not what.
    documentBasis(docData).then((b) => live && setStale(docData.pdf?.basisV === BASIS_VERSION && Boolean(docData.pdf?.basis) && b !== docData.pdf.basis));
    return () => { live = false; };
  }, [current?.path, docData]);
  useEffect(() => setWhy(reason || ''), [reason]);
  useEffect(() => {
    if (mode === 'sign' && saved === undefined) getSavedCertificate(actor.uid).then(setSaved).catch((e) => { setSaved(null); setError(e.message); });
  }, [mode, saved, actor.uid]);
  useEffect(() => {
    if (mode === 'sign' && mark === undefined) getSavedMark(actor.uid).then(setMark).catch((e) => { setMark(null); setError(e.message); });
  }, [mode, mark, actor.uid]);
  const markUrl = useMemo(() => (mark ? URL.createObjectURL(new Blob([mark], { type: 'image/png' })) : ''), [mark]);
  const placingMark = mode === 'sign' && Boolean(mark) && useMark;
  // Reference nos. this office assigned at its step (e.g. the DV No.): shown on its signature.
  const wf = docData.workflow;
  const myRefs = Object.values(docData.refNos || {})
    .filter((r) => !r.of && wf?.state === 'in-progress' && r.stage === wf.stage && (!r.filled || /no\.?$/i.test(r.label)))
    .map((r) => `${r.label} ${r.value}`);
  // A password remembered on this device (My Profile): sign without typing it.
  const [remembered, setRemembered] = useState(null);
  const [typeIt, setTypeIt] = useState(false);
  useEffect(() => {
    if (mode === 'sign' && saved) rememberedStatus(actor.uid, certId(saved)).then(setRemembered);
  }, [mode, saved, actor.uid]);
  const useRemembered = Boolean(remembered) && !typeIt;
  const noteLines = useMemo(() => wrapNote(noteText), [noteText]);
  const placingText = mode === 'sign' && addText && noteLines.length > 0;
  const tapFor = placingMark && placingText ? target : placingMark ? 'mark' : 'text';
  // Ask the viewer to take taps for the mark and the text while signing with them.
  useEffect(() => {
    if (!placingMark && !placingText) { onPlacing?.(null); return; }
    const [w, h] = MARK_SIZES[size];
    const name = saved ? saved.name : 'Your name';
    const box = noteBox(noteLines, NOTE_SIZES[noteSize]);
    onPlacing?.({
      target: tapFor,
      items: {
        mark: placingMark ? { w, h, preview: markUrl, label: ['Digitally signed by', name, ...myRefs, stampDate()].join('\n'), hint: 'Tap the page where your signature mark goes (e.g. the Signature line of your box).' } : null,
        text: placingText ? { ...box, label: noteLines.join('\n'), size: NOTE_SIZES[noteSize], hint: 'Tap the page where your text goes.' } : null,
      },
    });
  }, [placingMark, placingText, tapFor, size, markUrl, saved, myRefs.join(), noteLines.join('\n'), noteSize]);

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
    if (!saved) throw new Error('Register your certificate in My Profile first.');
    const pw = useRemembered ? await rememberedPassword(actor.uid, certId(saved)) : password;
    if (!pw) throw new Error('Type your certificate password.');
    const key = await getSavedCertificateBytes(actor.uid);
    let cert;
    try {
      cert = readCertificate(key, pw);
    } catch (e) {
      // The remembered password no longer opens the certificate: forget it and ask.
      if (useRemembered) { await forgetPassword(actor.uid); setRemembered(null); throw new Error('Your remembered password no longer works. Type your certificate password.'); }
      throw e;
    }
    if (!isValidAt(cert)) throw new Error(`Your certificate is not valid today (valid ${when(cert.notBefore)} to ${when(cert.notAfter)}). Renew it with DICT.`);
    if (!cert.pnpki && !window.confirm(`This certificate was issued by "${cert.issuer}", not by the DICT PNPKI. Sign with it anyway?`)) return;
    if (placingMark && !placement) throw new Error('Tap the PDF where your signature mark goes, or untick "Place my signature mark".');
    if (placingText && !placements.text) throw new Error('Tap the PDF where your text goes, or untick "Add text on the PDF".');
    // The signature appears where the mark was placed; clicking it shows its certificate.
    const visible = placingMark
      ? { page: placement.page, rect: placement.rect, image: await markPixels(mark), lines: ['Digitally signed by', cert.name, ...myRefs, stampDate()] }
      : null;
    const note = placingText ? { page: placements.text.page, rect: placements.text.rect, lines: noteLines, size: NOTE_SIZES[noteSize] } : null;
    const out = await signPdf(bytes, key, pw, { reason: why.trim(), location: settings.lguName || 'Municipal Government of Candoni', name: cert.name, contactInfo: cert.email, mark: visible, note });
    const check = checkSignedVersion(bytes, out);
    if (!check.ok) throw new Error(check.error);
    made.current[(await addPdfVersion(docData.id, out, actor, { kind: 'signed', method: 'dms', onProgress: uploading, reason: why.trim(), note: note ? noteLines.join(' ') : '', signer: { ...signerOf(check.added.at(-1)), name: cert.name } })).path] = out;
    setPassword(''); setMode(''); setAddText(false); setNoteText('');
    onView?.();
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
                        {signedFiles[i]?.note && <div className="small">Added text: <i>{signedFiles[i].note}</i></div>}
                        <div className="small muted">Issued by {s.signer?.issuer || '—'}{s.signer?.email ? ` · ${s.signer.email}` : ''}</div>
                        {!s.valid && <div className="small sig-problem">{s.problem}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )
          )}

          <div className="row gap wrap">
            <button className="btn btn-ghost btn-sm" disabled={!bytes} onClick={() => onView?.()}>View PDF</button>
            <button className="btn btn-ghost btn-sm" disabled={!bytes} onClick={() => saveAs(bytes, pdfFileName(type, docData))}>Download PDF</button>
            {canSign && bytes && mode !== 'sign' && <button className="btn btn-primary btn-sm" onClick={() => setMode('sign')}>Sign with PNPKI</button>}
            {canSign && bytes && mode !== 'upload' && <button className="btn btn-ghost btn-sm" onClick={() => setMode('upload')}>Upload signed PDF</button>}
          </div>

          {canSign && mode && (
            <div className="sign-panel">
              <div className="field field-wide">
                <label className="field-label" htmlFor={`${id}-why`}>Reason (shown in the signature)</label>
                <input id={`${id}-why`} value={why} onChange={(e) => setWhy(e.target.value)} />
              </div>
              {mode === 'sign' && saved && (
                <div className="mark-box note-box">
                  <label className="check"><input type="checkbox" checked={addText} onChange={(e) => { setAddText(e.target.checked); if (e.target.checked) setTarget('text'); }} /> Add text on the PDF</label>
                  {addText && (
                    <>
                      <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={300}
                        aria-label="Text to add on the PDF" />
                      <div className="row gap wrap small">
                        Size:
                        {Object.keys(NOTE_SIZES).map((k) => (
                          <button key={k} type="button" className={`chip${noteSize === k ? ' active' : ''}`} onClick={() => setNoteSize(k)}>{MARK_LABELS[k]}</button>
                        ))}
                      </div>
                      {placingText && (
                        <p className={`small ${placements.text ? 'muted' : 'mark-todo'}`}>{placements.text
                          ? `Placed on page ${placements.text.page + 1}.${tapFor === 'text' ? ' Tap the PDF again to move it.' : ''}`
                          : 'Tap the PDF where the text goes: any part of the page, apart from your signature mark.'}</p>
                      )}
                      <p className="xs muted">Added with your digital signature: it is part of what you sign, and cannot be changed afterwards.</p>
                    </>
                  )}
                </div>
              )}
              {mode === 'sign' && placingMark && placingText && (
                <div className="row gap wrap small place-target">
                  Tapping the PDF places:
                  <button type="button" className={`chip${tapFor === 'mark' ? ' active' : ''}`} onClick={() => setTarget('mark')}>Signature mark</button>
                  <button type="button" className={`chip${tapFor === 'text' ? ' active' : ''}`} onClick={() => setTarget('text')}>Text</button>
                </div>
              )}
              {mode === 'sign' ? (
                saved === undefined || mark === undefined ? <div className="spinner" /> : !saved ? (
                  <div className="alert-info small">To sign in DMS, register your PNPKI certificate once in <Link to="/profile">My Profile</Link>.
                    Or use <b>Upload signed PDF</b> to sign it in Adobe Acrobat.</div>
                ) : (
                <>
                  <div className="saved-cert">
                    <div><b>{saved.name}</b> {saved.pnpki && <span className="badge badge-green">DICT PNPKI</span>}</div>
                    <div className="small muted">Your registered certificate{saved.notAfter ? ` · valid until ${when(saved.notAfter)}` : ''}
                      {' · '}<Link to="/profile">Change in My Profile</Link></div>
                  </div>
                  <div className="mark-box">
                    <div className="field-label">Signature mark on the PDF</div>
                    {mark ? (
                      <>
                        <div className="row gap wrap mark-row">
                          <img className="mark-preview" src={markUrl} alt="Your signature mark" />
                          <label className="check"><input type="checkbox" checked={useMark} onChange={(e) => setUseMark(e.target.checked)} /> Place my signature mark</label>
                        </div>
                        {useMark && (
                          <>
                            <div className="row gap wrap small">
                              Size:
                              {Object.keys(MARK_SIZES).map((k) => (
                                <button key={k} type="button" className={`chip${size === k ? ' active' : ''}`} onClick={() => setSize(k)}>{MARK_LABELS[k]}</button>
                              ))}
                            </div>
                            <p className={`small ${placement ? 'muted' : 'mark-todo'}`}>{placement
                              ? `Placed on page ${placement.page + 1}.${tapFor === 'mark' ? ' Tap the PDF again to move it.' : ''}`
                              : 'Tap the PDF where your mark goes, e.g. the Signature line of your box.'}</p>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="small muted">No signature mark yet: the signature is added without one.
                        {' '}<Link to="/profile">Add your signature mark in My Profile</Link>.</p>
                    )}
                  </div>
                  {useRemembered ? (
                    <p className="small muted">Your password is remembered on this device until {when(remembered.until)}.
                      {' '}<button type="button" className="link" onClick={() => setTypeIt(true)}>Type it instead</button></p>
                  ) : (
                    <div className="field field-wide">
                      <label className="field-label" htmlFor={`${id}-pw`}>Certificate password</label>
                      <input id={`${id}-pw`} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && signHere()} />
                    </div>
                  )}
                  <div className="row gap">
                    <button className="btn btn-primary" disabled={!!busy || (!useRemembered && !password) || (placingMark && !placement) || (placingText && !placements.text) || (addText && !noteLines.length)} onClick={signHere}>{busy || 'Sign PDF'}</button>
                    <button className="btn btn-ghost" onClick={() => { setMode(''); setPassword(''); }}>Cancel</button>
                  </div>
                </>
                )
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
                  {f.kind === 'generated' ? 'Converted' : f.kind === 'uploaded' ? 'Uploaded' : `Signed${f.signer?.name ? ` by ${f.signer.name}` : ''}${f.method === 'upload' ? ' (uploaded)' : ''}`}
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
