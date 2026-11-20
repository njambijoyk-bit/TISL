# Projects Stage 11: Industry finish (built)

Status: built. The owner said "stage 11" on 2026-11-20 after Stage 10, so the four choices at the end were taken as recommended; any of them can still be changed. All five builds are listed under "As built".

Stages 1 to 10 built every part of the module once, for every industry. Stage 1 gave each of the 15 industries its names, kinds of work and stages. What it did not give them is the rest of what makes a law firm, a builder or a clinic feel at home on the first day: how a new piece of work starts (its phases, tasks and key dates), the check before work begins, dates that follow from other dates, the fields they keep, the documents they send. Stage 11 adds the three mechanisms that were missing (work templates, the opening check, date rules) and fills every industry with starter content: the five common industries in depth, then the eight niche ones, then the two basic ones.

Size: medium. Five builds, one script, no new permissions (`projects.config.stages` and `projects.config.fields` from Stage 1 cover changing templates, checks and rules).

## The rules this stage keeps

1. **Starter content is the company's own data.** Everything seeded can be changed, switched off or removed in Configuration, and a later script never overwrites it (INSERT IGNORE by a fixed key).
2. **Nothing hardcoded per industry in code.** The code knows what a work template, an opening check and a date rule are; which ones an industry has are rows.
3. **No money.** Templates, checks and rules hold no amounts.
4. **Nothing serious happens by itself without a trace.** A date made by a rule says which rule made it, and the log shows it.

## In this stage

### 1. Work templates
- A **work template** belongs to a kind of work: phases (to any depth), tasks under them with "days after the start" and an estimate, and key dates (their kind, days after the start, warning days). One template per kind of work can be the default.
- **Starting a piece of work** offers the kind of work's templates (the default chosen); the phases, tasks and key dates are made from the start date. A template can also be applied later to a running work: only what is not there yet is added.
- Configuration → Kinds of work and stages: each kind's templates, made and changed there.

### 2. The opening check
- Each kind of work (or a whole industry) can have **opening check questions**: yes or no, each with a note, some needing "yes" to pass. The name is the industry's ("Conflict check" for legal, "Site survey" for field service, "Consent and eligibility check" for healthcare).
- On the work, the check is answered and signed with a typed name. A kind of work can require it before the work leaves its first stage (owner's choice 3).
- **Who else is involved:** the check shows the client and every party on the work searched against the clients, contacts, parties and leads already known (Stage 3's search), with a match on the other side of another work marked as a possible conflict.

### 3. Date rules
- A **date rule**: when a key date of one kind is set (or marked done), or the work enters a stage, make a key date of another kind so many days later (calendar days or working days), with its warning days.
- Legal: a filing deadline 14 days after a mention, limitation reminders; Construction: the end of the defects period 12 months after practical completion; and so on per industry. A date made by a rule names the rule; moving the first date moves the one made from it while that one is still open and untouched.

### 4. The common five, in depth
Legal, Construction, Software and IT, Consulting and accounting, Architecture and engineering: work templates for each kind of work, opening check questions, date rules, key date kinds, party roles, extra fields per industry, document templates (an engagement letter and one or two of the industry's own), register and inspection kinds where they belong, and the fields a stage needs before it may be entered.

### 5. The niche eight and the basic two
Food and catering, Photography and film, Marketing and creative, Interiors and fit-out, NGO programmes and grants, Events, Fashion, Healthcare; General projects, Jobs and field service: the same, lighter. **Healthcare** starts every piece of work confidential (a setting on each kind of work, which any industry can use) and its clinical fields are sensitive (Stage 1: only for `projects.fields.sensitive`, and lockable).

## What changes outside Projects

Nothing.

## Data

### Script `268_projects_industry.sql` (Projects, adds only)

| Table | Holds |
|---|---|
| `project_type_settings` | Per kind of work: confidential to start with, opening check required |
| `project_work_templates`, `project_template_items` | Work templates and their phases, tasks and key dates |
| `project_opening_questions`, `project_opening_checks` | Opening check questions; a work's answers, signer and time |
| `project_date_rules` | Date rules |

And the starter content for all fifteen industries, as rows in these tables and in the Stage 1 to 10 ones (key date kinds, party roles, fields, document templates, register and inspection kinds).

## Builds

| Build | Contents |
|---|---|
| 11.1 | Script 268, work templates: made in Configuration, applied when a work starts or later |
| 11.2 | The opening check, with the search for who else is involved |
| 11.3 | Date rules |
| 11.4 | Starter content for the common five |
| 11.5 | Starter content for the niche eight and the basic two; confidential to start with |

Every build runs the Projects tests and the Projects browser checks.

## Four choices (taken as recommended; say if any should change)

1. **Starter content** is ordinary company data: changeable and removable, never overwritten by a later script. The other way: locked "system" content that can only be switched off.
2. **Work templates** are chosen when a work starts (one default per kind of work) and can be applied later to add what is missing. The other way: copy everything from an existing piece of work.
3. **The opening check** can be required before a work leaves its first stage, set per kind of work; on for Legal and Healthcare to start with. The other way: advice only, never blocking.
4. **KPIs per industry** arrive with Stage 12, together with the engine that works them out; this stage seeds none. The other way: seed KPI names now, with no figures until Stage 12.

## As built

### To run

1. `backend/database/sql/268_projects_industry.sql` (after 267). Seven tables, then the starter content for the fifteen industries. Adds only.
2. No permission seed.

### 11.1 Work templates (done)

Screen: `docs/screens/projects-work-templates.png`.

- **Configuration → Kinds of work and stages → How work starts** (`projects.config.stages` to change): choose a kind of work; set whether new work of that kind **starts confidential** and whether **the opening check must pass** before it leaves its first stage (11.2 uses it); and its **work templates**: lines that are a phase (under another phase, to any depth), a task (under a phase, due so many days after the start, an estimate in minutes) or a key date (its kind, so many days after the start, warning days). One template per kind of work is "the usual one". Lines are checked (a line under a phase that is not above it, an unknown kind of date, two lines with one name are refused).
- **Starting a piece of work:** "Start from" offers the kind of work's templates with the usual one chosen, or "Nothing: start empty". The phases, tasks and key dates are made from the work's start date (today when it has none), the key dates with the lead as responsible and on the calendar. This is part of starting the work, so it needs no more than that.
- **Starting confidential:** a kind of work set so starts every new piece of work confidential, even when whoever starts it may not make work confidential themselves; the form says so, and the log notes it.
- **On a running work** (Work tab): "Add from a template…" adds only what is not there yet (a phase of the same name in the same place, a task or key date of the same title), and says what it added. Needs `projects.tasks`.
- **Also:** the Projects check (`node scripts/check-projects-theme.mjs`) now refuses two Projects API calls with one name, after it happened a second time here (a new call had the same name as a Stage 9 one).
- **Routes:** `GET /projects/configuration/types/{type}/templates`; `POST /projects/configuration/work-templates`, `PUT …/work-templates/{template}`; `PUT /projects/configuration/types/{type}/settings`; `GET /projects/{project}/work-templates`, `POST …/work-templates/{template}/apply`.
- **Tests:** `tests/Feature/ProjectsWorkTemplatesTest.php` (3). Browser check `e2e/projects-industry-ui.mjs` (8 checks).

### 11.2 The opening check (done)

Screen: `docs/screens/projects-opening-check.png`.

- **Questions** (Configuration → Kinds of work and stages, `projects.config.stages` to change): for a whole industry or one kind of work; each "must be yes" or only for the record; stopped and asked again. The check is named in the industry's words ("Conflict check", "Site survey", "Approval to start"…).
- **On the work** (Overview, `projects.edit` to answer): each question yes or no, with a note; **signed with a typed name**, kept with the time. It passes when every "must be yes" question is yes. A signed check keeps the questions it was signed with, even if the questions change later. "Do it again" (with a reason, logged) keeps the answers and takes the signature away.
- **Required before moving on:** on a kind of work set to require it (11.1), the work cannot leave its first stage until the check has passed; the refusal says which (not done, or did not pass). Without the setting it is advice only.
- **Who else is involved:** the client and every party on the work, each searched against the clients, contacts, parties and leads already known (Stage 3's search). A party who is already a client, or the client found as a party on other work, is marked **possible conflict**.
- **Routes:** `GET`, `PUT /projects/{project}/opening-check`; `POST …/opening-check/sign`, `…/opening-check/redo`; `GET`, `POST /projects/configuration/opening-questions`, `PUT …/opening-questions/{question}`.
- **Tests:** `tests/Feature/ProjectsOpeningCheckTest.php` (3). Browser check `e2e/projects-industry-ui.mjs` (now 13 checks).

### 11.3 Date rules (done)

- **Configuration → Kinds of work and stages → Date rules** (`projects.config.stages` to change), per industry: when **a key date of a kind is set**, or **is marked done**, or **the work enters a stage**, make a key date (its title and kind) so many days later, in calendar days or **working days** (Monday to Friday), with its warning days. A rule cannot make a date of the kind that starts it. Rules can be switched off.
- **What happens:** the date is made on the work with the lead responsible, on the calendar, and logged ("made by rule"). The key dates list says "made by the rule …". A date is made once from each date (and once per work for a stage). A made date can start a rule of its own, up to five steps.
- **Moving:** moving a date moves the open dates made from it (and what was made from those), noting "Moved with …". A made date that someone moves or changes by hand stops following.
- Dates made by a work template (11.1) start rules too.
- **Routes:** `GET`, `POST /projects/configuration/date-rules`, `PUT …/date-rules/{rule}`.
- **Tests:** `tests/Feature/ProjectsDateRulesTest.php` (3). Browser check `e2e/projects-industry-ui.mjs` (now 14 checks).

### 11.4 The common five (done)

Script 268 now carries the starter content for Legal, Construction, Software and IT, Consulting and accounting, and Architecture and engineering. All of it is ordinary company data (choice 1): change it, switch it off or remove it in Configuration; running the script again adds only what is missing.

| | Legal | Construction | Software and IT | Consulting and accounting | Architecture and engineering |
|---|---|---|---|---|---|
| Work templates (the usual one for each kind of work) | Civil suit, Sale or purchase, Transaction, Legal opinion | Building, Road or civil works, Renovation | Build in sprints, Implementation, Monthly support | Statutory audit, Tax compliance, Advisory assignment | Full design service, Engineering design, Supervision of works |
| Opening check | Conflict, KYC, engagement letter (must be yes); retainer (for the record). **Required** on every kind | Site handed over, drawings, insurance, permits | Scope agreed, product owner, access, data protection | Independence, KYC, engagement letter; previous accountant. **Required** on Audit | Brief, site survey, fee accepted; land ownership |
| Date rules | Defence due 15 days after service; notice of appeal 14 days after judgment; submissions 21 days after directions | End of defects period 365 days after entering Practical completion; first valuation 30 days after commencement; final account 90 days after the defects period ends | End of warranty support 90 days after go-live; UAT sign-off 10 working days after UAT | Tax return 180 days after year end; report 21 days after fieldwork | Approval expected 30 working days after submission |
| New key date kinds | Service of papers, directions hearing, completion | Commencement, valuation, final account | Kick-off, sprint review, UAT, go-live, end of support | Client year end, fieldwork, report due, tax filing due | Approval submission, approval expected, tender return, site visit |
| Extra fields | Case number, court, judge, fee basis, title number | Site address, plot/LR number, form of contract, defects months, NCA number | Repository, environments, way of working, product owner | Year end, client's tax PIN (sensitive), engagement, partner | Site, floor area, approval reference, use |
| Documents | Engagement letter, letter to the court | Letter of award, practical completion notice | Statement of work, go-live sign-off | Engagement letter, management representation letter | Fee proposal letter, site instruction |
| Inspections and registers | | Before a concrete pour, handover inspection, weekly safety walk | Release register | | Supervision visit, approvals register |
| A stage needs | Pleadings: the client and the case number | Mobilisation: the client and the site address | Build: the client | Fieldwork: the client and the year end | Concept: the client and the site |

The "a stage needs" lines are filled only where the company has not set anything for that stage. No amounts anywhere (rule 3). **Tests:** `tests/Feature/ProjectsIndustryContentTest.php` (2): every template, rule, question and document refers to things that exist, and a Litigation matter starts with its template, its conflict check required and its defence date made from service.

### 11.5 The niche eight and the basic two (done)

The same kinds of starter content, lighter, for Food and catering, Photography and film, Marketing and creative, Interiors and fit-out, NGO programmes and grants, Events, Fashion and Healthcare, and the two basic industries.

| Industry | Work templates | Opening check | Date rules | Also |
|---|---|---|---|---|
| Food and catering | Function, Contract start-up | Menu, allergies, venue access; deposit | Final numbers due on the function day (warned 7 and 3 days before) | Guests, venue, service style, dietary needs; function confirmation |
| Photography and film | Shoot, Film | Brief and shot list, releases, usage rights | Edited delivery 14 days after the shoot is done | Location, deliverables, usage rights; booking confirmation, model release |
| Marketing and creative | Campaign, Monthly retainer, Brand identity | Brief signed off, approver named; brand assets | Campaign report 30 days after launch | Channels, audience, objective; creative brief |
| Interiors and fit-out | Fit-out, Design | Site measured, landlord's approval, design agreed | End of defects period 180 days after entering Handover | Address, area, style; fit-out handover inspection; design proposal letter |
| NGO programmes and grants | Grant programme, Core programme | Grant agreement, partner due diligence, safeguarding; baseline | First donor report 90 days after entering Implementation; final evaluation on the grant end date | Donor, grant reference, beneficiaries, counties; partner letter |
| Events | Private event, Corporate event, Wedding | Venue and date held, scope agreed; insurance | RSVP deadline on the event day (warned 21 and 14 days before) | Venue, guests, theme; event confirmation, run of show |
| Fashion | Bespoke, Collection, Production run | Design signed off, measurements, fabric | Ready for collection 7 days after a fitting | Measurements date, fabric, quantity; order confirmation |
| **Healthcare** | Treatment plan, Home care | Consent, eligibility, allergies; next of kin. **Required** | First care review 14 days after entering Active care; next appointment 28 days after a review | **Every kind of work starts confidential**; diagnosis, allergies, next of kin and cover number are **sensitive fields**; consent form; Active care needs the patient and allergies |
| General projects | Simple project, Internal project (offered, **never chosen for you**: a general project starts empty unless a template is picked) | Scope agreed; sponsor | | Sponsor; project confirmation letter |
| Jobs and field service | Installation, Repair, Maintenance visit | Access, site safe; parts | Next service due 180 days after a visit is done | Address, equipment, serial number; job completion check; job report; On site needs the client and address |

Healthcare's clinical notes: the daily record is named "Clinical note" for healthcare (Stage 1 names), and its sensitive fields are behind `projects.fields.sensitive` and can be locked (Stage 2 locked area "sensitive fields"), so they stay with those allowed.

- **Tests:** `tests/Feature/ProjectsIndustryContentTest.php` (now 3): a care plan starts confidential with its consent check required and its clinical fields sensitive; every industry has templates; every kind of work outside General projects has a usual one. Earlier tests that check exact sets (fields, lists, templates, the opening check on legal work) now take away the starter content they do not test.

### To check by hand once script 268 is run

1. Start a Litigation matter: its phases, tasks and the first mention are there; the Conflict check is on the Overview; moving it to Pleadings is refused until the check passes; add a party with the name of an existing client and see "possible conflict".
2. Sign the check; add a key date of kind "Service of papers" and see "Defence due" 15 days later, "made by the rule"; move the service date and see the defence date follow.
3. Configuration → Kinds of work and stages: look at How work starts, the Conflict check questions and the Date rules; change a template, then add from it on a running matter (only what is missing is added).
4. Start a Healthcare care plan as someone without the confidential permission: it starts confidential; the clinical fields show only to those allowed.
5. Start a General project: it starts empty; pick "Simple project" in "Start from" on the next one.
6. Files → Make a document on a legal matter: the Engagement letter and Letter to the court are offered.
