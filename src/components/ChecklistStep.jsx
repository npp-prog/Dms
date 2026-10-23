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
      <div className="lbl">{item.label} {item.required && <span className="req">required</span>}</div>
    </div>
  );
}

// Checklist step of the wizard: tick Y / N/A for each required document.
// For library-based document types (DV, Payroll, LR) the transaction was chosen in step 1.
export default function ChecklistStep({ type, transaction, state, onState, onChangeTransaction }) {
  const library = type.checklistSource && type.checklistSource !== 'own';
  const checklist = effectiveChecklist(type, transaction);
  const progress = checklistProgress(checklist?.items, state);

  return (
    <div>
      {library && (transaction ? (
        <div className="chosen">
          <span className="code">{transaction.code}</span>
          <span className="t"><b>{transaction.title}</b><div className="small muted">{transaction.category}</div></span>
          <button type="button" className="btn btn-sm" onClick={onChangeTransaction}>Change</button>
        </div>
      ) : (
        <div className="alert">No type of transaction chosen.{' '}
          <button type="button" className="link" onClick={onChangeTransaction}>Choose it in step 1</button>.</div>
      ))}

      {checklist && (
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
