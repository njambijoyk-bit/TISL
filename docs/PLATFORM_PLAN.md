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

**Vouchers** (`voucher_types` carry: posts accounts?, moves stock and which way?, numbering series per type/branch like `TISL-INV-24530`)
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

**Build order:** 1) engine — groups, ledgers, voucher types/series, voucher + entries + items + bills + stock movements tables (SQL files), the posting service (balance check, immutability, numbering, period lock), seeders; 2) books screens — ledger tree, voucher entry, day book, ledger statement, trial balance, P&L, balance sheet, receivables ageing, exports; 3) the sales chain (checkout → order → cash sale/invoice → delivery → receipt) for products, hampers, auctions, services; 4) drop the old orders/payments/credit tables and move store credit, credit accounts, loyalty and withholding onto ledgers; 5) Data Exchange.

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
