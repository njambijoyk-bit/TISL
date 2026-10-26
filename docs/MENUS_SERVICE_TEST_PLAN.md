# Menus: service test plan (prepared food, timers, till, floor, orders, kitchen, tips, currency, codes)

This plan tests the working day of the kitchen and the dining room. The stock, recipes, sides, dishes, menus and packaging are tested with `docs/MENUS_TEST_DATA.md` (sections 1 to 10); this plan assumes that data is in and uses its dishes and prices.

**How to read it.** Each part is a list of short tests. **Do** is what you press or type, **Expect** is what you should see. Figures are worked out from the test data: a dish price plus **16% VAT** on top (no service charge), and shelf figures start from the opening stock (section 2 of the data). "(test)" means an automated test checks the same figure; the rest is arithmetic or what the screen should say. Write down anything that does not come out: the part and test number, what you did, what you expected, what happened.

## 0. Before you start

**Database scripts.** 181 to 214, 225 and 226, in numerical order (`php artisan access:seed` too, for the permissions). Scripts 198 and 199 are prepared food, 212 tips, 213 currencies, 214 timers.

**The data.** Sections 1 to 9 of `docs/MENUS_TEST_DATA.md` entered: ingredients, opening stock, recipes, sides, dishes, menus, the packaging prices and rules. Two things from there matter most here: the **Ugali** recipe (made ahead, with times) and the **Chocolate cake** (made ahead); everything else is made to order.

**Settings for this plan**

| Where | What to set |
|---|---|
| Settings, Payment methods | **Cash** (with its cash ledger set, or the Tips screen has nothing to pay out of) and **M-Pesa**. |
| Menus, Configuration, tips | Tips account empty (the books' Tips Payable). Tips window **At any time**. |
| Menus, Configuration, ways to order | **Online pickup** on: kitchen needs 20 minutes, times 15 minutes apart, order up to 3 days ahead, pay now or when collected. Leave **Online delivery** off. |
| Menus, Chefs | **Chef Wanjiru** (active; tick *Show on the chefs page*). |
| Menus, Configuration, stations | The seven stations of the data document: Hot kitchen, Grill, Fryer, Cold station, Bar, Pastry, Packing. |
| Settings, Currencies | **USD**, rate **130**. |

**People** (give each a role; permissions are set in the role builder)

| Person | Can |
|---|---|
| **Manager Mo** | `menus.view`, `menus.manage`, `menus.configure`, all the tips permissions (see, hand over, hand over one's own, undo), and *waive packaging*. |
| **Cashier Jo** | `menus.till`, *see the tips*, *hand tips over to other people*. **Not** *waive packaging*. |
| **Waiter Wanjiku** | `menus.till`, and is a user, so tips can be handed to her. |
| **Viewer** | *see the tips* only. |

Sign in as each in a different browser (or a private window).

---

## 1. Prepared food and batch timers (sign in as Manager Mo)

**What "prepared food" means.** A dish is normally **made to order**: the ingredients come off the shelf when it is sold. A recipe set to **Made ahead in batches** works the other way: you make a batch first (the ingredients come off the shelf then), the portions sit on a separate **prepared shelf**, and each sale takes a portion from it. Ugali and Chocolate cake are made ahead.

### 1A. Make a batch (Menus, Prepared food)

| # | Do | Expect |
|---|---|---|
| 1 | Choose recipe **Ugali**, size **2 kg**. Do not press the button yet. | A table of what the batch takes: for each ingredient what the recipe says, what is really used, what is on the shelf, and the cost. Maize flour 800 g. |
| 2 | Pick **Chef Wanjiru**, set the start and finish, press **Make the batch**. | The batch is listed under *Batches made*. Maize flour falls by 800 g (Unga 20,000 g to 19,200 g). 2 kg is on the prepared shelf. (test) |
| 3 | Look in Books. | One journal: Dr Prepared Food Inventory, Cr Food Ingredients Inventory, for what the flour cost. |
| 4 | Make a second batch: **Chocolate cake**, **8** portions. | Flour, sugar, eggs, butter, cocoa, milk and baking powder fall by the batch amounts. The batch costs **553.00**, which is **69.13** a slice. 8 slices on the prepared shelf. (test) |
| 5 | Sell **1 Chocolate cake slice** at the till (part 3). | 7 slices left. Books: Dr Food Cost of Sales, Cr Prepared Food Inventory, 69.13. (test) |
| 6 | Waste 3 cake slices as *Made too much* (Operations, Waste). | The slices leave the prepared shelf. |
| 7 | Try to cancel the cake batch now. | Refused: a slice has been sold. A batch nobody has sold from can be cancelled and puts the ingredients back. |

### 1A-2. A batch with something short (restocking from the batch box)
A batch is never made from stock that is not there, so the shelf can not go negative. Instead the box helps you restock.

| # | Do | Expect |
|---|---|---|
| 1 | With **no milk on the shelf** (or after using it up), choose **Chocolate cake**, 8 portions. | The Milk row says `0 mL (short 200)` in red, and a red strip names what is short: "Milk (short 200 ml). A batch is never made from stock that is not there." with a button **Restock what is short**. |
| 2 | Press **Make the batch** anyway. | Refused: "Not enough Milk: need 200 mL, have 0." Nothing is used. |
| 3 | Press **Restock what is short**. | **Receive stock** opens on top, already holding a line for Milk: the first variant, in packs (200 ml short is **1 pack** of Fresh 1 L), at its usual cost. A line says what is short. |
| 4 | Choose the supplier (or how it was paid), change the pack count if you want more, press **Post purchase**. | A Purchase voucher is posted and the milk is on the shelf. You are back in the batch box and the Milk row now shows what is on the shelf with no red strip. |
| 5 | Press **Make the batch**. | It is made as in 1A. |
| 6 | Repeat 1 to 3, then press **It is already on the shelf: count it instead**. | **Count what is short** opens with only the Milk rows (all its variants). Type what is really there and **Save**: a stock count is saved at the last cost, the difference goes to the stock adjustment, and you are back in the batch box. |
| 7 | In the count box press **Receive it as a purchase instead**. | You are back on Receive stock. |
| 8 | Look for *Opening stock*. | It is not offered here: it is for the first day only. |

### 1B. Batch timers (Prepared food, **Start a timer**)
A timer tells the chef how long a batch takes. The recipe gives the time by batch size (Ugali: up to 1 kg 15 minutes, up to 2 kg 20, up to 5 kg 40).

| # | Do | Expect |
|---|---|---|
| 1 | Start a timer for Ugali **1 kg**, then **2 kg**, then **5 kg**. | **15**, **20** and **40** minutes. (test) |
| 2 | Start one for **6 kg**. | No row fits, so the button stays off until you type minutes: type **45**. |
| 3 | Start one for 2 kg and type **30**. | 30 is used, not the recipe's 20: typed minutes win. (test) |
| 4 | Add *Simmer* as what it is doing and start the clock. | It appears under **On the stove** as `simmer: Ugali`, with the size, the minutes and when it will be ready, and counts down. |
| 5 | Let one run past its time (or start one with 1 minute). | It turns red and counts up: `over`. |
| 6 | On a timer, press **Make the batch**. | The usual form opens with the recipe, size and start time filled in. Make it: the timer closes and the batch is timed from when the timer started. Use-by **today + 3 days**. (test) |

---

## 2. Kitchen screen and ticket timers (Manager Mo)

First make sure two stations exist and the dishes have a "Made at" (data document, sections 5 and 6): Steak sandwich and Burger at **Grill**, Chips at **Fryer**, Beef pilau at **Hot kitchen**, Masala chai at **Bar**.

| # | Do | Expect |
|---|---|---|
| 1 | Place an order (till, part 3) with a Burger, a Chips and a Masala chai. | Menus, Kitchen: each station's screen shows only its own tickets (Grill: Burger; Fryer: Chips; Bar: Masala chai). The **expo** screen shows the whole order. |
| 2 | On a ticket press **Start**, then **Ready**. | The ticket moves on each time. |
| 3 | Press **Recall** on a ready ticket. | It comes back to the station. |
| 4 | Order a **Steak sandwich**, Jumbo, default **Choma**. | The ticket shows `Jumbo`, `- Bread`, `- Choma`, and **Plate Choma: 5 min**. (test) |
| 5 | Press **Start**. | The countdown runs; at 0 the ticket goes red and says *over*. |
| 6 | Order another with **Wet fry** instead of Choma. | **Plate Wet fry: 4 min**. (test) |
| 7 | Add **Kale** (it has no plating time) to either. | Nothing changes: the longest task on the ticket is its timer, not the sum. (test) |
| 8 | Order a **Chips**. | No ticket timer: nothing on it has a plating time. |
| 9 | Order a **Steak sandwich** in Jumbo with two **Eggs**. | The ticket lists `- Egg x2`. |
| 10 | Order a Chips take out with the free condiments (data document, section 9). | The ticket has a `PACK: ...` line and a `GIVE: ...` line. |

Watch: are the buttons big enough to press with wet hands, and are late tickets obvious?

---

## 3. The till (food till)

### 3A. Signed in as Cashier Jo (`menus.till` only)

| # | Do | Expect |
|---|---|---|
| 1 | Open **Till**. | You can sell. You cannot see Recipes, Ingredients, Stock, costs or any set-up. |
| 2 | Type the address of Recipes (`/admin/menus/recipes`). | You are sent back; nothing is shown. |
| 3 | **Quick sale:** add **1 Chicken pilau** (600), choose *Dining in*, pay **Cash 1,000**. | Total **696.00** (600 + 16% VAT). Change **304.00**. The receipt prints. Chicken 1,000 g falls to 820 g. Books gets a sale and a cost-of-sales journal. |
| 4 | Add **Chips**. | A size box: **Medium 300**, **Jumbo 400**. Nothing is added until you pick one. Pick Jumbo: the basket shows 400, total 464.00. (test) |
| 5 | Add a **Steak sandwich**, Jumbo, with **Wet fry** and **Kale**. | 720 before tax; total 835.20. Add two Eggs: 800, total 928.00. **Kids**: 350. (test) |
| 6 | Add a **Burger**: tick **Extra cheese** and **No onion**. | 570 before tax, total 661.20. A plain Burger is 500. (test) |
| 7 | Add a **Pancakes** with **No butter**. | 350, no extra charge. The ticket says `No butter`. |
| 8 | A dish with free extras (Steak sandwich with a **Cola** and a **Ketchup**). | The price does not change. After the sale the Cola crate falls 72 to 71 and the ketchup 3,000 ml to 2,970 ml. (test) |
| 9 | Mark **Pancakes** *Sold out today* (Menus, Dishes). | The till shows it as sold out and will not add it. **Available again** puts it back. |
| 10 | Sell **5 Chicken pilau**, then try a 6th (start from a fresh 1,000 g of chicken). | The sixth is refused: "Not enough Chicken: need 180 g, have 100." (test) |

### 3B. Tabs and splitting (Cashier Jo)

| # | Do | Expect |
|---|---|---|
| 1 | Open a **tab** called *Table 4*. Add **Chips** (Medium 300). Add **Pancakes** (350) in a second round. | The tab's running total shows the dishes only: **650** before tax. The service charge and tip are left to the end. |
| 2 | Move the Pancakes to another tab. | It leaves Table 4 and is on the other tab. |
| 3 | Move it back. **Split the bill** in two. | Two parts that add up to the total (650 + 16% = **754.00**). |
| 4 | **Settle** the tab in cash with a tip of **50** (part 6). | The tab closes. The tip is kept apart from the bill. |
| 5 | Open another tab and **Cancel** it. | A box asks for a reason (the Cancel stays off until you type one). Stock comes back. |

### 3C. Packaging and condiments at the till
Follow the tables in section 9 of `docs/MENUS_TEST_DATA.md`: two Stew meals taken out (boxes 4, foil 2; 1,360 before tax, **1,577.60** with VAT), the cashier cannot waive a charged box and the manager can, and three Chips with free condiments (Ketchup 6, Mayonnaise 3 allowed). Sign in as Cashier Jo for the cashier steps and as Manager Mo for the waiver.

---

## 4. Floor and tables

| # | Who | Do | Expect |
|---|---|---|---|
| 1 | Manager Mo | Menus, **Floor**: add an area *Main hall* and four tables (T1 to T4). Drag them. Press **Save layout**. | The layout is kept; reload and it is as left. |
| 2 | Manager Mo | Open **T1**'s QR code. | A QR code you can print. |
| 3 | Waiter Wanjiku | Open Floor. Press **Seat** on T1. | It asks how many guests. After you answer the table is *seated*. |
| 4 | Waiter Wanjiku | **Take their order** on T1. | The till opens on that table: add a Chips (Medium) and a Masala chai. The order is on the kitchen screens with the table name. |
| 5 | Waiter Wanjiku | Ask for the bill on T1. | The table shows *bill asked*. The bill is 300 + 150 = 450, total 522.00. |
| 6 | Waiter Wanjiku | Pay, then press **Clean**. | The table is free again. |
| 7 | Waiter Wanjiku | Try to edit the plan or make a new QR code. | Not allowed: she can seat, order and clean only. |
| 8 | A guest (phone, signed out) | Scan T2's QR code. | The menu for that table opens. Order a Pancakes. The order appears on the kitchen screen with the table name. |

---

## 5. Orders: online pickup and the kiosk

### 5A. A customer orders online (private window, signed out)

| # | Do | Expect |
|---|---|---|
| 1 | Open the public menu page. | Allergens, prices and options show; sold-out dishes are greyed; it reads well on a phone. A dish switched off at the branch is missing. |
| 2 | Add **1 Chicken pilau** (600). Choose **pickup** and the earliest time slot. | The basket shows 600; with tax **696.00**. The earliest time is now plus the 20 minutes the kitchen needs, on a 15-minute grid. |
| 3 | Pay now (or choose pay later). | An order number (like `MO-...`) and a tracking link. |
| 4 | Open the tracking link. | The order shows as received. |

### 5B. The manager handles it (Manager Mo)

| # | Do | Expect |
|---|---|---|
| 1 | Menus, **Orders**: open the order. | It is there with the time, the dish and the total 696.00. |
| 2 | Move it **Accepted**, then **Ready**, then **Completed**. | The customer's tracking page follows each step without a reload. The kitchen ticket appears when it is accepted. |
| 3 | Place another online order, then **Cancel** it. | The box asks for a reason (you must type one). The customer is told; the chicken comes back on the shelf. |
| 4 | Turn **Online pickup** off in the ways to order. | The public menu stops offering ordering for pickup. Turn it on again. |

### 5C. The kiosk

| # | Do | Expect |
|---|---|---|
| 1 | Settings, **Kiosks**: make a kiosk. Copy its address (shown once). Open it on a tablet in full screen. | The menu shows, ready to order. |
| 2 | Order a Chips (Medium) and pay by **M-Pesa** (or choose *Take payment at the till* and use **Take payment** on the till). | The order reaches the kitchen. |
| 3 | Start an order and walk away. | After its idle time (60 seconds unless you changed it on the kiosk) it resets to the start. |
| 4 | Press the buttons as fast as a bored customer would. | Nothing breaks; no half-orders are left. |

---

## 6. Tips

**Settings.** Menus, Configuration: tips account empty; tips window **At any time**. Payment method Cash has its cash ledger set.

**Make these tips** (Till, **Take out**, pay in cash):
1. Two **Burgers**, label **Window**, tip **200**, hand over **1,400** (bill 1,160).
2. A tab **Table 4** with one **Chips** (300) paid at the end with tip **50**.
3. One **Burger** with **no tip**.

After 1 and 2, Menus, **Tips** shows *Pending* with two tips (200 and 50), and *Today* the same.

### 6A. The tip box at payment (Cashier Jo)

| # | Do | Expect |
|---|---|---|
| 1 | Bill two Burgers (1,000 + 16% = **1,160**). Set the tip to **100**. | Bill 1,160, Tip 100, Total **1,260**. (test) |
| 2 | Hand over **1,200**. | Refused: "the tip can be at most **40.00**". (test) |
| 3 | Hand over **1,300**. | Change **40.00**. (test) |
| 4 | The same 1,300 with no tip. | Change **140.00**. (test) |
| 5 | Look at the tip line on the sale. | It reads like `Tip, MO-000012, Window`. The tip is credited to tips payable on the sale. |
| 6 | Wait a day (or ask for tips older than the window). | A pending tip never expires. |

### 6B. Handing tips over (sign in as Cashier Jo, then Manager Mo)

| # | Do | Expect |
|---|---|---|
| 1 | Menus, **Tips** (shortcut Y). | The window in words, the totals, and two lists: *Pending* and *Today*. |
| 2 | On the 200 tip press **Issue**. Choose **Waiter Wanjiku**, choose **Cash**, narration *Weekend share*, **Hand over**. | The tip leaves Pending and shows under Today with who got it. One journal: Dr tips payable 200, Cr Cash 200, with your narration. (test) |
| 3 | Press **Issue** on the same tip from a second tab. | It says the tip was already handed over. No second journal. (test) |
| 4 | Set the window to *Every day between* two times that do not include now. | The Issue buttons are greyed and the screen says when it opens. The tip stays in the box. Put the window back to *At any time*. |
| 5 | Choose **yourself** as the person (as Cashier Jo). | Refused. |
| 6 | As Manager Mo choose **Myself**. | The button stays off until you type a narration (say why it is yours). Hand it over: one journal with your narration. (test) |
| 7 | As Viewer (see the tips only). | The lists show, with no Issue button. |
| 8 | As someone with only *hand over one's own tip*. | The only person you can choose is yourself. |

### 6C. Taking a tip back and the report (Manager Mo)

| # | Do | Expect |
|---|---|---|
| 1 | Today list, the 200 tip, **Take back**. | The button stays off until you type a reason: type *Wrong person*. The journal is cancelled; the tip is Pending again. (test) |
| 2 | Hand it over again. | It works: the tip can be handed over again. |
| 3 | Open the **Report** tab. | Tiles: Taken, Handed over, Waiting now, Oldest waiting (days), Taken back (**1**). Change the dates and they change. (test) |
| 4 | *By day*, *By who served*, *Handed over to*, *Hand-overs and take-backs*. | A tip is on the day it was taken; a hand-over on the day it was made. Each waiter's tips are added up (tips with no server under *Not recorded*). Every hand-over and take-back is listed with who, to whom and why. The tip counts once in Handed over, and the history shows all three events. |

---

## 7. Another currency

**Read first:** script 213 writes every order in the Menus currency. Leave **Menus, Configuration, Currency empty** (or on the currency you sell in) before running it.

**Set up.** USD rate **130**, EUR **140**. For the history test: USD **120** from the first of this month and **135** from tomorrow. Dishes (Menus, Dishes; each has one Plate slot; put them on Lunch & dinner, Mains): **Imported steak** 10 in **USD**, **Tart** 3.33 in **USD**, **Wine** 20 in **EUR**, **Chapati plate** 200 with no currency. Paper bag price **0.04** in **USD** (Takeaway box stays 15).

| # | Do | Expect |
|---|---|---|
| 1 | Open the till. | The Imported steak shows `USD 10.00`. |
| 2 | Add Imported steak and Chapati plate. | Food **1,500** (10 USD at 130 = **1,300**, plus 200). The note: "Prices in USD are converted at today's rate (1 USD = 130 KES)". The receipt shows `USD 10.00 at 130` under the line. (test) |
| 3 | Set USD to **130.456**, add 1 Tart, then 3 Tarts. | One Tart 3.33 × 130.456 = **434.42**; three are **1,303.26**. No rounding line. (test) |
| 4 | With USD at 120 add an Imported steak to a tab; later (rate 135) add another. | First stays **1,200**, second is **1,350**; the tab is **2,550** before tax. (test) |
| 5 | Add Imported steak and Wine together. | The note lists both USD and EUR with their rates. |
| 6 | A take-out order with a Paper bag priced 0.04 USD. | The bag is **5.20** on the shilling order. (test) |
| 7 | Menus, Dishes: look at the Imported steak's margin. | Worked out in the base currency. |
| 8 | Meal plans and Cakes & catering. | They stay at the dish's price in the base currency. |

---

## 8. Codes, labels, barcodes and scanning

### 8A. Supplier barcodes (Menus, Ingredients, the variant's *Barcode or code* box)
All of these have a correct check digit.

| Variant | Barcode |
|---|---|
| Cola, Crate of 24 | `6001234560012` |
| Cola, Single bottle | `6001234560029` |
| Fanta, Crate of 24 | `6001234560036` |
| Bottled water, Pack of 12 | `6001234560043` |

| # | Do | Expect |
|---|---|---|
| 1 | Type `6001234567890` on any variant. | Refused: the check digit is wrong. (test) |
| 2 | Type `6001234560012` on a second variant. | Refused: another item has that code. (test) |

### 8B. Scanning at the stock screens
Type the code in the scan box and press Enter, as a scanner would.

| # | Where | Do | Expect |
|---|---|---|---|
| 1 | Receive stock | Scan `6001234560012` twice. | Cola crate, quantity **2**. (test) |
| 2 | Receive stock | Scan `6001234560050` (a valid barcode nothing has). | The screen asks which item it is. Pick it: the code is kept and scanning it again finds it at once. (test) |
| 3 | Count stock | Scan the single bottle three times (`6001234560029`). | Counted **3**. (test) |
| 4 | Operations, What to buy | Scan the Fanta crate (`6001234560036`). | It is added to the order, by the pack. |

### 8C. Codes and labels (Admin, Codes, with Menus on)

| # | Do | Expect |
|---|---|---|
| 1 | Open the tabs **Dishes, Recipes, Prepared batches, Ingredient lots, Kitchen stock**. | Each item has a code made from its number: dishes `DSH00000001`, recipes `RCP...`, prepared batches `PBL...`, ingredient lots `ILT...`. (test) |
| 2 | On Kitchen stock press **Give a code** on an item with none. | It gets a code starting `KIT`. (test) |
| 3 | Select a few dishes, **Print labels**. | QR labels with the name and, if ticked, the price. |
| 4 | Print the QR label of **Steak sandwich**; scan it or paste its link. | The public menu opens scrolled to that dish and outlines it for a few seconds. (test) |
| 5 | Take the Steak sandwich off every menu and scan again. | "The dish you scanned is not on the menu right now." |
| 6 | Print the QR of the **Ugali** recipe; open it signed in as staff. | It opens the kitchen card. |
| 7 | Choose **Code 128** for a dish. | The barcode holds `DSH...`, the short code, not a link. |
| 8 | Print the label of the Ugali batch from 1A. | `Made <day> 14:30, Chef Wanjiru` and `Batch ... use by ...` with a Code 128 of `PBL...`. A batch made without a chef shows only when it was made. |
| 9 | Give a kitchen item the code `DSH00000001`. | Refused: already used. |

---

## 9. Which automated test checks which figure

| Figures | Test |
|---|---|
| Ugali 15, 20 and 40 minutes; typed minutes win; ticket timer 5 minutes | `MenusPrepTimersTest`, `MenusTicketTimersTest` |
| Cake batch 553.00 and 69.13; ugali batch taken from the prepared shelf | `MenusSampleKitchenTest` |
| Tip 100 on 1,160: at most 40, change 40, change 140 | `MenusCounterTest` |
| Hand over, window, own tip, take back, report | `MenusTipsIssueTest`, `MenusTipsReportTest` |
| USD 10 at 130 = 1,300; 3.33 at 130.456 = 434.42; history 1,200 and 1,350; bag 5.20 | `MenusDishCurrencyTest`, `MenusPackagingCalcTest` |
| Codes DSH, RCP, PBL, ILT, KIT; links; labels; scanning; barcodes | `MenusCodeTypesTest`, `MenusStockScanTest` |

Not covered by any automated test: the screens themselves (floor, kitchen, kiosk, online ordering pages), printing, and the whole of this plan done by hand in a browser.

## When you find a problem
For each one write: **where** (part and test number), **what you did**, **what you expected**, **what happened**, and a screenshot if it is visual. A one-line note is enough; I will fix them in batches.
