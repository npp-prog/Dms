import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { deleteDocument, getDocument, getTypeForDocument, setDocumentStatus } from '../lib/api.js';
import { missingChecklist } from '../lib/forms.js';
import DocumentPreview from '../components/DocumentPreview.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function DocumentView() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const { actor, settings, isAdmin } = useAuth();
  const [docData, setDocData] = useState(null);
  const [type, setType] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [transmit, setTransmit] = useState(null);

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

  const editable = docData.status !== 'transmitted' && docData.status !== 'cancelled';
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const markTransmitted = (e) => {
    e.preventDefault();
    run(async () => {
      await setDocumentStatus(docId, 'transmitted', actor, docData.history, {
        dmsRefNo: transmit.refNo.trim(),
        dmsRecipient: transmit.recipient.trim(),
        transmittedAt: new Date().toISOString(),
      }, `DMS ${transmit.refNo.trim()} → ${transmit.recipient.trim()}`);
      setTransmit(null);
    });
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
          <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>
          {editable && <Link className="btn btn-ghost" to={`/documents/${docId}/edit`}>Edit</Link>}
          {docData.status === 'complete' && (
            <button className="btn btn-primary" onClick={() => setTransmit({ refNo: '', recipient: '' })}>Transmit via DMS</button>
          )}
          {editable && (
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => window.confirm('Cancel this document?') && run(() => setDocumentStatus(docId, 'cancelled', actor, docData.history))}>
              Cancel document
            </button>
          )}
          {(isAdmin || docData.status === 'draft') && <button className="btn btn-danger" disabled={busy} onClick={remove}>Delete</button>}
        </div>
      </div>

      {transmit && (
        <form className="card no-print transmit" onSubmit={markTransmitted}>
          <h3>Transmit via DMS</h3>
          <p className="small muted">FTS does not route documents. Print the document, attach the checklist requirements, and
            create the transmittal in the Document Management System. Then record the DMS reference number here.</p>
          {settings.dmsUrl && (
            <a className="btn btn-ghost btn-sm" href={settings.dmsUrl} target="_blank" rel="noreferrer">Open DMS ↗</a>
          )}
          <div className="fields">
            <div className="field">
              <label className="field-label">DMS Tracking / Reference No. <span className="req">*</span></label>
              <input required value={transmit.refNo} onChange={(e) => setTransmit({ ...transmit, refNo: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label">Transmitted to (office) <span className="req">*</span></label>
              <input required value={transmit.recipient} onChange={(e) => setTransmit({ ...transmit, recipient: e.target.value })} />
            </div>
          </div>
          <div className="row gap">
            <button className="btn btn-primary" disabled={busy}>Record transmittal</button>
            <button type="button" className="btn btn-ghost" onClick={() => setTransmit(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="split">
        <div className="no-print">
          <section className="card">
            <h3>Details</h3>
            <dl className="details">
              <dt>Control No.</dt><dd>{docData.controlNo}</dd>
              <dt>Format version</dt><dd>v{docData.typeVersion || 1}</dd>
              <dt>DMS Ref. No.</dt><dd>{docData.dmsRefNo || '—'}</dd>
              {docData.dmsRecipient && (<><dt>Transmitted to</dt><dd>{docData.dmsRecipient}</dd></>)}
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
