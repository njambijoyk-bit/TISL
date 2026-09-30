# TISL Platform — What's Built

The record of what is **already built and decided**. For what we still want to
build, see **`PLATFORM_PLAN.md`** (the roadmap).

> Keep the two in sync: when something on the roadmap ships, move it here.

---

## 1. Working conventions

- **Delivery:** changed files are handed over one by one, in repo folder layout — never zipped.
- **Pushing:** code changes are pushed to a feature branch (`feat/module-structure`); Renka merges into `tisl_v2` herself. **SQL scripts are the exception** — delivered as copyable files to run in MySQL Workbench, never pushed.
- **Database changes:** SQL scripts to run in MySQL Workbench, not Laravel migrations. Each script:
  - starts with read-only `SELECT` checks, run first on their own;
  - turns `SQL_SAFE_UPDATES` off and back on;
  - runs updates inside a transaction;
  - ends with a result check;
  - is safe to re-run where possible.
- **Planning first:** big changes are discussed and agreed before any code.
- **Logging:** every money- or configuration-changing action is recorded through the activity-log traits (who, when, old → new, why, context to reverse it).
- **Builds:** before delivery, frontend changes are checked with a full-app bundle and a lint for undefined names; PHP files with `php -l`.

### SQL scripts so far

| # | Script | Does |
|---|---|---|
| 01 | `01_morph_types_to_aliases.sql` | Stored `*_type` class names → short aliases (`product`, `tax_rate`…) |
| 02 | `02_backfill_currency_id_products_services.sql` | Pins products/services without a currency to the base |
| 03 | `03_currency_on_hampers_and_auctions.sql` | `currency_id` on hampers and auctions |
| 04 | `04_hamper_tax_rate.sql` | `tax_rate_id` on hampers (replaces the fixed "VAT 16%" toggle) |
| 05 | `05_customer_currency_and_currency_log.sql` | Customer account currency + `currency_activity_logs` table |
| 06 | `06_licensing_tables.sql` | `installation` (one row), `modules`, `module_locks` |
| 07 | `07_license_attempt_events.sql` | `license_attempts` log (time, user, result) |
| 08 | `08_backup_settings.sql` | `backup_settings` (destination, frequency, encrypted passphrase) |
| 09 | `09_module_table_map.sql` | `module_table_map` — DB-driven table → module assignment |
| 10 | `10_backup_map_adjustments.sql` | Seed/adjust the built-in table → module map |
| 11 | `11_backup_runs.sql` | `backup_runs` history (when, destination, result, file) |
| 12 | `12_nav_links.sql` | `nav_links` — storefront links per module, with show/visible flags |
| 22 | `22_stock_fields_and_ledgers.sql` | `products.is_for_sale` / `track_expiry`; ledgers *Stock, Cost of Goods Sold, Cost of Services, Job Materials Cost, Stock Loss* + their `accounting_settings` pointers |
| 23 | `23_stock_batches.sql` | `stock_batches`, `stock_batch_balances`, `stock_movements.batch_id` / `unit_cost`; existing stock moved into opening batches (at cost 0 — set real cost in the script's PART E) |
| 24 | `24_purchase_batches_and_opening_stock.sql` | `voucher_items.batch_no` / `mfg_date` / `expiry_date`; the *Opening Stock* voucher type (Dr Stock, Cr *Opening Stock Balance*) with its `WNKJ-OS-` series; `accounting_settings.opening_balance_ledger_id` |
| 25 | `25_stock_settings.sql` | `stock_settings` (one row) and `stock_setting_overrides` — Settings → Stock & expiry, with per-category / per-product exceptions |
| 26 | `26_expiry_engine.sql` | `stock_batches.last_warned_days` (each warning band warns once); `stock_movements.voucher_id` may be empty (writing off a batch that cost nothing) |
| 27 | `27_service_materials.sql` | `service_variant_materials` (a package's default materials); `voucher_items.material_mode` / `cost_amount` / `paid_ledger_id` (materials under a service line) |

---

## 2. What is built

| Area | State |
|---|---|
| **Morph map** | Full alias map in `AppServiceProvider` (must match script 01) |
| **Currencies** | Products, services, hampers, auctions and tax rates each carry their own currency. Storefront toggle (browse-only) converts prices for display; admin and selectors show stored prices. |
| **Conversion helper** | `CurrencyConversionService::snapshot()` returns a `ConversionSnapshot` (amounts, rate, `exchange_rate_to_base`, `base_currency_id`, time). `reverse()` undoes it at the stored rate. `logConversion()` / `logEvent()` write to the currency log. |
| **Currency log** | `currency_activity_logs`, via `LogsCurrencyActivity`. |
| **Customer currency** | Every customer has a pinned account currency (defaults to base). Credit account follows it. Finance can change it only when no store credit, credit balance or unpaid invoice. |
| **Tax admin** | Tax & Compliance and Withholding & Compliance hubs (rates, rules, types, districts, certificates, credits, classifications), per-item overrides, customer Tax tab. Finance-gated. |
| **Hamper tax** | Admin picks an active tax rate; checkout charges it. |
| **Units of measure** | Units, country defaults, converter. |
| **Admin navigation** | One sidebar from `src/navigation/adminNav.js`; `AdminShell` layout route; Ctrl+K quick jump; Settings hub generated from the registry. (§6) |
| **Variants** | Admin variant editor and storefront picker; cart keeps each variant/unit as its own line. |
| **Licensing** | Offline three-piece handshake (§ Licensing below). Route middleware gates all 11 paid modules; Core never gated. |
| **Module Center** | Super-admin page to activate/switch modules and paste keys (§ Module Center). |
| **Backup & restore engine** | Encrypted `.wnkjba` exports of active modules' data (§ Backup engine). Standalone Streamlit viewer lives in repo `njambijoyk-bit/streamlit_viewer`. |
| **Storefront navigation manager** | Admin controls which links customers see; licensed-only, module-lock, backed up under Core (§ Nav manager). |

---

## 3. Money & currency rules (decided & implemented)

1. **Every stored amount carries its own currency.** Nothing is ever mass-converted.
2. **Changing the base currency never rewrites stored money.** The base only sets defaults.
3. **Every saved conversion stores `exchange_rate_to_base` and `base_currency_id`** so it can be reversed exactly. `exchange_rate_to_kes` is retired for new work.
4. **Customer account currency:** pinned per customer, defaults to base. Wallet, credit account and checkout run in it. Changes only via approved request or by finance, with no balance outstanding.
5. **Checkout:** cart items in any currency convert into the customer's account currency at checkout. Guests check out in base.
6. **Storefront currency toggle** is browse-only.
7. **Promo codes:** each has its own currency; amounts convert for other-currency orders.
8. **Loyalty:** earns in base; other-currency orders convert at the day's rate, stored for exact reversal.
9. **Store credit:** one wallet per customer in the account currency; each movement records amount, currency, rate, base.
10. **Accounting snapshots** (`*_kes` columns on orders) stay in KES for TallyPrime.

---

## 4. Licensing (built — decided 27 Sep 2026)

**Model.** Clients deploy on their own servers. The app **never calls home**; everything is checked offline. Licenses are **one-off and never expire**. One codebase for every client. Renka keeps the master register of clients and keys in her own Excel.

**The three pieces.** A module unlocks only when all three agree:

| Piece | Where | What it holds |
|---|---|---|
| 1. Code | Backend, same everywhere | Public key + secret pepper, split into disguised config chunks, assembled at runtime. |
| 2. Database | `installation` (one row) + one row per activated module | Installation: `client_uuid`, `business_name`, `purchased_at`, `ownership_signature`, uuid-hash (pepper), `installed_at`. Module rows: pasted key stored **encrypted** + hash, `used`, `activated_at`, `activated_by`. |
| 3. Renka's key | Given on payment | Long (`WNKJ-XXXXX-…`), signed with Renka's private key. Carries `client_uuid`, module, serial, issue date, key-pair version (`v1`), checksum. |

- Public key stays in code, never the DB. Private key never leaves Renka's machine / the repo; keys made by a signing script kept outside this repo.
- `installation` holds exactly one row (`CHECK (id = 1)`).

**Key prefix is `WNKJ`**; signing domain `WNKJ-LICENSE`. (Rotated from the earlier `TISL` prefix; new key-pair + pepper generated.)

**Pasting a module key** (all offline, in order): checksum → signature (public key from code) → `client_uuid` match → already-active check → activate (`used = 1`). After 10 failed attempts in an hour the box locks 15 min. Every attempt logged.

**Handshake (every "is this module on?").** Assemble public key + pepper → verify installation (signature + uuid hash) → module row (key decrypts, hash matches) → key (signature valid, uuid matches, module matches). All pass = **licensed**. **Active** = licensed **and** the client's switch is on. Held in memory briefly, never saved as "on" — so there is no 0/1 flag to edit. `used` is a record, not a lock.

**Checked in:** route middleware, model loading, scheduled/queued work, navigation.

**Failure modes:** no ownership code → setup screen only; installation edited/fake → "not verified", paid modules off, **core keeps running**; one module key invalid → only that module off. **Core never shuts down; no data is ever deleted.**

**Recovery:** DB restored → nothing to do. DB lost → re-paste same keys. Key lost → Renka resends.

**Honest limits:** someone with the code can patch out checks; the pieces make it a hassle, not impossible. Covered by spread-out checks, "Licensed to <business>" shown in admin/footer, private repo, and the license agreement. Private-key leak → new key pair ships as `v2`.

---

## 5. Module Center (built)

- A card per module: name, contents, status (Active / Licensed but off / Not licensed).
- Switch works only for licensed modules; switching off hides but keeps data.
- Unlicensed cards have a key box; pasting Renka's key activates immediately.
- Shows "Licensed to <business name>" and the attempts log.
- Every activation, switch and failed attempt logged. Works even with nothing licensed.

---

## 6. Backup & restore engine (built)

Backs up the **client's data**, never code, the modules table or licensing tables.

- **Only active modules' tables** are exported (disabled/unlicensed skipped, with a banner explaining why). Core always included.
- **Table → module map:** `ModuleTables::MAP` (built-in) + `module_table_map` (admin form override). `BackupPlanner::plan()` returns included / disabled / unlicensed / excluded / unassigned.
- **Destinations:** browser download (to the admin's machine, not the server), FTP, SFTP, S3 (`Storage::build()`).
- **Encryption:** `.wnkjba` = magic `WNKJBAK1` + uint32 BE header len + JSON header (salt, Argon2id params, secretstream header) + framed XChaCha20-Poly1305 secretstream chunks over a ZIP (`manifest.json` + `data/<module>/<table>.jsonl`). Key = Argon2id(passphrase, salt). Passphrase separate from license keys; wrong passphrase can't decrypt.
- **Restore** (super-admin only): from upload or pulled from a destination. Passphrase **always required**. Replace or merge; generated columns stripped on insert; transaction with FK checks off.
- **Schedule:** daily / weekly / monthly / never, via `backup:run` (scheduled hourly, skips `local`).
- **Who:** admin + super-admin back up; only super-admin restores.
- **Viewer:** standalone Streamlit app (`njambijoyk-bit/streamlit_viewer`, `main`) opens `.wnkjba` locally, read-only, generic over any manifest.

---

## 7. Storefront navigation manager (built)

- Only **licensed** modules offer links; Core adds Home, About, Contact, standard pages. Links in `nav_links`, **backed up under Core**.
- Per link: a **visible** toggle — green tick (visible) / red x (hidden), Lucide icons.
- A module **licensed but switched off locks its links**: customer can't see them, admin can't toggle (server refuses). Turning it back on unlocks.
- Header renders links **generically** on desktop and mobile — nothing hardcoded.
- `NavController::index` (admin) returns groups for licensed modules with an `active` flag; `publicNav` returns active + visible links.

---

## 8. Admin navigation (built)

One sidebar replaces four places. Groups: Dashboard; Sales (Orders, Payments, Credit accounts, Reconciliation, Financial notes); Catalogue (E-commerce); Customers (Customers, Loyalty, Promo & referral); Tax & Finance; module groups (only when active); Settings hub (tabs); Developer (owner-only). Mimi AI under Workplace; Delivery/Inventory/Work under Operations; drivers see only Dashboard + My deliveries. New pages are added to the registry, not to a layout. Collapsible groups + Ctrl+K quick-jump + role rules.

---

## 9. Modules that already exist

| Module | State | Location |
|---|---|---|
| **Core** | ✅ built (customers, orders, quotes, payments, credit, loyalty, tickets, publications, reports, activity logs, themes, nav, Module Center, bookings admin) | `src/core/`, `src/_shared/` |
| **E-commerce** | ✅ products (variants, categories, brands), services, wishlist, reviews, hampers, auctions; specials customer page (admin ❌) | `src/ecommerce/` |
| **Careers** | ✅ job board, applicant portal, ATS, interview scheduling, offers | `src/careers/` |
| **Projects** | ✅ projects, milestones, tasks, messages, participants, My Projects, work board | `src/projects/` |
| **TISL Extras** | ✅ inventory, delivery (manifests, routes, incidents, ratings, driver portal), employees, worksheets, algorithm/analytics | `src/extras/` |

The seven remaining modules (Listings, Campaigns, Courses, Accommodations, Menus, Events, Memberships) are not yet built — see `PLATFORM_PLAN.md`.

### Relocations done (27 Sep 2026)
File moves + import updates only, build passes. E-commerce customer/admin pages, specials components, variant editor and `BidModal` moved out of `core/` into `ecommerce/`; project components into `projects/`; `Work.jsx` into `projects/pages/admin/`. Still to regroup inside Core (waiting for the Settings hub work): Payments, Reconciliation, Financial notes, Referral & promo codes, Content pages, Policies.
