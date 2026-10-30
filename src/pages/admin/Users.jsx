import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { addPosition, listUsers, syncDirectory, updateUser } from '../../lib/api.js';
import { positionsOf } from '../../lib/defaults.js';
import Select from '../../components/Select.jsx';
import PositionsPicker from '../../components/PositionsPicker.jsx';

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

  // The directory (finding people by name, e.g. in Messages) follows approvals and office changes.
  const load = () => listUsers().then((u) => { syncDirectory(u).catch(() => {}); return u; }).then((u) => setUsers(u.sort((a, b) => Number(a.active) - Number(b.active) || (a.displayName || '').localeCompare(b.displayName || '')))).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const change = async (u, patch) => {
    setError('');
    try { await updateUser(u.id, patch); await load(); } catch (e) { setError(e.message); }
  };

  const canManage = (u) => u.id !== me.uid && (isSuper || u.role === 'user' || u.role === 'payee');
  const shown = (users || []).filter((u) => filter === 'all' || (filter === 'pending' ? !u.active : u.active));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All users</option>
          <option value="pending">Pending approval</option>
          <option value="active">Active</option>
        </Select>
      </div>
      {error && <div className="alert">{error}</div>}
      {!users && !error && <div className="spinner" />}
      {users && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Office</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.displayName}</b>{u.id === me.uid && ' (you)'}</td>
                  <td>{u.email}</td>
                  <td>
                    {canManage(u) || (isSuper && u.id === me.uid) ? (
                      <Select value={u.office || ''} onChange={(e) => change(u, { office: e.target.value })}>
                        <option value="">— No office —</option>
                        {[...new Set([...offices, ...(u.office ? [u.office] : [])])].map((o) => <option key={o}>{o}</option>)}
                      </Select>
                    ) : (u.office || '—')}
                    {u.requestedOffice && u.requestedOffice !== u.office && <div className="small muted">Asked for: {u.requestedOffice}</div>}
                    {u.office && (canManage(u) || (isSuper && u.id === me.uid) ? (
                      <label className="check small head-check">
                        <input type="checkbox" checked={Boolean(u.head)} onChange={(e) => change(u, { head: e.target.checked })} />
                        Office head (sees all documents of the office)
                      </label>
                    ) : u.head && <div className="small"><span className="badge badge-blue">Office head</span></div>)}
                    {u.office && (canManage(u) || (isSuper && u.id === me.uid) ? (
                      <div className="user-positions">
                        <span className="small muted">Position</span>
                        <PositionsPicker value={u.positions || []} choices={positionsOf(settings)} onNew={newPosition}
                          onChange={(positions) => change(u, { positions })} />
                      </div>
                    ) : u.positions?.length > 0 && <div className="small">{u.positions.join(', ')}</div>)}
                    {u.role === 'user' && (canManage(u) ? (
                      <label className="check small head-check">
                        <input type="checkbox" checked={Boolean(u.canRefer)} onChange={(e) => change(u, { canRefer: e.target.checked })} />
                        May route documents to any person
                      </label>
                    ) : u.canRefer && <div className="small"><span className="badge badge-blue">Routes to any person</span></div>)}
                  </td>
                  <td>
                    {canManage(u) ? (
                      // Third Party: not LGU personnel; only signs the documents referred to them.
                      <Select value={u.role} onChange={(e) => change(u, { role: e.target.value, ...(e.target.value === 'payee' ? { office: '', head: false, positions: [], canRefer: false } : {}) })}>
                        <option value="user">User</option>
                        <option value="payee">Third Party</option>
                        {isSuper && <option value="admin">Admin</option>}
                        {isSuper && <option value="superadmin">Superadmin</option>}
                      </Select>
                    ) : ({ payee: 'Third Party' }[u.role] || u.role)}
                  </td>
                  <td><span className={`badge ${u.active ? 'badge-green' : 'badge-yellow'}`}>{u.active ? 'Active' : 'Pending / inactive'}</span></td>
                  <td>
                    {canManage(u) && (u.active
                      ? <button className="btn btn-ghost btn-sm" onClick={() => change(u, { active: false })}>Deactivate</button>
                      : <button className="btn btn-primary btn-sm" onClick={() => change(u, { active: true })}>Approve</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
