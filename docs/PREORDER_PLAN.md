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
- Full payment at checkout. No deposits, advances or instalments for preorders.
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
| 4 | Preorder items **check out on their own**. The cart groups "Ready now" and "Preorder", each with its own checkout button. No mixed cart in v1. |
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
- Not done (later): customer self-cancel, mixed cart, per-customer maximum, linking an offer to a purchase order, delay notices, preorder dashboard.
