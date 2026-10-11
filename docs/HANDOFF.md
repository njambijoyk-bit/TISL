# Handoff: carrying the TISL work to a new Claude Code session

Written at the end of a session. Read this first, then `docs/MENUS_PLAN.md` (status paragraph at the top).

## Where things stand

- Repo: `njambijoyk-bit/tisl` (GitHub). Work branch: **`tisl_v2`**. Last commit: `70d274c` (Menus step 9). Never push to another branch without being told to; **never open a pull request unless asked**.
- Stack: Laravel 12 backend (`backend/`), React/Vite frontend (`frontend/`).
- Done and pushed: the security work (break-glass recovery, Council of Two, passkey strength per role, assisted recovery, reset sign-in methods, email sign-in link, faster approvals) and the **Menus module steps 1 to 9**: foundation, menus and choices, online pickup/delivery, kitchen screens, counter/till, tables and floor, self-order kiosk, chefs, kitchen operations.
- Full backend suite: 1556 tests. Two known failures, both unrelated to Menus: `ExampleTest` (home `/` gives 404) and `SecurityLogTest::test_the_lines_can_be_narrowed_by_how_serious_which_kind_who_and_when` (breaks after midnight Nairobi time).

## What the owner must do (not code)

1. Run SQL scripts **132 to 142** in `backend/database/sql/` in MySQL Workbench, in order, each one separately. They are safe to run twice. Script 132 was fixed and should be re-run if it was run earlier.
2. Admin → Menus → Settings: sales account, tip ledger, service-charge ledger and percentage, table-QR ordering switches. Then switch on the channels (online pickup/delivery, counter, kiosk) and make the stations, kiosks and chef profiles.
3. Books → Settings → Default ledgers: **Stock Loss** and **Stock** (the waste log needs them). Turn on the **Purchase Order** voucher type. Set `reorder_level` on ingredient items.
4. Keep the scheduler running. Menus jobs: `menus:sweep-orders` (every 5 min) and `menus:chef-certs` (daily 07:35). Also earlier: `access:seed`, `security:check`.

## Next work, in order

1. **Cooking services** (next in `MENUS_PLAN.md`). Read the plan section on it first; it was not started. Follow the same recipe as steps 3 to 9 (below).
2. **Courses** (plan in `docs/COURSES_PLAN.md`, written, nothing built yet; owner chose it before cooking services). Includes the Courses hook: The chef profile already has an "teaches" switch (`is_instructor`) waiting for it.
3. Backlog from the "not built yet" lists (confirm priority with the owner before starting any):
   - Till: discounts, cash drawer and shift close, offline till (the owner wants this later), refunds from the till.
   - Kiosk: "now serving" display, kiosk-only prices, card payment at the screen.
   - Floor: making a reservation from the floor, split-by-seat, order transfer between branches.
   - Chefs: rotas and shifts (use Attendance for now).
4. Housekeeping: fix or delete the two unrelated failing tests above; one eslint warning remains in `frontend/src/App.jsx` line ~412 (exhaustive-deps), old and harmless.

## The owner's standing rules (follow them)

- Every step is **tested, mutation-checked, committed and pushed**. Before wrapping up, tell the owner briefly what they must run or configure.
- Owner decisions already made: set up for all business kinds (single or chain is decided by the Locations table); ingredient families with a preferred item and substitutes; one hidden stock item per dish; we build our own kitchen screens; tips and service charge are accounting (ledgers chosen in Menus settings); table-QR ordering needs no sign-in; kiosk-style receipt with free removals; offline till wanted later.
- The owner answers "go" to approve each next step. Offer the next step in one line at the end.
- Commit messages end with these two lines:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  Claude-Session: <the new session's link, if the tool gives one>
  ```
  Use whatever attribution the new session's own instructions give.

## How each step was built (repeat this)

1. Plan the slice from `docs/MENUS_PLAN.md`. Read the existing services first and reuse them (vouchers, stock write-off, gateway payments, notifications).
2. SQL script `backend/database/sql/NNN_menus_<name>.sql` (idempotent). Add every new table to `app/Services/Backup/ModuleTables.php` under `'menus'` (a backup-map test fails if you forget).
3. Models in `app/Models/Menus/`, logic in `app/Services/Menus/`, thin controllers in `app/Http/Controllers/Admin/` or `Api/`, routes in `routes/api.php`.
4. **Schema guards**: code must work before the owner runs the new script. Follow the `installed()` pattern (`KitchenService`, `FloorService`, `KioskService`, `ChefService`, `WasteService`: memoised, live check when `app()->runningUnitTests()`).
5. Tests in `backend/tests/Feature/Menus*Test.php`. Reuse the helper traits in `tests/Feature/Concerns/`: `CreatesCounterWorld` (all Menus tables, mocked voucher and payment services, channels, a station), `CreatesDishTables`, `CreatesMenusTables`. Test-fixture traps: use uniform keys in multi-row inserts; mocks must return real models or Collections; re-fetch models after a failed transaction (`->fresh()`); `voucher_types` needs `is_active`; the `users` test table needs soft deletes.
6. **Mutation check**: a small script changes one line, runs the step's test file, and expects a failure. Write the list of rules to break, run it, and add a test for every survivor (or note it as equivalent). Keep the script in your scratchpad, not the repo.
7. Frontend: API methods in `frontend/src/_shared/api/menus.js` (or `menusPublic.js`, `kiosk.js`), pages in `frontend/src/menus/pages/admin|public/`, a tab in `MenusNav.jsx`, a lazy route in `App.jsx`. Run `npx eslint src/menus` and `npx vite build`.
8. Browser check: `frontend/e2e/menus-<name>-ui.mjs`. Register the page in `frontend/e2e/harness.html` (and add it to the wide-page list if it is a whole page), update the nav-tab count in `e2e/menus-ui.mjs` (now **11**), add a line to `frontend/e2e/README.md`.
   - Servers: `php backend/tests/e2e/boot.php /tmp/tisl-e2e.sqlite`, `bash backend/tests/e2e/serve.sh` (API on :8000), `cd frontend && npx vite --port 5177 --strictPort`. Chromium is pre-installed; do not run `playwright install`.
   - Gotchas: with `page.route`, the **last registered route wins**, so register specific routes after general ones; `**/x/*` also matches `?query`; `innerText` applies CSS uppercase.
9. Update the status paragraph in `docs/MENUS_PLAN.md`, run the full backend suite (`cd backend && vendor/bin/phpunit`, about 3.5 minutes), commit, push to `tisl_v2`, then report to the owner.

## Linking two Claude accounts

There is no way to merge or link two Pro accounts, and a session cannot be moved between accounts. The repo is the bridge, and everything needed is in it (this file, `MENUS_PLAN.md`, the code, the tests). To continue on the other account:

1. On the other account, connect GitHub at claude.ai (Settings → Connectors) and give it access to `njambijoyk-bit/tisl`. If the Claude GitHub App is not installed on the repo, install it at https://github.com/apps/claude/installations/select_target (an owner of the GitHub account must do this).
2. Start a new Claude Code session on that repo and branch `tisl_v2`.
3. First message to paste:
   > Read `docs/HANDOFF.md` and the status paragraph at the top of `docs/MENUS_PLAN.md`, then continue with the next step. Develop on `tisl_v2`, do not open a pull request, and follow the standing rules in the handoff.
4. Each account has its own usage limit, so alternate sessions rather than running both at once on the same branch. Before starting, run `git pull origin tisl_v2`; before stopping, commit and push. Unpushed work in a cloud session is lost when the container is reclaimed.
