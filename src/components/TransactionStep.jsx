import { groupItems } from '../lib/checklists.js';
import TransactionPicker from './TransactionPicker.jsx';

// First step for DV, Payroll and Liquidation Report: choose the type of transaction,
// then see the documents it requires before encoding anything.
export default function TransactionStep({ kind, transaction, onTransaction }) {
  const items = transaction?.items || [];
  const required = items.filter((i) => i.required).length;
  return (
    <div>
      <TransactionPicker kind={kind} value={transaction} onPick={onTransaction} />
      {transaction && (
        <>
          <div className="alert-info">
            Prepare these documents for <b>{transaction.code}</b>: <b>{required}</b> always required and{' '}
            <b>{items.length - required}</b> if applicable. You will tick them in the Checklist step.
            Click <b>Print checklist</b> to keep a copy while you gather them.
          </div>
          {transaction.description && <p className="small muted" style={{ whiteSpace: 'pre-line' }}>{transaction.description}</p>}
          <div className="req-list">
            {groupItems(items).map((g, gi) => (
              <div key={gi}>
                {g.group && <div className="cl-groupname">{g.group}</div>}
                <ol>
                  {g.items.map((item) => (
                    <li key={item.id}>
                      <span className={`badge ${item.required ? 'badge-red' : 'badge-gray'}`}>{item.required ? 'Required' : 'If applicable'}</span>
                      <span className="t">{item.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {(transaction.basis || []).length > 0 && <p className="small muted"><b>Basis:</b> {transaction.basis.join('; ')}</p>}
          {(transaction.notes || []).map((n, i) => <p key={i} className="small muted"><i>{n}</i></p>)}
        </>
      )}
    </div>
  );
}
