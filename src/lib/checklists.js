// Helpers for the checklist library (pure functions, no Firebase).
//
// A checklist item is { id, label, required, group? }.
//   required: true  -> the paper checklist has only a "Y" box: must always be attached.
//   required: false -> "Y" and "N/A" boxes: attach if applicable.
// A document stores the answer per item id: 'Y' (attached) or 'NA' (not applicable).

export const CHECKLIST_CATEGORIES = [
  'Payroll through ATM (Group)',
  'Individual Payment of Salaries and Benefits',
  'Cash Advance',
  'Fund Transfer',
  'Reimbursement',
  'Payment of Other Expenses',
  'Payment to Supplier (Procurement)',
  'Remittance of Withheld Amounts',
  'Refund',
  'Other Disbursements',
  'Liquidation',
];

export const CHECKLIST_SOURCES = [
  { value: 'own', label: 'Own checklist (set in the Checklist tab)' },
  { value: 'disbursement', label: 'Disbursement checklist library (ask the transaction type)' },
  { value: 'liquidation', label: 'Liquidation checklist library (ask the transaction type)' },
];

export const isChecked = (v) => v === true || v === 'Y';

export function groupItems(items) {
  const groups = [];
  for (const item of items || []) {
    const name = item.group || '';
    const last = groups[groups.length - 1];
    if (last && last.group === name) last.items.push(item);
    else groups.push({ group: name, items: [item] });
  }
  return groups;
}

export function missingRequired(items, state) {
  return (items || []).filter((i) => i.required && !isChecked(state?.[i.id]));
}

export function checklistProgress(items, state) {
  const list = items || [];
  const answered = list.filter((i) => isChecked(state?.[i.id]) || state?.[i.id] === 'NA').length;
  return { answered, total: list.length };
}

export function searchChecklists(list, query, kind) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (list || []).filter((c) => (!kind || c.kind === kind)
    && words.every((w) => `${c.code} ${c.title} ${c.category}`.toLowerCase().includes(w)));
}

// Values for the header boxes of a printed checklist ("DV Number", "Payee", ...),
// taken from the encoded document where the document has them.
const HEADER_KEYS = [
  [/^dv\b|disbursement/i, ['dvNo']],
  [/obr|furs|cafoa|obligation/i, ['cafoaNo', 'fursNo', 'obrNo', 'obligationNo']],
  [/payee|claimant/i, ['payee', 'claimant', 'name']],
  [/^lr\b|liquidation/i, ['lrNo', 'serialNo']],
];

export function headerValue(label, data = {}) {
  for (const [re, keys] of HEADER_KEYS) {
    if (re.test(label)) {
      const key = keys.find((k) => data[k] !== undefined && String(data[k]).trim() !== '');
      return key ? String(data[key]) : '';
    }
  }
  return '';
}

export function newChecklist(kind = 'disbursement') {
  return {
    code: '', kind, category: kind === 'liquidation' ? 'Liquidation' : CHECKLIST_CATEGORIES[0],
    title: '', description: '', headerFields: kind === 'liquidation'
      ? ['Liquidation Report No.', 'DV Number', 'OBR/FURS Number', 'Payee']
      : ['DV Number', 'OBR/FURS Number', 'Payee'],
    items: [], basis: [], notes: [],
  };
}

// The checklist a document is checked against: the transaction type picked from
// the library (stored on the document), or the document type's own checklist.
export function effectiveChecklist(type, transaction) {
  if (type?.checklistSource && type.checklistSource !== 'own') return transaction || null;
  return {
    code: type?.code || '',
    title: `${type?.name || 'Document'} — Checklist of Requirements`,
    description: '',
    headerFields: [],
    items: (type?.checklist || []).map((c) => ({ id: c.id, label: c.help ? `${c.label}\n${c.help}` : c.label, required: Boolean(c.required) })),
    basis: [],
    notes: [],
  };
}

// What is stored on a document when a transaction type is chosen (frozen copy).
export function transactionSnapshot(c) {
  const { id, updatedAt, updatedBy, createdAt, ...rest } = c;
  return rest;
}
