# Events (ticketed) — plan

Status: **built so far:** steps 1–5 (data, permissions, seat rules; the staff screens under Admin → Events; the public Events list and event page, buying with or without an account, free RSVP, M-Pesa and card payment, tickets turning valid when the money is confirmed, seats given back when nobody pays; the ticket itself: a signed code only we can make, its QR drawn by our own encoder, the ticket page, PDF, passing a ticket to another name, the email, My event tickets, "find my tickets" for guests; the door: Admin → Events → Door, with scan, who has arrived, guest list search, letting someone in by hand, undo, scan log and a spreadsheet). **Still to build:** steps 6–7 (refunds and event cancellation/postponement notices; reminders and the sales summary). On an iPhone the door types or uses a handheld scanner until our own camera reader for Safari is built. To use it: run `120_events.sql` (and `121_events_nav_link.sql` for the storefront menu link) and `php artisan access:seed`; the scheduler must be running (`events:release-holds` every minute) and, for M-Pesa and cards, the payment settings done. Decisions marked ✔ are the owner's.

## Decisions
- ✔ **Anyone can buy, no sign-in.** Guests give name, email and phone; a signed-in customer's purchase is linked to their account (and shows in My tickets).
- ✔ **Our own QR system.** Tickets are issued, signed and checked by us, with no outside ticketing service. Each ticket carries a code only we can make (HMAC of the ticket id with the app key). The QR image is drawn on our server and printed in the email/PDF; the door screen reads it with the phone camera and asks our server. The QR encoder, signed codes and scanner come from the **core Codes service** (`docs/CODES_PLAN.md`), which is built first; Events is its first user.
- ✔ **All event kinds in the first version:** single-date, free with RSVP, multi-day / recurring, online (join link only for ticket holders).
- ✔ **Refunds:** staff approve; each event has a **refund cut-off date**; after it, no refund request. Same pattern as preorder cancellations (staff decide, money returned in the books).

## What it is
An **Event** has a title, picture/video (reuse the product video field), description, venue (or online link), organiser, visibility, and one or more **Sessions** (a start and end). A single-date event has one session; a multi-day or recurring event has many (a recurring rule just generates them). **Ticket types** belong to the event (General, VIP, Early bird, Free RSVP…): price, currency, capacity, sale window, max per order, optional "valid for sessions" (all, or chosen ones — a day pass vs a full pass). A **Ticket** is one admission, with a holder name, a unique code and a state.

## Money (reuses what exists)
- Buying tickets places an order like any checkout (a Sales Order → paid by M-Pesa or card through the gateways already built, one payment, the same return page). A free event skips payment.
- Tickets are issued **when the payment is confirmed** (the same moment the order is settled); an unpaid order holds the seats for 15 minutes, then releases them.
- Sold under the event's own sales ledger/tax settings (a setting on the event or a default for events), so the books and VAT are right; no new accounting.
- Capacity is counted per ticket type and per session; sold-out and "only N left" are shown; the last seat can't be sold twice (locked while counting, as preorders do).

## Tickets and the door
- Emailed (and shown in My tickets / a link from the email) as a page with the QR and a PDF download. One QR per ticket (holder name editable until the event, if the event allows).
- **Door screen** (`/admin/events/{id}/door`): camera scan, or type the code; shows holder, type, session, and result: *valid → checked in*, *already used (when, by whom)*, *wrong event/session*, *cancelled/refunded*, *not found*. Works for staff with the check-in permission only. Offline-friendly: the guest list can be downloaded before the event and scanned against, syncing back when online (second phase if needed).
- Manual check-in from the guest list (search by name/phone/email) for lost phones.
- Every scan is logged (who, when, result).

## Cancellation and refunds
- A buyer asks for a refund from the ticket page until the event's cut-off; staff approve or decline with a reason; approving cancels the tickets (their QR stops working), frees the seats and books the refund (money is returned from the provider's dashboard for cards for now, like the other card refunds).
- If staff **cancel or postpone an event**, every buyer is emailed and offered a refund.

## Screens
- **Customer:** Events list (filters: date, place, free, online), event page (sessions, ticket types, quantity, buy), checkout (reuses the existing page), My tickets, ticket page, refund request.
- **Admin:** Events list and form (details, sessions, ticket types, visibility, refund cut-off, refund policy text), Orders/guest list with search and export, Door screen, Sales summary (sold, revenue, attendance %, by ticket type), Refund requests.
- **Settings → Events:** default sales ledger, hold time, email wording, who may check in.

## Permissions (new, seeded)
`events.view`, `events.edit`, `events.delete`, `events.sell` (manual/box-office sales and complimentary tickets), `events.checkin`, `events.refund`. No role names in code (the access engine rules apply); `access:seed` after.

## Notifications (new types)
`event_ticket` (essential: your tickets), `event_reminder` (day before; optional, off until switched on), `event_changed` (essential), `event_refund` (essential).

## Data (database script 119_events.sql)
`events`, `event_sessions`, `event_ticket_types`, `event_tickets` (code, state, holder, order/voucher ids, checked_in_at/by), `event_checkins` (scan log), `event_refund_requests`, `event_settings`. Orders link through `meta.event` on the voucher so nothing changes in the books tables.

## Built in this order (each step tested and pushed)
1. Data, models, permissions, capacity rules (with tests: no overselling, holds expire).
2. Events and ticket types admin (form, sessions incl. recurring generator).
3. Public events list/page and buying (guest + signed-in), free RSVP, payment and ticket issue.
4. Tickets: signed code, QR image, email, My tickets, PDF.
5. Door screen: scan, manual check-in, scan log, guest list export.
6. Refunds and event cancellation/postponement notices.
7. Reminder, sales summary, settings page, docs.

## Hooks for later modules
Campaigns can feature an event (item type `event`); memberships can give members a ticket discount or free tickets; the calendar can show events; the product-video field is reused for event videos.

## Open points to confirm while building
- Transfer of a ticket to another name: allowed until the event by default.
- Whether box-office (staff) sales can take cash/till payments: assumed yes via the normal payment ledgers.
