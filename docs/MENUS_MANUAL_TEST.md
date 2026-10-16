# Menus: a manual walk-through (what to try, and what to watch for)

Do the parts in this order: each one needs the one before it. Tick a box only when it did what the "expect" line says. Write down anything that made you stop and think, even if it worked: that is exactly what the automated tests cannot see.

**What to watch for the whole way (the human checks)**
- Did you ever not know what to press next, or what a word meant (ingredient family, station, expo, 86)?
- After pressing something, did the screen tell you it worked, quickly? Any press that seemed to do nothing?
- Error messages: do they say what to do, in plain words?
- Empty screens: does a blank page say what to add first?
- Phone and tablet width: can you reach every button with a thumb, and does nothing run off the side?
- Light and dark theme: is every word readable?
- Try it twice as fast as feels natural (double clicks, going Back mid-way). Does anything duplicate?

## 0. Before you start
- [ ] Scripts 132 to 151 and 165 have been run (Workbench, Part B then C each). `php artisan access:seed` has been run.
- [ ] Menus is licensed and switched on (Settings, Modules). You can see **Menus** in the admin menu.
- [ ] Two test people: one **manager** (menus.view and menus.manage) and one **cashier or waiter** (menus.till only, no menus.manage). Sign in as each in a different browser.
- [ ] A branch exists and is set to sell to customers. Payment methods exist: Cash, and M-Pesa if you want to try the kiosk.

## 1. Ingredients and recipes (as the manager)
1. **Ingredients**: add a family (Flour) with two variants (Brand A, Brand B), link each to a stock item. Expect: it saves, a substitute order can be set. Watch: is "family" vs "variant" clear without being told?
2. **Recipes**: make a recipe for a dish (method steps, yield, waste). Add a sub-recipe. Scale it. Expect: cost per portion shows and moves when you scale. Watch: does allergen inheritance show where you'd look for it?
3. Delete something that is in use (a variant used by a recipe). Expect: a clear refusal, nothing half-deleted.

## 2. Dishes and menus (manager)
1. **Dishes**: add a dish with a price, a photo, allergens and one option group (Size: small, large +100). Expect: option price shows on the dish. Mark it **Sold out (86)** and back.
2. **Menus**: make a menu with two sections, put dishes in them, set the days and hours it serves. Expect: a dish whose stock is out is not offered.
3. Open the **public menu page** in a private window (no sign-in). Expect: allergens, prices, sold-out dishes greyed, options work, the page reads well on a phone.

## 3. Online order (customer, then manager)
1. In the private window add dishes, choose pickup and a time slot, pay (or pay later if on). Expect: an order number, a tracking link.
2. As manager open **Orders**: see it, move it Accepted, Ready, Completed. Expect: the customer's tracking page follows without a reload.
3. Cancel an order: the box asks for a reason. Expect: the customer is told, stock comes back. Watch: is it clear you must type a reason?

## 4. Kitchen (manager, on a tablet if you have one)
1. **Kitchen**: set up two stations (Grill, Cold). Give dishes a station. Place an order with one of each. Expect: each station's screen shows only its own tickets, the expo screen shows the whole order.
2. Press Start, Ready, Recall. Watch: are the buttons big enough to press with wet hands; are late tickets obvious?

## 5. Food till (sign in as the **cashier or waiter**: menus.till only)
1. Open **Till**. Expect: you can sell; you cannot see Recipes, Ingredients, costs, or any setup.
2. Quick sale: add dishes, pay with cash, tendered more than the total. Expect: change shown, receipt prints.
3. Open a **tab** for a table, add in rounds, move a line, split the bill, settle. Cancel a tab (a reason box appears).
4. Try to open Recipes by typing the address. Expect: you are sent back to admin, nothing shown.

## 6. Floor and tables
1. **Floor** (manager): add an area and tables, drag them, Save layout. Show a table's QR code.
2. As the waiter: Seat a table (asks how many guests), Take their order (opens the till on that table), ask for the bill, Clean.
3. As the waiter: confirm you cannot Edit the plan and cannot make a new QR code.
4. Scan a table's QR with your phone (no sign-in): order from the table. Expect: the order appears on the kitchen screen with the table name.

## 7. Kiosk
1. **Settings, Kiosks**: make a kiosk, copy its address once. Open it on a tablet. Order, pay by M-Pesa (or take cash at the till: "Take payment" on the till).
2. Walk away mid-order. Expect: it resets. Press the buttons as fast as a bored customer would.

## 8. The rest
- **Chefs**: add a chef with a certificate that is nearly expired. Expect: a warning. Public chefs page.
- **Operations**: prep list for tomorrow, record waste, reorder suggestions.
- **Meal plans**, **Cakes and catering** (quote, deposit, status), **Rota** (shifts, days off, swaps, overtime, clock in at the door).

## When you find a problem
For each one write: **where** (screen), **what you did**, **what you expected**, **what happened**, and a screenshot if it is visual. A one-line note is enough; I will fix them in batches.
