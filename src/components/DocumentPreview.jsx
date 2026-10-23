import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { renderTemplate } from '../lib/template.js';
import { signatoriesFrom } from '../lib/signatories.js';

// Renders a document type's template with data. Output is sanitized because
// templates are authored in-app by admins.
export default function DocumentPreview({ type, data = {}, checklist = {}, controlNo = '', preparedBy = '', settings = {}, signatories }) {
  const html = useMemo(() => DOMPurify.sanitize(renderTemplate(type?.template, {
    data,
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

  // CSS has no "Long" keyword: Philippine long bond paper is 8.5 x 13 in.
  const paper = type?.paperSize === 'Long' ? '8.5in 13in' : (type?.paperSize || 'A4');
  const size = type?.paperSize === 'Long' && type?.orientation === 'landscape' ? '13in 8.5in' : `${paper} ${type?.orientation || 'portrait'}`;
  return (
    <div className="print-area">
      <style>{`@media print { @page { size: ${size}; margin: 12mm; } }`}</style>
      <div className={`paper paper-${(type?.paperSize || 'A4').toLowerCase()} ${type?.orientation === 'landscape' ? 'landscape' : ''}`}>
        <div className="doc-render" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
