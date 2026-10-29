import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { importChecklists, listChecklists, loadBundledChecklists } from '../lib/api.js';
import { CHECKLIST_CATEGORIES, searchChecklists } from '../lib/checklists.js';

export default function Checklists() {
  const { actor, isAdmin } = useAuth();
  const [list, setList] = useState(null);
  const [bundledCount, setBundledCount] = useState(0);
  const [kind, setKind] = useState('disbursement');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = () => listChecklists().then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (isAdmin) loadBundledChecklists().then((b) => setBundledCount(b.length)); }, [isAdmin]);

  const groups = useMemo(() => {
    const found = searchChecklists(list, q, kind);
    const order = [...CHECKLIST_CATEGORIES, 'Others'];
    const by = {};
    for (const c of found) (by[c.category] ||= []).push(c);
    return Object.entries(by).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [list, q, kind]);

  const loadLibrary = async (overwrite) => {
    if (overwrite && !window.confirm('Replace every checklist with the original library? Edits made in DMS to those checklists will be lost.')) return;
    setBusy('Loading the checklist library…');
    setError('');
    try {
      const bundled = await loadBundledChecklists();
      const have = new Set((list || []).map((c) => c.code));
      await importChecklists(overwrite ? bundled : bundled.filter((c) => !have.has(c.code)), actor);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const count = (k) => (list || []).filter((c) => c.kind === k).length;
  const missing = bundledCount - (list || []).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Checklists</h1>
          <p>Required documents for each type of disbursement and liquidation, from the Municipal Accounting Office.
            Open one to read or print it.</p>
        </div>
        {isAdmin && (
          <div className="row gap wrap">
            {list && missing > 0 && (
              <button className="btn btn-gold" disabled={!!busy} onClick={() => loadLibrary(false)}>
                Load checklist library ({missing} {list.length ? 'missing' : 'checklists'})
              </button>
            )}
            {list && list.length > 0 && (
              <button className="btn" disabled={!!busy} onClick={() => loadLibrary(true)}>Reload original library</button>
            )}
            <Link className="btn btn-primary" to="/admin/checklists/new">+ New checklist</Link>
          </div>
        )}
      </div>
      {busy && <div className="alert-info">{busy}</div>}
      {error && <div className="alert">{error}</div>}

      <div className="filters">
        <div className="tabs" style={{ margin: 0 }}>
          <button className={kind === 'disbursement' ? 'active' : ''} onClick={() => setKind('disbursement')}>Disbursement ({count('disbursement')})</button>
          <button className={kind === 'liquidation' ? 'active' : ''} onClick={() => setKind('liquidation')}>Liquidation ({count('liquidation')})</button>
        </div>
        <input className="search" type="search" placeholder="Search by number or name, e.g. 1613 or direct acquisition"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!list && !error && <div className="spinner" />}
      {list && list.length === 0 && (
        <div className="card empty">No checklists yet. {isAdmin ? 'Click “Load checklist library” above.' : 'Ask an administrator to load the checklist library.'}</div>
      )}
      {groups.map(([category, items]) => (
        <section key={category} className="card">
          <div className="card-head"><h3>{category}</h3><span className="small muted">{items.length}</span></div>
          <ul className="cl-list">
            {items.map((c) => (
              <li key={c.code}>
                <Link to={`/checklists/${c.code}`}>
                  <span className="code">{c.code}</span>
                  <span className="t">{c.title}</span>
                  <span className="meta">{c.items.filter((i) => i.required).length} required · {c.items.length} items</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {list && list.length > 0 && groups.length === 0 && <div className="card empty">No checklist matches “{q}”.</div>}
    </div>
  );
}
