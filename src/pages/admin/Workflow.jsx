import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { listDocumentTypes, saveRoute } from '../../lib/api.js';
import { routeFromGuide } from '../../lib/workflow.js';
import Icon from '../../components/Icon.jsx';
import { DEFAULT_REF_PATTERN, refNumber } from '../../lib/naming.js';
import Select from '../../components/Select.jsx';

const PREPARER = ''; // the office that prepared the document
const PREPARER_PICK = '@preparer'; // the preparer's office in a select (whose value cannot be '')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clean = (route) => route.map((s) => ({
  office: s.office || '', action: s.action || '', sign: Boolean(s.sign),
  ...(s.assign?.field ? { assign: { field: s.assign.field, dateField: s.assign.dateField || '', pattern: s.assign.pattern || '' } } : {}),
  ...(s.fills?.length ? { fills: [...s.fills] } : {}),
  ...(s.upload !== undefined ? { upload: s.upload } : {}),
  ...(s.alternates?.length ? { alternates: [...s.alternates] } : {}),
}));

// Administration > Workflow: the route of every document type (which offices receive it, in
// what order, what each does, which must sign, assign, fill in or upload). Tracking where the
// documents are is its own page (Documents > Tracking).
export default function Workflow() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Workflow</h1>
          <p className="muted">Set the flow of each document: the offices it goes through, in order, once it is converted to PDF (or uploaded).
            Each office receives it, acts, and releases it to the next one.</p>
        </div>
      </div>
      <Routes />
    </div>
  );
}

function Routes() {
  const { actor, settings } = useAuth();
  const [types, setTypes] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const offices = settings.offices || [];
  const [q, setQ] = useState('');

  const load = () => listDocumentTypes().then((t) => {
    setTypes(t);
    setSelected((cur) => cur || t.find((x) => x.active !== false)?.id || t[0]?.id || null);
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!types) return <div className="spinner" />;
  const type = types.find((t) => t.id === selected);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = types.filter((t) => words.every((w) => `${t.code} ${t.name}`.toLowerCase().includes(w)));

  return (
    <div className="route-layout">
      <div className="card route-types">
        <input className="search route-search" type="search" placeholder="Search document types…" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search document types" />
        {shown.length === 0 && <p className="small muted route-none">No document type matches.</p>}
        {shown.map((t) => (
          <button key={t.id} type="button" className={t.id === selected ? 'active' : ''} onClick={() => setSelected(t.id)}>
            <span className="code">{t.code}</span>
            <span className="t">{t.name}
              {(t.route?.length > 0 || t.active === false) && (
                <span className="small muted">{[t.route?.length && `${t.route.length} steps`, t.active === false && 'inactive'].filter(Boolean).join(' · ')}</span>
              )}
            </span>
          </button>
        ))}
      </div>
      {type ? <RouteEditor key={type.id} type={type} offices={offices} actor={actor} onSaved={load} /> : <div className="card muted">No document types yet.</div>}
    </div>
  );
}

function RouteEditor({ type, offices, actor, onSaved }) {
  const guide = useMemo(() => routeFromGuide(type, offices), [type, offices]);
  const saved = useMemo(() => clean(type.route?.length ? type.route : guide), [type, guide]);
  const [route, setRoute] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const custom = Boolean(type.route?.length);
  const dirty = !same(clean(route), saved) || !custom;
  const officeName = (o) => o || "Preparer's office";
  // A step's office, with its alternates: "Office of the Municipal Mayor or …Vice Mayor".
  const officesOf = (s) => [s.office, ...(s.alternates || [])].map(officeName).join(' or ');

  // Offices in Settings, plus any office a step names that is not (or no longer) in the list.
  // The type's fields that can take a reference no. and its date; a sensible first choice.
  const textFields = (type.fields || []).filter((f) => f.type === 'text');
  const dateFields = (type.fields || []).filter((f) => f.type === 'date');
  const suggestAssign = () => {
    const field = textFields.find((f) => f.filledBy === 'accounting' && /no\.?$/i.test(f.label)) || textFields.find((f) => /no\.?/i.test(f.label)) || textFields[0];
    const date = dateFields.find((f) => f.filledBy === 'accounting') || null;
    return { field: field?.key || '', dateField: date?.key || '', pattern: DEFAULT_REF_PATTERN };
  };
  // One step open for editing at a time; the others show as one-line summaries.
  const [open, setOpen] = useState(null);
  const fieldLabel = (key) => (type.fields || []).find((f) => f.key === key)?.label || key;
  const choices = [...new Set([...offices, ...route.map((s) => s.office).filter(Boolean)])];
  const set = (i, patch) => setRoute(route.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const next = [...route];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRoute(next);
    setOpen((o) => (o === i ? i + d : o === i + d ? i : o));
  };
  const problems = [
    !route.length && 'Add at least one step.',
    route.some((s) => !s.action.trim()) && 'Every step needs an action (what the office does).',
    route.some((s, i) => i > 0 && s.office === route[i - 1].office) && 'Two steps in a row are in the same office: merge them into one step.',
    route.some((s) => s.office && !offices.includes(s.office)) && 'A step names an office that is not in Settings: users of that office will not receive it.',
  ].filter(Boolean);
  const blocking = !route.length || route.some((s) => !s.action.trim());

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await saveRoute(type.id, route, actor);
      setMsg({ ok: true, text: `Saved. New ${type.code} documents follow this route${route.some((s) => s.alternates?.length) ? ' (the preparer chooses the office of each step with alternates)' : ''}; documents already on their way keep theirs.` });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card route-editor">
      <div className="card-head">
        <div>
          <h3>{type.code} — {type.name}</h3>
          <p className="small muted">{custom
            ? `Route set by ${type.routeUpdatedBy || 'an admin'}.`
            : 'No route saved yet. Adjust the steps below and save.'}</p>
        </div>
      </div>

      <div className="route-chain" aria-label="Route preview">
        {route.map((s, i) => (
          <span key={i} className="route-chip">
            <b>{i + 1}</b> {officesOf(s)}{s.sign && <span className="sign-tag" title="Signs the PDF"><Icon name="sign" />Signs</span>}
          </span>
        ))}
      </div>

      <ol className="route-steps">
        {route.map((s, i) => (
          <li key={i} className={open === i ? 'open' : 'closed'}>
            <span className="wf-dot">{i + 1}</span>
            {open !== i ? (
              <button type="button" className="route-summary" onClick={() => setOpen(i)} title="Edit this step">
                <b>{officesOf(s)}</b>
                <span className="small">{s.action || <i className="muted">No action yet</i>}</span>
                <span className="route-badges">
                  {s.sign && <span className="sign-tag" title="Signs the PDF"><Icon name="sign" />Signs</span>}
                  {s.assign && <span className="badge badge-blue">Assigns {fieldLabel(s.assign.field)}</span>}
                  {s.fills?.length > 0 && <span className="badge badge-blue">Fills in {s.fills.length} detail{s.fills.length > 1 ? 's' : ''}</span>}
                  {s.upload !== undefined && <span className="badge badge-blue">Upload</span>}
                </span>
              </button>
            ) : (
            <div className="route-fields">
              <div className="route-done"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>Done</button></div>
              <label className="field">
                <span className="field-label">Office</span>
                <Select value={s.office} onChange={(e) => set(i, { office: e.target.value })}>
                  <option value={PREPARER}>Preparer&apos;s office (whoever prepared it)</option>
                  {choices.map((o) => <option key={o} value={o}>{o}{offices.includes(o) ? '' : ' (not in Settings)'}</option>)}
                </Select>
              </label>
              <div className="field alt-offices">
                <span className="field-label">Alternate offices <span className="muted">(optional: the preparer chooses which office handles this step)</span></span>
                <div className="row gap wrap">
                  {(s.alternates || []).map((o) => (
                    <span key={o} className="alt-chip">or {officeName(o)}
                      <button type="button" title="Remove" onClick={() => set(i, { alternates: s.alternates.filter((x) => x !== o) })}>×</button></span>
                  ))}
                  <Select value="" aria-label="Add an alternate office" placeholder="+ Add an alternate office…"
                    onChange={(e) => e.target.value !== '-' && set(i, { alternates: [...(s.alternates || []), e.target.value === PREPARER_PICK ? PREPARER : e.target.value] })}>
                    <option value="-">+ Add an alternate office…</option>
                    {[PREPARER_PICK, ...choices].filter((o) => (o === PREPARER_PICK ? PREPARER : o) !== s.office && !(s.alternates || []).includes(o === PREPARER_PICK ? PREPARER : o))
                      .map((o) => <option key={o} value={o}>{o === PREPARER_PICK ? "Preparer's office" : o}</option>)}
                  </Select>
                </div>
              </div>
              <label className="field">
                <span className="field-label">Action</span>
                <input value={s.action} onChange={(e) => set(i, { action: e.target.value })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={s.sign} onChange={(e) => set(i, { sign: e.target.checked })} />
                Must sign the PDF before releasing (DICT PNPKI)
              </label>
              <label className="check">
                <input type="checkbox" checked={Boolean(s.assign)} disabled={!textFields.length}
                  onChange={(e) => set(i, { assign: e.target.checked ? suggestAssign() : undefined })} />
                Assigns a reference no. when it receives the document
              </label>
              {s.assign && (
                <div className="assign-fields">
                  <label className="field">
                    <span className="field-label">Reference no. field</span>
                    <Select value={s.assign.field} onChange={(e) => set(i, { assign: { ...s.assign, field: e.target.value } })}>
                      {textFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </Select>
                  </label>
                  <label className="field">
                    <span className="field-label">Date field (today's date)</span>
                    <Select value={s.assign.dateField || ''} onChange={(e) => set(i, { assign: { ...s.assign, dateField: e.target.value } })}>
                      <option value="">— None —</option>
                      {dateFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </Select>
                  </label>
                  <label className="field assign-pattern">
                    <span className="field-label">Number pattern</span>
                    <input value={s.assign.pattern} onChange={(e) => set(i, { assign: { ...s.assign, pattern: e.target.value } })}
                      placeholder={DEFAULT_REF_PATTERN} />
                    <span className="small muted">Next number looks like <b>{refNumber(s.assign.pattern || DEFAULT_REF_PATTERN, { fund: 'General Fund' }).format(1)}</b>.
                      {' '}{'{YYYY}'} year, {'{YY}'}, {'{MM}'} month, {'{DD}'}, {'{FUND}'} fund (GF, SEF, TF…), {'{####}'} the series. The series starts
                      again whenever the rest changes (e.g. each month).</span>
                  </label>
                </div>
              )}
            </div>
            )}
            <div className="route-tools">
              <button type="button" className="btn-icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn-icon" title="Move down" disabled={i === route.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="btn-icon" title="Remove step" onClick={() => { setRoute(route.filter((_, j) => j !== i)); setOpen(null); }}>×</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRoute([...route, { office: offices[0] || '', action: '', sign: false }]); setOpen(route.length); }}>+ Add step</button>

      {problems.length > 0 && <ul className="route-problems small">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {msg && <div className={msg.ok ? 'alert alert-ok' : 'alert'}>{msg.text}</div>}
      <div className="row gap wrap route-actions">
        <button className="btn btn-primary" disabled={busy || blocking || !dirty} onClick={save}>{busy ? 'Saving…' : custom ? 'Save route' : 'Save as the route'}</button>
        {!same(clean(route), saved) && <button className="btn btn-ghost" onClick={() => { setRoute(saved); setOpen(null); }}>Undo changes</button>}
        {!same(clean(route), guide) && <button className="btn btn-ghost" onClick={() => setRoute(guide)}>Start from the processing guide</button>}
      </div>
    </section>
  );
}
