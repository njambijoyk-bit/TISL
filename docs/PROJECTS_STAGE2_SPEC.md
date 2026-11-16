# Projects Stage 2: Control room (being built)

Status: the owner said "build" on 2026-11-16. What is built so far is listed under "As built" at the end; everything else is still design.

Stage 1 decided whether a person may act on a project (permission, then project role). Stage 2 adds three more questions, asked in this order after those two: time, lock, seriousness. A refusal at any step stops there, is written to `project_log`, and tells the person what to do next.

## In this stage

1. **Access tab** on every project: each person who can get in, the reason in words, what they can do, their hours, their end date, and whether they can get in this minute. For a confidential project it also shows who is kept out; for an open one, who gets in through `projects.view_all`. Extend an end date in one click. People ending within 7 days are flagged and the lead is told through the Core notifier.
2. **Hours**: three layers and the narrowest wins: the TISL role's hours (Core, exists), the project's hours, the person's hours on that project. Days with a from and to time, company time zone. A default for new projects in Configuration. Outside hours nothing opens; a switch per project can allow reading only. The refusal says the hours, when access returns and who leads the project. "Ask for one hour" sends a request to the lead; an approved pass ends by itself and is logged. The button can be switched off in Configuration.
3. **Locked areas**: a part of a project behind its own password, on top of everything else. One password per area per project, shared, stored hashed, never shown. Unlock lasts 15 minutes per person (a setting). Five wrong tries in a row mean a 15 minute wait and an alert (both settings). Areas come from a registry in code that each stage adds to; today: sensitive fields, People, Links, Activity, Phases. Configuration can lock an area by default for an industry or a kind of work. Reset: someone with `projects.access.rules` asks and says why; someone else with `projects.locks.reset` approves; the asker sets the new password; all open unlocks end; who asked and who approved is logged, never the password.
4. **Serious actions**: a table in Configuration (a versioned settings part) saying, per action, what it needs: nothing, confirm identity, a supervisor, or both; whether the supervisor must be on the project; whether a reason is required. Identity confirmation uses Core's step-up. A supervisor holds `projects.approve`, is never the asker, and must be able to open the project. The request is stored exactly as asked, lapses after 24 hours (a setting), and is re-checked when carried out. Actions selectable in Stage 2: delete for good, make a confidential project open, unfreeze, transfer, remove a member, put in the trash, export, reopen, change a project role's abilities. Later stages add theirs to the same registry.
5. **Approvals inbox** for supervisors: approve or decline with a note; approvers are told through the Core notifier.
6. **Security screen** (`projects.security.view`): signals read from the log. Five to start: many refusals, wrong lock passwords, tries outside hours, opening an unusual number of projects, repeated exports. Each has a count and a number of minutes, and can be switched off. Three responses per signal: alert only, slow down, pause access to Projects until released. A pause covers Projects only; release needs a note and is logged; an owner cannot be paused.

## Waits for a later stage

- Locks on Money, Files, Messages and clinical notes: those areas register with the lock engine when built (stages 4, 6, 9).
- Guest links (stage 9).
- Serious money actions (stage 4, same table).

## Permissions (all added to the catalogue in Stage 1; nothing to seed)

| Permission | Opens in Stage 2 |
|---|---|
| `projects.members.view` | The Access tab |
| `projects.access.rules` | Hours, extending end dates, locking areas, asking for a password reset |
| `projects.locks.reset` | Approving a password reset someone else asked for |
| `projects.approve` | The approvals inbox |
| `projects.config.actions` | The Serious actions table and the signal settings |
| `projects.security.view` | The Security screen; releasing a paused person |

New project-role ability: `access` (hours and locks on that project). Lead has it by default.

## Data: script `258_projects_control_room.sql` (adds only; deletes nothing)

| Table | Holds |
|---|---|
| `project_access` | Per project: whether reading is allowed outside its hours |
| `project_hours` | Days and times for a project, or for one person's place on it |
| `project_passes` | Short passes outside hours: who, until when, who approved |
| `project_locks` | A locked area on a project and its hashed password |
| `project_unlocks` | Who has an area open and until when; wrong tries |
| `project_approvals` | A serious action or reset waiting for a supervisor, as asked, and the answer |
| `project_security_events` | A signal that fired, the response, the review; and pauses |

Serious actions and signal settings are two new parts of `project_settings`.

## Builds

| Build | Contents |
|---|---|
| 2.1 | Script 258; the Access tab, reasons, who is kept out, extend, end-date warnings |
| 2.2 | Project hours, a person's hours, the default, the refusal, one-hour passes |
| 2.3 | Locked areas: lock, timed unlock, wrong-try limit, supervised reset, default locks |
| 2.4 | Serious actions: the table, identity confirmation through Core, approvals, the inbox |
| 2.5 | Security: signals, responses, the screen, pause and release |

## Choices made for the owner (to confirm)

1. Lock passwords are shared per area, not one per person. The log still shows which person unlocked.
2. Outside hours nothing opens, not even for reading, unless the project's switch allows reading.
3. A supervisor is never the person who asked, and owners are not exempt from serious-action rules. Owners can change the table, which is logged.
4. Out of the box every serious action is "Nothing" and every signal is "Alert only", so day one behaves like Stage 1. A suggested set can be applied in one click.

## As built

### To run

1. `backend/database/sql/258_projects_control_room.sql` (after 257). Seven tables, and the Lead project role gains the ability "Set its hours, end dates and locked areas". It adds only.
2. No permission seed: the permissions came with script 257.

Until 258 has run, Stage 1 keeps working as it is; the Access tab works too, since it reads Stage 1's tables.

### 2.1 Script 258 and the Access tab (done)

Screen: `docs/screens/projects-access.png`.

- **Script 258** makes all seven Stage 2 tables at once, so there is one script for the whole stage.
- **Service:** `ProjectAccessList`. **Controller:** `AccessController`.
- **Access tab** on an open project, for anyone who may see its people. One row per person with a place on it: the reason ("On it as Lead", "Invited as Reviewer", "Was on it as Member", "Will be on it as..."), what their project role lets them do, their end date, and whether they can get in this minute (can get in, invited, not started, ended, their TISL role no longer opens Projects, their project role is switched off).
- **The people not on it:** for an open project, who reads it because they see every project; for a confidential one, who it is hidden from. A count first, names when asked.
- **Extend:** move or remove an end date. Asks both questions: the permission `projects.access.rules` and the new project-role ability `access` (Lead has it). Someone whose place had ended is back on it at once. Logged as `member.extended` with the old and new date.
- **Ending soon:** a place ending within the warning days (7, a setting in the new `access` part of the settings) is flagged on the row and counted above the list.
- **The lead is told once** per end date through the Core notifier (new notification type "Projects: access to a project"), by the daily command `projects:access-warnings` (07:10). Moving the date makes it a new warning; 0 days switches warnings off.
- **A link can open a tab:** `/admin/projects/{id}?tab=access`.
- **Routes:** `GET /{project}/access`, `PUT /{project}/access/members/{member}`.
- **Tests:** `tests/Feature/ProjectsAccessTabTest.php` (6); `frontend/e2e/projects-access-ui.mjs` (16 checks in a real browser).
- **Not yet:** the Hours column and "outside hours" state fill in with build 2.2; "paused" with 2.5; a shortcut key for the Access tab.
