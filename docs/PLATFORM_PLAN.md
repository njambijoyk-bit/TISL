# TISL Platform — Plan & Decisions

The single reference for what has been decided, what is built, and what comes next.
Update it whenever a decision changes.

---

## 1. Working conventions

- **Delivery:** changed files are handed over one by one, in repo folder layout — never zipped.
- **Pushing:** Renka pushes to `tisl_v2` herself, then uploads so the latest state can be pulled before the next change.
- **Database changes:** SQL scripts to run in MySQL Workbench, not Laravel migrations. Each script:
  - starts with read-only `SELECT` checks (column types, what will change), run first on their own;
  - turns `SQL_SAFE_UPDATES` off and back on;
  - runs updates inside a transaction;
  - ends with a result check;
  - is safe to re-run where possible.
- **Planning first:** big changes are discussed and agreed before any code.
- **Logging:** every money- or configuration-changing action is recorded through the activity-log traits (who, when, old → new, why, and the context needed to reverse it).
- **Builds:** before delivery, frontend changes are checked with a full-app bundle and a lint for undefined names; PHP files with `php -l`.

### SQL scripts so far

| # | Script | Does |
|---|---|---|
| 01 | `01_morph_types_to_aliases.sql` | Stored `*_type` class names → short aliases (`product`, `tax_rate`…) |
| 02 | `02_backfill_currency_id_products_services.sql` | Pins products/services without a currency to the base |
| 03 | `03_currency_on_hampers_and_auctions.sql` | `currency_id` on hampers and auctions |
| 04 | `04_hamper_tax_rate.sql` | `tax_rate_id` on hampers (replaces the fixed "VAT 16%" toggle) |
| 05 | `05_customer_currency_and_currency_log.sql` | Customer account currency + `currency_activity_logs` table |

---

## 2. What is built

| Area | State |
|---|---|
| **Morph map** | Full alias map in `AppServiceProvider` (must match script 01) |
| **Currencies** | Products, services, hampers, auctions and tax rates each carry their own currency. Storefront toggle (browse-only) converts prices for display; admin and selectors show stored prices. |
| **Conversion helper** | `CurrencyConversionService::snapshot()` returns a `ConversionSnapshot`: amounts, rate, `exchange_rate_to_base`, `base_currency_id`, time. `reverse()` undoes it at the stored rate. `logConversion()` / `logEvent()` write to the currency log. |
| **Currency log** | `currency_activity_logs`, via the `LogsCurrencyActivity` trait: currency edits, base switches, customer currency assignment and changes, saved conversions. |
| **Customer currency** | Every customer has a pinned account currency (defaults to the base when created). The credit account follows it. Finance can change it only when there is no store credit, credit balance or unpaid invoice. |
| **Tax admin** | Tax & Compliance and Withholding & Compliance hubs (rates, rules, types, districts, certificates, credits, classifications), per-item tax overrides, customer Tax tab. Finance-role gated. |
| **Hamper tax** | Admin picks an active tax rate; checkout charges it (no fixed 16%). |
| **Units of measure** | Units, country defaults, converter. |
| **Admin navigation** | One sidebar built from `src/navigation/adminNav.js` (groups, items, section tabs, roles, modules, owner-only). `AdminShell` is a layout route around every `/admin` and `/driver` page: sidebar, section tabs, Ctrl+K quick jump. Settings hub is generated from the same registry. `isModuleActive()` in `src/navigation/modules.js` is a stub (all on) until the module registry exists. |
| **Variants** | Admin variant editor (options, variants, units, images) and storefront variant picker; the cart keeps each variant and unit as its own line. |

---

## 3. Money & currency rules (decided)

1. **Every stored amount carries its own currency.** Nothing is ever mass-converted.
2. **Changing the base currency never rewrites stored money.** The base only sets defaults.
3. **Every saved conversion stores `exchange_rate_to_base` and `base_currency_id`** (the base at that moment), so it can be reversed exactly later. The name `exchange_rate_to_kes` is retired for new work.
4. **Customer account currency:** pinned per customer, defaults to the base at creation. The wallet (store credit), credit account and checkout run in it. It changes only through a customer request form approved by an admin, or by finance directly, and only with no balance outstanding.
5. **Checkout:** cart items in any currency (rand, yen…) are converted into the customer's account currency at checkout. Guests check out in the base currency.
6. **Storefront currency toggle** is browse-only.
7. **Promo codes:** each code has its own currency; fixed amounts, minimum order values and referrer rewards are in it and are converted for orders in other currencies.
8. **Loyalty:** earns in the base currency. Orders in other currencies convert to base at that day's rate, and the rate is stored so a cancellation reverses exactly. The loyalty rules record the currency they were written in; if the base changes, settings flag the rules for review.
9. **Store credit:** one wallet per customer in the account currency. Each movement records its amount, the wallet currency, the rate and the base.
10. **Accounting snapshots** (`*_kes` columns on orders) stay in KES as the accounting currency for TallyPrime.

---

## 4. Tax design (decided, not yet built)

- **Item tax class** is set per product and per service (standard, zero-rated, exempt), with an override. No category-level defaults.
- **Customer tax status:** standard by default. Zero-rated, exempt and withholding-agent statuses only apply once an admin has verified them.
- **Line-by-line result:** a standard customer buying a panga (standard) and a solar panel (exempt) pays VAT on the panga only. A verified zero-rated customer pays no VAT on the panga.
- **The system records which treatment applied on every line**, even when the tax is 0 (zero-rated and exempt are reported differently).
- **"Verify your tax status" form** for customers, deliberately neutral wording: "I'm VAT-registered", "My purchases are VAT exempt", "…zero-rated", "I'm a withholding agent". The ID label follows the country (KRA PIN, TIN, VAT, GST), with a document upload. It feeds an admin review queue; approving creates and verifies the certificate.
- **Display preference:** customers choose to see prices including or excluding tax (guests: including). Tax details show on product and service pages, with a short label on cards.
- **Later:** the backend will allow only one "standard" tax type.

---

## 5. Modules

### 5.1 The 12 modules

| # | Module | Contains | Exists today |
|---|---|---|---|
| 0 | **Core** (always on) | customers, users & roles, team (employees, leave), currency, units, tax & withholding, payments, orders & invoices, checkout, quotes & quote requests, loyalty, referral & promo codes, store credit, credit accounts, reconciliation, financial notes, reports, help desk (tickets), publications (blog, news, brochures), content pages & policies, notifications, vault, Mimi AI assistant (switchable), activity logs, themes, navigation, Module Center, **bookings** (shared capability used by multiple modules) | yes |
| 1 | **E-commerce** | products (variants, categories, brands, bulk edit), **services** (categories), specials, wishlist, reviews; switchable sub-features: **hampers**, **auctions** | yes |
| 2 | **Listings** | property, vehicles, rentals; enquiries; bookable paid viewings and test drives | new |
| 3 | **Campaigns** | fundraising and crowdfunding (goal, progress, donations); marketing and awareness campaigns without payments | new |
| 4 | **Courses** | courses, books, teaching materials, enrolment, progress | new |
| 5 | **Accommodations** | rooms, room board (open, occupied, nights left), bookings, guest folio that settles at checkout | new |
| 6 | **Menus** | restaurant menus and orders | new |
| 7 | **Events** | tickets and capacity | new |
| 8 | **Memberships** | memberships, subscriptions, plans with recurring billing | new |
| 9 | **Careers** | job board, applicant accounts, admin, the ATS with AI screening | yes |
| 10 | **Projects** | projects, milestones, tasks, messages, participants, "My Projects" | yes |
| 11 | **TISL extras** | delivery (manifests, drivers, incidents, ratings, driver portal), inventory (stock, reconciliation, worksheets, work assignments), algorithm (ranking, customer pins, search analytics) | yes |

**Owner-only, never shown to clients:** bug reports, dev notes, dev keys, Data Engine, flowcharts.

### 5.2 Module Center (client superadmin)

- A card for each module: its name, what it contains, and a status (Active / Licensed but off / Not licensed / Expired).
- The switch works only for licensed modules; switching one off hides it but keeps its data.
- Unlicensed cards have a text area for a key. Pasting the key Renka provides activates the module immediately.
- Every activation and switch is logged.

### 5.3 License keys

- **Signed keys:** the payload (install, module, expiry) is signed with Renka's private key. The app ships only the public key, so keys can't be forged or edited, even with database access. The private key never goes in the repo.
- **Enforcement on both ends:** the server blocks an inactive module's routes; the frontend hides its pages, menus and admin screens.
- **Expiry or deactivation never deletes data**: the module goes read-only after a grace period, and a new key restores it.

### 5.4 Module manifests

Each module declares, in one place, its admin sidebar group, storefront nav links, account-menu links, settings tabs and dependencies. The admin sidebar, the storefront navigation manager and the Module Center all read the manifests.

### 5.5 Code layout (target)

- Backend: `app/Modules/<Module>/` (models, controllers, routes, service provider).
- Frontend: `src/<module>/` with a manifest; pages are lazy-loaded only when the module is active.
- Core stays at `src/core/` and `src/_shared/`.

### 5.6 Frontend folder convention (per module)

```
src/<module>/
  manifest.js          ← sidebar groups, nav links, account-menu links, settings tabs, dependencies
  pages/
    admin/             ← admin screens
    customer/          ← storefront pages (if module has a public face)
  components/
    admin/
    storefront/
```

---

### 5.7 Module-by-module frontend breakdown

> **Key:** ✅ exists and in place · 🔀 exists but in wrong location · ❌ not built yet  
> Bookings is a **Core** capability (used by E-commerce, Menus, Accommodations, Extras).  
> Vendors are deferred — separate middleware, separate planning session.

---

#### Module 0 — Core (`src/core/`)

Always on. No manifest, no license key.

**Admin pages** (`src/core/pages/admin/`)

| Page | Status |
|---|---|
| Dashboard | ✅ |
| Customers (list, detail, credit tab, discount, health, algorithm panel) | ✅ |
| Orders (list, detail) | ✅ |
| Quotes (list, create, detail) | ✅ |
| Quote requests (list, detail) | ✅ |
| Payments | 🔀 in finance/ |
| Credit accounts (dashboard, detail, credit tab) | ✅ |
| Reconciliation | 🔀 in finance/ |
| Financial notes | 🔀 in finance/ |
| Loyalty (ledger, ledger detail, settings) | ✅ |
| Referral & promo codes | 🔀 in referrals/ |
| Tickets (list, detail) | ✅ |
| Publications (list) | ✅ |
| Content pages | 🔀 in settings/ |
| Policies | 🔀 in settings/ |
| Reports | ✅ |
| Activity logs + log export | ✅ |
| Appearance (themes, fonts, icon styles) | ✅ |
| Settings (general, currency, units, tiers, shipping, navigation, modules, users & roles, vault, algorithm) | 🔀 scattered in settings/, general/, users/, vault/ |
| Notifications | ❌ |
| Bookings — admin list + detail + settings | ✅ (AdminBookings, AdminBookingDetail, BookingSettings) |

**Customer pages** (`src/core/pages/customer/`)

| Page | Status |
|---|---|
| Home | ✅ |
| About | ✅ |
| Contact | ✅ |
| Profile | ✅ |
| My Orders (list, detail) | ✅ |
| My Quotes (list) + My Quote Requests (list, detail) + Quote detail | ✅ |
| My Tickets (list, detail) | ✅ |
| Checkout | ✅ |
| Cart | ✅ |
| Customer delivery history | ✅ |
| Customer shipment tracking | ✅ |
| Appearance settings | ✅ |
| My Bug Reports | ✅ |
| Manual | ✅ |
| My Bookings (list, detail) | ✅ |

**Shared components** (`src/_shared/`)

API clients, stores, hooks, common UI (Button, SmartSearchBox, Pagination, Header, Footer, Breadcrumb, etc.), layout, legal.

---

#### Module 1 — E-commerce (`src/ecommerce/`)

**Admin pages**

| Page | Status |
|---|---|
| Products (list) | ✅ in ecommerce/pages/admin/ |
| Product form (create/edit) | ✅ in ecommerce/pages/admin/ |
| Product variants | ✅ in ProductForm + ecommerce/components/admin/variants/ |
| Services (list) | ✅ in ecommerce/pages/admin/ |
| Service form | ✅ in ecommerce/pages/admin/ |
| Service categories | ✅ in ecommerce/pages/admin/ |
| Categories (list, form) | ✅ in ecommerce/pages/admin/ |
| Brands (list, form) | ✅ in ecommerce/pages/admin/ |
| Reviews | ✅ in ecommerce/pages/admin/ |
| Specials | ❌ |
| Hampers (list, detail, orders) | ✅ in ecommerce/pages/admin/hampers/ |
| Auctions (list, detail, orders) | ✅ in ecommerce/pages/admin/auctions/ |
| Wishlists (admin view) | ❌ |

**Customer pages**

| Page | Status |
|---|---|
| Products (list) | ✅ in ecommerce/pages/customer/ |
| Product detail | ✅ in ecommerce/pages/customer/ |
| Services (list) | ✅ in ecommerce/pages/customer/ |
| Service detail + Book service | ✅ in ecommerce/pages/customer/ |
| Specials | ✅ in ecommerce/pages/customer/ |
| Wishlist | ✅ in ecommerce/pages/customer/ |
| Hamper list + detail + checkout + my hamper orders | ✅ in ecommerce/pages/customer/ |
| Auction list + detail | ✅ in ecommerce/pages/customer/ |

**Components**

| Area | Status |
|---|---|
| Product card, grid, filters | ✅ in ecommerce/components/storefront/products/ |
| Service card, grid, filters | ✅ in ecommerce/components/storefront/services/ |
| Cart components | ✅ in core/components/cart/ (cart and checkout are Core, section 9) |
| Hamper components | ✅ none separate (inside the hamper pages) |
| Auction components | ✅ in ecommerce/components/ (BidModal in storefront/auctions/) |
| Wishlist items | ✅ in ecommerce/components/storefront/wishlist/ |
| Specials hero + polaroid card | ✅ in ecommerce/components/storefront/specials/ |

---

#### Module 2 — Listings (`src/listings/`)

For anything listed, discovered, viewed, rented, sold or enquired about — properties, vehicles, equipment, venues, directories.

**Admin pages** ❌ all new

| Page | Notes |
|---|---|
| Listings list | |
| Listing form (create/edit) | Attributes differ by listing type |
| Listing categories | |
| Enquiries list + detail | |
| Viewing/test-drive requests | |

**Customer pages** ❌ all new

| Page | Notes |
|---|---|
| Listings browse | Search, filters, map, sort |
| Listing detail | Gallery, specs, contact/enquire, location |
| Enquiry form | |
| Request viewing / test drive | Plugs into Core Bookings |
| My Enquiries | In customer account |

**Components** ❌ all new

Listing card, listing grid, listing filters, map view, enquiry modal, image gallery.

---

#### Module 3 — Campaigns (`src/campaigns/`)

Fundraising, crowdfunding, awareness and marketing campaigns.

**Admin pages** ❌ all new

| Page | Notes |
|---|---|
| Campaigns list | |
| Campaign form | Type: fundraising / crowdfunding / awareness / marketing |
| Donors / backers list | For money campaigns |
| Campaign updates | |
| Donations list | |

**Customer pages** ❌ all new

| Page | Notes |
|---|---|
| Campaigns browse | |
| Campaign detail | Goal, progress bar, donate/back CTA, updates |
| Donate / back form | Plugs into Core payments |
| My Donations / My Backed Campaigns | In customer account |

**Components** ❌ all new

Campaign card, progress bar, donor list, update feed, donation form.

---

#### Module 4 — Courses (`src/courses/`)

Education, training, structured learning.

**Admin pages** ❌ all new

| Page | Notes |
|---|---|
| Courses list | |
| Course form | |
| Curriculum builder | Modules → lessons → topics |
| Enrolments list | |
| Student progress | |
| Assessments | Quizzes, assignments |

**Customer pages** ❌ all new

| Page | Notes |
|---|---|
| Course catalogue | Browse, filter by category/level/price |
| Course detail | Curriculum preview, instructor, enrol/buy CTA |
| Enrol / pay | Plugs into Core checkout |
| My Courses | Progress, resume lesson |
| Lesson player | Video / PDF / text |
| Quiz / assessment | |
| My Certificates | |

**Components** ❌ all new

Course card, curriculum tree, lesson player, progress tracker, quiz component, certificate viewer.

---

#### Module 5 — Accommodations (`src/accommodations/`)

Hotels, lodges, guesthouses, serviced apartments, rooms.

**Admin pages** ❌ all new

| Page | Notes |
|---|---|
| Properties list + form | |
| Room types list + form | |
| Rooms list + form | |
| Availability / rate calendar | |
| Reservations list + detail | |
| Room board | Live view: open / occupied / reserved / dirty |
| Guest folios | Charges, payments, checkout |
| Housekeeping | Cleaning status |

**Customer pages** ❌ all new

| Page | Notes |
|---|---|
| Property browse | |
| Property detail | Rooms, amenities, availability |
| Room detail + booking form | Plugs into Core Bookings + checkout |
| My Reservations | |

**Components** ❌ all new

Room card, availability calendar, room board grid, folio summary, housekeeping status badge.

---

#### Module 6 — Menus (`src/menus/`)

Restaurants, cafés, catering, food ordering.

**Admin pages** ❌ all new

| Page | Notes |
|---|---|
| Menus list + form | Multiple menus (breakfast, lunch, dinner, happy hour) |
| Menu sections + items | |
| Item options / modifiers | Sizes, add-ons, allergens |
| Tables + floor plan | |
| Table reservations | Plugs into Core Bookings |
| Kitchen orders | KDS view |
| Menu orders list | |

**Customer pages** ❌ all new

| Page | Notes |
|---|---|
| Menu browse | By section, filter by allergen/diet |
| Item detail | Options, add-ons |
| Cart + order (table / takeaway / delivery) | Plugs into Core cart + checkout |
| Table reservation form | Plugs into Core Bookings |
| My Menu Orders | Order status, reorder |

**Components** ❌ all new

Menu section, item card, modifier picker, cart (menu variant), kitchen display row, floor plan grid, table badge.

---

#### Module 7 — Events (`src/events/`)

Events, tickets, registration, attendance.

**Admin pages** ❌ all new

| Page | Notes |
|---|---|
| Events list + form | |
| Ticket types + pricing | |
| Attendees list | |
| Check-in | QR scanner or manual |
| Seating (optional) | |

**Customer pages** ❌ all new

| Page | Notes |
|---|---|
| Events browse | Filter by date, category, location |
| Event detail | Schedule, speakers, tickets |
| Ticket purchase | Plugs into Core checkout |
| My Tickets | QR code, event details |
| Check-in page | QR display |

**Components** ❌ all new

Event card, ticket type selector, attendee badge, QR code viewer, seating map (optional).

---

#### Module 8 — Memberships (`src/memberships/`)

Membership orgs, clubs, gyms, co-working, subscriptions.

**Admin pages** ❌ all new

| Page | Notes |
|---|---|
| Membership types + plans | Benefits, pricing, billing cycle |
| Members list + detail | Status, expiry, renewal |
| Member check-in | Attendance log |
| Billing / renewals | Recurring payments via Core payments |
| Access permissions | Member-only content gates |

**Customer pages** ❌ all new

| Page | Notes |
|---|---|
| Membership plans browse | |
| Plan detail + join | Plugs into Core checkout / recurring billing |
| My Membership | Status, expiry, benefits, renewal |
| Member portal | Member-only content |
| Member directory (optional) | |

**Components** ❌ all new

Plan card, membership status badge, renewal countdown, check-in button, member-only gate wrapper.

---

#### Module 9 — Careers (`src/careers/`)

Job board, applicant portal, ATS.

**Admin pages**

| Page | Status |
|---|---|
| Job vacancies list + form | ✅ in careers/admin/ |
| Applications list + detail | ✅ |
| ATS pipeline | ✅ |
| Interview scheduling | ✅ plugs into Core Bookings |
| Hiring decisions + offers | ✅ |

**Customer / applicant pages**

| Page | Status |
|---|---|
| Careers page (public job board) | ✅ |
| Job detail | ✅ |
| Apply form | ✅ |
| Applicant portal (login, profile, my applications) | ✅ |

---

#### Module 10 — Projects (`src/projects/`)

Project portfolios and project-based collaboration.

**Admin pages**

| Page | Status |
|---|---|
| Projects list | ✅ |
| Project detail (milestones, tasks, messages, participants, links) | ✅ |
| Project create | ✅ |
| AI analytics | ✅ in extras/pages/admin/ai-analytics/ |
| Work board | ✅ in projects/pages/admin/Work.jsx |

**Customer pages**

| Page | Status |
|---|---|
| My Projects list | ✅ |
| My Project detail | ✅ |

---

#### Module 11 — TISL Extras (`src/extras/`)

Operational toolbox — not all visible to customers.

**Admin pages**

| Page | Status |
|---|---|
| Inventory | ✅ |
| Delivery manifests + routes + incidents + ratings | ✅ |
| Driver management | ✅ in extras/pages/admin/delivery/ |
| Employees + timetable | ✅ in extras/pages/admin/employees/ |
| Worksheets + worksheet form | ✅ |
| Algorithm / search analytics | ✅ in extras/pages/admin/ai-analytics/ |

**Driver portal** (separate role, own pages)

| Page | Status |
|---|---|
| Driver manifest | ✅ in extras/pages/driver/ |

---

### 5.8 Pages that need to move (relocation backlog)

**Done (27 Sep 2026).** File moves and import updates only, no code changes; production build passes.

| What | From | To |
|---|---|---|
| Products, ProductDetail, Services, ServiceDetail, BookService, SpecialsPage, Wishlist, HamperListPage, HamperDetail, HamperCheckout, MyHamperOrders, MyHamperOrderDetail | core/pages/customer/ | ecommerce/pages/customer/ |
| SpecialsPolaroidCard, ClockDialHero (used only by Specials) | core/pages/customer/ | ecommerce/components/storefront/specials/ |
| Products, ProductForm, Services, ServiceForm, ServiceCategories, Categories, CategoryForm, Brands, BrandForm, Reviews (admin) | core/pages/admin/ | ecommerce/pages/admin/ |
| Work.jsx (admin) | core/pages/admin/ | projects/pages/admin/ |
| Service card, grid, filters, collapsed card | core/components/services/ | ecommerce/components/storefront/services/ |
| Variant editor, options, variant form, images, unit form | core/components/admin/variants/ | ecommerce/components/admin/variants/ |
| BidModal | core/components/auctions/ | ecommerce/components/storefront/auctions/ |
| Project admin, customer and shared components | core/components/projects/ | projects/components/ (customer → storefront/) |

**Still in the wrong place (Core module, section 5.7):** Payments, Reconciliation and Financial notes (finance/), Referral & promo codes (referrals/), Content pages and Policies (settings/), and the scattered settings pages. These stay in `src/core/` and only need regrouping inside it, so they wait for the Settings hub work.

---

### 5.9 Build order for new modules

Build one module at a time, backend + frontend together, in this order:

1. **Listings** — most universally useful; no recurring billing complexity
2. **Events** — straightforward; tickets plug into existing checkout
3. **Campaigns** — donations plug into existing payments
4. **Courses** — needs lesson player and progress tracking
5. **Memberships** — needs recurring billing (most complex)
6. **Accommodations** — needs room board, folios, availability calendar
7. **Menus** — needs kitchen display, table management

---

## 6. Admin navigation (done)

**One sidebar replaces four places** (main sidebar, Settings sidebar, Settings card page, General sidebar).

- **Dashboard**
- **Sales:** Orders, Payments, Credit accounts, Reconciliation, Financial notes
- **Catalogue** (E-commerce): Products, Services, Categories, Brands, Hampers, Auctions (+ auction orders), Bookings
- **Customers:** Customers, Loyalty, Promo & referral codes
- **Tax & Finance:** Tax & Compliance, Withholding & Compliance, Reports
- **Module groups** (only when active): Quotes, Projects, Help Desk, Careers, Delivery, Inventory, Publications, AI…
- **Settings hub** with tabs: General, Currency, Units, Tiers, Shipping, Content pages, Policies, Themes, Navigation, Modules, Users & roles, Algorithm, Vault, Activity logs
- **Developer** (owner-only): dev notes, dev keys, bug reports, Data Engine, flowcharts

**As built:** Mimi AI sits under Workplace with Help desk, Team and Publications; Delivery, Inventory and the Work board are under Operations (TISL extras); drivers see only Dashboard and My deliveries; Reports has a Site analytics tab; the system docs on the Settings page are owner-only. New pages are added to the registry, not to a layout.

**Other changes:**
- The General sidebar is removed; bulk editors become a "Bulk edit" tab on Products, Customers and Employees.
- Duplicates are removed (Users and Loyalty in two places; Delivery listed twice).
- Orphans get entries: Bookings, Credit accounts, Auction orders, Data Engine, Financial notes.
- Collapsible groups, a Ctrl+K quick-jump search, and the existing role rules kept.

---

## 7. Storefront navigation manager

- Active modules offer their links; core adds Home, About, Contact and custom pages.
- The admin sets, per link, a **show** switch, a **primary** switch and a **sort number**. At most **7 primary links**, enforced by the server.
- **Large screens:** primary links in the header in sort order; the rest in a "More" dropdown.
- **Small screens:** one menu, primary links first, then the rest, each in sort order.
- **Account menu:** built from active modules (e.g. "My Hampers" only if hampers are on).

---

## 8. Theming

**Current state (measured):**
- About 16,000 hex colours in 367 of 479 `.jsx` files, plus 7,700 `rgba()` values; the brand purple appears about 3,500 times.
- About 1,800 Tailwind colour classes and 1,000 `dark:` classes.
- **Tailwind isn't generating utilities.** The project runs Tailwind 4 (`@tailwindcss/postcss`) but `index.css` still uses the v3 `@tailwind base/components/utilities` directives, so classes like `bg-white` or `dark:bg-gray-900` produce no CSS; only the hand-written subset in `styles/layout.css` (`.flex`, `.container`, `.px-4`…) works. Switching to `@import "tailwindcss"` would suddenly switch on ~2,800 dormant colour classes and change how many pages look, so it's part of the theming work, not a quick fix.
- `index.css` already has a variable system (brand scale, text and surface tokens, a `.dark` block) that most components ignore. `--color-text-primary` (used by 38 files) is undefined.
- Storefront: about 67 files and 4,500 colour literals. Admin: about 260 files and 17,000.

**Plan (storefront first):**
1. **Tokens:** one theme token set as CSS variables (brand, accent, background, surface, text, muted, border, success, warning, danger), each with light and dark values. The brand colour is also stored as RGB channels so `rgba(var(--brand-rgb), 0.1)` works. `theme/tokens.js` returns variables, not literals.
2. **Tailwind remap:** the Tailwind palette points at the tokens, so existing colour classes follow the theme without per-file edits.
3. **Themes backend:** a themes table (name, light and dark tokens, default flag, customer-selectable flag) and an admin editor with live preview and a contrast check.
4. **Customer choice:** a theme picker in the profile and header, saved per customer and remembered in the browser for guests. It stays hidden until step 5 is complete.
5. **Storefront conversion:** customer pages, product and service components, cart, header and footer.
6. **All new pages**, modules included, are built on tokens from day one.
7. **Admin conversion,** gradually and area by area.

**Undecided:** colours only, or also fonts, corner roundness and logo?

---

## 9. Checkout (after navigation, theming and modules)

- **Purchasable contract** implemented by every sellable type: price and currency, tax class, availability, reserve/release, fulfil.
- **Cart and order lines** point at purchasables polymorphically.
- **Three ways to pay:** pay now (shop); open tab or folio settled later (accommodation stays, credit accounts); recurring (memberships).
- **Shared booking and availability service** for time slots, date ranges and seats (service bookings, viewings, rooms, events).
- **Currency:** conversion into the customer's account currency with snapshots. Taxes come from item class × customer status. Promo, wallet and loyalty all go through the conversion helper.
- **Also part of this work:** the customer currency-change request form and review queue, and the tax-status request form.

---

## 10. Build order

1. ~~**Admin navigation**~~ (done; manifests in 5.4 come with the module registry).
2. **Theming** steps 1–5 (section 8).
3. **Module registry, Module Center, license keys, route gating** (section 5).
4. **Storefront navigation manager** (section 7).
5. **Checkout foundations and checkout** (section 9, plus sections 3 and 4).
6. **New modules** one at a time (Listings, Campaigns, Courses, Accommodations, Menus, Events, Memberships).

---

## 11. Backlog & known issues

### Checkout and money (fixed during the checkout work)
- Checkout charges `product.price`, ignoring the chosen variant and unit.
- The quote list merges variants of the same product.
- Hard-coded 16% VAT in order checkout and auction orders.
- KSh hard-coded in the cart, checkout, orders, quotes, profile credit and promo displays.
- The auction order service defaults to KES when no currency is sent.
- Loyalty settings still use KES-named keys (`points_per_100_kes`, `value_kes`, `referral_credit_amount`).
- Order totals use `exchange_rate_to_kes`; this is to move to `exchange_rate_to_base` + `base_currency_id`.

### Security and enforcement
- Tax and withholding policies exist but controllers never call `authorize()` (state rules unenforced).
- Certificate and withholding documents are on the public disk; they should move to a private disk behind an authorised download.
- Withholding `applyClearance` needs a transaction and a row lock.
- Tax overrides don't check that the certificate belongs to the customer.
- Editing a verified certificate should reset it to pending.

### Validation
- Tax districts: the server doesn't block a district being placed inside its own child (a loop hangs requests).
- `applicable_module` is free text; it should be a whitelist.
- Withholding classifications accept non-withheld (VAT) rates.
- Manual withholding certificates are created, then deleted if the amounts don't balance, instead of validating first.

### Currency
- The `convert` endpoint returns an inverted rate.
- Currencies that are in use can be deleted or deactivated.
- Currency codes are editable, which breaks `Order.currency` history.
- The currency create rule still requires `conversion_rate`.

### Variants and units
- Variant-unit prices have no currency of their own.
- A base unit can't be replaced.
- Nothing checks that an alternate unit measures the same thing as the base.
- More than one unit per variant can be the default for sale.
- UoM dimensions are free text, with no one-base-unit rule per dimension.
- `isInUse` misses `tax_applications`.
- `Service.unit_of_measure` is a text column instead of a link to units.

### Tax structure
- `TaxService` isn't called from checkout and takes 14 positional parameters (planned: `Taxable` interface + `TaxContext`).
- `TaxApplication` needs polymorphic document and line links plus a currency and rate snapshot.
- `WithholdingService` works only for customers.

### Housekeeping
- Delete `app/Models/us.php` (duplicate `UserController` class).
- Untrack the committed `app.zip` and `src.zip`; delete the stray `backend/5.3.0` and `backend/composer` files; gitignore `frontend/dev-dist/`.
- Move `ActivityLog`, `ProductActivityLog`, `TaxActivityLog` and `WithholdingActivityLog` into `app/Models/Logs/` to match their namespace.
- Rename `Vendorpolicy.php` → `VendorPolicy.php`.
- The tax, UoM, currency and variant tables have no committed schema; add SQL scripts for them.
- Add `->whereNumber()` to `{id}` routes; remove the duplicate project, referral and promo routes.
- Run `npm install xlsx` (used by delivery manifest printing but missing from `package.json`).
- Product and service stock/price columns that are `0` in the data (for example "KSh 0" gloves) need review.
