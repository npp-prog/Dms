import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listInbox } from '../lib/api.js';
import { officeOf } from '../lib/workflow.js';

const since = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// Documents waiting in the user's office along their workflow. Admins can see every office.
export default function Inbox() {
  const { profile, isAdmin, settings } = useAuth();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [office, setOffice] = useState(profile.office || '');

  useEffect(() => {
    setDocs(null);
    const all = isAdmin && !office;
    if (!office && !all) { setDocs([]); return; }
    listInbox({ office, all }).then(setDocs).catch((e) => setError(e.message));
  }, [office, isAdmin]);

  const offices = useMemo(() => [...new Set([...(settings.offices || []), ...(profile.office ? [profile.office] : [])])].sort(), [settings.offices, profile.office]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inbox</h1>
          <p className="muted">{office
            ? <>Documents waiting in the <b>{office}</b>. Open one to receive it, then release it to the next office or return it.</>
            : isAdmin ? 'Every document on its route, in any office.' : 'An administrator has not assigned you to an office yet.'}</p>
        </div>
        {isAdmin && (
          <select value={office} onChange={(e) => setOffice(e.target.value)} aria-label="Office">
            <option value="">All offices</option>
            {offices.map((o) => <option key={o}>{o}</option>)}
          </select>
        )}
      </div>
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Control No.</th><th>Type</th><th>Payee / Subject</th><th>From</th>{!office && <th>Now at</th>}<th>Step</th><th>Status</th><th>Since</th></tr></thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan={8} className="muted">Nothing waiting. {office ? 'Documents routed to your office appear here.' : ''}</td></tr>}
              {docs.map((d) => {
                const wf = d.workflow;
                const step = wf.steps[wf.stage];
                return (
                  <tr key={d.id}>
                    <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                    <td>{d.typeCode}</td>
                    <td>{d.title}</td>
                    <td className="small">{d.office || d.createdByName}</td>
                    {!office && <td className="small">{officeOf(step, d) || 'Requesting office'}</td>}
                    <td className="small">{step.action}</td>
                    <td>{wf.received
                      ? <span className="badge badge-blue">Received</span>
                      : <span className="badge badge-yellow">{wf.events.at(-1)?.type === 'returned' ? 'Returned' : 'To receive'}</span>}</td>
                    <td className="small">{since(d.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
