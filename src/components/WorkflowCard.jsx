import { useState } from 'react';
import { ACTION_LABELS, availableActions, officeOf } from '../lib/workflow.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const EVENT_TEXT = { started: 'Started', received: 'Received', released: 'Released', returned: 'Returned', completed: 'Processed', cancelled: 'Cancelled' };

// The route of a document: each office on it, where the document is now, who received and
// released it and when, and the actions open to the office holding it.
export default function WorkflowCard({ doc, canAct, canStart, busy, onAction, onStart }) {
  const wf = doc.workflow;
  const [returning, setReturning] = useState(false);
  const [remarks, setRemarks] = useState('');

  if (!wf) {
    return (
      <section className="card">
        <h3>Workflow</h3>
        {canStart ? (
          <>
            <p className="small muted">This document is complete but not routed yet. Start the workflow to send it along its route
              (see How to process this document).</p>
            <button className="btn btn-primary" disabled={busy} onClick={onStart}>Start workflow</button>
          </>
        ) : <p className="small muted">The workflow starts when the document is marked complete.</p>}
      </section>
    );
  }

  const nameOf = (step) => officeOf(step, doc) || 'Requesting office';
  const actions = canAct ? availableActions(doc) : [];
  const next = wf.steps[wf.stage + 1];
  const prev = wf.steps[wf.stage - 1];
  const act = (action) => onAction(action, remarks, () => { setRemarks(''); setReturning(false); });

  return (
    <section className="card workflow-card">
      <div className="card-head">
        <h3>Workflow</h3>
        <span className={`badge ${wf.state === 'done' ? 'badge-green' : wf.state === 'cancelled' ? 'badge-gray' : 'badge-blue'}`}>
          {wf.state === 'done' ? 'Processed' : wf.state === 'cancelled' ? 'Cancelled' : `Step ${wf.stage + 1} of ${wf.steps.length}`}
        </span>
      </div>
      <ol className="wf-steps">
        {wf.steps.map((step, i) => {
          const state = wf.state === 'done' || i < wf.stage ? 'done' : i === wf.stage && wf.state === 'in-progress' ? 'current' : 'pending';
          const events = wf.events.filter((e) => e.stage === i);
          return (
            <li key={i} className={`wf-${state}`}>
              <span className="wf-dot">{state === 'done' ? '✓' : i + 1}</span>
              <div>
                <div className="wf-office">{nameOf(step)}{step.routedTo === '' && doc.office ? '' : ''}</div>
                <div className="small"><b>{step.action}</b></div>
                {state === 'current' && <div className="small wf-now">{wf.received ? 'Here now' : 'Waiting to be received'}</div>}
                {events.map((e, j) => (
                  <div key={j} className={`small ${e.type === 'returned' ? 'wf-returned' : 'muted'}`}>
                    {EVENT_TEXT[e.type]} by {e.by} · {when(e.at)}{e.remarks && <> — <i>{e.remarks}</i></>}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {actions.length > 0 && (
        <div className="wf-actions no-print">
          {returning ? (
            <div className="fields">
              <div className="field field-wide">
                <label className="field-label" htmlFor="wf-remarks">Why is it returned to {prev ? nameOf(prev) : 'the previous office'}?</label>
                <textarea id="wf-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. OBR not attached; Box A not signed" />
              </div>
              <div className="row gap">
                <button className="btn btn-danger" disabled={busy || !remarks.trim()} onClick={() => act('return')}>Return</button>
                <button className="btn btn-ghost" onClick={() => setReturning(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {(actions.includes('release') || actions.includes('complete')) && (
                <div className="field field-wide" style={{ marginBottom: '.6rem' }}>
                  <label className="field-label" htmlFor="wf-note">Remarks (optional)</label>
                  <input id="wf-note" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Signed Box B; DV No. 101-2026-10-0045" />
                </div>
              )}
              <div className="row gap wrap">
                {actions.includes('receive') && <button className="btn btn-primary" disabled={busy} onClick={() => act('receive')}>{ACTION_LABELS.receive}</button>}
                {actions.includes('release') && <button className="btn btn-primary" disabled={busy} onClick={() => act('release')}>Release to {nameOf(next)}</button>}
                {actions.includes('complete') && <button className="btn btn-primary" disabled={busy} onClick={() => act('complete')}>{ACTION_LABELS.complete}</button>}
                {actions.includes('return') && <button className="btn btn-ghost" disabled={busy} onClick={() => setReturning(true)}>Return to {nameOf(prev)}</button>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
