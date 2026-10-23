import { amountToWords } from './numberToWords.js';

// Lightweight template engine for document formats.
//
//   {{field}}                   value of a field (HTML-escaped)
//   {{field|currency}}          filters: currency, peso, number, date, upper, words
//   {{lgu.name}} {{controlNo}}  context values (lgu, sig, docType, controlNo, today, preparedBy)
//   {{sum:items.amount|peso}}   sum of a table column
//   {{table:items}}             auto-rendered HTML table for a table field
//   {{#each items}}<tr><td>{{@no}}</td><td>{{description}}</td></tr>{{/each}}
//   {{check:itemId}}            checkbox mark for a checklist item
//   {{#if field}}...{{/if}}     shown only when the field has a value
//   {{#if field=Value}}...{{/if}} shown only when the field equals Value (e.g. tick a box)

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toNumber(value) {
  if (typeof value === 'number') return value;
  const n = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Negative amounts print in parentheses, as on the official forms: (100.00).
export function formatCurrency(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = toNumber(value);
  const text = Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${text})` : text;
}

export function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(`${value}`.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const FILTERS = {
  currency: (v) => formatCurrency(v),
  peso: (v) => (v === '' || v == null ? '' : `₱ ${formatCurrency(v)}`),
  number: (v) => (v === '' || v == null ? '' : toNumber(v).toLocaleString('en-PH')),
  date: (v) => formatDate(v),
  upper: (v) => String(v ?? '').toUpperCase(),
  words: (v) => (v === '' || v == null ? '' : amountToWords(toNumber(v))),
};

function lookup(scope, path) {
  return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), scope);
}

function applyFilters(value, filters) {
  return filters.reduce((v, name) => (FILTERS[name] ? FILTERS[name](v) : v), value);
}

export function sumColumn(rows, column) {
  return (Array.isArray(rows) ? rows : []).reduce((total, row) => total + toNumber(row?.[column]), 0);
}

function formatCell(value, type) {
  if (type === 'currency') return formatCurrency(value);
  if (type === 'date') return formatDate(value);
  return value ?? '';
}

export function renderTable(field, rows) {
  const columns = field?.columns || [];
  const list = Array.isArray(rows) ? rows : [];
  const minRows = Number(field?.minRows) || 0;
  const align = (c) => (c.type === 'currency' || c.type === 'number' ? ' class="r"' : c.type === 'date' ? ' class="c"' : '');
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = list
    .map((row) => `<tr>${columns
      .map((c) => `<td${align(c)}>${escapeHtml(formatCell(row?.[c.key], c.type))}</td>`)
      .join('')}</tr>`)
    .join('');
  const nothing = list.length ? `<tr class="nothing"><td colspan="${columns.length}">*** NOTHING FOLLOWS ***</td></tr>` : '';
  const filler = Array.from({ length: Math.max(0, minRows - list.length - (list.length ? 1 : 0)) })
    .map(() => `<tr class="blank">${columns.map(() => '<td></td>').join('')}</tr>`)
    .join('');
  const totals = columns.some((c) => c.total)
    ? `<tr class="total">${columns
      .map((c, i) => {
        if (c.total) return `<td class="r"><b>${list.length ? escapeHtml(formatCurrency(sumColumn(list, c.key))) : ''}</b></td>`;
        return i === 0 ? '<td class="r"><b>TOTAL</b></td>' : '<td></td>';
      })
      .join('')}</tr>`
    : '';
  return `<table class="pt"><thead><tr>${head}</tr></thead><tbody>${body}${nothing}${filler}${totals}</tbody></table>`;
}

function renderTokens(template, scope, ctx) {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, expr) => {
    const [head, ...filters] = expr.split('|').map((s) => s.trim());

    if (head.startsWith('table:')) {
      const key = head.slice(6);
      const field = (ctx.fields || []).find((f) => f.key === key);
      return renderTable(field, lookup(scope, key));
    }
    if (head.startsWith('sum:')) {
      const [key, column] = head.slice(4).split('.');
      const rows = lookup(scope, key);
      // A blank form prints blank totals, not 0.00.
      const hasValues = Array.isArray(rows) && rows.some((r) => r?.[column] !== '' && r?.[column] != null);
      if (!hasValues) return '';
      return escapeHtml(applyFilters(sumColumn(rows, column), filters.length ? filters : ['currency']));
    }
    if (head.startsWith('check:')) {
      return ctx.checklist?.[head.slice(6)] ? '&#9745;' : '&#9744;';
    }
    const value = lookup(scope, head);
    if (value !== null && typeof value === 'object' && !filters.length) return '';
    return escapeHtml(applyFilters(value ?? '', filters));
  });
}

export function renderTemplate(template, ctx = {}) {
  const base = {
    ...(ctx.data || {}),
    controlNo: ctx.controlNo || '',
    today: ctx.today || new Date().toISOString().slice(0, 10),
    lgu: ctx.lgu || {},
    docType: ctx.docType || {},
    preparedBy: ctx.preparedBy || '',
    sig: ctx.signatories || {},
  };

  const withIfs = String(template || '').replace(
    /\{\{#if\s+([\w.]+)\s*(?:=\s*([^}]*?))?\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, expected, inner) => {
      const value = lookup(base, key);
      const shown = expected === undefined
        ? value !== undefined && value !== null && String(value).trim() !== '' && !(Array.isArray(value) && !value.length)
        : String(value ?? '').trim() === expected.trim();
      return shown ? inner : '';
    },
  );

  const withLoops = withIfs.replace(
    /\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, key, inner) => {
      const rows = lookup(base, key);
      const field = (ctx.fields || []).find((f) => f.key === key);
      const list = Array.isArray(rows) ? [...rows] : [];
      const minRows = Number(field?.minRows) || 0;
      while (list.length < minRows) list.push({ __blank: true });
      // Column keys default to blank so they never fall through to same-named top-level fields.
      const blanks = Object.fromEntries((field?.columns || []).map((c) => [c.key, '']));
      return list
        .map((row, i) => renderTokens(
          inner,
          { ...base, ...blanks, ...row, '@no': row.__blank ? '' : i + 1, '@index': i },
          ctx,
        ))
        .join('');
    },
  );

  return renderTokens(withLoops, base, ctx);
}

// Generate a sensible starting template from a document type's fields so an
// admin always has something printable before customizing the layout.
export function generateDefaultTemplate(type) {
  const fields = type?.fields || [];
  const rows = fields
    .filter((f) => f.type !== 'table')
    .map((f) => {
      const filter = f.type === 'currency' ? '|peso' : f.type === 'date' ? '|date' : '';
      return `<tr><td class="lbl">${escapeHtml(f.label)}</td><td>{{${f.key}${filter}}}</td></tr>`;
    })
    .join('\n    ');
  const tables = fields
    .filter((f) => f.type === 'table')
    .map((f) => `{{table:${f.key}}}`)
    .join('\n  ');
  return `<div class="ph"><img src="{{lgu.seal}}" alt="">
    <div class="l2">Republic of the Philippines</div>
    <div class="l1">{{lgu.name|upper}}</div>
    <div class="l2">{{lgu.address}}</div>
    <div class="l3">${escapeHtml((type?.name || 'DOCUMENT').toUpperCase())}</div></div>
  <table class="pmeta-t"><tr><td></td><td class="r">FTS Control No.: <b>{{controlNo}}</b></td></tr></table>
  <table class="pt">
    ${rows}
  </table>
  ${tables}
  <div class="sig2">
    <div class="col"><div class="who">Prepared by:</div><div class="name">{{preparedBy|upper}}</div><div class="cap">Signature over Printed Name</div></div>
    <div class="col"><div class="who">Approved by:</div><div class="name">&nbsp;</div><div class="cap">Signature over Printed Name</div></div>
  </div>`;
}
