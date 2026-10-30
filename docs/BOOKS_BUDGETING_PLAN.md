# Books – Budgeting (plan, nothing built yet)

Today: `budget_lines` holds one amount per month for an expense/income **group or ledger** (script 237). No templates, versions, approvals, dimensions or controls.
Goal: a planning and control system – plan income, spend, cash and investment, then compare with what the ledgers actually posted.

## What the books already give us (so we build on it, not beside it)
- `voucher_entries.cost_centre_id` and `location_id` on every posted line (script 102), cost centres nested to any depth (100), departments (101), branches (locations).
- Projects exist as an app module but are NOT on voucher entries yet. Project budgets need a `project_id` on entries first (one extra script, same pattern as 102).
- `LedgerBalances::movement` is the single door for "actual"; budget-against-actual must read through it (no separate cache to drift).

## Concepts
1. **Template** – reusable structure: lines (ledger/group/category), allocation rule per line, assumptions, approval route.
2. **Budget** – one approved plan for a company/branch/department/period, made from a template or from scratch. Has **versions** (Original, Revised 1, Forecast). An approved version is never overwritten; a revision is a copy.
3. **Line** – account (ledger or group) + optional dimensions (cost centre, department, branch, project) + period amounts.
4. **Period amounts** – one row per month (quarter/annual are sums). Never only an annual total.

## Tables (script 239+, each Part A/B/C, claimed in the backup map)
`budget_templates`, `budget_template_lines`, `budgets`, `budget_versions`, `budget_lines` (+ dimension columns, all nullable), `budget_period_amounts`, `budget_assumptions`, `budget_transfers`, `budget_approvals`. `budget_actuals` is NOT built: actuals are computed from the ledgers.
Existing 237 `budget_lines` rows migrate into one "Imported budget" version, so nothing the owner typed is lost.

## Allocation methods (fill the months, then the person can still edit any month)
Manual · fixed monthly · equal split of an annual figure · seasonal profile (percent per month) · % of another line (e.g. marketing = 5% of sales) · quantity × unit rate · last year's actuals ± growth % · copy another budget/branch/template.

## Budget types (a type chooses which dimensions are required and which template lines show)
Operating, sales, purchases, payroll, capex, cash, project, departmental; **master** = the roll-up that feeds a cash budget (does the plan fit the cash?).

## Dimensions
All optional, any combination. One account across many cost centres; a project budget is project + account + period. Cost centres stay independent entities (optionally linked to a department/branch). Shared cost (rent split 50/30/20) is an allocation of ACTUALS via a distribution rule on the voucher, never a duplicate of the invoice.

## Initiatives (the budget dimension that is NOT the Projects module)
- Nested to any depth, like cost centres: Cash sales > Travel, Cost of goods, Stock. Optional link to a Projects-module project (not required).
- A line carries any mix of cost centre + department + branch + initiative (e.g. Cost centre B, Sales, Cash sales). Every dimension rolls up and drills down: initiative total -> child initiative -> account lines -> posted vouchers.
- An initiative may hold income, expense AND balance-sheet lines. The initiative view shows income - expense = margin; balance-sheet lines (stock, receivables) sit in their own block and are not added into profit.
- Same account can be income in one place and expense in another: the line's side comes from the account, with one override, **Recovery**: a line on an expense account that is expected to be credited (travel recharged to a customer). Net spend = expense budget - recovery; actual = debits - credits on that account, so a recovery posted as a credit to Travel reduces it. If the business books the recharge to an income account instead, it is simply two lines (Travel expense, Travel recharge income) in the same initiative, and the margin shows both.

## Control after approval
- Budget vs actual: variance amount and %, utilisation, remaining, drill-down to vouchers, by account / cost centre / department / branch / project.
- Thresholds (e.g. alert at 80%/100%).
- On posting a voucher: per company/department/account choose **warn**, **needs approval** or **block**. Availability = budget − posted (− approved commitments, optional).
- Transfers between lines (approval + audit trail); carry-forward/expiry per policy, off by default.
- Scenarios (best/expected/worst) as extra versions with a % driver on sales/costs.

## Build order (each step shippable, tests alongside)
1. **DONE** (script 239, `BudgetGrid`, `BudgetRowDetails`, `BudgetInitiatives`, `budgetMethods.js`): initiatives; cost centre / department / branch / initiative on rows; income, expense and balance-sheet rows; recovery rows; allocation methods (fixed, annual split, seasonal, % of another row, quantity x rate, last year plus growth, copy); 237 data carried over. Actuals by cost centre, department and branch are read from the books; an initiative has no actual until the posted entries carry it (step 8).  
2. **DONE** (script 240, permission `books.budget.approve`, setting `second_approver_budget`, `BudgetBar`): budgets with versions (Original, Revision n, Forecast, Scenario); Draft → Submitted → Approved → Locked (reopen from Locked, send back from Submitted with a reason); only a draft can be edited; a revision is a copy; approval history; the charts read the budget's newest approved version. Submitting needs `books.planning`, approving/sending back/locking/reopening needs `books.budget.approve`; the submitter cannot approve unless the Reports setting is switched off.  
3. **DONE** (script 241, `BudgetTemplateService`, `BudgetMethods` (server copy of the screen's fill rules), `BudgetTemplates`): save a version as a template (rows, dimensions and HOW months are filled, no amounts); make a new budget from it for any span, months worked out again (fixed, annual, seasonal, quantity x rate, percent of another line, last year plus growth read for the new year; hand-typed lines start empty); rename, delete, remove a line. Not yet: template assumptions (growth, inflation ...) as named inputs, and an approval route stored on the template.  
4. **DONE** (`BudgetAgainstActualReport`, `BudgetAgainstActualView`, Reports > Analysis, G Z): every budgeted line against the books, grouped by account / cost centre / department / branch / initiative, gap read as good or bad news, % variance, % used, remaining, month by month, drill to the ledgers and their statements, export through the engine. The Visual chart keeps reading expenses of the current version. Not yet: threshold alerts (step 5), drill from a cost-centre group into its vouchers (ledger statement opens without the cost-centre filter).  
5. **DONE** (script 242, `BudgetControl`, `books.budget.exceed`, Reports settings section `budget_control`, `BudgetControls`): on a purchase, payment or journal, each expense debit is checked against the budget rows it falls under (the voucher's cost centre and branch) for the year to date / the month / the whole budget; over budget does what the company-wide choice says (off, warn and post, post then wait for approval, block) unless an exception for the account, department or cost centre says otherwise; a person with `books.budget.exceed` is never stopped (told only); a gentle warning at a set percent used; every overspend is recorded, accepted or turned down by someone with `books.budget.approve` (a second person when that rule is on). Not built: counting approved purchase orders as commitments (a purchase order has no expense account on it to count against), per-voucher-type choices.  
6. **DONE** (script 243 for transfers; `BudgetTransferService`, `BudgetTransfers`; carry-forward is a Reports setting; scenarios need no script): after a version is approved, budget moves between two lines of it for one month by request, with a reason, accepted by a second person with `books.budget.approve`; the approved version is never edited, approved transfers are added wherever the plan is read (report, controls) and the request stays as the record. Carry-forward (off by default, `budget_carry_forward`): a month's unused expense budget rolls into the next month's room, in the report's month table and in the month check. Scenarios and forecasts are versions made as a copy with percent drivers (sales down 15%, rent up 10%, scoped to all / income / expenses / a group / a ledger), the drivers recorded; "Compare versions" sets income, expenses and result side by side against the first. Not built: carrying budget to the NEXT budget (a new year starts from a template or a copy), driver-based growth that compounds month by month.  
7. Cash budget and master budget (uses the forecast).  
8. Projects on voucher entries, project budgets.

## Forecast assumptions (the button)
The button went to Reports settings, far down a long page, so it looked like nothing happened. Fixed: the four assumptions (collection delay, collection %, supplier terms, tax) now sit on the Budgeting tab under the regular payments. Later: per-customer/per-supplier delay from payment history, payroll pulled from the payroll module, what-if switches.

## Decisions (owner)
1. Periods: monthly, quarterly and flexible periods all supported (months are stored; quarter/annual are sums; a flexible period is a named date range over months).
2. Lines: both ledger/group lines AND separate budget categories, with a mapping from category to ledgers (so a plan can exist before the chart of accounts is final, and actuals still compare).
3. Budgetable: everything – income, expenses, cash, capex, and later balance-sheet accounts and quantities.
4. Controls live in Budgeting settings. A permission decides who may exceed a budget: a person holding it posts and is approved; others get a warning. Per setting (company / department / account): **warn**, **post but await approval**, or **hard block**.
5. Commitments (approved purchase orders counting against budget): to be decided – explained to the owner.
