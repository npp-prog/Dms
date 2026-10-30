// What the Archive keeps of a document, shared by the backup ZIP (lib/archive.js) and the
// automatic Google Drive backup (netlify/lib/driveBackup.mjs). No Firebase here.

export const isArchived = (d) => d?.workflow?.state === 'done';
export const processedAt = (d) => [...(d?.workflow?.events || [])].reverse().find((e) => e.type === 'completed')?.at || '';

export const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

// Every file of a document: its PDF versions, the files attached to its checklist and other
// attachments, and the files its route steps uploaded. name may hold a subfolder (attachments/...).
export function filesOf(d) {
  const out = [];
  (d.pdf?.files || []).forEach((f, i) => out.push({ path: f.path, name: `PDF ${String(i + 1).padStart(2, '0')} ${f.kind}.pdf`, pdf: true }));
  for (const list of Object.values(d.links || {})) {
    for (const l of list || []) if (l?.kind === 'file' && l.path) out.push({ path: l.path, name: `attachments/${safe(l.name) || 'file'}` });
  }
  for (const f of d.stepFiles || []) if (f?.path) out.push({ path: f.path, name: `step files/${safe(f.label)} ${safe(f.name)}` });
  return out;
}

// The folder of a document in a backup: year processed / type / control no. and payee.
export const docFolder = (d) => [(processedAt(d) || '').slice(0, 4) || 'undated', safe(d.typeCode) || 'DOC', safe(`${d.controlNo} ${d.title}`)];
