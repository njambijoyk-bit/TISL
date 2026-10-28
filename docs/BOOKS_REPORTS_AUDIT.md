# Books reports audit: the eight reports we are not redesigning

Date: 28 Oct 2026. Read-only audit of the code; nothing was changed and no live data was available.

Reports covered: Day book, Ledger statement, Receivables ageing, Payables ageing, Tax return, Withholding certificates, Ratio analysis, Stock movement.

**Confidence labels**

- **Confirmed** = the code does this, as read.
- **Verify** = likely a problem, but it depends on live data or on intent, so it needs a test case or a question to the owner.

**Coverage.** Read in full: `BooksReportService` (day book, ledger statement, ageing), `ComplianceReportService` (tax return, withholding), `RatioAnalysisService`, `TaxLedgerService::position`, `LedgerService::balance`. Only skimmed: `MovementReportService` (stock movement and money flow). Not yet read: the screen code for these reports, export tables, and the tests. Nothing was run.

No fixes are applied. Each one needs the owner's agreement first.

---

## A. Problems that affect several reports

| # | Finding | Confidence |
|---|---|---|
| A1 | **Two filtering rules for cost centre and branch.** The day book filters on the voucher header (`vouchers.cost_centre_id`, `location_id`). The ledger statement, trial balance and P&L filter on the entry lines (`voucher_entries.cost_centre_id`, `location_id`). A voucher split across cost centres shows in full in the day book and only partly everywhere else. | Confirmed |
| A2 | **`LedgerService::balance()` ignores branch limits**, while the reports apply them. Anything that compares the two mixes bases. Example: the reconciliation's receivables check takes the debtors group balance (company-wide) against the ageing total (limited to the person's branches), so a branch-limited user sees a false difference. The tax return's "closing owed" has the same cause. | Confirmed |
| A3 | **"Limited to your branches" banner is missing** on the tax return, withholding register and ratio analysis, although the figures are limited. Trial balance, P&L, balance sheet, ledger statement, day book and ageing return the flag. | Confirmed |
| A4 | **Default periods disagree.** Ratio analysis and money flow default to 1 January of the current calendar year, ignoring the configured financial year. Day book and ledger statement default to all time. | Confirmed |
| A5 | **No limits or paging.** The day book returns every matching voucher. The ledger statement loads every entry from the beginning up to the end date, even to show one month. Ageing returns every open bill. These get slow on years of history; stored closing balances (the plan's year-end close) address the ledger statement. | Confirmed |
| A6 | **Group lookups by name** (`LedgerGroup::where('name', ...)->first()`, and the ratio service's own name map). If two groups share a name, or a group is renamed, the wrong group or none is used. This also affects `isUnderGroup`, used by several services. | Confirmed (the pattern); Verify (any duplicates in live data) |
| A7 | **Transaction identifiers are not shown.** The ledger statement and day book show voucher number and narration only. Cheque number and dates (`voucher_instruments`), M-Pesa code (`voucher_tenders.reference`) and reference numbers are stored but not displayed. This is also what reconciliation will need. | Confirmed |

---

## B. Day book

| # | Finding | Confidence |
|---|---|---|
| B1 | Cost-centre filter uses the header, not the lines (A1). | Confirmed |
| B2 | Rows include drafts and cancelled vouchers, but the grand total counts posted ones only. The status column explains it, but the total next to a row can look wrong. | Confirmed (low) |
| B3 | No paging (A5). | Confirmed |

## C. Ledger statement

| # | Finding | Confidence |
|---|---|---|
| C1 | Loads all history to the end date (A5). | Confirmed |
| C2 | For a branch-limited person the running balance starts from the company-wide opening balance and adds only their branches' movement. The banner explains this for the other reports; check the ledger statement says it clearly. | Confirmed (by design); Verify wording |
| C3 | No identifiers (A7). | Confirmed |

## D. Receivables and payables ageing

| # | Finding | Confidence |
|---|---|---|
| D1 | **Buckets are fixed in code** (current, 1-30, 31-60, 61-90, over 90). The plan moves them to settings. | Confirmed |
| D2 | Credit notes sit on the **payables** side and debit notes (and bounced-cheque journals) on the **receivables** side. The tax return uses the opposite pairing, treating a credit note as a sales return. This may be deliberate: a credit note with no invoice to offset leaves us owing the customer. | **Verify** with a test case; do not change without checking |
| D3 | Ageing only counts bills (`ref_type = new`). Advances and on-account receipts are not in it, so the total never equals the debtors or creditors balance. The reconciliation note admits this; the ageing page should show "unallocated" beside the total. | Confirmed |
| D4 | Ageing is by due date only. The Tally dashboard offers bill date or due date. | Confirmed (enhancement) |

## E. Tax return

| # | Finding | Confidence |
|---|---|---|
| E1 | **`closing_owed` ignores the report's end date.** It comes from `TaxLedgerService::position()`, which takes no date, so a past-period return shows today's figure. The grand total `owed` is the same. | Confirmed |
| E2 | **Brought forward with no start date.** `balance($control, null)` means "all time", so with an empty From date, "brought forward" equals the whole balance instead of nothing. | Confirmed |
| E3 | For withheld tax types, brought forward is always 0 and closing owed is today's figure (E1). | Confirmed |
| E4 | No branch banner (A3), and the branch-limited rows sit beside unlimited position figures (A2). | Confirmed |

## F. Withholding certificates

| # | Finding | Confidence |
|---|---|---|
| F1 | No branch banner (A3). | Confirmed |
| F2 | "Awaiting certificate" counts only certificates in the chosen period, not all outstanding ones. Check that this is what finance expects. | Verify |
| F3 | No payment identifiers on the row (A7). | Confirmed (low) |

## G. Ratio analysis

| # | Finding | Confidence |
|---|---|---|
| G1 | **Group names in the code do not match the seed scripts' casing.** The service looks up `Cash-in-Hand` and `Stock-in-Hand` (capital H) in a case-sensitive PHP map. The scripts create and search `Cash-in-hand` and `Stock-in-hand`. If the live groups are named like the scripts, cash shows as 0 and the stock group is skipped. Stock has a fallback to the Stock ledger; cash has none. | Verify against the live group names (probable) |
| G2 | The name map keeps the first group when names repeat (A6). | Confirmed |
| G3 | Default start is 1 January, not the financial year (A4). | Confirmed |
| G4 | **Capital excludes earlier years' profit.** The books have no closing, so "Capital Account + this period's profit" understates equity from the second year on. Debt/equity and return on investment drift. The year-end close and retained earnings fix this. | Confirmed |
| G5 | Each run builds a full trial balance and two ageing reports. Slow on large books. | Confirmed |
| G6 | Receivable days uses the whole debtors balance, including advances not tied to bills. | Confirmed (low) |
| G7 | No branch banner (A3). | Confirmed |

## H. Stock movement and money flow (partly read)

| # | Finding | Confidence |
|---|---|---|
| H1 | Default start is 1 January (A4). | Confirmed |
| H2 | Money flow splits a multi-line voucher's money across its other lines in proportion; vouchers that do not add up are shown unattributed. This is documented in the code but approximate. The screen should say so. | Confirmed (by design) |
| H3 | Fully reading this service is still to do. | Open |

---

## I. Suggested order of fixes (for agreement, nothing applied)

1. **Quick, low-risk:** G1 (after checking live names), E2, A3 (banners), B2 wording.
2. **Needs a decision:** D2 (is the credit note placement intended?), A1 (which rule is right: header or lines), A4 (financial year as the default period), F2.
3. **Larger, folded into the rebuild:** E1 and A2 (a dated, branch-aware balance function used by every report), A5 and G4/G5 (stored closing balances and the year-end close), A7 (identifiers shown), D1 (ageing buckets in settings), D4 (bill-date toggle), A6 (look groups up by id or by a stable code, not by name).

## J. Open questions for the owner

1. Run a read-only listing of `ledger_groups` (id, name, parent, nature) so G1, A6 and the statement mapping can be checked. Please paste it.
2. D2: should a credit note on a supplier or customer with no matching invoice appear under payables, as it does now?
3. A1: for a voucher split across cost centres, should the day book show it under each cost centre it touches, or under the header's?
