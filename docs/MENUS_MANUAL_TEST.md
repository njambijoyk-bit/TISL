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

## 0b. Menus currency (after the Currency setting)
1. Menus, Configuration: the **Currency** list offers the active currencies, and empty means the system's base currency. Pick a foreign one with a rate set under Currencies. Expect: Menus, Stock, Receive stock says "prices in" that currency, and so does the Opening stock sheet.
2. Receive a delivery and record some waste. Expect: the purchase voucher and the waste journal are in that currency at the rate of their date; the Books amounts in the base currency are what the lots cost. Set it back to empty and everything is in the base currency again.

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
