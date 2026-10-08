# Cost centres, departments, employees and legal entities (DRAFT v2: direction decided, nothing built yet)

Direction: **a branch is a cost centre inside one set of books. A different company or country is a legal entity with its own books** (Tally style: separate companies, separate books, one open at a time per window, never mixed). Both are being built now, in the order below.

## Decisions so far

| # | Decision |
|---|---|
| 1 | Build both: cost centres inside a company, and legal entities (separate books), now, not later. |
| 2 | Every location automatically gets a branch cost centre. Departments are a **table**, not free text. A department belongs to **one location**, so "Sales" exists once per location. Each department has its own cost centre, nested under its location's. |
| 3 | An employee is created with an **entity, a location and a department** (the department list is filtered by the chosen location). |
| 4 | No "no cost centre" bucket. A **configuration page** sets defaults, so every entry always has a cost centre and no screen can fail for lack of one. |
| 5 | A Head office location and cost centre exist for shared costs. |
| 6 | Shared costs are shared by report-time rules; nothing is posted. |
| 7 | An employee can belong to **several cost centres** (their department's, plus for example a project for some dates, with a share). Payroll splits their cost by those shares. |
| 8 | Each entity has its **own base currency, chart of accounts, tax setup, period lock, numbering and bank accounts**. Reports and screens always show **one entity**. No combined profit across entities. A company switcher sets which one, per browser tab, so two companies can be open in two tabs at once. |
| 9 | Location kinds gain Office and Depot (labels only). |
| 10 | A branch can have **several** cost centres (for example Stock, Payroll, Utilities under the branch), not just its automatic one. |
| 11 | One storefront and one set of books for now. A company in another country has its own website and its own books. |
| 12 | Later, after cost centres: a **view-only import** of another company's books (chart of accounts, vouchers) from an encrypted, password-protected exchange file (extension `.wnkjap`), and an API with a password for sites we build. Never mixed with our own books. |
| 13 | Customers: one identity, a separate party ledger per company. Exchange rates: one shared table. Standard department names: a ready list that can be added to a branch in one click. |
| 14 | Reports sort and filter per branch using the voucher's location (the voucher already carries it). |
| 15 | **Identity and access comes first** (`docs/IDENTITY_AND_ACCESS_PLAN.md`): roles as data, several roles per person, default branch plus time-limited grants, admin and super admin never bound, a new Senior accountant role. |

## What the code is today (checked)

- One company is built in: `CompanyProfile::current()` (9 uses), accounting settings (`AccountingSetting`, about 33 uses), the base currency (about 66 uses), one lock date and set of financial years, one chart (ledgers have no entity), one tax PIN.
- About 423 uses of `Voucher::`/`Ledger::` and similar models and 85 raw queries on vouchers, entries and ledgers, in about 100 files. Per-entity books means every one of those needs the current entity.
- Vouchers have a `location_id`; entries have no dimension. Reports are company-wide (only the day book and dashboard filter by location).
- Employees: `department` and `work_location` are **free text** on `employees`; `users.department` repeats it; job postings and inventory assignments use department text too. No real branch link, no employee-to-cost-centre link.
- Locations: kind and four capabilities exist (script 97).
- Stock cost travels with the batch on a transfer, so branch gross profit is already honest.
- `backend/app/Models/us.php` looks like a stray copy of `UserController` sitting in the Models folder (not loaded by anything). To be checked and deleted.

## The model

```
Legal entity (company)         own books, base currency, tax registrations, number series, lock dates
  Location                     where it happened         (kind + capabilities)
    Cost centre (branch)       auto-created per location, the location's default
    Department                 per location: Sales at Nairobi, Sales at Mombasa
      Cost centre (department) auto-created, nested under the branch's
  Cost centres (projects, other)   free-standing, optionally under any parent
Employee                       entity + location + department (+ extra cost centres with shares and dates)
```

Entries and vouchers carry: entity (from the location), location, cost centre. Resolution of a line's cost centre, first that exists: the line itself, the voucher, the configured default for that kind of document, the location's cost centre, the entity's "General" cost centre. So it is never empty.

## Employees and departments

- `departments`: id, entity_id (via location), location_id, name, code, cost_centre_id, manager (employee), is_active. Unique per (location, name). A quick action "add this department to several locations" creates the repeats.
- `employees`: add `legal_entity_id`, `location_id`, `department_id`. The old free-text `department` and `work_location` stay for a while and are filled from the new fields, then retired. `users.department` follows the employee. Existing text is matched into departments by a script (reviewed by you before it is applied).
- `employee_cost_centres`: employee_id, cost_centre_id, share_percent, kind (home, project, other), valid_from, valid_to. The **home** row comes from the department and is 100% by default. A project assignment takes a share (for example 60% Procurement, 40% Project X) for dates. Shares in force on a payroll period must total 100%.
- Payroll journal lines carry the cost centre, split by the shares in force. Statutory deductions follow the same split.
- Employee form: choose entity, then location, then department (filtered), then optional extra cost centres with share and dates.
- Careers (job postings) and inventory assignments: point at the department table where it makes sense, later.

## Configuration page (defaults)

Settings, "Cost centres": the entity's General cost centre; defaults per kind of document (sales, purchases, expenses and payments, payroll, stock adjustments) falling back to the location's; the Head office cost centre; whether a line may be changed per entry. Every default has a value from day one (created by the script), so the database column is NOT NULL and no screen fails.

## Multiple companies, Tally style

- **Separate books per entity.** Own chart (copied from a template when the entity is created, so different countries can differ), own accounting settings, base currency, period lock and financial years, number series, bank accounts and tax setup.
- **The base currency** moves from a global flag to the entity (`legal_entities.base_currency_id`). Exchange rates can stay one shared table; each entity restates into its own base. The 66 places that ask for "the base currency" ask the current entity instead.
- **The company switcher.** The admin header shows "Viewing: ABC Kenya Ltd" as a coloured chip and a switcher. The chosen entity is kept **per browser tab** and sent with every request (an `X-Entity` header, like the branch header today). Two tabs on two companies work side by side. The server checks the user may use that entity.
- **Never mixed:** no endpoint adds up two entities. No consolidated profit. (A separate read-only consolidation can be considered much later, behind its own permission.)
- **Scoping.** Ledgers, groups, vouchers, entries, series, bank accounts and settings carry the entity. A global scope on the models does most of the work. The 85 raw queries are converted by hand and tested.
- **Customers and suppliers:** one identity (one login) across entities, with a separate party ledger per entity created at the first transaction. To be confirmed.
- **Staff:** a user is attached to entities (and locations within them), possibly with different roles. A group-level super admin sees all, one entity at a time.
- **A transfer between locations of different entities** is refused with a clear message, until intercompany (sale and purchase between the two companies, transfer price, currency, customs fields) is built.
- **Tax belongs to the entity.** Tax registrations, regimes and rates per entity. Nothing about Kenya, Rwanda or customs is hard-coded.
- **The storefront** needs a decision: one storefront per entity (a domain or subdomain picks the entity) or one storefront with branches across entities. Per entity is the simpler and safer default.

## Build order (each step is a database script plus the matching code, in this order)

0. **Identity and access** (R1 and R2 of `docs/IDENTITY_AND_ACCESS_PLAN.md`) before everything below. Branch scope enforcement (R3) and the employee link (R4) follow when employees and cost centres exist.


The order follows what depends on what: entity, then location, then cost centre, then department, then employee, then posting and reports, then the heavy per-entity books.

1. **Entities groundwork.** `legal_entities` with one default entity built from today's company profile and base currency; `locations.legal_entity_id`; a `CurrentEntity` accessor (returns the one entity); the company switcher shell (hidden while there is one entity). No behaviour change.
2. **Cost centres.** `cost_centres` (nested), one per location plus Head office plus General, `locations.cost_centre_id`, location kinds Office and Depot, and the configuration page with its defaults.
3. **Departments and employees.** `departments`, employee entity/location/department fields, `employee_cost_centres`, the employee form and list, the matching script for existing text.
4. **Dimensions on the books.** Entity, location and cost centre columns on vouchers and entries, backfilled from the voucher's location in batches, then NOT NULL. Posting copies them. Payment, bill and journal forms get a cost centre per line, defaulted.
5. **Reports.** Profit and loss, trial balance, day book, ledger statement and dashboard get the cost centre and location filters and a by-cost-centre view with roll-up; branch stock value; report-time allocation of shared costs.
6. **Payroll** split by employee cost centre shares.
7. **Per-entity books.** Chart, settings, base currency, lock dates, series, bank accounts per entity; the model scopes; the 85 raw queries; the `X-Entity` header and switcher live; refusing cross-entity transfers.
8. **Staff access** by entity, location and cost centre.
9. **Preorders** resume (they need steps 2 to 5).

## Open questions

1. Storefront: one per entity (suggested) or one shared across entities?
2. Customers: one identity with a party ledger per entity (suggested)?
3. Exchange rates: one shared table (suggested), or per entity?
4. Departments: do you also want a list of standard department names that can be added to a location in one click?
5. Is it right that an employee's cost is split by shares only for payroll, and everything else they cause (expenses they claim, for example) takes the cost centre of the entry itself?
