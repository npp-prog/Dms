import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  applyStarterFormat, deleteDocumentType, importDocumentTypes, listDocumentTypes, saveDocumentType,
} from '../../lib/api.js';
import { FORMAT_KEYS, STARTER_TYPES } from '../../lib/defaults.js';

function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export default function DocumentTypes() {
  const { actor } = useAuth();
  const [types, setTypes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => listDocumentTypes().then(setTypes).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const existingCodes = new Set((types || []).map((t) => t.code));
  // A starter format that FTS has since revised (e.g. the DV redrawn after the official form).
  const pick = (t) => JSON.stringify(FORMAT_KEYS.map((k) => t[k] ?? null));
  const newerStarter = (t) => {
    const starter = STARTER_TYPES.find((s) => s.code === t.code);
    return starter && pick(starter) !== pick(t) ? starter : null;
  };
  const updateToStarter = (t, starter) => {
    if (!window.confirm(`Replace the format of ${t.code} with the latest FTS starter format? Your changes to its fields, steps, processing guide and template are replaced. Documents already prepared keep their own copy.`)) return;
    run(() => applyStarterFormat(t.id, starter));
  };
  const missingStarters = STARTER_TYPES.filter((t) => !existingCodes.has(t.code));

  const exportAll = () => {
    const clean = types.map(({ id, createdAt, updatedAt, createdBy, updatedBy, ...t }) => t);
    download(`fts-document-types-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(clean, null, 2));
  };

  const onImport = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      const parsed = JSON.parse(await file.text());
      const list = (Array.isArray(parsed) ? parsed : [parsed]).filter((t) => t.code && t.name);
      if (!list.length) throw new Error('No valid document types (with code and name) found in file.');
      const dupes = list.filter((t) => existingCodes.has(t.code)).map((t) => t.code);
      if (dupes.length && !window.confirm(`These codes already exist and will be added as duplicates: ${dupes.join(', ')}. Continue?`)) return;
      await importDocumentTypes(list, actor);
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Document Types</h1>
          <p className="muted">Define each document&rsquo;s fields, guided steps, checklist of requirements and printable format.</p>
        </div>
        <div className="row gap wrap">
          {missingStarters.length > 0 && (
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => run(() => importDocumentTypes(missingStarters, actor))}>
              Load starter formats ({missingStarters.map((t) => t.code).join(', ')})
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => fileRef.current.click()}>Import JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
          {types?.length > 0 && <button className="btn btn-ghost" onClick={exportAll}>Export JSON</button>}
          <Link to="/admin/types/new" className="btn btn-primary">+ New document type</Link>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      {!types && !error && <div className="spinner" />}
      {types && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Fields</th><th>Steps</th><th>Checklist</th><th>Version</th><th>Status</th><th /></tr></thead>
            <tbody>
              {types.length === 0 && <tr><td colSpan={9} className="muted">No document types yet. Load the starter formats or create one.</td></tr>}
              {types.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.code}</b></td>
                  <td><Link to={`/admin/types/${t.id}`}>{t.name}</Link></td>
                  <td>{t.category}</td>
                  <td>{(t.fields || []).length}</td>
                  <td>{(t.steps || []).length}</td>
                  <td>{(t.checklist || []).length}</td>
                  <td>v{t.version || 1}</td>
                  <td>
                    <button className={`badge ${t.active === false ? 'badge-gray' : 'badge-green'}`} disabled={busy}
                      title="Toggle active"
                      onClick={() => run(() => saveDocumentType(t.id, { ...t, active: t.active === false }, actor))}>
                      {t.active === false ? 'Inactive' : 'Active'}
                    </button>
                  </td>
                  <td className="row gap">
                    {newerStarter(t) && (
                      <button className="btn btn-gold btn-sm" disabled={busy} title="FTS has a newer version of this starter format"
                        onClick={() => updateToStarter(t, newerStarter(t))}>Update format</button>
                    )}
                    <Link className="btn btn-ghost btn-sm" to={`/formats/${t.id}`}>Preview</Link>
                    <Link className="btn btn-ghost btn-sm" to={`/admin/types/${t.id}`}>Edit</Link>
                    <button className="btn btn-danger btn-sm" disabled={busy}
                      onClick={() => window.confirm(`Delete ${t.code}? Existing documents keep their own copy of the format.`)
                        && run(() => deleteDocumentType(t.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
