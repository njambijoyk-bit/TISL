# Menus: sample data to type in (ingredients, stock, dishes, recipes, menus, a meal plan)

A small Nairobi kitchen, made so the numbers can be checked by hand. Menus now has its own stock: **ingredients** with a base unit, an alternate unit and **variants** (Exe, Pembe, Soko), bought, counted, wasted and used up as ingredients. No product and no E-commerce module is involved anywhere. Enter it in this order, because each part needs the one before:

**units, accounts, ingredients, opening stock, dishes, recipes, menus, meal plan.**

Prices are made up. Run database scripts 181 to 186 first. Every number below was checked by running this exact data through the system.

## 0. Before you start
- **Units** (Settings, Units): g and kg (mass), ml and L (volume), each (count). Add any that are missing. The alternate unit must be of the same kind as the base unit (kg for g, L for ml).
- **Menus, Configuration:** under the account selects, **Ingredient stock**, **Cost of food** and **Food waste** are empty on purpose: empty means the accounts the scripts made, **Food Ingredients Inventory** (current asset), **Food Cost of Sales** and **Food Waste Expense** (direct expenses). Choose the **Sales account for dishes** (it decides the tax). Suppliers are the ledgers under **Sundry Creditors**; make one called "Naivas Wholesale" and one called "Unga Traders".
- **Kitchen stations** (Menus, Configuration, the stations card): Hot kitchen, Bar, Pastry.

## 1. Ingredients (Menus, Ingredients)

Press **New ingredient** once per row of table 1A, then add its variants from table 1B on the same form. Save the ingredient before you go to Stock: stock is entered on **Menus, Stock**, not on this form.

**What each field on the form means**

| Field | What it does |
|---|---|
| Name | The ingredient the recipes use ("Wheat flour"). |
| Base unit | The smallest unit. Stock is kept in it (g, ml, each). |
| Alternate unit | A bigger unit of the same kind (kg for g, L for ml) for typing, buying and counting. Optional; none for things counted by the piece. |
| When there are several variants | How the kitchen picks: **the preferred one first** (top of the list, then the next), **the cheapest first**, or **the one that expires first**. |
| Variant name | The version you buy ("Exe 2 kg"). Variants are listed in order of preference; the arrows move them. |
| Code (optional) | Your own reference (supplier code, SKU). It is only kept for your records; nothing uses it yet. |
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
