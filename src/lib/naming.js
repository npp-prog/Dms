// File names for bulk downloads (e.g. a DV with all its linked documents):
//   Fund_Subject or Payee_Checklist No._Document Type_Control No.
//   GF_NEIL P. PRIOLO_02_OBR_DMS2026000003
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

// Control numbers: DMS-2026-000001 (DMS, year, series). The series runs per year; 2026 continues
// the counter of the earlier FTS-/DMS-###### numbers (counters/FTS).
export const counterFor = (year) => (year <= 2026 ? 'FTS' : `DMS-${year}`);
export const formatControlNo = (year, value) => `DMS-${year}-${String(value).padStart(6, '0')}`;

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

// Reference numbers an office assigns when it receives a document (Administration > Workflow),
// from a pattern: {YYYY} {YY} {MM} {DD} {FUND} and the series {####} (as many digits as #).
// E.g. {FUND}-{YYYY}-{MM}-{####} -> GF-2026-10-0045. The series restarts whenever the rest
// changes (a new month, another fund), so each distinct prefix has its own counter.
export const DEFAULT_REF_PATTERN = '{FUND}-{YYYY}-{MM}-{####}';

export function refNumber(pattern, { fund = '', date = new Date() } = {}) {
  const p2 = (n) => String(n).padStart(2, '0');
  const fill = (text) => text
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, p2(date.getMonth() + 1))
    .replace(/\{DD\}/g, p2(date.getDate()))
    .replace(/\{FUND\}/g, fundCode(fund));
  const pat = String(pattern || DEFAULT_REF_PATTERN);
  const seq = pat.match(/\{(#+)\}/);
  const width = seq ? seq[1].length : 4;
  const withSeq = seq ? pat : `${pat}-{####}`;
  const prefix = fill(withSeq.replace(/\{#+\}/, '#'));
  return {
    prefix, // e.g. GF-2026-10-#  (one counter per prefix)
    counterId: `REF_${prefix.replace(/[^A-Za-z0-9#]+/g, '_').replace('#', 'N')}`.slice(0, 120),
    format: (n) => prefix.replace('#', String(n).padStart(width, '0')),
  };
}

// The Document Reference No. (DRN): the number(s) assigned along the route, e.g. the DV No.
export const drnOf = (d) => Object.values(d?.refNos || {}).filter((r) => !r.of && r.value).map((r) => r.value).join(', ');
