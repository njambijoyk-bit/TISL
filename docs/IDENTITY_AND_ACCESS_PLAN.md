# Identity and access: clearance levels, roles, permissions and scope (R1 built; R2 onwards planned)

Why first: cost centres, branches, entities, payroll and every module (kitchen, school, library, pharmacy) ask the same question: **may this person do this, on this branch, at this moment?** One engine answers it, and the engine is data driven: Chef, Librarian or Foreman are rows in a table, never new code.

## The decision: numbered clearance

The owner chose a numbered system: *clearance level 6 has these roles, these roles have permissions, module access and data scope.* It is built like this, so that the number never becomes a second, competing source of permissions:

- **Clearance is a ceiling and an authority, not a permission.** A person has a clearance number (0 to 6). It decides (1) which roles they may hold (a role names the lowest clearance that may hold it) and (2) whom they may manage and which roles and levels they may give (only people and roles strictly below their own clearance; the owner, level 6, is above all).
- **A role is the thing that grants.** Permissions, modules, approvals and restrictions all hang on roles. Nothing is granted by the number alone.
- **Where and until when** come from branch scope and time-limited grants.

| Level | Default name (renamable) | Who |
|---|---|---|
| 0 | No staff access | Customers, vendors, applicants. They see only their own things |
| 1 | Staff | Cashier, chef, driver |
| 2 | Officer | Sales rep, logistics |
| 3 | Manager | Manager, finance |
| 4 | Senior | Senior accountant |
| 5 | Administrator | Admin |
| 6 | Owner | Super admin. Only the owner makes administrators |

## What a role is

```
Role
 ├─ Identity            key, name, kind (staff | portal), description, active, built-in or custom
 ├─ Clearance           the lowest level that may hold it (min_clearance)
 ├─ Permissions         books.post, stock.manage, menus.manage ... (from the catalogue, declared per module)
 ├─ Module access       which modules the role may open ('*' = all). A module that is switched off never opens, whatever the role says
 ├─ Data scope          all | assigned | own   (which records inside a branch)
 ├─ Approval authority  journal.approve, purchase.approve, refund.approve, campaign.publish, each up to an amount (empty = no limit)
 ├─ Location scope      global (never bound by branches) | assigned (default branch + grants) | own
 └─ Restrictions        read only; working hours and days (overnight shifts work); allowed IP addresses or ranges; maximum discount %
```

A role can also carry **acts_as**: the old role names it still satisfies in the route checks that have not been moved to permissions yet (Senior accountant acts as Finance).

## Who holds what

- A person has a **primary role** (the existing `users.role` column stays, so every old screen keeps working) and may hold **extra roles**, each optionally between two dates. Extra roles above the person's clearance do not count; the primary role always counts.
- A person's **default branch** (`users.default_location_id`) plus **access grants** (`user_access_grants`: branch now, cost centre and company later; full or view only; start and end date; reason; revoke) make their branch scope. Admin, super admin and senior accountant are global and never bound by branches.
- **Unassigned staff**: a staff member with no default branch and no grants sees all branches (today's behaviour), switchable with `ACCESS_UNASSIGNED_SEES_ALL=false` in `.env` when the owner wants to tighten.
- Portal roles (customer, vendor, applicant) never hold permissions. Their screens check ownership.

## The engine (`App\Services\Access\Authorizer`)

`can($user, 'books.post', ['location_id' => 3, 'ip' => ..., 'at' => ...])` returns a decision with a reason code (`no_permission`, `module_off`, `no_module_access`, `read_only`, `outside_hours`, `ip_blocked`, `outside_scope`, `inactive`, `unknown_permission`) and a plain message. Around it: `scope()`, `locationIds()`, `canAccessLocation()`, `dataScope()`, `approvalLimit()` and `mayApprove($amount)`, `restriction()`, `canAssignRole()`, `canManage()`, `canGiveClearance()`, `summary()`.

- **Route guards.** `permission:books.view` (any of several: `permission:menus.view,menus.manage`) and the old `role:` guard, which now matches any role held plus the names those roles act as. If the request names a branch (`location_id` or `location`), the branch scope is checked too.
- **Branch scope has three modes** (`ACCESS_SCOPE_MODE`): `off`; `log` (default: allowed, but what would have been refused is written to the access log, once an hour per person, permission and branch); `on` (refused). It starts on `log` so nothing disappears by surprise.
- **Before the script is run** the engine answers from the built-in catalogue and the old `users.role`, so the code can be deployed ahead of the database and nothing changes.
- **Safety.** The last owner cannot be lowered or removed. A person cannot manage themselves (except the owner). Nobody can give a role, clearance or permission above or outside their own. Every change is written to the access log.

## Built-in roles (the catalogue is `App\Services\Access\Catalog`)

| Role | Level | Location scope | Data | Holds |
|---|---|---|---|---|
| Super admin | 6 | global | all | everything, always (also permissions added later) |
| Admin | 5 | global | all | everything except modules, developer tools, role building, period locks and payroll (payroll is finance and super admin only, as before) |
| **Senior accountant** | 4 | global | all | books (view, post, review), payroll, stock, assets, vendors, credit, price lists, campaigns (build), menus; approves journals, purchases and refunds. No security, roles, modules or period locks. Acts as Finance |
| Manager | 3 | assigned | all | books (view), stock, assets, vendors, menus (view), campaigns (build, publish), price lists, catalogue delete, credit, deliveries |
| Finance | 3 | assigned | all | books (view, post), payroll, stock, assets, vendors, menus, campaigns (build), price lists, credit |
| Logistics | 2 | assigned | all | deliveries |
| Sales rep | 2 | assigned | assigned | campaigns (build), price lists |
| Cashier | 1 | assigned | own | opens the admin area; till permissions are added when the till features are tied to permissions |
| Chef | 1 | assigned | all | recipes and production (Menus module) |
| Driver | 1 | assigned | own | driver screens only |
| Customer, Vendor, Job applicant | 0 | own | own | nothing (portal) |

The permission set reproduces today's route lists exactly (each permission stands for one of the role lists the routes used), then adds the new roles. Any person with a role name the catalogue does not know is kept as an empty staff role, so nobody silently loses anything.

## What R1 contains (built)

- **Script** `database/sql/98_access_engine.sql` (ten tables, `users.clearance_level`, `users.default_location_id`, `users.role` widened to text). Then **`php artisan access:seed`**: loads levels, permissions and roles (adds only what is missing, never takes back an admin's change, always restores the owner's permissions), gives every user a primary role row and a clearance, turns each `location_user` row into a permanent grant and sets the default branch. Safe to re-run.
- **Engine**, `permission:` guard, `role:` guard on top of the engine, the `access` block in the `/login` and `/me` responses (clearance, roles, permissions, scope), `User::accessSummary()`, an observer that keeps the access tables in step when any older screen creates a user or changes a role.
- **Admin API** `/api/admin/access` (overview, user detail, log; clearance, default branch, main role, extra roles with dates, branch grants with dates and reason; create, edit and delete roles with permissions, modules, approvals and restrictions; rename levels). Reading needs `access.view`, giving people roles and branches needs `access.manage`, building roles and renaming levels needs `access.roles` (owner only by default).
- **Route gates moved to permissions** (same behaviour for existing roles): the admin area (`admin.access`), module set-up, payroll (`payroll.run`), Menus (`menus.view`, `menus.manage`).
- **Closing two holes found on the way.** The Employees screen could set any role including super admin with no authority check and let people change their own role; it now checks the authority rules, offers the roles from the table, and works out "who may supervise whom" by clearance for roles added since (the old table still decides for the old roles). The Users policy places roles it does not know by clearance, so a manager cannot edit a senior accountant.
- **Frontend**: the auth store keeps `access`; `roles.js` gains `hasPermission`, `hasAnyRole`, `effectiveRoles`, `isStaff`, and the finance, payroll, credit and catalogue helpers ask the engine first; the admin route guard, the navigation (`perm` on an entry is checked against the engine) and the header use it.
- **Backup map** lists the new tables.

### Behaviour changes to know about

1. Senior accountant, cashier and chef can open the admin area (`admin.access`). Cashier and chef see only what has no role restriction.
2. A **manager can no longer give the Finance role** (a manager's clearance is 3; roles are given only below your own clearance). Admin and super admin can.
3. Between the old roles the user-management hierarchy is unchanged. Roles it did not know (senior accountant, cashier, chef, custom roles) are placed by clearance: a manager can edit a cashier or chef, not a senior accountant.
4. The Employees screen refuses a role change to someone at or above your clearance, or to yourself.

### Not done yet (R1 limits)

- A **custom role only works on `permission:` routes** and the screens converted so far. The other ~75 route groups and the ~150 screen checks still look at role names (Senior accountant passes the finance ones through `acts_as`). Converting them module by module is R2.
- No screens for the new data yet (R2). The API is complete, so a role can be built with it today.
- Branch scope is **not enforced** anywhere yet except in `log` mode on routes that name a branch (R3).

## Rollout from here

**R2: permissions everywhere and the screens.** Convert the remaining route groups and backend role checks to `permission:` (books first, then stock, HR, campaigns, delivery, vendors), the frontend `can()` replaces the role lists, and the screens: Roles (role builder with a checklist grouped by module, restrictions, approvals), Users (clearance, roles with dates, default branch, branch grants with dates and reason, effective access), the access log, and "grant expiring soon".

**R3: branch scope enforcement.** Books first (registers, day book, reports, posting refused to an out-of-scope branch), then stock, HR and the rest. Starts in `log`, then `on` per module once the log is quiet. Data scope (all, assigned, own) is applied to lists in the same pass.

**R4: employment link.** When employees reach the cost-centre plan, the default branch comes from the employee's location, departments and cost centres attach, and grants can target cost centres and companies.

**R5: housekeeping.** Effective access page, expiring-grants list, audit views, retire the `isAdmin()` name (it means "any staff").

After R2 the build order of `docs/COST_CENTRES_AND_ENTITIES_PLAN.md` resumes.

## Defaults chosen where there was no answer (change any of them)

1. Level names are as in the table above and can be renamed in the database.
2. Senior accountant: everything finance does, plus approvals and review; no edits to security, roles, modules or period locks. They may post and review; the voucher edit limits still apply.
3. Admin keeps what admin had (no payroll); the owner can grant it from the role builder.
4. Admin can give branch access and non-admin roles; only the owner makes admins and builds roles.
5. Cashier and chef are created now; chef is wired to Menus, cashier gets its till permissions when the till is tied to permissions. Teacher, librarian and pharmacist are not created yet: the owner builds them (or they ship with their modules).
6. Every existing branch assignment becomes a permanent grant, and staff with none keep seeing all branches until the owner switches `unassigned_sees_all` off.
