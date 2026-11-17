# Projects Stage 4: Money through Books (DESIGN, nothing built yet)

Status: DESIGN, shared with the owner on 2026-11-17, with the owner's four answers built in. Waiting for "build". Nothing in this document is built.

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
