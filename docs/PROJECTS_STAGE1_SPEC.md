# Projects rebuild, Stage 1: Foundation (SPEC, not built)

Part of `docs/PROJECTS_CRM_PLAN.md`. Written 2026-11-14. Nothing here is built.

## Scope

In: remove the old Projects code, tables and data; fifteen industries and the names table; configuration page (industry, names, personal naming, types, stages, fields, project roles, number series, shortcuts, trash keeping, history and roll back); create, list, open, edit, move stage, close, freeze; a Books cost centre per project and per phase that asks for one; phases to any depth; members with project roles; confidential projects; the full permission catalogue; add-only log; trash, restore, purge; link registry with Books vouchers and shop orders/quotations; theme-only screens with a build check; TISL shortcut keys.

Out (own stages): hours, locked areas, supervisor approval, attack alerts (2); leads, pipeline, client page, directory (3); money tab, budgets, billing, held money (4); tasks, time, My Work (5); messages, meetings, calendar (6); other module links, people, documents, portals, site, insights (7 to 12).

Gap to accept: no tasks or messages in Projects between Stage 1 and Stages 5 and 6; no client portal (My Projects) until Stage 9.

## Rules that shape the design

- **No amounts in Projects.** The agreed value of a project is a Books Quotation or Sales Order linked to it. Extra number fields are for counts and measures, never money.
- **Stage and state are separate.** Stages are data per type. Under them are four fixed states: `open`, `on_hold`, `closed`, `cancelled`.
- **Create is all or nothing.** Project row, number, cost centre, lead membership and log line in one transaction; if Books cannot create the cost centre the project is not created.
- **Two-question check on every route.** (1) The existing `Authorizer` says the person's TISL role holds the permission. (2) The project role allows it on this project. `projects.view_all` skips (2) for reading non-confidential projects only. Confidential projects are visible only to members.
- **A stage's colour is a status token name** (`info`, `good`, `warning`, `problem`), never a colour value.
- **A project with vouchers on its cost centre cannot be purged.** It can be closed and frozen.
- **Frozen** projects reject every write until unfrozen.

## Tables (20)

Created by numbered SQL scripts run by the owner in Workbench (next free number: 256).

| Table | Holds |
|---|---|
| `project_industries` | key, name, group (common, niche, basic), sort, is_active. Seeded with 15 |
| `project_terms` | key, description. About 30 renameable things (project, scope_lines, reference, authority, place, opening_check, key_dates, progress_bill, change, daily_record, money_held, parties, closing_period, ...) |
| `project_term_names` | industry_key, term_key, name, name_plural (shipped) |
| `project_term_overrides` | industry_key, term_key, name, name_plural, changed_by, changed_at (the company's own) |
| `project_types` | industry_key, name, number_prefix, is_active, sort |
| `project_stages` | type_id, name, sort, state, required_fields (JSON of field keys), status_token |
| `project_fields` | key, label, kind (text, number, date, yes_no, pick_one, pick_many, person), options, industry_key or type_id scope, required, sensitive, sort |
| `project_field_values` | project_id, field_id, value |
| `project_series` | prefix, next_number, width |
| `projects` | number, industry_key, type_id, title, description, customer_id, lead_user_id, location_id, cost_centre_id, stage_id, state, priority, reference, authority, place, start_date, due_date, closed_at, closing_period_ends, confidential, frozen_at, frozen_by, parent_id, created_by, timestamps, deleted_at, deleted_by. **No amount columns** |
| `project_phases` | project_id, parent_id, code, name, sort, cost_centre_id (null = use parent's), start_date, due_date, state, deleted_at |
| `project_links` | project_id, module, link_type, linked_id, added_by, deleted_at |
| `project_roles` | key, name, is_system, sort |
| `project_role_permissions` | project_role_id, ability |
| `project_members` | project_id, user_id, project_role_id, status (invited, active, declined, removed), invited_by, starts_at, ends_at |
| `project_log` | project_id (nullable), actor_id, action, subject_type, subject_id, old_values, new_values, result (done, refused), reason, ip, created_at. Updates and deletes blocked in the model |
| `project_settings` | part, value |
| `project_setting_versions` | part, version, value, saved_by, saved_at |
| `project_setting_logs` | part, action, by, at (never a value) |
| `project_user_prefs` | user_id, naming_industry_key, shortcuts (JSON), pinned (JSON) |

Old tables dropped by the first script: `projects`, `project_milestones`, `project_tasks`, `project_messages`, `project_participants`, `project_links`, `project_items`, `project_activities`.

## Project roles as shipped (editable data)

| Ability on a project | Lead | Member | Finance | Reviewer | Client | Guest |
|---|---|---|---|---|---|---|
| Open it | yes | yes | yes | yes | shared parts | shared parts |
| Change details | yes | | | | | |
| Move stage, close | yes | | | | | |
| Add and change phases | yes | yes | | | | |
| Invite and remove people | yes | | | | | |
| Add and remove links | yes | yes | yes | | | |
| Read the activity log | yes | | | yes | | |

## Permission catalogue (98; catalogue version 26)

S = sensitive. O = owner only by default. The stage is when the permission first does something. `projects.manage` and `projects.moderate` are retired; `bulkimport.projects` stays.

| Key | Label | Flags | Stage |
|---|---|---|---|
| `projects.use` | Open Projects and work on the projects you are on | | 1 |
| `projects.view_all` | See every project that is not confidential | | 1 |
| `projects.create` | Start a project | | 1 |
| `projects.edit` | Change a project's details | | 1 |
| `projects.stage` | Move a project from stage to stage | | 1 |
| `projects.close` | Close and reopen a project | | 1 |
| `projects.freeze` | Freeze a finished project, and unfreeze it | S | 1 |
| `projects.delete` | Put things in the trash and take them back out | S | 1 |
| `projects.purge` | Delete from the trash for good | S O | 1 |
| `projects.transfer` | Hand a project to another lead | S | 1 |
| `projects.confidential` | Make a project confidential or open | S | 1 |
| `projects.phases` | Add and change phases | | 1 |
| `projects.fields.sensitive` | See fields marked sensitive | S | 1 |
| `projects.export` | Export project lists and details | | 1 |
| `projects.members.view` | See who can get into a project | | 1 |
| `projects.members.manage` | Invite, remove and change project roles | | 1 |
| `projects.log.view` | Read the activity log | S | 1 |
| `projects.log.export` | Export the log | S | 2 |
| `projects.guests` | Invite an outsider by link | S | 9 |
| `projects.access.rules` | Set hours, end dates and locked areas on a project | S | 2 |
| `projects.locks.reset` | Approve a locked-area password reset | S | 2 |
| `projects.approve` | Approve serious actions as a supervisor | S | 2 |
| `projects.security.view` | See security alerts raised inside Projects | S | 2 |
| `projects.config.view` | Open the configuration page | | 1 |
| `projects.config.manage` | Change settings and roll back | S | 1 |
| `projects.config.industry` | Change the default industry | S | 1 |
| `projects.config.names` | Rename fields for the company | | 1 |
| `projects.naming.personal` | Choose my own industry names for my screens | | 1 |
| `projects.config.fields` | Add and change extra fields | | 1 |
| `projects.config.stages` | Add and change types and stages | | 1 |
| `projects.config.roles` | Add and change project roles | S | 1 |
| `projects.shortcuts` | Change the company's shortcut keys | | 1 |
| `projects.config.actions` | Decide which actions are serious and what they need | S | 2 |
| `projects.links` | Attach and remove records from other modules | | 1 |
| `projects.leads.view` | See leads | | 3 |
| `projects.leads.manage` | Add, change and convert leads | | 3 |
| `projects.pipeline` | Work the pipeline of opportunities | | 3 |
| `projects.clients.view` | Open client pages | | 3 |
| `projects.clients.manage` | Change contacts, roles and account manager | | 3 |
| `projects.parties` | Add and change other parties | | 3 |
| `projects.interactions` | Log calls, visits and notes | | 3 |
| `projects.health.view` | See relationship health and worth | | 3 |
| `projects.flags` | Put a flag on a client and remove it | S | 3 |
| `projects.clients.export` | Export clients and contacts | S | 3 |
| `projects.directory.yellow` | Open the yellow pages | | 3 |
| `projects.directory.white` | Open the white pages | | 3 |
| `projects.directory.contacts` | Reveal phone numbers and emails | S | 3 |
| `projects.directory.staff` | See staff details | S | 3 |
| `projects.directory.manage` | Add and change entries, categories and trades | | 3 |
| `projects.directory.visibility` | Set who can see an entry | S | 3 |
| `projects.directory.publish` | Make an entry public | S | 3 |
| `projects.directory.export` | Export the directory | S | 3 |
| `projects.money.view` | See a project's money | | 4 |
| `projects.money.budget` | Set and change a project budget | | 4 |
| `projects.money.bill` | Raise bills from a project | | 4 |
| `projects.money.disbursements` | Record costs paid for a client | | 4 |
| `projects.money.rates` | Set rates for people and projects | S | 4 |
| `projects.money.writeoff` | Write off time or costs | S | 4 |
| `projects.money.retention` | Release retention | S | 4 |
| `projects.money.held.view` | See money held for clients | S | 4 |
| `projects.money.held.pay` | Pay out of money held for a client | S | 4 |
| `projects.ledgers.create` | Create a ledger in Books from a project | S | 4 |
| `projects.ledgers.bank` | Create a bank ledger in Books from a project | S O | 4 |
| `projects.tasks` | Create and assign tasks | | 5 |
| `projects.scope` | Change scope lines | | 5 |
| `projects.dates` | Add and change key dates | | 5 |
| `projects.changes` | Raise a change | | 5 |
| `projects.changes.approve` | Approve a change | S | 5 |
| `projects.time.log` | Log my time | | 5 |
| `projects.time.approve` | Approve timesheets | | 5 |
| `projects.time.others` | Change other people's time | S | 5 |
| `projects.capacity` | See team load and plan people | | 5 |
| `projects.daily` | Write the daily record | | 5 |
| `projects.materials` | Request and issue materials | | 10 |
| `projects.plant` | Assign plant and equipment and record hours | | 10 |
| `projects.subcontracts` | Manage subcontracts and their bills | S | 10 |
| `projects.inspections` | Run inspections and snag lists | | 10 |
| `projects.messages.client` | Message clients on a project | | 6 |
| `projects.messages.internal` | See and write team-only notes | | 6 |
| `projects.messages.moderate` | Edit or remove anyone's messages | S | 6 |
| `projects.meetings` | Plan, move and cancel meetings | | 6 |
| `projects.inbox.all` | See every conversation on projects I can open | | 6 |
| `projects.files.view` | Open project files | | 9 |
| `projects.files.manage` | Add, replace and remove files | | 9 |
| `projects.files.share` | Share a file with the client | | 9 |
| `projects.files.sign` | Ask for sign-off on a file | | 9 |
| `projects.templates` | Manage document templates | | 9 |
| `projects.team.view` | Open the team view | | 8 |
| `projects.team.manage` | Set goals, write reviews and one-to-one notes | S | 8 |
| `projects.team.checklists` | Run joining and leaving checklists | | 8 |
| `projects.casebook.report` | Report something | | 8 |
| `projects.casebook.handle` | Receive and handle reports | S | 8 |
| `projects.casebook.configure` | Set routing and hidden-name rules | S | 8 |
| `projects.casebook.identity` | Reveal a hidden name | S O | 8 |
| `projects.insights` | See scorecards for my projects | | 12 |
| `projects.insights.team` | See scorecards for people | S | 12 |
| `projects.kpis` | Set KPIs and targets | | 12 |
| `projects.rules` | Create automatic rules | S | 12 |

## Code layout

- Backend: `app/Models/Projects`, `app/Services/Projects`, `app/Http/Controllers/Api/Projects` (as Events does). One `ProjectAccess` service wraps the `Authorizer` and the project role; one `ProjectNames` service serves screens, exports and messages.
- Frontend: `frontend/src/projects` rebuilt from empty on the shared components (`Button`, `Card`, `Badge`, `Modal`, `PageHeader`, `SectionTabs`, `ViewToggle`, `EmptyState`). Buttons named the standard way so F2, F3, F7, F8, F9, F12 work through `pageHotkeys.js`.
- Build check: a test fails on a colour value or font name inside `frontend/src/projects`.
- Tests beside the existing ones; `AdminRoutesNeedAPermissionTest` must keep passing.

## What the removal touches outside Projects

| Place | Change |
|---|---|
| `Services/Calendar/CalendarService.php` | Stop reading old tasks, milestones, participants; show new project due dates. Tasks and key dates return in Stage 5 |
| `ChatController.php`, `Services/AiAnalyticsService.php` | Point at the new project record; task figures return in Stage 5 |
| `Services/ActivityFeedService.php` | Read `project_log` |
| `Services/Books/BudgetService.php` | `budget_initiatives.project_id` kept; links to old projects cleared by the drop script |
| `Services/Backup/ModuleTables.php` | Replace the 8 old tables with the 20 new |
| `Services/Access/Catalog.php` | Version 26: 98 project permissions |
| `Providers/AuthServiceProvider.php`, `Controllers/Api/Traits/ResolvesTaskRelations.php`, `routes/api.php` | Old policy, trait and routes removed; new routes added |
| Frontend: `App.jsx`, `adminNav.js`, `Header.jsx`, `CustomerLayout.jsx`, `pwa/Portal.jsx`, `store/index.js`, `store/projectStore.js`, `api/projects.js`, `useAiContextDetector.js`, `Settings.jsx` | Staff links to the new pages; My Projects hidden until Stage 9 |

## Builds

| No. | Build |
|---|---|
| 1.1 | Remove old code; drop script; create script with seeds (industries, terms, names, starter types, stages, project roles); catalogue 26 |
| 1.2 | Naming service; configuration page with versions and roll back; default industry; company renames; personal naming |
| 1.3 | Project record: create, list, open, edit, stage, close, freeze, number series, cost centre in Books |
| 1.4 | Phases with optional cost centres |
| 1.5 | Project roles, members, confidential projects, the two-question check on every route |
| 1.6 | Log with refusals, activity tab, trash, restore, purge, clean-up after the keeping period |
| 1.7 | Link registry; Books vouchers and shop orders/quotations |
| 1.8 | Types, stages and fields configuration; extra fields on the form; sensitive fields |
| 1.9 | Shortcut keys; colour and font build check; calendar, Mimi, activity feed, backup map and menus pointed at the new module |

## To confirm before building

1. The owner runs the two database scripts; the first deletes all current project data for good. Take a backup first.
2. Agreed value is a linked Books quotation or sales order, not a column on the project.
3. The gap in tasks, messages and the client portal described under Scope is acceptable.
