# Budgeting: test plan

How to test everything built for budgets, in the order it makes sense to try it. Each case has the steps, then what you should see. Tick the box when it behaves. Where a case fails, note the case number, what you did and what you saw.

Where things are:
- **Books → Budgets** (the tab between Gift vouchers and Reconciliation): making and working on budgets, versions, rows, transfers, overspends waiting for approval, templates, initiatives.
- **Configuration → Budget settings**: how a voucher over budget is treated, the check basis, carry-forward, non-cash groups, exceptions, the "Count open purchase orders as spent" switch, and the cash forecast assumptions.
- **Reports → Analysis**: *Budget against actual* (key G Z) and *Master budget*.

---

## 0. Before you start

**Scripts run, in order** (Part A, then B, then C for each; `php artisan access:seed` afterwards):
239, 240, 241, 242, 243, 244, then 252 (template assumptions). 245 to 251 are not budget scripts but run them too if you have not.

**People and permissions.** Make three test users so you can see each rule bite:

| User | Holds |
|---|---|
| Planner | `books.planning` (makes and edits budgets), `books.post` (posts vouchers) |
| Approver | `books.planning`, `books.budget.approve` |
| Spender | `books.post`, `books.budget.exceed` (never stopped by a budget) |

You also want a plain user with `books.post` only (stopped by budgets) and one with `books.view` only (read only).

**Test data.** Use a quiet branch or a test period so nothing real is touched:
- A financial year that contains today.
- Expense ledgers: *Test Rent* (Indirect Expenses), *Test Travel* (Indirect Expenses), *Test Fuel* (Direct Expenses). Income ledger *Test Sales*.
- A cost centre *Test CC* with a child *Test CC Sub*, a department *Test Dept*, a branch *Test Branch*.
- Two initiatives: *Test Project* with a sub-initiative *Test Project Phase 1*.
- A supplier ledger and a bank ledger.

---

## 1. Making a budget

| # | Steps | Expect |
|---|---|---|
| 1.1 | Books → Budgets → **New budget**. Name it "Test 2026", type Operating, span the whole financial year. | A budget and a draft *Original* version appear. The version bar shows Draft. |
| 1.2 | Add a row for *Test Rent* (a ledger), then a row for a **group** (Indirect Expenses). | Both rows show. A group row covers every ledger under it. |
| 1.3 | Add a row for *Test Travel* with *Test CC* and *Test Dept* and *Test Branch* chosen. | The row shows its dimensions as "Test CC › Test Dept › Test Branch". |
| 1.4 | Add a row for *Test Fuel* with initiative *Test Project*. | The initiative shows on the row. |
| 1.5 | Add a **recovery** row on *Test Rent* (an expense recovered, such as sub-letting). | It shows as recovery and counts against the rent row as a deduction. |
| 1.6 | Try saving two identical rows (same account and dimensions). | It is refused or merged; no silent duplicate. |

## 2. Filling the months

For each method, put the row on a different ledger and check the figures. Use a 12-month budget.

| # | Method | Steps | Expect |
|---|---|---|---|
| 2.1 | **Fixed** | Amount 1,000 | 1,000 in every month. |
| 2.2 | **Annual** | Total 12,000 | 1,000 a month. Total 10,000 over 12 months gives 833.33 each with the cents spread so the year adds to exactly 10,000. |
| 2.3 | **Seasonal** | Total 12,000, give two months a bigger share | Months follow the shares and add to 12,000. Months without a share take an equal part. |
| 2.4 | **Quantity × rate** | Quantity 4, rate 250 | 1,000 a month. |
| 2.5 | **Percent of another row** | Take 10% of the rent row | Each month is 10% of that month's rent. Change the rent and the percent row follows. |
| 2.6 | **Last year plus growth** | Growth 5% on a ledger that has postings last year | Each month is last year's actual × 1.05. A ledger with no history gives zeros. |
| 2.7 | **Hand typed** | Type different amounts | They stay as typed. Changing the method asks before replacing them. |
| 2.8 | **Copy** | Copy another row | The months match, and stay separate afterwards. |
| 2.9 | Row totals and the grand total | | Totals match the months by hand. Sections (income, expense) total separately. |

## 3. Versions and approval

| # | Steps | Expect |
|---|---|---|
| 3.1 | As Planner, **Submit** the Original. | Status becomes Submitted. The rows lock. |
| 3.2 | As Planner again, try to **Approve** it. | Refused when "a budget needs a second approver" is on (Reports settings → Approvals). |
| 3.3 | As Approver, **Approve**. | Status Approved; it becomes the current version for its dates. |
| 3.4 | As a user without `books.budget.approve`, look for Approve. | Not offered, or refused. |
| 3.5 | Turn the second-approver rule **off**, submit and approve with the same person. | Allowed. Turn it back on. |
| 3.6 | **New version** (a revision) from the approved one. Change a row. | The revision is a draft; the approved one is unchanged. Submit and approve it. | 
| 3.7 | Look at the version list. | Original and Revision 1 with who did what and when; the latest approved is current. |
| 3.8 | Reject a submitted version with a reason. | Back to draft with the reason shown. |

## 4. Templates and assumptions

| # | Steps | Expect |
|---|---|---|
| 4.1 | With a version open, **Save as template** "Operating". | The template lists with its line count. Amounts are not kept, only how the months were filled. |
| 4.2 | Open **Lines** on the template. | Every row with its method and dimensions. Remove one line. |
| 4.3 | **Make a budget** from it for another span (say next year, 12 months). | A new budget with a row per line, months worked out again for the new span. Hand-typed lines start empty. |
| 4.4 | Percent lines in the new budget | They point at the right row of the new budget. |
| 4.5 | **Assumptions → + Assumption**: "Inflation" 6.5%, "Staff rise" 4. Save. | The template shows "Assumptions: Inflation 6.5% · Staff rise 4%". |
| 4.6 | On a *last year plus growth* line, pick **Inflation** in its dropdown. On a *percent* line, pick **Staff rise**. | The dropdown shows the assumption; saved. |
| 4.7 | **Make a budget** again. | The assumptions show in the form with their values. |
| 4.8 | Change Inflation to 10 in that form (what-if) and make the budget. | The growth line uses 10, not 6.5. The template still says 6.5. |
| 4.9 | Make the budget with the values untouched. | It uses 6.5. |
| 4.10 | Remove the Inflation assumption and save. | The line that used it keeps the number it had and stops pointing. |
| 4.11 | Delete the template. | Budgets already made from it are untouched. |

## 5. Budget against actual (the report)

Post a few real vouchers first (section 6 gives some), so there are actuals.

| # | Steps | Expect |
|---|---|---|
| 5.1 | Reports → Analysis → **Budget against actual**, group by **Account**. | Every budgeted line with budget, actual, gap, % used, remaining. |
| 5.2 | Group by **Cost centre**, **Department**, **Branch**, **Initiative**. | Figures regroup. A voucher posted to *Test CC Sub* shows under *Test CC*'s total. |
| 5.3 | Read the gap on an income line and on an expense line. | Income under budget reads as bad news; expense under budget as good news. |
| 5.4 | Month by month view. | Months add to the line totals. |
| 5.5 | Drill into a row. | Opens the ledgers behind it and their statements. |
| 5.6 | **Export** (PDF, CSV). | The file matches the screen. |
| 5.7 | Choose a version that is not current. | The report says which version it used. |
| 5.8 | Initiative row for *Test Project* | Actuals are what was posted to it and to *Phase 1*. |

## 6. Posting controls (vouchers over budget)

Set up a small budget first: *Test Travel* 1,000 for the current month, approved. Controlled vouchers are **purchase, payment and journal**; income and sales are never held up.

**Company-wide choice** (Budget settings → Budget controls → "When a voucher goes over budget"):

| # | Mode | Steps (as the plain `books.post` user) | Expect |
|---|---|---|---|
| 6.1 | **Do not check** | Post a 5,000 travel payment. | Posts, no message. |
| 6.2 | **Warn and post** | Post a 5,000 travel payment. | Posts, with a message that it is over budget by 4,000. |
| 6.3 | **Post, then wait for approval** | Post 5,000. | Posts, and shows in Budgets → **Overspends** waiting. |
| 6.4 | As Approver, **accept** it. | Leaves the waiting list; recorded as accepted by name. |
| 6.5 | Post another and have the Approver **turn it down** with a note. | Recorded as turned down. |
| 6.6 | **Block** | Post 5,000. | Refused with a message that says how far over it would go. |
| 6.7 | Any mode | As the **Spender** (`books.budget.exceed`), post 5,000. | Never stopped or held; told only. |

**What is checked against what** (Check against):

| # | Choice | Steps | Expect |
|---|---|---|---|
| 6.8 | **Year to date** | In month 3, a quiet months 1 and 2 leave room. Post a payment bigger than month 3 alone. | Allowed while within the budget so far. |
| 6.9 | **This month only** | Same payment | Stricter: over for the month. |
| 6.10 | **The whole budget** | Same payment | Looser: judged against the full year. |
| 6.11 | **Carry forward unused budget** (Budget settings) on, basis month | Leave last month under; post this month | Last month's leftover counts as room this month, also in the report. |

**The warning before it is over:**
| 6.12 | Set "Warn when this much is used" to 80. Post a payment taking the line to 85%. | A gentle warning, not a breach. 0 turns it off. |

**Exceptions** (Budget settings → exceptions): 
| 6.13 | Add an exception: *Test Rent* = Block while the company is on Warn. | Rent is blocked, others warn. |
| 6.14 | Add one for *Test Dept* and one for *Test CC*. | They override the company choice for their lines. The most specific one wins. |
| 6.15 | Remove them. | Back to the company choice. |

**Edits and cancels:**
| 6.16 | Edit a voucher that was over budget so it is now within. | The waiting overspend record is replaced or cleared. |
| 6.17 | Cancel a voucher that was waiting. | The waiting overspend disappears. |

**Voucher types:**
| 6.18 | Post a *sales invoice* and a *receipt* over a budget line. | Never held up. |
| 6.19 | Post an *accounting purchase invoice* (accounting mode) to *Test Travel*. | Checked like any purchase. |

## 7. Open purchase orders as commitments (new)

| # | Steps | Expect |
|---|---|---|
| 7.1 | Switch **Count open purchase orders as spent** on. | Saved. |
| 7.2 | Make an open purchase order of 600 to *Test Travel* (a ledger line). Then post a 600 payment to Travel. | Total 1,200 against a 1,000 budget: over by 200, the message says 600 is already committed on open purchase orders. |
| 7.3 | Switch the setting off and repeat. | Only 600 counts: within budget. |
| 7.4 | With it on, make a **purchase from that order** (convert it). | It is not counted twice: the order is left out while its purchase is checked. |
| 7.5 | Receive half of the order (invoice half). | Only the half still to arrive counts as committed. |
| 7.6 | Cancel the order, or fully invoice it. | It stops counting. |
| 7.7 | An order dated in another month, with carry-forward on and basis month. | Only this month's orders count. |
| 7.8 | An order line posting to a non-expense ledger (stock, an asset). | Not counted. |

## 8. Transfers, scenarios, carry forward

| # | Steps | Expect |
|---|---|---|
| 8.1 | **Transfer** 200 of budget from *Test Rent* to *Test Travel* for one month. | Rent's room falls by 200, Travel's rises by 200, in the report and in the posting check. The history shows who moved it and why. |
| 8.2 | Reverse the transfer. | Both back. |
| 8.3 | Make a second budget for the same period as a **scenario** (for example "Best case"). | Both exist; only the current version of the live budget controls vouchers. |
| 8.4 | Look at carry forward after a transfer. | Transfers are included in a month's room. |

## 9. Master budget and cash

| # | Steps | Expect |
|---|---|---|
| 9.1 | Reports → Analysis → **Master budget**. | Every budget covering the months, each at its current version, brought into one plan: income, expenses and result by month. It says which budgets and versions it used. |
| 9.2 | Look at the cash budget under it. | Opening cash, income arriving after the customers' delay and only the share collected, expenses leaving after the supplier terms, lowest month, shortfall months, and a plain yes or no on whether the plan can be financed. |
| 9.3 | Budget settings → forecast assumptions: change the collection delay, collection %, supplier terms, tax. | The cash budget changes accordingly. (This is the button that used to do nothing.) |
| 9.4 | Choose a group such as Depreciation as **non-cash**. | It uses no cash in the cash budget. |
| 9.5 | Balance-sheet rows | Asset rows are cash out, liability and equity rows cash in; a reduction reverses it. |
| 9.6 | Two overlapping budgets | Both appear in the plan; the page says which it took. |

## 10. Initiatives on vouchers and reports

| # | Steps | Expect |
|---|---|---|
| 10.1 | On a payment, choose initiative *Test Project Phase 1* and post. | Saved with the initiative; its lines take it. |
| 10.2 | With "lines may differ", give one line another initiative. | That line keeps its own. |
| 10.3 | Budget against actual by initiative | The actual shows under *Test Project* and *Phase 1*. |
| 10.4 | Post controls for an initiative row | A voucher to the initiative is checked against it. |
| 10.5 | **Day book** with the new **All initiatives** filter set to *Test Project*. | Only entries of that initiative and what is under it. A note says the figures will not balance on their own. |
| 10.6 | **Ledger statement**, **Profit and loss**, **Trial balance** with the filter. | Narrowed the same way. |
| 10.7 | Vouchers posted before initiatives existed | Show under no initiative; nothing changed in them. |

## 11. Backup, export and import

| # | Steps | Expect |
|---|---|---|
| 11.1 | Make a backup. | Budgets, versions, rows, templates, initiatives, control rules, overrides and transfers are in it. |
| 11.2 | Export the company to a **.wnkjap** file; open it. | The budget sections are present. |
| 11.3 | Import into another (empty) company or restore the backup. | Budgets come back with their versions and figures. |

## 12. Permissions and read-only

| # | Steps | Expect |
|---|---|---|
| 12.1 | `books.view` only | Sees budgets and reports; no Add, Submit, Approve, Transfer or template buttons. |
| 12.2 | `books.planning` without approve | Can make and submit; cannot approve. |
| 12.3 | Settings | Only a person allowed to change Reports settings can change the controls. |
| 12.4 | Every change to controls, exceptions, approvals | Appears in the settings log with who and when. |

## 13. Edge cases worth a try

- A budget spanning two financial years: figures and the check work in both.
- A month with no budget row for an account: no breach is raised for it.
- A voucher in a foreign currency: judged in the base currency at its own rate.
- A voucher with several expense lines on one budget row: counted together.
- A budget row on a **group**: any ledger under it counts, and a ledger moved into or out of the group changes the result.
- A very large amount, zero and negative amounts, and a recovery bigger than the expense.
- Edit a posted voucher's date into another month: the old month is released, the new one charged.

## 14. Known gaps (do not report as bugs)

- An approval route stored on a template is not built.
- Per-voucher-type choices for budget control (only company-wide and exceptions).
- The forecast's recurring items are not added to the master budget (they overlap budget lines such as rent and payroll). Actual cash to date is not overlaid on past months.
- Initiative is not added to payroll and other system-made vouchers.
- Per-customer and per-supplier payment delay from history, and payroll pulled from the payroll module, are later work.

---

## Sign-off

| Area | Tested by | Date | Pass / fail | Notes |
|---|---|---|---|---|
| 1 Making a budget | | | | |
| 2 Filling the months | | | | |
| 3 Versions and approval | | | | |
| 4 Templates and assumptions | | | | |
| 5 Budget against actual | | | | |
| 6 Posting controls | | | | |
| 7 Purchase order commitments | | | | |
| 8 Transfers and scenarios | | | | |
| 9 Master budget and cash | | | | |
| 10 Initiatives | | | | |
| 11 Backup and export | | | | |
| 12 Permissions | | | | |
| 13 Edge cases | | | | |
