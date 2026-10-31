// The public record of a document (checks/{docId}): what the QR code on its PDF opens, for anyone,
// signed in or not. Only what confirms the paper in hand: no amounts, data fields or remarks.
import { liveFiles, officeOf } from './workflow.js';

export const CHECK_KEYS = ['controlNo', 'typeCode', 'typeName', 'title', 'office', 'status', 'state', 'now', 'steps', 'signatures', 'versions', 'refNos', 'pdf', 'updatedAt'];

// Does the QR page show the document's PDF to anyone? Set per document type (Document Types →
// General); off for Payroll unless an administrator turns it on (employees' pay is not for the public).
export function pdfIsPublic(d) {
  const p = d?.typeSnapshot?.publicPdf;
  return p === undefined ? d?.typeCode !== 'PAYROLL' : p !== false;
}

export function checkRecord(d, at = new Date().toISOString()) {
  const wf = d.workflow;
  const files = d.pdf?.files || [];
  const moving = wf?.state === 'in-progress';
  return {
    controlNo: d.controlNo || '',
    typeCode: d.typeCode || '',
    typeName: d.typeName || '',
    title: d.title || '',
    office: d.office || '',
    status: d.status || '',
    state: wf?.state || 'not routed',
    // where it is now: an office, or "with a person" while referred
    now: moving ? (wf.referral ? `Referred to ${wf.referral.name}` : officeOf(wf.steps[wf.stage], d) || d.office || '') : '',
    steps: (wf?.steps || []).map((s, i) => ({
      office: officeOf(s, d) || d.office || 'Requesting office',
      action: s.action || '',
      sign: Boolean(s.sign),
      done: wf.state === 'done' || i < wf.stage,
      current: moving && i === wf.stage,
    })),
    // signatures taken back (to change a reference no. already on the PDF) are left out
    signatures: liveFiles(files).filter((f) => f.kind === 'signed' || f.kind === 'esigned').map((f) => ({
      name: f.signer?.name || f.by || '', at: f.signer?.signedAt || f.at || '', reason: f.reason || '', pnpki: Boolean(f.signer?.pnpki), esign: f.kind === 'esigned',
    })),
    // every PDF DMS issued for it, by fingerprint: a copy can be checked against them
    versions: files.map((f, i) => ({ n: i + 1, sha256: f.sha256 || '', kind: f.kind, at: f.at || '' })),
    // reference numbers assigned along the route (e.g. the DV No.), to match the paper
    refNos: Object.values(d.refNos || {}).filter((r) => !r.of).map((r) => `${r.label} ${r.value}`),
    // the current PDF, which the QR page shows (storage.rules lets anyone open this one file);
    // none for a cancelled document, nor for a type whose PDF is for signed-in users only (Payroll)
    pdf: d.status === 'cancelled' || wf?.state === 'cancelled' || !pdfIsPublic(d) ? '' : files.at(-1)?.path || '',
    updatedAt: at,
  };
}
