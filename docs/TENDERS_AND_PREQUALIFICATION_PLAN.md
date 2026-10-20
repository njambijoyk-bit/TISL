# Tenders, addenda and pre-qualification documents (DRAFT v1: planned, nothing built yet)

Extras module. Builds on what exists (vendor portal, tenders, bids, PQ templates, public notices at `/tenders`). This plan comes from two real documents you shared and a look at how other e-tender systems work.

## What the two samples teach

**1. NG-CDF Tharaka "Tender Notice" (2 pages).** One notice is five reusable pieces plus the tender's own facts:

| Piece | In the sample | Reusable? |
|---|---|---|
| Letterhead | entity name, PO box, email, website, date, logo | yes, from the company profile |
| Invitation intro | "wishes to invite sealed bids from interested and eligible firms to bid for the following tender" | yes, a text block |
| Tender facts | title, tender number, deadline, opening venue, price validity (120 days) | per tender |
| How to obtain documents | from the office on working days before 4pm, or free from the portal | yes, a block with the office and portal filled in |
| Mandatory conditions a) to m) | registration certificate, tax compliance, NCA licence (works), form of tender, CR12, single business permit, confidential business questionnaire, serialised, tape-bound, e-GP registration, past work, AGPO certificate | yes, a **requirement library** (each item is a document type a bidder must attach) |
| Submission and opening rules | sealed envelope, marked with the tender number, tender box, public opening, late bids returned, bulky documents to the account manager's office | yes, blocks with merge fields |
| Sign-off | The Fund Manager, address | yes, from settings |

**2. PPOA "Standard Procurement Prequalification Document" (37 pages, January 2007).** A template, not a form. It has:
- **Section I** Invitation for Prequalification (IFPQ): a fill-in-the-blanks notice.
- **Section II** Instructions to Candidates, clauses 2.1 to 2.10: scope, how to submit, eligibility, qualification criteria, joint ventures, public companies, conflict of interest, updating information, preferences. An **Appendix** amends any clause, and the Appendix wins where they differ.
- **Section III** Letter of Application, signed by the applicant (and every joint-venture partner).
- **Section IV** Standard Forms: 1 General information, 2 General experience (turnover by year), 2A Joint venture summary, 3/3A Particular experience (one sheet per similar contract), 4 Current commitments, 5/5A Personnel (position, prime and alternate candidate, 20-year career), 6 Equipment (one per item), 7 Financial capability (banker, five actual and two projected years of assets/liabilities/profit), 8 Litigation history, RB1 Request for Review. Plus a **Letter of Notification of Award**.
- Qualification is **pass or fail per criterion**: turnover (usually 2.5 times the estimated annual cash flow), at least N similar projects in the last N years, key personnel with minimum years, minimum equipment, cash-flow funds for N months, audited accounts for N years, litigation disclosure.
- Time rules written in it: at least 28 days (national) or 42 (international) from first advertisement; a request for review within 14 days of the award notice; the contract signed within 30 days of the award letter but not earlier than 14.
- Guidance notes in italics ("delete before issue") and **alternative clauses** to keep or discard.
- It is dated 2007 and cites the older procurement law. **Have it checked against the current PPRA standard documents** before we seed it.

## What the research found (and what it could not)

Fetching pages directly was blocked here, so this comes from search summaries only.
- **Addenda in Kenya** cite section 75 of the Public Procurement and Asset Disposal Act 2015 (Treasury, Kenya Re, TU-K and KWS notices). They typically extend the closing date, correct references, or answer bidders' questions in a table, and state that all other conditions stay as in the principal tender. They are published on the entity's site and the government tender portal. Check the Act's own wording before we hard-code any rule.
- **Open Contracting Data Standard (OCDS)**: your KEFRI sample's OCID is an OCDS identifier. OCDS treats published notices as **immutable**: an amendment is a new release, never an edit. Its method codes are `open`, `selective`, `limited`, `direct`.
- **Kenya's e-GP system** (egpkenya.go.ke) is where suppliers register and bid on government tenders. We are not that system and should not pretend to be; we are the company's own tendering.
- **Other e-tender systems** (GePNIC, Bids & Tenders and others) share these features: reusable templates and clause libraries; bidder questions answered to everyone; **addenda distributed to registered bidders**, with audit trail and document versions; tenders configured for one or two envelopes (technical opened first, financial kept sealed until the technical pass); evaluator templates with conflict-of-interest disclosure.

## Decisions to confirm (my recommendation in bold)

| # | Question | Recommendation |
|---|---|---|
| 1 | Who is the procuring entity? | **The company only.** The repo has already decided on one company, one set of books. Letterhead comes from the company profile; no entity table. |
| 2 | Electronic bids, physical bids, or both? | **Both.** Vendors bid in the portal; an admin records physically received bids at opening, so one register covers all. |
| 3 | Follow Kenyan procurement rules strictly? | **Defaults with warnings, not hard blocks** (minimum days, award standstill), each editable in settings, so you can use it for private procurement too. |
| 4 | Pre-qualification: standing registration or per-project? | **Both, one engine.** Standing = what exists now (valid N months). Per-project = an invitation for prequalification with its own closing date, criteria and shortlist, which then feeds a "pre-qualified only" tender. |
| 5 | Does publishing need a second person's approval? | **Optional switch** (the tenders table already has `approved_by`). |
| 6 | Do vendors get email, in-app, or both for addenda? | **In-app plus email when mail is set up**, using the existing notifications. |
| 7 | Public bidders without an account: may they leave an email to receive addenda? | **Yes**: "Register interest" with name, email, company; logged-in vendors are followed automatically. |

## 1. Reusable content ("the intros")

One library, used by tender notices, IFPQs, addenda and award letters.

**Content blocks** (`content_blocks`): `key`, `kind` (invitation_intro, how_to_obtain, eligibility_note, submission_sealed, public_opening, price_validity, late_bids, bulky_documents, conflict_of_interest, preferences, closing, custom), `applies_to` (tender, pq, addendum, award_letter), `category` (any / goods / services / works), `title`, `body`, `is_active`, `sort`, `version`.

Bodies carry merge fields, filled from the tender and company profile when the notice is made. Seed text, taken from your sample:
- *invitation_intro:* "{entity_name} wishes to invite sealed bids from interested and eligible firms to bid for the following tender."
- *how_to_obtain:* "Interested bidders may obtain tender documents from {office_address} before {office_closing_time} on normal working days, or free of charge by downloading them from {portal_url}."
- *submission_sealed:* "Tenders in plain sealed envelopes, marked with the tender number on the right-hand corner and bearing no indication of the tenderer, should be addressed to {addressee} and dropped in the tender box at {tender_box_location} to reach them not later than {closing_datetime}."
- *public_opening:* "Submitted bids shall be opened publicly at {opening_venue} soon after the above date and time in the presence of the tenderers or their representatives who choose to attend. Late bids will be returned or remain unopened."
- *price_validity:* "Prices quoted must remain valid for a minimum period of {validity_days} days from the opening date of the tender."
- Merge fields: `{entity_name} {tender_number} {tender_title} {closing_datetime} {opening_venue} {validity_days} {tender_fee} {addressee} {office_address} {portal_url} {contact_phone}`.

**Rule: a published notice keeps its own copy.** Editing the library later never changes a notice already published (the OCDS "immutable release" idea). A tender stores its final ordered blocks as a snapshot when published.

**Requirement library** (`requirements`): `code`, `label`, `description`, `applies_to_category`, `document_type`, `needs_expiry`, `is_default`, `sort`. Seeded from the notice: registration/incorporation certificate, valid tax compliance certificate, NCA registration and practising licence (works only), form of tender signed and stamped, CR12 (not older than a date), single business permit, confidential business questionnaire, past work experience, AGPO certificate (Youth / Women / PWD), e-GP registration, and "tape bound and serialised" as a tick-box rule. The **same library** feeds PQ required documents, so a vendor uploads a certificate once and it can be reused (with its expiry) across tenders.

**Tender templates** (`tender_templates`): category, method, submission method, reservation scheme, validity days, fee, which blocks in which order, which requirements are ticked, and date offsets ("closes 14 days after publishing"). "New tender from template" copies it; nothing stays linked.

## 2. Addenda and clarifications

This is the part that must be right, because it changes a live notice.

- **Clarifications (Q&A)**: a bidder asks a question before the enquiry deadline; staff answer; the question (name removed) and the answer are published to everyone. Table `tender_clarifications` (`tender_id`, `vendor_id` nullable, `question`, `answer`, `asked_at`, `answered_at`, `answered_by`, `published`, `addendum_id` nullable).
- **Addenda**: numbered per tender (Addendum 1, 2, ...). Table `tender_addenda` (`tender_id`, `number`, `kind` = clarification | amendment | extension, `title`, `body` from a block, `changes` JSON of `[{field, label, from, to}]`, `issued_at`, `issued_by`, `status` = draft | published). Publishing is one transaction: the tender's fields change (closing date, opening date, validity, venue) and the old and new values are kept in `changes`, so the public notice can say "Close date: Oct 21 10:00 to Oct 28 10:00".
- **Documents get versions**: `tender_documents` gains `addendum_id`, `version`, `supersedes_id`. An addendum can add a document or replace one; the old one stays visible and marked "superseded".
- **Who is told**: everyone who bid, started a bid, registered interest or downloaded a document. Uses the existing notification system. `tender_followers` (`tender_id`, `vendor_id` nullable, `email`, `name`, `company`).
- **Acknowledgement**: optional, per addendum: bidders confirm they have read it. `tender_addendum_acks`.
- **Effect on bids already in**: a *material* addendum (closing date, price validity, requirements) puts submitted bids in "needs confirmation" and notifies the vendor, who may confirm, revise or withdraw before the (possibly extended) deadline. A warning appears if an addendum is issued within N days of closing (N is a setting, default to be confirmed against the Act) and offers to extend the deadline.
- **Public page**: a timeline under the notice, newest first: Addendum 2 (extension), Clarification, Addendum 1; a badge on the list ("Addendum issued", "Deadline extended"); a "last updated" date.
- **Audit**: nothing is deleted; cancelled addenda are marked, not removed.
- **Printable addendum**: letterhead, "ADDENDUM No. N", reference to the tender number, the clarification table, the changes, and the line "All other terms and conditions of the tender remain unchanged", signed by the accounting officer from settings.

## 3. Generated documents

All built from blocks plus tender data, as HTML for screen and PDF through the `dompdf` already installed (as the Books exports do), with the letterhead from the company profile.
- **Tender notice** (like the NG-CDF sample), **IFPQ**, **Addendum**, **Letter of notification of award**, **Bid opening record** (who opened, when, bidder names and read-out totals).
- The public `/tenders/:id` page shows the same content; a "Download notice (PDF)" button.

## 4. Pre-qualification, rebuilt around the standard document

Today a PQ template is a flat list of questions and document types. The standard document needs forms with **repeating tables and cards**, **pass/fail criteria** and **joint ventures**. Plan:

**Form schema.** A PQ exercise or template holds typed forms: `[{code, title, repeat: none | per_partner | per_item, fields: [...]}]`. Field types: text, long text, number, money, date, select, radio/checkbox, file, and **table** (typed columns, with min and max rows). Rules: required, conditional ("show if role = partner in a joint venture"), simple totals (turnover total, assets minus liabilities).

**Seed library of the PPOA forms** (from the PDF, after checking against the current standard): Form 1 General information (with owners and nationality table), 2 General experience (turnover by year), 2A Joint venture summary (up to 6 partners, three years, totals), 3A Similar contract details (one card per contract: number, name, employer, nature, role, value, award and completion dates, duration), 4 Current commitments, 5/5A Personnel and candidate summary, 6 Equipment, 7 Financial capability (banker, actual and projected years), 8 Litigation history. Also the **Letter of Application** (generated from tender list and signatories; signed by upload or declaration) and **Request for Review (RB1)** as a simple record.

**Criteria and evaluation.** A criterion has a type (turnover, similar experience, personnel, equipment, cash flow, audited accounts, litigation, custom), a threshold (for example turnover at least 2.5 times an entered annual cash flow; at least 3 similar projects in the last 5 years), and the form data it reads. When the application is submitted the system computes a **suggested pass or fail per criterion** from the form data; the evaluator confirms or overrides each with a reason, then records **Qualified / Not qualified** for the exercise. For joint ventures the lead-partner percentage and each-partner percentage come from the criteria. Outcomes produce the result letters.

**Two kinds, one engine:**
- *Standing prequalification* (exists): valid N months, any tender marked "pre-qualified only" accepts vendors qualified in that category. Gains the forms and criteria above.
- *Project prequalification*: has an IFPQ notice, its own number and closing date (warned if under 28 days national), applications, evaluation, and a **shortlist** that becomes the invitation list of a restricted tender.

## 5. Bids that match the notice

(Needed for all of the above to be real; today these steps are API-only.)
- **Vendor bid screen**: the mandatory-requirements checklist (upload each document, see expiry), price schedule lines, delivery or validity, tender security if required, declaration, review, submit. Addenda shown above it, with the acknowledgement.
- **Sealed until opening**: before the opening time staff see only the count of bids, not content. An **Open bids** action records who opened and when and shows the register. Physical bids are entered by staff into the same register.
- **Two-envelope option** (technical first, financial opened only for those who pass).
- **Evaluation sheet** with scores per criterion and a conflict-of-interest declaration per evaluator.
- **Award**: the existing award creates the vendor order; add the Letter of Notification of Award and the optional standstill and contract-signing dates as warnings.

## 6. Public and open data

- Public list gains an Addenda badge, the procurement method filter already added, and a "closing soon" sort.
- **OCDS export** (later): `GET /public/tenders/{id}/ocds` mapping our fields to OCDS (`open_tender` to `open`, `restricted_tender` to `selective`, `request_for_quotation` to `limited`, `direct_procurement` to `direct`; category to the main procurement category; published and closing dates to the tender period; documents; addenda to amendments). Our OCID stays a typed field; we do not invent one.

## 7. Permissions and numbering

- Bump the catalog: `tenders.library` (blocks, requirements, templates), `tenders.addenda` (issue addenda), `tenders.open` (open bids), keeping `tenders.manage` and `tenders.evaluate`. Public pages stay open; vendor actions need `vendors.portal`.
- Database scripts continue from 221, one concern each, safe to re-run, with the guards used so far (nothing breaks before a script has run): 221 content blocks and requirements, 222 templates, 223 addenda, clarifications, followers and document versions, 224 form schema and criteria, 225 bid register and opening.

## Build order

1. **Phase 1, addenda and reusable content** (small, high value): content blocks and merge fields, requirement library, tender notice generator (HTML and PDF), clarifications and addenda with public timeline, document versions, notifications.
2. **Phase 2, bids that match**: vendor bid screen with requirement uploads, sealed opening and register, evaluation sheet, award letter, tender templates.
3. **Phase 3, pre-qualification forms**: form schema and the PPOA seed forms, criteria and suggested evaluation, project prequalification with IFPQ and shortlist.
4. **Phase 4**: OCDS export, e-signatures, request-for-review record, supplier document wallet with expiry reminders.

## Not decided, to check

- The Act's exact rules on addenda timing, minimum tender periods and the award standstill (we use the PDF's numbers as placeholders and make them settings).
- Whether the 2007 forms still match the current PPRA standard documents.
- Whether tender security (bid bond or securing declaration) is needed in v1.
