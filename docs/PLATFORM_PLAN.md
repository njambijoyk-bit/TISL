# TISL Platform — Plan & Roadmap (what we want)

What we intend to build and the decisions behind it. For what is **already
built**, see **`PLATFORM_BUILT.md`**. Working conventions (delivery, SQL, push
rules, logging, builds) live in that doc's §1 and apply here too.

> When something here ships, move it into `PLATFORM_BUILT.md`.

---

## 1. Design philosophy — capabilities, not verticals

We do **not** build "a bakery module" or "a law module." We build **capability
modules that compose**, and each business switches on the ones it needs. 11
paid modules + always-on Core cover a huge range of industries because a
business is defined by *which switches are on*.

**The clusters** (what most requests actually are):

| Cluster | Example industries | Leans on |
|---|---|---|
| Book a time with a person/resource | clinics, estheticians, photography, law consults, salons, restaurant tables, viewings | Core **Bookings** + E-commerce **Services** |
| Sell physical goods | bakeries, pharmacies, retail | **E-commerce** (+ Extras Inventory) |
| Run a job/matter over time | engineering, construction, architecture, law | **Projects** + Core **Quotes** |
| Recurring money | subscriptions, gym/spa packages, retainers, rent | **Memberships** |
| Stay / space over date ranges | hotels, short-term rentals, coworking | **Accommodations** |
| Rent an item/property | rentals mgmt, equipment, vehicles | **Listings** |
| Feed people | restaurants, cafés, catering, custom cakes | **Menus** |
| Gathering with capacity | weddings, ticketed events, workshops | **Events** |
| Teach | courses, training, workshops | **Courses** |
| Give / mobilise | charities, churches, schools, campaigns | **Campaigns** |

**The magic is the combos.** A gym = Memberships + E-commerce (merch) + Courses
(programs) + Bookings (PT) + Events. A restaurant can add Courses (cooking
classes) + Events (private dining) + E-commerce (branded sauce). A photographer
= Services/Bookings + E-commerce (prints) + Galleries + Courses + Events. The
platform is a **business OS** that grows with the client.

The two most leveraged things to get right are **Bookings** (Core) and
**Services/packages** (E-commerce) — they alone unlock every appointment
business. **Bookings and Checkout are built last** (they're Core and everything
leans on them, so they benefit from seeing all callers first).

---

## 2. The 12 modules and what each should contain

| # | Module | Should contain |
|---|---|---|
| 0 | **Core** (always on) | customers, users & roles, team, currency, units, tax & withholding, payments, orders & invoices, checkout, quotes, loyalty, referral & promo, store credit (**+ gift cards**), credit accounts, reconciliation, financial notes, reports, help desk, publications, content pages, notifications, vault, Mimi AI, activity logs, themes, navigation, Module Center, **bookings**, **locations**, **galleries**, **form builder** |
| 1 | **E-commerce** | products (variants, categories, brands, bulk), **services & packages** (add-ons, duration, deposit %), specials, wishlist, reviews; **digital/downloadable products**; hampers, auctions |
| 2 | **Listings** | property, vehicles, equipment, rentals; rental periods (daily/weekly/monthly), availability calendar, security deposit, pickup/return, enquiries, paid viewings/test drives |
| 3 | **Campaigns** | fundraising & crowdfunding (goal, progress, donations), awareness/marketing campaigns without payments |
| 4 | **Courses** | courses, curriculum (modules→lessons→topics), enrolment, progress, lesson player, assessments, certificates |
| 5 | **Accommodations** | properties, room types, rooms, rate plans, availability calendar, reservations, room board, guest folio (settles at checkout), housekeeping |
| 6 | **Menus** | multiple menus, sections, items with modifiers/allergens, dine-in/takeaway/delivery, tables + floor plan, kitchen display, **custom orders** (cakes: lead time + deposit + pickup date) |
| 7 | **Events** | events, ticket/RSVP types, capacity, add-ons, attendees, QR check-in, optional seating |
| 8 | **Memberships** | plans (interval, trial, proration, pause, dunning), **retainers**, **class passes / credits** (10-session packs), member check-in, member-only gates, **branch access scope** |
| 9 | **Careers** | job board, applicant portal, ATS with AI screening, interview scheduling, offers |
| 10 | **Projects** | projects/**jobs/matters**, milestones, tasks, messages, participants; **time entries + billing** (T&M vs fixed), documents, client portal, approvals |
| 11 | **TISL Extras** | delivery (manifests, drivers, incidents, ratings, driver portal), **inventory** (per-location stock, batches/expiry, movement ledger, **transfers**, reconciliation, worksheets), algorithm (ranking, pins, search analytics) |

**Owner-only, never shown to clients:** bug reports, dev notes, dev keys, Data Engine, flowcharts. Vendors/multi-vendor marketplace is deferred (separate middleware + planning session).

---

## 3. Multi-location & multi-currency (design locked 28 Sep 2026)

Location is **not** an e-commerce feature. It is a **cross-cutting Core
capability** that hangs off the Purchasable contract (§9): every sellable
inherits a location dimension. Central catalog, location-scoped everything,
**dormant on a single branch** (one auto-created "Main" location, no UI) and
powerful for a chain.

### 3.1 What a location is
`locations`: name, code, address + geo (lat/lng), phone, **timezone**, opening
hours, `is_default`, `is_active`, `accepts_pickup`, `accepts_delivery`, delivery
zone; **`currency_id`** and **`tax_district_id`** (references the existing tax
districts table). Carrying currency + jurisdiction is what makes location "core."
Backed up under Core.

### 3.2 Three orthogonal axes (all polymorphic over the morph aliases)

| Axis | Question | Table | Lives in | Applies to |
|---|---|---|---|---|
| **Offered-at** | Do we do this here? | `location_offering(sellable_type, sellable_id, location_id, is_available)` | **Core** | every sellable |
| **Priced-at** | What does it cost here? (optional override) | `location_price(sellable_type, sellable_id, location_id, amount, currency_id, is_tax_inclusive)` | **Core** | every sellable |
| **Stocked-at** | How many are here? + movement/expiry | `stock_movements` + batches | **Extras · Inventory** | only *stockable* things |

Offered-at and priced-at are generic and Core — a service offered in Mombasa but
not Nairobi, a room priced differently per property, a course run only at one
campus are all just rows. "How many" splits into **stock** (Inventory) vs
**capacity** (Bookings / enrolment / rooms).

Each sellable also has a **`location_mode`**: `all` (everywhere, no rows needed —
solo shop or ship-anywhere), `specific` (use offering rows), `online`
(digital/ship-anywhere online context). Keeps simple/digital cases clean.

**Per-sellable axis use:**

| Sellable | Offered | Priced | "How many" |
|---|---|---|---|
| Product / variant | ✔ | ✔ | stock |
| Menu item | ✔ | ✔ | stock (count, or recipe/BOM later) |
| Service | ✔ | ✔ | Bookings capacity |
| Room | ✔ | ✔ (rate plans) | availability calendar |
| Listing / rental | ✔ | ✔ | rental calendar |
| Course | ✔ | ✔ | enrolment cap |
| Event ticket | ✔ | ✔ | capacity |
| Membership plan | ✔ (allowed branches) | ✔ | — |

### 3.3 Pricing, currency & tax — the resolution chain
- **Canonical price is stored tax-EXCLUSIVE (net).** Inclusive is always
  *derived per branch* (`net × (1 + branch_rate)`) — because one base price
  flows into branches with different rates, net is the only neutral truth.
- **Price(product, branch):** 1) `location_price` override if present (in the
  branch's currency); 2) else base price if same currency; 3) else auto-convert
  base → branch currency at current rate (snapshot stored). Default = **zero
  manual work**; override only for deliberate local pricing.
- **Override carries `is_tax_inclusive`** — admin can enter gross ("rings up at
  6 AED incl. VAT") or net; we normalize to net internally. Same for base-price entry.
- **Tax(product, branch):** product supplies the **tax_class**; branch supplies
  the **rate** for that class in its `tax_district`. Multi-country tax solves
  itself once location carries jurisdiction.
- **Inclusive/exclusive display:** `location.price_display_default` (local norm)
  + customer preference (guests get the branch default). Always relative to the
  branch in context, so never ambiguous.

### 3.4 Branch-in-context storefront
- Storefront always has a **current branch** (geo/nearest on first visit, else
  Main; switchable in the header — hidden when only one location).
- The whole storefront is scoped to it: each sellable shows **one** price, stock
  and availability for that branch.
- A sellable **not offered at the current branch but offered elsewhere** shows
  "Not available at Nairobi — offered at Mombasa, Kisumu" (one-tap switch), not
  hidden. Works for products, services, menu items, courses, rooms alike.
- **Switching branch re-prices the cart** and drops anything the new branch
  doesn't offer/stock, with a clear notice. Cart is tied to branch context.
- A cross-branch "from KES 300" range is a **v2** discovery nicety, shown
  **tax-exclusive** so rates are never mixed.

### 3.5 Clearance (two senses)
- **Staff clearance:** `location_user(user_id, location_id, role_scope)`. A
  branch manager sees only their branch's orders/bookings/stock/staff;
  admin/super_admin see all and get an **admin branch switcher**.
- **Customer access (memberships):** a plan declares **allowed branches**
  (single vs all-access); check-in validates the plan covers that branch. Powers
  gym branches and class passes. (v1: single or all; "any N of M" is later.)

### 3.6 Fulfilment & pickup
- Orders carry **fulfilment type** (pickup / delivery / dine-in / ship) + a
  **fulfilment location**. Customer picks the pickup branch at checkout, or a
  delivery address maps to the serving branch. "Ready for pickup at Ngong Road"
  flows through existing order status + notifications.

### 3.7 Stock movement & transfers (Extras · Inventory)
Applies to **any stockable** (products, menu items, ingredients) — not just products.
```
stock_movements(sellable/ingredient, location, delta, reason, ref_type, ref_id, batch_id, at, by)
stock_transfers(id, from_location, to_location, status, created_by, notes, dispatched_at, received_at)
stock_transfer_lines(transfer_id, item, batch_id?, qty_sent, qty_received)
```
- **One ledger** records every change: sale (−), purchase/restock (+),
  adjustment (±), return (+), transfer (two rows: − at A, + at B).
- **Transfer lifecycle:** draft → dispatched (qty leaves source, sits
  in-transit, not sellable) → received (lands at destination; partial allowed;
  `received < sent` = variance). Source dispatches, destination confirms.
- **Batches/expiry travel** with the stock: a transfer line references
  `batch_id`; on receipt the destination batch keeps the same batch_no + expiry.
- **Recipe/BOM** (one latte depletes milk + beans) is a **later Inventory phase**;
  v1 does simple counts. Ledger model already supports it.
- **Cross-border costing** (FX revaluation, customs/landed cost on a transfer)
  is **deferred**; v1 moves quantity at cost, no revaluation.

### 3.8 "Both redundant and central"
Source of truth = the pivot/ledger tables above. An optional **`location_ids`
JSON cache** on a sellable (for fast "in A, B" badges) is allowed only as a
**system-maintained, rebuildable mirror** — never hand-edited. Skip it unless a
join actually lags.

---

## 4. Cross-cutting capabilities & locked decisions

| Capability | Decision | Home |
|---|---|---|
| **Gift cards** | Same as store credit — a purchasable that issues wallet credit under a redeemable code. No new ledger. | Core |
| **Galleries / proofing** | Shared capability any module attaches (photography galleries, architecture portfolios, wedding albums). | Core |
| **Form builder / intake** | Shared capability (clinic/esthetician intake, law intake, event RSVP questions, consult forms). | Core |
| **Class passes / credits** | A credits model on plans (10-session packs) valid at allowed branches. | Memberships |
| **Digital / downloadable products** | Products can deliver a file/license (course PDFs, photo files, ebooks). | E-commerce |
| **Deposits & installments** | Checkout supports partial/deposit payments (weddings, custom cakes, rentals, construction milestones). Extends §9. | Core checkout |
| **Mobile money (M-Pesa)** | First-class payment method (deposits, tuition, donations, catering). High priority. | Core payments |
| **Generalised reviews & ratings** | Reviews apply to services, listings, stays, courses — not just products. | Core |
| **Serial / batch / expiry** | Tracked in Inventory (pharmacy meds, warranties). | Extras |
| **Group/class bookings + waitlists** | Bookings supports many-attendees-per-slot + waitlist (yoga, dance, cooking classes). | Core Bookings |

**Regulated verticals — scope lines:**
- **Pharmacy:** OTC sales + Rx **upload for pharmacist review** + batch/expiry via Inventory. **Not** full dispensing / controlled-substance workflows.
- **Clinic:** appointments + intake forms + encrypted notes. **Full EMR is out of scope** (separate compliance track). Patient medical records are health data — treat with care.

**Open decision:** **multi-location** is designed above (single vs all-access for membership branches in v1). Larger open item: whether per-branch price overrides are enabled per client or globally off by default — default **off**, opt-in per client.

---

## 5. New-module checklist — MUST sync to nav + backup + location

> Run this for **every** new module and for any change that adds a table, route
> or customer page. A module that skips it is invisible to customers and
> **silently missing from every backup**.

**Backend**
- [ ] SQL script (Workbench) for the module's tables — copyable file, not a migration.
- [ ] **Backup:** add every new table to `ModuleTables::MAP` (or `module_table_map`). Confirm `BackupPlanner::plan()` shows them *included* when active, not *unassigned*. Core tables → `core`. Secrets → `ModuleTables::EXCLUDE`.
- [ ] **Routes:** wrap the module's route group with `module:<key>` middleware. Core never gated.
- [ ] **Nav:** seed storefront links into `nav_links`; expose via `NavController`.
- [ ] **Location:** declare which axes each sellable uses (offered-at / priced-at / stocked-at) and its `location_mode`. Location-scoped tables carry `location_id`.
- [ ] Models, controllers, service provider under `app/Modules/<Module>/`.

**Frontend**
- [ ] Register in `_shared/navigation/modules.js` (MODULES + `isModuleActive`).
- [ ] Admin pages gated by module activity; storefront routes wrapped in `ModuleRoute`.
- [ ] Manifest declares sidebar group, nav links, account-menu links, settings tabs, dependencies, **and location axes**.

**Verify**
- [ ] Activate → data in a backup; deactivate → skipped with banner.
- [ ] Links appear in nav manager, toggle, and lock when the module is off.
- [ ] Offered-at / priced-at behave across two locations.
- [ ] `php -l` clean; frontend lint + full build pass.

---

## 6. Module manifests, code layout & folder convention

- **Manifest** (per module, one place): admin sidebar group, storefront nav links, account-menu links, settings tabs, dependencies, **location axes**. The admin sidebar, storefront nav manager and Module Center all read the manifests.
- **Backend:** `app/Modules/<Module>/` (models, controllers, routes, service provider).
- **Frontend:** `src/<module>/` with a manifest; pages lazy-loaded only when active. Core stays at `src/core/` and `src/_shared/`.

```
src/<module>/
  manifest.js          ← sidebar groups, nav links, account-menu links, settings tabs, deps, location axes
  pages/{admin,customer}/
  components/{admin,storefront}/
```

---

## 7. Modules to build (frontend breakdown)

> ❌ = not built yet. Build order in §10. Each follows the §5 checklist.
> Bookings is a Core capability (used by many). Vendors deferred.

### Listings (`src/listings/`)
Anything listed, viewed, rented, sold or enquired about — property, vehicles, equipment, venues, directories.
- **Admin ❌:** listings list; listing form (attributes vary by type); categories; enquiries list + detail; viewing/test-drive requests.
- **Customer ❌:** browse (search, filters, map, sort); detail (gallery, specs, enquire, location); enquiry form; request viewing/test drive (→ Bookings); My Enquiries.
- **Components ❌:** listing card, grid, filters, map view, enquiry modal, gallery.

### Campaigns (`src/campaigns/`)
Fundraising, crowdfunding, awareness, marketing.
- **Admin ❌:** campaigns list; form (fundraising/crowdfunding/awareness/marketing); donors/backers; updates; donations list.
- **Customer ❌:** browse; detail (goal, progress bar, donate/back CTA, updates); donate/back form (→ payments); My Donations.
- **Components ❌:** campaign card, progress bar, donor list, update feed, donation form.

### Courses (`src/courses/`)
- **Admin ❌:** courses list; course form; curriculum builder (modules→lessons→topics); enrolments; student progress; assessments.
- **Customer ❌:** catalogue; detail (curriculum preview, instructor, enrol CTA); enrol/pay (→ checkout); My Courses (resume); lesson player (video/PDF/text); quiz; My Certificates.
- **Components ❌:** course card, curriculum tree, lesson player, progress tracker, quiz, certificate viewer.

### Accommodations (`src/accommodations/`)
- **Admin ❌:** properties; room types; rooms; availability/rate calendar; reservations; room board (open/occupied/reserved/dirty); guest folios; housekeeping.
- **Customer ❌:** property browse; property detail (rooms, amenities, availability); room detail + booking (→ Bookings + checkout); My Reservations.
- **Components ❌:** room card, availability calendar, room board grid, folio summary, housekeeping badge.

### Menus (`src/menus/`)
- **Admin ❌:** menus (breakfast/lunch/…); sections + items; item options/modifiers (sizes, add-ons, allergens); tables + floor plan; table reservations (→ Bookings); kitchen orders (KDS); menu orders list.
- **Customer ❌:** menu browse (by section, filter by allergen/diet); item detail (options); cart + order (table/takeaway/delivery → cart + checkout); table reservation; My Menu Orders (status, reorder).
- **Components ❌:** menu section, item card, modifier picker, cart (menu variant), KDS row, floor plan grid, table badge.

### Events (`src/events/`)
- **Admin ❌:** events list + form; ticket types + pricing; attendees; check-in (QR/manual); seating (optional).
- **Customer ❌:** browse (date/category/location); detail (schedule, speakers, tickets); ticket purchase (→ checkout); My Tickets (QR); check-in page.
- **Components ❌:** event card, ticket selector, attendee badge, QR viewer, seating map (optional).

### Memberships (`src/memberships/`)
- **Admin ❌:** membership types + plans (benefits, pricing, cycle, **allowed branches**); members list + detail (status, expiry, renewal); check-in (attendance); billing/renewals (recurring via Core payments); access permissions (content gates); **class-pass/credits**.
- **Customer ❌:** plans browse; plan detail + join (→ checkout/recurring); My Membership (status, expiry, benefits, renewal); member portal; member directory (optional).
- **Components ❌:** plan card, status badge, renewal countdown, check-in button, member-only gate.

---

## 8. Tax design (decided, not yet built)
- **Item tax class** per product/service (standard, zero-rated, exempt), with override. No category defaults.
- **Customer tax status:** standard by default; zero-rated/exempt/withholding-agent only once an admin verifies.
- **Line-by-line result:** each line records the treatment applied, even at 0% (zero-rated vs exempt reported differently).
- **"Verify your tax status" form** (neutral wording; ID label follows country — KRA PIN, TIN, VAT, GST — with document upload), feeding an admin review queue that creates and verifies the certificate on approval.
- **Display preference:** include/exclude tax (guests: include). Resolves per branch jurisdiction (§3.3).
- **Later:** backend allows only one "standard" tax type.

---

## 9. Theming
**Current state (measured):** ~16,000 hex colours across 367 of 479 `.jsx` files, ~7,700 `rgba()`, brand purple ~3,500×; ~1,800 Tailwind colour classes, ~1,000 `dark:`. **Tailwind isn't generating utilities** (v4 postcss but v3 `@tailwind` directives), so most colour classes are dormant; only hand-written `styles/layout.css` works. `index.css` has a variable system most components ignore; `--color-text-primary` (38 files) is undefined.

**Plan (storefront first):** 1) one token set as CSS variables (brand, accent, bg, surface, text, muted, border, success, warning, danger; brand also as RGB channels); 2) Tailwind palette points at tokens; 3) themes table + admin editor (live preview, contrast check); 4) customer theme picker (profile/header, per-customer, remembered for guests) — hidden until step 5; 5) storefront conversion; 6) all new pages on tokens from day one; 7) admin conversion area by area. **Undecided:** colours only, or also fonts/roundness/logo?

---

## 10. Checkout (after modules; built with Bookings, last)
- **Purchasable contract** per sellable type: price + currency, tax class, **location axes (§3)**, availability, reserve/release, fulfil.
- Cart & order lines point at purchasables polymorphically.
- **Ways to pay:** pay now; open tab/folio settled later (stays, credit accounts); recurring (memberships); **deposits/partial (§4)**; **M-Pesa (§4)**.
- **Shared booking & availability service** for slots, date ranges, seats (services, viewings, rooms, events, classes + waitlists).
- **Currency/tax:** convert into the customer's account currency with snapshots; tax from item class × **branch jurisdiction**; promo/wallet/loyalty via the conversion helper.
- Also: customer currency-change request form + review queue; tax-status request form.

---

## 11. Build order
1. ~~Admin navigation~~ (done)
2. **Theming** steps 1–5 (§9)
3. ~~Module registry, Module Center, license keys, route gating~~ (done)
4. ~~Backup & restore engine~~ (done; Streamlit viewer done)
5. ~~Storefront navigation manager~~ (done)
6. **Locations / multi-branch** (Core scaffolding: locations, offered-at, priced-at, staff clearance, branch context) — §3
7. **New modules** one at a time, each per §5: **Listings → Events → Campaigns → Courses → Memberships → Accommodations → Menus**
8. **Bookings + Checkout foundations** (Core) — last (§10, plus tax §8)

---

## 12. Backlog & known issues

**Checkout & money** (address during checkout work)
- Checkout charges `product.price`, ignoring chosen variant/unit.
- Quote list merges variants of the same product.

**Security & enforcement** — spread license checks through model loading, jobs, nav (done for routes + nav); confirm queued/scheduled work is gated.

**Validation** — tighten server-side validation on new module forms.

**Currency** — retire `exchange_rate_to_kes` naming in any remaining spots.

**Variants & units** — ensure every sellable path respects variant + unit pricing.

**Tax structure** — enforce single "standard" tax type (§8).

**Housekeeping** — finish Core internal regrouping (Payments, Reconciliation, Financial notes, Referral/promo, Content pages, Policies) with the Settings hub.

**Known latent:** PHP 8.5 vs `maatwebsite/excel`→phpspreadsheet (<8.5) dependency; FTP/SFTP/S3 need Flysystem adapters installed for remote backups.
