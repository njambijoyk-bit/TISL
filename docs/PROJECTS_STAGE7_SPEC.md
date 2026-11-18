# Projects Stage 7: Linking modules (being built)

Status: the owner said "build" on 2026-11-18 straight after Stage 6, without a separate design review, so the four choices at the end are taken as recommended (as in every stage so far). Any of them can still be changed; say which. What is built so far is listed under "As built".

Stage 1 built the registry (`ProjectLinkTypes`) with two kinds of record: Books vouchers and Events. Stage 7 makes it the way every module meets Projects: more modules register, links say what they are to the work, a module's own pages show which work a record is part of, a record can be started from the work, and taking a link off can be undone.

Size: medium. Five builds, one script, no new permissions (`projects.links` and each module's own view permission, as in Stage 1).

## The rules this stage keeps

1. **Each module registers for itself.** Projects never names another module's tables. A module that is not licensed, switched on, or that the person may not see is simply not there for them; its links are kept and come back.
2. **Nothing is copied.** A link holds the record's id. Titles, states and amounts are read from the module every time they are shown. Projects keeps no amounts (rule from Stage 1).
3. **Three checks every time** (Stage 1): the module is on, the person holds that module's permission, and they may open the work.

## In this stage

### 1. The registry, grown
- A link type can now also say: its **states** (so a link shows the record's state as a named status, never a colour), how to **start a new one** from the work (the module's own form, filled in), and whether it **counts as the agreed value** (quotations and sales orders, as in Stage 1).
- **What a link is to the work:** each link has a role, from a short company list in Configuration (out of the box: "Agreed value", "Supplier", "Deliverable", "Related"), and an optional note.
- **Links tab:** grouped by module, filters by module and role, the record's live state, counts on the Overview.
- **Taking a link off** puts it in the work's trash (owner's choice 4); restoring puts it back. The record itself is never touched.
- Every add, change, remove and restore is in the log.

### 2. Core records
Registered from Core (no licence needed), each behind its own permission:

| Record | Seen with |
|---|---|
| Support ticket | `tickets.manage` |
| Booking (a resource booked) | the bookings permission |
| Product or service | `catalogue.view` |
| Vendor, and a vendor's order | `vendors.view` |
| Tender | `tenders.view` |
| Customer quotation request | `quotes.view` |

### 3. Paid modules
Each registers when its module is licensed and on:

| Module | Records |
|---|---|
| E-commerce | Shop orders (already through vouchers), promotions |
| Events | Events (Stage 1), event bookings (vendors and venues) |
| Campaigns | Campaigns |
| Courses | Course offerings and intakes, a person's enrolment |
| Memberships | A member, a plan |
| Accommodations, Listings, Menus, Careers | Their main record (a reservation, a listing, a catering order, a job opening) where the module has one |

### 4. "Part of" on each module's pages
- A module's own record page shows a small strip: which pieces of work it is part of (only work the person may open; a confidential piece they are not on is never shown, nor counted), with a link to each.
- From the same strip, "Add to a piece of work" (needs `projects.links` and a project role that may link).
- One shared component and one call (`GET /projects/linked`, from Stage 1), so a module adds one line to its page.

### 5. Starting a record from the work
- On the Links tab, "New…" for each type that says how: it opens the module's own form, filled in (the client, the work's name), and on save the new record comes back linked to the work (owner's choice 3). Tickets, bookings, events, quotations and purchase orders first.

## What changes outside Projects

| Where | Change |
|---|---|
| Each module's record page | A "Part of" strip, shown only with Projects on and something to show |
| Each module's create form | Accepts "for this piece of work" and links the record on save |
| `AppServiceProvider` | Each module's registration, as Stage 1 |

## Data

### Script `264_projects_links_more.sql` (Projects, adds only)

| Change | Holds |
|---|---|
| `project_links.role_key` | What the record is to the work (the note column has been there since Stage 1) |
| `project_link_roles` | The company's list of link roles (four to start with) |

Removed links already stay in `project_links` with `deleted_at` (Stage 1); the trash now shows them.

## Builds

| Build | Contents |
|---|---|
| 7.1 | Script 264, registry grown (states, start-new, agreed value), roles and notes, Links tab grouped, counts on the Overview, links in the trash |
| 7.2 | Core records: tickets, bookings, products, stock items, vendors and their orders, tenders, quotation requests |
| 7.3 | Paid modules: campaigns, courses, memberships, event bookings, and the others that have a record |
| 7.4 | "Part of" strip and "Add to a piece of work" on each module's pages |
| 7.5 | Starting a record from the work |

Every build runs the Projects tests and the Projects browser checks.

## Four choices (taken as recommended; say if any should change)

1. **Which modules:** every module that has a record people open (Core and paid), so a piece of work can gather everything about it. The other way: only the list in the plan (e-commerce, events, campaigns, tenders, inventory, tickets, bookings, courses, memberships).
2. **Who sees the "Part of" strip:** anyone who may see the record and may open the work (it shows nothing otherwise). The other way: only people with `projects.use`.
3. **Starting a record from the work:** the module's own form, filled in, and linked on save, so each module's rules stay its own. The other way: a short form inside Projects.
4. **Taking a link off:** to the work's trash, where it can be restored. The other way: gone (the log keeps a line).

## As built

### To run

1. `backend/database/sql/264_projects_links_more.sql` (after 257; adds one column to `project_links` and one table, with four starting roles). Adds only.
2. No permission seed.

### 7.1 The registry grown, roles, putting links back (done)

Screen: `docs/screens/projects-links-roles.png`.

- **What a link is to the work:** each link can carry a role from the company's list (Configuration → Link roles; out of the box Agreed value, Supplier, Deliverable, Related; renamed, shown as a named status, switched off; "Agreed value" cannot be switched off). It is chosen when linking or changed on the link. A quotation or sales order from the books is "Agreed value" on its own, and a purchase or purchase order "Supplier", unless the person picks another.
- **The record's own state** shows on each link (Books: draft, posted, cancelled and the rest), read from the module each time, as a named status.
- **Agreed value:** the amounts of the links marked "Agreed value" are added up at the top of the Links tab, per currency, read from the books now. Nothing is kept in Projects.
- **Filter** the Links tab by role, or "not said what it is".
- **Owner's choice 4:** a link taken off is listed under "Taken off" on the Links tab (who and when) and can be put back. The record itself is never touched.
- **Overview:** "Linked records" with the count, opening the Links tab.
- **Registry:** a link type may now also say its `states`, whether it can be the agreed `value`, a default `role` (or a function of the record), and how to `create` one (used in 7.5). Modules that do not say these work as before.
- **Every change of role or note and every putting back is in the log.**
- **Routes:** `PUT /projects/{project}/links/{link}` (role, note), `POST /projects/{project}/links/{link}/restore`, `GET`, `POST /projects/configuration/link-roles`, `PUT /projects/configuration/link-roles/{role}`.
- **Tests:** three more in `tests/Feature/ProjectsLinksTest.php` (now 11). Browser check `e2e/projects-links-ui.mjs` (now 23 checks).

### 7.2 Core records (done)

- **Registered from Core** (`Links\CoreLinks`), each behind its own permission, each showing its own state:

| Record | Seen with | Usual role | Opens |
|---|---|---|---|
| Support ticket | `tickets.manage` | Related | the ticket |
| Booking | `bookings.manage` | Related | Bookings, on that booking |
| Product or service | `catalogue.view` | Deliverable | the product |
| Vendor | `vendors.view` | Supplier | the vendor's file |
| Vendor order (with its total, read from the order) | `vendors.view` | Supplier | the vendor's file |
| Tender (comes with the Extras module) | `tenders.view` | Related | the tender |
| Quotation request | `quotes.view` | Related | the request |

- **Stock items are products** in TISL, so "Product or service" covers them; there is no separate stock-item link.
- **A supplier's order is never added into the agreed value**, even with an amount: only links marked "Agreed value" are.
- **Nothing new on screen:** the Links tab shows a group for each kind the person may see. Someone without a module's permission is not offered it and is told only how many links they cannot see.
- **One small builder** (`CoreLinks::type`) registers a record over one table in a few lines; the paid modules in 7.3 use it too.
- **Tests:** `tests/Feature/ProjectsCoreLinksTest.php` (2).
