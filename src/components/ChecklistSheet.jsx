import { Fragment } from 'react';
import { groupItems, hasDetails, headerValue, isChecked } from '../lib/checklists.js';
import PrintPage from './PrintPage.jsx';
import { linkText } from './DocLinks.jsx';

// The paper checklist, as issued by the Municipal Accounting Office (Word layout of
// Checklist No. 1001, revised 2026): header boxes (DV Number, OBR/FURS Number, Payee),
// then Y | N/A | Required Documents (Document Type | Document Details), numbered.
// Items that are always required have only a Y box (N/A is shaded); "if applicable"
// items have Y and N/A. Checklists not yet split into type and details print their
// text across both columns. With `state`, the boxes are ticked from the encoded
// document; without it, it prints blank.
// Notes may mark words in bold with **double asterisks**, as on the Word checklists.
const rich = (text) => String(text).split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));

export default function ChecklistSheet({ checklist, state, data, additional = [], links = {}, settings = {}, paper = true }) {
  if (!checklist) return null;
  const box = (on) => <span className="cl-box">{on ? '✓' : ''}</span>;
  const split = hasDetails(checklist.items);
  let no = 0;
  const sheet = (
    <div className="checklist-sheet">
      <div className="cl-no">Checklist No. {checklist.code}</div>
      <img className="cl-seal" src={settings.sealUrl || '/municipal-seal.png'} alt="" />
      <div className="cl-l2">Republic of the Philippines</div>
      <div className="cl-l1">{(settings.lguName || 'Municipal Government of Candoni').toUpperCase()}</div>
      <div className="cl-title">{checklist.title}</div>
      {checklist.description && <p className="cl-desc">{checklist.description}</p>}

      {(checklist.headerFields || []).length > 0 && (
        <table className="cl-head">
          <colgroup><col style={{ width: '26.06%' }} /><col /></colgroup>
          <tbody>
            {checklist.headerFields.map((h) => (
              <tr key={h}><td className="lbl">{h}</td><td>{data ? headerValue(h, data).toUpperCase() : ''}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="cl-items">
        <colgroup>
          <col style={{ width: '4.936%' }} /><col style={{ width: '5.989%' }} />
          <col style={{ width: '37.932%' }} /><col />
        </colgroup>
        <thead>
          <tr className="cl-h1">
            <th rowSpan={split ? 2 : 1} className="cl-y">Y</th>
            <th rowSpan={split ? 2 : 1} className="cl-na">N/A</th>
            <th colSpan={2} className="cl-rd">Required Documents</th>
          </tr>
          {split && <tr className="cl-h2"><th>Document Type</th><th>Document Details</th></tr>}
        </thead>
        <tbody>
          {groupItems(checklist.items).map((g, gi) => (
            <Fragment key={gi}>
              {g.group && <tr className="cl-group"><td /><td /><td colSpan={2}>{g.group}</td></tr>}
              {g.items.map((item) => {
                const v = state?.[item.id];
                no += 1;
                const label = <div className="cl-num"><span>{no}.</span><span>{item.label}</span></div>;
                const linked = (links[item.id] || []).map(linkText).filter(Boolean);
                const linkLine = linked.length > 0 && <div className="cl-linked">Linked: {linked.join('; ')}</div>;
                return (
                  <tr key={item.id} className="cl-item">
                    <td className="cl-c">{box(isChecked(v))}</td>
                    {item.required ? <td className="cl-c cl-shade" /> : <td className="cl-c">{box(v === 'NA')}</td>}
                    {split ? (
                      <>
                        <td className="cl-type">{label}</td>
                        <td className="cl-details">{item.details || ''}{linkLine}</td>
                      </>
                    ) : <td colSpan={2} className="cl-type cl-whole">{label}{linkLine}</td>}
                  </tr>
                );
              })}
            </Fragment>
          ))}
          {(checklist.notes || []).map((n, i) => (
            <tr key={`n${i}`} className="cl-foot"><td colSpan={4}>{rich(n)}</td></tr>
          ))}
          {(checklist.basis || []).map((b, i) => (
            <tr key={`b${i}`} className="cl-foot"><td colSpan={4}>Basis: {rich(b)}</td></tr>
          ))}
        </tbody>
      </table>

      <table className="cl-additional">
        <tbody>
          <tr><th>Additional Documents</th></tr>
          <tr>
            <td className="cl-addbody">
              {additional.filter((t) => String(t).trim()).map((t, i) => (
                <div key={i} className="cl-num cl-addline"><span>{i + 1}.</span><span>{String(t).toUpperCase()}</span></div>
              ))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  if (!paper) return sheet;
  // Long checklists (e.g. competitive bidding) keep a readable size and continue on a second page.
  return <PrintPage paperSize="A4" minScale={0.8}>{sheet}</PrintPage>;
}
