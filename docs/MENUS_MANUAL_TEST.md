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
- [ ] The sample kitchen in `docs/MENUS_TEST_DATA.md` is entered (ingredients, opening stock, dishes, recipes). The steps below use it.
- [ ] Menus is licensed and switched on (Settings, Modules). You can see **Menus** in the admin menu.
- [ ] Two test people: one **manager** (menus.view and menus.manage) and one **cashier or waiter** (menus.till only, no menus.manage). Sign in as each in a different browser.
- [ ] A branch exists and is set to sell to customers. Payment methods exist: Cash, and M-Pesa if you want to try the kiosk.

## 1. Ingredients, stock and recipes (as the manager)
1. **Ingredients & Supplies** (G, then I; the page was Ingredients): add Wheat flour with base unit g and bigger unit kg, and three variants (Pembe 24 kg, Exe 2 kg, Soko 1 kg) with pack sizes. Expect: it saves, the order of the variants can be changed, the bigger unit list only offers units of the same kind. Watch: is "variant" vs "ingredient" clear without being told?
2. **Stock**: open **Opening stock** (the sheet) and type 10 packs of Exe 2 kg and a price, then a few more rows; reload the page halfway. Expect: touched rows stay and are counted on Save all; Save all makes one Opening stock voucher for each variant (see Purchases, Opening stock); the shelf shows 10 packs, 20 kg, 20,000 g. Receive a delivery from a supplier: Expect: a Purchase voucher appears in Books and the shelf goes up. Cancel it: the voucher is cancelled and the shelf comes back down. Purchases, New purchase (and Goods received): type an ingredient or variant name, a code, or words in any order ("scrub sponge"); an exact match shows without the "No exact match, did you mean" line, which appears only when nothing matches (a typo like "spnges" offers the near ones). The bottom of the list has **Create new product** and **Create new kitchen stock** (only the ones whose module is on); the second opens Menus, Ingredients with the typed name filled in, and saving it brings you back with the new item on the purchase (several variants: you pick which). On a Purchase order the line button is **Kitchen stock**. Purchases, New purchase: search an ingredient (it shows with its variants under it), pick packs, kg or g, post: the same thing. With E-commerce off the search only offers ingredients; with Menus off only products.
3. **Recipes**: make a recipe for a dish (amounts in g or kg, waste %, method steps, how many portions a batch makes). Expect: cost per portion shows, and "can make" counts portions from the shelf. Watch: does the allergen from an ingredient show where you would look for it?
4. **Kinds** (after script 190): on Ingredients & Supplies, press **Kinds** (or I, then K), add "Bar drinks" (sold as it is), then make an item "Cola 500ml" of the kind Ready to serve. With a kind chip chosen (say Supplies), **New item** (F2) opens with that kind already selected; it can still be changed. Expect: the table filters by kind; the Recipes ingredient list does not offer Cola; saving a recipe that has it is refused with the kind's name. Try moving flour (in a recipe) to Packaging, and removing a kind that has ingredients: both refused, nothing changed. On Menus, Stock the button is **Receive stock** and the pages say "item" rather than "ingredient". On **Stock reports** (Stock summary, Location summary, Stock query) the type list is **All stock / Products / Kitchen stock**; kitchen stock is grouped as "Ready to serve: Cola" (kind, then ingredient), and choosing Kitchen stock shows a second **Kind** list that narrows the report to one kind (totals follow). The Stock, Count stock and Opening stock pages have a **Kind** filter beside the search (it narrows the ingredient list too, and the choice is kept between those pages on this device). After script 191: there is a Supplies kind charged to Kitchen Supplies Used, a new kind will not save without an account, and gloves can be made as an ingredient of that kind.
5. **Allergens** (G, then A): add a tag, rename it, change what it rules out, put it on an ingredient, and try to remove one that is in use. Expect: the dish badges follow at once, and a clear refusal for the one in use.
6. Delete something that is in use (an ingredient used by a recipe, a variant that has stock history). Expect: a clear refusal, nothing half-deleted.
7. **Books, Reports, Stock movement**: pick the supplier you bought the cola, flour and gloves from. It lists products and kitchen stock together (kitchen rows say KITCHEN, in g, ml or each); a **Type of stock** list narrows to Products or Kitchen stock and then a **Kind** list narrows to one kind; clicking a row shows its vouchers (a debit note counts against what was bought). "Start from an item" finds kitchen stock by name too. Dishes are not in this report yet.
8. **Count, send, waste**: count a variant in packs (9 instead of 10), send 2 packs to another branch, record waste of a variant and of a dish, then take the waste back. Expect: every figure on the shelf follows, and the take-back returns the exact stock.

## 2. Dishes and menus (manager)
1. **Dishes**: add a dish with a price, a photo, allergens and one option group (Size: small, large +100). Expect: option price shows on the dish. Mark it **Sold out (86)** and back.
2. **Menus**: make a menu with two sections, put dishes in them, set the days and hours it serves. Expect: a dish whose ingredients are out (or whose made-ahead portions are out) is not offered.
3. Open the **public menu page** in a private window (no sign-in). Expect: allergens, prices, sold-out dishes greyed, options work, the page reads well on a phone.

## 3. Online order (customer, then manager)
1. In the private window add dishes, choose pickup and a time slot, pay (or pay later if on). Expect: an order number, a tracking link.
2. As manager open **Orders**: see it, move it Accepted, Ready, Completed. Expect: the customer's tracking page follows without a reload.
3. Cancel an order: the box asks for a reason. Expect: the customer is told, stock comes back. Watch: is it clear you must type a reason?

## 4. Kitchen (manager, on a tablet if you have one)
1. **Kitchen**: set up two stations (Grill, Cold). Give dishes a station. Place an order with one of each. Expect: each station's screen shows only its own tickets, the expo screen shows the whole order.
2. Press Start, Ready, Recall. Watch: are the buttons big enough to press with wet hands; are late tickets obvious?

## 5. Food till (sign in as the **cashier or waiter**: menus.till only)
1. Open **Till**. Expect: you can sell; you cannot see Recipes, Ingredients, Stock, costs, or any setup.
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
- **Operations**: prep list for tomorrow, record waste, what to buy (in packs, then "Make orders").
- **Make a batch** of a made-ahead dish (the cake) on the Stock page, sell a slice, and try to cancel the batch.
- **Courses, recipes and notes**: "Copy a recipe from Menus" for a recipe set to "May be shown on the website and in courses".
- **Meal plans**, **Cakes and catering** (quote, deposit, status), **Rota** (shifts, days off, swaps, overtime, clock in at the door).

## When you find a problem
For each one write: **where** (screen), **what you did**, **what you expected**, **what happened**, and a screenshot if it is visual. A one-line note is enough; I will fix them in batches.
