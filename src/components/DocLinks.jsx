import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';

// Links from a checklist item to the supporting document: one already in FTS (e.g. the OBR
// or PO) or one in another LGU system (CBO, PMS, ...). Stored on the document as
// links: { [itemId]: [{ kind: 'fts', id, controlNo, typeCode, title } | { kind: 'url', system, ref, url }] }.

export const SYSTEMS = ['CBO', 'PMS', 'IMS', 'CFMS', 'DMS', 'Other'];

export const safeUrl = (url) => (/^https?:\/\/\S+$/i.test(String(url || '').trim()) ? String(url).trim() : '');

// One-line text of a link, as printed on the checklist.
export function linkText(l) {
  if (l.kind === 'fts') return `${l.controlNo} (${l.typeCode})`;
  return [l.system, l.ref || safeUrl(l.url)].filter(Boolean).join(': ');
}

export function LinkList({ links = [], onRemove }) {
  if (!links.length) return null;
  return (
    <ul className="doc-links">
      {links.map((l, i) => (
        <li key={i}>
          <span className="badge badge-blue">{l.kind === 'fts' ? 'FTS' : l.system}</span>{' '}
          {l.kind === 'fts'
            ? <Link to={`/documents/${l.id}`} target="_blank" rel="noopener">{l.controlNo}</Link>
            : safeUrl(l.url)
              ? <a href={safeUrl(l.url)} target="_blank" rel="noopener noreferrer">{l.ref || safeUrl(l.url)}</a>
              : l.ref}
          {l.kind === 'fts' && <span className="muted"> · {l.typeCode}{l.title ? ` · ${l.title}` : ''}</span>}
          {onRemove && <button type="button" className="btn-icon" title="Remove link" onClick={() => onRemove(i)}>×</button>}
        </li>
      ))}
    </ul>
  );
}

// Choose a document in FTS, or enter a link to another system.
export function LinkEditor({ excludeId, onAdd, onCancel }) {
  const { user, profile, isAdmin } = useAuth();
  const [tab, setTab] = useState('fts');
  const [docs, setDocs] = useState(null);
  const [q, setQ] = useState('');
  const [ext, setExt] = useState({ system: 'CBO', ref: '', url: '' });
  const [error, setError] = useState('');
  const id = useId();

  useEffect(() => {
    listDocuments({ uid: user.uid, office: profile.office, all: isAdmin })
      .then((d) => setDocs(d.filter((x) => x.id !== excludeId && x.status !== 'cancelled')))
      .catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, excludeId]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (docs || []).filter((d) => words.every((w) => `${d.controlNo} ${d.typeCode} ${d.typeName} ${d.title}`.toLowerCase().includes(w))).slice(0, 30);
  }, [docs, q]);

  const addExternal = () => {
    if (ext.url.trim() && !safeUrl(ext.url)) { setError('The link must start with http:// or https://'); return; }
    if (!ext.url.trim() && !ext.ref.trim()) { setError('Enter the link or the reference number.'); return; }
    onAdd({ kind: 'url', system: ext.system, ref: ext.ref.trim().toUpperCase(), url: safeUrl(ext.url) });
  };

  return (
    <div className="link-editor">
      <div className="tabs">
        <button type="button" className={tab === 'fts' ? 'active' : ''} onClick={() => setTab('fts')}>Document in FTS</button>
        <button type="button" className={tab === 'url' ? 'active' : ''} onClick={() => setTab('url')}>Other system (CBO, PMS, …)</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {tab === 'fts' ? (
        <>
          <input placeholder="Search control no., type (OBR, PR, PO) or payee" value={q} onChange={(e) => setQ(e.target.value)} />
          {!docs && !error && <div className="spinner" />}
          {docs && (
            <div className="picker-results">
              {shown.length === 0 && <p className="small muted" style={{ padding: '.5rem' }}>No documents found. Documents prepared in FTS by you or your office appear here.</p>}
              {shown.map((d) => (
                <button type="button" key={d.id}
                  onClick={() => onAdd({ kind: 'fts', id: d.id, controlNo: d.controlNo, typeCode: d.typeCode, title: d.title || '' })}>
                  <span className="code">{d.controlNo}</span>
                  <span className="t"><b>{d.typeCode}</b> · {d.title}<div className="small muted">{d.status}</div></span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="fields">
          <div className="field"><label className="field-label" htmlFor={`${id}-s`}>System</label>
            <select id={`${id}-s`} value={ext.system} onChange={(e) => setExt({ ...ext, system: e.target.value })}>
              {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <div className="field"><label className="field-label" htmlFor={`${id}-r`}>Reference no. (optional)</label>
            <input id={`${id}-r`} className="caps" value={ext.ref} onChange={(e) => setExt({ ...ext, ref: e.target.value })} placeholder="e.g. PO-2026-10-005" /></div>
          <div className="field field-wide"><label className="field-label" htmlFor={`${id}-u`}>Link</label>
            <input id={`${id}-u`} value={ext.url} onChange={(e) => setExt({ ...ext, url: e.target.value })} placeholder="https://…" /></div>
          <div><button type="button" className="btn btn-primary btn-sm" onClick={addExternal}>Add link</button></div>
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Close</button>
    </div>
  );
}
