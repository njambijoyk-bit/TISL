# Projects Stage 3: Relationships (being built)

Status: the owner said "build" on 2026-11-16, accepting the four choices at the end. What is built so far is listed under "As built"; everything else is still design.

Stages 1 and 2 built the work and who may touch it. Stage 3 builds the people the work is for.

## The path

Lead (lives only in Projects) → Opportunity (moves along the pipeline) → Won (the lead becomes a customer, which is the account and Books ledger TISL already has; its contacts and history move with it) → Project (started from the opportunity, linked to the client) → Client page.

## In this stage

1. **Leads.** A person or company not yet a client: source (a managed list; a referral names the referring client), owner, status (new, working, won, lost), why lost (a managed list). Lost leads stay searchable. Seen by the owner and by anyone with `projects.leads.view`.
2. **Opportunities and pipeline.** A possible piece of work for a lead or an existing client: kind of work, stage, expected date, owner. Board and list. Stages are rows (rename, add, reorder); Won and Lost are fixed ends. A Books quotation can be linked; its total is the opportunity's value.
3. **Winning.** Moving to Won makes the lead a customer if it is not one, and offers to start the project now or later.
4. **Contacts.** People under a client, a lead or a party, with one or more roles from a managed list and one main contact. A contact can be put on a project.
5. **Other parties.** Anyone on a project who is neither the client nor staff, with a role on that project from a managed list that follows the industry. One party record is reused across projects. A new Parties tab on the project.
6. **Duplicate and both-sides warning.** Adding a lead, client contact or party checks the others by name, phone and email and warns. For Legal this is the start of the conflict check; the full opening check is stage 11.
7. **History.** One interaction log (call, meeting, visit, note) against a lead, client, contact or party, optionally about a project. Entries can be team-only. Entries about a confidential project are seen only by people on it.
8. **Follow-ups.** A next action with a date and an owner on every lead, client and opportunity. A My follow-ups page. Marking one done asks what happened (which writes the history entry) and what is next. A daily reminder through the Core notifier.
9. **Client page.** Account manager, client since, source, balance owed (read from the Books ledger), contacts, projects, opportunities, history, next action, flags, health.
10. **Health.** Green, amber or red from four rules with tunable numbers: days since last contact, a late next action, open flags, an overdue balance from Books. The page always says why.
11. **Flags.** From a managed list, with reason, who and when; set and removed with `projects.flags`, logged; shown wherever the client is picked.
12. **Directory.** Yellow pages (organisations by trade, a managed list) and white pages (people by name) as a view over customers, contacts, parties, vendors and employees. Phone and email masked until revealed by someone with `projects.directory.contacts`; each reveal logged; many reveals in a short time is a fifth security signal. Each entry has a visibility: staff only, clients who share a project with that person, or public. Changing it needs `projects.directory.visibility`, making one public needs `projects.directory.publish`, and Configuration can switch levels off. Staff entries need `projects.directory.staff`.

## Waits for a later stage

- Sending messages and planning meetings from a relationship (stage 6).
- What a client sees of the directory, and the public page (stage 9).
- Onboarding checklists (stage 8); scorecards (stage 12).
- Money on the client page beyond the balance owed (stage 4).

## Permissions (all added to the catalogue in Stage 1; nothing to seed)

`projects.leads.view`, `projects.leads.manage`, `projects.pipeline`, `projects.clients.view`, `projects.clients.manage`, `projects.clients.export`, `projects.health.view`, `projects.flags`, `projects.interactions`, `projects.parties`, `projects.directory.yellow`, `.white`, `.contacts`, `.staff`, `.manage`, `.visibility`, `.publish`, `.export`.

## Data: script `259_projects_relationships.sql` (adds only)

| Table | Holds |
|---|---|
| `project_leads` | A person or company not yet a client: source, owner, status, why lost, the customer it became |
| `project_pipeline_stages` | The columns of the pipeline |
| `project_opportunities` | A possible piece of work for a lead or a client: stage, expected date, the project it became |
| `project_contacts` | People under a client, a lead or a party |
| `project_parties`, `project_party_links` | Other parties, and their role on each project |
| `project_interactions` | The history |
| `project_follow_ups` | The next action on a lead, client or opportunity |
| `project_client_flags` | Flags on a client |
| `project_lists` | The managed lists: sources, lost reasons, contact roles, party roles, flags, trades |
| `project_directory` | For each entry: its trades and its visibility |

Three columns are added to `customers`: account manager, the lead it came from, client since.

## Builds

| Build | Contents |
|---|---|
| 3.1 | Script 259, the managed lists in Configuration, leads, the duplicate warning |
| 3.2 | Opportunities, the pipeline board, stages in Configuration, linking a Books quotation, Won |
| 3.3 | Contacts under clients and leads; parties and their roles; the Parties tab |
| 3.4 | The interaction log, next actions, My follow-ups, the daily reminder |
| 3.5 | The client page, health and its settings, flags, the client list and export |
| 3.6 | The directory: trades, masked details and reveals, visibility levels and their settings |

## Choices made for the owner (to confirm)

1. An opportunity can carry an estimate before there is a quotation. It is a guess, never reaches Books, and is replaced by the linked quotation's total. The alternative is no figure until a quotation is linked.
2. A lead stays out of the customers table until won.
3. Client and public views of the directory wait for stage 9; visibility is recorded now.
4. Health is three colours from four rules, each with a number that can be changed. No scores until stage 12.

## As built

### To run

1. `backend/database/sql/259_projects_relationships.sql` (after 257 and 258). Twelve tables (one more than the design: `project_contact_links`, for a client's contact on a project), 70 starter list rows, 6 pipeline stages, and three columns on `customers`. It adds only.
2. No permission seed: the permissions came with script 257.

Until 259 has run, `ProjectsSetup::relationships()` is false and the Stage 3 screens say so; Stages 1 and 2 are untouched.

### 3.1 Script 259, the lists, and leads (done)

Screens: `docs/screens/projects-leads.png`, `projects-lead-new.png`, `projects-lists.png`.

- **Script 259** makes every Stage 3 table at once, so there is one script for the whole stage.
- **Services:** `ProjectLists`, `ProjectLeads`, `ProjectDuplicates`. **Controller:** `RelationshipController`.
- **Lists** (Configuration, new Lists tab; changed with `projects.config.manage`): sources, lost reasons, contact roles, party roles (each for one industry or all), flags (each shown as one of the four named statuses, never a colour), trades. Add, rename, reorder, switch off. A row is never deleted: what already uses it keeps its name, and it is simply no longer offered.
- **Leads** (`/admin/projects/leads`, in the Projects menu): name, who to talk to, email, phone, source, the client who referred them, industry, owner, notes. A lead is not a row of `customers`.
- **Who sees a lead:** its owner, and anyone with `projects.leads.view`. Changing needs `projects.leads.manage` and being able to see it. A lead someone may not see answers "not found". An owner must be someone who can work leads; handing one over moves it out of the old owner's list.
- **Status:** new, working, lost (with a reason from the list and a few words), and back to working. Won is not a button here: winning makes a client, which is build 3.2. The list starts on open leads; lost and won stay findable.
- **"You may already know them":** while a lead is typed, leads, clients, contacts and other parties with the same name, email or phone are listed with what each is. It warns and never stops anyone. Phone numbers are stored as digits, so the same number matches with or without spaces or the country code.
- **Routes:** `GET /leads`, `GET /leads/options`, `GET /leads/{lead}`, `POST /leads`, `PUT /leads/{lead}`, `GET /known`, `GET /configuration/lists`, `POST /configuration/lists/{list}`, `PUT /configuration/lists/{list}/{row}`.
- **Tests:** `tests/Feature/ProjectsLeadsTest.php` (6); `frontend/e2e/projects-leads-ui.mjs` (22 checks in a real browser).
- **Not yet:** deleting a lead and the trash for leads; the next action on a lead (3.4); its contacts (3.3) and history (3.4).

### 3.2 Pipeline and winning (done)

Screens: `docs/screens/projects-pipeline.png`, `projects-pipeline-win.png`.

- **Services:** `ProjectPipeline`, `ProjectWins`, `ClientMaker`. **Controller:** `PipelineController`.
- **Opportunity:** what the work is, who it is for (a lead or a client, never both, and it does not change), kind of work, owner, expected date, notes. Seen by its owner and by anyone with `projects.leads.view`; changed with `projects.pipeline`. Adding one to a new lead marks the lead as being worked.
- **What it is worth:** the total of the Books quotation linked to it, read from the books every time it is shown (a changed quotation changes the card). Before there is a quotation it can carry an estimate with a currency; the form says it is a guess that is never posted. Someone who may not see the books is told a quotation is linked, not what it says.
- **The board** (`/admin/projects/pipeline`, in the Projects menu): a column per stage, cards with who it is for, value, next action or expected date. A column's total is per currency and says when it includes estimates. Won and Lost show the last 30 days.
- **Moving:** to any open stage from the opportunity's panel. Lost needs a reason from the list, and a lost one can be brought back. Won is not a stage one moves to.
- **Winning:** if it is for a lead, the lead becomes a customer through `ClientMaker`, which creates it with the Customer model exactly as the rest of TISL does (number, account currency, and so the account and Books ledger). A company with a named person becomes that company with that person's name; a lead that is a person becomes a person. The lead's contacts, history, next actions and other opportunities move to the client; the account manager is the lead's owner. Needs `projects.clients.manage`. A second win for the same client makes no second customer.
- **Starting the work:** at the win or later, with `projects.create`. The project is created through the normal Stage 1 path (number, cost centre, people), tied to the client, with the opportunity's notes as its description; the linked quotation is attached to it so the project shows the agreed figure from the books. All of a win happens or none of it.
- **A lead can be made a client with no opportunity** from its page.
- **Stages** (Configuration, new Pipeline tab, `projects.config.manage`): add (lands just before Won), rename, reorder, switch off. Won and Lost stay the ends. A stage with opportunities at it cannot be switched off.
- **Routes:** `GET /pipeline`, `/pipeline/options`, `/pipeline/quotations`, `/pipeline/of/{lead|client}/{id}`; `GET`, `POST`, `PUT /opportunities`; `POST /opportunities/{id}/win`, `/opportunities/{id}/project`; `POST /leads/{lead}/client`; `GET`, `POST`, `PUT /configuration/pipeline`.
- **Tests:** `tests/Feature/ProjectsPipelineTest.php` (7); `frontend/e2e/projects-pipeline-ui.mjs` (24 checks in a real browser).
- **Not tested here:** the real customer creation. The tests stand in for `ClientMaker` with a plain row, because the test database has no currency tables; the real path calls `Customer::create()`. Win one lead by hand after running the script and check the new customer in Books.
- **Not yet:** dragging cards between columns (moving is by the stage list on the card's panel); deleting an opportunity; a list view of the pipeline.

### 3.3 Contacts and other parties (done)

Screens: `docs/screens/projects-contacts.png`, `projects-parties.png`.

- **Services:** `ProjectContacts`, `ProjectParties`.
- **Contacts** under a client, a lead or a party: name, job title, email, phone, what they are there for (several, from the managed list), one main contact. The first one added is main; making another main takes it from the first; removing the main one makes another main, so there is always one while there is anyone. Who may see and change them follows what they belong to: a client's with `projects.clients.view` / `projects.clients.manage`, a lead's with seeing the lead / `projects.leads.manage`, a party's with `projects.parties`. Refusals are logged. Contacts show on the lead page now; the client page (3.5) shows a client's.
- **Parties tab** on every piece of work, readable by anyone who can open it. Two parts:
  - **Client contacts on this:** the client's own people to call for this piece of work, with what for. Removing a contact takes it off every piece of work.
  - **Other parties:** anyone who is neither the client nor staff, each in a role on this piece of work. Roles offered are this industry's plus those for every industry. One party record is reused across pieces of work: typing a name finds known ones, and picking one puts it on by its record. A party can have its own contacts, and one can be named as who to talk to on this piece of work. Taking a party off does not delete the party.
- **Both sides:** a party that is also a lead or a client carries a warning on its row ("Also a client", "A lead, owned by Njeri"). Adding a new party shows the "already known" warning as it is typed.
- **Changing parties** asks both questions: `projects.parties`, and a project role that manages links (the new ability `parties` uses the role's `links`).
- **Routes:** `GET`, `POST /contacts/{customer|lead|party}/{id}`; `PUT`, `DELETE /contacts/{contact}`; `GET /parties`; `GET`, `POST /{project}/parties`; `DELETE /{project}/parties/{link}`; `POST /{project}/party-contacts`; `DELETE /{project}/party-contacts/{link}`.
- **Tests:** `tests/Feature/ProjectsContactsPartiesTest.php` (6); `frontend/e2e/projects-parties-ui.mjs` (17 checks in a real browser).
- **Not yet:** editing a party's own details after it is added (it is shown, and found by name, but changed only through its contacts); a shortcut key for the Parties tab.
