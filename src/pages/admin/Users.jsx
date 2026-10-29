import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { listUsers, updateUser } from '../../lib/api.js';

export default function Users() {
  const { user: me, isSuper, settings } = useAuth();
  const offices = settings.offices || [];
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = () => listUsers().then((u) => setUsers(u.sort((a, b) => Number(a.active) - Number(b.active) || (a.displayName || '').localeCompare(b.displayName || '')))).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const change = async (u, patch) => {
    setError('');
    try { await updateUser(u.id, patch); await load(); } catch (e) { setError(e.message); }
  };

  const canManage = (u) => u.id !== me.uid && (isSuper || u.role === 'user');
  const shown = (users || []).filter((u) => filter === 'all' || (filter === 'pending' ? !u.active : u.active));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">Approve new accounts, assign each to an office and set roles. A user sees the documents they prepared and
            those waiting in their office; the <b>office head</b> sees every document of the office. Only the superadmin can grant admin
            rights. The list of offices is in Settings.</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All users</option>
          <option value="pending">Pending approval</option>
          <option value="active">Active</option>
        </select>
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
                      <select value={u.office || ''} onChange={(e) => change(u, { office: e.target.value })}>
                        <option value="">— No office —</option>
                        {[...new Set([...offices, ...(u.office ? [u.office] : [])])].map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (u.office || '—')}
                    {u.requestedOffice && u.requestedOffice !== u.office && <div className="small muted">Asked for: {u.requestedOffice}</div>}
                    {u.office && (canManage(u) || (isSuper && u.id === me.uid) ? (
                      <label className="check small head-check">
                        <input type="checkbox" checked={Boolean(u.head)} onChange={(e) => change(u, { head: e.target.checked })} />
                        Office head (sees all documents of the office)
                      </label>
                    ) : u.head && <div className="small"><span className="badge badge-blue">Office head</span></div>)}
                  </td>
                  <td>
                    {isSuper && u.id !== me.uid ? (
                      <select value={u.role} onChange={(e) => change(u, { role: e.target.value })}>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                    ) : u.role}
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
