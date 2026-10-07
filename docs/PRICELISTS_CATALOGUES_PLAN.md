# Price lists and brochures / catalogues - plan v3 (BUILT: see the as-built notes at the end)

Two related things in the E-commerce module (hidden unless E-commerce is licensed and on). Books is only ever read, never written.

- **Price list:** a plain, dated table of selling prices for **products and services only**.
- **Brochure / catalogue:** the designed document. One item is a brochure; several are a catalogue; the same thing at a different size. **Hampers and auctions can be in these** (not in price lists).

## Price lists

**What is in one:** products (one row per variant and unit) and services (one row per package), picked as one item, a category, a brand, or a hand-picked mix from several places. Never cost. Prices stay in each item's own currency (no conversion).

**Tax, worked the way an invoice does** (same code, `TaxLineService`, for a guest, one unit): the item's sales account, its tax type and rate; a percentage on the amount; a fixed amount converted from its own currency and unit into the item's currency and summed. Each row: price excl., tax name and rate, tax amount, total.

**The earlier price (strike-through vs markup):** the item's original price is compared with the price:
- original higher than the price (a discount): shown struck through.
- original lower than the price (a markup, the price went up): NOT struck through; shown as "Was X, up N%" in muted text. A setting per list: show earlier prices for discounts only / discounts and increases / never.

**No automation, no schedule.** A list is made by hand and has:
- a status: draft, waiting for activation, or published,
- an **Active from** date: a published list becomes visible to customers on that date (worked out when it is read, like campaign dates; nothing runs in the background).
- A sales rep's list cannot be published by its author: it goes for activation and an admin, manager, finance or super admin activates it (a calendar task for them, removed when it is activated or withdrawn). Super admin, admin, manager and finance can publish their own.
- Created by: super admin, admin, manager, finance, sales rep. Hard delete: admin and super admin only.

**Stored in the database** as a frozen snapshot: `price_lists` plus one row per priced line in `price_list_items` (later price changes never alter it).
**Limit:** a setting for the most lists kept (1 to 1000). At the limit nothing new can be made until one is removed. No automatic deletion. To free a slot: Download zip (PDF, CSV and JSON), upload it to the Archive, then hard delete the list.
**Archive:** uploaded zips (checked to hold the three files), each with its own "who can see it". Customers can open the Archive.
**JSON export:** its own neutral, readable layout (title, as-at date, items with code, name, variant, unit, currency, prices, tax name, rate, amounts), no database names or ids.
**Who can see a list** (dropdown per list and per archive): staff only / everyone including guests / signed-in customers / selected customer types. The customer types are read from the database (`customer_type_discounts`), never typed into the code.
**The PDF:** drawn in the browser as a real-text PDF (selectable, small), page by page from the stored rows; CSV and JSON from the server; the zip built in the browser.

## Brochures and catalogues (the bigger design)

**Sections, not fixed templates.** A brochure page is built from **sections** stacked down an A4 page (or placed on half-page or card slots). Each section has a **theme** (the moodboard vocabulary: colour, font, background pattern, shapes, stickers).

Sections by item type (each type gets sensible defaults):
- **Product:** hero (picture, name, brand); gallery (2, 3 or 4 pictures); story (description); features; specifications table; variants and prices (with tax breakdown and the earlier-price rule); details strip (SKU, barcode, unit); contact band.
- **Hamper:** hero; what is inside (contents with pictures and quantities); the occasion story; price and edition (stock left, valid dates); terms.
- **Auction:** hero; the lot's details; schedule (starts, ends); start price and bidding steps; auction terms.
- **Service:** keeps the service brochure already built (four full templates).

**Three layers decide what an item looks like:**
1. **Type default** (shop-wide setting per type: which sections, in what order, each with a preselected theme).
2. **The item's own brochure settings** (`brochure_meta` on each product, hamper and auction: its own sections and a theme per section; optional, falls back to 1). Set one by one, or in bulk by category or brand.
3. **This catalogue's override for that entry**: item A can use one section set, item B another, just for this catalogue (falls back to 2).

**Size per entry:** full page, half page or card (several to a page). Smaller sizes use only the leading sections. This is how a one-item brochure and a hundreds-of-pages catalogue use the same engine.

**Pages of a catalogue:** cover, contents, then the entries, then a back page with the company's details. Drawn page by page in the browser with a progress bar, pictures loaded in small batches and pages kept small, so hundreds of pages do not exhaust the browser's memory. Prices come live when drawn, stamped "prices as at (date)" (or, optionally, taken from a chosen price list).

**Stored:** `brochures` (title, settings, who may see it) and `brochure_entries` (item type and id, position, size, section override). Small rows, no snapshot, no limit needed. The item pickers are the same as for price lists.

## Navigation (no new menu items)
- Products menu tabs become: All products, Categories, Brands, Bulk edit, **Price lists**, **Brochures**.
- A **Price lists** shortcut button on the Products page toolbar, between Trash and Create Product.
- Inside the price list area a small tab bar on every page: Price lists, Brochures, Archive, Settings, so it is one click between them. (Archive and Settings are not menu items.)
- Customers: a Price lists page and an Archive page (only what they may see), and a Download brochure button on an item's page when allowed.

## Build order
1. Script; price list models; item picker; snapshot with the tax code; create (draft, activation, publish, active-from); screens; the limit; navigation and the shortcut.
2. Customer pages and the "who can see it" rules from the database's customer types.
3. Price list PDF (real text), CSV, JSON, zip; archive upload; hard delete.
4. Brochure sections and themes; type defaults; per-item settings (with bulk); the brochure / catalogue builder with per-entry overrides and sizes; the page drawing with progress.
5. Customer download buttons; checks (database, PDF, zip, a large catalogue), lint and build.


## As built (changes from the plan above)
Run script 93 once (`backend/database/sql/93_pricelists_brochures.sql`); nothing works until then (screens say so with a 503).

- **Tables:** `products.brochure_meta` (the only change to `products`), `brochure_item_meta` (services, hampers and auctions share it), `price_lists`, `price_list_items`, `price_list_archives`, `brochures` (its entries are one JSON column, so **there is no `brochure_entries` table**), `catalogue_settings` (one row). All are in the backup map under E-commerce.
- **Limit:** counts every list kept, **the bin included**. Only "delete for good" (admin, super admin, from the bin) frees a place. Delete, restore and delete for good exist for price lists and for brochures.
- **Catalogue prices:** each product and service takes the most recent live price list the viewer may see that holds it, stamped "As of <list>, <date>". With none (or on any failure) it uses the live price stamped "As of <today>". Hampers and auctions have no price lists, so they are always live.
- **Sizes:** full page (one entry a page), half page (two) and card (six). An entry can choose its own size.
- **Sections:** product (hero, gallery, story, features, specs, prices, details), service (hero, gallery, story, features, packages, details), hamper (hero, inside, story, price, terms), auction (hero, lot, schedule, price, terms). Eight themes. Layers: this catalogue's entry, then the item's own settings, then the type default (Settings tab). Half and card sizes use the entry's lead section's theme.
- **Customer side:** "Download brochure" on product, hamper and auction pages (asks `/catalogue/status`; shown only when the shop switch is on, the item has not switched it off, and the item is visible to that customer). The products page shows "Look at these brochures" and "Price lists" only when the visitor can open at least one. Pages: `/brochures`, `/price-lists`, `/price-lists/:id`.
- **Services** keep their existing own brochure on the service page; in a catalogue a service uses the section engine.
- **Staff screens** (Products menu tabs: All products, Categories, Brands, Bulk edit, Price lists, Brochures, Settings): `/admin/price-lists` (+ `/new`, `/:id`), `/admin/price-list-archive`, `/admin/catalogues` (+ `/new`, `/:id`), `/admin/catalogue-items` (each item's sections and themes, one by one or in bulk by ticks, category, brand or all), `/admin/catalogue-settings`. A small tab bar on all of them links the five areas; the Products page has a "Price lists" shortcut between Trash and Create Product.
- **Files:** price list PDF is drawn in the browser with real text (standard Helvetica; characters outside Latin-1 show as "?" in the PDF, while the CSV and JSON keep them); the zip is built in the browser (store only); brochures are drawn page by page on one reused canvas and written straight into a JPEG PDF, with a progress line, and very long catalogues are drawn a little smaller.
