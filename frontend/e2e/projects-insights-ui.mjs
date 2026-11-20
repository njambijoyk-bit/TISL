// Browser check: insights (stage 12). KPIs in Configuration (12.1): the list with targets in the measure's unit, adding one (amber on the right
// side of green, from Books marked). The API is answered by the check itself; what each measure works out is proved by ProjectsKpisTest.
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
await finish(c);
