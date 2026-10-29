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
| T3 (**built**) | Tax control tab, permissions, audit log. | Each section saves, is refused without its permission, and is logged. |
| T4 (**built**) | Tax type form: category, method, jurisdiction, with the combination table; rate form with the new rate types and tax point. | Invalid combinations are refused with a reason. |
| T5 (**built**) | Chart of accounts: the Duties & Taxes guard; accounts carrying several taxes. | The guard and the multi-tax form pass their tests. |
| T6 (**built** except prices that include tax, see section 15) | Tax resolution in the posting code (item, account, apply regardless, exemptions), reverse charge, and calculation snapshots. **First** a record of what every existing setup posts today; the new code must post the same, to the cent. | Old and new post identically for every existing case; new cases (several taxes on one account, reverse charge, an always-apply levy, excise with VAT on top) have tests. |
| T7 (**built**, section 16) | Rebuild the tax return and the withholding register on the new model (categories, methods, reverse charge, per-tax nature), and the Books health checks on tax control accounts. | The two reports agree with the ledgers and with the previous versions where nothing changed. |
| T8 (**done**) | Update this plan and the Books reports plan, and the backup and `.wnkjap` table lists (step 13). | Docs match the code. |

Then the stock reports (steps 6.7 to 6.10) and the rest of the Books reports plan continue.

## 12. Taxes that depend on other taxes (added 29 Oct, before T3)

The case: a sales account carries VAT 16% and excise 10%. Sometimes VAT is charged on the price plus the excise, sometimes on the price alone.

**What the code does today.** There are two separate paths. The *item path* (rules, `calculation_sequence`, a base called "total payable") can already compound: excise is calculated first, then VAT on the price plus the tax already applied. The *account path* (an account's own tax nature and one rate) applies **one** rate on the line's amount, so it cannot compound at all. And nothing says "VAT is on the price plus excise **for this kind of sale only**".

**What the plan adds** (these become part of T4 and T6):

| # | Rule |
|---|---|
| C1 | **One resolver, not two.** T6 replaces the item path and the account path with a single resolver that takes the line, finds every tax that applies (item, account, apply-regardless), orders them by sequence, and calculates each on its own base. |
| C2 | **A tax's base is explicit.** Each rate says what it is calculated on: the price (before or after discount) **plus which other taxes**, chosen from a list ("excise duty", "customs duty"...), not only "everything applied earlier". |
| C3 | **The base can depend on the situation.** A tax can have several rules with conditions (customer type, product or service, document type, jurisdiction, date, order value), and the rule that matches decides the base. Example: *VAT on price plus excise* for ordinary sales; *VAT on price alone* for a customer type or a document type where the law says so. |
| C4 | **A line can opt out of a tax** (an item that is not excisable, a customer or item holding an exemption certificate). This already exists for exemptions and carries over per tax, not per line. |
| C5 | **A document or line override, only where the tax allows it.** A tax can be marked "base may be changed on the document". Changing it needs a permission and a reason, and the reason is stored in the calculation snapshot. |
| C6 | **Prices that include tax are worked backwards in reverse order.** If a 1,276.00 price includes VAT and excise, the resolver removes VAT first, then excise, so the stored net, excise and VAT are the same as if the price had been entered without tax. |
| C7 | **The tax return follows the base.** The return shows the base each tax was calculated on, so a VAT figure on price plus excise can be proved from the same lines. |

**Worked example** (price 1,000.00; excise 10% first in sequence; VAT 16% second):

| Base for VAT | Excise | VAT | Total |
|---|---|---|---|
| Price plus excise | 100.00 | 176.00 (16% of 1,100.00) | 1,276.00 |
| Price alone | 100.00 | 160.00 (16% of 1,000.00) | 1,260.00 |
| The product is not excisable | 0.00 | 160.00 | 1,160.00 |

**Owner's answer (29 Oct): all three apply, depending on the sale.** So the product opt-out (C4), the conditions (C3) and the document override (C5) all ship, and they are checked in one fixed order so the same sale always gives the same answer:

| Order | What is checked | If it applies |
|---|---|---|
| 1 | A legal exemption: an exemption certificate on the customer or the item, or an exempt or out-of-scope treatment on the account | The tax is not charged. Nothing below can switch it back on, except a tax set to "apply independently of exemptions" where the law permits. |
| 2 | The item's own opt-out of this tax (not excisable, not subject to the levy) | The tax is not charged on that line. |
| 3 | The rules and their conditions (customer type, product or service, document type, jurisdiction, date, order value) | The matching rule gives the rate and the base (for example VAT on price plus excise). |
| 4 | A document or line override, if the tax allows it and the person has the permission | The base the person chose is used instead; their reason is stored in the calculation snapshot and the change is in the audit log. |

An override can only change the base (what a tax is calculated on). It cannot switch off a tax that step 1 or 2 has charged or exempted: that is done by an exemption, which has its own rules and its own audit trail.

The document form shows each line's tax breakdown as it is calculated (excise, then VAT, with the base of each) and, for a tax that allows it, a control to change the base. People without the override permission see the breakdown but not the control.

T3 adds the permissions for this: view Tax control, change Tax control (owner-only), tax administrator, and override the base on a document.

Tests for T6 include each row, a line that opts out of excise, an override with and without the permission, and the same three on a price that includes tax.

## 10. Risks

- T6 changes the code that posts sales and purchases. The record-and-compare test before changing anything is the safeguard; no step after T2 ships without it.
- Reverse charge and excise-on-VAT depend on the law of the jurisdiction; the defaults are starting points to be confirmed by the company's tax adviser, and each is a setting, not code.
- Existing posted documents are never recalculated. Snapshots start with the first document posted after T6.

## 11. Status of T2

`229_tax_control.sql` is drafted and tested on a MariaDB copy built from the tax models' columns (the tax tables are not defined in the repository, so its PART A first checks the live columns it relies on, and the new-column step skips a table that does not exist). The copy used a different default collation from the new tables, as MySQL 8 does, and the script ran clean; a second run changed nothing; with two VAT types, accounts that have a tax nature but no rate of their own are listed instead of guessed. The old columns (`kind`, `application_mode`, `tax_nature`, `tax_rate_ledger_id`) are untouched and stay the ones the app reads until T6; the new ones mirror them for now. The three new tables are added to the backup list.

## 13. Status of T3

Built: Books, Configuration, **Tax control** (between Payment methods and Period control), with six sections: Jurisdiction, Tax categories and how they are applied, Where taxes are kept, Calculation, Taxes that apply regardless, and Returns and certificates. It follows the Reports settings tab: the server describes each section, the screen draws it, every change is validated, and a change log records who changed what and when. It needs script 229 (it says so when the script has not been run).

Permissions (catalogue version 21): `books.tax.view` opens the tab (held by admin and senior accountant by default); `books.tax.control` changes how tax behaves and is the owner's by default; `books.tax.admin` can be handed to a tax administrator and changes only the registrations and the filing settings; `books.tax.override` is for changing a tax's base on a document (used from T6). Whoever holds the control permission changes every section.

Checks the server makes: country is a two-letter code; a registration has both a name and a number; a category in use has at least one allowed method; **a category or a method that an existing tax type uses cannot be switched off**; the group and ledgers named must exist; a tax that applies regardless must be a real tax type, listed once, with its exemption behaviour and documents.

Nothing in the posting code reads these settings yet: T4 (the tax type form) and T6 (the posting code) do.

## 14. Status of T4

Built. **Tax type form:** a category, a method and an area. The categories and methods offered are the ones Tax control allows; the server refuses any other combination and says what is allowed ("Customs / import duty cannot be applied as withheld from a payment. Tax control allows: added to the transaction amount"). How a tax is applied cannot be changed once the type exists; the category can, within what Tax control allows. The old `kind` and `application_mode` columns are kept in step, and a request made the old way (a kind and a mode only) still works and fills the new columns.

**Only the methods the books can post today (*added* and *withheld*) can be chosen.** The other three (*included in the displayed price*, *reverse charge*, *direct liability*) show as "not available yet" and the server refuses them, because creating a tax type the posting code cannot carry out would charge it wrongly. Step T6 adds each to one list (`TaxTypeRules::POSTABLE_METHODS`) when its posting exists.

**Rates:** three new rate types: *percentage plus an amount per unit*, *the higher of the two* and *the lower of the two*, with the second amount and the unit; and a **tax point** (when invoiced, delivered, paid, removed from the factory, imported). The three new types are calculated by the same function the posting already calls, so they work wherever a rate is used, and they can only be used on a tax that is added to the price (the withholding code cannot work them out). A used rate keeps its amounts and tax point locked.

One limit to know: a **custom voucher line** that picks a rate by hand gets no tax from a per-unit or mixed rate, the same as a per-unit rate today, because it has no quantity. T6's single tax calculation closes it.

## 15. Status of T6 (split into 6a, 6b, 6c)

T6 changes the code that posts sales and purchases, so it is done in three parts, each proved before the next.

**The proof first.** Before any change, the tax calculation was run over 89 setups that existed before (every kind of account treatment, both sides, discounts, per-unit rates, rates that were replaced by a newer one, the manual rate, the account with no rate) and the figures recorded in `tests/Fixtures/tax_golden.json`. `TaxLineGoldenTest` requires the new calculation to give exactly these figures. It passes after the change.

**6a, built: several taxes on one line.** (database script 230)
- An account's other taxes (the rows of `ledger_taxes` after the first) are now charged, each calculated in order on its own base. A tax's base is the price, or, for a rate set to *after discounts and earlier taxes*, the price plus the earlier taxes: every earlier tax, or only the tax types the rate lists (`base_includes`). The worked example (price 1,000; excise 10%; VAT 16% on price plus excise) gives 100.00 and 176.00.
- An account that is exempt from its first tax can still charge its second.
- An item's own opt-out of a tax (`tax_opt_outs`) is respected, for the first tax and the others; a blanket exemption on the item or the customer still wins over everything.
- **Taxes that apply regardless** (Tax control) are added after the account's and the item's, only on the documents they name, each following its own rule about exemptions (*respect*, *exclude exempt supplies*, *apply independently*), never twice, and with a plain refusal when no standard rate is in force.
- Every tax row carries a **snapshot** of how it was worked out (the tax, the rate, its amounts, the base and what it included, the amount, where it came from), kept on the posted line.
- Posting needed no change: it already posts every tax row of a line to its own ledger and adds them all into the party's total.

**Not yet reachable from a screen:** opting an item out of a tax has no form yet (the table and the calculation are ready), and the *base* of a rate (the list of taxes it includes) is set in the database until the rate form gets the field. Both come with 6c.

**6b, built: reverse charge.** A tax type applied by "reverse charge" is stored as an added tax whose method is `reverse_charge`. On a purchase the line carries no tax to pay the supplier (its tax amount is 0, so every total, bill and payment is unchanged); the amount owed is kept on the row as `reverse_amount` with the ledger it is claimed into. Posting adds one balanced pair: Dr the type's input-tax ledger (or, when the tax cannot be claimed back, its cost ledger), Cr the tax ledger. On a sale it adds nothing. The saved snapshot keeps the amount and the ledgers, so a credit note cloned from the purchase reverses the same pair. The tax return reads the tax ledger's movement, so the amount owed shows in it as before. Reverse-charge types are left out of the older item-rule path. Tests: `TaxReverseChargeTest`.

**6c, partly built.**
- *Built:* the rate form has the list of earlier taxes a rate's base includes (only for "after discounts and earlier taxes"; the list is cleared when the base changes); a product or service form lists the taxes it does not carry, with a reason (saved through `PUT /admin/tax/opt-outs`, needs the tax manage permission); and a document line can carry `tax_base` and `tax_base_reason` to change the amount its taxes are worked out on. That needs `books.tax.override`, a reason (unless Tax control turns the rule off), and the old and new amount, the reason and who did it are kept in the tax snapshot of the line. The change applies to every tax on the line. Tests: `TaxBaseOverrideTest`, `TaxTypeFormTest`.
- *Also built:* the voucher form shows "Change what the tax is worked out on" under a product or service line for people holding `books.tax.override`; an edited voucher brings the override back.
- *Still to do:* **prices that include tax** (*included in the displayed price*). Prices are stored without tax today everywhere (price lists, cards, the invoice), so this needs its own look before it is built, and `included` stays "not available yet" until then.

## 16. Status of T7 (built)

- **Tax return.** Reads the new model. A reverse-charge type is listed as "reverse charge: owed and claimed back": its rate rows show the tax owed and the purchases they were charged on, a "Claimed back (reverse charge)" row shows what went to the type's input ledger, and the owed-at-the-end figure counts both, so the proof still closes. **Give each reverse-charge type its own input ledger**: the return reads that ledger's movement as the claim. Other types read as before and still match the old return to the cent. The category of each type is in the data.
- **Withholding register.** Needed no change: it reads certificates, which do not depend on the parts of the model that changed.
- **Health of the tax set-up** (end of the Tax control tab, `GET /admin/books/tax-control/health`, read-only): a tax type without category or method; an active type with no rate in force; a reverse charge with no input or cost ledger; a withheld tax with no payable ledger; a rate whose base lists a removed tax; an account carrying a tax with no rate, a removed type, or a rate that has ended; taxable accounts with no tax rows; opt-outs for a removed type. Tests: `TaxReturnReverseChargeTest`, `TaxReverseChargeTest`.
- **Still open for the Books health panel (reports step 10):** the same checks will be listed there beside the other Books checks.

## 17. Status of T8 (done)

- **Backup list.** `ledger_taxes`, `tax_control_settings`, `tax_control_log` and `tax_opt_outs` are in `ModuleTables`, so a backup and a restore carry them. The new columns on `ledger_groups` and `ledgers` (category, method, jurisdiction, input and cost ledgers, per-unit amount, tax point, base list) travel with those tables.
- **`.wnkjap` export and import** (reports plan step 13) is not built yet. When it is, it must include the same four tables and treat the tax type and rate columns above as part of the ledger and group records.
- **Still open from this plan:** prices that include tax (*included in the displayed price*, section 15); customs and tariffs as their own module; direct-liability manual journals; the Books health panel (reports step 10) listing the tax checks beside its own.
- **Test guide:** `docs/TAX_CONTROL_TEST_GUIDE.md`.

## 18. Tax recovery: can the buyer claim the tax back? (built)

**The rule.** Each *added* tax type has a recovery treatment (script `231_tax_recovery.sql`, `ledger_groups.recovery`):
- **Recoverable**: input tax. Debited to the tax ledger and claimed back on the return. This is how VAT has always posted, and it is where every existing type starts.
- **Not recoverable**: part of what the goods cost. The supplier still charges it, so the bill, the amount owed and the line's tax amount are unchanged; only the posting differs. The tax is debited to the line's own ledger (for stock, the Stock ledger, and the stock's unit cost includes it, so the stock report and the ledger agree), or to the type's own cost ledger when one is chosen ("Charge it to").
- **Conditional**: recoverable only when the company stands in the right position for the tax (`company_role`: an ordinary purchaser, a licensed manufacturer, or an importer). Only a **licensed manufacturer** claims a conditional tax back, for what it uses to make the goods the tax is on. Anyone else treats it as cost.

**Excise starts as not recoverable** (an ordinary purchaser cannot claim it), unless a valid rule says otherwise: change the type to conditional and set the company's position, or to recoverable. A type with no recovery set takes its category's start. The health panel questions an excise type that is claimed back by a company that is not a manufacturer.

**Liability stays apart from purchase cost.** Recovery acts on purchases only. What a manufacturer or importer *charges* (excise on its own sales or removals) is a liability to the authority and posts exactly as before, whatever the recovery setting. An importer's duty paid on import is not a purchase-cost question: it belongs to the customs module (a later phase), so an importer is not treated as recovering anything here.

**Where it applies.** One place decides (`TaxResolver::recovery`, called for every way a line's taxes are worked out), so item rules, account taxes, taxes that apply regardless and manual rates all follow it. Reverse-charge and withheld types keep their own treatment. The snapshot kept with each posted line records the treatment, and a credit note cloned from a purchase reverses the same way. Documents already posted are never changed.

**Known limit.** Kitchen stock received through Menus values its batches from the line price without tax, so a tax that is part of the cost makes the Inventory ledger larger than the batches' value by that tax. Until Menus is taught the same rule, give such a type a cost ledger of its own.

**Tests.** `TaxReverseChargeTest` (recovery cases): excise as cost and VAT claimed, sales untouched, conditional by position, posting and balance, cost ledger, health.

## 19. Company tax details on documents (script 234)
- `company_profile` now holds `tax_country`, `tax_registrations`, `show_tax_jurisdiction`, `show_tax_registrations` (both switches start off).
- Saving the jurisdiction in Tax control copies country and registrations into the company columns; documents, receipts, statements and the storefront read only the company, never Tax control.
- Books → Configuration → Company has the two switches. Settings tab order: …Default ledgers, Reports, Company.
- Rounding per line/document and "prices include tax" are stored settings only; posting does not read them yet.
