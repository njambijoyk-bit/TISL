# Price lists, brochures and catalogues - plan (nothing built yet)

One feature in the E-commerce module (hidden unless E-commerce is licensed and on). One creation flow: pick items, get a **price list** (a plain dated table) and/or a **brochure** (one item) or **catalogue** (several items), in a designed layout. Books is only ever read, never written.

## The idea in one paragraph
A list is a frozen snapshot of selling prices on a date. It lives in the database (as rows, so it can be queried and exported). Staff create lists by hand or by a schedule, as a draft or published at once. There is a maximum number of live lists (a setting); at the limit the only way forward is to download the old list as a zip (PDF + CSV + JSON), upload that zip to the Archive, and hard delete the list. Customers see published lists they are allowed to see, and the Archive.

## Items and prices
- Pick: one item, a category, a brand, or a hand-picked mix from several places. Products (by variant), services (by package), hampers and auctions (an auction shows its starting price and end date).
- Price = the selling price of the variant's unit row (never cost). The original ("was") price, when set, is shown struck through.
- **No currency conversion.** Each row shows the item's own currency and amount.
- Tax ("duty"): taken the way an invoice would, by the same code (`TaxLineService`), for a guest, one unit: find the item's sales account, its tax nature (taxable / zero-rated / exempt / out of scope), the rate and tax type. A percentage is worked on the amount. A fixed amount is quoted in its own currency and unit: it is converted to the item's currency and multiplied by the unit quantity, and summed. Each row prints: price excl. (with the struck-through original), the tax name and rate, the tax amount, and the total incl.
- Left out by default (options): inactive, discontinued, hidden items.

## Data (database; one script)
- `price_lists`: name, status (draft / published), kind (list, brochure, catalogue: worked out from the item count), the item picker (JSON), settings (JSON: what to show), effective-from and valid-until dates, who made and published it, who may see it (see below), and the rule that made it, if any.
- `price_list_items`: one row per priced line: the item (type and id, for linking), a copy of its name, SKU, variant and unit, the currency, the price, the original price, the tax label, rate and amount, the total. A frozen copy, so later price changes never alter a published list.
- `price_list_rules`: a schedule: the name pattern ("Price list {month} {year}"), the item picker, when (on a date, or every N weeks / months from a date), save as draft or publish at once, who it notifies.
- `price_list_archives`: uploaded zips: title, year, file path, size, who may see it, who uploaded it.
- Settings row: the maximum number of live lists (1 to 1000), who may do what.
- All in the E-commerce module's backup list. Archive zips are files on the server disk (not in a database backup).

## Limit, archive and delete
- Setting: maximum live lists (draft and published both count). No automatic deletion.
- At the limit, creating a list (by hand or by a schedule) is refused with a clear message.
- "Download zip" on a list: the zip holds the PDF, the CSV and the JSON.
- "Upload to the Archive": staff upload that zip; it is checked (must hold the three files) and stored. Customers allowed to see it can download it.
- "Delete for good": admin and super admin only, after a confirmation that offers the zip first.
- The JSON export uses its own neutral, readable layout (title, as-at date, items with code, name, variant, unit, currency, prices, tax name, rate, amounts), with no database names, ids or structure.

## Who can do what
- Create lists and rules: super admin, admin, manager, finance, sales rep.
- Hard delete: admin and super admin only.
- Publishing a draft: to be confirmed (suggest super admin, admin, manager, finance; a sales rep's list waits for one of them).
- Who can see a list: a dropdown per list and per archive: Staff only / Everyone including guests / Signed-in customers / Selected customer types (a multi-choice of your customer types).

## Schedules, drafts and the calendar
- A daily job (the project's scheduler) runs the rules that are due and creates the list. It is safe to run twice and catches up a missed day.
- A rule says draft or publish at once. A draft creates a calendar task for the approvers ("Review and publish: Price list April 2026"). Publishing, or deleting the draft, removes the task.
- If the limit is reached the job creates nothing and tells the approvers to archive and delete a list.

## Documents
- **Price list (plain table):** drawn in the browser as a real-text PDF (selectable, small, crisp; standard fonts), page by page from the stored rows, so a list of thousands of rows is no problem for the server. The CSV and JSON come from the server.
- **Brochure (1 item) / catalogue (2+ items):** the designed look, in the template styles of the service brochures, drawn in the browser. A catalogue can run to hundreds of pages like a magazine: it is drawn page by page with a progress bar, pictures loaded in small batches, and the pages kept small, so the browser does not run out of memory. Uses the list's frozen prices and the items' live pictures.
- One item makes a brochure, more than one a catalogue; the same templates serve both.

## Where it lives
E-commerce menu, a new group of tabs: Price lists, Brochures and catalogues, Schedules, Archive, Settings. Customers: a Price lists page (current lists they may see) and an Archive page.

## Build order
1. Script and models; the item picker and snapshot builder with the tax code; manual create (draft or publish); list screens; the limit.
2. Customer pages and the "who can see it" rules.
3. The plain price list PDF writer (real text); CSV and JSON; the zip; archive upload; hard delete.
4. Schedules, the daily job, drafts, calendar tasks.
5. Designed brochures and catalogues (templates for item cards, cover, back page), with progress for big ones.
6. Checks with a database that matches the script, PDF and zip checks, lint and build.
