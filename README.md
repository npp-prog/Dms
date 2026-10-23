# FTS — Financial Transaction System

FTS is a web app that stores the official formats of LGU financial documents. It covers forms that PMS, IMS, CBO, CFMS and other LGU web apps do **not** generate, such as the **Disbursement Voucher (DV)**, **Obligation Request (OBR)**, **FURS**, **Payroll**, **Petty Cash Voucher**, **Liquidation Report**, **Itinerary of Travel**, **Purchase Request**, **Purchase Order** and **Job Order**. The starter formats follow the Municipal Government of Candoni's Appendix Forms (GAM for LGUs). Admins can add more document types.

- **Superadmins/admins** define each document type: its fields, a **guided step-by-step encoding process**, a **checklist of requirements**, a **processing guide** (which offices the document goes to, in what order, and what each does), and a **printable format** (HTML template).
- **End users only encode.** They fill in the document through the guided wizard, confirm the checklist, and print it. FTS then shows them **how to process the document**. FTS does not route or transmit documents.
- **Checklist library.** All 210 checklists of the Municipal Accounting Office are included: 201 for disbursements (1001–1907) and 9 for liquidations (2002–2015). On a DV, Payroll or Liquidation Report, the **first step** is to pick the type of transaction (e.g. *1613 – Payment to Supplier, Direct Acquisition*). FTS shows its requirements before anything is encoded, then loads that checklist with Y / N/A answers and prints it, filled in, as the cover sheet.

**Try it on your computer:** `npm install`, then `npm run local`. No Firebase project is needed. See [docs/LOCALHOST.md](docs/LOCALHOST.md) for the full walkthrough with screenshots.

Stack: React + Vite, Firebase Authentication + Cloud Firestore, deployed on Netlify.

**Look:** the same design as PMS-IMS (TOSCAN layout: top bar and sidebar, a dashboard with "Needs your attention" and "At a glance", the Inter and Plus Jakarta Sans typefaces, official-form print layout with the municipal seal) in **navy blue and gold** instead of green and gold.

## Features

| Area | What it does |
|---|---|
| Document Formats | Browse and search every format by category. View the guided steps, the processing guide (with the copies to print) and the checklist, and print a blank form. |
| Checklists | The disbursement and liquidation checklist library, searchable by number or words. Each checklist can be printed blank. Admins load, edit and add checklists. |
| Prepare Document | Step-by-step wizard with per-step instructions and required-field checks, then the checklist and a review. DV, Payroll and LR start with the type of transaction, so the user sees the required documents first. Totals, net pay and amounts to be reimbursed are computed. A live print preview updates as you type. When printed, each form is portrait and fits one page: scaled down if it is too tall or too wide, and its main table stretched to fill the page if there is room. The preview is the exact printed page. |
| Documents | Each document gets an automatic control number, e.g. `DV-2026-10-0001`. Status goes Draft → Complete, or Cancelled. Each document shows **How to process this document**. You can filter, search, print and see the history of each document. |
| Document Types (admin) | Field builder (text, long text, number, amount, date, dropdown, line-item tables with computed columns and totals), steps builder, checklist builder, processing-guide builder, and template editor with live preview. Import/export as JSON. Ten starter formats are included (DV, OBR, FURS, Payroll, PCV, LR, IT, PR, PO, JO), printed portrait and **fit to page** (width and height): the DV on Folio (8.5 × 13 in), everything else on A4. |
| Users (admin) | New accounts wait for approval. Admins approve or deactivate users. Only the superadmin grants admin/superadmin. |
| Settings (superadmin) | LGU name, address, seal and **signatories** (Mayor, Accountant, Budget Officer, Treasurer, SB Secretary), printed on the forms. |

Each document stores a frozen copy of its format. A document therefore always prints the way it was prepared, even after an admin revises the document type.

## Roles

| Role | Can |
|---|---|
| `superadmin` | Everything, including assigning roles and changing settings. **`npp@mgocandoniaccounting.org` is the superadmin**, once Firebase has verified the address (Google sign-in, or the verification link sent on registration). Set in `src/lib/owner.js` and `firestore.rules`. |
| `admin` | Manage document types, approve/deactivate regular users, view all documents |
| `user` | View formats, prepare documents, see only their own documents |

Firestore security rules (`firestore.rules`) enforce all of this on the server.

## Setup

### 1. Firebase

1. Create a **new Firebase project for FTS** at <https://console.firebase.google.com> (e.g. `candoni-fts`). Don't reuse the project of PMS-IMS or another app: FTS has its own users, rules and data.
2. **Authentication → Sign-in method →** enable **Email/Password** and **Google**.
3. **Firestore Database →** create a database (production mode).
4. **Project settings → Your apps →** add a Web app, copy its `firebaseConfig`, and paste the values into **`src/firebase-config.js`**. These values are not secret: access is controlled by Authentication and the Firestore rules. Commit and push.
5. Deploy the security rules (required):
   ```bash
   npx firebase-tools login
   npm run deploy:rules           # deploys to candoni-fts-a2f16 (set in .firebaserc)
   ```
   You can also paste `firestore.rules` into **Firestore → Rules** in the console.

### 2. Local development

**Quickest: no Firebase project needed.** You need Node.js 20+ and Java 21+.

```bash
npm install
npm run local        # local Firebase emulators + demo data + app at http://localhost:5173
```

Demo logins: `npp@mgocandoniaccounting.org` / `admin123` (superadmin, local demo only) and `user@fts.local` / `user123` (end user). See [docs/LOCALHOST.md](docs/LOCALHOST.md).

**Against your real Firebase project:** paste the config into `src/firebase-config.js` (step 1), then `npm run dev`.

### 3. Netlify

1. Push this repo to GitHub, then in Netlify choose **Add new site → Import an existing project** and pick the repo.
2. That's all: `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`) and the SPA redirect. **No environment variables are needed**, because the Firebase config is in `src/firebase-config.js`.
3. Deploy. Then add your Netlify domain under **Firebase → Authentication → Settings → Authorized domains**.

After that, every push to the branch Netlify watches redeploys the site by itself.

### 4. First run

1. Open the site and sign in with **Continue with Google** using `npp@mgocandoniaccounting.org`. That account becomes the **superadmin** right away. If you register with email and password instead, open the verification link that is emailed to you, then click **Check again**.
2. On that first sign-in FTS sets itself up: it installs the 10 starter formats (**DV, OBR, PR, PO**, FURS, Payroll, PCV, LR, IT, JO), the 210 checklists, and the LGU settings with the signatories. Only empty parts are filled; nothing you have edited is overwritten. Review them under **Document Types**, **Checklists** and **Settings**.
3. Other staff register themselves (Google or email). Approve them under **Users**.

## Template reference

Formats are HTML with placeholders:

| Tag | Output |
|---|---|
| `{{payee}}` | Field value (HTML-escaped) |
| `{{amount\|peso}}` | Filters: `currency` (1,234.50; negatives print as (1,234.50)), `peso` (₱ 1,234.50), `date` (October 23, 2026), `words` (amount in words), `upper`, `number` |
| `{{controlNo}}` `{{today\|date}}` `{{preparedBy}}` | Document context |
| `{{lgu.name}}` `{{lgu.address}}` | From Settings |
| `{{sig.mayor}}` `{{sig.mayorPosition}}` | Signatories from Settings: `mayor`, `accountant`, `budget`, `treasurer`, `sbSecretary` (each with `…Position`) |
| `{{table:items}}` | Auto-rendered table for a line-item field, with blank filler rows and a totals row |
| `{{sum:items.amount\|peso}}` | Total of a table column |
| `{{#each items}}<tr><td>{{@no}}</td><td>{{description}}</td></tr>{{/each}}` | Custom row layout |
| `{{check:obr}}` | ☑ / ☐ for a checklist item |
| `{{#if mode=ADA}}&#10003;{{/if}}` | Shown only when a field equals a value (or `{{#if field}}` when it has any value) |
| `{{lgu.seal}}` | Seal image URL (Settings, default `/municipal-seal.png`) |

Computed values: give a table column or a field a formula such as `qty*unitCost`, `gross-deductions`, `labor+spareParts+materials` or `sum:items.amount-cashAdvance`.

Form CSS classes (same as the PMS-IMS printed forms): `ph` header with `l1` / `l2` / `l3` lines, `pmeta-t` (unbordered meta lines), `pt` (bordered table), `lbl` (shaded label cell), `pf-box` (checkbox), `pf-cell`, `pf-signame` (signature line), `cap` (caption), `sig2` signature columns (`col`, `who`, `name`, `pos`), `r` / `c` alignment. "Generate from fields" in the template editor produces a starting layout with these. The rendered HTML is sanitized with DOMPurify.

## Data model (Firestore)

```
users/{uid}           email, displayName, office, role, active
documentTypes/{id}    code, name, category, description, active, version,
                      paperSize (A4 | Folio | Letter | Legal), orientation, steps[], fields[],
                      checklistSource (own | disbursement | liquidation), checklist[],
                      processing[] {office, action, details}, copies[] {to, count, original}, template
checklists/{code}     code, kind (disbursement | liquidation), category, title, description,
                      headerFields[], items[] {id, label, required, group?}, basis[], notes[]
documents/{id}        typeId, typeCode, typeName, typeVersion, typeSnapshot, controlNo,
                      data{}, checklist{itemId: 'Y' | 'NA'}, transaction (frozen checklist copy),
                      signatories (frozen), status (draft | complete | cancelled), title,
                      createdBy, createdByName, history[], createdAt, updatedAt
counters/{CODE_YYYY-MM}  value  (control number sequence)
meta/settings         lguName, lguAddress, province, sealUrl, signatories{}
```

## Scripts

```bash
npm run local         # run on localhost with local Firebase emulators and demo data
npm run local:reset   # clear the local data (fresh demo data on the next run)
npm run dev           # dev server against the Firebase project in .env.local
npm run build         # production build to dist/
npm test              # unit tests (template engine, formulas, checklists, checklist library data, starter formats)
npm run emulators     # local Firebase emulators only
npm run deploy:rules  # deploy Firestore rules and indexes
```
