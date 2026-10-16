# Menus: sample data to type in (ingredients, stock, dishes, recipes, menus, a meal plan)

A small Nairobi kitchen, made so the numbers can be checked by hand. Menus now has its own stock: **ingredients** with a base unit, an alternate unit and **variants** (Exe, Pembe, Soko), bought, counted, wasted and used up as ingredients. No product and no E-commerce module is involved anywhere. Enter it in this order, because each part needs the one before:

**units, accounts, ingredients, opening stock, dishes, recipes, menus, meal plan.**

Prices are made up. Run database scripts 181 to 185 first.

## 0. Before you start
- **Units** (Settings, Units): g and kg (mass), ml and L (volume), each (count). Add any that are missing. The alternate unit must be of the same kind as the base unit (kg for g, L for ml).
- **Menus, Configuration:** the three accounts are pre-filled with **Food Ingredients Inventory** (current asset), **Food Cost of Sales** and **Food Waste Expense** (direct expenses). Choose the **sales account** dishes are booked under (it decides the tax). Suppliers are the ledgers under **Sundry Creditors**; make one called "Naivas Wholesale" and one called "Unga Traders".
- **Stations** (Menus, Configuration): Hot kitchen, Bar, Pastry.

## 1. Ingredients (Menus, Ingredients)

One row per ingredient. "Base / bigger" is the base unit and the alternate unit. Each variant is a line in the ingredient, **in order of preference** (the first is taken first). "Pack" is how much one pack holds (typed in the bigger unit). Prices are what one pack costs; the cost of a gram is price / pack size.

| Ingredient | Base / bigger | Variants, preferred first (pack, price) | Notes |
|---|---|---|---|
| Wheat flour | g / kg | **Pembe 24 kg** (24 kg, 2,400), **Exe 2 kg** (2 kg, 260), **Soko 1 kg** (1 kg, 140; untick "may be used") | Allergen: wheat (gluten). Pembe is empty on purpose, so flour comes from Exe |
| Sugar | g / kg | Kabras 1 kg (1 kg, 160) | |
| Eggs | each | Tray of 30 (30, 450); tick "expires" | Allergen: eggs |
| Milk | ml / L | Fresh 1 L (1 L, 120), Fresh 500 ml (0.5 L, 65) | Allergen: milk. Try the pick rule "the cheapest first" on this one |
| Butter | g / kg | Block 250 g (250 g, 330); expires | Allergen: milk |
| Cooking oil | ml / L | Jerrycan 5 L (5 L, 1,550), Bottle 1 L (1 L, 340) | |
| Beef | g / kg | Stewing meat 1 kg (1 kg, 800); expires | |
| Chicken | g / kg | Breast 1 kg (1 kg, 650); expires | |
| Tomatoes | g / kg | Tomatoes 1 kg (1 kg, 120) | |
| Onions | g / kg | Onions 1 kg (1 kg, 100) | |
| Potatoes | g / kg | Potatoes 1 kg (1 kg, 90) | |
| Rice | g / kg | Pishori 2 kg (2 kg, 380) | |
| Kale | g / kg | Sukuma wiki 1 kg (1 kg, 60) | |
| Maize flour | g / kg | Unga 2 kg (2 kg, 200) | |
| Salt | g / kg | Salt 500 g (500 g, 40); "keep at least" 1 kg | Under its level on purpose: shows on "What to buy" |
| Cocoa | g / kg | Cocoa tin 200 g (200 g, 380) | |
| Baking powder | g / kg | Tin 100 g (100 g, 120) | |
| Tea leaves | g / kg | Pack 250 g (250 g, 150) | |

## 2. Opening stock (Menus, Stock, Opening stock)

Type it in **packs** (that is the point: counting packs is quick). It is booked against the opening balance account, so choose one under Books, Settings first. Give the expiry date for the ones that expire (use a date three weeks ahead; make the eggs expire in **4 days** to see the expiry list).

| Variant | Packs | That is |
|---|---|---|
| Pembe 24 kg | 0 (leave it out) | |
| Exe 2 kg | 10 | 20 kg |
| Soko 1 kg | 5 | 5 kg |
| Kabras 1 kg | 10 | 10 kg |
| Eggs tray of 30 | 4 | 120 eggs |
| Fresh 1 L | 20 | 20 L |
| Fresh 500 ml | 10 | 5 L |
| Butter block | 5 | 1,250 g |
| Jerrycan 5 L | 2 | 10 L |
| Bottle 1 L | 6 | 6 L |
| Beef stewing meat | 6 | 6 kg |
| Chicken breast | 1 | 1 kg (runs out after 5 portions, on purpose) |
| Tomatoes / Onions | 8 / 8 | |
| Potatoes | 15 | |
| Pishori rice | 5 | 10 kg |
| Sukuma wiki | 5 | |
| Unga | 10 | 20 kg |
| Salt 500 g | 1 | 500 g |
| Cocoa tin / Baking powder tin | 2 / 2 | |
| Tea leaves | 3 | |

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

Quantities are per portion unless it says batch. "Waste" is added back: 5% on 200 g means 210.5 g is taken from the shelf. The cost is per gram or ml as in step 1; where an ingredient has several variants on the shelf, the cost is the average of what is there.

**Made to order** (selling it uses the ingredients). Untick nothing; "made to order" is the default.

| Recipe | Lines (amount, waste) | Cost per portion, about |
|---|---|---|
| Beef stew & ugali | Beef 200 g (5%), Onions 60 g, Tomatoes 100 g, Cooking oil 20 ml, Salt 3 g, Maize flour 150 g | 207.9 |
| Chicken pilau | Rice 150 g, Chicken 180 g, Onions 50 g, Cooking oil 25 ml, Tomatoes 40 g, Salt 3 g | 163.3 |
| Sukuma wiki & ugali | Kale 150 g (10%), Onions 40 g, Tomatoes 50 g, Cooking oil 15 ml, Maize flour 150 g, Salt 2 g | 39.8 |
| Chips | Potatoes 300 g (15% peeling waste), Cooking oil 60 ml, Salt 2 g | 50.5 |
| Pancakes | Wheat flour 120 g, Eggs 1, Milk 150 ml, Sugar 15 g, Butter 10 g, Cooking oil 10 ml | 67.3 (with Exe flour at 0.13 a gram) |
| Masala chai | Milk 200 ml, Tea leaves 5 g, Sugar 10 g | 28.6 |

**Made ahead** (a batch is made, the portions go on the dish's own shelf). Untick "made to order"; yield **8** portions, prep 20 min, cook 40 min.

| Recipe | Lines for the whole batch | Cost |
|---|---|---|
| Chocolate cake | Wheat flour 300 g, Sugar 250 g, Eggs 4, Butter 200 g, Cocoa 60 g, Milk 200 ml, Baking powder 10 g | about 553 a batch, 69 a slice |

Method steps for the cake: 1 Cream the butter and sugar. 2 Beat in the eggs. 3 Fold in flour, cocoa and baking powder, loosen with milk. 4 Bake at 170 degrees for 40 minutes. 5 Cool and cut into 8. Set the cake's visibility to "may be shown on the website and in courses" to test copying it to Courses.

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
- Menus, Stock shows Exe at 10 packs, 20 kg, 20,000 g; Pembe at nothing. Receiving a delivery (say 5 packs of Exe at 260 from Naivas Wholesale) puts a supplier bill in Books (Dr Food Ingredients Inventory, Cr Naivas Wholesale) and 10,000 g on the shelf. Cancelling that receipt takes it off again, unless some was used.
- Deleting an ingredient that a recipe uses, or a variant with stock history, is refused.

**Selling**
- Allergens: Pancakes show wheat, eggs and milk with no one typing them on the dish. Beef stew and Sukuma wiki show none. Sukuma wiki & ugali can be shown vegetarian; Beef stew cannot.
- Till or kiosk, sell 3 Pancakes: the flour comes out of **Exe** (360 g, because Pembe is empty); eggs, milk, sugar, butter and oil go down by the recipe. Books gets one journal: Dr Food Cost of Sales, Cr Food Ingredients Inventory.
- Chicken pilau: sell 5, the sixth says it is sold out (1 kg holds five portions of 180 g). Cancel one of the five sales and the chicken comes back.
- Pancakes with "No butter": 10 g less butter is used.
- Chips, Large: 150 g more potatoes are used and 100 is added to the price.

**Making ahead**
- Menus, Stock, Make a batch: Chocolate cake, 8 portions. The flour, sugar, eggs, butter, cocoa, milk and baking powder fall by the batch quantities; 8 slices appear on the dish's own shelf (the till can sell 8). Nothing is booked until the slices are sold. Selling a slice takes it from the shelf; cancelling the batch is refused once any slice is sold.

**Waste, counts, branches, expiry, buying**
- Operations, Waste: waste 1 kg of Beef as "Spoilage": the shelf drops by 1,000 g and Books gets Dr Food Waste Expense, Cr Food Ingredients Inventory for its cost (800). "Take back" returns it and cancels the journal. Waste 2 Chips as "Plate waste": potatoes, oil and salt come off. Waste 3 cake slices as "Made too much": the slices go.
- Stock, Count stock: count Exe as 9 packs: a loss of 1 pack (2 kg), booked to Food Waste Expense. Count it as 11 packs: stock found, a new lot at the last cost.
- Stock, Send to a branch (needs a second branch): send 2 packs of Exe; the other branch shows them, with the cost and expiry unchanged.
- Stock shows "Expired or expiring this week": the eggs (4 days).
- Operations, What to buy: Salt appears (under its level of 1 kg, it has 500 g) as 1 pack, from the supplier it was last received from; a week of expected sales also asks for flour, in whole packs of Pembe (the preferred variant). "Make orders" raises one Purchase Order per supplier in Books.
- Prep list: after a few days of sales, tomorrow's list shows what to make (cake) and what is short.

**Menus and plans**
- Breakfast is offered before 11:00 and not after; the Weekend special does not show on a weekday; the dish on all three menus changes price everywhere when you change it once.
- Meal plan: the day price is 750 and a customer with the plan sees Monday's beef stew.

**Courses**
- Courses, Recipes: the Chocolate cake appears (it is set to public); copying it gives a lesson with the ingredients (in grams and millilitres) and the five steps. Change the recipe in Menus and "Update the copy" takes the fresh version.
