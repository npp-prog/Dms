import { useState } from 'react';
import { LinkList } from './DocLinks.jsx';
import { UPLOAD_TYPES, uploadSupporting } from '../lib/supporting.js';

// Supplemental documents: files that go with the document but are not on its checklist. Each is
// also a DMS document of its own (All Documents), and shows as a tab after the PDF.
export default function SupplementsCard({ doc, actor, canAdd, canRemove, busy, onSave, onOpen }) {
  const list = doc.supplements || [];
  const [label, setLabel] = useState('');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  if (!canAdd && !list.length) return null;

  const add = async (file) => {
    if (!file) return;
    setError('');
    try {
      const l = await uploadSupporting({
        parent: doc, slot: 'supplemental', label: label.trim() || 'Supplemental document', code: 'SUPP', number: list.length + 1, file, actor, onStep: setStep,
      });
      await onSave([...list, l], `added ${l.dms.controlNo} (${l.label})`);
      setLabel('');
    } catch (e) {
      setError(e.message);
    } finally {
      setStep('');
    }
  };

  return (
    <section className="card supplements-card">
      <div className="card-head"><h3>Supplemental documents</h3>{list.length > 0 && <span className="small muted">{list.length}</span>}</div>
      {list.length === 0 && <p className="small muted">Files that go with this document but are not on its checklist. Each is saved in All Documents
        with its own control number, and opens as a tab after the PDF.</p>}
      <LinkList links={list.map((l) => ({ ...l, name: l.label || l.name }))}
        onOpen={(l, i) => onOpen(list[i], `supp:${i}`)}
        onRemove={canRemove ? (i) => window.confirm('Remove it from this document? It stays in All Documents.') && onSave(list.filter((_, j) => j !== i), `removed ${list[i].dms?.controlNo || list[i].name}`) : undefined} />
      {error && <div className="alert small">{error}</div>}
      {canAdd && (
        <div className="supp-add">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} aria-label="What is it (optional)" placeholder="What is it (optional)" disabled={!!step} />
          {step ? <span className="small muted">{step}</span> : (
            <label className={`btn btn-ghost btn-sm${busy ? ' disabled' : ''}`}>
              + Upload
              <input type="file" hidden accept={UPLOAD_TYPES.join(',')} disabled={busy} onChange={(e) => { add(e.target.files[0]); e.target.value = ''; }} />
            </label>
          )}
        </div>
      )}
    </section>
  );
}
