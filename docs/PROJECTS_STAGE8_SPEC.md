# Projects Stage 8: People (being built)

Status: the owner said "continue" on 2026-11-18 after Stage 7, so this design is built straight away with the four choices at the end taken as recommended (as in every stage so far). Any of them can still be changed; say which. What is built so far is listed under "As built".

Stages 1 to 7 built the work, its money, the doing of it, the talking about it and its links. Stage 8 is about the people doing it: who is carrying what, what they can do, how they are growing, how they join and leave, and a safe way to raise a problem.

Size: medium to large. Five builds, one script, no new permissions (all seven are in the catalogue since Stage 1: `projects.team.view`, `projects.team.manage`, `projects.team.checklists`, `projects.casebook.report`, `.handle`, `.configure`, `.identity`).

## The rules this stage keeps

1. **HR owns the person.** Name, job title, department, manager, skills and certificates stay on the HR employee record. Projects reads them; it never keeps a second copy.
2. **What is private stays private.** One-to-one notes, reviews and casebook reports are never in the work's activity log or any export; they have their own add-only logs, seen only by the people they concern.
3. **Nothing hardcoded:** checklist steps, casebook kinds and their routing are company lists in Configuration.

## In this stage

### 1. Team view (`projects.team.view`)
- Everyone the viewer may see (their own reports, through HR's manager line; with `projects.view_all`, everyone on visible work), one row each: open tasks and late ones, this week's hours against their working hours (Attendance settings), key dates and meetings this week, days away (leave, off), and the work they are on.
- Filters: department, skill, piece of work, "has late tasks", "over their hours".
- Open a person: the same, in detail, with their goals and checklists (when the viewer may see those).

### 2. Skills and certificates
- Read from HR. HR's certificate entry gains an **expiry date** (the one change in HR; owner's choice 1).
- Certificates running out: the person and their manager are told at 60, 30 and 7 days, and on the day (Notifier, Projects group).
- **Find by skill:** the team view filters by skill, and the People tab's invite list shows each person's skills.

### 3. Goals, reviews and one-to-ones (`projects.team.manage`)
- **Goals** for a person: what, how it is measured, by when, progress (0 to 100) and state (on track, at risk, done, dropped). The person sees and updates progress on their own.
- **Reviews** for a period: the manager writes them; the person reads, comments and acknowledges.
- **One-to-ones:** dated notes shared between the manager and the person, each with an optional private note only its writer sees (owner's choice 2). Action points can become tasks.
- Seen by the person, their manager (HR's line) and people with `projects.team.manage` above them; never by anyone else.

### 4. Joining and leaving checklists (`projects.team.checklists`)
- Templates in Configuration: steps, each with who does it (the person, their manager, someone named, or anyone with a permission) and when (days from the start or leaving date).
- Run one for a person: each step becomes a to-do for whoever does it, with reminders when due.
- A **leaving** checklist always includes "Hand over their work" (opens Stage 6's hand-over, filled in) and "Take them off their work" (ends their places on each piece of work on the leaving date).

### 5. Casebook (`projects.casebook.*`)
- **Report** something (`report`): kind (out of the box: harassment, a difficult client, safety, pay, something else), what happened, when, who it is about (people or a client), and whether to **hide my name** from whoever handles it.
- **Routing** (`configure`, owner's choice 3): each kind goes one of six ways: everyone who handles cases; a named person; the reporter's manager (and their manager when the report is about the manager); the head of a chosen department; the company owners; or someone outside, by email (a counsellor, a lawyer), through the Notifier. It is never routed to anyone the report is about.
- **Handling** (`handle`): states (new, looking into it, action taken, closed), notes, and messages with the reporter that keep a hidden name hidden. A "difficult client" case can raise a client flag (Stage 3, with `projects.flags`).
- **Hidden names** (owner's choice 4): revealing one needs `projects.casebook.identity` and is a serious action ("Reveal a hidden name": out of the box a supervisor and a reason). The reporter is told it happened. Every view, note and reveal is in the case's own log.

## What changes outside Projects

| Where | Change | When it does anything |
|---|---|---|
| HR employee form and page | An expiry date on each certificate | Once filled in |
| Notifier types | "Projects: people (certificates, checklists, goals, reviews)" for staff; "Projects: casebook" for staff (essential) | When sent |

## Data

### Script `265_projects_people.sql` (Projects, adds only)

| Table | Holds |
|---|---|
| `project_goals` | A person's goal: what, measure, due, progress, state, set by |
| `project_reviews` | A review: person, period, text, written by, acknowledged and comment |
| `project_one_to_ones`, `project_one_to_one_private` | Shared notes, and each writer's private note |
| `project_checklist_templates`, `project_checklist_steps` | Joining and leaving templates and their steps |
| `project_checklists`, `project_checklist_items` | A checklist run for a person, and its to-dos |
| `project_case_kinds` | Casebook kinds and their routing |
| `project_cases`, `project_case_subjects`, `project_case_messages`, `project_case_log` | Reports, who or what they are about, messages and notes, and the add-only log |

## Builds

| Build | Contents |
|---|---|
| 8.1 | Script 265, the team view and a person's page |
| 8.2 | Skills and certificates: expiry in HR, warnings, find by skill |
| 8.3 | Goals, reviews and one-to-ones |
| 8.4 | Joining and leaving checklists |
| 8.5 | The casebook: reporting, routing, handling, hidden names |

Every build runs the Projects tests and the Projects browser checks.

## Four choices (taken as recommended; say if any should change)

1. **Skills and certificates** stay on HR's employee record; HR's certificate gains an expiry date. The other way: Projects keeps its own list.
2. **One-to-one notes** are shared between the manager and the person, with an optional private note only its writer sees. The other way: notes for the manager only.
3. **Casebook routing** is chosen per kind, from six ways. The other way: one way for every kind.
4. **A hidden name** can be revealed only with the identity permission, as a serious action, and the reporter is told. The other way: never revealable.

## As built

### To run

1. `backend/database/sql/265_projects_people.sql` (after 257; thirteen tables, five casebook kinds and a joining and a leaving checklist to start with). Adds only.
2. No permission seed.

### 8.1 Team view and a person's page (done)

Screens: `docs/screens/projects-team.png`, `docs/screens/projects-person.png`.

- **Projects → Team** (G then E; needs `projects.team.view`): the viewer, everyone below them in HR's manager line (every level, read from the employee records), and with `projects.view_all` everyone on work they may see.
- **Each row:** job title, department and skills from HR; open and late tasks; this week's logged time against their hours (company hours on working days, less an hour's break a day, less days marked away); key dates they are responsible for and meetings they are going to this week; days away (Attendance: leave, off, holiday); the open work they are on (only work the viewer may open); a note when a certificate runs out within 60 days.
- **Filters:** department, skill, piece of work, has late tasks, over their hours. Kept in the address.
- **A person's page:** their open tasks by due date, this week's time by day, skills and certificates from HR (with when each runs out, once HR has the date: 8.2), and the work they are on. Someone not in the viewer's line is "not found".
- **Routes:** `GET /projects/team`, `GET /projects/team/{user}`.
- **Tests:** `tests/Feature/ProjectsTeamViewTest.php` (2, on a shared world in `ProjectsTeamTest`). Browser check `e2e/projects-team-ui.mjs` (5 checks).

### 8.2 Skills and certificates (done)

- **HR, owner's choice 1:** adding a certificate on an employee's page now takes "Runs out on" (optional, not before the date obtained), and the certificate list shows "Runs out" or "Ran out" with the date. Nothing else in HR changed, and certificates already there carry on as before.
- **Warnings:** every morning (`projects:certificate-warnings`, 07:10) the person and their manager (HR's line) are told when a certificate has 60, 30 or 7 days left, and on the day it runs out. The days are exact, so each warning goes once. New notice type "Projects: people", in the Projects group of the staff channel choices.
- **Seen in Projects:** the team view marks people with a certificate running out within 60 days; a person's page lists each with its date (warning within 60 days, problem once it has run out).
- **Find by skill:** the team view's skill filter (8.1), and the People tab's invite list now shows each person's skills beside their name.
- **Tests:** two more in `tests/Feature/ProjectsTeamViewTest.php` (now 4).

### 8.3 Goals, reviews and one-to-ones (done)

Screen: `docs/screens/projects-person.png` (the lower half).

- **Where:** under a person's page. Seen by the person (from My Work: "My goals and reviews"; their own page needs only `projects.use`) and by anyone above them in HR's manager line who holds `projects.team.manage`. Anyone else is told "not found". None of it is in a piece of work's log or any export; each row keeps who wrote it and when.
- **Goals:** the manager sets them (what, how it is measured, by when). The person updates only how far along each is (0 to 100%) and how it is going (on track, at risk, done, dropped); their manager is told.
- **Reviews:** the manager writes a draft (the person does not see it) and shares it; the person is told, reads it, adds their own words and acknowledges it; the writer is told. An acknowledged review is not changed again; a new one is written instead.
- **One-to-ones (owner's choice 2):** the manager records the day, shared notes and action points; the person is told and can add to the shared notes. Each of them may keep a private note on it that only they see. An action point becomes a task on one of the person's pieces of work in one click, given to them.
- **Routes:** `GET /projects/team/{user}/growth`; `POST`, `PUT /projects/team/{user}/goals[/{goal}]`; `POST`, `PUT /projects/team/{user}/reviews[/{review}]`; `POST`, `PUT /projects/team/{user}/one-to-ones[/{id}]`; `POST …/one-to-ones/{id}/actions/{index}/task`.
- **Service:** `ProjectGrowth`.
- **Tests:** `tests/Feature/ProjectsGrowthTest.php` (3). Browser check `e2e/projects-team-ui.mjs` (now 9 checks).
