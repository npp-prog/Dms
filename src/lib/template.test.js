import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, generateDefaultTemplate } from './template.js';
import { amountToWords } from './numberToWords.js';
import { buildSteps, computeRow, missingChecklist, missingFields, slugKey } from './forms.js';
import { STARTER_TYPES } from './defaults.js';

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
    for (const f of type.fields) assert.ok(stepIds.has(f.step), `${type.code}.${f.key} has unknown step`);
    assert.equal(buildSteps(type).length, type.steps.length);
    const refs = [...type.template.matchAll(/\{\{\s*(?:#if\s+|table:|sum:)?([\w]+)/g)].map((m) => m[1]);
    const known = new Set([...keys, 'controlNo', 'lgu', 'today', 'preparedBy', 'docType']);
    for (const r of refs) assert.ok(known.has(r), `${type.code} template references unknown "${r}"`);
    assert.ok(renderTemplate(type.template, { fields: type.fields }).length > 100);
    assert.match(generateDefaultTemplate(type), /\{\{controlNo\}\}/);
  }
});
