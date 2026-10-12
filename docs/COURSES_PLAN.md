# Courses module (teach, and sell what you teach) — plan

Status: **step 1 (foundation) is built, NOT yet tested** (the owner asked for all steps to be built first and tested together later; a throwaway smoke run of the services passed). Built: script `152_courses.sql`; permissions `courses.view`, `courses.manage`, `courses.teach`, `courses.grant` in the access catalogue (no roles are defined by the module); offerings (course, recipe, notes and files, live class) with sections and lessons (reading, video link, file, recipe, live session with a Zoom/Meet/Teams link); private files with expiring signed downloads and a download log; the access service (`CourseAccess`: grant, revoke, can, canLesson, canFile, offeringsFor) with staff-granted access; settings; the admin pages under Admin → Courses (Offerings, the builder with Lessons, Files and Access tabs, Settings). **Step 2 (fees and enrolment through the ledger) is built too, NOT yet tested**: script `153_courses_fees.sql`; fee lines per offering (registration once per student, tuition, materials and other optional extras, exam, certificate, late), each booked under a sales account; payment plan per offering (deposit %, instalments and days between, access at the deposit or when paid in full, days a payment may be late, refund window, places); enrolling (at the counter by staff with `courses.enrol`, or online by the signed-in person) makes a Sales Order and an invoice with a line for each fee (a staff discount with a reason is a discount line), fills a payment schedule from receipts, opens access when the rule is met, holds access back for a late instalment and gives it back when paid; counter payments are Receipts, M-Pesa/card go through the gateways (hook `coursePaid`); cancel (nothing paid: the books are cancelled) and refund (a credit note for the refundable lines; permission `courses.refund`; after the refund window only as an exception); hourly job `courses:sweep` (releases unpaid places after 48 hours, holds access, reminds); notices to the student and payer; admin pages Fees and payments (a tab of the offering) and Enrolments; permissions `courses.enrol` and `courses.refund`. Next: step 3 (the public catalogue and the offering page, with the enrol and pay buttons). Revised 12 Oct 2026 (second revision, after the owner's corrections). Decisions marked ✔ are the owner's; the rest are recommendations waiting for a yes.

## 1. What the owner asked for (✔)

- **Teach** (cooking, recipes, anything) with **links to Zoom** (or Meet, Teams…) for live sessions, and **sell** courses, recipes, notes, files and **books**.
- **Books are Courses' own table** (a library of books and publications), **not** E-commerce products. They are invoiced through the ledger like any other sale.
- **Money goes through the existing ledger system (Books):** Courses makes ordinary Sales Orders and invoices with ledger lines, takes payments through the same gateways and counter, and posts nothing by itself outside that. This includes **registration fees, tuition, materials, exam and certificate fees, deposits and instalments**.
- **Courses can require attendance** (a minimum share of the sessions attended, checked in per session) before a certificate or completion.
- **Memberships will bill later:** a plan can include courses, notes or recipe packs; the same access service is used. Menus **meal plan subscriptions will require a membership** (a later hook).
- **Roles are independent of modules:** Courses defines **permissions** (in the access catalogue, like `menus.view`), never roles. The owner builds roles from permissions and assigns them to anyone; no role is hard-coded to this module, and clearance and branch rules work as everywhere else.

## 2. The one idea

Everything a person can get is an **offering** (content). Who may open it is an **access grant** (this person may open this offering from here until there, because of this). Money is separate and goes through Books:

| Way to get access | Money | Who makes the grant |
|---|---|---|
| **Enrol and pay** (course, recipe, notes, files, live class) | a Sales Order → invoice in Books with the fee lines below; paid at the counter or by M-Pesa/card | Courses, when the invoice is paid (or at once for a free offering, or after the deposit if the offering allows it) |
| **Buy a book** from the Courses library | a Sales Order → invoice with the book as a line (stock optional, §5) | a digital book: access to its file when paid; a printed book: nothing to grant, it is delivered |
| **Membership** (later) | Memberships bills the member | Memberships calls `CourseAccess::grant/revoke` |
| **Staff** | none, or an invoice made by hand | a manager grants access (comp, staff, trial) |

The same pattern Events already uses for tickets (`custom` ledger lines on a Sales Order, the gateway hook on payment, a refund policy), so nothing new is invented for the books side.

## 3. What an offering can be

One **offering** has a kind, title, cover, short and long description, category, level, tags, instructor, status (draft/published) and **fees** (§4):

| Kind | What the buyer gets |
|---|---|
| **Course** | a curriculum (sections → lessons: video link, text, file, quiz, live session), progress, optional attendance rules and certificate |
| **Recipe** | one recipe to cook from (ingredients, steps, optional video); can start as a copy of a Menus recipe's method |
| **Notes / files** | one or more private files and text |
| **Live class** | a dated session or series with a **Zoom/Meet/Teams link**, shown only to people with access |

A course may contain any of the others as lessons. **Books are not offerings**: they are the library (§5), though a course can list the books it needs and sell them with the enrolment.

**Files** are private, served only to people with an active grant, by short-lived signed links, with a download log. Nothing is public unless marked a free preview.

**Live sessions:** date, time, time zone, duration, a link (Zoom/Meet/Teams/any URL), meeting id and passcode, a replay link added afterwards, a capacity. The link and passcode show only to people with access and only from a set time before (30 minutes by default); reminders a day and an hour before through the platform's notifications; an .ics calendar file.

## 4. Fees and invoicing (all through the ledger)

An offering carries a list of **fee lines**, each with a name, a **sales ledger** (income account), an amount, a tax code (as Books already does) and a kind:

- **Registration / admission fee** (once per person, not charged again on a second offering unless it says so),
- **Tuition** (the whole price, or per session, or per month for a long course),
- **Materials / kit** (optional extra, can be a stock item),
- **Exam, certificate or late fees**, **deposit** (a share paid to hold the place),
- **Instalments** (the balance split over dates, each its own invoice or a schedule on one invoice; access is granted at the deposit or at the first instalment as the offering says, and paused if an instalment lapses).

Enrolling makes a Sales Order → invoice with those lines; **discounts and promo codes** use the platform's existing ones; **refunds** follow a refund window per offering (fully, partly, or not after the first session) and are credit notes in Books; **a cancelled enrolment cancels the unpaid invoice**. A person may enrol someone else (a parent, an employer: the invoice goes to the payer, the access to the student). Corporate or group enrolment is one invoice, many students.

Courses never holds a price, tax or balance of its own: it reads them from the invoice, so reports and statements are the ledger's.

## 5. The books library (own table)

`course_books`: title, authors, ISBN, description, cover, **format** (printed, digital file, or both), price and sales ledger, tax code, an optional stock item (so a printed book can be counted and delivered like any stock), the file (for digital) and a sample. A book is sold by a **Sales Order → invoice** with the book as a line, at the counter or online (the same checkout and gateways); digital books grant access to the file when paid (a download log, not unlimited links); printed books move stock when delivered (delivery note on the order, as Menus does). A course may require or recommend books, which are then offered with the enrolment. Books are not E-commerce products and do not appear in the shop catalogue unless the owner later links them.

## 6. Attendance

A live or in-person course can **require attendance**: each session is a roll-call (a teacher marks the register, a student scans a code, or joins by the Zoom link recorded as present by the teacher; the platform's Attendance module is for staff, so Courses keeps its own register). Settings per offering: **minimum share of sessions attended** (e.g. 80%) for completion or the certificate, an excused absence, a make-up session. Reports show who is below the line before it is too late, and students are warned.

## 7. Who can do what (permissions, not roles)

New permissions in the access catalogue (names illustrative): `courses.view`, `courses.manage` (create and edit offerings, books, fees), `courses.teach` (own courses, register, marking), `courses.enrol` (enrol and take payments for others), `courses.grant` (give access by hand, comps), `courses.refund`, `courses.report`. **No role is defined by the module**: the owner combines them into any role. Branch/clearance rules apply to in-person sessions and to invoices (the same branch rule as stock and sales). Customers need an account for access, progress, downloads and certificates; a guest may pay and then must sign in or register to claim the access. Every grant, revoke, refund and protected download is logged. The Zoom link and file URLs never appear in a public response.

## 8. The access service (what Memberships and others use)

- `CourseAccess::grant(userId, offeringId, source, sourceRef, until)` — idempotent; `revoke(source, sourceRef)`; `can(user, offering)`; `offeringsFor(source, ref)`.
- Sources: `invoice` (paid enrolment), `membership` (later), `staff`.
- A plan in Memberships lists offerings or whole categories; Courses needs no change when Memberships arrives.

## 9. Learning side

Progress per lesson, course percent, free or fixed order, **drip** (a lesson opens N days after access begins), **access window**, **quizzes** (choice, true/false, short text marked by the teacher, pass mark, attempts, time limit), **certificates** (number `CERT-2026-000123`, PDF, signed QR and a public verify page, revocable, optional validity and renewal reminder) that depend on completion, **attendance** (§6) and **fees paid**, reviews (the platform capability), an instructor view, intakes (dated runs with a capacity and a waiting list).

## 10. Tables (a numbered idempotent script; every table in `ModuleTables` under `'courses'`)

`course_offerings`, `course_fees` (offering_id, kind, name, ledger_id, amount, tax code, per, sort), `course_sections`, `course_lessons`, `course_files`, `course_live`, `course_intakes`, `course_enrolments` (student, payer, offering/intake, invoice voucher id, status, enrolled_at), `course_access`, `course_sessions` and `course_register` (attendance), `course_progress`, `course_quizzes`, `course_questions`, `course_attempts`, `course_certificates`, `course_books`, `course_book_orders` (book, voucher id), `course_downloads` (log), `course_settings`. Money lives in vouchers and ledgers; these tables hold only ids that point at them.

## 11. Build steps (each: built, tested, mutation-checked, committed, pushed; the owner says "go" for the next)

1. **Foundation:** permissions in the catalogue, offerings of all kinds, sections and lessons (text, video link, file, **live session with a Zoom link**), private files and signed downloads, the access service with staff grants, settings, admin pages, nav + backup + module registration + licence id.
2. **Fees and enrolment through the ledger:** fee lines, enrol (counter and online) as a Sales Order/invoice, paid → access, deposit and instalments, discounts, cancel/refund as Books documents, payer vs student.
3. **The catalogue and the offering page:** public `/learn` with filters, previews, enrol and pay.
4. **My learning:** library, resume, lesson player, progress, drip, expiry, **live cards** (join button, replay, calendar, reminders).
5. **The books library:** `course_books`, selling printed and digital books by invoice, stock for printed, files for digital, books attached to courses.
6. **Attendance:** sessions, register, rules, warnings, excused absences, make-ups.
7. **Assessments** then **certificates** (completion = progress + attendance + fees paid).
8. **Teaching side:** instructor view, students, intakes and waiting list, the Menus chef link (`is_instructor`).
9. **Recipes from Menus:** publish a Menus recipe's method as a sellable recipe (a copy at the time it is published); cooking kits as stock items on a course.
10. **Memberships hook** (when Memberships exists) and, in Menus, **meal plan subscriptions require an active membership** (a check in `SubscriptionService::subscribe`, behind a setting off until then).
11. **Reports:** enrolments, attendance, completion, books sold, downloads; money reports are the ledger's (aged receivables by student, income by offering).

## 12. Not in the first cut

Forums, built-in live video, SCORM, DRM beyond expiring links (a person who may download a file can copy it; the platform records who did), subscriptions to a whole catalogue (that is Memberships), per-branch prices.

## 13. Questions for the owner (my recommendation first)

1. **A student's invoice is made at enrolment** (unpaid invoice that the student pays; access follows payment, or the deposit if the offering allows)? Yes.
2. **Registration fee once per student** (charged on the first enrolment only)? Yes, with a per-offering switch to charge it again.
3. **Instalments** as separate invoices with due dates, access paused if one lapses past a grace period (set per offering)? Yes.
4. **Attendance register is Courses' own** (not the staff Attendance module)? Yes.
5. **Books:** printed books reduce stock through a stock item and a delivery note; digital books have a file and a download limit? Yes.
6. **Account needed** for access; a guest may pay and then claim the access by signing in? Yes.
