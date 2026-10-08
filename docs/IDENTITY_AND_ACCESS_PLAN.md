# Identity and access: clearance levels, roles, permissions and scope (R1 to R3 and the no-role-names sweep built; R4 onwards planned)

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

The `acts_as` column is kept for old data but **no decision reads it any more**: every check asks for a permission, so a role stands for exactly what it holds (the Senior accountant is no longer "Finance" anywhere).

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
| **Senior accountant** | 4 | global | all | books (view, post, review), payroll, stock, assets, vendors, credit, price lists, campaigns (build), menus; approves journals, purchases and refunds. No security, roles, modules or period locks |
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

### Behaviour changes in R1 to know about

1. Senior accountant, cashier and chef can open the admin area (`admin.access`). Cashier and chef see only what has no role restriction.
2. A **manager can no longer give the Finance role** (a manager's clearance is 3; roles are given only below your own clearance). Admin and super admin can.
3. Between the old roles the user-management hierarchy is unchanged. Roles it did not know (senior accountant, cashier, chef, custom roles) are placed by clearance: a manager can edit a cashier or chef, not a senior accountant.
4. The Employees screen refuses a role change to someone at or above your clearance, or to yourself.

## What R2 contains (built)

- **Every route guard is a permission.** The 75 `role:` guards (all but the customer and driver portals) became `permission:` guards with a catalogue of 58 permissions in groups (Books, Tax and money, Stock, Purchases, Customers, Payroll, People, Delivery, Catalogue, Campaigns, Menus, Marketing, Projects, Insight, Operations, Vault, Support, Access, System). Each permission's default holders reproduce the old role list exactly. This was **checked route by route against the original routes file for every older role: identical access on 1,299 routes**, apart from the two deliberate fixes below. A unit test keeps route and catalogue names in step.
- **Upgrade path.** The catalogue has a version (now 2). `php artisan access:seed` gives a newly added permission to the built-in roles that hold it by default, once, and never takes back a change an admin made. Run it after deploying R2 so existing installs get the new permissions.
- **Code checks.** `User::holdsAny()`, `hasPermission()` and `dataScope()` answer through the engine; `isAdmin()` means "may open the admin area". Policies, services and controllers that compared role names now accept every role a person holds (the sweep below then replaced the names with permissions). Tax certificate policies, campaigns, price lists and memoranda use permissions. "Who do we notify or ask to approve" queries use `User::withPermission(...)`; staff pickers use `User::staffAccounts()`. Edit windows (period guard) use the most generous limit across a person's roles. A sales rep's "own customers only" rule is the **assigned** data scope.
- **Screens.** Settings, Access, **Roles & access**: *People* (every staff account with clearance, default branch, extra roles and branch access; open one to change the main role, clearance, extra roles with dates, default branch, branch access with dates and a reason, and to see what it adds up to), *Roles* (role builder with a checklist of permissions grouped by area, modules, approval limits, read-only, hours, IP ranges, maximum discount; copy a role; built-in roles can be adjusted; the owner and portal roles are fixed), *Clearance levels* (rename), *Activity* (every change, plus what branch limits would have refused). Employees: the System Role list comes from the roles table (only roles you may give), and "who may report to whom" uses clearance for roles added since.
- **Two holes closed on the way.** Any staff member could bulk-import employees (with roles); import and template now need `hr.manage` and a file can only give roles below the importer's clearance. (R1 closed role changes in the Employees form.)

### Behaviour changes in R2 to know about

1. Bulk employee import and its template are for people with `hr.manage` (admin, super admin), no longer any staff member.
2. A person with an extra role never loses what their main role allows, but a rule written for one role name (for example "finance can only update themselves") now also applies to someone who merely holds that role as an extra. Data scope is the proper tool for "only their own": use it on new rules.

## What R3 contains (built): branch limits, books and stock

- **Per-area switch.** `database/sql/99_access_scope_settings.sql` adds `access_settings`. The owner sets **Off / Test / On** for each area (Books, Stock) and for a default, on Settings, Roles & access, **Branch limits**. Switching to On asks for confirmation and shows what Test mode recorded in the last 7 days. With no row, the server setting applies (Test).
- **Who is limited.** Staff whose roles are not global and who have a default branch or grants. Admin, super admin and the senior accountant never are; neither are customers, vendors, and anything run without a person (queues, the storefront checkout). Records with no branch stay visible to everyone. A view-only grant lets someone look but not post.
- **What is limited, in Books:** the voucher list and every voucher opened, exported, e-mailed or returned; the day book; the dashboard; trial balance, profit and loss, balance sheet, ledger statements, ageing; the movement, money-flow and compliance reports; the cheque register; memoranda; the edit log. **Posting** (a new voucher, an edit, cancel, convert, return, receive, settle a bill, apply credit, issue a gift voucher from a credit note) needs full access to the voucher's branch. Reports for a limited person say "these figures cover only your branches". Payments that settle a branch's bills are counted wherever they were taken.
- **In Stock:** transfers (yours when either end is; sending needs the sending branch, receiving needs the receiving branch), stock counts, jobs, the stock journal, the expiry list (write-off and return need the branch), and the stock reports. Branch pickers on the voucher form, transfers and counts show only the branches you may use (when the area is On); a new voucher starts at the person's own branch.
- **Test mode is useful.** Once an hour per person and screen it records how many records would have been hidden, and every post that would have been refused. The Branch limits tab shows the last 7 days per area and who is limited.
- **Posting through internal flows** (payroll, depreciation, gift voucher activation, loyalty rewards) is not blocked by branch limits: only the screens a person uses are.

## The no-role-names sweep (built): roles are data everywhere

The owner's rule: **no hardcoding**. A role built in the role builder must control everything without a code change. Before this sweep about 120 checks in code and screens still compared role names. Now none do.

- **One rule for code.** Every check is a permission (`hasPermission`) or the **kind of account**: staff (`admin.access`), driver (holds `driver.app`, not `admin.access`), or a portal account (customer, vendor, applicant) read from the role's kind. `User::isDriver()`, `isCustomer()`, `isVendor()`, `isPortal()`, `portalType()`; the `account:customer` route guard replaces `role:customer`; the `role:` middleware is gone. The access summary sent to the browser now carries `account`.
- **Catalogue version 3: 34 more permissions** (92 in all), one for each check that was left (books write-off and bounce, quotations, loyalty grant, deduct, configure and export, stock expiry override and alerts, HR view, team and purge, project management and moderation, campaign admin and purge, catalogue publish and purge, engagement view, moderate and settings, driver app, AI keys, vault bypass, deleting shipping options and tiers, and others). Each one's default holders are exactly the old role list, so nothing changes on an install that has not edited a role; `tests/Unit/NoRoleNamesInCodeTest.php` freezes that table. Run `php artisan access:seed` after deploying (it also turns the old stock-override and expiry-notice role lists into the two new permissions, once).
- **User management is by clearance.** You may see, change, suspend and delete people **below your clearance** (the owner: everyone) if your roles hold `users.manage`; `users.purge` deletes for good. Roles you may give when making or editing an account are the roles below your clearance, plus customer and vendor. The Users screen gets the role names, clearance and a `manageable` flag from the server; the Finance and Logistics tabs are gone (Staff, Drivers, Customers, Vendors, with a role filter built from the roles table).
- **Screens.** Every route guard, sidebar entry, tab and button asks for a permission. The employee form works out who may supervise a role from clearance (the manager must hold at least the clearance the role needs), the project thread uses `projects.manage` and `projects.moderate`, the role badge colour follows the clearance level. Settings that listed role names (stock override and expiry notices) became permissions given in the role builder.
- **Two guards keep it that way.** An ESLint rule (`no-restricted-syntax`) fails the build on `x.role === 'admin'`, on role names such as `super_admin` and `sales_rep` written in code, and on the old `hasAnyRole`; the PHPUnit test above fails on the same patterns in PHP, comments excluded. Role keys that are *data* (a vault policy naming roles) are still matched by `holdsAny($variable)`.

### Behaviour changes in the sweep to know about

1. **A manager no longer manages finance people.** Both are clearance 3 and you manage people strictly below you. (Lift the finance role to 4 or the manager to 4 in the role builder if that is not what you want.)
2. **Manager and sales rep hold `users.manage`**, so they keep what they could do before (see and edit people below them). Finance and logistics can still open the Users list (other screens use it as a picker) but cannot change anyone, and can read their own record. Before, a sales rep could not create users; now they can create the roles below their level (customers, cashiers).
3. **The Senior accountant is a role of its own.** Vault policies and anything else that matched "finance" no longer match them; name their role.
4. **Quotation write routes** (preview, update, send, withdraw) need `quotes.write` (logistics no longer can; the screen never offered it).
5. **Employees:** a new person needs a role chosen (no silent "sales rep"), a bulk-import file needs a `role` column (no silent "admin" from the department name), and "who may supervise" is by clearance: a finance person can no longer report to logistics, for example.
6. **Services trash:** permanent delete follows `catalogue.delete`, which the server always checked; the button used to be shown to super admins only. Admin and manager now see it. Take `catalogue.delete` off a role if that is too much.
7. **The assistant's payment summary** follows `books.view`; finance is no longer limited to payments they started.
8. **The memo dock** shows for staff only (vendors used to see it by accident).

### Not done yet

- Many `admin.access`-only staff routes (content pages, shipping options, referral codes and similar) still let any staff in; they never had a role check, so there was nothing to convert. A permission per area is the next sweep.
- The Purchases menu entry needs `books.view`, so a stock-only role (stock.view without books.view) has no menu entry for the stock pages yet.
- Branch limits do not cover customers' own statements and credit (a customer's balance is the whole business's), cash counts and petty cash (their tills are ledgers, not branches), held stock, the catalogue, delivery or HR. Those follow with cost centres, which give every ledger line and till a branch.
- A branch-limited person's balance sheet and trial balance show opening balances for the whole business with only their branches' movements. They are labelled; company-wide totals need someone with every branch.

## Rollout from here

**R4: employment link.** When employees reach the cost-centre plan, the default branch comes from the employee's location, departments and cost centres attach, and grants can target cost centres and companies.

**R5: housekeeping.** Effective access page, expiring-grants list, audit views, retire the `isAdmin()` name (it means "any staff").

R3 is done for Books and Stock; HR, delivery and the catalogue follow when those areas get cost centres. The build order of `docs/COST_CENTRES_AND_ENTITIES_PLAN.md` resumes now.

## Defaults chosen where there was no answer (change any of them)

1. Level names are as in the table above and can be renamed in the database.
2. Senior accountant: everything finance does, plus approvals and review; no edits to security, roles, modules or period locks. They may post and review; the voucher edit limits still apply.
3. Admin keeps what admin had (no payroll); the owner can grant it from the role builder.
4. Admin can give branch access and non-admin roles; only the owner makes admins and builds roles.
5. Cashier and chef are created now; chef is wired to Menus, cashier gets its till permissions when the till is tied to permissions. Teacher, librarian and pharmacist are not created yet: the owner builds them (or they ship with their modules).
6. Every existing branch assignment becomes a permanent grant, and staff with none keep seeing all branches until the owner switches `unassigned_sees_all` off.
