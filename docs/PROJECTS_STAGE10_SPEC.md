# Projects Stage 10: Resources and site (being built)

Status: the owner said "stage 10 now" on 2026-11-20 after Stage 9, so this design is built straight away with the four choices at the end taken as recommended (as in every stage so far). Any of them can still be changed; say which. What is built so far is listed under "As built".

Stages 1 to 9 built the work, its money, the doing of it, the talking about it, its links, its people and its papers. Stage 10 is about what is used on site and what happens there: materials, plant, subcontractors, the daily record, inspections and snags. The words are the industry's (Stage 1 names: "material", "subcontractor", "daily record", "inspection", "snag"), so a firm that is not in construction sees its own.

Size: large. Seven builds, one script, no new permissions (all five are in the catalogue since Stage 1: `projects.materials`, `projects.plant`, `projects.subcontracts`, `projects.daily`, `projects.inspections`).

## The rules this stage keeps

1. **Stock stays in Stock, equipment stays in Inventory, money stays in Books.** Projects asks those modules to move things (issue materials, issue equipment, post a supplier bill) through their own services, so their checks, numbers and journals apply exactly as on their own screens.
2. **No money in Projects.** A subcontract's value is its vendor order; a claim is a percentage complete; the bill is a Books voucher. Material costs are read from Stock's job lines.
3. **Projects decides who may act on a work** (Stage 1 and 2). A new project-role ability, **site**, is given to the Lead and Members, as "files" was in Stage 9.
4. **Every serious action needs nothing out of the box** (Stage 2): certifying a subcontractor's claim is on the list, with a suggested setting.

## In this stage

### 1. Materials (`projects.materials`)
- A **Site** tab on each piece of work, opening on Materials.
- **Planned materials:** a product from the catalogue and the quantity the work needs (quantities, not money).
- **Asking for materials:** someone on the work asks for a quantity, by a day, from a branch; whoever keeps the store issues all or part.
- **Issuing** goes through a Stock **job** for the work at that branch (one per branch, opened by itself): stock leaves the branch into Work in progress, on the work's cost centre. Returning to stock works the same way back. When the work is closed its jobs are completed, which moves the cost to Cost of services.
- The tab shows, per material, planned, asked for, issued and returned, and the cost of what was issued (read from Stock).

### 2. Plant (`projects.plant`)
- **Owned plant** is equipment in Inventory: issued to the work (Inventory's own issue, the work as the holder) and returned with its condition.
- **Bookings ahead:** a piece of equipment from a day to a day; a booking that overlaps another work's booking or issue is warned about, not refused.
- **Hired plant:** what, from which vendor, from and to, and the vendor order it is on (Stage 7 link). The hire's cost is that vendor order's.
- Hours worked by each piece of plant come from the daily record (5).

### 3. Subcontracts and claims (`projects.subcontracts`)
- A **subcontract**: the vendor, what they do, from and to, the vendor order that holds the agreed value, and a retention percentage.
- A **claim** says how far the work is, as a percentage of the whole (cumulative). Someone with the permission certifies a percentage (it may be less than claimed, with a note).
- **Certifying** posts a supplier bill in Books for the difference since the last certificate, on the work's cost centre, to the "subcontract costs" ledger chosen in Configuration; retention is held back with a journal settled against that bill, as Stage 4 does for clients. Certifying is the serious action "Certify a subcontractor's claim".
- Releasing retention at the end is a journal the other way.

### 4. Subcontractor view
- A vendor who signs in sees **Subcontracts** in their portal: each subcontract, its value, what was claimed and certified, and its bills; they make a claim (a percentage, a note, a file) and see snags given to them (7).

### 5. Daily record (`projects.daily`)
- One record a day per piece of work, made for a phone: the weather, who was on site (people on the work, and a count by trade for others), plant and its hours, materials received, work done, delays, visitors, anything that happened.
- **Photos** go into the work's Files, in a "Daily records" folder.
- **Signing** by the lead (or anyone with the permission and the site ability) locks it; a signed record can only be added to with a note.
- A work can be marked "keeps a daily record": its lead is told at 18:00 on a working day with no record.

### 6. Inspections (`projects.inspections`)
- **Inspection kinds** in Configuration: a name and its questions.
- An **inspection** on a work: the kind, where, each question passed, failed or not applicable with a note and a photo, and the inspector's typed name. Each failed answer becomes a snag.

### 7. Snags (`projects.inspections`)
- A **snag**: what, where, a photo, given to someone on the work or a subcontract, by a day. Open → fixed (by whoever it was given to, a subcontractor included) → closed by whoever raised it or an inspector, or opened again.
- A snag can be shared with the client and then shows on the client portal (Stage 9).
- Late snags are told to whoever they are given to, once a day.

## What changes outside Projects

| Where | Change |
|---|---|
| Stock jobs | An optional cost centre on a job (`stock_jobs.cost_centre_id`, script 267); its journals carry it. Nothing else in Stock changes |
| Inventory | "a work" is a holder equipment can be issued to (script 267 widens `inventory_assignments.assignee_type` only if it is a fixed list) |
| Books | Supplier bills and retention journals made by certifying, through Books' own voucher service |
| Vendor portal | A "Subcontracts" page |
| Client portal | Snags shared with the client |

## Data

### Script `267_projects_site.sql` (adds only)

| Table | Holds |
|---|---|
| `project_site` | Per work: its usual branch, whether it keeps a daily record |
| `project_material_plans`, `project_material_requests` | Planned materials, and materials asked for |
| `project_stock_jobs` | The Stock job of a work at each branch |
| `project_plant_bookings`, `project_plant_hires` | Bookings of owned plant, hired plant |
| `project_subcontracts`, `project_sub_claims` | Subcontracts, claims and certificates (percentages; the bills are vouchers) |
| `project_daily_records`, `project_daily_lines` | Daily records and their lines |
| `project_inspection_kinds`, `project_inspections`, `project_inspection_answers` | Inspection kinds, inspections, answers |
| `project_snags` | Snags |

## Builds

| Build | Contents |
|---|---|
| 10.1 | Script 267, the Site tab, materials through Stock jobs |
| 10.2 | Plant: issue and return through Inventory, bookings, hired plant |
| 10.3 | Subcontracts, claims, certifying into Books, retention |
| 10.4 | The subcontractor view in the vendor portal |
| 10.5 | The daily record on a phone |
| 10.6 | Inspection kinds and inspections |
| 10.7 | Snags, on the portals too |

Every build runs the Projects tests and the Projects browser checks.

## Four choices (taken as recommended; say if any should change)

1. **Materials:** issued through Stock jobs, so stock and the books move and the cost lands on the work. The other way: Projects only records quantities and Stock is moved by hand.
2. **Plant:** owned plant is Inventory equipment issued to the work, with bookings ahead and clash warnings; hired plant is a vendor order. The other way: a separate plant list kept only in Projects.
3. **Subcontract claims:** cumulative percentages of the vendor order; certifying posts the supplier bill and retention in Books, as a serious action. The other way: Projects keeps the claims and the bills are entered in Books by hand.
4. **Daily record:** one per work per day, made for a phone, locked when signed, photos into Files. The other way: free diary notes with no signing.

## As built

### To run

1. `backend/database/sql/267_projects_site.sql` (after 266). Fourteen tables, a "site" ability for the Lead and Members, one inspection kind to start with, an optional cost centre on Stock jobs, and (only if Inventory's holder column is a fixed list) that column widened so a work can hold equipment. Adds only.
2. No permission seed.

### 10.1 Materials (done)

Screen: `docs/screens/projects-materials.png`.

- **Site tab** on each piece of work, for anyone with a site permission or Stock management; it opens on Materials (named in the industry's words).
- **Planned materials:** a product (found by name, SKU or barcode) and how much the work needs in all. Quantities only.
- **Asking** (`projects.materials` and a project role that works the site): how much, from which branch, by when, a note. Whoever holds both `stock.manage` and `projects.materials` is told; the branch asked from becomes the work's usual one.
- **Issuing and returning** need `projects.materials` and `stock.manage`. Whoever keeps the store need not be on the work, except confidential work. Issuing goes through Stock's own job service: one job for the work at each branch, opened by itself with the work's name and **on the work's cost centre**, so the Work in progress journals land on the work. Stock's refusals (not enough at the branch, no ledgers chosen) come back in its own words. A request can be issued in parts.
- **Closing the work** completes its open jobs (the cost moves to Cost of services). If Books refuses, the work still closes, the refusal is logged, and whoever closed it is told to complete the job in Stock.
- **What is shown:** per material, planned, still waiting, issued (with % of planned) and, for those who see money, the cost read from Stock's job lines. Projects stores no cost.
- **My Work** lists "Materials to issue" across the works for whoever keeps the store.
- **Outside Projects:** a Stock job can carry a cost centre (`stock_jobs.cost_centre_id`), which its journals then carry; a job without one is as before.
- **Also fixed:** the Roles page now lists the "files" ability (Stage 9), so saving a role no longer drops it, and the new "site" ability.
- **Routes:** `GET /projects/{project}/materials`; `POST …/materials/plan`, `…/materials/requests`, `…/materials/requests/{req}/close`, `…/materials/issue`, `…/materials/lines/{line}/return`; `GET /projects/materials/find`, `GET /projects/materials/waiting`.
- **Tests:** `tests/Feature/ProjectsMaterialsTest.php` (3, one of them on Stock's journal carrying the cost centre). Browser check `e2e/projects-site-ui.mjs` (6 checks).

### 10.2 Plant (done)

Screen: `docs/screens/projects-plant.png`.

- **On the work:** equipment from the asset register (Inventory) that the work holds now. **Issuing** and **returning** need `projects.plant`, a project role that works the site, and `inventory.manage`; they go through Inventory's own issue and return, with the work as the holder ("project", the work's number and name), so the register always says where a piece is. A piece with a serial number is chosen by its tag (pieces that are out cannot be chosen); bulk items by how many. Back-by day and condition going out; condition coming back. Inventory's refusals come back in plain words ("That piece is not free", "Not that many are free").
- **Bookings ahead** (`projects.plant`): equipment, optionally the exact piece, from a day to a day. An overlap with another work's booking, or the piece being out elsewhere now, is shown as a warning on the booking; it is never refused.
- **Hired plant** (`projects.plant`): what, the vendor and its vendor order (the vendor comes from the order when only the order is chosen; an order with another vendor is refused), on hire from, off hire on a day, or cancelled. Its cost is the vendor order's.
- The daily record (10.5) will offer what is on the work and on hire that day for its plant hours.
- **Routes:** `GET /projects/{project}/plant`; `POST …/plant/bookings`, `…/plant/bookings/{booking}/cancel`, `…/plant/issue`, `…/plant/held/{assignment}/return`, `…/plant/hires`, `…/plant/hires/{hire}/off`; `GET /projects/plant/find`, `GET /projects/vendors/find`.
- **Tests:** `tests/Feature/ProjectsPlantTest.php` (3). Browser check `e2e/projects-site-ui.mjs` (now 11 checks).

### 10.3 Subcontracts and claims (done)

Screen: `docs/screens/projects-subcontracts.png`.

- **A subcontract** (`projects.subcontracts` and a project role that works the site): the subcontractor (a vendor), what for, what they do, from and to, the **vendor order that holds the agreed value** (it must be that vendor's, not cancelled, and in the company's currency), and retention (0–50%). The value is the order's total before tax, read each time. Once a claim is certified, the order and retention stay as they are.
- **A claim** says how far the whole work is (cumulative %, above what is certified so far, at most 100), up to a day, with a note. One claim waits at a time.
- **Certifying** a claim at a percentage, no more than claimed (a reason is asked when it is less), posts in Books:
  - a **purchase invoice** from the subcontractor for the difference since the last certificate (value × (now − before)), on the work's cost centre, to the "subcontract costs" ledger, the supplier's own ledger made for the vendor when it has none;
  - a **retention journal** for the subcontract's % of that bill (debit the supplier, credit the "retention" ledger), **settled against the bill**, so the bill's open amount drops by it.
  Both happen in one step or not at all. Certifying is the serious action **"Certify a subcontractor's claim or release their retention"** (nothing out of the box; confirming who you are is the suggestion).
- **Not certified:** with a reason, which the subcontractor sees.
- **Releasing retention** once the subcontract is marked complete or ended: one journal the other way, from the ledger it was held in back to the supplier's account; once only. Also the serious action.
- **Amounts** (value, certified, held, bills) show only to those who see the work's money; others see percentages.
- **Configuration → Site:** the ledger subcontract costs go to (expense) and the ledger retention is held in (liability). Certifying refuses until they are chosen.
- **Outside Projects:** Books lets a journal settle an open **purchase** invoice when it debits that supplier for at least the amount, the mirror of the existing sales write-off. Nothing else in Books changed.
- **Routes:** `GET`, `POST /projects/{project}/subcontracts`; `PUT …/subcontracts/{sub}`; `POST …/subcontracts/{sub}/claims`, `…/subcontracts/{sub}/release`, `…/claims/{claim}/certify`, `…/claims/{claim}/reject`; `GET`, `PUT /projects/configuration/site`.
- **Tests:** `tests/Feature/ProjectsSubcontractsTest.php` (3; Books stood in); the serious-actions test now counts 19. Browser check `e2e/projects-site-ui.mjs` (now 15 checks). The purchase write-off in Books is on the hand-check list, since no test runs the full Books voucher service.

### 10.4 The subcontractor's view (done)

Screen: `docs/screens/projects-vendor-subcontracts.png`.

- **Vendor portal → Subcontracts** (`/vendor-portal/subcontracts`, a card on the vendor dashboard while Projects is on): a vendor signed in sees each of their subcontracts across the works: the work, the vendor order, retention, what is certified of the agreed value, what is held back (and whether it was released), and each claim with the answer and our bill's number and amount. Never another vendor's, nothing else about the work. A suspended vendor account is refused.
- **Making a claim** there: how far the whole work is (%), up to a day, a note and a file (kept in the work's files). Whoever works the site with `projects.subcontracts` is told, with a link to certify it. When a claim is certified, not certified, or retention is released, the subcontractor is told.
- **Routes:** `GET /vendor-portal/subcontracts`, `POST /vendor-portal/subcontracts/{sub}/claims`.
- **Tests:** `tests/Feature/ProjectsSubcontractsTest.php` (now 4). Browser check `e2e/projects-vendor-ui.mjs` (3 checks).
