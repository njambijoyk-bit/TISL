# Menus module (food and drink) — plan

Status: **step 1 (the foundation) is built and pushed**: ingredient families with preferred and substitute stock items (script 132), recipe lines that name an ingredient, use recipe units and waste, the method steps, costing and publishable flag (script 133), dishes with a hidden stock item, inherited allergens and diets, availability, the Menus settings (script 134), and the admin screens (Admin → Menus: Dishes, Ingredients, Recipes, Settings). Also built: the location *kind* text box with suggestions that follow the modules. **Step 2 is built too**: menus with days and hours and sections (Admin → Menus → Menus), choices on a dish (size, sides, extras, things to leave out, with what they use of the recipe and a free removal by default), and the public menu page at `/menu` with diet and allergen filters (script 135, `MenusMenusTest`, the same browser check). **Step 3 (online pickup and delivery) is built**: the customer fills a basket on `/menu` (choices, notes, time slots, pay now by M-Pesa/card or pay when it is collected/delivered), follows the order at `/menu/order/<link>` (no sign-in), and the kitchen works the board at Admin → Menus → Orders; the ways to order are switched on under Menus → Settings (script 136, `MenusOrdersTest`, browser check `frontend/e2e/menus-orders-ui.mjs`). Orders are ordinary Sales Orders in the books (delivery is a shipping charge line; a set-meal side is a free line so its stock is taken); an unpaid online order is cancelled after 30 minutes by `menus:sweep-orders` (needs the scheduler); an order cancelled after payment is flagged *refund due* for staff to refund. **Step 4 (kitchen screens) is built**: kitchen stations (grill, cold, bar…) under Menus → Settings, the station chosen on each dish (a dish with none goes to the station that takes everything else, per branch), one ticket per order per station, a screen per station at Admin → Menus → Kitchen (oldest first, choices, notes and allergens in bold, a timer that turns red after the station's limit, sound for new tickets, full screen, a paper ticket to print), and the pass showing every station's progress. The first ticket started moves the order to *preparing*; the last ticket ready makes it *ready* and tells the customer; an order for later waits under *Later today* until its time is near (script 137, `MenusKitchenTest`, browser check `frontend/e2e/menus-kitchen-ui.mjs`). A dish that no station takes keeps the order from becoming ready by itself: staff finish it from the Orders board. **Step 5 (the counter) is built**: Admin → Menus → Till is the cashier's screen: tap dishes (with choices and notes), choose dine in or take out, then *Pay* (cash with change, M-Pesa or card with a reference, split across ways, a tip when the tip account is set, a service charge on dine-in that the cashier may waive) or *Open a tab* for a table that is ordered in rounds, sent to the kitchen each time and paid at the end as one sale. Paid orders wait under *To hand over* with the number to call out. The receipt is the kiosk layout (58 or 80 mm, printed from the browser). Tips and service charge post to the accounts chosen in Menus → Settings (script 138, `MenusCounterTest`, browser check `frontend/e2e/menus-till-ui.mjs`). Not built yet: discounts at the till, a cash drawer / shift close, offline use, refunds from the till (a refund is made in the books). **Step 6 (tables and the floor) is built**: Admin → Menus → Floor is the plan of the tables (areas per branch, drag to arrange, seats, round or square, each table's own QR code to print) showing what every table is doing (free, reserved from the Bookings calendar, seated, ordered, eating, bill asked, paying, cleaning). From a table staff seat guests, take the order in the till (a tab at that table), ask for the bill, join tables for a big party, move a tab to another table, split the bill by dish, and mark the table cleaned. The page behind the QR code (`/menu/table/<code>`, no sign-in) shows the menu and the table's tab, sends orders to the kitchen as rounds, asks for the bill and pays it by M-Pesa or card from the phone; whether a scan may open an empty table is a setting (script 139, `MenusFloorTest`, browser check `frontend/e2e/menus-floor-ui.mjs`). Not built yet: making a reservation from the floor (use Bookings; a table linked to its bookable table shows the reservation), split-by-seat, order transfer between branches. **Step 7 (the self-order kiosk) is built**: a kiosk is a screen guests order on themselves, opened at its own secret address (`/kiosk/<secret>`, made under Menus → Settings → Kiosks; nobody signs in on it). Big buttons, the dishes with price including tax and allergens said plainly, choices, dine in or take out, then pay at the screen (an M-Pesa prompt on the guest's phone; the kitchen starts when the money arrives) or take a number and pay the cashier (the order waits under *Kiosk orders to pay* in the till and the kitchen starts when the cashier takes the money). It shows a big call-out number, prints a slip, asks "are you still there?" and goes back to the welcome screen on its own, emptying the basket. The receipt carries the kiosk session code. Counter and kiosk share one run of call-out numbers each day (script 140, `MenusKioskTest`, browser check `frontend/e2e/menus-kiosk-ui.mjs`). Not built yet: a "now serving" display, kiosk-only prices, card payment at the screen. **Step 8 (chefs) is built**: Admin → Menus → Chefs gives a member of staff a kitchen profile (the name and title guests see, a few words, a photo, the stations they work, whether they teach for Courses later, whether they are shown on the public chefs page `/chefs`), shows who is on duty now (from the attendance sign-ins that already exist) and holds their certificates (food handler, medical, first aid, HACCP…) with the day each runs out. A daily job (`menus:chef-certs`, needs the scheduler) tells the chef and the people who manage the kitchen a month before a certificate runs out and again when it has, once each (a new date starts the warnings again). A dish can be credited to a chef ("by Chef Wanjiru" on the menu, only when that chef is shown to guests) (script 141, `MenusChefsTest`, browser check `frontend/e2e/menus-chefs-ui.mjs`). Not built yet: rotas and shifts (use Attendance), the Courses link (the "teaches" switch is ready for it). **Step 9 (kitchen operations) is built**: Admin → Menus → Operations has three tabs. *Prep list* works out a day (tomorrow by default) from what each dish sold on that weekday over the last four weeks, a little extra (10% by default), or what is already ordered for the day if that is more; a dish made ahead says how many to make (and in how many batches) after what is on the shelf, a dish made to order asks for its ingredients for all of it, and the ingredient list says what is short; it prints. *Waste* records spoilage, over-prep, plate waste, staff meals or other, takes the stock out first-expiring first (expired batches included) through the same write-off as the Stock module (a dish thrown away is written off as what it is made of), books the loss, can be taken back (the journals are cancelled and the stock returns), and reports the last 30 days by reason and item with the share of food sales. *What to buy* adds the coming days' forecast use, less the shelf, plus the level to keep (reorder level) of each ingredient; a family is bought as its preferred item, whole packs for things counted in packs; it knows the supplier from the last purchase and makes one Purchase Order per supplier, naming any item with no supplier yet (script 142, `MenusOperationsTest`, browser check `frontend/e2e/menus-operations-ui.mjs`). Not built yet: cooking services, the Courses link. **Step 10 (cooking services, first slice: made-to-order cakes and catering) is built**: a dish can carry a *notice needed* in hours (Dishes form); those dishes are the cakes. Customers ask at `/menu/custom` (no sign-in; switched on under Menus → Settings → Cakes and catering, off by default): a cake is picked with its choices and the words on it and is **priced and quoted at once**, catering (headcount, venue or delivery, wishes) **waits for a quote** from staff. The date must respect the notice (a cake: the longest of its dishes; catering: the setting, 72 hours by default). The quote carries a **deposit** (50% by default, changeable per quote) and stays open 7 days. The customer follows it at `/menu/request/<link>`; **accepting needs a customer account** (the balance is kept on the invoice), then the quote becomes a Sales Order and an invoice (no stock moves yet) and the deposit goes through the same M-Pesa/card gateways; when it arrives the job is *confirmed* and counts in the prep list and what-to-buy for its day. The balance is paid online or at the counter before it is handed over; **the stock is taken when the job is marked ready** (a delivery note on the Sales Order; a shortage is noted on the job and never stops it). Cancelling before any money cancels the books; after a deposit the job is flagged *refund due*. Quotes nobody answers expire and a deposit not paid within a day lets the job go (in `menus:sweep-orders`). Staff work it at Admin → Menus → Cakes & catering (make or change the quote with per-head lines, take a payment at the counter, start, ready, done, turn down, cancel); requests are limited to the branches a person is cleared for (the same branch rule as stock). (script 143, `MenusCookingTest`, browser check `frontend/e2e/menus-cooking-ui.mjs`). Not built yet: a reference photo on a cake, private chef, meal plans, cooking classes and pop-up dinners (those reuse Services/Bookings, Memberships and Events), a catering package list, a delivery fee on a job. **Step 11 (cooking services: private chef at home) is built, NOT yet tested**: a third kind of request on the same flow as cakes and catering. The customer asks at `/menu/custom` (Private chef tab): people, how long the chef stays (1 to 12 hours), who buys the ingredients (the chef, the client or our stock), an optional chef they would like (public chefs only), what to cook, allergies and diets, the date (least notice is a setting, 48 hours by default) and the home address. Staff open it under Cakes & catering, **choose the chef** and the time they stay and price it (the quote asks for a chef); a chef **cannot hold two jobs close together** (an hour either side to travel; jobs that are accepted, confirmed or being prepared hold the chef, checked when the quote is made and again when the customer accepts). When the deposit arrives the chef is told. The staff screen can be filtered by chef. (script 144, adds `chef_id` and `duration_minutes` to `menus_requests`). Tests and the mutation check for this step were deliberately not run yet. Cooking classes and anything taught belong to the Courses module (owner decision), so they are not built here. Not built yet: meal plans (a subscription with a rotating weekly menu), packages with fixed prices for private chef, a chef's own calendar page, leave and days off. **Step 12 (chef rotas and days off) is built, NOT yet tested**: Admin → Menus → Rota is a week grid of every chef by day. A manager adds shifts (chef, day, from and until, branch, station, a note) as **drafts** and **publishes** the week: each chef is told their own shifts once; changing or removing a published shift tells the chef again; *Copy last week* plans a week like the one before (leaving out any shift that no longer fits). A chef can not be given two overlapping shifts, a shift on an approved day off, or one that overlaps a private chef job they hold (and a private chef job can not be given to a chef who is off or rostered at the kitchen then, with an hour to travel either side). Too many hours in a week, too little rest between days, a station the chef is not set up for and a certificate that will have run out by the shift day are **warnings**, not refusals (the limits are in Menus → Settings → Chef rota: 48 hours, 10 hours of rest). A chef asks for **time off** (day off, leave, sick, other) from the same page; managers are told and approve or decline (the chef is told); an approved request takes that chef's shifts in those days off the rota and lists any private chef jobs they still hold so another chef can be found; a manager can also record time off for someone (approved at once). Nobody decides their own request while another manager could. Chefs see the whole rota, their own shifts (marked) and can cancel their own requests; adding shifts, publishing and deciding need menus.manage; shifts belong to a branch and the usual branch clearance applies. Menus → Chefs shows who is rostered today. (script 145). Tests and the mutation check for steps 11 to 14 are still to do. **Step 13 (the rest of the rota) is built, NOT yet tested**: **Shift swaps**: on a published shift that has not started, *Swap* asks a colleague to cover it or to trade for one of theirs; the colleague says yes or no, then a manager approves (a setting lets an agreed swap go straight through); both are checked when asked and again when made (day off, overlapping shift, private chef job), a trade changes both shifts together or neither, both chefs are told, and a swap whose shift has started runs out. **Weekly patterns**: a pattern (chef, weekdays, from and until, branch, station, from a day, until a day or open-ended) plans **draft** shifts; *Plan from patterns* does the week on screen and a daily job (`menus:rota-plan`, 06:10) plans the coming weeks (2 by default; 0 switches it off) and tells the managers once when it planned anything; a day the chef is off or holds a private chef job is left out, an existing shift is never planned twice; stopping a pattern removes the drafts it planned, never published shifts. **Leave balances**: a chef who has an employee record has HR's leave balance; asking for *leave* is refused when it costs more than the balance, approval takes the days off it (written to HR's leave log), cancelling approved leave gives them back; days are counted on the company's working days from the Attendance settings; sick days, days off and other time away cost nothing; a chef with no employee record has no balance and is never refused. **Checked against attendance**: each published shift that has started shows whether the chef signed in (*Signed in*, *Late n min* after the Attendance grace period on the day's first shift, *Not signed in* while it runs, *Did not come* when it ends, *Left early*, *Away* on leave), the chef row shows hours planned against hours signed in, and a job (`menus:rota-watch`, every 10 minutes) tells the managers once per shift about a chef who has not signed in (switch off in Menus → Settings). Attendance itself is never changed. (script 146). Tests and the mutation check for steps 11 to 14 are still to do. **Step 14 (pay from the rota, the open shift board, clocking in) is built, NOT yet tested**: **Pay and overtime from the rota**: *Hours* on the Rota page (per month) shows for each chef the hours rostered (published shifts), worked (Attendance), overtime (time beyond the rostered hours, or all of it on an unrostered day, after a grace of 15 minutes), short time, days not verified, no-shows and late days, with each day opened out; with payroll access it adds the hourly rate (salary over the company's working days and hours, as payroll works it) and the overtime worth at payroll's multiplier; managers download it as a spreadsheet; a chef sees only their own hours. A setting (*Payroll takes a chef's overtime from*) lets payroll use the rota's overtime for chefs instead of the company working day (default: attendance, so nothing changes until chosen); only days Attendance has verified are paid either way. **Open shift board**: a manager posts a shift nobody holds, or a chef gives a published shift back (it stays theirs until someone else takes it); every chef who is free and set up for the station is told; a chef claims it (refused if off, overlapping, holding a private chef job or not set up for the station, and the page says why); a manager awards one claim, or with the setting off the first free chef gets it at once; the shift lands on the chef's rota published, the chef who gave it back loses it and is told, other claims are declined; unclaimed shifts run out when they start (`menus:rota-watch`). **Clocking in from the rota page**: a chef with a published shift today sees a card with Clock in (opens 30 minutes before the shift, until it ends) and Clock out; it is the very same sign-in as Attendance, lateness is judged against the shift start and the Attendance grace, only for oneself, only for a rostered shift (switch off in Menus → Settings). (script 147). Tests and the mutation check for steps 11 to 14 are still to do. Not built yet: shift premiums (night, weekend, holiday pay), clocking by location, an overtime approval step before payroll, paying chefs per shift. **Next: meal plans (or the Courses module); then the tests and mutation check for the whole Menus module.** Run scripts 132 to 147 in order, then set the sales account under Menus → Settings. Tests: `LocationKindTest`, `MenusIngredientsTest`, `MenusRecipesTest`, `MenusDishesTest` (every rule mutation-checked); browser check `frontend/e2e/menus-ui.mjs`. Decisions marked ✔ are the owner's; the rest are recommendations waiting for a yes. Written after reading what already exists (below), so the module reuses it instead of rebuilding it.

## 1. What the owner asked for

A Menus module with a **differential layer** (the same food sold through different "ways in": kiosk, tables, counter, online…), plus **tables, chefs, ingredients, recipes, inventory and ingredient variants**. Later the **Courses** module can **sell recipes, teaching courses and cooking books**. There should also be **different kinds of cooking service** (catering, private chef, classes, custom cakes…).

## 2. What already exists (so we do not rebuild it)

| Need | Already built | How Menus uses it |
|---|---|---|
| Stock of ingredients, batches, expiry, first-expiring-first, held/recalled stock | Core stock engine (`stock_batches`, `stock_movements`, polymorphic `item_type`), purchases / goods received, transfers, counts, write-offs | Ingredients are stock items, bought and counted exactly like products |
| Units and conversions (g ↔ kg, ml ↔ l, "each", packs) | `UnitOfMeasure.to_base_factor`, per-variant units | Recipes are written in small units, bought in big ones |
| **Recipes and production** | `recipes`, `recipe_items`, `RecipeService`, `ProductionService`, Admin → Menus → Recipes. Two modes: **made ahead** (a production run turns ingredients into a costed batch) and **made to order** (a sale consumes the ingredients). Already filed under the Menus module key | Becomes the engine under every dish. We extend it, we do not replace it |
| Places and what each may do | Locations with `produces`, `sells_to_customers`, `fulfils_orders` (script 97); per-location offering and price | A kitchen is a location that produces; a café, a food truck and a central kitchen are just locations |
| Tables, rooms, staff, equipment that can be booked | `BookableResource` (types include `table`), hours, time off, buffers, bookings, calendar | Tables and the reservation of a table are bookable resources, no new booking engine |
| Selling and money | Checkout, sales vouchers, payments (M-Pesa, card), credit, tax, books, refunds; guest checkout (as Events does) | A menu order is an ordinary sales order, so the books, VAT and cost of sales are right with no new accounting |
| Quotes, deposits, projects | Quotes module, projects | Catering and custom cakes: quote → deposit → make → deliver |
| Delivery | Delivery module (manifests, drivers, routes, ratings, proof) | Menu delivery orders ride the same drivers |
| QR codes and labels | Codes module | A QR on every table and every kiosk |
| Events and ticketing | Events module | Chef's table, pop-up dinners, paid cooking classes with a date |
| Messages | Notification system (bell, email, WhatsApp) | "Your order is ready", "your table is free", kitchen alerts |
| Services and packages with materials | Services, service materials (script 27), bookings | Private chef, cooking-lesson-at-home and similar are Services that already use stock |
| Access | Roles and permissions engine | `menus.*` permissions, no role names in code |

## 3. The shape of it

### 3.1 The core idea: one kitchen, one menu catalogue, many ways in

```
Ingredients ─▶ Recipes ─▶ Dishes (menu items) ─▶ Menus (sections) ─▶ Channels ─▶ Orders ─▶ Kitchen stations (KDS) ─▶ Served
 (stock)       (BOM,        (price, photo,         (breakfast,        (the         (sales      (grill, cold, bar…)
               method)       allergens, options)    lunch, bar…)       differential  order)
                                                                        layer)
```

### 3.2 The differential layer: **Channels**
A **channel** is one way a customer or staff member orders. The same dish can be on all of them or only some, at different prices, hours and rules.

| Channel | Who orders | Pays | Notes |
|---|---|---|---|
| **Dine-in, waiter** | Staff on a tablet/phone at the table | At the end (a *tab*), split bill, tips | Table must be open; orders go to the kitchen as rounds |
| **Dine-in, QR at the table** | Guest scans the table QR | Pay now or add to the tab | Table is known from the QR; no sign-in needed |
| **Kiosk** | Guest at a self-order screen in the venue | Pay at the screen or at the counter | Large-button mode, fixed to one location, auto-resets, no account |
| **Counter / POS** | Cashier | Straight away (cash, M-Pesa, card) | Quick-service restaurants and cafés |
| **Online takeaway / pickup** | Customer on the website | Online | Pickup time slots, prep time, order ahead |
| **Online delivery** | Customer on the website | Online or on delivery | Uses the Delivery module, a delivery fee and zones |
| **Catering / custom order** | Customer or staff | Deposit, balance later | Lead time, headcount, date, quote first (see §5) |

Each channel carries its own: which menus are visible, **price override** (kiosk and online can differ from dine-in), opening hours, prep-time estimate, order type rules (needs a table? needs an address? needs a pickup slot?), payment rule (pay first / tab / either), and which **kitchen stations** receive it. A venue can switch a channel off without touching the menu.

### 3.3 Ingredients and ingredient variants
- **An ingredient is a stock item**, bought, received, counted and expired like any product, so purchases, batches, expiry, supplier bills and the stock reconciliation work with no new code.
- ✋ **Decision A (the big one):** how do "variants" work for ingredients?
  - **Recommended:** an **ingredient family** ("Wheat flour") with **variants** that are real stock items ("Exe 2 kg", "Pembe 24 kg", "Brown, organic"). A recipe line says *"200 g wheat flour"* and the kitchen consumes from a **preferred variant first, then allowed substitutes** (cheapest, or first-expiring). Costs follow the batch actually used. This is what a real kitchen does when a supplier is out.
  - Simpler alternative: a recipe line points at one exact stock item only (what the current recipes do). Safe and already built, but a stock-out of that exact brand blocks the dish.
- **Units:** recipes in g/ml/each, purchases in kg/l/packs, conversion by the existing unit tables. A **yield / waste %** per ingredient ("peeled potatoes lose 15 %") is part of the recipe line, so the cost and the stock use are honest.
- **Not for sale by default:** ingredients are hidden from the shop. A flag lets an ingredient also be sold retail (spice jars, a bottle of house sauce).

### 3.4 Recipes (the existing engine, extended)
Today a recipe is a cost-and-stock list (yield, ingredients, made ahead / made to order). We add, without breaking what is there:
- **Method**: ordered steps with a photo or short video, timings, equipment, notes. Separate from the stock list so a kitchen can print a *prep card* and a course can later publish the same content.
- **Sub-recipes**: a sauce, dough or stock is itself a recipe that other recipes use (made ahead, with its own shelf life).
- **Costing**: cost per portion from the real batch costs, margin against the menu price, and a "food cost %" flag when it drifts.
- **Scaling**: write once for 1 portion, cook for 40.
- **Allergens and diet tags** are set on ingredients and **inherited** by dishes (a dish is "contains nuts" because an ingredient is), with a manual override. Calories/nutrition can come later from the same data.
- **Publishing level:** *internal* (kitchen only) or *publishable* (can appear on the website, and later in Courses). Default internal.

### 3.5 Dishes, menus, sections, options
- **Dish (menu item):** name, description, photos, price (tax-exclusive like everywhere), allergen and diet badges, prep time, station, availability, a link to its recipe.
- **Menu:** a named set (Breakfast, Lunch, Dinner, Bar, Kids, Catering list) with days and hours; **sections** inside it; the same dish can be in several.
- **Options and modifiers:** size, add-ons ("extra cheese +50"), removals ("no onion"), required choices ("choose a side"), **combos / set meals**. A modifier can **use extra ingredients** (extra cheese consumes cheese) or remove some, so stock stays right.
- **Availability** follows stock automatically: a made-to-order dish disappears (or says "sold out") when an ingredient cannot cover one more portion; staff can also "86" a dish by hand for the day. Per-location offering and price override use the axes that already exist.
- ✋ **Decision B:** the recommended link to money and stock is that **every dish owns a hidden finished-item stock variant**, created automatically. Then vouchers, cost of sales, refunds, credit notes, batches and `ProductionService` all work unchanged, and `menu_items` only add the presentation (sections, modifiers, allergens, channels). The alternative (a separate sellable type) means teaching the books and stock about a new thing: more work and more risk.

### 3.6 Tables and the floor
- **Floor plans** per location: areas (indoor, patio, bar), tables with seats, drag-to-arrange layout; a table is a `BookableResource` of type `table`, so **reservations** use the bookings engine and show in the calendar.
- **Table states:** free → reserved → seated → ordered → eating → bill asked → paying → cleaning → free. One tap to move each; staff see the whole floor at a glance.
- **Table QR:** each table has a printed QR (Codes module) that opens that table's menu; opening a table by QR needs the table to be *open* (seated by staff) or allowed open-by-scan (setting).
- **Merge / move / split a table**, transfer an order between tables, **split the bill** by item, by seat or equally, **tips and optional service charge** (a setting, off by default).

### 3.7 Chefs and the kitchen
- **Chefs are staff** (existing employees and users) with a **kitchen profile**: stations they work (grill, cold, pastry, bar), certifications (food-handler certificate with expiry date, using the existing document/vault dates), a public bio and photo that can show on the website ("Chef Wanjiru"), and later **become an instructor in Courses**.
- **Stations and KDS (kitchen display):** each station has a screen showing its tickets, the timer, allergens and modifiers in bold; a chef taps *started* → *ready*; when every station for a table's round is ready the waiter is alerted. **Expo** screen for the pass. Optional printed ticket fallback.
- **Rota and time** reuse the attendance and scheduling that exist. Dish → station routing is configured per dish.
- **Roles (permissions, seeded):** `menus.view`, `menus.edit`, `menus.recipes`, `menus.orders`, `menus.floor`, `menus.kitchen`, `menus.pos`, `menus.refund`, `menus.reports`, `menus.settings`.

### 3.8 Inventory and kitchen operations
- **Made to order:** a sale consumes the ingredients (already built). **Made ahead:** production runs, batch, shelf life (already built), plus a **prep list** generated from tomorrow's reservations and sales history.
- **Waste log** (spoilage, over-prep, plate waste, staff meal) with a reason, valued at cost: feeds food-cost reports and the stock count.
- **Reorder suggestions:** from par levels and forecast use, creating a purchase draft for the supplier.
- **Theoretical vs actual usage:** what the recipes say should have been used vs what the counts show was used; the gap is the leak (waste, theft, over-portioning).
- **Central kitchen → branches:** production at a location with `produces`, then the existing **stock transfers** to cafés.

## 4. Orders and money
- A menu order is a normal **sales order**, so the books, VAT, discounts, loyalty and refunds already apply. Tabs are an open order that is settled at the end. Tips and service charge post to their own ledgers.
- **Order lifecycle:** received → accepted → preparing → ready → (served | picked up | out for delivery | delivered) → closed; or cancelled / refunded with a reason. Customers see it live on their phone ("My orders").
- **Notifications (new types):** `menu_order_received`, `menu_order_ready`, `menu_order_delayed`, `menu_table_ready`, `menu_reservation`, plus **staff** alerts (new online order, order waiting too long, ingredient low, certificate expiring).
- **Payments at the table:** guest pays by M-Pesa STK prompt from the QR page; waiter can take card/cash and close the tab.
- **Offline-tolerant POS:** the waiter app should keep working through a short internet drop and sync after (a decision for the build, see §7).

## 4a. Receipts and kitchen tickets (the format the owner liked)

✔ The owner likes the **kiosk receipt** layout (a fast-food kiosk receipt, monospaced, narrow). We use it as the one look for the customer receipt, the kiosk/counter/online order slip and the kitchen ticket, built from one template so they never drift apart:

```
        BUSINESS NAME / BRANCH
   address line, town
   phone · PIN / VAT number
   26/09/2026, 06:04:34 AM
 ---------------------------------
 Order Type          Take Out
 POS Order #         6829
 Kiosk Session       RXC22ZCIX3
 ---------------------------------
 1  Steak, Egg & Cheese       9.50
    - White Bread
    - Remove Mayo
    - Remove Egg
 1  Steak, Egg & Cheese       9.50
    - White Bread
 ---------------------------------
 Subtotal                    20.70
 Sales Tax                    1.41
 Service Charge               0.62
 Total                       22.73
```

What we take from it:
- **Header:** business and branch, address, phone, tax number, date and time.
- **Order block:** order type (Dine in / Take out / Delivery / Catering), a short **order number** the customer can call out, the **channel and its session code** (kiosk, table, counter, online), and for tables the table and seat.
- **Lines:** quantity, dish, price on the right, **modifiers indented under it** with a dash, "Remove x" shown plainly, a price beside a modifier only when it costs something.
- **Totals:** subtotal, **tax (shown per rate)**, service charge and tip when on, total, then how it was paid (cash, M-Pesa with the code, card), change, and the order's QR for "track my order" / reorder.
- **Same template, three outputs:** (1) the customer receipt (screen, email, PDF, 58 mm / 80 mm thermal printout), (2) the order slip (customer's number, big), (3) the **kitchen ticket**, the same layout with no prices, larger type, allergens and "NO ..." in bold, the table and the course.

**One lesson from the same receipt** (the post it comes from complains that removing an egg was charged $1.70): **removals are free by default**. A removal never adds a charge and, if the ingredient is removed, it is not consumed from stock. Only add-ons carry a price; a business may deliberately price a removal (a setting per option), but the default and the screen wording make it clear what costs money.

Receipt wording (footer message, return policy line, social handle) is edited in Settings → Menus. Printers are the owner's hardware; the template is plain monospaced text and a print stylesheet so any ESC/POS-compatible or browser-printed thermal printer works, with no printer-specific code in the first releases.

## 5. "Different kinds of cooking service"

These reuse existing modules. Menus supplies the food side (recipes, costing, ingredients); the booking and money side already exists.

| Service | How it is sold | Built from |
|---|---|---|
| **Restaurant / café** | Channels above | Menus |
| **Catering (events, weddings, offices)** | Request → **quote** (per head, packages, add-ons) → **deposit** → balance → prepare → deliver or serve; ingredient needs pulled into a prep and purchase list | Quotes + Menus catering list + Delivery + Events if ticketed |
| **Custom cakes / made-to-order bakes** | Customer picks a base, size, flavour, message; **lead time** by item, **deposit**, **pickup/delivery date and slot**, photo reference | Menus (lead-time dishes) + deposits |
| **Private chef at home** | A **Service** with packages (dinner for 6, weekly cook); a chef is the booked resource; ingredients shopped or stocked | Services + Bookings + the chef profile |
| **Meal prep / weekly meal plans / office lunch subscriptions** | A plan the customer subscribes to, a rotating weekly menu, skip-a-day, delivery days | Menus + **Memberships** (later) + Delivery |
| **Cooking classes** | A dated class with a chef and a seat count | **Events** now; **Courses** later (see §6) |
| **Chef's table / pop-up dinners** | Ticketed set menu | Events + a fixed menu |
| **Food truck / outside catering** | A location (mobile) with its own channel and stock | Locations |

## 6. Hooks for Courses (later), so we design for it now
- A **recipe is structured data** (ingredients, quantities, steps, media), so a **Courses lesson can embed a recipe** and a **recipe card or cookbook chapter** can be generated from it.
- **Sellable content:** recipe packs and cooking books are products (physical or **digital download**, which the platform plan already lists), a course is a Courses item taught by a chef from the chef profile; a class can have both a live Event date and a Course for the video version.
- **"Cook it" button:** from a course or recipe page, "add the ingredients to the basket" buys the ingredient list from the shop, using the ingredient variants as the product choices. This is the real payoff of selling ingredients retail and of the *publishable* flag on recipes.
- **Rule:** a recipe made *publishable* never exposes cost, supplier or margin; those stay internal.

## 7. Decisions

✔ **Decided by the owner:**
- **First business: all of them** (restaurant/café, bakery and custom cakes, catering kitchen, multi-branch brand). So nothing in the foundation may assume one kind of business: channels, lead times, deposits, central kitchen and per-branch menus are all designed in from step 1, and the build order in section 8 is kept (it starts with what every one of them needs).
- **Ingredient variants: families with preferred and substitute variants** (Decision A, recommended option).
- **Dish link: a hidden finished-item stock variant per dish** (Decision B, recommended option).

- **Set up for every kind of business; a single restaurant or a chain is decided by the Locations table**, not by a setting in Menus. A location's **kind** is a **compulsory text box** (up to 20 letters, the column is VARCHAR(20)) with **clickable suggestions that follow the modules that are licensed and switched on** (Menus adds restaurant, cafe, bakery, bar, central kitchen, food truck). A kind only fills in the four capability switches (sells, delivers, receives goods, makes things); built and tested (`LocationKindTest`).
- Kitchen screens (KDS): **we build them**. Online pickup/delivery first, then counter, tables, kiosk.
- **Tips and service charge:** an accounting matter, managed in the ledgers like VAT (their own ledgers); the menu only posts to the ledgers chosen in Settings → Menus.
- **Offline-tolerant till:** yes (kept in the build order, after the online-only till).
- **Allergen wording:** a disclaimer line on the menu, agreed. **Table QR ordering without sign-in:** yes.

### Decisions needed from the owner (what changes the build)
1. **First business to serve** and its size: a single restaurant/café, a bakery/cake business, a catering kitchen, or a multi-branch brand? This sets the order of the phases below.
2. **Ingredient variants** (Decision A): ingredient families with preferred and substitute variants (recommended), or one exact item per recipe line.
3. **Dish ↔ stock link** (Decision B): hidden finished-item variant per dish (recommended) vs a new sellable type.
4. **Which channels first:** the recommended order is online pickup/delivery → counter/POS → dine-in with tables → kiosk, because the first uses the checkout that exists.
5. **Kitchen screens:** KDS on a tablet/monitor, printed tickets, or both. (Hardware is the owner's; we build the screens.)
6. **Tips and service charge** in scope for the first release, or later?
7. **Offline POS** needed (spotty internet at the venue), or online-only first?
8. **Allergen promise:** we show allergens, but the business is responsible for what it declares; wording to be agreed (a disclaimer line on the menu).
9. **Table QR ordering without a sign-in:** allowed (recommended, like Events guest checkout)?

## 8. Build order (each step tested and pushed, like Events and Security)
1. **Foundation:** module registration and permissions; ingredient families and variants with substitutes; recipe upgrade (method steps, sub-recipes, yield/waste, scaling, costing, allergens inherited); the dish ↔ stock link. *No customer-facing screens yet.*
2. **Menus and dishes:** menus, sections, dishes, options/modifiers (with ingredient use), availability from stock, "86" a dish; admin screens and the **public menu page**.
3. **First channel: online pickup and delivery:** pickup slots and prep time, checkout, order lifecycle, notifications, "My menu orders", reorder.
4. **Kitchen:** stations, KDS, expo, printed ticket fallback, order timers.
5. **Counter / POS and tabs:** cashier screen, payments, receipts, tips.
6. **Tables and floor:** floor plan, table states, reservations (bookings), table QR ordering, split and merge bills.
7. **Kiosk mode.**
8. **Chefs:** kitchen profiles, certificates, public chef pages.
9. **Operations:** waste log, prep list, reorder suggestions, theoretical vs actual usage, food-cost and sales reports.
10. **Cooking services:** catering quotes and deposits, custom cakes with lead time, private chef service, meal plans.
11. **Courses hook** (when Courses starts): publishable recipes, "cook it" basket, chefs as instructors.

## 9. Data (database scripts, numbered from 132; exact list fixed when step 1 starts)
New tables, all `menus_*`-prefixed and added to the Menus backup list: ingredient families and their variant links with substitute order, recipe method steps, sub-recipe links, allergens and diet tags, menus, sections, dishes, option groups and options (with ingredient use), channels with their rules and prices, kitchen stations, orders' kitchen tickets, floor plans and tables (linked to `bookable_resources`), tabs and bill splits, waste log, chef kitchen profiles. Existing `recipes` / `recipe_items` keep working unchanged.

## 10. What I will not do without asking
- Change how the books, VAT or cost of sales work.
- Reinterpret any existing recipe: today's recipes stay valid and keep behaving as they do.
- Add hardware-specific code (printers, card readers) in the first releases.
