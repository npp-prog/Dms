import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { renderTemplate } from '../lib/template.js';
import { toCaps } from '../lib/forms.js';
import { signatoriesFrom } from '../lib/signatories.js';
import PrintPage from './PrintPage.jsx';

// Renders a document type's template with data. Output is sanitized because
// templates are authored in-app by admins.
export default function DocumentPreview({ type, data = {}, checklist = {}, controlNo = '', preparedBy = '', settings = {}, signatories }) {
  const html = useMemo(() => DOMPurify.sanitize(renderTemplate(type?.template, {
    data: toCaps(data),
    caps: true,
    checklist,
    controlNo,
    preparedBy,
    fields: type?.fields,
    signatories: signatories || signatoriesFrom(settings),
    docType: { code: type?.code, name: type?.name },
    lgu: {
      name: settings.lguName || 'Municipal Government of Candoni',
      address: settings.lguAddress || '',
      province: settings.province || '',
      seal: settings.sealUrl || '/municipal-seal.png',
    },
  })), [type, data, checklist, controlNo, preparedBy, settings, signatories]);

  return (
    <PrintPage paperSize={type?.paperSize} orientation={type?.orientation}>
      <div className="doc-render" dangerouslySetInnerHTML={{ __html: html }} />
    </PrintPage>
  );
}
