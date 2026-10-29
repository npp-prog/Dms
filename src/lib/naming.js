// File names for bulk downloads (e.g. a DV with all its linked documents):
//   Fund_Subject or Payee_Checklist No._Document Type_Control No.
//   GF_NEIL P. PRIOLO_02_OBR_DMS000003
// The checklist number is the item's number on the checklist (00 for the checklist itself).

const FUND_CODES = {
  'GENERAL FUND': 'GF',
  'SPECIAL EDUCATION FUND': 'SEF',
  'TRUST FUND': 'TF',
  '20% DEVELOPMENT FUND': '20DF',
  LDRRMF: 'LDRRMF',
};

// "General Fund" -> "GF"; other funds by their initials (digits kept).
export function fundCode(fund) {
  const f = String(fund || '').trim().toUpperCase();
  if (!f) return 'NOFUND';
  if (FUND_CODES[f]) return FUND_CODES[f];
  if (!/\s/.test(f)) return cleanPart(f);
  return f.split(/\s+/).map((w) => (/^\d/.test(w) ? w.replace(/\D/g, '') : w[0])).join('').replace(/[^A-Z0-9]/g, '');
}

// One part of a file name: capitals, no characters Windows forbids, no underscores
// (they separate the parts), single spaces, at most `max` characters.
export function cleanPart(text, max = 40) {
  return String(text || '')
    .toUpperCase()
    .replace(/[\\/:*?"<>|_\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
    .replace(/[. ]+$/, '');
}

export const controlRef = (controlNo) => cleanPart(String(controlNo || '').replace(/-/g, ''), 24);

export function fileBase({ fund, subject, number, type, ref }) {
  return [
    fundCode(fund),
    cleanPart(subject) || 'NO PAYEE',
    String(number ?? 0).padStart(2, '0'),
    cleanPart(type, 24) || 'DOC',
    cleanPart(ref, 40) || 'NOREF',
  ].join('_');
}

// Names stay unique inside one ZIP: a second "X.pdf" becomes "X (2).pdf".
export function uniqueNamer() {
  const used = new Map();
  return (name, ext) => {
    const key = `${name}.${ext}`.toLowerCase();
    const n = (used.get(key) || 0) + 1;
    used.set(key, n);
    return n === 1 ? `${name}.${ext}` : `${name} (${n}).${ext}`;
  };
}
