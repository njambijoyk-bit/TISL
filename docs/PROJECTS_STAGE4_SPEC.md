# Projects Stage 4: Money through Books (being built)

Status: the owner said "build" on 2026-11-17, accepting the two choices at the end. What is built so far is listed under "As built"; everything else is still design.

Every amount stays in the double-entry books. A project sees its money by reading Books, and moves money by preparing ordinary Books vouchers.

## The owner's answers (2026-11-17)

| Question | Answer | Built as |
|---|---|---|
| Held client money: one shared ledger or one per client? | Both | Each client money account is **pooled** (one bank ledger, a balance per client inside it) or **dedicated** (its own bank ledger). A balance can belong to **several clients jointly** (relatives who won a case together). |
| Retention: per client or company-wide? | Both | Configuration sets the default (one company retention ledger, or one per client); a project can override it. |
| Billing: post or draft? | Both, as a setting | A radio button in Configuration: **Post the voucher** or **Prepare a draft**. Posting needs `projects.money.bill` and follows the serious-action rules. A draft is posted later in Books. |
| Project on a voucher: required or optional? | Both | Per voucher type in Configuration: **required**, **optional** or **not shown**. Out of the box, optional everywhere. |

## What changes in Books

Two changes, both off until switched on. Existing vouchers, ledgers, balances and reports are untouched; the script only adds.

1. **The voucher form** gets a Project picker. Choosing a project or a phase fills the existing cost centre field. Shown and required per voucher type.
2. **Posting held money:** a new nullable column `voucher_entries.project_holding_id` says which client balance a line belongs to. On an account with its guard on, Books refuses to post a line that takes any balance below zero.

Not changed: budgets (Books' budget engine already controls spending by cost centre; a project budget is a Books budget on the project's cost centre), ledger creation (Books' ledger service), ageing, statements, tax, reports.

## In this stage

1. **Money tab** on a project, every figure read from Books: agreed (linked quotation or sales order), billed, paid, owed and how late, budget, spent, committed (open purchase orders), profit so far, held money, unused advance, retention held; by phase where a phase has its own cost centre.
2. **Project budget:** a Books budget on the project's cost centre, set from the tab with `projects.money.budget`; Books' budget control warns or stops spending as it already does.
3. **Ledgers from a project:** create a ledger (`projects.ledgers.create`) or a bank ledger (`projects.ledgers.bank`) in Books; Books owns it; listed on the project.
4. **Client money accounts:** pooled or dedicated; balances for one client or several jointly, each for a project; receiving into a balance; balances worked out from tagged Books lines.
5. **Paying out:** a Books payment from a balance; refused if it would go below zero; a serious action.
6. **Billing plans:** stages as shares of the agreed value, due on a date, when a phase is done or when the project reaches a stage; billing prepares a Books sales invoice on the project's cost centre, posted or drafted per the setting.
7. **Advances and retention:** an advance is a receipt to an advances ledger, deducted from bills until used; retention is a percentage held back on each bill to the chosen retention ledger; releasing retention is a serious action.

New serious actions: pay out of held money, release retention, post a bill (out of the box each needs nothing).

## Waits for Stage 5

Hourly billing, disbursements, write-offs and rates (they need timesheets and the work log).

## Permissions (all in the catalogue since Stage 1)

`projects.money.view`, `.money.budget`, `.money.bill`, `.money.retention`, `.money.held.view`, `.money.held.pay`, `projects.ledgers.create`, `projects.ledgers.bank`.

## Data: script `260_projects_money.sql` (adds only)

| Table | Holds |
|---|---|
| `project_client_accounts` | A client money account: its Books bank ledger, pooled or dedicated, guard on or off |
| `project_client_holdings` | A balance inside an account, and the project it is for |
| `project_client_holding_owners` | The client or clients a balance belongs to (several = joint) |
| `project_billing_stages` | A project's billing plan: share, when due, the voucher it became |
| `project_money_terms` | Per project: retention %, retention ledger override, advance ledger |
| `project_ledgers` | Ledgers created in Books from a project, and why |
| `voucher_entries.project_holding_id` | Books: which client balance a line belongs to (new, empty for every existing line) |

Shares and percentages are stored; amounts never are.

## Builds

| Build | Contents |
|---|---|
| 4.1 | Script 260, money settings, the project picker in Books' voucher form (required / optional / not shown per type) |
| 4.2 | The Money tab and project budgets |
| 4.3 | Ledgers from a project |
| 4.4 | Client money accounts, joint balances, receiving |
| 4.5 | Paying out, and the posting guard in Books |
| 4.6 | Billing plans and the post-or-draft setting |
| 4.7 | Advances and retention |

The whole Books test suite and Books browser checks run with every build.

## Choices made for the owner (to confirm)

1. Billing stages are shares of the agreed value (the linked Books quotation or sales order), not typed amounts, to keep "Projects never stores money". A project with no quotation linked cannot have a staged plan until one is.
2. Hourly billing, disbursements and write-offs wait for Stage 5.

## As built

### To run

1. `backend/database/sql/260_projects_money.sql` (after 257 to 259). Six tables, and one nullable column in Books, `voucher_entries.project_holding_id`, added only if it is not there. It adds only.
2. No permission seed.

### 4.1 Script 260 and the project picker on vouchers (done)

Screens: `docs/screens/projects-voucher-picker.png`, `projects-money-settings.png`.

- **Script 260** makes all the Stage 4 tables at once. The Books column is added through a prepared statement inside the guard, so it is added once and the script can run twice. No table holds an amount: shares and percentages only (a test checks the columns).
- **Service:** `VoucherProjects`. **Controller:** `MoneyController`.
- **Money settings** (Configuration, new Money tab; changed with `projects.config.manage`; a versioned settings part): bills posted or prepared as drafts (radio, default draft); retention to one company ledger or a ledger per client (radio, default company); and per kind of Books voucher, a project required, optional or not shown (default optional everywhere, so Books works exactly as before until someone chooses).
- **The picker on Books' voucher form:** a Project field beside Cost centre, listing the open work the person may see and each phase that has its own cost centre ("M-0413 › Pleadings"). Choosing one fills the cost centre field Books already had; choosing a project's cost centre directly shows the project. A closed project is still shown on a voucher already posted to it. When Projects is not licensed, not on, or refuses the person, the picker does not show and the form is as before.
- **Required is enforced only on the Books form's own save and change doors** (`BooksVoucherController::store` and `update`): a refused voucher reads "A payment must be posted to a piece of work. Choose one under Project.", like any other Books refusal. It is never in the shared save path (`VoucherService`) that the shop, the till and payment gateways use, so a shop order is never refused for having no project (a test checks both).
- **Books changes in this build:** the picker on the form, and one call in each of the two doors. Nothing else in Books.
- **Routes:** `GET /projects/voucher-picker` (needs `books.post`), `GET`, `PUT /projects/configuration/money`.
- **Tests:** `tests/Feature/ProjectsVoucherPickerTest.php` (5). Every Books, voucher, budget, cost centre and ledger test was run with it and passes (2,131 assertions). `frontend/e2e/projects-voucher-picker-ui.mjs` (13 checks) opens the real Books voucher form with a stand-in API.

### 4.2 The Money tab (done)

Screen: `docs/screens/projects-money.png`.

- **Services:** `ProjectMoney` (reads every figure), `ProjectReceivables` (what is open, from Books' receivables ageing).
- **Every figure is read from posted Books entries** on the project's cost centre and every cost centre under it (its phases), in the base currency. Cancelled vouchers are not counted. A line posted to the project on a voucher that is not counts (Books' line cost centre).
  - **Agreed:** the linked sales orders, or failing those the linked quotations (a sales order made from a quotation is not counted twice).
  - **Billed:** posted sales invoices and cash sales, less credit notes. **Owed** and how late: from the receivables ageing. **Paid:** billed less owed.
  - **Income and spent:** accounts whose group is of income or expense nature (credits less debits, debits less credits). **Profit:** income less spent.
  - **Committed:** open purchase orders, exactly as Books' budget control counts them.
  - **Budget:** expense rows on these cost centres in each active budget's current version (the approved one when there is one, never a draft being worked on), with approved transfers; recovery rows lower it. Shown as none, never zero, when there is no budget.
  - **By phase:** each phase with its own cost centre.
- **Changed from the design: the budget is planned in Books, not from the tab.** Writing a budget from Projects would mean writing into whatever draft version finance is working on, outside its approval steps. The tab reads the project's budget, and "Plan it in Books" opens Books' budget planner (with `projects.money.budget` and `books.view`). Books' budget control then warns or stops project spending as it already does.
- **Who sees it:** `projects.money.view` and a project role that sees money (a new project-role ability, "See its money", given to Lead and Finance by script 260). Someone who sees every piece of work can read the money of one that is not confidential, with the permission.
- **Route:** `GET /projects/{project}/money`.
- **Tests:** `tests/Feature/ProjectsMoneyTabTest.php` (4, with real voucher, entry, ledger and budget tables); `frontend/e2e/projects-money-ui.mjs` (10 checks in a real browser).
- **Not tested here:** the real receivables ageing (stood in; the tests have no ageing tables). Compare one project's Owed with Books' ageing report after running the script.

### 4.3 Ledgers from a project (done)

Screen: `docs/screens/projects-ledgers.png`.

- **Service:** `ProjectLedgers`. Shown at the foot of the Money tab.
- **A ledger is made in Books** with the Ledger model and the checks Books' own ledger screen uses (the Duties & Taxes guard, statement line placement where statement lines are on). Books owns it from then on; Projects only remembers which work asked for it, and lists it with its group and who made it. A ledger later switched off in Books says so.
- **No opening balance is taken,** whatever is sent: money only enters the books as a voucher (a test sends one and checks it is ignored).
- **Groups offered:** for an account, income, expense and liability groups whose behaviour is ordinary, sales or purchase (no tax, debtors, delivery, charge or bank groups); for a bank account, Bank Accounts and the groups under it. A name the books already have, in any capitals, is refused.
- **Permissions:** `projects.ledgers.create`, and for a bank ledger also `projects.ledgers.bank`; both need a project role that sees money. Refusals are logged.
- **Bank details** on a new ledger ask the same sensitive action as on Books' own ledger screen (`bank_details`), when that rule is on.
- **Routes:** `GET`, `POST /projects/{project}/ledgers`.
- **Tests:** `tests/Feature/ProjectsLedgersTest.php` (4, with real ledger and group tables); the Money browser check now covers the ledgers too (17 checks).
- **Left for 4.4 and 4.7:** client money, retention and advance ledgers are made by those builds' own screens, so their purposes are not offered here.

### 4.4 Client money accounts and receiving (done)

Screen: `docs/screens/projects-client-money.png`.

- **Services:** `ProjectHeldMoney` (accounts, balances, receiving) and `ProjectVoucherPoster` (posts a journal through Books' own `VoucherService::create`, channel `projects`). Page: Projects → **Client money**; what is held for a piece of work also shows on its Money tab.
- **An account** is pooled (a balance per client inside it) or dedicated (it holds one balance). It has two Books ledgers: the **bank ledger** the money sits in and the **liability ledger** saying it is owed to clients. Either can be an existing ledger or be opened in Books from the form (same checks as 4.3). Script 260 now also has `liability_ledger_id` on `project_client_accounts` (the owner has not run 260 yet, so it was added in place).
- **A balance** belongs to one client or to several jointly (any number of owners), and can name the piece of work it is for. A dedicated account refuses a second balance.
- **Receiving** posts a journal in Books: debit the bank ledger, credit the liability ledger, both lines tagged with the balance (`voucher_entries.project_holding_id`). What a balance holds is worked out from the posted, tagged bank lines; Projects stores no amount.
- **Books:** a journal line may carry `project_holding_id` (only when the column exists). Books' voucher form refuses to edit a voucher with tagged lines ("This voucher moved client money held in Projects, so it is not edited here…"); a mistake is put right from Projects (paying out comes in 4.5).
- **Permissions:** viewing needs `projects.money.held.view` or `projects.money.held.pay`; opening accounts, balances and receiving need `projects.money.held.pay`; opening a bank ledger also needs `projects.ledgers.bank`. Refusals are logged.
- **Guard:** each account has `guard_on`, off by default; switching it on and what it stops comes with 4.5.
- **Routes:** `GET /projects/client-money`, `POST /projects/client-money/accounts`, `POST /projects/client-money/accounts/{account}/balances`, `POST /projects/client-money/balances/{balance}/receive`.
- **Tests:** `tests/Feature/ProjectsClientMoneyTest.php` (5); browser check `e2e/projects-client-money-ui.mjs` (11 checks). In tests the real Books posting is stood in for, so **check by hand** once 260 is run: receive into a balance and see the journal in Books with both lines.

### 4.5 Paying out, and the guard in Books (done)

Screen: `docs/screens/projects-client-money-pay-out.png`.

- **Paying out** (`ProjectHeldMoney::payOut`): a journal in Books, debit the liability ledger (less is owed to the clients) and credit the bank ledger (the money leaves), both lines tagged with the balance and on the work's cost centre when it has one. It asks who it was paid to, the date, a reference and what for.
- **Never more than the balance holds,** guard or no guard: the balance's row is locked while it is worked out, so two payments at once wait for each other. Another client's money in the same pooled account is never used.
- **Serious actions:** `held.pay_out` "Pay out of held client money" and `held.guard_off` "Switch off the guard on a client money account" are in the Configuration table (out of the box both need nothing). The suggested set asks identity and a supervisor for paying out, and a supervisor for switching a guard off. An account is not one piece of work, so "the supervisor must be on the work" cannot be asked for switching a guard off.
- **The guard, in Books** (`App\Services\Books\ClientMoneyGuard`, called by `VoucherService` after it writes any voucher's lines and after it cancels one). On an account whose guard is on, the books refuse:
  - money leaving its bank ledger without saying whose balance it comes from ("…pay it from Projects, Client money");
  - any line that lowers a balance below zero, with the balance's name and figures;
  - cancelling a receipt when what it brought in has been paid out.
  Money coming in untagged (bank interest, say) is let in. A balance that was already below zero (posted while the guard was off) may still go up. Every account's guard is off until switched on; without script 260 the guard does nothing. This one check runs in the shared voucher service, so it covers Books screens, shop, till and gateways alike; with every guard off it costs one small query per voucher.
- **Found and fixed on the way:** the "is script 260 run" answers (Books and Projects) were remembered for the life of the PHP process; they are now remembered per request, so a long-running worker sees the script once it is run. Saving the serious-actions table now knows the two new actions.
- **Permissions:** paying out and switching a guard need `projects.money.held.pay`.
- **Routes:** `POST /projects/client-money/balances/{balance}/pay-out`, `POST /projects/client-money/accounts/{account}/guard` (`on: true|false`).
- **Tests:** `tests/Feature/ProjectsClientMoneyTest.php` now 9 (paying out and its limit, the serious-action rules, the Books guard on posting and cancelling, a balance already below zero); all Books-area tests pass. Browser check `e2e/projects-client-money-ui.mjs` now 18 checks (pay out, the over-balance hint, asking a supervisor, the guard switch). **Check by hand** once 260 is run: switch a guard on, then try in Books to post a payment out of that bank ledger, and see it refused.

### 4.6 Billing plans and the post-or-draft setting (done)

Screens: `docs/screens/projects-billing.png`, `docs/screens/projects-billing-plan.png`, `docs/screens/projects-billing-books-form.png`.

- **Service:** `ProjectBilling`; the plan is a panel on the Money tab.
- **A stage is a share (%) of the agreed value before tax:** the lines of the linked sales orders (or, with none, the linked quotations), not cancelled. No amount is stored. The last stage of a plan at 100% takes what the others leave, so the bills add up to the agreed value to the cent (a test plans 33.3333 / 33.3333 / 33.3334 of 1,000,000.01).
- **Falls due:** when someone bills it, on a date, when a phase is done, or when the work reaches a stage of its kind. Shown as Due / Not yet / Billed. Any stage not billed can be billed early.
- **Changing the plan:** stages already billed stay as they are; the rest are replaced. Shares add up to no more than 100% (checked on the screen and on the server). No plan without a linked quotation or sales order (owner's choice 1).
- **Income ledger:** the one the agreed order mostly uses, unless one is chosen on the plan (`project_money_terms.income_ledger_id`, added to script 260 in place; 260 is not run yet). The bill is one custom line to it, so the ledger decides the tax, as on the Books form.
- **Billing a stage:**
  - setting **"Post the voucher"**: a Books sales invoice to the work's client, on its cost centre, posted through `VoucherService::create` (channel `projects`), reference = the work's number. Needs `projects.money.bill`, then the serious-action rules: new action `bill.post` "Post a bill from a billing plan" (out of the box needs nothing; the suggested set asks identity). Two people billing one stage: the second is told it is billed.
  - setting **"Save a draft"** (the default): Books has no draft vouchers, so a draft is Books' own sales form opened **filled in** (client, work, line, narration, reference) for a person to check and post with their Books permission (`books.post`, asked before it opens). The form sends `project_billing_stage_id`; Books' store ties the new invoice to the stage only when it is on that work's cost centre (or a phase's) and the stage is not billed yet. Nothing else in Books changes.
- **An invoice cancelled in Books frees its stage** to be billed again.
- **Routes:** `GET`, `PUT /projects/{project}/billing`, `POST /projects/{project}/billing/{stage}/bill`, `GET /projects/billing-stages/{stage}/form` (for the Books form; needs `books.post` and `projects.money.bill`).
- **Tests:** `tests/Feature/ProjectsBillingTest.php` (5); the serious-actions table now has 11 actions; all Projects and Books-area tests pass. Browser check `e2e/projects-billing-ui.mjs` (13 checks, including the real Books form filling in and sending the stage); the money, client money and voucher picker checks still pass. **Check by hand** once 260 is run: link a sales order to a piece of work, make a 30/70 plan, and bill the first stage both ways.
- **Not in this build:** a reminder when a stage falls due (it shows on the Money tab); retention and advances are taken off bills in 4.7.
