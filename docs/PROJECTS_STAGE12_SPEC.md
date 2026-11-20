# Projects Stage 12: Insights and rules (being built)

Status: the owner read the plan (also as a page, "Projects Stage 12") and said "go" on 2026-11-20, so the four choices at the end are taken as recommended; any of them can still be changed. What is built so far is listed under "As built".

Stages 1 to 11 built everything a piece of work is and does, for fifteen industries. Stage 12 is the last: it tells you how the work is going, and lets the module act on its own where you ask it to. It measures what is already there (tasks, dates, time, snags, the books), sets targets, shows scorecards for each piece of work and each person, forecasts what is coming, runs your own "when this happens, do that" rules, and teaches Mimi about Projects.

Size: medium to large. Six builds, one script, no new permissions (all four are in the catalogue since Stage 1: `projects.insights`, `projects.insights.team`, `projects.kpis`, `projects.rules`).

## The rules this stage keeps

1. **Measured, not typed.** Every figure is worked out from what the module already holds. Nobody keys in a percentage.
2. **No money in Projects.** Money measures are read from Books when they are shown (margin %, budget used %, billed % of the agreed value). Targets are percentages, counts, days or hours, never amounts (owner's choice 1). Weekly history keeps statuses and non-money figures only.
3. **You see only what you may see.** A scorecard, a forecast or a Mimi answer never shows work, people or money the person could not open themselves (Stages 1 and 2). Confidential work stays with those on it.
4. **Automatic never means serious.** A rule can tell people, make tasks and dates, and tag; it can never take a serious action, touch Books, delete anything or move money (owner's choice 3). Every run is logged.

## In this stage

### 1. The measure library and KPIs (`projects.kpis` to set)
- **Measures** are what the code can work out. About 25 to start with, each with its unit and what it is about (a piece of work, a person, the company):

| Area | Measures |
|---|---|
| Delivery | Tasks done on time %, tasks overdue, key dates met %, days ahead of or behind the expected end, scope lines done %, changes raised, open snags, snags closed on time %, inspections passed %, daily records signed % |
| Time and people | Hours logged, billable hours %, utilisation % (hours logged against working hours), timesheets in on time % |
| Money (read from Books) | Budget used %, margin %, billed % of the agreed value, unbilled time (hours), days receivables are overdue |
| Clients | Client health (Stage 3), first reply to a client message (hours), requests answered on time % |
| Pipeline | Win rate %, days from lead to win, opportunities open |

- **A KPI** is a measure with a target: green from, amber from (and whether higher or lower is better), where it applies (the whole company, one industry, or one kind of work), and whether the client sees it.
- **Starter KPIs per industry** (deferred from Stage 11), for example: Legal: key dates met 100% (limitation and filing dates), billable hours %; Construction: inspections passed %, snags closed on time %, daily records signed %, budget used %; Software and IT: tasks on time %, scope lines done %, days behind; Consulting: billable hours %, timesheets on time %; Healthcare: care reviews held on time %.

### 2. Scorecards and health (`projects.insights`)
- **Each piece of work** gets a scorecard on its Overview: its KPIs, each green, amber or red against its target, with the figure and what it is worked out from.
- **Health** of a piece of work is its worst KPI (owner's choice 2); the projects list shows it as a chip and can be filtered by it.
- **A weekly snapshot** (Monday, early) keeps each KPI's status and non-money figure, so a scorecard shows the last eight weeks ("amber for three weeks").
- **The client's scorecard:** KPIs marked "the client sees it" show on the client portal (Stage 9) for their work.
- **Leads are told** when their work turns red, once.

### 3. People and capacity (`projects.insights.team`)
- **A person's scorecard:** utilisation, billable %, tasks on time, timesheets on time. Managers see their line (Stage 8's team view), everyone sees their own on My Work.
- **Capacity:** for each person, the next eight weeks: hours of open tasks due (from their estimates) against their working hours (Attendance) less leave; who is over and who has room. Uses the existing `projects.capacity`.

### 4. Forecasts
- **Pipeline:** open opportunities by the month they are expected to close, each counted at its stage's chance of winning: worked out from your own history, or set per pipeline stage. The value is the Books quotation's, or the estimate before there is one, read when shown.
- **When the work will end:** from how fast its tasks are getting done, the day it will likely finish, against its expected end.
- **What will be billed:** staged bills (Stage 4) due by their dates and the unbilled time (Stage 5), by month, read from the books.

### 5. Rules (`projects.rules`)
- **When** something happens (a work starts, enters a stage, a task or key date goes late, a snag is raised, a KPI turns red, an opportunity moves, a timesheet is not in) or every morning;
- **if** it matches (industry, kind of work, stage, an extra field, priority, who is the lead);
- **then** do one or more of: tell someone (the lead, the members, the followers, a named person, a role), make a task, make a key date, add a follower, tag the work's conversation, raise a client flag.
- **Safe by design:** no serious actions, nothing in Books, no deleting (rule 4); a rule cannot start itself again; at most so many runs a day per rule; a rule can be **tried** against the last 30 days to see what it would have done before it is switched on; every run is in the rule's log and the work's log.
- **Starter rules**, switched off, for example: "a key date of a filing kind is missed: tell the lead and the supervising partner"; "a snag is late by 7 days: tell the lead"; "a work turns red: tell the lead's manager".

### 6. Mimi
- **Ask Mimi** about Projects: "what is late on my work?", "how is M-0413?", "what is due this week?", "who has room next week?". Mimi answers from Projects data, only what the person may open.
- **Weekly update drafts:** each Friday Mimi drafts a short update for each open piece of work from its week (tasks done, dates, daily records, snags, what is next). The lead reads it, changes it and sends it to the client as a message, or throws it away. Nothing is sent by itself (owner's choice 4). Drafting uses the company's AI keys (AI → Keys); confidential work and sensitive fields are never sent to the AI unless the company switches it on.

## What changes outside Projects

| Where | Change |
|---|---|
| Mimi | Projects answers added to what Mimi can look up |
| Client portal | The client's scorecard on their work |
| My Work | Your own scorecard and capacity |

## Data

### Script `269_projects_insights.sql` (Projects, adds only)

| Table | Holds |
|---|---|
| `project_kpis` | KPIs: the measure, targets, where they apply, whether the client sees them; starter ones per industry |
| `project_kpi_snapshots` | Each week: per KPI and subject (a work, a person), the status and the figure (never money) |
| `project_pipeline_odds` | A pipeline stage's chance of winning, when set by hand |
| `project_rules`, `project_rule_runs` | Rules (when, if, then) and every run |
| `project_updates` | Mimi's weekly drafts: the text, who sent or threw it away, the message it became |

## Builds

| Build | Contents |
|---|---|
| 12.1 | Script 269, the measure library, KPIs with targets in Configuration, starter KPIs per industry |
| 12.2 | Scorecards on each work, health in the list, the weekly snapshot, the client's scorecard |
| 12.3 | People's scorecards and capacity |
| 12.4 | Forecasts: pipeline, when the work will end, what will be billed |
| 12.5 | Rules: when, if, then; trying a rule; the rule log; starter rules |
| 12.6 | Mimi: Projects answers and weekly update drafts |

Every build runs the Projects tests and the Projects browser checks. At the end, the whole module is checked once more and the build order in `PROJECTS_CRM_PLAN.md` is marked done.

## Four choices (my recommendation first; say if any should change)

1. **Targets** are percentages, counts, days or hours, never amounts; money is shown as ratios read from Books (margin %, budget used %). The other way: amount targets ("bill KES 2M a month"), which means Projects keeps money figures.
2. **Health** of a piece of work is its worst KPI: one red makes it red. The other way: a weighted score out of 100.
3. **Rules** tell, make tasks and dates, follow and tag, and never take serious actions, touch Books or delete. The other way: rules may also move a work's stage (still never serious actions or money).
4. **Mimi's weekly updates** are drafts the lead reads and sends; confidential work stays out of the AI unless switched on. The other way: updates sent to clients automatically, or no AI drafting at all.

## As built

### To run

1. `backend/database/sql/269_projects_insights.sql` (after 268). Six tables, starter KPIs for every industry, and four starter rules switched off. Adds only.
2. No permission seed.

### 12.1 Measures and KPIs (done)

Screen: `docs/screens/projects-kpis.png`.

- **The measure library** (code, `ProjectMeasures`): 26 measures, each with its unit and what it is about.
  - *A piece of work:* tasks done on time %, tasks overdue, key dates met %, days behind the expected end (from its pace: tasks done in the last four weeks against those left), scope done %, changes raised, snags open, snags closed on time %, inspections passed %, daily record signed % (working days in the last four weeks), hours logged, billable %, unbilled hours, first reply to the client (hours), requests answered on time %; and from Books: budget used %, margin %, billed % of the agreed value.
  - *A person:* utilisation % (hours logged against company hours on working days less leave and days off, from Attendance), billable %, tasks done on time %, timesheets in on time % (sent by the following Tuesday), hours logged.
  - *The company:* win rate %, days from lead to win, opportunities open.
  - A measure with nothing to work from answers "not measured yet", never zero. Money measures are worked out from Books when asked; nothing is kept.
- **KPIs** (Configuration → KPIs and rules, `projects.kpis` to change): a measure, a green and an amber target, where it applies (every industry, one industry, or one kind of work; measures about people or the company apply everywhere), whether the client sees it, on or off. Amber must be on the right side of green (lower is better for overdue tasks, days behind, budget used, reply hours). Targets are numbers in the measure's unit, never amounts.
- **Starter KPIs:** for every industry, tasks on time, key dates met (the client sees it), days behind; for people, utilisation, tasks on time, timesheets on time; for the company, win rate and days to win; and per industry, for example Legal billable hours and reply time, Construction inspections passed and snags on time (the client sees both), site diary signed and budget used, Healthcare care reviews held on time.
- **Routes:** `GET`, `POST /projects/configuration/kpis`, `PUT …/kpis/{kpi}`.
- **Tests:** `tests/Feature/ProjectsKpisTest.php` (3, including the measures worked out on a real work and person). Browser check `e2e/projects-insights-ui.mjs` (4 checks).

### 12.2 Scorecards and health (done)

Screen: `docs/screens/projects-scorecard.png`.

- **The scorecard** on each work's Overview (`projects.insights`): every KPI that applies (every industry, its industry, its kind of work), each with its status dot, how it was worked out, the figure now, its green target, and the last eight weeks. A money figure (from Books) shows only to those who see the work's money; others see its status and "The figure is for those who see the work's money".
- **Health** is the worst KPI (choice 2): Off track, Needs watching, On track, or Not measured yet. The projects list shows it beside the title (from the latest snapshot) and can be filtered by it.
- **The morning snapshot** (`projects:kpi-snapshot`, 06:10 daily) keeps this week's row for each KPI of each open work and each person, updated through the week, so a scorecard has eight weeks of history. A money figure is never kept, only its status (rule 2).
- **Turning red:** when a work's health turns Off track, its lead is told once, naming the KPIs that missed, and the rules' "a work turns red" event fires (12.5).
- **The client's scorecard:** on their My work page, "How it is going" shows the KPIs marked "the client sees it", never a money one.
- **Routes:** `GET /projects/{project}/scorecard`; `health` on `GET /projects`.
- **Tests:** `tests/Feature/ProjectsScorecardTest.php` (3). Browser checks `e2e/projects-insights-ui.mjs` (now 8), `e2e/projects-portal-ui.mjs` (now 10).

### 12.3 People and capacity (done)

Screen: `docs/screens/projects-capacity.png` (the Team page, capacity at the bottom).

- **A person's scorecard:** utilisation, tasks done on time, timesheets in on time (and any other person KPI), each with its figure, how it was worked out and its status. On **My Work** everyone sees their own ("My scorecard"); on a person's page their managers see theirs (`projects.insights.team` and being above them in Stage 8's HR line). Nobody else, whatever their other permissions.
- **Capacity** (Team page): for the next eight weeks, each person's hours of open tasks due that week (from the tasks' estimates, shared equally between the people on a task; what is already late counts in this week) against their working hours (company hours on working days, from Attendance, less leave, days off and holidays). Over is red, within 10% amber, a week with no working hours "off". Tasks with no estimate are counted so the gap is visible. Without `projects.capacity` a person sees only their own row; with it, their line and everyone on the work they can see.
- **Routes:** `GET /projects/insights/people/{user}`, `GET /projects/insights/capacity`.
- **Tests:** `tests/Feature/ProjectsCapacityTest.php` (2). Browser check `e2e/projects-team-ui.mjs` (now with capacity and a person's scorecard).
