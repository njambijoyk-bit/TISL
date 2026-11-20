// Browser check: the Site tab (stage 10). Plant (10.2): issuing from the asset register, returning, booking ahead with an overlap warning, hiring in on a vendor order.
// Materials (10.1): planned, waiting and issued per material with the cost read from Stock, asking for
// materials with the product finder, the store issuing against a request and returning to stock, and the Stock jobs named. The API is
// answered by the check itself; Stock jobs, the cost centre and who may issue are proved by ProjectsMaterialsTest. It needs only the website
// (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.materials', 'stock.manage', 'projects.money.view', 'projects.plant', 'inventory.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'C-0413', title: 'Kilimani flats', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 1, name: 'Building' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'C-0413', words: { material: { name: 'Material', plural: 'Materials' } }, can: { open: true, money: true }, locks: {}, fields: [] } }));
let requests = [{ id: 5, variant_id: 11, name: 'Cement 50kg', unit: 'bag', quantity: 40, issued: 0, branch: 'Yard', location_id: 2, needed_on: '2026-11-18', late: true, note: null, state: 'open', asked_by: 'Njeri', at: '2026-11-17' }];
let issued = [];
let materials = [{ variant_id: 11, name: 'Cement 50kg', unit: 'bag', planned: 400, plan_note: null, waiting: 40, issued: 0, cost: 0 }];
let jobs = [];
const answer = () => ({ ready: true, site: { location_id: 2, keeps_daily: false }, branches: [{ id: 1, name: 'Main store' }, { id: 2, name: 'Yard' }], materials, cost: materials.reduce((a, m) => a + m.cost, 0), requests, issued, jobs, can: { plan: true, issue: true, see_cost: true } });
await page.route('**/api/admin/projects/413/materials', (route) => json(route, answer()));
await page.route('**/api/admin/projects/materials/find?*', (route) => json(route, { products: [{ id: 12, name: 'Steel bar Y12', unit: 'piece' }] }));
await page.route('**/api/admin/projects/413/materials/requests', (route) => { const b = route.request().postDataJSON(); sent.push(['ask', b]); requests = [{ id: 6, variant_id: 12, name: 'Steel bar Y12', unit: 'piece', quantity: b.quantity, issued: 0, branch: 'Main store', location_id: 1, needed_on: b.needed_on, late: false, note: b.note, state: 'open', asked_by: 'Kamau', at: '2026-11-20' }, ...requests];
  materials = [...materials, { variant_id: 12, name: 'Steel bar Y12', unit: 'piece', planned: null, plan_note: null, waiting: b.quantity, issued: 0, cost: 0 }]; return json(route, answer(), 201); });
await page.route('**/api/admin/projects/413/materials/issue', (route) => { const b = route.request().postDataJSON(); sent.push(['issue', b]); const q = b.items[0].quantity;
  requests = requests.map((r) => (r.id === b.request_id ? { ...r, issued: r.issued + q, state: r.issued + q >= r.quantity ? 'done' : 'part', late: false } : r));
  materials = materials.map((m) => (m.variant_id === 11 ? { ...m, issued: m.issued + q, waiting: m.waiting - q, cost: (m.issued + q) * 750 } : m));
  issued = [{ id: 31, name: 'Cement 50kg', unit: 'bag', quantity: q, job: 'JB-000007', open: true, at: '2026-11-20 10:00:00' }]; jobs = [{ number: 'JB-000007', status: 'open', branch: 'Yard' }]; return json(route, answer()); });
await page.route('**/api/admin/projects/413/materials/lines/31/return', (route) => { const b = route.request().postDataJSON(); sent.push(['return', b]); issued = issued.map((l) => ({ ...l, quantity: l.quantity - b.quantity })); materials = materials.map((m) => (m.variant_id === 11 ? { ...m, issued: m.issued - b.quantity, cost: (m.issued - b.quantity) * 750 } : m)); return json(route, answer()); });

page.on('dialog', (d) => d.accept(d.message().startsWith('How much Cement 50kg to issue') ? '25' : '5'));
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=site')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-materials]').waitFor({ timeout: 15000 });
ok('each material shows planned, waiting at the store and issued, in its unit', /Cement 50kg 400 bag 40 bag 0 bag · 0%/.test(await text(page.locator('[data-material="Cement 50kg"]'))));
ok('a late request says so, with where it comes from and who asked', /40 bag × Cement 50kg from Yard · by 18 Nov 2026 · Njeri Late Waiting/.test(await text(page.locator('[data-material-request="5"]'))));
await page.getByRole('button', { name: 'Ask for materials' }).click();
await page.getByLabel('Product').fill('steel');
await page.getByRole('option').getByRole('button', { name: 'Steel bar Y12 · piece' }).click();
await page.getByLabel('How much').fill('120');
await page.getByLabel('From').selectOption({ label: 'Main store' });
await page.getByLabel('Needed by (optional)').fill('2026-11-27');
await page.locator('[data-material-form]').getByRole('button', { name: 'Ask', exact: true }).click();
await page.locator('[data-material="Steel bar Y12"]').waitFor({ timeout: 5000 });
ok('asking sends the product, how much, the branch and the day', JSON.stringify(last('ask')?.[1]) === JSON.stringify({ variant_id: 12, quantity: 120, location_id: 1, needed_on: '2026-11-27', note: null }));
await page.locator('[data-material-request="5"]').getByRole('button', { name: 'Issue' }).click();
await page.waitForTimeout(300);
ok('the store issues part of a request', JSON.stringify(last('issue')?.[1]) === JSON.stringify({ request_id: 5, items: [{ quantity: 25 }] }) && /Part issued/.test(await text(page.locator('[data-material-request="5"]'))));
ok('what was issued and its cost from stock are shown, and the Stock job named', /Cement 50kg 400 bag 15 bag 25 bag · 6% KES 18,750|Cement 50kg 400 bag 15 bag 25 bag · 6% 18,750/.test(await text(page.locator('[data-material="Cement 50kg"]'))) && /JB-000007 \(Yard, open\)/.test(await text(page.locator('[data-material-jobs]'))));
await page.getByRole('button', { name: 'What was issued (1)' }).click();
await page.locator('[data-issued-line="31"]').getByRole('button', { name: 'Return to stock' }).click();
await page.waitForTimeout(300);
ok('materials go back to stock', JSON.stringify(last('return')?.[1]) === JSON.stringify({ quantity: 5 }) && /20 bag/.test(await text(page.locator('[data-material="Cement 50kg"]'))));
await page.screenshot({ path: D + 'projects-materials.png', fullPage: true });

// plant
let holding = [];
let bookings = [];
let hires = [];
const plant = (extra = {}) => ({ ready: true, inventory: true, holding, bookings, hires, can: { book: true, issue: true }, ...extra });
await page.route('**/api/admin/projects/413/plant', (route) => json(route, plant()));
await page.route('**/api/admin/projects/plant/find?*', (route) => json(route, { items: [{ id: 1, name: 'Excavator', detail: 'CAT 320', serialized: true, available: 1, pieces: [{ id: 7, tag: 'EX-01', free: true }, { id: 8, tag: 'EX-02', free: false }] }] }));
await page.route('**/api/admin/projects/vendors/find?*', (route) => json(route, { vendors: [{ id: 3, name: 'Mombasa Plant Hire', number: 'V-003', orders: [{ id: 30, number: 'PO-0030', status: 'sent' }] }] }));
await page.route('**/api/admin/projects/413/plant/issue', (route) => { sent.push(['plant-issue', route.request().postDataJSON()]); holding = [{ id: 51, name: 'Excavator', tag: 'EX-01', quantity: 1, since: '2026-11-20', back_by: '2026-12-15', late: false, condition: 'good' }]; return json(route, plant()); });
await page.route('**/api/admin/projects/413/plant/held/51/return', (route) => { sent.push(['plant-return', route.request().postDataJSON()]); holding = []; return json(route, plant()); });
await page.route('**/api/admin/projects/413/plant/bookings', (route) => { const b = route.request().postDataJSON(); sent.push(['book', b]); bookings = [{ id: 61, item_id: 1, instance_id: null, name: 'Excavator', tag: null, quantity: 1, starts_on: b.starts_on, ends_on: b.ends_on, note: null, clashes: ['Booked for C-0399 from 1 Dec to 10 Dec'] }]; return json(route, plant({ clashes: bookings[0].clashes }), 201); });
await page.route('**/api/admin/projects/413/plant/hires', (route) => { const b = route.request().postDataJSON(); sent.push(['hire', b]); hires = [{ id: 71, what: b.what, vendor: 'Mombasa Plant Hire', vendor_id: 3, starts_on: b.starts_on, ends_on: null, state: 'on_hire', order: { id: 30, number: 'PO-0030', status: 'sent' }, note: null }]; return json(route, plant(), 201); });
await page.locator('[data-site]').getByRole('tab', { name: 'Plant' }).click();
await page.locator('[data-plant-held]').waitFor({ timeout: 5000 });
await page.getByRole('button', { name: 'Issue to the work' }).click();
await page.getByLabel('Equipment').fill('exca');
await page.getByRole('option').getByRole('button', { name: 'Excavator · CAT 320' }).click();
ok('a piece that is out cannot be chosen to issue', await page.getByLabel('Which one').locator('option', { hasText: 'EX-02 (out)' }).isDisabled());
await page.getByLabel('Which one').selectOption({ label: 'EX-01' });
await page.getByLabel('Back by (optional)').fill('2026-12-15');
await page.getByRole('button', { name: 'Issue it' }).click();
await page.locator('[data-plant-holding="Excavator"]').waitFor({ timeout: 5000 });
ok('issuing sends the piece, when it comes back and its condition', JSON.stringify(last('plant-issue')?.[1]) === JSON.stringify({ instance_id: 7, back_by: '2026-12-15', condition: 'good' }) && /Excavator EX-01 · since 20 Nov 2026 · back by 15 Dec 2026/.test(await text(page.locator('[data-plant-holding="Excavator"]'))));
page.removeAllListeners('dialog');
page.on('dialog', (d) => d.accept('fair'));
await page.locator('[data-plant-holding="Excavator"]').getByRole('button', { name: 'Return' }).click();
await page.waitForTimeout(300);
ok('it comes back with its condition', JSON.stringify(last('plant-return')?.[1]) === JSON.stringify({ condition: 'fair' }) && (await page.locator('[data-plant-holding]').count()) === 0);
await page.getByRole('button', { name: 'Book ahead' }).click();
await page.getByLabel('Equipment').fill('exca');
await page.getByRole('option').getByRole('button', { name: 'Excavator · CAT 320' }).click();
await page.getByLabel('From').fill('2026-12-08');
await page.getByLabel('To', { exact: true }).fill('2026-12-12');
await page.getByRole('button', { name: 'Book it' }).click();
await page.locator('[data-plant-booking="61"]').waitFor({ timeout: 5000 });
ok('a booking that overlaps another work is made and the overlap shown', last('book')?.[1]?.instance_id === null && /Overlaps Booked for C-0399 from 1 Dec to 10 Dec/.test(await text(page.locator('[data-plant-booking="61"]'))));
await page.getByRole('button', { name: 'Hire in' }).click();
await page.getByLabel('What').fill('Tower crane');
await page.getByLabel('Vendor (optional)').fill('momb');
await page.getByRole('option').getByRole('button', { name: 'Mombasa Plant Hire · V-003' }).click();
await page.getByLabel('Vendor order (optional)').selectOption({ label: 'PO-0030 (sent)' });
await page.getByRole('button', { name: 'Put it on hire' }).click();
await page.locator('[data-plant-hire="Tower crane"]').waitFor({ timeout: 5000 });
ok('hired plant names its vendor and vendor order', last('hire')?.[1]?.vendor_order_id === 30 && last('hire')?.[1]?.vendor_id === 3 && /Tower crane · Mombasa Plant Hire · PO-0030 · from .* On hire/.test(await text(page.locator('[data-plant-hire="Tower crane"]'))));
await page.screenshot({ path: D + 'projects-plant.png', fullPage: true });
await finish(c);
