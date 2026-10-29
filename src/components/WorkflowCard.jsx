import { useEffect, useState } from 'react';
import { ACTION_LABELS, availableActions, fillsMissing, officeOf, signatureMissing, uploadMissing } from '../lib/workflow.js';
import PersonPicker from './PersonPicker.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const EVENT_TEXT = {
  started: 'Started', received: 'Received', released: 'Released', returned: 'Returned', completed: 'Processed', cancelled: 'Cancelled', assigned: 'Assigned',
  route: 'Offices chosen', referred: 'Referred', 'referral received': 'Received (referred)', 'referral back': 'Sent back',
};

// The preparer chooses which office handles each step that has alternates (e.g. the Mayor or the
// Vice Mayor), before first releasing the document.
function OfficeChoice({ doc, busy, onChoose }) {
  const wf = doc.workflow;
  const main = (s) => (s.office === 'Requesting office' ? '' : s.office);
  const [picks, setPicks] = useState(() => Object.fromEntries(wf.steps.map((s, i) => [i, s.routedTo])));
  const name = (o) => o || "Preparer's office";
  const changed = wf.steps.some((s, i) => s.alternates?.length && picks[i] !== s.routedTo);
  return (
    <div className={`route-choice${wf.choose ? ' needed' : ''}`}>
      <div className="field-label">{wf.choose ? 'Choose who handles these steps' : 'Offices chosen for these steps'}</div>
      {wf.steps.map((s, i) => s.alternates?.length > 0 && (
        <div key={i} className="route-options">
          <div className="small"><b>Step {i + 1}</b> · {s.action}{s.sign ? ' · signs the PDF' : ''}</div>
          {[main(s), ...s.alternates].map((o) => (
            <label key={o || '-'} className={`route-option${picks[i] === o ? ' on' : ''}`}>
              <input type="radio" name={`wf-step-${i}`} checked={picks[i] === o} onChange={() => setPicks({ ...picks, [i]: o })} />
              <span><b>{name(o)}</b></span>
            </label>
          ))}
        </div>
      ))}
      {(wf.choose || changed) && (
        <div><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onChoose(picks)}>{wf.choose ? 'Confirm these offices' : 'Save the change'}</button></div>
      )}
    </div>
  );
}

// The office holding the document sends it to a person outside the route; they send it back.
function ReferPanel({ me, busy, onRefer, onCancel }) {
  const [person, setPerson] = useState(null);
  const [note, setNote] = useState('');
  return (
    <div className="refer-panel">
      <div className="field">
        <span className="field-label">Refer to a person (outside the route)</span>
        <PersonPicker value={person} onChange={setPerson} exclude={[me]} />
      </div>
      <label className="field">
        <span className="field-label">What should they do? (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please review and initial the attached liquidation" />
      </label>
      <p className="xs muted">They receive it in their Inbox, act on it (they can sign the PDF) and send it back to you. The route then goes on.</p>
      <div className="row gap">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !person} onClick={() => onRefer(person, note)}>Refer to {person?.displayName || 'this person'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// The route of a document: each office on it, where the document is now, who received and
// released it and when, and the actions open to the office holding it.
// What the office holding the document does at its step before releasing it: fill in details
// (e.g. Check/ADA No., date, bank) and upload a file (e.g. the DV signed by the payee in Box E).
function StepTasks({ doc, step, busy, onFill, onUpload, onOpenFile, children }) {
  const fields = doc.typeSnapshot?.fields || [];
  const keys = step.fills || [];
  const [values, setValues] = useState(() => Object.fromEntries(keys.map((k) => [k, doc.data?.[k] ?? ''])));
  useEffect(() => setValues(Object.fromEntries(keys.map((k) => [k, doc.data?.[k] ?? '']))), [doc.data, keys.join()]);
  const changed = keys.some((k) => String(values[k] ?? '') !== String(doc.data?.[k] ?? ''));
  const files = (doc.stepFiles || []).filter((f) => f.stage === doc.workflow.stage);
  return (
    <div className="step-tasks">
      {keys.length > 0 && (
        <div className="fields">
          {keys.map((k) => {
            const f = fields.find((x) => x.key === k) || { key: k, label: k, type: 'text' };
            const set = (v) => setValues({ ...values, [k]: v });
            return (
              <label key={k} className="field">
                <span className="field-label">{f.label}</span>
                {f.type === 'select'
                  ? <select value={values[k]} onChange={(e) => set(e.target.value)}><option value="">—</option>{(f.options || []).map((o) => <option key={o}>{o}</option>)}</select>
                  : <input type={f.type === 'date' ? 'date' : 'text'} className={f.type === 'date' ? '' : 'caps'} value={values[k]}
                    onChange={(e) => set(f.type === 'date' ? e.target.value : e.target.value.toUpperCase())} />}
              </label>
            );
          })}
          <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || !changed || keys.some((k) => !String(values[k]).trim())}
            onClick={() => onFill(values)}>Save details</button></div>
        </div>
      )}
      {step.upload && (
        <div className="step-upload">
          <div className="field-label">{step.upload}</div>
          {files.map((f, i) => <div key={i} className="small"><button type="button" className="link" onClick={() => onOpenFile(f)}>{f.name}</button> · {f.by}</div>)}
          <label className="btn btn-ghost btn-sm">
            {files.length ? 'Upload another' : 'Upload'}
            <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { onUpload(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
      {children}
    </div>
  );
}

export default function WorkflowCard({ doc, canAct, canStart, busy, onAction, onStart, onFill, onUpload, onOpenFile, sendPanel, me, canRefer, onRefer, onChooseOffices }) {
  const wf = doc.workflow;
  const [returning, setReturning] = useState(false);
  const [referring, setReferring] = useState(false);
  const [remarks, setRemarks] = useState('');

  if (!wf) {
    return (
      <section className="card">
        <h3>Workflow</h3>
        {canStart ? (
          <>
            <p className="small muted">This document is converted to PDF but not routed yet. Start the workflow to send the PDF
              along its route.</p>
            <button className="btn btn-primary" disabled={busy} onClick={onStart}>Start workflow</button>
          </>
        ) : <p className="small muted">The workflow starts when the document is converted to PDF: the PDF then goes from office to
          office along its route, to be received, signed and released.</p>}
      </section>
    );
  }

  const nameOf = (step) => officeOf(step, doc) || 'Requesting office';
  const fieldLabel = (key) => (doc.typeSnapshot?.fields || []).find((f) => f.key === key)?.label || key;
  const actions = canAct ? availableActions(doc) : [];
  const next = wf.steps[wf.stage + 1];
  const prev = wf.steps[wf.stage - 1];
  const referral = wf.referral;
  const unsigned = !referral && signatureMissing(doc);
  const released = wf.events.some((e) => e.type === 'released');
  const hasAlternates = wf.steps.some((s) => s.alternates?.length);
  const showChoice = wf.state === 'in-progress' && hasAlternates && wf.stage === 0 && !released && !referral && canAct;
  const blocked = fillsMissing(doc).length > 0 || uploadMissing(doc);
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
                <div className="wf-office">{nameOf(step)}{wf.choose && step.alternates?.length > 0 && <span className="small muted"> (or {step.alternates.map((o) => o || "Preparer's office").join(' or ')}: to choose)</span>}</div>
                <div className="small"><b>{step.action}</b>{step.sign && <span className="muted"> · signs the PDF</span>}
                  {step.assign && <span className="muted"> · assigns the {fieldLabel(step.assign.field)} on receiving</span>}</div>
                {state === 'current' && !referral && <div className="small wf-now">{wf.received ? 'Here now' : 'Waiting to be received'}</div>}
                {state === 'current' && referral && (
                  <div className="small wf-now">Referred to <b>{referral.name}</b>{referral.office ? ` (${referral.office})` : ''}: {referral.received ? 'with them now' : 'waiting to be received'}</div>
                )}
                {events.map((e, j) => (
                  <div key={j} className={`small ${e.type === 'returned' ? 'wf-returned' : 'muted'}`}>
                    {e.type === 'assigned'
                      ? <><b className="wf-assigned">{e.remarks}</b> assigned by {e.by} · {when(e.at)}</>
                      : <>{EVENT_TEXT[e.type]} by {e.by} · {when(e.at)}{e.remarks && <> — <i>{e.remarks}</i></>}</>}
                  </div>
                ))}
                {(doc.stepFiles || []).filter((f) => f.stage === i).map((f, j) => (
                  <div key={`f${j}`} className="small">
                    <button type="button" className="link" onClick={() => onOpenFile?.(f)}>{f.label}: {f.name}</button>
                    <span className="muted"> · uploaded by {f.by}</span>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {showChoice && <OfficeChoice key={JSON.stringify(wf.steps.map((s) => s.routedTo))} doc={doc} busy={busy} onChoose={onChooseOffices} />}

      {referral && actions.length > 0 && (
        <div className="wf-actions no-print">
          <div className="alert-info small">
            <b>{referral.by}</b> ({referral.fromOffice || 'the office holding it'}) referred this document to you{referral.note ? <>: <i>{referral.note}</i></> : '.'}
            {' '}{referral.received ? 'Act on it (you can sign the PDF), then send it back.' : 'Receive it to act on it.'}
          </div>
          {referral.received && (
            <div className="field field-wide" style={{ marginBottom: '.6rem' }}>
              <label className="field-label" htmlFor="wf-back">Remarks (optional)</label>
              <input id="wf-back" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Reviewed and signed" />
            </div>
          )}
          <div className="row gap wrap">
            {actions.includes('receive') && <button className="btn btn-primary" disabled={busy} onClick={() => act('receive')}>{ACTION_LABELS.receive}</button>}
            {actions.includes('back') && <button className="btn btn-primary" disabled={busy} onClick={() => act('back')}>Send back to {referral.fromOffice || referral.by}</button>}
          </div>
        </div>
      )}

      {!referral && actions.length > 0 && (
        <div className="wf-actions no-print">
          {referring ? (
            <ReferPanel me={me} busy={busy} onCancel={() => setReferring(false)}
              onRefer={(to, note) => onRefer(to, note, () => setReferring(false))} />
          ) : returning ? (
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
              {wf.received && (wf.steps[wf.stage].fills || wf.steps[wf.stage].upload) && (
                <StepTasks doc={doc} step={wf.steps[wf.stage]} busy={busy} onFill={onFill} onUpload={onUpload} onOpenFile={onOpenFile}>
                  {!fillsMissing(doc).length && sendPanel}
                </StepTasks>
              )}
              {wf.received && (fillsMissing(doc).length > 0 || uploadMissing(doc)) && (
                <div className="alert-info small">Before releasing: {[fillsMissing(doc).length && 'fill in and save the details above', uploadMissing(doc) && `upload ${wf.steps[wf.stage].upload}`].filter(Boolean).join(', and ')}.</div>
              )}
              {unsigned && wf.received && (
                <div className="alert-info small">This step requires a signature. Sign the PDF under <b>PDF and digital signatures</b>, then release it.</div>
              )}
              <div className="row gap wrap">
                {actions.includes('receive') && <button className="btn btn-primary" disabled={busy} onClick={() => act('receive')}>{ACTION_LABELS.receive}</button>}
                {actions.includes('release') && <button className="btn btn-primary" disabled={busy || unsigned || blocked || (wf.stage === 0 && wf.choose)} onClick={() => act('release')}>Release to {nameOf(next)}</button>}
                {actions.includes('complete') && <button className="btn btn-primary" disabled={busy || unsigned || blocked} onClick={() => act('complete')}>{ACTION_LABELS.complete}</button>}
                {actions.includes('return') && <button className="btn btn-ghost" disabled={busy} onClick={() => setReturning(true)}>Return to {nameOf(prev)}</button>}
                {canRefer && wf.received && <button className="btn btn-ghost" disabled={busy} onClick={() => setReferring(true)}>Refer to a person…</button>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
