import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments, listDocumentTypes, listUsers } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Icon, { Avatar } from '../components/Icon.jsx';

const ROLE_NAMES = { superadmin: 'Superadmin', admin: 'Administrator', user: 'User' };

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function InboxRow({ icon, tone = '', title, sub, n, to }) {
  return (
    <li>
      <Link to={to}>
        <span className={`ic ${tone}`}><Icon name={icon} /></span>
        <span className="t"><b>{title}</b><span>{sub}</span></span>
        <span className="n">{n}</span>
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const { user, profile, isAdmin, setupNotice, dismissSetupNotice } = useAuth();
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [pendingUsers, setPendingUsers] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      listDocumentTypes({ activeOnly: true }),
      listDocuments({ uid: user.uid, all: isAdmin }),
      isAdmin ? listUsers() : Promise.resolve([]),
    ])
      .then(([t, d, u]) => { setTypes(t); setDocs(d); setPendingUsers(u.filter((x) => !x.active).length); })
      .catch((e) => setError(e.message));
  }, [user.uid, isAdmin]);

  const mine = docs.filter((d) => d.createdBy === user.uid);
  const count = (list, status) => list.filter((d) => d.status === status).length;
  const year = String(new Date().getFullYear());
  const thisYear = docs.filter((d) => d.controlNo?.includes(`-${year}-`));
  const firstName = (profile.displayName || '').split(' ')[0];

  const items = [
    isAdmin && pendingUsers > 0 && <InboxRow key="u" icon="user" tone="red" title="Registrations to approve" sub="New accounts waiting for access" n={pendingUsers} to="/admin/users" />,
    isAdmin && types.length === 0 && <InboxRow key="t" icon="types" tone="red" title="No document formats yet" sub="Load the starter formats or create a document type" n="!" to="/admin/types" />,
    count(mine, 'draft') > 0 && <InboxRow key="d" icon="doc" title="Drafts to finish" sub="Documents you started but have not marked complete" n={count(mine, 'draft')} to="/documents" />,
    count(mine, 'complete') > 0 && <InboxRow key="c" icon="send" tone="blue" title="Complete — print and process" sub="Open each one to print it and see how to process it" n={count(mine, 'complete')} to="/documents" />,
  ].filter(Boolean);

  const glance = [
    ['Document formats available', types.length, '/formats'],
    [`Documents prepared, ${year}`, thisYear.length, '/documents'],
    ['Drafts', count(docs, 'draft'), '/documents'],
    ['Complete', count(docs, 'complete'), '/documents'],
    ['Cancelled', count(docs, 'cancelled'), '/documents'],
  ];

  return (
    <div className="page">
      <div className="home-head">
        <Avatar name={profile.displayName || profile.email} size="lg" />
        <div className="grow">
          <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p>{ROLE_NAMES[profile.role] || profile.role}{profile.office ? ` · ${profile.office}` : ''}</p>
        </div>
        <Link to="/new" className="btn btn-gold">+ Prepare document</Link>
      </div>
      {error && <div className="alert">{error}</div>}
      {setupNotice.length > 0 && (
        <div className="alert alert-ok row gap" style={{ justifyContent: 'space-between' }}>
          <span><b>FTS is set up.</b> Installed {setupNotice.join(', ')}. Review them under Document Types, Checklists and Settings.</span>
          <button className="btn btn-sm" onClick={dismissSetupNotice}>OK</button>
        </div>
      )}

      <div className="flow">
        <div className="now"><b>1. Choose the format</b>DV, OBR, PR, PO and more</div>
        <div><b>2. Encode, step by step</b>Guided by the instructions</div>
        <div><b>3. Checklist</b>Pick the transaction, tick Y / N/A</div>
        <div><b>4. Print</b>Form and checklist, for signing</div>
        <div><b>5. Process</b>Follow the processing guide</div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card">
            <div className="card-head"><h3>Needs your attention</h3><span className="small muted">{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : ''}</span></div>
            <ul className="inbox">
              {items.length ? items : (
                <li><div className="item"><span className="ic green"><Icon name="check" /></span>
                  <span className="t"><b>You&rsquo;re all caught up</b><span>Nothing is waiting for you.</span></span></div></li>
              )}
            </ul>
          </div>
          <div className="card">
            <div className="card-head"><h3>Prepare a document</h3><Link className="btn btn-sm" to="/formats">All formats</Link></div>
            {types.length === 0 && <div className="empty">No document formats yet.</div>}
            <div className="type-chips">
              {types.map((t) => (
                <Link key={t.id} to={`/new/${t.id}`} className="type-chip"><b>{t.code}</b><span>{t.name}</span></Link>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="card-head"><h3>At a glance</h3><span className="small muted">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
            <ul className="glance">
              {glance.map(([l, v, to]) => <li key={l}><Link to={to}><span>{l}</span></Link><b>{v}</b></li>)}
            </ul>
          </div>
          <div className="card">
            <div className="card-head"><h3>Recent documents</h3><Link className="btn btn-sm" to="/documents">Open list</Link></div>
            <ul className="upcoming">
              {docs.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <span><span className="when">{d.updatedAt?.toDate?.().toLocaleString() || ''}</span>
                    <Link to={`/documents/${d.id}`}>{d.controlNo}</Link> — {d.title}</span>
                  <StatusBadge status={d.status} />
                </li>
              ))}
              {docs.length === 0 && <li className="muted">Nothing prepared yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
