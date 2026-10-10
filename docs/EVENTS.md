# Events — how to use it

Ticketed events: single dates, multi-day and repeating events, free RSVPs and online events. Anyone can buy without an account; tickets are signed, carry a QR code drawn by our own encoder, and are checked at the door by phone.

## Set it up once
1. **Run the database scripts** (each part on its own in Workbench): `120_events.sql` (the tables), `121_events_nav_link.sql` (the "Events" link in the shop menu), `122_event_reminders.sql` (so a reminder is sent once). Then `php artisan access:seed` (the new permissions).
2. **Switch the Events module on** (it is a paid module).
3. **The scheduler must be running** (`php artisan schedule:run` every minute): it gives back the seats of people who did not pay (`events:release-holds`, every minute) and sends reminders (`events:remind`, every 15 minutes). A queue worker must be running for emails.
4. **Payments:** paid tickets use the same M-Pesa and card setup as the shop (Admin → Settings → Payments). The money lands in the account you choose there.
5. **Admin → Events → Settings:** how long seats are kept for someone who has not paid (default 15 minutes), the income account tickets are booked to when an event names none, a line printed on every ticket, and whether to send reminders.

## Make an event
Admin → Events → **New event**.
- **Details:** title, summary, in person / online / both, venue, join link (shown only to ticket holders), description, picture, video, whether it shows in the public list.
- **Dates:** one, or many. **Repeat…** makes "every Saturday for 8 weeks" and shows the dates before adding them. Each date can have its own limit on people.
- **Tickets:** a price (0 is a free RSVP), how many, least/most per order, when it is on sale, and which dates it admits to (leave "Every date" for a full pass, tick dates for a day pass). The **currency** and the **income account** are asked once if any ticket costs money; the account decides the tax.
- **Refunds and more:** the cut-off date for refund requests, the refund policy text, tickets per order, whether holders may change the name on a ticket.
- **Put on sale** only works when everything needed is filled in; the page says what is missing.

## Selling
- The public **Events** page and each event's page (`/events`, `/events/{slug}`) let anyone choose tickets and pay with M-Pesa or a card. Seats are held while they pay; if the payment does not arrive in time the seats go back on sale (a late payment still gets the ticket if the seat is free; if it was sold on, a refund request is opened for staff).
- **At the door:** Admin → Events → **Door** → *Sell* (needs `events.sell`): sell for cash into a till or bank account (booked as a normal Cash Sale) or give complimentary tickets.
- Tickets are emailed the moment they are valid, and are always available at the link in the email (`/tickets/…`), as a PDF, and under *My event tickets* for signed-in customers. A guest who lost the email asks for it again at `/tickets`.

## The door
Admin → Events → **Door** (needs `events.checkin`). Made for a phone.
- **Scan** a ticket's QR (camera on Android and desktop Chrome; a handheld scanner or typing the code works everywhere): big **green** (let in), **amber** (already used, when and by whom) or **red** (wrong event, wrong date, cancelled or never paid, not one of ours). Every try is logged.
- A three-day pass is checked in once per day; a day pass only on its day.
- **Guest list:** search by name, phone, email or reference; **Let in** by hand (a lost phone); **Undo** a mistake; **Spreadsheet** download.
- The counter shows who has arrived for the date chosen and updates for every device at the door.

## Refunds, cancelling, postponing
- A buyer can **ask for a refund** from their ticket page until the event's cut-off date (always, if staff cancelled or postponed the event; never after it is over or the ticket was used). A free ticket is cancelled by the holder at once.
- Staff decide under **Events → Refunds** (needs `events.refund`): **Approve** cancels the ticket (the QR stops working, the seat is free) and writes a credit note for that ticket's price and tax, with the money going back from the bank or till you choose; **Decline** needs a reason the buyer will read. For a card, return the money from the provider's dashboard as well: the books record that it left the account.
- **Cancel** an event: sales stop, every holder is emailed, and a refund request is opened for every paid ticket (approve them all at once from the Refunds tab).
- **Postpone** an event: sales stop and holders are told; give it new dates and **Put on sale again** and they are told the new date. Holders can ask for a refund at any time while it is postponed.
- **Tell ticket holders** sends a message to everyone with a valid ticket (a change of time, "bring ID").

## Reports
Each saved event has a **Summary** tab: tickets sold (paid, free, being bought), what it brought in before tax, who has arrived on each date, what has been refunded and what is waiting, and sales by day.

## Permissions
`events.view`, `events.edit`, `events.delete`, `events.sell` (box office), `events.checkin` (the door), `events.refund` (decide refunds). Roles are built in the role builder; the manager role gets all but delete.

## Good to know
- Prices on tickets are **before tax**; the account the event is booked to adds tax at checkout (the buyer sees the total before paying).
- Orders are placed in the event's currency.
- The QR holds the address `https://your-shop/q/tk.REFERENCE.SIGNATURE`; the signature is made with the app key, so a ticket can be checked without looking anything up and can not be forged. **Do not change `APP_KEY`** once tickets are out: every ticket would stop verifying.
- On an iPhone the door types a code or uses a handheld scanner until our own camera reader for Safari is built.
- Card and M-Pesa flows were built from the providers' documentation and tested against stand-ins: try each once with test keys and one small real payment before an event.
