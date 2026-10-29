import { useEffect, useState } from 'react';
import { addNote, deleteNote, listNotes, setNoteDone } from '../lib/api.js';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');

// Dashboard: the user's own notes and reminders. Ticking one archives it at once (it moves to
// Archived, where it can be brought back or deleted). Only the user sees them.
export default function NotesCard({ uid }) {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [showDue, setShowDue] = useState(false);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { listNotes(uid).then(setNotes).catch((e) => { setNotes([]); setError(e.message); }); }, [uid]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    run(async () => {
      const note = await addNote(uid, text, due);
      setNotes((n) => [...n, note]);
      setText(''); setDue(''); setShowDue(false);
    });
  };
  // Moves at once; put back if it could not be saved.
  const toggle = (note) => {
    const flip = (x) => (x.id === note.id ? { ...x, done: !note.done, doneAt: note.done ? '' : new Date().toISOString() } : x);
    setNotes((n) => n.map(flip));
    setNoteDone(uid, note.id, !note.done).catch((e) => {
      setError(e.message);
      setNotes((n) => n.map((x) => (x.id === note.id ? note : x)));
    });
  };
  const remove = (note) => window.confirm('Delete this note?') && run(async () => {
    await deleteNote(uid, note.id);
    setNotes((n) => n.filter((x) => x.id !== note.id));
  });

  // Open notes: dated ones first, soonest first; then the others, oldest first.
  const open = (notes || []).filter((n) => !n.done)
    .sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : a.createdAt.localeCompare(b.createdAt)));
  const done = (notes || []).filter((n) => n.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const t = today();

  return (
    <div className="card notes-card">
      <div className="card-head"><h3>My notes</h3><span className="small muted">{open.length ? `${open.length} to do` : ''}</span></div>
      <form className="note-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="New note or reminder" placeholder="Add a note or reminder" />
        {showDue
          ? <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Remind on" />
          : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDue(true)} title="Add a date to remind you">+ Date</button>}
        <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>Add</button>
      </form>
      {error && <div className="alert small">{error}</div>}
      {notes === null ? <div className="spinner" /> : (
        <ul className="note-list">
          {open.length === 0 && <li className="small muted note-empty">No notes. Add one above; tick it when done.</li>}
          {open.map((n) => (
            <li key={n.id}>
              <label className="check note-check">
                <input type="checkbox" checked={false} disabled={busy} onChange={() => toggle(n)} aria-label="Done: archive it" />
                <span className="note-text">{n.text}</span>
              </label>
              {n.due && <span className={`badge ${n.due < t ? 'badge-red' : n.due === t ? 'badge-yellow' : 'badge-gray'}`}>{n.due === t ? 'Today' : n.due < t ? `Overdue · ${day(n.due)}` : day(n.due)}</span>}
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="note-archive" open={archived} onToggle={(e) => setArchived(e.currentTarget.open)}>
          <summary className="small">Archived ({done.length})</summary>
          <ul className="note-list">
            {done.map((n) => (
              <li key={n.id} className="done">
                <label className="check note-check">
                  <input type="checkbox" checked disabled={busy} onChange={() => toggle(n)} aria-label="Not done: bring it back" />
                  <span className="note-text">{n.text}</span>
                </label>
                <span className="xs muted">{when(n.doneAt)}</span>
                <button type="button" className="btn-icon" title="Delete" disabled={busy} onClick={() => remove(n)}>×</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
