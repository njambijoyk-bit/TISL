# Preorders: the plan (v2, decided)

Status: BUILT (step 7 of `docs/COST_CENTRES_AND_ENTITIES_PLAN.md`; run `database/sql/103_preorders.sql`). See "As built" at the end. v1 of this plan (a separate Preorder voucher type, deposits, advances) is dropped: see "What changed from v1".

## The rule

**Normal selling only sells what physically exists. A preorder is the deliberate exception, and only a Campaign can open it.**
A product never remembers a whole supply workflow. The product only says it is *eligible* (per branch). The campaign says *we are selling this before it is here, on these terms*. Stock stays the source of truth: a preorder is a commitment against future stock, never a negative stock level.

## What a preorder is (decided)

A preorder is an ordinary **Sales Order → Cash Sale (or Invoice) taken in full at checkout, that does not take stock**, carrying a **PRE- reference**.

1. Checkout creates a **Sales Order** numbered from its own series *Preorder* (`PRE-00001`). It is flagged as a preorder (`meta.preorder`) and listed in `preorder_lines` (which offer and which promised date, per variant).
2. The customer pays in full (any existing way: M-Pesa, gift voucher, an offered ledger confirmed by staff). When the order becomes a **Cash Sale** (or an **Invoice** for a customer on credit terms, staff-made only), the sale is made **without moving stock** (`moves_stock = false`), exactly like today's "stock pending" sale. The sale's reference is the PRE number.
3. **Delivery notes** are made from the sale, in parts, as stock arrives. That moves the stock and posts the cost of goods at that moment (existing behaviour: `delivered_quantity` per line, cost from the batches that go out).
4. Everything else already works for these documents (My Orders, registers, customer stats, exports, dashboard): no new voucher type and no change in the ~35 places that look at sales orders.

### Money (decided)
- Full payment at checkout by default. **Deposits are now an option per offer** (see "Deposits" under As built); advances and instalments are still not offered.
- **Revenue and VAT are recognised when the customer pays. Cost of goods at delivery.** So in a month with undelivered preorders profit looks higher than it will be. The books show a computed **"Paid, not yet delivered"** figure (value of undelivered preorder lines) so it is visible.
- Branch figures: income lands on the order's branch cost centre at sale, the cost on the same branch at delivery.
- Price is fixed at sale.
- Credit-terms customers: an Invoice without payment, only when staff make it, never at online checkout.
- Cancellation (v1): manual. A manager issues a credit note for the undelivered lines and refunds; no stock returns because none left. Customer self-cancel in My Orders comes later.

### Counter staff (decided)
Staff may take a preorder in the shop from the voucher form: a "Preorder (don't take stock)" switch tied to an offer, same PRE numbering, same rules.

## Decisions (kept from v1)

| # | Decision |
|---|---|
| 1 | Preorder is campaign-only. No always-on preorder button on normal product pages. |
| 2 | Eligibility is a yes/no **per variant per branch** ("can be pre-ordered at this branch"), beside the branch stock row (`variant_location_stock.preorder_enabled`). Only branches that sell to customers. |
| 3 | Offers are **per variant**, belong to a campaign, with a limit, optional earlier closing date, expected dates and terms text. Services are not preordered. |
| 4 | Preorder items **check out on their own** by default. The cart groups "Ready now" and "Preorder", each with its own checkout button. A mixed checkout was added later (see "Mixed cart" below). |
| 5 | Partial stock: a branch with 3 left and a customer wanting 5 buys 3 normally; the rest is a separate preorder line (only if the branch has preorder on and an offer is open). Otherwise the quantity is capped. |
| 6 | The Campaigns licence/module gates **new offers and new preorders only**. Preorders already taken stay fulfilable if the licence lapses. |
| 7 | Reservation is **per branch**: the order's branch is the branch whose stock fills it. |
| 8 | Customers outside the offer's audience see **"Coming soon"** (the campaign item's `available_from`). With no offer: plain "Out of Stock". |
| 9 | The offer inherits the campaign's dates, audience and early access. |
| 10 | Hampers need no flag: a hamper offer is allowed only when every component is in stock at the branch or preorderable there. (Built after v1: see "As built".) |
| 11 | Single-branch shops stay simple: no branch choices shown anywhere in this feature. |
| 12 | Limit per offer: one total for all branches. |

## Objects

```
variant at a branch --- preorder_enabled (small flag)
Campaign ------------- Preorder Offer (variant, limit, closes_at?, expected dates, terms)
Customer ------------- Sales Order PRE-… (meta.preorder) -> Cash Sale / Invoice (no stock) -> Delivery notes (in parts)
Supply --------------- open purchase order lines, stock in transit to the branch
Fulfilment ----------- "Preorders waiting" screen -> delivery notes
```

Storage (script `103_preorders.sql`):
- `variant_location_stock.preorder_enabled`.
- `preorder_offers`: campaign_id, variant_id, product_id, limit_total, closes_at, expected_from, expected_until, terms, is_active.
- `preorder_lines`: voucher_id (the Sales Order), offer_id, variant_id, location_id, promised_date. One row per offer per order. The order's own lines carry quantity and money.
- A number series *Preorder* (`PRE-`) on the Sales Order type, not the default.
- No "committed", "allocated" or "reserved" number is stored: all are computed.

### Computed figures
- **Taken (for the limit)** of an offer: quantity on its orders' lines that are not cancelled.
- **Committed** per variant and branch (what normal selling must not touch): on live preorder Sales Orders, `quantity − max(invoiced, delivered)` per line; plus on their live sales/cash sales made without stock, `quantity − delivered` per line. Never below zero per line.
- **Buyable now** at a branch = physical stock − committed, never below zero. 200 arrive against 320 preorders: buyable stays 0 and the page keeps saying Preorder until the offer closes or the preorders are filled; any surplus becomes normal stock by itself.

## Storefront, per variant at the customer's branch

| Buyable now | Offer open, branch flag on, customer allowed | Shows |
|---|---|---|
| more than 0 | any | Add to Cart (quantity capped; the rest can be added as a preorder line) |
| 0 | yes | **Preorder**, expected date, places left |
| 0 | offer exists, customer not yet in the audience | **Coming soon** |
| 0 | no offer | Out of Stock |

## Checkout (server side, never trust the browser)

Campaigns licence and module on; offer open; variant flag on at that branch; audience allows this customer (early access counts); limit available **with the offer row locked** so two customers cannot take the last place; the order is created through an offer only. Cancelling an order frees its places (the count is computed).

## Fulfilment: "Preorders waiting"

Lists open preorder lines by item, oldest first, with a supply panel for the order's branch: stock now; stock in transit **to** the branch; stock at other branches that could be sent; planned supply (open purchase order lines). Actions: make delivery notes for what is ready (in parts, oldest first), **Send N to Shop A** (an ordinary stock transfer with the quantity filled in). A "Paid, not yet delivered" total sits on the screen and in the books.

## What changed from v1
- No Preorder voucher type; no "customer order types" helper; no new voucher numbering beyond one series.
- No deposits, advances, instalments, or VAT-on-advance question: full payment, revenue at payment.
- Accounting section closed (above).

## Phases
1. Database script 103; backend service; the convert rule; admin and public APIs.
2. Admin screens: offers on a campaign's products, branch flag, Preorders waiting, counter-staff switch.
3. Storefront: Preorder and Coming soon states, separate preorder checkout.
4. Later: link an offer to a purchase order, delay notices, a preorder dashboard, customer self-cancel, mixed-cart checkout, per-customer maximum, shipping for preorders arriving on different days.

## As built

- **Script 103**: `variant_location_stock.preorder_enabled`, `preorder_offers`, `preorder_lines`, the *Preorder* (`PRE-`) series on the Sales Order type. Both tables are in the Campaigns module's backup map.
- **PreorderService** (`app/Services/Preorders`): offers, the branch switch, `taken` / `committed` / `buyable` (always worked out), `stateFor` (buy, preorder, coming soon, out), `assertPlaceable` (licence, open offer, not in stock, places with the offer rows locked), the waiting list with its supply panel, `deliverReady` (shares branch stock over paid preorders, oldest first, one delivery note per order), `paidNotDelivered`. `CounterPreorder` takes one in the shop.
- **The rules in the books**: `VoucherService::convert` makes the Sales Order a Cash Sale/Invoice **without stock** when the order is a preorder (`meta.preorder`, inherited by what is made from it); delivery notes made from the order tick `delivered_quantity` and move the stock and the cost. A credit note on an undelivered preorder line puts nothing back in stock (only delivered goods return). What is owed on a line = ordered − delivered − credited; the shop's buyable figure (`sellable_quantity`) is now stock minus what is owed, refreshed whenever a preorder or its sale/delivery/credit is made, changed or cancelled.
- **Checkout**: `POST /checkout/place` and `/quote` take `preorder: true` (only preorder items; no account mode); the order is numbered `PRE-…`, the offers are locked and the places counted again inside the transaction.
- **Staff**: Campaign editor → *Preorders* (offers, limits, dates, terms, which branches take them), Orders → *Preorders waiting* (supply panel, deliver what stock allows, send stock from another branch, take a preorder at the counter, paid-not-delivered figure). The same figure shows on Profit & loss.
- **Storefront**: cards and the product page show *Preorder* / *Coming soon* instead of *Out of Stock* (one batched request per page, remembered per branch); a preorder is its own cart line, the cart has *Ready now* and *Preorder* sections each with its own checkout, `/checkout?preorder=1`; My Orders shows delivery progress and the expected date.
- Uses existing permissions: `campaigns.build` (offers), `stock.manage` (branch switch, deliver, send), `stock.view,books.view` (waiting), `books.post` (counter).
- **Hampers** (no new script; works through the components' own offers). A hamper is judged at its own branch from its components: **buy** when every component is in stock; **preorder** when each short component has an open offer, with the branch switch on, in a live campaign that features the hamper; **coming soon** when such an offer opens later; otherwise **out of stock** (`PreorderService::hamperState`). Places left = the fewest of (component places ÷ quantity per hamper); the expected date is the latest of the components'. A new offer may be made on a component of a hamper the campaign features (`featured`). Placing: `assertPlaceable` takes per-line branches; a hamper's components that are already in stock are **set aside with no offer** (`preorder_lines.offer_id = 0`) so nobody else can buy them while the rest arrives; the checkout preorder cart takes products and hampers (not gift vouchers). Delivery notes, Preorders waiting, credit notes and paid-not-delivered work on the component lines as before. Storefront: *Preorder* / *Coming soon* / *Out of stock* on the hamper list and page; campaign editor: each featured hamper lists its parts (in stock / offer / nothing covers it) and offers the form for the uncovered ones (`GET /admin/campaigns/{id}/hamper-readiness`). Not enforced: the normal (non-preorder) checkout does not re-check component stock on the server, the same as plain products.
- **Per-customer maximum** (run `database/sql/107_preorder_max_per_customer.sql`). An offer has an optional `max_per_customer` (never above its total places). Checked in `assertPlaceable` after the offer is locked, against what that buyer already holds under the offer: their orders' lines for it less what was credited back (`PreorderService::heldBy`, worked out, never stored); cancelled orders hold nothing. A signed-in customer is matched by account, a guest by the email on the order (case-insensitive; a signed-in customer's order is never a guest's). A hamper counts through its components, so the cap cannot be got round with hampers. Counter staff may go over it. The storefront shows "Limit N per customer"; the campaign editor sets it on a new offer and changes it later on the offer's card. Before script 107 the field is hidden and nothing is checked.
- **Customer cancel** (no new script). An order not yet paid is cancelled by the customer directly, as any order (this frees its places). A **paid** preorder with **nothing delivered** can be *asked* to cancel from My Orders: that opens a help-desk ticket and records `meta.cancel_request` on the Sales Order; nothing moves until staff decide (`PreorderCancellation`). Orders → Preorders waiting lists the requests: **Cancel and refund** writes one credit note against the sale for everything still owed (goods that never left the shelf put nothing back in stock; charges such as delivery are refunded too) and, for a sale paid at the till, pays the money back from the ledger chosen (the one the sale was paid into is pre-selected); for an invoice on account the note just reduces what is owed. **Decline** needs a reason the customer reads, and they may ask again. Once any of the order has been delivered, no request is possible and the rest is settled by hand with a credit note. The places held are free again because they are worked out from live orders less credits; the order then shows as cancelled to the customer. Uses `books.view` (see) and `books.post` (decide). The refund is a ledger entry: paying it out by M-Pesa or bank is still done outside the system.
- **Linking an offer to purchase orders** (run `database/sql/111_preorder_offer_supply.sql`). On an offer's card in the campaign editor, *Link a purchase order* lists live purchase orders that still have this item to arrive (supplier, how much, due date); an offer can hold up to 6 links. Only a pointer is stored: how much is still to arrive (ordered less received) and when (the **latest due date among the linked purchase orders that still have something to arrive**) are read from the purchase orders (`PreorderSupply`). That date replaces the typed expected date for customers (storefront, My Orders, emails), and "late" is measured against it, so a supplier delay moves the promise in one place. When it moves **later than what the customer was first told**, they get one "new expected date" note per new date (3 at most), before they are late. Once the purchase order is received the original date applies again. The card shows stock coming in and a warning when owed > in stock + on order.
- **Preorder overview** (Orders → *Preorder overview*; `PreorderDashboard`, nothing stored). Figures: offers open, units owed and how many are not covered by stock or stock on order, paid-not-delivered, orders past their date (oldest), cancellations waiting, average time from order to first delivery and cancel rate (last 90 days); a column chart of preorders taken per day (30 days) with a table view; every offer with its fill, owed / in stock / on order, "short by", the date customers are told, and its state (open, full, stopped, closed, scheduled, ended); and the late orders, oldest first.
- **Mixed cart** ("Check out everything together" in the cart, `/checkout?together=1`): one checkout, one payment, **two orders**. `CheckoutService` splits the items by their `preorder` flag, places the ready-now order and the `PRE-` order separately (each with its own delivery and its own delivery fee), and links them through `meta.paired_order_id`. For M-Pesa it makes a single prompt for the combined amount; `GatewayPaymentService::settle` then settles both orders from that one receipt. A promo code applies to the ready-now order only. Not offered together: gift vouchers, paying on account, paying from credit (use separate checkouts). If the preorder side cannot be settled (cancelled or already paid) a note is left on the payment attempt for staff.
  - If the second order can't be settled when the one payment arrives, the first order stays settled and a note is left on the payment attempt (the money is never rolled back).
  - **Check it on the real database:** the books' base tables are not in the repo, so a test can not stand them up. Run `php artisan checkout:selfcheck --customer=<id> --ready=<in-stock product id> --preorder=<product id with an open offer>` (add `--ready-variant`/`--preorder-variant` for products with several variants, `--method` to pick the M-Pesa method). It places both orders for real, pays them with a pretend M-Pesa (no prompt, no messages, no web requests), checks both became sales that add up to the one payment, then **undoes everything**. Order numbers may skip a few.
- Delay notices: built, see `docs/NOTIFICATIONS_PLAN.md`, phase 4. Nothing is left on the "not done" list.

## Deposits (added later; run `database/sql/115_preorder_deposits.sql`)
Decided with the owner: the deposit is a **percentage set per offer**; the balance is paid **either** on delivery (staff collect it) **or** online from My orders; a cancelled order's deposit is **refundable once staff approve**; **signed-in customers only**.
- **Setting:** an offer has an optional `deposit_percent` (1 to 90; empty = full payment, as before), set on the offer's card in the campaign editor. A cart may pay a deposit only when **every** offer it is taken through allows one (a line only set aside from stock has no offer and does not count); the **highest** percentage applies, taken of the whole order total (delivery included). Not for guests, not with a gift voucher or stored credit (the page leaves those out when a deposit is chosen; placing refuses them), not in the mixed cart.
- **How it is booked:** no new voucher type. Paying a deposit places the Sales Order (`PRE-`) as usual, **makes it an Invoice at once** (a preorder takes no stock, so this only records what is owed; due on the latest promised date, else in 30 days), and the M-Pesa prompt is for the **deposit alone, against that invoice**. When M-Pesa confirms, `GatewayPaymentService::settle` receives it on the invoice, so the invoice shows the balance outstanding. The order remembers `meta.deposit {percent, amount, balance}`; where it stands (`paid`, `outstanding`, `stage` deposit|balance|done, `due_next`) is always read from the invoice (`VoucherService::depositState`), never stored.
- **The balance:** from My orders the customer pays the deposit (if it failed) or the balance by M-Pesa (`payOrder` → `CheckoutService::payableNow`; a tick pays everything left at once). Staff can instead collect it on delivery: Orders → Preorders waiting shows **Collect X on delivery** on the line, and the customer's "on its way" message states the balance. Delivery is never blocked by an unpaid balance.
- **Messages:** "we have your preorder" says the deposit due now and the balance; the deposit payment says **Deposit received** with the balance; the final payment says paid; the delivery message mentions what is still to collect.
- **Money figures:** *Paid, not yet delivered* counts only the paid share of a deposit order's undelivered lines.
- **Cancelling:** same flow as before (the customer asks, staff approve). Approving writes **one credit note for the whole invoice**; what the customer had paid (the deposit) is remembered (`cancel_request.deposit_refund`), shown to staff (*paid so far*), and the customer is told their deposit will be refunded. **That money then sits as credit on the customer's account: staff pay it back with a Payment voucher** (the system does not pay it out for you, as it does for a sale paid at the till).
- **Accounting to confirm with your accountant:** a deposit order is **invoiced in full at order time**, so revenue and VAT on the whole order are recognised then (like an invoice taken on credit terms), not only on the deposit received. That is consistent with the VAT time-of-supply rule (earliest of invoice, payment or delivery) but it is the accountant's call; if they want VAT only on money received, the booking has to change before this is switched on for real offers.
- **Check it on the real database:** `php artisan checkout:selfcheck --deposit --customer=<id> --preorder=<product id with an open offer that has a deposit %>` places a deposit order, pays the deposit and then the balance with a pretend M-Pesa, then places a second one and cancels it, checking each step and printing the customer's account balance afterwards; it undoes everything. Tests stand in for the books (invoice, receipt, credit note); those are exactly what this check exercises for real.
