import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { deleteDocument, getDocument, getTypeForDocument, setDocumentStatus } from '../lib/api.js';
import { missingChecklist } from '../lib/forms.js';
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

  const load = async () => {
    try {
      const d = await getDocument(docId);
      if (!d) throw new Error('Document not found.');
      setDocData(d);
      setType(await getTypeForDocument(d));
    } catch (e) {
      setError(e.message);
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

  const unchecked = type ? missingChecklist(type.checklist, docData.checklist) : [];

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="crumbs"><Link to="/documents">Documents</Link> / {docData.controlNo}</div>
          <h1>{docData.typeName} <StatusBadge status={docData.status} /></h1>
          <p className="muted">{docData.title} · Prepared by {docData.createdByName}</p>
        </div>
        <div className="row gap wrap">
          <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
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
            </dl>
          </section>
          {type && (
            <section className="card">
              <h3>Checklist</h3>
              {unchecked.length > 0 && <div className="alert">{unchecked.length} required item(s) unchecked</div>}
              <ul className="checklist-view">
                {(type.checklist || []).map((c) => (
                  <li key={c.id}><span>{docData.checklist?.[c.id] ? '☑' : '☐'}</span> {c.label}</li>
                ))}
              </ul>
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
          <DocumentPreview type={type} data={docData.data} checklist={docData.checklist} settings={settings}
            controlNo={docData.controlNo} preparedBy={docData.createdByName} />
        ) : <div className="alert">The document type for this document was deleted; the format cannot be rendered.</div>}
      </div>
    </div>
  );
}
