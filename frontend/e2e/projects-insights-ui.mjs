// Browser check: insights (stage 12). KPIs in Configuration (12.1): the list with targets in the measure's unit, adding one (amber on the right
// side of green, from Books marked). The API is answered by the check itself; what each measure works out is proved by ProjectsKpisTest.
// Scorecards (12.2): the scorecard on a work with eight weeks, a money figure from Books, and health in the list with its filter.
// It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.config.view', 'projects.config.manage', 'projects.kpis', 'projects.rules', 'projects.insights', 'projects.insights.team', 'projects.capacity', 'projects.money.view'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/configuration(\?.*)?$/, (route) => json(route, { ready: true, general: { default_industry: 'construction', project_may_use_other_industry: true, trash_days: 30 }, access: null, version: 1, industries: [{ key: 'construction', name: 'Construction', group: 'common', is_active: true }], viewing: 'construction', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } }));
const M = (key, name, unit, about, higher, books = false) => ({ key, name, unit, about, higher, books, how: `How ${name} is worked out` });
const measures = [M('tasks_on_time', 'Tasks done on time', 'pct', 'work', true), M('snags_open', 'Snags open', 'count', 'work', false), M('budget_used', 'Budget used', 'pct', 'work', false, true), M('utilisation', 'Utilisation', 'pct', 'person', true), M('win_rate', 'Win rate', 'pct', 'company', true)];
let kpis = [{ id: 1, key: 'all_tasks_on_time', measure: 'tasks_on_time', name: 'Tasks done on time', industry: null, type_id: null, type: null, target_good: 90, target_warn: 75, client_sees: false, is_active: true, unit: 'pct', about: 'work', higher: true, books: false },
  { id: 2, key: 'construction_budget', measure: 'budget_used', name: 'Budget used', industry: 'construction', type_id: null, type: null, target_good: 100, target_warn: 110, client_sees: false, is_active: true, unit: 'pct', about: 'work', higher: false, books: true }];
const kpiAnswer = () => ({ ready: true, kpis, measures, industries: [{ key: 'construction', name: 'Construction' }, { key: 'legal', name: 'Legal' }], can: { change: true } });
await page.route('**/api/admin/projects/configuration/kpis', (route) => { if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['kpi', b]); kpis = [...kpis, { id: 3, key: 'k3', measure: b.measure, name: b.name || 'Snags open', industry: b.industry_key, type_id: null, type: null, target_good: b.target_good, target_warn: b.target_warn, client_sees: b.client_sees, is_active: true, unit: 'count', about: 'work', higher: false, books: false }]; return json(route, kpiAnswer(), 201); } return json(route, kpiAnswer()); });

await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'KPIs and rules' }).click();
await page.locator('[data-kpis]').waitFor({ timeout: 10000 });
ok('each KPI shows where it applies and its targets in its own unit, lower-is-better the right way round', /Tasks done on time A piece of work Every industry ≥ 90% ≥ 75%/.test(await text(page.locator('[data-kpi="all_tasks_on_time"]'))) && /Budget used from Books A piece of work Construction ≤ 100% ≤ 110%/.test(await text(page.locator('[data-kpi="construction_budget"]'))));
await page.getByRole('button', { name: 'Add a KPI' }).click();
await page.getByLabel('Measures').selectOption('snags_open');
await page.getByLabel('Applies to').selectOption({ label: 'Construction' });
await page.getByLabel(/^Green up to/).fill('0');
await page.getByLabel(/^Amber up to/).fill('3');
await page.getByLabel('The client sees it').check();
ok('the form says how the measure is worked out and which way is better', /How Snags open is worked out. Lower is better; past amber is red./.test(await text(page.locator('[data-kpi-form]'))));
await page.getByRole('button', { name: 'Save the KPI' }).click();
await page.locator('[data-kpi="k3"]').waitFor({ timeout: 5000 });
ok('a KPI is saved with its targets and where it applies', JSON.stringify(last('kpi')?.[1]) === JSON.stringify({ measure: 'snags_open', name: '', industry_key: 'construction', target_good: 0, target_warn: 3, client_sees: true, is_active: true }));
await page.getByRole('button', { name: 'Add a KPI' }).click();
await page.getByLabel('Measures').selectOption('utilisation');
ok('a measure about people applies everywhere: the industry cannot be chosen and the client never sees it', await page.getByLabel('Applies to').isDisabled() && (await page.getByLabel('The client sees it').count()) === 0);
await page.screenshot({ path: D + 'projects-kpis.png', fullPage: true });

// ---------------------------------------------------------------- the scorecard on a work, health in the list
await page.route(/\/api\/admin\/projects\/509$/, (route) => json(route, { project: { id: 509, number: 'BW-0509', title: 'Kilimani flats', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 5, name: 'Building works' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: '2027-03-31', closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'BW-0509', words: {}, can: { open: true, money: true }, locks: {}, fields: [] } }));
const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
const K = (key, name, unit, higher, good, status, value, detail, w, extra = {}) => ({ id: key.length, key, measure: key, name, unit, higher, target_good: good, target_warn: good, status, value, detail, weeks: w, books: false, client_sees: false, about: 'work', ...extra });
await page.route('**/api/admin/projects/509/scorecard', (route) => json(route, { ready: true, health: 'bad', weeks, can: { change: true }, kpis: [
  K('inspections_passed', 'Inspections passed', 'pct', true, 90, 'good', 94, '16 of 17 finished inspections', ['good', 'good', 'warn', 'good', 'good', 'good', 'good', 'good'], { client_sees: true }),
  K('snags_on_time', 'Snags closed on time', 'pct', true, 85, 'warn', 78, '18 of 23 snags due', [null, null, 'good', 'warn', 'warn', 'warn', 'warn', 'warn']),
  K('budget_used', 'Budget used', 'pct', false, 100, 'bad', 114, 'costs against the budget, from Books', [null, null, 'good', 'good', 'warn', 'warn', 'bad', 'bad'], { books: true }),
] }));
await go('/admin/projects/509');
await page.locator('[data-scorecard]').waitFor({ timeout: 10000 });
ok('the scorecard shows the health as the worst KPI, each figure against green and how it was worked out', /Scorecard .* Off track/.test(await text(page.locator('[data-scorecard]'))) && /Budget used from Books costs against the budget, from Books 114% ≤ 100%/.test(await text(page.locator('[data-scorecard-kpi="budget_used"]'))) && /Inspections passed Client sees it 16 of 17 finished inspections 94% ≥ 90%/.test(await text(page.locator('[data-scorecard-kpi="inspections_passed"]'))));
ok('each KPI shows its last eight weeks', (await page.locator('[data-scorecard-kpi="snags_on_time"] [aria-label="Last eight weeks"] [role="img"]').count()) === 8 && (await page.locator('[data-scorecard-kpi="snags_on_time"] [aria-label="2026-11-16: Needs watching"]').count()) === 1);
await page.screenshot({ path: D + 'projects-scorecard.png', fullPage: true });
const listed = [];
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); listed.push(q); const all = [{ id: 509, number: 'BW-0509', title: 'Kilimani flats', health: 'bad' }, { id: 510, number: 'BW-0510', title: 'Ruaka road', health: 'good' }, { id: 511, number: 'BW-0511', title: 'New office', health: null }];
  const data = all.filter((p) => !q.health || p.health === q.health).map((p) => ({ ...p, description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 5, name: 'Building works' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium', customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, due_date: null, confidential: false, frozen: false }));
  return json(route, { data, total: data.length, page: 1, per_page: 25, counts: { open: 3, on_hold: 0, closed: 0, cancelled: 0 } }); });
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await go('/admin/projects');
await page.getByText('Kilimani flats').waitFor({ timeout: 10000 });
ok('the list shows each work\'s health, and none for one not measured', (await page.getByRole('row').filter({ hasText: 'Kilimani flats' }).getByText('Off track').count()) === 1 && (await page.getByRole('row').filter({ hasText: 'Ruaka road' }).getByText('On track').count()) === 1 && !/track|watching/i.test(await text(page.getByRole('row').filter({ hasText: 'New office' }))));
await page.getByLabel('Health').selectOption({ label: 'Off track' });
await page.waitForTimeout(400);
ok('the list can be filtered by health', listed.at(-1)?.health === 'bad' && (await page.getByText('Ruaka road').count()) === 0);
await finish(c);
