# Menus stock: ingredients are the smallest thing (no products behind them)

Status: **plan, nothing built yet.** Written after the owner's decision: Menus will not depend on products or on the E-commerce module, because products are moving out of core into E-commerce later. This replaces the current design, where an ingredient is a group of product variants and a dish owns a hidden product.

## What the owner decided
- **An ingredient is the lowest thing.** "Wheat flour". It has a **base unit** (g) and an **alternate unit** (kg), both from the same unit group in the units table, so conversions come from that table.
- **An ingredient has variants.** Exe, Pembe, Soko. A variant uses the ingredient's units.
- **Purchasing** buys ingredient variants (in the base or the alternate unit).
- **Stock is calculated per ingredient variant.** Making a dish reduces the variants themselves. **Wastage** is recorded against the variant.
- **No hidden products, no product tables** anywhere in Menus.

## What is true today (why this is a real change)
- An ingredient family points at product variants (`menus_ingredient_variants.variant_id`), a recipe line points at a family or a product variant, a dish owns a hidden product (`DishItems`), and every stock movement goes through the product stock engine (`BatchService`, `variant_location_stock`, `StockWriteOffService`, counts, transfers, expiry).
- Voucher lines of type `product` are refused when the E-commerce module is off (`VoucherService::assertLineModuleOn`), so today a Menus-only business could not even sell a dish on a voucher.
- Groundwork exists: script 49 gave `stock_movements` and `stock_batches` an `item_type` and `item_id`, and `StockItemRegistry` lets a module register its own kind of stocked item for the reports. The engine itself (`BatchService` and the rest) still works on product variants.

## The design

**Menus owns its stock.** New Menus tables; nothing in Menus reads `products`, `product_variants` or `variant_location_stock`.

| Table | What it holds |
|---|---|
| `menus_ingredients` | the ingredient: name, **base_unit_id**, **alt_unit_id** (same dimension, checked), allergens, tags, how the kitchen picks a variant, reorder level, active. Grows out of `menus_ingredient_families` (its `unit_id` becomes the base unit). |
| `menus_ingredient_items` | the **variant**: ingredient, name (Exe), code, optional pack size (2 kg), preference order, allowed as a substitute, expires yes/no, default buying price. Replaces `menus_ingredient_variants`. |
| `menus_stock_batches` | received lots of a variant at a branch: quantity in the **base unit**, left, unit cost, batch no, expiry, held or recalled. |
| `menus_stock_moves` | every change: purchase, opening, consumed by a dish or a production run, waste, count correction, transfer, with the voucher or run it came from. |

Quantities are always kept in the base unit. Buying "10 kg" stores 10,000 g; screens show whichever unit the person prefers. First-expiring-first and the pick rule (preferred, cheapest, first to expire) work as now.

**Purchasing.** Purchase and goods-received vouchers get a line type **ingredient** (allowed when Menus is active), with a variant, a quantity in the base or alternate unit, a price, a batch and an expiry. Posting receives the stock and the journal is Dr Ingredient stock, Cr the supplier (and input tax as usual). Opening stock for ingredients works the same way.

**Using ingredients.** A recipe line names an **ingredient** and an amount in its base or alternate unit, with waste. A sale of a made-to-order dish, or a production run, asks the ingredient's pick rule which variants to take from, reduces them batch by batch, and records the cost. Cost of food is posted at the batch cost: Dr Cost of food, Cr Ingredient stock.

**Dishes without products.** A dish is sold as a new voucher line type **dish** (Menus module), not as a product. A dish that is **made ahead** (the cake) has its own small stock of finished portions in the same Menus tables, filled by a production run that consumes the ingredients and costs the batch.

**Wastage.** The waste log writes off an ingredient variant (or a dish, which writes off its ingredients) with a reason; the journal is Dr Food wastage, Cr Ingredient stock.

**Counts, transfers, expiry, reorder, prep list.** All re-pointed at the ingredient variants: a stock count of ingredients, transfers between branches, the expiring list, the reorder suggestions (which raise a purchase order for ingredient variants), and the prep list.

**Ledgers.** Menus Configuration gets three accounts: Ingredient stock (asset), Cost of food (expense), Food wastage (expense). The defaults come from the existing Stock in hand, Cost of sales and Stock loss accounts so nothing needs setting up first.

## Steps (each tested and pushed on its own)
1. **Ingredients and variants.** Script and screens: create an ingredient with base and alternate unit (alternate limited to the same unit group), add variants. No stock yet.
2. **Stock in.** The ingredient line on purchase and goods-received vouchers, opening stock, the ingredient stock screen per branch, the journals.
3. **Using stock.** Recipes on ingredients, the pick rule over variants, consumption by a sale and by a production run, cost of food, availability ("sold out when an ingredient cannot cover one more portion").
4. **Dishes sold without products.** The `dish` voucher line, the till, the kiosk, orders and meal plans moved onto it; made-ahead stock.
5. **Wastage, counts, transfers, expiry, reorder, prep list.**
6. **Tests and mutation checks for all of it**, and a new sample-data guide.

The Menus tests that build products today (dishes, counter, kitchen, orders, reorder, waste, prep) are rewritten as each step lands.

## Not needed
- **No migration** of ingredient or recipe data: Menus has only been tried with test data. The old ingredient tables are left alone until the owner says to drop them.

## Decisions (the owner's answers)
1. **Menus' own tables.** Yes.
2. **Dishes leave products too** (the `dish` line). Yes.
3. **Pack sizes.** Yes, and it is for stock taking: a variant "Exe 2 kg" has a pack size of 2 kg; the count screen asks "how many packs" (10 packs is 20 kg); another variant "Exe 10 kg" with 3 packs is 30 kg. Stock is stored in the base unit; the count and purchase screens take packs, the alternate unit or the base unit.
4. **Ledgers.** Named as the owner's list: **Food Ingredients Inventory** (current asset), **Food Cost of Sales** (direct expense), **Food Waste Expense** (direct expense). Suppliers on a purchase are the ledgers under the **Sundry Creditors** group.
5. **Branches.** Each branch has its own stock.

## Build notes
- Step 1 is built as new tables beside the old ones (script 181: `menus_ingredients`, `menus_ingredient_items`) with their own screen and API (`/admin/menus/stock/ingredients`). The old `menus_ingredient_families` and `menus_ingredient_variants` stay until recipes are moved onto the new ingredients in step 3; until then the Recipes screen still reads the old ones, so Ingredients and Recipes are not meant to be tried together before step 3.
- A variant's pack size is kept in the base unit and may be typed in the alternate unit.
