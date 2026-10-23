import { useEffect, useMemo, useState } from 'react';
import { listChecklists } from '../lib/api.js';
import {
  checklistProgress, effectiveChecklist, groupItems, isChecked, searchChecklists, transactionSnapshot,
} from '../lib/checklists.js';

function Answer({ item, value, onChange }) {
  const y = isChecked(value);
  const na = value === 'NA';
  return (
    <div className={`cl-answer ${y ? 'done' : na ? 'na' : ''}`}>
      <div className="yn" role="group" aria-label={item.label}>
        <button type="button" className={y ? 'on-y' : ''} onClick={() => onChange(y ? undefined : 'Y')}>Y</button>
        <button type="button" className={na ? 'on-na' : ''} disabled={item.required}
          title={item.required ? 'Always required' : 'Not applicable'} onClick={() => onChange(na ? undefined : 'NA')}>N/A</button>
      </div>
      <div className="lbl">{item.label} {item.required && <span className="req">required</span>}</div>
    </div>
  );
}

// Checklist step of the wizard. For library-based document types (DV, LR, ...)
// the user first picks the transaction type, which loads its checklist.
export default function ChecklistStep({ type, transaction, onTransaction, state, onState }) {
  const library = type.checklistSource && type.checklistSource !== 'own';
  const [all, setAll] = useState(null);
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(!transaction);
  const [error, setError] = useState('');

  useEffect(() => {
    if (library) listChecklists().then(setAll).catch((e) => setError(e.message));
  }, [library]);

  const results = useMemo(() => searchChecklists(all, q, type.checklistSource).slice(0, 60), [all, q, type.checklistSource]);
  const checklist = effectiveChecklist(type, transaction);
  const progress = checklistProgress(checklist?.items, state);

  return (
    <div>
      {library && (
        <>
          {transaction && !picking ? (
            <div className="chosen">
              <span className="code">{transaction.code}</span>
              <span className="t"><b>{transaction.title}</b><div className="small muted">{transaction.category}</div></span>
              <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>Change</button>
            </div>
          ) : (
            <div className="card" style={{ boxShadow: 'none' }}>
              <label className="field-label" htmlFor="tx-q">What type of transaction is this?</label>
              <input id="tx-q" type="search" autoFocus placeholder="Type a checklist number or words, e.g. 1613, direct acquisition, travel"
                value={q} onChange={(e) => setQ(e.target.value)} />
              {error && <div className="alert">{error}</div>}
              {!all && !error && <div className="spinner" />}
              {all && all.length === 0 && <div className="alert">The checklist library is empty. Ask an administrator to load it (Checklists page).</div>}
              {all && all.length > 0 && (
                <div className="picker-results">
                  {results.map((c) => (
                    <button type="button" key={c.code} onClick={() => {
                      if (transaction?.code !== c.code) onState({});
                      onTransaction(transactionSnapshot(c));
                      setPicking(false);
                    }}>
                      <span className="code">{c.code}</span><span>{c.title}<div className="small muted">{c.category}</div></span>
                    </button>
                  ))}
                  {results.length === 0 && <div className="empty">No checklist matches.</div>}
                </div>
              )}
              {transaction && <button type="button" className="btn btn-sm" style={{ marginTop: '.6rem' }} onClick={() => setPicking(false)}>Keep {transaction.code}</button>}
            </div>
          )}
        </>
      )}

      {checklist && !picking && (
        <>
          {checklist.items.length === 0 && <p className="muted">No checklist for this document type.</p>}
          {checklist.items.length > 0 && (
            <>
              <p className="small muted">Tick <b>Y</b> for each document you have attached, or <b>N/A</b> if it does not apply.
                Answered {progress.answered} of {progress.total}.</p>
              <div className="progress"><div style={{ width: `${(100 * progress.answered) / progress.total}%` }} /></div>
              <div className="cl-answers">
                {groupItems(checklist.items).map((g, gi) => (
                  <div key={gi} className="cl-answers">
                    {g.group && <div className="cl-groupname">{g.group}</div>}
                    {g.items.map((item) => (
                      <Answer key={item.id} item={item} value={state[item.id]}
                        onChange={(v) => onState({ ...state, [item.id]: v })} />
                    ))}
                  </div>
                ))}
              </div>
              {(checklist.basis || []).length > 0 && <p className="small muted"><b>Basis:</b> {checklist.basis.join('; ')}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
