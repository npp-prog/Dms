import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments, listDocumentTypes } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Dashboard() {
  const { user, profile, isAdmin } = useAuth();
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listDocumentTypes({ activeOnly: true }), listDocuments({ uid: user.uid, all: isAdmin })])
      .then(([t, d]) => { setTypes(t); setDocs(d); })
      .catch((e) => setError(e.message));
  }, [user.uid, isAdmin]);

  const count = (status) => docs.filter((d) => d.status === status).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Welcome, {profile.displayName}</h1>
          <p className="muted">Prepare financial documents using the official formats and checklists. Completed documents are transmitted through DMS.</p>
        </div>
        <Link to="/new" className="btn btn-primary">+ Prepare document</Link>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="stats">
        <div className="stat"><span>{types.length}</span>Document formats</div>
        <div className="stat"><span>{count('draft')}</span>Drafts</div>
        <div className="stat"><span>{count('complete')}</span>Complete, for DMS</div>
        <div className="stat"><span>{count('transmitted')}</span>Transmitted via DMS</div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>Quick start</h3>
          {types.length === 0 && (
            <p className="muted">No document types yet. {isAdmin
              ? <Link to="/admin/types">Add or load starter formats.</Link>
              : 'Ask your administrator to add document formats.'}</p>
          )}
          <div className="type-chips">
            {types.map((t) => (
              <Link key={t.id} to={`/new/${t.id}`} className="type-chip">
                <b>{t.code}</b><span>{t.name}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>Recent documents</h3>
          {docs.length === 0 && <p className="muted">Nothing here yet.</p>}
          <ul className="list">
            {docs.slice(0, 8).map((d) => (
              <li key={d.id}>
                <Link to={`/documents/${d.id}`}><b>{d.controlNo}</b> — {d.title}</Link>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
