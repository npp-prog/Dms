import { useState } from 'react';
import PersonPicker from './PersonPicker.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// Optional initial review of a draft, before it is converted to PDF: the preparer sends it to any
// active user, who finds it in their Inbox, reads it and writes back their review.
export default function ReviewCard({ doc, me, canSend, busy, onSend, onReview }) {
  const [person, setPerson] = useState(null);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const requests = (doc.forwards || []).filter((f) => f.kind === 'review');
  const reviews = doc.reviews || [];
  const askedMe = requests.some((f) => f.to === me);
  const inPdf = (doc.pdf?.files || []).length > 0;
  if (!canSend && !askedMe && !reviews.length) return null;
  if (inPdf && !reviews.length) return null;

  // Each request, with the reviews that person wrote after it.
  const rows = requests.map((f) => ({ ...f, answers: reviews.filter((r) => r.uid === f.to && r.at >= f.at) }));
  const others = reviews.filter((r) => !requests.some((f) => f.to === r.uid));

  return (
    <section className="card review-card">
      <div className="card-head"><h3>Review</h3>{!inPdf && <span className="small muted">optional, before the PDF</span>}</div>
      {canSend && !inPdf && (
        <div className="refer-panel">
          <p className="small muted">Send the draft to anyone in DMS for an initial review before you convert it to PDF. They can read it and
            write back; nothing waits for them.</p>
          <div className="field">
            <span className="field-label">Send for review to</span>
            <PersonPicker value={person} onChange={setPerson} exclude={[me]} />
          </div>
          <label className="field">
            <span className="field-label">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || !person}
            onClick={() => onSend(person, note, () => { setPerson(null); setNote(''); })}>Send for review</button></div>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="review-list">
          {rows.map((f, i) => (
            <li key={i}>
              <div><b>{f.toName}</b>{f.toOffice && <span className="small muted"> · {f.toOffice}</span>}
                {' '}<span className={`badge ${f.answers.length ? 'badge-green' : 'badge-yellow'}`}>{f.answers.length ? 'Reviewed' : 'Waiting'}</span></div>
              <div className="xs muted">Sent by {f.by} · {when(f.at)}{f.note && <> — <i>{f.note}</i></>}</div>
              {f.answers.map((r, j) => <div key={j} className="review-comment">{r.comment}<div className="xs muted">{when(r.at)}</div></div>)}
            </li>
          ))}
          {others.map((r, j) => (
            <li key={`o${j}`}><b>{r.name}</b><div className="review-comment">{r.comment}<div className="xs muted">{when(r.at)}</div></div></li>
          ))}
        </ul>
      )}
      {askedMe && !inPdf && (
        <div className="refer-panel">
          <label className="field">
            <span className="field-label">Your review</span>
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          </label>
          <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || !comment.trim()}
            onClick={() => onReview(comment, () => setComment(''))}>Send review</button></div>
        </div>
      )}
    </section>
  );
}
