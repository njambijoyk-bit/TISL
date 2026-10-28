# Books reports: rebuild plan

Status: **plan only, no code written.** Agreed with the owner on 28 Oct 2026. Lives next to the other `*_PLAN.md` files.

---

## 1. Goal and scope

Rebuild the financial side of Books Reports so it behaves like a financial institution's books: statements built from a proper classification, year-end closing balances, a full reconciliation hub, a health check, and (in Extras) visual reports.

| Area | Decision |
|---|---|
| **Rebuild** | Trial balance, Profit & loss (and by cost centre), Balance sheet, Reconciliation |
| **New** | Statement of changes in equity, Cash flow statement, Year-end close with closing balances, Bank / M-Pesa / cash reconciliation, Books health panel |
| **Audit, then harmonise (not redesign)** | Day book, Ledger statement, Receivables ageing, Payables ageing, Tax return, Withholding certificates, Ratio analysis, Stock movement |
| **Config** | A new **Reports** tab in Books Settings |
| **Visuals** | Extras module only. Core stays tables. |

Everything stays in **Core** except the visual reports page.

---

## 2. Decisions log

| # | Decision |
|---|---|
| 1 | A `statements` table (tree) plus a `statement_id` column on `ledger_groups` and on `ledgers`. |
| 2 | A new ledger copies its group's statement on creation; the creation form can change it. |
| 3 | Raw SQL inserts and empty values fall back to the group's statement in reports; the health panel lists them. |
| 4 | Who may change a statement line: **super admin and senior accountant**. |
| 5 | "Closing balance" = each ledger's balance at year end, stored when the year is closed. |
| 6 | Bank reconciliation covers **every ledger under the Bank Accounts group**. |
| 7 | M-Pesa ledgers (mobile-money payment methods) get their own reconciliation, matched on receipt numbers, from the portal statement. |
| 8 | Charts live only in Extras. Core report pages stay tables, with a "View visually" button. |
| 9 | Reconciliations and the year-end close need a **second approver**. |
| 10 | The suspense account is one of the ledgers chosen in Books → Settings → Default ledgers. Its statement line follows its group (or its own override). Any balance on it is flagged by the health panel. |

---

## 3. The statements table

A self-referencing tree. Reports roll up through it; ledgers and groups attach to its `line` rows.

| Column | Purpose |
|---|---|
| `id`, `parent_id` | The tree. Roots: Balance Sheet, Income Statement. |
| `code` (unique) | Stable key reports use, e.g. `BS.CA.CASH`, `IS.COGS`. |
| `name` | Label on the report; editable. |
| `kind` | `heading` (groups rows, takes no ledgers) or `line` (leaf ledgers post to). |
| `nature` | The one nature a line accepts: asset, liability, income, expense. Equity lines use `liability` (capital sits there today). |
| `normal_side` | Dr or Cr, for sign display. |
| `sort_order`, `is_system`, `is_active` | System rows can be renamed, not deleted. |

**Default tree (three levels at most; editable in the Reports settings tab):**

- Balance sheet
  - Assets: Non-current (property and equipment, investments); Current (inventory, trade receivables, cash and bank, other current assets)
  - Equity: owner or share capital; reserves and retained earnings
  - Liabilities: Non-current (long-term loans); Current (trade payables, short-term borrowings, taxes payable, provisions and other)
- Income statement: revenue, cost of sales, other income, operating expenses, finance costs, income tax

Gross profit, operating profit and net profit are computed by the report engine from section codes, not stored.

### New columns

- `ledger_groups.statement_id`: nullable FK → `statements.id`, indexed, `ON DELETE RESTRICT`.
- `ledgers.statement_id`: same.

### Rules

- **On create:** a ledger gets its group's statement; a subgroup gets its parent's. The form pre-fills it and may change it. The Ledger model's create hook covers every Laravel path (`create`, `firstOrCreate`, `LedgerService::ensure`).
- **Safety net:** many numbered SQL scripts insert ledgers directly. Reports use the ledger's value, else the group's. The health panel lists ledgers with no value.
- **Group's statement changed later:** the screen asks whether to apply it to the group's ledgers that still match the old value. Ledgers with their own choice are untouched.
- **Validation:** a line must accept the nature of the group the ledger sits in; a mismatch is refused on save.
- **Permission:** changing a statement line on a ledger or group, and editing the statements tree, needs a new permission `books.statements`, held by super admin and the senior accountant role.
- `ledger_groups.affects_gross_profit` stays during the transition, then is retired once reports read the tree.

### Starting data: script `227_statements.sql`

Follows the repo style: PART A read-only check, PART B change, PART C result check.

- Creates the table and columns, seeds the tree, fills groups by name with a nature fallback. Anything it cannot map is listed, never guessed.
- **First step before writing it:** list the live `ledger_groups`. The default chart is not seeded by any script in the repo.
- Likely mapping (Tally-style chart):

| Existing group | Statement line |
|---|---|
| Fixed Assets | Non-current assets |
| Investments | Investments |
| Bank Accounts, Cash-in-hand | Cash and bank |
| Sundry Debtors | Trade receivables |
| Stock-in-hand | Inventory |
| Deposits, Loans & Advances | Other current assets |
| Capital Account, Reserves & Surplus | Equity |
| Sundry Creditors | Trade payables |
| Duties & Taxes | Taxes payable |
| Provisions | Provisions and other |
| Sales Accounts | Revenue |
| Purchase Accounts, Direct Expenses | Cost of sales |
| Direct Incomes, Indirect Incomes | Other income |
| Indirect Expenses and subgroups | Operating expenses |

Loans are the awkward case, since part of a loan can fall due within a year. That is what the per-ledger override is for.

---

## 4. One shared report engine

Every report, rebuilt or existing, uses the same layer.

- Period or as-of date; comparison with the previous period or year; variance and variance %.
- Drill-down: statement line → group → ledger → voucher.
- Filters: branch and cost centre, with the existing "limited to your branches" banner.
- Currency: base currency and the restated-vouchers note (`RestatedBase`).
- Export and print through `ExportService`.
- Data comes from one movement query, so the trial balance, P&L and balance sheet cannot disagree.
- The Extras visuals call these same endpoints, so a chart can never disagree with its table.

---

## 5. Year-end close and closing balances

- **Closing balance** = a ledger's balance at the end of a financial year, stored in a new table (ledger, financial year, closing Dr/Cr in base currency, **the statement line at that moment**).
- Saving the statement line means reclassifying a ledger later does not silently change a closed year. A deliberate re-map is labelled "reclassified".
- **Non-posting, like Tally:** balance-sheet ledgers carry forward as the next year's opening; income and expense ledgers reset; profit moves to retained earnings. There are no closing journals to reverse.
- Reports read the latest closing balance plus movement since, which fixes slow balance sheets.
- **Close wizard:** a checklist first (depreciation run, accruals, stock valuation, unreconciled items, draft vouchers), then prepare, then approve, then lock via `PeriodGuard`.
- **Reopening** a closed year needs a permission, a reason, and an audit entry (`VoucherAuditLog`).
- **Approval:** the preparer cannot approve their own close.
- A closed report can be frozen "as at close" with prepared-by and reviewed-by names, for board packs.

---

## 6. Rebuilt statements

| Report | What it becomes |
|---|---|
| Trial balance | Ledger view and group view; adjusted trial balance; clear explanation of any opening difference |
| Profit & loss | Sections from the statements tree; gross and net margin; month-by-month columns; by cost centre kept |
| Balance sheet | Assets, Liabilities, Equity; current and non-current; retained earnings split into prior years and this year |
| **Changes in equity (new)** | Opening equity, plus profit, less drawings and distributions, equals closing equity |
| **Cash flow (new)** | Indirect method, plus a direct-method cash book. Needs a `cash_flow_category` on the mapping, added when this report is built. |

---

## 7. Reconciliation hub

One generic engine: a **source** (an imported statement or a register) against the **books**, with statuses, match tolerance, sign-off and lock. Each type is an adapter.

| Type | Behaviour |
|---|---|
| Control accounts (exists) | Keep the current checks; add drill-down to unmatched items. |
| **Bank** | Every ledger under Bank Accounts. Import the statement, auto-match by amount, date and reference, match the rest by hand. Track outstanding cheques (`InstrumentService`) and deposits in transit. Post bank charges and interest as journals. Proof: statement balance + deposits in transit − outstanding cheques = book balance. |
| **M-Pesa** | Match the portal statement against confirmed `PaymentAttempt` receipts and the M-Pesa ledger, by receipt number. Flags paid-not-booked, booked-not-paid, duplicates, reversals, fees, and settlement to the bank. |
| Cash | Till counts (over/short) and petty cash floats. |
| Clearing accounts | Any ledger marked clearing or suspense should net to zero over time. |

Script 78 dropped an earlier reconciliation-sessions feature. Read its history before designing the new tables.

---

## 8. Books health panel

One page of pass/fail checks, each drilling down. Includes: trial balance and balance sheet balanced; draft vouchers in the period; entries back-dated into a closed period; negative cash, bank or stock; ledgers with no statement; balance on the suspense account; restated vouchers; unreconciled bank and M-Pesa items.

---

## 9. Books Settings → Reports tab

- Decimals, units (thousands), zero balances, negative-number format
- Default comparison and default group depth
- Ageing buckets (fixed in code today)
- Reconciliation match tolerance and date window
- Which ledgers count as cash and bank
- Statements tree editor (needs `books.statements`)
- Report header, footer and signatories
- Which bank accounts and which M-Pesa paybill or till are reconciled
- Approval requirements for reconciliation and close

The suspense ledger is chosen on the existing Default ledgers tab.

---

## 10. The eight existing reports

1. **Audit first.** List bugs and inconsistencies; agree each fix with the owner before changing anything.
2. Give all of them the same filter bar, drill-down, export and banners.
3. Receivables and payables ageing get charts (via Extras).

---

## 11. Extras visuals

- A new Extras "Visual reports" page. It reads the core endpoints; the licence check is enforced on the server, not only in the page.
- **Page states:**
  - **Not licensed:** invite them to license Extras, with a sneak peek built from **sample data** (never the client's real data).
  - **Licensed but off:** a cheeky message with a button to Module Center for people holding `system.modules`, and "ask an admin" for everyone else.
  - **Active:** the real charts.
- The frontend module store only knows the *active* list today, so it needs a small addition to tell "unlicensed" from "licensed but off".
- Charts from the Tally dashboard: cumulative cash line; daily money in and out; per-account bars (bank, cash, M-Pesa); expense donut and group-hierarchy treemap; top customers; sales against purchases (cash and credit); composition treemap; outstanding build-up; ageing bars and bubble chart; activity calendar heatmap.
- New for statements: profit waterfall; assets against liabilities and equity; monthly profit trend; reconciliation status.
- Built with `recharts` (already installed). Heatmap and waterfall are small custom components.

---

## 12. Permissions

Existing: `books.view`, `books.post`, `books.review` (review and reconcile), `books.period` (lock periods and close years; **owner-only**).

Proposed additions, to confirm when building:

- `books.statements`: change statement lines (super admin, senior accountant).
- `books.reconcile` (prepare) and `books.reconcile.approve`.
- `books.close.prepare`; approving the close stays with `books.period` (owner).
- `books.reports.export`, if finer control than `books.view` is wanted.

---

## 13. Order of work

1. **Read-only audit:** the eight existing reports, the history of the dropped reconciliation, and the live chart of accounts.
2. **Foundations:** statements table and columns, shared engine, closing balances, Reports settings tab.
3. **Rebuilt statements**, then changes in equity and cash flow.
4. **Reconciliation hub**, then the health panel.
5. **Harmonise** the eight existing reports.
6. **Extras visuals.** The gating shell can start early, in parallel.

---

## 14. Risks and edge cases

- Placeholder lines such as "Difference in opening balances" need a home on the statements.
- System ledgers (`is_system`) may need their statement locked.
- Income and expense ledgers with opening balances.
- Moving a ledger to another group keeps its own statement choice.
- The backup module's table map (`ModuleTables`) needs the new tables.
- Anything reading `nature` today (dashboard, ratio analysis) is unaffected, since `nature` does not change.
- Closed years use the mapping saved at close; deliberate re-maps must be visible.
- Bank statement formats vary by bank; the importer needs a column-mapping step per bank.
