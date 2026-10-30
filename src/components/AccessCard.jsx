import { useEffect, useState } from 'react';
import { listDirectory } from '../lib/api.js';
import PersonPicker from './PersonPicker.jsx';

// The office head gives people of the office (besides the preparer) access to this document: they
// can open it and its files (read only). Access to whole folders: Folders → Access.
export default function AccessCard({ doc, me, busy, onChange }) {
  const [people, setPeople] = useState([]);
  const [adding, setAdding] = useState(false);
  useEffect(() => { listDirectory().then(setPeople).catch(() => setPeople([])); }, []);
  const access = doc.access || [];
  const nameOf = (uid) => people.find((p) => p.uid === uid)?.displayName || 'A former user';
  return (
    <section className="card">
      <div className="card-head">
        <h3>Access</h3>
        {!adding && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAdding(true)}>+ Give access</button>}
      </div>
      {access.length === 0 && !adding && <p className="small muted">Only the preparer, the offices on its route and you. Give others in {doc.office} access to open it.</p>}
      {access.length > 0 && (
        <ul className="access-list">
          {access.map((uid) => (
            <li key={uid}>
              <span>{nameOf(uid)}</span>
              <button type="button" className="btn-icon" title="Remove access" disabled={busy}
                onClick={() => window.confirm(`Remove ${nameOf(uid)}'s access to this document?`) && onChange({ uid, displayName: nameOf(uid) }, false)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="access-add">
          <PersonPicker value={null} office={doc.office} exclude={[doc.createdBy, me, ...access]}
            onChange={(p) => { if (p) { onChange(p, true); setAdding(false); } }} />
          <button type="button" className="link small" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
    </section>
  );
}
