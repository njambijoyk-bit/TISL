# Menus: sample data to type in (ingredients, recipes, dishes, menus, a meal plan)

A small Nairobi kitchen, made so the numbers can be checked by hand. Enter it in this order, because each part needs the one before: **stock items, ingredients, dishes, recipes, menus, meal plan**. Prices are made up. Use the units your system already has (kg, g, L, mL, each / piece); if a unit is missing add it under Settings, Units.

## 1. Stock items (the real things you buy)

You do **not** need the E-commerce module or its Products screens. In Menus, Ingredients, open an ingredient and press **Make a stock item here** under the stock item search: type the name and the unit it is bought and counted in (pack, sack, kg, tray...). It is a hidden product, kept out of the shop and not for sale. Then receive the opening stock below through Purchases or Opening stock (both are in the core admin, not E-commerce), so every batch has a cost.

"Stock unit" is the unit it is counted and bought in; "holds" is how much of the ingredient's recipe unit one stock unit contains (you type this on the ingredient, step 2).

| Stock item | Stock unit | Holds | Buying price | Opening stock |
|---|---|---|---|---|
| Pembe Flour 24 kg | sack | 24,000 g | 2,400 | 0 (on purpose: tests the substitute) |
| Exe Flour 2 kg | pack | 2,000 g | 260 | 10 |
| Kabras Sugar 1 kg | pack | 1,000 g | 160 | 10 |
| Eggs tray of 30 | tray | 30 each | 450 | 4 |
| Fresh Milk 1 L | pack | 1,000 ml | 120 | 20 |
| Fresh Milk 500 ml | pack | 500 ml | 65 | 10 |
| Butter 250 g | block | 250 g | 330 | 5 |
| Cooking Oil 1 L | bottle | 1,000 ml | 340 | 6 |
| Cooking Oil 5 L | jerrycan | 5,000 ml | 1,550 | 2 |
| Beef stewing meat 1 kg | pack | 1,000 g | 800 | 6 |
| Chicken breast 1 kg | pack | 1,000 g | 650 | 1 (on purpose: runs out after 5 portions) |
| Tomatoes 1 kg | kg | 1,000 g | 120 | 8 |
| Onions 1 kg | kg | 1,000 g | 100 | 8 |
| Potatoes 1 kg | kg | 1,000 g | 90 | 15 |
| Pishori Rice 2 kg | pack | 2,000 g | 380 | 5 |
| Sukuma wiki (kale) 1 kg | kg | 1,000 g | 60 | 5 |
| Maize flour (unga) 2 kg | pack | 2,000 g | 200 | 10 |
| Salt 500 g | pack | 500 g | 40 | 4 |
| Cocoa powder 200 g | tin | 200 g | 380 | 2 |
| Baking powder 100 g | tin | 100 g | 120 | 2 |
| Tea leaves 250 g | pack | 250 g | 150 | 3 |

## 2. Ingredients (Menus, Ingredients): the grouping

One ingredient per row. "Recipes measure it in" is the unit recipes use. "Stock items" are listed in order of preference (first = preferred). Pick rule is "the preferred one" unless the last column says otherwise.

| Ingredient | Recipes measure it in | Stock items (preferred first) | Allergens | What it is | Note |
|---|---|---|---|---|---|
| Wheat flour | g | Pembe Flour 24 kg (24,000), Exe Flour 2 kg (2,000) | Wheat / gluten | Gluten | Pembe is out of stock: the flour must come from Exe |
| Sugar | g | Kabras Sugar 1 kg (1,000) | | | |
| Eggs | each | Eggs tray of 30 (30) | Eggs | Egg | |
| Milk | ml | Fresh Milk 1 L (1,000), Fresh Milk 500 ml (500) | Milk | Dairy | try pick rule "cheapest" on this one |
| Butter | g | Butter 250 g (250) | Milk | Dairy | |
| Cooking oil | ml | Cooking Oil 5 L (5,000), Cooking Oil 1 L (1,000) | | | |
| Beef | g | Beef stewing meat 1 kg (1,000) | | Meat | |
| Chicken | g | Chicken breast 1 kg (1,000) | | Poultry | |
| Tomatoes | g | Tomatoes 1 kg (1,000) | | | |
| Onions | g | Onions 1 kg (1,000) | | | |
| Potatoes | g | Potatoes 1 kg (1,000) | | | |
| Rice | g | Pishori Rice 2 kg (2,000) | | | |
| Kale | g | Sukuma wiki 1 kg (1,000) | | | |
| Maize flour | g | Maize flour 2 kg (2,000) | | | |
| Salt | g | Salt 500 g (500) | | | |
| Cocoa | g | Cocoa powder 200 g (200) | | | |
| Baking powder | g | Baking powder 100 g (100) | | | |
| Tea leaves | g | Tea leaves 250 g (250) | | Caffeine | |

## 3. Dishes (Menus, Dishes)

Prices are before tax. "Made at" needs the stations to exist first (Menus, Configuration, Kitchen stations): **Hot kitchen**, **Bar**, **Pastry**.

| Dish | Price | Takes about | Made at | Description |
|---|---|---|---|---|
| Beef stew & ugali | 650 | 20 min | Hot kitchen | Slow-cooked beef in tomato and onion gravy with ugali |
| Chicken pilau | 600 | 25 min | Hot kitchen | Spiced rice with chicken |
| Sukuma wiki & ugali | 250 | 10 min | Hot kitchen | Sautéed kale with ugali |
| Chips | 300 | 12 min | Hot kitchen | Fresh-cut potato chips. Add an option group **Portion**: Regular, Large +100 |
| Pancakes | 350 | 10 min | Pastry | Three pancakes with butter and sugar |
| Masala chai | 150 | 5 min | Bar | Milk tea with spice |
| Chocolate cake slice | 400 | 2 min | Pastry | A slice of chocolate cake (made ahead, see recipes) |

Making a dish makes its own hidden stock item. That is what a recipe makes.

## 4. Recipes (Menus, Recipes)

Quantities are per portion unless it says batch. "Waste" is added back: 5% on 200 g means 210.5 g is taken. Cost per portion uses the preferred stock item's buying price (flour at Pembe's 0.10 a gram).

**Made to order** (a sale uses the ingredients). "What it makes" = the dish, "How it is made" = Made to order.

| Recipe | Lines (amount, waste) | Cost per portion |
|---|---|---|
| Beef stew & ugali | Beef 200 g (5%), Onions 60 g, Tomatoes 100 g, Cooking oil 20 ml, Salt 3 g, Maize flour 150 g | 208.46 |
| Chicken pilau | Rice 150 g, Chicken 180 g, Onions 50 g, Cooking oil 25 ml, Tomatoes 40 g, Salt 3 g | 164.04 |
| Sukuma wiki & ugali | Kale 150 g (10%), Onions 40 g, Tomatoes 50 g, Cooking oil 15 ml, Maize flour 150 g, Salt 2 g | 40.26 |
| Chips | Potatoes 300 g (15% peeling waste), Cooking oil 60 ml, Salt 2 g | 52.32 |
| Pancakes | Wheat flour 120 g, Eggs 1, Milk 150 ml, Sugar 15 g, Butter 10 g, Cooking oil 10 ml | 64.00 |
| Masala chai | Milk 200 ml, Tea leaves 5 g, Sugar 10 g | 28.60 |

**Made ahead** (a production run). One batch makes 8 slices; "What it makes" = Chocolate cake slice; Prep 20 min, Cook 40 min.

| Recipe | Lines for the whole batch | Cost |
|---|---|---|
| Chocolate cake | Wheat flour 300 g, Sugar 250 g, Eggs 4, Butter 200 g, Cocoa 60 g, Milk 200 ml, Baking powder 10 g | 544.00 a batch, 68.00 a slice |

Method steps to type into the cake (to test the steps list): 1 Cream the butter and sugar. 2 Beat in the eggs. 3 Fold in flour, cocoa and baking powder, loosen with milk. 4 Bake at 170 degrees for 40 minutes. 5 Cool and cut into 8.

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

- Ingredients: Wheat flour shows two items; the substitute rule is visible; deleting Exe flour while a recipe uses the family is refused.
- Recipes: the costs above (to the cent when the stock items are bought at the prices in step 1). Scale the cake batch to 16: the cost doubles.
- Allergens: Pancakes show wheat, eggs and milk with no one typing them on the dish. Beef stew and Sukuma wiki show none. Sukuma wiki & ugali can be shown as vegetarian or vegan; Beef stew cannot.
- Till or kiosk, sell 3 Pancakes: the flour comes out of Exe (360 g) because Pembe is empty; eggs and milk go down by the recipe.
- Chicken pilau: sell 5, the sixth says it is sold out (1 kg holds five portions of 180 g).
- Cake: make a production run of one batch; 8 slices appear and the stock items fall by the batch quantities.
- Menus: Breakfast is offered before 11:00 and not after; the Weekend special does not show on a weekday; the dish on all three menus changes price everywhere when you change it once.
- Meal plan: the day price is 750 and a customer with the plan sees Monday's beef stew.
