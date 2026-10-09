# Cost centres, departments and employees; other companies' books by view-only import (DRAFT v3: direction decided, nothing built yet)

Direction (changed from v2): **one set of books, one website.** A branch is a cost centre inside it, and a branch can have **several** cost centres (Stock, Payroll, Utilities...). A company in another country has its own website and its own books; we do **not** build multi-company books. Instead, later, we can **load another company's books into a read-only view** from an encrypted file (`.wnkjap`).

## Decisions so far

| # | Decision |
|---|---|
| 1 | Build cost centres inside the one company now. **No multi-entity books** (decided later; the legal-entity groundwork that was briefly built was removed). |
| 2 | Every location automatically gets a branch cost centre. Departments are a **table**, not free text. A department belongs to **one location**, so the same department (Sales) can exist at several branches as separate rows, one per branch: Sales at A, Sales at B. A quick action adds a department to several branches at once, and a ready list of standard names can be added to a branch in one click. **Each department has its own cost centre**, nested under that branch. |
| 3 | An employee is created with a **location and a department** (the department list is filtered by the chosen location). |
| 4 | No "no cost centre" bucket. A **configuration page** sets defaults, so every entry always has a cost centre and no screen can fail for lack of one. |
| 5 | A Head office location and cost centre exist for shared costs. |
| 6 | Shared costs are shared by report-time rules; nothing is posted. |
| 7 | An employee can belong to **several cost centres** (their department's, plus for example a project for some dates, with a share). Payroll splits their cost by those shares. |
| 8 | **One set of books, one base currency, one chart, one tax setup, one period lock and numbering.** No company switcher, no `X-Entity`, no entity columns. |
| 9 | Location kinds gain Office and Depot (labels only). |
| 10 | **Cost centres nest to any depth.** A branch has a big cost centre ("Branch A") that covers smaller ones: Utilities, Stock, Payroll, Projects, and its departments' cost centres (Sales, Procurement...). "Utility cost centre for Branch A" is its own row under Branch A, and reports roll everything up into Branch A. Each cost centre has a free-text **purpose** tag (data, not code) used only to pick defaults, such as which cost centre payroll lines or stock adjustments land in. |
| 11 | One storefront and one set of books. A company in another country has its own website and its own books. |
| 12 | **Later, after cost centres:** a **view-only import** of another company's books (chart of accounts, vouchers, **customers, suppliers and stock**) from an encrypted, password-protected file with extension **`.wnkjap`**, plus **our own API, protected by a password, for the sites we build** (they can produce and read the same format). Imported books live in their own read-only tables and screens and are **never mixed** with ours: no totals, no posting, no reports that add them up. |
| 13 | Customers: one identity. Exchange rates: one table. Standard department names: a ready list that can be added to a branch in one click. |
| 14 | Reports sort and filter per branch using the voucher's location (the voucher already carries it). |
| 15 | **Identity and access comes first** (`docs/IDENTITY_AND_ACCESS_PLAN.md`): roles as data, several roles per person, default branch plus time-limited grants, admin and super admin never bound, a new Senior accountant role. |

## What the code is today (checked)

- One company is built in: `CompanyProfile::current()` (9 uses), accounting settings (`AccountingSetting`, about 33 uses), the base currency (about 66 uses), one lock date and set of financial years, one chart, one tax PIN. All of this stays as it is.
- About 423 uses of `Voucher::`/`Ledger::` and similar models and 85 raw queries on vouchers, entries and ledgers, in about 100 files. Only the dimension columns (location, cost centre) are added to entries; no query needs a company.
- Vouchers have a `location_id`; entries have no dimension. Reports are company-wide (only the day book and dashboard filter by location).
- Employees: `department` and `work_location` are **free text** on `employees`; `users.department` repeats it; job postings and inventory assignments use department text too. No real branch link, no employee-to-cost-centre link.
- Locations: kind and four capabilities exist (script 97).
- Stock cost travels with the batch on a transfer, so branch gross profit is already honest.
- `backend/app/Models/us.php` looks like a stray copy of `UserController` sitting in the Models folder (not loaded by anything). To be checked and deleted.

## The model

```
Company (one set of books)
  Location                     where it happened         (kind + capabilities)
    Cost centre (branch)       auto-created per location, the location's default
    Department                 per location: Sales at Nairobi, Sales at Mombasa
      Cost centre (department) auto-created, nested under the branch's
  Cost centres (projects, other)   free-standing, optionally under any parent
Employee                       location + department (+ extra cost centres with shares and dates)
```

Entries and vouchers carry: location and cost centre. Resolution of a line's cost centre, first that exists: the line itself, the voucher, the configured default for that kind of document, the location's default cost centre, the "General" cost centre. So it is never empty.

## Employees and departments

- `departments`: id, location_id, name, code, cost_centre_id, manager (employee), is_active. Unique per (location, name). A quick action "add this department to several locations" creates the repeats.
- `employees`: add `location_id`, `department_id`. The old free-text `department` and `work_location` stay for a while and are filled from the new fields, then retired. `users.department` follows the employee. Existing text is matched into departments by a script (reviewed by you before it is applied).
- `employee_cost_centres`: employee_id, cost_centre_id, share_percent, kind (home, project, other), valid_from, valid_to. The **home** row comes from the department and is 100% by default. A project assignment takes a share (for example 60% Procurement, 40% Project X) for dates. Shares in force on a payroll period must total 100%.
- Payroll journal lines carry the cost centre, split by the shares in force. Statutory deductions follow the same split.
- Employee form: choose location, then department (filtered), then optional extra cost centres with share and dates.
- Careers (job postings) and inventory assignments: point at the department table where it makes sense, later.

## Configuration page (defaults)

Settings, "Cost centres": the General cost centre; defaults per kind of document (sales, purchases, expenses and payments, payroll, stock adjustments) falling back to the location's; the Head office cost centre; whether a line may be changed per entry. Every default has a value from day one (created by the script), so the database column is NOT NULL and no screen fails.

## Several cost centres per branch

- `cost_centres`: id, name, code, `parent_id` (nested), `location_id` (null for Head office, General and free-standing ones), `purpose` (free text such as stock, payroll, utilities, sales, general, project), is_branch_default, is_active.
- Every location gets one automatic cost centre (its default). The owner adds more under it: *Nairobi / Stock*, *Nairobi / Payroll*, *Nairobi / Utilities*. Reports roll the children up into the branch.
- The configuration page can say "payroll lines go to the cost centre whose purpose is payroll at the employee's location", falling back to the branch default. Nothing is hard-coded to the words: the purpose is a label the owner chooses.

## Other companies' books: view-only import (later)

- A **`.wnkjap` file** is an encrypted, password-protected exchange file holding a company's chart of accounts, vouchers (and the entries behind them), **customers, suppliers and stock**. Format: a small header (version, company name, base currency, period, checksum) and an encrypted payload; the password is asked at upload and never stored.
- **Our own API** (same format, password-protected) lets sites we build send or fetch an export without a person handling a file.
- **Where it lands:** separate tables (`imported_books`, `imported_ledgers`, `imported_vouchers`, `imported_entries`, `imported_customers`, `imported_suppliers`, `imported_stock`), one set per import, labelled with the company and date. Screens: *Other companies* shows the imported chart, voucher list, customers, suppliers and stock, read-only. No posting, no edits, no reconciliation with our books, no combined totals.
- Each import can be replaced by a newer one or deleted; the original file is kept encrypted.
- Permission: one new permission to import and one to view.

## Build order (each step is a database script plus the matching code, in this order)

0. **Identity and access** (R1 and R2 of `docs/IDENTITY_AND_ACCESS_PLAN.md`) before everything below. Branch scope enforcement (R3) and the employee link (R4) follow when employees and cost centres exist.


The order follows what depends on what: location, then cost centre, then department, then employee, then posting and reports.

1. **Cost centres (BUILT, script 100, catalogue version 5).** `cost_centres` (nested, several per branch, with `purpose`), one automatic per location plus Head office plus General, `locations.cost_centre_id`, location kinds Office and Depot, and the configuration page with its defaults.
   As built: `database/sql/100_cost_centres.sql` creates `cost_centres` (nested, `type`, free-text `purpose`), `cost_centre_settings` (the defaults, every one filled with General on day one, plus `line_override`) and `locations.cost_centre_id`, and makes General, Head office and one cost centre per location. New locations get theirs automatically and a rename follows (an observer). Location kinds gain Office and Depot. `CostCentreService::resolve(kind, location)` returns the default for the kind, else the location's, else General, never null. Settings, Cost centres shows the tree (add under any, edit, switch off, delete when unused and not a default) and the defaults. Permissions `costcentres.view` (manager, finance, senior accountant, admin) and `costcentres.manage` (finance, senior accountant, admin). Head office is a cost centre only, not a location: add an Office-kind location yourself if you want one. Nothing in the books carries a cost centre until step 3.
2. **Departments and employees (BUILT, script 101).** `departments` (per location, each with its own cost centre), employee location and department fields, `employee_cost_centres`, the employee form and list, the matching script for existing text.
   As built: `database/sql/101_departments.sql` creates `departments` (one row per branch and name, each with its own cost centre `DEP-<id>` under the branch's), `standard_departments` (seeded names), `employee_cost_centres` (home row 100% plus optional dated shares, payroll only) and `employees.location_id/department_id`; existing text is matched to branches and departments (review query A3 first). `DepartmentService` keeps the old text columns in step. Settings, Departments page (add to several branches, standard names) and Branch/Department selects plus cost centre shares on the employee form.
3. **Dimensions on the books (BUILT, script 102).** Location and cost centre columns on entries (vouchers already carry the location), backfilled from the voucher's location in batches, then NOT NULL. Posting copies them. Payment, bill and journal forms get a cost centre per line, defaulted.
   As built: `database/sql/102_books_dimensions.sql` adds `vouchers.cost_centre_id`, `voucher_entries.cost_centre_id` and `voucher_entries.location_id` (indexed; nullable in the database as a safety net, the app never leaves them empty) and backfills existing vouchers with their branch's cost centre (else General) and entries from their voucher, in batches of 20 000. A `VoucherDimensionsObserver` fills every new voucher (chosen, else the default for its kind, else the branch's, else General) and every entry (the voucher's, or its own when `line_override` is on and it was given), so every posting path is covered. A default left on General now means "none chosen" and yields to the branch's own cost centre. The voucher form has a Cost centre picker (Automatic by default) and, for journals with `line_override` on, one per line; `GET /admin/cost-centres/options` feeds it for anyone who can view or post books. Nothing is written until the script has run.
4. **Reports (BUILT, no new script).** Profit and loss, trial balance, day book, ledger statement and dashboard get the cost centre and location filters and a by-cost-centre view with roll-up; branch stock value; report-time allocation of shared costs.
   As built: Day book, Ledger statement, Trial balance and Profit & loss take `cost_centre_id` (the cost centre and everything beneath it) and `location_id` (an entry's branch) via `BooksReportService::withDimensions()`; a filtered report counts only matching entries and leaves out ledger opening balances (they belong to the company), and says so. New report *Profit & loss by cost centre*: each cost centre's own income and expenses and its total with everything beneath it (a branch line covers its utilities, stock, payroll, departments), whole-business totals, exportable. The reports screen has Branch and Cost centre pickers. Not done: balance sheet (assets and liabilities are not split by cost centre), the dashboard cost-centre filter (it keeps its branch filter), branch stock value and report-time allocation of shared costs.
5. **Payroll** split by employee cost centre shares.
6. **Staff access** by location and cost centre (limits like the branch limits already built).
7. **Preorders** resume (they need steps 1 to 4).
8. **View-only import** of other companies' books (`.wnkjap`) and the password-protected API for our own sites.

Dropped from v2: legal entities, per-entity chart, base currency, period lock, numbering and bank accounts, the company switcher and `X-Entity` header, refusing cross-entity transfers.

## Open questions

1. Payroll: a person's pay is split between cost centres by shares (for example 60% Procurement, 40% Project X). Should *everything else* they cause (an expense they claim, a purchase they enter) also follow those shares, or take only the cost centre chosen on that entry? Suggested: only the one chosen on the entry; the shares are for payroll.
