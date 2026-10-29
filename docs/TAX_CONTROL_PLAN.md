# Tax control: plan

Status: **decided, not built.** Written 29 Oct 2026 from the owner's answers. Nothing here has been run on the real database.

Why now: the tax return and the withholding register (Books reports plan, steps 6.4 and 6.5) read the tax setup this plan changes. Doing the tax work first means they are rebuilt once. The remaining report steps (6.7 to 6.10, the stock reports) do not depend on it and resume afterwards.

## 1. What exists today (so we build on it, not beside it)

- A **tax type** is a group under Duties & Taxes (found by that name) with a `kind` (vat, excise, customs, withholding_income, withholding_vat, other), an `application_mode` (additive or withheld), `is_compound`, and its control ledgers (control, or payable and receivable for withheld).
- A **tax rate** is a ledger inside the type's group: percentage, fixed amount or per unit (with unit and currency), a calculation base (before discount, after discount, total payable), a calculation sequence, effective dates, a classification, and whether a certificate is required.
- **Rules** (`tax_rules`) choose which rate applies: module, customer types, order value range, priority, districts.
- A **sales or purchase account** holds one tax treatment: one rate ledger and a tax nature (taxable, zero-rated, exempt, out of scope).
- The tax return and withholding register read all of this.

## 2. Decisions

| # | Decision |
|---|---|
| T1 | **Reverse charge is built now**: automatic posting of the recipient's liability and, where permitted, the matching recoverable input tax, as separate entries. They may offset but are never assumed to. **Direct liability** (income tax, property tax and similar) stays in the data model and is posted by manual journal; automating it is a later phase. |
| T2 | **One country per company.** The company's registered tax jurisdiction is the default, with optional state, province, county or municipality areas (the existing districts). Branches may sit in different areas of that country. The books never silently mix two countries' regimes; a multinational group later uses explicit registrations and a jurisdiction on each transaction. |
| T3 | **Exemption behaviour belongs to each tax rule, not to a universal precedence.** Each rule says one of: *respect applicable exemptions*; *exclude exempt supplies*; *apply independently of the product's tax treatment, where the law permits*. Conflicts are settled by the jurisdiction's rules (a statutory exemption or an exemption certificate can override), never by a priority toggle alone. |
| T4 | **Chart of accounts:** the reserved Duties & Taxes group cannot be created under, edited or deleted through the ordinary chart form; the form says to add the tax on the Tax and compliance page. Legitimate child groups are allowed. Tax rate ledgers and the control ledgers are created and managed from Tax and compliance, and system-managed tax accounts are protected from deletion or changes that would break tax reporting. The group that holds taxes is chosen in Tax control, not found by name. |
| T5 | **Permissions:** changing Tax control is owner-only by default; a separate read-only permission shows it; an explicit tax-administrator permission can be given in larger organisations. Every change is logged: who, when, what, old and new value. |
| T6 | **Excise** has its own rule shape (section 5), not "another percentage". Excise is applied at the product and import level; a document-level override exists only where the tax allows it, so a retailer buying excised stock does not charge it again. |
| T7 | **Customs and tariffs are a separate module in a later phase** (section 8). The tax-type list keeps "Customs / import duty" as a category now, but the tariff engine (HS codes, origin, valuation, declarations) is not built in this plan. A tariff is the schedule that gives the rate, never a second charge on top of the duty. |
| T8 | **Safeguards:** effective dates and versions (a change never rewrites a posted calculation); a calculation snapshot on every posted line (rate, taxable base, exemption reason, amount); automatic tax entries always balance; every change to a rule, exemption or control account is audited; invalid combinations of category, method and exemption behaviour are refused. |

## 3. The model

Five ideas, kept apart:

| Idea | Holds | Now or new |
|---|---|---|
| Tax category | VAT/GST, sales tax, withholding income tax, withholding VAT/GST, income tax, payroll tax, excise, customs/import duty, property tax, capital gains, turnover/gross receipts, stamp duty/transfer, environmental levy, transaction levy, other. Which are switched on, and the defaults of each (methods allowed, default ledgers, reclaimable or not, certificate needed), are set in Tax control. | Replaces `kind` |
| Application method | Added to the amount; included in the displayed price; withheld from a payment; reverse charge; direct liability. Fixed once the type exists, because it changes the postings. | Extends `application_mode` |
| Jurisdiction | The company's country and optional sub-areas the type belongs to. | Builds on districts |
| Rate and rule | Rate type (percentage, fixed per amount, per unit, combined, higher-of), taxable base, sequence, effective dates, conditions, exemption behaviour, tax point. | Extends rates and rules |
| Accounting mapping | Payable, recoverable, withholding receivable and payable, and "cost of stock" (a non-recoverable duty added to inventory). | Extends the control ledgers |

Existing types convert automatically: each `kind` becomes a category and each mode becomes the matching method, with a check listing anything that did not map.

## 4. Tax control tab (Books, Configuration)

Between Payment methods and Period control, built like the Reports settings tab (sections, per-section permission, audit log). Sections:

1. **Jurisdiction:** the company's registered country and areas; the registration numbers.
2. **Categories:** which are on, and each one's defaults and allowed methods (this is the validation table).
3. **Accounting mapping defaults** per category and method.
4. **Where taxes live:** the group that holds tax types (replacing the name lookup).
5. **Calculation:** rounding (per line or per document), prices entered with or without tax, the VAT-base-includes-excise switch.
6. **Apply regardless:** the taxes that apply to every qualifying document, with their exemption behaviour.
7. **Filing:** return periods, certificate requirements, withholding thresholds.

## 5. Calculation rules

- **Rate types:** percentage of value; fixed amount per unit (litre, kilo, piece); combined (percentage plus per unit); the higher of two (and the lower of two). Per-unit rates keep their unit and currency.
- **Taxable base:** value, quantity, weight, volume.
- **Sequence and base:** each rule says what it is calculated on and what is calculated on it, for example VAT on value plus excise. Never hardcoded for a country.
- **Tax point:** when the liability arises (invoice, delivery, payment, removal from the factory, import).
- **Accounting treatment:** payable, recoverable where the law allows, or included in the cost of stock.
- **No double tax:** a purchase of excised goods records the duty in the cost; it does not create a fresh excise liability unless the buyer's own role triggers one.

## 6. Accounts that carry several taxes

A sales or purchase account holds a list of tax treatments instead of one: for each tax, whether it applies, is zero-rated, exempt or out of scope, and in what order. The tax nature is per tax (a supply can be VAT-exempt and still bear excise). Existing accounts become a one-row list from their current rate and nature, so nothing changes until someone edits one. The tax return's supplies split reads these rows.

## 7. Reverse charge

For a purchase from a non-resident or an appointed supplier, the books post: the cost, the tax liability the recipient owes (output side), and, where recoverable, the same tax as input, as three separate balanced entries, with the snapshot on the line. The tax return shows both sides and a net.

## 8. Later phases (not in this build)

- **Direct liability automation:** assessment, instalments, payment workflow. Until then: manual journals against the type's accounts.
- **Customs and Tariffs module:** HS codes, country of origin and import, customs valuation, tariff rates and trade preferences, exemptions, effective dates, import declarations, and the sequence customs, excise, import VAT, other levies, with non-recoverable duty added to the cost of stock. The module feeds the same tax engine and ledgers.
- **Multi-country groups:** registrations per country and a jurisdiction on each transaction.

## 9. Steps

| Step | What | Done when |
|---|---|---|
| T1 | This plan agreed. | Owner has signed it off. |
| T2 (**drafted**: `backend/database/sql/229_tax_control.sql`, not yet run on the real database) | Database script (read-only check, change, result check): the new columns and tables, conversion of existing kinds and modes, the one-row tax list for each account, the settings rows. Tested on a copy with the live groups and ledgers. | A second run changes nothing; every type and account converts; anything unmapped is listed. |
| T3 | Tax control tab, permissions, audit log. | Each section saves, is refused without its permission, and is logged. |
| T4 | Tax type form: category, method, jurisdiction, with the combination table; rate form with the new rate types and tax point. | Invalid combinations are refused with a reason. |
| T5 | Chart of accounts: the Duties & Taxes guard; accounts carrying several taxes. | The guard and the multi-tax form pass their tests. |
| T6 | Tax resolution in the posting code (item, account, apply regardless, exemptions), reverse charge, and calculation snapshots. **First** a record of what every existing setup posts today; the new code must post the same, to the cent. | Old and new post identically for every existing case; new cases (several taxes on one account, reverse charge, an always-apply levy, excise with VAT on top) have tests. |
| T7 | Rebuild the tax return and the withholding register on the new model (categories, methods, reverse charge, per-tax nature), and the Books health checks on tax control accounts. | The two reports agree with the ledgers and with the previous versions where nothing changed. |
| T8 | Update this plan and the Books reports plan, and the backup and `.wnkjap` table lists (step 13). | Docs match the code. |

Then the stock reports (steps 6.7 to 6.10) and the rest of the Books reports plan continue.

## 10. Risks

- T6 changes the code that posts sales and purchases. The record-and-compare test before changing anything is the safeguard; no step after T2 ships without it.
- Reverse charge and excise-on-VAT depend on the law of the jurisdiction; the defaults are starting points to be confirmed by the company's tax adviser, and each is a setting, not code.
- Existing posted documents are never recalculated. Snapshots start with the first document posted after T6.

## 11. Status of T2

`229_tax_control.sql` is drafted and tested on a MariaDB copy built from the tax models' columns (the tax tables are not defined in the repository, so its PART A first checks the live columns it relies on, and the new-column step skips a table that does not exist). The copy used a different default collation from the new tables, as MySQL 8 does, and the script ran clean; a second run changed nothing; with two VAT types, accounts that have a tax nature but no rate of their own are listed instead of guessed. The old columns (`kind`, `application_mode`, `tax_nature`, `tax_rate_ledger_id`) are untouched and stay the ones the app reads until T6; the new ones mirror them for now. The three new tables are added to the backup list.
