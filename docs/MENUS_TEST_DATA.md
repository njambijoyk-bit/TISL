# Menus: sample data to type in (the kitchen as it is built now)

A small Nairobi kitchen, made so the numbers can be checked by hand. Menus has its own stock: **ingredients** with a base unit, an alternate unit and **variants** (Exe, Pembe, Soko), bought, counted, wasted and used up as ingredients. Dishes are made the way the program now makes them: **recipes of their own, then sides made from them, then dishes made of sides** (with sizes, slots, leaving out and extra), with packaging, tips, a currency and timers on top. Enter it in this order, because each part needs the one before:

**0 setup, 1 ingredients, 2 opening stock, 3 lists and settings, 4 recipes, 5 sides, 6 dishes, 7 menus, 8 meal plan, 9 packaging and condiments, 10 tips, 11 another currency, 12 timers, codes and scanning.** Section 13 says what to look for, and section 14 says which automated test asserts which figure.

Prices are made up. Run database scripts **181 to 214 and 225** (215 to 224 are the vendor portal and tenders, which Menus does not need), in numerical order, first (each header says what it needs; 190 to 192 are the kinds of ingredient and their accounts, 193 the Menus configuration, 200 to 203 sides and make-up, 205 to 206 leaving out and extra, 207 to 211 packaging and condiments, 212 tips, 213 dish currencies, 214 timers, 225 a recipe line naming its variant) and `php artisan access:seed`.

**How the figures were checked.** The automated test `MenusSampleKitchenTest` enters sections 1 to 6 exactly as written below (the ingredients with their variants and stock, the recipes, the sides and the dishes) and asserts the figures marked (test) in section 13: what a portion costs, which variant a sale takes from, what leaving out butter saves, the cake batch, the prices of the Steak sandwich and Burger, the allergens of the dishes. The other figures (prices of sizes and extras, packaging, tips, currencies, timers, codes) are asserted by the tests named in section 14 for the same prices. The whole of this document typed in by hand in the browser has not been run end to end: if a figure does not come out, write it down.

## 0. Before you start
- **Units** (Settings, Units): g and kg (mass), ml and L (volume), each (count). Add any that are missing. The alternate unit must be of the same kind as the base unit (kg for g, L for ml).
- **Menus, Configuration, accounts:** **Ingredient stock**, **Cost of food** and **Food waste** are empty on purpose: empty means the accounts the scripts made, **Food Ingredients Inventory** (current asset), **Food Cost of Sales** and **Food Waste Expense** (direct expenses); packaging and supplies use **Kitchen Supplies Inventory** and **Kitchen Supplies Used**, and prepared food **Prepared Food Inventory**. Choose the **Sales account for dishes** (it decides the tax). Choose the **Purchase account for ingredients** too (use **Purchases**, VAT-able 16%): it is the account an ingredient is bought under when it has none of its own. Run `189_menus_purchase_accounts.sql` first: it adds **Purchases - exempt** and **Purchases - zero rated** beside Purchases. Suppliers are the ledgers under **Sundry Creditors**; make one called "Naivas Wholesale" and one called "Unga Traders".
- **Kitchen stations** (Menus, Configuration, the stations card), add these seven: **Hot kitchen**, **Grill**, **Fryer**, **Cold station** (salads, sauces, bread), **Bar** (drinks), **Pastry** (cakes, pancakes, tea) and **Packing** (the pass: boxes, bags, condiments). Section 5 says which side goes to which station and section 6 which station makes each dish. A station's target minutes can stay at the default.
- **Payment methods** (Settings, Payment methods): Cash (with its cash ledger set, or the Tips screen has nothing to pay tips out of) and M-Pesa.
- **People** (give each a role; permissions are set in the role builder): **Manager Mo** (`menus.view`, `menus.manage`, `menus.configure`, the tips permissions including *hand one's own tip over*, *undo a tip* and *waive packaging*); **Cashier Jo** (`menus.till`, *see the tips*, *hand tips over to other people*; **not** *waive packaging*); **Waiter Wanjiku** (`menus.till`, a user, so tips can be handed to her); **Viewer** (*see the tips* only); **Chef Wanjiru** (`menus.view`, `menus.manage`, set up under Menus, Chefs).
- **Names:** where the manual test (`docs/MENUS_MANUAL_TEST.md`) says *Coke* use **Cola**, *Container* is the **Takeaway box**, *Bag* is the **Paper bag**, *Ketchup* is **Tomato ketchup**, *fries* are **Chips**, and *a burger* and *a steak sandwich* are the two dishes of section 6.


## 1. Ingredients (Menus, Ingredients)

Press **New ingredient** once per row of table 1A, then add its variants from table 1B on the same form. Save the ingredient before you go to Stock: stock is entered on **Menus, Stock**, not on this form.

**What each field on the form means**

| Field | What it does |
|---|---|
| Name | The ingredient the recipes use ("Wheat flour"). |
| Kind | What sort of thing it is: **Cooking ingredient** (used in recipes), **Ready to serve** (sold as it is: a soda), **Condiment or extra** (ketchup, salt: also used in recipes), **Packaging** (boxes, bags) or **Supplies** (gloves, soap). The kind decides which account its use is charged to and which stock account carries it. |
| Base unit | The smallest unit. Stock is kept in it (g, ml, each). |
| Alternate unit | A bigger unit of the same kind (kg for g, L for ml) for typing, buying and counting. Optional; none for things counted by the piece. |
| Purchase account (decides the VAT) | The account the tax on buying this ingredient follows, as a product's purchase account does: **Purchases - exempt** for maize flour, milk and eggs, **Purchases** (VAT-able) for cooking oil and packaged goods, **Purchases - zero rated** for zero-rated goods. Empty uses the one in Menus, Configuration. The stock is still carried on Food Ingredients Inventory and costed before tax. Opening stock is never taxed. |
| When there are several variants | How the kitchen picks: **the preferred one first** (top of the list, then the next), **the cheapest first**, or **the one that expires first**. |
| Variant name | The version you buy ("Exe 2 kg"). Variants are listed in order of preference; the arrows move them. |
| Code (optional) | Your own reference, or the supplier's **barcode** off the crate or bottle. A scanner on the Receive, Count and What to buy screens finds the item by it (section 12). A retail barcode must have its check digit right and nothing else may have the code; a code you replace still scans, marked as an old code. |
| Pack holds | How much one pack holds, with the unit beside it (kg, g, L, ml). It lets you receive and count in **packs**: 10 packs of 2 kg is 20 kg. Empty means no pack: you type kg or g instead. |
| may be used | Untick to keep the stock but never use it in a dish, not even as a substitute. |
| expires | Receiving it then asks for an expiry date. Expired stock is never used and appears on the Stock page's expiry list. |
| in use | Untick when you stop buying it: it disappears from receiving and counting, its history stays. |
| keep at least | The least you want on the shelf, in the unit beside it. Below it, Operations, What to buy suggests ordering it. Empty means no level. |
| Allergens it contains / What it is | The tick boxes. They decide the allergens and diet badges on every dish that uses the ingredient. |

**Where the allergen and "what it is" ticks come from:** the lists are kept under **Menus, Allergens** (press G, then A), not fixed in the program. The 14 allergens and 11 tags Menus always had are already there; each says which diet badges it rules out (Meat rules out vegetarian and vegan, Milk rules out vegan and dairy free, and so on). To try adding your own: on that page press **New tag**, call it **Gelatine**, tick "not vegetarian" and "not vegan", save, then tick Gelatine on an ingredient and see the dish lose its Vegetarian badge. A tag that an ingredient or a dish carries cannot be removed until it is taken off.


**1A. The ingredients**

| Ingredient | Kind | Base unit | Alternate unit | Pick rule | Allergens | What it is |
|---|---|---|---|---|---|---|
| Wheat flour | Cooking ingredient | g | kg | The preferred one first | Wheat / gluten | Gluten |
| Sugar | Cooking ingredient | g | kg | The preferred one first |  |  |
| Eggs | Cooking ingredient | each | none | The preferred one first | Eggs | Egg |
| Milk | Cooking ingredient | ml | L | **The cheapest first** | Milk | Dairy |
| Butter | Cooking ingredient | g | kg | The preferred one first | Milk | Dairy |
| Cooking oil | Cooking ingredient | ml | L | The preferred one first |  |  |
| Beef | Cooking ingredient | g | kg | The preferred one first |  | Meat |
| Chicken | Cooking ingredient | g | kg | The preferred one first |  | Poultry |
| Tomatoes | Cooking ingredient | g | kg | The preferred one first |  |  |
| Onions | Cooking ingredient | g | kg | The preferred one first |  |  |
| Potatoes | Cooking ingredient | g | kg | The preferred one first |  |  |
| Rice | Cooking ingredient | g | kg | The preferred one first |  |  |
| Kale | Cooking ingredient | g | kg | The preferred one first |  |  |
| Maize flour | Cooking ingredient | g | kg | The preferred one first |  |  |
| Salt | Condiment or extra | g | kg | The preferred one first |  |  |
| Cocoa | Cooking ingredient | g | kg | The preferred one first |  |  |
| Baking powder | Cooking ingredient | g | kg | The preferred one first |  |  |
| Tea leaves | Cooking ingredient | g | kg | The preferred one first |  | Caffeine |
| Cheddar cheese | Cooking ingredient | g | kg | The preferred one first | Milk | Dairy |
| Burger bun | Cooking ingredient | each | none | The preferred one first | Wheat / gluten | Gluten |
| Mayonnaise | Condiment or extra | ml | L | The preferred one first | Eggs | Egg |
| Tomato ketchup | Condiment or extra | ml | L | The preferred one first | | |
| Ketchup sachet | Condiment or extra | each | none | The preferred one first | | |
| Cola | Ready to serve | each | none | **The cheapest first** | | |
| Fanta | Ready to serve | each | none | The preferred one first | | |
| Bottled water | Ready to serve | each | none | The preferred one first | | |
| Takeaway box | Packaging | each | none | The preferred one first | | |
| Paper bag | Packaging | each | none | The preferred one first | | |
| Foil sheet | Packaging | each | none | The preferred one first | | |
| Disposable gloves | Supplies | each | none | The preferred one first | | |
| Dish soap | Supplies | ml | L | The preferred one first | | |

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
| Cheddar cheese | 1 | Block 1 kg | | 1 kg | ✓ | **✓** | ✓ | |
| Burger bun | 1 | Pack of 6 | | 6 each | ✓ | **✓** | ✓ | |
| Mayonnaise | 1 | Jar 1 L | | 1 L | ✓ | **✓** | ✓ | |
| Tomato ketchup | 1 | Ketchup bottle 1 L | | 1 L | ✓ | **✓** | ✓ | |
| Ketchup sachet | 1 | Box of 500 | | 500 each | ✓ | – | ✓ | |
| Cola | 1 | Crate of 24 | | 24 each | ✓ | **✓** | ✓ | 24 each |
| Cola | 2 | Single bottle | | 1 each | ✓ | **✓** | ✓ | |
| Fanta | 1 | Crate of 24 | | 24 each | ✓ | **✓** | ✓ | |
| Bottled water | 1 | Pack of 12 | | 12 each | ✓ | **✓** | ✓ | |
| Takeaway box | 1 | Pack of 50 | | 50 each | ✓ | – | ✓ | 50 each |
| Paper bag | 1 | Pack of 100 | | 100 each | ✓ | – | ✓ | |
| Foil sheet | 1 | Roll of 100 | | 100 each | ✓ | – | ✓ | |
| Disposable gloves | 1 | Box of 100 | | 100 each | ✓ | – | ✓ | 100 each |
| Dish soap | 1 | Bottle 5 L | | 5 L | ✓ | – | ✓ | |

What the bold cells are there to show:
- **Pembe 24 kg** is first in order but will have no stock, so flour comes from Exe (the next in order).
- **Soko 1 kg, may be used off:** it has stock but the kitchen never takes it.
- **Jogoo 2 kg, in use off:** it is not offered when you receive or count stock.
- **Eggs, Butter, Beef, Chicken expire:** receiving them asks for an expiry date.
- **Milk, the cheapest first:** Fresh 1 L (0.12 a ml) beats Fresh 500 ml (0.13 a ml).
- **Keep at least:** Salt (1 kg, but 500 g on the shelf) shows up on "What to buy"; Exe (6 kg, with 20 kg on the shelf) and Eggs (60, with 120) do not.
- **Cola, the cheapest first:** the crate (50 each) beats the single bottle (60 each).
- **Salt, Mayonnaise, Tomato ketchup** are kind Condiment or extra: they are used in recipes and can be given free at the till. **Cola, Fanta, Bottled water** are Ready to serve: they are sold as they are, as sides. **Takeaway box, Paper bag, Foil sheet** are Packaging; **gloves and soap** are Supplies.
- Ketchup's variant is called *Ketchup bottle 1 L* (not *Bottle 1 L*) so that it is not confused with the cooking oil's bottle when you search or scan.

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
| Cheddar block 1 kg | 3 | packs | 900 | | today + 30 days | 3,000 g |
| Pack of 6 (Burger bun) | 10 | packs | 120 | | today + **5 days** | 60 each |
| Jar 1 L (Mayonnaise) | 2 | packs | 450 | | today + 90 days | 2,000 ml |
| Ketchup bottle 1 L | 3 | packs | 360 | | today + 120 days | 3,000 ml |
| Box of 500 (Ketchup sachet) | 2 | packs | 750 | | | 1,000 each (1.50 each) |
| Cola, Crate of 24 | 3 | packs | 1,200 | | today + 90 days | 72 each (50 each) |
| Cola, Single bottle | 6 | packs | 60 | | today + 90 days | 6 each |
| Fanta, Crate of 24 | 2 | packs | 1,150 | | today + **5 days** | 48 each |
| Bottled water, Pack of 12 | 4 | packs | 480 | | today + 200 days | 48 each (40 each) |
| Takeaway box, Pack of 50 | 4 | packs | 500 | | | 200 each (10 each) |
| Paper bag, Pack of 100 | 2 | packs | 400 | | | 200 each (4 each) |
| Foil sheet, Roll of 100 | 2 | packs | 250 | | | 200 each (2.50 each) |
| Disposable gloves, Box of 100 | 3 | packs | 350 | | | 300 each (3.50 each) |
| Dish soap, Bottle 5 L | 2 | packs | 900 | | | 10 L |

Try this too: type the same Exe stock as **20 kg** (In: kg, price 130 a kg) instead of 10 packs and see that the shelf shows the same 10 packs. Type half of the table, reload the page, and see the rows still there and counted. Jogoo 2 kg is not on the sheet, because it is not "in use" (it shows faded on the Stock page's shelf table).

The rows add up to **52,500.00**: **46,350.00** on Food Ingredients Inventory and **6,150.00** on Kitchen Supplies Inventory (the boxes 2,000.00, bags 800.00, foil 500.00, gloves 1,050.00 and soap 1,800.00). Each row is one Opening stock voucher, never taxed. If you entered stock before script 192, cancel those vouchers and enter them again.

## 3. Lists and settings (Menus, Configuration)

The three lists below are kept under **Menus, Configuration**, below the settings. Sizes, audiences and policies are data you can change; the program names none of them.

| List | Entries |
|---|---|
| Sizes (servings) | **Medium**, **Jumbo**, **Kids** (in this order) |
| Who a dish is for (audiences) | **Adults**, **Kids** |
| Prices for leaving out or asking for extra (policies) | **Free** (a free policy, the default one), **Fee 20** (a fixed fee, amount 20), **Ten percent** (a percentage, amount 10) |

Packaging, tips and currency settings are in sections 9 to 11, where they are used.

## 4. Recipes of their own (Menus, Recipes, *Recipes of their own*)

**The rule: one recipe for each thing that is cooked in its own pot.** Ugali, stewed beef and sukuma wiki are cooked separately, so each is a recipe of its own, and a plate that has them is made of the three sides (section 6). Things cooked together in one pot are **one** recipe: the rice and the chicken of a pilau are one recipe, not two. The same ingredient may be in several recipes (beef is in the stewed beef, the Choma, the Wet fry and the Burger) because each is prepared differently and in its own amount; stock is counted per ingredient, so beef is taken from the shelf by what each recipe uses.

Quantities are for one portion unless the table says "one batch makes". **Waste %** is added back: 5% on 200 g means 210.5 g is taken from the shelf. The cost on the Recipes screen is worked out from the prices in section 2 (a pack's price divided by what it holds; where an ingredient has several variants on the shelf it is the quantity-weighted average of what is there, so cooking oil is about 0.32 a ml and milk about 0.122).

**The side comes with the recipe.** A new recipe of its own also makes a **side** of the same name, so it is ready to go on a plate. Under the steps the form shows **Not a simple meal: save only the recipe** (unticked) and a **Station** box, and a panel, **The side**, with the same fields as the side form: how much is in a serving, plating minutes, a note, the amount for each size (Jumbo, Kids) and packaging. Tick *Not a simple meal* for a base, a marinade or anything that is only part of something else: the panel goes away and only the recipe is saved (Tomato and onion base, Stew). If a side of that name already exists the whole save is refused with a message saying so, and nothing is kept. Editing a recipe later never makes a side. The **dish** is made on the Dishes screen from the sides (section 6); a dish made of sides never needs a recipe of its own, and the Recipes page shows no "Write recipe" button for it. Beef pilau, Mandazi and Cheese omelette are the three to enter this way: type the recipe, leave *Not a simple meal* unticked, choose the station of section 5, save, then make the dish in section 6 with one **Plate** slot holding the side.

**What to fill in on every recipe.** Besides the lines: *How it is made* (made to order or in batches), *One batch makes* (with its unit), **Prep minutes** and **Cook minutes** (what the kitchen is told to expect), and the **method steps**, each step with its own minutes. Where the length depends on how much is made (ugali), add **Times**: up to this amount, this many minutes. Open each recipe and check that the steps, their minutes and the prep and cook times are shown on the recipe card.

**Which variant a line takes.** Every ingredient line has a **Variant** box. It starts on **Automatic (the ingredient's pick rule)**, and under it the screen says which variant that is **now** at the branch shown ("Takes now: Exe 2 kg" for the flour, "Takes now: Fresh 1 L" for the milk, because milk is set to the cheapest first). Open the box to choose another variant, each listed with what is left of it; variants that may not be used (Soko) are not offered. A chosen variant is taken **first**, and if it runs short the rest comes by the pick rule; the recipe's cost uses that variant's price. Variants are only shown, never chosen for you, when the box says Automatic. To try it, copy the Masala chai recipe as **Masala chai (500 ml milk)** and choose **Fresh 500 ml** for the milk.

**Made to order** (selling it uses the ingredients; "How it is made" is "Made to order", the default). The last column is the cost of one portion on the Recipes screen (asserted by `MenusSampleKitchenTest`).

| Recipe | Lines (amount, waste) | Prep / cook | Method steps (minutes) | Cost per portion |
|---|---|---|---|---|
| Stewed beef | Beef 200 g (5%), Onions 60 g, Tomatoes 100 g, Cooking oil 20 ml, Salt 3 g | 10 / 90 min | 1 Brown the beef in the oil (10). 2 Add the onions, tomatoes and salt and cook down (10). 3 Cover and simmer until the beef is tender (70). | 193.09 |
| Chicken pilau (rice and chicken in one pot) | Rice 150 g, Chicken 180 g, Onions 50 g, Cooking oil 25 ml, Tomatoes 40 g, Salt 3 g | 15 / 40 min | 1 Fry the onions in the oil until golden (8). 2 Add the chicken, tomatoes and salt and brown (12). 3 Stir in the rice and water, cover and cook until dry (20). | 163.57 |
| Beef pilau (rice and beef in one pot) | Rice 150 g, Beef 150 g, Onions 50 g, Cooking oil 25 ml, Tomatoes 40 g, Salt 3 g | 15 / 45 min | 1 Fry the onions in the oil until golden (8). 2 Add the beef, tomatoes and salt and brown (12). 3 Stir in the rice and water, cover and cook until dry (25). | 166.57 |
| Mandazi | Wheat flour 100 g, Sugar 20 g, Milk 60 ml, Cooking oil 40 ml, Baking powder 3 g | 20 / 10 min | 1 Mix the flour, sugar and baking powder, then the milk, and knead (10). 2 Rest the dough, roll and cut into triangles (10). 3 Deep fry until golden (10). | 39.97 |
| Cheese omelette | Eggs 2, Cheddar cheese 20 g, Butter 10 g, Salt 1 g | 3 / 5 min | 1 Beat the eggs with the salt (2). 2 Melt the butter, pour in the eggs, add the cheese and fold (4). | 61.28 |
| Sukuma wiki | Kale 150 g (10%), Onions 40 g, Tomatoes 50 g, Cooking oil 15 ml, Salt 2 g | 5 / 10 min | 1 Fry the onions and tomatoes in the oil (5). 2 Add the chopped kale and salt and cook until soft (5). | 24.98 |
| Chips | Potatoes 300 g (15% peeling waste), Cooking oil 60 ml, Salt 2 g | 10 / 12 min | 1 Peel, cut and dry the potatoes (10). 2 Fry until golden (12). | 51.20 |
| Pancakes | Wheat flour 120 g, Eggs 1, Milk 150 ml, Sugar 15 g, **Butter 10 g, tick *may be left out***, Cooking oil 10 ml | 5 / 10 min | 1 Whisk the batter (5). 2 Fry in the oil and butter (10). | 67.71 (the flour is Exe at 0.13 a gram, Pembe being empty) |
| Masala chai | Milk 200 ml, Tea leaves 5 g, Sugar 10 g | 2 / 5 min | 1 Boil the milk with the tea leaves (5). 2 Sweeten and strain (1). | 29.00 |
| Bread | Wheat flour 60 g | | | |
| Choma | Beef 150 g, Salt 2 g | | 1 Grill over the coals (15). | |
| Wet fry | Beef 120 g, Onions 30 g, Cooking oil 15 ml | | | |
| Kale | Kale 100 g, Onions 20 g | | | named *Kale*, like the ingredient: a recipe and an ingredient may share a name |
| Egg | Eggs 1 | | | |
| Ketchup portion | Tomato ketchup 30 ml | | | |
| Mayo portion | Mayonnaise 20 ml | | | |
| Burger | Burger bun 1, Beef 120 g, **Cheddar cheese 20 g (tick *may be left out* and *may be asked for extra*)**, **Onions 10 g (tick *may be left out* only)**, Cooking oil 5 ml | | | |
| Tomato and onion base (2 kg, counted in Kilogram) | Onions 400 g, Tomatoes 600 g | | | |
| Stew (4 portions) | the recipe *Tomato and onion base* 1 kg; Beef 800 g | | | a recipe inside a recipe is taken whole: the base has no leave-out ticks |

**Made ahead** ("How it is made" is "Made ahead in batches"; a batch is made and its portions go on the prepared shelf).

| Recipe | One batch makes | Lines for the whole batch | Notes |
|---|---|---|---|
| Ugali | **2 kg** (counted in Kilogram) | Maize flour 800 g | Cost **40.00** a kilogram, so a 250 g plate is **10.00**. **Times:** up to 1 kg 15 min, up to 2 kg 20 min, up to 5 kg 40 min. Method: 1 Boil the water (5 min). 2 Stir in the flour (20 min). Make a batch before you sell a plate that has ugali (section 13D): the plates take it from the batch. |
| Chocolate cake | **8** portions, prep 20 min, cook 40 min | Wheat flour 300 g, Sugar 250 g, Eggs 4, Butter 200 g, Cocoa 60 g, Milk 200 ml, Baking powder 10 g | The Recipes screen says **69.18** a slice (the shelf average); making the batch costs **553.00**, which is **69.13** a slice, because it takes the flour from Exe and the milk from the 1 L packs. Method: 1 Cream the butter and sugar. 2 Beat in the eggs. 3 Fold in flour, cocoa and baking powder, loosen with milk. 4 Bake at 170 degrees for 40 minutes. 5 Cool and cut into 8. Set "Who may see it" to "May be shown on the website and in courses" to test copying it to Courses. |

Open **Chips** and **Ugali** and check the "one batch makes" unit. Open **Pancakes**: the butter line shows its *may be left out* tick, the others do not.

## 5. Sides (Menus, Sides)

A side is one thing a plate is made of. It is made from **a recipe**, or from **one ready-to-serve ingredient** (a Cola); an ingredient of the kind Cooking ingredient (flour, beef) is not offered as a side, it is not sold as it is. The **Station** column is the station to choose on the side (Made at); it decides which station's screen the side shows on. *Amounts* are in the side's own unit: "in a serving" is the amount for any size that has none of its own.

**The sides of the classic dishes.** Each pot is a side made from the recipe of the same name, one serving each (Ugali is in the next table, it is the starch of two dishes):

| Side | Made from | In a serving | Jumbo | Kids | Plating or reheating (minutes) | Station |
|---|---|---|---|---|---|---|
| Stewed beef | recipe Stewed beef | 1 | | | | Hot kitchen |
| Chicken pilau | recipe Chicken pilau | 1 | | | | Hot kitchen |
| Beef pilau | recipe Beef pilau | 1 | | | | Hot kitchen |
| Mandazi | recipe Mandazi | 1 | | | | Fryer |
| Cheese omelette | recipe Cheese omelette | 1 | | | | Hot kitchen |
| Sukuma wiki | recipe Sukuma wiki | 1 | | | | Hot kitchen |
| Pancakes | recipe Pancakes | 1 | | | | Pastry |
| Masala chai | recipe Masala chai | 1 | | | | Bar |
| Chocolate cake | recipe Chocolate cake (a slice is 1 portion of the 8) | 1 | | | | Pastry |
| Chips | recipe Chips | **1** | **1.5** | | | Fryer |

**The sides to put plates together from:**

| Side | Made from | In a serving | Jumbo | Kids | Plating or reheating (minutes) | Station |
|---|---|---|---|---|---|---|
| Ugali | recipe Ugali, written in **Gram** | 250 g | 350 g | 100 g | 3 | Hot kitchen |
| Bread | recipe Bread | 1 | | | | Cold station |
| Choma | recipe Choma | 2 | | 1 | **5** | Grill |
| Wet fry | recipe Wet fry | 1 | | | 4 | Hot kitchen |
| Kale | recipe Kale | 1 | | | | Hot kitchen |
| Egg | recipe Egg | 1 | | | | Hot kitchen |
| Ketchup | recipe Ketchup portion | 1 | | | | Cold station |
| Mayo | recipe Mayo portion | 1 | | | | Cold station |
| Stew | recipe Stew | 1 | | | | Hot kitchen |
| Burger | recipe Burger | 1 | | | | Grill |
| Cola | the ready-to-serve ingredient Cola | 1 each | | | | Bar |

## 6. Dishes (Menus, Dishes)

Every dish is **made of sides**, put in **slots**. A dish has its own price (before tax); "Made at" is the station. A slot is **always included** (fixed), **choose one**, **choose any**, a **free extra** or a **paid extra**. A dish sold in sizes has a price for each size; a size that has none of its own is not sold.

**The classic dishes.** Each has one slot, **Plate**, always included, holding the side of the same name, except the two with ugali, which have two slots, **Main** and **Starch**, both always included:

| Dish | Price | Takes about | Made at | Description |
|---|---|---|---|---|
| Beef stew & ugali | 650 | 20 min | Hot kitchen | *Main:* Stewed beef. *Starch:* Ugali. Slow-cooked beef in tomato and onion gravy with ugali |
| Chicken pilau | 600 | 25 min | Hot kitchen | Spiced rice with chicken |
| Beef pilau | 650 | 25 min | Hot kitchen | Spiced rice with beef, cooked in one pot. **New recipe, side made with it, dish made on the Dishes screen.** |
| Mandazi | 80 | 10 min | Fryer | Fried dough triangles. **New recipe, side made with it, dish made on the Dishes screen.** |
| Cheese omelette | 300 | 8 min | Hot kitchen | Two eggs with cheddar. **New recipe, side made with it, dish made on the Dishes screen.** |
| Sukuma wiki & ugali | 250 | 10 min | Hot kitchen | *Main:* Sukuma wiki. *Starch:* Ugali. Sautéed kale with ugali |
| Chips | 300 | 12 min | Fryer | *Sizes:* **Medium 300**, **Jumbo 400** (a Jumbo takes 1.5 portions of the Chips side). Replaces the old "Large +100" choice. |
| Pancakes | 350 | 10 min | Pastry | Three pancakes with butter and sugar. Under *Leaving out and extra*, **Butter, leave out** with the policy **Free**. |
| Masala chai | 150 | 5 min | Bar | Milk tea with spice |
| Chocolate cake slice | 400 | 2 min | Pastry | A slice of chocolate cake (made ahead) |

**The dishes with a make-up:**

| Dish | Price | Made at | Make-up and rules |
|---|---|---|---|
| **Steak sandwich** | 500 | Grill | *Sizes:* Jumbo 650, Kids 350. *For:* Adults and Kids. *Slots:* **Bread** (always included: Bread); **Protein** (choose one: Choma, the default, or Wet fry **+50**); **Greens** (choose any, fewest 0, most 2: Kale **+20**); **Sauces** (free extra, most 2: Ketchup, Mayo); **Drink** (free extra, most 2: Cola); **Extras** (paid extra, most 3: Egg **+40**). |
| **Burger** | 500 | Grill | *Slot:* **Plate** (always included: Burger). *For:* Adults only. *Leaving out and extra:* **extra Cheddar cheese with Ten percent**; **leave out Onions with Fee 20**. (The Burger recipe's ticks of section 4 are what offer these.) |
| **Stew meal** | 650 | Hot kitchen | *Slots:* **Main** (always included: Stew); **Starch** (always included: Ugali). No sizes. For the packaging tests. |

## 7. Menus (Menus, Menus)

| Menu | Days | Hours | Sections and their dishes |
|---|---|---|---|
| Breakfast | all seven | 06:00 to 11:00 | **Pancakes and tea**: Pancakes, Masala chai, Mandazi, Cheese omelette |
| Lunch & dinner | all seven | 11:00 to 22:00 | **Mains**: Beef stew & ugali, Chicken pilau, Beef pilau, Sukuma wiki & ugali, Steak sandwich, Burger, Stew meal. **Sides**: Chips. **Drinks**: Masala chai |
| Bakery | all seven | all day (leave the hours empty) | **Cakes**: Chocolate cake slice |
| Weekend special | Sat, Sun | 12:00 to 16:00 | **Sunday roast**: Chicken pilau, Chips |

Masala chai sits on three menus on purpose: the same dish can be on several. The currency dishes of section 11 go on Lunch & dinner, Mains.

## 8. A meal plan (Menus, Meal plans)

**Office lunch**: "A main and a chai, delivered to your desk".
- Price for each delivery day **750** (the two dishes would cost 800 apart).
- Menu repeats after **1** week; deliveries Mon to Fri; fewest days a week **3**; skip up to **24** hours before; delivery from 12:00 until 13:00.
- Day by day (each day: the main plus Masala chai): Monday Beef stew & ugali, Tuesday Chicken pilau, Wednesday Sukuma wiki & ugali, Thursday Beef stew & ugali, Friday Chicken pilau.
- Set the plan Active only when the days are filled in.

## 9. Packaging and free condiments (Menus, Configuration; Menus, Sides; Menus, Dishes)

- **Menus, Configuration:** choose **Packaging** as the packaging kind. Packaging prices (one unit each): **Takeaway box 15**, **Paper bag 5**; leave the currency on Menus and the account on the dishes' account. The Foil sheet has **no price**, on purpose. Keep *A fee carries the dish's VAT* on.
- **Rules to enter first** (Menus, Sides, Edit **Stew**, *Packaging*): **Takeaway box**, 2, *For each dish*, compulsory, charged, receipt *When charged*; **Foil sheet**, 1, *For each dish*, free, receipt *When charged*.
- **Rules to add during the tests** (manual 0v and 0z): on the dish **Stew meal**, **Paper bag**, 1, *Once for the order* (free, receipt *Always*); then a **Takeaway box**, 1, on the dish itself (it replaces what the side says about the box for that dish). For 0z set the box's receipt to *Never*.
- **Free condiments** (Menus, Dishes, **Chips**, *Packaging*, *Free condiments*): **Tomato ketchup 2**, **Mayonnaise 1**.
- **People:** a **cashier** whose role does *not* hold "Waive or remove takeaway packaging that is compulsory and has a price", and a **manager** whose role does.

What to expect (asserted by `MenusPackagingPostingTest` and `MenusPackagingCheckoutTest`):
- Take out **two Stew meals**: Container **4** (2 each, 15 each = **60**), Foil **2** (free). Before tax: **1,300** (two meals) **+ 60 = 1,360**; with 16% VAT **1,577.60**. Dining in: no packaging list.
- Cashier presses − on the container: refused, red note. Manager: amber note, **Take** works, **15.00** waived and logged. Swapping the container for the bag (4 × 15 asked, 4 × 5 charged) waives **40**.
- After the sale the shelf is down by **4** boxes and **2** foil sheets, in one journal "Packaging used for ..." (Dr Kitchen Supplies Used, Cr Kitchen Supplies Inventory).
- Three **Chips** with the free condiments: **Ketchup 6** and **Mayonnaise 3** allowed. Give 9 ketchup: a warning "9 Ketchup given, 6 allowed", not a block; the shelf loses 9 ketchup (what was given).
- The kitchen ticket: `PACK: ...` (blue) and `GIVE: ...` (green) lines; Operations, *Packaging* report: orders, asked, given, left off, waived.

## 10. Tips (Menus, Configuration; Menus, Tips)

- **Menus, Configuration:** tips account empty (the books' Tips Payable). Tips window **At any time** to begin with; for 0af step 4 change it to **Every day between** two times that do not include now, and back.
- **People:** *Cashier Jo*, *Waiter Wanjiku*, *Manager Mo*, *Viewer* and the owner, as in section 0. Cash must have its cash ledger set (Settings, Payment methods) or the Tips screen offers nothing to pay out of.
- **Tips to make** (Till, **Take out**, pay in cash): 1. two Burgers, label **Window**, tip **200**, hand over 1,400 (bill 1,160). 2. a tab **Table 4** with one Chips (Medium, 300) paid at the end with tip **50**. 3. one Burger with **no tip**. After 1 and 2, Menus, Tips, *Pending* lists two tips (200 and 50), *Today* the same.

What to expect (asserted by `MenusCounterTest`, `MenusTipsIssueTest` and `MenusTipsReportTest`):
- A bill of **1,160** (two Burgers, 1,000 + 16%). Tip **100**: Bill 1,160, Tip 100, Total **1,260**. Hand over **1,200**: refused, "the tip can be at most **40.00**". Hand over **1,300**: change **40.00**. The same 1,300 with no tip: change **140.00**.
- A tip is credited to tips payable on the sale; its line reads like `Tip, MO-000012, Window`. Pending tips never expire.
- **Issue** the 200 to Waiter Wanjiku out of Cash with the narration "Weekend share": one journal, Dr tips payable 200, Cr Cash 200; it moves from Pending to Today. A second press from another tab says it was already handed over, no second journal.
- Outside the window: the Issue buttons are greyed and it says when the window opens.
- Hand a tip to *yourself* as Manager Mo: the box wants a narration. The cashier choosing themselves is refused.
- **Take back** the 200 with the reason "Wrong person": the journal is cancelled, the tip is Pending again, and it can be handed over again. The *Report* tab then shows Taken back **1**.

## 11. Another currency (Settings, Currencies; Menus, Dishes)

**Read first:** script 213 writes orders in the Menus currency. Leave **Menus, Configuration, Currency empty** (or on the currency you sell in) before you run it.

- **Currencies:** add **USD** with a rate of **130** (1 USD = 130 in the base currency), and **EUR** at 140. For the history test give USD **120** from the first of this month and **135** from tomorrow.
- **Dishes** (each has a Plate slot with a side made from a one-line recipe of its own, or a ready-to-serve side; *Price currency* is on the dish form once 213 is run): **Imported steak**, price **10**, currency **USD**; **Tart**, price **3.33**, currency **USD**; **Wine**, price **20**, currency **EUR**; **Chapati plate**, price **200**, no currency of its own. Put them on Lunch & dinner, Mains.
- **Packaging price in a foreign currency:** give the Paper bag **0.04** in **USD** (the Takeaway box stays 15 in the Menus currency).

What to expect (asserted by `MenusDishCurrencyTest` and `MenusPackagingCalcTest`):
- The Till shows `USD 10.00` on Imported steak. A basket of Imported steak and Chapati plate: Food **1,500** (10 USD at 130 = **1,300**, plus **200**), with the note "Prices in USD are converted at today's rate (1 USD = 130 KES)". The receipt shows `USD 10.00 at 130` under the line.
- **Rounding:** with USD at **130.456**, one Tart is 3.33 × 130.456 = **434.42** (rounded once, as it is converted); three are **1,303.26**; there is no rounding line.
- **History:** with USD at 120 on the day, a tab's first Imported steak is **1,200**; add another when the rate is 135 and it is **1,350**, the first stays 1,200; the tab is **2,550** before tax.
- Imported steak and Wine together: the note lists both USD and EUR with their rates.
- Paper bag at 0.04 USD on a shilling order: **5.20**. On a USD menu a bag priced at 5 shillings is 0.04.
- On the Dishes page a dish's margin is worked out in the base currency. Meal plans and Cakes & catering stay in the base currency.

## 12. Timers, codes and scanning (Menus, Prepared food; Menus, Kitchen; Admin, Codes)

- **A chef:** Menus, Chefs, **Chef Wanjiru** (active, shown to the public if you like).
- **Batch timers** (Prepared food, *Start a timer*): Ugali **2 kg** says **20 minutes**; **1 kg** **15**; **5 kg** **40**; **6 kg** has no time row, so the box asks for minutes (type **45**). Typed minutes win over the recipe's (type 30 for 2 kg). Make the 2 kg batch from its timer with Chef Wanjiru, use-by **today + 3 days**: the timer closes and the batch is timed from when the timer started. (Asserted by `MenusPrepTimersTest`.)
- **Ticket timers:** order a **Steak sandwich** in Jumbo with the default **Choma** (5 min): the kitchen ticket shows **Plate Choma: 5 min**, counts down once the cook starts it, and goes red and says *over* when it runs out. Order another with **Wet fry** (4 min) instead: **Plate Wet fry: 4 min**. Add **Kale** (no task time) to either: nothing changes; the longest task on the ticket is its timer, not the sum. A **Chips** order has no ticket timer. (Asserted by `MenusTicketTimersTest`.)
- **Supplier barcodes** (all with a correct check digit; type them in Menus, Ingredients, *Barcode or code*): Cola **Crate of 24** `6001234560012`; Cola **Single bottle** `6001234560029`; Fanta **Crate of 24** `6001234560036`; Bottled water **Pack of 12** `6001234560043`. A wrong one to try: `6001234567890` (refused, check digit). The same code on two items is refused.
- **Scan at the stock screens** (type the code in the box and press Enter): Receive stock, scan `6001234560012` twice: Cola crate, quantity **2**. Scan `6001234560050` (a valid barcode nothing has): the screen asks which item it is. Count the shelf: scan the single bottle three times: counted **3**. What to buy: scan the Fanta crate: it is added to the order by the pack.
- **Codes page** (Admin, Codes, with Menus on): tabs **Dishes, Recipes, Prepared batches, Ingredient lots, Kitchen stock**. Codes are made from the number: the first dish is `DSH00000001`, a recipe `RCP...`, a prepared batch `PBL...`, an ingredient lot `ILT...`, a kitchen stock item without a barcode gets `KIT...` on *Give a code*. Print a QR label for **Steak sandwich**; scan it (or paste its link): the public menu opens at that dish. Print the **Ugali** recipe's QR: it opens the kitchen card (staff signed in). Print the label of the Ugali batch: `Made <day> 14:30, Chef Wanjiru`, `Batch ... use by ...`.
- **Reserved shapes:** give a kitchen item the code `DSH00000001`: refused, already used.

## 13. What to look for once it is in

"(test)" after a figure means `MenusSampleKitchenTest` or another automated test asserts it for the same data (section 14); the rest is arithmetic or what the screen should say.

### 13A. Stock and ingredients
- Menus, Stock shows Exe at 10 packs, 20 kg, 20,000 g; Pembe at nothing; Jogoo faded (not in use). Receiving a delivery (say 5 packs of Exe at 260 from Naivas Wholesale) is a **Purchase voucher** in Books with a line for the variant (Dr Food Ingredients Inventory, Cr Naivas Wholesale) and 10,000 g more on the shelf; it is also listed under Purchases. Cancelling that voucher takes the stock off again, unless some was used.
- Deleting an ingredient that a recipe uses, or a variant with stock history, is refused. Move **Wheat flour** to Packaging: refused, "It is in a recipe".
- **Opening stock** (arithmetic): all rows together are **52,500.00**: **46,350.00** on Food Ingredients Inventory and **6,150.00** on Kitchen Supplies Inventory (boxes 2,000.00, bags 800.00, foil 500.00, gloves 1,050.00, soap 1,800.00).
- **Menus, Ingredients, Kinds:** five kinds, each with its ledger and stock ledger. The counts with this data: Cooking ingredient **19**, Condiment or extra **4** (Salt, Mayonnaise, Tomato ketchup, Ketchup sachet), Ready to serve **3**, Packaging **3**, Supplies **2** (31 ingredients). The Ingredients page filters by each kind. Remove Supplies: refused (it has ingredients). Add a kind without picking its ledger: Save stays off.
- **Recipes:** open any recipe and look at the ingredient list. It offers the cooking ingredients and the condiments (Salt, Mayonnaise, Tomato ketchup, Ketchup sachet); it does **not** offer Cola, Fanta, water, boxes, bags, foil, gloves or soap.
- **Allergens, Menus, Allergens:** Milk shows "not vegan, not dairy free"; Wheat / gluten shows "not gluten free"; each shows how many ingredients carry it: **Milk 3** (Milk, Butter, Cheddar cheese), **Wheat / gluten 2** (flour, bun), **Eggs 2** (Eggs, Mayonnaise), **Dairy 3**. Add Gelatine as in section 1; try to remove Milk and be refused while ingredients carry it.

### 13B. What a dish tells (test)
A dish made of sides inherits its allergens, tags and diets from **every side in every slot**, because any of them can end up on the plate. Nobody types them on the dish.
- Pancakes show **wheat, eggs and milk** (tags gluten, egg, dairy).
- Beef stew & ugali shows no allergens, the tag meat, and cannot be shown vegetarian. Sukuma wiki & ugali shows no allergens and can be shown vegetarian (the dish takes them from its Sukuma wiki and Ugali sides).
- The Steak sandwich shows **wheat** (bread) and **eggs** (the egg side, the mayonnaise), even though a guest takes only one protein. The Burger shows **wheat** and **milk**. A dish with a Cola side is complete (a ready-to-serve ingredient says what it is). A dish with no recipe and no sides is unknown and claims no diet.

### 13C. Selling
- **Portion costs on the Recipes screen (test):** Stewed beef 193.09, Chicken pilau 163.57, Beef pilau 166.57, Mandazi 39.97, Cheese omelette 61.28, Sukuma wiki 24.98, Chips 51.20, Pancakes 67.71, Masala chai 29.00, one slice of cake 69.18, a kilogram of Ugali 40.00 (a 250 g plate 10.00). So a Beef stew & ugali plate costs 203.09 and a Sukuma wiki & ugali plate 34.98.
- **The three simple dishes (test):** two Beef pilau take 300 g of beef (6,000 g falls to 5,700 g) and 300 g of rice (10,000 g to 9,700 g), all in one recipe. Three Mandazi take 300 g of flour from Exe and 60 g of sugar. One Cheese omelette takes 2 eggs, 20 g of cheese and 10 g of butter, and shows the allergens eggs and milk. Check also that the shortcut gave each the side and the dish with the right station, and that saving a Beef pilau recipe a second time with the shortcut does not make a second side.
- **Dishes page (test):** a dish made of sides does not say "No recipe yet": it says **Made of Stewed beef, Ugali**, with its cost (Beef stew & ugali **203.09**, margin 446.91, 31.2% food cost; Sukuma wiki & ugali 34.98) worked out from the plate as it comes: everything in an always-included slot and the default choice of the others, never the optional extras. The Recipes page lists such a dish as "Made of ... (their recipes, under Sides)", and the prep list (Operations) calls it "Made of sides" and adds the ingredients of its made-to-order sides to what to buy.
- **Beef stew & ugali (test):** after making the Ugali batch (13D), sell 2: the beef comes from the shelf (200 g each, 210.5 g with the waste, so 421 g in all) and **500 g of ugali from the batch** (2 kg falls to 1.5 kg); no maize flour is taken at the sale, because it was taken when the batch was made (800 g, so Unga goes from 20,000 g to 19,200 g).
- **A named variant (test):** Masala chai costs 29.00 with the milk on Automatic. The copy with the milk named as **Fresh 500 ml** costs **30.60** (200 ml at 0.13: 26.00 + 3.00 + 1.60), and three of them take 600 ml from the 500 ml packs and nothing from the 1 L packs (the 500 ml packs go from 5,000 ml to 4,400 ml).
- **Three Pancakes (test):** the Till or kiosk sells them; the flour comes out of **Exe** (360 g, so Exe goes from 20,000 g to 19,640 g, because Pembe is empty); Soko stays at 5,000 g (it is switched off as a substitute); eggs go from 120 to 117; the milk (150 ml × 3 = 450 ml) comes from the 1 L packs because milk is set to "the cheapest first" (19,550 ml left, the 500 ml packs untouched); butter goes from 1,250 g to 1,220 g. Books gets one journal: Dr Food Cost of Sales, Cr Food Ingredients Inventory.
- **Three Pancakes with No butter (test):** the butter stays at 1,250 g (10 g a pancake saved); the rest of the pancake is still made (flour 19,640 g).
- **Chicken pilau (test):** sell 5, the sixth is refused ("Not enough Chicken: need 180 g, have 100.", 1 kg holds five portions of 180 g) and the till shows the dish as sold out. Cancel one of the five sales and the chicken comes back.
- **Chips (test):** a Medium takes 300 g of potatoes (352.9 g from the shelf with the 15% peeling waste added back), a **Jumbo 450 g** (529.4 g): half as much again. Jumbo is 400, Medium 300.
- **Steak sandwich (test):** Jumbo with the default Choma **650**. Wet fry and Kale: **720** (650 + 50 + 20). Two Eggs as well: **800**. **Kids**: **350**. Free extras (a Cola, a Ketchup) cost nothing: the Cola takes 1 each off the shelf (the crate, 50 each, goes from 72 to 71, the cheapest pick) and the ketchup 30 ml (3,000 to 2,970).
- **Burger (test):** with **Extra cheese** and **No onion**: **570** (500, plus 10% of 500 for the cheese, plus 20 for the onion). Plain: **500**. The sale takes **40 g** of Cheddar (20 + 20 extra), no onion, one bun and 120 g of beef. On a dish sold in sizes the percentage is of the size's price, not of the dish's own price.
- Online, the Menu page shows the Steak sandwich "from 350", with each size's price and who it is for; choosing **Kids** under *For* hides the Burger (Adults only) and keeps the Steak sandwich and the Chips (for everyone). A paid extra: after the third Egg the button goes.
- A ticket for the Steak sandwich in Jumbo shows `Jumbo`, then `- Bread`, `- Choma`, `- Egg x2`.

### 13D. Making ahead (test)
- **Ugali first:** Menus, Stock, Make a batch (or Prepared food): Ugali, **2 kg**, which is 8 plates of 250 g. The maize flour falls by 800 g and 2 kg appears on the prepared shelf. Do this before selling the two dishes with ugali.
- Menus, Stock, Make a batch: Chocolate cake, 8 portions. The flour, sugar, eggs, butter, cocoa, milk and baking powder fall by the batch quantities; the batch costs **553.00**, and 8 slices appear on the prepared shelf at **69.13** each (the till can sell 8). Nothing else is booked until the slices are sold. Selling a slice takes it from the shelf (7 left). Cancelling the batch is refused once any slice is sold.
- The journals: the batch is Dr Prepared Food Inventory, Cr Food Ingredients Inventory; selling a slice is Dr Food Cost of Sales, Cr Prepared Food Inventory.

### 13E. Waste, counts, branches, expiry, buying
- **Operations, Waste:** waste 1 kg of Beef as "Spoilage": the shelf drops by 1,000 g and Books gets Dr Food Waste Expense, Cr Food Ingredients Inventory for its cost (800). "Take back" returns it and cancels the journal. Waste 2 Chips as "Plate waste": potatoes, oil and salt come off. Waste 3 cake slices as "Made too much": the slices go. Waste 1 crate of Cola as Spoilage: 24 each leave and Books gets Dr Food Waste Expense 1,200.00.
- **Stock, Count stock** (a sheet like Opening stock, one row per variant with what the books say): count Exe as 9 packs and the row says -2,000 g; save, and it is a loss of 1 pack (2 kg), booked to Food Waste Expense. Count it as 11 packs: stock found, a new lot at the last cost. Type 0 where nothing is left; rows you leave empty are not touched. The count is a **Stock count** under Purchases, Stock counts. Count Disposable gloves as 2 boxes (the row says -100 each): saved, it is a shortfall of 350.00 charged to **Kitchen Supplies Used** (credit Kitchen Supplies Inventory), not to waste: supplies are used up on purpose. Count the Cola short instead and that is a loss to Food Waste Expense.
- **Purchases, Transfers:** send 3 packs of Exe to the second branch. It stays in transit until the other branch receives it (receive 2 packs only and the missing one is written off to Food Waste Expense). Send 1 crate of Cola: it arrives with its cost (50 each) and expiry. Stock, *Send to a branch* does the same for a quick send. Purchases, Expiring stock lists the ingredient lots too.
- **Buying:** Purchases, New purchase, search "cola": the crate and the single bottle show under it; buy 2 crates at 1,200 with 16% VAT on Purchases. The breakdown shows the VAT and the stock rises by 48 each.
- **Expiry:** Menus, Stock shows "Expired or expiring this week": the **eggs (4 days), the Fanta (5) and the Burger bun (5)**. The Cola, the ketchup, the mayonnaise and the cheese do not appear.
- **Operations, What to buy:** Salt appears (under its level of 1 kg, it has 500 g) as 1 pack, from the supplier it was last received from; a week of expected sales also asks for flour, in whole packs of Pembe (the preferred variant). Waste 250 gloves as Other: gloves are at 50 each, under the 100 you keep, so it asks for a box. "Make orders" raises one Purchase Order per supplier in Books.
- **Prep list:** after a few days of sales, tomorrow's list shows what to make (cake) and what is short.

### 13F. Menus, plans and courses
- Breakfast is offered before 11:00 and not after; the Weekend special does not show on a weekday; the dish on all three menus changes price everywhere when you change it once.
- Meal plan: the day price is 750 and a customer with the plan sees Monday's beef stew.
- Courses, Recipes: the Chocolate cake appears (it is set to public); copying it gives a lesson with the ingredients (in grams and millilitres) and the five steps. Change the recipe in Menus and "Update the copy" takes the fresh version.

### 13G. Packaging, tips, currency, timers and codes
What to expect is written under each of sections 9 to 12.

## 14. Which automated test asserts which figure

| Figures | Test |
|---|---|
| The shortcut (recipe, side and dish in one form; nothing kept when refused; no second side) | `MenusRecipeToPlateTest` |
| A recipe line naming its variant: what is taken, the cost, top-up by the rule, refusals, what the Recipes screen offers | `MenusRecipeVariantPinTest`, `MenusSampleKitchenTest` |
| Sections 1 to 6 entered as written: portion costs, Beef stew & ugali taking the stew from the shelf and the ugali from the batch, Pancakes taking Exe and the cheapest milk, No butter, the sixth Chicken pilau refused, Jumbo Chips, the cake batch 553.00 and 69.13, the Steak sandwich 650, 720, 800 and 350, free extras taken off the shelf, the Burger 570 and its stock, the allergens of dishes made of sides | `MenusSampleKitchenTest` |
| Steak sandwich make-up, Jumbo choma, kale, wet fry | `MenusOrderingMakeupTest`, `MenusDishSelectionTest` |
| Burger fees kept apart; extra cheese stock | `MenusOrderingModifiersTest`, `MenusDishModifiersTest` |
| Packaging 4 × 15 = 60; waiver 15 and 40; shelf down 4 and 2; condiments 6 and 3 allowed | `MenusPackagingCheckoutTest`, `MenusPackagingPostingTest`, `MenusPackagingStockTest`, `MenusCondimentsTest` |
| Tip 100 on 1,160: max 40, change 40, change 140 | `MenusCounterTest` |
| Hand over, window, own tip, take back, report | `MenusTipsIssueTest`, `MenusTipsReportTest` |
| USD 10 at 130 = 1,300; 3.33 at 130.456 = 434.42; history 1,200 and 1,350; bag 5.20 and 0.04 | `MenusDishCurrencyTest`, `MenusPackagingCalcTest` |
| Ugali 20, 15 and 40 minutes; typed minutes win; ticket timer 5 minutes | `MenusPrepTimersTest`, `MenusTicketTimersTest` |
| Codes DSH, RCP, PBL, ILT, KIT; links; labels; scanning; barcodes | `MenusCodeTypesTest`, `MenusStockScanTest` |

Not asserted by any test: the opening-stock totals (52,500.00, 46,350.00 and 6,150.00), the ingredient counts per kind, the Stew recipe that holds another recipe, the screens themselves, and the whole document typed in by hand in a browser.
