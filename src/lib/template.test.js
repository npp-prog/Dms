import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, generateDefaultTemplate } from './template.js';
import { amountToWords } from './numberToWords.js';
import { readFileSync } from 'node:fs';
import { buildSteps, computeFields, computeRow, evaluate, missingChecklist, missingFields, slugKey } from './forms.js';
import {
  acceptsDocument, carryOver, checklistProgress, effectiveChecklist, groupItems, headerValue, missingRequired, searchChecklists,
} from './checklists.js';
import { STARTER_TYPES } from './defaults.js';
import { fitPage, pageSize } from './paper.js';
import { isOwnerEmail } from './owner.js';
import { cleanPart, fileBase, fundCode, ftsNo, uniqueNamer } from './naming.js';

const LIBRARY = JSON.parse(readFileSync(new URL('../data/checklists.json', import.meta.url)));

test('renders fields with filters and escapes HTML', () => {
  const out = renderTemplate('<p>{{payee|upper}} {{amount|peso}} {{date|date}} {{x}}</p>', {
    data: { payee: 'Acme <Corp>', amount: '1234.5', date: '2026-01-05', x: '<script>' },
  });
  assert.equal(out, '<p>ACME &lt;CORP&gt; ₱ 1,234.50 January 5, 2026 &lt;script&gt;</p>');
});

test('table, sum, each, check and context values', () => {
  const fields = [{ key: 'items', type: 'table', minRows: 3, columns: [
    { key: 'description', label: 'Desc', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ] }];
  const data = { amount: 'TOP', items: [{ description: 'Pens', amount: 100 }, { description: 'Paper', amount: '250.25' }] };
  const ctx = { data, fields, checklist: { a: true }, controlNo: 'DV-1', lgu: { name: 'LGU X' } };
  assert.equal(renderTemplate('{{sum:items.amount}}', ctx), '350.25');
  assert.equal(renderTemplate('{{controlNo}} {{lgu.name}} {{check:a}}{{check:b}}', ctx), 'DV-1 LGU X &#9745;&#9744;');
  const each = renderTemplate('{{#each items}}[{{@no}}:{{description}}:{{amount}}]{{/each}}', ctx);
  assert.equal(each, '[1:Pens:100][2:Paper:250.25][::]');
  const table = renderTemplate('{{table:items}}', ctx);
  assert.match(table, /<td class="r">250.25<\/td>/);
  assert.match(table, /NOTHING FOLLOWS/);
  assert.match(table, /<b>350.25<\/b>/);
});

test('negative amounts print in parentheses', () => {
  assert.equal(renderTemplate('{{a|currency}} {{b|currency}}', { data: { a: '-100', b: 2500.5 } }), '(100.00) 2,500.50');
});

test('conditional blocks', () => {
  const ctx = { data: { mode: 'ADA', empty: '' } };
  assert.equal(renderTemplate('[{{#if mode=ADA}}x{{/if}}][{{#if mode=MDS Check}}x{{/if}}]', ctx), '[x][]');
  assert.equal(renderTemplate('{{#if mode}}has{{/if}}{{#if empty}}no{{/if}}', ctx), 'has');
});

test('amount in words', () => {
  assert.equal(amountToWords(1234.5), 'One Thousand Two Hundred Thirty-Four Pesos and 50/100 Only');
  assert.equal(amountToWords(1), 'One Peso and 00/100 Only');
  assert.equal(amountToWords(2000000.07), 'Two Million Pesos and 07/100 Only');
});

test('form helpers', () => {
  const cols = [{ key: 'qty' }, { key: 'unitCost' }, { key: 'total', compute: 'qty*unitCost' }];
  assert.equal(computeRow(cols, { qty: '3', unitCost: '10.10' }).total, 30.3);
  assert.equal(computeRow(cols, { qty: '', unitCost: '' }).total, '');
  const fields = [{ key: 'a', required: true }, { key: 't', type: 'table', required: true }, { key: 'b' }];
  assert.deepEqual(missingFields(fields, { a: ' ', t: [{ x: '' }] }).map((f) => f.key), ['a', 't']);
  assert.deepEqual(missingFields(fields, { a: 'x', t: [{ x: '1' }] }), []);
  assert.deepEqual(missingChecklist([{ id: 'c', required: true }, { id: 'd' }], {}).map((c) => c.id), ['c']);
  assert.equal(slugKey('ObR / ORS No.'), 'obrOrsNo');
});

test('starter types are consistent and render', () => {
  for (const type of STARTER_TYPES) {
    const keys = type.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${type.code} has duplicate keys`);
    const stepIds = new Set(type.steps.map((s) => s.id));
    for (const f of type.fields) assert.ok(f.filledBy === 'accounting' || stepIds.has(f.step), `${type.code}.${f.key} has unknown step`);
    assert.equal(buildSteps(type).length, type.steps.length);
    const columns = type.fields.flatMap((f) => (f.columns || []).map((c) => c.key));
    const known = new Set([...keys, ...columns, 'controlNo', 'lgu', 'sig', 'today', 'preparedBy', 'docType']);
    const refs = [...type.template.matchAll(/\{\{\s*(?:#if\s+|table:|sum:)?([\w]+)/g)].map((m) => m[1]);
    for (const r of refs) assert.ok(known.has(r), `${type.code} template references unknown "${r}"`);
    for (const f of type.fields) {
      for (const c of f.columns || []) if (c.compute) assert.ok(evaluate(c.compute, {}) === '', `${type.code}.${c.key} formula`);
    }
    const html = renderTemplate(type.template, { fields: type.fields, signatories: { mayor: 'JUAN DELA CRUZ' } });
    assert.ok(html.length > 500);
    assert.doesNotMatch(html, /\{\{/, `${type.code} left a tag unrendered`);
    assert.ok(['own', 'disbursement', 'liquidation'].includes(type.checklistSource));
    assert.ok(type.processing.length >= 3, `${type.code} needs a processing guide`);
    for (const p of type.processing) assert.ok(p.id && p.office && p.action, `${type.code} processing step incomplete`);
    assert.equal(type.copies, undefined, `${type.code} should not list printed copies (documents are digital)`);
    assert.doesNotMatch(html, /Appendix/i, `${type.code} still prints an appendix number`);
    assert.equal(type.paperSize, 'A4', `${type.code} paper size`);
    assert.equal(type.orientation, 'portrait', `${type.code} orientation`);
  }
});

test('formulas and computed fields', () => {
  assert.equal(evaluate('qty*unitCost', { qty: '3', unitCost: '10.10' }), 30.3);
  assert.equal(evaluate('gross-deductions', { gross: 1000, deductions: '250.5' }), 749.5);
  assert.equal(evaluate('labor+spareParts+materials', { labor: 100, materials: 5 }), 105);
  assert.equal(evaluate('sum:items.amount-cashAdvance', { items: [{ amount: 300 }, { amount: 200 }], cashAdvance: 450 }), 50);
  assert.equal(evaluate('a+b', {}), '');
  const fields = [{ key: 'spent', compute: 'sum:items.amount' }, { key: 'back', compute: 'spent-advance' }];
  const out = computeFields(fields, { items: [{ amount: '120' }], advance: '100' });
  assert.equal(out.spent, 120);
  assert.equal(out.back, 20);
});

test('checklist helpers', () => {
  const items = [{ id: 'i1', required: true, label: 'DV' }, { id: 'i2', required: false, label: 'BAC', group: 'Award' }, { id: 'i3', required: true, label: 'NOA', group: 'Award' }];
  assert.deepEqual(missingRequired(items, { i1: 'Y', i2: 'NA' }).map((i) => i.id), ['i3']);
  assert.deepEqual(missingRequired(items, { i1: true, i3: 'Y' }), []);
  assert.deepEqual(groupItems(items).map((g) => [g.group, g.items.length]), [['', 1], ['Award', 2]]);
  assert.deepEqual(checklistProgress(items, { i1: 'Y', i2: 'NA' }), { answered: 2, total: 3 });
  assert.equal(headerValue('DV Number', { dvNo: '101' }), '101');
  assert.equal(headerValue('OBR/FURS Number', { obrNo: '100-26-10-001' }), '100-26-10-001');
  assert.equal(headerValue('Payee', { claimant: 'Ana' }), 'Ana');
  assert.equal(headerValue('Liquidation Report No.', { serialNo: 'LR-9' }), 'LR-9');
  const lib = [{ code: '1613', kind: 'disbursement', title: 'Payment to Supplier - Direct Acquisition', category: 'x' }, { code: '2002', kind: 'liquidation', title: 'Local Travel', category: 'y' }];
  assert.deepEqual(searchChecklists(lib, 'direct acq', 'disbursement').map((c) => c.code), ['1613']);
  assert.deepEqual(searchChecklists(lib, '2002').map((c) => c.code), ['2002']);
  const own = effectiveChecklist({ checklistSource: 'own', code: 'PR', name: 'Purchase Request', checklist: [{ id: 'c1', label: 'PPMP', required: true }] });
  assert.equal(own.items[0].id, 'c1');
  assert.equal(effectiveChecklist({ checklistSource: 'disbursement' }, null), null);
});

test('checklist library data is complete', () => {
  assert.equal(LIBRARY.length, 210);
  assert.equal(new Set(LIBRARY.map((c) => c.code)).size, LIBRARY.length);
  assert.equal(LIBRARY.filter((c) => c.kind === 'liquidation').length, 9);
  for (const c of LIBRARY) {
    assert.ok(c.title && c.items.length > 0, `${c.code} empty`);
    assert.equal(new Set(c.items.map((i) => i.id)).size, c.items.length, `${c.code} duplicate item ids`);
    for (const i of c.items) {
      assert.equal(typeof i.required, 'boolean');
      // Document Type: the generic name; Document Details: the instruction that specifies it.
      assert.ok(i.label && i.label.length <= 60, `${c.code} ${i.id}: document type missing or too long`);
      assert.equal(typeof i.details, 'string', `${c.code} ${i.id}: no document details field`);
    }
    assert.ok(!c.items.some((i) => /\(deleted\b/i.test(`${i.label} ${i.details}`)), `${c.code} has a deleted item`);
  }
  const c1613 = LIBRARY.find((c) => c.code === '1613');
  assert.equal(c1613.items.length, 15);
  assert.equal(c1613.items.filter((i) => i.required).length, 8);
});

test('checklist items accept only documents of their kind', () => {
  const c1001 = LIBRARY.find((c) => c.code === '1001');
  const obr = c1001.items.find((i) => i.label === 'Obligation Request');
  const doc = (typeCode, typeName) => ({ typeCode, typeName });
  assert.ok(acceptsDocument(obr, doc('OBR', 'Obligation Request')));
  assert.ok(acceptsDocument(obr, doc('FURS', 'Fund Utilization Request and Status')), 'OBR item also takes a FURS');
  assert.ok(!acceptsDocument(obr, doc('DV', 'Disbursement Voucher')));
  const c1613 = LIBRARY.find((c) => c.code === '1613');
  const pr = c1613.items.find((i) => i.label === 'Purchase Request');
  assert.ok(acceptsDocument(pr, doc('PR', 'Purchase Request')) && !acceptsDocument(pr, doc('PO', 'Purchase Order')));
  const bac = c1613.items.find((i) => i.label === 'BAC Resolution');
  assert.ok(!['OBR', 'FURS', 'DV', 'PR', 'PO', 'JO', 'PCV', 'LR', 'IT', 'PAYROLL'].some((t) => acceptsDocument(bac, doc(t, t))));
});

test('changing the checklist keeps answers and links of shared requirements', () => {
  const a = LIBRARY.find((c) => c.code === '1613');
  const b = LIBRARY.find((c) => c.code === '1001');
  const dvA = a.items.find((i) => i.label === 'Disbursement Voucher');
  const obrA = a.items.find((i) => i.label === 'Obligation Request');
  const prA = a.items.find((i) => i.label === 'Purchase Request');
  const kept = carryOver(a.items, b.items, { [dvA.id]: 'Y', [obrA.id]: 'Y', [prA.id]: 'Y' }, { [obrA.id]: [{ kind: 'fts', id: 'x' }] });
  const obrB = b.items.find((i) => i.label === 'Obligation Request');
  assert.equal(kept.state[obrB.id], 'Y');
  assert.deepEqual(kept.links[obrB.id], [{ kind: 'fts', id: 'x' }]);
  assert.equal(Object.keys(kept.state).length, 2, 'only DV and OBR are on both checklists');
});

test('bulk download file names', () => {
  assert.equal(fileBase({ fund: 'General Fund', subject: 'Neil Priolo', number: 2, type: 'OBR', ref: ftsNo('FTS-000001') }), 'GF_NEIL PRIOLO_02_OBR_FTS000001');
  assert.equal(fundCode('Special Education Fund'), 'SEF');
  assert.equal(fundCode('20% Development Fund'), '20DF');
  assert.equal(fundCode(''), 'NOFUND');
  assert.equal(cleanPart('A/B: "C"_D?'), 'A B C D');
  const name = uniqueNamer();
  assert.equal(name('X', 'pdf'), 'X.pdf');
  assert.equal(name('X', 'pdf'), 'X (2).pdf');
});

test('paper sizes and fit to page', () => {
  assert.deepEqual(pageSize('Folio'), { key: 'Folio', w: 215.9, h: 330.2, css: '215.9mm 330.2mm' });
  assert.equal(pageSize('Long').key, 'Folio');
  assert.equal(pageSize('A4', 'landscape').css, '297mm 210mm');
  assert.equal(pageSize('Unknown').key, 'A4');
  // Content that already fits is not enlarged.
  assert.deepEqual(fitPage(() => ({ w: 190, h: 100 }), 190, 277), { scale: 1, width: 190 });
  // Twice as tall as the page; laying it out wider makes it a bit shorter.
  const tall = (w) => ({ w, h: 554 * (190 / w) ** 0.3 });
  const t = fitPage(tall, 190, 277);
  assert.ok(t.scale < 1 && t.scale > 0.45);
  assert.ok(tall(t.width).h * t.scale <= 277);
  assert.ok(Math.abs(t.width * t.scale - 190) < 3, 'still fills the width');
  // Too wide (a table needing 260 mm) but short: scaled to fit the width.
  const wide = (w) => ({ w: Math.max(w, 260), h: 120 });
  const d = fitPage(wide, 190, 277);
  assert.ok(Math.abs(d.scale - (190 / 260) * 0.985) < 0.01);
  assert.ok(d.width >= 260 && d.width * d.scale <= 190.5);
  // Never below the minimum scale.
  const long = fitPage((w) => ({ w, h: 400 * (190 / w) }), 190, 277, 0.8);
  assert.equal(long.scale, 0.8);
  // Kept at the minimum scale, it must still fit the page width (no running off the right edge).
  assert.ok(Math.abs(long.width * long.scale - 190) < 0.01, `laid out ${long.width} mm at ${long.scale}`);
});

test('superadmin email', () => {
  assert.equal(isOwnerEmail('npp@mgocandoniaccounting.org'), true);
  assert.equal(isOwnerEmail(' NPP@MgoCandoniAccounting.org '), true);
  assert.equal(isOwnerEmail('npp@gmail.com'), false);
  assert.equal(isOwnerEmail(''), false);
  // firestore.rules must name the same email
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /\['npp@mgocandoniaccounting\.org'\]/);
});
