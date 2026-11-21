# HR Stage 1: Foundation (spec)

Status: being built. Stage 1 of `docs/HR_HUB_PLAN.md`. The owner said "go" on 2026-11-21, so the four choices at the end are taken as recommended. What is built is under "As built".

Stage 1 makes the employee record a core part of TISL, with no Extras licence needed. It sorts the record's fields by who may see them, protects the sensitive ones, keeps a history of every change, and gives the record a proper page and HR its own configuration. Everything later (documents, hiring, leave, overtime, the profile) stands on this.

## Found while reading the code

| What | Where | Why it matters |
|---|---|---|
| Every employee route needs the Extras licence (`module:extras`) | `routes/api.php`: the employee list and record, the import, "my record" | Without Extras, HR can't manage anyone, though payroll and attendance (core) depend on the records |
| The HR permissions are filed under Extras | `Access\Catalog`: `hr.view`, `hr.manage`, `hr.team`, `hr.purge` | They belong to core with the record |
| `hr.view` does nothing on the server | The list and record need `hr.manage`; only the menu asks for `hr.view` | Someone meant to only *see* records can't, so people are given `hr.manage` instead |
| Payroll and My payslips are in the menu's Operations group, marked Extras | `adminNav.js` | The menu hides them without Extras, though the server serves them |
| Bank, ID, tax and social security numbers and salary are plain columns, shown in full to anyone who can open the record (the screen masks only the bank account) | `employees` table, `EmployeeController::show` | Anyone with record access sees everyone's pay and identity numbers |
| Payroll and the Menus rota look for "has a salary" in the database (`base_salary > 0`) and compute from it | `PayrollService`, `RotaPay` | Salary can't be encrypted without changing those; protecting it by permission is enough |
| Changing an employee's bank details already asks the person to confirm who they are | `StepUp\Facts::bank` | It stays, and is extended to identity numbers |
| The employee screens live in the Extras folder | `frontend/src/extras/pages/admin/employees` | They move to core with the record |
| The `employees` table is not created by a repo script | — | Stage 1 changes it only through a guarded script |

## What changes

### 1. The record becomes core

- **Server:** the employee routes (list, record, create, change, status, skills, certifications, leave days, import, "my record", restore, delete) lose `module:extras`.
  - Seeing a record needs `hr.view`, or `hr.team` for the people who report to you, or it being your own.
  - Changing one needs `hr.manage`, or `hr.team` for your line (work fields only, choice 3).
  - Deleting for good keeps needing `hr.purge`.
- **Catalogue:** `hr.view`, `hr.manage`, `hr.team` and `hr.purge` move from Extras to core, plus two new permissions:
  - `hr.sensitive`: "See and change pay, bank and identity details"
  - `hr.configure`: "Set up HR (employment types, numbering, required fields)"
- **Menu:** a new **People** group, always present.

  | Item | Who sees it |
  |---|---|
  | Employees | `hr.view`, `hr.team` or `hr.manage` |
  | Attendance | as today |
  | Payroll | `payroll.run` |
  | My payslips | everyone with an employee record |
  | HR configuration | `hr.configure` |

  Team (from Workplace), Attendance, Payroll and My payslips move here. Delivery stays in Operations, which stays with Extras.
- **Screens:** the employee list, record and form move from `src/extras` to `src/core`. Their addresses (`/admin/employees/...`) don't change.

### 2. Fields sorted by who may see them

| Tier | Fields | Who sees them | Who changes them |
|---|---|---|---|
| **Work** | number, job title, department, branch, manager, employment type, hire and leaving dates, work email and phone, work location, status, skills, certifications | `hr.view`, the person's managers (`hr.team`), the person | `hr.manage`; managers with `hr.team` for their line |
| **Personal** | date of birth, gender, marital status, education, emergency contact | `hr.view`, the person | `hr.manage`; the person (from My record, later in stage 8) |
| **Pay and identity** | salary grade, base salary, currency, bank name, account name and number, ID number, KRA PIN, NSSF and NHIF numbers | `hr.sensitive` and the person themselves | `hr.manage` **and** `hr.sensitive` |

- **Hidden fields are left out of what the server sends**, not just hidden on the screen. Instead the answer says which tiers the viewer may see, so the page shows "Pay and identity: needs permission".
- The same rule covers the employee list, export, bulk edit and import:
  - Without `hr.sensitive`, the import ignores pay and identity columns and says so.
  - Exports leave those columns out.
- Payroll is unchanged. It reads the record itself, and running payroll already needs `payroll.run`.

### 3. Pay and identity details protected

- **Encrypted at rest:** bank account name and number, ID number, KRA PIN, NSSF and NHIF numbers.
  - A guarded script widens those columns so they can hold encrypted text.
  - The model encrypts them as they are saved and reads both encrypted and not-yet-encrypted values, so nothing breaks in between.
  - `php artisan hr:encrypt-fields` encrypts the values already there, once, and says how many it did. It is safe to run again.
- **Salary is protected by permission, not encrypted** (choice 1). Payroll and the rota calculate and search on it in the database.
- **Masked when shown:**
  - A bank account number shows only its last four characters until **Show** is pressed.
  - **Show** needs `hr.sensitive` and writes a line to the employee's history ("Wanjiru's bank account number was shown to Otieno").
  - ID and tax numbers mask the same way.
- **Confirming who you are:** changing bank details already asks for it. Changing an ID, KRA PIN, NSSF or NHIF number now asks too, with the same rule and screen.

### 4. A history of every change

- **Every change to a record is kept:** who, when, which field, from what to what, and the reason if one was given.
  - This covers create, change, status, skills, certifications, leave days added or used, manager and department moves, restore and delete.
  - Bulk edits and imports are recorded the same way, with "by bulk edit" or "by import".
- **Pay and identity changes** keep their old and new values encrypted. Only `hr.sensitive` sees them; everyone else sees "changed".
- **Who reads the history:** the **History** tab on the record, for `hr.view` (with the tier rule above), the person's managers for work fields, and the person for their own record.
- The history can't be edited or deleted. Deleting an employee for good (`hr.purge`) keeps its history, with the name kept for reference.

### 5. The record as a page with tabs

`/admin/employees/{id}` becomes a page with tabs. Later stages add Documents (2), Time and leave (4), Pay (5), the linked Work, Casebook and Hired-from parts (6), and Growth (7).

| Tab | What it holds |
|---|---|
| **Overview** | The person at a glance: job, manager, branch, tenure, status, who reports to them, and their next leave if any |
| **Work** | The work tier, editable by those allowed |
| **Personal** | The personal tier |
| **Pay and identity** | The sensitive tier: masked, with Show, or "needs permission" |
| **Skills** | Skills and certifications, with certificate expiry dates |
| **Leave** | The current leave days and log (stage 4 replaces this) |
| **History** | Every change, newest first, filterable by tier |

The list gets filters for status, department, branch, manager, employment type and "joined in the last 90 days". Its columns follow the viewer's tiers.

### 6. HR configuration

A new page, `/admin/hr/configuration`, needing `hr.configure`. Its settings are versioned like Projects settings, so any earlier state can be brought back.

- **Employment types:** permanent, contract, casual, intern, probation, plus the company's own. Each has a name and whether it is paid through payroll by default. They replace the free text.
- **Employee numbers:** a prefix and width, for example `EMP-0001`. Existing numbers are kept; new records take the next number.
- **Required fields when creating a record:** for example work email, department, manager, start date. The form asks for them, and the server refuses a record without them.
- **Who can see their own pay and identity details:** on (the default) or off (choice 2).
- **Departments:** a link to the existing Departments page. Nothing about departments changes.

## What does not change

- Payroll's calculation, runs and posting to Books.
- Attendance.
- Departments and cost-centre shares.
- Careers.
- Projects' use of `employees.manager_id`.
- Addresses of existing pages.

## Data

### Script `271_hr_foundation.sql` (adds only)

| Table or change | What it holds |
|---|---|
| `hr_employment_types` | key, name, paid through payroll by default, active, order. Seeded with the five types above, and with any types already typed on employees |
| `hr_settings` and `hr_settings_versions` | The HR configuration, versioned, with who changed it and when |
| `employee_changes` | employee_id, field, tier (work, personal or sensitive), old value, new value (encrypted for the sensitive tier), action (`created`, `changed`, `status`, `shown`, `imported`, `bulk`, `deleted`, `restored`), reason, by, at |
| `employees`, guarded | Widens the six identity and bank columns to `TEXT` for encrypted values, and adds `employment_type_id` (the old free-text `employment_type` is kept and filled into the new list) |

Plus the `hr.sensitive` and `hr.configure` permissions in the catalogue (granted to no one out of the box, except the owner role, which holds everything).

## Builds

| Build | What |
|---|---|
| 1.1 | Core move: routes, permissions out of Extras, `hr.view` and `hr.team` working on the server, the People menu, screens moved to core. Tests that every employee route works with Extras not licensed. |
| 1.2 | Field tiers and protection: `hr.sensitive`, tiers in every answer, export and import; encryption with the safe reader and `hr:encrypt-fields`; masked values with Show (logged); step-up on identity numbers. |
| 1.3 | The history: `employee_changes`, recorded on every path, including bulk edit and import; the History tab. |
| 1.4 | The record page with tabs, the list filters, HR configuration (employment types, numbering, required fields, own-details setting). Browser checks. |

Size: medium. One script, one artisan command, two new permissions.

## Four choices (taken as recommended; say if any should change)

1. **Salary is protected by permission, not encrypted.** Bank, ID and tax numbers are encrypted, but salary stays readable in the database, because payroll and the rota calculate and search on it. Only `hr.sensitive` and the person see it on screen. (The other way: encrypt salary too, and change payroll and the rota to decrypt in code, which is slower and a bigger change.)
2. **People see their own pay and identity details.** An employee sees their own salary, bank and ID details on their record (masked until Show), so they can check them. It can be switched off in HR configuration. (The other way: only HR sees them.)
3. **Managers see their line's work and personal tiers and change work fields only.** With `hr.team`, a manager sees and edits job, department and similar for the people who report to them, sees their personal tier, but not pay and identity. Today `hr.team` can change everything. (The other way: managers see work fields only.)
4. **The history shows sensitive old and new values to `hr.sensitive`.** Kept encrypted and shown only to those who may see pay and identity details, so a wrong bank change can be traced and put right. (The other way: record only "changed", with no values, for sensitive fields.)

## As built

### 1.1 Core move (done)

- **Routes:** the employee routes no longer need Extras.
  - The list and record answer to `hr.view`, `hr.team` or `hr.manage`.
  - "My record" answers to anyone signed in, and shows only their own.
- **Permissions:**
  - `hr.view`, `hr.manage`, `hr.team` and `hr.purge` are core.
  - `hr.sensitive` and `hr.configure` are added (catalogue version 27). `hr.sensitive` is owner-only by default, like payroll; `hr.configure` goes to admins.
  - `hr.team` now reads "See and edit the work details of the people who report to you".
- **Who sees and changes whom** (`App\Services\Hr\EmployeeAccess`):
  - `hr.view` and `hr.manage` see everyone.
  - `hr.team` sees their whole line (reports, and their reports' reports, however deep) and themselves. That applies to the list, statistics, leave logs and birthdays.
  - Anyone sees their own record.
  - Changing needs `hr.manage`, or `hr.team` for someone in their line. Every change endpoint (record, skills, certifications, leave days, status) checks the person being changed.
  - A person no longer changes their own record here. My HR comes in stage 8.
- **Bugs fixed:**
  - `hr.view` did nothing on the server; it now lets people look.
  - `hr.team` could change **anyone's** record, because the check never named the person; it now covers only their line.
  - "My record" was registered three times, and the copy that won sat in the delivery group. So only people with the delivery permission and Extras could see their own record; now everyone can.
- **Menu:** a new **People** group, always present, with Employees, Attendance, My payslips and Payroll, moved from Workplace and Operations.
- **Screens:** the employee screens moved from `src/extras` to `src/core`. Their addresses are unchanged, and their routes accept `hr.view`, `hr.team` or `hr.manage`.
- **Tests:** `tests/Feature/HrFoundationTest.php` (4), with a new `CreatesHrWorld` fixture. The permission snapshot and the staff-routes check list the changes.

### 1.2 Tiers and protection (done)

- **Script `271_hr_foundation.sql`**, the whole stage's script:
  - Creates employment types (seeded with five, plus the types already typed on records), HR settings with versions, and the change history.
  - Widens the six bank and identity columns to text, and links each employee to their employment type. Both are guarded.
- **What is sent** (`EmployeeAccess::shape`):
  - Pay and identity fields are hidden on the model itself, so no answer leaks them by accident. Payroll and the rota still read them as before.
  - The record, the list, "my record" and every change endpoint send only the tiers the viewer may see, plus `tiers` and `can`.
  - Managers and direct reports appear only as name, job and number, never with their details.
  - With the pay and identity tier, the five numbers come masked as `••••6789`.
- **Who may see which tier:**
  - **Work:** anyone who may see the record.
  - **Personal:** `hr.view`, `hr.manage`, managers for their line (choice 3), and the person.
  - **Pay and identity:** `hr.sensitive`, and the person themselves unless HR configuration switches that off (choice 2).
- **Who may change which tier:** `hr.manage` changes work and personal; with `hr.sensitive` also pay and identity. Managers with `hr.team` change their line's work fields only.
  - A form that sends every field is fine. Only a real change to a tier the person may not change is refused, and the message names the tier.
  - A masked number sent back counts as unchanged, so it can never overwrite the real one.
- **Show:** `POST /employees/{id}/reveal` returns one masked number in full, for `hr.sensitive` or the person, and writes "shown" to the history.
- **Encryption:**
  - Bank account name and number, ID, KRA, NSSF and NHIF numbers are stored encrypted. A value saved before encryption still reads.
  - `php artisan hr:encrypt-fields` encrypts the old values and says how many. It is safe to run again.
  - Salary stays readable in the database for payroll (choice 1).
- **Confirming who you are:** changing an ID, KRA, NSSF or NHIF number now asks for it, with the bank details. What changes is shown before agreeing.
- **Import:** without `hr.sensitive`, pay and identity columns are left out, so they are no longer emptied on existing people, and the result says on how many rows. Imports are written to the history.
- **Screens:**
  - The record shows masked numbers with **Show** and **Hide**, or "needs the permission" in place of pay and identity.
  - The form offers only the tiers you may change, leaves masked numbers empty ("unchanged (••••6789)"), and sends a number only when a new one is typed.
- **Tests:** `tests/Feature/HrTiersTest.php` (4). The step-up test now reads the encrypted bank number through the model.

### 1.3 The history (done)

- **Every save of a record is kept, whichever code makes it.** The record's own events feed the history: create, every changed field, delete, restore, and delete for good (kept as "purged", with the name).
  - That covers the form, skills, certifications, leave days, status, import, and any other code that saves the record (for example a department move).
  - An import marks its changes "imported", and a bulk edit can mark its own (`EmployeeHistory::as`).
  - A change's reason comes from the request ("reason"), as the leave-day buttons already send.
- **What a row holds:** the field, its tier, old and new value, the action (`changed`, `status`, `shown`, `imported`, `bulk`, `created`, `deleted`, `restored`, `purged`), the reason, who and when.
  - Pay and identity values are stored encrypted.
  - A change is recorded only when the value really changes; a salary sent back as "85000.00" is not a change.
- **Who reads it** (`GET /employees/{id}/history`, filter by tier):
  - `hr.view` and `hr.manage` read every tier they may see. Pay and identity rows, with their old and new values, appear only with `hr.sensitive` (choice 4).
  - A manager with `hr.team` reads the work history of their line.
  - The person reads their own, pay details included unless HR switches that off.
  - Anyone else is refused.
- **History tab** on the record: newest first, in words ("Grace N. · Bank: KCB → Equity", "Account number was shown", "Record created"). Filters for Everything, Work, Personal, and Pay and identity. Reasons show beneath the change.
- **Tests:** `tests/Feature/HrHistoryTest.php` (2).
