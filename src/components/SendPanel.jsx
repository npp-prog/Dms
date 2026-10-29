import { useEffect, useState } from 'react';
import { listDirectory } from '../lib/api.js';

// Sending a document on after a step (e.g. once the Treasurer has filled in the Check/ADA No.):
// download the PDF for someone outside DMS, or forward it to a DMS user, who can then open it
// and find it in their Inbox.
export default function SendPanel({ doc, me, busy, onDownload, onForward }) {
  const [people, setPeople] = useState(null);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { listDirectory().then(setPeople).catch((e) => setError(e.message)); }, []);
  const forwards = doc.forwards || [];
  const person = (people || []).find((p) => p.uid === to);
  return (
    <div className="send-panel">
      <div className="field-label">Send it on</div>
      <div className="row gap wrap">
        <button type="button" className="btn btn-ghost btn-sm" disabled={!onDownload} onClick={onDownload}
          title="The current (signed) PDF, to send to someone outside DMS">Download PDF</button>
      </div>
      <div className="fields">
        <label className="field">
          <span className="field-label">Forward to a DMS user</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} disabled={!people}>
            <option value="">{people ? '— Choose a person —' : 'Loading…'}</option>
            {(people || []).filter((p) => p.uid !== me).map((p) => <option key={p.uid} value={p.uid}>{p.displayName}{p.office ? ` — ${p.office}` : ''}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Check ready for release" />
        </label>
        <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || !person}
          onClick={() => onForward(person, note, () => { setTo(''); setNote(''); })}>Forward</button></div>
      </div>
      {error && <div className="alert small">{error}</div>}
      {forwards.length > 0 && (
        <ul className="small forward-list">
          {forwards.map((f, i) => <li key={i}>Forwarded to <b>{f.toName}</b>{f.toOffice ? ` (${f.toOffice})` : ''} by {f.by} · {new Date(f.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}{f.note && <> — <i>{f.note}</i></>}</li>)}
        </ul>
      )}
    </div>
  );
}
