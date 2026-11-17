// Browser check: scope lines on the Work tab (build 5.3): copying in a linked sales order's lines, the price shown from Books, adding a line,
// recording progress (a quantity, or a percentage for a line with no unit), and someone who may only read. The API is answered by the check
// itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.scope'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: {}, keys: {} }));
const words = { project: { name: 'Contract', plural: 'Contracts' }, phase: { name: 'Section', plural: 'Sections' }, task: { name: 'Task', plural: 'Tasks' }, scope_line: { name: 'BoQ item', plural: 'Bill of quantities' } };
await page.route(/\/api\/admin\/projects\/509$/, (route) => json(route, { project: { id: 509, number: 'C-0509', title: 'Office block, Upper Hill', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 1, name: 'Building' }, stage: { id: 1, name: 'Site works', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Site works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'C-0509', words, can: { open: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));

const SO = { id: 112, number: 'SO-0112', kind: 'Sales order', lines: [{ id: 1, voucher: 'SO-0112', description: 'Excavation to foundations', unit: 'm3', quantity: 420, rate: 850, amount: 357000 }, { id: 2, voucher: 'SO-0112', description: 'Concrete in footings', unit: 'm3', quantity: 96, rate: 14500, amount: 1392000 }] };
let lines = [];
let manage = true;
const L = (o) => ({ code: null, unit: null, quantity: null, done_quantity: 0, done_percent: null, progress: 0, phase_id: null, priced_by: null, tasks: { total: 0, done: 0 }, change_id: null, ...o });
const answer = () => ({ ready: true, lines, overall: lines.length ? Math.round(lines.reduce((n, l) => n + l.progress, 0) / lines.length * 10) / 10 : null, phases: [{ id: 3, name: 'Substructure' }], orders: manage ? [SO] : [], can: { manage } });
await page.route(/\/api\/admin\/projects\/509\/scope(\/\d+)?$/, (route) => {
  const m = route.request().method(); const b = route.request().postDataJSON?.() ?? null; const url = route.request().url();
  if (m === 'POST' && b.copy_from) { sent.push(['copy', b.copy_from]); lines = SO.lines.map((i, n) => L({ id: 10 + n, code: String(n + 1), description: i.description, unit: i.unit, quantity: i.quantity, priced_by: i, tasks: n === 0 ? { total: 2, done: 1 } : { total: 0, done: 0 } })); return json(route, answer(), 201); }
  if (m === 'POST') { sent.push(['add', b]); lines = [...lines, L({ id: 20, code: b.code, description: b.description })]; return json(route, answer(), 201); }
  if (m === 'PUT') {
    const id = Number(url.split('/').pop()); sent.push(['put', id, b]);
    lines = lines.map((l) => (l.id !== id ? l : l.unit ? { ...l, done_quantity: b.progress, progress: Math.round(b.progress / l.quantity * 1000) / 10 } : { ...l, done_percent: b.progress, progress: b.progress }));
    return json(route, answer());
  }
  return json(route, answer());
});

const go = async () => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/509?tab=work&part=scope')}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); await page.locator('[data-scope]').waitFor({ timeout: 15000 }); };
await go();
ok('the Work tab has its parts in the industry\'s words', /Tasks\s*Bill of quantities/.test(await text(page.locator('[data-work-parts]'))));
await page.getByLabel('Copy the lines of').selectOption('112');
await page.getByRole('button', { name: 'Copy them in' }).click();
await page.waitForTimeout(500);
ok('the lines of the linked sales order are copied in', last('copy')[1] === 112 && (await page.locator('[data-line]').count()) === 2);
ok('each line shows what was agreed and its price from Books', /420 m3/.test(await text(page.locator('[data-line="Excavation to foundations"]'))) && /SO-0112 · 850 per m3/.test(await text(page.locator('[data-line="Excavation to foundations"]'))) && /1 of 2 tasks done/.test(await text(page.locator('[data-line="Excavation to foundations"]'))));

await page.getByRole('button', { name: 'Record progress on Excavation to foundations' }).click();
await page.getByLabel('Done, in m3').fill('210');
await page.getByLabel('What was done (optional)').fill('North half');
await page.locator('[data-line="Excavation to foundations"]').getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(500);
ok('progress is sent as a quantity with its note, and shows as a share', JSON.stringify(last('put')) === JSON.stringify(['put', 10, { progress: 210, note: 'North half' }]) && /50%\s*· 210 m3/.test(await text(page.locator('[data-line="Excavation to foundations"]'))));

await page.getByRole('button', { name: 'Add a line' }).click();
await page.getByLabel('Code').fill('9');
await page.getByLabel('Description').fill('Drawings and approvals');
await page.getByRole('button', { name: 'Add the line' }).click();
await page.waitForTimeout(500);
ok('a line with no unit is added', last('add')[1].description === 'Drawings and approvals' && last('add')[1].unit === '' && (await page.locator('[data-line="Drawings and approvals"]').count()) === 1);
await page.getByRole('button', { name: 'Record progress on Drawings and approvals' }).click();
await page.getByLabel('Done, in %').fill('40');
await page.locator('[data-line="Drawings and approvals"]').getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(500);
ok('its progress is a percentage, and the overall figure follows', last('put')[2].progress === 40 && /30% done overall/.test(await text(page.locator('[data-scope]'))));
await page.screenshot({ path: D + 'projects-scope.png', fullPage: true });

manage = false;
await go();
ok('someone who may only read sees the lines and no buttons', (await page.locator('[data-line]').count()) === 3 && (await page.getByRole('button', { name: 'Add a line' }).count()) === 0 && (await page.getByRole('button', { name: /Record progress/ }).count()) === 0);

await finish(c);
