import { toNumber } from './template.js';

// Pure helpers shared by the guided wizard and validation (no Firebase here).

export function computeRow(columns, row) {
  const next = { ...row };
  for (const col of columns || []) {
    if (!col.compute) continue;
    const keys = col.compute.split('*').map((k) => k.trim()).filter(Boolean);
    const hasAny = keys.some((k) => next[k] !== undefined && next[k] !== '');
    next[col.key] = hasAny ? Math.round(keys.reduce((p, k) => p * toNumber(next[k]), 1) * 100) / 100 : '';
  }
  return next;
}

export function initialData(type) {
  const data = {};
  for (const f of type?.fields || []) {
    if (f.type === 'table') data[f.key] = [];
    else if (f.type === 'date' && f.key === 'date') data[f.key] = new Date().toISOString().slice(0, 10);
    else data[f.key] = f.default ?? '';
  }
  return data;
}

// Steps for the guided process. Fields without a valid step go to a catch-all step.
export function buildSteps(type) {
  const steps = (type?.steps || []).map((s) => ({ ...s, fields: [] }));
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  const loose = [];
  for (const f of type?.fields || []) (byId[f.step] ? byId[f.step].fields : loose).push(f);
  if (loose.length) {
    steps.push({ id: '__other', title: steps.length ? 'Other Details' : 'Details', instructions: '', fields: loose });
  }
  return steps.filter((s) => s.fields.length);
}

function isEmpty(field, value) {
  if (field.type === 'table') {
    return !Array.isArray(value) || !value.some((row) => Object.values(row || {}).some((v) => v !== '' && v != null));
  }
  return value === undefined || value === null || String(value).trim() === '';
}

export function missingFields(fields, data) {
  return (fields || []).filter((f) => f.required && isEmpty(f, data?.[f.key]));
}

export function missingChecklist(checklist, state) {
  return (checklist || []).filter((c) => c.required && !state?.[c.id]);
}

export function slugKey(label) {
  const words = String(label || '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const key = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');
  return /^[0-9]/.test(key) ? `f${key}` : key;
}
