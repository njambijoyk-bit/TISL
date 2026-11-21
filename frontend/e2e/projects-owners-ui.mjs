// Browser check: who a piece of work belongs to (HR stage 1b, docs/HR_STAGE1B_SPEC.md, build D.3). Starting work with owners (a branch, or a branch and
// one of its departments; one lead), the owners on the work's page and changing them, and the list's filter by branch or department.
// The API is answered by the check itself; the rules and the cost centre are proved by ProjectsOwnersTest. It needs only the website.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.create', 'projects.edit', 'projects.view_all'] } };
await page.addInitScript((who) => localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })), me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const words = { project: { name: 'Contract', plural: 'Contracts' }, client: { name: 'Client', plural: 'Clients' }, lead: { name: 'Contracts manager', plural: 'Contracts managers' }, reference: { name: 'Contract number', plural: 'Contract numbers' }, authority: { name: 'Approving authority', plural: 'Approving authorities' }, place: { name: 'Site', plural: 'Sites' } };
const options = { default_industry: 'construction', industries: [{ key: 'construction', name: 'Construction', group: 'common', is_active: true }], types: [{ id: 5, industry: 'construction', name: 'Building works', prefix: 'BW' }],
  branches: [{ id: 1, name: 'Westlands' }, { id: 2, name: 'Mombasa' }], departments: { 1: [{ id: 11, name: 'Construction' }, { id: 12, name: 'Design' }], 2: [{ id: 21, name: 'Construction' }] },
  leads: [{ id: 1, name: 'Kamau' }], priorities: ['low', 'medium', 'high', 'urgent'], words: { construction: words }, cost_centres: true, fields: {}, templates: {}, start_confidential: {}, can: { create: true, confidential: false } };
let owners = [{ location_id: 2, branch: 'Mombasa', department_id: 21, department: 'Construction', is_lead: true, label: 'Mombasa › Construction' }, { location_id: 1, branch: 'Westlands', department_id: 11, department: 'Construction', is_lead: false, label: 'Westlands › Construction' }];
const project = () => ({ id: 509, number: 'BW-0509', title: 'Coast road', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 5, name: 'Building works' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: { id: owners[0].location_id, name: owners[0].branch }, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: `${owners[0].label} › BW-0509 Coast road`, words, owners, can: { open: true, edit: true, stage: true }, locks: {}, fields: [] });

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: words }));
await page.route('**/api/admin/projects/options', (route) => json(route, options));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => {
  if (route.request().method() === 'POST') { sent.push(['create', route.request().postDataJSON()]); return json(route, { project: project() }, 201); }
  sent.push(['list', Object.fromEntries(new URL(route.request().url()).searchParams)]);
  return json(route, { data: [project()], total: 1, page: 1, per_page: 25, counts: { open: 1, on_hold: 0, closed: 0, cancelled: 0 } });
});
await page.route(/\/api\/admin\/projects\/509$/, (route) => json(route, { project: project() }));
await page.route(/\/api\/admin\/projects\/509\/owners$/, (route) => { const b = route.request().postDataJSON(); sent.push(['owners', b]);
  owners = b.owners.map((o) => { const br = options.branches.find((x) => x.id === o.location_id).name; const d = (options.departments[o.location_id] ?? []).find((x) => x.id === o.department_id); return { ...o, branch: br, department: d?.name ?? null, label: d ? `${br} › ${d.name}` : br }; }).sort((a, b) => b.is_lead - a.is_lead);
  return json(route, { owners, cost_centre_path: '' }); });

const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); };

// ── starting work with owners
await go('/admin/projects/new');
await page.locator('[data-owners]').waitFor({ timeout: 10000 });
ok('the form asks who the work belongs to, departments following the branch', (await page.getByLabel('Department of owner 1').isDisabled()) === true);
await page.getByLabel('Branch of owner 1').selectOption('2');
ok('a branch offers its own departments only', JSON.stringify(await page.getByLabel('Department of owner 1').locator('option').allInnerTexts()) === JSON.stringify(['The whole branch', 'Construction']));
await page.getByLabel('Department of owner 1').selectOption('21');
await page.getByRole('button', { name: 'Add another owner' }).click();
await page.getByLabel('Branch of owner 2').selectOption('1');
await page.getByLabel('Department of owner 2').selectOption('11');
await page.screenshot({ path: D + 'projects-owners-form.png', fullPage: true });
await page.locator('#project-title').fill('Coast road');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(500);
ok('the work starts with its owners, the lead\'s branch as its branch', JSON.stringify(last('create')?.[1]?.owners) === JSON.stringify([{ location_id: 2, department_id: 21, is_lead: true }, { location_id: 1, department_id: 11, is_lead: false }]) && last('create')?.[1]?.location_id === 2);

// ── the owners on the work's page, changed
await go('/admin/projects/509');
await page.locator('[data-project-owners]').waitFor({ timeout: 10000 });
ok('the work shows who it belongs to, the lead first', /Mombasa › Construction \(lead\)\s*Westlands › Construction/.test(await text(page.locator('[data-project-owners]'))));
await page.locator('[data-project-owners]').getByRole('button', { name: 'Change' }).click();
await page.locator('[data-owners]').waitFor({ timeout: 5000 });
await page.locator('[data-owner="1"]').getByLabel('Lead').check();
await page.getByLabel('Department of owner 1').selectOption('');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.locator('[data-project-owners]').waitFor({ timeout: 5000 });
ok('changing the lead sends the owners with the new lead', JSON.stringify(last('owners')?.[1]?.owners) === JSON.stringify([{ location_id: 2, department_id: null, is_lead: false }, { location_id: 1, department_id: 11, is_lead: true }]));
ok('and the page shows them', /Westlands › Construction \(lead\)\s*Mombasa/.test(await text(page.locator('[data-project-owners]'))));

// ── the list's filter
await go('/admin/projects');
await page.locator('#projects-owner').waitFor({ timeout: 10000 });
ok('the list offers branches and their departments', JSON.stringify(await page.locator('#projects-owner option').allInnerTexts()) === JSON.stringify(['Any branch or department', 'Westlands', 'Westlands › Construction', 'Westlands › Design', 'Mombasa', 'Mombasa › Construction']));
await page.locator('#projects-owner').selectOption({ label: 'Westlands › Design' });
await page.waitForTimeout(400);
ok('filtering by a department asks for the work it owns', last('list')?.[1]?.department_id === '12' && !last('list')?.[1]?.location_id);
await page.locator('#projects-owner').selectOption({ label: 'Mombasa' });
await page.waitForTimeout(400);
ok('and by a branch', last('list')?.[1]?.location_id === '2' && !last('list')?.[1]?.department_id);
await finish(c);
