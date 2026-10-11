// Browser check: the floor and the page behind a table's QR code, in real Chromium. The API is answered by the check itself; the rules (states, merging, moving, splitting,
// ordering from the table, paying from the phone) are proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); };
await page.addInitScript(() => { window.prompt = () => '3'; window.__printed = null; window.open = () => ({ document: { write: (h) => { window.__printed = h; }, close() {} }, focus() {}, print() {} }); });

const t = (o) => ({ id: 1, name: 'T1', seats: 4, shape: 'square', x: 1, y: 1, w: 2, h: 2, state: 'free', guests: null, merged_into: null, joined: [], qr_token: 'a'.repeat(24), resource_id: null, since: null, minutes: null, tab: null, reservation: null, ...o });
const floor = { ready: true, branches: [{ id: 1, name: 'Kitchen' }], location_id: 1, now: 'x', resources: [{ id: 5, name: 'Table 1 (bookings)' }], all_areas: [{ id: 1, name: 'Indoor', is_active: true }, { id: 2, name: 'Patio', is_active: true }],
  areas: [{ id: 1, name: 'Indoor', tables: [t({}), t({ id: 2, name: 'T2', x: 4, y: 1, state: 'ordered', minutes: 12, tab: { id: 50, label: 'T2', total: 1160, payment: 'open', service: 'dine_in', short_no: 3 } }), t({ id: 3, name: 'T3', x: 7, y: 1, shape: 'round', state: 'cleaning' }),
    t({ id: 4, name: 'T4', x: 1, y: 4, state: 'reserved', reservation: { at: '2026-10-12T13:00:00+03:00', people: 4, name: 'Mrs Njeri' } }), t({ id: 5, name: 'T5', x: 4, y: 4, state: 'bill', minutes: 50, tab: { id: 51, label: 'T5', total: 2300, payment: 'open', service: 'dine_in', short_no: 4 } }), t({ id: 6, name: 'T6', x: 7, y: 4, state: 'merged', merged_into: 1 }), t({ id: 7, name: 'T7', x: 10, y: 1, seats: 2 })] },
  { id: 2, name: 'Patio', tables: [t({ id: 9, name: 'P1', x: 2, y: 2 })] }] };
await page.route('**/api/admin/menus/floor', (route) => json(route, floor));
await page.route('**/api/admin/menus/floor?**', (route) => json(route, floor));
await page.route('**/api/admin/menus/floor/tables/*/*', (route) => { sent.push(['act', route.request().url().replace(/.*tables\//, ''), route.request().postDataJSON()]); return json(route, { table: t({ qr_token: 'b'.repeat(24) }) }); });
await page.route('**/api/admin/menus/floor/tables/*/qr', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>' }));
await page.route('**/api/admin/menus/floor/tables', (route) => { sent.push(['table', route.request().method(), route.request().postDataJSON()]); return json(route, { message: 'Table saved.' }, 201); });
await page.route('**/api/admin/menus/floor/areas', (route) => { sent.push(['area', route.request().postDataJSON()]); return json(route, { message: 'Area saved.' }, 201); });
await page.route('**/api/admin/menus/floor/layout', (route) => { sent.push(['layout', route.request().postDataJSON()]); return json(route, { message: 'Layout saved.' }); });

await go('MenusFloor');
await page.locator('[data-testid="plan"]').waitFor({ timeout: 15000 });
await page.locator('[data-table="T1"]').waitFor({ timeout: 10000 });
ok('every table is on the plan with its state', (await page.locator('[data-table]').count()) === 6 && await page.locator('[data-table="T2"]').getAttribute('data-state') === 'ordered' && await page.locator('[data-table="T5"]').getAttribute('data-state') === 'bill' && await page.locator('[data-table="T4"]').getAttribute('data-state') === 'reserved');
ok('a joined table is not drawn on its own, and the time at the table is shown', !(await page.locator('[data-table="T6"]').count()) && /12m/.test(await page.locator('[data-table="T2"]').innerText()), await page.locator('[data-table="T2"]').innerText());
await page.screenshot({ path: D + 'menus-floor.png', fullPage: true });
await page.locator('[data-table="T1"]').click();
let panel = await page.locator('[data-testid="table-panel"]').innerText();
ok('a free table offers to seat guests and to take their order', /Seat guests/.test(panel) && /Take their order/.test(panel) && !/Open the tab/.test(panel), panel.replace(/\n+/g, ' | '));
await page.getByRole('button', { name: 'Seat guests' }).click();
await page.waitForTimeout(300);
ok('seating asks how many and sends it', sent.some((x) => x[0] === 'act' && x[1] === '1/seat' && x[2].guests === 3));
await page.locator('[data-table="T2"]').click();
panel = await page.locator('[data-testid="table-panel"]').innerText();
ok('a table with a tab shows what it is at and links to the tab in the till', /Tab so far\s*1,160\.00/.test(panel) && (await page.getByRole('link', { name: 'Open the tab' }).getAttribute('href')) === '/admin/menus/till?tab=50' && /Bill asked/.test(panel));
await page.getByTestId('table-panel').getByRole('button', { name: 'Bill asked', exact: true }).click();
await page.waitForTimeout(300);
ok('the bill can be asked for', sent.some((x) => x[1] === '2/bill'));
await page.locator('[data-table="T5"]').click();
ok('a table whose bill was asked for is not offered it again', !(await page.getByTestId('table-panel').getByRole('button', { name: 'Bill asked', exact: true }).count()));
await page.locator('[data-table="T3"]').click();
await page.getByRole('button', { name: 'Cleaned: free' }).click();
await page.waitForTimeout(300);
ok('a table that was cleaned is freed', sent.some((x) => x[1] === '3/clear'));
await page.locator('[data-table="T4"]').click();
ok('a reservation shows who and when', /Reserved for Mrs Njeri, 4 people/.test(await page.locator('[data-testid="table-panel"]').innerText()));
await page.locator('[data-table="T1"]').click();
await page.getByRole('button', { name: 'Join tables…' }).click();
const grp = page.getByRole('group', { name: 'Join with' });
ok('joining offers only empty tables', (await grp.innerText()).includes('T7') && !(await grp.innerText()).includes('T2') && !(await grp.innerText()).includes('T5') && !(await grp.innerText()).includes('T4'), (await grp.innerText()).replace(/\n+/g, ' | '));
await grp.getByRole('button', { name: /T7/ }).click();
await page.waitForTimeout(300);
ok('the chosen table is joined', sent.some((x) => x[1] === '1/merge' && x[2].ids[0] === 7));
await page.getByRole('button', { name: 'QR code for T1' }).click();
await page.locator('[data-testid="qr"] svg').waitFor({ timeout: 10000 });
await page.getByRole('button', { name: 'Print' }).click();
ok('the QR code can be printed with the table name', /T1/.test(await page.evaluate(() => window.__printed)) && /<svg/.test(await page.evaluate(() => window.__printed)));
await page.getByRole('button', { name: 'New code' }).click();
await page.waitForTimeout(300);
ok('a new code can be made', sent.some((x) => x[1] === '1/renew-qr'));
await page.keyboard.press('Escape');

// editing the plan
await page.getByRole('button', { name: 'Edit the plan' }).click();
const box = await page.locator('[data-table="T1"]').boundingBox();
await page.mouse.move(box.x + 20, box.y + 20);
await page.mouse.down();
await page.mouse.move(box.x + 20 + 44 * 3, box.y + 20 + 44, { steps: 5 });
await page.mouse.up();
await page.getByRole('button', { name: 'Save layout' }).click();
await page.waitForTimeout(400);
const lay = sent.find((x) => x[0] === 'layout');
ok('dragging a table moves it by whole squares and the layout is saved', lay && lay[1].places.length === 1 && lay[1].places[0].id === 1 && lay[1].places[0].x === 4 && lay[1].places[0].y === 2, JSON.stringify(lay));
await page.getByRole('button', { name: 'Edit the plan' }).click();
await page.getByLabel('New area').fill('Garden');
await page.getByRole('button', { name: 'Add area' }).click();
await page.getByRole('button', { name: 'Add a table' }).click();
await page.getByLabel('Name or number').fill('G1');
await page.getByLabel('Seats').fill('6');
await page.getByLabel('Same table in Bookings').selectOption({ label: 'Table 1 (bookings)' });
await page.getByRole('button', { name: 'Save table' }).click();
await page.waitForTimeout(400);
const nt = sent.find((x) => x[0] === 'table');
ok('a new area and a new table (linked to Bookings) are saved', sent.some((x) => x[0] === 'area' && x[1].name === 'Garden') && nt[2].name === 'G1' && nt[2].seats === 6 && nt[2].resource_id === 5 && nt[2].area_id === 1, JSON.stringify(nt));

// ---------------------------------------------------------------- the guest at the table
const dish = (o) => ({ id: 1, name: 'Chapati', slug: 'chapati', description: null, photo: null, prep_minutes: 5, price: 50, price_incl: 58, available: true, sold_out_today: false, allergens: [], diets: [], info_complete: true, options: [], ...o });
let view = { table: { name: 'T2' }, allowed: { ok: true, why: null }, bill_asked: false, tips_on: true, payment_methods: [{ id: 4, name: 'M-Pesa', kind: 'mpesa', gateway: 'mpesa_stk' }],
  menu: { menus: [{ id: 1, name: 'All day', slug: 'all-day', serves: 'Every day', serving_now: true, sections: [{ id: 1, name: 'Mains', description: null, dishes: [dish({}), dish({ id: 2, name: 'Burger', price: 500, options: [{ id: 1, name: 'Size', kind: 'single', min_choices: 1, max_choices: 1, options: [{ id: 1, name: 'Regular', price_delta: 0, is_default: true, dish: null }, { id: 2, name: 'Large', price_delta: 100, is_default: false, dish: null }] }] })] }] }], allergens: {}, diets: {}, note: 'Tell us about allergies.' },
  tab: { total: 1160, payment: 'open', service_charge_pct: 10, lines: [{ name: 'Burger', quantity: 2, options: ['Large'], amount: 1200 }] } };
await page.route('**/api/menu/table/*', (route) => (route.request().method() === 'GET' ? json(route, view) : route.fallback()));
await page.route('**/api/menu/table/*/order', (route) => { sent.push(['order', route.request().postDataJSON()]); view = { ...view, tab: { ...view.tab, total: 1218 } }; return json(route, { ...view, message: 'Sent to the kitchen.' }, 201); });
await page.route('**/api/menu/table/*/bill', (route) => { sent.push(['bill']); view = { ...view, bill_asked: true }; return json(route, { ...view, message: 'We are bringing the bill.' }); });
await page.route('**/api/menu/table/*/pay', (route) => { sent.push(['pay', route.request().postDataJSON()]); return json(route, { attempt: { id: 77, token: 't'.repeat(32) }, redirect_url: null, total: 1318, message: 'Check your phone and enter your M-Pesa PIN.' }); });
let status = 'pending';
await page.route('**/api/payments/attempts/77**', (route) => json(route, { id: 77, status, failure_reason: status === 'failed' ? 'Wrong PIN' : null }));
await go('TableGuest');
await page.locator('[data-testid="table-page"]').waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Add Chapati' }).waitFor({ timeout: 10000 });
let text = await page.locator('[data-testid="table-page"]').innerText();
ok('the table page shows the table, the tab so far and the service charge note', /T2/.test(text) && /2 × Burger/.test(text) && /Large/.test(text) && /1,160\.00/.test(text) && /10% service charge/.test(text), text.replace(/\n+/g, ' | ').slice(0, 260));
await page.getByRole('button', { name: 'Add Chapati' }).click();
await page.getByRole('button', { name: 'Add Burger' }).click();
await page.getByRole('dialog', { name: 'Choose for Burger' }).getByLabel('Large').check();
await page.getByRole('dialog', { name: 'Choose for Burger' }).getByRole('button', { name: /^Add ·/ }).click();
ok('dishes go into a basket with their choices', /2 items/.test(await page.locator('[data-testid="basket-bar"]').innerText()));
await page.getByRole('button', { name: 'Send to the kitchen' }).click();
await page.waitForTimeout(500);
const o = sent.find((x) => x[0] === 'order')[1];
ok('the order is sent to the table with dish, quantity and choice', o.items.length === 2 && o.items[1].dish_id === 2 && o.items[1].option_ids.join() === '2', JSON.stringify(o));
ok('and the basket is emptied and the tab updated', !(await page.locator('[data-testid="basket-bar"]').count()) && /1,218\.00/.test(await page.locator('[data-testid="tab"]').innerText()));
await page.getByRole('button', { name: 'Ask for the bill' }).click();
await page.waitForTimeout(400);
ok('the bill can be asked for from the table', sent.some((x) => x[0] === 'bill') && /bill is on its way/.test(await page.locator('[data-testid="tab"]').innerText()));
await page.getByRole('button', { name: 'Pay now' }).click();
await page.getByLabel('Phone number').fill('0712345678');
await page.getByLabel('Tip').fill('50');
await page.screenshot({ path: D + 'menus-table.png', fullPage: true });
await page.getByRole('button', { name: 'Pay the bill' }).click();
await page.getByText(/Waiting for your payment/).waitFor({ timeout: 10000 });
const pay = sent.find((x) => x[0] === 'pay')[1];
ok('paying sends the way, the phone and the tip, then waits for the PIN', pay.payment_method_id === 4 && pay.phone === '0712345678' && pay.tip === 50);
status = 'confirmed';
await page.getByText(/Paid\. Thank you/).waitFor({ timeout: 15000 });
ok('when the money arrives the guest is thanked', true);
// a table that is not open yet
view = { ...view, allowed: { ok: false, why: 'Your table has not been opened yet: please ask a member of staff.' }, tab: null };
await go('TableGuest');
await page.locator('[data-testid="table-page"]').waitFor({ timeout: 15000 });
ok('a table that is not open says so and offers no Add buttons', /not been opened/.test(await page.locator('[data-testid="table-page"]').innerText()) && !(await page.getByRole('button', { name: 'Add Chapati' }).count()));

await finish();
