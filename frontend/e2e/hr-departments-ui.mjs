// Browser check: HR stage 1b (docs/HR_STAGE1B_SPEC.md), builds D.1 and D.2. The Departments page: a head chosen per branch when adding, leads with
// their sensitivity, a department that needs a full lead flagged, the staff count opening the list. The department page: leads, people, spend,
// work it owns, moving people. The API is answered by the check itself; the rules are proved by HrDepartmentLeadsTest. Needs only the website.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Grace', email: 'grace@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'hr.view', 'hr.manage', 'books.view'], leads: [] } };
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');

let leads = [{ id: 1, employee_id: 7, name: 'Wanjiru Kamau', job_title: 'Site engineer', role: 'head', sensitivity: 'full' }, { id: 2, employee_id: 8, name: 'Otieno M.', job_title: 'Foreman', role: 'assistant', sensitivity: 'personal' }];
const depts = () => ({ ready: true, leads_ready: true, standard: ['Sales', 'Construction'], data: [
  { id: 11, location_id: 1, name: 'Construction', code: 'CON', is_active: true, employees_count: 4, location: { id: 1, name: 'Westlands' }, cost_centre: { id: 5, name: 'Construction', code: 'WL-CON' }, leads, needs_full_lead: false },
  { id: 12, location_id: 1, name: 'Design', code: null, is_active: true, employees_count: 2, location: { id: 1, name: 'Westlands' }, cost_centre: null, leads: [{ id: 3, employee_id: 9, name: 'Peter O.', role: 'head', sensitivity: 'work' }], needs_full_lead: true },
] });
const people = [{ id: 7, name: 'Wanjiru Kamau', job_title: 'Site engineer' }, { id: 8, name: 'Otieno M.', job_title: 'Foreman' }, { id: 9, name: 'Peter O.' }, { id: 10, name: 'Amina S.', job_title: 'Clerk' }];
let deptPage = { department: { id: 11, name: 'Construction', code: 'CON', is_active: true, branch: 'Westlands', location_id: 1, cost_centre: { id: 5, name: 'Construction', code: 'WL-CON', path: 'Head office › Westlands › Construction' } },
  leads, needs_full_lead: false, can: { move: true, leads: true, money: true },
  people: [{ id: 7, name: 'Wanjiru Kamau', job_title: 'Site engineer', status: 'active', manager: null, lead: 'head' }, { id: 12, name: 'Kamau J.', job_title: 'Mason', status: 'active', manager: 'Wanjiru Kamau', lead: null }],
  spend: { currency: 'KES', cost_centres: 3, month: { spent: 412500, income: 0 }, year: { spent: 3850000, income: 0 } },
  projects: [{ id: 509, number: 'BW-0509', title: 'Kilimani flats', state: 'open', lead: true }, { id: 510, number: 'BW-0510', title: 'Ruaka road', state: 'on_hold', lead: false }],
  others: [{ id: 10, name: 'Amina S.' }], departments: [{ id: 12, label: 'Westlands › Design' }] };

// the signed-in person as the app keeps them (the pages read their permissions from it)
await page.addInitScript((a) => localStorage.setItem('auth-storage', JSON.stringify({ state: a, version: 0 })), { user: me.user, isAuthenticated: true, access: me.access });
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route(/\/api\/admin\/departments(\?.*)?$/, (route) => json(route, depts()));
await page.route(/\/api\/admin\/departments\/bulk$/, (route) => { sent.push(['bulk', route.request().postDataJSON()]); return json(route, { message: 'Done' }, 201); });
await page.route(/\/api\/admin\/departments\/11\/leads(\/\d+)?$/, (route) => { const m = route.request().method(); sent.push(['lead', m, m === 'POST' ? route.request().postDataJSON() : route.request().url().split('/').pop()]);
  if (m === 'POST') { const b = route.request().postDataJSON(); const p = people.find((x) => x.id === b.employee_id); leads = [...leads.filter((l) => l.employee_id !== b.employee_id), { id: 9, employee_id: b.employee_id, name: p?.name, role: b.role, sensitivity: b.sensitivity }]; }
  return json(route, { leads }); });
await page.route(/\/api\/admin\/departments\/11\/page$/, (route) => json(route, deptPage));
await page.route(/\/api\/admin\/departments\/11\/people$/, (route) => { const b = route.request().postDataJSON(); sent.push(['move', b]); deptPage = { ...deptPage, people: b.to_department_id === 11 ? [...deptPage.people, { id: 10, name: 'Amina S.', job_title: 'Clerk', status: 'active', manager: null, lead: null }] : deptPage.people.filter((p) => p.id !== b.employee_id) }; return json(route, deptPage); });
await page.route(/\/api\/admin\/employees\/potential-managers/, (route) => json(route, { data: people }));
await page.route(/\/api\/admin\/locations\/?(\?.*)?$/, (route) => json(route, { locations: [{ id: 1, name: 'Westlands', is_active: true }, { id: 2, name: 'Mombasa', is_active: true }] }));
await page.route(/\/api\/admin\/employees(\?.*)?$/, (route) => { sent.push(['list', Object.fromEntries(new URL(route.request().url()).searchParams)]); return json(route, { data: [], current_page: 1, last_page: 1, total: 0 }); });

const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=HrApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); };

// ── the Departments page
await go('/admin/settings/departments');
await page.locator('[data-dept-page="11"]').waitFor({ timeout: 10000 });
ok('each department shows its head and assistants, and the staff count is a link to its people', /Construction\s*WL-CON\s*4 staff\s*Head: Wanjiru Kamau\s*· 1 assistant\(s\)/.test(await text(page.locator('[data-dept-page="11"]').locator('xpath=..'))) && (await page.locator('[data-dept-staff="11"]').getAttribute('href')) === '/admin/employees?department_id=11');
ok('a department without a lead who can see pay and identity is flagged', (await page.locator('[data-dept-orphan]').count()) === 1 && /Needs a lead with full sensitivity/.test(await text(page.locator('[data-dept-orphan]'))));

await page.getByRole('button', { name: 'Leads of Construction' }).click();
await page.locator('[data-dept-leads]').waitFor({ timeout: 5000 });
ok('the leads window lists the head and assistants with their sensitivity', /Wanjiru Kamau Head/.test(await text(page.locator('[data-dept-lead="Wanjiru Kamau"]'))) && (await page.getByLabel('Sensitivity of Otieno M.').inputValue()) === 'personal');
await page.getByLabel('Person', { exact: true }).selectOption('10');
await page.getByRole('button', { name: 'Add', exact: true }).last().click();
await page.locator('[data-dept-lead="Amina S."]').waitFor({ timeout: 5000 });
ok('a lead is added as an assistant at work out of the box', JSON.stringify(last('lead')) === JSON.stringify(['lead', 'POST', { employee_id: 10, role: 'assistant', sensitivity: 'work' }]));
await page.getByLabel('Sensitivity of Amina S.').selectOption('personal');
await page.waitForTimeout(200);
ok('a lead\'s sensitivity is changed in place', last('lead')?.[2]?.sensitivity === 'personal' && last('lead')?.[2]?.employee_id === 10);
await page.screenshot({ path: D + 'hr-department-leads.png', fullPage: true });
await page.getByRole('button', { name: 'Done' }).click();

await page.getByRole('button', { name: /Add department/ }).click();
await page.getByPlaceholder('Sales').fill('Sales');
await page.getByText('Westlands', { exact: true }).last().click();
await page.getByText('Mombasa', { exact: true }).last().click();
ok('adding a department asks for its head at each branch, and cannot be saved without them', (await page.locator('[data-dept-heads] select').count()) === 2 && await page.getByRole('button', { name: 'Add', exact: true }).last().isDisabled());
await page.getByLabel('Head at Westlands').selectOption('7');
await page.getByLabel('Head at Mombasa').selectOption('9');
await page.getByRole('button', { name: 'Add', exact: true }).last().click();
await page.waitForTimeout(300);
ok('each branch\'s department is made with its own head', JSON.stringify(last('bulk')?.[1]) === JSON.stringify({ name: 'Sales', location_ids: [1, 2], heads: { 1: 7, 2: 9 } }));

// ── the department page
await go('/admin/departments/11');
await page.locator('[data-department-page]').waitFor({ timeout: 10000 });
ok('the page shows its branch and its cost centre in Books', /Westlands/.test(await text(page.locator('[data-department-page]'))) && /Cost centre: Head office › Westlands › Construction \(WL-CON\)/.test(await text(page.locator('[data-department-cc]'))));
ok('spend comes from Books, its projects included', /This month KES 412,500 This year KES 3,850,000/.test(await text(page.locator('[data-department-spend]'))) && /the 2 under it \(its projects included\)/.test(await text(page.locator('[data-department-spend]'))));
ok('the work it owns, a shared one marked', /BW-0509 Kilimani flats BW-0510 Ruaka road · shared · on hold/.test(await text(page.locator('[data-department-projects]'))));
ok('its people, the head marked', /Wanjiru Kamau\s*Head\s*Site engineer\s*Active/.test(await text(page.locator('[data-department-person="Wanjiru Kamau"]'))));
await page.screenshot({ path: D + 'hr-department-page.png', fullPage: true });
await page.getByLabel('Move someone in').selectOption('10');
await page.getByRole('button', { name: 'Move in' }).click();
await page.locator('[data-department-person="Amina S."]').waitFor({ timeout: 5000 });
ok('someone is moved in', JSON.stringify(last('move')?.[1]) === JSON.stringify({ employee_id: 10, to_department_id: 11 }));
await page.getByLabel('Move Kamau J. to').selectOption('12');
await page.waitForTimeout(300);
ok('someone is moved out to another department', JSON.stringify(last('move')?.[1]) === JSON.stringify({ employee_id: 12, to_department_id: 12 }) && (await page.locator('[data-department-person="Kamau J."]').count()) === 0);

// ── the staff count's link opens the list for that department
await go('/admin/employees?department_id=11');
await page.waitForTimeout(800);
ok('the list opens filtered to that department', sent.some((x) => x[0] === 'list' && x[1].department_id === '11'));
await finish(c);
