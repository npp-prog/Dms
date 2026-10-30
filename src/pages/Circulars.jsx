import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getFileBytes, listDirectory } from '../lib/api.js';
import { CIRCULAR_KINDS, deleteCircular, getCircular, listCirculars, markNotificationsRead, receiveCircular, sendCircular, watchNotifications } from '../lib/social.js';
import Select from '../components/Select.jsx';
import PdfViewer from '../components/PdfViewer.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const received = (c) => Object.keys(c.receipts || {}).filter((o) => c.toOffices.includes(o)).length;

// Circulars: letters, memos, executive orders... an office head sends to some or all offices.
// Each office it is for marks it received, and the sender sees which offices have.
export default function Circulars() {
  const { user, profile, isAdmin, isHead, settings, actor } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const canSend = isHead || isAdmin;
  const load = () => listCirculars({ office: profile.office, uid: user.uid, isAdmin })
    .then(setList).catch((e) => setError(e.code === 'permission-denied'
      ? 'Circulars are not switched on yet: an administrator must publish the latest firestore.rules (Firebase console → Firestore → Rules).'
      : e.message));
  useEffect(() => { load(); }, [profile.office, user.uid, isAdmin]);

  const forMe = (list || []).filter((c) => profile.office && c.toOffices.includes(profile.office));
  const sent = (list || []).filter((c) => c.by === user.uid || (isAdmin && !forMe.includes(c)));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Circulars</h1></div>
        {canSend && !composing && <button className="btn btn-primary" onClick={() => setComposing(true)}>+ New circular</button>}
      </div>
      {error && <div className="alert">{error}</div>}
      {composing && (
        <NewCircular offices={settings.offices || []} me={actor} onCancel={() => setComposing(false)}
          onSent={(id) => navigate(`/circulars/${id}`)} />
      )}
      {!list && !error && <div className="spinner" />}
      {list && (
        <>
          <h2 className="inbox-sub">For {profile.office || 'your office'}</h2>
          <div className="card table-card">
            <table className="data-table">
              <thead><tr><th>Kind</th><th>Title</th><th>From</th><th>Sent</th><th>Status</th></tr></thead>
              <tbody>
                {forMe.length === 0 && <tr><td colSpan={5} className="muted">No circulars for your office yet.</td></tr>}
                {forMe.map((c) => {
                  const r = c.receipts?.[profile.office];
                  return (
                    <tr key={c.id}>
                      <td>{c.kind}</td>
                      <td><Link to={`/circulars/${c.id}`}><b>{c.title}</b></Link></td>
                      <td className="small">{c.fromOffice || c.byName}</td>
                      <td className="small">{when(c.at)}</td>
                      <td>{r ? <span className="badge badge-green">Received</span> : <span className="badge badge-yellow">To receive</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(canSend || sent.length > 0) && (
            <>
              <h2 className="inbox-sub">{isAdmin ? 'Sent (all)' : 'Sent by you'}</h2>
              <div className="card table-card">
                <table className="data-table">
                  <thead><tr><th>Kind</th><th>Title</th><th>From</th><th>To</th><th>Sent</th><th>Received</th></tr></thead>
                  <tbody>
                    {sent.length === 0 && <tr><td colSpan={6} className="muted">Nothing sent yet.</td></tr>}
                    {sent.map((c) => (
                      <tr key={c.id}>
                        <td>{c.kind}</td>
                        <td><Link to={`/circulars/${c.id}`}><b>{c.title}</b></Link></td>
                        <td className="small">{c.fromOffice || c.byName}</td>
                        <td className="small">{c.all ? 'All offices' : c.toOffices.join(', ')}</td>
                        <td className="small">{when(c.at)}</td>
                        <td><span className={`badge ${received(c) === c.toOffices.length ? 'badge-green' : 'badge-yellow'}`}>{received(c)} of {c.toOffices.length}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function NewCircular({ offices, me, onCancel, onSent }) {
  const [form, setForm] = useState({ title: '', kind: CIRCULAR_KINDS[0], note: '', all: true, toOffices: [] });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggle = (o) => setForm({ ...form, toOffices: form.toOffices.includes(o) ? form.toOffices.filter((x) => x !== o) : [...form.toOffices, o] });
  const others = offices.filter((o) => o !== me.office);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const people = await listDirectory().catch(() => []);
      const id = await sendCircular({ ...form, file, toOffices: form.all ? others : form.toOffices }, me, people);
      onSent(id);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3>New circular</h3>
      <div className="fields">
        <div className="field"><label className="field-label" htmlFor="cc-kind">Kind</label>
          <Select id="cc-kind" value={form.kind} onChange={set('kind')}>{CIRCULAR_KINDS.map((k) => <option key={k}>{k}</option>)}</Select></div>
        <div className="field field-wide"><label className="field-label" htmlFor="cc-title">Title or subject <span className="req">*</span></label>
          <input id="cc-title" value={form.title} onChange={set('title')} required maxLength={200} /></div>
        <div className="field field-wide"><label className="field-label" htmlFor="cc-file">File (PDF or picture) <span className="req">*</span></label>
          <input id="cc-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          <div className="help">The signed letter, memo or order, scanned or as issued. Up to 25 MB.</div></div>
        <div className="field field-wide"><label className="field-label" htmlFor="cc-note">Note (optional)</label>
          <textarea id="cc-note" rows={2} value={form.note} onChange={set('note')} maxLength={2000} /></div>
        <div className="field field-wide"><span className="field-label">For</span>
          <label className="check"><input type="radio" checked={form.all} onChange={() => setForm({ ...form, all: true })} /> All offices</label>
          <label className="check"><input type="radio" checked={!form.all} onChange={() => setForm({ ...form, all: false })} /> Chosen offices</label>
          {!form.all && (
            <div className="office-checks">
              {others.map((o) => <label key={o} className="check"><input type="checkbox" checked={form.toOffices.includes(o)} onChange={() => toggle(o)} /> {o}</label>)}
            </div>
          )}
          <div className="help">Every office it is for sees it under Circulars and Notifications, and marks it received. You are told as each office does.</div>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send circular'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// A fresh page for each circular.
export function CircularView() {
  const { id } = useParams();
  return <CircularPage key={id} id={id} />;
}

function CircularPage({ id }) {
  const navigate = useNavigate();
  const { user, profile, isAdmin, actor } = useAuth();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null); // { bytes, url } or { error }
  const load = () => getCircular(id).then((x) => (x ? setC(x) : setError('This circular no longer exists.'))).catch((e) => setError(e.code === 'permission-denied' ? 'This circular is not for your office.' : e.message));
  useEffect(() => { load(); }, [id]);
  // Opened: its updates in Notifications are read.
  useEffect(() => watchNotifications(user.uid, (list) => {
    const ids = list.filter((n) => !n.read && n.link === `/circulars/${id}`).map((n) => n.id);
    if (ids.length) markNotificationsRead(user.uid, ids).catch(() => {});
  }, () => {}), [id, user.uid]);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    if (!c?.file?.path) return undefined;
    let url = '';
    getFileBytes(c.file.path).then((bytes) => {
      url = URL.createObjectURL(new Blob([bytes], { type: c.file.type }));
      setFile({ bytes, url });
    }).catch((e) => setFile({ error: e.message }));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [c?.file?.path]);

  const mine = profile.office && c?.toOffices.includes(profile.office);
  const receipt = mine ? c.receipts?.[profile.office] : null;
  const isSender = c?.by === user.uid;
  const status = useMemo(() => (c ? c.toOffices.map((o) => ({ office: o, r: c.receipts?.[o] })) : []), [c]);

  if (error) return <div className="page"><div className="alert">{error}</div></div>;
  if (!c) return <div className="page"><div className="spinner" /></div>;

  const receive = async () => {
    setBusy(true);
    setActionError('');
    try { await receiveCircular(id, actor); await load(); } catch (e) { setActionError(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${c.title}"? The offices it was sent to will no longer see it.`)) return;
    try { await deleteCircular(id); navigate('/circulars', { replace: true }); } catch (e) { setActionError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{c.title}</h1></div>
        {(isSender || isAdmin) && <button className="btn btn-ghost btn-sm" onClick={remove}>Delete</button>}
      </div>
      <div className="doc-split">
        <div className="doc-side">
          <section className="card">
            <dl className="details">
              <dt>Kind</dt><dd>{c.kind}</dd>
              <dt>From</dt><dd>{c.fromOffice || '—'} · {c.byName}</dd>
              <dt>Sent</dt><dd>{when(c.at)}</dd>
              <dt>For</dt><dd>{c.all ? 'All offices' : c.toOffices.join(', ')}</dd>
              {c.note && <><dt>Note</dt><dd style={{ whiteSpace: 'pre-line' }}>{c.note}</dd></>}
            </dl>
            {actionError && <div className="alert small">{actionError}</div>}
            {mine && (receipt
              ? <div className="alert-info small">Received by {receipt.name} on {when(receipt.at)}.</div>
              : <button className="btn btn-primary" disabled={busy} onClick={receive}>Mark received for {profile.office}</button>)}
            {file?.url && (
              <div className="pdf-links">
                <a className="link small" href={file.url} target="_blank" rel="noreferrer">Open file</a>
                <a className="link small" href={file.url} download={c.file.name}>Download</a>
              </div>
            )}
          </section>
          {(isSender || isAdmin) && (
            <section className="card">
              <div className="card-head"><h3>Received</h3>
                <span className="badge badge-blue">{received(c)} of {c.toOffices.length}</span></div>
              <ul className="receipts">
                {status.map(({ office, r }) => (
                  <li key={office}>
                    <span>{office}</span>
                    {r ? <span className="small"><span className="badge badge-green">Received</span> {r.name} · {when(r.at)}</span>
                      : <span className="badge badge-yellow">Not yet</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="doc-main">
          {!file && <div className="spinner" />}
          {file?.error && <div className="alert">{file.error}</div>}
          {file?.bytes && (c.file.type === 'application/pdf'
            ? <PdfViewer bytes={file.bytes} title={c.file.name} />
            : <img className="circular-img" src={file.url} alt={c.title} />)}
        </div>
      </div>
    </div>
  );
}
