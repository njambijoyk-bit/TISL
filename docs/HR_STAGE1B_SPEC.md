# HR Stage 1b: Departments (spec)

Status: being built. The owner answered the first version on 2026-11-21 and said "go" on this second version, so its four choices are taken as recommended. What is built is under "As built". It sits between stage 1 (built) and stage 2 (documents) of `docs/HR_HUB_PLAN.md`.

## The owner's answers (first version)

1. **Department leads with sensitivity.**
   - A department has leads: a head and any number of assistants, in that order of rank.
   - Each lead has their own sensitivity, meaning how much of their people's records they see.
   - One person can lead several departments with a different sensitivity in each.
   - **A department is never orphaned:** it always has at least one lead who can see the most sensitive details.
2. **Who a project belongs to.**
   - A project always belongs to a branch.
   - It may also belong to departments:
     - one department of that branch;
     - the same department at two or three branches;
     - several departments across several branches.
   - A department always comes after its branch. There is never a project with a department and no branch, and never a department without a branch.
3. **Cost centres nest.**
   - A branch is a cost centre, a department is a cost centre under it, and Books allows nesting.
   - No data has been entered yet, so a project's cost centre is filed under its department automatically, with nothing to move by hand.
4. **Catalogue permissions apply** throughout. For example, spend is shown with `books.view`, and leads with the most sensitive access must hold `hr.sensitive`.

## How it is today

- **Departments belong to a branch.** `departments.location_id` is required, so Sales at two branches are two departments (script 101). Each department:
  - gets its own cost centre, made under its branch's cost centre;
  - has one optional head (`manager_employee_id`), which nothing uses.
- **People:** a person has a department (`employees.department_id`). The Departments page shows a count per department but not who, and the employee list filters by the old text.
- **Projects** belong to a branch only. Each project's cost centre sits under the branch's "Projects" cost centre.
- **Books reports on a cost centre include everything under it.**
- **Gaps that stop a department from being orphaned:**
  - Nothing stops a branch from being switched off or deleted while it still has departments.
  - Nothing requires a department to have a head.

## What changes

### 1. Department leads, with sensitivity

- **Leads.** A department has exactly **one head** and any number of **assistants**. Each lead has a **sensitivity**:

  | Sensitivity | What they see of their department's people |
  |---|---|
  | Work | Job, department, manager, dates, status, skills (the work tier) |
  | Personal | Work, plus date of birth, emergency contact and similar (the personal tier) |
  | Full | Everything, pay and identity included (the sensitive tier) |

  - An assistant's sensitivity is never above the head's.
  - One person can lead several departments, each with its own sensitivity: for example head with Full in Westlands › Construction, and assistant with Work in Mombasa › Construction.
- **What a lead may do:**
  - See their department's people up to their sensitivity, alongside anyone below them in the HR line.
  - Change those people's work details (the head, and assistants with Personal or Full).
  - Approve for the department where later stages ask a department lead (leave in stage 4, overtime in stage 5).
- **Catalogue permissions still apply** (choice 1). Full sensitivity can be given only to someone who holds `hr.sensitive`, and it shows pay and identity only for people in that department.
- **Never orphaned.** Every department always has at least one lead with Full sensitivity. Anything that would break that is refused, and the message says to appoint another first:
  - removing that lead;
  - lowering their sensitivity;
  - taking `hr.sensitive` away from them;
  - ending, suspending or deleting their employee record;
  - deleting their account.
- **Making a department** means naming its head with Full sensitivity (choice 2). Adding the same department to several branches names a head for each branch.
- **The HR line:** the head counts as above everyone in the department, so the people in it appear in the head's team view.

### 2. Departments never without their branch

- A department always has a branch. This is already the case in the data.
- A branch with active departments can't be switched off or deleted; the message names the departments to move or close first.
- Every project link to a department is checked to be a department of a branch that project belongs to.

### 3. People in a department and the department page

- On the **Departments page**, the staff count opens the employee list filtered to that department, and each department shows its head and assistants.
- In the **employee list**, the department filter shows "Westlands › Sales". Each person's record shows their department and its head.
- The **department page** (People → Departments → a department, or from a person's record) shows:
  - its branch, head and assistants with their sensitivity, and its people (job, status, manager);
  - its cost centre and its spend this month and this year from Books, its projects included, only with `books.view`;
  - with Projects licensed, the work it owns.
- **Moving people** in or out is done from the page by HR (`hr.manage`) or the department's head, and is written to each person's history.

### 4. Who a project belongs to (when Projects is licensed, switched on or off)

- **Owners.** A project has one or more owners. Each owner is a branch, or a branch and one of its departments:

  | The owner wants | Owners on the project |
  |---|---|
  | This project belongs to this branch | Westlands |
  | This branch, and this department of it | Westlands › Construction |
  | This department, in two or three branches | Westlands › Construction, Mombasa › Construction |
  | These departments, in these branches | Westlands › Construction, Westlands › Design, Nairobi CBD › Design |

- **One owner is the lead** (choice 3). The lead's branch is the project's branch, and the project's costs are filed under the lead's cost centre in Books:
  - "Westlands › Construction › BW-0509" when the lead has a department;
  - "Westlands › Projects › BW-0509" when the lead is a branch only.
- **The other owners** see the project in their lists, on their department page and in their reports. Books totals stay with the lead.
- **Changing the lead** moves the project's cost centre under the new lead automatically. No data exists yet, and past entries keep their cost centre whatever happens; only the roll-up changes.
- **The project form** has an **Owners** section: choose a branch, then optionally its departments, add more branches, and mark one owner as the lead. The project list filters by branch and by department.
- **Who may change owners:** `projects.edit`, as for the rest of the project.

## Data

### Script `272_departments_link.sql` (adds only)

| Table | What it holds |
|---|---|
| `department_leads` | department_id, employee_id, role (`head` or `assistant`), sensitivity (`work`, `personal` or `full`), who appointed them and when. One head per department; a person once per department. |
| `project_owners` | project_id, location_id, department_id (empty = the whole branch), is_lead. One lead per project. The department must be at that branch. |

- Today's `departments.manager_employee_id` becomes that department's head, with Full sensitivity where the person holds `hr.sensitive`, otherwise Work. Departments without a Full lead are listed in Part C to put right. There is no data yet, so this is a safety net.
- Each existing project gets its branch as its lead owner.

## Builds

| Build | What |
|---|---|
| D.1 | Leads with sensitivity, the never-orphaned rule on every path, and branches that can't be closed while they have departments. The Departments page manages heads and assistants, and the access rules count leads (department people up to the lead's sensitivity, with `hr.sensitive` for Full). |
| D.2 | People in a department: the staff count opens the list, the list's department filter, the head on each record. The department page: leads, people, cost centre and spend (`books.view`), and moving people. |
| D.3 | Project owners: branch, branch and department, a department across branches, several departments. One lead files the costs, and the cost centre nests branch › department › project, moving when the lead changes. The project form and the list's filters. |

Size: medium. One script, no new permission. Departments need `costcentres.manage`, people moves need `hr.manage` or being the head, spend needs `books.view`, and project owners need `projects.edit`.

## Four choices (taken as recommended; say if any should change)

1. **Full sensitivity needs `hr.sensitive` in the catalogue.**
   - A lead can be given Full only if they hold `hr.sensitive`. Full then shows pay and identity for their department's people only.
   - Work and Personal need no extra permission: being the lead is enough.
   - The other way: a lead's sensitivity alone grants Full for their department, without `hr.sensitive`.
2. **A department is made with its head.**
   - Making a department asks for its head, with Full sensitivity, so it is never orphaned from its first moment.
   - The other way: a department may be made empty and flagged "needs a head", taking no people until it has one.
3. **One owner is the lead and files the costs.**
   - A project with several owners files its costs under one of them, the lead. The others share the work in their lists, pages and reports.
   - The other way: split the costs between owners by percentage, the way a person's pay can be split. That needs Books to split each entry across cost centres, which is a bigger change for later.
4. **Assistants can be any number, never above the head.**
   - One head per department, any number of assistants, each assistant's sensitivity at most the head's.
   - The other way: several heads of equal rank.

## As built

### D.1 Leads, sensitivity, never orphaned (done)

- **Script `272_departments_link.sql`:**
  - Creates `department_leads` and `project_owners`.
  - Each department's current head becomes a `head` at Work sensitivity. Part C lists departments still needing a Full lead.
  - Each existing project gets its branch as its lead owner, only if Projects is installed.
- **Leads** (`App\Services\Hr\DepartmentLeads`):
  - One head per department, any number of assistants. An assistant is never above the head.
  - When a new head is appointed, the old head becomes an assistant, and assistants above the new head come down to its level.
  - Full needs `hr.sensitive` (choice 1). A Full lead who loses `hr.sensitive` sees Personal until it is given back.
- **Never orphaned** (refused with a message naming the department):
  - removing the last Full lead, or lowering their sensitivity;
  - ending, suspending, deleting or purging their employee record;
  - deleting their account;
  - any role, grant or permission change that takes `hr.sensitive` from the last Full lead. Every change on the Access screens is checked: if it would leave a department without a Full lead, nothing is saved.
  - The Departments page flags any department that still needs a Full lead.
- **Departments are made with their head:**
  - Adding a department, or the same one at several branches, asks for a head for each branch. The head gets Full, so needs `hr.sensitive` (choice 2).
  - A department switched back on needs a Full lead.
  - The old head column follows the head.
- **Branches keep their departments:** a branch with active departments can't be switched off or deleted.
- **What a lead sees** (the employee access rules):
  - Their department's people, alongside anyone else they may see, at exactly their sensitivity. A lead who holds `hr.sensitive` but leads at Work still sees Work only in that department.
  - The head, and assistants at Personal or Full, change their people's work details.
  - Pay changes still need `hr.manage` with `hr.sensitive`.
  - A lead reads the history up to their sensitivity.
- **Leads in the app:**
  - The browser is told which departments a person leads, with their role and sensitivity.
  - The Employees menu and pages open for leads without an HR permission.
  - The employee routes rely on the employee rules instead of a route permission.
- **The Departments page:**
  - Shows each department's head and number of assistants. The staff count is a link to the employee list for that department.
  - A **Leads** window manages the head and assistants: change sensitivity, make someone head, remove, or add someone.
  - Adding a department asks for its head at each branch.
- **Also fixed:** "departments are set up" was remembered for the whole process, so it could answer from a moment when the tables were not there. It is now asked each time.
- **Tests:** `tests/Feature/HrDepartmentLeadsTest.php` (4).

### D.2 People in a department, and the department page (done)

Screens: `docs/screens/hr-department-leads.png` (the Leads window) and `docs/screens/hr-department-page.png`.

- **People in a department:**
  - The staff count on the Departments page links to the employee list for that department, with the filters open.
  - The list's department filter shows departments as "Westlands › Construction". Before script 101, the old text filter stays.
  - Each person's record shows their department as a link to its page, with its branch and head.
- **The department page** (`/admin/departments/{id}`; reached from the department's name on the Departments page and from each person's record):
  - **Who may open it:** HR (`hr.view` or `hr.manage`) and the department's leads.
  - **What it shows:**
    - its branch, and its cost centre with its path in Books;
    - its leads with their sensitivity, and a warning if it needs a Full lead;
    - its people (job, status, who they report to, lead role), each linking to their record;
    - with Projects licensed, the open work it owns, shared work marked "shared".
  - **Spend:** this month and this year from Books, on its cost centre and everything under it, so its projects' costs are included. Only with `books.view` (choice 4).
- **Moving people:**
  - "Move someone in", or "Move to…" on a row.
  - Allowed for HR (`hr.manage`), or the head of each department involved. A head can take in someone who has no department yet, but needs the other head (or HR) to take someone from another department.
  - The branch follows the department, so a person's department and branch never disagree.
  - The move is written to the person's history ("Moved on the department page"), and their home cost centre share follows.
- **Routes:** `GET /departments/{id}/page` and `POST /departments/{id}/people`. Each checks who may use it.
- **Tests:** `HrDepartmentLeadsTest` (now 6). Browser check `e2e/hr-departments-ui.mjs` (14), covering D.1 and D.2.
