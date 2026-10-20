# Tenders, addenda and pre-qualification documents (DRAFT v2: planned, nothing built yet)

Extras module. Builds on what exists (vendor portal, tenders, bids, PQ templates, public notices at `/tenders`).

**What changed from v1:** you sent the full Mosop NG-CDF tender document (6,500 lines, the **PPRA Standard Tender Document for Goods, amended per Circular 02/2022**). It is far richer than the notices and changes the design: a tender is not a notice plus a form, it is a **standard text plus a parameter sheet**, with an exact lifecycle written into it. v2 is built around that. Sources used: the NG-CDF Tharaka notice (twice), the 2007 PPOA prequalification document, the Mosop advert, the full Mosop tender document. (`tender.zip` arrived empty; the `.txt` of it is what was read.)

## 1. What the documents teach

### 1.1 The pattern that repeats: standard text + parameter sheet

| Standard text (fixed, versioned, reused) | Parameter sheet (per tender, wins over the text) |
|---|---|
| Section I **Instructions to Tenderers (ITT)**, clauses 1 to 48 | Section II **Tender Data Sheet (TDS)**, rows keyed by ITT clause number ("whenever there is a conflict, the provisions herein shall prevail") |
| Section VI **General Conditions of Contract (GCC)** | Section VII **Special Conditions of Contract (SCC)**, rows keyed by GCC clause |
| 2007 PQ: **Instructions to Candidates** (2.1 to 2.10) | **Appendix to Instructions to Candidates** (wins where it differs) |

So the reusable "intros" are not a handful of paragraphs: they are whole standard documents. We keep the standard text once (versioned, e.g. "PPRA STD Goods 2022"), and each tender stores only its parameter values. Nothing is retyped, so nothing can drift.

### 1.2 Anatomy of the full tender document

- **Cover**: entity, tender name and number, issue date, closing date and time, category (open), PE officers.
- **Preface and guidelines** (notes for the issuer, deleted before issue).
- **Invitation to Tender**: entity, contract name, method ("national open competitive"), where documents are downloaded (free, from the government portal and the entity site; bidders who download must **email their particulars so they get clarifications and addenda**), serialisation rule, deadline, "electronic tenders shall not be permitted", public opening, late tenders rejected, three addresses (information, submission with tender box location, opening), authorised official.
- **Part 1, Tendering procedures**: Section I ITT (48 clauses), Section II TDS, Section III **Evaluation and Qualification Criteria**, Section IV **Tendering forms**.
- **Part 2, Supply requirements**: Section V **Schedule of Requirements** (list of goods and delivery schedule, related services, technical specifications, drawings, inspections and tests).
- **Part 3, Contract**: Section VI GCC, Section VII SCC, Section VIII **Contract forms** (notification of intention to award, request for review, letter of award, contract agreement, performance security in two options, advance payment security, beneficial ownership disclosure).

### 1.3 The TDS is the parameter list (Mosop values in brackets)

| Group | Parameters (ITT clause) |
|---|---|
| General | reference number and name (1.1), lots (1.1), e-procurement system and what it is used for (1.2a), unfair-advantage information (2.3), max JV members (3.1), debarred-firms list link (3.7), registration with government bodies (3.11) |
| Clarifications | where to send enquiries and by when (6.1, [13 Oct]), where the answer is published (6.1b), pre-tender conference yes/no (6.2 [no]), question deadline (6.3), minutes link (6.5) |
| Preparing | extra documents (10j), alternative tenders (12.1 [no]), price adjustment during contract (13.5 [no]), minimum % of lot and item quantities priced (13.6), place of final destination (13.8), foreign currency allowed (14.2), spare-parts period (15.4), manufacturer's authorisation (16.2a [required]), after-sales service (16.2b [required]), **tender validity 90 days** (17.1), extension up to 30 days with price adjustment (17.3), **tender security [required, 3% of total quoted sum]** and a **tender-securing declaration** (18.1), number of copies (19.1 [N/A]), authorisation to sign (19.3 [power of attorney]) |
| Submission and opening | where bulky packages go (20.3), submission address and deadline and **electronic option [not allowed]** (21.1), opening place and time (24.1), number of PE signatories (24.6) |
| Evaluation | rectifying non-material non-conformities (29.3), evaluation currency (31.1 [KES]), **margin of preference/reservation [not applied]** (32.3), additional factors (33.2d), adjustment factors: delivery, payment, spares, after-sales, life cycle, performance (33.6) |
| Award | quantity variation % (41.1), performance security (47.3), complaints procedure and who receives it (49.1) |

Many of these are already **fields on a tender** (deadline, opening venue, validity, fee, submission method, security). The TDS is generated from those fields plus a few extra parameters, never typed a second time.

### 1.4 Rules and timings written into the standard (become defaults, editable in settings)

| Rule | Where |
|---|---|
| Clarification answers go to **all who acquired the documents**, with the question described **without naming its source**; also published if the TDS says so; if it changes essential elements, issue an addendum | ITT 6.1 |
| Pre-tender meeting is optional; minutes are anonymised and published; changes **only by addendum, never through minutes** | ITT 6.3 to 6.5 |
| **Addenda** may be issued any time before the deadline; they are part of the tender document; sent in writing to all who obtained it and published; the deadline may be extended and then "all rights and obligations... shall thereafter be subject to the deadline as extended" | ITT 7, 21.2 |
| The invitation notice **is not part** of the tender document; the entity is not responsible for completeness unless the bidder obtained it from the entity | ITT 5.3 |
| Tender security: cash, bank guarantee, IRA-listed insurer's guarantee, letter of credit, or a guarantee by a micro-finance institution, Sacco, Youth or Women Enterprise Fund; valid **30 days beyond** tender validity; unsuccessful ones returned promptly (and at once if proceedings end, all bids are non-responsive, or a bidder declines to extend); forfeited if a bidder withdraws during validity or the winner fails to sign or furnish performance security; a **securing declaration** that is executed leads to a debarment recommendation to PPRA; a tenderer may not guarantee itself; a JV's security is in the JV's name | ITT 18 |
| Packaging: one outer sealed envelope; inside, separate sealed **ORIGINAL**, **COPIES** and (if allowed) **ALTERNATIVE** envelopes, each with entity name and address, tenderer name and address, tender name and reference; bulky packages are recorded and a **receipt note with date and time** is issued | ITT 19, 20 |
| **Late tenders** are rejected and returned unopened | ITT 22 |
| **Withdraw, substitute or modify** only before the deadline, by a signed notice with power of attorney, in an envelope marked WITHDRAWAL, SUBSTITUTION or MODIFICATION; not allowed between the deadline and end of validity | ITT 23 |
| **Opening** is public: withdrawals first, then substitutions, then modifications, then each remaining tender is opened and read out (**name, any modification, total price per lot with discounts, alternatives, presence of security, number of pages**); the Form of Tender and price pages are initialled by committee members; a signed **opening record** is kept; a copy of the register goes to any tenderer who asks; the entity may reject nothing at opening except late tenders | ITT 24 |
| Evaluation is confidential until the notice of intention; contact only in writing; the entity may ask a tenderer for a clarification, but **no change of price or substance** except arithmetic corrections | ITT 25 to 27, 30 |
| Defined terms: **deviation, reservation, omission**; a tender is *substantially responsive* if it has no **material** one | ITT 27, 28 |
| **Abnormally low** tender: written clarification and price analysis, reject if capability is not shown. **Abnormally high**: check the estimate and the specifications; reject all and retender if the documents caused it; if competition is compromised, reject all and investigate | ITT 35, 36 |
| **Post-qualification** of the lowest evaluated tenderer, go/no-go; if no, move to the next lowest | ITT 37 |
| **Reservations**: a contract may be reserved to one group only (SMEs, Women, Youth, persons with disabilities); it must say so in the invitation; never more than one group; not for international tenders | ITT 32.5 |
| **Notification of intention to enter into a contract** to **all** tenderers: successful name and address, price, why the recipient lost, standstill expiry, how to request a debrief or complain | ITT 41 |
| **Standstill 14 days** (not applied when only one tender was received); **debrief within 5 days** of a request | ITT 42, 43 |
| **Letter of award** after the standstill and before validity ends; performance security **within 21 days**; contract **signed within 14 days** of receipt; failure means annul the award, forfeit the tender security, offer the next lowest | ITT 44 to 46 |
| **Publish the awarded contract within 14 days** of signing (notice board, entity site, PPRA site): entity, contract name and number and scope, method, winner, price and duration, signature and start and end dates, and **all tenderers and the prices read out at opening** | ITT 47 |
| Margin of preference 15% for goods made in Kenya (local content at least 40%) when the TDS says so; tenders grouped A, B, C; imported (group C) priced up by 15% for comparison | Section III 3 |
| Price schedule adds **PPRA levy 0.03%** and **VAT 16%** as computed lines | Section IV |

### 1.5 Evaluation in this document (Section III), three stages

1. **Preliminary (mandatory, yes/no each)**: any "no" is non-responsive and goes no further. The Mosop list is the 15 items: trading licence, registration certificate, VAT/tax compliance (verified on the KRA checker), CR12 not older than 6 months **or** IDs for sole proprietors, power of attorney, tender security form, Form of Quotation on letterhead, schedule of requirements, KEBS certification, Certificate of Independent Tender Determination, SD1, SD2, confidential business questionnaire, disclosure of interest, pages serialised.
2. **Technical, scored**: parameters with **bands of marks** and a pass mark. Mosop: audited accounts for two years (turnover at least 1.5 times the project cost = 20 marks, at least the project cost = 10, below = 0); financial resources (equal or above the cost = 20, 50% = 10, below 50% = 5, none shown = 0); specific experience (similar goods, same size = 15, lower value = 5, none = 0); conformity to specification (30, with photos of three recent buses) plus warranty letter (10) plus certified safety documents (10); manufacturing programme (adequate = 15, none = 0). **Total 100, pass mark 80** to reach the financial stage.
3. **Financial**: lowest evaluated price after discounts, currency conversion, non-material corrections, and the additional factors named in the TDS (delivery schedule adjustment, payment schedule, spares, after-sales availability, life cycle cost, performance); multiple lots by one of two award options; alternatives rules; margin of preference groups.
4. **Post-qualification** of the lowest evaluated tenderer, go/no-go: financial capability (liquid assets for the cash flow, minimum average turnover about 2.5 times the tender price), experience and technical capacity, usage evidence, non-performance history, pending litigation, litigation history; a supplier relying on a manufacturer's authorisation shows its own criteria and the manufacturer shows the others.

### 1.6 The forms (Section IV and VIII)

- **Form of Tender**: a list of declarations a) to s): no reservations to the document including addenda, eligibility and no conflict, not suspended by a securing declaration, conformity, **total price in words and figures** (one lot or per lot), discounts and their method, validity, performance security commitment, one tender per tenderer, no suspension or debarment, state-owned enterprise status, commissions paid, binding contract, entity not bound to accept the lowest, anti-corruption, code of ethics, non-collusion, beneficial ownership commitment, and the list of forms signed. Signed by an authorised person with a **power of attorney**; "on the tenderer's letterhead".
- **Certificate of Independent Tender Determination**: statements 1 to 8, with a choice **(a)** independent or **(b)** consulted competitors, with the details attached.
- **Self-declarations SD1** (not debarred) and **SD2** (no corrupt practice) and the **Code of Ethics declaration**, all with the tenderer, tender number and entity filled in.
- **Tenderer Information Form** and **Confidential Business Questionnaire**: legal name, registration country and year, address, **authorised representative**, documents attached; then sole proprietor / partnership (partners with nationality, citizenship, % shares) / company (private or public, nominal and issued capital, directors with % shares), trade licence number and expiry, maximum value of business handled, **disclosure of interest** (anyone at the entity with an interest in the firm), and a **conflict-of-interest table** (controlled by another tenderer, subsidy from another tenderer, same legal representative, relationship that can influence a tender). Plus the JV members form.
- **Price schedules**: goods made in Kenya (groups A and B), made abroad and to be imported, made abroad and already imported, and related services. Columns: line, description, delivery date, quantity and unit, EXW unit price, total, inland transport and services to destination, **local content %**, taxes, total per line. Then "PPRA levy 0.03%", sub-total, "VAT 16%", total. Name, signature, date, stamp.
- **Tender security forms**: demand bank guarantee, insurance guarantee, tender-securing declaration; **Manufacturer's Authorization**.
- **Schedule of Requirements**: list of goods with quantity, unit, final destination, **earliest and latest delivery date and the tenderer's offered date**; the **technical specification is a compliance matrix** of numbered clauses with the **required** value (some marked mandatory, some "approx." with figures) and a column for what the **tenderer offers** (Make, Model, Country of origin, each value or Y/N).
- **Contract forms**: Notification of Intention to Award, Request for Review, Letter of Award, Contract Agreement, Performance Security (guarantee or bond), Advance Payment Security, Beneficial Ownership Disclosure. The **SCC** holds payment terms (for example 10% advance against a guarantee, 80% on delivery, 10% on acceptance), performance security %, liquidated damages % per week and cap, warranty period, inspection and test places, insurance and transport responsibilities.

### 1.7 Errors in the real documents (why single-source data matters)

| Found | Where |
|---|---|
| The advert's table gives closing **21 October 2026** for all four tenders; its paragraph says received by **Wednesday 14 October 2026**. | adv.pdf |
| The **TDS reference number** is the ACK Bishop Kogo tender (`.../ACKBKOGOCHEPTILSCH/BUS1/ONT/01/...`) in the document for St Augustine Muruto (`.../STAUGUSTMURUTOSCH/BUS/ONT/02/...`): a copied number never changed. | TDS 1.1 |
| ITT 18.1 says a tender security and a securing declaration are alternatives ("and vice versa"); the TDS requires **both**. | TDS 18.1 |
| The postal address is **Kabiyet** in the invitation and **Sindo** in TDS 21.1 and 49.1. | Invitation, TDS |
| Wrong cross-references: "Section VII, Schedule of Requirements" (it is Section V), "Section X, Contract Forms" (it is Section VIII), "extended by five (3) days". | ITT 28, ITT 46, Form No. 1 |
| "Wensday 21ST October" typed in the notice. | NG-CDF Tharaka notice |

The design answer: every repeated value (tender number, entity address, dates, security) is stored once and merged everywhere; clause cross-references are **links to a clause, never typed numbers**; and a **pre-publish check** lists conflicts (dates that differ between notice and TDS, security alternatives both ticked, a TDS reference different from the tender's own number, mandatory parameters left blank).

## 2. What the research found (and could not)

Page fetching was blocked here, so this is from search summaries.
- **Addenda in Kenya** cite section 75 of the Public Procurement and Asset Disposal Act 2015. They extend closing dates, correct references or answer bidders' questions in a table, and state that all other conditions remain; published on the entity's site and the government tender portal. The standard document (ITT 6, 7, 21.2) now gives the exact procedure, which this plan follows.
- **Open Contracting Data Standard**: your KEFRI OCID is an OCDS identifier. Published notices are **immutable**: an amendment is a new release. Method codes `open`, `selective`, `limited`, `direct`.
- **Kenya's e-GP system** (egpkenya.go.ke) is where suppliers register and bid on government tenders; we are the company's own tendering, not that system.
- **Other e-tender systems** (GePNIC, Bids & Tenders): templates and clause libraries; clarification Q&A to everyone; addenda to registered bidders with audit trail and document versions; single or multi-cover bids (technical envelope first, financial sealed until it passes); evaluator templates with conflict-of-interest declarations.

## 3. Decisions to confirm (my recommendation in bold)

| # | Question | Recommendation |
|---|---|---|
| 1 | Who is the procuring entity? | **The company only** (the repo decided: one company, one set of books). Letterhead from the company profile. |
| 2 | Electronic bids, physical, or both? | **Both, chosen per tender** (the TDS has the switch; Mosop forbids electronic). Staff record physical bids in the same opening register. |
| 3 | Follow the Kenyan timings strictly? | **Defaults taken from the standard** (standstill 14, debrief 5, performance security 21, contract signed 14, publish 14, security valid 30 beyond validity), **as warnings** you can edit, so private procurement works too. |
| 4 | Pre-qualification: standing, per project, or both? | **Both, one engine.** |
| 5 | Publishing needs a second person's approval? | **Optional switch.** |
| 6 | Addenda notification channels | **In-app plus email when mail is set up.** |
| 7 | People without an account who download documents | **Yes: "register interest"** (the standard makes the list of who *acquired* the document the list that must receive addenda, and Mosop asks for it by email). |
| 8 | Tender security in v1 | **Yes** (answered by the samples). |
| 9 | One advert for several tenders | **Yes** (answered by the Mosop advert). |
| 10 | Seed the PPRA Standard Tender Document for Goods as the first standard text? | **Yes.** It is a public standard; it becomes an editable, versioned template. Works, services and RFQ standards are added later the same way. |
| 11 | Reservation scheme | **A single choice** (none, SMEs, Women, Youth, persons with disabilities), because the standard allows only one group per tender. |
| 12 | Evaluation depth in the first version | **Mandatory yes/no, scored technical with bands and pass mark, and price with the named adjustments**; post-qualification as a checklist. Margin of preference and multi-lot award options later. |

## 4. Design

### 4.1 Standard documents and parameter sheets (the engine)

- `standard_documents` (`key`, `title`, `version`, `kind` = tender | prequalification, `procurement_category`, `source_note`): e.g. "PPRA Standard Tender Document: Goods (Circular 02/2022)".
- `standard_clauses` (`standard_id`, `part` = ITT | GCC | ITC | ..., `number`, `title`, `body`, `parent`, `sort`): the fixed texts, numbered, with **internal links** to other clauses by id.
- `standard_parameters` (`standard_id`, `clause_number`, `key`, `label`, `type` text | longtext | number | money | date | datetime | yes_no | select | multi | address | table, `options`, `default`, `allow_na`, `maps_to` a tender field or null, `guidance`): the TDS and SCC rows with the issuer's notes.
- `tender_parameters` (`tender_id`, `parameter_key`, `value`, `is_na`): the values; a parameter that maps to a tender field is read from and written to the field.
- **Snapshot on publish**: the tender stores the standard's version and the resolved text, so changing the standard later never changes a published tender.
- **Rendering**: the full document (cover, contents, invitation, ITT, TDS, criteria, forms, schedule, GCC, SCC, contract forms) as HTML and PDF through the installed `dompdf`, letterhead from the company profile; the guidance notes ("delete before issue") are shown to the author and left out of the output.

### 4.2 Reusable library (the "intros")

- **Content blocks**: invitation intro, how to obtain documents, eligibility note, sealed submission, public opening, price validity, price basis ("inclusive of all taxes"), no-lowest-bidder, technical note, late bids, bulky documents, signoff. Merge fields `{entity_name} {tender_number} {tender_title} {closing_datetime} {opening_venue} {validity_days} {tender_fee} {addressee} {office_address} {portal_url} {contact_phone}`. Seed text from the notices (see v1 wording kept in the seed script).
- **Requirement library** (`requirements`): `code`, `label`, `description`, `document_type`, `applies_to_category`, `applies_to_business_type` (company / partnership / sole proprietor, which gives the CR12-**or**-IDs alternative), `rule` (`dated_on_or_after`, `not_older_than_months`, `valid_on_closing`, `signed`, `stamped`, `certified_copy`), `verification_note` and link (the KRA checker), `sort`. One pool feeds **tender mandatory lists and PQ required documents**.
- **Declaration and form library** (`bidder_forms`): Form of Tender, Certificate of Independent Tender Determination, SD1, SD2, Code of Ethics, Confidential Business Questionnaire, Tenderer Information, JV members, Manufacturer's Authorization, power of attorney. Each is a template with merge fields (tenderer, tender number, entity), a way to complete it (**tick and sign in the portal**: declaration items, typed name, title, date; or **download, sign, upload**), and a status per bid.
- **Vendor business profile** (`vendor_profile` fields on the vendor): business type, registration country and year, authorised representative, directors or partners with % shares (this is also the **beneficial ownership** list), trade licence number and expiry, capital, maximum business value. It prefills the Tenderer Information and Questionnaire forms; a bid stores a **snapshot** of what was submitted.
- **Tender templates** and **tender-number format** as in v1 (tokens, still typeable).

### 4.3 The tender document builder

Authoring a tender is a guided form in this order, each step saving to the fields above:
1. **Basics**: title, number (proposed), category, method, financial year, commencement and closing dates, lots.
2. **Notice and invitation**: blocks chosen from the library, the three addresses.
3. **TDS**: the parameter list grouped A to F with the standard's guidance beside each, defaults filled, "N/A" allowed where the standard allows.
4. **Requirements and evaluation**: mandatory checklist from the library; technical criteria with **bands** and pass mark; price adjustments chosen from the named factors; post-qualification criteria.
5. **Schedule of requirements**: goods lines (quantity, unit, destination, earliest and latest delivery), related services, **technical specification rows** (clause, required value, mandatory flag, how the bid answers: text, number with unit, Y/N), inspections and tests, drawings as files.
6. **Contract terms (SCC)**: parameters (payment terms, performance security %, liquidated damages, warranty).
7. **Check and publish**: the consistency check from section 1.7, preview of the full PDF, optional approval, publish. Publishing snapshots the document and creates the public notice and the "register interest" list.

### 4.4 Clarifications, addenda and who is told

Follows ITT 6, 7 and 21.2.
- `tender_followers` (`tender_id`, `vendor_id` nullable, `email`, `name`, `company`, `source` = downloaded | registered | bid): the **acquirer register**; the list every clarification and addendum goes to. Downloading the documents (public or portal) asks for name, email and company, or uses the signed-in vendor.
- `tender_clarifications`: question (with its asker kept privately), **anonymised** question text as published, answer, dates, `addendum_id` if it changed essential elements. Enquiry deadline from TDS 6.1.
- Optional **pre-tender meeting**: date, place, attendance, minutes (anonymised, published); a modification arising from it can only be made by an addendum, and the system says so.
- `tender_addenda`: numbered per tender, `kind` clarification | amendment | extension | correction, `changes` (field, label, from, to) applied in one transaction on publish, optional **new deadline** (extending applies the "all rights and obligations move to the new deadline" rule to everyone), replaced or added documents (`tender_documents` gains `addendum_id`, `version`, `supersedes_id`), published text and printable PDF ("ADDENDUM No. N... all other terms and conditions remain unchanged").
- Bids already in: a material addendum puts them in **needs confirmation**; the vendor confirms, revises or withdraws before the deadline; the Form of Tender declaration "no reservations to the tendering document **including addenda**" is re-asked.
- Public timeline under the notice; list badges ("Addendum issued", "Deadline extended"); notifications through the existing notification system; optional acknowledgement per addendum.
- **A bad advert is fixed by an addendum**, not by editing: that is how the 14 vs 21 October conflict would be corrected, with a visible trail.

### 4.5 Submitting a bid

- **Electronic** (when the TDS allows): the portal bid has the same parts as the paper envelope. **Original** (the full bid), **Copies** and **Alternative** (when allowed) become tabs; the mandatory checklist with uploads and expiry checks against the rules; Form of Tender declarations; questionnaire and information forms prefilled from the vendor profile; price schedule with the **PPRA levy and VAT computed**; **technical compliance matrix** (Make, Model, Country, each requirement's offered value with automatic comparison to the required value and a flag on mismatches); tender security or securing declaration; manufacturer's authorisation; delivery date offered; review and submit. Validity from the tender. A submitted bid is **sealed**: staff see only the count until opening.
- **Physical**: staff record each bid at receipt: time and date, who delivered, envelope condition and marking, whether the original and copies envelopes are present, a **receipt note** to the tenderer (also for bulky packages). Late bids are logged and marked returned unopened.
- **Withdraw, substitute, modify** before the deadline only; after it, not until validity ends. Electronic: allowed in the portal before the deadline; physical: a notice record linked to the bid.
- **Tender security**: type, issuer, number, amount, expiry (checked against validity plus 30 days), scan; staff verify; released or returned under the rules in 1.4, with reminders; a forfeiture record.

### 4.6 Opening

An **Open bids** action at the opening time, by users holding `tenders.open`, runs the read-out in the standard's order: withdrawals, substitutions, modifications, then each tender (name, modification flag, total price with discounts, alternatives, security present or not, number of pages). It produces the **opening record** (PDF), lets the attendees' names and signatures be recorded, and keeps a register. Opening rejects nothing except late bids. **Two-envelope** tenders open the technical envelope only; the financial envelope opens later for those who pass.

### 4.7 Evaluation

- Stages as in 1.5; each stage is a sheet per evaluator and a combined sheet; every evaluator declares **conflict of interest** first.
- **Preliminary**: the checklist, yes/no per requirement per bid with a reason; any "no" stops that bid.
- **Technical**: the author's scoring table is checked as it is built (the maximum of each parameter is summed and compared with the stated total, and a pass mark above the total is refused); each parameter shows its bands; where the answer is numeric (turnover against project cost, financial resources) the system **suggests the band**; the evaluator confirms or overrides with a reason; total and pass mark.
- **Financial**: arithmetic corrections (recorded, per ITT 30), discount application, adjustments from the factors the TDS selected, comparison; **abnormally low or high** flags with a clarification record; margin-of-preference groups later.
- **Post-qualification** of the lowest evaluated bid as a go/no-go list; on "no", the next lowest.
- **Evaluation report** (PDF): per the "Standard Tender Evaluation Report for Goods and Works" the document points to; we start with a faithful summary and replace it with the official layout if you send it.

### 4.8 Award chain

`Notification of Intention` to all tenderers (generated per recipient: winner, price, the recipient's reasons) starts a **standstill** clock (14 days, none for a single bid) with a **debrief** and **complaint** record; then the **Letter of Award**; contract agreement and **performance security** tracking (21 and 14 day clocks, forfeiture and next-lowest path); **beneficial ownership disclosure** from the winner's directors list; then the **published contract notice** (within 14 days, with all tenderers and read-out prices) for the public site. The existing award creating a vendor order stays; it moves to the end of this chain. **Request for Review** and complaint are records with dates, not workflows, in v1.

### 4.9 Pre-qualification (from v1, unchanged in substance)

The 2007 standard for works is the model for forms and pass/fail criteria (form schema with repeating tables and cards, criteria with thresholds, suggested pass/fail with evaluator override, standing and per-project exercises, shortlist feeding restricted tenders). It predates the 2015 Act: **check it against the current PPRA prequalification document** before seeding. It uses the same engine as 4.1: standard text (Instructions to Candidates), parameter sheet (the Appendix), forms.

### 4.10 Public and open data

Public list: Addendum and deadline-extended badges, "closing soon", reservation group filter, group adverts. Public detail: the full notice, requirements, timeline, documents with register-interest download. **OCDS export** later (our fields map to `tenderPeriod`, `procurementMethod`, `mainProcurementCategory`, `submissionMethod`, documents, amendments); the OCID stays a typed field.

### 4.11 Permissions and numbering

- New catalog permissions: `tenders.library` (standard texts, blocks, requirements, forms, templates), `tenders.addenda`, `tenders.open`, `tenders.evaluate` (exists), `tenders.award`. Vendors need `vendors.portal`.
- Database scripts from 221, one concern each, safe to re-run, with the guards used so far: 221 standard documents, clauses, parameters; 222 blocks, requirements, bidder forms, templates; 223 tender parameters, adverts, commencement and security columns; 224 followers, clarifications, addenda, document versions; 225 bid parts, receipts, security records; 226 opening records; 227 evaluation sheets and criteria; 228 award chain; 229 vendor business profile; 230 PQ forms and criteria.

## 5. Build order

1. **Phase 1, the engine and the notice**: standard documents with the PPRA Goods text and parameter sheet (TDS first), the consistency check, content blocks, requirement library, tender document PDF and notice, register interest, clarifications and addenda with the public timeline.
2. **Phase 2, bidding**: vendor business profile, bidder forms with tick-and-sign, vendor bid screen with the original/copies parts, requirement checks, price schedule with levy and VAT, technical compliance matrix, tender security, physical bid receipts, sealed opening and the opening record.
3. **Phase 3, evaluation and award**: the three stages with bands and suggestions, post-qualification, evaluation report, notification of intention, standstill, letter of award, performance security tracking, contract publication.
4. **Phase 4, pre-qualification forms and criteria**, tender templates, works and services standards, OCDS export, e-signatures, request-for-review workflow, supplier document wallet with expiry reminders.

## 6. Not decided, to check

- The Act's exact rules on addenda timing, minimum tender periods and the standstill (we use the standard's numbers as editable defaults).
- Whether to offer the **Works**, **Non-consultancy services** and **Request for Quotation** standards next (they use the same engine; you would send those documents).
- The official **Standard Tender Evaluation Report** layout (referenced, not provided).
- Whether the 2007 prequalification forms still match the current PPRA standard.
- Tender security details for your own private procurement (percentage, accepted forms): confirm with whoever runs procurement.
