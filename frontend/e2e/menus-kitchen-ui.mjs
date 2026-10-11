// Browser check: the kitchen screens in real Chromium (a station's screen, the pass, the stations in settings and the station on a dish). The API is answered by the check itself;
// the rules (routing, ticket steps, when an order is ready) are proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); };

let stations = [{ id: 1, name: 'Grill', location_id: null, target_minutes: 15, is_default: true, is_active: true, dishes: 3, open_tickets: 2, sort_order: 0 }, { id: 2, name: 'Cold', location_id: null, target_minutes: 8, is_default: false, is_active: true, dishes: 1, open_tickets: 0, sort_order: 1 }];
await page.route('**/api/admin/menus/kitchen/stations', (route) => { if (route.request().method() === 'POST') { sent.push(['station', 'POST', route.request().postDataJSON()]); return json(route, { message: 'Station saved.' }, 201); } return json(route, { ready: true, stations, branches: [{ id: 1, name: 'Kitchen' }] }); });
await page.route('**/api/admin/menus/kitchen/stations/*', (route) => { sent.push(['station', route.request().method(), route.request().url().replace(/.*stations\//, ''), route.request().postDataJSON()]); return json(route, { message: 'Done.' }); });
const t = (o) => ({ id: 11, status: 'new', order_id: 1, number: 'MO-000001', name: 'Wanjiru', order_type: 'pickup', asap: false, due_at: '2026-10-12T12:30:00+03:00', waited: 4, late: false, started_at: null, notes: null,
  lines: [{ quantity: 2, name: 'Steak', options: ['No onion', 'Large'], note: 'Medium rare', allergens: ['Milk'] }], ...o });
let screen = { station: { id: 1, name: 'Grill', target_minutes: 15 }, now: '2026-10-12T12:00:00+03:00', tickets: [t({}), t({ id: 12, number: 'MO-000002', status: 'started', waited: 21, late: true, order_type: 'delivery', asap: true, notes: 'Allergic to nuts', lines: [{ quantity: 1, name: 'Ribs', options: [], note: null, allergens: [] }] })],
  later: [t({ id: 13, number: 'MO-000003', due_at: '2026-10-12T16:00:00+03:00' })], done: [t({ id: 14, number: 'MO-000000', status: 'ready' })] };
await page.route('**/api/admin/menus/kitchen/screen/*', (route) => json(route, screen));
await page.route('**/api/admin/menus/kitchen/expo', (route) => json(route, { now: 'x', orders: [{ id: 1, number: 'MO-000001', name: 'Wanjiru Kamau', order_type: 'pickup', status: 'preparing', asap: false, due_at: '2026-10-12T12:30:00+03:00', notes: null, minutes: 4, stations: [{ station: 'Grill', status: 'started' }, { station: 'Cold', status: 'ready' }], unrouted: 1 },
  { id: 2, number: 'MO-000002', name: 'Amina', order_type: 'delivery', status: 'ready', asap: true, due_at: '2026-10-12T12:10:00+03:00', notes: null, minutes: 12, stations: [{ station: 'Grill', status: 'ready' }], unrouted: 0 }] }));
await page.route('**/api/admin/menus/kitchen/tickets/*/*', (route) => { sent.push(['ticket', route.request().url().replace(/.*tickets\//, '')]); return json(route, { message: 'Done.' }); });

await go('MenusKitchen');
await page.locator('[data-testid="tickets"]').waitFor({ timeout: 15000 });
let text = await page.locator('[data-ticket="MO-000001"]').innerText();
ok('a ticket shows the number, the first name, the time wanted, the dish, choices, the note and the allergens in capitals', /MO-000001/.test(text) && /Wanjiru/.test(text) && !/Kamau/.test(text) && /for \d\d:30/.test(text) && /2 × Steak/.test(text) && /No onion · Large/.test(text) && /Medium rare/.test(text) && /CONTAINS MILK/.test(text), text.replace(/\n+/g, ' | '));
text = await page.locator('[data-ticket="MO-000002"]').innerText();
ok('a late one says so and shows the order note; a delivery is marked ASAP', /LATE/.test(text) && /NOTE: Allergic to nuts/.test(text) && /ASAP/.test(text) && /COOKING/.test(text), text.replace(/\n+/g, ' | '));
ok('a new ticket offers Start and Ready, a started one only Ready and a way back', (await page.locator('[data-ticket="MO-000001"]').getByRole('button', { name: 'Start' }).count()) === 1 && (await page.locator('[data-ticket="MO-000002"]').getByRole('button', { name: 'Start' }).count()) === 0 && (await page.locator('[data-ticket="MO-000002"]').getByRole('button', { name: /Take MO-000002 back/ }).count()) === 1);
ok('the later and just-finished tickets wait in their own folds', /Later today · 1/.test(await page.locator('[data-testid="later"]').innerText()) && /Just finished · 1/.test(await page.locator('[data-testid="done"]').innerText()));
await page.screenshot({ path: D + 'menus-kitchen.png', fullPage: true });
await page.locator('[data-ticket="MO-000001"]').getByRole('button', { name: 'Start' }).click();
await page.locator('[data-ticket="MO-000002"]').getByRole('button', { name: 'Ready' }).click();
await page.locator('[data-ticket="MO-000002"]').getByRole('button', { name: /Take MO-000002 back/ }).click();
await page.waitForTimeout(400);
ok('the chef\'s buttons call start, ready and recall', sent.filter((x) => x[0] === 'ticket').map((x) => x[1]).join() === '11/start,12/ready,12/recall', JSON.stringify(sent));
await page.evaluate(() => { window.__printed = null; window.open = () => ({ document: { write: (h) => { window.__printed = h; }, close() {} }, focus() {}, print() {} }); });
await page.locator('[data-ticket="MO-000001"]').getByRole('button', { name: 'Print MO-000001' }).click();
const paper = await page.evaluate(() => window.__printed);
ok('a paper ticket carries the order, the station, the dish, the choices and the allergens', /MO-000001/.test(paper) && /Grill/.test(paper) && /2 × Steak/.test(paper) && /No onion, Large/.test(paper) && /ALLERGENS: Milk/.test(paper));
await page.getByRole('tab', { name: 'Cold' }).click();
await page.waitForTimeout(300);
ok('another station is its own tab', await page.getByRole('tab', { name: 'Cold' }).getAttribute('aria-selected') === 'true');
await page.getByRole('tab', { name: /Pass/ }).click();
await page.locator('[data-testid="expo"]').waitFor({ timeout: 10000 });
text = await page.locator('[data-expo="MO-000001"]').innerText();
ok('the pass shows each station\'s progress and an item that is on no screen', /Grill: cooking/.test(text) && /Cold: ready/.test(text) && /1 item on no screen/.test(text), text.replace(/\n+/g, ' | '));
ok('and says when an order is all ready', /ALL READY/.test(await page.locator('[data-expo="MO-000002"]').innerText()));

// ---------------------------------------------------------------- stations in settings, and on a dish
await page.route('**/api/admin/menus/settings', (route) => json(route, { settings: { sales_ledger_id: 5, allergen_note: '', receipt_footer: '' }, ready: true }));
await page.route('**/api/admin/menus/channels', (route) => json(route, { channels: [], menus: [], shipping_options: [], payment_modes: {} }));
await page.route('**/api/admin/books/groups**', (route) => json(route, []));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, []));
await go('MenusSettings');
await page.locator('[data-testid="stations"]').waitFor({ timeout: 15000 });
ok('the stations are listed with their dishes and tickets to make', /3 dishes · 2 tickets to make/.test(await page.locator('[data-station="1"]').innerText()));
const fresh = page.locator('[data-station="new"]');
await fresh.getByLabel('Name').fill('Pastry');
await fresh.getByLabel('Late after (minutes)').fill('12');
await fresh.getByRole('button', { name: 'Add station' }).click();
await page.waitForTimeout(400);
const st = sent.find((x) => x[0] === 'station' && x[1] === 'POST');
ok('a new station is sent with its name and lateness', st && st[2].name === 'Pastry' && st[2].target_minutes === 12 && st[2].is_default === false, JSON.stringify(st));
await page.locator('[data-station="1"]').getByRole('button', { name: 'Remove' }).click();
await page.waitForTimeout(300);
ok('a station can be removed', sent.some((x) => x[0] === 'station' && x[1] === 'DELETE' && x[2] === '1'));

await page.route('**/api/admin/menus/dishes**', (route) => { if (route.request().method() === 'GET') return json(route, { dishes: [{ id: 1, name: 'Steak', variant_id: 31, station_id: 2, is_active: true, sold_out_today: false, has_recipe: false, made_to_order: false, allergens: [], tags: [], diets: [], info_complete: true, declared: false, allergens_declared: false, tags_declared: false, price: 900, cost: null, margin: null, food_cost_pct: null, complete: false, available: 5 }],
  location_id: 1, settings: { sales_ledger_id: 5, allergen_note: '' }, settings_ready: true, allergens: {}, tags: {}, diets: {}, branches: [{ id: 1, name: 'Kitchen' }], stations: [{ id: 1, name: 'Grill' }, { id: 2, name: 'Cold' }] });
  sent.push(['dish', route.request().method(), route.request().postDataJSON()]); return json(route, { message: 'Dish saved.' }); });
await go('MenusDishes');
await page.locator('[data-dish], tr, article').first().waitFor({ timeout: 15000 });
await page.getByRole('button', { name: /Edit/ }).first().click();
const sel = page.getByLabel('Made at');
ok('a dish names its station, the saved one chosen', (await sel.inputValue()) === '2');
await sel.selectOption({ label: 'Grill' });
await page.getByRole('button', { name: /Save dish|Save/ }).last().click();
await page.waitForTimeout(500);
ok('the dish is saved with its station', sent.some((x) => x[0] === 'dish' && x[2]?.station_id === 1), JSON.stringify(sent.filter((x) => x[0] === 'dish')));

await finish();
