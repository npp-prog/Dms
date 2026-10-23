import { Fragment } from 'react';
import { groupItems, headerValue, isChecked } from '../lib/checklists.js';
import PrintPage from './PrintPage.jsx';

// The paper checklist, as issued by the Municipal Accounting Office:
// header boxes (DV Number, OBR/FURS Number, Payee), then Y | N/A | Required Documents.
// Items that are always required have only a Y box; "if applicable" items have Y and N/A.
// With `state`, the boxes are ticked from the encoded document; without it, it prints blank.
export default function ChecklistSheet({ checklist, state, data, settings = {}, paper = true }) {
  if (!checklist) return null;
  const box = (on) => <span className="pf-box">{on ? '✓' : ' '}</span>;
  const sheet = (
    <div className="doc-render checklist-sheet">
      <div className="cl-no">Checklist No. <b>{checklist.code}</b></div>
      <div className="ph">
        <img src={settings.sealUrl || '/municipal-seal.png'} alt="" />
        <div className="l2">Republic of the Philippines</div>
        <div className="l1">{(settings.lguName || 'Municipal Government of Candoni').toUpperCase()}</div>
        <div className="l3">{checklist.title}</div>
      </div>
      {checklist.description && <p className="cl-desc">{checklist.description}</p>}

      {(checklist.headerFields || []).length > 0 && (
        <table className="pt cl-head">
          <tbody>
            {checklist.headerFields.map((h) => (
              <tr key={h}><td className="lbl">{h}</td><td>{data ? headerValue(h, data) : ''}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="pt cl-items">
        <thead>
          <tr><th style={{ width: 28 }}>Y</th><th style={{ width: 34 }}>N/A</th><th>Required Documents</th></tr>
        </thead>
        <tbody>
          {groupItems(checklist.items).map((g, gi) => (
            <Fragment key={gi}>
              {g.group && <tr className="cl-group"><td colSpan={3}>{g.group}</td></tr>}
              {g.items.map((item) => {
                const v = state?.[item.id];
                return (
                  <tr key={item.id}>
                    <td className="c">{box(isChecked(v))}</td>
                    <td className="c">{item.required ? '' : box(v === 'NA')}</td>
                    <td className="cl-label">{item.label}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
          {(checklist.basis || []).map((b, i) => (
            <tr key={`b${i}`}><td colSpan={3}><b>Basis:</b> {b}</td></tr>
          ))}
        </tbody>
      </table>

      {(checklist.notes || []).map((n, i) => <p key={i} className="cl-note">{n}</p>)}

      <table className="pt cl-additional">
        <tbody>
          <tr><th>Additional Documents</th></tr>
          <tr><td style={{ height: 60 }} /></tr>
        </tbody>
      </table>
    </div>
  );
  if (!paper) return sheet;
  // Long checklists (e.g. competitive bidding) keep a readable size and continue on a second page.
  return <PrintPage paperSize="A4" minScale={0.8}>{sheet}</PrintPage>;
}
