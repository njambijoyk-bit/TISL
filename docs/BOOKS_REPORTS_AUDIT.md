# Books reports audit: the eight reports we are not redesigning

Date: 28 Oct 2026. Read-only audit of the code; nothing was changed and no live data was available.

Reports covered: Day book, Ledger statement, Receivables ageing, Payables ageing, Tax return, Withholding certificates, Ratio analysis, Stock movement.

**Confidence labels**

- **Confirmed** = the code does this, as read.
- **Verify** = likely a problem, but it depends on live data or on intent, so it needs a test case or a question to the owner.

**Coverage.** Read in full: `BooksReportService` (day book, ledger statement, ageing), `ComplianceReportService` (tax return, withholding), `RatioAnalysisService`, `MovementReportService` (stock movement and money flow), `TaxLedgerService::position`, `LedgerService::balance`, the report export tables in `BooksVoucherController::buildReport`, and the screen `ReportsTab.jsx`. Skimmed: `StockMovement.jsx`. Not read: the tests. Nothing was run; the live group and ledger lists were checked by hand.

No fixes are applied. Each one needs the owner's agreement first.

---

## A. Problems that affect several reports

| # | Finding | Confidence |
|---|---|---|
| A1 | **Two filtering rules for cost centre and branch.** The day book filters on the voucher header (`vouchers.cost_centre_id`, `location_id`). The ledger statement, trial balance and P&L filter on the entry lines (`voucher_entries.cost_centre_id`, `location_id`). A voucher split across cost centres shows in full in the day book and only partly everywhere else. | Confirmed. **Owner's direction:** see section K. |
| A2 | **`LedgerService::balance()` ignores branch limits**, while the reports apply them. Anything that compares the two mixes bases. Example: the reconciliation's receivables check takes the debtors group balance (company-wide) against the ageing total (limited to the person's branches), so a branch-limited user sees a false difference. The tax return's "closing owed" has the same cause. | Confirmed |
| A3 | **"Limited to your branches" banner is missing** on the tax return, withholding register and ratio analysis, although the figures are limited. Trial balance, P&L, balance sheet, ledger statement, day book and ageing return the flag. | Confirmed |
| A4 | **Default periods disagree.** Ratio analysis and money flow default to 1 January of the current calendar year, ignoring the configured financial year. Day book and ledger statement default to all time. | Confirmed |
| A5 | **No limits or paging.** The day book returns every matching voucher. The ledger statement loads every entry from the beginning up to the end date, even to show one month. Ageing returns every open bill. These get slow on years of history; stored closing balances (the plan's year-end close) address the ledger statement. | Confirmed |
| A6 | **Group lookups by name** (`LedgerGroup::where('name', ...)->first()`, and the ratio service's own name map). If two groups share a name, or a group is renamed, the wrong group or none is used. This also affects `isUnderGroup`, used by several services. | Confirmed (the pattern). The live list (39 groups) has no duplicate names, so no wrong match today. |
| A7 | **Transaction identifiers are not shown.** The ledger statement and day book show voucher number and narration only. Cheque number and dates (`voucher_instruments`), M-Pesa code (`voucher_tenders.reference`) and reference numbers are stored but not displayed. This is also what reconciliation will need. | Confirmed |

---

## B. Day book

| # | Finding | Confidence |
|---|---|---|
| B1 | Cost-centre filter uses the header, not the lines (A1). | Confirmed |
| B2 | Rows include drafts and cancelled vouchers, but the grand total counts posted ones only. The screen labels it "Posted total" and dims cancelled rows, so this is understood. | Confirmed (low; labelled) |
| B4 | No narration column, although narration is on every voucher. | Confirmed (low) |
| B3 | No paging (A5). | Confirmed |

## C. Ledger statement

| # | Finding | Confidence |
|---|---|---|
| C1 | Loads all history to the end date (A5). | Confirmed |
| C2 | For a branch-limited person the running balance starts from the company-wide opening balance and adds only their branches' movement. The banner explains this for the other reports; check the ledger statement says it clearly. | Confirmed (by design); Verify wording |
| C3 | No identifiers (A7). | Confirmed |
| C4 | **The screen drops the narration** the server returns for each row, and there is no "particulars" column naming the other side of the entry (Tally's standard). A statement shows only date, number, type and amounts. | Confirmed |
| C5 | The balance column is a signed number ("Dr +"); a credit balance shows as a negative. Accountants expect "1,000.00 Cr". | Confirmed (low) |
| C6 | The ledger picker is a plain drop-down of every ledger (189 today, 86 of them customers), with no search. | Confirmed (low) |

## D. Receivables and payables ageing

| # | Finding | Confidence |
|---|---|---|
| D1 | **Buckets are fixed in code** (current, 1-30, 31-60, 61-90, over 90). The plan moves them to settings. | Confirmed |
| D2 | Credit notes sit on the **payables** side and debit notes (and bounced-cheque journals) on the **receivables** side. The tax return uses the opposite pairing, treating a credit note as a sales return. This may be deliberate: a credit note with no invoice to offset leaves us owing the customer. | **Owner's direction (28 Oct):** an unapplied credit is not an ordinary unpaid invoice. Show it in a separate "Unapplied credits" section on the correct side (customer or supplier), clearly apart from outstanding bills, and make sure applying it later does not count it twice. Still **verify the direction** with a test case before changing the code. |
| D3 | Ageing only counts bills (`ref_type = new`). Advances and on-account receipts are not in it, so the total never equals the debtors or creditors balance. The reconciliation note admits this; the ageing page should show "unallocated" beside the total. | Confirmed |
| D4 | Ageing is by due date only. The Tally dashboard offers bill date or due date. | Confirmed (enhancement) |
| D5 | **Bills are crammed into one line of faint text** under each party ("number (amount, days)" joined together). They cannot be clicked, and the party cannot be opened to its ledger statement. With many bills it is unreadable. | Confirmed |
| D6 | The export has the party totals but not the bills behind them. | Confirmed (low) |

## E. Tax return

| # | Finding | Confidence |
|---|---|---|
| E1 | **`closing_owed` ignores the report's end date.** It comes from `TaxLedgerService::position()`, which takes no date, so a past-period return shows today's figure. The grand total `owed` is the same. | Confirmed |
| E2 | **Brought forward with no start date.** `balance($control, null)` means "all time", so with an empty From date, "brought forward" equals the whole balance instead of nothing. | Confirmed |
| E3 | For withheld tax types, brought forward is always 0 and closing owed is today's figure (E1). | Confirmed |
| E4 | No branch banner (A3), and the branch-limited rows sit beside unlimited position figures (A2). | Confirmed |
| E5 | **The supplies split is not on the screen.** The server works out sales and purchases by tax nature (standard, zero-rated, exempt, out of scope, unclassified), which is what a VAT return asks for, but only the export shows it. | Confirmed |
| E6 | The screen labels the closing figure "Owed to the authority at the end", which reads as the period's end although it is today's figure (E1). | Confirmed |

## F. Withholding certificates

| # | Finding | Confidence |
|---|---|---|
| F1 | No branch banner (A3). | Confirmed |
| F2 | "Awaiting certificate" counts only certificates in the chosen period, not all outstanding ones. Check that this is what finance expects. | Verify |
| F3 | No payment identifiers on the row (A7). | Confirmed (low) |
| F4 | **Mixed currencies on one screen.** Each row shows gross and withheld amounts in the voucher's own currency, without the currency code, while the totals underneath are in the base currency. With any foreign-currency receipt the column does not add up to the total. | Confirmed |

## G. Ratio analysis

| # | Finding | Confidence |
|---|---|---|
| G1 | **Group names in the code do not match the seed scripts' casing.** The service looks up `Cash-in-Hand` and `Stock-in-Hand` (capital H) in a case-sensitive PHP map. The scripts create and search `Cash-in-hand` and `Stock-in-hand`. If the live groups are named like the scripts, cash shows as 0 and the stock group is skipped. Stock has a fallback to the Stock ledger; cash has none. | **Confirmed by the live group list** (28 Oct): the groups are `Cash-in-hand` and `Stock-in-hand`, so the code's names do not match and cash shows 0. The service also looks for `Bank OD A/c`, but the live group is `Bank OD Accounts`, so overdrafts are never counted. |
| G2 | The name map keeps the first group when names repeat (A6). | Confirmed |
| G3 | Default start is 1 January, not the financial year (A4). | Confirmed |
| G4 | **Capital excludes earlier years' profit.** The books have no closing, so "Capital Account + this period's profit" understates equity from the second year on. Debt/equity and return on investment drift. The year-end close and retained earnings fix this. | Confirmed |
| G5 | Each run builds a full trial balance and two ageing reports. Slow on large books. | Confirmed |
| G6 | Receivable days uses the whole debtors balance, including advances not tied to bills. | Confirmed (low) |
| G7 | No branch banner (A3). | Confirmed |

## H. Stock movement

| # | Finding | Confidence |
|---|---|---|
| H1 | Default start is 1 January (A4). | Confirmed |
| H2 | **The name promises more than it shows.** It counts only sales, cash sales, credit notes, purchases and debit notes. Stock journals, transfers between branches, wastage and stock loss, manufacturing and delivery notes are not in it. It is a "what we traded with whom" report, not a stock in/out report. | Confirmed |
| H3 | Values use the exchange rate stored on the voucher, not the restated base the other reports use (`RestatedBase`), so after a change of base currency its values disagree with the ledgers. | Confirmed |
| H4 | Treats a credit note as a sales return and a debit note as a purchase return, as the tax return does. This is the opposite of the ageing report (D2), which strengthens the case that ageing has the pairing backwards. | Confirmed (supports D2) |
| H5 | Walk-in and cash customers are grouped by the name typed on the voucher, so spelling differences make separate rows. | Confirmed (low) |
| H6 | No export, and no branch banner although branch limits apply. | Confirmed |

## H2. Money flow (Cash page; feeds the plan's cash flow and visuals)

Not one of the eight reports, but it is in the same service and the plan's cash flow statement and Extras charts will build on it.

| # | Finding | Confidence |
|---|---|---|
| M1 | The money accounts are found by group name (`Bank Accounts`, `Cash-in-hand`). The plan's configurable groups should feed this instead. | Confirmed |
| M2 | Uses the amounts as posted (`base_amount`), not the restated base (same as H3). | Confirmed |
| M3 | **Transfers between our own accounts inflate the totals.** Moving 100,000 from the bank to petty cash counts as 100,000 out and 100,000 in. They are labelled by group, but the "money in" and "money out" totals include them. | Confirmed |
| M4 | **Split-tender sales become "Adjustments".** A cash sale paid 600 cash plus 400 M-Pesa, against sales and VAT lines, fails the "do the other lines add up to this money line?" test for each tender, so both tenders are put under Adjustments instead of Sales and VAT. Point-of-sale split payments will hit this often. | Confirmed (from the logic; worth a test case) |
| M5 | Default start is 1 January (A4). | Confirmed |

## L. Stock journal and stock reports (Purchases page; added 28 Oct)

Read in full: `StockJournalController`, `StockReportService`, `StockReportController`, the routes; skimmed `StockJournal.jsx` and `StockReports.jsx`. These are being ported line by line, so most of what they do is right and is kept; the items below are what the engine improves around them.

| # | Finding | Confidence |
|---|---|---|
| L1 | Stock summary, monthly and dashboard default to 1 January (`startOfYear`); the screen's default From is `yearStart()` (A4). The journal has no default (all time). | Confirmed |
| L2 | **Two copies of the movement-kind labels:** `StockJournalController::TYPES` and `StockReportService::movementLabels()`. They match today but can drift. | Confirmed |
| L3 | No export on the journal or any stock report. | Confirmed |
| L4 | The journal has no totals for the filtered rows, and its search cannot find a voucher number although the number is shown. | Confirmed (low) |
| L5 | The screens check both the catalogue permission on the route (`stock.view`) and a role helper (`canReadFinance`). Two permission styles for one screen. | Confirmed (low) |

## R. Stock reports: points to keep and to improve

| # | Finding | Confidence |
|---|---|---|
| R1 | **Keep:** opening stock is counted as the opening balance whatever its date; transfers are hidden company-wide and shown when a branch is chosen; "negative" and "no cost" flags; a value is quantity × the cost the movement carried, so any past date can be asked for. | By design |
| R2 | The summary builds its date conditions by putting the dates into the SQL text rather than binding them. It is safe today because the dates are normalised first, but it is a pattern to avoid; the port keeps the results and binds the values. | Confirmed (low) |
| R3 | **Stock query runs a whole summary** (for today, for the item's kind) just to list the other items in the same group. Slow on big catalogues. | Confirmed |
| R4 | Stock reports read `stock_movements`, the books read vouchers. They can disagree; the reconciliation's stock check exists for this and moves onto the engine. | Confirmed (by design) |
| R5 | Branch scope for these reports is the `stock` module, for the books reports `books`. Both must be kept when the reports are listed in the Reports page. | Confirmed |

## H3. The reports screen as a whole

| # | Finding | Confidence |
|---|---|---|
| S1 | **The screen's default From date is 1 January** (`yearStart()` in `booksFmt.js`) for every range report, whatever the financial year. | Confirmed |
| S2 | Branch and cost-centre pickers appear only on the day book, ledger statement, trial balance and P&L. Ageing, tax, withholding and ratio analysis are still limited to the person's branches, with no picker and no banner. | Confirmed |
| S3 | Every change to a date or filter fires a new request straight away; no "Run" button or delay. Heavy reports (ratio analysis builds a trial balance and two ageings) run on each keystroke in a date field. | Confirmed |
| S4 | Empty reports say "Nothing posted for this period", including the as-of reports where there is no period. | Confirmed (low) |
| S5 | Only some rows open the voucher (day book, ledger statement, withholding). Ageing parties and bills, tax rows and ratio figures do not drill down. | Confirmed |

---

## I. Suggested order of fixes (for agreement, nothing applied)

1. **Quick, low-risk:** G1 (names confirmed wrong), E2, E5 (show the supplies split), E6 wording, A3 and H6 (banners), C4 (show narration), F4 (show currency or base amounts), S4 wording.
2. **Agreed by the owner, needs building:** A1 and B1 (day book with both views), D2 and D3 (unapplied credits section; confirm the direction with a test case first; H4 supports changing it).
3. **Needs a decision:** A4 and S1 (financial year as the default period), F2, H2 (rename to "Trade by party and item", or widen it to real stock in/out), M3 (show transfers separately and leave them out of the totals), M4 (attribute split tenders properly).
4. **Larger, folded into the rebuild:** E1 and A2 (a dated, branch-aware balance function used by every report), A5, G4 and G5 (stored closing balances and the year-end close), A7 (identifiers shown), D1 (ageing buckets in settings), D4 (bill-date toggle), D5 and S5 (drill-down everywhere), A6 and M1 (look groups up by id or by a stable code), H3 and M2 (one currency rule), S2 and S3 (one filter bar with a Run button).

## J. Questions answered by the owner (28 Oct)

1. **Live group list:** received (39 groups). It confirms G1, shows no duplicate names (A6), and gives the exact statement mapping in the plan, section 3.
2. **Credit notes (D2, D3):** keep visible in the customer or supplier records; never treat as an ordinary unpaid invoice; show a valid unapplied credit as an available credit, separate from outstanding bills; the entries must reflect the real transaction and must not duplicate the credit when it is applied.
3. **Cost-centre split (A1):** see section K.

## K. Decisions that change the existing reports

**Day book (A1, B1).** The header's cost centre is the default classification, not a replacement for line-level allocations.

- **General day book:** each voucher once, with its full amount; expand a row to see the cost-centre split.
- **Cost-centre view:** each allocation under its own cost centre (one voucher number, several rows).
- **Totals:** a voucher's full amount is never counted once per cost centre.
- All other reports keep filtering on the entry lines, so every report now agrees with the day book's cost-centre view.

**Ageing (D2, D3).**

- Outstanding bills, in buckets, as now.
- Below them, a separate **Unapplied credits** section: credit and debit notes with no invoice to offset, and on-account receipts and payments.
- A net line (bills less credits) that can be compared with the ledger balance.
- Applying a credit later reduces it once, through the existing "against" reference.

**Ratio analysis (G1).** Look groups up by id (or a stable code) so casing and renames cannot break it. Fix `Bank OD A/c` to the real group, `Bank OD Accounts`.
