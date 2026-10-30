import { byAccounting, computeFields } from '../lib/forms.js';
import FieldInput from './FieldInput.jsx';
import { assignedFields } from '../lib/workflow.js';

// The Accounting Office's part of a saved document (fields marked "Filled in by Accounting"):
// for the DV, deductions or additions to the amount. A number the route assigns after the PDF is
// made (e.g. the Disbursement No. and its date) is not typed here: the office assigns it on the PDF.
// `data` is the working copy shown in the preview; `onSave` stores it.
export default function AccountingPanel({ type, doc, data, onChange, onSave, saved, busy }) {
  const assigned = assignedFields(type, doc);
  const fields = (type?.fields || []).filter((f) => byAccounting(f) && !assigned.has(f.key));
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
