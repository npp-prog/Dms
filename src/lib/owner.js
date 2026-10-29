// The superadmin of DMS. Keep in sync with isOwnerEmail() in firestore.rules,
// which is what actually enforces it.
export const SUPERADMIN_EMAILS = ['npp@mgocandoniaccounting.org'];

export const isOwnerEmail = (email) => SUPERADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
