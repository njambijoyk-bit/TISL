# Menus: a manual walk-through (what to try, and what to watch for)

Do the parts in this order: each one needs the one before it. Tick a box only when it did what the "expect" line says. Write down anything that made you stop and think, even if it worked: that is exactly what the automated tests cannot see.

**What to watch for the whole way (the human checks)**
- Did you ever not know what to press next, or what a word meant (pack, base unit, variant, station, expo, 86)?
- After pressing something, did the screen tell you it worked, quickly? Any press that seemed to do nothing?
- Error messages: do they say what to do, in plain words?
- Empty screens: does a blank page say what to add first?
- Phone and tablet width: can you reach every button with a thumb, and does nothing run off the side?
- Light and dark theme: is every word readable?
- Try it twice as fast as feels natural (double clicks, going Back mid-way). Does anything duplicate?

## 0. Before you start
- [ ] Scripts 132 to 151, 165 and 181 to 186 have been run (Workbench, Part B then C each). `php artisan access:seed` has been run.
- [ ] The sample kitchen in `docs/MENUS_TEST_DATA.md` is entered (ingredients, opening stock, dishes, recipes). The steps below use it. Ingredients, kinds, stock (receiving, counts, transfers, waste, expiry), purchases and the stock reports are tested and are not repeated here.
- [ ] Menus is licensed and switched on (Settings, Modules). You can see **Menus** in the admin menu.
- [ ] Two test people: one **manager** (menus.view and menus.manage) and one **cashier or waiter** (menus.till only, no menus.manage). Sign in as each in a different browser.
- [ ] A branch exists and is set to sell to customers. Payment methods exist: Cash, and M-Pesa if you want to try the kiosk.

## 0a. Menus permissions (after `php artisan access:seed`)
1. Settings, Roles: under **Menus** the list now has: Change the Menus configuration; See the tips; Hand tips over to other people; Hand one's own tip over to oneself; Undo a tip handed over by mistake; Waive or remove compulsory packaging that has a price.
2. Sign in as a **chef** (menus.view and menus.manage only). Expect: Menus, Configuration opens but its fields are read-only, and saving is refused. Give the role "Change the Menus configuration": the fields work.
3. The cashier role holds See the tips and Hand tips over to other people; the manager also holds Undo a tip and Waive packaging.

## 0b. Menus currency (after the Currency setting)
1. Menus, Configuration: the **Currency** list offers the active currencies, and empty means the system's base currency. Pick a foreign one with a rate set under Currencies. Expect: Menus, Stock, Receive stock says "prices in" that currency, and so does the Opening stock sheet.
2. Receive a delivery and record some waste. Expect: the purchase voucher and the waste journal are in that currency at the rate of their date; the Books amounts in the base currency are what the lots cost. Set it back to empty and everything is in the base currency again.

## 0c. Menus configuration (after script 193)
1. Menus, Configuration: under Ingredient accounts there is **Prepared food**; empty uses Prepared Food Inventory (script 193 makes it). Tips: with no account chosen, a till tip posts to the books' Tips Payable.
2. Tips window: choose "On chosen days, between two times": the time boxes and the weekday ticks appear; "At any time" and "Never" hide them. Save and reload: the choice stays.
3. Packaging: only kinds that are marked as packaging are offered. The packaging sales account is empty by default.
4. Lists (below the settings): add servings Jumbo and Kids, audiences Adults and Kids; a repeated name is refused; Up and Down change the order; Remove deletes.
5. Policies: Free is there and is the default (its default box is greyed). Add "Removal fee 10%" as a percentage; tick The default on it: Free loses the default. The default cannot be removed or switched off.
6. Sign in as a chef: every field and button is read-only.

## 0d. Recipes of their own (after script 194; unit after 195; times after 196)
0. Where things are: Menus, Recipes. The **yield unit** and the **time by batch size** are inside a recipe's form (Add a recipe, or Edit recipe, under *Recipes of their own*). The unit box is only on recipes of their own; the times are on every recipe's form. A script not yet run shows a "run script N" notice in its place, and dish recipes keep saving meanwhile.
1. Menus, Recipes: below the dishes there is **Recipes of their own**. Add a recipe called "Tomato and onion base" with two ingredients and a method; save. Expect it in the list with its cost of a batch.
2. Add another with the same name in capitals. Expect: "There is already a recipe called ...".
3. Edit it: the name is filled in, the lines are the ones you saved. Remove it: it goes.
4. The dishes above are unchanged: their recipes, costs and "can make now" are as before, and selling a dish still uses its ingredients.
5. (after script 195) Add "Ugali" as a recipe of its own: **One batch makes** 2.5, counted in **Kilogram**; flour 800 g. Save. Expect "makes 2.5 kg", and the cost shown per batch and "per kg". Edit it and choose "portions": it goes back to portions.
7. (after script 196) On "Ugali" add times: up to 1 kg takes 15 minutes, up to 2 kg takes 20, up to 5 kg takes 40. Save and open it again: the rows are there, smallest first. The same amount twice, a zero or a row with no minutes is refused. (Nothing uses the times yet: the make-a-batch screen in 1.6 will show the estimate.)
6. The units offered are weights, volumes and pieces only (no metres), and a dish's own recipe has no unit box: it counts portions.

## 0e. Recipes in recipes and prepared food (after scripts 197 and 198)
1. Menus, Recipes, Recipes of their own: add **Tomato and onion base** (2 kg a batch: onions 400 g, tomatoes 600 g). Add **Stew** (4 portions): one line is the recipe *Tomato and onion base*, 1 kg; another is beef 800 g. Expect the stew to list "2 lines", and the amount unit of the recipe line to read kg.
2. Open the base and try to add the stew to it: refused ("it would go round in a circle"). Try to remove or switch off the base: refused ("used in Stew"). A dish's own recipe can use the base too; a dish's recipe can not be used inside another recipe.
3. Menus, Dishes: a dish whose recipe uses a recipe shows the allergens of the ingredients inside it.
4. Menus, **Prepared food** (also in the Menus tabs): choose Make a batch, recipe Ugali, size 1.5 kg. Expect the table of what it takes (recipe says, really used, on the shelf, cost) and "expected N minutes" from the time rows.
5. Change "really used" for the flour and what came out, choose a chef, set the start and finish, Make the batch. Expect: the batch in *Batches made* with the planned and made amounts, the expected and took minutes, the cost; the lot in *On the shelf*; the flour reduced in Menus, Stock by what you entered.
6. Books: a journal **Dr Prepared Food Inventory, Cr Food Ingredients Inventory** (or the kind's own stock accounts) for the cost, in the Menus currency.
7. Press Make the batch twice quickly: one batch. Try a batch bigger than the shelf: refused, nothing used.
8. Undo the batch: the ingredients are back and the journal is cancelled. A batch that has been used can not be undone, and its recipe's unit can not change.
9. A chef without `menus.manage` sees the page but not Make a batch or Undo.

## 0f. Servings cut, prepared waste and counts (after script 199)
1. Menus, Configuration: have servings (Jumbo, Medium, Kids). Menus, Prepared food, Make a batch: under *What it was cut into* add 2 Jumbo, 2 Medium, 1 Kids. Expect it under the batch as "Cut into 2 Jumbo, 2 Medium, 1 Kids". A serving not on the list, zero, a fraction or the same serving twice is refused.
2. On the shelf, **Write off** on Ugali: 0.5 kg, why Spoilage. Expect: the shelf is 0.5 kg lower; Books: **Dr Food Waste Expense, Cr Prepared Food Inventory** for 0.5 kg at the batch cost; the entry in Menus, Operations, the waste log and report, named Ugali in kg. Taking the entry back (in the waste log) puts the batch back and cancels the journal. More than the shelf holds is refused. Choosing a batch writes off from that one; otherwise the oldest use-by goes first.
3. **Count the shelf**: enter 1 kg for Ugali when the system says 1.5. Expect the difference shown in red, the count in *Counts*, the shelf at 1 kg, and one journal Dr Food Waste Expense, Cr Prepared Food Inventory for 0.5 kg. Count 2 kg when it says 1.5: a "found" batch of 0.5 kg appears on the shelf, and the journal goes the other way. Counting exactly what is there books nothing. Leave a recipe empty to skip it.
4. A batch that has been written off or counted short can no longer be undone.

## 0g. Prepared food reports (no new script)
1. Menus, Prepared food, **Reports**, *Daily reconciliation*: pick a day or a range. Expect each recipe made or on the shelf, with Opening + Made - Served - Thrown away +/- Count found = Closing, and what the made, thrown away and counted amounts were worth. Tick "One table for each day": each day starts from the closing of the day before.
2. For a range that ends today, the Closing equals the shelf on the Prepared food page. Change a batch outside the screens (a database edit) and the report says the shelf holds something else now.
3. *Chefs compared*: pick a period (and a recipe). Expect one row per recipe and chef: batches, minutes a batch (from the start and finish you noted), the expected minutes, over or under, minutes per kg, came out against planned, recipe followed (what was really used against what the recipe said), servings per kg (from the servings cut) and cost per kg. A batch with no chef is "Nobody named"; a batch without times is left out of the minutes; an undone batch is left out of everything. Recipes in different units are never added together.

## 0h. Sides (after script 200; servings after 193)
1. Menus, **Sides**, Add a side: name *Ugali*, made from the recipe *Ugali* (counted in kg), amounts written in **Gram**, in a serving 250, Jumbo 350, Kids 100. Save. Expect the list to show "Jumbo: 350 g, Kids: 100 g, Other sizes: 250 g".
2. Add *Coke*, made from a ready-to-serve ingredient, nothing else: "Every size: 1 each". An ingredient of the kind Cooking ingredient is not offered (it is not sold as it is).
3. A side needs exactly one source. A unit that measures something else (litres for a kg recipe), a zero amount, a serving twice, or the same name twice is refused.
4. Menus, Recipes: try to remove or switch off the recipe *Ugali*, or change its unit: refused while the side uses it. Menus, Ingredients: the same for Coke. Remove the side and they are free again.
5. Nothing in the till or on the dishes changes yet: dishes are built from sides in step 3.

## 1. Recipes, allergens, dishes and menus (manager)
1. **Recipes**: make a recipe for a dish (amounts in g or kg, waste %, method steps, how many portions a batch makes). Expect: cost per portion shows, and "can make" counts portions from the shelf. Watch: does the allergen from an ingredient show where you would look for it?
2. **Allergens** (G, then A): add a tag, rename it, change what it rules out and try to remove one that is in use. Expect: the dish badges follow at once, and a clear refusal for the one in use.
3. **Dishes**: add a dish with a price, a photo, allergens and one option group (Size: small, large +100). Expect: option price shows on the dish. Mark it **Sold out (86)** and back.
4. **Menus**: make a menu with two sections, put dishes in them, set the days and hours it serves. Expect: a dish whose ingredients are out (or whose made-ahead portions are out) is not offered.
5. Open the **public menu page** in a private window (no sign-in). Expect: allergens, prices, sold-out dishes greyed, options work, the page reads well on a phone.

## 2. Online order (customer, then manager)
1. In the private window add dishes, choose pickup and a time slot, pay (or pay later if on). Expect: an order number, a tracking link.
2. As manager open **Orders**: see it, move it Accepted, Ready, Completed. Expect: the customer's tracking page follows without a reload.
3. Cancel an order: the box asks for a reason. Expect: the customer is told, stock comes back. Watch: is it clear you must type a reason?

## 3. Kitchen (manager, on a tablet if you have one)
1. **Kitchen**: set up two stations (Grill, Cold). Give dishes a station. Place an order with one of each. Expect: each station's screen shows only its own tickets, the expo screen shows the whole order.
2. Press Start, Ready, Recall. Watch: are the buttons big enough to press with wet hands; are late tickets obvious?

## 4. Food till (sign in as the **cashier or waiter**: menus.till only)
1. Open **Till**. Expect: you can sell; you cannot see Recipes, Ingredients, Stock, costs, or any setup.
2. Quick sale: add dishes, pay with cash, tendered more than the total. Expect: change shown, receipt prints.
3. Open a **tab** for a table, add in rounds, move a line, split the bill, settle. Cancel a tab (a reason box appears).
4. Try to open Recipes by typing the address. Expect: you are sent back to admin, nothing shown.

## 5. Floor and tables
1. **Floor** (manager): add an area and tables, drag them, Save layout. Show a table's QR code.
2. As the waiter: Seat a table (asks how many guests), Take their order (opens the till on that table), ask for the bill, Clean.
3. As the waiter: confirm you cannot Edit the plan and cannot make a new QR code.
4. Scan a table's QR with your phone (no sign-in): order from the table. Expect: the order appears on the kitchen screen with the table name.

## 6. Kiosk
1. **Settings, Kiosks**: make a kiosk, copy its address once. Open it on a tablet. Order, pay by M-Pesa (or take cash at the till: "Take payment" on the till).
2. Walk away mid-order. Expect: it resets. Press the buttons as fast as a bored customer would.

## 7. The rest
- **Chefs**: add a chef with a certificate that is nearly expired. Expect: a warning. Public chefs page.
- **Operations**: prep list for tomorrow, record waste, what to buy (in packs, then "Make orders").
- **Make a batch** of a made-ahead dish (the cake) on the Stock page, sell a slice, and try to cancel the batch.
- **Courses, recipes and notes**: "Copy a recipe from Menus" for a recipe set to "May be shown on the website and in courses".
- **Meal plans**, **Cakes and catering** (quote, deposit, status), **Rota** (shifts, days off, swaps, overtime, clock in at the door).

## When you find a problem
For each one write: **where** (screen), **what you did**, **what you expected**, **what happened**, and a screenshot if it is visual. A one-line note is enough; I will fix them in batches.
