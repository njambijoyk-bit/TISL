# Menus: recipes, sides, servings and dishes (the design the owner and I settled; nothing here is built except where it says so)

Ingredients, kinds, stock, purchases, counts, transfers, waste and the stock reports are done and tested (see `MENUS_STOCK_PLAN.md`). This is the next part: how food is made, cut into servings, put into dishes, packed and paid for.

## 1. Words (the owner's)
| Word | Meaning |
|---|---|
| **Ingredients** | Done. What is bought and shelved. Kinds say what each may be used for. |
| **Recipes** | A method that makes a batch. Lines are ingredients **or other recipes** (tomato-onion-garlic base used by stew and pilau). Steps with minutes. A made-to-order recipe is made when sold; a made-ahead recipe is made in batches. |
| **Servings** | The size table: Jumbo, Medium, Kids... in the database. A restaurant may have none. |
| **Sides** | What is served: ugali, pilau, kale, cabbage, nyama choma, wet fry. A side points to a recipe, or to a ready-to-serve ingredient (a soda). |
| **Dishes** | What is sold, built from sides. |
| **Menus** | Only groupings (a kids' menu is a menu holding kids' dishes). |

No double-entry kitchen ledger. Quantities are single-entry movements on lots (as built); value is double-entry in the books. A dish never contains another dish: sides are the pool, and "sell this side alone" makes a one-side dish (fries as an accompaniment and as a dish of their own).

## 2. Recipes and batches
- A recipe is written once; duration depends on the batch, so it holds **expected minutes by batch size** (rows: up to 1 kg 15 min, up to 2 kg 20 min).
- A **production record** for each batch: chef, start and finish, actual inputs (2 kg flour), actual output (2.5 kg ugali), optional **servings cut** (2 Jumbo, 2 Medium, 1 Kids; a small structured column). Reports compare chefs: servings per kilogram, minutes per kilogram.
- **Prepared stock is counted in weight, volume or count** (the recipe's yield unit; a ladle can be a defined unit). Each sale takes its serving's amount off it. Pre-portioned stock (cake slices, chicken pieces) is allowed per recipe; weight is the default.
- Batch timers belong to the production screen ("simmer 90 min, ready 12:40"). The order ticket timer is the serving's own short task (plating, reheating), against the station target.
- Variance (expected against made, and against a count) is recorded, shown, never silently deleted. Daily reconciliation per prepared item is a report: opening + made - served - waste +/- count = variance. No approval step, no sign-off.

## 3. Servings (sizes) and who a dish is for
- Each side gives an **amount per serving** (stew: Jumbo 350 g, Medium 250 g, Kids 100 g). A side with no amounts is 1 (a soda).
- A dish lists which servings it offers and the **price for each**. Price is the dish's, not the sum of the parts.
- **Audience** (Adults, Kids, empty) is a small configurable list on the dish; a kids' menu is just a menu.

## 4. What a dish is made of (slots) and what shows on the order
| On the order | Example | Comes from | Price |
|---|---|---|---|
| Side | White bread under the steak, egg and cheese | The dish's slots: fixed, choose one (choma or wet fry, each with a price), choose any or all (kale, cabbage or both) | Inside the dish, or an upcharge on a choice |
| Modifier | Remove mayo, remove egg | Recipe line "may be removed" + the dish's price policy | Free or a fee |
| Paid extra | Another scoop of rice | A paid extra on the dish, added to the open order later | Its own line, takes stock |
| Packaging | Container, bag | Packaging rules | See 6 |
| Separate line | A soda | Its own item or dish | Its own price and station |

A side shows indented under its dish on receipts and kitchen tickets. Rule of thumb: part of what the dish is and sharing its price = a side; can be sold alone = a separate line. Dish creation is a short guided flow: name and price and servings; what is in it (pick sides, or create a side and its recipe on the spot); what comes with it; modifiers; packaging and free condiments.

**Modifiers.** On the recipe line: "the customer may remove this" (and "may add extra"), only on made-to-order recipes (a cooked pot cannot lose its beef). On the dish: a **price policy** for each removable or extra item: free, a fixed fee, or a **percentage of the dish price at the chosen serving**. Configuration holds a few named policies and a default (free). A removal that is charged prints as its own indented line; a removed item is not used from stock.

## 5. Accounting
| Moment | Entry |
|---|---|
| Making a batch | Dr **Prepared Food Inventory** (one Menus setting, seeded), Cr ingredient inventory by kind |
| Selling a made-ahead dish | Dr cash or customer, Cr sales and VAT; Dr cost of food, Cr Prepared Food Inventory |
| Selling a made-to-order dish | Dr cost of food, Cr ingredient inventory by kind (as built) |
| Waste or a count shortfall of prepared food | Dr waste, Cr Prepared Food Inventory |
Stock leaves ingredients when the batch is made, and leaves prepared stock when the dish is sold. The order line keeps which sides, servings and amounts were sold, so a void or refund returns exactly that.

## 6. Takeaway packaging and free condiments
- Menus configuration names **one ingredient kind as the packaging kind**.
- A **packaging price list** table holds, for each item of that kind: the ingredient item, its price (per single unit, not per pack), its **currency** (default the Menus currency) and a **sales account** (empty: the Menus sales account, else the Books default). If the packaging kind changes, or an item moves to another kind, its rows stay but go **grey and read-only** until that kind is the packaging kind again. Only one packaging kind at a time.
- A **packaging rule** (on a side, a dish may override): the item, the scope (**per dish**: multiplies by quantity, or **per order**: once for the whole order; the largest per-order quantity wins, not the sum), the quantity, whether it is **compulsory**, free or charged (charged = priced from the list), and the receipt switch: **Auto** (shown if charged), Always, Never.
- At checkout a list of packaging lines is prefilled from the rules (only where a rule says so), editable: change the count, swap the item, add any packaging item by name or code, or remove a line (the customer brought their own sufuria; an optional reason is asked and kept for feedback, for example to move to eco-friendly packaging). The packers see the list on the ticket even when it is hidden from the customer.
- **Waiving**: only a line that is both **compulsory and priced** needs a permission (a new one) to waive or remove; compulsory and free, optional and priced, and optional and free can be removed freely. A waived charge is logged like a discount. Prices come from the list: a waitress changes counts, not prices.
- A charged line is a sale (its sales account, VAT); a free line is only a cost (Kitchen Supplies Used) when the stock goes.
- **Free condiments** (fries: 2 ketchup, 1 mayonnaise) are an allowance on the dish. Checkout shows the allowance; giving a different count shows a **warning, not a block**. Stock follows what was actually given.

## 7. Tips
- Checkout has a **tip box of its own**, so change is exact: bill 5,600, tendered 6,000, tip 200, change 200 (no tip typed: change 400). A tip cannot exceed tendered minus bill.
- At payment: Dr cash (what was kept), Cr sales, Cr **tips payable** (a Menus setting; empty: the Books default). The narration names customer, voucher number, kiosk and server. A pending tip row is made.
- **Tips screen** (Today, Pending): **Issue** a tip when the money is handed over: Dr tips payable, Cr cash or bank, with an optional narration (required when issuing your own). Permissions (data in the catalogue): view tips; issue tips to others; issue my own tip.
- **When tips may be issued** (setting): anytime, every day between two times, chosen days between two times, or never (held).
- **No double journal**: Issue locks the tip row, checks it is still pending, and in one transaction posts the journal, stores its id on the tip and marks it issued. A failed journal leaves nothing saved; a retry after a timeout finds it issued and returns the same journal. A wrong issue is undone by reversing that journal (its own permission, logged).
- Today a tip is typed as a line before payment; this replaces it. Still to settle: whether pending tips ever expire.

## 8. Currency
- **Built:** Menus configuration has a **Currency** (empty: the system's base currency). Ingredient purchases and opening stock default to it, and so do the kitchen's journals (use, waste, count, short transfers): costs are held in the base currency, so each journal converts at the rate of its date and the books convert back at the same rate. With no Menus currency nothing changes. Prices typed on the Receive stock popup and the Opening stock sheet are in the Menus currency (shown there). The Core Purchases form keeps its own currency box (default base).
- **To build with dishes:** a dish has a **currency** (default the Menus currency, else base; may be overridden); packaging price list rows have their own. An order is written in the Menus currency: each line is converted at the rate of the date (a dish in yen and a bag in shillings on a shilling menu); the customer browsing sees each dish in its own currency. The customer pays in the voucher's currency, which is the Menus currency. Open: how is rounding shown on a mixed order?
- Known limit: with a Menus currency other than the base, inventory is valued in base at each purchase's rate, so an exchange difference on stock is not separated out. Fine for now.

## 9. QR codes (the core Codes engine; today it codes products, packs, assets and stock batches)
Add: **dishes** (the public page or ordering), **recipes** (the kitchen card or the course copy), **prepared batches and ingredient lots** (a label: batch no, chef, cooked time, use-by), and **kitchen stock variants** (a code for each, so a scanner on a Coke crate or bottle adds it to a receive, a count or an order; a supplier's barcode can be stored as the variant's code).

## 9b. Permissions (built; version 17 of the catalogue; run `php artisan access:seed`)
| Permission | Lets a person | Held by default |
|---|---|---|
| `menus.configure` | Change the Menus configuration: currency, accounts, tips rules, packaging, stations, kiosks, channels (the settings, kiosk, station and channel changes ask for it; it was `menus.manage`) | admin, finance, senior accountant |
| `menus.tips.view` | See the tips, today's and pending | admin, manager, cashier, finance, senior accountant |
| `menus.tips.issue` | Hand tips over to other people | admin, manager, cashier |
| `menus.tips.issue_self` | Hand one's own tip over to oneself (a narration is asked) | admin |
| `menus.tips.reverse` | Undo a tip handed over by mistake | admin, manager, finance, senior accountant |
| `menus.packaging.waive` | Waive or remove packaging that is compulsory and has a price | admin, manager |
`menus.view`, `menus.manage` (recipes, dishes, production) and `menus.till` are as before. A chef holds `menus.view` and `menus.manage` only, so a chef no longer changes the Menus configuration unless a role is given `menus.configure`.

## 10. Build order (each step tested and pushed)
0. Foundation: the permissions above (done), then the Menus configuration (the settings the steps below read: Prepared Food Inventory account, tips payable account and issue window, packaging kind and sales account, default removal policy and the named policies, servings, audience).
1. Recipes can use recipes; batch yield unit; production record (chef, times, actual inputs and output, servings cut); prepared stock; Prepared Food Inventory account and its journals; the daily reconciliation report.
2. Servings table; sides (with amounts per serving, station, packaging); today's recipes migrate: each dish's recipe becomes a recipe, a side of the same name and a dish with one slot.
3. Dishes made of slots (fixed, choose one, choose any, free and paid extras), servings and prices per serving, audience; "Choose a side" set meals become choose-one slots; the guided dish flow.
4. Modifiers: recipe line toggles, price policies.
5. Packaging: price list, rules, checkout list, receipt switch, waive permission.
6. Tips: tip box, tips screen, permissions, issue window.
7. Dish and packaging currencies on orders.
8. Ready-to-serve items as slots (sold as it is); timers on the batch and ticket screens.
9. QR codes.

## 11. Still to settle
- Whether pending tips expire, and what happens to the money.
- How rounding is shown on a mixed-currency order (the customer pays in the voucher's currency, the Menus currency).
- Who may name the packaging kind and the tips setting (Menus configuration permission, as the other settings).
