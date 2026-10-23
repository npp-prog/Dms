# FTS — Financial Transaction System

FTS is a web app that stores the official formats of LGU financial documents. It covers forms that PMS, IMS, CBO, CFMS and other LGU web apps do **not** generate, such as the **Disbursement Voucher (DV)**, **Obligation Request (OBR)**, **Purchase Request (PR)** and **Purchase Order (PO)**. Admins can add more document types.

- **Superadmins/admins** define each document type: its fields, a **guided step-by-step encoding process**, a **checklist of requirements**, a **processing guide** (which offices the document goes to, in what order, and what each does), and a **printable format** (HTML template).
- **End users only encode.** They fill in the document through the guided wizard, confirm the checklist, and print it. FTS then shows them **how to process the document**. FTS does not route or transmit documents.

**Try it on your computer:** `npm install`, then `npm run local`. No Firebase project is needed. See [docs/LOCALHOST.md](docs/LOCALHOST.md) for the full walkthrough with screenshots.

Stack: React + Vite, Firebase Authentication + Cloud Firestore, deployed on Netlify.

**Look:** the same design as PMS-IMS (TOSCAN layout: top bar and sidebar, a dashboard with "Needs your attention" and "At a glance", the Inter and Plus Jakarta Sans typefaces, official-form print layout with the municipal seal) in **navy blue and gold** instead of green and gold.

## Features

| Area | What it does |
|---|---|
| Document Formats | Browse and search every format by category. View the guided steps, the processing guide and the checklist, and print a blank form. |
| Prepare Document | Step-by-step wizard with per-step instructions and required-field checks, then the checklist and a review. A live print preview updates as you type. |
| Documents | Each document gets an automatic control number, e.g. `DV-2026-10-0001`. Status goes Draft → Complete, or Cancelled. Each document shows **How to process this document**. You can filter, search, print and see the history of each document. |
| Document Types (admin) | Field builder (text, long text, number, amount, date, dropdown, line-item tables with computed columns and totals), steps builder, checklist builder, processing-guide builder, and template editor with live preview. Import/export as JSON. Starter DV/OBR/PR/PO formats are included. |
| Users (admin) | New accounts wait for approval. Admins approve or deactivate users. Only the superadmin grants admin/superadmin. |
| Settings (superadmin) | LGU name, address and seal (printed on headers). |

Each document stores a frozen copy of its format. A document therefore always prints the way it was prepared, even after an admin revises the document type.

## Roles

| Role | Can |
|---|---|
| `superadmin` | Everything, including assigning roles and changing settings. **The first account registered becomes the superadmin.** |
| `admin` | Manage document types, approve/deactivate regular users, view all documents |
| `user` | View formats, prepare documents, see only their own documents |

Firestore security rules (`firestore.rules`) enforce all of this on the server.

## Setup

### 1. Firebase

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method →** enable **Email/Password**.
3. **Firestore Database →** create a database (production mode).
4. **Project settings → Your apps →** add a Web app and copy its config values.
5. Deploy the security rules (required):
   ```bash
   npx firebase-tools login
   npx firebase-tools use --add   # pick your project
   npm run deploy:rules
   ```
   You can also paste `firestore.rules` into **Firestore → Rules** in the console.

### 2. Local development

**Quickest: no Firebase project needed.** You need Node.js 20+ and Java 21+.

```bash
npm install
npm run local        # local Firebase emulators + demo data + app at http://localhost:5173
```

Demo logins: `admin@fts.local` / `admin123` (superadmin) and `user@fts.local` / `user123` (end user). See [docs/LOCALHOST.md](docs/LOCALHOST.md).

**Against your real Firebase project:**

```bash
cp .env.example .env.local   # fill in the VITE_FIREBASE_* values
npm run dev
```

### 3. Netlify

1. Push this repo to GitHub, then in Netlify choose **Add new site → Import an existing project** and pick the repo.
2. `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`), and the SPA redirect.
3. Under **Site configuration → Environment variables**, add every `VITE_FIREBASE_*` variable from `.env.example`.
4. Deploy. Then add your Netlify domain under **Firebase → Authentication → Settings → Authorized domains**.

### 4. First run

1. Open the site and **create an account**. The first account becomes the **superadmin**.
2. Go to **Settings** and enter the LGU name and address.
3. Go to **Document Types** and click **Load starter formats** (DV, OBR, PR, PO), then adjust them. Or create your own.
4. Other staff register themselves. Approve them under **Users**.

## Template reference

Formats are HTML with placeholders:

| Tag | Output |
|---|---|
| `{{payee}}` | Field value (HTML-escaped) |
| `{{amount\|peso}}` | Filters: `currency` (1,234.50), `peso` (₱ 1,234.50), `date` (October 23, 2026), `words` (amount in words), `upper`, `number` |
| `{{controlNo}}` `{{today\|date}}` `{{preparedBy}}` | Document context |
| `{{lgu.name}}` `{{lgu.address}}` | From Settings |
| `{{table:items}}` | Auto-rendered table for a line-item field, with blank filler rows and a totals row |
| `{{sum:items.amount\|peso}}` | Total of a table column |
| `{{#each items}}<tr><td>{{@no}}</td><td>{{description}}</td></tr>{{/each}}` | Custom row layout |
| `{{check:obr}}` | ☑ / ☐ for a checklist item |
| `{{#if mode=ADA}}&#10003;{{/if}}` | Shown only when a field equals a value (or `{{#if field}}` when it has any value) |
| `{{lgu.seal}}` | Seal image URL (Settings, default `/municipal-seal.png`) |

Form CSS classes (same as the PMS-IMS printed forms): `ph` header with `l1` / `l2` / `l3` lines, `pmeta-t` (unbordered meta lines), `pt` (bordered table), `lbl` (shaded label cell), `pf-box` (checkbox), `pf-cell`, `pf-signame` (signature line), `cap` (caption), `sig2` signature columns (`col`, `who`, `name`, `pos`), `r` / `c` alignment. "Generate from fields" in the template editor produces a starting layout with these. The rendered HTML is sanitized with DOMPurify.

## Data model (Firestore)

```
users/{uid}           email, displayName, office, role, active
documentTypes/{id}    code, name, category, description, active, version,
                      paperSize, orientation, steps[], fields[], checklist[],
                      processing[] {office, action, details}, template
documents/{id}        typeId, typeCode, typeName, typeVersion, typeSnapshot, controlNo,
                      data{}, checklist{}, status (draft | complete | cancelled), title,
                      createdBy, createdByName, history[], createdAt, updatedAt
counters/{CODE_YYYY-MM}  value  (control number sequence)
meta/settings         lguName, lguAddress, province, sealUrl
meta/bootstrap        superadmin uid (claimed once by the first account)
```

## Scripts

```bash
npm run local         # run on localhost with local Firebase emulators and demo data
npm run local:reset   # clear the local data (fresh demo data on the next run)
npm run dev           # dev server against the Firebase project in .env.local
npm run build         # production build to dist/
npm test              # unit tests (template engine, amount in words, form helpers, starter formats)
npm run emulators     # local Firebase emulators only
npm run deploy:rules  # deploy Firestore rules and indexes
```
