# Menus: a manual walk-through (what to try, and what to watch for)

Do the parts in this order: each one needs the one before it. Tick a box only when it did what the "expect" line says. Write down anything that made you stop and think, even if it worked: that is exactly what the automated tests cannot see.

**Where the newer parts are (Steps 1 to 9).** Sections 0c to 0l: recipes, prepared food, sides and the dish make-up. 0m to 0q: stock following sides, ordering with sizes and picks, tickets, paid extras, the guided dish screen. 0r to 0t: what a customer may leave out or add. 0u to 0ab: packaging (prices, rules, the list at the till, waiving, the bill and the shelf, the receipt and packers' ticket, free condiments, the report). 0ac: the tips box tables. 0ad: the tip box at payment. 0ae: a tip waits in the tips box. 0af: the tips screen and handing a tip over. 0ag: your own tip and taking a tip back. 0ah: the tips report. 0ai: a dish in another currency. 0aj: batch timers and ticket timers. 0ak: codes for the kitchen. The scripts are listed in docs/MENUS_DISHES_PLAN.md under section 6; run them in numerical order.

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

## 0i. Sides from today's dishes (after script 201)
1. Menus, Sides: a banner says how many dishes have a recipe but no side. Choose **Make sides from the dishes' recipes**: a list shows each dish, the side it becomes and its recipe (lines, made to order or ahead). Nothing is changed until you press **Make the sides**.
2. After it: Menus, Recipes, *Recipes of their own* has a copy of each dish's recipe (the same lines, method and times, counted in portions, the note says where it came from), and Menus, Sides has a side of that name, 1 portion in a serving. The dishes' own recipes, costs and "can make now" are exactly as before, and a sale still takes the same stock.
3. Press it again (or reload): "Nothing to do". Remove a side and press again: only that side is made again from the copy that is there. A dish with no recipe gets nothing. A name already used by a recipe, a side or another dish gets "(from the dish)" added.

## 0j. Selling through sides (after scripts 200 and 201 and "Make sides from the dishes' recipes")
Do this on test dishes first. The switch is Menus, Configuration, *Selling through sides*; it is off until you turn it on, and can be turned off again at any time.
1. Read the check under the switch: dishes with a recipe but no side (they keep selling as before), sides whose recipe differs from the dish's own (selling follows the side's recipe), and portions of a dish made ahead still on the old dish shelf (not sold once it is on).
2. **Made to order, switch off:** sell 2 of a dish: the same ingredients leave as always. **Switch on:** sell 2 again: the same ingredients leave, now through the side's recipe (change the amount in the copied recipe under *Recipes of their own* and the sale follows the copy). Set the side's amount in a serving to 2: one sold dish takes two portions of the recipe. Cancel the sale: the ingredients are back and the journal is cancelled.
3. **Made ahead, switch on:** make a batch of the side's recipe on the Prepared food page, then sell the dish: the prepared batch goes down (soonest use-by first), and the books show **Dr Food Cost of Sales, Cr Prepared Food Inventory**. Selling more than is on the prepared shelf is refused ("Make a batch on the Prepared food page first"); an expired batch does not count. Cancel the sale: the batch goes back, once.
4. The till's "can make now" and the dish cost follow the side while the switch is on. With the switch on, making a batch of that dish on the Stock page is refused (use the Prepared food page); writing the dish off comes off the prepared batches and shows under the dish's name in the waste log.
5. A dish with no side, or a side that is switched off, sells exactly as before even with the switch on. Turn the switch off again: everything goes back to the dish's own recipe and the old shelf.

## 0k. Dish make-up (after script 202; needs sides from 200 and sizes and audiences from 193)
1. Menus, Dishes, a dish, **Make-up**. *Sizes and their prices*: give Jumbo 650 and Kids 350; leave a size empty and the dish is not sold in it. *Who it is for*: tick Adults.
2. Add slots to a steak sandwich: **Bread** (always included, the side Bread); **Protein** (choose one: Choma, to begin with, and Wet fry adding 50); **Sauces** (free extra, most 2: Ketchup, Mayo); **Extras** (paid extra: Egg at 40). Save, close and open it again: everything is as left, in the same order. Slots move up and down.
3. An always-included or free side shows "no extra charge". A choose-one slot needs two sides and only one chosen to begin with; a paid extra needs a price; a side twice in a slot, a switched-off side, a fewest above the most, or more chosen to begin with than allowed is refused with a message, and nothing is changed.
4. Menus, Sides: a side that is in a dish's make-up can not be removed or switched off ("take it out there first"). Deleting a dish that was never sold takes its make-up with it.
5. Nothing in the till changes yet: the till and the online menu still use the dish's own price and Choices. The make-up is what step 3's ordering reads.

## 0l. Dish picks and the order line (after script 203)
The rules and the order line behind the sections below. What can be checked with them:
1. After running script 203, the order lines table has the size and picks columns; orders as they are today are unchanged (a line with no make-up has none).
2. The backend tests (`MenusDishSelectionTest`) show the rules: a steak sandwich in Jumbo (650) or Kids (350), choose-one protein (wet fry +50), choose-any greens (fewest 1, most 2, spinach +20), free sauces up to 2, paid eggs up to 3 (40 each); and that selling a dish whose line carries side rows takes exactly the same ingredients as before.

## 0m-. The Menus tab row
The tabs run in four groups with a small label between them: Selling (Till T, Floor F, Orders O, Meal plans M, Cakes & catering C); Back of house (Kitchen K, Operations P, Chefs H, Rota R); Build the menu, from raw to plate (Ingredients & Supplies I, Stock W, Recipes E, Prepared food B, Sides S, Dishes D, Menus N, Allergens A); and Setup (Configuration, F12). Press G, then the letter, to go to a page. Stock moved from S to W and Sides took S; Prepared food is B.

## 0m. Stock follows the sides (after scripts 200, 202, 203; sides made from recipes of their own)
Set up a steak sandwich with the make-up from 0k, each side with a recipe or ingredient and some stock on the shelf.
1. Sell one in Jumbo with the sides chosen to begin with (till, then the Stock page). Only the sides' ingredients come off the shelf (the bread's, the choma's, the kale's), in the amounts for that size; the dish's own recipe, if it still has one, is not taken as well. Sell one in Kids: the choma amount is smaller.
2. A side made ahead (Prepared food page: make a batch first): selling it takes prepared portions, soonest use-by first; selling more than the shelf holds is refused with "Not enough ... prepared" and nothing is taken.
3. A ready-to-serve side (a soda): its stock goes down by the number picked.
4. Cancel a sale: every side comes back, once; cancelling twice puts nothing back twice.
5. Menus, Dishes: *Can serve* for a dish with a make-up is how many the sides allow. Run the bread out and it shows 0 and the dish is sold out; run out of one of two choose-one sides and the dish can still be sold with the other.

## 0n. Ordering with a size and picks (no script)
1. Till: tap the steak sandwich. A box asks the **size** (required) and then each slot: the bread is shown as coming with it; *Protein* is pick one; *Greens* is at least 1 up to 2; sauces and *Extras* have a − and + for how many. A side that has run out is greyed and says "sold out". The button shows the price as it changes (size + what each pick adds), and cannot be pressed while something required is missing.
2. Add it, add another with different picks: two lines. Send, pay: the receipt and the books' sales order carry the size and the sides.
3. Make a side run out, then order a dish that needs it (or two dishes that need the same flour): the order is refused with "... has run out: please choose something else" and nothing is sold.
4. The same picker is used online (Menu page, Choose), at the kiosk and at a table QR, and the price is the same in all of them. A dish with no make-up still goes straight in with one tap.

## 0o. Tickets, receipts and screens
1. The kitchen screen shows the dish, then the size in bold and each side below it, indented ("- Bread", "- Wet fry", "- Egg x2"). The printed ticket shows the same.
2. The receipt prints the size and the sides under the dish line, then any choices and the note. The till's tab, Menus, Orders and the customer's order page show them too.

## 0p. Paid extras on an open tab
1. Open a tab with a steak sandwich. Under its line each paid extra shows a button "+ Egg 40.00". Tap it: the extra is its own line (round 2) in the kitchen, the tab total goes up by 40.00 plus tax, and the egg's stock goes down.
2. Keep tapping: after the slot's most (counting any eggs ordered with the dish) the button disappears and the till says no more can go with it. An extra can be taken off (X) before the kitchen starts it. An extra has no extras of its own.

## 0q. Guided dish screen and the public menu
1. Menus, Dishes, **New dish, guided**: name and price, **Next**; sizes and audience, **Next**; *What is in it*: tick sides, or **Make a new side** (name, made to order or ahead, the ingredients and amounts for one serving): the side is made with its recipe at once and ticked; **Next**: the slots; **Next**: choices (a button opens the older choices screen after saving); **Next**: packaging (nothing yet); **Finish** saves the make-up. **Guided** on an existing dish does the same from step 2.
2. A side whose recipe fails (no ingredient, a name already used) is not made, and no half-made recipe is left behind.
3. The online Menu page: a dish with sizes shows "from 350" and each size with its price, who it is for, and *What comes with it*. With audiences set, a *For* row appears; choosing Kids hides the dishes meant for Adults only and keeps those for everyone.

## 0r. What a customer may leave out or add (after script 205)
1. Menus, Recipes, open the recipe of a burger (made to order). Under each ingredient line there are two ticks: *The customer may leave it out* and *The customer may ask for extra*. Tick *leave it out* on the onion and both on the cheese. Save, open it again: they are as left.
2. A line that is another recipe (a tomato base) has no ticks: it is taken whole.
3. Switch the recipe to *Made ahead in batches*: the ticks are cleared and greyed, with a note why. A recipe saved that way cannot carry them.
4. Without script 205 the ticks are not there and a note says which script to run; recipes save as before.
5. Nothing changes on an order yet: what a removal or an extra costs comes in 4.2, and choosing them in 4.3.

## 0s. What leaving out or extra costs (after scripts 205 and 206)
1. Menus, Configuration, *Lists*: policies. Make *Fee 20* (a fixed fee, 20) and *Ten percent* (a percentage, 10). *Free* is the default. Menus, Configuration also has *A fee carries the dish's VAT* (on to begin with).
2. Menus, Dishes, a burger whose recipe has cheese ticked both ways and onion ticked *leave it out*, then **Modifiers**. It lists *Cheese, leaves it out*, *Cheese, asks for extra*, *Onion, leaves it out*, each on the default policy (no charge). Give the extra cheese *Ten percent*: it says "10% = 50" at a price of 500. Save, close and open it again: as left.
3. A dish made of sides (Make-up) also lists the ticked ingredients of those sides' recipes, with the side named under *From*. Un-tick an ingredient on the recipe and it leaves the list.
4. Make another policy the default: items on no policy of their own follow it. A policy a dish uses cannot be deleted or switched off ("prices removals or extras on 1 dish").
5. The guided screen's *Modifiers* step shows the same list (the make-up is saved when you press Next from *What comes with it*).
6. Nothing is charged on an order yet: choosing a removal or an extra, and its fee, comes in 4.3.

## 0t. Leaving out and extra on an order (after scripts 205 and 206)
Set up the burger of 0s: *Ten percent* on the extra cheese, *Fee 20* on leaving out the onion.
1. Till (or the online menu, kiosk, table QR): tap the burger. The box has *Leave out or add*: "No cheese", "Extra cheese +50", "No onion +20" at a price of 500. Ticking "Extra cheese" while "No cheese" is ticked swaps them. The button shows 570 with the extra cheese and no onion.
2. Add it and pay. The kitchen ticket and the receipt show "Extra cheese" and "No onion" under the dish, with the fees. Stock afterwards: the onion is not used; the cheese goes down by the recipe's 20 g plus 20 g more for the extra.
3. With a size (Jumbo 650), the extra cheese costs 10% of 650, not of the dish's own price and not of what sides add.
4. Menus, Configuration: switch *A fee carries the dish's VAT* off. Choose an income account with no tax under *Fees kept apart are booked to*. Order the same burger: the dish is 500 and the fees are a second line "Modifier fee: Burger" on the order and in the books, posted to that account; the total is the same, but the fee carries no VAT. With no account of its own it uses the dish sales account (which carries tax), and with no sales account either the order says to choose one.
5. Order more extra cheese than the shelf holds (the recipe's need plus the extras): the order is refused with "There is not enough Cheese left for the extra".
6. The tab: a tab keeps the choices and fees; adding to it, splitting it and paying it all give the same totals.

## 0u. Packaging prices (after script 207)
1. Menus, Ingredients & Supplies: make two items of the kind *Packaging* (a container and a bag, counted *each*) and one of another kind (soap). Menus, Configuration: choose *Packaging* as the packaging kind and save.
2. Further down the page, *Packaging prices* lists the container and the bag, not the soap. Give the container 15 and the bag 5.5 (one unit each, not a pack), leave the currency on Menus and the account on the dishes' account. Save, reload: as left. Empty the bag's price and save: it is off the list.
3. Choose a currency or a sales account for one row, save: it is kept. A price of 0 or below, or an account that carries no tax setup, is refused with a message, and nothing is changed.
4. Move the bag to another kind (Ingredients & Supplies): its row stays but is greyed out and can not be edited. Choose another packaging kind in Configuration: the container greys out too, and the items of that kind are listed. Choose Packaging again: the prices are back, as they were.
5. Without script 207 the card says which script to run. Nothing on an order changes yet: what packaging goes with what comes in 5.2.

## 0v. Packaging rules (after scripts 207 and 208)
With the container (priced 15) and the bag (priced 5) from 0u, and a foil sheet of the packaging kind with no price.
1. Menus, Sides, Edit the stew: under *Packaging* add the container, count 2, *For each dish*, compulsory, charged, receipt *When charged*. Add the foil: it can only be free (the *Charged* box is greyed, with a note). Save, reload: as left.
2. Menus, Dishes, a meal, **Packaging**: add the bag, count 1, *Once for the order*. Add a container with count 1 too: this is the dish's own rule, and it replaces what the sides say about the container for this dish.
3. A count of 0 or 100, the same item twice, an item of another kind, or charging an item that is not on the price list is refused with a message, and nothing is changed.
4. Move the bag to another kind: its rule shows in a note, "kept but not used", and is not offered for editing. Moving it back brings it back.
5. Delete a side or a dish that has rules: its rules go with it. An item that is on the price list or in a rule cannot be deleted from Ingredients ("take it out there first").
6. The guided screen's last step is *Packaging* and shows the same rules for the dish.
7. Nothing is added to an order yet: the checkout list comes in 5.3 and 5.4.

## 0w. The packaging list at the till (after scripts 207 to 209)
With the stew's rule from 0v (container, 2 for each dish, compulsory, charged; foil, 1 for each dish, free).
1. Till: take out two meals, **Pay**. The payment box has a *Packaging* part: Container 4 (15 each, compulsory) and Foil 2 (free). Dining in shows no packaging at all.
2. Press − on the container: 3. Take the foil down to 0: the line stays, greyed, with a *Why? (optional)* box: type "brought their own". Add a Bag from *Add packaging* (its price is shown). Use *Change to…* on the container to swap it for the bag: the count stays and the price becomes the bag's. No price can be typed anywhere.
3. Take the payment. The order keeps the list: what it ended with, what the rules had asked for, and the reason for the foil.
4. A tab: its list is worked out when it is paid, from all its rounds together. A per-order rule counts once for the whole tab.
5. Nothing is charged for packaging yet, and the receipt does not show it: those come with the permission to waive (5.5), the posting (5.6) and the receipt (5.7).

## 0x. Waiving compulsory packaging (after scripts 209 and 210)
With the container compulsory and charged (15), the foil free, as in 0w. Sign in once as a cashier whose role does not have *Waive or remove takeaway packaging that is compulsory and has a price*, and once as a manager whose role does (the permission is set in the role builder).
1. Cashier: take out two meals, **Pay**, press − on the container. A red note says the container is compulsory and has a price and that only someone who may waive packaging can reduce it; **Take** is greyed. Put it back and it clears.
2. The cashier can take the free foil off, add a bag, and add containers (more than the rules asked) without the note.
3. Manager: the same change shows an amber note ("You are waiving 15.00 ... It is logged") and **Take** works. The sale goes through.
4. Swapping the container for the cheaper bag, or taking it to 0, is a waiver of the difference (4 x 15 asked, 4 x 5 charged: 40). Whoever waived is kept on the packaging line with the amount.
5. A line that is priced but optional, or compulsory but free, can be taken off by anyone.

## 0y. Packaging on the bill and off the shelf
With the container (priced 15, compulsory, 2 for each dish) and the free foil (1 for each dish) of 0w, and some of each in stock (Menus, Stock, Receive).
1. Till: take out two meals, **Pay**. The *Food* figure and the total include the 4 containers (60) with their VAT; the free foil adds nothing. Press − on the container: the total drops by 15 plus its VAT.
2. Take the payment. The sales order and the sale in the books have a line "Packaging: Container", 4 at 15, posted to the packaging account (or the dishes' account if none is set) and taxed as that account is.
3. Menus, Stock: the container is down by 4 and the foil by 2. In the books there is one journal "Packaging used for INV-…", debiting the account the packaging kind is charged to (Kitchen Supplies Used) and crediting the kind's stock account, for 4 containers and 2 foils at their cost.
4. Cancel that sale in the books: the containers and the foil are back on the shelf and the journal is reversed.
5. Run the containers out and sell again: the sale still goes through; what was on the shelf is taken.
6. A tab: its running total shows the dishes only; when it is paid the packaging is added to the bill. Online and kiosk orders carry the packaging as the rules ask.
7. Dining in: no packaging at all.

## 0z. The receipt and the packers' ticket
With three rules on the stew: the container (charged, receipt *Never*), the foil (free, receipt *When charged*), the bag (free, receipt *Always*).
1. Till: take out one meal and pay. The receipt shows "Packaging: Bag ... free" and nothing for the container (though it was charged and is in the total) or the foil (free, auto).
2. The kitchen screen's ticket for that order has a blue line "PACK: 1 × Bag, 2 × Container, 1 × Foil": the packers see all of it. The printed ticket has the same. The Orders board shows "Pack: ...". The customer's order page lists only the bag.
3. Set the container's receipt to *Auto* and pay again: the receipt now has "4 Packaging: Container 60.00", and the lines add up to the subtotal.
4. Take the foil off at the till: it is not on the PACK line. Open a tab for a take-out meal: the ticket shows what the rules ask for already; a tab ordered in two rounds shows it on the first ticket only. Dining in shows no PACK line.

## 0aa. Free condiments (after script 211)
1. Menus, Dishes, the fries, **Packaging**: under *Free condiments* add Ketchup, count 2, and Mayonnaise, count 1 (any ingredient can be named, counted in its own unit). Save, reload: as left. A count of 0 or 100, the same item twice, or a switched-off ingredient is refused with a message.
2. Till: sell three fries, **Pay**. *Free condiments* lists Ketchup 6 allowed and Mayonnaise 3 allowed, each with − and +, whether dining in or taking out. Give 9 ketchup: a note says "9 Ketchup given, 6 allowed. It is allowed; it is only a warning." and you can still take the payment.
3. After the sale the order keeps both numbers. The kitchen ticket has a green line "GIVE: 9 × Ketchup, 3 × Mayonnaise" (what was given), the Orders board says "Give: ...", and the printed ticket has it too. A tab shows the allowance until it is paid, then what was given.
4. Menus, Stock: the ketchup is down by 9 (what was given, not the 6 allowed) and the mayonnaise by 3, in the one journal "Packaging and condiments used for INV-…". Cancel the sale in the books: they come back.
5. Two dishes with the same condiment add their allowances. Only a condiment of a dish on the order can be given. Deleting a dish takes its allowance.

## 0ab. Why packaging was left off (after script 209)
1. At the till take away a few orders with the container and the free foil: take the foil off with the reason "Brought their own" (once typed with a capital and extra spaces), reduce the containers on another, swap the container for the bag on another, and leave one untouched.
2. Menus, Operations, **Packaging**: the totals say how many orders, how much was asked for and given, how much was left off, how many lines were changed and swapped. Change the dates or the branch and it follows. Cancel an order and it drops out.
3. *By item*: the foil asked for, given, left off and on how many orders it was changed; a swap shows as "Container swapped for Bag". *Why it was left off*: "brought their own" counts both orders as one reason; a cut with no reason is "No reason given". *Latest changes* names the order, the reason and, for a waiver, how much and who.
4. Without scripts 207 to 209 the tab says which to run.

## 0ac. The tips box tables (after script 212)
Nothing on screen changes yet; this only checks the script. Run `212_menus_tips.sql` part by part. Part A returns no rows the first time, part C returns one row with `tips` 0 and `tip_events` 0. Run it a second time: nothing fails and nothing changes. The tip box at payment (6.2) and the tips screen (6.4) are the next steps.

## 0ad. The tip box at payment (no script)
Needs a tips payable account (Menus, Configuration, or the books' Tips Payable) or the box is not shown. At the Till ring up a dish that comes to 1,160 and press Pay. 1) The payment box has a **Tip (kept apart from the bill)** box; type 100 and the lines show Bill 1,160, Tip 100, Total 1,260. 2) Hand over 1,200: a red note says the tip can be at most 40.00 and Take is off. 3) Press *Tip the rest of what was handed over*: the tip becomes 40, change 0.00. 4) Hand over 1,300 with a tip of 100: change 40.00. 5) Hand over 1,300 with no tip: change 140.00. 6) Try the same on an open tab and on a kiosk order waiting at the till.

## 0ae. A tip waits in the tips box (after script 212)
At the Till sell a dish with a tip of 100 and the label *Window*. In the books, the sale's tip line reads like `Tip, MO-000012, Window` and is credited to the tips payable account. In the database `SELECT * FROM menus_tips` has one row: amount 100, status `pending`, the account, the number called out and the cashier. Sell again with no tip: no new row. Open a tab, pay it at the end with a tip: one row for that tab. Without script 212 the sale still goes through and only the line is made. The tips screen to see and hand these over is 6.4.

## 0af. The tips screen and handing a tip over (after script 212)
Sign in as someone who may view tips and hand them over, and make sure at least one tip is waiting (0ae). 1) Menus, **Tips** (shortcut Y) shows the window in words, the totals and two lists, Pending and Today. 2) On a pending tip press **Issue**, choose a cashier or waiter (or *Someone else* and type a name), choose the cash account and press *Hand over*: the tip leaves Pending and shows under Today with who got it. In the books there is one journal, Dr tips payable, Cr the cash account, with your narration or one like `Tip handed to Wanjiku, MO-000012, Window`. 3) Press Issue on the same tip from a second tab: it says it was already handed over and no second journal is made. 4) Under Configuration set the window to *every day between* two times that do not include now: the Issue buttons are greyed and the screen says when it opens; the tip stays in the box. 5) Choose yourself as the person: it is refused (your own tip comes in 6.6). 6) Someone who may view but not issue sees the lists with no Issue button.

## 0ag. Your own tip, and taking a tip back (after script 212)
1) Sign in as someone who may hand tips over *and* hand over their own tip. On Menus, Tips press Issue and choose *Myself*: the button stays off until a narration is typed (say why it is yours). Hand it over: one journal, with your narration. 2) Sign in as someone with only the permission to issue to others: *Myself* is not offered, and the server refuses it if forced. 3) Sign in as someone with only the own-tip permission: the only person you can choose is yourself. 4) As someone who may undo tips, open the Today list and press **Take back** on a tip that was handed over: the button stays off until a reason is typed. Take it back: the tip is in Pending again, the payout journal in the books is cancelled and the reason is kept in the log. Hand it over again to the right person: a new journal. 5) Press Take back again on the same tip from another tab: nothing is cancelled twice.

## 0ah. The tips report (after script 212)
On Menus, Tips press the **Report** tab. 1) The tiles show Taken, Handed over, Waiting now, Oldest waiting (in days) and Taken back for the last 30 days; change the dates and they change. 2) *By day* puts a tip on the day it was taken and a hand-over on the day it was made. 3) *By who served* adds up the tips of each waiter (tips with no server recorded are under Not recorded). 4) *Handed over to* shows each person or typed name and what they received. 5) *Hand-overs and take-backs* lists each one with who did it, to whom, and the narration or reason. 6) Hand a tip over, take it back, hand it over again: Taken back shows 1, Handed over counts the tip once, and the history shows all three.

## 0ai. A dish in another currency (after script 213)
**Read first:** running 213 also writes every order in the Menus currency (Menus, Configuration, Currency; the base currency when empty). If your Menus currency is not the one you sell in, clear it before you run the script. 1) Menus, Dishes, edit a dish: *Price currency* is there; choose USD for a steak priced 10. 2) Make sure USD has a rate in the books (say 130). 3) At the Till the steak shows `USD 10.00`; tap it: the basket line shows `USD 10.00`, the total waits for the quote and then shows the shilling total (1,300 plus tax), with the note *Prices in USD are converted at today's rate (1 USD = 130 KES)*. 4) Add a dish with no currency: the quote adds its shillings to the converted steak; the basket shows no sum of its own while the two currencies are mixed. 5) Pay: the receipt shows the steak with `USD 10.00 at 130` under it. 6) Open a tab, order the steak, change the USD rate in the books, add another steak a day later: the first round keeps its price, the second is at the new rate. 7) Try a price like 3.33 USD at a rate of 130.456: each portion is 434.42 (rounded once), three of them 1,303.26, and there is no rounding line. 8) Put a packaging item on the price list in USD: at a take-out sale it is charged in shillings at the rate. 9) The public menu and the kiosk show `USD 10.00` on the dish and the note at checkout. 10) A dish's margin on the Dishes page is worked out in shillings.

## 0aj. Batch timers and ticket timers (after script 214)
1) Menus, Recipes: give a recipe of its own times by size (up to 1 kg 15 minutes, up to 2 kg 20). 2) Menus, Prepared food, **Start a timer**: choose it, a size of 2 kg: the hint says 20 minutes; add *Simmer* as what it is doing and start the clock. It appears under **On the stove** as `simmer: Ugali`, `2 kg, 20 min, ready 11:20` and counts down. 3) Start another for a size the recipe has no time for: the button stays off until you type minutes; typed minutes win over the recipe's. 4) Let one run past its time: it turns red and counts up (`over`). 5) Press **Make the batch** on a timer: the usual form opens with the recipe, size and the start time filled in; make it: the timer is gone from the stove and the batch's duration is counted from when the timer started. 6) **Switch off** another timer: nothing is made, nothing is used. 7) Menus, Sides: on a side type *Plating or reheating (minutes)*, say 5 for Choma and 3 for Rice. 8) Order a dish with both at the till (or kiosk): on the kitchen screen the ticket shows `Plate Choma: 5 min` before it is started; press Start and it counts down (`4:59 left`), in red and `over` when it runs out. The station's own target for the whole order still marks the ticket LATE as before. 9) A ticket whose sides have no task time shows no timer.

## 0ak. Codes for the kitchen (Step 9.1, no script)
1) Admin, Codes: with Menus on there are five more tabs: **Dishes, Recipes, Prepared batches, Ingredient lots, Kitchen stock** (they are not there when Menus is off). 2) Dishes: each row shows a code like `DSH00000012`; there is no *Set a code* button because it is made from the number; select a few and **Print labels**: a QR code with the name and, if ticked, the price. 3) Recipes: a recipe of its own shows under its own name, a dish's recipe under the dish's name (`RCP...`). 4) Prepared batches and Ingredient lots: the code (`PBL...`, `ILT...`) with the batch or lot and its date; the label shows `Batch ... exp ...`. 5) Kitchen stock: items with no code are marked; **Give a code** makes `KIT...`; **Set a code** with a supplier's barcode replaces it (a wrong check digit is refused) and a label with the old `KIT...` code still scans, marked as an old code. 6) *Find by scanning* (type a code in the box): `DSH00000012` finds the dish, `PBL...` the batch. 7) Try to give a kitchen item the code `DSH00000001`: it is refused as already used. 8) Menus, Configuration is unchanged; the Codes Configuration tab has a kind of code for each of the new types. 9) At a stock count or a purchase scan a dish's code: the screen says it is a dish and that it does not use it.

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
