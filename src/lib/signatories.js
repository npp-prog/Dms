// Officials printed on the forms (set in Settings). Templates use {{sig.<key>}}
// and {{sig.<key>Position}}, e.g. {{sig.mayor}} / {{sig.mayorPosition}}.
export const SIGNATORY_ROLES = [
  { key: 'mayor', label: 'Local Chief Executive', position: 'Municipal Mayor' },
  { key: 'viceMayor', label: 'Vice Mayor', position: 'Municipal Vice Mayor' },
  { key: 'accountant', label: 'Head of Accounting', position: 'Municipal Accountant' },
  { key: 'budget', label: 'Head of Budget', position: 'Municipal Budget Officer' },
  { key: 'treasurer', label: 'Head of Treasury', position: 'Municipal Treasurer' },
  { key: 'sbSecretary', label: 'Secretary to the Sanggunian', position: 'Secretary to the Sanggunian' },
];

export function signatoriesFrom(settings = {}) {
  const sig = {};
  for (const r of SIGNATORY_ROLES) {
    sig[r.key] = settings.signatories?.[r.key] || '';
    sig[`${r.key}Position`] = settings.signatories?.[`${r.key}Position`] || r.position;
  }
  return sig;
}
