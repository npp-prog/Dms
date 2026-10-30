import { resolveOffice } from './workflow.js';

// The letterhead of the office a document is from (Settings > Office letterheads): the title
// printed under the LGU (e.g. the Office of the Mayor's), its email address and contact number.
// A format may name its issuing office (documentType.headerOffice, e.g. the Travel Order is the
// Mayor's); otherwise it is the office of the document. Templates: {{office.letterhead}},
// {{office.email}}, {{office.contact}}, {{office.name}}.
export function officeLetterhead(settings = {}, type = {}, office = '') {
  const name = type?.headerOffice ? resolveOffice(type.headerOffice, settings.offices || []) : office || '';
  const c = settings.officeContacts?.[name] || {};
  return { name, letterhead: c.letterhead || name, email: c.email || '', contact: c.contact || '' };
}
