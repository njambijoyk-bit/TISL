# Events phase 1: set-up and test walkthrough

## Set up (once)
1. Run `backend/database/sql/253_events_foundation.sql`, then `254_event_organiser_ledger.sql`.
2. `php artisan access:seed` (adds `events.admin` and the built-in **Event organiser** role).
3. In Books, make a liability account such as "Event organiser payables". In **Admin → Events → Configuration → Outside organisers** choose it, and check the commission (default 10%) and that outside events need approval.
4. **Admin → Events → Platform → Categories → Add the standard set.**

## Walkthrough
| # | Do | Expect |
|---|---|---|
| 1 | Signed in as a customer, open `/organise`, apply as an organiser. | "Waiting for TISL to verify you". |
| 2 | Upload proof on the organiser (documents). In Platform → Organisers, accept it and **Verify**. | The person can now open Admin → Events (only events, no cash desk/refunds/settings). |
| 3 | As the organiser: New event, category, tickets; open the **Pictures and videos** tab; upload an image (set as cover), a video, a YouTube link, a floor plan. | Floor plan is private; the rest show on the public page when published. |
| 4 | Click **Send for approval**. As admin, open it, **Approve**; the organiser puts it on sale. | It appears on `/events`. Before approval and while the organiser is suspended it does not. |
| 5 | A second organiser opens Admin → Events. | They see none of the first organiser's events, tickets or documents. |
| 6 | Buy tickets on the public page and pay. | Platform → Payouts shows the organiser owed price less commission; Books has a journal Dr ticket income / Cr organiser payables. |
| 7 | Approve a refund for one ticket. | Owed goes down by that ticket's share; a reversing journal is posted. |
| 8 | Payouts → **Pay out**, choose the bank, enter a reference. | Owed goes down; journal Dr organiser payables / Cr bank. The statement shows every movement. |
| 9 | As a vendor and as a venue: `/organise`, apply; open **Manage**, add a package / space and pictures; admin verifies. | Both appear in the directory API (`/api/events/directory/vendors`, `/venues`) only once verified, and drop out when suspended. |

## Known limits
- Tax on tickets stays with TISL (the organiser's share is computed on the ticket price before tax).
- Vendor and venue pages for the public (browsing the directory) come with the marketplace phase.
- A ticket cancelled by staff without a refund does not reduce what is owed.
