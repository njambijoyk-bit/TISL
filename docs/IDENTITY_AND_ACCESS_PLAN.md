# Identity and access: roles, scope and grants (DRAFT, nothing built, nothing decided yet)

Why first: cost centres, branches, entities, payroll and every future module (kitchen, school, library, pharmacy) ask the same question: **may this person do this, on this branch, now?** One engine should answer it. This plan builds that engine first, without breaking what works today.

## What the code does today (checked)

- A user has **one** role in `users.role` (a string; the first migration made it an enum of five values, later scripts added finance, logistics, driver, vendor, applicant, so the real column type must be checked before adding roles). Portal roles (customer, vendor, applicant) share the column with staff roles.
- `users.permissions` (JSON) exists from the first migration; nothing relies on it.
- The `role:` route middleware (`CheckRole`) just checks `in_array(user.role, [...])`. It is used on **79 route groups** with about 15 different role lists. Beyond routes there are about **172 role string checks in the backend** (policies, services, settings that store role lists such as stock override and notify roles, activity feed roles), **130 authorize/Gate calls** (9 policies) and about **159 role checks in the frontend** plus constants in `roles.js`.
- **Branch access exists on paper only.** `location_user` (user, location, role_scope), `User::canAccessLocation()` and `accessibleLocationIds()` exist, but **nothing calls them**: no query is scoped by branch today. The rule inside them says "a user with no branches assigned sees all", and admin and super admin see all.
- `User::isAdmin()` actually means "any staff role". The name is a trap and should be renamed over time.
- `location_user` has no dates (no time-limited access).

## Principles

1. **Roles are data, not code.** A role is a row with a set of permissions. Chef, teacher, librarian, pharmacist and cashier are rows, not new code branches.
2. **A person can hold several roles.** Their access is the combination.
3. **Permissions are explicit.** A rank on a role is only for "who may manage whom". It never grants anything by itself.
4. **Where and when are separate from what.** What a person may do comes from roles. Where (which branches, later which cost centres and companies) and until when comes from scope and grants.
5. **Job title is not a role.** "Senior Pharmacist" is employment (a free text position). The security roles are Pharmacist, Inventory Manager and so on.
6. **Do not rewrite everything at once.** `users.role` stays as the person's **primary role** and the old `role:` middleware keeps working, now matching **any** role the person holds. Convert to permission checks module by module afterwards.
7. **Never lock people out.** Super admin cannot lose access; the last super admin cannot be removed; enforcement of branch scope goes in as "log only" first.

## Model

```
users                  existing; users.role stays = primary role (compat, display)
roles                  key, name, kind (system | custom), rank, scope_type (global | assigned),
                       module (null = core), description, is_active
permissions            key (books.view, books.post, stock.adjust, kitchen.record_wastage ...), module, label
role_permissions       role_id, permission_id
user_roles             user_id, role_id, starts_at, expires_at   (the extra roles; primary role is also a row)
user_access_grants     user_id, resource_type (location | cost_centre | entity), resource_id,
                       access (full | view), starts_at, expires_at, granted_by, reason, status
```

- **Default branch** of an employee is `employees.location_id` (comes with the cost-centre plan, step 3). Until then it is the user's existing `location_user` rows, migrated as permanent grants.
- **Effective scope** of a user right now: `global` if any current role is global (super admin, admin, senior accountant); otherwise the default branch plus every grant that is current (started, not expired, active).
- **Permissions** that appear in the role builder come from the **licensed modules** only. Each module declares its own permissions, so a school's Teacher role can be built the day the school module arrives.

## The engine (one place that answers everything)

`AccessService`:
- `can($user, 'books.view')`: any current role holds the permission.
- `locationIds($user)`: `null` for global, otherwise the list of branches in scope today.
- `canAccessLocation($user, $id)` and a query helper `visibleTo($user)` that every list, report and posting uses.
- `effective($user)`: everything the person can do and where, for an "Effective access" page and for support.

The `role:` middleware calls it, so multi-role works immediately. A new `permission:books.view` middleware is added for converted routes. `/me` returns `roles`, `permissions` and `scope`, and the frontend gets one helper, `can(user, 'books.view')`, to replace the role lists in `roles.js` over time.

## Roles to start with

| Role | Scope | Notes |
|---|---|---|
| Super admin | global | everything, including security settings. Only super admin makes or removes admins |
| Admin | global | everything except what is reserved for super admin |
| **Senior accountant** (new, third after admin) | global for financial data | sees all branches; can post, review, reconcile, view branch figures; cannot change security settings, tax configuration, create admins or delete the audit trail |
| Manager | assigned | default branch plus grants |
| Finance | assigned | only branches assigned or granted |
| Sales rep, logistics, driver | assigned | as today |
| Cashier, chef, teacher, librarian, pharmacist | assigned | created as role rows from the start; their permissions fill in as modules arrive (cashier and chef can be wired to the till and kitchen features that exist) |

Visibility scope and administrative authority are separate: a senior accountant sees every branch but cannot alter security settings.

## Who may do what with access

- Super admin assigns roles and grants, and can create custom roles. Admin may grant branch access and assign non-admin roles (to be confirmed). Nobody can grant a role of higher rank than their own.
- A grant carries a reason and optional end date. Expired grants stop working by themselves (worked out when read, no scheduled job needed). A calendar reminder before a grant expires is optional.
- Admin and super admin are never bound by branch scope.
- Every role change and every grant is written to the audit log.

## Rollout, in order

**R1: foundation, no visible break**
- Script: `roles`, `permissions`, `role_permissions`, `user_roles`, `user_access_grants`; seed the roles above; fill `user_roles` from each user's current role; migrate `location_user` rows into permanent grants; check and widen the `users.role` column.
- `AccessService`; `CheckRole` matches any current role; senior accountant added to every route role list that has finance, and to the frontend finance constants; `/me` returns roles and scope.
- Users screen: add extra roles to a user; Access grants (branch, dates, reason).

**R2: permissions and the role builder**
- Permission catalogue derived from today's route role sets (so behaviour stays identical), role builder screen (custom roles with a permission checklist grouped by module), `permission:` middleware, and conversion of routes module by module (books first, then stock, HR, campaigns...). Backend role string checks and policies converted in the same passes; the frontend `can()` replaces the role lists.

**R3: branch scope enforcement**
- Books first (registers, day book, reports, posting refused to an out-of-scope branch), then stock, HR and the rest. Starts in **log-only mode** (records what it would have denied) so nothing disappears by surprise, then switches on per module.
- Because today "no branches assigned means all", the migration gives every existing non-admin staff member their current effective branches as permanent grants. Nothing changes on day one; you then tighten.

**R4: employment link**
- When the cost-centre plan reaches employees: default branch comes from `employees.location_id`, departments and cost centres attach, and grants can target cost centres and companies too.

**R5: housekeeping**
- Effective access page, expiring-grants list, audit views, retire `isAdmin()` naming.

After R1 and R2 the build order of `docs/COST_CENTRES_AND_ENTITIES_PLAN.md` resumes.

## What not to build

- A second numeric "clearance level" axis next to roles. It would duplicate roles and rank and make the rules hard to explain. If you want the word "clearance" in the screens, call the bundle of roles, scope and grants a person's **access profile**.
- A free-form rule engine for arbitrary conditions. Dates on roles and grants, plus branch, cost centre and company scope, cover the stated needs and are testable.

## Open questions

1. Name in the screens: "Access profile" (suggested) or "Security clearance"? Is rank used only for "who may manage whom" enough, or do you want numbered levels?
2. Senior accountant: confirm the list of what is allowed and not allowed. May they edit vouchers or only post and review?
3. Who may grant branch access: super admin only (as you said) or admin as well?
4. Current users: all keep their present role as primary. Anyone to move to senior accountant now?
5. Which of cashier, chef, teacher, librarian and pharmacist get real permissions now (cashier and chef can use existing features) and which are created empty?
6. Migration rule: give every existing non-admin staff member their current branches as permanent grants so nothing changes on day one, then you tighten. Agreed?
