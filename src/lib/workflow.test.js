import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedFields, liveFiles, refStampMissing, refUndoBase, signatureMissing } from './workflow.js';
test('changing a reference no. already on the PDF: back to the version before it', () => {
  const wf = { state: 'in-progress', stage: 1, steps: [{ office: 'A' }, { office: 'B', sign: true, assign: { field: 'no', dateField: 'dt' } }] };
  const refNos = { no: { value: '1', label: 'DV No.', stage: 1, at: '2026-10-30T01:00:00Z' } };
  const g = { kind: 'generated', at: '2026-10-30T00:00:00Z', stage: 0 };
  const s0 = { kind: 'signed', stage: 0, at: '2026-10-30T00:10:00Z' };
  const s1 = { kind: 'signed', stage: 1, refStage: 1, at: '2026-10-30T02:00:00Z' };
  let doc = { workflow: wf, refNos, pdf: { files: [g, s0, s1] } };
  assert.equal(refStampMissing(doc), null);
  assert.equal(signatureMissing(doc), false);
  assert.equal(refUndoBase(doc), 1);
  doc = { ...doc, pdf: { files: [g, s0, s1, { kind: 'restored', restores: 1, stage: 1 }] } };
  assert.deepEqual(liveFiles(doc.pdf.files).map((f) => f.i), [0, 1]);
  assert.equal(refStampMissing(doc).value, '1');
  assert.equal(signatureMissing(doc), true);
  assert.equal(refUndoBase(doc), -1);
  // put on again: changeable again
  doc = { ...doc, pdf: { files: [...doc.pdf.files, { kind: 'stamped', refStage: 1, stage: 1 }] } };
  assert.equal(refStampMissing(doc), null);
  assert.equal(refUndoBase(doc), 1);
  // released: no longer
  assert.equal(refUndoBase({ ...doc, workflow: { ...wf, stage: 2, steps: [...wf.steps, { office: 'C' }] } }), -1);
});

test('the DV No. and its date are assigned on the route, not typed in the Accounting panel', () => {
  const type = { processing: [{ office: 'A' }, { office: 'B', assign: { field: 'dvNo', dateField: 'dvDate' } }] };
  assert.deepEqual([...assignedFields(type, {})], ['dvNo', 'dvDate']);
  assert.deepEqual([...assignedFields(type, { workflow: { steps: [{ office: 'A' }] } })], []);
  assert.deepEqual([...assignedFields({ route: [{ assign: { field: 'orNo' } }], processing: type.processing }, {})], ['orNo']);
});
