// Browser check: the project picker on Books' voucher form (build 4.1), and the Money settings in Projects configuration. The real voucher form
// is opened with a stand-in API: the picker shows per the rule for that kind of voucher, fills the cost centre, offers phases, says when it is
// required, and does not show at all when Projects refuses (not licensed, not on, or not this person's).
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'books.view', 'books.post', 'projects.use', 'projects.config.view', 'projects.config.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

// everything the voucher form loads that this check does not care about answers empty
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));   // most of what the form loads is a list
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/books/voucher-types**', (route) => json(route, [{ id: 1, code: 'PAY', name: 'Payment', base_type: 'payment', is_active: true, has_items: false }, { id: 2, code: 'JV', name: 'Journal', base_type: 'journal', is_active: true, has_items: false }, { id: 3, code: 'CT', name: 'Contra', base_type: 'contra', is_active: true, has_items: false }]));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, []));
await page.route('**/api/admin/books/payment-methods**', (route) => json(route, []));
await page.route('**/api/admin/cost-centres/options', (route) => json(route, { ready: true, line_override: false, data: [{ id: 1, name: 'Nairobi', depth: 0 }, { id: 9, name: 'M-0413 Imara Sacco v. Baraka Traders', depth: 2 }, { id: 12, name: 'Pleadings', depth: 3 }] }));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: { project: { name: 'Matter', plural: 'Matters' } }, keys: {} }));
let rules = { payment: 'required', journal: 'optional', contra: 'none' };
let refuse = false;
const PROJECTS = [{ id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', confidential: false, cost_centre_id: 9, phases: [{ id: 5, name: 'Pleadings', cost_centre_id: 12, child: false }] }, { id: 409, number: 'CV-0009', title: 'Duka Fresh lease', confidential: false, cost_centre_id: 15, phases: [] }];
await page.route('**/api/admin/projects/voucher-picker**', (route) => {
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['picker', q]);
  if (refuse) return json(route, { message: 'Not found.' }, 404);
  const base = { 1: 'payment', 2: 'journal', 3: 'contra' }[q.voucher_type_id];
  return json(route, { rule: rules[base], projects: rules[base] === 'none' ? [] : PROJECTS, current: null });
});

// ---------------------------------------------------------------- the picker on a payment
await go('/admin/books/vouchers/new?type=1');
await page.getByLabel('Project').waitFor({ timeout: 20000 });
ok('a payment, set to required, shows the picker and says it is required', /Project \(required\)/.test(await text()) && (await page.getByLabel('Project').getAttribute('required')) !== null);
ok('it lists the work with its phases under it', (await page.getByLabel('Project').locator('option').allInnerTexts()).join('|') === 'Choose the work…|M-0413 · Imara Sacco v. Baraka Traders|M-0413 › Pleadings|CV-0009 · Duka Fresh lease');
ok('the picker asks which kind of voucher it is for', last('picker')[1].voucher_type_id === '1');
await page.getByLabel('Project').selectOption('12');
ok('choosing a phase fills the cost centre field Books already has', (await page.getByLabel('Cost centre', { exact: true }).inputValue()) === '12');
await page.screenshot({ path: D + 'projects-voucher-picker.png', fullPage: true });
await page.getByLabel('Cost centre', { exact: true }).selectOption('9');
ok('and choosing the project\'s cost centre directly shows the project in the picker', (await page.getByLabel('Project').inputValue()) === '9');
await page.getByLabel('Cost centre', { exact: true }).selectOption('1');
ok('a cost centre that is not a project leaves the picker empty', (await page.getByLabel('Project').inputValue()) === '');

// ---------------------------------------------------------------- other kinds of voucher
await go('/admin/books/vouchers/new?type=2');
await page.getByLabel('Project').waitFor({ timeout: 20000 });
ok('a journal, set to optional, offers None', !/Project \(required\)/.test(await text()) && (await page.getByLabel('Project').locator('option').first().innerText()) === 'None');
await go('/admin/books/vouchers/new?type=3');
await page.getByLabel('Cost centre', { exact: true }).waitFor({ timeout: 20000 });
await page.waitForTimeout(500);
ok('a contra, set to not shown, has no picker and keeps its cost centre field', (await page.getByLabel('Project').count()) === 0);
refuse = true;
await go('/admin/books/vouchers/new?type=1');
await page.getByLabel('Cost centre', { exact: true }).waitFor({ timeout: 20000 });
await page.waitForTimeout(500);
ok('when Projects refuses (not licensed, not on, or not this person\'s) the form is exactly as before', (await page.getByLabel('Project').count()) === 0);
refuse = false;

// ---------------------------------------------------------------- the Money settings
let money = { bill_mode: 'draft', retention_mode: 'company', retention_ledger_id: 0, voucher_project: { payment: 'optional', journal: 'optional', contra: 'optional' } };
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, '');
  if (path === '/money') { if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['money', b]); money = b; }
    return json(route, { money, voucher_types: [{ key: 'payment', label: 'Payment' }, { key: 'journal', label: 'Journal' }, { key: 'contra', label: 'Contra' }], ready: true, can: { change: true } }); }
  return json(route, { ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, access: { warn_days: 7, default_hours: [], read_outside_hours: false, passes: true, pass_minutes: 60, unlock_minutes: 15, lock_tries: 5, lock_wait_minutes: 15, approval_hours: 24 }, version: 1, industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], viewing: 'legal', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
});
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Money' }).click();
await page.getByLabel('Project on a Payment').waitFor({ timeout: 15000 });
ok('out of the box bills are drafts and retention goes to one company ledger', (await page.getByLabel('Prepare a draft').isChecked()) && (await page.getByLabel('One company retention ledger').isChecked()));
ok('it says required is asked only on the Books form, never of the shop or the till', /the shop, the till and payment gateways are never held to it/.test(await text()));
await page.getByLabel('Post the voucher').check();
await page.getByLabel('A ledger per client').check();
await page.getByLabel('Project on a Payment').selectOption('required');
await page.getByLabel('Project on a Contra').selectOption('none');
await page.screenshot({ path: D + 'projects-money-settings.png', fullPage: true });
await page.getByRole('button', { name: 'Save the money settings' }).click();
await page.waitForTimeout(400);
const m = last('money')[1];
ok('the settings are sent together: post, a ledger per client, and the rule per kind of voucher', m.bill_mode === 'post' && m.retention_mode === 'client' && m.voucher_project.payment === 'required' && m.voucher_project.contra === 'none' && m.voucher_project.journal === 'optional', JSON.stringify(m));

await finish(c);
