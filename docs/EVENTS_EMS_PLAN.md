# TISL Events: from ticketing to an Event Management System

Status: **planning only.** Nothing here is built yet. Ticketing, the door and refunds are built and described in `EVENTS.md` and `EVENTS_PLAN.md`; this document plans everything around them.

## 1. Decisions taken

| Question | Answer |
|---|---|
| Vision | **Planning-led** (planning and production is the core, with ticketing and advertising supporting it) **and a SaaS for outside organisers** (other organisers run their own events on TISL). |
| Does TISL sell event planning itself? | **Yes.** A customer can enquire, book a consultation or ask for a quotation; admin quotes and invoices through Books. |
| Vendors and venues | **Yes, from the start.** Outside vendors and venues have profiles, packages, availability and take bookings through TISL. |
| Media | Images and videos on events, planning, vendors and venues. |
| Books link | A customer creates a sales order or a consultation; admin invoices them. |

### The tension to manage
"SaaS for outsiders", "planning-led" and "marketplace from the start" together is a large programme, each part with its own users, money flows and risks. It cannot be tested as one release. The plan below **designs for all three from the first phase** (the data model, accounts and money flow are built once, correctly) and **delivers in phases you can test** (section 8).

---

## 2. The shape of the system

Five domains share one event engine. They are business areas, not five separate modules.

1. **Discovery and advertising**: public directory, featured placements, campaigns.
2. **Planning and production**: the private workspace to plan and run an event.
3. **Registration and ticketing**: tickets (built), invitations, RSVPs, guest lists.
4. **Marketplace**: vendors, venues, packages, bookings, reviews.
5. **Business management**: organisers, clients, contracts, money, staff, analytics, admin.

### Who is who (never one `user_id`)

| Role | Meaning |
|---|---|
| **Creator** | Who entered the event record. |
| **Owner** | The organisation or person who owns the record (TISL, an outside organiser, a company, an individual). |
| **Organiser** | The party responsible for organising it. |
| **Client** | The customer who commissioned it (when someone plans it for them). |
| **Manager** | The person responsible for execution. |
| **Participants** | Guests, attendees, speakers, performers, sponsors, vendors, staff, volunteers. One person can hold several roles in one event. |

Examples: a wedding planner creates a wedding (owner: planner's business). TISL plans a wedding for a customer (owner TISL, client the customer). A company runs its AGM (owner the company).

---

## 3. Outside organisers: how "SaaS" works inside TISL

TISL is one company's system today. Outside organisers do **not** get separate databases. They get an **organiser account** inside TISL:

- An **Organiser** record (a business or an individual) with verification status, plan, commission rate, payout details and its own staff users.
- Every event, planning project, guest list, ticket order, vendor booking and report carries an `organiser_id`. A person acting for an organiser only ever sees that organiser's records. TISL staff see all.
- Organisers use the Events workspace, not Books. They do not see TISL's ledgers, other organisers or customers.
- Organiser staff have their own roles (owner, manager, finance, door staff, photographer with no budget access) and per-event permissions.
- **Branding:** their name, logo and colours on their event pages.

**Money** (the part that most needs your decision, section 9): when an organiser sells tickets through TISL, TISL receives the payment, so it owes the organiser the proceeds less fees. That is a liability in TISL's Books, paid out on a schedule.

---

## 4. Event core (phase 1)

**Categories:** a hierarchy managed by admin (weddings and celebrations, business and corporate, entertainment, exhibitions, community, sports and more), each with icon, description, cover image and registration defaults.

**Format:** physical, virtual, hybrid. Physical needs the venue and location; virtual needs the platform and joining rules; hybrid both, with separate capacities.

**Participation model** (separate from category): free registration, paid tickets, invitation only, RSVP, approval required, donation based, members only.

**Status is three fields, not one:**

| Field | Values |
|---|---|
| Approval and publication | draft, pending approval, approved, published, archived |
| Registration | not open, open, closed, waitlist |
| Operation | upcoming, ongoing, completed, postponed, cancelled |

So an event can be published while registration is closed.

**Dates:** event span, daily times, registration opens and closes, ticket sales open and close, set-up, rehearsal, breakdown. Sessions with their own speakers, venue and capacity (built for ticketing; extended for programme).

**Location:** country, county, town, venue, room, address, map point, directions, parking, accessibility.

**Capacity:** venue, per ticket class, VIP, online, guest invitation limit, waitlist.

**Media:** cover, logo, poster, gallery of images, uploaded videos and embedded links (YouTube, Vimeo). Each item is public or private, so planning files (floor plans, contracts) never appear on the public page.

---

## 5. Commissioning: a customer hires TISL (phase 2)

Reuses what Books and the shop already have; adds the event project.

1. **Plan my event** (public form): type, date, guests, budget range, location, notes, uploads. Creates an **enquiry**.
2. The customer **books a consultation** (existing booking calendar) or **asks for a quotation** (existing quotation request).
3. Admin makes a **quotation**, which becomes a **sales order** with a deposit, then **invoices** (stages for a wedding: deposit, balance, extras), all in Books as now.
4. Accepting creates the **event project**: the private planning workspace, linked to the customer, quotation, orders and invoices.
5. The project is also a **Budgets initiative**, so supplier bills and payments posted to it show against the event's budget (the budget controls just built apply).
6. The customer sees progress, documents and invoices in their account.

Events TISL plans for itself are the same, with TISL as owner and no client.

---

## 6. Planning workspace (phase 3)

Private to the owner, organiser team and invited people.

- **Overview** and **activity log**.
- **Tasks:** title, assignee, department, priority, dates, status (not started, in progress, under review, completed, blocked, on hold, cancelled), subtasks, dependencies, comments, attachments, effort, completion evidence.
- **Milestones** and a timeline view.
- **Programme (running order):** activity, start and end, location, responsible person, equipment, notes. A wedding or a conference are both programmes.
- **Budget:** lines by category and supplier with estimated, approved, committed and actual costs; alerts near the approved budget; actuals come from Books (the initiative), commitments from purchase orders.
- **Vendors and bookings**, **venue**, **team and staff**, **documents**, **meetings**, **communication**.
- **Templates:** admin builds event templates (default tasks, milestones, budget categories, required documents, team roles, programme, registration settings). Creating a wedding from the Wedding template generates the whole checklist.
- **Per-event permissions:** a photographer does not see the budget.

---

## 7. Guests, tickets, advertising, marketplace

### Guests and invitations (phase 4)
Individual and bulk invitations, templates, email, SMS and WhatsApp sharing, RSVP deadlines, plus-ones, guest groups and tables, meal preferences, special needs, reminders, response history. Guest, attendee, ticket holder, speaker, performer, sponsor, vendor, staff and volunteer are separate roles on one person record.

### Ticketing (built, extended)
Keep: ticket types, QR, door, refunds, cancel and postpone. Add: dynamic and early-bird pricing, group purchases, promotional codes, ticket transfers, payment reconciliation, offline check-in for venues with poor connectivity.

### Advertising (phase 5)
Distinguish **publishing** (free listing), **promotion** (paid exposure) and **campaigns**.

| Product | What it is |
|---|---|
| Basic listing | Standard directory entry |
| Featured event | Priority placement |
| Homepage banner | Visual exposure |
| Category / location promotion | Featured in a category or area |
| Sponsored search | Promoted in results |
| Newsletter | Included in event newsletters |

Each has admin-set price, duration, placement limits and eligibility. Advertisers see start and end, amount paid, impressions, clicks, page visits and registrations from it. Campaigns are invoiced and recognised as TISL income. The public directory searches by name, category, location, date, price, free or paid, with featured, trending and recommended sections.

### Marketplace: vendors and venues (phases 1 to 6)
- A **vendor** is a business profile (ABC Catering Ltd) with **packages** (menus, prices, service areas), an availability calendar, media and reviews. A **booking** attaches a package to an event without creating another vendor.
- A **venue** has spaces (halls), capacity, seating layouts, facilities, pricing, deposits, cancellation policy, photographs, floor plans, availability.
- Vendors and venues get **self-service dashboards**: profile, packages, calendar, enquiries, bookings, payouts.
- **Verification** by admin before a vendor or venue is listed. **Reviews** only from people who booked.
- Booking flow: enquiry, quote, accept, deposit, confirm, deliver, final payment, review. Money rules in section 9.

---

## 8. Phases (each ends with a test you can run)

| Phase | Delivers | Test gate |
|---|---|---|
| **1 Foundation** | Categories, the roles, the three status fields, participation models, media gallery, **organiser accounts with data separation**, **vendor and venue profiles** (create, verify, list) | An outside organiser signs up, is verified, makes an event with media, and cannot see another organiser's data. A vendor and a venue get listed. |
| **2 Commissioning** | Plan-my-event enquiry, consultation and quotation, order, invoice (Books), event project and initiative, customer view | A customer enquires, books a consultation, gets a quotation, pays a deposit; admin invoices; a project appears with its budget initiative. |
| **3 Planning workspace** | Tasks, milestones, programme, budget tied to Books, templates, team, documents, per-event permissions | Create a wedding from a template; tasks, programme and budget behave; a photographer cannot see the budget. |
| **4 Guests and RSVPs** | Invitations, RSVPs, plus-ones, groups, meals, reminders, offline door | A 200-guest wedding list with RSVPs, and the door works without internet. |
| **5 Advertising** | Placement products, directory upgrade, campaign billing and results | A featured placement is bought, shows, and reports its clicks and registrations. |
| **6 Marketplace bookings** | Packages, availability, enquiries, bookings, deposits, reviews, vendor dashboards, payouts | A planner books a caterer and a venue for an event, the deposit and payout flow through the books. |

Phase 1 includes organiser and vendor accounts because everything after depends on whose data is whose, and on who gets paid.

---

## 9. Decisions still needed (these change the build)

1. **Who collects ticket money for outside organisers?**
   - *TISL collects, then pays out* (marketplace model): organisers need no payment accounts; TISL deducts a commission and fees and holds the rest as money owed to them. Needs a payout screen and a Books liability.
   - *Organisers use their own payment accounts*: money goes straight to them; TISL bills a platform fee separately.
2. **Vendor and venue bookings:** does TISL take the deposit and pay the vendor (and keep a commission), or are bookings only introductions, with vendors paid directly by the client or organiser?
3. **How do outside organisers pay TISL?** A subscription plan (monthly), a commission per ticket sold, both, or free to start.
4. **Verification:** what proof does an organiser, vendor or venue give (ID, business registration, tax PIN) before going live?

## 10. Cross-cutting rules
- **Multi-ownership separation** on every table and query, tested with two organisers.
- **Audit trail** on events, bookings, payouts, approvals and publishing.
- **Privacy:** guest lists and planning files are private; public media is explicit.
- **Payment security:** no card data stored; refunds and payouts logged and permissioned.
- **Existing links:** Books (sales orders, quotations, invoices, credit notes), Budgets (initiatives), the booking calendar, the shop's M-Pesa and card gateways, notifications, the Identity and Access roles.
- **Scripts:** each phase adds numbered SQL scripts (from 253), with backup tables registered, as for every module.
