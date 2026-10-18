# Menus: sample data to type in (ingredients, stock, dishes, recipes, menus, a meal plan)

A small Nairobi kitchen, made so the numbers can be checked by hand. Menus now has its own stock: **ingredients** with a base unit, an alternate unit and **variants** (Exe, Pembe, Soko), bought, counted, wasted and used up as ingredients. No product and no E-commerce module is involved anywhere. Enter it in this order, because each part needs the one before:

**units, accounts, ingredients, opening stock, dishes, recipes, menus, meal plan.**

Prices are made up. Run database scripts 181 to 192 first for sections 0 to 8 (190 to 192 are the kinds of ingredient, the account each kind is charged to, and the account each kind's stock is carried on). **Section 9 is the data for the later work** (recipes of their own, sides, sizes and make-up, leaving out and extra, packaging, free condiments, tips, a dish in another currency, timers and codes): it needs scripts 193 to 214, in order, and everything above it entered first. The figures in sections 0 to 8 were checked by running this exact data through the system. The figures in section 9 are the ones the automated tests assert for the same prices (the test is named beside each one), or plain arithmetic from them; the whole of section 9 typed in by hand has not been run end to end, so if a figure does not come out, that is worth writing down.

## 0. Before you start
- **Units** (Settings, Units): g and kg (mass), ml and L (volume), each (count). Add any that are missing. The alternate unit must be of the same kind as the base unit (kg for g, L for ml).
- **Menus, Configuration:** under the account selects, **Ingredient stock**, **Cost of food** and **Food waste** are empty on purpose: empty means the accounts the scripts made, **Food Ingredients Inventory** (current asset), **Food Cost of Sales** and **Food Waste Expense** (direct expenses). Choose the **Sales account for dishes** (it decides the tax). Choose the **Purchase account for ingredients** too (use **Purchases**, VAT-able 16%): it is the account an ingredient is bought under when it has none of its own, and it decides the VAT. Run `189_menus_purchase_accounts.sql` first: it adds the ingredient purchase account and two purchase accounts beside Purchases, **Purchases - exempt** and **Purchases - zero rated**. Suppliers are the ledgers under **Sundry Creditors**; make one called "Naivas Wholesale" and one called "Unga Traders".
- **Kitchen stations** (Menus, Configuration, the stations card): Hot kitchen, Bar, Pastry.

## 1. Ingredients (Menus, Ingredients)

Press **New ingredient** once per row of table 1A, then add its variants from table 1B on the same form. Save the ingredient before you go to Stock: stock is entered on **Menus, Stock**, not on this form.

**What each field on the form means**

| Field | What it does |
|---|---|
| Name | The ingredient the recipes use ("Wheat flour"). |
| Base unit | The smallest unit. Stock is kept in it (g, ml, each). |
| Alternate unit | A bigger unit of the same kind (kg for g, L for ml) for typing, buying and counting. Optional; none for things counted by the piece. |
| Purchase account (decides the VAT) | The account the tax on buying this ingredient follows, as a product's purchase account does: **Purchases - exempt** for maize flour, milk and eggs, **Purchases** (VAT-able) for cooking oil and packaged goods, **Purchases - zero rated** for zero-rated goods. Empty uses the one in Menus, Configuration. The stock is still carried on Food Ingredients Inventory and costed before tax. Opening stock is never taxed. |
| When there are several variants | How the kitchen picks: **the preferred one first** (top of the list, then the next), **the cheapest first**, or **the one that expires first**. |
| Variant name | The version you buy ("Exe 2 kg"). Variants are listed in order of preference; the arrows move them. |
| Code (optional) | Your own reference, or the supplier's **barcode** off the crate or bottle. A scanner on the Receive, Count and What to buy screens finds the item by it (section 9G). A retail barcode must have its check digit right and nothing else may have the code; a code you replace still scans, marked as an old code. |
| Pack holds | How much one pack holds, with the unit beside it (kg, g, L, ml). It lets you receive and count in **packs**: 10 packs of 2 kg is 20 kg. Empty means no pack: you type kg or g instead. |
| may be used | Untick to keep the stock but never use it in a dish, not even as a substitute. |
| expires | Receiving it then asks for an expiry date. Expired stock is never used and appears on the Stock page's expiry list. |
| in use | Untick when you stop buying it: it disappears from receiving and counting, its history stays. |
| keep at least | The least you want on the shelf, in the unit beside it. Below it, Operations, What to buy suggests ordering it. Empty means no level. |
| Allergens it contains / What it is | The tick boxes. They decide the allergens and diet badges on every dish that uses the ingredient. |

**Where the allergen and "what it is" ticks come from:** the lists are kept under **Menus, Allergens** (press G, then A), not fixed in the program. The 14 allergens and 11 tags Menus always had are already there; each says which diet badges it rules out (Meat rules out vegetarian and vegan, Milk rules out vegan and dairy free, and so on). To try adding your own: on that page press **New tag**, call it **Gelatine**, tick "not vegetarian" and "not vegan", save, then tick Gelatine on an ingredient and see the dish lose its Vegetarian badge. A tag that an ingredient or a dish carries cannot be removed until it is taken off.

**1A. The ingredients**

| Ingredient | Base unit | Alternate unit | Pick rule | Allergens | What it is |
|---|---|---|---|---|---|
| Wheat flour | g | kg | The preferred one first | Wheat / gluten | Gluten |
| Sugar | g | kg | The preferred one first | | |
| Eggs | each | none | The preferred one first | Eggs | Egg |
| Milk | ml | L | **The cheapest first** | Milk | Dairy |
| Butter | g | kg | The preferred one first | Milk | Dairy |
| Cooking oil | ml | L | The preferred one first | | |
| Beef | g | kg | The preferred one first | | Meat |
| Chicken | g | kg | The preferred one first | | Poultry |
| Tomatoes | g | kg | The preferred one first | | |
| Onions | g | kg | The preferred one first | | |
| Potatoes | g | kg | The preferred one first | | |
| Rice | g | kg | The preferred one first | | |
| Kale | g | kg | The preferred one first | | |
| Maize flour | g | kg | The preferred one first | | |
| Salt | g | kg | The preferred one first | | |
| Cocoa | g | kg | The preferred one first | | |
| Baking powder | g | kg | The preferred one first | | |
| Tea leaves | g | kg | The preferred one first | | Caffeine |

**1B. The variants.** "Order" is the position in the list (1 is taken first). A tick is on, a dash is off. There is no price on this form: what a pack costs is typed when stock comes in (section 2, "Price of one pack").

| Ingredient | Order | Variant name | Code | Pack holds | may be used | expires | in use | keep at least |
|---|---|---|---|---|---|---|---|---|
| Wheat flour | 1 | Pembe 24 kg | PEMBE24 | 24 kg | ✓ | – | ✓ | |
| Wheat flour | 2 | Exe 2 kg | EXE2 | 2 kg | ✓ | – | ✓ | 6 kg |
| Wheat flour | 3 | Soko 1 kg | SOKO1 | 1 kg | **–** | – | ✓ | |
| Wheat flour | 4 | Jogoo 2 kg | JOGOO2 | 2 kg | ✓ | – | **–** | |
| Sugar | 1 | Kabras 1 kg | | 1 kg | ✓ | – | ✓ | |
| Eggs | 1 | Tray of 30 | | 30 each | ✓ | **✓** | ✓ | 60 each |
| Milk | 1 | Fresh 1 L | | 1 L | ✓ | – | ✓ | |
| Milk | 2 | Fresh 500 ml | | 0.5 L | ✓ | – | ✓ | |
| Butter | 1 | Block 250 g | | 250 g | ✓ | **✓** | ✓ | |
| Cooking oil | 1 | Jerrycan 5 L | | 5 L | ✓ | – | ✓ | |
| Cooking oil | 2 | Bottle 1 L | | 1 L | ✓ | – | ✓ | |
| Beef | 1 | Stewing meat 1 kg | | 1 kg | ✓ | **✓** | ✓ | |
| Chicken | 1 | Breast 1 kg | | 1 kg | ✓ | **✓** | ✓ | |
| Tomatoes | 1 | Tomatoes 1 kg | | 1 kg | ✓ | – | ✓ | |
| Onions | 1 | Onions 1 kg | | 1 kg | ✓ | – | ✓ | |
| Potatoes | 1 | Potatoes 1 kg | | 1 kg | ✓ | – | ✓ | |
| Rice | 1 | Pishori 2 kg | | 2 kg | ✓ | – | ✓ | |
| Kale | 1 | Sukuma wiki 1 kg | | 1 kg | ✓ | – | ✓ | |
| Maize flour | 1 | Unga 2 kg | | 2 kg | ✓ | – | ✓ | |
| Salt | 1 | Salt 500 g | | 500 g | ✓ | – | ✓ | **1 kg** |
| Cocoa | 1 | Cocoa tin 200 g | | 200 g | ✓ | – | ✓ | |
| Baking powder | 1 | Tin 100 g | | 100 g | ✓ | – | ✓ | |
| Tea leaves | 1 | Pack 250 g | | 250 g | ✓ | – | ✓ | |

What the bold cells are there to show:
- **Pembe 24 kg** is first in order but will have no stock, so flour comes from Exe (the next in order).
- **Soko 1 kg, may be used off:** it has stock but the kitchen never takes it.
- **Jogoo 2 kg, in use off:** it is not offered when you receive or count stock.
- **Eggs, Butter, Beef, Chicken expire:** receiving them asks for an expiry date.
- **Milk, the cheapest first:** Fresh 1 L (0.12 a ml) beats Fresh 500 ml (0.13 a ml).
- **Keep at least:** Salt (1 kg, but 500 g on the shelf) shows up on "What to buy"; Exe (6 kg, with 20 kg on the shelf) and Eggs (60, with 120) do not.

## 2. Opening stock (Menus, Stock, Opening stock)

Opening stock is one sheet with a row for every variant that is in use (Jogoo is not listed). Choose the **Branch** and the **Stock as at** date at the top, then type into the rows. Each row has: **Quantity**, **In** (packs, the bigger unit or the base unit), **Price of one** (of the unit chosen), **Batch no (optional)** and **Expiry date** (only for variants that expire; the others say "does not expire"). **On the shelf now** shows what is already there, because opening stock is added to it.

- **Finding rows:** the search box matches an ingredient or a variant ("wh" shows both Wheat flour variants and Whole milk), the Ingredient list narrows to one ingredient, and All / Touched / Not touched shows the rows you have typed in or not.
- **Touched rows:** a row is touched as soon as anything is typed in it. The line at the top counts them ("12 rows changed · 18,540 before tax") and the button says **Save all (12)**. What you type is kept in this browser per branch, so a reload or a closed tab loses nothing; **Discard changes** throws it away.
- **Saving:** Save all checks every touched row first (a quantity, a price, an expiry date where one is needed) and marks the rows that need fixing without saving anything. When all are right it makes **one Opening stock voucher for each variant** (item = the ingredient's name, variant = the variant's name, quantity in the unit you chose, price of one of that unit), each posting Dr Food Ingredients Inventory, Cr the opening balance account (choose that under Books, Settings, Default ledgers first). They are listed under **Purchases, Opening stock** like a product's. If the books refuse, nothing is saved and the row at fault is marked.
- **Keyboard:** Enter moves down to the same box in the next row.
- Expiry dates are counted from today.

| Variant | Quantity | In | Price of one pack | Batch no | Expiry date | That is |
|---|---|---|---|---|---|---|
| Pembe 24 kg | leave it out | | | | | none, on purpose |
| Exe 2 kg | 10 | packs | 260 | OPEN-1 | | 20 kg |
| Soko 1 kg | 5 | packs | 140 | | | 5 kg |
| Kabras 1 kg | 10 | packs | 160 | | | 10 kg |
| Tray of 30 | 4 | packs | 450 | | today + **4 days** | 120 eggs (the expiry list shows them) |
| Fresh 1 L | 20 | packs | 120 | | | 20 L |
| Fresh 500 ml | 10 | packs | 65 | | | 5 L |
| Block 250 g | 5 | packs | 330 | | today + 25 days | 1,250 g |
| Jerrycan 5 L | 2 | packs | 1,550 | | | 10 L |
| Bottle 1 L | 6 | packs | 340 | | | 6 L |
| Stewing meat 1 kg | 6 | packs | 800 | | today + 20 days | 6 kg |
| Breast 1 kg | 1 | packs | 650 | | today + 20 days | 1 kg (runs out after 5 portions, on purpose) |
| Tomatoes 1 kg | 8 | packs | 120 | | | 8 kg |
| Onions 1 kg | 8 | packs | 100 | | | 8 kg |
| Potatoes 1 kg | 15 | packs | 90 | | | 15 kg |
| Pishori 2 kg | 5 | packs | 380 | | | 10 kg |
| Sukuma wiki 1 kg | 5 | packs | 60 | | | 5 kg |
| Unga 2 kg | 10 | packs | 200 | | | 20 kg |
| Salt 500 g | 1 | packs | 40 | | | 500 g |
| Cocoa tin 200 g | 2 | packs | 380 | | | 400 g |
| Tin 100 g | 2 | packs | 120 | | | 200 g |
| Pack 250 g | 3 | packs | 150 | | | 750 g |

Try this too: type the same Exe stock as **20 kg** (In: kg, price 130 a kg) instead of 10 packs and see that the shelf shows the same 10 packs. Type half of the table, reload the page, and see the rows still there and counted. Jogoo 2 kg is not on the sheet, because it is not "in use" (it shows faded on the Stock page's shelf table).

## 3. Dishes (Menus, Dishes)

Each dish has its own price (before tax). "Made at" is the station.

| Dish | Price | Takes about | Made at | Description |
|---|---|---|---|---|
| Beef stew & ugali | 650 | 20 min | Hot kitchen | Slow-cooked beef in tomato and onion gravy with ugali |
| Chicken pilau | 600 | 25 min | Hot kitchen | Spiced rice with chicken |
| Sukuma wiki & ugali | 250 | 10 min | Hot kitchen | Sautéed kale with ugali |
| Chips | 300 | 12 min | Hot kitchen | Add the choices group **Portion**: Regular, Large +100 (Large also uses 150 g more potatoes) |
| Pancakes | 350 | 10 min | Pastry | Three pancakes with butter and sugar. Add a group **Extras** (pick several): "No butter" leaves out Butter |
| Masala chai | 150 | 5 min | Bar | Milk tea with spice |
| Chocolate cake slice | 400 | 2 min | Pastry | A slice of chocolate cake (made ahead) |

## 4. Recipes (Menus, Recipes)

Quantities are per portion unless it says batch. "Waste %" is added back: 5% on 200 g means 210.5 g is taken from the shelf. The cost shown on the Recipes screen is per gram or ml, worked out from the prices in section 2 (a pack's price divided by what it holds); where an ingredient has several variants on the shelf it is the average of what is there (so cooking oil is 0.32 a ml, a mix of the jerrycan and the bottle, and milk 0.122).

**Made to order** (selling it uses the ingredients). On the recipe, "How it is made" is "Made to order", which is the default.

| Recipe | Lines (amount, waste) | Cost per portion, about |
|---|---|---|
| Beef stew & ugali | Beef 200 g (5%), Onions 60 g, Tomatoes 100 g, Cooking oil 20 ml, Salt 3 g, Maize flour 150 g | 208.09 |
| Chicken pilau | Rice 150 g, Chicken 180 g, Onions 50 g, Cooking oil 25 ml, Tomatoes 40 g, Salt 3 g | 163.57 |
| Sukuma wiki & ugali | Kale 150 g (10%), Onions 40 g, Tomatoes 50 g, Cooking oil 15 ml, Maize flour 150 g, Salt 2 g | 39.98 |
| Chips | Potatoes 300 g (15% peeling waste), Cooking oil 60 ml, Salt 2 g | 51.20 |
| Pancakes | Wheat flour 120 g, Eggs 1, Milk 150 ml, Sugar 15 g, Butter 10 g, Cooking oil 10 ml | 67.71 (flour is Exe at 0.13 a gram, Pembe being empty) |
| Masala chai | Milk 200 ml, Tea leaves 5 g, Sugar 10 g | 29.00 |

**Made ahead** (a batch is made, the portions go on the dish's own shelf). On the recipe, "How it is made" is "Made ahead in batches"; "One batch makes" **8** portions, prep 20 min, cook 40 min.

| Recipe | Lines for the whole batch | Cost |
|---|---|---|
| Chocolate cake | Wheat flour 300 g, Sugar 250 g, Eggs 4, Butter 200 g, Cocoa 60 g, Milk 200 ml, Baking powder 10 g | the Recipes screen says 69.18 a slice (shelf average); making the batch costs **553.00**, which is **69.13** a slice, because it takes the flour from Exe and the milk from the 1 L packs |

Method steps for the cake: 1 Cream the butter and sugar. 2 Beat in the eggs. 3 Fold in flour, cocoa and baking powder, loosen with milk. 4 Bake at 170 degrees for 40 minutes. 5 Cool and cut into 8. On the cake, set "Who may see it" to "May be shown on the website and in courses" to test copying it to Courses.

## 5. Menus (Menus, Menus)

| Menu | Days | Hours | Sections and their dishes |
|---|---|---|---|
| Breakfast | all seven | 06:00 to 11:00 | **Pancakes and tea**: Pancakes, Masala chai |
| Lunch & dinner | all seven | 11:00 to 22:00 | **Mains**: Beef stew & ugali, Chicken pilau, Sukuma wiki & ugali. **Sides**: Chips. **Drinks**: Masala chai |
| Bakery | all seven | all day (leave the hours empty) | **Cakes**: Chocolate cake slice |
| Weekend special | Sat, Sun | 12:00 to 16:00 | **Sunday roast**: Chicken pilau, Chips |

Masala chai sits on three menus on purpose: the same dish can be on several.

## 6. A meal plan (Menus, Meal plans)

**Office lunch**: "A main and a chai, delivered to your desk".
- Price for each delivery day **750** (the two dishes would cost 800 apart).
- Menu repeats after **1** week; deliveries Mon to Fri; fewest days a week **3**; skip up to **24** hours before; delivery from 12:00 until 13:00.
- Day by day (each day: the main plus Masala chai): Monday Beef stew & ugali, Tuesday Chicken pilau, Wednesday Sukuma wiki & ugali, Thursday Beef stew & ugali, Friday Chicken pilau.
- Set the plan Active only when the days are filled in.

## 7. What to look for once it is in

**Stock and ingredients**
- Menus, Stock shows Exe at 10 packs, 20 kg, 20,000 g; Pembe at nothing; Jogoo shows faded (not in use). Receiving a delivery (say 5 packs of Exe at 260 from Naivas Wholesale) is a **Purchase voucher** in Books with a line for the variant (Dr Food Ingredients Inventory, Cr Naivas Wholesale) and 10,000 g on the shelf; it is also listed under Purchases. Cancelling that voucher takes the stock off again, unless some was used.
- Deleting an ingredient that a recipe uses, or a variant with stock history, is refused.

**Selling**
- Menus, Allergens: Milk shows "not vegan, not dairy free"; Wheat / gluten shows "not gluten free"; each shows how many ingredients carry it (once the ingredients above are in: Milk 2, Wheat / gluten 1, Eggs 1, Dairy 2). Add Gelatine as above; try to remove Milk and be refused while ingredients carry it.
- Allergens: Pancakes show wheat, eggs and milk with no one typing them on the dish. Beef stew and Sukuma wiki show none. Sukuma wiki & ugali can be shown vegetarian; Beef stew cannot.
- Till or kiosk, sell 3 Pancakes: the flour comes out of **Exe** (360 g, so Exe goes from 20,000 g to 19,640 g, because Pembe is empty); Soko stays at 5,000 g (it is switched off as a substitute); eggs go from 120 to 117, the milk (150 ml x 3 = 450 ml) comes from the 1 L packs because milk is set to "the cheapest first" (19,550 ml left), butter goes from 1,250 g to 1,220 g. Books gets one journal: Dr Food Cost of Sales, Cr Food Ingredients Inventory.
- Chicken pilau: sell 5, the sixth is refused ("Not enough Chicken: need 180 g, have 100"; 1 kg holds five portions of 180 g) and the till shows the dish as sold out. Cancel one of the five sales and the chicken comes back.
- Pancakes with "No butter": 10 g less butter is used.
- Chips, Large: 150 g more potatoes are used and 100 is added to the price.

**Making ahead**
- Menus, Stock, Make a batch: Chocolate cake, 8 portions. The flour, sugar, eggs, butter, cocoa, milk and baking powder fall by the batch quantities (it costs 553.00); 8 slices appear on the dish's own shelf (the till can sell 8). Nothing is booked until the slices are sold. Selling a slice takes it from the shelf; cancelling the batch is refused once any slice is sold.

**Waste, counts, branches, expiry, buying**
- Operations, Waste: waste 1 kg of Beef as "Spoilage": the shelf drops by 1,000 g and Books gets Dr Food Waste Expense, Cr Food Ingredients Inventory for its cost (800). "Take back" returns it and cancels the journal. Waste 2 Chips as "Plate waste": potatoes, oil and salt come off. Waste 3 cake slices as "Made too much": the slices go.
- Stock, Count stock (a sheet like Opening stock, one row per variant with what the books say): count Exe as 9 packs and the row says -2,000 g; save, and it is a loss of 1 pack (2 kg), booked to Food Waste Expense. Count it as 11 packs: stock found, a new lot at the last cost. Type 0 where nothing is left; rows you leave empty are not touched; counted rows are kept in the browser until saved. The count is a **Stock count** under Purchases, Stock counts (with its own journal for the ingredients). You can also start a full count there: every variant on the shelf is listed, counted in packs, kg or g.
- Purchases, Transfers: send 3 packs of Exe to the second branch. It stays in transit until the other branch receives it (receive 2 packs only and the missing one is written off to Food Waste Expense). Purchases, Expiring stock lists the ingredient lots too; Stock journal and Stock reports show every ingredient movement, transfers included.
- Stock, Send to a branch (needs a second branch): send 2 packs of Exe; the other branch shows them, with the cost and expiry unchanged.
- Stock shows "Expired or expiring this week": the eggs (4 days).
- Operations, What to buy: Salt appears (under its level of 1 kg, it has 500 g) as 1 pack, from the supplier it was last received from; a week of expected sales also asks for flour, in whole packs of Pembe (the preferred variant). "Make orders" raises one Purchase Order per supplier in Books.
- Prep list: after a few days of sales, tomorrow's list shows what to make (cake) and what is short.

**Menus and plans**
- Breakfast is offered before 11:00 and not after; the Weekend special does not show on a weekday; the dish on all three menus changes price everywhere when you change it once.
- Meal plan: the day price is 750 and a customer with the plan sees Monday's beef stew.

**Courses**
- Courses, Recipes: the Chocolate cake appears (it is set to public); copying it gives a lesson with the ingredients (in grams and millilitres) and the five steps. Change the recipe in Menus and "Update the copy" takes the fresh version.

## 8. The other kinds: drinks, condiments, packaging, supplies (Menus, Ingredients, Kinds)

Everything here is an ingredient with a **Kind** (the picker beside the name; it starts as Cooking ingredient). Run scripts 190 and 191 first; **Menus, Ingredients, Kinds** should list five kinds, each with its ledger: Cooking ingredient, Ready to serve and Condiment or extra on **Food Cost of Sales**; Packaging and Supplies on **Kitchen Supplies Used**. After script 192 the Kinds table also has a **Stock ledger** column: Food Ingredients Inventory for the first three, **Kitchen Supplies Inventory** for Packaging and Supplies.

**8A. The ingredients** (purchase account **Purchases** for all of them, so the buying VAT is the usual 16%)

| Ingredient | Kind | Base unit | Alternate unit | Pick rule | Variants (order, name, pack holds, expires, keep at least) |
|---|---|---|---|---|---|
| Cola | Ready to serve | each | none | **The cheapest first** | 1 Crate of 24 (24 each, expires ✓, keep at least 24 each); 2 Single bottle (1 each, expires ✓) |
| Fanta | Ready to serve | each | none | The preferred one first | 1 Crate of 24 (24 each, expires ✓) |
| Bottled water | Ready to serve | each | none | The preferred one first | 1 Pack of 12 (12 each, expires ✓) |
| Tomato ketchup | Condiment or extra | ml | L | The preferred one first | 1 Bottle 1 L (1 L, expires ✓) |
| Ketchup sachet | Condiment or extra | each | none | The preferred one first | 1 Box of 500 (500 each) |
| Takeaway box | Packaging | each | none | The preferred one first | 1 Pack of 50 (50 each, keep at least 50 each) |
| Paper bag | Packaging | each | none | The preferred one first | 1 Pack of 100 (100 each) |
| Disposable gloves | Supplies | each | none | The preferred one first | 1 Box of 100 (100 each, keep at least 100 each) |
| Dish soap | Supplies | ml | L | The preferred one first | 1 Bottle 5 L (5 L) |

Then open the existing **Salt** and change its kind to **Condiment or extra** (it is allowed: that kind is also used in recipes).

**8B. Opening stock** (Menus, Stock, Opening stock; one branch; it is one Opening stock voucher per variant, never taxed; the gloves, soap, boxes and bags debit **Kitchen Supplies Inventory**, the others Food Ingredients Inventory; if you entered them before script 192, cancel those vouchers and enter them again)

| Variant | Quantity | In | Price of one pack | Expiry date | That is | Value |
|---|---|---|---|---|---|---|
| Cola, Crate of 24 | 3 | packs | 1,200 | today + 90 days | 72 each (50 each) | 3,600.00 |
| Cola, Single bottle | 6 | packs | 60 | today + 90 days | 6 each | 360.00 |
| Fanta, Crate of 24 | 2 | packs | 1,150 | today + **5 days** | 48 each (the expiry list shows them) | 2,300.00 |
| Bottled water, Pack of 12 | 4 | packs | 480 | today + 200 days | 48 each (40 each) | 1,920.00 |
| Tomato ketchup, Bottle 1 L | 3 | packs | 360 | today + 120 days | 3,000 ml | 1,080.00 |
| Ketchup sachet, Box of 500 | 2 | packs | 750 | | 1,000 each (1.50 each) | 1,500.00 |
| Takeaway box, Pack of 50 | 4 | packs | 500 | | 200 each (10 each) | 2,000.00 |
| Paper bag, Pack of 100 | 2 | packs | 400 | | 200 each (4 each) | 800.00 |
| Disposable gloves, Box of 100 | 3 | packs | 350 | | 300 each (3.50 each) | 1,050.00 |
| Dish soap, Bottle 5 L | 2 | packs | 900 | | 10 L | 1,800.00 |

The nine new rows together are **16,410.00** (the Opening stock vouchers add up to that: 10,760.00 on Food Ingredients Inventory, 5,650.00 on Kitchen Supplies Inventory for the boxes, bags, gloves and soap). Salt keeps its 40 from section 2.

**8C. What to try, and what to expect**
- **Kinds screen:** Ready to serve 3 ingredients, Condiment or extra 3 (ketchup, sachet, Salt), Packaging 2, Supplies 2, Cooking ingredient one fewer than before (Salt moved). The Ingredients page filters by each kind. Try to remove Supplies: refused (it has ingredients). Add a kind without picking its ledger: Save stays off.
- **Recipes:** open Recipes for any dish and look at the ingredient list. It offers Salt, Tomato ketchup and Ketchup sachet (condiments are used in recipes) and the cooking ingredients; it does **not** offer Cola, Fanta, water, boxes, bags, gloves or soap. Move **Wheat flour** to Packaging: refused, "It is in a recipe".
- **Buying:** Purchases, New purchase, search "cola": the crate and the single bottle show under it; buy 2 crates at 1,200 with 16% VAT on Purchases. The breakdown shows the VAT and the stock rises by 48 each. Try the same for gloves.
- **Count stock:** count Disposable gloves as 2 boxes (the row says -100 each): saved, it is a shortfall of 350.00 and it is charged to **Kitchen Supplies Used** (credit Kitchen Supplies Inventory), not to waste: supplies are used up on purpose, so counting is the using. Count the Cola short instead and that is a loss to Food Waste Expense.
- **Waste:** waste 1 crate of Cola as Spoilage: 24 each leave and Books gets Dr Food Waste Expense 1,200.00, Cr Food Ingredients Inventory. Take it back to undo.
- **Expiry:** Menus, Stock shows the Fanta crates in "Expired or expiring this week" (5 days). The Cola and the ketchup do not appear.
- **What to buy:** waste 250 gloves as Other: gloves are at 50 each, under the 100 you keep, so Operations, What to buy asks for a box.
- **Branches:** send 1 crate of Cola to the second branch: it arrives with its cost (50 each) and expiry.
- **Selling a drink:** a ready-to-serve item is sold as a **side** (Menus, Sides, *Made from* a ready-to-serve ingredient), see 9C and 9D: a Cola in a dish's *Drink* slot takes 1 each off the shelf and books its cost to Food Cost of Sales. The older way still works too: edit the **Ready to serve** kind and tick **Used in recipes**, then make a dish "Cola" with a recipe of 1 each of Cola (the cheapest pick rule takes the crate, 50 each). Sell 1: the crate goes to 71 each and Food Cost of Sales gets 50.00. Untick it again afterwards.
- **Packaging and condiments on an order** are built: the takeaway box, the paper bag and a ketchup sachet or bottle come off the shelf when a take-out order is paid, if a dish or side says so (9E and 9F).

## 9. The later work: sides, sizes, leaving out and extra, packaging, tips, currencies, timers and codes

Enter this after sections 0 to 8, with database scripts **193 to 214** run in order (each says which it needs; `php artisan access:seed` too, for the permissions). Where the manual test (`docs/MENUS_MANUAL_TEST.md`, sections 0c to 0am) says *Coke* use **Cola**, *Container* is the **Takeaway box**, *Bag* is the **Paper bag**, *Ketchup* is **Tomato ketchup**, *fries* are **Chips**, and *a burger* and *a steak sandwich* are the two dishes below. "(test)" after a figure means an automated test asserts it for the same prices (named in 9I); the rest is arithmetic, and the VAT used is 16%.

### 9A. Four more ingredients (Menus, Ingredients) and their stock

| Ingredient | Kind | Base unit | Alternate unit | Variants | Opening stock (Menus, Stock, Opening stock) |
|---|---|---|---|---|---|
| Cheddar cheese | Cooking ingredient | g | kg | Block 1 kg (1 kg, expires ✓) | 3 packs at 900, expiry today + 30 days (3,000 g) |
| Burger bun | Cooking ingredient | each | none | Pack of 6 (6 each, expires ✓) | 10 packs at 120, expiry today + 5 days (60 each) |
| Mayonnaise | Condiment or extra | ml | L | Jar 1 L (1 L, expires ✓) | 2 packs at 450, expiry today + 90 days (2,000 ml) |
| Foil sheet | Packaging | each | none | Roll of 100 (100 each) | 2 packs at 250 (200 each); **no price on the packaging price list**, on purpose |

Purchase account **Purchases** for all four. Give the **Cola** variants their supplier barcodes now (section 9G) or later.

### 9B. Recipes of their own (Menus, Recipes, *Recipes of their own*)

Counted in portions unless it says otherwise. Quantities are for one portion (or one batch where it says so).

| Recipe | One batch makes | Lines | Notes |
|---|---|---|---|
| Ugali | **2 kg** (counted in Kilogram) | Maize flour 800 g | Made ahead in batches. **Times:** up to 1 kg 15 min, up to 2 kg 20 min, up to 5 kg 40 min. Method: 1 Boil the water (5 min). 2 Stir in the flour (20 min). |
| Tomato and onion base | 2 kg | Onions 400 g, Tomatoes 600 g | |
| Stew | 4 portions | the recipe *Tomato and onion base* 1 kg; Beef 800 g | the base has no leave-out ticks: a recipe inside a recipe is taken whole |
| Bread | 1 | Wheat flour 60 g | |
| Choma | 1 | Beef 150 g, Salt 2 g | |
| Wet fry | 1 | Beef 120 g, Onions 30 g, Cooking oil 15 ml | |
| Kale | 1 | Kale 100 g, Onions 20 g | named *Kale*, like the ingredient: a recipe and an ingredient may share a name |
| Egg | 1 | Eggs 1 | |
| Ketchup portion | 1 | Tomato ketchup 30 ml | |
| Mayo portion | 1 | Mayonnaise 20 ml | |

And one dish's own recipe, **Burger** (made to order, one portion), written under *Dishes' recipes*: Burger bun 1, Beef 120 g, **Cheddar cheese 20 g** (tick *may be left out* **and** *may be asked for extra*), **Onions 10 g** (tick *may be left out* only), Cooking oil 5 ml.

### 9C. Lists and sides (Menus, Configuration, then Menus, Sides)

**Lists** (Configuration, below the settings): servings **Jumbo, Medium, Kids**; audiences **Adults, Kids**; policies **Free** (the default), **Fee 20** (a fixed fee, 20) and **Ten percent** (a percentage, 10).

**Sides.** *Amounts* are in the side's own unit; "in a serving" is the amount for any size that has none of its own.

| Side | Made from | In a serving | Jumbo | Kids | Plating or reheating (minutes) |
|---|---|---|---|---|---|
| Ugali | recipe Ugali, written in **Gram** | 250 g | 350 g | 100 g | 3 |
| Bread | recipe Bread | 1 | | | |
| Choma | recipe Choma | 2 | | 1 | **5** |
| Wet fry | recipe Wet fry | 1 | | | 4 |
| Kale | recipe Kale | 1 | | | |
| Egg | recipe Egg | 1 | | | |
| Ketchup | recipe Ketchup portion | 1 | | | |
| Mayo | recipe Mayo portion | 1 | | | |
| Stew | recipe Stew | 1 | | | |
| Cola | the ready-to-serve ingredient Cola | 1 each | | | |

An ingredient of the kind Cooking ingredient (flour, beef) is not offered as a side: it is not sold as it is.

### 9D. Dishes with sizes, make-up, leaving out and extra (Menus, Dishes)

Add these to section 3's dishes. Put them on the **Lunch & dinner** menu, section **Mains**.

| Dish | Price | Made at | Make-up and rules |
|---|---|---|---|
| **Steak sandwich** | 500 | Hot kitchen | *Sizes:* Jumbo 650, Kids 350. *For:* Adults and Kids. *Slots:* **Bread** (always included: Bread); **Protein** (choose one: Choma to begin with, Wet fry **+50**); **Greens** (choose any, fewest 0, most 2: Kale **+20**); **Sauces** (free extra, most 2: Ketchup, Mayo); **Drink** (free extra, most 2: Cola); **Extras** (paid extra, most 3: Egg **+40**). |
| **Burger** | 500 | Hot kitchen | Recipe from 9B. *For:* Adults only. *Modifiers:* **extra Cheddar cheese → Ten percent**; **leave out Onions → Fee 20**. |
| **Stew meal** | 650 | Hot kitchen | *Slots:* **Main** (always included: Stew); **Starch** (always included: Ugali). No sizes. For the packaging tests. |

What to expect (the steak sandwich figures are asserted by `MenusOrderingMakeupTest`, the burger's by `MenusOrderingModifiersTest`):
- Steak sandwich, **Jumbo** with the first protein: **650**. With **Wet fry** and **Kale**: **720** (650 + 50 + 20). With two **Eggs** as well: **800**. **Kids**: **350**.
- Burger with **Extra cheese** and **No onion**: **570** (500, plus 10% of 500 for the cheese, plus 20 for the onion). On a dish sold in sizes the percentage is of the size's price, not of the dish's own price.
- Online, the Menu page shows the steak sandwich "from 350", with each size's price and who it is for; choosing **Kids** under *For* hides the Burger (Adults only) and keeps the steak sandwich and the Chips (for everyone).
- A ticket for the steak sandwich in Jumbo shows `Jumbo`, then `- Bread`, `- Choma`, `- Egg x2`. Stock follows the sides picked: a Jumbo takes Choma's recipe twice (the side's amount is 2), a Kids once; the Cola, if picked, takes 1 each off the shelf.
- Paid extras on a tab: after the third Egg the button goes. Cola: 1 each comes off the shelf for each one picked.

### 9E. Packaging and free condiments (Menus, Configuration; Menus, Sides; Menus, Dishes)

- **Menus, Configuration:** choose **Packaging** as the packaging kind. Packaging prices (one unit each): **Takeaway box 15**, **Paper bag 5**; leave the currency on Menus and the account on the dishes' account. The Foil sheet has **no price**. Keep *A fee carries the dish's VAT* on.
- **Rules to enter first** (Menus, Sides, Edit **Stew**, *Packaging*): **Takeaway box**, 2, *For each dish*, compulsory, charged, receipt *When charged*; **Foil sheet**, 1, *For each dish*, free, receipt *When charged*.
- **Rules to add during the tests** (manual 0v and 0z): on the dish **Stew meal**, **Paper bag**, 1, *Once for the order* (free, receipt *Always*); then a **Takeaway box**, 1, on the dish itself (it replaces what the side says about the box for that dish). For 0z set the box's receipt to *Never*.
- **Free condiments** (Menus, Dishes, **Chips**, *Packaging*, *Free condiments*): **Tomato ketchup 2**, **Mayonnaise 1**.
- **People:** a **cashier** whose role does *not* hold "Waive or remove takeaway packaging that is compulsory and has a price", and a **manager** whose role does.

What to expect (the packaging figures are asserted by `MenusPackagingPostingTest` and `MenusPackagingCheckoutTest`):
- Take out **two Stew meals**: Container **4** (2 each, 15 each = **60**), Foil **2** (free). Before tax: **1,300** (two meals) **+ 60 = 1,360**; with 16% VAT **1,577.60**. Dining in: no packaging list.
- Cashier presses − on the container: refused, red note. Manager: amber note, **Take** works, **15.00** waived and logged. Swapping the container for the bag (4 × 15 asked, 4 × 5 charged) waives **40**.
- After the sale the shelf is down by **4** boxes and **2** foil sheets, in one journal "Packaging used for ..." (Dr Kitchen Supplies Used, Cr Kitchen Supplies Inventory).
- Three **Chips** with the free condiments: **Ketchup 6** and **Mayonnaise 3** allowed. Give 9 ketchup: a warning "9 Ketchup given, 6 allowed", not a block; the shelf loses 9 ketchup (what was given).
- The kitchen ticket: `PACK: ...` (blue) and `GIVE: ...` (green) lines; Operations, *Packaging* report: orders, asked, given, left off, waived.

### 9F. Tips (Menus, Configuration; Menus, Tips)

- **Menus, Configuration:** tips account empty (the books' Tips Payable). Tips window **At any time** to begin with; for 0af step 4 change it to **Every day between** two times that do not include now, and back.
- **People:** *Cashier Jo* (`menus.till`, See the tips, Hand tips over to other people), *Waiter Wanjiku* (`menus.till`, a user, so tips can be handed to them), *Manager Mo* (all of those, plus Hand one's own tip over and Undo a tip handed over), and the owner. A fourth, *Viewer*, with See the tips only.
- **Payment method with an account:** Cash must have its cash ledger set (Settings, Payment methods) or the Tips screen offers nothing to pay out of.
- **Tips to make** (Till, **Take out**, pay in cash): 1. two Burgers, label **Window**, tip **200**, hand over 1,400 (bill 1,160). 2. a tab **Table 4** with one Chips (300) paid at the end with tip **50**. 3. one Burger with **no tip**. After 1 and 2, Menus, Tips, *Pending* lists two tips (200 and 50), *Today* the same.

What to expect (asserted by `MenusCounterTest`, `MenusTipsIssueTest` and `MenusTipsReportTest`):
- A bill of **1,160** (two Burgers, 1,000 + 16%). Tip **100**: Bill 1,160, Tip 100, Total **1,260**. Hand over **1,200**: refused, "the tip can be at most **40.00**". Hand over **1,300**: change **40.00**. The same 1,300 with no tip: change **140.00**.
- A tip is credited to tips payable on the sale; its line reads like `Tip, MO-000012, Window`. Pending tips never expire.
- **Issue** the 200 to Waiter Wanjiku out of Cash with the narration "Weekend share": one journal, Dr tips payable 200, Cr Cash 200; it moves from Pending to Today. A second press from another tab says it was already handed over, no second journal.
- Outside the window: the Issue buttons are greyed and it says when the window opens.
- Hand a tip to *yourself* as Manager Mo: the box wants a narration. The cashier choosing themselves is refused.
- **Take back** the 200 with the reason "Wrong person": the journal is cancelled, the tip is Pending again, and it can be handed over again. The *Report* tab then shows Taken back **1**.

### 9G. Dishes in another currency (Settings, Currencies; Menus, Dishes)

**Read first:** script 213 writes orders in the Menus currency. Leave **Menus, Configuration, Currency empty** (or on the currency you sell in) before you run it.

- **Currencies:** add **USD** with a rate of **130** (1 USD = 130 in the base currency), and **EUR** at 140. For the history test give USD **120** from the first of this month and **135** from tomorrow.
- **Dishes** (put them on Lunch & dinner, Mains; *Price currency* is on the dish form once 213 is run): **Imported steak**, price **10**, currency **USD**; **Tart**, price **3.33**, currency **USD**; **Wine**, price **20**, currency **EUR**; **Chapati plate**, price **200**, no currency of its own.
- **Packaging price in a foreign currency:** give the Paper bag **0.04** in **USD** (the Takeaway box stays 15 in the Menus currency).

What to expect (asserted by `MenusDishCurrencyTest` and `MenusPackagingCalcTest`):
- The Till shows `USD 10.00` on Imported steak. A basket of Imported steak and Chapati plate: Food **1,500** (10 USD at 130 = **1,300**, plus **200**), with the note "Prices in USD are converted at today's rate (1 USD = 130 KES)". The receipt shows `USD 10.00 at 130` under the line.
- **Rounding:** with USD at **130.456**, one Tart is 3.33 × 130.456 = **434.42** (rounded once, as it is converted); three are **1,303.26**; there is no rounding line.
- **History:** with USD at 120 on the day, a tab's first Imported steak is **1,200**; add another when the rate is 135 and it is **1,350**, the first stays 1,200; the tab is **2,550** before tax.
- Imported steak and Wine together: the note lists both USD and EUR with their rates.
- Paper bag at 0.04 USD on a shilling order: **5.20**. On a USD menu a bag priced at 5 shillings is 0.04.
- On the Dishes page a dish's margin is worked out in the base currency. Meal plans and Cakes & catering stay in the base currency.

### 9H. Timers and codes (Menus, Prepared food; Menus, Kitchen; Admin, Codes)

- **A chef:** Menus, Chefs, **Chef Wanjiru** (active, shown to the public if you like).
- **Batch timers** (Prepared food, *Start a timer*): Ugali **2 kg** → says **20 minutes**; **1 kg** → **15**; **5 kg** → **40**; **6 kg** has no time row, so the box asks for minutes (type **45**). Typed minutes win over the recipe's (type 30 for 2 kg). Make the 2 kg batch from its timer with Chef Wanjiru, use-by **today + 3 days**: the timer closes and the batch is timed from when the timer started. (Asserted by `MenusPrepTimersTest`.)
- **Ticket timers:** order a **Steak sandwich** in Jumbo with the default **Choma** (5 min): the kitchen ticket shows **Plate Choma: 5 min**, counts down once the cook starts it, and goes red and says *over* when it runs out. Order another with **Wet fry** (4 min) instead: **Plate Wet fry: 4 min**. Add **Kale** (no task time) to either: nothing changes; the longest task on the ticket is its timer, not the sum. A **Chips** order has no ticket timer. (Asserted by `MenusTicketTimersTest`.)
- **Supplier barcodes** (all with a correct check digit; type them in Menus, Ingredients, *Barcode or code*): Cola **Crate of 24** `6001234560012`; Cola **Single bottle** `6001234560029`; Fanta **Crate of 24** `6001234560036`; Bottled water **Pack of 12** `6001234560043`. A wrong one to try: `6001234567890` (refused, check digit). The same code on two items is refused.
- **Scan at the stock screens** (type the code in the box and press Enter): Receive stock, scan `6001234560012` twice: Cola crate, quantity **2**. Scan `6001234560050` (a valid barcode nothing has): the screen asks which item it is. Count the shelf: scan the single bottle three times: counted **3**. What to buy: scan the Fanta crate: it is added to the order by the pack.
- **Codes page** (Admin, Codes, with Menus on): tabs **Dishes, Recipes, Prepared batches, Ingredient lots, Kitchen stock**. Codes are made from the number: the first dish is `DSH00000001`, a recipe `RCP...`, a prepared batch `PBL...`, an ingredient lot `ILT...`, a kitchen stock item without a barcode gets `KIT...` on *Give a code*. Print a QR label for **Steak sandwich**; scan it (or paste its link): the public menu opens at that dish. Print the **Ugali** recipe's QR: it opens the kitchen card (staff signed in). Print the label of the Ugali batch: `Made <day> 14:30, Chef Wanjiru`, `Batch ... use by ...`.
- **Reserved shapes:** give a kitchen item the code `DSH00000001`: refused, already used.

### 9I. Which automated test asserts which figure

| Figures | Test |
|---|---|
| Steak sandwich 650, 720, 800, Kids 350; Jumbo choma, kale, wet fry | `MenusOrderingMakeupTest`, `MenusDishSelectionTest` |
| Burger 570; fees kept apart; extra cheese stock | `MenusOrderingModifiersTest`, `MenusDishModifiersTest` |
| Packaging 4 × 15 = 60; waiver 15 and 40; shelf down 4 and 2; condiments 6 and 3 allowed | `MenusPackagingCheckoutTest`, `MenusPackagingPostingTest`, `MenusPackagingStockTest`, `MenusCondimentsTest` |
| Tip 100 on 1,160: max 40, change 40, change 140 | `MenusCounterTest` |
| Hand over, window, own tip, take back, report | `MenusTipsIssueTest`, `MenusTipsReportTest` |
| USD 10 at 130 = 1,300; 3.33 at 130.456 = 434.42; history 1,200 and 1,350; bag 5.20 and 0.04 | `MenusDishCurrencyTest`, `MenusPackagingCalcTest` |
| Ugali 20, 15 and 40 minutes; typed minutes win; ticket timer 5 minutes | `MenusPrepTimersTest`, `MenusTicketTimersTest` |
| Codes DSH, RCP, PBL, ILT, KIT; links; labels; scanning; barcodes | `MenusCodeTypesTest`, `MenusStockScanTest` |
