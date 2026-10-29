import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { deleteDocument, getDocument, getTypeForDocument, saveAccountingEntries, saveDocumentLinks, getFileBytes, getPdfBytes, uploadAttachment, fillStepFields, addStepFile, forwardDocument, setDocumentStatus, startWorkflow, workflowAction } from '../lib/api.js';
import { canAct, editableByPreparer, officeOf } from '../lib/workflow.js';
import { effectiveChecklist, isChecked, itemTypeCode, missingRequired } from '../lib/checklists.js';
import AccountingPanel from '../components/AccountingPanel.jsx';
import BulkDownload from '../components/BulkDownload.jsx';
import ChecklistSheet from '../components/ChecklistSheet.jsx';
import { LinkEditor, LinkList, linkText } from '../components/DocLinks.jsx';
import DocumentPreview from '../components/DocumentPreview.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ProcessingGuide from '../components/ProcessingGuide.jsx';
import WorkflowCard from '../components/WorkflowCard.jsx';
import PdfCard from '../components/PdfCard.jsx';
import SendPanel from '../components/SendPanel.jsx';
import { pdfFileName } from '../components/printables.jsx';
import PdfViewer from '../components/PdfViewer.jsx';
import { readSignatures } from '../lib/signing.js';

function downloadBytes(bytes, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Links of one checklist item on a saved document; the preparer and admins can add or remove them.
// Under a checklist item: its linked and uploaded documents, and (for the preparer) link or upload.
function ItemLinks({ item, links, canEdit, docId, actor, onChange, onOpen }) {
  const [open, setOpen] = useState(false);
  const [upload, setUpload] = useState('');
  const [error, setError] = useState('');
  const add = async (file) => {
    if (!file) return;
    setError(''); setUpload('Uploading… 0%');
    try {
      const l = await uploadAttachment(docId, item.id, file, actor, (x) => setUpload(`Uploading… ${Math.round(x * 100)}%`));
      await onChange([...links, l], linkText(l));
    } catch (e) {
      setError(e.message);
    } finally {
      setUpload('');
    }
  };
  return (
    <>
      <LinkList links={links} onOpen={onOpen && ((l, i) => onOpen(l, `${item.id}:${i}`))} onRemove={canEdit ? (i) => onChange(links.filter((_, j) => j !== i), `removed ${linkText(links[i])}`) : undefined} />
      {error && <div className="alert small">{error}</div>}
      {canEdit && (open
        ? <LinkEditor item={item} excludeId={docId} onCancel={() => setOpen(false)} onAdd={(l) => { setOpen(false); onChange([...links, l], linkText(l)); }} />
        : (
          <div className="item-actions no-print">
            <button type="button" className="link small" onClick={() => setOpen(true)}>+ Link document</button>
            {upload ? <span className="small muted">{upload}</span> : (
              <label className="link small">
                + Upload file
                <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { add(e.target.files[0]); e.target.value = ''; }} />
              </label>
            )}
          </div>
        ))}
    </>
  );
}

// An uploaded file shown in the page: a PDF page by page, a picture as it is.
function FileView({ file, bytes }) {
  const url = useMemo(() => (bytes && !/pdf/.test(file.type) ? URL.createObjectURL(new Blob([bytes], { type: file.type })) : ''), [bytes, file.type]);
  if (!bytes) return <div className="spinner" />;
  if (/pdf/.test(file.type)) return <PdfViewer bytes={bytes} signatures={readSignatures(bytes)} title={file.name} />;
  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-head"><b>{file.name}</b></div>
      <img className="file-image" src={url} alt={file.name} />
    </div>
  );
}

export default function DocumentView() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const { actor, settings, isAdmin, isHead, user, profile } = useAuth();
  const [docData, setDocData] = useState(null);
  const [type, setType] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('document');
  // An uploaded supporting document shown in the main area.
  const [fileView, setFileView] = useState(null);
  // A linked document from DMS shown in the page, from its own (signed) PDF, so its signatures
  // stay intact, or its form if it was not converted.
  const [linkedView, setLinkedView] = useState(null);
  const [linkKey, setLinkKey] = useState('');
  const openLinked = (link, key) => {
    setLinkKey(key || '');
    setLinkedView({ link });
    setView('linked');
    viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    (async () => {
      const d = await getDocument(link.id);
      if (!d) throw new Error('The linked document no longer exists.');
      const current = d.pdf?.files?.at(-1);
      if (current) {
        const bytes = await getPdfBytes(current.path);
        setLinkedView({ link, doc: d, bytes, signatures: readSignatures(bytes) });
      } else {
        setLinkedView({ link, doc: d, type: await getTypeForDocument(d) });
      }
    })().catch((e) => setLinkedView({ link, error: e.code === 'permission-denied' ? 'You have no access to this linked document.' : e.message }));
  };
  const openFile = (file, key) => {
    setLinkKey(key || '');
    setFileView({ file });
    setView('file');
    viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    getFileBytes(file.path).then((bytes) => setFileView({ file, bytes })).catch((e) => setFileView({ file, error: e.message }));
  };
  // The current PDF, once PdfCard has loaded it, for the viewer in the main area.
  const [pdfView, setPdfView] = useState(null);
  const viewer = useRef(null);
  const shownPdf = useRef(null); // a newly loaded PDF opens in the viewer once
  // Placing a signature mark: the size and preview while placing, and where it was tapped.
  const [placing, setPlacing] = useState(null);
  const [placement, setPlacement] = useState(null);
  // Working copy of the data while the Accounting Office fills in its part.
  const [draft, setDraft] = useState(null);

  const load = async () => {
    try {
      const d = await getDocument(docId);
      if (!d) throw new Error('Document not found.');
      setDocData(d);
      setDraft(d.data || {});
      setType(await getTypeForDocument(d));
    } catch (e) {
      setError(e.code === 'permission-denied'
        ? 'You do not have access to this document. Users see only the documents of their own office.'
        : e.message);
    }
  };
  useEffect(() => { load(); }, [docId]);

  if (error) return <div className="page"><div className="alert">{error}</div></div>;
  if (!docData) return <div className="page"><div className="spinner" /></div>;

  const editable = docData.status !== 'cancelled';
  const isOwner = docData.createdBy === user.uid;
  const wf = docData.workflow;
  // Once the document has left the preparer's office, only the offices on its route move it.
  const atPreparer = !wf || (wf.state === 'in-progress' && (!officeOf(wf.steps[wf.stage], docData) || officeOf(wf.steps[wf.stage], docData) === profile.office));
  // A signed PDF is the record of what was signed: the document can no longer be edited.
  const hasSignature = (docData.pdf?.files || []).some((f) => f.kind === 'signed');
  // An uploaded document's file is its PDF: nothing to encode, edit or convert.
  const uploaded = Boolean(docData.uploaded);
  const canChange = !uploaded && editable && !hasSignature && (isAdmin || (isOwner && editableByPreparer(docData)));
  const canConvert = !uploaded && editable && docData.status === 'complete' && !hasSignature && (isAdmin || (isOwner && editableByPreparer(docData)));
  const canSign = editable && docData.status === 'complete' && (isAdmin || (wf ? wf.received && canAct(docData, { uid: user.uid, office: profile.office, isAdmin, isHead }) : isOwner));
  // (An office signs once it has received the document.)
  const canCancel = editable && (isAdmin || (isOwner && atPreparer && wf?.state !== 'done'));
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const remove = () => {
    if (!window.confirm(`Delete ${docData.controlNo}? This cannot be undone.`)) return;
    run(async () => { await deleteDocument(docId); navigate('/documents'); });
  };

  const activeChecklist = type && !docData.uploaded ? effectiveChecklist(type, docData.transaction) : null;
  // Tabs after the checklist: the documents linked or uploaded to its items, numbered as on it.
  const linkTabs = (activeChecklist?.items || []).flatMap((item, i) => (docData.links?.[item.id] || [])
    .map((l, j) => ({ link: l, key: `${item.id}:${j}`, n: i + 1 }))
    .filter((t) => t.link.kind === 'fts' || t.link.kind === 'file')
    .map((t) => ({
      ...t,
      label: `${String(t.n).padStart(2, '0')} ${t.link.kind === 'fts' ? t.link.typeCode : itemTypeCode(item)}`,
      title: t.link.kind === 'fts' ? `${item.label}: ${t.link.controlNo}` : `${item.label}: ${t.link.name}`,
    })));
  const unchecked = activeChecklist ? missingRequired(activeChecklist.items, docData.checklist) : [];

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="crumbs"><Link to="/documents">Documents</Link> / {docData.controlNo}</div>
          <h1>{docData.typeName} <StatusBadge status={docData.status} /></h1>
          <p className="muted">{docData.title} · {docData.uploaded ? 'Uploaded' : 'Prepared'} by {docData.createdByName}</p>
        </div>
        <div className="row gap wrap">
          {view !== 'pdf' && <button className="btn btn-primary" onClick={() => window.print()}>Print {view === 'checklist' ? 'checklist' : 'document'}</button>}
          {type && (type.bulkDownload || docData.typeCode === 'DV') && <BulkDownload docData={docData} type={type} settings={settings} />}
          {canChange && <Link className="btn btn-ghost" to={`/documents/${docId}/edit`}>Edit</Link>}
          {canCancel && (
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => window.confirm('Cancel this document?') && run(() => setDocumentStatus(docId, 'cancelled', actor, docData.history))}>
              Cancel document
            </button>
          )}
          {(isAdmin || docData.status === 'draft') && <button className="btn btn-danger" disabled={busy} onClick={remove}>Delete</button>}
        </div>
      </div>

      {docData.status === 'draft' && (
        <div className="alert-info no-print">This document is still a <b>draft</b>. Edit it to finish encoding and mark it complete.</div>
      )}
      {docData.status === 'complete' && !wf && !uploaded && (
        <div className="alert alert-ok no-print"><b>Encoding complete.</b> Check the document, then click <b>Convert to PDF</b> under
          <b>PDF and digital signatures</b>: the PDF then follows its workflow from office to office.</div>
      )}

      <div className="doc-split">
        <div className="no-print doc-side">
          {isAdmin && editable && type && draft && !uploaded && (
            <AccountingPanel type={type} data={draft} onChange={setDraft} busy={busy}
              saved={JSON.stringify(draft) === JSON.stringify(docData.data || {})}
              onSave={() => run(() => saveAccountingEntries(docId, draft, actor, docData.history))} />
          )}
          {type && (type.processing || []).length > 0 && docData.status !== 'draft' && (
            <WorkflowCard doc={docData} busy={busy}
              canAct={canAct(docData, { uid: user.uid, office: profile.office, isAdmin, isHead })}
              canStart={docData.status === 'complete' && (docData.pdf?.files || []).length > 0 && (isOwner || isAdmin)}
              onStart={() => run(() => startWorkflow(docId, type, actor, settings.offices || []))}
              onAction={(action, remarks, done) => run(async () => {
                try { await workflowAction(docId, action, actor, { stage: wf.stage, remarks }); done(); } catch (e) { await load(); throw e; }
              })}
              onFill={(values) => run(() => fillStepFields(docId, values, actor, wf.stage))}
              onUpload={(file) => file && run(async () => {
                const link = await uploadAttachment(docId, `step-${wf.stage}`, file, actor);
                await addStepFile(docId, wf.stage, link, actor);
              })}
              onOpenFile={openFile}
              sendPanel={wf?.steps?.[wf.stage]?.fills && (
                <SendPanel doc={docData} me={user.uid} busy={busy}
                  onDownload={pdfView ? () => downloadBytes(pdfView.bytes, pdfFileName(type, docData), 'application/pdf') : null}
                  onForward={(to, note, done) => run(async () => { await forwardDocument(docId, to, note, actor); done(); })} />
              )} />
          )}
          {type && docData.status !== 'draft' && (
            <PdfCard docData={docData} type={type} settings={settings} actor={actor}
              canConvert={canConvert} canSign={canSign} onChanged={load}
              onLoaded={(p) => {
                setPdfView(p);
                if (shownPdf.current !== p.bytes) { shownPdf.current = p.bytes; setView('pdf'); }
              }}
              onView={() => { setView('pdf'); viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              placement={placement}
              onPlacing={(p) => {
                setPlacing(p);
                if (!p) setPlacement(null);
                // A new size keeps the mark centred where it was.
                else {
                  setView('pdf');
                  setPlacement((cur) => {
                    if (!cur) return cur;
                    const cx = (cur.rect[0] + cur.rect[2]) / 2; const cy = (cur.rect[1] + cur.rect[3]) / 2;
                    return { ...cur, rect: [cx - p.w / 2, cy - p.h / 2, cx + p.w / 2, cy + p.h / 2] };
                  });
                }
              }}
              reason={wf?.state === 'in-progress' ? `${wf.steps[wf.stage].action} (${officeOf(wf.steps[wf.stage], docData) || 'Requesting office'})` : ''} />
          )}
          {type && !wf && (
            <section className="card guide-card">
              <h3>How to process this document</h3>
              <ProcessingGuide type={type} />
            </section>
          )}
          <section className="card">
            <h3>Details</h3>
            <dl className="details">
              <dt>Control No.</dt><dd>{docData.controlNo}</dd>
              {uploaded && <><dt>Uploaded file</dt><dd>{docData.uploaded.name}</dd></>}
              {uploaded && docData.data?.notes && <><dt>Notes</dt><dd>{docData.data.notes}</dd></>}
              {Object.entries(docData.refNos || {}).filter(([, r]) => !r.of).map(([k, r]) => (
                <Fragment key={k}><dt>{r.label}</dt><dd><b>{r.value}</b><div className="small muted">Assigned by {r.by}{r.office ? `, ${r.office}` : ''}</div></dd></Fragment>
              ))}
              <dt>Format version</dt><dd>v{docData.typeVersion || 1}</dd>
              {docData.transaction && (<><dt>Transaction</dt><dd>{docData.transaction.code} — {docData.transaction.title}</dd></>)}
            </dl>
          </section>
          {activeChecklist && activeChecklist.items.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h3>Checklist{docData.transaction ? ` ${docData.transaction.code}` : ''}</h3>
                <div className="row gap">
                  {editable && docData.transaction && (isAdmin || docData.createdBy === user.uid) && (
                    <Link className="btn btn-sm btn-ghost" to={`/documents/${docId}/edit?change=checklist`}
                      title="Picked the wrong checklist, or the requirements changed? Choose another type of transaction.">Change checklist</Link>
                  )}
                  <button className="btn btn-sm" onClick={() => setView('checklist')}>View / print</button>
                </div>
              </div>
              {unchecked.length > 0 && <div className="alert">{unchecked.length} required item(s) not yet ticked</div>}
              <ul className="checklist-view">
                {activeChecklist.items.map((c) => {
                  const v = docData.checklist?.[c.id];
                  return (
                    <li key={c.id}><span>{isChecked(v) ? '☑' : v === 'NA' ? 'N/A' : '☐'}</span> {c.label.split('\n')[0]}
                      <ItemLinks item={c} links={docData.links?.[c.id] || []} docId={docId} actor={actor}
                        onOpen={(l, key) => (l.kind === 'fts' ? openLinked(l, key) : openFile(l, key))}
                        canEdit={editable && (isAdmin || docData.createdBy === user.uid)}
                        onChange={(list, note) => run(async () => saveDocumentLinks(docId, {
                          links: { ...(docData.links || {}), [c.id]: list },
                          checklist: list.length > (docData.links?.[c.id] || []).length && !isChecked(v)
                            ? { ...(docData.checklist || {}), [c.id]: 'Y' } : (docData.checklist || {}),
                        }, actor, docData.history, `${c.label}: ${note}`))} />
                    </li>
                  );
                })}
              </ul>
              {(docData.additionalDocs || []).length > 0 && (
                <>
                  <h4 style={{ marginTop: '.9rem' }}>Additional documents</h4>
                  <ol className="small" start={activeChecklist.items.length + 1}>{docData.additionalDocs.map((t, i) => <li key={i}>{t}</li>)}</ol>
                </>
              )}
            </section>
          )}
          <section className="card">
            <h3>History</h3>
            <ul className="history">
              {[...(docData.history || [])].reverse().map((h, i) => (
                <li key={i}><b>{h.action}</b> {h.note && `(${h.note})`}<div className="small muted">{h.by} · {new Date(h.at).toLocaleString()}</div></li>
              ))}
            </ul>
          </section>
        </div>
        {type ? (
          <div className="doc-main" ref={viewer}>
            {((activeChecklist && activeChecklist.items.length > 0) || pdfView) && (
              <div className="tabs view-toggle no-print">
                {pdfView && <button className={view === 'pdf' ? 'active' : ''} onClick={() => setView('pdf')}>{hasSignature ? 'Signed PDF' : 'PDF'}</button>}
                {!uploaded && <button className={view === 'document' ? 'active' : ''} onClick={() => setView('document')}>{docData.typeCode}</button>}
                {activeChecklist && activeChecklist.items.length > 0 && (
                  <button className={view === 'checklist' ? 'active' : ''} onClick={() => setView('checklist')}>Checklist{docData.transaction ? ` ${docData.transaction.code}` : ''}</button>
                )}
                {linkTabs.map((t) => (
                  <button key={t.key} title={t.title} className={(view === 'linked' || view === 'file') && linkKey === t.key ? 'active' : ''}
                    onClick={() => (t.link.kind === 'fts' ? openLinked(t.link, t.key) : openFile(t.link, t.key))}>{t.label}</button>
                ))}
              </div>
            )}
            {view === 'linked' && linkedView ? (
              <>
                <div className="row gap file-head no-print">
                  <Link className="btn btn-ghost btn-sm" to={`/documents/${linkedView.link.id}`}>Open {linkedView.link.controlNo}</Link>
                  {linkedView.bytes && <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => downloadBytes(linkedView.bytes, `${linkedView.link.typeCode}_${linkedView.link.controlNo}.pdf`, 'application/pdf')}>Download</button>}
                </div>
                {linkedView.error ? <div className="alert">{linkedView.error}</div>
                  : linkedView.bytes ? <PdfViewer bytes={linkedView.bytes} signatures={linkedView.signatures} title={`${linkedView.link.controlNo} · ${linkedView.link.typeCode}${linkedView.signatures.length ? ' · signed PDF' : ' · PDF'}`} />
                    : linkedView.type ? (
                      <DocumentPreview type={linkedView.type} data={linkedView.doc.data || {}} checklist={linkedView.doc.checklist || {}} settings={settings}
                        signatories={linkedView.doc.signatories} controlNo={linkedView.doc.controlNo} preparedBy={linkedView.doc.createdByName} />
                    ) : <div className="spinner" />}
              </>
            ) : view === 'file' && fileView ? (
              <>
                <div className="row gap file-head no-print">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView(pdfView ? 'pdf' : 'document')}>← Back to the {pdfView ? 'PDF' : 'document'}</button>
                  {fileView.bytes && <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadBytes(fileView.bytes, fileView.file.name, fileView.file.type)}>Download</button>}
                </div>
                {fileView.error ? <div className="alert">{fileView.error}</div> : <FileView file={fileView.file} bytes={fileView.bytes} />}
              </>
            ) : view === 'pdf' && pdfView ? (
              <PdfViewer bytes={pdfView.bytes} signatures={pdfView.signatures} title={`${docData.controlNo} · ${hasSignature ? 'signed PDF' : 'PDF'}`}
                placing={placing} onPlace={setPlacement}
                mark={placing && placement ? { ...placement, preview: placing.preview, label: placing.label } : null} />
            ) : uploaded ? (
              pdfView ? <PdfViewer bytes={pdfView.bytes} signatures={pdfView.signatures} title={`${docData.controlNo} · ${docData.uploaded.name}`}
                placing={placing} onPlace={setPlacement}
                mark={placing && placement ? { ...placement, preview: placing.preview, label: placing.label } : null} /> : <div className="spinner" />
            ) : view === 'checklist' && activeChecklist ? (
              <ChecklistSheet checklist={activeChecklist} state={docData.checklist} data={draft || docData.data} additional={docData.additionalDocs || []} links={docData.links || {}} settings={settings} />
            ) : (
          <DocumentPreview type={type} data={draft || docData.data} checklist={docData.checklist} settings={settings}
            signatories={docData.signatories}
            controlNo={docData.controlNo} preparedBy={docData.createdByName} />
            )}
          </div>
        ) : <div className="alert">The document type for this document was deleted; the format cannot be rendered.</div>}
      </div>
    </div>
  );
}
