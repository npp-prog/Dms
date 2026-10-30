import { computeRow, toCaps } from '../lib/forms.js';
import { formatCurrency, sumColumn } from '../lib/template.js';
import Select from './Select.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fundsOf } from '../lib/defaults.js';

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
            {columns.map((c) => <th key={c.key} style={c.type === 'textarea' ? { minWidth: 260 } : undefined}>{c.label}</th>)}
            {!disabled && <th style={{ width: 40 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="muted">{i + 1}</td>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.type === 'textarea' ? (
                    <textarea rows={3} value={row[c.key] ?? ''} disabled={disabled} className={c.keepCase ? '' : 'caps'}
                      onChange={(e) => setRow(i, c.key, c.keepCase ? e.target.value : toCaps(e.target.value))} />
                  ) : (
                    <input
                      type={inputType(c.type)}
                      step={c.type === 'currency' ? '0.01' : undefined}
                      value={row[c.key] ?? ''}
                      readOnly={Boolean(c.compute)}
                      disabled={disabled}
                      className={c.compute ? 'computed' : c.keepCase ? '' : 'caps'}
                      onChange={(e) => setRow(i, c.key, inputType(c.type) === 'text' && !c.keepCase ? toCaps(e.target.value) : e.target.value)}
                    />
                  )}
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
  const funds = fundsOf(useAuth().settings);
  const label = (
    <label className="field-label" htmlFor={`f-${field.key}`}>
      {field.label} {field.required && <span className="req">*</span>}
    </label>
  );
  let control;
  if (field.type === 'table') {
    control = <TableInput field={field} value={value} onChange={onChange} disabled={disabled} />;
  } else if (field.type === 'textarea') {
    control = <textarea id={`f-${field.key}`} rows={3} value={value ?? ''} disabled={disabled} className={field.keepCase ? '' : 'caps'}
      onChange={(e) => onChange(field.keepCase ? e.target.value : toCaps(e.target.value))} />;
  } else if (field.type === 'select') {
    // The Fund field lists the LGU's funds (Settings), not the ones saved in the format; a value
    // chosen earlier stays listed.
    const listed = field.key === 'fund' ? funds : (field.options || []);
    const options = value && !listed.includes(value) ? [...listed, value] : listed;
    control = (
      <Select id={`f-${field.key}`} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  } else {
    control = <input id={`f-${field.key}`} type={inputType(field.type)} value={value ?? ''} disabled={disabled}
      readOnly={Boolean(field.compute)} className={field.compute ? 'computed' : field.keepCase ? '' : 'caps'}
      step={field.type === 'currency' ? '0.01' : undefined}
      onChange={(e) => onChange(inputType(field.type) === 'text' && !field.keepCase ? toCaps(e.target.value) : e.target.value)} />;
  }
  return (
    <div className={`field ${field.type === 'table' || field.type === 'textarea' ? 'field-wide' : ''} ${invalid ? 'invalid' : ''}`}>
      {label}
      {control}
      {field.help && <div className="help">{field.help}</div>}
    </div>
  );
}
