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

## Control after approval
- Budget vs actual: variance amount and %, utilisation, remaining, drill-down to vouchers, by account / cost centre / department / branch / project.
- Thresholds (e.g. alert at 80%/100%).
- On posting a voucher: per company/department/account choose **warn**, **needs approval** or **block**. Availability = budget − posted (− approved commitments, optional).
- Transfers between lines (approval + audit trail); carry-forward/expiry per policy, off by default.
- Scenarios (best/expected/worst) as extra versions with a % driver on sales/costs.

## Build order (each step shippable, tests alongside)
1. Dimensions on lines + months screen with allocation methods; migrate 237 data.  
2. Versions + approval states (Draft → Submitted → Approved → Locked), revisions as copies.  
3. Templates and "create from template / copy".  
4. Budget-vs-actual report in Reports + Visual chart reads the new tables; drill-down.  
5. Controls on posting (warn / approval / block) + alerts.  
6. Transfers, carry-forward, scenarios.  
7. Cash budget and master budget (uses the forecast).  
8. Projects on voucher entries, project budgets.

## Forecast assumptions (the button)
The button went to Reports settings, far down a long page, so it looked like nothing happened. Fixed: the four assumptions (collection delay, collection %, supplier terms, tax) now sit on the Budgeting tab under the regular payments. Later: per-customer/per-supplier delay from payment history, payroll pulled from the payroll module, what-if switches.

## Decisions needed
1. Periods: monthly with quarter/annual roll-ups (recommended) or flexible?
2. Budget lines: ledger/group only (recommended first), or separate budget categories mapped to ledgers?
3. Scope of what can be budgeted: income + expenses first, then cash + capex, balance-sheet later?
4. Controls: warn-only first (recommended), approval/block in step 5?
5. Commitments (approved purchase orders) count against budget: yes/no?
