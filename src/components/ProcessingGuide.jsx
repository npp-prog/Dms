// "How to process this document": the routing an end user follows after
// encoding and printing. FTS does not route documents itself.
export function Copies({ copies }) {
  const list = (copies || []).filter((c) => c.to);
  if (!list.length) return null;
  const total = list.reduce((t, c) => t + (Number(c.count) || 1), 0);
  return (
    <div className="copies">
      <b>Print {total} {total === 1 ? 'copy' : 'copies'}:</b>{' '}
      {list.map((c, i) => (
        <span key={i} className="copy">{c.to}{(Number(c.count) || 1) > 1 ? ` ×${c.count}` : ''}{c.original ? ' (original)' : ''}</span>
      ))}
    </div>
  );
}

export default function ProcessingGuide({ type, compact = false }) {
  const steps = type?.processing || [];
  if (!steps.length) {
    return <><Copies copies={type?.copies} /><p className="muted small">No processing guide has been written for this document type yet.</p></>;
  }
  return (
    <>
    <Copies copies={type?.copies} />
    <ol className={`process ${compact ? 'compact' : ''}`}>
      {steps.map((s, i) => (
        <li key={s.id || i}>
          <span className="pn">{i + 1}</span>
          <div>
            <div className="po">{s.office}</div>
            <b>{s.action}</b>
            {s.details && !compact && <p>{s.details}</p>}
          </div>
        </li>
      ))}
    </ol>
    </>
  );
}
