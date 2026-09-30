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
| 0 | **Core** (always on) | customers, users & roles, team, currency, units, tax & withholding, payments, orders & invoices, checkout, quotes, loyalty, referral & promo, gift voucher (**+ gift cards**), credit accounts, reconciliation, financial notes, reports, help desk, publications, content pages, notifications, vault, Mimi AI, activity logs, themes, navigation, Module Center, **bookings**, **locations**, **galleries**, **form builder** |
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

> ### ⚠️ PRINCIPLE: location-coupled by default.
> **Most features are coupled to location.** Any sellable, and most module data,
> carries a location dimension — availability, price and (where it applies) stock
> resolve per branch. New work should assume location-awareness from the start,
> not bolt it on later; the §5 checklist requires every module to declare its
> location axes. A single-branch business never sees any of it (everything
> defaults to "Main").

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
> **Split:** the **basic per-branch quantity** lives in Core/E-commerce as
> `variant_location_stock` (§3.9) — it's what the storefront reads for
> availability. **Extras · Inventory** adds the richer layer below on top:
> the movement ledger, transfers, batches/expiry and reconciliation.

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

### 3.9 E-commerce × locations — products, services, variants, auctions, hampers (plan 28 Sep 2026)

How the existing catalogue plugs into the three axes. Current state: nothing
writes/reads `location_offering`/`location_price` yet — every product/service is
global (implicitly `location_mode = all`, one price, one global stock number).
Tax already resolves by district (`TaxService::calculateForEntity` takes
`districtIds`), so multi-branch tax is mostly wiring.

**Products (confirmed 28 Sep 2026)**
- **Offered-at:** derived from per-branch **variant stock** (see below) — a variant is "sold at" a branch when it has a stock row there. A product with no rows anywhere is legacy/global (shown everywhere) until an admin sets branch stock — **opt-in per product, non-breaking**.
- **Price is NOT per branch.** All branches sell at the same price; price differences are expressed through **variants / variant-units** (`product_variant_units.price`). Cross-currency branches simply show the base price auto-converted for display. There is no per-branch price override (the `location_price` table stays as unused Core scaffolding for now). *(Revised 28 Sep 2026 — dropped per-branch pricing.)*
- **Tax:** feed the branch's `tax_district_id → selfAndAncestorIds()` into `TaxService`, plus the tax-rate change below.
- **Display:** storefront scoped to the branch in context; a product not offered at the current branch shows an "Available at <branch>" note rather than vanishing.

**The variant model — the variant is the atomic sellable (confirmed, resolves the "fake options" trap)**
- **Every product has ≥1 variant.** A **simple product has one option-less "default" variant**, created **silently** by the backend — the admin never invents a fake option ("size: M" for a couch). Options exist **only** for real variations; when they exist, variants are generated from the option combinations as today.
- **Hierarchy:** `product → 1..n variants (≥1 always) → 1..n units (≥1; price lives on the unit) → variant_location_stock per branch`. Options are just what *generate* variants when variations exist.
- `has_variants` is redefined to mean **"has customer-visible options"** (a simple product is `has_variants = false` but still has its one default variant internally).

**Options, variants & per-branch stock (location lives on VARIANTS, not options)**
- **Definitions stay central** — options/values and variant combinations defined once; never per-branch.
- **Stock is per variant per branch:** new table **`variant_location_stock(product_variant_id, location_id, quantity, …)`**. "Large red mug: 12 in Nairobi, 3 in Ruiru."
- **Availability derives from stock rows:** row present = sold at that branch; `quantity = 0` = out of stock there; **no row = not offered there**.
- **New variants seed across branches:** when a variant is created, the entered quantity lands in **Main** and every other branch starts at **0** (ProductVariant `created` observer). Admin adjusts other branches on the per-branch grid.
- **`stock_quantity` is an auto-calculated cache, never hand-edited:** `variant.stock_quantity` = sum across branches; `product.stock_quantity` = sum across variants; `in_stock` = total > 0. Truth = `variant_location_stock`, recomputed on every stock change (saveQuietly). The product's Stock field in the form is **read-only when the product has variants**. Kept so existing `isInStock()`/`scopeInStock()` reads keep working.
- **Product form:** the per-branch grid lives at the **bottom of the Variants tab**, and only shows when there is **more than one branch** and the product has variants. Simple products keep a single manual stock number (their implicit default variant carries it); they're global unless localized.
- Basic per-branch counts are **Core/E-commerce**; **batches, expiry, transfers, reconciliation stay in Extras · Inventory** (§3.7).

**Auctions & hampers — belong to ONE branch; items are VARIANTS (confirmed)**
- A hamper/auction **belongs to a single branch** (`location_id` chosen at creation), not many-to-many offered-at.
- Their items are **specific variants (and unit)**, not just products — that's the thing with identity + branch stock.
- **Hamper composition:** items must come from that branch. If a chosen variant has 0 at branch A while building a branch-A hamper, show **"Branch A is out of stock"** + a **badge listing the branches that do have it** (from `variant_location_stock`).
- **Auction:** "this auction belongs to Branch B" → the auctioned variant must have stock in Branch B.
- **Listing:** show **all** hampers/auctions regardless of selected branch, each with an **info badge naming its owning branch** (they're limited, event-like items where discovery matters; products filter, these badge).
- Bidding/buying stays tied to the item's branch (collect/settle there).

**Services — underdone; overhaul planned**
Services are currently a flat `base_price` + rate fields + a `pricing_tiers` JSON blob. Target structure (parallels products):
- **Service packages/tiers as first-class** (the service equivalent of variants): Basic / Standard / Premium, each with price + duration.
- **Add-ons** (upsells), **duration + buffer**, **deposit %** (§4).
- **Staff / resource assignment** and **per-branch availability** — lean on **Bookings** (built last).
- **Per-location** offered-at / priced-at / tax, same as products.
- **Phasing:** (1) *now* — wire services' offered-at / priced-at / tax like products; (2) *services catalog overhaul* (packages, add-ons, deposit) — a focused phase, can precede Bookings; (3) *booking-dependent parts* (staff, availability calendar) — with Bookings.

**Tax — the rate must vary by district (confirmed)**
Districts already sit on tax **rules** (`tax_rule_districts`), but a `tax_rate` is keyed only by `(tax_type, classification)` — so "VAT · standard" is one global %. Fix: add a **nullable `tax_district_id` to `tax_rates`**. A rate is **global** (`district = null`, default) or **district-specific** (KE 16%, UG 18%); rate selection prefers the district-specific rate and falls back to the global one. The branch supplies its district. This keeps a single "standard" classification instead of proliferating per-country tax types, and is backward-compatible (existing rates become the global default).

**Checkout (recorded for the checkout phase):** at checkout the customer must pick a **specific variant + unit**, and that variant's row in `variant_location_stock` **at the fulfilment branch** is decremented — "which cups, in which unit." Overselling is blocked against the branch quantity.

**Build order for the E-commerce × location work:** ~~per-branch variant stock~~ (done — `variant_location_stock`, new-variant seeding, auto product-stock cache, branch grid in the Variants tab, branch-scoped storefront) → tax (branch district + district on rates) → auctions/hampers branch ownership + composition checks → services light wiring → [later] batches/expiry/transfers (Inventory) + services overhaul. **No per-branch pricing** — price is per variant.

**Confirmed:** (a) products filter by branch, auctions/hampers belong to one branch + show-all with an owning-branch badge; (b) central variant/option definitions, **per-branch stock at the variant level**; (c) location on variants (not options); (d) tax rate gains a nullable district. **Still open:** whether the services catalog overhaul lands before or after the new modules.

---

## 4. Cross-cutting capabilities & locked decisions

| Capability | Decision | Home |
|---|---|---|
| **Gift cards** | Same as gift voucher — a purchasable that issues wallet credit under a redeemable code. No new ledger. | Core |
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

**Open decision:** **multi-location** is designed above (single vs all-access for membership branches in v1). Per-branch price overrides were considered and **dropped** — all branches sell at the same price; price differences are expressed through variants (§3.9).

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
- **Rate varies by district:** `tax_rates` gains a nullable `tax_district_id` — a rate is global (null) or district-specific; selection prefers the district match, falls back to global. Districts already sit on rules; this makes the *number* per-jurisdiction too (§3.9).
- **Later:** backend allows only one "standard" tax type.

---

## 9. Theming
**Current state (measured):** ~16,000 hex colours across 367 of 479 `.jsx` files, ~7,700 `rgba()`, brand purple ~3,500×; ~1,800 Tailwind colour classes, ~1,000 `dark:`. **Tailwind isn't generating utilities** (v4 postcss but v3 `@tailwind` directives), so most colour classes are dormant; only hand-written `styles/layout.css` works. `index.css` has a variable system most components ignore; `--color-text-primary` (38 files) is undefined.

**Plan (storefront first):** 1) one token set as CSS variables (brand, accent, bg, surface, text, muted, border, success, warning, danger; brand also as RGB channels); 2) Tailwind palette points at tokens; 3) themes table + admin editor (live preview, contrast check); 4) customer theme picker (profile/header, per-customer, remembered for guests) — hidden until step 5; 5) storefront conversion; 6) all new pages on tokens from day one; 7) admin conversion area by area. **Undecided:** colours only, or also fonts/roundness/logo?

---

## 10. Books, vouchers & sales chain (design locked 29 Sep 2026 — replaces the old order/checkout/payments model)

Modelled on double-entry voucher accounting (a Tally-style structure), built into the platform — **not** a Tally replacement. All existing order/payment/hamper-order/auction-order data is test data and is dropped.

**Masters**
- `ledger_groups`: a tree. **Primary groups are fixed and locked** (Current Assets, Fixed Assets, Current Liabilities, Capital, Loans, Investments, Suspense, Sales Accounts, Purchase Accounts, Direct/Indirect Income, Direct/Indirect Expenses); each carries a *nature* (asset/liability/income/expense) that subgroups inherit. Custom groups nest to any depth under a primary (Indirect Expenses > Establishment > Rent & Rates). Seeded subgroups: Cash-in-hand, Bank Accounts, Stock-in-hand, Sundry Debtors, Sundry Creditors, **Duties & Taxes (under Current Liabilities — all tax ledgers live here, e.g. VAT Output 16%, VAT Output 8%, VAT Input)**.
- `ledgers`: group, opening balance, optional customer/supplier link. **One ledger per customer** (created on first transaction) and a **Walk-in ledger** for guests. Payment methods map to ledgers (Cash, M-Pesa, each bank).

**Vouchers** (`voucher_types` carry: posts accounts?, moves stock and which way?, numbering series per type/branch like `WNKJ-INV-24530`)
| Type | Debit | Credit | Items / stock |
|---|---|---|---|
| Sales Order | – | – | Yes; reserves stock, no accounts |
| Delivery Note | – | – | Yes; stock out |
| Sales (invoice) | Customer | Sales account per line, tax ledgers | Yes |
| Cash Sale | Cash / M-Pesa / Bank | Sales account per line, tax ledgers | Yes |
| Purchase | Purchase account per line, VAT Input | Supplier | Yes; stock in |
| Credit Note | Sales returns, tax | Customer | Yes; stock in |
| Debit Note | Supplier | Purchase returns, tax | Yes; stock out |
| Receipt | Cash/Bank | Customer | No; set against bills |
| Payment | Supplier/expense | Cash/Bank | No |
| Journal, Contra | any | any | No |
Every posted voucher balances (Σ debit = Σ credit). Posted vouchers are immutable; corrections by credit/debit note or reversing entry, with an audit trail.

**Item lines are dynamic** (`voucher_items`): a line is a product variant, a service package, a hamper, a hamper component, or a charge (shipping, discount, rounding). Columns adapt to the voucher/line type (product | **variant** | unit | qty | rate | discount | **tax rate** | amount; services show package/duration, no stock). Each line snapshots name/variant/sku/unit, its **own tax class and rate** (one line 16%, another 8%), the ledger it posts to, and the branch. The voucher's tax entries are the per-tax-ledger totals.

**Hampers:** shown as one collapsible line ("Repmah hamper × 1 = total") with its components indented under it. Accounting, tax and stock use the **components**. When building a hamper, the admin enters a **sale price for each item** and the item prices must add up to the hamper price (auto-distribute by list price, remainder on the largest line).

**Sales chain (Order and Checkout are merged into vouchers):** Checkout (particulars) creates a **Sales Order**. Paying at checkout creates a **Cash Sale**; an admin can convert a Sales Order to a **Cash Sale** or **Sales invoice**; dispatch/pickup creates a **Delivery Note**; a customer payment creates a **Receipt** set against the invoice. **Stock moves once:** a Delivery Note moves stock; documents created *from* a delivery don't; a standalone invoice/cash sale moves stock itself. Services are quoted: an accepted quote becomes a Sales Order → invoice (no stock lines). M-Pesa/gateway records stay as a transaction log linked to the Receipt.

**Period control:** financial years, and a **super-admin-set edit window** (how far back a voucher can be edited/cancelled) with **per-role limits**; drafts are always editable; beyond the window only a super-admin override, logged.

**Exports** from one shared layer, in **JSON, CSV, XML, HTML and PDF** (invoices, vouchers, ledger statements, day book, trial balance, P&L, balance sheet, ageing).

**Data Engine → to be renamed and rebuilt after the modules exist:** clearer name (proposed "Data Exchange": Import · Export · Migration · AI assist), follows the system theme instead of its own, and gains **import** (including importing vouchers/ledgers/items from Tally exports). Not part of this build.

**Build order:** 1) engine — groups, ledgers, voucher types/series, voucher + entries + items + bills + stock movements tables (SQL files), the posting service (balance check, immutability, numbering, period lock), seeders; 2) books screens — ledger tree, voucher entry, day book, ledger statement, trial balance, P&L, balance sheet, receivables ageing, exports; 3) the sales chain (checkout → order → cash sale/invoice → delivery → receipt) for products, hampers, auctions, services; 4) drop the old orders/payments/credit tables and move gift voucher, credit accounts, loyalty and withholding onto ledgers; 5) Data Exchange.

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
- Checkout charges `product.price`, ignoring chosen variant/unit; order creation decrements `product.stock_quantity` by raw quantity (ignores variant, unit and branch) — fixed by the sales register.
- Quote list merges variants of the same product.

**Security & enforcement** — spread license checks through model loading, jobs, nav (done for routes + nav); confirm queued/scheduled work is gated.

**Validation** — tighten server-side validation on new module forms.

**Currency** — retire `exchange_rate_to_kes` naming in any remaining spots.

**Variants & units** — ensure every sellable path respects variant + unit pricing.

**Tax structure** — enforce single "standard" tax type (§8).

**Housekeeping** — finish Core internal regrouping (Payments, Reconciliation, Financial notes, Referral/promo, Content pages, Policies) with the Settings hub.

**Known latent:** PHP 8.5 vs `maatwebsite/excel`→phpspreadsheet (<8.5) dependency; FTP/SFTP/S3 need Flysystem adapters installed for remote backups.


## 10a. Books — build status

Built: chart of accounts, voucher types with dynamic numbering series (prefix / suffix / start / width / reset / per-branch / manual override), payment methods mapped to any asset ledger, period control (company edit window, per-role limits, financial-year close), the voucher engine (order → delivery → invoice / cash sale → receipt, per-line tax, hamper components, stock moves once), reports (day book, ledger, trial balance, P&L, balance sheet, receivables / payables ageing), exports (JSON, CSV, XML, HTML; PDF once `dompdf/dompdf` is installed), the admin Books area, and per-item hamper sale prices.

Not yet: storefront checkout still uses the old order/payment tables; the legacy order / payment / credit tables are not dropped; gift voucher, loyalty and withholding are not yet moved onto ledgers; Data Engine rename ("Data Exchange").

## 11. Books phase 2 — quotations, checkout, and everything that carries money

### 11.1 Quotation voucher
- New voucher type **Quotation** (`quotation`, no accounting, no stock, has items, customer party, own numbering series, `WNKJ-QT-`). Statuses: `requested` → `quoted` → `accepted` / `declined` / `expired`.
- A customer's quote request (today's `quote_requests` + quote list) becomes a Quotation in state `requested`: lines carry the chosen service package / product variant and answers to requirements, **no price yet**.
- Admin opens the request, prices each line (or the catalogue price pre-fills), adds charges/discounts, sets validity, and sends it: state → `quoted`, customer notified.
- Customer accepts on the storefront → chain continues: **Quotation → Sales Order → (Delivery Note) → Invoice / Cash Sale → Receipt**. Quotation joins the chain as the first link (`source_voucher_id`); acceptance converts it, it never posts.
- Retires `quotes`, `quote_items`, `quote_requests` (data is test data).

### 11.2 Checkout rewiring
- Checkout collects particulars (address, branch, delivery method, promo/referral code, payment method) and calls `placeOrder` → Sales Order; if paid at checkout (M-Pesa/card confirmation callback) → `settleOrder` → Cash Sale + payment ledger by the method's mapped ledger.
- Guests → Walk-in ledger; signed-in customers → their own ledger. Payment methods offered = `payment_methods.is_online`.
- Orders/sales register in admin = the Vouchers list filtered to Sales Order / Cash Sale / Invoice. Order detail page becomes the voucher page. Legacy `orders`, `order_items`, `payments` retire after this lands (SQL drop script delivered separately, not a migration).

### 11.3 Duties & Taxes becomes the tax ledger home
- `tax_types.application_mode` already separates **additive** (VAT, excise, customs — charged on top) from **withheld** (deducted from what is paid). Keep it. Add a `kind` (vat, excise, customs, withholding_income, withholding_vat, other) for reports.
- **Creating a tax type** asks for an **opening balance** (and Dr/Cr). Saving creates (or links) a ledger under Duties & Taxes named after it — one control ledger per type, plus per-rate ledgers as today (`tax_rates.ledger_output_id/ledger_input_id`). The opening balance is the ledger's opening balance; every posting then moves it. Editing later never rewrites history — changes to opening balance go through a Journal.
- **Additive tax** (VAT): sale credits *Output* ledger, purchase debits *Input* ledger; the balance owed = Output − Input.
- **Withholding — two sides, never added to the price:**
  - *Customer withholds from us* (they pay 95,000 of 100,000): receipt = Dr Cash 95,000, Dr **Withholding Tax Receivable** 5,000 (asset, a credit against our income-tax), Cr Customer 100,000. The certificate (existing `withholding_certificates`) later clears the receivable.
  - *We withhold from a supplier*: payment = Dr Supplier 100,000, Cr Cash 95,000, Cr **Withholding Tax Payable** (Duties & Taxes) 5,000, remitted to KRA by a Payment voucher.
- Rates are **rules**, not fields on the type: the existing classification/rule tables pick 5% / 3% / 20% by payment nature and resident status. Withholding VAT (2%) is its own type.
- Existing tax and withholding screens get an "Opening balance" field and a live ledger balance next to each type; the Books trial balance is the source of truth.

### 11.4 Other money things become vouchers
| Thing | Posts as | Ledger |
|---|---|---|
| **Gift voucher** (refund to credit, top-up) | Credit Note → to Gift Voucher Liability; spending it = Journal/Receipt Dr Gift Voucher Liability, Cr Customer | Gift Voucher Liability (Current Liabilities) |
| **Loyalty points** | Earned: Journal Dr Loyalty Expense, Cr Loyalty Points Liability (points × value); redeemed: Dr Liability, Cr Sales discount | Loyalty Points Liability |
| **Customer credit / credit accounts** | Simply the customer's Sundry Debtors ledger + invoices with due dates and bill-by-bill settlement; credit limit and terms live on the customer; schedules/instalments generate due dates on the invoice bill refs | customer ledger |
| **Withholding credit** | See 11.3 — receivable ledger + certificates clearing it | Withholding Tax Receivable |
| **Promo & referral codes** | Not vouchers themselves: they produce a **discount line** on the Sales Order (Discounts Allowed ledger). Referral rewards post as gift voucher or loyalty via the rows above. Usage rows keep pointing at the voucher | Discounts Allowed |
| **Delivery / shipping** | Charge line → Shipping Income ledger | as built |
| **Refunds** | Credit Note (goods back → stock in) then Payment voucher if cash is returned | Sales Returns |

Customer-facing balances (credit, points, gift voucher) are read from ledgers/bill refs, so there is one source of truth; the old transaction tables retire after their history is migrated (or dropped — all test data).

### 11.5 Order of work
1. Tax type/withholding opening balance + ledger link (small, isolates Duties & Taxes).
2. Quotation type + request workflow (admin pricing screen, customer accept).
3. Checkout → Sales Order / Cash Sale; promo & referral as discount lines.
4. Gift voucher, loyalty, customer credit, withholding credit as voucher postings.
5. Drop legacy tables (SQL script), then Data Exchange rename/import.

### 11.6 Open questions
1. Quotation numbering prefix `WNKJ-QT-` and validity default (14 days)?
2. Loyalty: value of a point for accounting (use existing loyalty setting's redeem rate)?
3. Withholding receivable: recognise at receipt time (recommended) or when the certificate arrives?
4. One ledger per tax *type* or per tax *rate* as the "opening balance" holder? (Recommended: per type for the balance, per rate only for output/input split.)


## 12. Money everywhere — currency, ledgers and what else has to change

Decisions taken: numbering prefix **WNKJ-** (WNKJ-SO-, -DEL-, -INV-, -CSH-, -CN-, -GRN-, -PUR-, -DBN-, -RCT-, -PMT-, -JV-, -CTR-, -QT-); quotation validity **14 days**; loyalty value from the loyalty redeem rule; withholding receivable booked **at receipt**; one **control ledger per tax type** for the opening balance, per-rate ledgers for the output/input split; **"store credit" is renamed "Gift voucher"** everywhere (screens, emails, tables, ledgers). Loyalty points are not money — they redeem *into* a gift voucher.

### 12.1 Naming — no TISL in the product
- Voucher prefixes are WNKJ-… (numbering is data, editable in Books → Settings). A follow-up SQL script rewrites the seeded prefixes from script 14.
- No brand string in code. Company name / short code / legal name / tax PIN come from one settings row (`company_profile`) that emails, PDFs, order numbers and notifications read. Today "TISL" is hard-coded in: `Order` number generator, credit-invoice and careers mails, welcome email, promo descriptions, Data Engine, licensing, CORS/mail/daraja config, chat. All move to the profile; the repo/folder name is untouched.

### 12.2 One currency rule for the whole platform
1. **Master data** that holds money stores `(amount, currency_id)`: shipping cost and free-shipping threshold, tier thresholds (`free_shipping_threshold`, `min_spent`), promo/referral minimum order and fixed rewards, type discounts when fixed, loyalty redemption values, tax rates with a fixed amount, credit limits, gift vouchers, fixed fees on bookings, delivery costs.
2. **Documents** (vouchers) carry their own currency and the **exchange rate used**, fixed at posting. Every charge/discount/tax defined in another currency is converted at the voucher's date rate into the voucher currency; each entry stores `amount` (voucher currency) and `base_amount`.
3. **Base currency** = the currency flagged `is_base`. All `'KES'` defaults and `Currency::rateToKes()` (≈30 backend places, 115 frontend files) are replaced by base-currency helpers and one `<Money>` / `useMoney()` formatter. No screen may assume KES.
4. **Rate history**: add `currency_rates(currency_id, rate, effective_from)` so old documents and reports never shift when a rate is updated. Vouchers keep their own rate regardless.
5. **Foreign-currency ledgers**: `ledgers.currency_id` (nullable = base). Customer ledgers default to the customer's pinned currency. Statements show foreign and base columns.
6. **Exchange differences**: when a receipt/payment is settled at a different rate from the invoice, the difference posts to *Exchange Gain/Loss* (realised). A period-end revaluation Journal handles open foreign balances (unrealised). Both are engine features, not manual.

### 12.3 Shipping & delivery
- `shipping_options` gains `currency_id`, `free_above_currency_id` (or the same), `income_ledger_id`, optional `tax_rate_id` (delivery is normally VATable), `expense_ledger_id`.
- **Creating a shipping option auto-creates its ledger** under *Shipping & Delivery Income* (a subgroup of Income) — e.g. "Shipping — Nairobi Standard". Editing the name renames the ledger; deleting is blocked once posted.
- On a voucher, a shipping charge is a charge line linked to the option; amount = option cost converted USD→voucher currency (500 USD on a JPY invoice shows JPY at the day's rate, with the original "USD 500.00 @ rate" noted). The document footer lists **Charges & taxes: ledger — amount**, then Total.
- **Delivery costs we incur** (fuel, courier, driver pay) post as *expenses*: a Payment/Journal voucher Dr *Delivery Expenses* (Direct Expenses), Cr Cash/Bank/Supplier. Delivery manifests get a "record cost" action that creates it. Report: shipping income vs delivery expense = delivery margin.
- Free-shipping-by-tier/threshold compares in a single currency (converted to base at checkout).

### 12.4 Customer tiers and types
- Percent discounts stay currency-free. Anything monetary (thresholds, fixed discounts) gets a currency. Tier progress (`total_spent`, orders) is computed from **posted vouchers' `base_total`**, not from orders.
- Discounts post **gross + contra**: revenue at list price, the discount to *Discounts Allowed* (engine change — today a line discount just reduces the sale). Each discount source (tier, type, promo, referral, manual) can have its own ledger under Discounts Allowed for reporting.

### 12.5 Taxes and withholding
- **Tax type** = subgroup under Duties & Taxes + a control ledger; creation asks **opening balance + Dr/Cr**. **Tax rate** creation auto-creates its ledger(s): Output/Input for additive types, Payable/Receivable for withholding. Percentage or fixed amount; fixed amounts carry a currency and convert like any charge.
- Position report: control balance + output − input (+ withholding payable − receivable). Settlement to the revenue authority is a Payment voucher.
- Withholding rules (5%/3%/20%, resident/non-resident) stay rules; certificates link to the **receipt voucher** that booked the receivable.
- All tax screens show the live ledger balance; the tax application log points to voucher lines.

### 12.6 Customer credit is abolished — the customer ledger is the account
- Remove `has_credit_account`, `credit_used`, `store_credit`, the credit transactions table, credit invoices and their services. Keep only **terms on the customer**: credit limit (+currency), payment terms (days), interest rate.
- Balance = customer ledger (Sundry Debtors). Credit sale = Invoice with due date; instalments = a **payment plan** attached to an invoice (generates due dates on the bill); interest/late fees = an *Interest* charge voucher (Dr customer, Cr Interest Income); manual adjustments = Journal (Dr/Cr customer); overdue = receivables ageing; credit-limit check happens when a Sales Order/Invoice is created.
- Admin "Customer credit" screens become customer-ledger views (statement, ageing, limit, plan) inside the customer page.

### 12.7 Gift vouchers (was store credit) and loyalty
- **Gift voucher** = a coded balance with currency, holder (customer or bearer), expiry. Accounting: one liability control ledger *Gift Vouchers Liability* (Current Liabilities) + a `gift_vouchers` sub-ledger reconciled to it in Books.
  - Sold → Cash Sale line (Dr Cash, Cr Liability; no VAT until redeemed).
  - Refund to voucher → Credit Note settled to it (Dr Sales Returns, Cr Liability).
  - Loyalty redemption → Journal Dr *Loyalty Liability*, Cr *Gift Voucher Liability*.
  - Referral/promo reward → Journal Dr *Rewards Expense*, Cr Liability.
  - Spent at checkout → a **payment tender** (payment method kind `gift_voucher` mapped to the liability ledger): Dr Liability. Can be combined with M-Pesa on one order (multi-tender receipt).
  - Expiry → Journal Dr Liability, Cr *Gift Voucher Breakage Income*.
- **Loyalty points** are not money: points lots (earn/expiry) stay in a small sub-ledger; their accounting value (points × redemption rule) sits in *Loyalty Points Liability*; redeeming converts them into a gift voucher; cancelled orders reverse the earn.

### 12.8 Promo codes and referral codes
- A code is a **rule** that yields a discount line (and, for referrals, a reward). It never posts by itself. Applying one creates a *Discount — CODE* line on the Sales Order posting to that campaign's discount ledger (default Discounts Allowed).
- `promo_code_usages` rows point to the **voucher and line**, storing discount amount in voucher currency and base; cancelling the voucher reverses usage counts.
- Referrer rewards: created when the referred customer's first sale is *settled* (Cash Sale, or Invoice fully paid), as a gift voucher / points Journal (12.7). Reversed if the sale is cancelled.
- Monetary fields (min order value, fixed reward) get currency and convert at checkout.
- **Logging**: (a) usage log per application (voucher, customer, code, amounts, currency); (b) settings-change audit for shipping options, tax rates, tiers, codes — who changed what, old/new — whenever a change affects posting (currency, ledger, rate); (c) vouchers keep their own audit trail. Existing per-module activity logs stay and feed one admin "activity" view.

### 12.9 Engine additions this needs
1. Discount ledger posting (gross + contra). 2. Payment tenders (multiple methods per receipt, gift voucher tender). 3. Exchange gain/loss on settlement + revaluation. 4. Ledger currency. 5. Charge lines linked to shipping options with currency conversion and tax. 6. Payment plans on invoices. 7. Purchase Order voucher (Order → Receipt Note → Purchase → Payment), replacing `purchase_orders`. 8. Quotation voucher (§11.1). 9. Gift-voucher and loyalty sub-ledgers with reconciliation checks. 10. Company-profile settings.

### 12.10 Other modules that must be redone or re-pointed
| Module | Change |
|---|---|
| Checkout, Orders, Payments (Daraja/M-Pesa) | Checkout → Sales Order / Cash Sale; `payments` shrinks to gateway attempts (currency-aware) linked to the receipt voucher |
| Quotes / quote requests | Become the Quotation voucher; existing admin quote pricing UI is reused |
| Financial notes | Credit/debit notes become vouchers |
| Reconciliation | Reconciles bank/M-Pesa statements against the payment-method ledgers (bank reconciliation) |
| Purchase orders / inventory buying | Purchase Order voucher chain |
| Reports & dashboards | Rebuilt on vouchers/ledgers, base currency; no KES assumptions |
| Customer algorithm scores, Mimi analytics, search/AI analytics | Read spend/orders from vouchers |
| Bookings & worksheets | Deposits, cancellation fees and worksheets → Sales Order/Invoice vouchers; fee currency dynamic |
| Auctions | Winning bid → Sales Order at the bid currency |
| Projects finance | Milestone invoices as Sales vouchers; project costs as Purchase/Payment vouchers |
| Delivery manifests | COD collected → Receipt; costs → expense voucher |
| Employees / careers | Salary currency dynamic; payroll journals later |
| Data Engine → "Data Exchange" | Rename, follow theme, read vouchers not orders; import last |
| Backup | Add new tables (gift_vouchers, loyalty lots, payment plans, currency_rates, company_profile, promo usages) |

### 12.11 Suggested order (each step ships with a plain SQL script)
0. Rename prefixes to WNKJ- + company profile + `<Money>`/base-currency helpers.
1. Currency foundation: `currency_rates`, ledger currency, FX differences, convert helper.
2. Tax types/rates/withholding → ledgers with opening balances.
3. Shipping options → currency + ledger + tax; delivery cost vouchers.
4. Engine additions 1, 2, 5, 6.
5. Quotation voucher + request workflow.
6. Checkout rewiring (Sales Order / Cash Sale, multi-tender, promo/referral lines).
7. Gift vouchers, loyalty, customer-ledger credit terms, promo/referral posting.
8. Tiers/types currency + spend from vouchers.
9. Purchase Order chain; bookings/projects/auctions/delivery hooks; financial notes; reconciliation.
10. Reports/dashboards/AI re-pointed → drop legacy tables → Data Exchange.

### 12.12 Decisions (settled)
1. Gift vouchers: **one control ledger + coded sub-ledger**.
2. Discounts post **gross + contra** (Discounts Allowed).
3. **Purchase Order** is a voucher type.
4. FX: **realised** gain/loss on settlement is built into the engine; **unrealised** revaluation ships later as a manual "Revalue foreign balances" Journal action (not automatic) — enough for correct books without surprising month-end postings.
5. "No TISL" means the **frontend and product text** — e.g. the numbering form's placeholder read `TISL-INV-{YY}-`. Fixed to `WNKJ-INV-{YY}-`; every other brand string moves to the company profile (12.1). PHP namespace/repo are untouched.

### 12.13 Scale of the redo
This touches most money-handling modules (see 12.10). Ship it as small vertical slices in the order of 12.11, each with its own SQL script and each leaving the platform working, rather than one big cut-over: the old order/payment/credit screens keep running until checkout is rewired (step 6), and only step 10 drops legacy tables.


## 13. Build status after the money rebuild (what exists vs what is left)

Built (SQL scripts 16–21 deliver the schema; code is on `tisl_v2`):
- **Foundation:** company profile (no brand in code), dated exchange-rate history, ledger currency, realised exchange gain/loss on receipts/payments, base-currency helpers in the storefront/admin (`getBaseCode`, `CurrencySelect`).
- **Duties & Taxes:** tax types become a subgroup + control ledger(s) with an opening balance; each rate makes its own Output/Input ledger (or the withholding payable/receivable); live tax position; withholding on receipts and payments (net cash, withheld tax to receivable/payable).
- **Shipping:** options carry a currency and optional tax and own an income ledger; charged as a converted charge line; document footer lists each charge with its ledger.
- **Engine:** discounts post gross + contra (per source/ledger), payment tenders (split payments, gift vouchers), quotation and purchase-order chains, receipt-note stock in, dated rates.
- **Quotations:** request → priced quotation → sent (14 days) → accept / decline / ask for changes → sales order; admin and customer pages.
- **Checkout:** server-priced quote, sales order / cash sale, M-Pesa STK as a gateway attempt that settles the order, gift voucher payment, on-account invoicing, customer order pages, hampers in the cart, auction winner → sales order.
- **Gift vouchers, loyalty, credit:** gift voucher sub-ledger + Books tab; points accrue as a liability and redeem into gift vouchers; referral rewards; a customer's credit is their ledger (terms on the customer, credit tab + dashboard rebuilt); promo/referral/tier money fields carry a currency.
- **Sales register:** Orders & payments pages read the books.

Not built yet (be honest with yourself before dropping tables):
- The legacy tables are **emptied, not dropped** (script 21). Delivery manifests (order-based), the old reports/analytics, the chat assistant, reconciliation, financial notes and the inventory purchase-order screens still read them and need re-pointing.
- Payment plans (instalments) on invoices; period-end revaluation of foreign balances; withholding *certificates* are not yet created from receipts (the certificate number is kept on the voucher).
- Data Exchange: renamed only — the theme restyle and import remain.
- KES still appears in the legacy order/quote/delivery/report screens and in DB column names such as `*_kes`.

## 14. One source of truth — everything financial is a ledger or a voucher

**What went wrong.** §12 made ledgers *for* shipping options, tax rates, gift vouchers — but the option/rate/voucher **tables stayed as the masters**, and the ledger was a shadow copy. Delete the option and the ledger lingers; rename one and the other drifts. The fix is not more syncing; it is to make the **ledger the master** and delete the twin.

### 14.1 What Tally teaches us (from the uploaded Master.json: 43 groups, 507 ledgers)
- A **group** is the type. Groups form a tree; *Duties & Taxes* sits under Current Liabilities; behaviour is on the group (`isbillwiseon`, `affectsgrossprofit`, `isrevenue`).
- A **ledger is one wide record** whose fields depend on its group. `Input VAT @16%` is just a ledger in Duties & Taxes with `taxtype = VAT` and `rateoftaxcalculation = 16`; `Housing Levy` and `NITA Levy` are ledgers with no rate (the amount is typed on the voucher). Rate lives **on the ledger**, not in a separate rates table.
- The **sales ledger says the tax nature** (`vatdetails`: Taxable (Standard) / Exempt / Zero Rated); the **duty ledger says the rate**. Parties (debtors/creditors, 109 + 300 here) carry `currencyname`, `incometaxnumber` (PIN), `vatdealertype`, credit days, addresses, bank details, and **bill-wise** tracking.
- **Opening balance is on the ledger** (with bill allocations for parties). Currency is a property of the ledger (`currencyname`).
- Nothing financial lives outside ledgers and vouchers. Tally has no "shipping options" or "tax rates" tables.

### 14.2 The model
1. **Group behaviour.** Add a `behaviour` to `ledger_groups` (inherited by subgroups): `party | bank_cash | tax | delivery_charge | discount | expense | income | liability_control | plain`. The ledger form shows only the fields that behaviour needs.
2. **Ledger attributes** (nullable columns on `ledgers`, exactly like Tally's wide record): `rate_type` (percentage | fixed), `rate_value`, `rate_currency_id`, `rate_unit_id`, `effective_from/to`, `tax_mode` (additive | withheld), `calc_base`, `calc_sequence`, `requires_certificate`, `tax_ledger_id` (VAT charged on this charge), `free_above` + currency, `is_offered` (shown at checkout), `sort_order`, `description`, `icon`, `gateway`, `instructions`, plus party fields (PIN, credit terms). One JSON `settings` column for anything group-specific.
3. **Currency everywhere:** every ledger has a currency; every rate/threshold/limit on it is `(value, currency)`; every voucher entry stores `amount`, `currency`, `rate`, `base_amount`.
4. **Delete = delete the ledger** (allowed only with no postings; otherwise switch it off). No twins to drift.

### 14.3 What dissolves into ledgers (tables retire)
| Today | Becomes |
|---|---|
| `shipping_options` | ledgers under **Shipping & Delivery** — "Courier Service": rate (percentage of goods or fixed), currency, free-above, optional "VAT on this charge" (a link to a tax ledger), shown at checkout |
| `tax_types` | **groups** under Duties & Taxes (behaviour `tax`, mode additive/withheld) |
| `tax_rates` | **ledgers** in that group (`Output VAT @16%`, `Input VAT @8%`, `WHT 5%`): rate, fixed-amount currency/unit, effective dates, calc base/sequence |
| `payment_methods` | ledgers under **Cash-in-hand / Bank Accounts** (behaviour `bank_cash`): `gateway`, `is_offered`, `requires_reference`, `instructions` — the method *is* the ledger |
| `store_credit_*` | **Gift Vouchers Liability** ledger (+ instrument sub-ledger, 14.5) |
| customer credit tables | the customer's ledger (done) |
| loyalty money | **Loyalty Points Liability** ledger (+ points sub-ledger, 14.5) |
| `payments` | receipts/payments; the gateway attempt stays a technical record |
| `orders`, `quotes`, `financial_notes`, `purchase_orders` | vouchers (SO/CSH/INV, QT, CN/DBN, PO) |

### 14.4 What stays outside ledgers — configuration, not money
Only **rules that decide which ledger/amount to use**, each pointing at ledgers rather than holding money of its own:
- **Tax rules** (which product/service/customer type/district/certificate gets which tax ledger) — assignments, not amounts. They reference the rate *ledger*.
- **Customer tiers & type discounts** (percent, thresholds in a currency) → resolve to a *Discounts Allowed* ledger.
- **Promo & referral codes, loyalty rules, referral programme** → rules that produce discount lines / points; each may name a discount ledger (a campaign can have its own ledger under *Discounts*, Tally-style, for reporting).
- Customers, products, services, hampers (catalogue) and gateway attempts.

### 14.5 Gift vouchers and loyalty points, plainly
- **Gift voucher = a claim on us for money.** One ledger, *Gift Vouchers Liability*, holds the total. Each voucher is an *instrument* (code, holder, currency, expiry, balance) — a **sub-ledger** like Tally's bill-by-bill allocations. Issue = Journal (Dr what funded it, Cr liability); spend = it is a payment method that debits the liability; expiry = breakage income. Every movement is a voucher; the instrument table is only the detail, and a reconciliation report proves instruments = ledger.
- **Loyalty points = a quantity, not money.** They are a **units ledger**: a per-customer points balance with expiry lots (a sub-ledger, like stock quantity). When points are earned, a Journal accrues their **value** to *Loyalty Points Liability* (Dr Rewards expense); redeeming points into a gift voucher moves value from *Loyalty liability* to *Gift voucher liability*. Points never appear as cash.
- Both therefore have a control ledger in the books and a detail table that must always reconcile.

### 14.6 Promo and referral codes
A code is a **rule**, not money. Applying one puts a discount line on the order posting to a discount ledger (the campaign's own, or *Discounts Allowed*); the referrer's reward is a Journal (points accrual / gift voucher issue). Usage is the voucher reference. Nothing else is stored as a balance.

### 14.7 Tax, carefully (planned before built)
- Keep the tax **engine** (rules, districts, applicability, certificates, effective dates, calculation sequence) — but its *rates* are ledgers. `TaxService` reads the rate from the ledger instead of a `tax_rates` row; `voucher_item_taxes` already stores `ledger_id`.
- Sales/purchase **item ledgers** carry the tax *nature* (Taxable standard / Exempt / Zero-rated) like Tally's `vatdetails`, so a product's sales account decides which tax applies; rules still override per customer/district/certificate.
- Withholding: same ledgers, `tax_mode = withheld`; receivable/payable pair per type (already built).
- Fixed-amount taxes (excise per litre) carry currency + unit on the ledger.

### 14.8 Order of work
1. Group `behaviour` + ledger attribute columns + the ledger form driven by behaviour (this is the master screen for everything below).
2. Shipping options → delivery-charge ledgers (checkout reads ledgers; drop `shipping_options`).
3. Payment methods → bank/cash ledgers with gateway attributes (drop `payment_methods`).
4. Tax types/rates → tax groups/ledgers; `TaxService` and the tax screens read ledgers; keep rules.
5. Gift-voucher / points sub-ledger reconciliation reports; campaign discount ledgers.
6. Retire the emptied legacy tables (finally drop them).
Each step ships with a SQL script that **moves the existing data into the ledger** before the old table is dropped.

### 14.9 Decisions needed
1. Approve "ledger = master, wide record, behaviour on the group".
2. Payment methods become ledgers too (one place to set M-Pesa till, bank, gateway).
3. Points stay a units sub-ledger with a liability ledger for their value (not cash ledgers).
4. Campaign discount ledgers are optional (default *Discounts Allowed*).

## 15. Taxes, withholding and shipping as ledger groups (plan)

Today: `tax_types` → `tax_rates` (rate, currency, validity, certificate flag) → `tax_rules` (module, customer types, order bands, priority) → `tax_rule_districts` / `tax_districts` (tree) → `tax_applicabilities` (per item/customer exempt + certificate) → `tax_legitimacy_certificates`; withholding: `withholding_classifications`, `withholding_certificates`, `withholding_credits`, `withholding_credit_clearances`. Rates already have output/input ledgers; the tables are still the master.

### 15.1 Duties & Taxes group behaviour = "tax"
A tax group (VAT, Excise, Withholding VAT, Withholding Income…) is a group under Duties & Taxes with behaviour `tax`. Group fields: nature (charge | withhold), direction (output/input), compound?, calculation sequence, default base (net/gross/quantity), certificate required?, authority + KRA reference, reporting return (e.g. VAT3).
### 15.2 Tax ledger = one rate (Tally: rate on the duty ledger)
Ledger fields: rate_type (percent | fixed | per-unit), rate_value, currency, unit of measure, valid_from/until (a rate change = new ledger version, old kept for history), opening balance (already built), applies-to nature (item/customer/module). Output and input are one ledger in Tally style with a `side` on the voucher line; we keep two only if the return needs them.
### 15.3 Districts, rules, exemptions stay as configuration that POINTS at ledgers
- Districts remain a tree (they are geography, not money); a ledger lists the districts it applies to.
- Rules (module, customer type, order bands, priority) reference tax ledgers instead of tax_rates.
- Exemption certificates stay a register (number, holder, validity, document) with holder = customer/supplier ledger; item "tax nature" (taxable/exempt/zero-rated) moves onto the sales/purchase ledger or stock item as in Tally.
- Exempt/zero-rated lines still print with the tax ledger at 0 so returns show them.
### 15.4 Withholding is a tax group with nature = withhold
Receipt/Payment vouchers post net cash + withholding ledger (asset on receipts: tax receivable; liability on payments: tax payable). The withholding certificate becomes a report/document generated from those voucher lines; credit clearances become Journal/Receipt vouchers against the receivable ledger. Tables withholding_credits/clearances retire after data migration.
### 15.5 Shipping & Delivery group behaviour = "delivery"
Group fields: default rate_type, currency, taxable?, income vs expense side, free-above default. Ledger fields: rate_type (percent of goods | fixed | per kg/km), rate_value, currency, min/max, free_above, service area (districts), transit days, optional tax ledger. Expenses we incur delivering are ordinary ledgers in the same group with side = expense (no rate needed).
### 15.6 Order of work
1. group `behaviour` + ledger attribute columns + behaviour-driven ledger form.
2. shipping options → delivery ledgers (script migrates rows, checkout/quote read ledgers).
3. tax types/rates → tax groups/ledgers; TaxService reads ledgers; rules re-pointed.
4. withholding → tax group + certificate report; retire credit tables.
5. reconciliation reports (tax returns, withholding certificates); drop retired tables.
### 15.7 Decisions
a) One ledger per rate (versioned by validity) vs one ledger per tax with a rate table. b) Single ledger for output+input vs two. c) Exemption certificates as a register (recommended) vs ledger. d) Delivery expense ledgers in the same group (recommended).

### 15.8 Build status (steps 1–3)
- Step 1 done: group `behaviour` + ledger rate attributes; behaviour-driven ledger form (SQL 23).
- Step 2 done: shipping options are delivery ledgers; `ShippingOption` is a facade over them (SQL 24).
- Step 3 done: tax types = tax groups directly under Duties & Taxes (code, mode, compound, active, balance ledgers are group columns); tax rates = ledgers (one per rate, versioned by validity; output and input share the ledger). `TaxType` / `TaxRate` are facades so the tax screens, rules and checkout keep working. Withheld rates are rate cards that post to the type's receivable / payable ledgers. Districts, rules, exemption certificates stay configuration pointing at them (SQL 25).
- Still to do: withholding certificate report + credit tables retired (step 4); reconciliation and tax-return reports, drop retired tables (step 5).
- Step 4 done: withholding is on the vouchers. A Receipt / Payment carrying withholding posts the tax to the type's receivable / payable ledger and generates a certificate (`WithholdingRegisterService`); a receipt's credit is cleared or written off by Journal vouchers (clearances are voided when their journal is cancelled). `WithholdingCredit` is a view over the certificate; the credit / clearance tables are retired (SQL 26). Legacy `WithholdingService` (order-time withholding) removed — it was no longer called. Payables (tax we withheld from suppliers) are remitted with ordinary Payment vouchers against the payable ledger.
- Step 5 done: Books > Reports gained Tax return (per tax type and rate: sales / purchases value, output, input, brought forward, owed), Withholding certificates (register with status and credit) and Reconciliation (trial balance; gift vouchers, loyalty points, withholding credits, receivables and payables against their registers, each with an "agrees" flag). All export like the other reports. SQL 27 drops the retired tables once you are satisfied.

## 16. Gift vouchers and loyalty points inside the master voucher plan

### 16.1 Where they stand today (audited against the code)
Gift vouchers — sound: issue = Journal (debit depends on the source: `sale` the payment method's ledger, `customer_account` the party ledger, `loyalty` Loyalty Points Liability, otherwise Rewards & Referral Expense), spend = a tender that debits the liability (partial use, several vouchers per sale, cancel restores), expiry = Journal to Breakage Income. Gaps: (a) `expireDue()` has no scheduler entry, so nothing ever expires; (b) `refund` vouchers are debited to Rewards expense instead of Sales Returns / the customer's account; (c) the register value in reconciliation uses today's rates because a voucher stores no base value.
Loyalty points — earn on a sale and reversal on cancel accrue value to Loyalty Points Liability; redemption to a gift voucher releases the liability into the gift-voucher liability. Gaps: (d) admin grant / deduct post nothing; (e) expiry removes points but leaves the liability; (f) redemption for a non-voucher ("gift" type) reward removes points and posts nothing; (g) the value per point is one live number, so changing it silently makes liability ≠ points × value; (h) the old order-time loyalty methods (`earnPointsForOrder`, `applyStoreCreditToOrder`, `spendCredit`) still exist on the legacy Order model.

### 16.2 Target: every movement is a voucher, the register is only detail
| Movement | Voucher | Posting |
|---|---|---|
| Points earned on a sale | Journal (auto) | Dr Rewards & Referral Expense, Cr Loyalty Points Liability |
| Points reversed (cancel) | Journal | the opposite |
| Admin grants points | Journal | Dr Rewards expense, Cr Loyalty liability |
| Admin deducts points | Journal | Dr Loyalty liability, Cr Rewards expense |
| Referral bonus points | Journal | as a grant, referenced to the sale |
| Points expire | Journal | Dr Loyalty liability, Cr Loyalty Breakage Income |
| Points redeemed for a gift voucher | Journal | Dr Loyalty liability, Cr Gift Vouchers Liability (+ the voucher) |
| Points redeemed for a goods reward | Delivery Note / Journal | Dr Loyalty liability, Cr Sales (or Rewards expense) — see decision D |
| Gift voucher sold | Receipt-style | Dr cash/bank/party, Cr Gift Vouchers Liability |
| Gift voucher promotional / referral | Journal | Dr Rewards expense, Cr Gift Vouchers Liability |
| Gift voucher from a return | Credit Note settled to a voucher | Dr Sales Returns (+tax), Cr Gift Vouchers Liability |
| Gift voucher spent | tender on the sale | Dr Gift Vouchers Liability |
| Gift voucher expires | Journal | Dr Gift Vouchers Liability, Cr Breakage Income |

### 16.3 Points as a units ledger with lots
`loyalty_point_transactions` become **lots**: each earn is a lot (points, value per point at earn, expiry). Balance = Σ lot remaining; liability = Σ remaining × lot value. Redemption and expiry consume lots oldest-expiry-first and release exactly their value, so the liability never drifts when the point value changes. Reconciliation then compares the ledger to lot values, not to a live rate.

### 16.4 Order of work
1. Points: post admin grant / deduct / referral bonus / expiry; schedule both expiry commands; goods-reward redemption.
2. Lots with value-at-earn (migration builds lots from history at the current value).
3. Gift vouchers: store base value per transaction; refund source posts to Sales Returns via Credit Note; sell-a-voucher screen; schedule expiry.
4. Reconciliation switches to exact base values; customer wallet shows vouchers + points with their movements (each links to its voucher).
5. Retire the legacy Order-based loyalty methods.

### 16.5 Decisions
A) Value points by lot (recommended) or keep one live value with a revaluation journal when it changes. B) Sell gift vouchers at the till / online (recommended yes). C) Expired points and vouchers go to breakage income (recommended), not back to expense. D) A goods reward (non-voucher) is issued as a zero-price Delivery Note plus a Journal releasing the value to Rewards expense, or a Sales line paid by points — recommend the first.
- §16 step 1 done: every points movement made through `LoyaltyService` is booked (grant/earn accrue, deduct and goods rewards release, expiry moves the value to *Loyalty Points Breakage Income*); each transaction records its Journal number. Gift voucher expiry now has a command (`giftvouchers:expire`, daily) and points expiry runs daily instead of monthly. Reconciliation offers a one-off "Post correction" Journal for points moved before this change. Not yet: lots with value at earn (step 2) — until then the liability is points × the current value per point.
- §16 step 2 done: points are lots (`PointLotService`). Each earn stores the value of a point on the day (`unit_value`) and `remaining`; deducting, redeeming, reversing and expiring consume lots (the reversed sale's lot first, then soonest-expiring, then oldest) and release exactly what those lots carry; an expiring lot lapses at its own value into breakage income. A redemption for a gift voucher books any difference between the lots' value and the voucher's value to Rewards & Referral Expense. Older points get lots automatically (replayed, valued at today's point value) the next time they move or when Reconciliation runs. Reconciliation and the "Post correction" journal now compare the ledger with the lots (SQL 28).
- §16 step 3 done: gift vouchers keep the base value actually booked (`base_balance` / `base_amount`), and when a voucher closes at a different exchange rate than it was issued at the difference is journalled to exchange gain / loss, so a closed voucher carries nothing and Reconciliation is exact. A posted Credit Note can be refunded as a gift voucher (Dr the customer's account, Cr Gift Vouchers Liability — not Rewards expense), limited to what the note has left and what the account holds in credit. A voucher can be sold on a Cash Sale line (or an online order): the sale's own posting is the issue, the code is created when it is paid, cancelling the sale voids an unspent voucher and is refused once one has been used; gift lines are never discounted and earn no points. Storefront: "Gift vouchers" page (my vouchers + buy one), codes shown on the paid order (SQL 29).
- Not yet: e-mailing the code to a recipient; VAT is not charged on the sale of a voucher (taxed when it is spent).
- §16 step 4 done: customer wallet. `GET /wallet` (CustomerWalletController) returns points (balance, value from the lots, what expires next, redemption rules), every gift voucher with its movements, and a merged history; each movement links to the customer's Sales Order it came from (walking up the voucher chain), and the books' internal journals (exchange differences etc.) are hidden. Storefront "My wallet" page (/gift-vouchers): points card with Redeem buttons, vouchers (tap for movements), history, buy a voucher. Reconciliation was made exact in step 3.
- §16 step 5 done: the old order-based loyalty and store-credit code is gone. Removed from `LoyaltyService`: earning / reversing / restoring points per legacy Order, referral point and credit grants, refund credit, spend and apply of "store credit", and their credit-transaction writer. The legacy Order model no longer earns points when paid, the Customer model no longer grants referral credit, and the legacy cancel / restore endpoints no longer touch loyalty or store credit. The two legacy order-creation endpoints (customer `store`, admin `adminCreateOrder`) now answer 410 "retired" — orders are created through checkout or Books. A legacy referral reward paid as "store credit" now issues a gift voucher (and reversal takes back the unspent part). What remains in `LoyaltyService` is the books-facing part: settings and redemption rules, admin grant / deduct points, gift voucher grant / deduct, redeem, expiry, and the booking of every points movement. §16 is complete.

---

## 17. Stock, batches, expiry and materials used by services (settled 29 Sep 2026)

Planned with the owner and cut down to the simplest version that works. Products and services **stay in E-commerce**; **Extras stays Extras** (assets, delivery, analytics). Only **batches, expiry and valued stock are new, and they live in Core**, so Menus and any future module can use them without E-commerce or Extras.

### 17.1 Two settings on every product (and variant)
| Setting | Default | Meaning |
|---|---|---|
| **For sale** | **Yes** | No = a material, ingredient or consumable (nail polish, steel, glass). Hidden from customers and the till, still counted and valued. |
| **Track expiry** | **No** | Uncommon, so off unless ticked. Yes = a batch number and an expiry date are asked for when stock arrives. |

### 17.2 Batches (Core)
- Every receipt of stock creates a **batch**: quantity per branch, unit cost, and — only when the product tracks expiry — batch number and expiry date.
- Products that do not track expiry still get batches **behind the scenes**, because that is how valued stock knows what each item cost. Staff never see them.
- A sale takes stock from the batch expiring first (expiry products) or the oldest batch (everything else). The item is costed at the batch it came from. The invoice shows batch number and expiry only for expiry products.
- `variant_location_stock` stays the number the shop reads; it is always the total of that variant's batches at that branch.
- Stock transfers between branches, stock counts and stock journals (write-offs, breaking bulk) are later steps; batches travel with the goods.

### 17.3 Materials under a service line
A service line on a sale carries **materials underneath**, the same way a hamper carries its components.

| Case | Entered as |
|---|---|
| Car door fitted | Material **charged** — a priced line sold from stock (cost of goods sold) |
| Materials used up but not itemised (nail polish, file) | Material **included** — no charge to the customer, leaves stock, cost posts to *Cost of services* |
| Side mirror bought elsewhere for the job | **Bought outside** — type what was paid and what is charged; never enters stock; cost posts to *Job materials cost* |
| Customer brings their own | Nothing to enter (or a note) |
| Fabrication (mirror from own steel and glass) | Same thing: a service whose materials are steel and glass |

- A service package may carry a **default materials list** (e.g. manicure: polish, file), filled in on every sale and editable there.
- **Tools and consumables that need no invoice line** (a mechanic's spanner, a bottle of polish shared across many jobs) simply are not listed. They are **assets** (Extras) or ordinary purchases expensed when bought. A material is only listed when it is worth tracking — for example a whole bottle used on one job.

### 17.4 Valued stock in the books
| Event | Dr | Cr |
|---|---|---|
| Buy stock | Stock | Supplier / cash |
| Sell | Customer + Cost of goods sold | Sales + Stock |
| Material included in a service | Cost of services | Stock |
| Bought outside for a job | Job materials cost | Supplier / cash |
| Expired or damaged write-off | Stock loss | Stock |
| Opening stock (one-off at go-live) | Stock | Opening balance |

New ledgers seeded: *Stock* (Current Assets), *Cost of Goods Sold*, *Cost of Services*, *Job Materials Cost*, *Stock Loss*. Chosen under Books → Settings → Default ledgers like every other default. Costing is **first-in first-out by batch** (no separate average-cost setting in v1).

### 17.5 Settings page — Settings → Stock & expiry
| Setting | Options |
|---|---|
| Expired stock on the storefront | Hide (default) · show as unavailable |
| **Expiry badge** ("Expires dd/mm") | Show / don't show. **Only ever appears on products with Track expiry = yes AND an expiry date set on the batch being sold** |
| Selling expired stock | Never · manager override with a reason (logged) · allowed |
| Minimum days left before a sale | One value for online orders, one for the till |
| When a batch expires | Block it and put it in an **expired-stock list** for someone to decide (return to supplier / write off) · write off automatically after N days |
| Warnings | Days before expiry to warn; who is told, per branch |
| Picking order | First-expiring first · oldest first |

Defaults set here; a category may override, and a product may override again.

### 17.6 Where things live
| Module | Holds |
|---|---|
| **Core** | Batches, valued stock, stock settings, expiry job and list, stock ledgers |
| **E-commerce** | Products, variants, services, storefront (unchanged); the For sale / Track expiry fields sit on the product form |
| **Extras** | Assets and equipment (unchanged) |
| **Menus (later)** | Menu items using Core stock and batches |

### 17.7 Build order
1. Product settings + batches + valued stock on purchases and sales (§18 steps 1–4).
2. Expiry settings, blocking sales, daily expiry check, expired-stock list (steps 5–6).
3. Materials under service lines (step 7).
4. Later: transfers, stock count, stock journal, recipes for Menus.

---

## 18. Coding plan — stock, batches, expiry, materials

**Rules:** database changes are **plain SQL scripts to run in Workbench — no Laravel migrations** (read-only checks first, `SQL_SAFE_UPDATES` off/on, transaction, result check, safe to re-run), delivered as files and not run by the app. Each step updates `ModuleTables::MAP` for any new table and pushes to both `tisl_v2` and `feat/module-structure`. `php -l` on PHP, frontend build + lint before handing over.

| Step | SQL script | Backend | Frontend |
|---|---|---|---|
| **1. Fields + ledgers** | `products.is_for_sale` (default 1), `products.track_expiry` (default 0), same on variant if needed; seed ledgers *Stock, COGS, Cost of Services, Job Materials Cost, Stock Loss* and default-ledger settings | Product model + validation; product create defaults (for sale = yes, track expiry = no); "not for sale" hidden from storefront/till queries | "Stock" section on product form with the two switches |
| **2. Batches** | `stock_batches(id, variant_id, batch_no, mfg_date, expiry_date, unit_cost, currency_id, source_voucher_item_id, status)`, `stock_batch_balances(batch_id, location_id, quantity)`, `stock_movements.batch_id` + `unit_cost`; **backfill**: one opening batch per variant/branch from current `variant_location_stock` at cost 0 (cost set by opening-stock step) | `BatchService` (create, pick FEFO/FIFO, apply, reverse); `VariantStockService::applyDelta` becomes the total of batch balances | none yet |
| **3. Stock in (valued) + Purchases page** | none new | Receipt Note / Purchase lines create batches (batch no + expiry when tracked); post Dr Stock; **Opening stock** voucher; endpoint to add a variant to an existing product from a purchase | **Purchases page** (§18.1); batch no + expiry columns on purchase lines for tracked products only |
| **4. Stock out (valued)** | none new | `VoucherService::stockPlan/applyStock` picks batches; sales post Cr Stock / Dr COGS at batch cost; cancel/edit reverses batch by batch; credit note returns to the same batch | Batch + expiry shown on invoice print for tracked products only; batch override at till |
| **5. Settings** | `stock_settings` (single row) + per-category / per-product overrides; add to backup map | Settings model + controller + API | Settings → **Stock & expiry** page (§17.5) |
| **6. Expiry engine** | none new | Daily `stock:expire` command (schedule it): mark expired batches; enforce settings on sale (block / override / min days); storefront hides expired; **expiry badge only when tracked + date set**; warning notifications; expired-stock list with return-to-supplier (Debit Note) and write-off (Dr Stock Loss / Cr Stock) actions | Expired-stock list, expiry dashboard (expired / 30 / 60 / 90 days), badge on product cards |
| **7. Service materials** | `service_variant_materials(service_variant_id, variant_id, quantity, mode: charged/included)`; `voucher_items` gets `material_mode` (charged/included/bought_outside) + `parent_item_id` reuse | Service line resolves default materials; included → Dr Cost of Services / Cr Stock; bought outside → Dr Job Materials Cost / Cr supplier or cash; charged → normal sale line | Materials editor on service package; materials rows under a service line in the voucher form |
| **8. Reconciliation + docs** | none | Stock reconciliation: Σ batch value = *Stock* ledger balance (added to Books → Reconciliation) | Reconciliation card; update `PLATFORM_BUILT.md` and `LEDGER_GUIDE.md` |

**Not in this build:** transfers, stock count, stock journal, recipes/manufacturing, work-in-progress on long jobs, weighted-average costing.

**Settled:** the For sale / Track expiry switches live on the **product** only (every variant inherits them).

**Status (step 8):** built — the stock registers are proved against the books in Books → Reports → Reconciliation. **Stock (Stock ledger vs batches at cost):** every batch still holding stock at its cost, split into in date / expired-not-written-off / held, against the Stock ledger, with the known timing differences shown as *explained* — goods delivered on Delivery Notes not yet invoiced, and goods received on Receipt Notes not yet billed (a part-invoiced note counts only its uninvoiced part). **Stock units:** what the shop shows per product and branch against the in-date batches, naming any that differ, with a **Refresh** button that sets them from the batches. Today only (batches show today's stock). No SQL. **Steps 1–8 are done.** Left for later, none needed for the above: batch recall (block a batch everywhere and trace who bought it), quarantine actions, near-expiry clearance pricing, stock transfers between branches, stock counts and a stock journal, recipes / manufacturing for Menus, work-in-progress on long jobs, weighted-average costing.

**Status (step 7):** built — **materials under a service line**. In the voucher form a service line carries a *Materials used* block, filled in from the package's default list and editable on the sale, with four kinds: **charged** (from stock, a priced line filed under the service; cost of goods sold as any sale), **included** (from stock, no charge; cost booked to *Cost of Services* at the batch cost, kept apart from goods sold), **bought elsewhere** (not stock: what was paid, what is charged, and the supplier / cash / bank it came from — Dr *Job Materials Cost*, and a bill to the supplier when owed) and **customer's own** (noted, no money, no stock). Not-for-sale materials may be used this way. Materials travel with the service through quotation → order → delivery → invoice, print and export under it, and reload when the voucher is edited. **Service editor:** a *Materials used* section per package (product, quantity in its stock unit, included or charged). SQL script `27_service_materials.sql`. Not yet: work-in-progress on long jobs (materials are used up when the job is invoiced), recipes / manufacturing.

**Status (step 6):** built — the expiry engine. **Daily `stock:expire`** (00:10): marks batches past their date as expired (the shop's stock numbers then stop counting them), writes off expired batches whose rules say "after N days", and warns staff once per warning band about batches about to expire and about what expired that day, each person only for the branches they are cleared for. **Selling:** an expired batch is never sold unless the rules allow it — never / only with an override (a reason, and a role named in the settings; logged on the voucher) / allowed (the preview warns); a batch needs the days of shelf life set for the channel (online vs till); a sale line can name a batch but not one the rules forbid; stock returned to a supplier on a Debit Note may take an expired batch. **Shop numbers count in-date stock only**, so a stock count or the branch grid no longer fights expired stock. **Storefront:** a product whose stock has all expired is hidden or shown as out of stock (setting); the "Expires …" badge appears on cards, lists and the product page only for expiry products with a dated in-date batch, when the settings show it. **Expiring stock** page (Purchases → Expiring stock): expired / 30 / 60 / 90-day groups with quantity and value at cost, per branch, with **Write off** (Dr Stock Loss / Cr Stock) and **Return to supplier** (Debit Note, against the purchase it came in on). SQL script `26_expiry_engine.sql`. Not yet: recall (block a batch everywhere and trace who bought it), quarantine actions, near-expiry clearance pricing.

**Status (step 5):** built — Settings → **Stock & expiry** (`/admin/settings/stock`, admin / super_admin): what customers see (hide or show-as-out-of-stock; the expiry badge on/off), selling expired stock (never / only with an override by chosen roles / allowed), days of shelf life needed online and at the till, what happens when a batch expires (block and list it, or write it off after N days), warning days and who is told, and first-expiring-first or oldest-first picking. **Exceptions** per category or per product override sell-expired, days needed, expiry action, warning days and the badge; a product's beats its category's (up the category tree), which beats the shop-wide rule. Read through `StockPolicy` (built-in defaults if the tables are missing). Only the **picking order** is enforced so far (`BatchService`); everything else is enforced in step 6. SQL script `25_stock_settings.sql`; both tables are in the backup map.

**Status (holds, transfers, counts, production, jobs — 30 Sep 2026):** built, SQL scripts 28–31.
- *Held stock* (Purchases → Held stock): quarantine / release / recall a batch (blocked from every sale and from shop numbers), **who bought it** trace with CSV and customer notification (customers without an account are listed to contact directly), history per batch. Setting: customer returns of expiry products go back on the shelf or into quarantine.
- *Clearance price* on a near-expiry batch (Expiring stock page): sales that take it are discounted automatically (weighted if a sale spans batches); a typed price or manual discount stands; the storefront badge shows the percentage.
- *Costing method* (Settings → Stock & expiry): each batch keeps its own cost (default) or average cost per product (every arrival re-prices all batches to the blend; total stock value is unchanged).
- *Transfers*: send takes stock out (first-expiring batches first; expired or held stock cannot be sent), receive puts the same batches in the other branch; a short delivery is written off; in-transit value is an explained item on the stock reconciliation.
- *Stock counts*: start per branch (one open at a time), enter counted quantities per batch, post — batches are corrected and the net gain or loss is journalled. *Stock journal*: every movement, filterable.
- *Recipes*: made ahead (a production run consumes ingredients and makes a costed batch; cancel while all of it is unsold) or made to order (a sale consumes the ingredients; a credit note for the item moves no stock). Recipes and production belong to the **Menus** module (its own nav section, `module:menus` routes, tables in the Menus backup list); the Core stock engine only asks the recipe service, which does nothing while Menus is off, so Core sells normally without it.
- *Jobs in progress*: materials issued to an open job sit in Work in Progress; completing books them to Cost of Services, cancelling returns them. Raising the customer's invoice stays an ordinary Sales invoice (its voucher id can be noted on the job). Not built: pulling job materials straight onto the invoice.

**Status (cash purchases, party details, addresses — 30 Sep 2026):** built, SQL script 33. A **Purchase can be paid at once** (choose a payment method on the Purchase form): the credit goes to the cash / bank ledger instead of the supplier, so **no debt and no bill** is created; the supplier is then optional. **Party details** (name, phone, address, PIN) can be typed on a purchase with no vendor and on a sale with no customer (a walk-in), and print on the voucher. **Ledgers have an address** (shown for Sundry Debtors / Creditors ledgers in the ledger form; vendor addresses are copied to their ledgers). Decision: **no vendor portal and no vendor login** — vendors are only Sundry Creditors ledgers (script 33 makes `vendors.user_id` optional); quotes, LPOs and invoices from vendors are entered by us.

**Status (vendors — 30 Sep 2026):** built, SQL script 32. A **vendor** is a Sundry Creditors ledger (`ledgers.supplier_id` = the vendor); vendors are **not** notified by the system — what they invoice us is entered as a Purchase. Admin page Purchases → Vendors (list, add, edit, suspend, recent purchases, what we owe). Purchase vouchers carry a **Supplier invoice no.** (`supplier_invoice_no`) separate from **Ref** (`reference_no`: LPO / delivery note number); the same supplier billed twice under one number shows a **warning**, never a block. Not built (by decision): a vendor portal. Not built yet: affiliates — to be planned. Affiliates: a customer turned affiliate earning commission, with the rule living in Core and each module (e.g. a course referral) declaring what counts as a referral.

**Status (step 4):** built — sales, cash sales and credit notes that post accounts add **Dr Cost of Goods Sold / Cr Stock** at the cost of the batches the goods came from (and the reverse for a return); a sale invoiced from a delivery takes its cost from what the delivery took out; customer returns go back into the batch they were sold from; cancelling or editing a sale reverses stock and cost together; invoices and exports show batch and expiry on lines of expiry products; a sale line can name the batch to take from (otherwise first-expiring). The preview shows the cost entries. No SQL script. Nothing is posted until the Stock and Cost of Goods Sold ledgers are set under Books → Settings (script 22 sets them).

**Status (step 3):** built — the Purchases page (§18.1), batch number / manufacture / expiry entry on purchase, goods-received and opening-stock lines (asked only for products that track expiry), purchases posting **Dr Stock** (not the purchase account) once the Stock ledger is set, the **Opening Stock** voucher (Dr Stock / Cr *Opening Stock Balance*), and SQL script `24_purchase_batches_and_opening_stock.sql`. Stock a voucher brought in can no longer be edited or cancelled once some of it has been sold or used (the message points to a Debit Note). Until step 4 posts cost of goods sold, profit reports overstate profit on stocked goods: purchases no longer reach the P&L, and sales do not yet post their cost.

**Status (steps 1–2):** built (SQL scripts `22_stock_fields_and_ledgers.sql`, `23_stock_batches.sql`). Stock changes now go through batches (`BatchService`); `variant_location_stock` is the total of a variant's batches. Sales already take stock first-expiring first and record the batch and its cost on each stock movement; cost-of-goods-sold posting is step 4. Known until step 6: stock on hand counts expired batches too (they are skipped when selling but stay counted until written off).

### 18.1 Purchases page (E-commerce admin) — part of step 3

A purchase voucher screen in the style of the existing voucher form, with a guided item picker. It reuses the Purchase voucher type, so numbering, period locks, edit limits and cancellation already apply.

- **Header:** supplier (Sundry Creditors), date, branch receiving the stock, currency, supplier invoice no., due date, narration.
- **Adding a line:** search a variant by name or SKU (the voucher lookup, `purpose=purchase`, which also finds *not for sale* materials).
  1. **Existing variant** → quantity, unit, cost, tax. If the product tracks expiry, batch no + expiry date columns appear on that line.
  2. **New variant of an existing product** → "Add variant" opens the existing variant form inline, saves, and returns to the line.
  3. **Nothing found** → near matches ("did you mean…", the storefront's fuzzy search), then **"Create new product"** — always offered, even after fuzzy suggestions.
  4. **Create new product** → the existing product form; on save the admin **returns to the purchase with the draft kept** and the new product's variant already on the line.
- **Automatic variant:** a product saved with no variants gets a "Standard" variant (`ensureDefaultVariant`); the page does the same after "Create new product". Today that only runs when the product has a default unit — the purchase path falls back to the platform default unit so the line is never left without a variant.
- **Saving:** posts the purchase — creates batches, adds branch stock, Dr Stock / Cr Supplier.
- **Draft:** kept in the browser while the admin is on the product form, so nothing typed is lost.

---

## 19. Retiring the legacy order tables — what is affected, and the work that follows (1 Oct 2026)

The old order code is gone (admin Orders / Order detail / Create order, customer My Orders / Order detail, the order write API, the order emails). Script 34 drops `orders`, `order_items`, `order_activity_logs`, `order_shipments` (foreign keys into them are removed; the `order_id` columns in other tables stay, unlinked). Everything below still reads those tables and **has nothing to read once script 34 is run**. This list is the next body of work, in the order I suggest:

1. **Delivery** — manifests and their items (`delivery_items.order_id`), the eligibility check for adding an order to a manifest, route planning, shipment tracking for customers (`/orders/:id/shipment`, pings, tracking), driver and delivery ratings, delivery incidents, delivery stats and insights. *Re-point to:* a Delivery Note (or the Sales Order) voucher instead of an order; tracking keyed by voucher id.
2. **Reports and analytics** — the reports screens (orders, revenue, dashboards), the order counts on the dashboard / reports, AI analytics, the search / algorithm services that read orders. *Re-point to:* the sales register (Sales Order / Cash Sale / Invoice vouchers) and ledger balances.
3. **Product review eligibility** ("bought this") — `product_reviews.order_id`, `ReviewEligibilityController`. *Re-point to:* a posted Cash Sale / Invoice containing the variant.
4. **Referral and promo usage** — `referral_code_usage.order_id`, promo revenue / discount tracking. *Re-point to:* the voucher the code was used on.
5. **Chat assistant (Mimi) and reconciliation** — order lookups in the assistant; the reconciliation populate service. *Re-point to:* vouchers.
6. **Customer history and activity** — the customer detail "orders" tab, the activity feed, project order links (Projects → link an order). These already return empty lists when the tables are gone; *re-point to:* the customer's vouchers and the voucher audit log.
7. **Old quotes** — "convert to order" on the legacy quote screens still creates a legacy order; the voucher Quotation flow replaces it (retire the legacy quote screens).
8. **Payments** — the per-order payment screens (`/admin/orders/:id/payments`, `PaymentController` order routes) and the legacy `payments` / credit tables; receipts against vouchers replace them.

Until each is re-pointed, its screen shows an empty list or errors after script 34. Run script 34 only when the parts you use are done (or accept those screens being empty).

## 20. Customer-side currency, cart and checkout (built 1 Oct 2026)

- **One operating currency.** Every voucher (cart quote, sales order, cash sale, invoice) is priced in the **base / operating currency**: each item's price is converted from its own currency to base at the rate on the day. The currency a customer picks in the storefront changes **how prices are shown** (cards, product page, cart lines as an indicative view), never what is charged.
- **Cart order summary** uses the voucher engine in base currency and reads like the voucher: Item | Variant | Qty | Rate | Amount | Tax (with the ledger's tax name and rate), then Subtotal / tax / Total, all with the operating currency's symbol.
- **Checkout** lists the customer's **available gift vouchers** with the amount each can cover on this order, and the **promo codes** they hold with the discount each would give; the engine computes the applicable amounts. Typing a code still works.
- **Admin voucher entry** shows the same for the chosen customer: their gift vouchers (balance and amount applicable) and promo codes (discount applicable), selectable.

**Decisions and status.** Built as proposed, plus: the "Charged in {base}" note shows on storefront prices only when the shopper's chosen currency differs from the base currency; usable gift vouchers are **ticked automatically** at checkout (the customer can untick) and a gift voucher in another currency is **converted at the day's rate**; promo codes keep the **current rules** (one code, after tier and referral discounts); an admin sale with **no customer** offers no lists. Several gift vouchers can be used on one order (each covers what is left). A promo code entered on an admin sale is applied by the server as a discount line and its use is recorded through the voucher's meta. No SQL script.

---

## 21. Sales voucher: discounts, promo / gift / loyalty lifecycle and rounding (plan, 1 Oct 2026)

**What the code does today (checked).**
- **Discounts before tax already work for per-line discounts:** a line's discount is taken off before its tax, and posts as *gross sale (Cr) + Discounts Allowed (Dr)*, with VAT on the net. Checkout already spreads tier / customer-type / referral / promo discounts across the lines as per-line shares.
- **The bug in the screenshot is my admin promo:** I added it as a separate "discount charge" line, so it is not spread over the items and VAT stays on the full price (VAT 595.48 instead of 535.93). It must use the same per-line spreading as checkout.
- **Gift vouchers** live in `gift_vouchers` (code, customer, currency, initial and remaining balance) with `gift_voucher_transactions` as their history; the money owed sits in the *Gift Vouchers Liability* ledger. Paying with one is a tender on the voucher (`voucher_tenders`); cancelling the voucher already **restores** the balance, and gift vouchers a cancelled sale issued are voided (refused if already spent).
- **Loyalty** is already on the voucher system (`RewardService`): points are earned when a Cash Sale posts (an Invoice earns when fully paid), per `points_per_100` × the tier's multiplier; cancelling reverses the points and the customer's order / spend counters.
- **Promo usage** is recorded (`recordPromo`) when the sale earns, but **cancelling does not reverse it** — a gap.

**Build plan (in order).**
1. **One discount engine** (`DiscountService`), used by admin vouchers and checkout: lists what a customer *could* get — customer-type %, tier %, personal %, referral, each promo code they hold — with the amount each gives, and applies the chosen ones in a fixed order on the running net (type/tier → referral → promo), **spread over the lines in proportion**, so every line's taxable base is reduced before VAT. Zero-rated and exempt lines share the discount too; each ledger's VAT is worked on its own net. Postings stay gross sales + Discounts Allowed (split by line), VAT on net. Clearance-batch and manual line discounts stay as they are.
2. **Admin sales voucher:** replace the promo/gift panel with "Discounts for {customer}" — customer type and tier shown with their rate, then referral and promo codes; each row has a tick and the amount; automatic ones (type, tier, referral) are ticked, promo codes are left for the admin to tick. The preview shows the worked example (price → discount → taxable → VAT → total).
3. **Promo usage:** logged on posting a Cash Sale / Invoice / Sales Order that used the code (one `referral_code_usage` row per voucher), **reversed when the voucher is cancelled** (usage count and discount-given totals go back); the same rows serve checkout.
4. **Cancellation reverses everything:** gift voucher tenders (already), promo usage (new), loyalty points and counters (already), plus referral completion rewards.
5. **Loyalty earning basis:** points earn on the **net sale after discounts, before VAT** (proposal), times the tier multiplier and the loyalty settings; reversed on cancel.
6. **Rounding:** a checkbox on the voucher (default from Settings) — **none / nearest whole number / nearest 0.50** — applied to the grand total; the difference posts to a *Rounding* ledger (the existing rounding line kind), VAT is never changed by rounding. Same setting for checkout.

**Decisions to confirm.** (a) Promo usage counted when the voucher is *posted* rather than when it is fully paid; (b) loyalty points earned on net-before-VAT; (c) rounding defaults off; the per-voucher tick and a Settings default for cash sales.

**Decisions (1 Oct 2026).** Promo usage is logged **when the voucher is posted** (reversed on cancel). Loyalty points are earned on **what the customer pays, after tax**, and **when money is received**: a Cash Sale on creation and a Receipt voucher on posting (an Invoice itself no longer earns; each receipt against it does); reversed when that voucher is cancelled. Rounding is **off by default**; the admin chooses **none / nearest whole / nearest 0.50** per voucher, for Sales and Cash Sales.

**Status — steps 1 and 2 built.** `DiscountService` is the one engine for admin sales vouchers and checkout: personal / tier / customer-type % (capped together at 30%), the referral discount, and the customer's promo codes (one per sale), each taken off *before* tax and spread over the lines in proportion (zero-rated lines share too; each line's VAT follows). The admin sales voucher shows **"Discounts for {customer}"** with a tick box and the amount for each; automatic ones are ticked, promo codes are not; a saved voucher being edited keeps the discounts it was saved with. The customer's share sits **on top of** any clearance-batch price (it no longer switches the clearance off). Steps 3–6 (promo usage on posting and its reversal, loyalty on receipts, rounding) are next. VAT is worked out on the amount after discount unless a tax rate is set to "before discount" in Tax & Compliance.

**Status — steps 3, 4, 5, 6 built (SQL script 35).**
- **Promo usage** is logged when a Sales Order, Invoice or Cash Sale carrying a promo code is posted (one `referral_code_usage` row per voucher, quotations never); a document made from one that already logged the use does not log it again; **cancelling or editing the voucher takes the use back** (counters down, a code that had run out becomes usable again).
- **Loyalty on money received:** a Cash Sale earns when made and a Receipt when posted, on what was paid **after tax** (not on gift vouchers sold or the part paid with a gift voucher), times the tier multiplier; it adds to the customer's spend, a Cash Sale also counts as an order. An **Invoice earns nothing itself** — it counts as an order when posted, and each receipt against it earns. Cancelling or editing a voucher reverses its points, spend and order count (and re-earns on the edited figures).
- **Rounding:** on Sales and Cash Sales the admin picks *Do not round / Nearest whole number / Nearest 0.50* (the starting choice comes from Books → Settings → Default ledgers; off unless switched on). The difference is an automatic line on the **Rounding** ledger; VAT is untouched. Checkout does not round yet (the storefront's amounts are unchanged).

---

## 22. What a customer can create on the storefront (plan, 1 Oct 2026)

**Recommendation.** A customer creates a **Sales Order** (their request to buy), never a Sales invoice or a Cash Sale. Those two are *accounting documents* that the business (or the system on payment) makes from the order:

| Customer does | System makes | When |
|---|---|---|
| Places an order at checkout | **Sales Order** (a promise to buy — posts nothing, reserves nothing yet) | at once |
| Pays online (M-Pesa, gift voucher) | **Cash Sale** made from the order (money in, stock out, points earned) | when the payment lands |
| Chooses "pay on account" (only customers allowed credit) | **Invoice** made from the order | at once, on approval rules |
| Asks for a quote first | **Quotation** (staff price it) → customer accepts → Sales Order | existing quotes flow |
| Staff deliver | **Delivery Note** | staff / driver |

Why not let a customer create an invoice or cash sale directly: it would let them decide the price, tax, stock movement and accounts; an invoice is our legal document; a cash sale must only exist when money has really arrived. Staff can still make any of these on a customer's behalf from the admin.

**What the customer sees (storefront).** *My orders* (the sales orders, with a status: placed → paid → delivered / cancelled), *Order detail* (items in the voucher-style table with tax, discounts, gift voucher used, payments, delivery), *Pay now* on an unpaid order, *Cancel* while nothing has been paid or delivered (already enforced), *Invoices & receipts* (their documents and what they still owe, for account customers), *Track delivery* once a delivery exists.

**Rules to settle.**
1. **Stock and price at order time:** does placing an order reserve the stock and lock the price, or is stock only taken when it is paid / delivered? *Proposal:* price is locked at order time; stock is checked at order time but only taken on the Cash Sale / Delivery Note; unpaid orders expire after N days (setting).
2. **Editing an order:** customers cannot edit; they cancel and re-order (staff can edit in admin).
3. **Pay later / account:** only customers marked as credit customers (with a limit) see "pay on account"; everyone else pays online or "pay on delivery" (order stays unpaid until staff take payment).
4. **Guests:** may order with an email and phone (as now); the order is tied to a guest ledger and they can pay online, but cannot use gift vouchers, promo codes or points.
5. **Currency:** always the base currency (section 20).

**Build order.** (1) Order detail and My orders on the voucher engine (status, table, payments, cancel) — largely there; (2) pay-now on an unpaid order; (3) delivery tracking re-pointed to the voucher (section 19, item 1); (4) invoices and receipts for account customers, with statement; (5) unpaid-order expiry and stock check settings.

**Decisions (1 Oct 2026).** (1) A Sales Order **never touches stock or money**: an admin opens it and converts it (to a Delivery Note, Invoice or Cash Sale) — that is when stock moves. (2) A customer **can edit a Sales Order until it has been converted**; they can **never edit an Invoice or Cash Sale**, but can **ask for a review** of one (a request staff see on the voucher, e.g. through the help-desk tickets). (3) Payments are dealt with later. (4) Guests can order.

### 22.1 Gift vouchers, discounts, promos and referrals on a customer's order

The order is priced once, at order time, by the same discount engine the admin uses (section 21); everything below follows from "the order is a locked, priced request".

- **Discounts (customer type, tier, personal):** worked out when the order is placed and stored as line discounts, before VAT. Converting the order carries the lines and their discounts over unchanged (the price the customer saw is the price they pay). If the customer edits the order it is priced again from scratch with the current prices and discounts.
- **Promo codes:** one per order, chosen from the codes the customer holds or typed. **Use is logged when the order is posted** and taken back if the order is cancelled, expires or is edited (then logged again for the new order). The invoice or cash sale made from the order does not log it a second time.
- **Referral discount** (a referred customer's first order): applied at order time; it is *used up* when money is received (the referrer's reward and the referred customer's completion fire on the first Cash Sale or Receipt). Rule to add: while one live order already carries the referral discount, a second order cannot take it.
- **Gift vouchers:** an order takes no money, so a gift voucher is **not spent when the order is placed**. The customer says "I'll pay with these" (ticked, as today) and the order remembers the choice; the voucher is only redeemed — converted into a payment line — when the order becomes a Cash Sale or the customer pays it. Balance is not held in between, so if the voucher is spent elsewhere first the customer is told at payment time. Buying a gift voucher on an order works as now (issued when paid).
- **Loyalty points:** earned only when money arrives (section 21), never on an order.
- **Guests:** no customer discounts, no gift vouchers, no points; a promo code needs an account (as now).
- **Cancelling / expiring an order:** reverses the promo use, drops the remembered gift voucher choice, and does not need any stock or money reversal (there was none).
- **Ask for a review:** on a posted Invoice or Cash Sale the customer sends a note; staff see it on the voucher and answer; nothing on the voucher changes unless staff edit it.

Open points: whether a gift voucher's balance should be *held* for an order (reduces surprises, complicates cancelling), and whether a customer's edit re-prices at today's prices (proposed) or keeps the original ones.

## 23. Sales Order is a record; the edit log (built, 30 Sep 2026)

- **A Sales Order is only a record**, like Tally's. It keeps the values (customer, items, discounts, the gift vouchers meant, narration) but does nothing: no stock, no accounts, no loyalty, **no promo use logged, no gift voucher spent**.
- **Converting** to a Sales Invoice or Cash Sale carries every field over (customer, sold-to details, promo code, discounts, rounding) and then does the real things: the invoice/cash sale logs the promo use once, and a Cash Sale spends the gift vouchers the order remembered (`meta.gift_codes`), the remainder going to the chosen payment method.
- **The order is the child of the invoice / cash sale.** Once it has a live child the order is **locked** (no edit, no convert); the screen says "made into INV-… — edit that". The invoice is edited under the normal editing rules. Cancelling the invoice frees the order again.
- **Edit log** (`voucher_versions`, script 36): every create / alter / delete keeps a snapshot. `/admin/books/edit-log` lists changed vouchers with their version count and a "(Deleted)" group; a voucher opens a side-by-side Differences view of any two versions, differing values in red. Vouchers that predate the log get version 1 from their state just before the first change. API: `GET /books/edit-log`, `GET /books/vouchers/{id}/versions`.

## 24. Customer edits an order; asks for a review (built, 30 Sep 2026)

- `PUT /sales-orders/{id}`: the customer changes quantities, removes items, sets the delivery address or a promo code on their **own Sales Order until it has a live invoice / cash sale / delivery**. The cart is priced again from scratch at **today's prices and discounts** (decision), and the order is altered in place, so the edit log keeps the earlier version. Contact details, delivery method and the current promo code stay unless changed. Gift vouchers bought on an order can't be edited (remove and buy again).
- `POST /sales-orders/documents/{id}/review`: on a posted **Invoice or Cash Sale** of theirs the customer sends a note. It becomes a help-desk ticket (billing) and is written on the voucher (`meta.review_requests`), which staff see as an amber banner on the voucher. Nothing on the voucher changes unless staff edit it.
- Customer order page: *Change order* (editable orders), *Ask for a review* beside each invoice/cash sale under Documents.
- Still to do: pay-now polish, delivery tracking re-point, invoices/receipts/statement for account customers, unpaid-order expiry.

## 25. Cart and checkout laid out like the voucher (built, 30 Sep 2026)

- **Fixed:** the customer checkout/order/wallet calls went to `/api/checkout/...` but the routes sit under `/api/customer/...`, so the quote failed. `options`, `quote` and `place` are now open routes at `/api/checkout/*` (a signed-in customer's token, if sent, gives their own tier, promos and gift vouchers; a guest sees list prices); the rest (`sales-orders`, `attempts`, `orders/{id}/pay`, `wallet`) use `/api/customer/...`.
- **Cart:** the items stay as they were. Below them the **summary ledger** (Particulars | Amount: goods at list price, each discount, goods after discounts, delivery, each tax, total) with the customer's tier strip, then **Delivery methods** to pick from and the **promo codes** on offer (or type one). Choices are kept in `checkout-prefs`.
- **Checkout is a confirmation page:** the order in voucher columns (Item, Variant, Qty, Rate, Discount, Amount, Tax), the same summary ledger, contact and address, **how you will pay** (M-Pesa, pay later, on account) and gift vouchers, then Place order. The order appears under My orders at once. Quotations and quote requests stay out of checkout.
- Guests still sign in before the checkout page (the quote itself works for them).

## 26. Modes of payment, bank and cash ledgers, instruments (plan, 30 Sep 2026)

**What exists.** `payment_methods` (name, kind, `ledger_id`, gateway, online flag, instructions) each pointing at a Cash-in-hand / Bank Accounts ledger; `voucher_tenders` (method, amount, reference); ledgers already carry `bank_name`, `account_number`, `branch`; a Contra moves money between cash and bank ledgers only; receipts/payments pick a method or a cash/bank ledger. Missing: swift/branch code, account name, what a bank accepts, instrument number/date, cheque status, bounce handling, bank-charge ledgers, deposit slips, any cash control.

**Principle.** The method *is* the ledger (section 19). Checkout lists the money ledgers the business chose to offer; nothing about M-Pesa, Bank or COD is hardcoded.

### 26.1 Ledger characteristics (Cash-in-hand / Bank Accounts ledgers)
- **Bank ledger:** bank name, account name, account number, SWIFT code, branch name, branch code, currency; *accepts*: EFT/RTGS, other transfer, cheque, card, mobile.
- **Mobile-money / gateway ledger:** till or paybill number, gateway (`mpesa_stk`), instructions.
- **Cash ledger:** a *cash kind*: Till, Petty cash, Driver cash (cash on delivery), Undeposited.
- **Offer at checkout** (flag) with a label and instructions the customer sees ("Pay to Paybill 123456, account = order no."), and a sort order.
- Stored as columns on `ledgers` (script 37); `payment_methods` rows keep working and are created/kept in step from the ledger until the table can be dropped.

### 26.2 Mode of payment on the order (a record, not a posting)
- Checkout lists: each *offered* ledger (M-Pesa, Bank transfer, Card, …), **Cash on delivery** (an offered cash ledger of kind Driver cash), and **On credit** (only customers with a credit account and limit).
- The choice is saved on the Sales Order as `meta.payment_intent` = ledger, label, kind. **Nothing is posted.** The admin sees it on the order ("Customer will pay: M-Pesa Till 123456") and when converting: *Cash Sale* pre-fills that ledger; *Sales Invoice* (credit) bills the account; *COD* becomes a Cash Sale/Invoice that is settled when the driver's cash is received. Online payments that succeed at checkout still convert at once as today.

### 26.3 Instruments on receipts, payments and contras
- Choosing a **bank** ledger asks *how*: Electronic fund transfer / Other transfer / **Cheque** (mobile money and card ask for a reference only).
- Each instrument records: type, **instrument number**, **instrument date** (a post-dated cheque has a later date), the other party's bank, reference. New table `voucher_instruments` (script 38) with a **status**: received → deposited → cleared | bounced (cheques); transfers are cleared at once.
- Cheques written by us (payment voucher) need the cheque number and date; issued → cleared | cancelled | stale (after N days, setting).
- **Cheque register** screen: cheques in hand (incl. post-dated, due this week), issued but uncleared, bounced.

### 26.4 Bounced cheques and bank charges
- Seeded ledgers: **Bank Charges** (indirect expense), **Bounced Cheque Charges** (recoverable from the customer, income/receivable), both editable.
- **Bounce** on a received cheque: one action that posts a linked Journal: Dr customer / Cr bank for the cheque amount (the invoice becomes outstanding again), Dr Bank Charges / Cr bank for the bank's fee, and optionally Dr customer / Cr Bounced Cheque Charges for what we bill them. The instrument turns *bounced*; the edit log keeps it.
- Loyalty points earned on that receipt come off (existing reversal).

### 26.5 Cash (strengthening it)
- **Deposit slip:** a Contra from cash to bank asks for deposit slip number, date, deposited by; a bank to cash Contra asks for the cheque/withdrawal slip number.
- **Driver cash / COD:** cash collected by a driver lands in a *Driver cash* ledger; handing it in is a Contra to Cash-in-hand, then the deposit.
- **Cash count:** a day-end count per cash ledger against the book balance; the difference posts to a **Cash over/short** ledger (optional, needs a reason).
- Later: bank reconciliation against statements using the cleared flag; denominations on the count.

### 26.6 Build order
1. Ledger characteristics + offered-at-checkout list + payment intent on the order, shown to the admin and pre-filled on conversion (script 37).
2. Instruments on receipt/payment/contra and deposit slips (script 38).
3. Cheque register, bounce and bank-charge ledgers (script 39).
4. Cash count and driver-cash handling (script 40).

**Decisions needed.** (a) Keep `payment_methods` as a thin layer generated from the ledgers (recommended, safe) or drop it now. (b) When a received cheque is posted: at receipt date to the bank ledger flagged uncleared (recommended, like Tally) or only when deposited. (c) Cash on delivery: a flagged cash ledger (recommended) or a separate mode. (d) Who bears the bounce fee by default: us, or billed to the customer.

### 26.7 Decisions (30 Sep 2026)
(a) Keep `payment_methods` as a thin layer generated from the ledgers. (b) A received cheque posts to the bank ledger on the receipt date, flagged *uncleared*. (c) Cash on delivery is a flagged cash ledger (kind Driver cash). (d) **A bounced cheque is recoverable from the customer:** the customer owes the original amount again **plus the bounce fee** (see 27.4, which replaces 26.4's "who bears it").

## 27. Bill by bill: what we owe, what they owe, on-account credit, write-off (plan, 30 Sep 2026)

**What exists.** Every posted Sales invoice opens a *new* bill; a Receipt can settle invoices (`allocations`) and whatever is not allocated is stored as an *advance* bill; `outstanding()` works out what is left on an invoice. **Gaps:** no screen sends allocations (the receipt form is party + amount only); you cannot see what a party owes while writing the voucher; purchase invoices and credit/debit notes do not have an outstanding figure, so payments cannot settle bills; an advance can never be used against a later invoice; nothing writes off a bad debt.

### 27.1 Receipt / Payment: see the bills when you pick the party
- Choose the customer (or supplier) ledger and the form shows a **balance strip**: *They owe us KSh X* / *We owe them KSh Y*, and any **credit on account** held (advances), then the **open bills**: voucher no., date, due date (overdue in red), original, outstanding, and a **Settle** amount box per bill.
- Typing the amount received **auto-allocates oldest due first** (editable); ticking a bill fills its outstanding. The unallocated remainder shows as **On account** (becomes an advance), so **an overpayment goes on account automatically**. Payments work the same way against purchase invoices.
- Settling against a bill that is not the party's, or more than is outstanding, is refused (already enforced).

### 27.2 Outstanding for every bill-carrying voucher
- `outstanding()` extended to Purchase, Debit/Credit Notes and opening balances; one open-bills query per party ledger (new bills + advances − settlements), used by the receipt/payment form, the customer account page, statements and ageing so they always agree.

### 27.3 Using on-account credit (overpayment, advance, credit note)
- On a new Sales invoice (or Purchase) the form shows **Credit on account: KSh X — apply**. Applying settles the invoice (fully or partly) against the advance: **no money moves and no new ledger entry is needed** (the customer ledger already holds the credit); only bill-reference rows change, stored on the invoice so cancelling or editing it gives the credit back.
- The same **Apply credit** button sits on any open bill, so credit can settle an *older* invoice later. The customer then "pays partially or fully with the extra amount"; any difference is paid by receipt as usual.
- A customer's credit can also be **refunded** (a Payment voucher against the advance) and, for storefront customers, shown on *My account* and offered as **Pay with account credit** at checkout (later).

### 27.4 Bounced cheque (recoverable)
- Bounce of a KSh 50,000 cheque posts one linked journal: **Dr Customer 50,000 / Cr Bank 50,000** and the **original bills are open again** (the receipt's settlements are reversed and a *returned cheque* bill carries the original due dates).
- The bank's fee: **Dr Bank Charges / Cr Bank**; then billed on to the customer as recoverable: **Dr Customer / Cr Bank Charges** (the expense nets to nil) and a separate **Bounced cheque fee** bill opens. The customer now owes *original outstanding + fee*. If you waive the fee the second entry is simply not made.
- Everything is bill-by-bill, so the customer's statement shows the returned cheque and the fee as two lines.

### 27.5 Write-off
- **Write off** on an open bill (or on the whole balance): *Dr Bad Debts / Cr Customer*, settles the bill (partly or fully), needs a **reason**, and is limited by **role and a maximum amount** (Settings). Seeded ledgers: **Bad Debts Written Off** (indirect expense) and **Discount Allowed / Small Balances** (for rounding-size differences, optional automatic below a threshold).
- It is a voucher (Journal), so it is in the edit log, can be cancelled (the bill opens again), and reports list it. Loyalty points and promo use on the original sale are **not** reversed by a write-off (the goods were delivered); this is stated on the screen.
- VAT on a written-off invoice: Kenya allows bad-debt relief only under conditions, so the system writes off the gross amount and flags "VAT not adjusted" — to be confirmed with the accountant before automating.
- Suppliers: writing a payable back (a supplier forgives a bill) is the mirror (Dr Supplier / Cr Other Income), built later.

### 27.6 Revised build order (steps 1-2 new)
1. **Open bills + receipt/payment allocation screen** (API + form), outstanding for purchases and notes.
2. **On-account credit**: apply to invoices/bills, refund, and write-off with its ledgers and limits (script 37).
3. Ledger characteristics, offered-at-checkout list, payment intent on the order (script 38).
4. Instruments and deposit slips (script 39).
5. Cheque register, bounce with recoverable fee, bank-charge ledgers (script 40).
6. Cash count and driver cash (script 41).

**Decision needed.** Write-off approval: any finance user up to a set limit and a manager above it (recommended), or any finance user without a limit?

## 28. One build order: bills, credit, write-off, payment modes, instruments, cash (unified plan, 30 Sep 2026)

**Decision.** Write-off is allowed to **finance and super-admin users, no amount limit** (every write-off needs a reason and is in the edit log). This replaces the limit proposed in 27.5.

**Why one order.** Sections 26 and 27 overlap: a bounce needs bills (27.4), a bill settlement needs the bank/instrument on the receipt (26.3), and the bad-debt, bank-charge and bounce-fee ledgers are needed by both. So the work is arranged by what each step depends on, and **all system ledgers and settings are seeded once, in script 37**.

| # | Step | Depends on | Delivers | Script |
|---|---|---|---|---|
| **1** | **Open bills and allocation** | nothing | One open-bills query per party (new bills + advances − settlements); `outstanding()` for Purchase, Debit/Credit Notes and opening balances; the **Receipt / Payment form shows the balance strip (they owe us / we owe them), credit on account and the open bills with a Settle box each, oldest due first, remainder on account**; customer account page and ageing read the same query | read-only checks only (maybe none) |
| **2** | **System ledgers and on-account credit** | 1 | Script 37 seeds **Bad Debts Written Off**, **Discount Allowed / Small Balances**, **Bank Charges**, **Bounced Cheque Charges (recoverable)**, **Cash over/short**, **Driver cash** (all editable, none hardcoded by name). **Apply credit** on a new invoice/bill and on any open bill (bill-reference rows on the invoice, no ledger entry, reversed if the invoice is cancelled/edited); **refund of credit** (Payment voucher) | 37 |
| **3** | **Write-off** | 1, 2 | Write off a bill or balance: Journal *Dr Bad Debts / Cr Customer*, reason required, **finance and super-admin only**, cancellable, in the edit log; ageing/customer statement show it; "VAT not adjusted" flag | none (uses 37) |
| **4** | **Ledger characteristics, checkout list, payment record on the order** | 2 | Bank (name, account name/number, SWIFT, branch name/code, currency, accepts), mobile-money (till/paybill, gateway), cash kind (Till, Petty, Driver cash, Undeposited), *offer at checkout* + label + instructions; `payment_methods` kept as a thin layer generated from the ledgers; checkout lists the offered ledgers, **Cash on delivery** (driver-cash ledger) and **On credit** (credit customers); saved as `meta.payment_intent`, shown to the admin on the order and **pre-filled when converting** | 38 |
| **5** | **Instruments and deposit slips** | 1, 4 | Receipt/Payment/Contra on a bank ledger asks **EFT / other transfer / cheque** and stores instrument number, date (post-dated cheques), the other party's bank, reference; cheques start *received* / *issued*; **Contra cash to bank asks deposit slip number, date, deposited by**; cheque received posts to the bank ledger on the receipt date flagged *uncleared* | 39 (`voucher_instruments`) |
| **6** | **Cheque register and bounce** | 1, 2, 5 | Register: cheques in hand (incl. post-dated and due this week), issued not cleared, bounced; mark deposited / cleared; **Bounce** posts the linked journal (Dr Customer / Cr Bank), reopens the original bills as a *returned cheque* bill, records the bank fee (Dr Bank Charges / Cr Bank) and **bills it on to the customer** (Dr Customer / Cr Bank Charges, a separate *bounced cheque fee* bill; skipped if waived); loyalty points from that receipt come off | none (uses 37, 39) |
| **7** | **Cash count and driver cash** | 2, 4, 5 | Day-end count per cash ledger against the book balance, difference to *Cash over/short*; driver cash handed in by Contra; COD collection flow on the converted Cash Sale | 40 |
| **8** | **Customer-side follow-ups** | 2, 4 | *My account* shows credit on account and open bills; **Pay with account credit** at checkout; payment instructions of the chosen ledger on the order page | none |

**How each step is done.** Backend first with isolated tests (as before), then the form, then a browser check on mocked data; each step ends with a docs line, a commit and a push to both branches. SQL is given as Workbench scripts (read-only checks first, transaction, result check, re-runnable) and sent as a file. Step 1 needs no SQL unless the read-only check shows the bill-reference `ref_type` column cannot hold a new value.

**Rules carried through all steps.** Every posting is a voucher (edit log, cancel reverses everything it did: bills, credit applied, instruments, cheque status). A cancelled receipt gives its settlements back. Nothing in the order or checkout posts money; payment mode on an order is a record only. Finance users and super-admin only for write-off, bounce and refund.

**Start with step 1.**
