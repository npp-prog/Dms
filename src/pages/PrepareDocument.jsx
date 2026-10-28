import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  createDocument, getDocument, getDocumentType, getTypeForDocument, listDocumentTypes, updateDocument,
} from '../lib/api.js';
import { buildSteps, computeFields, initialData, missingFields, byAccounting } from '../lib/forms.js';
import { effectiveChecklist, missingRequired } from '../lib/checklists.js';
import ChecklistStep from '../components/ChecklistStep.jsx';
import ChecklistSheet from '../components/ChecklistSheet.jsx';
import { signatoriesFrom } from '../lib/signatories.js';
import FieldInput from '../components/FieldInput.jsx';
import DocumentPreview from '../components/DocumentPreview.jsx';
import ProcessingGuide from '../components/ProcessingGuide.jsx';

function TypePicker() {
  const [types, setTypes] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { listDocumentTypes({ activeOnly: true }).then(setTypes).catch((e) => setError(e.message)); }, []);
  return (
    <div className="page">
      <h1>Prepare Document</h1>
      <p className="muted">Choose the document you need to prepare. You will be guided step by step, followed by the checklist of requirements.</p>
      {error && <div className="alert">{error}</div>}
      {!types && !error && <div className="spinner" />}
      {types?.length === 0 && <p className="muted">No document types are available yet.</p>}
      <div className="format-grid">
        {(types || []).map((t) => (
          <Link key={t.id} to={`/new/${t.id}`} className="card format-card clickable">
            <div className="format-code">{t.code}</div>
            <h4>{t.name}</h4>
            <p className="muted small">{t.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function PrepareDocument() {
  const { typeId, docId } = useParams();
  if (!typeId && !docId) return <TypePicker />;
  return <Wizard key={typeId || docId} typeId={typeId} docId={docId} />;
}

function Wizard({ typeId, docId }) {
  const navigate = useNavigate();
  const { actor, settings, isAdmin } = useAuth();
  const [type, setType] = useState(null);
  const [existing, setExisting] = useState(null);
  const [data, setData] = useState({});
  const [checklist, setChecklist] = useState({});
  // Documents attached that are not on the checklist (printed under Additional Documents).
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [transaction, setTransaction] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (docId) {
          const d = await getDocument(docId);
          if (!d) throw new Error('Document not found.');
          if (d.status === 'cancelled' && !isAdmin) throw new Error('This document was cancelled and can no longer be edited.');
          const t = await getTypeForDocument(d);
          if (!t) throw new Error('The document type of this document no longer exists.');
          setExisting(d);
          setType(t);
          setData({ ...initialData(t), ...d.data });
          setChecklist(d.checklist || {});
          setAdditionalDocs(d.additionalDocs || []);
          setTransaction(d.transaction || null);
        } else {
          const t = await getDocumentType(typeId);
          if (!t || t.active === false) throw new Error('Document type not found or inactive.');
          setType(t);
          setData(initialData(t));
        }
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [typeId, docId, isAdmin]);

  const steps = useMemo(() => {
    if (!type) return [];
    const fromLibrary = type.checklistSource && type.checklistSource !== 'own';
    return [
      ...buildSteps(type),
      {
        id: '__checklist',
        title: 'Checklist',
        instructions: fromLibrary
          ? 'Choose the type of transaction to load its checklist from the Municipal Accounting Office. Attach each document on it, then tick Y (or N/A if it does not apply). Items marked required must be ticked before the document can be marked complete.'
          : 'Confirm that each requirement is attached or complied with. Items marked required must be ticked before the document can be marked complete.',
      },
      { id: '__review', title: 'Review & Save', instructions: 'Review the generated document. Save as draft to continue later, or mark complete when everything is encoded. Then print it and process it as shown below.' },
    ];
  }, [type]);

  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/new">Back</Link></div>;
  if (!type) return <div className="page"><div className="spinner" /></div>;

  const step = steps[stepIndex];
  const stepMissing = step.fields ? missingFields(step.fields, data) : [];
  const allMissing = missingFields(type.fields.filter((f) => !byAccounting(f)), data);
  const library = type.checklistSource && type.checklistSource !== 'own';
  const activeChecklist = effectiveChecklist(type, transaction);
  const checklistMissing = activeChecklist ? missingRequired(activeChecklist.items, checklist) : [];
  const needsTransaction = library && !transaction;

  const next = () => {
    if (stepMissing.length) { setShowErrors(true); return; }
    setShowErrors(false);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const save = async (status) => {
    setBusy(true);
    setError('');
    try {
      let id = docId;
      const payload = { data, checklist, additionalDocs: additionalDocs.filter((t) => t.trim()), transaction, status, signatories: existing?.signatories || signatoriesFrom(settings) };
      if (existing) await updateDocument(docId, type, payload, actor, existing.history);
      else id = await createDocument(type, payload, actor);
      navigate(`/documents/${id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/new">Prepare</Link> / {type.code}{existing && ` / ${existing.controlNo}`}</div>
          <h1>{type.name}</h1>
        </div>
        <button className="btn btn-ghost" disabled={busy} onClick={() => save('draft')}>Save draft</button>
      </div>

      <ol className="stepper">
        {steps.map((s, i) => (
          <li key={s.id} className={i === stepIndex ? 'current' : i < stepIndex ? 'done' : ''}>
            <button type="button" onClick={() => (i <= stepIndex ? setStepIndex(i) : next())}>
              <span className="dot">{i < stepIndex ? '✓' : i + 1}</span>{s.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="split">
        <section className="card">
          <h3>Step {stepIndex + 1}: {step.title}</h3>
          {step.instructions && <div className="instructions">{step.instructions}</div>}

          {step.fields && (
            <div className="fields">
              {step.fields.map((f) => (
                <FieldInput key={f.key} field={f} value={data[f.key]}
                  invalid={showErrors && stepMissing.includes(f)}
                  onChange={(v) => setData((d) => computeFields(type.fields, { ...d, [f.key]: v }))} />
              ))}
            </div>
          )}

          {step.id === '__checklist' && (
            <ChecklistStep type={type} transaction={transaction} state={checklist} onState={setChecklist}
              additional={additionalDocs} onAdditional={setAdditionalDocs}
              onTransaction={(t) => {
                if (transaction?.code !== t.code) setChecklist({});
                setTransaction(t);
              }} />
          )}

          {step.id === '__review' && (
            <div>
              {allMissing.length > 0 && (
                <div className="alert">Missing required fields: {allMissing.map((f) => f.label).join(', ')}</div>
              )}
              {needsTransaction && (
                <div className="alert">Choose the type of transaction in the Checklist step.</div>
              )}
              {checklistMissing.length > 0 && (
                <div className="alert">Unchecked required items: {checklistMissing.map((c) => c.label).join(', ')}</div>
              )}
              {!allMissing.length && !checklistMissing.length && !needsTransaction && (
                <div className="alert alert-ok">All required fields and checklist items are complete.</div>
              )}
              <div className="row gap">
                <button className="btn btn-ghost" disabled={busy} onClick={() => save('draft')}>Save as draft</button>
                <button className="btn btn-primary" disabled={busy || allMissing.length > 0 || checklistMissing.length > 0 || needsTransaction}
                  onClick={() => save('complete')}>Mark complete</button>
              </div>
              <h4 style={{ marginTop: '1.4rem' }}>After saving: how to process this document</h4>
              <ProcessingGuide type={type} compact />
            </div>
          )}

          {showErrors && stepMissing.length > 0 && (
            <div className="alert">Please fill in: {stepMissing.map((f) => f.label).join(', ')}</div>
          )}

          <div className="row gap wizard-nav">
            <button className="btn btn-ghost" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>← Back</button>
            {stepIndex < steps.length - 1 && <button className="btn btn-primary" onClick={next}>Next →</button>}
          </div>
        </section>

        <div className="preview-col">
          {step.id === '__checklist' && activeChecklist ? (
            <>
              <div className="preview-label no-print row gap" style={{ justifyContent: 'space-between' }}>
                <span>Checklist {activeChecklist.code}</span>
                <button type="button" className="btn btn-sm" onClick={() => window.print()}>Print checklist</button>
              </div>
              <ChecklistSheet checklist={activeChecklist} state={checklist}
                data={data} additional={additionalDocs} settings={settings} />
            </>
          ) : (
            <>
              <div className="preview-label no-print">Live preview</div>
              <DocumentPreview type={type} data={data} checklist={checklist} settings={settings}
                signatories={existing?.signatories} controlNo={existing?.controlNo || '(assigned on save)'} preparedBy={existing?.createdByName || actor.displayName} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
