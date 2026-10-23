import { computeRow } from '../lib/forms.js';
import { formatCurrency, sumColumn } from '../lib/template.js';

function inputType(type) {
  if (type === 'number' || type === 'currency') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}

function TableInput({ field, value, onChange, disabled }) {
  const rows = Array.isArray(value) ? value : [];
  const columns = field.columns || [];
  const blank = () => Object.fromEntries(columns.map((c) => [c.key, '']));
  const setRow = (i, key, v) => {
    const next = rows.map((r, idx) => (idx === i ? computeRow(columns, { ...r, [key]: v }) : r));
    onChange(next);
  };
  return (
    <div className="table-input">
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }}>#</th>
            {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            {!disabled && <th style={{ width: 40 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="muted">{i + 1}</td>
              {columns.map((c) => (
                <td key={c.key}>
                  <input
                    type={inputType(c.type)}
                    step={c.type === 'currency' ? '0.01' : undefined}
                    value={row[c.key] ?? ''}
                    readOnly={Boolean(c.compute)}
                    disabled={disabled}
                    className={c.compute ? 'computed' : ''}
                    onChange={(e) => setRow(i, c.key, e.target.value)}
                  />
                </td>
              ))}
              {!disabled && (
                <td>
                  <button type="button" className="btn-icon" title="Remove row"
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>×</button>
                </td>
              )}
            </tr>
          ))}
          {columns.some((c) => c.total) && rows.length > 0 && (
            <tr className="total-row">
              <td />
              {columns.map((c, idx) => (
                <td key={c.key} className="num">
                  {c.total ? formatCurrency(sumColumn(rows, c.key)) : idx === 0 ? 'TOTAL' : ''}
                </td>
              ))}
              {!disabled && <td />}
            </tr>
          )}
        </tbody>
      </table>
      {!disabled && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rows, blank()])}>
          + Add row
        </button>
      )}
    </div>
  );
}

export default function FieldInput({ field, value, onChange, disabled, invalid }) {
  const label = (
    <label className="field-label" htmlFor={`f-${field.key}`}>
      {field.label} {field.required && <span className="req">*</span>}
    </label>
  );
  let control;
  if (field.type === 'table') {
    control = <TableInput field={field} value={value} onChange={onChange} disabled={disabled} />;
  } else if (field.type === 'textarea') {
    control = <textarea id={`f-${field.key}`} rows={3} value={value ?? ''} disabled={disabled}
      placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === 'select') {
    control = (
      <select id={`f-${field.key}`} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else {
    control = <input id={`f-${field.key}`} type={inputType(field.type)} value={value ?? ''} disabled={disabled}
      readOnly={Boolean(field.compute)} className={field.compute ? 'computed' : ''}
      step={field.type === 'currency' ? '0.01' : undefined} placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={`field ${field.type === 'table' || field.type === 'textarea' ? 'field-wide' : ''} ${invalid ? 'invalid' : ''}`}>
      {label}
      {control}
      {field.help && <div className="help">{field.help}</div>}
    </div>
  );
}
