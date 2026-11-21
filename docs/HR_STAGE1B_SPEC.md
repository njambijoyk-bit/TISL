# HR Stage 1b: Departments (spec)

Status: spec, waiting for the owner. It sits between stage 1 (built) and stage 2 (documents) of `docs/HR_HUB_PLAN.md`. The four choices at the end are my recommendations; say if any should change, or say "go".

The owner asked to close every gap around departments: seeing who is in one, a page for each, and projects belonging to a department.

## How it is today

- **Departments belong to a branch.** Sales at two branches are two departments (`departments`, script 101). Each department:
  - gets its own cost centre, made automatically under its branch's cost centre;
  - can have a head (`manager_employee_id`), though nothing uses the head yet.
- **People:** a person has a department (`employees.department_id`, kept in step with the old text column).
  - The Departments page shows a count per department ("3 staff"), but not who, and the count can't be clicked.
  - The employee list filters by the old department text.
- **Projects** belong to a branch, not a department. Each project's cost centre sits under the branch's "Projects" cost centre.
- **Pay** can already be split across cost centres. A person's home share goes to their department, and a project share can go to a project.
- **Books reports on a cost centre include everything under it.** That means where a project's cost centre sits decides whose spend it counts in.

## Builds

| Build | What |
|---|---|
| D.1 | **People in a department.** The staff count on the Departments page opens the employee list filtered to that department. The list's department filter uses departments, shown as "Westlands › Sales". The head shows on the Departments page and on each person's record. |
| D.2 | **The department page** (People → Departments → a department; also from a person's record). It shows the head, the branch, and the people in it with job, status and manager. It shows the cost centre and its spend this month and this year from Books, the department's projects included (see D.3), only with `books.view`. With Projects licensed, it lists the department's open work. The head and HR can move people in or out from here, and the move is written to each person's history. |
| D.3 | **Projects owned by a department** (only when Projects is licensed, switched on or off). A project gets an optional owning department, which must be at the project's branch. It is set on the project form, shown on the project, and filterable in the list. A new project with a department gets its cost centre under that department's ("Westlands › Construction › BW-0509"); without one it goes under the branch's "Projects" as today. Existing projects can be given a department; their cost centre moves only when asked (choice 3). |

Size: small to medium. One script (`272_departments_link.sql`: the owning department on projects, guarded). No new permission:
- departments need `costcentres.manage`, as today;
- people moves need `hr.manage`, or being the department head (choice 1);
- spend needs `books.view`;
- a project's department needs `projects.edit`.

## Four choices (my recommendation first; say if any should change)

1. **A department head sees their department's people the way a manager sees their line.** They see those people's work and personal details, and change their work details, alongside anyone below them in the HR line. They don't need `hr.team` for it. Pay and identity still need `hr.sensitive`. (The other way: the head is a label only, and seeing people keeps following the manager line.)
2. **A new project with a department files its costs under the department.** Its cost centre goes under the department's cost centre, so the department's spend in Books includes its projects. A project without a department stays under the branch's "Projects". (The other way: project cost centres always stay under "Projects", and the department is only a label for lists and reports.)
3. **Existing projects move only when asked.** Giving an existing project a department doesn't move its cost centre by itself. A button, "File its costs under Construction", does, for one project or all of them. It first shows how Books' totals for the department will change. The project's past entries stay on the same cost centre; only the roll-up changes. (The other way: move automatically as soon as a department is set.)
4. **Spend on the department page is for those who may see the books.** The figures come from Books by cost centre and are shown only with `books.view`, the same rule as the Books screens. Everyone else with access to the page sees the people and the work, but not the money. (The other way: anyone who can open the page sees the spend.)
