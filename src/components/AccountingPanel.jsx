import { byAccounting, computeFields } from '../lib/forms.js';
import FieldInput from './FieldInput.jsx';

// The Accounting Office's part of a saved document (fields marked "Filled in by Accounting"):
// for the DV, the Disbursement No., its date, and deductions or additions to the amount.
// `data` is the working copy shown in the preview; `onSave` stores it.
export default function AccountingPanel({ type, data, onChange, onSave, saved, busy }) {
  const fields = (type?.fields || []).filter(byAccounting);
  if (!fields.length) return null;
  return (
    <section className="card">
      <h3>Accounting</h3>
      <p className="small muted">Filled in by the Accounting Office. The preview updates as you type.</p>
      <div className="fields">
        {fields.map((f) => (
          <FieldInput key={f.key} field={f} value={data[f.key]}
            onChange={(v) => onChange(computeFields(type.fields, { ...data, [f.key]: v }))} />
        ))}
      </div>
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy || saved} onClick={onSave}>Save accounting entries</button>
        {saved && <span className="small muted">Saved</span>}
      </div>
    </section>
  );
}
