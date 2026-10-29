import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import { acceptsDocument, systemFor } from '../lib/checklists.js';

// Links from a checklist item to the supporting document: one already in DMS (e.g. the OBR
// or PO) or one in another LGU system (PIM, CBO, ...). Stored on the document as
// links: { [itemId]: [{ kind: 'fts', id, controlNo, typeCode, title } | { kind: 'url', system, ref, url }] }.

// PIM (PMS-IMS) generates AIR, PAR, ICS, RIS, PTR, ITR, WMR, Pre/Post Inspection, History of Repair, RSMI.
export const SYSTEMS = ['PIM', 'CBO', 'CFMS', 'DMS', 'Other'];

export const safeUrl = (url) => (/^https?:\/\/\S+$/i.test(String(url || '').trim()) ? String(url).trim() : '');

// One-line text of a link, as printed on the checklist.
export function linkText(l) {
  if (l.kind === 'fts') return `${l.controlNo} (${l.typeCode})`;
  if (l.kind === 'file') return `File: ${l.name}`;
  return [l.system, l.ref || safeUrl(l.url)].filter(Boolean).join(': ');
}

const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// onOpen(link): show an uploaded file (in the document page's viewer).
export function LinkList({ links = [], onRemove, onOpen }) {
  if (!links.length) return null;
  return (
    <ul className="doc-links">
      {links.map((l, i) => (
        <li key={i}>
          <span className="badge badge-blue">{l.kind === 'fts' ? 'DMS' : l.kind === 'file' ? 'File' : l.system}</span>{' '}
          {l.kind === 'file' ? (
            <>
              {onOpen ? <button type="button" className="link" onClick={() => onOpen(l, i)}>{l.name}</button> : l.name}
              <span className="muted"> · {kb(l.size)} · {l.by}</span>
            </>
          ) : l.kind === 'fts'
            ? (onOpen ? <button type="button" className="link" onClick={() => onOpen(l, i)}>{l.controlNo}</button>
              : <Link to={`/documents/${l.id}`} target="_blank" rel="noopener">{l.controlNo}</Link>)
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

// Choose a document in DMS, or enter a link to another system.
export function LinkEditor({ item, excludeId, onAdd, onCancel }) {
  const { user, profile, isAdmin, isHead } = useAuth();
  // Documents from PIM (AIR, PAR, ICS, RIS, ...) open on the other-system tab with PIM chosen.
  const fromSystem = systemFor(item);
  const [tab, setTab] = useState(fromSystem ? 'url' : 'fts');
  const [docs, setDocs] = useState(null);
  const [q, setQ] = useState('');
  const [ext, setExt] = useState({ system: fromSystem || 'CBO', ref: '', url: '' });
  const [error, setError] = useState('');
  const id = useId();

  useEffect(() => {
    listDocuments({ uid: user.uid, office: profile.office, all: isAdmin, head: isHead })
      .then((d) => setDocs(d.filter((x) => x.id !== excludeId && x.status !== 'cancelled')))
      .catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, isHead, excludeId]);

  // Only documents of the kind the checklist item asks for (e.g. OBRs for "Obligation Request").
  const fitting = useMemo(() => (docs || []).filter((d) => acceptsDocument(item, d)), [docs, item]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return fitting.filter((d) => words.every((w) => `${d.controlNo} ${d.typeCode} ${d.typeName} ${d.title}`.toLowerCase().includes(w))).slice(0, 30);
  }, [fitting, q]);
  const kinds = [...new Set(fitting.map((d) => d.typeCode))];
  // Nothing in DMS of this kind (e.g. a BAC Resolution): start on the other-system tab.
  useEffect(() => { if (docs && !fitting.length) setTab('url'); }, [docs, fitting.length]);

  const addExternal = () => {
    if (ext.url.trim() && !safeUrl(ext.url)) { setError('The link must start with http:// or https://'); return; }
    if (!ext.url.trim() && !ext.ref.trim()) { setError('Enter the link or the reference number.'); return; }
    onAdd({ kind: 'url', system: ext.system, ref: ext.ref.trim().toUpperCase(), url: safeUrl(ext.url) });
  };

  return (
    <div className="link-editor">
      <div className="tabs">
        <button type="button" className={tab === 'fts' ? 'active' : ''} onClick={() => setTab('fts')}>Document in DMS</button>
        <button type="button" className={tab === 'url' ? 'active' : ''} onClick={() => setTab('url')}>Other system (PIM, CBO, …)</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {tab === 'fts' ? (
        <>
          {item && <p className="small muted">{item.label}{kinds.length ? `: showing ${kinds.join(' and ')} documents only.` : ''}</p>}
          <input placeholder="Search control no. or payee" value={q} onChange={(e) => setQ(e.target.value)} />
          {!docs && !error && <div className="spinner" />}
          {docs && (
            <div className="picker-results">
              {shown.length === 0 && (
                <p className="small muted" style={{ padding: '.5rem' }}>
                  {fitting.length ? 'No match.' : `No ${item ? `"${item.label}" ` : ''}document in DMS from you or your office. If it is in another system, use the other tab.`}
                </p>
              )}
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
