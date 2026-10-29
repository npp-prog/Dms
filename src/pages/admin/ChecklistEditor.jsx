import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { deleteChecklist, getChecklist, saveChecklist } from '../../lib/api.js';
import { CHECKLIST_CATEGORIES, newChecklist } from '../../lib/checklists.js';
import ChecklistSheet from '../../components/ChecklistSheet.jsx';
import Select from '../../components/Select.jsx';

function move(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);

export default function ChecklistEditor() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { actor, settings } = useAuth();
  const [c, setC] = useState(code ? null : newChecklist());
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code) getChecklist(code).then((x) => (x ? setC(x) : setError('Checklist not found.'))).catch((e) => setError(e.message));
  }, [code]);

  if (error && !c) return <div className="page"><div className="alert">{error}</div></div>;
  if (!c) return <div className="page"><div className="spinner" /></div>;

  const patch = (p) => { setSaved(false); setC((x) => ({ ...x, ...p })); };
  const setItem = (i, p) => patch({ items: c.items.map((it, idx) => (idx === i ? { ...it, ...p } : it)) });
  const nextId = () => `i${Math.max(0, ...c.items.map((it) => Number(String(it.id).replace(/\D/g, '')) || 0)) + 1}`;

  const save = async () => {
    const problems = [];
    if (!/^[\w-]+$/.test(c.code.trim())) problems.push('Checklist No. is required (letters, numbers and dashes only).');
    if (!c.title.trim()) problems.push('Title is required.');
    if (c.items.some((it) => !it.label.trim())) problems.push('Every item needs a document type.');
    if (problems.length) { setError(problems.join(' ')); return; }
    setBusy(true);
    setError('');
    try {
      if (!code) {
        const exists = await getChecklist(c.code.trim());
        if (exists) throw new Error(`Checklist No. ${c.code} already exists.`);
      }
      const clean = {
        ...c,
        code: c.code.trim(),
        items: c.items.map(({ group, ...it }) => (group && group.trim() ? { ...it, group: group.trim() } : it)),
      };
      await saveChecklist(clean, actor);
      setSaved(true);
      if (!code) navigate(`/admin/checklists/${clean.code}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete checklist ${c.code}? Documents already prepared keep their own copy.`)) return;
    await deleteChecklist(c.code);
    navigate('/checklists');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/checklists">Checklists</Link> / {code || 'New'}</div>
          <h1>{code ? `Edit checklist ${code}` : 'New checklist'}</h1>
        </div>
        <div className="row gap">
          {saved && <span className="badge badge-green">Saved</span>}
          {code && <button className="btn btn-danger" onClick={remove}>Delete</button>}
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="split">
        <div>
          <section className="card">
            <h3>Checklist</h3>
            <div className="fields">
              <div className="field"><label className="field-label">Checklist No. <span className="req">*</span></label>
                <input value={c.code} disabled={!!code} onChange={(e) => patch({ code: e.target.value })} /></div>
              <div className="field"><label className="field-label">Kind</label>
                <Select value={c.kind} onChange={(e) => patch({ kind: e.target.value, ...(e.target.value === 'liquidation' ? { category: 'Liquidation' } : {}) })}>
                  <option value="disbursement">Disbursement</option><option value="liquidation">Liquidation</option>
                </Select></div>
              <div className="field"><label className="field-label">Category</label>
                <Select value={c.category} onChange={(e) => patch({ category: e.target.value })}>
                  {[...CHECKLIST_CATEGORIES, 'Others'].map((x) => <option key={x}>{x}</option>)}
                </Select></div>
              <div className="field field-wide"><label className="field-label">Title <span className="req">*</span></label>
                <input value={c.title} onChange={(e) => patch({ title: e.target.value })} /></div>
              <div className="field field-wide"><label className="field-label">Description</label>
                <textarea rows={3} value={c.description} onChange={(e) => patch({ description: e.target.value })} /></div>
              <div className="field field-wide"><label className="field-label">Header boxes (one per line)</label>
                <textarea rows={3} value={(c.headerFields || []).join('\n')} onChange={(e) => patch({ headerFields: lines(e.target.value) })} />
                <div className="help">“DV Number”, “OBR/FURS Number”, “Payee” and “Liquidation Report No.” are filled in from the document when printed.</div></div>
            </div>
          </section>

          <section className="card">
            <h3>Required documents</h3>
            <p className="small muted">“Always required” prints a Y box only and must be ticked before a document is complete.
              “If applicable” prints Y and N/A boxes. Items with the same group are printed under a heading.</p>
            {c.items.map((it, i) => (
              <div key={it.id} className="editor-block">
                <input value={it.label} placeholder="Document type" onChange={(e) => setItem(i, { label: e.target.value })} />
                <textarea rows={2} value={it.details || ''} placeholder="Document details (optional)" onChange={(e) => setItem(i, { details: e.target.value })} />
                <div className="editor-row compact">
                  <Select value={it.required ? 'y' : 'na'} onChange={(e) => setItem(i, { required: e.target.value === 'y' })}>
                    <option value="y">Always required (Y)</option>
                    <option value="na">If applicable (Y / N/A)</option>
                  </Select>
                  <input placeholder="Group heading (optional)" value={it.group || ''} onChange={(e) => setItem(i, { group: e.target.value })} />
                  <div className="row-actions">
                    <button type="button" className="btn-icon" onClick={() => patch({ items: move(c.items, i, -1) })}>↑</button>
                    <button type="button" className="btn-icon" onClick={() => patch({ items: move(c.items, i, 1) })}>↓</button>
                    <button type="button" className="btn-icon danger" onClick={() => patch({ items: c.items.filter((_, idx) => idx !== i) })}>×</button>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn" onClick={() => patch({ items: [...c.items, { id: nextId(), label: '', required: true, group: c.items.at(-1)?.group || '' }] })}>+ Add document</button>
          </section>

          <section className="card">
            <h3>Basis and notes</h3>
            <div className="fields">
              <div className="field field-wide"><label className="field-label">Basis (one per line)</label>
                <textarea rows={2} value={(c.basis || []).join('\n')} onChange={(e) => patch({ basis: lines(e.target.value) })} /></div>
              <div className="field field-wide"><label className="field-label">Notes (one per line)</label>
                <textarea rows={2} value={(c.notes || []).join('\n')} placeholder="Put **double asterisks** around words to print in bold" onChange={(e) => patch({ notes: lines(e.target.value) })} /></div>
            </div>
          </section>
        </div>
        <div className="preview-col">
          <div className="preview-label">Print preview</div>
          <ChecklistSheet checklist={c} settings={settings} />
        </div>
      </div>
    </div>
  );
}
