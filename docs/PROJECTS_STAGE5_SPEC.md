# Projects Stage 5: Work and time (being built)

Status: the owner said "build" on 2026-11-17, accepting the four choices at the end. What is built so far is listed under "As built"; everything else is still design.

Stages 1 to 4 built the work, who may touch it, who it is for, and its money. Stage 5 builds the doing of it: tasks, scope, key dates, changes, time, and billing that time. It also brings the three things Stage 4 left waiting: hourly billing, disbursements and write-offs.

Size: large, about the size of Stage 3 and larger than Stage 4. Ten builds, one script (`261_projects_work.sql`, thirteen tables), no new permissions (all twelve it uses are in the catalogue since Stage 1).

## The rule this stage keeps

Money stays in Books. Two places where time meets money are designed around it:

1. **Rates are Books prices.** An hourly rate is a Books service package, such as service "Professional time" with packages "Partner hour 25,000" and "Associate hour 12,000" (price unit: hour). Projects only says which package a person's time is billed at. The price, its tax and its sales ledger are Books'. A client's special rate is another package.
2. **A change's value is a Books sales order.** An approved change that alters the price opens Books' sales order form filled in (as a drafted bill does in 4.6) and the saved order is linked to the work. The agreed value, read from linked sales orders since 4.2, then includes it with nothing stored here.

Projects stores minutes, shares and quantities. It never stores an amount.

## In this stage

### 1. Tasks
- A task belongs to a piece of work, and optionally to a phase and a scope line. Numbered per piece of work: `M-0413-T12`.
- Title, description, one or more people, status, priority, start and due dates, estimate (hours), billable or not (defaults from the work), checklist, subtasks to any depth.
- Statuses: To do, Doing, Waiting, Done, Cancelled. Fixed in this stage, so boards, reports and My Work agree. Named per industry through the names table (a legal "Waiting" can read "Awaiting client").
- Dependencies: "can start when T7 is done" (finish to start). A task cannot be marked Doing while what it waits for is open, unless the person overrides with a reason (logged).
- On the calendar: a task with a due date writes a calendar entry for each person on it (kind `task`), through Core's CalendarService, as projects' due dates already do.
- Notices through the Notifier: assigned to you, due tomorrow, overdue (daily command, 07:30), and when something you wait for is done.

### 2. Views
- **List**: grouped by phase or status, sortable, filters (mine, overdue, this week, status, person, phase).
- **Board**: a column per status; drag to change status (the same checks as the button).
- **Timeline**: bars from start to due by phase, with dependency arrows and key dates as diamonds. Read only in this stage (dragging bars is Stage 12).
- **Saved views**: a person saves filters and grouping by name, kept in their own preferences (`project_user_prefs`, since Stage 1).

### 3. Scope lines
- The list of what is agreed: a fee schedule, a bill of quantities, deliverables, a job card (named per industry). Code, description, unit, quantity, phase.
- A line can point at the line of the linked Books sales order it is priced by. Projects shows the price from Books; it keeps only the link.
- Progress: quantity done (or % for a line with no unit), changed by people with `projects.scope`, each change logged. Tasks can be tied to a line.
- Billing work done from progress (a valuation) is a choice for the owner (question 4).

### 4. Key dates
- A hearing, a filing deadline, an inspection, a handover, a limitation date. Kind (from Stage 3's lists, per industry), date and time or all day, who is responsible, phase or task it belongs to.
- Warnings: notices so many days before (default 14, 7 and 1; per date), on the day, and when missed. On the calendar for everyone on the work.
- Done, missed, or moved. Moving a date keeps where it was, and who moved it and why.
- Dates worked out from other dates by rule (court rules, contract periods) wait for Stage 11.

### 5. Changes (change control)
- Anyone with `projects.changes` raises a change: what and why, and what it does: add or alter scope lines, move key dates or task dates, and whether it changes the price.
- Draft, Submitted, Approved, Rejected, Withdrawn. Approving needs `projects.changes.approve` and follows the serious-action rules (new action "Approve a change", out of the box needs nothing). The person who raised it cannot approve it.
- On approval its scope and date effects are applied in one step and logged. If it changes the price, Books' sales order form opens filled in for the client and the work; the saved order is linked to the change and to the work.
- Client approval of a change waits for the client portal (Stage 9).

### 6. Timers and time
- A time entry: person, work, phase, task (optional), date, minutes, billable, note.
- A timer: one running per person, started from a task, the work, My Work or Alt+T (the shortcut registered in Stage 1). Stopping it makes an entry. Rounded up to the company's step (setting: exact, 1, 6, 10, 15 minutes; default 6, a tenth of an hour). A timer left running stops itself at the daily cap (setting, default 10 hours) and tells the person.
- Checked against Attendance: a warning when time logged on a day is more than Attendance says was worked, or is on a day marked absent or on leave. Setting: warn (default), refuse, or off.
- Logging needs `projects.time.log` and a role on the work that may log time (a new project-role ability, "log time", given to Lead and Member out of the box). Logging or changing someone else's time needs `projects.time.others`, logged with a reason.

### 7. Timesheets and approval
- A week (Monday to Sunday) per person: a grid of work and task by day, with Attendance's worked hours under each day.
- Submit the week: its entries lock. Each entry is approved or sent back by someone with `projects.time.approve` (who approves is question 1). Nobody approves their own time.
- Approved entries are fixed. Reopening one is a serious action ("Reopen approved time").
- Reminders through the Notifier: week not submitted by Monday 10:00 (setting), entries waiting for you to approve.

### 8. Rates and hourly billing
- **Rate card**: which Books service package a person's time is billed at. Most specific wins: this work and this person; this work and their project role; this person; their project role; the company default. Dated, so a new rate applies from a day. Set with `projects.money.rates`.
- **Unbilled time** on the Money tab: approved, billable, not billed, by person and package, with what it comes to at Books' prices (read, not stored).
- **Bill time**: choose up to a date (and optionally which entries). A Books sales invoice with one service line per package (quantity = hours), on the work's cost centre, posted or drafted by the Stage 4 setting, with retention and advances taken off as in 4.7. Each entry remembers the invoice; a cancelled invoice frees them.
- **Write-offs**: write off a whole entry or part of it (minutes) with a reason, before billing. Needs `projects.money.writeoff`, then the serious-action rules (new action "Write off time"). Written-off time stays on the timesheet and in reports, marked.
- A billing method per work: fixed or staged (Stage 4), hourly, or both. Hourly time on fixed-price work is tracked but not billed unless it is billable.

### 9. Disbursements
- A cost paid for the client (court fees, travel, a valuer) that is billed back. In Books it is an ordinary payment or purchase on the work's cost centre.
- On the Money tab, costs on the work's cost centres can be marked "bill to the client" (`projects.money.disbursements`). Billing them adds lines to the next bill (time or stage) at the amount Books has, to the ledger chosen in Configuration ("Disbursements recovered", or back to the same expense ledger to net it off). Each remembers the invoice; written off like time.

### 10. Payroll split by timesheet
- Payroll already splits a person's pay across cost centres by their shares (Departments, `employee_cost_centres`). New setting, off by default: **split pay by timesheets**. When on, a payroll run splits each person's pay across the work they logged approved time on in that month, in proportion (question 2 says against what), and the rest by their usual shares.
- One change in Payroll: when it posts a run, it asks Projects for the split of each person; with the setting off, or no approved time, it is exactly as today.

### 11. My Work
- Each person's home in Projects: running timer, tasks due today and overdue, this week's timesheet with a submit button, key dates coming up on their work, follow-ups (Stage 3), and things waiting for them: time to approve, changes to approve, approvals (Stage 2).
- G then M opens it (the Stage 1 shortcut pattern).

## What changes outside Projects

| Where | Change | When it does anything |
|---|---|---|
| Payroll | When posting a run, asks Projects for each person's split | Only with "split pay by timesheets" on |
| Books | Sales form fills in from a time bill (as from a drafted bill in 4.6); sales order form fills in from an approved change | Only when opened from Projects |
| Calendar | New entry kinds `task` and `key_date` | Written by Projects |
| Notifier | New types: project task, project key date, project timesheet | Sent by Projects |

Not changed: Attendance (read only), Books prices and services (read only), the voucher service, Payroll's own calculation.

## Waits for later

Capacity and team workload (Stage 8, the team view), dragging the timeline and forecasts (Stage 12), date rules (Stage 11), client approval of changes and client-visible tasks (Stage 9), comments on tasks (Stage 6 messages), retainers and success fees (Stage 11 billing methods).

## Permissions (all in the catalogue since Stage 1)

`projects.tasks`, `projects.scope`, `projects.dates`, `projects.changes`, `projects.changes.approve`, `projects.time.log`, `projects.time.approve`, `projects.time.others`, `projects.money.rates`, `projects.money.writeoff`, `projects.money.disbursements`, `projects.money.bill`.

New project-role abilities: `tasks` (work on tasks), `time` (log time on this work), `approve_time` (approve time on this work). Out of the box: Lead gets all three, Member gets `tasks` and `time`.

New serious actions (out of the box each needs nothing): approve a change, write off time, reopen approved time.

## Data: script `261_projects_work.sql` (adds only)

| Table | Holds |
|---|---|
| `project_work_tasks` | A task: work, number, phase, scope line, parent, title, status, priority, dates, estimate minutes, billable |
| `project_task_people` | Who is on a task |
| `project_task_waits` | "Starts when that is done" between two tasks |
| `project_task_checks` | A task's checklist |
| `project_scope_lines` | Scope lines: code, description, unit, quantity, quantity done, phase, the Books sales order line it is priced by |
| `project_key_dates` | Key dates: kind, when, responsible, warning days, state, moved from |
| `project_changes` | A change: number, what and why, state, who decided, the Books sales order for its value |
| `project_change_effects` | What a change does: scope line added or altered, date moved |
| `project_time` | Time entries: person, work, phase, task, date, minutes, billable, state, approver, written-off minutes, the invoice it was billed on |
| `project_timers` | The running timer, one per person |
| `project_rates` | The rate card: who (person, project role, everyone), where (company or one work), the Books service package, from and to |
| `project_disbursements` | Books cost lines marked to bill to the client, and the invoice they went on |

Minutes, quantities and shares are stored. Amounts never are.

## Builds

| Build | Contents |
|---|---|
| 5.1 | Script 261, work settings, tasks (list, subtasks, people, checklist, statuses, dependencies), the Work tab |
| 5.2 | Board and timeline views, saved views, tasks on the calendar, task notices |
| 5.3 | Scope lines with progress, tied to Books sales order lines |
| 5.4 | Key dates with warnings, on the calendar |
| 5.5 | Changes: raise, approve, apply; value through a Books sales order |
| 5.6 | Timers and time entries, the Attendance check, Alt+T |
| 5.7 | Weekly timesheets, approval, reopening, reminders |
| 5.8 | Rate card, unbilled time, billing time, write-offs |
| 5.9 | Disbursements, and payroll split by timesheet |
| 5.10 | My Work |

Every build runs the Projects, Books and Payroll tests and the Projects browser checks.

## Four choices (my recommendation first)

1. **Who approves time:** the leads of the work the time is on (each piece of work's hours go to its own lead), with anyone holding `projects.time.approve` on that work as backup. The other way is the person's line manager approving their whole week.
2. **Payroll split against what:** approved project hours divided by the hours Attendance says they worked that month, the rest by their usual shares. The other way is against hours logged in total, which puts all pay on project work for someone who logs nothing else.
3. **A change's price:** through a Books sales order opened from the approved change, so the agreed value includes it at once. The other way is a Books quotation first, which counts only once it becomes an order.
4. **Billing work done from scope progress (valuations, as construction does):** later, in Stage 11 with the other industry billing methods, to keep this stage to its ten builds. The other way is an eleventh build here.

## As built

### To run

1. `backend/database/sql/261_projects_work.sql` (after 257 to 260). Thirteen tables, the new project-role abilities, and the five task-status words in the names table. It adds only.
2. No permission seed.

### 5.1 Tasks and the Work tab (done)

Screens: `docs/screens/projects-work.png`, `docs/screens/projects-work-task.png`.

- **The tasks table is `project_work_tasks`, not `project_tasks`:** the old Projects module had a `project_tasks` table, which script 256 drops. A different name means script 261 can never meet the old table, whichever order the scripts are run in.
- **Script 261** makes all twelve tables of the stage now, so it is run once. Later builds use the rest.
- **Service:** `ProjectTasks`. **Tab:** Work, beside the phases.
- **Tasks:** numbered per piece of work (`M-0413-T12`), numbers never reused. Title, description, phase, scope line, parent (subtasks to any depth, never under itself), people (only people on the work, up to 20), priority, start and due dates (due not before start), estimate in hours, billable or as the work. Checklist up to 50 lines.
- **Statuses** are words in the names table (new terms `task_todo` to `task_cancelled`, every industry; legal's Waiting reads "Awaiting client"). A company can rename them on the Names page.
- **"Starts when that is done":** tasks of the same work only, no circles (refused with the reason). Starting or finishing a task while something it waits for is open asks why; the reason is kept in the log.
- **Finishing** needs its subtasks done or cancelled.
- **Who may do what:** reading needs only to open the work. Adding, changing, assigning and deleting need `projects.tasks` and the new project-role ability "tasks". Someone the task is given to may move its status and tick its checklist without them. Nothing changes on frozen work.
- **Project roles:** new abilities `tasks`, `time` and `approve_time`. Lead gets all three, Member gets `tasks` and `time` (script 261).
- **Deleting** takes the subtasks too, and is refused when time is logged on any of them (cancel it instead). Other tasks stop waiting for it.
- **Filters:** mine, overdue, status, phase, search. A matching subtask keeps its parent tasks in view, dimmed.
- **Work settings** (Configuration, "Work and time"): rounding (default 6 minutes), forgotten timer cap (10 hours), the Attendance check (warn), who approves time (the work's leads), billable by default, key date warning days (14,7,1), the weekly reminder, and split pay by timesheets (off). Only "billable by default" is used yet; the rest arrive with their builds.
- **Routes:** `GET`, `POST /projects/{project}/tasks`; `GET`, `PUT`, `DELETE /projects/{project}/tasks/{task}`; `POST .../status`; `POST .../checks`; `PUT`, `DELETE .../checks/{check}`; `GET`, `PUT /projects/configuration/work`.
- **Tests:** `tests/Feature/ProjectsTasksTest.php` (6). Three earlier tests now expect the new abilities and the five new words. All Projects tests pass. Browser check `e2e/projects-work-ui.mjs` (13 checks); the configuration, record, money and serious checks still pass.

### 5.2 Board, timeline, saved views, the calendar and task notices (done)

Screens: `docs/screens/projects-work-board.png`, `docs/screens/projects-work-timeline.png`.

- **Board:** a column per status (in the work's industry words). Drag a card, or use its "Move to" list (for the keyboard), to change the status; the server makes the same checks as the task panel. A move that needs a reason opens the task with the question. Cards move for people who manage tasks or are on that task.
- **Timeline:** a bar per task from start to due (one day when only one date is given), on one scale with marks (Mondays over a short range, months over a long one) and today. Done is green, late red. Read only. Tasks without dates are listed under it.
- **Saved views:** a person saves the filters and the view by name (new table `project_saved_views`, added to script 261; 261 is not run yet). Each person's own; up to 30; the same name replaces it; only known settings are kept.
- **Calendar:** a task with a due date is an all-day entry on that day for each person on it (source `project_task`, kind `task`), written through Core's CalendarService. It follows the date and the people; a done task stays on its day marked done; a cancelled or deleted task, or one with no due date, comes off. Core's calendar refresh now also brings tasks in and sweeps the ones that no longer apply (one small change in `CalendarService::refreshFromSources`); the old module's `task` entries are still swept away as before.
- **Notices** (new type "Projects: tasks given to you, due, late, and what they wait for done", not essential, staff): when someone gives you a task (not when you give one to yourself, not again when you are already on it); when a task that yours waits for is done; and each morning at 07:30 (`projects:task-reminders`), one message per person listing tasks due tomorrow and tasks that became late yesterday. Frozen work and work in the trash are left out.
- **Routes:** `GET`, `POST /projects/saved-views/{place}`, `DELETE /projects/saved-views/{place}/{view}`.
- **Tests:** `tests/Feature/ProjectsTaskViewsTest.php` (3); all Projects and Calendar tests pass. The Work browser check now has 22 checks (board, timeline, saved views).

### 5.3 Scope lines (done)

Screen: `docs/screens/projects-scope.png`.

- **Service:** `ProjectScope`. The Work tab now has parts: Tasks and the scope (named per industry, so a construction contract reads "Bill of quantities"). A link can open a part (`?part=scope`).
- **A line:** code, description, unit and quantity (a unit needs its quantity), phase, and optionally the Books sales order or quotation line that prices it, from orders linked to the work only.
- **Copy in an order's lines:** one step makes a scope line from each line of a linked quotation or sales order, pointing at it. Lines already copied are skipped.
- **No price is kept.** The rate shown beside a line is read from Books each time (a test changes the Books price and sees it follow). A Books line that is gone, or whose voucher is cancelled, says so.
- **Progress:** a quantity done for a line with a unit, a percentage for one without. Far more than agreed (over one and a half times) is refused with "raise a change". Each change is logged with the old value and an optional note. Moving a line between a unit and a percentage starts its progress again. Overall progress counts each line equally, since no prices are kept to weigh them.
- **Tasks** tied to a line show "n of m tasks done" on it. Deleting a line leaves its tasks, untied.
- **Who:** reading needs only to open the work; the rest needs `projects.scope` and a project role that works on tasks.
- **Routes:** `GET`, `POST /projects/{project}/scope` (`copy_from` copies an order); `PUT` (`progress` records progress), `DELETE /projects/{project}/scope/{line}`.
- **Tests:** `tests/Feature/ProjectsScopeTest.php` (3); all Projects tests pass. Browser check `e2e/projects-scope-ui.mjs` (7 checks); the Work check still passes.

### 5.4 Key dates (done)

Screen: `docs/screens/projects-key-dates.png`.

- **Service:** `ProjectKeyDates`; a third part of the Work tab (a legal matter reads "Court dates").
- **Kinds** are a new list on the Configuration page, "Kinds of key date", which like party roles can belong to one industry or all: every industry gets Deadline, Meeting, Handover, Renewal or expiry, Payment due and Other; legal adds Hearing, Mention, Filing deadline, Limitation date and Judgment; construction adds Inspection, Site meeting, Practical completion and End of defects period (15 rows in script 261). A date offers only its work's industry's kinds.
- **A date:** what it is, kind, day and optional time (no time = all day), the person responsible (someone on the work), phase and task, and its own warning days (or the company's, 14,7,1).
- **Warnings** (`projects:key-date-warnings`, daily at 07:00, new notice type "Projects: key dates coming up, on the day, and missed"): on each warning day and on the day, once each; a run that missed some days sends one warning, not several. An open date whose day has passed becomes **missed**, with one notice. Sent to the person responsible and the work's leads. Frozen work and work in the trash are left out.
- **Moving** needs a reason; the date keeps where it was, who moved it and why (shown under it, and in the log); its warnings start again; a missed date moved ahead is open again. A plain change cannot move it. A done date cannot be moved (add a new one).
- **Calendar:** every key date is on the calendar of everyone on the work (source `project_key_date`), with its time when it has one, marked done or missed. Core's calendar refresh brings key dates in and sweeps the ones that no longer apply, as for tasks.
- **Timeline:** key dates not yet done show as diamonds (missed ones red).
- **Who:** reading needs only to open the work; the rest needs `projects.dates` and a project role that works on tasks.
- **Routes:** `GET` (`past=1` for old ones), `POST /projects/{project}/key-dates`; `PUT` (`done`, or `reason` with a new `date` to move), `DELETE /projects/{project}/key-dates/{date}`.
- **Tests:** `tests/Feature/ProjectsKeyDatesTest.php` (3); the leads test now counts 85 list rows and the new list. All Projects and Calendar tests pass. Browser check `e2e/projects-key-dates-ui.mjs` (7 checks); Work, scope and configuration checks still pass.

### 5.5 Changes (done)

Screens: `docs/screens/projects-change-form.png`, `docs/screens/projects-changes.png`.

- **Service:** `ProjectChanges`; the fourth part of the Work tab (a construction contract reads "Variations"). Numbered per piece of work: C-01, C-02.
- **A change:** what and why, whether it changes the price, and up to 30 things it does: add a scope line, alter one (quantity or description), move a key date (day and optional time), move a task (start or due). Each is checked when saved.
- **Steps:** Draft, Submitted, Approved, Rejected, Withdrawn. A draft can be changed by whoever raised it or someone who decides on changes; a change with nothing in it and no price change cannot be sent.
- **Deciding** needs `projects.changes.approve` and a project role that may change the work (ability `edit`, the Lead out of the box), and is never by whoever raised it. Rejecting needs a note. Approving follows the serious-action rules (new action "Approve a change to the work"; out of the box needs nothing; the suggested set asks identity).
- **On approval** everything it does is applied in one step, or nothing is: a target that has gone stops the whole change with the reason. Scope lines it adds remember the change; a key date it moves keeps where it was, with "Change C-03: …" as the reason; tasks and dates move on the calendar. Each step is logged.
- **The price** (owner's choice 3): an approved change that alters the price opens Books' **sales order** form filled in (client, work, narration, a line for the change; the rate is typed in Books, so no amount passes through Projects). The saved order is tied to the change and **linked to the work**, so the agreed value on the Money tab, and billing plans, include it at once. A change keeps one order; one not on the work's cost centre is left alone.
- **Routes:** `GET`, `POST /projects/{project}/changes`; `PUT /projects/{project}/changes/{change}`; `POST /projects/{project}/changes/{change}/{submit|withdraw|approve|reject}`; `GET /projects/changes/{change}/order-form` (needs `books.post`).
- **Books:** its voucher form also fills in from an approved change and sends `project_change_id`; Books' store ties the order (one line in `BooksVoucherController::store`). Nothing else changes.
- **Tests:** `tests/Feature/ProjectsChangesTest.php` (4); the serious-actions table now has 13 actions. All Projects, Calendar and Books-area tests pass. Browser check `e2e/projects-changes-ui.mjs` (6 checks, including the real Books form filling in); billing and voucher picker checks still pass.

### 5.6 Timers and time entries (done)

Screen: `docs/screens/projects-time.png`.

- **Service:** `ProjectTime`; a Time part on the Work tab, a "Start a timer on it" button on a task, and a **timer bar** on every Projects page while a timer runs (what it is on, a running clock, Stop, Discard).
- **An entry:** person, work, task (its phase comes with it) or phase, day (not ahead of today), hours or minutes (up to 24), billable (as the task says, else the company's setting, unless chosen), and a note. Minutes are **rounded up** to the company's step (default 6). Entries are drafts until the week is submitted (5.7); submitted or approved time is not changed here.
- **The Attendance check** (setting: warn, refuse, off): time that takes a day beyond the minutes Attendance says were worked, or time on a day marked absent, leave, off or a holiday, is warned about in words, or refused. Without an Attendance record for the day, nothing is checked.
- **Who:** logging needs `projects.time.log` and a project role that logs time (new ability `time`; Lead and Member out of the box). Logging, changing or deleting someone else's time needs `projects.time.others` and a reason (kept in the log), and only for people on the work; the entry remembers who entered it. A person sees their own time on a piece of work; those who approve time there, or may change others' time, see everyone's.
- **The timer:** one per person; starting another stops the first (making its entry). Stopping makes an entry for the time it ran, rounded up, never more than the cap. **Alt+T** stops a running timer, or on an open piece of work starts one there (a fixed key, alongside the configurable ones). A timer left running past the cap (default 10 hours) is stopped by an hourly sweep (`projects:stop-timers`) at the cap, and the person is told (new notice type "Projects: your time and timesheets").
- **Routes:** `GET /projects/{project}/time`; `POST /projects/time`; `PUT`, `DELETE /projects/time/{entry}`; `GET`, `POST`, `DELETE /projects/timer`; `POST /projects/timer/stop`.
- **Tests:** `tests/Feature/ProjectsTimeTest.php` (4); all Projects tests pass. Browser check `e2e/projects-time-ui.mjs` (8 checks); the other Work-tab checks still pass (one now matches a button name exactly, since a "Changes" part exists).

### 5.7 Weekly timesheets (done)

Screen: `docs/screens/projects-timesheet.png`.

- **Service:** `ProjectTimesheets`; a new page, Projects → **Timesheet**, with "My week" and, for people who may approve time, "To approve".
- **My week** (Monday to Sunday): work and task by day with totals; what Attendance says under each day, and a day with more logged than worked is flagged; the week's state (not submitted, partly, submitted, approved, some sent back); notes on sent-back entries; the week before and after. A manager, or someone who may change others' time, can read another person's week.
- **Submitting** locks the week's draft and sent-back entries and tells whoever may approve them. Locked time is not changed (5.6 already refused it).
- **Approving** (owner's choice 1, a setting): with "the leads of the work" (default), `projects.time.approve` and a project role on that work that approves time (new ability `approve_time`, the Lead out of the box); with "the person's manager", `projects.time.approve` and being their manager in HR (`employees.manager_id`). **Nobody approves their own time.** Entries are approved, or sent back with a note (the person is told), entry by entry or a person's whole lot; a choice that includes anything not theirs to decide stops it all.
- **Reopening** approved time (back to sent back, with a reason) is a serious action (new "Reopen approved time"; out of the box needs nothing; the suggested set asks a supervisor on the work, with a reason). Time already on a bill cannot be reopened.
- **Reminders** (`projects:timesheet-reminders`, Mondays at 10:00): people with time from last week or before still not submitted (when the setting is on), and people with time waiting for them to approve.
- **Routes:** `GET /projects/timesheet` (`week`, `user_id`); `POST /projects/timesheet/submit`; `GET`, `POST /projects/timesheet/approvals` (`ids`, `step` approve or return, `note`); `POST /projects/time/{entry}/reopen`.
- **Tests:** `tests/Feature/ProjectsTimesheetsTest.php` (4); the serious-actions table now has 14 actions. All Projects tests pass. Browser check `e2e/projects-timesheet-ui.mjs` (9 checks).

### 5.8 Rates and billing time (done)

Screen: `docs/screens/projects-time-billing.png`.

- **Services:** `ProjectRates`, `ProjectTimeBilling` (and `ProjectDisbursements`, whose screen comes with 5.9). On the Money tab: "Time and costs to bill" and "Rates on this work"; in Configuration → Money, the company rate card.
- **Rates are Books service packages** (service variants with a price per unit). The card holds only which package: for a person, a project role, or everyone; for the company or one piece of work; from and to a day. **Most specific wins** on the day the time was worked: this work and person, this work and role, this work for everyone, the person, the role, everyone. Setting rates needs `projects.money.rates` (for one piece of work, also a role that sees its money). No price is stored.
- **Time to bill:** approved, billable time not on a standing bill, less what was written off, by person and package, with hours and what it comes to at **Books' price now**; up to a chosen day. Time no rate covers is flagged and stops billing until the card covers it.
- **Billing it** makes one Books sales invoice with **one service line per package** (quantity = hours; Books prices it, taxes it and picks its ledger), plus one line per cost marked to bill back, on the work's cost centre. Posted or drafted by the Stage 4 setting; posting needs the bill permission and the "Post a bill" serious-action rule. Retention and advances come off it as off a staged bill (the bill is a row of the billing table of kind "time", added to script 260 in place, and kept out of the billing plan).
- **Drafted:** Books' sales form opens with the service lines and cost lines; saving it ties the invoice and marks the time and costs billed. A drafted bill holds its time until it is saved, or **dropped** from the Money tab (the time is free again).
- **Each entry remembers** its bill and the package it was billed at (`project_time.bill_stage_id`, added to script 261 in place, and `rate_package_id`). **A cancelled invoice frees its time** to be billed again.
- **Write-offs:** a whole entry or some minutes of approved, unbilled time, with a reason; needs `projects.money.writeoff` and follows a new serious action "Write off time or costs" (out of the box needs nothing; the suggested set asks a supervisor on the work, with a reason). Written-off minutes are not billed and stay marked on the entry. Billed time is credited in Books instead.
- **Routes:** `GET`, `POST /projects/{project}/time-billing`; `DELETE /projects/{project}/time-billing/{stage}`; `POST /projects/time/{entry}/write-off`; `GET`, `POST /projects/rates`, `DELETE /projects/rates/{rate}`; the same under `/projects/{project}/rates`. The Books form's drafted-bill door (`/projects/billing-stages/{stage}/form`) now serves time bills too.
- **Books:** its sales form now also fills in service lines (a package and hours, priced by Books) from a drafted time bill.
- **Tests:** `tests/Feature/ProjectsTimeBillingTest.php` (4); the serious-actions table now has 15 actions. All Projects and Books-area tests pass. Browser check `e2e/projects-time-billing-ui.mjs` (8 checks, including the real Books form with a service line); money, advances and retention, billing and configuration checks still pass.

### 5.9 Disbursements and the payroll split (done)

- **Disbursements** (`ProjectDisbursements`; "Costs to bill back" on the Money tab): the expense lines Books has on the work's cost centres (its phases' too), posted. **Mark** one "bill to the client" (`projects.money.disbursements`) and it goes on the next bill at **the amount Books has**, as one line, to the ledger set in Configuration → Work and time ("Costs billed back go to", e.g. Disbursements recovered), or back to the cost's own expense ledger to net it off. A marked cost can be unmarked until it is on a bill, or **written off** with a reason (`projects.money.writeoff` and the "Write off time or costs" serious action). A cancelled bill frees it. States: to bill, on a drafted bill, billed, written off.
- **Payroll split by timesheets** (`ProjectPayrollSplit`; setting "Split pay by timesheets", off out of the box). When on, a payroll run splits each person's pay: their **approved** time that month on each piece of work (on a phase's own cost centre when the entry's phase has one) divided by the minutes **Attendance** says they worked that month (owner's choice 2); the rest follows their usual cost-centre shares. Time beyond what they worked is scaled so the work takes all of it, in proportion. With the setting off, no approved time, or nothing in Attendance for the month, the run is exactly as before.
- **Payroll change** (one place, `PayrollService::approve`): when it splits a person's cost, it asks Projects first, only with the setting on. Payroll's own calculation is not touched.
- **Found and fixed on the way:** the "has script 257 to 261 been run" answers in Projects were remembered for the life of the PHP process; they are now remembered per request (as Books' were in 4.5), so one test, or a long-running worker, never sees a stale answer.
- **Routes:** `GET /projects/{project}/disbursements`; `PUT /projects/{project}/disbursements/{entry}` (`on`, or `write_off` with `reason`). The work settings now also list income and expense ledgers for the billed-back costs.
- **Tests:** `tests/Feature/ProjectsDisbursementsPayrollTest.php` (2); all Projects, Payroll and Books-area tests pass. The time-billing browser check now has 11 checks (marking and writing off costs).
