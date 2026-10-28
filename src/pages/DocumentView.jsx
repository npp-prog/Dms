import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { deleteDocument, getDocument, getTypeForDocument, saveAccountingEntries, setDocumentStatus } from '../lib/api.js';
import { effectiveChecklist, isChecked, missingRequired } from '../lib/checklists.js';
import AccountingPanel from '../components/AccountingPanel.jsx';
import ChecklistSheet from '../components/ChecklistSheet.jsx';
import DocumentPreview from '../components/DocumentPreview.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ProcessingGuide from '../components/ProcessingGuide.jsx';

export default function DocumentView() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const { actor, settings, isAdmin } = useAuth();
  const [docData, setDocData] = useState(null);
  const [type, setType] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('document');
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
          <button className="btn btn-primary" onClick={() => window.print()}>Print {view === 'checklist' ? 'checklist' : 'document'}</button>
          {editable && <Link className="btn btn-ghost" to={`/documents/${docId}/edit`}>Edit</Link>}
          {editable && (
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
      {docData.status === 'complete' && (
        <div className="alert alert-ok no-print"><b>Encoding complete.</b> Print the document, have it signed, attach the
          requirements, and process it by following the steps under <b>How to process this document</b>.</div>
      )}

      <div className="split">
        <div className="no-print">
          {isAdmin && editable && type && draft && (
            <AccountingPanel type={type} data={draft} onChange={setDraft} busy={busy}
              saved={JSON.stringify(draft) === JSON.stringify(docData.data || {})}
              onSave={() => run(() => saveAccountingEntries(docId, draft, actor, docData.history))} />
          )}
          {type && (
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
                <button className="btn btn-sm" onClick={() => setView('checklist')}>View / print</button>
              </div>
              {unchecked.length > 0 && <div className="alert">{unchecked.length} required item(s) not yet ticked</div>}
              <ul className="checklist-view">
                {activeChecklist.items.map((c) => {
                  const v = docData.checklist?.[c.id];
                  return <li key={c.id}><span>{isChecked(v) ? '☑' : v === 'NA' ? 'N/A' : '☐'}</span> {c.label.split('\n')[0]}</li>;
                })}
              </ul>
              {(docData.additionalDocs || []).length > 0 && (
                <>
                  <h4 style={{ marginTop: '.9rem' }}>Additional documents</h4>
                  <ol className="small">{docData.additionalDocs.map((t, i) => <li key={i}>{t}</li>)}</ol>
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
          <div>
            {activeChecklist && activeChecklist.items.length > 0 && (
              <div className="tabs view-toggle no-print">
                <button className={view === 'document' ? 'active' : ''} onClick={() => setView('document')}>{docData.typeCode}</button>
                <button className={view === 'checklist' ? 'active' : ''} onClick={() => setView('checklist')}>Checklist{docData.transaction ? ` ${docData.transaction.code}` : ''}</button>
              </div>
            )}
            {view === 'checklist' && activeChecklist ? (
              <ChecklistSheet checklist={activeChecklist} state={docData.checklist} data={draft || docData.data} additional={docData.additionalDocs || []} settings={settings} />
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
