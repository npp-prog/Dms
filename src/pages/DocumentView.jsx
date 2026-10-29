import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { deleteDocument, getDocument, getTypeForDocument, saveAccountingEntries, saveDocumentLinks, setDocumentStatus, startWorkflow, workflowAction } from '../lib/api.js';
import { canAct, editableByPreparer, officeOf } from '../lib/workflow.js';
import { effectiveChecklist, isChecked, missingRequired } from '../lib/checklists.js';
import AccountingPanel from '../components/AccountingPanel.jsx';
import BulkDownload from '../components/BulkDownload.jsx';
import ChecklistSheet from '../components/ChecklistSheet.jsx';
import { LinkEditor, LinkList, linkText } from '../components/DocLinks.jsx';
import DocumentPreview from '../components/DocumentPreview.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ProcessingGuide from '../components/ProcessingGuide.jsx';
import WorkflowCard from '../components/WorkflowCard.jsx';
import PdfCard from '../components/PdfCard.jsx';
import PdfViewer from '../components/PdfViewer.jsx';

// Links of one checklist item on a saved document; the preparer and admins can add or remove them.
function ItemLinks({ item, links, canEdit, docId, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LinkList links={links} onRemove={canEdit ? (i) => onChange(links.filter((_, j) => j !== i), `removed ${linkText(links[i])}`) : undefined} />
      {canEdit && (open
        ? <LinkEditor item={item} excludeId={docId} onCancel={() => setOpen(false)} onAdd={(l) => { setOpen(false); onChange([...links, l], linkText(l)); }} />
        : <button type="button" className="link small no-print" onClick={() => setOpen(true)}>+ Link document</button>)}
    </>
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
  // The current PDF, once PdfCard has loaded it, for the viewer in the main area.
  const [pdfView, setPdfView] = useState(null);
  const viewer = useRef(null);
  const shownPdf = useRef(null); // a newly loaded PDF opens in the viewer once
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
  const canChange = editable && !hasSignature && (isAdmin || (isOwner && editableByPreparer(docData)));
  const canConvert = editable && docData.status === 'complete' && !hasSignature && (isAdmin || (isOwner && editableByPreparer(docData)));
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

  const activeChecklist = type ? effectiveChecklist(type, docData.transaction) : null;
  const unchecked = activeChecklist ? missingRequired(activeChecklist.items, docData.checklist) : [];

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="crumbs"><Link to="/documents">Documents</Link> / {docData.controlNo}</div>
          <h1>{docData.typeName} <StatusBadge status={docData.status} /></h1>
          <p className="muted">{docData.title} · Prepared by {docData.createdByName}</p>
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
      {docData.status === 'complete' && !wf && (
        <div className="alert alert-ok no-print"><b>Encoding complete.</b> Check the document, then click <b>Convert to PDF</b> under
          <b>PDF and digital signatures</b>: the PDF then follows its workflow from office to office.</div>
      )}

      <div className="doc-split">
        <div className="no-print doc-side">
          {isAdmin && editable && type && draft && (
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
              })} />
          )}
          {type && docData.status !== 'draft' && (
            <PdfCard docData={docData} type={type} settings={settings} actor={actor}
              canConvert={canConvert} canSign={canSign} onChanged={load}
              onLoaded={(p) => {
                setPdfView(p);
                if (shownPdf.current !== p.bytes) { shownPdf.current = p.bytes; setView('pdf'); }
              }}
              onView={() => { setView('pdf'); viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
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
                      <ItemLinks item={c} links={docData.links?.[c.id] || []} docId={docId}
                        canEdit={editable && (isAdmin || docData.createdBy === user.uid)}
                        onChange={(list, note) => run(() => saveDocumentLinks(docId, {
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
                <button className={view === 'document' ? 'active' : ''} onClick={() => setView('document')}>{docData.typeCode}</button>
                {activeChecklist && activeChecklist.items.length > 0 && (
                  <button className={view === 'checklist' ? 'active' : ''} onClick={() => setView('checklist')}>Checklist{docData.transaction ? ` ${docData.transaction.code}` : ''}</button>
                )}
              </div>
            )}
            {view === 'pdf' && pdfView ? (
              <PdfViewer bytes={pdfView.bytes} signatures={pdfView.signatures} title={`${docData.controlNo} · ${hasSignature ? 'signed PDF' : 'PDF'}`} />
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
