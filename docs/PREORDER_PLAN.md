# Preorders: plan so far (ON HOLD, nothing of the preorder feature itself is built)

Status: planning. Paused so that branches can get their own profit figures first (see the end of this file). What *is* built and that preorders will stand on is listed in "Built already".

## The rule

**Normal selling only sells what physically exists. A preorder is the deliberate exception, and only a Campaign can open it.**
A product never remembers a whole supply workflow (no big JSON blob on products). The product only says it is *eligible*. The campaign says *we are selling this before it is here, on these terms*. Stock stays the source of truth: a preorder is a commitment against future stock, never a negative stock level.

## What the code already does (checked in the code, not assumed)

- A Sales Order voucher moves **no** stock and reserves none. Stock moves when it becomes a delivery note or a sale. A shortage aborts that step ("stock first, a shortage aborts before anything is written"), so what has not arrived cannot be delivered.
- Converting a Sales Order to a delivery note already takes **part** of the quantity (`delivered_quantity` per line, capped at what is left), so preorders can be filled in parts as stock arrives.
- Supplier **purchase orders** already track receipt per line (purchase order, goods received note, purchase). Open purchase order lines are the incoming supply. No separate supply table is needed.
- A paid online checkout today becomes a Cash Sale straight away without moving stock ("stock pending"). That is wrong for preorders (see Accounting).
- Stock is held per variant, per unit and per branch (`variant_location_stock`, batches underneath). Checkout already carries a branch on every order (`vouchers.location_id`).
- The storefront already shows zero-stock products as "Out of Stock" (cards and product page) and has a branch in context (`?location=` or `X-Location`).
- Campaign items are product-level today (`campaign_items`: item_type, item_id, available_from, label_override). Campaigns already have tiers, early access and audience rules (built), and a licence check (`LicenseManager`, `module:campaigns`).
- Backorder was removed from the code on purpose. Preorder is a new thing, not a revival.

## Decisions made

| # | Decision |
|---|---|
| 1 | Preorder is campaign-only. No always-on preorder button on normal product pages. |
| 2 | Eligibility is a yes/no **per variant per branch** ("can be pre-ordered at this branch"), stored beside the branch stock row. Only branches that sell to customers can have it. |
| 3 | Offers are **per variant** (not per product) and polymorphic in shape (`sellable_type`, `sellable_id`, optional variant), like `location_offering`, so later modules (a Course that includes a book) reuse them. Services are not preordered. They can still sit in campaigns. |
| 4 | A new non-posting **Preorder voucher type**, a sibling of Sales Order. It posts nothing and moves no stock. It converts straight to a delivery note, invoice or cash sale (no Sales Order step). |
| 5 | Customer-order code that today checks for `sales_order` (about 35 places) switches to one helper, "customer order types", that includes preorders. |
| 6 | Preorder items **check out on their own**. The cart groups "Ready now" and "Preorder", each with its own checkout button. No mixed-cart checkout in the first version. |
| 7 | Partial stock: a branch with 3 left and a customer wanting 5 lets them buy 3 normally. The rest is added as a separate preorder line (only if the branch has preorder on and an offer is open). Otherwise the quantity is capped at what is there. |
| 8 | The Campaigns licence and module gate **new offers and new preorders only**. Preorders already taken stay fulfilable if the licence lapses. |
| 9 | Reservation is **per branch**. The order's branch is the branch whose stock fills it. |
| 10 | Customers outside the offer's audience see **"Coming soon"** (reusing the campaign item's `available_from`). With no offer the product stays plain "Out of Stock". |
| 11 | The offer inherits the campaign's dates, audience and early access. It only needs its own optional earlier closing date, a limit and an expected date. |
| 12 | Hampers need no flag. A hamper offer is allowed only when every component variant (hamper items already point at a variant) is in stock at that branch or preorderable there. |
| 13 | Single-branch shops stay simple: no branch choices shown anywhere in this feature. |
| 14 | Transfers stay as they are (their own document, in transit, batches intact). A printable transfer note was added. No transfer voucher. |

## Objects

```
variant at a branch --- preorder_enabled (small flag)
Campaign ------------- Preorder Offer (variant, limit, closes_at?, expected date, terms)
Customer ------------- Preorder voucher (campaign, branch; lines carry offer + promised date)
Supply --------------- open purchase order lines, stock in transit to the branch, later production orders
Fulfilment ----------- "Preorders waiting" screen -> delivery notes (in parts)
```

Proposed storage (to be confirmed when the database script is written):
- `variant_location_stock.preorder_enabled` (the per-branch flag; a branch with no row gets a row at quantity 0 when the flag is first set).
- `preorder_offers`: campaign_id, sellable_type, sellable_id, variant_id (nullable), limit, closes_at (nullable), expected_from, expected_until (nullable), terms, status.
- Preorder voucher type and number series (non-posting, like the Memorandum).
- On voucher lines: `preorder_offer_id` and the promised date (a snapshot, so changing the offer later never rewrites history). On the header: campaign_id and the branch.
- No "committed", "allocated" or "reserved" number is stored. All of them are computed from the lines.

## Storefront, per variant at the customer's branch

| Branch stock after reservations | Offer open and customer allowed | Shows |
|---|---|---|
| more than 0 | any | Add to Cart (quantity capped at what is there; the rest can be added as a preorder line) |
| 0 | yes, branch flag on | **Preorder**, expected date, places left |
| 0 | offer exists, customer not yet in the audience | **Coming soon** |
| 0 | no offer | Out of Stock |

Normal availability at a branch = its physical stock minus its undelivered preorders, never below zero. So when 200 units arrive against 320 preorders, normal availability stays 0 and the page keeps saying Preorder until the offer closes or the 320 are filled. Anything left over becomes normal stock by itself.
The stock figure the storefront reads is now the "buyable" figure (shops only, see "Built already"), and preorder reservations come off it per branch.

## Checkout (server side, never trust the browser)

On creating a preorder: Campaigns licence and module on; offer open; variant flag on at that branch; audience rule allows this customer (early access counts); limit available **with the offer row locked** so two customers cannot take the last place; the voucher is created through an offer only. Cancelling an order frees its places automatically (the count is computed).

## Fulfilment

A **Preorders waiting** screen under Orders lists open preorder lines by item, oldest first, with a supply panel for the order's branch:
- stock at that branch now;
- stock in transit **to** that branch (an existing transfer);
- stock at other branches that could be sent;
- planned supply (open purchase order lines; production orders later).

Actions: create delivery notes for what is ready (in parts, oldest first), and **Send N to Shop A** which creates an ordinary transfer with the quantity filled in. Receiving stock for an item with waiting preorders says so on the receipt screen. If an expected date moves, the lines whose promised date differs are listed so customers can be told.

## Hampers

A hamper line on a voucher already carries component lines. Commitments on each component are computed from those child lines. Hamper edition counts keep working as today.

## Accounting (OPEN, needs the accountant)

A preorder voucher posts nothing. Taking money before delivery is a separate decision:
- **Preferred:** take it as a **customer advance** (the system already has customer advances), make the invoice at delivery, settle it from the advance.
- **Quick alternative:** checkout as today (Cash Sale at once, delivery later). That recognises revenue and tax before the goods exist.
- The VAT tax point (earlier of payment, invoice, supply) may move earlier if payment comes first.
- Deposits, refunds on a cancelled preorder, and customer cancellation rules are not decided.
- Shipping for a customer whose preorders arrive on different days (one delivery note per arrival) is not decided.

## Places the new voucher type touches (checked list)

Checkout and the checkout controller, My Orders and order detail, the admin Orders register and its tabs, customer detail (orders list and stats, `OrderSummaryService`), the project order pickers, delivery stop lookup, hamper edition counts, exports, cash count, customer wallet and documents, the Mimi chat assistant, the dashboard "sales orders" counts. All of them should use the "customer order types" helper.

## Built already (preorders depend on these)

- **Location capabilities** (script 97, code pushed): kind plus four capabilities (sells to customers, delivers orders, receives goods, makes things). Customers only see and buy from selling branches. The storefront stock figure counts shops only (`sellable_quantity`). Goods-received, delivery notes and production runs are limited to branches that may do them.
- **Printable transfer note** for stock transfers (HTML and PDF).
- Campaign audiences (campaign, early access, per section).
- Order screens read vouchers, not the retired order tables.

## Phases

1. Database script: Preorder voucher type and series, per-branch flag, offers table, line columns.
2. Backend: the "customer order types" helper; creating preorders only through an offer with the licence check and the locked limit.
3. Campaign editor: the offers section on a campaign's products, with limit and expected date.
4. Storefront: the Preorder and Coming soon states, separate preorder checkout.
5. Preorders waiting screen with the supply panel, partial delivery notes, and the Send N to Shop A button.
6. Later: link an offer to a purchase order, delay notices, a preorder dashboard (capacity, committed, received, ready, waiting).
7. After the accountant decides: advances, deposits, refunds, tax.

## Open questions

1. Accounting for money taken at preorder time (advance or quick), deposits, and the tax point.
2. Customer cancellation: allowed until when, and what is refunded.
3. Limit per offer: one total for all branches (suggested), or per branch.
4. A per-customer maximum per offer?
5. Shipping for preorders that arrive on different days.
6. Whether a branch that already has preorders may switch its flag off (suggest: yes, for new orders only).

## Later (not now)

Backorder as an offer without a campaign (same mechanism), mixed-cart checkout, planned production orders as supply, services as pre-bookings, supply-linked limits ("up to the incoming purchase order quantity").

## On hold because of

The wish to have each branch carry its own figures as a **cost centre** (and, later, separate legal entities for other companies or countries). Preorders are taken and filled per location, so their income and cost should land on the right cost centre from the first day. See `docs/COST_CENTRES_AND_ENTITIES_PLAN.md`. Preorders need only that plan's stage A, not the legal entity layer.
