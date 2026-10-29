import { useEffect, useMemo, useState } from 'react';
import { listChecklists } from '../lib/api.js';
import { searchChecklists, transactionSnapshot } from '../lib/checklists.js';

// Search the checklist library (disbursement or liquidation) and pick the type of transaction.
export default function TransactionPicker({ kind, value, onPick }) {
  const [all, setAll] = useState(null);
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(!value);
  const [error, setError] = useState('');

  useEffect(() => { listChecklists().then(setAll).catch((e) => setError(e.message)); }, []);
  const results = useMemo(() => searchChecklists(all, q, kind).slice(0, 60), [all, q, kind]);

  if (value && !picking) {
    return (
      <div className="chosen">
        <span className="code">{value.code}</span>
        <span className="t"><b>{value.title}</b><div className="small muted">{value.category}</div></span>
        <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>Change</button>
      </div>
    );
  }
  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <label className="field-label" htmlFor="tx-q">What type of transaction is this?</label>
      <input id="tx-q" type="search" autoFocus placeholder="Type a checklist number or words"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <div className="alert">{error}</div>}
      {!all && !error && <div className="spinner" />}
      {all && all.length === 0 && <div className="alert">The checklist library is empty. Ask an administrator to load it (Checklists page).</div>}
      {all && all.length > 0 && (
        <div className="picker-results">
          {results.map((c) => (
            <button type="button" key={c.code} onClick={() => { onPick(transactionSnapshot(c)); setPicking(false); }}>
              <span className="code">{c.code}</span><span>{c.title}<div className="small muted">{c.category}</div></span>
            </button>
          ))}
          {results.length === 0 && <div className="empty">No checklist matches.</div>}
        </div>
      )}
      {value && <button type="button" className="btn btn-sm" style={{ marginTop: '.6rem' }} onClick={() => setPicking(false)}>Keep {value.code}</button>}
    </div>
  );
}
