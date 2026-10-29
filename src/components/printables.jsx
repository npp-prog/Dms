import { acceptsDocument, effectiveChecklist } from '../lib/checklists.js';
import { fileBase, controlRef } from '../lib/naming.js';
import { makePdf, renderPages } from '../lib/pdf.js';
import DocumentPreview from './DocumentPreview.jsx';
import ChecklistSheet from './ChecklistSheet.jsx';

// The printable pages of a document, for PDFs ("Convert to PDF", "Download all").

export const documentElement = (type, d, settings) => (
  <DocumentPreview type={type} data={d.data || {}} checklist={d.checklist || {}} settings={settings}
    signatories={d.signatories} controlNo={d.controlNo} preparedBy={d.createdByName} />
);

export const checklistElement = (checklist, d, settings) => (
  <ChecklistSheet checklist={checklist} state={d.checklist} data={d.data || {}}
    additional={d.additionalDocs || []} links={d.links || {}} settings={settings} />
);

// The document's number on its own checklist (e.g. 01 for the DV on a DV checklist).
export function ownItemNo(type, d) {
  const items = effectiveChecklist(type, d.transaction)?.items || [];
  return items.findIndex((i) => acceptsDocument(i, { typeCode: d.typeCode, typeName: d.typeName })) + 1;
}

// The PDF that is signed: the document, then its checklist (DV and LR).
export async function documentPdf(type, d, settings) {
  const parts = [await renderPages(documentElement(type, d, settings), type.paperSize, type.orientation)];
  const checklist = effectiveChecklist(type, d.transaction);
  if (checklist?.items?.length) parts.push(await renderPages(checklistElement(checklist, d, settings), 'A4', 'portrait'));
  return makePdf(parts, { title: `${d.typeName} ${d.controlNo}`, author: d.createdByName });
}

// File name of the document's PDF: Fund_Payee_Checklist No._Type_Control No.
export const pdfFileName = (type, d) => `${fileBase({ fund: d.data?.fund, subject: d.data?.payee || d.title, number: ownItemNo(type, d), type: d.typeCode, ref: controlRef(d.controlNo) })}.pdf`;
