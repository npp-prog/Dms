import { useState } from 'react';
import TransactionPicker from './TransactionPicker.jsx';
import { toCaps } from '../lib/forms.js';
import { checklistProgress, effectiveChecklist, groupItems, isChecked } from '../lib/checklists.js';

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
      <div className="lbl">{item.label} {item.required && <span className="req">required</span>}
        {item.details && <div className="muted small">{item.details}</div>}</div>
    </div>
  );
}

// Checklist step of the wizard: tick Y / N/A for each required document.
// For library-based document types (DV, Payroll, LR) the type of transaction is chosen here,
// which loads its checklist from the library.
export default function ChecklistStep({ type, transaction, state, onState, onTransaction, additional = [], onAdditional }) {
  const [picking, setPicking] = useState(false);
  const library = type.checklistSource && type.checklistSource !== 'own';
  const checklist = effectiveChecklist(type, transaction);
  const progress = checklistProgress(checklist?.items, state);

  return (
    <div>
      {library && (transaction && !picking ? (
        <div className="chosen">
          <span className="code">{transaction.code}</span>
          <span className="t"><b>{transaction.title}</b><div className="small muted">{transaction.category}</div></span>
          <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>Change</button>
        </div>
      ) : (
        <TransactionPicker kind={type.checklistSource} value={transaction}
          onPick={(t) => { onTransaction(t); setPicking(false); }} />
      ))}

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

      {onAdditional && (
        <div className="additional-docs">
          <h4>Additional documents</h4>
          <p className="small muted">Attaching something that is not on the checklist? Add it here. It is listed in the
            Additional Documents box of the printed checklist.</p>
          {additional.map((text, i) => (
            <div key={i} className="row gap additional-row">
              <span className="muted">{i + 1}.</span>
              <input className="caps" value={text} placeholder="Document, e.g. Certificate of Appearance"
                onChange={(e) => onAdditional(additional.map((t, j) => (j === i ? toCaps(e.target.value) : t)))} />
              <button type="button" className="btn-icon" title="Remove" onClick={() => onAdditional(additional.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAdditional([...additional, ''])}>+ Add document</button>
        </div>
      )}
    </div>
  );
}
