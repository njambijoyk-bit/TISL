# Branch profit and loss (DRAFT, nothing built, nothing decided yet)

Wish: every branch (location) carries its own profit figures, and shared costs have somewhere honest to live.

## What the books do today (checked in the code)

- Every voucher has one `location_id` (the branch it was made at). Conversions copy it: a delivery note or invoice made from an order keeps the order's branch.
- Voucher **entries** (the ledger lines) have **no** branch of their own. They are only ever read through their voucher.
- Reports: the day book and parts of the dashboard filter by branch. The **trial balance, profit and loss and balance sheet are company-wide only**.
- Stock sits per branch in batches (quantity and cost). A transfer posts nothing and the batch **cost travels with the stock**, so when the receiving branch later sells it, the cost of goods sold uses the original cost.
- Numbering already has branch series (`voucher_series.location_id`).
- Branches already carry their own currency and tax district. Amounts are restated to the base currency in reports (`RestatedBase`).
- Employees have a free-text `work_location`, not a real branch. Payroll posts one journal for the company.
- A voucher that is not given a branch quietly gets the **default branch**. So shared costs (rent of the head office, a company-wide bill) would silently pile up in whichever branch is the default. That is the main way branch profit would be wrong today.
- Staff branch scoping (who may see which branch) is a separate plan: `docs/BRANCH_SCOPING_PLAN.md`.

## The idea

Treat each branch as a **profit centre** for reporting. Do not split the company into separate sets of books. Same ledgers, same vouchers, but every income and cost line can be attributed to a branch, and reports can show a column per branch.

### Three levels, build in this order

**Level 1: branch profit and loss (management report).**
- Add a nullable `location_id` to `voucher_entries`. Empty means "the voucher's branch". A single voucher can then split lines across branches (one rent bill for three shops, one journal for several branches).
- Reports group by `COALESCE(entry.location_id, voucher.location_id)`. Profit and loss, trial balance and the dashboard gain a branch filter, plus a **by branch** view: one column per branch and a total.
- **Head office / shared** is just a location with kind "other" (or a new "head office" kind) that sells nothing. Shared costs are posted there on purpose, instead of landing in the default branch. The by-branch view shows it as its own column.
- Gross profit per branch is already honest because cost travels with the batch: sales at Shop A less the batch cost of what Shop A sold.

**Level 2: shared costs and payroll.**
- Payroll: give an employee a real branch (`employees.location_id`), and have the payroll journal split salary expense by branch.
- Allocation of shared costs by rule, done **at report time, not by posting**: a rule maps a ledger or ledger group to percentages per branch, or to a basis (share of revenue, headcount, floor area). Nothing is posted, so it can be changed and re-run for any past period without touching the books. Shown as its own block: "branch profit before allocations" and "after allocations".

**Level 3: inter-branch accounting (only if you need it).**
- Transfers at cost need nothing more than Level 1.
- Transfer **at a price above cost**, branch balance sheets (a branch's own cash, debtors and stock) and inter-branch loan accounts need posting entries for transfers. That means a transfer becomes a posting document with branch-level stock and "due to or from branch" ledgers. It is a real project. Only do it if branches become separate legal or tax entities, or if branch managers are paid on profit that includes a transfer mark-up.

### A cheap middle step: branch stock value
Stock value per branch can be shown straight from the batch balances (quantity times unit cost) without posting anything. It gives a "branch stock" figure beside the profit figures, and covers the most asked-for balance-sheet number.

## Rules that need to be written down

1. **Which branch gets a sale?** The branch on the order (online: the branch the customer chose; shop: where it was rung up). Income and the cost of goods both land there, because the delivery note and the invoice keep the order's branch.
2. **Which branch pays an expense?** The branch on the bill or journal line. No branch chosen means the default today; with this change the form should ask, and a head-office location exists for the shared ones.
3. **Preorders:** income and cost go to the branch of the preorder voucher.
4. **Customer money (receipts, advances):** these are balance sheet movements, not profit, so they do not affect branch profit. They keep their branch for the registers.
5. **Discounts, promo, loyalty and referral cost** are entries on the voucher, so they follow the voucher's branch.
6. **Currency:** a branch in another currency reports in the base currency like everything else.
7. **Moving a voucher to another branch** after posting changes past branch reports. It should be refused in a closed period, and allowed (with a log line) in an open one.
8. **Who sees what:** a branch manager sees only their branch's figures. Admin, super admin and finance see all. This uses the branch scoping plan.

## Effects on other work

- **Preorders** are taken and filled per branch, so their money lands in the right branch only if this exists first. That is why preorders are on hold.
- Location capabilities (already built) already define which branches sell, deliver, receive and make things. A "head office" kind fits there.
- The dashboard branch filter becomes the natural home for the by-branch view.

## Phases

1. Script: `voucher_entries.location_id`, a head office kind, and backfill nothing (empty means "the voucher's branch").
2. Reports: branch filter and by-branch columns for profit and loss and the trial balance. Voucher forms get an optional branch per entry line for journals and payments.
3. Employee branch and payroll split. Head-office postings for shared costs.
4. Allocation rules at report time.
5. Branch stock value.
6. (Only if needed) posting transfers, inter-branch accounts, transfer pricing, branch balance sheet.

## Open questions

1. Are your branches separate legal or tax registrations, or one company with several places? (Decides whether Level 3 is ever needed.)
2. Which profit do you want first: gross (sales less cost of goods) per branch, or net after the branch's own costs? (Level 1 gives both. Allocation of shared costs is Level 2.)
3. A head office location for shared costs: agreed?
4. How should shared costs be shared: fixed percentages, by revenue, by headcount?
5. Do you want a branch balance sheet, or is profit plus branch stock value enough?
6. Transfers at cost only?
7. Should salaries be split by the employee's branch?
8. Branch managers see only their own branch: agreed?
