# POS (point of sale) module — plan

Status: **plan agreed 15 Oct 2026 (the owner's corrections are in). Step 1 is being built.** Tests and mutation checks are done once, after the whole module is built, not after each step (the owner's choice).

## 1. What the owner asked for (✔ = decided)

- ✔ The POS belongs to the **Extras** module (module key `extras`) and only shows when the module is licensed and switched on. The food till stays in **Menus**.
- ✔ A POS checkout for **cashiers**, who have no access to Books, to post **cash sales, invoices, sales orders and credit notes** themselves.
- ✔ 
- ✔ **Stations**: a branch has stations (branch B has station X and station Y). Every document a cashier makes carries its station. A cashier may sell from any station of a branch they work in; when none is chosen, theirs, else the branch default, is used.
- ✔ **Self checkout is separate from staff.** A customer must never be able to reach the admin side.
- ✔ **Self checkout sells for cash only: no invoices, no sales orders, no credit notes.** A cashier's POS can make cash sales and invoices (and sales orders). **A credit note, to return items, needs a supervisor PIN on both**, however small.
- ✔ The **Access → People** tab gets a station choice, a read-only clearance, main and extra role dropdowns with Save and an "unsaved changes" label (§12).
- ✔ eTIMS is built later, **in Books**, not in a separate module (§8).
- ✔ A cash sale prints **two copies** (customer and store). Paper is chosen **per branch** from: A4, POS 110 mm, POS 85 mm, POS 80 mm, POS 58 mm.
- ✔ **Shifts and cash-up** from version 1.
- ✔ **Online first.** Offline selling comes later (the design below leaves room for it).
- Open: KRA eTIMS (§8).

## 2. The one idea

The POS is a **door in front of Books**, not a copy of it. A cashier holds `pos.*` permissions and no `books.*`. The POS service checks `pos.*`, the station, the branch and the limits, and then calls the same posting code Books uses (`VoucherService`: preview, placeOrder, convert, receive, createReturn). The cashier is recorded as the person who made each document. Nothing in the ledger is posted a second way.

## 3. Stations

Table `pos_stations`: `location_id`, `name`, `code`, `kind` (`staff` | `self_checkout`), `is_default` (one per branch), `is_active`, `paper` (overrides the branch's), `token_hash` (self checkout only), `last_seen_at`. A station is **not a stock location**: stock still moves at the branch; the station is a tag. Vouchers get `station_id` and `shift_id`.

- Choosing a station: the cashier's own default (`pos_user_stations`), else the branch default; the till remembers the last one per browser and shows it in the corner.
- A cashier may use any active **staff** station of a branch inside their branch scope (the same scope rules as every other module).
- A station can be switched off; sales already made keep it.

## 4. Self checkout (kind `self_checkout`)

Built the way the Menus kiosk is, **not** as a restricted staff login:

- It has a secret address (`/pos/self/<token>`); the token is stored hashed and can be renewed (which ends the old one at once).
- It reaches **only** `/api/pos/self/*`: build a basket from the catalogue, pay (M-Pesa or card through the existing gateways), see the receipt. There is no staff token, no admin route, no customer account needed.
- It makes **cash sales only** (paid at the screen by M-Pesa or card, or at a staff counter with cash) and takes payment. It **cannot**: give discounts, make invoices or sales orders, make credit notes, open a shift, or print a store copy. Anything else is "call a supervisor". A return at a self-checkout station is only started by a supervisor with their PIN.
- A supervisor can step in at the screen with their PIN (§6): to clear a stuck basket, void a line, or approve an age or price check. Every use is logged with the supervisor's name.
- Its own rate limits per station and per address; a station that has not been seen for a while shows as offline in the Stations screen.

## 5. Permissions (new group `pos`, nothing from `books.*`)

| Permission | What it allows |
|---|---|
| `pos.view` | open the POS, see the catalogue and own sales |
| `pos.sell` | cash sale (paid at once, one or several payments) |
| `pos.invoice` | invoice a customer on credit (credit limit is checked) |
| `pos.order` | sales order, with or without a deposit |
| `pos.return` | **start** a credit note (always completed with a supervisor PIN) |
| `pos.discount` | give a discount, up to the role's approval limit |
| `pos.void` | remove a line or void an open sale |
| `pos.reprint` | print a copy again (marked COPY) |
| `pos.shift` | open and close their own shift |
| `pos.supervise` | holds a PIN that approves returns, big discounts and voids; sees every shift |
| `pos.manage` | stations, branch paper sizes, PINs, reports |

The cashier role gets `admin.access`, `pos.view`, `pos.sell`, `pos.invoice`, `pos.order`, `pos.return`, `pos.discount`, `pos.void`, `pos.reprint`, `pos.shift` (a one-time grant on the catalogue version bump, like the other new permissions; an admin can take any away). A supervisor role is a role like any other, made in the role builder. Discount limits use the existing role approvals (`max_amount`).

## 6. Supervisor PIN

`pos_pins`: one PIN per user holding `pos.supervise`, stored hashed, 6 digits, set by the person themselves; locks for 15 minutes after 5 wrong tries (per user and per station); every use is written to the security log (who, which station, for what, the document). **Every credit note needs a PIN, whoever starts it and however small** (✔ both at the cashier's POS and at self checkout). A credit note can only be made against a document the POS can find (by number or receipt scan), for lines and quantities still available, and is posted through `createReturn`, so Books' own checks apply. A supervisor cannot approve their own return.

## 7. The sale, shifts and printing

**The screen** (from the two pictures): search or scan a barcode, the sale list (quantity, discount, amount), number pad, customer, hold and recall a sale, sub total, discount, tax, grand total; Checkout opens the payment screen (cash, M-Pesa, card, gift card, points, several at once, change due), customer, discount, split, promo.

**Posting.** Each sale carries a client-made **idempotency key**, so a double tap, a retry, or (later) an offline replay can never post twice. The total shown is always the one `preview` returns.

**Shifts.** A cashier opens a shift at a station with an opening float; every document they make belongs to it. Closing counts the drawer by payment type and records the difference. X report (any time, shift still open) and Z report (at close): sales by tender, discounts, voids, returns, expected cash, counted cash, variance. A supervisor can close another person's shift. No shift, no selling (a setting per branch).

**Printing.** A cash sale prints **two copies**: customer copy and **STORE COPY**; a reprint says COPY. Sizes: A4 (PDF through the existing dompdf), 110 mm, 85 mm, 80 mm, 58 mm (text receipts, character width worked out from the roll). The branch sets its **default** and the **list it offers**; the cashier picks from the list at print time; a station may override the default. Receipt content: company name and address, tax PIN, branch and station, cashier, document number, lines, tax, tenders and change, a QR for the receipt (so a return can be started by scanning it).

## 8. KRA eTIMS — later, in Books

✔ Decided: eTIMS is built later as part of **Books** (every posted sale and credit note, from the POS or anywhere else, goes through it), not in the POS. The POS only keeps the groundwork below. What it takes:

I cannot check KRA's current technical specification from here, so this is the shape of the work, to be confirmed against the document KRA gives us:

- **Needed from the owner:** the taxpayer's PIN, each branch registered with KRA, and the eTIMS (OSCU or VSCU) credentials and sandbox access for the integration.
- **Needed in the system:** every sale and every credit note sent to KRA when it is made, and the fiscal fields KRA returns (control unit number, invoice number, signature, QR) stored on the document and printed on the receipt; the items registered with KRA codes (item and unit classification); a **retry queue**, because a sale must not be lost because KRA's service is down; and a clear state on every document (sent, waiting, failed).
- **Plan:** **now**, give every document a `fiscal_status` and room on the receipt for fiscal fields, so nothing has to be redesigned later (cheap). **Later**, inside Books, built once we have KRA's specification and sandbox credentials, with its own plan, tests and a certification pass.

## 9. Not in the first cut

Offline selling (the idempotency key and a per-sale client id are the groundwork); loyalty earning at the POS beyond what Books already does; restaurant tabs (they stay in Menus); a customer-facing second screen; hardware drivers (cash drawer kick, scale, card terminal): the browser prints and the drawer opens from the printer.

## 10. Build steps (each: built, tested, mutation-checked, committed, pushed; the owner says "go" for the next)

1. **Foundation.** Script `169_pos.sql` (`pos_stations`, `pos_user_stations`, `pos_settings`, `station_id` and `shift_id` on vouchers, registered in `ModuleTables`); permissions `pos.*` and the cashier's grant; the POS lives in the existing `extras` module (no new licence key; its screens and routes use `module:extras`); `StationService`; admin screen Stations and branch paper settings.
2. **Checkout.** Catalogue search and barcode, cart, cash sale (several tenders, change), hold and recall, the idempotency key; the POS screen.
3. **Invoice and sales order** from the POS (customer, credit limit, deposit).
4. **Supervisor PIN, returns and credit notes**, discounts and voids over the limit.
5. **Printing**: two copies, the five paper sizes, reprint.
6. **Shifts and cash-up**, X and Z reports.
7. **Self checkout**: station token, `/pos/self/*`, payments, supervisor assist.
8. **Menus till permission**: `menus.till` (run the food till and floor without `menus.manage`, no recipe costs) so a cashier or waiter can use the food till too. Stays in Menus.
9. **Tests and mutation checks** for the whole module, once everything above is built.
10. Later: eTIMS (in Books, own plan), offline.

## 11. Decided (was open)

Every credit note needs a PIN; the food till stays in Menus (`menus.till` stays in step 8); eTIMS groundwork now, the integration later in Books.

## 12. Access → People tab (changes made in step 1)

On `/admin/access?tab=people`, in the side panel of the person:

- **Stations.** When the main role (or any extra role) holds a `pos.*` permission, a **Stations** choice appears: their default station and the other stations they may use (taken from the stations of the branches they are scoped to). Saved with the rest.
- **Clearance** is shown, **read only**: it is worked out from the roles (the highest of the person's own level and the main role's), so nobody types it here.
- **Main role** and **Extra roles** are dropdowns. Changing either marks the panel with an **"Unsaved changes"** label and the button reads **Save changes** (it is greyed out when nothing changed); leaving without saving asks first.
