# Books reports: rebuild plan

Status: **plan only, no code written.** Agreed with the owner, 28 Oct 2026. Companion document: `docs/BOOKS_REPORTS_AUDIT.md` (findings on the existing reports, each referred to here by its number, e.g. *audit E1*).

---

## 1. Principles

1. **One new report engine.** Every report, rebuilt or existing, moves onto it. No fix is applied to the old report code; every audit finding is solved inside the engine.
2. **Nothing found by a hardcoded name.** Groups, ledgers and statement lines are found by id or by a stable code. Anything a report needs to know about the chart (ratio inputs, money accounts, reconcilable groups) is a setting.
3. **One rule each** for dates, currency, branches and cost centres, applied the same way in every report.
4. **Old and new run side by side** until the new figures match the old to the cent (or the difference is an audit finding, explained). Only then does the screen switch over and the old code retire.
5. **Core and Extras.** Books and every report stay in Core. Only the visual reports page is Extras.
6. **Every change to the database** goes through a numbered SQL script in the repo style (PART A read-only check, PART B change, PART C result check).
7. **One definition, two doors.** The stock journal and stock reports (today standalone, on the Purchases page) move onto the engine **line by line**: same queries, same figures, same labels. They are then offered in two places from the same definition: the Purchases page tabs, and the Reports page.

---

## 2. Decisions log

| # | Decision |
|---|---|
| 1 | A `statements` table (tree), with a `statement_id` column on `ledger_groups` and on `ledgers`. |
| 2 | A new ledger copies its group's statement line when created; the creation form can change it. A new subgroup copies its parent's. |
| 3 | Ledgers with no statement line (raw SQL inserts) fall back to their group's in reports, and are listed by the health panel. |
| 4 | Changing a statement line is its own permission, `books.statements`, assigned by default to super admin and senior accountant, grantable to any role. |
| 5 | "Closing balance" = each ledger's balance at the end of a financial year, stored when the year is closed. |
| 6 | Nothing is hardcoded to bank, M-Pesa or cash. The Reports settings list the reconcilable ledger groups; every ledger in them is reconcilable unless switched off. Any group can be added (even Sundry Debtors). |
| 7 | Initial reconcilable groups: Cash-in-hand and Bank Accounts. |
| 8 | Reconciliation matches on the identifiers each transaction carries: voucher number, reference number, cheque number and dates, transfer reference, M-Pesa code. |
| 9 | Reconciliations and the year-end close need a second approver by default. Whether they do is a setting, changeable only with `books.reports.approval` (default: super admin alone, grantable). |
| 10 | The suspense account is chosen on Books Settings → Default ledgers. Any balance on it is flagged. |
| 11 | Charts live only in Extras. Core report pages stay tables, with a "View visually" button. |
| 12 | Day book: a general view (each voucher once, expandable cost-centre split) and a cost-centre view (each allocation). Totals never count a voucher once per cost centre. |
| 13 | Ageing: unapplied credits (credit and debit notes with no invoice, on-account receipts and payments) are a separate section, not unpaid bills, with a net line comparable to the ledger balance. |
| 14 | Ratio analysis inputs (current assets, cash, bank, overdraft, debtors, creditors, stock, capital, loans, sales, purchases) are set in Reports settings, not hardcoded. |
| 15 | No quick fixes to the old reports. All audit findings are delivered by the new engine. |
| 16 | Deferred until all Books work is done: the `.wnkjap` export and import, and the backup engine. |
| 17 | **Stock journal and stock reports** (Stock summary, Location summary, Stock query, the monthly and movement drill-downs, and the dashboard's Stock tab data) are ported to the engine line by line, kept as tabs on the Purchases page, and also listed in the Reports page. They keep their own permission (`stock.view`) and branch scope (`stock`) wherever they appear. |
| 18 | **Stock movement** is renamed "Trade by party and item". Real stock in and out is covered by the stock journal and stock reports. |
| 19 | **Money flow:** transfers between our own accounts are left out of money in and out totals unless a "Show transfers" checkbox is ticked. The stock reports already do the same for stock transfers (hidden company-wide, shown when a branch is chosen); the checkbox makes the rule the same everywhere. |
| 20 | **Withholding "awaiting certificate"** counts all outstanding certificates, with the period's shown separately. |
| 21 | **Credit-note direction in ageing** is settled by a test case before any code is written (Step 6.3). |

---

## 3. Data model

### 3.1 `statements`

Self-referencing tree. Ledgers and groups attach to its `line` rows; reports roll up through it.

| Column | Purpose |
|---|---|
| `id`, `parent_id` | The tree. Roots: Balance Sheet, Income Statement. |
| `code` (unique) | Stable key used by reports and settings, e.g. `BS.CA.CASH`, `IS.COGS`. |
| `name` | Label on the report; editable. |
| `kind` | `heading` (groups rows, takes no ledgers) or `line` (ledgers post to it). |
| `nature` | The one nature a line accepts: asset, liability, income, expense. Equity lines use `liability`. |
| `normal_side` | Dr or Cr, for sign display. |
| `cash_flow_category` | Operating, investing, financing, or cash (added in Step 8). |
| `sort_order`, `is_system`, `is_active` | System rows can be renamed, not deleted. |

**Default tree** (three levels at most; editable in Reports settings):

- **Balance sheet**
  - Assets
    - Non-current: property and equipment; investments; other non-current assets
    - Current: inventory; trade receivables; cash and bank; other current assets
  - Equity: owner or share capital; reserves and retained earnings
  - Liabilities
    - Non-current: long-term loans
    - Current: trade payables; short-term borrowings; taxes payable; provisions and other; other current liabilities; suspense (to be cleared)
- **Income statement:** revenue; cost of sales; other income; operating expenses; finance income; finance costs; income tax

Gross profit, operating profit and net profit are computed by the engine from section codes, not stored.

### 3.2 New columns

- `ledger_groups.statement_id`: nullable FK → `statements.id`, indexed, `ON DELETE RESTRICT`.
- `ledgers.statement_id`: same.
- Rules: copy on create (decision 2), fallback to the group (decision 3), a line must accept the nature of the ledger's group (refused on save otherwise). When a group's line changes, the screen offers to move the group's ledgers that still match the old line; ledgers with their own choice stay.
- `ledger_groups.affects_gross_profit` stays until Step 12, then retires.

### 3.3 Mapping from the live chart (37 groups, 189 ledgers, checked 28 Oct)

| Live group (id) | Statement line |
|---|---|
| Capital Account (1) | Owner or share capital |
| Reserves & Surplus (16) | Reserves and retained earnings |
| Loans (Liability) (2), Secured Loans (18), Unsecured Loans (19) | Long-term loans (override per ledger for any part due within a year) |
| Bank OD Accounts (17) | Short-term borrowings |
| Current Liabilities (3) | Other current liabilities |
| Duties & Taxes (20), Value Added Tax (32), Withholding tax (36) | Taxes payable |
| Provisions (21) | Provisions and other |
| Sundry Creditors (22) | Trade payables |
| Auction Deposits (38), Service Deposits & Pass-through (41), Statutory Payroll Liabilities (42) | Other current liabilities |
| Suspense A/c (8) | Suspense (to be cleared) |
| Fixed Assets (4) | Property and equipment |
| Investments (5) | Investments |
| Misc. Expenses (Asset) (7) | Other non-current assets |
| Current Assets (6), Deposits (Asset) (25), Loans & Advances (Asset) (26) | Other current assets |
| Bank Accounts (23), Cash-in-hand (24) | Cash and bank |
| Stock-in-hand (27) | Inventory |
| Sundry Debtors (28) | Trade receivables |
| Sales Accounts (9), Service Income (39), Service Fees (40), Direct Incomes (11), Shipping & Delivery (31) | Revenue (keeps today's gross profit exactly) |
| Purchase Accounts (10), Direct Expenses (12) | Cost of sales |
| Indirect Incomes (13), Auction Charges (37) | Other income |
| Indirect Expenses (14), Employee Benefits / Payroll Expenses (43) | Operating expenses |

Ledger overrides set at the start: Bank Charges (208) and Exchange Loss (160) → Finance costs; Interest Income (163) and Exchange Gain (159) → Finance income.

Facts from the live ledgers the build must respect:

- Ledgers sit directly in primary groups (e.g. Gift Vouchers Liability in Current Liabilities); they take the group's line.
- Contra ledgers (Sales Returns, Service Returns, Purchase Returns) show as reductions inside their line.
- Near-duplicates exist (Discounts Allowed / Discount Allowed, Rounding Off / Rounding); same line, flagged by the health panel.
- Only two ledgers carry opening balances (Main Bank Account 50,000 Dr, Payroll acc 4,000,000 Dr) with nothing opposite: a 4,050,000 opening difference today.
- M-Pesa sits under Bank Accounts with no `mobile_kind`; Cash and Driver Cash have no `cash_kind`. Ledger fields cannot be trusted alone to tell bank, M-Pesa and cash apart.

### 3.4 Other new tables (designed in their step)

| Table | Step | Holds |
|---|---|---|
| `report_settings` | 3 | Every Reports setting (one row per key, typed value, who changed it and when) |
| `ledger_year_balances` | 7 | Per ledger and financial year: closing Dr/Cr in base currency and the statement line at that moment |
| `year_closes` | 7 | Each close: prepared by, approved by, checklist results, reopen history |
| `recon_*` (sessions, imports, lines, matches) | 9 | Reconciliation sessions, imported statement lines, matches, sign-off |

---

## 4. The report engine

The engine is a set of backend services plus one screen frame. Every report is a definition on top of it.

### 4.1 One balance and movement service

Replaces `LedgerService::balance()` and the private `movement()` copies in `BooksReportService` and `ComplianceReportService`.

- **Dated:** every figure takes an as-of or from–to; nothing silently means "today" (*audit E1, E2, E3*).
- **Branch-aware:** applies the person's branch limit the same way everywhere, so comparisons never mix limited and unlimited figures (*audit A2*).
- **Dimensions on entry lines:** cost centre and branch filters always use `voucher_entries` (*audit A1*). The header's cost centre is a default, not a filter.
- **One currency rule:** `RestatedBase` everywhere, including stock movement and money flow (*audit H3, M2*).
- **Starts from stored closing balances** once a year is closed, so it never scans all history (*audit A5, C1*).

### 4.2 One screen frame

- **Filter bar:** period or as-of, comparison (previous period or year), branch, cost centre, and a **Run** button. Nothing re-runs on each keystroke (*audit S2, S3*).
- **Default period** is the current financial year from `financial_years`, never 1 January (*audit A4, S1*).
- **Banners** come from the engine's result, so every report shows "limited to your branches", "filtered" and "restated" when they apply (*audit A3, H6*).
- **Drill-down everywhere:** statement line → group → ledger → voucher; ageing party → bills → voucher (*audit D5, S5*).
- **Identifiers** shown wherever a transaction appears: voucher number, reference, cheque number and dates, M-Pesa code, narration, and the other side of the entry (*audit A7, B4, C3, C4, F3*).
- **Amounts** shown as "1,000.00 Dr / Cr" with the number format from settings (*audit C5*); foreign amounts always carry their currency code, totals always in base (*audit F4*).
- **Pickers** for ledgers and items are searchable (*audit C6*).
- **Paging** for long lists (*audit A5*).
- **Empty state** wording fits the report (*audit S4*).
- **Export and print** for every report, including detail rows (*audit D6, H6*).

### 4.3 Chart lookups

- Groups and ledgers are found by id or statement code, never by name (*audit A6, G1, G2, M1*).
- Where a report needs a set of accounts (ratio inputs, money accounts, reconcilable groups), it reads the setting from Step 3.

---

## 5. Reports catalogue

### 5.1 Rebuilt

| Report | Built as |
|---|---|
| Trial balance | Ledger view and group view; opening, debit, credit, closing; adjusted trial balance; clear "Difference in opening balances" |
| Profit & loss | Sections from the statements tree; gross, operating and net profit; margins; month-by-month columns; by cost centre kept |
| Balance sheet | Assets, Liabilities, Equity; current and non-current; retained earnings split into prior years and this year |
| Changes in equity (new) | Opening equity + profit − drawings and distributions = closing equity |
| Cash flow (new) | Indirect method from `cash_flow_category`; plus a direct-method cash book from money flow |
| Reconciliation | The hub in section 6 |

### 5.2 Moved onto the engine (behaviour kept, findings solved)

| Report | What changes |
|---|---|
| Day book | General and cost-centre views (decision 12); narration and identifiers; paging |
| Ledger statement | Particulars and narration columns; Dr/Cr balances; identifiers; starts from stored closing balances; searchable picker |
| Receivables and payables ageing | Buckets from settings (*audit D1*); bill-date or due-date toggle (*D4*); unapplied credits section (decision 13); bills listed and clickable; credit-note direction fixed after a test case (*D2, H4*) |
| Tax return | Dated, branch-aware closing figure and brought forward (*E1–E4*); supplies split on screen (*E5*); correct labels (*E6*) |
| Withholding certificates | Base amounts with currency shown (*F4*); "awaiting" scope as decided (*F2*); identifiers |
| Ratio analysis | Inputs from settings (decision 14); equity includes retained earnings once closing exists (*G4*); reuses the engine's figures instead of recomputing (*G5*) |
| Stock movement | Renamed or widened (decision needed, Step 0); restated currency; export; banner |
| Money flow (Cash page) | Money accounts from settings; transfers left out of the totals unless "Show transfers" is ticked (decision 19, *M3*); split tenders attributed (*M4*) |

### 5.3 Stock journal and stock reports (ported line by line)

Source today: `StockJournalController`, `StockReportService`, `StockReportController`, screens `StockJournal.jsx` and `StockReports.jsx`, API `stockOps.js`, routes under `/admin/stock/`.

| Report | Behaviour that must be kept exactly |
|---|---|
| Stock journal | Every movement newest first; filters for item search (item, SKU, batch), kind of movement, kind of item, branch and dates; 50 per page; value = quantity × unit cost; the labels for each movement kind |
| Stock summary | Opening, inward, outward and closing, quantity and value, grouped by item group; opening stock counted as opening whatever its date; stock transfers hidden company-wide and shown for a chosen branch; "negative" and "no cost" flags; one quantity per group only when all items share a unit |
| Location summary | The same report for one branch |
| Stock query | One item's card: closing, cost price and costing method, last purchase and sale, recent purchases and sales, where it sits (batches, expiry), other items in its group |
| Monthly and movements drill-downs | An item month by month, then the vouchers behind a month |
| Dashboard Stock tab data | `dashboard()`: value, trend, groups, top items, kinds of movement, items needing attention |

How the port is done:

- The queries, the SQL and the response shapes move over unchanged. What changes is where they live (engine definitions) and what the engine adds around them (filter bar, banners, export, financial-year default).
- **Parity check:** the same inputs through the old and the new code must give identical responses, field for field, before the old code is removed.
- **Two doors, one definition:** the Purchases page keeps its tabs (Stock reports, Stock journal) and the Reports page lists the same reports under a "Stock" group. Both open the same engine definition. Permission stays `stock.view`, so a person who sees one door sees the other.
- The two movement-label lists (one in the journal, one in the report service) become one shared list (*audit L2*).

The Reports page is grouped: Financial statements; Books (day book, ledger statement, ageing); Tax and compliance; Cash and reconciliation; Stock (summary, location summary, query, journal, trade by party and item).

---

## 6. Reconciliation hub

One engine: a **source** (imported statement or register) against the **books**, with statuses, match tolerance, sign-off and lock. Each source type is an adapter.

- **What is reconcilable** is configuration (decisions 6, 7). Any ledger nature works: direction and sign are worked out from the ledger's nature.
- **Adapter per ledger**, decided in this order: the kind set in Reports settings; else the kind of the payment method posting to it (`payment_methods.kind`); else the ledger's own fields (`bank_name`, `mobile_kind`, `cash_kind`); else bank for a bank-behaviour group. The settings screen shows the guess; setup is not complete until each is confirmed.
- **Adapters:** bank statement import (column mapping per bank); M-Pesa portal statement import; cash count (`CashCountService`, petty cash floats); counter-party statement import (debtors, creditors, lenders), matched on bill references and invoice numbers; manual matching for anything else.
- **Matching** on the identifiers in decision 8, which already exist: `vouchers.voucher_number`, `reference_no`, `supplier_invoice_no`; `voucher_instruments` (cheque number, instrument date, bank, deposited-on, cleared-on, status, transfer reference); `voucher_tenders.reference` and `payment_attempts.receipt_number` (M-Pesa).
- **Bank proof:** statement balance + deposits in transit − outstanding cheques = book balance. Bank charges and interest found on the statement are posted as journals from the screen.
- **M-Pesa flags:** paid but not booked, booked but not paid, duplicates, reversals, fees, settlement to the bank.
- **Control-account checks** (gift vouchers, loyalty points, withholding, stock, receivables, payables, trial balance) move onto the engine, with drill-down to unmatched items.
- **Approval:** preparer and approver are different people when the rule is on (decision 9).
- **History:** script 78 dropped an earlier reconciliation-sessions feature; read why before designing the `recon_*` tables.

---

## 7. Year-end close and closing balances

- **Non-posting, like Tally:** balance-sheet ledgers carry forward as next year's opening; income and expense ledgers reset; profit moves to retained earnings.
- **Stored per ledger** in `ledger_year_balances`, with the statement line at that moment, so later reclassification never silently changes a closed year (a deliberate re-map is labelled "reclassified").
- **Checklist before closing:** opening difference is zero (today it is 4,050,000); depreciation run; accruals; stock valuation; no draft vouchers; reconciliations signed off; suspense cleared or explained.
- **Prepare → approve → lock** via `PeriodGuard`. Reopening needs `books.period`, a reason and an audit entry.
- **Frozen report packs:** a closed year's statements can be saved "as at close" with prepared-by and reviewed-by names.

---

## 8. Books health panel

Pass/fail checks, each drilling down: trial balance and balance sheet balanced; opening difference; draft vouchers in the period; entries back-dated into a closed period; negative cash, bank or stock; ledgers with no statement line; balance on the suspense account; near-duplicate ledgers; restated vouchers; unreconciled items; reconcilable ledgers whose kind is not confirmed.

---

## 9. Books Settings → Reports tab

| Section | Settings | Permission |
|---|---|---|
| Display | Decimals, units (thousands), zero balances, negative format, default comparison, default group depth, header, footer, signatories | `books.reports.format` |
| Ageing | Bucket boundaries | `books.reports.format` |
| Statements | The statements tree editor | `books.statements` |
| Ratio inputs | For each ratio input, the statement lines or groups (by id) it adds up. Defaults come from the statements tree (current assets = the Current assets heading, and so on) | `books.reports.format` |
| Money accounts | The groups whose ledgers count as cash and bank for money flow and the cash flow statement | `books.reports.reconcile_setup` |
| Reconciliation | Reconcilable groups; switch off single ledgers; confirm each ledger's kind; M-Pesa paybill or till; match tolerance and date window | `books.reports.reconcile_setup` |
| Approvals | Second-approver rule for reconciliation and for the year-end close | `books.reports.approval` |

Seeing the tab needs `books.reports.settings`. The suspense ledger stays on the Default ledgers tab.

---

## 10. Permissions

How the catalogue works (`Catalog.php`): each permission has a module, group, description and a sensitive flag. `OWNER_ONLY` lists what the owner (super admin) holds by default and the admin role does not; custom roles can still be granted them.

| Permission | Meaning | Default holders |
|---|---|---|
| `books.statements` | Change a ledger's or group's statement line; edit the tree | Super admin, senior accountant |
| `books.reports.settings` | See the Reports settings tab | Super admin, admin, senior accountant |
| `books.reports.format` | Display, ageing and ratio-input settings | Super admin, senior accountant |
| `books.reports.reconcile_setup` | Money accounts and reconciliation setup | Super admin (owner-only) |
| `books.reports.approval` | Change the second-approver rule | Super admin (owner-only) |
| `books.reconcile` | Prepare a reconciliation | Senior accountant and above |
| `books.reconcile.approve` | Approve someone else's reconciliation | Senior accountant and above, never the preparer |
| `books.close.prepare` | Prepare the year-end close | Senior accountant |
| `books.period` (exists) | Approve the close; reopen a closed year | Super admin (owner-only) |

Kept as they are: `books.view`, `books.post`, `books.review`.

---

## 11. Extras visuals

- An Extras "Visual reports" page reading the engine's endpoints; the licence check is enforced on the server as well as in the page.
- **Page states:**
  - Not licensed: invitation to license Extras, with a sneak peek built from **sample data** (never real data).
  - Licensed but off: a cheeky message, with a button to Module Center for holders of `system.modules` and "ask an admin" for everyone else.
  - Active: the real charts.
- The module store only knows the *active* list today; it needs to tell "not licensed" from "licensed but off".
- Charts: cumulative cash line; daily money in and out; per-account bars; expense donut and group-hierarchy treemap; top customers; sales against purchases (cash and credit); composition treemap; outstanding build-up; ageing bars and bubble chart; activity calendar heatmap; profit waterfall; assets against liabilities and equity; monthly profit trend; reconciliation status.
- Built with `recharts` (installed); heatmap and waterfall are small custom components.

---

## 12. Steps to follow

Each step lists what is built, how it is checked, and when it is done. A step starts only when the one before is done, except where noted.

### Step 0. Open decisions: closed

All four were answered by the owner on 28 Oct and are in the decisions log (18 to 21). Nothing remains open before Step 1.

### Step 1. Statements schema: script `227_statements.sql`

**Status: drafted** as `backend/database/sql/227_statements.sql`, awaiting the owner's review. It has **not** been run on the real database. It was tested on a MariaDB copy built from the 37 live groups and 189 live ledgers: 32 statement rows (9 headings, 23 lines); every group and ledger mapped; no nature mismatches; a second run changes nothing; a line set by hand is kept; an unknown group is listed, not guessed; the optional foreign keys work and block deleting a line in use.

- Create `statements` and seed the default tree (3.1).
- Add `statement_id` to `ledger_groups` and `ledgers` (3.2).
- Fill groups from the mapping (3.3) by id; set the four ledger overrides; copy each group's line onto its ledgers.
- PART A lists the live groups and ledgers; PART C lists anything unmapped (expected: none) and counts per line.
- **Check:** run on a copy of the database; PART C shows every ledger mapped; re-running changes nothing.
- **Done when** the owner has reviewed the script and its result on the copy.

### Step 2. Permissions

**Status: built** in `Catalog.php` (version 20), with the default-holders snapshot test and a new test for these eight updated. Note for the owner: `books.close.prepare` is held by the senior accountant and the owner, not by admin (the plan's table said "senior accountant"); admin can be granted it from the role builder.

- Add the permissions in section 10 to `Catalog.php`, with default holders; owner-only ones into `OWNER_ONLY`.
- **Check:** each default role holds exactly what the table says; a custom role can be granted each one.
- **Done when** the Access screens show them correctly.

### Step 3. Reports settings

**Status: built, waiting for the owner to run script 228 and try it.**

- `backend/database/sql/228_report_settings.sql`: `report_settings` and `report_settings_log`, with starting values for the three settings that name groups (money accounts, reconcilable groups, ratio inputs), looked up by name once and stored as ids. Tested on MariaDB with mismatched collations, with a chart missing two groups, and run twice.
- Backend: `ReportSettingDefinitions` (every setting, its section, permission, default and validation, no database), `ReportSettings` (read with defaults, save a section with the ids checked, change log), `ReportSettingsController` and `StatementController` (the statements tree: view, add, rename, hide, delete), routes under `admin/books`.
- Frontend: a **Reports** sub-tab under Books → Configuration for people holding `books.reports.settings`, with every section behind its own permission, the reconcilable-accounts table (switch off, confirm the kind), the ratio inputs, the statements editor and the change log.
- Every change is logged with the old value (the default if never saved), the new value, who and when, including the approval rules.
- Not yet used by any report: the settings are stored and editable; the reports start reading them in Steps 4 to 6.
- How it was checked: unit tests for the definitions (15) plus the two access tests, run with a small stand-in for PHPUnit (PHPUnit could not be installed here); the settings screen driven in a real browser against the live group list with the API mocked (28 checks); lint and a production build. The Laravel parts (the service, the controllers, the routes and the permissions) were first run in step 4, when the PHP packages could be installed: `ReportSettingsTest` covers them.

- `report_settings` table and service; the Reports tab (section 9) with each section behind its permission.
- Ratio inputs default from the statements tree; money accounts and reconcilable groups default to Bank Accounts and Cash-in-hand (by id).
- Every change is logged (who, what, when), including turning the approval rule off.
- **Check:** each section is hidden or read-only without its permission; defaults appear on a fresh install.
- **Done when** every setting the later steps need can be saved and read.

### Step 4. Engine core

**Status: built, waiting for the owner to try it.**

- **Backend** (`app/Services/Books/Engine/`): `ReportPeriod` (opens on the financial year; previous period and same period last year), `Scope` (dates, cost centre, branch, always on the entry lines), `LedgerBalances` (the one dated, branch-aware, restated balance and movement service, with the trial balance rows and the opening balances), `Identifiers` (voucher number, references, cheque number and dates, transfer reference, M-Pesa code and receipts), `ReportDefinition` and `ReportEngine` (runs any definition and wraps it with the dates actually used, banners, display settings and the comparison run), and the first definition, `TrialBalanceReport`. Routes under `admin/reports`: each report names its own permission and the engine checks it. The old reports are untouched.
- **Statement line on the forms:** `StatementLines` service (a new ledger follows its group, a new subgroup its parent; another line needs `books.statements`; the line must be a line, active, and accept the group's nature; moving a ledger to another group moves it to that group's line when it followed the old one; changing a group's line can move the ledgers and subgroups still on the old line). Copy-on-create hooks on `Ledger` and `LedgerGroup` cover every code path. The chart-of-accounts forms have the field; the ledger table has a "Statement line" column; the selected group has a "Reports under" control.
- **Frontend:** `ReportFrame` (filters, a Run button that is the only thing that re-runs a report, a note when the figures are not for the dates shown, banners, header and footer text, export through the engine), `engineFmt` (decimals, units, negative style, Dr/Cr), `TrialBalanceView`. "Trial balance (new)" appears beside the old report for people who may open the Reports settings; step 5 replaces the old one.
- **Not built yet, on purpose:** the paging control and the searchable ledger and item pickers (the first reports that need them are in step 6, and they are built with the report that uses them); a separate Print button (export to PDF covers it); statement line to group to ledger drill-down (it arrives with the statements in step 5; for now a ledger row opens its statement).
- **Also in this step:** the three tables from scripts 227 and 228 are now claimed in the backup map (`ModuleTables`), because a guard test fails otherwise. The wider backup and `.wnkjap` work still waits (step 13).
- **How it was checked** (PHPUnit and Laravel now run here): `ReportEngineTest` (27 tests) runs the **old** trial balance and the **new** engine on the same books and requires identical figures, for the year, other periods, open-ended periods, every cost-centre and branch filter, and a branch-limited person; it passes on SQLite and on MariaDB. It also covers the balance service against the old `LedgerService::balance()`, restating, drafts, the dates and comparisons, permissions, the export table, the identifiers and the statement-line rules. `ReportSettingsTest` (11 tests) runs the Reports settings, the statements tree and the chart-of-accounts endpoints through the real routes, with the permissions. The whole backend suite passes (2,442 feature tests and 151 unit tests) except `ExampleTest` (the stock Laravel test that expects the home page to return 200), which fails the same way on the original code. The new screens were driven in a real browser against the engine's real output (28 checks), and the amount formatting has its own tests.

- The balance and movement service (4.1); the screen frame (4.2); chart lookups (4.3); export; identifier lookup from vouchers, instruments, tenders and payment attempts.
- Statement line on the ledger and group forms (decision 2), with the nature check.
- Old reports untouched.
- **Check:** unit tests for dates, branch limits, cost-centre lines and currency restating; the balance service agrees with today's `LedgerService::balance()` for company-wide, undated cases.
- **Done when** a report can be defined on the engine with filters, banners, drill-down and export working.

### Step 5. Trial balance, P&L and balance sheet on the engine

- Build the three on the engine, plus the group views and comparisons.
- **Parity check:** for several periods and as-of dates, every ledger's figures and every total match the old reports to the cent, or the difference is a listed audit finding.
- Then switch the screen to the new versions.
- **Done when** parity is signed off by the owner and the old three are off the screen.
- **Status: done.** Signed off by the owner; the old trial balance, P&L and balance sheet are off the screen (their code goes in Step 12). Details of what was built: Backend: `ProfitLossReport`, `BalanceSheetReport`, `StatementBuilder`, the trial balance group view, comparisons (previous period / same period last year, and as-of for the balance sheet), month-by-month P&L, retained earnings split into previous years and this year, loose ledgers shown apart but counted. Parity tests (same books, old versus new, to the cent) pass on SQLite and MariaDB. Frontend: `StatementView` (fold/unfold, comparison with change and %, month columns, margins, notes), a By ledger / By group switch on the trial balance, the report options in `ReportFrame`. The Reports screen now opens the new Trial balance, P&L and Balance sheet; the old ones stay beside them labelled "(old)" until you sign off, and P&L by cost centre stays old for now.

### Step 6. The existing reports on the engine (the eight, money flow, and the stock journal and stock reports)

In this order, each with its own parity check against the old report:

1. Day book (both views; decision 12)
2. Ledger statement
3. Receivables and payables ageing (buckets from settings, unapplied credits, drill-down). **First** write a test case with a credit note and a debit note that have no invoice, to settle the direction (*D2*).
4. Tax return
5. Withholding certificates
6. Ratio analysis (inputs from settings)
7. Trade by party and item (the renamed Stock movement; decision 18)
   - **Status: built (awaiting sign-off).** `TradeReport` on the engine (key `trade`). Choose a party to see its items, an item to see its parties, or both for the vouchers ("all parties" for an item's every voucher); rows on screen narrow it. Same figures as the old report to the cent (parity tests); changes: today's-base currency rule (H3), walk-in names grouped ignoring case and spacing (H5), the financial year by default (H1), export and the branch and restated banners (H6), renamed (H2). The old screen stays as "Stock movement (old)" until sign-off.
8. Money flow on the Cash page (transfers behind a "Show transfers" checkbox; split tenders; a test case for a 600 cash + 400 M-Pesa sale first, *M4*)
   - **Status: built (awaiting sign-off).** `MoneyFlowReport` on the engine (key `money-flow`), drawn on the Cash page and in Reports. Plain receipts and payments match the old report to the cent (parity test). Changes: a sale paid 600 cash + 400 M-Pesa is attributed to its sales and VAT, as is a sale part paid in cash and the rest on account (M4); transfers between our own accounts are listed apart and left out of money in and out unless "Show transfers" is ticked (M3, decision 19); amounts in today's base (M2); money accounts from the Reports settings, the Bank Accounts and Cash-in-hand groups when none is chosen (M1); export and banners. A journal whose other lines do not add up to the money is still shown as an adjustment under its own number.
9. Stock journal, ported line by line (5.3); parity check on identical responses; tab kept on the Purchases page and listed in the Reports page
   - **Status: built (awaiting sign-off).** `StockJournalReport` (key `stock-journal`, permission `stock.view`). The Purchases page tab and the Reports page both draw it. Ported line by line: the same filters, 50 to a page, value = quantity × unit cost; a parity test runs the old and the new on the same movements (products and kitchen stock) with every filter and requires identical rows and totals. Changes: financial year by default (L1), one list of movement labels shared with the stock reports (L2, `StockMovementLabels`), export (L3), totals for the matching rows and search by voucher number (L4), the stock area's own permission (L5). The old controller stays until step 12.
10. Stock reports (summary, location summary, query, monthly and movements drill-downs, dashboard data), ported line by line the same way
   - **Status: built (awaiting sign-off).** Engine definitions `stock-summary`, `stock-location-summary` (a branch must be chosen), `stock-query`, and the two drill-downs `stock-item-monthly` and `stock-item-movements`, all `stock.view`. The queries stay in `StockReportService`, the one home of them (the dashboard's Stock tab, `dashboard()`, still reads the same service and is unchanged, for step 11); the engine definitions return its answers field for field, and a parity test requires exactly that for every filter (item type, search, branch, the query card, the months and the vouchers). Both doors draw the same views: the Purchases page tabs and the Reports page. Changes: financial year by default (L1), export (L3), the stock permission (L5), and the summary now binds its date instead of writing it into the SQL (R2). Opening stock still counts as opening, transfers are still hidden company-wide and shown for a chosen branch, and the negative and no-cost flags are kept (R1). The old controller routes stay until step 12.

**Done when** each audit finding listed against these reports in the appendix is closed.

**Order change (29 Oct):** the tax control work in `docs/TAX_CONTROL_PLAN.md` is done before 6.7 onwards, because the tax return and withholding register (6.4, 6.5) are rebuilt on it (T7 there). The tax work is finished (T1 to T8, except prices that include tax); steps 6.7 to 6.10 resume next.

**Progress:**
- 6.1 Day book: done and tested (both views, cost centre and branch on the entry lines, identifiers, paging with an all-pages total, export of every row, old-versus-new parity). Awaiting the owner's look on real data.
- 6.2 Ledger statement: done and tested (opening by one sum instead of loading history, paging with the running balance carried across pages, particulars naming the other side, narration and identifiers, Dr/Cr balances, searchable ledger picker, per-currency totals kept, notes for branch-limited and filtered openings; parity with the old statement on SQLite and MariaDB). The ledger links from the chart of accounts and the trial balance open it. Starting from stored closing balances comes with Step 7.
- 6.3 Receivables and payables ageing: done and tested. **Direction settled (D2):** a credit note (sales return) credits the customer and a debit note (purchase return) debits the supplier; neither ever opens a bill of its own, it settles its invoice and what is left becomes an *advance* on the party. So unapplied credits are those advances: on the receivables side from receipts, overpayments and credit notes; on the payables side from payments made in advance and debit notes. The old ageing listed credit and debit notes among the bills, but they never created any, so real credits were missing from it altogether. Now: bills by age (boundaries and basis from settings, bill-date or due-date), a separate Unapplied credits section, a net line compared with the ledger balance of the debtors or creditors chosen in the settings, bills listed and clickable, bills and credits in the export, applying a credit shrinks the bill and the credit by the same amount (tested, so it is never counted twice). The customer-account pages still call the old ageing until Step 12.
- 6.4 Tax return: done and tested. Per-rate output, input and bases, and the supplies split, are the old return's figures to the cent. New: the start and the end are each worked out on their own dates and for the person's branches (*E1–E4*): "owed at the start" is what was owed the day before the period, "owed at the end" what was owed on its last day (the old return showed today's figure), with a proof line "paid to the authority and other entries" between them; no start date means starting from nothing (*E2*); withheld taxes get the same start, end and proof (*E3*); the branch banner shows (*E4*, *A3*); the supplies split is on the screen (*E5*); the labels name the date (*E6*). The total owed still adds the added-to-price taxes only, as before.
- 6.5 Withholding certificates: done and tested. Rows and totals are the old register's. New: every row shows its currency code with its own-currency amounts and the withheld amount in the base currency, so the base column adds up to the totals (*F4*); payment identifiers on the row (*F3*); "awaiting certificate" counts every outstanding certificate whenever it was raised, with the period's own and the outstanding amount alongside (*F2*, decision 20); branch banner and branch pick (*F1*); paging; the export carries currency and base amount.
- 6.6 Ratio analysis: done and tested. Every figure is the sum of the ledgers the Reports settings name (groups or statement lines), so nothing depends on group names or their casing (*G1, G2*, decision 14); a figure not chosen reads "Not set up" and a ratio that needs it names the setting it is waiting for. Profits come from the engine's profit and loss, equity from the engine's balance sheet as capital plus retained earnings, earlier years and this year to date (*G4*), nothing is worked out a second way (*G5*); receivable days use the bills still open instead of the whole debtors balance (*G6*); the period opens on the financial year (*G3*); branch banner (*G7*). Where the definition is unchanged the figures match the old service to the cent. The quick ratio needs the stock input chosen: a business with no stock should choose its stock group even if empty, rather than have a zero assumed.

### Step 7. Closing balances and year-end close

- `ledger_year_balances`, `year_closes`; the close wizard (section 7); retained earnings on the balance sheet; the changes-in-equity statement.
- The engine reads stored closing balances plus movement since.
- **Check:** close a test year; next year's opening equals last year's closing for every balance-sheet ledger; income and expense ledgers start at zero; the balance sheet balances; reopen and re-close gives the same result.
- **Done when** a year can be prepared, approved (second person when the rule is on), locked and reopened with an audit trail.
- **Status: built (awaiting sign-off), with one part held back.**
  - *Database:* script `232_year_close.sql` (`year_closes`, `ledger_year_balances`, `year_close_log`); the three tables are in the backup list. Run it before using the close.
  - *The close* (`YearCloseService`, Books → Configuration → Period control → Financial years → "Close the year…"): a checklist (the year has ended; earlier years closed; opening balances net to nothing; no draft vouchers; suspense clear; the person sees every branch; depreciation, accruals and stock valuation confirmed by ticking; reconciliation shown as "not checked yet" until step 9), then **prepare → approve → lock**, and **reopen with a reason**. Preparing needs `books.close.prepare`; approving, locking and reopening need `books.period` (the owner). With the second-approver rule on (Reports settings, on by default) the preparer cannot approve. Locking closes the financial year, which the period guard already enforces for every voucher; every step is logged. Preparing again replaces an unapproved attempt; re-closing a reopened year gives identical figures (tested). The old "Close year" switch is retired once the script is run: it points to the year-end close.
  - *What it stores:* each ledger's balance at the year end and what it carries forward (balance-sheet ledgers their balance; income and expense ledgers nothing), the statement line it was on that day, and the year's profit, the earlier years' and the retained earnings carried.
  - *Reports:* **Changes in equity** (opening + profit + other movements = closing; the closing equity equals the balance sheet's, tested for several periods) and **Adjusted trial balance** (balance-sheet ledgers with retained earnings as one line; debits equal credits).
  - *Held back:* "the engine reads stored closing balances plus movement since". The numbers it would give are the ones the reports already give from history (the balance sheet's retained earnings is computed from the income and expense ledgers), so it is a speed-up and not a correction; it is left until a test can prove the two agree on a real year, and until frozen report packs (also in section 7) are built.

### Step 8. Cash flow statement

- Add `cash_flow_category` to the statements tree with defaults; the indirect-method statement; the direct-method cash book from money flow.
- **Check:** opening cash + net cash flow = closing cash, for several periods.
- **Done when** it agrees with the cash and bank balances.
- **Status: built (awaiting sign-off).** `CashFlowReport` (key `cash-flow`), in Reports as "Cash flow statement". Cash is the money account groups of the Reports settings (Bank Accounts and Cash-in-hand when none is chosen). **Indirect method:** the profit of the period, non-cash items added back, and the change in every other balance-sheet ledger, put in operating, investing or financing by its statement line. **Direct method:** the money received and paid by the group on the other side, from money flow (transfers between our own accounts left out). Categories live on the statements tree (`statements.cash_flow_category`, a "Cash flow" column in the statements editor): a row takes its own, else its parent's, else the default for its code (non-current assets investing; capital, reserves, loans and borrowings financing; everything else operating). Marking a line non-cash leaves its balance changes out and adds its income-statement side back (depreciation and accumulated depreciation). **Check, tested for six periods:** opening cash + net cash flow = closing cash held in the cash and bank ledgers, the three sections add up to the change in cash, and the direct method agrees with the indirect one. If a non-cash category is set on one side of an entry only, the difference is shown on its own red line and the statement says it is out.

### Step 9. Reconciliation hub

- Read why script 78 dropped the old feature, then design the `recon_*` tables.
- Build the engine and adapters in this order: control-account checks (moved from today's report), bank, M-Pesa, cash, counter-party.
- **Check:** a test bank statement and a test M-Pesa statement reconcile to the proof in section 6; a preparer cannot approve their own session.
- **Done when** Cash-in-hand and Bank Accounts ledgers can be reconciled, signed off and locked.
- **Status: built in part (awaiting sign-off).**
  - *History read:* script 78 dropped the earlier sessions feature (`reconciliation_sessions`, `reconciliation_lines`, `financial_notes`; test data only, nothing else used them), so the new tables are `recon_sessions`, `recon_statement_lines`, `recon_log` (script `233_reconciliation.sql`, in the backup list) and do not reuse the old names.
  - *Built:* `ReconService` and the Books → **Reconciliation** tab. Any ledger in a reconcilable group of the Reports settings (and not switched off) can be reconciled; its kind is recorded. **Import** a statement from CSV with the columns chosen on screen (date, details, reference, money in and out, or one signed amount, balance, date format); money in is positive for a bank, and a statement imported twice adds nothing. **Matching** is automatic on the numbers an entry carries (voucher number, reference, cheque number, M-Pesa code) and then on amount within the tolerance and date within the window from the settings, one line to one entry, or by hand, with undo. **Clear before a date** marks what earlier statements already cleared (first reconciliation of a ledger). A line the books do not have (a bank charge, interest) can be **posted as a journal** from the screen against a ledger you choose, and is matched to it. **The proof:** the statement balance less the lines not in the books must equal the book balance less the entries not on the statement (cheques not cashed, deposits in transit); the difference is shown and must be nil to prepare. **Sign-off:** prepare (`books.reconcile`) → approve (`books.reconcile.approve`, a second person while the rule is on, which it is by default) → lock; reopen needs `books.period` and a reason; a later locked reconciliation of the ledger must be reopened first. What a locked reconciliation matched is cleared and not offered again; the rest stays outstanding. The year-end close now checks that every reconcilable ledger is locked to the year end.
  - *Control-account checks* (trial balance, gift vouchers, loyalty points, withholding credits, stock and stock units, receivables, payables) are on the engine as `control-accounts`, from the same checks as before (one home of them), with the Refresh and Post-correction buttons and the engine's date, frame and export. The old screen stays beside it as "(old)". Receivables and payables still find their groups by name until the health panel (step 10) moves them to the settings.
  - *Not yet built:* adapters beyond the generic statement import: the cash count adapter (`CashCountService`, petty cash floats), the M-Pesa-specific flags (paid but not booked, duplicates, reversals, fees, settlement to the bank), and counter-party matching on bill references. The generic import already serves M-Pesa and supplier statements by choosing their columns; the specific flags and the bill-reference matching are the next pieces. So the "Done when" is met for banks and for statements imported as CSV, not yet for cash counts.

### Step 10. Books health panel

- The checks in section 8, each drilling down.
- **Done when** every check can be made to fail on test data and shows where.
- **Built (awaiting sign-off).** `books-health` on the engine (Books → Reports → Books health; `BooksHealth` service, `BooksHealthReport`, `BooksHealthView`). Each check is pass / check / fail / not set up, lists the findings (first 25, with the total) and opens the voucher, ledger or report behind it. Checks: trial balance agrees; balance sheet balances; opening balances net to nothing (lists the ledgers); no drafts in the period; nothing back-dated into a closed year; cash/bank and stock not below zero; every ledger in use on a statement line; suspense groups empty; near-duplicate ledger names; vouchers shown at a changed currency rate; unmatched statement lines in unlocked reconciliations; reconcilable ledgers with an unconfirmed kind; receivables/payables groups chosen; the tax set-up (TaxHealth). Nothing is found by name: stock and cash groups come from the existing settings, and a new **Books health → Suspense groups** setting; a check without its set-up says "not set up".
- The control-account checks (receivables, payables) now read the Debtors and Creditors groups chosen in Ratio analysis inputs; the name "Sundry Debtors / Sundry Creditors" is used only while none is chosen, and the health panel says so.
- Not built: "entries back-dated into a locked-before date" (the date lock keeps no record of when it was set).

### Step 11. Extras visuals

- The gating shell (three page states, module store change) can start any time after Step 4.
- Charts follow as their engine endpoints exist (Steps 5, 6, 8, 9).
- **Check:** with Extras unlicensed, licensed-but-off and active, the page shows the right state and the server refuses data when not active.
- **Done when** every chart in section 11 draws from the engine.
- **Built (awaiting sign-off).** Books → **Visual reports** (`VisualsController`, `VisualsService`, `extras/components/books/VisualReports.jsx`). `GET /admin/books/visuals/status` says `not_licensed`, `off` or `active` (licensed means the licence handshake passes; active also needs the switch on); `GET /admin/books/visuals` carries the figures and sits behind `module:extras`, so the server answers 404 unless Extras is licensed and on. The page shows an invitation with a peek at **made-up sample figures** (never real data) when not licensed; a message with a Module Center button (holders of `system.modules`) or "ask an administrator" when off; the real charts when active. The global module store was not changed: the page asks its own status endpoint, which is what tells "not licensed" from "licensed but off".
- The 16 charts, all from engine figures: cash balance line; money in and out; each cash/bank account; expense donut; expense group treemap; top customers; sales against purchases (a sale or purchase with a customer/supplier account is "credit", without one "cash"); assets composition treemap; owed-to-us-and-by-us build-up; ageing bars; who-is-late bubbles; activity calendar; profit waterfall; assets against liabilities and equity; profit month by month; reconciliation status. A chart that cannot be worked out (script not run, set-up missing) says why and leaves the others alone. Drawn with `recharts`; the calendar is a small custom SVG, and the waterfalls use range bars.
- Colours: fixed categorical order, text in ink not series colour, legends always present, charts do not animate. Dark mode and a table view of each chart are not built yet.

### Step 12. Retire the old code

- Remove the old report methods, the private `movement()` copies, name-based group lookups, and `affects_gross_profit` (after confirming nothing else reads it).
- **Done when** nothing calls the old code and every test passes.
- **Built (awaiting sign-off).**
  - *Removed:* `BooksReportService` (day book, ledger statement, trial balance, P&L, balance sheet, ageing and the private `movement()` copy), `ComplianceReportService` (tax return, withholding register), `RatioAnalysisService`, `MovementReportService`, `StockJournalController`, the old stock report endpoints (only the item search stays), the movement endpoints (only the product search stays), the generic `/admin/books/reports/{name}` endpoint, and every "(old)" screen and screen code in Books → Reports.
  - *Moved onto the engine:* profit and loss by cost centre is now an engine report (`profit-loss-by-cost-centre`, ported field for field, with a parity test before the old one went). The voucher register export uses the engine's day book.
  - *`Engine\Figures`:* the one door for parts of the system that are not report screens (the customer's own account and its downloads, the credit tab, the dashboard, the insight packs, the `.wnkjap` export). It runs the same definitions the Reports screens run, so a figure shown anywhere is the figure in the report. The engine's P&L now also returns the ledgers behind its totals (`sections`), the balance sheet its asset and liability ledgers, and the ageing an `overdue` total.
  - *`ControlAccountChecks`* replaces the control-account part of the old compliance service. Receivables and payables use the Debtors and Creditors groups chosen in the Reports settings; when none is chosen the check is listed as "not set up" instead of being found by the name "Sundry Debtors" (the health panel says so too).
  - *`affects_gross_profit`:* nothing reads or writes it any more; script `235_retire_affects_gross_profit.sql` drops the column (run it after the application update). The trading/operating split is the statement line (Revenue and Cost of sales).
  - *Tests:* the old-versus-new parity tests were turned into recorded figures (`tests/Fixtures/*.json`, recorded once from the old code after the owner signed parity off; `RecordsGolden`), so the engine is still held to the numbers the old reports gave. The whole suite passes except `ExampleTest`.
  - *Not touched (not report code):* posting code that finds cash and bank groups by name (vouchers, POS, payroll, events, delivery) and the cash-flow/money-flow fallback to the Bank Accounts and Cash-in-hand groups when no group is chosen (decision M1).

### Step 13. Later: other companies' books and backups

- Update the `.wnkjap` export and import (`imports.export`, `imports.view`) for the new tables and columns; check `docs/WNKJAP_FORMAT.md` version rules first.
- Update `ModuleTables` so the backup claims and restores every new table.

---

## 13. Risks and edge cases

- Placeholder lines such as "Difference in opening balances" need a home on the statements.
- System ledgers (`is_system`) may need their statement line locked.
- Income and expense ledgers with opening balances.
- Moving a ledger to another group keeps its own statement choice.
- A reconcilable group can hold ledgers of different natures.
- Making a group reconcilable after years of history: the first session starts from an agreed opening position.
- Bank statement formats vary; the importer needs a column-mapping step per bank.
- Anything reading `nature` today (dashboard, ratio analysis) is unaffected, since `nature` does not change.

---

## Appendix: audit findings and where they are solved

| Audit item | Solved in |
|---|---|
| A1, B1 | Step 4 (entry-line dimensions), Step 6.1 (day book views) |
| A2, E1, E2, E3, E4 | Step 4 (dated, branch-aware balance service), Step 6.4 |
| A3, H6 | Step 4 (banners from the engine) |
| A4, S1, H1, M5, G3 | Step 4 (financial-year default) |
| A5, C1 | Step 4 (paging), Step 7 (stored closing balances) |
| A6, G1, G2, M1 | Step 3 (settings), Step 4 (lookups by id) |
| A7, B4, C3, C4, F3 | Step 4 (identifiers, narration, particulars) |
| B2 | Kept as labelled |
| C2 | Step 4 (banner wording) |
| C5, F4 | Step 4 (amount display) |
| C6 | Step 4 (searchable pickers) |
| D1, D4, D5, D6 | Step 3 (buckets), Step 6.3 |
| D2, D3, H4 | Step 6.3 (test case, then unapplied credits) |
| E5, E6 | Step 6.4 |
| F2 | Step 0, Step 6.5 |
| G4 | Step 7 (retained earnings) |
| G5, G6 | Step 6.6 |
| H2 | Step 0, Step 6.7 |
| H3, M2 | Step 4 (one currency rule) |
| H5 | Step 6.7 |
| M3, M4 | Step 0, Step 6.8 |
| S2, S3, S4, S5 | Step 4 (screen frame) |
| L1, R1 (stock reports and journal dates) | Step 4 (financial-year default), Step 6.9, 6.10 |
| L2 (duplicate movement labels) | Step 6.9 (one shared list) |
| L3, L4, R2 (no export, no totals, search) | Step 4 (export), Step 6.9, 6.10 |
| L5 (two permission styles) | Step 4 (catalogue permissions only) |
| R3 (stock query runs a full summary) | Step 6.10 (same figures, computed for the one group only; parity checked) |
