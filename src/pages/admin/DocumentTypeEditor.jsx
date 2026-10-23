import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { getDocumentType, saveDocumentType } from '../../lib/api.js';
import { COLUMN_TYPES, FIELD_TYPES } from '../../lib/defaults.js';
import { slugKey } from '../../lib/forms.js';
import { generateDefaultTemplate } from '../../lib/template.js';
import DocumentPreview from '../../components/DocumentPreview.jsx';

const EMPTY = {
  code: '', name: '', category: '', description: '', active: true,
  paperSize: 'A4', orientation: 'portrait', steps: [], fields: [], checklist: [], template: '',
};

const TABS = ['General', 'Guided Steps', 'Fields', 'Checklist', 'Format / Template'];

const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;

function move(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function RowActions({ list, i, onChange }) {
  return (
    <div className="row-actions">
      <button type="button" className="btn-icon" title="Move up" onClick={() => onChange(move(list, i, -1))}>↑</button>
      <button type="button" className="btn-icon" title="Move down" onClick={() => onChange(move(list, i, 1))}>↓</button>
      <button type="button" className="btn-icon danger" title="Remove" onClick={() => onChange(list.filter((_, idx) => idx !== i))}>×</button>
    </div>
  );
}

function ColumnsEditor({ columns = [], onChange }) {
  const set = (i, patch) => onChange(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  return (
    <div className="sub-editor">
      <div className="small muted">Table columns. “Computed” multiplies other column keys, e.g. <code>qty*unitCost</code>.</div>
      {columns.map((c, i) => (
        <div key={i} className="editor-row compact">
          <input placeholder="Column label" value={c.label}
            onChange={(e) => set(i, { label: e.target.value, ...(c.keyTouched ? {} : { key: slugKey(e.target.value) }) })} />
          <input placeholder="key" value={c.key} onChange={(e) => set(i, { key: e.target.value, keyTouched: true })} />
          <select value={c.type} onChange={(e) => set(i, { type: e.target.value })}>
            {COLUMN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input placeholder="Computed (a*b)" value={c.compute || ''} onChange={(e) => set(i, { compute: e.target.value })} />
          <label className="check"><input type="checkbox" checked={Boolean(c.total)} onChange={(e) => set(i, { total: e.target.checked })} /> Total</label>
          <RowActions list={columns} i={i} onChange={onChange} />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm"
        onClick={() => onChange([...columns, { key: '', label: '', type: 'text' }])}>+ Column</button>
    </div>
  );
}

export default function DocumentTypeEditor() {
  const { typeId } = useParams();
  const navigate = useNavigate();
  const { actor, settings } = useAuth();
  const [type, setType] = useState(typeId ? null : EMPTY);
  const [tab, setTab] = useState(TABS[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeId) getDocumentType(typeId).then((t) => (t ? setType({ ...EMPTY, ...t }) : setError('Not found'))).catch((e) => setError(e.message));
  }, [typeId]);

  const issues = useMemo(() => {
    if (!type) return [];
    const list = [];
    if (!type.code.trim()) list.push('Code is required.');
    if (!type.name.trim()) list.push('Name is required.');
    const keys = type.fields.map((f) => f.key);
    if (keys.some((k) => !k)) list.push('Every field needs a key.');
    if (new Set(keys).size !== keys.length) list.push('Field keys must be unique.');
    if (keys.some((k) => k && !/^[A-Za-z_][\w]*$/.test(k))) list.push('Field keys may only contain letters, numbers and underscores.');
    if (type.checklist.some((c) => !c.label.trim())) list.push('Every checklist item needs a label.');
    return list;
  }, [type]);

  if (error) return <div className="page"><div className="alert">{error}</div></div>;
  if (!type) return <div className="page"><div className="spinner" /></div>;

  const patch = (p) => { setSaved(false); setType((t) => ({ ...t, ...p })); };
  const setList = (key) => (list) => patch({ [key]: list });
  const setItem = (key, i, p) => patch({ [key]: type[key].map((x, idx) => (idx === i ? { ...x, ...p } : x)) });

  const save = async () => {
    if (issues.length) { setError(issues.join(' ')); return; }
    setSaving(true);
    setError('');
    try {
      const clean = {
        ...type,
        code: type.code.trim().toUpperCase(),
        fields: type.fields.map(({ keyTouched, ...f }) => ({
          ...f,
          ...(f.columns ? { columns: f.columns.map(({ keyTouched: _k, ...c }) => c) } : {}),
        })),
        template: type.template || generateDefaultTemplate(type),
      };
      const id = await saveDocumentType(typeId, clean, actor);
      setSaved(true);
      if (!typeId) navigate(`/admin/types/${id}`, { replace: true });
      else setType({ ...clean, version: (Number(type.version) || 1) + 1 });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/admin/types">Document Types</Link> / {type.code || 'New'}</div>
          <h1>{typeId ? `Edit ${type.code}` : 'New Document Type'} {type.version && <span className="muted small">v{type.version}</span>}</h1>
        </div>
        <div className="row gap">
          {saved && <span className="badge badge-green">Saved</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="tabs">
        {TABS.map((t) => <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'General' && (
        <section className="card">
          <div className="fields">
            <div className="field"><label className="field-label">Code <span className="req">*</span></label>
              <input value={type.code} placeholder="e.g. DV" onChange={(e) => patch({ code: e.target.value })} /></div>
            <div className="field"><label className="field-label">Name <span className="req">*</span></label>
              <input value={type.name} placeholder="e.g. Disbursement Voucher" onChange={(e) => patch({ name: e.target.value })} /></div>
            <div className="field"><label className="field-label">Category</label>
              <input value={type.category} placeholder="e.g. Disbursement, Procurement, Budget" onChange={(e) => patch({ category: e.target.value })} /></div>
            <div className="field"><label className="field-label">Status</label>
              <select value={type.active === false ? 'no' : 'yes'} onChange={(e) => patch({ active: e.target.value === 'yes' })}>
                <option value="yes">Active (available to users)</option><option value="no">Inactive</option>
              </select></div>
            <div className="field"><label className="field-label">Paper size</label>
              <select value={type.paperSize} onChange={(e) => patch({ paperSize: e.target.value })}>
                <option>A4</option><option>Letter</option><option>Legal</option>
              </select></div>
            <div className="field"><label className="field-label">Orientation</label>
              <select value={type.orientation} onChange={(e) => patch({ orientation: e.target.value })}>
                <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </select></div>
            <div className="field field-wide"><label className="field-label">Description</label>
              <textarea rows={3} value={type.description} onChange={(e) => patch({ description: e.target.value })} /></div>
          </div>
        </section>
      )}

      {tab === 'Guided Steps' && (
        <section className="card">
          <p className="muted small">Steps guide the user through filling in the document. Assign fields to steps in the Fields tab.
            The Checklist and Review steps are added automatically at the end.</p>
          {type.steps.map((s, i) => (
            <div key={s.id} className="editor-block">
              <div className="editor-row">
                <span className="step-num">{i + 1}</span>
                <input placeholder="Step title" value={s.title} onChange={(e) => setItem('steps', i, { title: e.target.value })} />
                <RowActions list={type.steps} i={i} onChange={setList('steps')} />
              </div>
              <textarea rows={2} placeholder="Instructions shown to the user for this step"
                value={s.instructions || ''} onChange={(e) => setItem('steps', i, { instructions: e.target.value })} />
              <div className="small muted">Fields: {type.fields.filter((f) => f.step === s.id).map((f) => f.label).join(', ') || 'none'}</div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => patch({ steps: [...type.steps, { id: uid('s'), title: '', instructions: '' }] })}>+ Add step</button>
        </section>
      )}

      {tab === 'Fields' && (
        <section className="card">
          <p className="muted small">The key is used in the template as <code>{'{{key}}'}</code>. Fields without a step are shown in an extra “Other Details” step.</p>
          {type.fields.map((f, i) => (
            <div key={i} className="editor-block">
              <div className="editor-row">
                <input placeholder="Label" value={f.label}
                  onChange={(e) => setItem('fields', i, { label: e.target.value, ...(f.keyTouched || typeId ? {} : { key: slugKey(e.target.value) }) })} />
                <input placeholder="key" className="mono" value={f.key} onChange={(e) => setItem('fields', i, { key: e.target.value, keyTouched: true })} />
                <select value={f.type} onChange={(e) => setItem('fields', i, {
                  type: e.target.value,
                  ...(e.target.value === 'table' && !f.columns ? { columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'amount', label: 'Amount', type: 'currency', total: true }] } : {}),
                })}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select value={f.step || ''} onChange={(e) => setItem('fields', i, { step: e.target.value })}>
                  <option value="">— No step —</option>
                  {type.steps.map((s, si) => <option key={s.id} value={s.id}>Step {si + 1}: {s.title}</option>)}
                </select>
                <label className="check"><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setItem('fields', i, { required: e.target.checked })} /> Required</label>
                <RowActions list={type.fields} i={i} onChange={setList('fields')} />
              </div>
              <div className="editor-row compact">
                {f.type !== 'table' && (
                  <input placeholder="Default value" value={f.default || ''} onChange={(e) => setItem('fields', i, { default: e.target.value })} />
                )}
                <input placeholder="Help text" value={f.help || ''} onChange={(e) => setItem('fields', i, { help: e.target.value })} />
                {f.type === 'table' && (
                  <input type="number" min="0" placeholder="Min printed rows" value={f.minRows || ''}
                    onChange={(e) => setItem('fields', i, { minRows: Number(e.target.value) || 0 })} />
                )}
              </div>
              {f.type === 'select' && (
                <textarea rows={2} placeholder="Dropdown options, one per line" value={(f.options || []).join('\n')}
                  onChange={(e) => setItem('fields', i, { options: e.target.value.split('\n') })}
                  onBlur={(e) => setItem('fields', i, { options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })} />
              )}
              {f.type === 'table' && <ColumnsEditor columns={f.columns} onChange={(columns) => setItem('fields', i, { columns })} />}
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => patch({ fields: [...type.fields, { key: '', label: '', type: 'text', required: false, step: type.steps.at(-1)?.id || '' }] })}>+ Add field</button>
        </section>
      )}

      {tab === 'Checklist' && (
        <section className="card">
          <p className="muted small">Requirements the user must confirm before the document can be marked complete (e.g. supporting documents per COA rules).</p>
          {type.checklist.map((c, i) => (
            <div key={c.id} className="editor-block">
              <div className="editor-row">
                <input placeholder="Requirement" value={c.label} onChange={(e) => setItem('checklist', i, { label: e.target.value })} />
                <label className="check"><input type="checkbox" checked={Boolean(c.required)} onChange={(e) => setItem('checklist', i, { required: e.target.checked })} /> Required</label>
                <RowActions list={type.checklist} i={i} onChange={setList('checklist')} />
              </div>
              <input placeholder="Help / when applicable (optional)" value={c.help || ''} onChange={(e) => setItem('checklist', i, { help: e.target.value })} />
              <div className="small muted">Template tag: <code>{`{{check:${c.id}}}`}</code></div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => patch({ checklist: [...type.checklist, { id: uid('c'), label: '', required: false }] })}>+ Add requirement</button>
        </section>
      )}

      {tab === 'Format / Template' && (
        <div className="split">
          <section className="card">
            <div className="row gap wrap">
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (!type.template || window.confirm('Replace the current template with a generated one?')) patch({ template: generateDefaultTemplate(type) });
              }}>Generate from fields</button>
            </div>
            <textarea className="code" rows={28} spellCheck={false} value={type.template}
              placeholder="HTML template. Click “Generate from fields” to start." onChange={(e) => patch({ template: e.target.value })} />
            <details className="small">
              <summary>Template reference</summary>
              <ul className="ref">
                <li><code>{'{{key}}'}</code> field value · filters: <code>|currency</code> <code>|peso</code> <code>|date</code> <code>|words</code> <code>|upper</code> <code>|number</code></li>
                <li><code>{'{{controlNo}}'}</code> <code>{'{{today|date}}'}</code> <code>{'{{preparedBy}}'}</code> <code>{'{{lgu.name}}'}</code> <code>{'{{lgu.address}}'}</code></li>
                <li><code>{'{{table:key}}'}</code> auto table · <code>{'{{sum:key.column|peso}}'}</code> column total</li>
                <li><code>{'{{#each key}}<tr><td>{{@no}}</td><td>{{column}}</td></tr>{{/each}}'}</code> custom rows</li>
                <li><code>{'{{check:id}}'}</code> checklist box · <code>{'{{#if key=Value}}✓{{/if}}'}</code> conditional</li>
                <li><code>{'{{lgu.seal}}'}</code> seal image · CSS classes: <code>ph</code> (header: <code>l1</code> <code>l2</code> <code>l3</code>), <code>pmeta-t</code>, <code>pt</code>, <code>lbl</code>, <code>pf-box</code>, <code>pf-cell</code>, <code>pf-signame</code>, <code>cap</code>, <code>sig2</code>, <code>r</code>, <code>c</code></li>
              </ul>
              <div>Field keys: {type.fields.map((f) => <code key={f.key}>{f.key}</code>)}</div>
            </details>
          </section>
          <DocumentPreview type={type} settings={settings} controlNo={`${type.code || 'XX'}-0000-00-0000`} preparedBy="Juan Dela Cruz" />
        </div>
      )}
    </div>
  );
}
