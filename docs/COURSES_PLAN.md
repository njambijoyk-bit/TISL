# Courses module (teach, and sell what you teach) — plan

Status: **planned, nothing built yet.** Revised 12 Oct 2026 after the owner's direction. Decisions marked ✔ are the owner's; the rest are recommendations waiting for a yes.

## 1. What the owner asked for (✔)

- **Sell recipes, books, notes and files**, and **teach** (recipes, cooking and anything else) with **links to Zoom** (or Meet, Teams…) for live sessions.
- **Courses does no accounting.** It never makes a voucher, takes a payment or posts a journal. Money is somebody else's job: the shop (a product sold the ordinary way) or, later, **Memberships** (a membership bills the member and the course is one of the things it unlocks).
- **Memberships will drive access later:** a course, a pack of notes or a recipe collection can be "included in" a membership plan. The Menus module will also **require a membership for meal plan subscriptions** (a later change in Menus, listed in §8).

## 2. The one idea: Courses owns content and access, never money

Everything a person can get is an **offering** (a thing with content). Who may open it is a separate **access grant** (a row saying *this person may open this offering, from here, until there, because of this*). Three things can create a grant, and Courses only ever *receives* them:

| Source | Who makes the grant | Accounting |
|---|---|---|
| **A sale** | the shop sells an ordinary product that is linked to the offering; when that sale is paid, a small hook (like `planPaid` in Menus) calls `CourseAccess::grant(...)` | Books, as for any product |
| **A membership** (later) | Memberships calls the same `CourseAccess::grant(...)` while the member is active and `revoke(...)` when it ends | Memberships |
| **Staff** | a manager gives access by hand (a comp, a staff member, a trial) | none |

So Courses has **no prices of its own**. An offering may be *linked to a product* (that is where its price, tax, stock and checkout come from) or be members-only or staff-only. This keeps the rule "this module will not handle accounting" true and reuses the checkout, gateways, tax and reports that already exist.

## 3. What an offering can be

One **offering** has a kind, a title, a cover, a short and a long description, a category, a level, tags, and is *draft* or *published*:

| Kind | What the buyer gets | Content |
|---|---|---|
| **Course** | a curriculum worked through, with progress and an optional certificate | sections → lessons (video link, text, file, quiz, **live session**) |
| **Recipe** | one recipe to read and cook from, ingredients and steps, optional video | a lesson-like page; can be made **from a Menus recipe** (the dish's method) so a restaurant can sell its recipes |
| **Book or notes** | a document to read or download | one or more files (PDF, EPUB, image, spreadsheet) |
| **Files / bundle** | a pack of downloads | files plus text |
| **Live class** | a dated session (or a series) with a **Zoom/Meet/Teams link** | the link is shown only to people with access, at the right time |

A course can contain any of the others as lessons (a PDF of notes, a recipe, a live session), so "teach a cooking class" is one course with live lessons, a recipe card per lesson and the shopping-list PDF as a file.

**Files** are stored privately and served only to people with an active grant (signed, short-lived download links, watermark with the buyer's name optional, download count shown to staff). Nothing is public unless it is marked a free preview.

**Live sessions:** date, time, time zone, duration, a link (Zoom/Meet/Teams/any URL), an optional meeting id and passcode, a replay link added afterwards, a capacity. The link and passcode appear only to people with access and only from a set time before the start (30 minutes by default); reminders by the platform's notifications (email/SMS/in-app) a day and an hour before; a calendar file (.ics) to add it to a calendar.

## 4. Who can do what (clearance)

- **Staff** with `courses.manage` create and edit offerings and content and grant or take away access by hand; `courses.view` reads. Teachers see and mark only their own courses. Instructors are staff with a teaching profile (the Menus chef "teaches" switch already exists, `is_instructor`).
- **Customers** need an account (progress and downloads belong to a person). They see an offering's page and free previews without access; paid content only with an active grant.
- **Branches:** an offering may be limited to a branch only for live in-person sessions; online content is for everyone.
- **Audit:** every grant, revoke and download of a protected file is logged (who, what, when, from where).
- **Files and links never leak:** the Zoom link is not in any public API response, the file URLs are signed and expire, a grant that ends stops both at once.

## 5. The access API (what Memberships and the shop use)

A small, stable service, nothing else needs to know how Courses works inside:

- `CourseAccess::grant(int $userId, int $offeringId, string $source, ?string $sourceRef, ?Carbon $until)` — idempotent; the same source and reference twice is one grant.
- `CourseAccess::revoke(string $source, string $sourceRef)` — ends every grant that source made (a membership ending, a refund).
- `CourseAccess::can(User $u, Offering $o): bool` — what every screen and download asks.
- `CourseAccess::offeringsFor(string $source, string $ref)` — Memberships asks "which offerings does this plan unlock?"; a **membership plan lists offerings or whole categories** ("all notes", "everything tagged baking").
- A shop sale hook: a product has an optional `courses_offering_id` (or a bundle of them); when its order is paid, grant (source `sale`, reference the order line); a refund or cancel revokes it. A refund window and "money back only if less than X% watched" live in the *sale* policy, not here.

## 6. Learning side (kept from the earlier plan)

Progress per lesson (not started, in progress, done; video position remembered), course percent, free order or in order, **drip** (a lesson opens N days after access begins), **access window** (e.g. 12 months, optional), **quizzes** (single/multiple choice, true/false, short text marked by the teacher, pass mark, attempts, time limit), **certificates** (number `CERT-2026-000123`, PDF, signed QR that opens a public "is this real" page, revocable, optional validity and renewal reminder), reviews (the platform's reviews capability), an instructor view (my courses, my students, their progress). Cohorts/intakes (dated runs with a capacity) are for live courses: a grant may be to an intake.

## 7. Tables (script `151_courses.sql` or the next free number; idempotent; every table in `ModuleTables` under `'courses'`)

`course_offerings` (kind, title, slug, summary, body, cover, category, level, tags, status, instructor_user_id, free_preview, access_days, product_id, certificate flag…), `course_sections`, `course_lessons` (kind, body, video_url, file_id, live_id, drip_days, preview), `course_files` (private storage path, name, size, mime, downloads), `course_live` (starts_at, ends_at, timezone, join_url, meeting_id, passcode, replay_url, capacity), `course_intakes`, `course_access` (user_id, offering_id, source, source_ref, starts_at, ends_at, revoked_at, note), `course_progress`, `course_quizzes`, `course_questions`, `course_attempts`, `course_certificates`, `course_downloads` (log), `course_settings`. Names are `course_*` (as `event_*`). No money columns anywhere.

## 8. Build steps (each: built, tested, mutation-checked, committed, pushed; the owner says "go" for the next)

1. **Foundation:** offerings of all kinds (draft/published, cover, categories, tags), sections and lessons (text, video link, file, **live session with a Zoom link**), private file storage and signed downloads, the access service (§5) with staff-granted access, settings, admin pages, nav + backup + module registration, licence id.
2. **The catalogue and the offering page:** public `/learn` with filters, the page of an offering (curriculum, instructor, free previews), the buy button that goes to the **linked product** in the shop, "you have access" when granted.
3. **My learning:** my courses, resume, the lesson player (video, text, files), progress, drip, ordering, access expiry, **live session cards** (join button from 30 minutes before, replay, add to calendar), reminders.
4. **Selling:** the shop link (product ↔ offering, bundles), the paid-order hook that grants and the cancel/refund hook that revokes, a customer "my library" of recipes, books, notes and files.
5. **Assessments:** quizzes, attempts, teacher marking.
6. **Certificates:** completion rule, PDF, signed QR, verify page, revoke, expiry and renewal reminder.
7. **Teaching side:** instructor view, students and progress, intakes and capacity, the Menus chef link (`is_instructor` chefs listed as instructors; "teaches" on the chef page).
8. **Recipes from Menus:** publish a Menus recipe (method, ingredients, costing hidden) as a sellable recipe offering; cooking kits are ordinary products linked to a course.
9. **Memberships hook (when Memberships exists):** plans unlock offerings or categories through §5; Courses needs no change. Also in Menus: **meal plan subscriptions require an active membership** (a check in `SubscriptionService::subscribe` against a Memberships gate, switched on by a setting so today's behaviour is unchanged until Memberships is built).
10. **Reports:** access by offering and source, downloads, completion and pass rates (no revenue: that is the shop's and Memberships' report).

## 9. Not in the first cut

Discussion forums, built-in live video (a live lesson links out), SCORM import, DRM beyond signed expiring links and optional name watermarks (a determined buyer can still copy a file they may download; the platform records who downloaded it), subscriptions to the whole catalogue (that is Memberships), per-branch prices (all branches are the same).

## 10. Questions for the owner (my recommendation first)

1. **Selling through a linked product** (price, tax and payment from the ordinary shop; Courses only grants access)? Yes: it keeps Courses free of accounting. The alternative, Courses taking money itself, is what you ruled out.
2. **Account needed** to get access? Yes, for progress, downloads and certificates; a guest can buy, then is asked to create or sign in to the account that will own the access.
3. **Video:** links (YouTube unlisted, Vimeo, any URL) first; files for PDFs, notes and images only; large video hosting later.
4. **Live sessions:** show the Zoom link only to people with access and only 30 minutes before the start? Yes.
5. **Recipes as a product:** a recipe you sell is a copy of the Menus recipe's method at the time it is published (edits to the kitchen recipe do not change what a buyer already bought)? Yes.
6. **Teachers:** any staff member with a teaching profile; chefs with the "teaches" switch appear automatically.
