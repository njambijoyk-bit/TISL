# Events phases 2 to 6: set-up and test walkthrough

## Set up (once, after the phase 1 steps)
1. Run `backend/database/sql/255_events_planning_market.sql`. Run `php artisan access:seed` again if you have not since phase 1.
2. **Admin → Events → Configuration → Outside organisers**: choose the four Books accounts that are new:
   - *Event planning fees are invoiced to* (income),
   - *Advertising is invoiced to* (income),
   - *Money held for vendors and venues is in* (liability),
   - *Commission on bookings is income in* (income).
3. **Platform → Templates → Add wedding, conference and birthday**; **Platform → Advertising → Add the standard set** (then set your own prices).

## Phase 2: a customer hires TISL
| # | Do | Expect |
|---|---|---|
| 1 | As a customer open `/plan-my-event`, send a request (type, date, guests, budget, notes, a time for a first talk). | It shows under "My requests" as *We have your request*. Staff with `events.admin` get a notification. |
| 2 | Admin → Events → **Enquiries**: open it, set the consultation time (status becomes *consulting*). Make a quotation with priced lines. | A Quotation is made in Books for the customer and sent; the customer sees it in their account and on the request. |
| 3 | The customer clicks **Accept the quotation** (or staff click *Customer accepted*). | A Sales Order is made, an **event project** opens (a private event owned by TISL for the client) with a Budgets initiative. |
| 4 | **Invoice the order** in the enquiry, take deposits in Books as usual. | Invoice number shows on the enquiry and on the customer's request. |
| 5 | Open the event project → **Plan**. Fill it from the Wedding template; mark tasks "Show to the client". | The customer's request page shows progress and milestones, never the budget or private tasks. |

## Phase 3: planning workspace (Events → an event → Plan)
- Tasks: add with owner, priority, dates, a dependency (a task cannot be marked done before the one it waits for), comments, "client sees it".
- Milestones, running order, budget (estimated / approved / committed / spent; a warning within 10% of the approved amount).
- Team: add a photographer with **Can see the budget** off. Log in as them: the Budget tab is gone and the API refuses it.
- Template: Overview → choose Wedding and the event day; task dates count back from it.

## Phase 4: guests and RSVPs (Plan → Guests)
- Paste a list (`name, email, phone, role, group, plus-ones`); duplicates by email are skipped.
- **Send invitations** (email / WhatsApp as the messaging settings decide); each guest gets a private link `/rsvp/<token>`.
- A guest answers yes / no / maybe, number coming (up to 1 + plus-ones), meal and needs; the summary shows heads, meals and needs. **Remind** goes only to those who have not replied.
- Offline door: on the door screen press **Save the list for offline use** while online. Switch the phone to aeroplane mode and scan: a saved ticket is accepted and queued ("n waiting to be sent"); switch back and it syncs. A ticket not on the list is refused offline.

## Phase 5: advertising
- A published, approved event: Plan → **Promote** → choose a product and a start date. Places are limited per product; a full product refuses new requests for those dates.
- Admin → Platform → **Advertising** → Approve → **Invoice** (needs the client customer of the event, or a customer account for whoever asked).
- The promoted event shows first on `/events` with a "Promoted" tag (featured) and in the banner row (banner). Views, clicks and tickets sold since the start show on the campaign.
- `/events` can be filtered by category, place and highest price.

## Phase 6: vendors and venues
| # | Do | Expect |
|---|---|---|
| 1 | Browse `/event-directory/vendors` (or `venues`), open one, **Ask for a booking** for one of your events. | The provider gets a notification; the booking is an *enquiry*. |
| 2 | As the provider (`/organise/vendors/<id>` → Bookings) send a quote with a deposit %. | The planner sees the quote, and a budget line appears in the event's budget (estimated). |
| 3 | Planner **Accepts the quote**. Admin → Platform → **Bookings** → *Record payment* for the deposit. | Booking becomes *confirmed* once the deposit is in. Books: Dr bank / Cr "held for vendors and venues". The budget line shows committed and spent. |
| 4 | Provider **Mark as delivered**; planner pays the balance (recorded the same way) and presses **Job is done**. | On completion TISL's commission is moved from the held money to commission income. |
| 5 | Platform → Bookings → *Pay out* (only what belongs to completed jobs is payable). | Books: Dr held / Cr bank. |
| 6 | Planner rates a completed booking. | Rating shows on the provider's public page; only people who booked can review. |
| 7 | A venue booking for days already taken, or a day the provider blocked, is refused. | |

## Known limits
- Tax on ticket sales and on planning fees follows the income account's tax setting in Books; commission on vendor/venue bookings is computed on the quote.
- Payments to TISL for bookings are recorded by staff (bank, till or M-Pesa received); there is no online card checkout for them yet.
- Newsletter promotions are sold and approved here; sending the newsletter is outside this module.
- Customer uploads on a planning request are not included.
- Verification proof for organisers, vendors and venues is by hand-reviewed documents (admin chooses what to ask for).
