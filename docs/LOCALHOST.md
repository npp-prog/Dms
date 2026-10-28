# Running and using FTS on localhost

This guide shows how to run FTS on your own computer at **http://localhost:5173** and walks through using it.

When you run FTS locally you don't need a Firebase project or internet hosting. `npm run local` starts a **local copy of Firebase** (the Firebase emulators) with the same security rules as the live app, and loads demo accounts and the starter formats.

---

## 1. Install the tools (one time)

| Tool | Why | Get it |
|---|---|---|
| **Node.js 20 or newer** (LTS) | Runs the app | <https://nodejs.org> → download the **LTS** installer |
| **Java 21 or newer** | Runs the local Firebase emulators | <https://adoptium.net> → **Temurin 21 (LTS)** installer |
| **Git** | Downloads the code | <https://git-scm.com/downloads> |

To check, open **Command Prompt** (Windows) or **Terminal** (Mac) and run:

```bash
node -v      # v20.x or higher
java -version   # "21" or higher
git --version
```

On Windows, close and reopen Command Prompt after installing so it picks up the new tools.

## 2. Download the code (one time)

```bash
git clone https://github.com/npp-prog/fts.git
cd fts
git checkout ccr-fac8062d-2kj3lp     # the branch with the app (until it is merged)
npm install
```

## 3. Start FTS

```bash
npm run local
```

On the **first run** this:

1. downloads the Firebase emulators, which takes about a minute;
2. starts a local login service and a local database;
3. loads the demo data;
4. opens **http://localhost:5173** in your browser.

If your browser doesn't open by itself, open that address yourself.

You should see this in the terminal:

```
[FTS] Demo data loaded:
      Superadmin  npp@mgocandoniaccounting.org / admin123
      End user    user@fts.local / user123
      Formats     DV, OBR, FURS, PAYROLL, PCV, LR, IT, PR, PO, JO
      Checklists  210 (disbursement and liquidation)
[FTS] Starting the app at http://localhost:5173 …
```

**To stop:** press **Ctrl + C** in the terminal, once. FTS saves your local data to the `.emulator-data` folder and loads it again the next time you run `npm run local`.

**To start over with fresh demo data:** stop FTS, run `npm run local:reset`, then run `npm run local` again. Do this once after updating FTS, so the demo data includes the latest formats and checklists.

> Everything here stays on your computer. Accounts and documents you create locally are not on the live site, and live data is not here.

---

## 4. Using FTS as an end user

Sign in as **user@fts.local** / **user123**.

### Sign in

![Sign-in screen](images/01-sign-in.png)

A new person can click **Create an account**. An administrator then approves the account under **Users**.

### Dashboard

![Dashboard](images/02-dashboard.png)

The dashboard shows:

- the five-step flow: choose the format → encode → checklist → print → process;
- **Needs your attention**: your drafts to finish and your completed documents to print;
- shortcuts to each document format;
- **At a glance**: your document counts.

### Document formats

**Document Formats** lists every form: DV, OBR, FURS, Payroll, PCV, LR, Itinerary of Travel, PR, PO and JO.

![Document formats](images/03-formats.png)

**View format** shows three things:

- the guided encoding steps;
- **How to process this document**: which office receives the document, in what order, and what each does;
- the blank printable form.

![Format view with the processing guide](images/06-format-dv.png)

### Checklists

**Checklists** has all 210 checklists of the Municipal Accounting Office: 201 for disbursements and 9 for liquidations, grouped by category. Search by number or by words.

![Checklist library](images/04-checklists.png)

Open a checklist to read it or print a blank copy:

- an item with only a **Y** box (N/A shaded) is always required;
- an item with **Y** and **N/A** boxes is required only if it applies.

The printout follows the Accounting Office's Word checklist: A4, Times New Roman, numbered items. Every requirement has a **Document Type** (the generic name of the document, e.g. *BAC Resolution*) and **Document Details** (the instruction that specifies it).

![Checklist 1613](images/05-checklist-1613.png)

### Encode the details

Click **Prepare this document**, or go to **Prepare Document** and pick a format. Fill in each step. Everything you type is in capital letters, as on the official forms, and prints that way. The instructions for the step are shown in the blue box, and the preview on the right updates as you type. You can't go to the next step until the required fields (marked \*) are filled in.

![DV payee](images/09-dv-payee.png)

For line items, click **+ Add row**. On the DV, the **Explanation** is a paragraph box: write the particulars in full and press Enter for a new line; it prints the same way. Enter deductions as negative amounts: they print in parentheses, like `(164.73)`. The Amount Due fills in automatically. The printed names in boxes B, C and D come from Settings.

![DV particulars](images/10-dv-particulars.png)

### Checklist step: choose the transaction, tick what you attached

For a **DV**, **Payroll** or **Liquidation Report**, the Checklist step asks for the **type of transaction**. Type a checklist number or some words (e.g. `1613` or `direct acquisition`, or `2002` for a liquidation of local travel) and pick one. Its checklist from the Municipal Accounting Office loads, and the preview on the right shows it as it will print. To pick another, click **Change**; the answers you already gave are cleared.

- tick **Y** for each document you attached;
- tick **N/A** for items that don't apply (always-required items have no N/A);
- the preview on the right shows the checklist as it will print, with your answers.

![Checklist step](images/11-dv-checklist.png)

**Review & Save** tells you what is still missing. **Mark complete** stays disabled until every required field and every always-required checklist item is done.

![Review](images/12-dv-review.png)

### Print and process

The completed document gets an FTS control number, e.g. `FTS-000001`. Above the preview are two tabs: **DV** and **Checklist 1613**. **Print** prints whichever tab you are on, so print both and put the checklist on top of the attachments. Printing is automatic:

- **Portrait, one page.** Every form prints portrait on one page: the DV on Folio (8.5 × 13 in), everything else on A4. Forms that are too tall (many lines) or too wide (many columns) are scaled down to fit.
- **Fills the page.** When there is room left, the main table (particulars, items, employees) stretches to the bottom of the page, like a pre-printed form.
- **What you see is what prints.** The preview is the printed page, scaled to fit your screen. A very long checklist, such as competitive bidding, stays readable and continues on a second page. In the browser's print dialog, leave the scale at **Default** and the paper size as set. Then follow **How to process this document**. FTS doesn't route the document; the guide tells you where it goes next.

![Completed document](images/13-dv-document.png)

| The DV (Folio, 8.5 × 13 in) | The checklist cover sheet, filled in (A4) |
|---|---|
| ![DV printout](images/14-dv-print.png) | ![Checklist printout](images/15-dv-checklist-print.png) |

The checklist's header boxes (DV Number, OBR/FURS Number, Payee) fill in from the document. The DV Number box stays blank until Accounting assigns the number.

### Computed amounts (example: Liquidation Report)

Totals are computed as you type. On the Liquidation Report, for example, FTS computes the total amount spent and the amount to be reimbursed (total spent − cash advance + refund). (The liquidation type, e.g. **2002 – Local Travel**, was chosen in step 1.)

![LR computed amounts](images/17-lr-computed.png)

![LR checklist](images/18-lr-checklist.png)

---

## 5. Using FTS as an administrator

Sign out (top right), then sign in as **npp@mgocandoniaccounting.org** / **admin123** (local demo password). On the live site, `npp@mgocandoniaccounting.org` is the superadmin: sign in with **Continue with Google**, or register with email and password and open the verification link.

### Checklists

On **Checklists**, an administrator can:

- **load the checklist library**: on the live site, click this once;
- **reload the original library**, which overwrites your edits;
- create a new checklist;
- edit or delete any checklist.

The editor shows the printed checklist as you edit. Each item has a **document type** and optional **document details**, is either **Always required (Y)** or **If applicable (Y / N/A)**, and can have a group heading (e.g. *Progress Payment*, *Final Payment*). In notes, put `**double asterisks**` around words to print them in bold.

![Checklist editor](images/19-admin-checklist-editor.png)

### Document types

Each document type has six tabs: **General** (code, name, paper size: **A4**, **Folio (8.5 × 13 in)**, Letter or Legal), **Guided Steps**, **Fields**, **Checklist**, **Processing Guide** and **Format / Template**.

In the **Checklist** tab, **Checklist source** decides where the checklist comes from:

- **Own checklist**: a fixed list you write here;
- **Disbursement library** or **Liquidation library**: the wizard starts with *Type of Transaction*, as shown above.

![Checklist source](images/20-admin-checklist-source.png)

The **Processing Guide** tab has the routing steps: which office receives the document, in what order, and what each does.

![Processing guide editor](images/21-admin-processing-guide.png)

Fields can be **computed**: in a table column or a field, the formula combines other keys with `+`, `-` and `*`, and `sum:table.column` adds up a table column. For example, `qty*unitCost`, `gross-deductions` or `sum:items.amount-cashAdvance`.

### Settings and users

**Settings** (superadmin only) holds:

- the LGU name, address and seal;
- the **signatories**: Mayor, Accountant, Budget Officer, Treasurer and Secretary to the Sanggunian. These are printed where the official forms pre-print a name. Each document keeps the signatories that were set when it was prepared.

![Settings](images/22-admin-settings.png)

**Users** is where you approve new accounts. Only the superadmin can make someone an administrator.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `java` is not recognized / "Java 21 or newer" | Install Temurin 21 from <https://adoptium.net>, then reopen the terminal |
| `Port 8080 is not open` or `port taken` | Another program is using that port. Close it, or change the ports in `firebase.json` (`emulators.firestore.port` / `emulators.auth.port`), `src/firebase.js` and `scripts/seed-local.mjs` |
| The page says "Firebase is not connected yet" | You ran `npm run dev` instead of `npm run local`. Use `npm run local` for the local copy |
| Want to use your real Firebase project locally | Paste your project's config into `src/firebase-config.js` and run `npm run dev` |
| Want fresh demo data | `npm run local:reset`, then `npm run local` |
| Local data isn't kept between runs ("Automatic export failed") | Stop with a single Ctrl + C and wait for "Export complete". On a network that forces a proxy (`HTTPS_PROXY` set), the save can fail. Clear that variable in the terminal before running `npm run local` |
