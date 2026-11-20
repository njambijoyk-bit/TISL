# Projects: CRM, work and money for any industry (PLAN, decided; nothing built yet)

Status: PLAN. Agreed with the owner on 2026-11-14. This is a **rebuild**: the current Projects screens, tables and data are replaced. Nothing in this document is built.

## The rule set (decided)

1. **One engine, fifteen industries.** The database is built once, sized for the industry that needs the most. Every industry has every field and feature; an industry only changes **what a thing is called** and what shows by default. No per-industry tables.
2. **Money is always Books.** Projects never stores an amount. Every figure on a project screen is read from vouchers in the double-entry engine.
3. **A project is a cost centre.** Created with the project; children to any depth (phase, section, item).
4. **The customer record stays the account and the Books ledger.** Projects adds columns to it and contacts under it. One identity across the system.
5. **Nothing hardcoded.** Roles, project roles, hours, locks, serious-action rules, industry names, shortcut keys, casebook routing and directory visibility are data. Only permission names live in code (in the catalogue), as in every module.
6. **No colour or font in code.** Screens use the selected theme's tokens and its heading and body fonts. A build check fails on a colour code or font name inside the Projects folder.
7. **Messages leave through the Core Notifier.** Projects contains no mail or WhatsApp code.
8. **Old data is deleted.** Old finance tab, items ledger, tasks, milestones, members, messages and their tables go; nothing is carried over. Dropped by a numbered SQL script, not a migration.

## What exists today (checked in the code)

| Piece | State |
|---|---|
| Projects module | 8 models, 8 controllers, 31 frontend files. Statuses planning, active, on_hold, completed, cancelled. Tasks, milestones with client approval, messages (customer, admin, internal), participants with rights, links to quotes and orders, items ledger and Finance tab outside Books. 5 permissions (`projects.use`, `.manage`, `.moderate`, `.delete`, `.purge`). **All replaced.** |
| Cost centres | `cost_centres` nested to any depth with a `purpose` label; on every voucher and entry (scripts 100 to 102). `ProfitLossByCostCentreReport`. Projects are not linked. |
| Budgets | `BudgetService`, budget against actual, commitments, control. `budget_initiatives.project_id` exists. |
| Payroll | `employee_cost_centres` (kind `project`, share, dates) splits pay. |
| Customers | Shopper-shaped: one person, `company_name`, totals, tier, credit, `assigned_sales_rep`. No contacts, leads or interaction log. |
| Access engine | Clearance 0 to 6, roles as data, permission catalogue (`Services/Access/Catalog.php`), working hours and IP limits on a role, time-limited grants, `Authorizer`, `AccessLog`. |
| Security | Step-up and Council of Two (`Services/Security/StepUp`), `RiskGate`, `RateLimits`, `SecurityEvents`, `SecurityAlerts`, sessions, known devices. |
| Calendar | `CalendarEntry` + `CalendarService` (tasks, milestones, bookings, tickets), ICS feed, `AvailabilityService` for one resource. No meeting kind. |
| Notifications | `Services/Notify/Notifier`, `ChannelResolver`, email settings on a screen, WhatsApp via Meta and Twilio, tap-to-send list, delivery log, types, customer preferences. Staff have no personal preferences. Webhooks receive statuses. |
| Shortcuts | `KeyboardShortcuts.jsx`, `pageHotkeys.js` (F2, F3, F7, F8, F9, F12, Ctrl+S, Esc, /), `CommandPalette.jsx` (Ctrl+K), G-then-letter in Menus, Shift+A key sheet. |
| Theme | CSS tokens (`--color-primary-*`, `--surface-card`, `--line`, `--text-primary`, `--status-*`), `--font-heading`, `--font-body`. |
| Other | Vault, Employee/attendance/leave, Inventory assignments, Vendors, Tenders, Tickets, Bookings, licence manager. |

## Industries (15)

Common: Legal, Construction, Software and IT, Consulting and accounting, Architecture and engineering.
Niche: Food and catering, Photography and film, Marketing and creative, Interiors and fit-out, NGO programmes and grants, Events, Fashion, Healthcare.
Basic: General projects, Jobs and field service.

Names are rows in a table (industry, field, default name, company's own name). Sample:

| Industry | Project | Opening check | Scope lines | Progress bill | Daily record | Money held |
|---|---|---|---|---|---|---|
| Legal | Matter | Conflict check | Fee schedule | Interim fee note | File note | Client account |
| Construction | Contract | Pre-qualification | Bill of quantities | Payment certificate | Site diary | Advance and retention |
| Software and IT | Project | Discovery sign-off | Deliverables | Milestone invoice | Stand-up note | Deposit |
| Healthcare | Care plan | Consent and eligibility | Treatment plan | Interim bill | Clinical note | Patient deposit |
| Jobs and field service | Job | Site survey | Job card | Job invoice | Job report | Deposit |

Healthcare defaults to confidential projects with clinical notes in a locked area.

## Areas of the module

1. **Relationships (CRM).** Leads (kept out of Books until won), opportunities and pipeline, contacts under a customer with roles, other parties (opponents, consultants), one interaction log, next action on every relationship, lifecycle and health, client page, onboarding checklist, proposals through the Books Quotation voucher.
2. **Projects engine.** Industry and type, custom fields, phases to any depth, stages with rules, scope lines, key dates with warnings, risks and issues, change control, programmes, templates.
3. **Work and resources.** Tasks, subtasks, dependencies, board/list/timeline, timers and timesheets with approval, rates, capacity, daily record, materials, plant, subcontracts, inspections and snags.
4. **Money (through Books only).** Cost centre per project, project picker on vouchers, budgets, commitments, billing methods (fixed, staged, hourly, retainer, work-done valuation, success fee), advances, retention, held client money for every industry with an overdraw refusal, disbursements, unbilled work, profit and forecast. Ledgers, including bank ledgers, can be created from a project by permission; Books owns them.
5. **Communication.** Inbox across projects, tags, meetings with free-time search that write calendar entries for every attendee, minutes into tasks, key dates on the calendar. All sends via the Notifier. New in Core: staff channel choices, incoming replies filed into threads.
6. **Documents.** Vault folder per project, client-visible and team-only files, templates with merge fields, file requests and sign-off, registers, expiry tracking.
7. **Portals.** Client portal (progress, meetings, files, bills, pay, scorecard), subcontractor view, guest links with an end date.
8. **Insights.** KPI library with targets, project health, scorecards, pipeline forecast, utilisation.
9. **Links to modules.** A registry: each module declares what it can attach. Shown only when the module is licensed, switched on and the person may see it. E-commerce, Events, Campaigns, Tenders, Inventory, Tickets, Bookings, Courses, Memberships. Links are kept and hidden when a module is off.
10. **Access and security.** About 80 permissions in the catalogue; project roles as data; "who can get in" list per project; confidential projects; hours and end dates; locked areas with their own password and supervised reset; serious actions needing identity confirmation, a supervisor, or both; one append-only log of views, changes and refusals; trash and recovery for every record; behaviour signals feeding rate limits and alerts.
11. **People.** My Work home, team view, skills and certificates, goals and reviews, joining and leaving checklists with hand-over, casebook (harassment, difficult client, safety, pay), client flags, invite, tag, follow, transfer.
12. **Directory.** Yellow pages (organisations by trade) and white pages (people by name) as one view over customers, contacts, parties, vendors and employees. Masked contact details with logged reveals. Each entry has a visibility: staff only, clients with a shared project, or public; set by permission, limited by configuration.
13. **Configuration.** Default industry (drives screens, exports, documents), name overrides, personal naming for people with the permission (their screens only; the option is hidden otherwise), stages, fields, rates, serious actions, locked areas, casebook routing (six ways, one chosen) and hidden-name policy, directory visibility levels, shortcut keys, trash retention. Versioned with a log and roll back, like notification settings.
14. **Shortcuts and look.** Existing TISL keys by naming buttons the standard way; G-then-letter for Projects areas; Shift keys on an open project; Alt+T timer; typing shortcuts in messages (@, #, /meet, /task, /time); pins, recents, saved views. Keys are settings: company set plus each person's own. Every key checks the button's permission.

## Build order

All twelve stages are built (Stage 12 finished 2026-11-20). Each stage's spec, `docs/PROJECTS_STAGEn_SPEC.md`, has an "As built" section and the checks to do by hand; the database scripts are 256 to 269, run in order.

| Stage | Name | Size | Contents | Built |
|---|---|---|---|---|
| 1 | Foundation | Large | New project record, names table, configuration page, custom fields, phases, cost centre link, permission catalogue, project roles, action log, trash, link registry, theme-only building blocks and build check, shortcut registration. Old tables and data deleted. | Built |
| 2 | Control room | Medium | Access list, confidential projects, hours and end dates, locked areas, serious actions, log screen, attack signals. | Built |
| 3 | Relationships | Large | Leads, opportunities, pipeline, contacts, parties, interaction log, next actions, client page, health, directory. | Built |
| 4 | Money through Books | Large | Project picker on vouchers, budgets, Money tab, ledgers from a project, held money, fixed and staged billing, advances, retention. | Built |
| 5 | Work and time | Large | Tasks, scope lines, key dates, changes, views, timers, timesheets, rates, hourly billing, payroll split by timesheet, My Work. | Built |
| 6 | Messages, meetings, working together | Medium | Inbox, tags, Notifier types, staff channels, replies into threads, meetings and calendar, invitations, followers, transfer. | Built |
| 7 | Linking modules | Medium | The registry and each module's links. | Built |
| 8 | People | Medium | Team view, goals, checklists, casebook, client flags. | Built |
| 9 | Documents and portals | Medium | Vault folders, templates, registers, client portal, guest links. | Built |
| 10 | Resources and site | Large | Materials, plant, subcontracts, daily record on a phone, inspections, snags. | Built |
| 11 | Industry finish | Medium | Per industry: templates, default stages, documents, date rules, KPIs. Common, then niche, then basic. | Built |
| 12 | Insights and rules | Medium | KPIs, scorecards, forecasts, rules engine, Mimi updates. | Built |

## Next

The plan is complete. What remains is the owner's: run scripts 256 to 269, then go through each stage's checks by hand.
