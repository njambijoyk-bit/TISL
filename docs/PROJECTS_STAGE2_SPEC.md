# Projects Stage 2: Control room (built)

Status: built on 2026-11-16 in five builds (2.1 to 2.5), each listed under "As built" at the end with what changed from this design. It needs database script 258.

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
- **Not yet:** "paused" arrives with 2.5; a shortcut key for the Access tab.

### 2.2 Hours and passes (done)

Needs script 258. Until it has run, no hours exist and nothing asks about them. Screens: `docs/screens/projects-access-hours.png`, `projects-closed.png`, `projects-access-settings.png`.

- **Service:** `ProjectHours`. The third question is asked inside `ProjectAccess::decide()`, after the permission and the project role, so every action on a project passes through it.
- **Project hours:** days, each with a time it opens and closes, on the company's clock. A day with no hours is closed; a project with none at all is open at any time. Set on the Access tab with `projects.access.rules` and the project-role ability `access`.
- **A person's own hours** on a project narrow the project's. They get in when both say yes.
- **Closed means closed for reading too**, unless the project's switch "people can still read, but not change" is on.
- **The refusal helps:** "P-0001 is closed for now. It can be opened Mon to Fri, 07:00 to 19:00. It opens again tomorrow at 07:00." The next opening is the next time every layer is open at once. The page shows who leads it. It stays on the list: it exists, it is only closed. Each refusal is logged with the reason "Outside hours".
- **Changed from the design:** the people who can set a project's hours are never held by them. Otherwise one mistake (hours that are never open) would close a project to everyone for good, with nobody able to get in and fix it. The editor says so and names them.
- **Passes:** someone outside the hours can ask to be let in. The people who can set the hours are told through the Core notifier; one of them, never the asker, lets them in or declines on the Access tab. A pass lasts 60 minutes (a setting) and ends by itself. One request at a time. Asked, approved and declined are logged.
- **Company settings** (Configuration, new Access tab, needs `projects.config.manage`): warning days, the hours a new project starts with, whether reading is allowed outside them, whether passes can be asked for, and how long one lasts. A project that already exists is left as it is.
- **Routes:** `PUT /{project}/access/hours`, `POST /{project}/access/pass`, `PUT /{project}/access/passes/{pass}`, `PUT /configuration/access`.
- **Tests:** `tests/Feature/ProjectsHoursTest.php` (8); `frontend/e2e/projects-access-ui.mjs` (now 32 checks).
- **Not yet:** hours that run past midnight (a night shift needs two days today); public holidays.

### 2.3 Locked areas and approvals (done)

Needs script 258. Screens: `docs/screens/projects-locked.png`, `projects-locks.png`, `projects-approvals.png`.

- **Services:** `ProjectLocks`, `ProjectApprovals`. The lock is the fourth question, asked in `ProjectAccess::authorize()` and on the two lists that are read with plain "open" (phases, links).
- **Areas today:** People and access, Phases, Links, Activity, Sensitive fields. The list is in code (`ProjectLocks::AREAS`); later stages add Money, Files, Notes and Messages to it.
- **A lock** is one password per area per project, at least 8 characters, stored hashed, never shown and never logged. Nobody is exempt, the lead included.
- **Unlocking** opens the area for that person only, for 15 minutes; it closes by itself, or at once with "Lock it again". The server answers 423 for a locked area, so nothing behind a lock is sent to the screen.
- **Sensitive fields behind a lock** are absent from the project, as for someone without the permission, and what is sent for them while locked is ignored.
- **Wrong tries** are counted per person. Five in a row means a 15 minute wait, during which even the right password is refused; the people who set the project's access are told through the Core notifier (type "Projects: security alerts"). Each wrong try and the block are logged as refusals.
- **Changing or removing a lock** needs its current password and the right to set access.
- **A lost password** is reset in three steps: the person asks and says why; someone else who holds `projects.locks.reset` approves on the Approvals page; the person who asked sets the new password. Approval alone changes nothing. A new password closes the area for everyone who had it open. The log names who approved.
- **The Access tab stays reachable when People is locked**, since that is where a lock is managed; it names nobody until People is opened.
- **Approvals page** (`/admin/projects/approvals`, in the Projects menu): what waits for me, with who asked, what, why and the hours left; and what I asked for in the last two weeks, with the answer. Declining needs a reason. Nobody answers their own request. A request lapses after 24 hours; an approval is used once. Both people are told through the Core notifier.
- **Settings** (in the `access` part): minutes an area stays open, wrong tries before a wait, the wait, and hours a request stays open. They are saved through `PUT /configuration/access`; the Configuration screen for these four arrives with build 2.4.
- **Routes:** `POST /{project}/locks/{area}/open`, `POST .../close`, `PUT /{project}/locks/{area}`, `DELETE /{project}/locks/{area}`, `POST /{project}/locks/{area}/reset`; `GET /approvals`, `PUT /approvals/{approval}`, `DELETE /approvals/{approval}`.
- **Tests:** `tests/Feature/ProjectsLocksTest.php` (7); `frontend/e2e/projects-locks-ui.mjs` (22 checks in a real browser).
- **Not built, and why:** an area locked by default for an industry or kind of work. A lock needs a password that people on that project know, so it cannot be set ahead of time by a setting. It will come back as a reminder on new projects ("this kind of work should have Notes locked") with the clinical-notes area in stage 9.

### 2.4 Serious actions (done)

Needs script 258. Screens: `docs/screens/projects-serious.png`, `projects-serious-ask.png`.

- **Service:** `ProjectSerious`. It is the fifth question, asked in the controllers after the person is known to be allowed, so nobody is asked for approval for something they may not do.
- **The table** (Configuration, new Serious actions tab; read with `projects.config.view`, changed with `projects.config.actions`): for each action, what it needs (nothing, confirm identity, a supervisor approves, or both), whether the supervisor must be on the project, and whether a reason is required. Out of the box every action needs nothing. "Use the suggested set" fills the table without saving it. It is a part of the settings (`serious`), so every save is a kept version and is logged.
- **The eight actions today:** delete a project for good; make a confidential project open; unfreeze; hand to another lead; reopen a closed or cancelled project (the Reopen button, and moving a closed project back to an open stage); put in the trash; remove someone; change what a project role can do (renaming a role is not serious). The list is in code (`ProjectSerious::ACTIONS`); later stages add theirs.
- **Supervisor:** the first try answers 428 and the screen asks "This needs a supervisor first", with a reason. Sent again with that answer, a request is stored exactly as asked and the people who can approve are told. They are other people who hold `projects.approve` and could open the project themselves (for a confidential project that means being on it; for one in the trash, holding `projects.delete`). Trying again while it waits says so. Once approved, the same button carries it out, and the approval is used up. An approval for one thing (this member, this new lead, these abilities) does not cover another.
- **Identity:** uses Core's step-up (passkey or password again) under a module rule, `projects_serious` (`StepUp\Catalogue::MODULE_RULES`). Whether it is asked is decided by this table, per action; it has no switch on Core's Sensitive actions page and is not counted there. If step-up is not set up on the system, an action that needs it is refused with a message saying so; it is never let through. The Configuration tab warns about this, and when fewer than two people can approve.
- **No screen knows which actions are serious.** One catch in the Projects API layer (`lib/serious.js`) handles the 428 for all of them, and `SeriousDialog` is mounted on every Projects page.
- **Access settings screen** now also holds the four numbers from 2.3 (minutes a locked area stays open, wrong tries, the wait, hours a request stays open).
- **Routes:** `GET /configuration/serious`, `PUT /configuration/serious`. Requests carry the answer in the headers `X-Projects-Ask` and `X-Projects-Reason`.
- **Tests:** `tests/Feature/ProjectsSeriousTest.php` (6); `frontend/e2e/projects-serious-ui.mjs` (15 checks in a real browser).
- **Not yet:** rolling the Access and Serious actions settings back from the History tab (it shows the general settings only; the versions are kept). Export as a serious action (there is no export yet). The identity step is exercised by Core's own tests, not here: this test world has no step-up tables, so only the "not set up, so refused" path is tested in Projects.

### 2.5 Security (done)

Needs script 258. Screens: `docs/screens/projects-security.png`, `projects-paused.png`.

- **Service:** `ProjectSecurity`. **Middleware:** `ProjectsHold`, on every Projects route.
- **Four signals**, each read from what is already recorded: many refusals (things the person may not do, counted across projects); wrong lock passwords; tries to open a project outside its hours; and an unusual number of different projects opened in a short time (opening the same few again and again does not count). Each has a count, a number of minutes, an on/off switch and a response. A signal fires once per window for a person.
- **Three responses:** alert only; cool off (the person can read but not change anything in Projects for 15 minutes, a setting); pause (nothing in Projects answers for them until someone releases it; it does not run out by itself). Out of the box every signal only alerts.
- **Alerts** go through the Core notifier (type "Projects: security alerts") to everyone who holds `projects.security.view`, except the person concerned. The signal is also written to the log.
- **The Security page** (`/admin/projects/security`, in the Projects menu, `projects.security.view`): each signal with who, what happened, the project when it was about one, what was done, and the review. Review needs a note; release needs a note, ends every hold on that person, tells them, and is logged. Nobody reviews or releases themselves.
- **Changed from the design:** "slow down" is "cool off: read only for a while", not a wait between actions. A wait between actions would break page loads, which make several requests at once.
- **Changed from the design:** the rule that protects against locking the company out is "the people who can see the Security page are never paused or cooled off, only reported", not "an owner cannot be paused". TISL has no single owner flag to test, and this rule guarantees that someone who can release is always able to get in. The page warns when only one person holds the permission.
- **A pause covers Projects only.** The rest of TISL keeps working. A paused person's Projects pages say why, in words.
- **The Access tab** shows "Paused by Projects security" as a person's state.
- **Signal settings** are a part of the settings (`security`), changed on the Security page with `projects.config.actions`, checked (count 2 to 1,000, 1 minute to 24 hours), versioned and logged.
- **Routes:** `GET /security`, `PUT /security/events/{event}`, `PUT /configuration/security`.
- **Tests:** `tests/Feature/ProjectsSecurityTest.php` (6); `frontend/e2e/projects-security-ui.mjs` (15 checks in a real browser).
- **Not yet:** the "repeated exports" signal (there is no export yet; it arrives with export). Refusals made by a route's own permission check (before Projects is reached) are Core's to log and are not counted here. The opening-spree count is kept in the cache, so a cache flush restarts it.

### Stage 2 as a whole

- **Five questions, in order:** permission; project role; hours; lock; seriousness. The first three are in `ProjectAccess::decide()`, the fourth in `ProjectAccess::authorize()`, the fifth in the controllers after the others have passed. Security watches the refusals of all five.
- **Until script 258 has run**, `ProjectsSetup::controlRoom()` is false: no hours, locks, serious actions or signals exist and nothing asks about them, so Stage 1 keeps working exactly as before.
- **Whole test suite after 2.5:** 3,113 backend tests, 1 failure, which is Laravel's stock `ExampleTest` (not part of Projects, failing before this work). 276 checks across eleven Projects browser checks, all passing. The browser checks use a stand-in API, not a real database. Script 258 was not run against MySQL or MariaDB in this session: its tables are created in the tests through the same SQL, translated for SQLite.
