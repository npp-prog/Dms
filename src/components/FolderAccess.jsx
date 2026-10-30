import { useEffect, useState } from 'react';
import { listDirectory, listDocumentTypes, listFolderAccess, setFolderAccess } from '../lib/api.js';
import Select from './Select.jsx';

// Folders → Access (office head): gives people of the office access to the office's documents
// of chosen folders (document types), or all of them, read only. The preparer always has theirs.
export default function FolderAccess({ office, me, actor, codes = [] }) {
  const [people, setPeople] = useState(null);
  const [grants, setGrants] = useState({});
  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listDirectory(), listFolderAccess(office), listDocumentTypes().catch(() => [])])
      .then(([dir, list, t]) => {
        setPeople(dir.filter((p) => p.office === office && !p.external && p.uid !== me));
        setGrants(Object.fromEntries(list.map((g) => [g.uid, g])));
        setTypes(t);
      })
      .catch((e) => setError(e.message));
  }, [office, me]);

  const nameOf = (code) => types.find((t) => t.code === code)?.name || code;
  const allCodes = [...new Set([...types.map((t) => t.code), ...codes])].filter(Boolean).sort();

  const save = async (p, next) => {
    setBusy(p.uid); setError('');
    try {
      await setFolderAccess(p, next, actor);
      setGrants((g) => {
        const { [p.uid]: _old, ...rest } = g;
        return next.all || next.types.length ? { ...rest, [p.uid]: { uid: p.uid, office, ...next } } : rest;
      });
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  return (
    <section className="card folder-access">
      <h3>Access to the folders of {office}</h3>
      <p className="small muted">People given a folder can open every document of the office in it (read only). To give access to one document only, open it and use Access.</p>
      {error && <div className="alert">{error}</div>}
      {!people ? <div className="spinner" /> : people.length === 0 ? <p className="muted small">No one else in {office}.</p> : (
        <table className="data-table">
          <thead><tr><th>Person</th><th>Folders</th><th>Give access to</th></tr></thead>
          <tbody>
            {people.map((p) => {
              const g = grants[p.uid];
              const given = g?.all ? [] : g?.types || [];
              return (
                <tr key={p.uid}>
                  <td><b>{p.displayName}</b><div className="xs muted">{p.email}</div></td>
                  <td>
                    {!g && <span className="small muted">Own documents only</span>}
                    <span className="access-chips">
                      {g?.all && <span className="chip">All folders <button type="button" title="Remove" disabled={busy === p.uid} onClick={() => save(p, { all: false, types: [] })}>×</button></span>}
                      {given.map((c) => (
                        <span key={c} className="chip" title={nameOf(c)}>{c} <button type="button" title="Remove" disabled={busy === p.uid}
                          onClick={() => save(p, { all: false, types: given.filter((x) => x !== c) })}>×</button></span>
                      ))}
                    </span>
                  </td>
                  <td>
                    {!g?.all && (
                      <Select value="" aria-label={`Give ${p.displayName} access to`} disabled={busy === p.uid}
                        onChange={(e) => e.target.value && save(p, e.target.value === '*' ? { all: true, types: [] } : { all: false, types: [...given, e.target.value] })}>
                        <option value="">Choose a folder…</option>
                        <option value="*">All folders</option>
                        {allCodes.filter((c) => !given.includes(c)).map((c) => <option key={c} value={c}>{c} — {nameOf(c)}</option>)}
                      </Select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
