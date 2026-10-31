import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { addPosition, listUsers, syncDirectory, updateUser } from '../../lib/api.js';
import { positionsOf } from '../../lib/defaults.js';
import Select from '../../components/Select.jsx';
import PositionsPicker from '../../components/PositionsPicker.jsx';
import { Avatar } from '../../components/Icon.jsx';

const ROLE_NAMES = { user: 'User', payee: 'Third Party', admin: 'Admin', superadmin: 'Superadmin' };

// One person: name, office and what they may do at a glance; Edit opens their settings below.
function UserRow({ u, me, isSuper, settings, offices, canManage, onChange, onNewPosition }) {
  const [open, setOpen] = useState(false);
  const editable = canManage || (isSuper && u.id === me.uid);
  const tags = [u.head && 'Office head', ...(u.positions || []), u.canRefer && 'Routes to any person'].filter(Boolean);
  return (
    <li className={`user-row${open ? ' open' : ''}`}>
      <div className="user-main">
        <Avatar name={u.displayName || u.email} size="sm" />
        <div className="user-who">
          <span className="user-name"><b>{u.displayName || u.email}</b>{u.id === me.uid && <span className="muted"> (you)</span>}</span>
          <span className="small muted">{u.email}</span>
        </div>
        <div className="user-office">
          <span className="small">{u.office || (u.role === 'payee' ? 'Not LGU personnel' : 'No office')}</span>
          {u.requestedOffice && u.requestedOffice !== u.office && <span className="xs muted">Asked for: {u.requestedOffice}</span>}
          {tags.length > 0 && <span className="user-tags">{tags.map((t) => <span key={t} className="chip">{t}</span>)}</span>}
        </div>
        <div className="user-side">
          <span className="small muted user-role">{ROLE_NAMES[u.role] || u.role}</span>
          <span className={`badge ${u.active ? 'badge-green' : 'badge-yellow'}`}>{u.active ? 'Active' : 'Pending'}</span>
          {canManage && !u.active && <button className="btn btn-primary btn-sm" onClick={() => onChange({ active: true })}>Approve</button>}
          {editable && <button className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button>}
        </div>
      </div>
      {open && (
        <div className="user-edit">
          <label className="field"><span className="field-label">Office</span>
            <Select value={u.office || ''} disabled={u.role === 'payee'} onChange={(e) => onChange({ office: e.target.value, ...(e.target.value ? {} : { head: false }) })}>
              <option value="">— No office —</option>
              {[...new Set([...offices, ...(u.office ? [u.office] : [])])].map((o) => <option key={o}>{o}</option>)}
            </Select>
          </label>
          <label className="field"><span className="field-label">Role</span>
            {canManage ? (
              // Third Party: not LGU personnel; only signs the documents referred to them.
              <Select value={u.role} onChange={(e) => onChange({ role: e.target.value, ...(e.target.value === 'payee' ? { office: '', head: false, positions: [], canRefer: false } : {}) })}>
                <option value="user">User</option>
                <option value="payee">Third Party</option>
                {isSuper && <option value="admin">Admin</option>}
                {isSuper && <option value="superadmin">Superadmin</option>}
              </Select>
            ) : <span className="small">{ROLE_NAMES[u.role] || u.role}</span>}
          </label>
          {u.office && (
            <div className="field field-wide"><span className="field-label">Position</span>
              <PositionsPicker value={u.positions || []} choices={positionsOf(settings)} onNew={onNewPosition} onChange={(positions) => onChange({ positions })} />
            </div>
          )}
          <div className="field field-wide user-checks">
            {u.office && (
              <label className="check small">
                <input type="checkbox" checked={Boolean(u.head)} onChange={(e) => onChange({ head: e.target.checked })} />
                Office head <span className="muted">(sees all documents of the office)</span>
              </label>
            )}
            {u.role === 'user' && canManage && (
              <label className="check small">
                <input type="checkbox" checked={Boolean(u.canRefer)} onChange={(e) => onChange({ canRefer: e.target.checked })} />
                May route documents to any person
              </label>
            )}
          </div>
          {canManage && u.active && (
            <div className="field-wide user-danger">
              <button className="btn btn-ghost btn-sm" onClick={() => window.confirm(`Deactivate ${u.displayName || u.email}? They can no longer sign in to DMS.`) && onChange({ active: false })}>Deactivate</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function Users() {
  const { user: me, isSuper, settings, setSettings } = useAuth();
  const newPosition = async (name) => {
    const positions = await addPosition(settings, name);
    setSettings((s) => ({ ...s, positions }));
  };
  const offices = settings.offices || [];
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  // The directory (finding people by name, e.g. in Messages) follows approvals and office changes.
  const load = () => listUsers().then((u) => { syncDirectory(u).catch(() => {}); return u; }).then((u) => setUsers(u.sort((a, b) => Number(a.active) - Number(b.active) || (a.displayName || '').localeCompare(b.displayName || '')))).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const change = async (u, patch) => {
    setError('');
    try { await updateUser(u.id, patch); await load(); } catch (e) { setError(e.message); }
  };

  const canManage = (u) => u.id !== me.uid && (isSuper || u.role === 'user' || u.role === 'payee');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (users || [])
    .filter((u) => filter === 'all' || (filter === 'pending' ? !u.active : u.active))
    .filter((u) => words.every((w) => `${u.displayName} ${u.email} ${u.office || ''} ${(u.positions || []).join(' ')} ${ROLE_NAMES[u.role] || u.role}`.toLowerCase().includes(w)));
  const pending = (users || []).filter((u) => !u.active).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
        </div>
      </div>
      <div className="filters">
        <input className="search" placeholder="Search name, email, office or position…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
          <option value="all">All users</option>
          <option value="pending">Pending approval{pending ? ` (${pending})` : ''}</option>
          <option value="active">Active</option>
        </Select>
      </div>
      {error && <div className="alert">{error}</div>}
      {!users && !error && <div className="spinner" />}
      {users && (shown.length === 0 ? <p className="muted">No user matches.</p> : (
        <ul className="card user-list">
          {shown.map((u) => (
            <UserRow key={u.id} u={u} me={me} isSuper={isSuper} settings={settings} offices={offices} canManage={canManage(u)}
              onChange={(patch) => change(u, patch)} onNewPosition={newPosition} />
          ))}
        </ul>
      ))}
    </div>
  );
}
