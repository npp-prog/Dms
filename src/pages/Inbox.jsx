import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listForwarded, listInbox } from '../lib/api.js';
import { HIDDEN_EVENTS, officeOf } from '../lib/workflow.js';
import Select from '../components/Select.jsx';
import { drnOf } from '../lib/naming.js';

const since = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// Documents waiting in the user's office along their workflow. Admins can see every office.
export default function Inbox() {
  const { user, profile, isAdmin, isHead, settings } = useAuth();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  // Documents someone forwarded to this user.
  const [forwarded, setForwarded] = useState(null);
  useEffect(() => { listForwarded(user.uid).then(setForwarded).catch(() => setForwarded([])); }, [user.uid]);
  const [office, setOffice] = useState(profile.office || '');

  useEffect(() => {
    setDocs(null);
    const all = isAdmin && !office;
    // An office head (or an admin) sees everything waiting in the office; staff, what is routed to
    // the office and their own documents at the preparer's step.
    listInbox({ office, all, uid: user.uid, head: isHead || isAdmin }).then(setDocs).catch((e) => setError(e.message));
  }, [office, isAdmin, isHead, user.uid]);

  const offices = useMemo(() => [...new Set([...(settings.offices || []), ...(profile.office ? [profile.office] : [])])].sort(), [settings.offices, profile.office]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
        </div>
        {isAdmin && (
          <Select value={office} onChange={(e) => setOffice(e.target.value)} aria-label="Office">
            <option value="">All offices</option>
            {offices.map((o) => <option key={o}>{o}</option>)}
          </Select>
        )}
      </div>
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Control No.</th><th title="Document Reference No.: the number assigned along the route (e.g. the DV No.)">DRN</th><th>Type</th><th>Payee / Subject</th><th>From</th>{!office && <th>Now at</th>}<th>Step</th><th>Status</th><th>Since</th></tr></thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan={9} className="muted">Nothing waiting. {office ? 'Documents routed to your office appear here.' : ''}</td></tr>}
              {docs.map((d) => {
                const wf = d.workflow;
                const step = wf.steps[wf.stage];
                return (
                  <tr key={d.id}>
                    <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                    <td className="small">{drnOf(d) || '—'}</td>
                    <td>{d.typeCode}</td>
                    <td>{d.title}</td>
                    <td className="small">{d.office || d.createdByName}</td>
                    {!office && <td className="small">{wf.referral ? `${wf.referral.name} (referred)` : officeOf(step, d) || 'Requesting office'}</td>}
                    <td className="small">{wf.referral
                      ? <><span className="badge badge-blue">Referred{wf.referral.uid === user.uid ? ' to you' : ''}</span> by {wf.referral.by}{wf.referral.note && <> — <i>{wf.referral.note}</i></>}</>
                      : step.action}</td>
                    <td>{wf.events.filter((e) => !HIDDEN_EVENTS.has(e.type)).at(-1)?.type === 'returned'
                      ? <span className="badge badge-red">Returned</span>
                      : <span className="badge badge-blue">{wf.referral ? 'Referred' : 'Released'}</span>}</td>
                    <td className="small">{since(d.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {forwarded && forwarded.length > 0 && (
        <>
          <h2 className="inbox-sub">Forwarded to you</h2>
          <div className="card table-card">
            <table className="data-table">
              <thead><tr><th>Control No.</th><th title="Document Reference No.: the number assigned along the route (e.g. the DV No.)">DRN</th><th>Type</th><th>Payee / Subject</th><th>From</th><th>Note</th><th>When</th></tr></thead>
              <tbody>
                {forwarded.map((d) => {
                  const f = [...(d.forwards || [])].reverse().find((x) => x.to === user.uid) || {};
                  return (
                    <tr key={d.id}>
                      <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                    <td className="small">{drnOf(d) || '—'}</td>
                      <td>{d.typeCode}</td>
                      <td>{d.title}</td>
                      <td className="small">{f.by}</td>
                      <td className="small">{f.kind === 'review' && <span className="badge badge-blue">For review</span>} {f.note || (f.kind === 'review' ? '' : '—')}</td>
                      <td className="small">{f.at ? new Date(f.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}