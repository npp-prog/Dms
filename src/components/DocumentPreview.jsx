import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { renderTemplate } from '../lib/template.js';

// Renders a document type's template with data. Output is sanitized because
// templates are authored in-app by admins.
export default function DocumentPreview({ type, data = {}, checklist = {}, controlNo = '', preparedBy = '', settings = {} }) {
  const html = useMemo(() => DOMPurify.sanitize(renderTemplate(type?.template, {
    data,
    checklist,
    controlNo,
    preparedBy,
    fields: type?.fields,
    docType: { code: type?.code, name: type?.name },
    lgu: { name: settings.lguName || '', address: settings.lguAddress || '', province: settings.province || '' },
  })), [type, data, checklist, controlNo, preparedBy, settings]);

  const size = `${type?.paperSize || 'A4'} ${type?.orientation || 'portrait'}`;
  return (
    <div className="print-area">
      <style>{`@media print { @page { size: ${size}; margin: 12mm; } }`}</style>
      <div className={`paper paper-${(type?.paperSize || 'A4').toLowerCase()} ${type?.orientation === 'landscape' ? 'landscape' : ''}`}>
        <div className="doc-render" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
