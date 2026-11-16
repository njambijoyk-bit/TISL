# Projects Stage 3: Relationships (DESIGN, nothing built yet)

Status: DESIGN, shared with the owner on 2026-11-16. Waiting for the owner's "build". Nothing in this document is built.

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
