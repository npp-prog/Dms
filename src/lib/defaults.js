// Starter document types. Superadmins/admins can load these from
// Admin > Document Types > "Load starter formats" and then edit freely.

const header = (title, extra = '') => `
  <div class="form-header">
    <div class="small">Republic of the Philippines</div>
    <div class="lgu">{{lgu.name}}</div>
    <div class="small">{{lgu.address}}</div>
    <h2>${title}</h2>
    ${extra}
  </div>`;

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
  template: `<div class="form">
  ${header('DISBURSEMENT VOUCHER', '<div class="small">Fund: <b>{{fundCluster}}</b> &nbsp; | &nbsp; FTS Control No.: <b>{{controlNo}}</b></div>')}
  <table class="grid">
    <tr><th style="width:20%">Mode of Payment</th><td colspan="3">{{modeOfPayment}}</td></tr>
    <tr><th>Payee</th><td>{{payee}}</td><th style="width:18%">TIN/Employee No.</th><td>{{tin}}</td></tr>
    <tr><th>Address</th><td>{{address}}</td><th>ObR/ORS No.</th><td>{{obrNo}}</td></tr>
    <tr><th>Office</th><td>{{office}}</td><th>DV No. / Date</th><td>{{dvNo}} &nbsp; {{date|date}}</td></tr>
  </table>
  {{table:particulars}}
  <table class="grid">
    <tr><td colspan="2"><b>Amount Due:</b> {{sum:particulars.amount|peso}} &mdash; <i>{{sum:particulars.amount|words}}</i></td></tr>
    <tr>
      <td style="width:50%"><b>A.</b> Certified: Expenses/Cash Advance necessary, lawful and incurred under my direct supervision.<br><br>
        <div class="sig">{{certA|upper}}</div><div class="sig-label">{{certAPos}}</div></td>
      <td><b>B.</b> Accounting Entry {{table:entries}}</td>
    </tr>
    <tr>
      <td><b>C.</b> Certified: Cash available &#9744; &nbsp; Subject to Authority to Debit Account &#9744; &nbsp; Supporting documents complete and amount claimed proper &#9744;<br><br>
        <div class="sig">{{certC|upper}}</div><div class="sig-label">{{certCPos}}</div></td>
      <td><b>D.</b> Approved for Payment<br><br><br>
        <div class="sig">{{approver|upper}}</div><div class="sig-label">{{approverPos}}</div></td>
    </tr>
    <tr><td colspan="2"><b>E.</b> Receipt of Payment &mdash; Check/ADA No.: ________ &nbsp; Date: ________ &nbsp; Bank: ______________ &nbsp; JEV No.: ________<br><br>
      Signature: ______________________ &nbsp; Printed Name: ______________________ &nbsp; OR/Other Document: ______________</td></tr>
  </table>
</div>`,
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
  template: `<div class="form">
  ${header('OBLIGATION REQUEST', '<div class="small">No.: <b>{{obrNo}}</b> &nbsp; | &nbsp; FTS Control No.: <b>{{controlNo}}</b></div>')}
  <table class="grid">
    <tr><th style="width:18%">Payee</th><td colspan="3">{{payee}}</td></tr>
    <tr><th>Office</th><td>{{office}}</td><th style="width:12%">Fund</th><td>{{fund}}</td></tr>
    <tr><th>Address</th><td>{{address}}</td><th>Date</th><td>{{date|date}}</td></tr>
  </table>
  {{table:items}}
  <table class="grid">
    <tr>
      <td style="width:50%"><b>A.</b> Certified: Charges to appropriation/allotment necessary, lawful and under my direct supervision; and supporting documents valid, proper and legal.<br><br>
        <div class="sig">{{requestedBy|upper}}</div><div class="sig-label">{{requestedByPos}}</div></td>
      <td><b>B.</b> Certified: Existence of available appropriation.<br><br><br>
        <div class="sig">{{budgetOfficer|upper}}</div><div class="sig-label">{{budgetOfficerPos}}</div></td>
    </tr>
  </table>
</div>`,
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
  template: `<div class="form">
  ${header('PURCHASE REQUEST', '<div class="small">FTS Control No.: <b>{{controlNo}}</b></div>')}
  <table class="grid">
    <tr><th style="width:18%">Office/Section</th><td>{{office}}</td><th style="width:16%">PR No.</th><td>{{prNo}}</td></tr>
    <tr><th>Fund</th><td>{{fund}}</td><th>Date</th><td>{{date|date}}</td></tr>
    <tr><th>Resp. Center Code</th><td colspan="3">{{respCenter}}</td></tr>
  </table>
  {{table:items}}
  <table class="grid">
    <tr><th style="width:18%">Purpose</th><td colspan="2">{{purpose}}</td></tr>
    <tr><td></td><td style="width:41%"><b>Requested by:</b><br><br><div class="sig">{{requestedBy|upper}}</div><div class="sig-label">{{requestedByPos}}</div></td>
      <td><b>Approved by:</b><br><br><div class="sig">{{approvedBy|upper}}</div><div class="sig-label">{{approvedByPos}}</div></td></tr>
  </table>
</div>`,
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
  template: `<div class="form">
  ${header('PURCHASE ORDER', '<div class="small">FTS Control No.: <b>{{controlNo}}</b></div>')}
  <table class="grid">
    <tr><th style="width:18%">Supplier</th><td>{{supplier}}</td><th style="width:16%">P.O. No.</th><td>{{poNo}}</td></tr>
    <tr><th>Address</th><td>{{supplierAddress}}</td><th>Date</th><td>{{date|date}}</td></tr>
    <tr><th>TIN</th><td>{{tin}}</td><th>Mode of Proc.</th><td>{{modeOfProcurement}}</td></tr>
    <tr><td colspan="4">Gentlemen: Please furnish this Office the following articles subject to the terms and conditions contained herein:</td></tr>
    <tr><th>Place of Delivery</th><td>{{placeOfDelivery}}</td><th>Delivery Term</th><td>{{deliveryTerm}}</td></tr>
    <tr><th>Date of Delivery</th><td>{{dateOfDelivery}}</td><th>Payment Term</th><td>{{paymentTerm}}</td></tr>
  </table>
  {{table:items}}
  <table class="grid">
    <tr><td colspan="2"><b>(Total Amount in Words):</b> <i>{{sum:items.amount|words}}</i></td></tr>
    <tr><td colspan="2" class="small">In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10) of one percent for every day of delay shall be imposed on the undelivered item/s.</td></tr>
    <tr>
      <td style="width:50%">Conforme:<br><br><div class="sig">&nbsp;</div><div class="sig-label">Signature over Printed Name of Supplier</div><div class="sig-label">Date: ____________</div></td>
      <td>Very truly yours,<br><br><div class="sig">{{authorizedOfficial|upper}}</div><div class="sig-label">{{authorizedOfficialPos}}</div></td>
    </tr>
    <tr>
      <td>Fund: {{fund}}<br>ObR/ORS No.: {{obrNo}}<br>Amount: {{sum:items.amount|peso}}</td>
      <td>Funds Available:<br><br><div class="sig">{{accountant|upper}}</div><div class="sig-label">Chief Accountant / Head of Accounting</div></td>
    </tr>
  </table>
</div>`,
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
  complete: { label: 'Complete', className: 'badge-blue' },
  transmitted: { label: 'Transmitted via DMS', className: 'badge-green' },
  cancelled: { label: 'Cancelled', className: 'badge-red' },
};
