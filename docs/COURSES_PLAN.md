# Courses module (teaching and training) — plan

Status: **planned, nothing built yet.** Written 11 Oct 2026 after reading `PLATFORM_PLAN.md` (module #4, §7 Courses, §5 checklist), `HANDOFF.md`, and the Events module (the closest existing model: sell something, issue a thing, scan a QR). Decisions marked ✔ are the owner's; the rest are recommendations waiting for a yes.

## 1. What a course is

A **course** is something a person enrols in, works through at their own pace (self-paced), on set dates with a teacher (cohort/live), or both, and finishes with a **certificate**. Gyms, restaurants (cooking classes), photographers, schools and clinics all use it, so it is built for every business kind. It must also sell the things the Menus plan promised: **recipes, teaching courses and cooking books**.

## 2. What already exists (reuse, do not rebuild)

| Need | Already built | How Courses uses it |
|---|---|---|
| Selling and money | Books: Sales Order vouchers, `GatewayPaymentService` (M-Pesa, card), `EventCheckout` pattern | Enrolment = ordinary Sales Order, one income line per course (as Events does tickets) |
| QR on certificates | `Codes` service: `Signed` payloads, `CodeResolvers` registry (`TicketCodes::register`) | `CertificateCodes` registers a resolver; scanning opens a public "is this certificate real" page |
| Teachers | Menus chefs with `is_instructor` switch (script 141) | Instructor picker lists staff with a teaching profile (chefs included); name/bio/photo shown on the course |
| Stock for books | Polymorphic stock (`StockItemRegistry`, script 49) | Cooking books and kits are ordinary products; no new stock code |
| Downloads | Digital products capability (E-commerce) | Lesson PDFs/attachments use the same private file storage |
| Notifications | `Notify` service (email/SMS/in-app) | Enrolment confirmation, new lesson, certificate issued, reminders |
| Refunds, holds | `EventRefunds`, `TicketHolds` patterns | Seat hold for capped cohorts; refund window like Events |
| Locations | Location axes (offered-at) | Live sessions can be at one branch; online courses are offered everywhere |
| Backup, nav, licence | `ModuleTables`, `nav_links`, `modules.js` (`COURSES` key exists), `LicenseFormat` (id 4 = courses) | Checklist §5 of the platform plan |

## 3. Shape of the module

**Curriculum:** course → **sections** (modules) → **lessons** → optional **topics** (platform plan says modules → lessons → topics). A lesson has one kind: *video* (link or upload), *text*, *PDF/file*, *quiz*, or *live session* (date, place or link). A lesson can be a free preview.

**Ways to take a course** (`delivery` on the course):
- **Self-paced:** enrol any time, work at own speed, optional access window (e.g. 12 months) and optional "drip" (a lesson opens N days after enrolling).
- **Cohort/live:** runs on dated **intakes** (start date, capacity, instructor, venue/link). Enrolment is into an intake; seats are held while unpaid, like Events.
- **Hybrid:** self-paced lessons plus one or more live sessions.

**Enrolment:** a signed-in customer (a course needs an account to keep progress). Free courses enrol at once; paid courses go through checkout (Sales Order + gateway) and become *active* when payment is confirmed. Staff can enrol someone by hand (comp or paid at counter). Statuses: pending → active → completed / expired / cancelled / refunded.

**Progress:** per enrolment, per lesson: not started / in progress / done (video position remembered). Course percent complete. A course may require lessons in order or allow free order.

**Assessments:** quiz questions (single choice, multiple choice, true/false, short text marked by the teacher), pass mark, attempts allowed, optional time limit. Passing marks a quiz lesson done. Marks recorded per attempt.

**Certificates:** issued when the course completion rule is met (all required lessons done and every required quiz passed, or teacher sign-off for live courses). Number (`CERT-2026-000123`), PDF with the business name, student, course, date and instructor, and a **signed QR** to the public verify page (`/certificate/<code>`). Revocable by staff. Cooking-course certificates can be added to the chef or customer profile later.

**Reviews:** the generalised reviews capability (core) applies to a course; shown on the course page once it lands. Not rebuilt here.

## 4. Settings (one row, like `event_settings`)

Default sales ledger, certificate wording and signature name, default access window, seat-hold minutes, refund window days (money back only if less than X% watched), who is told when someone enrols, whether certificates show on a public page.

## 5. Tables (script `143_courses.sql`, idempotent; every table goes into `ModuleTables` under `'courses'`)

`courses`, `course_sections`, `course_lessons`, `course_topics`, `course_intakes`, `course_enrolments`, `course_progress`, `course_quizzes`, `course_questions`, `course_attempts`, `course_certificates`, `course_settings`. Names prefixed `course_` (not `courses_`) to match `event_`. Course `instructor` points at `users.id`.

## 6. Backend layout (same recipe as Menus)

Models in `app/Models/Courses/`, logic in `app/Services/Courses/` (`CourseEditor`, `Curriculum`, `EnrolmentCheckout`, `ProgressService`, `QuizService`, `CertificateIssuer`, `CertificateCodes`, `CourseSettings`), thin controllers in `app/Http/Controllers/Admin/` and `Api/`, routes in `routes/api.php` wrapped in `module:courses`. Every service has the **schema guard** (`installed()`, memoised, live under `runningUnitTests()`) so the code works before the owner runs the script.

## 7. Build steps (each: tested, mutation-checked, committed, pushed; the owner says "go" for the next)

1. **Foundation:** script 143, models, settings, courses and curriculum builder (sections, lessons of all kinds, topics, previews), publish/draft, instructor, admin pages (Courses list, course form, curriculum builder, Settings), nav + backup + module registration.
2. **The catalogue and the course page:** public `/courses` with filters (category, level, price, delivery), course detail with the curriculum preview, instructor and free preview lessons.
3. **Enrolment and money:** enrol (free and paid) through Books Sales Order and the gateways, seat holds for cohorts, intakes, confirmation notice, manual enrol, admin enrolments list, refunds in the window.
4. **My Courses and the lesson player:** resume where you left off, video/text/PDF player, mark done, progress bar, drip and ordering rules, access expiry.
5. **Assessments:** quiz builder, taking a quiz, attempts and marking, teacher marking of short answers.
6. **Certificates:** completion rule, PDF, number, signed QR, public verify page, My Certificates, revoke, expiry-style "issued" notice.
7. **Teaching side:** the instructor view (my courses, my students, progress), the Menus chef link (`is_instructor` profiles become instructors; chef page lists "teaches"), live session reminders.
8. **Books and recipes:** sell recipes (a recipe from Menus offered as a paid download/lesson) and cooking books (link a product to a course); cooking-class kits.
9. **Reports:** enrolments by course, completion rate, quiz pass rate, revenue; registered with the reports hub.

## 8. Not in the first cut

Discussion forums, live video built in (a live lesson links to Zoom/Meet/etc.), SCORM import, subscriptions to a whole catalogue (that is Memberships: a plan can later unlock courses), drip emails beyond the notices above, per-branch pricing (all branches same price, as the platform decided).

## 9. Questions for the owner (my recommendation first)

1. **Account needed to enrol?** Yes, a customer account (needed for progress and certificates). Guests buy, then are asked to sign in/create one.
2. **Self-paced and cohort in the first cut?** Yes, both; hybrid = a self-paced course with live lessons.
3. **Video hosting:** links (YouTube/Vimeo/our own file URL) first; uploading files to our storage for PDFs only. Hosting large video ourselves later.
4. **Teachers:** any staff member with a teaching profile; chefs with the "teaches" switch appear automatically.
5. **Certificate expiry** (e.g. food hygiene renewals): optional "valid for N months" on the course, with a renewal reminder. Recommended yes; it fits the chef certificates already built.
6. **Cooking services (Menus) first or Courses first?** The handoff listed cooking services next; you chose Courses. Menus cooking services stays queued.
