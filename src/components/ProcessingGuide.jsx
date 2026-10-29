// "How to process this document": the routing an end user follows after
// encoding and printing. The route itself is set under Administration > Workflow (else these steps).
export default function ProcessingGuide({ type, compact = false }) {
  const steps = type?.processing || [];
  if (!steps.length) {
    return <p className="muted small">No processing guide has been written for this document type yet.</p>;
  }
  return (
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
  );
}
