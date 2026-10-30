import { useEffect, useState } from 'react';
import { listDirectory } from '../lib/api.js';
import PersonPicker from './PersonPicker.jsx';
import Select from './Select.jsx';

const ROLES = [['viewer', 'Viewer'], ['editor', 'Editor']];

// The office head (or an administrator or the Records Officer) gives people of the office (besides
// the preparer) access to this document, or restricts it:
// a viewer opens it and its files; an editor also does what its preparer does (edits the draft,
// converts it to PDF, routes it…). Restricted: no one gets at it through folder access, only the
// people given it here. Access to whole folders: Folders → Access.
export default function AccessCard({ doc, me, busy, onChange, onRestrict }) {
  const [people, setPeople] = useState([]);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState('viewer');
  useEffect(() => { listDirectory().then(setPeople).catch(() => setPeople([])); }, []);
  const access = doc.access || [];
  const editors = doc.editors || [];
  const nameOf = (uid) => people.find((p) => p.uid === uid)?.displayName || 'A former user';
  return (
    <section className="card">
      <div className="card-head">
        <h3>Access</h3>
        {!adding && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setRole('viewer'); setAdding(true); }}>+ Give access</button>}
      </div>
      <label className="check access-restrict">
        <input type="checkbox" checked={Boolean(doc.restricted)} disabled={busy}
          onChange={(e) => window.confirm(e.target.checked ? 'Restrict this document? People with access to its folder will no longer open it; only those given it here.' : 'Lift the restriction? People with access to its folder will open it again.') && onRestrict(e.target.checked)} />
        <span><b>Restricted</b><span className="small muted"> No access through folders, only the people below.</span></span>
      </label>
      {access.length === 0 && !adding && <p className="small muted">Only the preparer, the offices on its route, the office head, administrators and the Records Officer. Give others in {doc.office} access: a viewer opens it, an editor does what its preparer does.</p>}
      {access.length > 0 && (
        <ul className="access-list">
          {access.map((uid) => (
            <li key={uid}>
              <span>{nameOf(uid)}</span>
              <span className="row gap">
                <Select value={editors.includes(uid) ? 'editor' : 'viewer'} aria-label={`${nameOf(uid)}'s access`} disabled={busy}
                  onChange={(e) => onChange({ uid, displayName: nameOf(uid) }, e.target.value)}>
                  {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <button type="button" className="btn-icon" title="Remove access" disabled={busy}
                  onClick={() => window.confirm(`Remove ${nameOf(uid)}'s access to this document?`) && onChange({ uid, displayName: nameOf(uid) }, '')}>×</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="access-add">
          <Select value={role} aria-label="Access" onChange={(e) => setRole(e.target.value)}>
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <PersonPicker value={null} office={doc.office} exclude={[doc.createdBy, me, ...access]}
            onChange={(p) => { if (p) { onChange(p, role); setAdding(false); } }} />
          <button type="button" className="link small" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
    </section>
  );
}
