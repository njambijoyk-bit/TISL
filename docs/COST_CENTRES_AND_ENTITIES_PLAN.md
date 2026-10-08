# Cost centres, locations and legal entities (DRAFT, nothing built, nothing decided yet)

Replaces the earlier "branch profit" draft. Direction: **a branch is a cost centre inside one set of books. A separate legal entity (another company, another country) is a different thing, with its own books.** One legal entity means one chart of accounts and many dimensions. Many legal entities mean separate books and, later, consolidation.

## Where TISL stands today (checked in the code)

- **One company is built in.** `CompanyProfile::current()` (9 uses), the accounting settings row (`AccountingSetting`, about 33 uses: stock, cost of goods, loss and other ledger pointers, lock dates), the base currency lookup (about 66 uses), the period guard (one lock date, one set of financial years), one chart of accounts (ledgers carry no entity), one tax PIN on the company profile.
- Every voucher has a `location_id`. Entries (the ledger lines) have **no** dimension of their own. Reports (trial balance, profit and loss, balance sheet) are company-wide. Only the day book and parts of the dashboard filter by location.
- Locations carry a currency, a tax district, number series (`voucher_series.location_id`) and, since script 97, a kind and four capabilities (sells to customers, delivers, receives goods, makes things).
- Stock sits per location in batches; a transfer posts nothing and the **batch cost travels with the stock**, so a branch's gross profit (sales less the cost of what it sold) is already honest.
- A voucher with no location silently gets the default location, so shared costs would quietly land in one shop. That is the main way branch figures are wrong today.

## The model

```
Organization / Group                          (later)
  Legal entity                                (later; its own books, tax registrations, base currency)
    Location        where it happened         (built: kind + capabilities)
    Cost centre     who bears or reports it   (stage A)
```

**Location and cost centre are different dimensions.** A location is a place (Nairobi HQ). A cost centre is who carries the cost or income (Sales, Admin, Marketing, or "Mombasa branch"). They often overlap. They are not the same column.

To honour "branches as cost centres" without double typing: **every location automatically gets a cost centre of kind "branch"**. A voucher made at a location inherits that location's cost centre unless a line says otherwise. Departments (Marketing, Admin, Logistics) and projects are extra cost centres, optionally nested (Nairobi HQ > Sales, Admin, Marketing) so figures roll up.

## Stage A: cost centres inside one set of books (build this)

**Storage**
- `cost_centres`: id, parent_id, code, name, kind (branch, department, project, other), location_id (set on the auto-created branch ones), is_active, sort_order.
- `locations.cost_centre_id`: the default cost centre of the location (auto-created).
- `vouchers.cost_centre_id` (optional header default) and `voucher_entries.cost_centre_id` and `voucher_entries.location_id` (optional, per line).
- The cost centre of a line is `entry.cost_centre_id`, else `voucher.cost_centre_id`, else the voucher location's cost centre. Same rule for location. Nothing is back-filled: existing entries simply resolve through their voucher.

**Posting**
- Sales, cash sales, delivery notes and the cost-of-goods entries copy the voucher's dimensions.
- Bills, payments and journals ask per line, defaulting to the voucher's. A journal can split one rent bill over three cost centres.
- A setting, "cost centre required on expense and income lines", is off by default. When off, a line with none lands in an explicit **"No cost centre"** bucket in reports. Nothing falls silently into the default branch.
- A **Head office** location (kind "office", sells nothing) and its cost centre exist for shared costs.

**Reports**
- Profit and loss, trial balance, ledger statement, day book and dashboard gain a cost centre filter, a location filter, and a **by cost centre** view: one column per cost centre plus a total and the "No cost centre" bucket. Roll-up through the hierarchy.
- Branch stock value from batch balances (quantity times cost), nothing posted.
- Sharing shared costs: report-time allocation rules (ledger or group to percentages per cost centre, or by basis: revenue, headcount). Nothing is posted, so rules can change and past periods can be re-run. Shown as "before sharing" and "after sharing".

**Payroll:** an employee gets a default cost centre (real field, replacing the free-text `work_location`), optionally split by percentage. The payroll journal lines carry it.

**Transfers:** unchanged, at cost. Moving stock between locations of one entity posts nothing. Cost travels with the batch.

**Access:** a cost centre or branch manager sees their own figures. Admin, super admin and finance see all. This follows `docs/BRANCH_SCOPING_PLAN.md`.

**Location kinds:** extend the labels to shop, warehouse, factory, office, depot, other (labels only; capabilities stay the switches).

## Stage B: legal entities (design for it now, build later)

Needed when there is **another company in the group or another country**. Tax and statutory books belong to the **legal entity**, not the building. A Kenyan company's Nairobi, Mombasa and warehouse are cost centres of one entity. A Rwandan subsidiary is a different entity with its own books, tax registrations, tax regimes, payroll, bank accounts and base currency. A foreign branch of the same company still creates local tax obligations, so model it as its own entity (or foreign branch entity) too. Tax rates and customs rules are never hard-coded.

**What it takes in this code** (honest size: large)
- `legal_entities` (name, country, base currency, tax registrations, letterhead and the company profile fields moved here). One default entity is created for every existing install, so a single-company shop sees no change.
- `locations.legal_entity_id` (each location belongs to exactly one entity). `vouchers.legal_entity_id` is set from the location when posted and never changes.
- One chart of accounts **per entity**, copied from a template when the entity is created (the cleanest legally, and allows different charts per country). Ledgers, groups, system ledgers, payment methods and bank accounts get an entity.
- The singletons become per entity: company profile (9 uses), accounting settings (about 33), base currency (about 66), period guard and financial years, number series, tax configuration. All reports take an entity (a selector), and later "All entities (consolidated)".
- Customers and suppliers can be one shared master, but their party ledgers (the receivable or payable account) are per entity.
- **Stock transfer across entities is not a plain transfer.** It is an intercompany sale and purchase: the sending entity sells (receivable from the other entity), the receiving entity buys (payable to the other entity), with a transfer price, foreign currency and customs fields. Until that exists, a transfer between locations of different entities must be refused with a clear message.
- Intercompany and consolidation: flag a customer or supplier as "another entity in my group", reconcile the two sides, and eliminate them at group level.
- Stock batches and cost belong to the entity of their location.
- Staff: users belong to entities (and to locations within them); a group-level super admin sees all.
- Licensing: multi-entity is a natural paid module (like Campaigns), with the single default entity free.

**The groundwork worth doing with stage A (cheap, changes nothing visible):** create the one default entity and `locations.legal_entity_id`; add a `CurrentEntity` accessor that returns it; stop adding **new** code that reads the company profile, accounting settings or base currency directly. Later conversion then becomes mechanical.

**What not to do:** separate books per branch by default. That would make a normal growing Kenyan company needlessly painful.

## Effects on other work

- **Preorders** (on hold, `docs/PREORDER_PLAN.md`): the preorder voucher's income lands on the cost centre of its location; the entity is the location's entity. Preorders can wait for stage A only, not stage B.
- **Location capabilities** already built stay as they are.
- **Dashboard** gets a by cost centre view.

## Phases

1. Script: `cost_centres`, `locations.cost_centre_id` (auto-create one per location, with a Head office), the `voucher_entries` and `vouchers` columns, extra location kind labels. Also the default entity groundwork if agreed.
2. Posting: sales and cost entries copy dimensions; bills, payments and journals ask per line.
3. Reports: filters and the by-cost-centre view for profit and loss, trial balance, day book and dashboard.
4. Employee cost centre and payroll split.
5. Report-time allocation rules; branch stock value.
6. Staff access by cost centre.
7. Stage B when a second entity is real: entity layer, per-entity settings, per-entity chart, intercompany, consolidation.

## Open questions

1. Is this the direction: stage A now, stage B only groundwork?
2. Every location gets an automatic branch cost centre, plus separate department cost centres: yes?
3. When a line has no cost centre: an explicit "No cost centre" bucket (suggested), or make it required?
4. A Head office location and cost centre for shared costs: yes?
5. Shared costs shared by report-time rules, nothing posted: yes?
6. Employees get a default cost centre (with an optional percentage split): yes?
7. Do you expect a second company or another country soon? That decides when stage B starts.
8. Add Office and Depot to the location kinds?
