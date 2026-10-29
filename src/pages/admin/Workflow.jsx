import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { listDocumentTypes, saveRoute } from '../../lib/api.js';
import { routeFromGuide } from '../../lib/workflow.js';
import { DEFAULT_REF_PATTERN, refNumber } from '../../lib/naming.js';
import WorkflowTracking from '../../components/WorkflowTracking.jsx';

const PREPARER = ''; // the office that prepared the document
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clean = (route) => route.map((s) => ({
  office: s.office || '', action: s.action || '', sign: Boolean(s.sign),
  ...(s.assign?.field ? { assign: { field: s.assign.field, dateField: s.assign.dateField || '', pattern: s.assign.pattern || '' } } : {}),
  ...(s.fills?.length ? { fills: [...s.fills] } : {}),
  ...(s.upload !== undefined ? { upload: s.upload } : {}),
}));

// Administration > Workflow: the route of every document type (which offices receive it, in
// what order, what each does, which must sign), and the tracking of documents on their routes.
export default function Workflow() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'tracking' ? 'tracking' : 'routes';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Workflow</h1>
          <p className="muted">{tab === 'routes'
            ? 'Set the flow of each document: the offices it goes through after it is marked complete, in order. Each office receives it, acts, and releases it to the next one.'
            : 'Where each routed document is, step by step.'}</p>
        </div>
      </div>
      <div className="tabs page-tabs">
        <button type="button" className={tab === 'routes' ? 'active' : ''} onClick={() => setParams({})}>Routes</button>
        <button type="button" className={tab === 'tracking' ? 'active' : ''} onClick={() => setParams({ tab: 'tracking' })}>Tracking</button>
      </div>
      {tab === 'routes' ? <Routes /> : <WorkflowTracking />}
    </div>
  );
}

function Routes() {
  const { actor, settings } = useAuth();
  const [types, setTypes] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const offices = settings.offices || [];

  const load = () => listDocumentTypes().then((t) => {
    setTypes(t);
    setSelected((cur) => cur || t.find((x) => x.active !== false)?.id || t[0]?.id || null);
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!types) return <div className="spinner" />;
  const type = types.find((t) => t.id === selected);

  return (
    <div className="route-layout">
      <div className="card route-types">
        {types.map((t) => (
          <button key={t.id} type="button" className={t.id === selected ? 'active' : ''} onClick={() => setSelected(t.id)}>
            <span className="code">{t.code}</span>
            <span className="t">{t.name}
              <span className="small muted">{t.route?.length ? `${t.route.length} steps` : 'From the processing guide'}{t.active === false ? ' · inactive' : ''}</span>
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

  // Offices in Settings, plus any office a step names that is not (or no longer) in the list.
  // The type's fields that can take a reference no. and its date; a sensible first choice.
  const textFields = (type.fields || []).filter((f) => f.type === 'text');
  const dateFields = (type.fields || []).filter((f) => f.type === 'date');
  const suggestAssign = () => {
    const field = textFields.find((f) => f.filledBy === 'accounting' && /no\.?$/i.test(f.label)) || textFields.find((f) => /no\.?/i.test(f.label)) || textFields[0];
    const date = dateFields.find((f) => f.filledBy === 'accounting') || null;
    return { field: field?.key || '', dateField: date?.key || '', pattern: DEFAULT_REF_PATTERN };
  };
  // Fields an office can fill in at its step: those not typed by the preparer first.
  const fillable = (type.fields || []).filter((f) => ['text', 'date', 'select', 'number', 'currency'].includes(f.type) && !f.compute);
  const suggestFills = () => {
    const office = fillable.filter((f) => f.filledBy && f.filledBy !== 'accounting').map((f) => f.key);
    return office.length ? office : [];
  };
  const choices = [...new Set([...offices, ...route.map((s) => s.office).filter(Boolean)])];
  const set = (i, patch) => setRoute(route.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const next = [...route];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRoute(next);
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
      setMsg({ ok: true, text: `Saved. New ${type.code} documents follow this route; documents already on their way keep theirs.` });
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
            : <>No route set yet: documents follow the steps of <Link to={`/admin/types/${type.id}`}>its processing guide</Link>. Adjust them below and save.</>}</p>
        </div>
      </div>

      <div className="route-chain" aria-label="Route preview">
        {route.map((s, i) => (
          <span key={i} className="route-chip">
            <b>{i + 1}</b> {s.office || "Preparer's office"}{s.sign && <span title="Signs the PDF"> ✍</span>}
          </span>
        ))}
      </div>

      <ol className="route-steps">
        {route.map((s, i) => (
          <li key={i}>
            <span className="wf-dot">{i + 1}</span>
            <div className="route-fields">
              <label className="field">
                <span className="field-label">Office</span>
                <select value={s.office} onChange={(e) => set(i, { office: e.target.value })}>
                  <option value={PREPARER}>Preparer&apos;s office (whoever prepared it)</option>
                  {choices.map((o) => <option key={o} value={o}>{o}{offices.includes(o) ? '' : ' (not in Settings)'}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Action</span>
                <input value={s.action} onChange={(e) => set(i, { action: e.target.value })} placeholder="e.g. Pre-audit, Box B and the JEV" />
              </label>
              <label className="check">
                <input type="checkbox" checked={s.sign} onChange={(e) => set(i, { sign: e.target.checked })} />
                Must sign the PDF before releasing (DICT PNPKI)
              </label>
              <label className="check">
                <input type="checkbox" checked={Boolean(s.assign)} disabled={!textFields.length}
                  onChange={(e) => set(i, { assign: e.target.checked ? suggestAssign() : undefined })} />
                Assigns a reference no. when it receives the document (e.g. the DV No.)
              </label>
              {s.assign && (
                <div className="assign-fields">
                  <label className="field">
                    <span className="field-label">Reference no. field</span>
                    <select value={s.assign.field} onChange={(e) => set(i, { assign: { ...s.assign, field: e.target.value } })}>
                      {textFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Date field (today's date)</span>
                    <select value={s.assign.dateField || ''} onChange={(e) => set(i, { assign: { ...s.assign, dateField: e.target.value } })}>
                      <option value="">— None —</option>
                      {dateFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
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
              <label className="check">
                <input type="checkbox" checked={Boolean(s.fills)} disabled={!fillable.length}
                  onChange={(e) => set(i, { fills: e.target.checked ? suggestFills() : undefined })} />
                Fills in details before releasing (e.g. Check/ADA No., date and bank)
              </label>
              {s.fills && (
                <div className="assign-fields fill-fields">
                  {fillable.map((f) => (
                    <label key={f.key} className="check">
                      <input type="checkbox" checked={s.fills.includes(f.key)}
                        onChange={(e) => set(i, { fills: e.target.checked ? [...s.fills, f.key] : s.fills.filter((k) => k !== f.key) })} />
                      {f.label}
                    </label>
                  ))}
                </div>
              )}
              <label className="check">
                <input type="checkbox" checked={s.upload !== undefined}
                  onChange={(e) => set(i, { upload: e.target.checked ? 'DV signed by the payee in Box E (scanned)' : undefined })} />
                Must upload a file before releasing (e.g. the DV signed by the payee in Box E)
              </label>
              {s.upload !== undefined && (
                <label className="field assign-fields">
                  <span className="field-label">What to upload</span>
                  <input value={s.upload} onChange={(e) => set(i, { upload: e.target.value })} placeholder="e.g. DV signed by the payee in Box E (scanned)" />
                </label>
              )}
            </div>
            <div className="route-tools">
              <button type="button" className="btn-icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn-icon" title="Move down" disabled={i === route.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="btn-icon" title="Remove step" onClick={() => setRoute(route.filter((_, j) => j !== i))}>×</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoute([...route, { office: offices[0] || '', action: '', sign: false }])}>+ Add step</button>

      {problems.length > 0 && <ul className="route-problems small">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {msg && <div className={msg.ok ? 'alert alert-ok' : 'alert'}>{msg.text}</div>}
      <div className="row gap wrap route-actions">
        <button className="btn btn-primary" disabled={busy || blocking || !dirty} onClick={save}>{busy ? 'Saving…' : custom ? 'Save route' : 'Save as the route'}</button>
        {!same(clean(route), saved) && <button className="btn btn-ghost" onClick={() => setRoute(saved)}>Undo changes</button>}
        {!same(clean(route), guide) && <button className="btn btn-ghost" onClick={() => setRoute(guide)}>Start from the processing guide</button>}
      </div>
    </section>
  );
}
