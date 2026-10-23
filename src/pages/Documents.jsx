import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import { STATUSES } from '../lib/defaults.js';
import StatusBadge from '../components/StatusBadge.jsx';

function fmt(ts) {
  return ts?.toDate ? ts.toDate().toLocaleString() : '';
}

export default function Documents() {
  const { user, isAdmin } = useAuth();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', type: '' });

  useEffect(() => {
    listDocuments({ uid: user.uid, all: isAdmin }).then(setDocs).catch((e) => setError(e.message));
  }, [user.uid, isAdmin]);

  const types = useMemo(() => [...new Set((docs || []).map((d) => d.typeCode))].sort(), [docs]);
  const shown = useMemo(() => (docs || []).filter((d) => {
    const q = filters.q.toLowerCase();
    return (!filters.status || d.status === filters.status)
      && (!filters.type || d.typeCode === filters.type)
      && (!q || `${d.controlNo} ${d.title} ${d.createdByName}`.toLowerCase().includes(q));
  }), [docs, filters]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{isAdmin ? 'All Documents' : 'My Documents'}</h1>
        <Link to="/new" className="btn btn-primary">+ Prepare document</Link>
      </div>
      <div className="filters">
        <input className="search" placeholder="Search control no., payee, subject…" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr><th>Control No.</th><th>Type</th><th>Payee / Subject</th>{isAdmin && <th>Prepared by</th>}<th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="muted">No documents found.</td></tr>}
              {shown.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                  <td>{d.typeCode}</td>
                  <td>{d.title}</td>
                  {isAdmin && <td>{d.createdByName}</td>}
                  <td><StatusBadge status={d.status} /></td>
                  <td className="small">{fmt(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
