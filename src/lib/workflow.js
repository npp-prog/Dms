// Document workflow: the route a document follows after it is encoded. Admins set the route of
// each document type (Administration > Workflow: documentType.route); a type without one follows
// its processing guide ("How to process this document"). Pure functions, no Firebase.
//
// document.workflow = {
//   state: 'in-progress' | 'done' | 'cancelled',
//   stage: index of the current step,
//   received: whether the office holding it has received the paper,
//   steps: [{ office (as in the guide), action, routedTo (office in Settings, or '' = preparer),
//            sign (the office must sign the PDF before releasing it) }],
//   events: [{ type: 'started' | 'received' | 'released' | 'returned' | 'completed' | 'cancelled',
//              stage, office, by, uid, at, remarks }],
// }
// document.currentOffice: the office holding it (what the Inbox and the security rules use);
// document.atPreparer: it is at a step of the preparer's office (only the preparer and the office
// head see it then, not the preparer's colleagues);
// document.routeOffices: every office on the route (their office heads can open the document).

// Steps done by the preparer's own office (or by people it deals with directly).
const PREPARER = /requesting|claimant|supervisor|payee|custodian|traveler|supplier|end[- ]?user/i;

// Guide wording -> office in Settings.
const KEYWORDS = [
  [/treasur|disbursing/i, (o) => /treasur/i.test(o)],
  [/accounting|accountant/i, (o) => /accounting/i.test(o)],
  [/budget/i, (o) => /budget/i.test(o)],
  [/vice mayor/i, (o) => /vice mayor/i.test(o)],
  [/mayor/i, (o) => /municipal mayor/i.test(o) && !/vice/i.test(o)],
  [/\bgso\b|general services|inspection|\bbac\b/i, (o) => /general services/i.test(o)],
  [/sangguniang|\bsb\b/i, (o) => /sangguniang/i.test(o)],
  [/assessor/i, (o) => /assessor/i.test(o)],
  [/engineer/i, (o) => /engineering/i.test(o)],
  [/hrm|human resource/i, (o) => /human resource/i.test(o)],
];

// The office (as named in Settings) that handles a step; '' means the preparer's office.
export function resolveOffice(stepOffice, offices = []) {
  const name = String(stepOffice || '').trim();
  if (!name || PREPARER.test(name)) return '';
  const exact = offices.find((o) => o.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  for (const [re, pick] of KEYWORDS) {
    if (re.test(name)) {
      const found = offices.find(pick);
      if (found) return found;
    }
  }
  return name;
}

// Who holds a step: the office it is routed to, or the preparer's office.
export const officeOf = (step, doc) => step?.routedTo || doc?.office || '';

// The route suggested by a type's processing guide, as the admin route editor starts it.
export function routeFromGuide(type, offices = []) {
  return (type?.processing || []).map((p) => ({
    office: resolveOffice(p.office, offices), action: p.action || '', sign: false,
    ...(p.assign ? { assign: p.assign } : {}), ...(p.fills?.length ? { fills: p.fills } : {}), ...(p.upload ? { upload: p.upload } : {}),
  }));
}

// The steps a new document of this type follows: the admin's route, else the processing guide.
export function routeSteps(type, offices = []) {
  const route = type?.route?.length ? type.route : routeFromGuide(type, offices);
  return route.map((s) => ({
    office: s.office || 'Requesting office', action: s.action || '', routedTo: s.office || '', sign: Boolean(s.sign),
    // The reference no. this office assigns when it receives the document (e.g. the DV No.).
    ...(s.assign?.field ? { assign: { field: s.assign.field, dateField: s.assign.dateField || '', pattern: s.assign.pattern || '' } } : {}),
    // Fields this office fills in (e.g. Check/ADA No., date, bank) and a file it must upload
    // (e.g. the DV signed by the payee in Box E), both before it releases the document.
    ...(s.fills?.length ? { fills: [...s.fills] } : {}),
    ...(s.upload ? { upload: String(s.upload) } : {}),
  }));
}

export function buildWorkflow(type, doc, offices, user, at = new Date().toISOString()) {
  const steps = routeSteps(type, offices);
  if (!steps.length) return null;
  const workflow = {
    state: 'in-progress', stage: 0, received: true, steps,
    events: [{ type: 'started', stage: 0, office: officeOf(steps[0], doc), by: user.displayName || user.email, uid: user.uid, at, remarks: '' }],
  };
  return { workflow, ...placement(workflow, doc) };
}

// currentOffice, atPreparer and routeOffices for the security rules and the Inbox.
export function placement(workflow, doc) {
  const offices = [...new Set(workflow.steps.map((s) => officeOf(s, doc)).filter(Boolean))];
  const moving = workflow.state === 'in-progress';
  const current = moving ? officeOf(workflow.steps[workflow.stage], doc) : '';
  return { currentOffice: current, atPreparer: moving && !workflow.steps[workflow.stage].routedTo, routeOffices: offices };
}

// May this user act on the document's current step?
// At the preparer's step: the preparer (or their office head). At a routed step: the office.
export function canAct(doc, { uid, office, isAdmin, isHead = false }) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress') return false;
  if (isAdmin) return true;
  const step = wf.steps[wf.stage];
  const holder = officeOf(step, doc);
  if (!step.routedTo) return doc.createdBy === uid || (isHead && Boolean(office) && office === holder);
  return Boolean(office) && office === holder;
}

// The actions available on the current step.
export function availableActions(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress') return [];
  const last = wf.stage === wf.steps.length - 1;
  return [
    ...(!wf.received ? ['receive'] : []),
    ...(wf.received ? [last ? 'complete' : 'release'] : []),
    ...(wf.stage > 0 ? ['return'] : []),
  ];
}

// A step that requires a signature: is this step's signature on the current PDF? (PDF versions
// record the step they were added at; lib/api.js addPdfVersion.) A document returned and sent
// back unchanged needs no new signature; once it is converted to PDF again (a new PDF, with no
// signatures), the step signs again. Signatures from before steps were recorded count for the
// first step (the preparer's).
export function signatureMissing(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress' || !wf.steps[wf.stage]?.sign) return false;
  const files = doc.pdf?.files || [];
  const current = files.slice(files.map((f) => f.kind).lastIndexOf('generated') + 1);
  return !current.some((f) => f.kind === 'signed' && (f.stage === wf.stage || (f.stage == null && wf.stage === 0)));
}

// Fields the current step's office must fill in that are still empty.
export function fillsMissing(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress') return [];
  return (wf.steps[wf.stage].fills || []).filter((k) => !String(doc.data?.[k] ?? '').trim());
}

// The current step must upload a file (e.g. the DV signed in Box E) and none is there yet. Like a
// signature, one uploaded at this step still counts when the document comes back to it.
export function uploadMissing(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress' || !wf.steps[wf.stage].upload) return false;
  return !(doc.stepFiles || []).some((f) => f.stage === wf.stage);
}

// Applies an action; returns the fields to write ({ workflow, currentOffice, routeOffices }).
export function applyAction(doc, action, user, remarks = '', at = new Date().toISOString()) {
  const wf = doc.workflow;
  if (!availableActions(doc).includes(action)) throw new Error(`"${action}" is not possible at this step.`);
  // The PDF is what travels: the preparer's office converts the document before it leaves.
  if (action === 'release' && wf.stage === 0 && !(doc.pdf?.files || []).length) {
    throw new Error('Convert the document to PDF (PDF and digital signatures) before releasing it.');
  }
  if ((action === 'release' || action === 'complete') && fillsMissing(doc).length) {
    throw new Error('Fill in this step\'s details (in the Workflow card) before releasing it.');
  }
  if ((action === 'release' || action === 'complete') && uploadMissing(doc)) {
    throw new Error(`Upload ${wf.steps[wf.stage].upload} before releasing it.`);
  }
  if ((action === 'release' || action === 'complete') && signatureMissing(doc)) {
    throw new Error('This step requires a signature: sign the PDF (PDF and digital signatures) before releasing it.');
  }
  if (action === 'return' && !String(remarks).trim()) throw new Error('Say why the document is returned.');
  const event = (type, stage) => ({ type, stage, office: officeOf(wf.steps[stage], doc), by: user.displayName || user.email, uid: user.uid, at, remarks: String(remarks || '').trim() });
  let next;
  if (action === 'receive') next = { ...wf, received: true, events: [...wf.events, event('received', wf.stage)] };
  if (action === 'release') next = { ...wf, stage: wf.stage + 1, received: false, events: [...wf.events, event('released', wf.stage)] };
  if (action === 'return') next = { ...wf, stage: wf.stage - 1, received: false, events: [...wf.events, event('returned', wf.stage)] };
  if (action === 'complete') next = { ...wf, state: 'done', events: [...wf.events, event('completed', wf.stage)] };
  return { workflow: next, ...placement(next, doc) };
}

export function cancelWorkflow(doc, user, at = new Date().toISOString()) {
  const wf = doc.workflow;
  if (!wf || wf.state !== 'in-progress') return null;
  const next = { ...wf, state: 'cancelled', events: [...wf.events, { type: 'cancelled', stage: wf.stage, office: officeOf(wf.steps[wf.stage], doc), by: user.displayName || user.email, uid: user.uid, at, remarks: '' }] };
  return { workflow: next, ...placement(next, doc) };
}

// One line for lists: where the document is.
export function whereIs(doc) {
  const wf = doc?.workflow;
  if (!wf) return '';
  if (wf.state === 'done') return 'Processed';
  if (wf.state === 'cancelled') return 'Cancelled';
  const step = wf.steps[wf.stage];
  return `${officeOf(step, doc) || 'Requesting office'}${wf.received ? '' : ' (to receive)'}`;
}

// The preparer may still change the document while it is at the first step (their office).
export function editableByPreparer(doc) {
  const wf = doc?.workflow;
  if (!wf) return true;
  return wf.state === 'in-progress' && wf.stage === 0;
}

export const ACTION_LABELS = { receive: 'Receive', release: 'Release', return: 'Return', complete: 'Mark processed' };
