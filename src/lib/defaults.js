// Starter document types. Superadmins/admins can load these from
// Admin > Document Types > "Load starter formats" and then edit freely.

// Header and blocks follow the PMS-IMS official form layout (seal, LGU, form title).
const header = (title) => `<div class="ph"><img src="{{lgu.seal}}" alt="">
    <div class="l2">Republic of the Philippines</div>
    <div class="l1">{{lgu.name|upper}}</div>
    <div class="l2">{{lgu.address}}</div>
    <div class="l3">${title}</div></div>`;

const sig = (who, name, pos, cap = 'Signature over Printed Name') => `<div class="col"><div class="who">${who}</div>
      <div class="name">{{${name}|upper}}</div><div class="cap">${cap}</div>
      <div class="pos">{{${pos}}}</div><div class="cap">Position/Office</div></div>`;

const DV = {
  code: 'DV',
  name: 'Disbursement Voucher',
  category: 'Disbursement',
  description: 'Used to pay obligations of the LGU (suppliers, payroll, reimbursements, cash advances).',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  steps: [
    { id: 's1', title: 'Payee & Reference', instructions: 'Identify the payee and link the approved Obligation Request (ObR/ORS). The ObR must be approved before a DV is prepared.' },
    { id: 's2', title: 'Particulars', instructions: 'Describe the payment and list amounts. Total must equal the amount obligated in the ObR (less any deductions).' },
    { id: 's3', title: 'Accounting Entries', instructions: 'Accounting unit fills in the journal entry (UACS object codes). Debits must equal credits.' },
    { id: 's4', title: 'Signatories', instructions: 'Enter the names and designations of the certifying and approving officers.' },
  ],
  fields: [
    { key: 'fundCluster', label: 'Fund', type: 'select', options: ['General Fund', 'Special Education Fund', 'Trust Fund', '20% Development Fund', 'LDRRMF'], required: true, step: 's1' },
    { key: 'dvNo', label: 'DV No. (assigned by Accounting)', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    { key: 'modeOfPayment', label: 'Mode of Payment', type: 'select', options: ['MDS Check', 'Commercial Check', 'ADA', 'Others'], required: true, step: 's1' },
    { key: 'payee', label: 'Payee', type: 'text', required: true, step: 's1' },
    { key: 'tin', label: 'TIN / Employee No.', type: 'text', step: 's1' },
    { key: 'obrNo', label: 'ObR / ORS No.', type: 'text', required: true, step: 's1' },
    { key: 'address', label: 'Address', type: 'text', step: 's1' },
    { key: 'office', label: 'Office / Responsibility Center', type: 'text', required: true, step: 's1' },
    {
      key: 'particulars', label: 'Particulars', type: 'table', required: true, step: 's2', minRows: 5,
      columns: [
        { key: 'description', label: 'Explanation', type: 'text' },
        { key: 'respCenter', label: 'Responsibility Center', type: 'text' },
        { key: 'mfoPap', label: 'MFO/PAP', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    {
      key: 'entries', label: 'Accounting Entry', type: 'table', step: 's3', minRows: 4,
      columns: [
        { key: 'account', label: 'Account Title', type: 'text' },
        { key: 'uacs', label: 'UACS Code', type: 'text' },
        { key: 'debit', label: 'Debit', type: 'currency', total: true },
        { key: 'credit', label: 'Credit', type: 'currency', total: true },
      ],
    },
    { key: 'certA', label: 'A. Certified by (Head of Requesting Office)', type: 'text', required: true, step: 's4' },
    { key: 'certAPos', label: 'A. Designation', type: 'text', step: 's4' },
    { key: 'certC', label: 'C. Certified by (Accountant)', type: 'text', step: 's4' },
    { key: 'certCPos', label: 'C. Designation', type: 'text', default: 'Municipal Accountant', step: 's4' },
    { key: 'approver', label: 'D. Approved for Payment (Local Chief Executive)', type: 'text', step: 's4' },
    { key: 'approverPos', label: 'D. Designation', type: 'text', default: 'Municipal Mayor', step: 's4' },
  ],
  checklist: [
    { id: 'obr', label: 'Approved Obligation Request (ObR/ORS)', required: true },
    { id: 'invoice', label: 'Invoice / Statement of Account / Billing', required: true },
    { id: 'po', label: 'Purchase Order / Contract / Job Order', required: false, help: 'For procurement of goods, services and infrastructure.' },
    { id: 'iar', label: 'Inspection and Acceptance Report (IAR)', required: false, help: 'For deliveries of goods.' },
    { id: 'dr', label: 'Delivery Receipt', required: false },
    { id: 'abstract', label: 'Abstract of Bids / Canvass and BAC Resolution', required: false },
    { id: 'tax', label: 'BIR forms / computation of taxes withheld', required: false },
    { id: 'id', label: 'Payee valid ID / authority to receive payment', required: false },
  ],
  processing: [
    { id: "p1", office: "Requesting Office", action: "Sign Box A and attach the requirements", details: "The head of the requesting office signs Box A. Attach the approved ObR and every supporting document in the checklist, in the order listed." },
    { id: "p2", office: "Municipal Accounting Office", action: "Pre-audit, DV No. and accounting entry", details: "Accounting checks that the supporting documents are complete and the amount is proper, assigns the DV No., fills in the accounting entry (Box B) and signs Box C." },
    { id: "p3", office: "Municipal Treasurer's Office", action: "Cash availability and check/ADA preparation", details: "The Treasurer certifies that cash is available and prepares the check or ADA." },
    { id: "p4", office: "Office of the Municipal Mayor", action: "Approval for payment", details: "The Local Chief Executive (or authorized representative) signs Box D, Approved for Payment." },
    { id: "p5", office: "Municipal Treasurer's Office", action: "Release of payment", details: "The payee signs Box E (Receipt of Payment) and issues an Official Receipt where required. The check/ADA number and date are written on the DV." },
    { id: "p6", office: "Municipal Accounting Office", action: "Recording and filing", details: "Accounting records the JEV and keeps the paid DV with its attachments for submission to COA." },
  ],
  template: `${header('DISBURSEMENT VOUCHER')}
  <table class="pmeta-t"><tr><td>Fund: <b>{{fundCluster}}</b></td><td class="r">DV No.: <b>{{dvNo}}</b> &nbsp; Date: <b>{{date|date}}</b></td></tr>
    <tr><td></td><td class="r">FTS Control No.: <b>{{controlNo}}</b></td></tr></table>
  <table class="pt">
    <tr><td class="lbl">Mode of Payment</td><td colspan="3">
      <span class="pf-box">{{#if modeOfPayment=MDS Check}}&#10003;{{/if}}</span> MDS Check &nbsp;
      <span class="pf-box">{{#if modeOfPayment=Commercial Check}}&#10003;{{/if}}</span> Commercial Check &nbsp;
      <span class="pf-box">{{#if modeOfPayment=ADA}}&#10003;{{/if}}</span> ADA &nbsp;
      <span class="pf-box">{{#if modeOfPayment=Others}}&#10003;{{/if}}</span> Others</td></tr>
    <tr><td class="lbl">Payee</td><td><b>{{payee}}</b></td><td class="lbl">TIN/Employee No.</td><td>{{tin}}</td></tr>
    <tr><td class="lbl">Address</td><td>{{address}}</td><td class="lbl">ObR/ORS No.</td><td>{{obrNo}}</td></tr>
    <tr><td class="lbl">Office</td><td colspan="3">{{office}}</td></tr>
  </table>
  {{table:particulars}}
  <table class="pt">
    <tr><td colspan="2"><b>Amount Due:</b> {{sum:particulars.amount|peso}} &mdash; <i>{{sum:particulars.amount|words}}</i></td></tr>
    <tr>
      <td class="pf-cell" style="width:50%"><b>A.</b> Certified: Expenses/Cash Advance necessary, lawful and incurred under my direct supervision.
        <div class="pf-signame">{{certA|upper}}</div><div class="cap">{{certAPos}}</div></td>
      <td class="pf-cell"><b>B.</b> Accounting Entry {{table:entries}}</td>
    </tr>
    <tr>
      <td class="pf-cell"><b>C.</b> Certified:
        <div><span class="pf-box"></span> Cash available</div>
        <div><span class="pf-box"></span> Subject to Authority to Debit Account (when applicable)</div>
        <div><span class="pf-box"></span> Supporting documents complete and amount claimed proper</div>
        <div class="pf-signame">{{certC|upper}}</div><div class="cap">{{certCPos}}</div></td>
      <td class="pf-cell"><b>D.</b> Approved for Payment
        <div class="pf-signame">{{approver|upper}}</div><div class="cap">{{approverPos}}</div></td>
    </tr>
    <tr><td colspan="2"><b>E.</b> Receipt of Payment<br>
      Check/ADA No.: ____________ &nbsp; Date: ____________ &nbsp; Bank Name &amp; Account No.: ______________________ &nbsp; JEV No.: ____________<br><br>
      Signature: ______________________ &nbsp; Printed Name: ______________________ &nbsp; Date: __________ &nbsp; OR/Other Document: ______________</td></tr>
  </table>
  <div class="pf-foot">Prepared in FTS by {{preparedBy}}</div>`,
};

const OBR = {
  code: 'OBR',
  name: 'Obligation Request',
  category: 'Budget',
  description: 'Request to the Budget Office to obligate (earmark) an appropriation before incurring an expense.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  steps: [
    { id: 's1', title: 'Payee & Office', instructions: 'Identify the payee (or "Various" for payroll) and the requesting office.' },
    { id: 's2', title: 'Particulars & Charging', instructions: 'List the particulars with the correct account code / FPP. The amount must not exceed the available allotment.' },
    { id: 's3', title: 'Signatories', instructions: 'Box A: head of requesting office. Box B: Budget Officer certifies availability of appropriation.' },
  ],
  fields: [
    { key: 'obrNo', label: 'ObR No. (assigned by Budget Office)', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    { key: 'fund', label: 'Fund', type: 'select', options: ['General Fund', 'Special Education Fund', 'Trust Fund', '20% Development Fund', 'LDRRMF'], required: true, step: 's1' },
    { key: 'payee', label: 'Payee', type: 'text', required: true, step: 's1' },
    { key: 'office', label: 'Office', type: 'text', required: true, step: 's1' },
    { key: 'address', label: 'Address', type: 'text', step: 's1' },
    {
      key: 'items', label: 'Particulars', type: 'table', required: true, step: 's2', minRows: 6,
      columns: [
        { key: 'respCenter', label: 'Responsibility Center', type: 'text' },
        { key: 'particulars', label: 'Particulars', type: 'text' },
        { key: 'fpp', label: 'F.P.P.', type: 'text' },
        { key: 'accountCode', label: 'Account Code', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    { key: 'requestedBy', label: 'A. Requested by (Head of Office)', type: 'text', required: true, step: 's3' },
    { key: 'requestedByPos', label: 'A. Designation', type: 'text', step: 's3' },
    { key: 'budgetOfficer', label: 'B. Budget Officer', type: 'text', step: 's3' },
    { key: 'budgetOfficerPos', label: 'B. Designation', type: 'text', default: 'Municipal Budget Officer', step: 's3' },
  ],
  checklist: [
    { id: 'ppmp', label: 'Item is included in the approved PPMP / AIP', required: true },
    { id: 'pr', label: 'Purchase Request / Request for payroll / Billing attached', required: true },
    { id: 'allotment', label: 'Verified that allotment balance is sufficient', required: false },
  ],
  processing: [
    { id: "p1", office: "Requesting Office", action: "Sign Box A and attach the basis", details: "The head of the requesting office signs Box A. Attach the Purchase Request, payroll, billing or other basis of the obligation." },
    { id: "p2", office: "Municipal Budget Office", action: "Verify the appropriation and sign Box B", details: "Budget checks the charging (account code / F.P.P.) against the available allotment, assigns the ObR No., records it in the Registry of Appropriations and Obligations (RAO) and signs Box B." },
    { id: "p3", office: "Requesting Office", action: "Attach the approved ObR to the next document", details: "The approved ObR goes with the PO, contract or DV that it supports. A DV cannot be processed without an approved ObR." },
  ],
  template: `${header('OBLIGATION REQUEST')}
  <table class="pmeta-t"><tr><td>Fund: <b>{{fund}}</b></td><td class="r">ObR No.: <b>{{obrNo}}</b> &nbsp; Date: <b>{{date|date}}</b></td></tr>
    <tr><td></td><td class="r">FTS Control No.: <b>{{controlNo}}</b></td></tr></table>
  <table class="pt">
    <tr><td class="lbl">Payee</td><td><b>{{payee}}</b></td></tr>
    <tr><td class="lbl">Office</td><td>{{office}}</td></tr>
    <tr><td class="lbl">Address</td><td>{{address}}</td></tr>
  </table>
  {{table:items}}
  <table class="pt">
    <tr>
      <td class="pf-cell" style="width:50%"><b>A.</b> Certified: Charges to appropriation/allotment necessary, lawful and under my direct supervision; and supporting documents valid, proper and legal.
        <div class="pf-signame">{{requestedBy|upper}}</div><div class="cap">{{requestedByPos}}</div><div class="cap">Head, Requesting Office/Authorized Representative</div></td>
      <td class="pf-cell"><b>B.</b> Certified: Existence of available appropriation.
        <div class="pf-signame">{{budgetOfficer|upper}}</div><div class="cap">{{budgetOfficerPos}}</div><div class="cap">Head, Budget Unit/Authorized Representative</div></td>
    </tr>
  </table>
  <div class="pf-foot">Prepared in FTS by {{preparedBy}}</div>`,
};

const PR = {
  code: 'PR',
  name: 'Purchase Request',
  category: 'Procurement',
  description: 'Request of an end-user office for the procurement of goods or services.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  steps: [
    { id: 's1', title: 'Requesting Office', instructions: 'Enter the requesting office and fund. Make sure the items are in your approved PPMP / APP.' },
    { id: 's2', title: 'Items', instructions: 'List each item with unit, quantity and estimated unit cost (based on canvass or approved budget). Total cost is computed automatically.' },
    { id: 's3', title: 'Purpose & Signatories', instructions: 'State the purpose clearly and enter the requesting and approving officers.' },
  ],
  fields: [
    { key: 'office', label: 'Office / Section', type: 'text', required: true, step: 's1' },
    { key: 'fund', label: 'Fund', type: 'select', options: ['General Fund', 'Special Education Fund', 'Trust Fund', '20% Development Fund', 'LDRRMF'], required: true, step: 's1' },
    { key: 'prNo', label: 'PR No.', type: 'text', step: 's1' },
    { key: 'respCenter', label: 'Responsibility Center Code', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    {
      key: 'items', label: 'Items', type: 'table', required: true, step: 's2', minRows: 10,
      columns: [
        { key: 'stockNo', label: 'Stock/Property No.', type: 'text' },
        { key: 'unit', label: 'Unit', type: 'text' },
        { key: 'description', label: 'Item Description', type: 'text' },
        { key: 'qty', label: 'Quantity', type: 'number' },
        { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
        { key: 'totalCost', label: 'Total Cost', type: 'currency', compute: 'qty*unitCost', total: true },
      ],
    },
    { key: 'purpose', label: 'Purpose', type: 'textarea', required: true, step: 's3' },
    { key: 'requestedBy', label: 'Requested by', type: 'text', required: true, step: 's3' },
    { key: 'requestedByPos', label: 'Designation', type: 'text', step: 's3' },
    { key: 'approvedBy', label: 'Approved by', type: 'text', step: 's3' },
    { key: 'approvedByPos', label: 'Designation', type: 'text', default: 'Municipal Mayor', step: 's3' },
  ],
  checklist: [
    { id: 'ppmp', label: 'Items are in the approved PPMP / APP', required: true },
    { id: 'specs', label: 'Technical specifications / Terms of Reference attached', required: false },
    { id: 'canvass', label: 'Price reference (canvass / market survey) attached', required: false },
  ],
  processing: [
    { id: "p1", office: "End-User / Requesting Office", action: "Sign \"Requested by\"", details: "Check that every item is in the approved PPMP / APP, attach the specifications or price reference, and have the head of office sign." },
    { id: "p2", office: "Municipal Budget Office", action: "Certify availability of funds", details: "Budget verifies that there is an appropriation for the items and prepares or earmarks the ObR." },
    { id: "p3", office: "Office of the Municipal Mayor", action: "Approval", details: "The approving authority signs \"Approved by\"." },
    { id: "p4", office: "BAC Secretariat / GSO", action: "Procurement", details: "The approved PR is the start of procurement: canvass / RFQ or bidding according to the mode of procurement. A Purchase Order follows after award." },
  ],
  template: `${header('PURCHASE REQUEST')}
  <table class="pmeta-t"><tr><td>Entity Name: <b>{{lgu.name}}</b></td><td class="r">Fund: <b>{{fund}}</b></td></tr></table>
  <table class="pt">
    <tr><td class="lbl">Office/Section</td><td>{{office}}</td><td class="lbl">PR No.</td><td>{{prNo}}</td><td class="lbl">Date</td><td>{{date|date}}</td></tr>
    <tr><td class="lbl">Resp. Center Code</td><td colspan="3">{{respCenter}}</td><td class="lbl">FTS No.</td><td>{{controlNo}}</td></tr>
  </table>
  {{table:items}}
  <table class="pt"><tr><td class="lbl">Purpose</td><td>{{purpose}}</td></tr></table>
  <div class="sig2">
    ${sig('Requested by:', 'requestedBy', 'requestedByPos')}
    ${sig('Approved by:', 'approvedBy', 'approvedByPos')}
  </div>
  <div class="pf-foot">Prepared in FTS by {{preparedBy}}</div>`,
};

const PO = {
  code: 'PO',
  name: 'Purchase Order',
  category: 'Procurement',
  description: 'Order issued to the winning supplier after award, stating items, terms and delivery.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  steps: [
    { id: 's1', title: 'Supplier', instructions: 'Enter the supplier exactly as it appears in the BAC Resolution / Notice of Award.' },
    { id: 's2', title: 'Delivery Terms', instructions: 'Specify the mode of procurement, place and date of delivery, and payment term.' },
    { id: 's3', title: 'Items', instructions: 'Items, quantities and unit costs must match the awarded bid/quotation.' },
    { id: 's4', title: 'Funds & Signatories', instructions: 'Enter the ObR/ORS reference and the officials who will sign.' },
  ],
  fields: [
    { key: 'supplier', label: 'Supplier', type: 'text', required: true, step: 's1' },
    { key: 'supplierAddress', label: 'Address', type: 'text', step: 's1' },
    { key: 'tin', label: 'TIN', type: 'text', step: 's1' },
    { key: 'poNo', label: 'P.O. No.', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    { key: 'modeOfProcurement', label: 'Mode of Procurement', type: 'select', options: ['Public Bidding', 'Small Value Procurement', 'Shopping', 'Direct Contracting', 'Negotiated Procurement - Emergency', 'Repeat Order', 'Others'], required: true, step: 's2' },
    { key: 'placeOfDelivery', label: 'Place of Delivery', type: 'text', step: 's2' },
    { key: 'dateOfDelivery', label: 'Date of Delivery', type: 'text', placeholder: 'e.g. within 15 calendar days upon receipt of PO', step: 's2' },
    { key: 'deliveryTerm', label: 'Delivery Term', type: 'text', step: 's2' },
    { key: 'paymentTerm', label: 'Payment Term', type: 'text', step: 's2' },
    {
      key: 'items', label: 'Items', type: 'table', required: true, step: 's3', minRows: 10,
      columns: [
        { key: 'stockNo', label: 'Stock/Property No.', type: 'text' },
        { key: 'unit', label: 'Unit', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'qty', label: 'Quantity', type: 'number' },
        { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
        { key: 'amount', label: 'Amount', type: 'currency', compute: 'qty*unitCost', total: true },
      ],
    },
    { key: 'obrNo', label: 'ObR/ORS No.', type: 'text', step: 's4' },
    { key: 'fund', label: 'Fund', type: 'select', options: ['General Fund', 'Special Education Fund', 'Trust Fund', '20% Development Fund', 'LDRRMF'], step: 's4' },
    { key: 'authorizedOfficial', label: 'Authorized Official', type: 'text', step: 's4' },
    { key: 'authorizedOfficialPos', label: 'Designation', type: 'text', default: 'Municipal Mayor', step: 's4' },
    { key: 'accountant', label: 'Chief Accountant / Head of Accounting', type: 'text', step: 's4' },
  ],
  checklist: [
    { id: 'award', label: 'BAC Resolution / Notice of Award', required: true },
    { id: 'abstract', label: 'Abstract of Canvass / Bids', required: true },
    { id: 'obr', label: 'Approved ObR/ORS', required: true },
    { id: 'pr', label: 'Approved Purchase Request', required: true },
  ],
  processing: [
    { id: "p1", office: "BAC Secretariat / GSO", action: "Prepare the PO after award", details: "Prepare the PO only after the BAC Resolution / Notice of Award. Items, quantities and prices must match the awarded quotation or bid." },
    { id: "p2", office: "Municipal Accounting Office", action: "Certify funds available", details: "Accounting checks the approved ObR and signs \"Funds Available\"." },
    { id: "p3", office: "Office of the Municipal Mayor", action: "Sign the PO", details: "The authorized official signs the PO." },
    { id: "p4", office: "Supplier", action: "Conforme", details: "The supplier signs the Conforme and dates it. The delivery period starts on the date of receipt." },
    { id: "p5", office: "Inspection Committee / GSO", action: "Delivery, inspection and acceptance", details: "On delivery, the items are inspected and accepted (IAR). The PO, IAR, delivery receipt and invoice then support the Disbursement Voucher for payment." },
  ],
  template: `${header('PURCHASE ORDER')}
  <table class="pmeta-t"><tr><td>Entity Name: <b>{{lgu.name}}</b></td><td class="r">FTS Control No.: <b>{{controlNo}}</b></td></tr></table>
  <table class="pt">
    <tr><td class="lbl">Supplier</td><td><b>{{supplier}}</b></td><td class="lbl">P.O. No.</td><td>{{poNo}}</td></tr>
    <tr><td class="lbl">Address</td><td>{{supplierAddress}}</td><td class="lbl">Date</td><td>{{date|date}}</td></tr>
    <tr><td class="lbl">TIN</td><td>{{tin}}</td><td class="lbl">Mode of Procurement</td><td>{{modeOfProcurement}}</td></tr>
    <tr><td colspan="4">Gentlemen: Please furnish this Office the following articles subject to the terms and conditions contained herein:</td></tr>
    <tr><td class="lbl">Place of Delivery</td><td>{{placeOfDelivery}}</td><td class="lbl">Delivery Term</td><td>{{deliveryTerm}}</td></tr>
    <tr><td class="lbl">Date of Delivery</td><td>{{dateOfDelivery}}</td><td class="lbl">Payment Term</td><td>{{paymentTerm}}</td></tr>
  </table>
  {{table:items}}
  <table class="pt">
    <tr><td colspan="2"><b>(Total Amount in Words):</b> <i>{{sum:items.amount|words}}</i></td></tr>
    <tr><td colspan="2" style="font-size:9.5px">In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10) of one percent for every day of delay shall be imposed on the undelivered item/s.</td></tr>
    <tr>
      <td class="pf-cell" style="width:50%">Conforme:
        <div class="pf-signame">&nbsp;</div><div class="cap">Signature over Printed Name of Supplier</div><div class="cap">Date: ____________</div></td>
      <td class="pf-cell">Very truly yours,
        <div class="pf-signame">{{authorizedOfficial|upper}}</div><div class="cap">Signature over Printed Name of Authorized Official</div><div class="cap">{{authorizedOfficialPos}}</div></td>
    </tr>
    <tr>
      <td class="pf-cell">Fund: <b>{{fund}}</b><br>ObR/ORS No.: <b>{{obrNo}}</b><br>Amount: <b>{{sum:items.amount|peso}}</b></td>
      <td class="pf-cell">Funds Available:
        <div class="pf-signame">{{accountant|upper}}</div><div class="cap">Signature over Printed Name of Chief Accountant/Head of Accounting Division/Unit</div></td>
    </tr>
  </table>
  <div class="pf-foot">Prepared in FTS by {{preparedBy}}</div>`,
};

export const STARTER_TYPES = [DV, OBR, PR, PO];

export const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Amount (₱)' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'table', label: 'Table / line items' },
];

export const COLUMN_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Amount (₱)' },
  { value: 'date', label: 'Date' },
];

export const STATUSES = {
  draft: { label: 'Draft', className: 'badge-gray' },
  complete: { label: 'Complete', className: 'badge-green' },
  cancelled: { label: 'Cancelled', className: 'badge-red' },
};
