// Browser check: the till in real Chromium (ringing up, choices, paying with change and a split, tabs in rounds, handing over, the receipt, tips and service charge in settings).
// The API is answered by the check itself; the rules (pricing, change, booking, rounds) are proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); };
await page.addInitScript(() => { window.prompt = () => 'Guest left'; window.__printed = null; window.open = () => ({ document: { write: (h) => { window.__printed = h; }, close() {} }, focus() {}, print() {} }); });

const dish = (o) => ({ id: 1, name: 'Chapati', slug: 'chapati', description: null, photo: null, prep_minutes: 5, price: 50, price_incl: 58, available: true, sold_out_today: false, allergens: [], diets: [], info_complete: true, options: [], ...o });
const row = (o) => ({ id: 5, number: 'MO-000005', short_no: 7, label: 'Table 4', service: 'dine_in', status: 'preparing', payment: 'open', name: 'Table 4', total: 580, tip: 0, service_charge: 0, order_type: 'counter', lines_full: [{ id: 51, name: 'Burger', quantity: 1, unit_price: 500, options: [], note: null, round: 1 }], ...o });
let state = { on: true, rules: { service_charge_pct: 10, service_charge_on: true, tips_on: true }, services: { dine_in: 'Dine in', take_out: 'Take out' }, location_id: 1, branches: [{ id: 1, name: 'Kitchen' }],
  payment_methods: [{ id: 1, name: 'Cash', kind: 'cash' }, { id: 2, name: 'M-Pesa', kind: 'mpesa' }],
  menu: { menus: [{ id: 1, name: 'All day', slug: 'all-day', serves: 'Every day', serving_now: true, sections: [{ id: 1, name: 'Mains', description: null, dishes: [dish({}), dish({ id: 2, name: 'Burger', price: 500, options: [{ id: 1, name: 'Extras', kind: 'multiple', min_choices: 0, max_choices: null, options: [{ id: 5, name: 'Cheese', price_delta: 50, is_default: false, dish: null }] }] }), dish({ id: 3, name: 'Ribs', price: 900, available: false })] }] }], allergens: {}, diets: {}, note: null },
  tabs: [row({})], ready: [{ id: 9, number: 'MO-000009', short_no: 3, status: 'ready', payment: 'paid' }, { id: 10, number: 'MO-000010', short_no: 4, status: 'preparing', payment: 'paid' }] };
await page.route('**/api/admin/menus/till', (route) => json(route, state));
let quoteBodies = [];
await page.route('**/api/admin/menus/till/quote', (route) => {
  const b = route.request().postDataJSON(); quoteBodies.push(b);
  const food = b.items.reduce((n, i) => n + i.quantity * (i.dish_id === 2 ? 500 + (i.option_ids.includes(5) ? 50 : 0) : 50), 0);
  const svc = b.service === 'dine_in' && !b.waive_service ? food * 0.1 : 0;
  const total = food * 1.16 + svc + (b.tip || 0);

  return json(route, { subtotal: food, service_charge: svc, tip: b.tip || 0, tax_total: food * 0.16, total, tax_breakdown: [], currency: { id: 1, code: 'KES', symbol: 'KSh' } });
});
await page.route('**/api/admin/menus/till/tabs/*/quote', (route) => { const b = route.request().postDataJSON(); sent.push(['tabquote', b]); const svc = b.waive_service ? 0 : 50; return json(route, { subtotal: 500, service_charge: svc, tip: b.tip || 0, tax_total: 80, total: 580 + svc + (b.tip || 0) }); });
await page.route('**/api/admin/menus/till/sell', (route) => { sent.push(['sell', route.request().postDataJSON()]); return json(route, { order: row({ id: 20, short_no: 8, payment: 'paid', status: 'placed', label: null, service: 'take_out' }) }, 201); });
await page.route('**/api/admin/menus/till/tabs', (route) => { sent.push(['openTab', route.request().postDataJSON()]); const made = row({ id: 6, label: 'Window', name: 'Window' }); state.tabs.push(made); return json(route, { order: made }, 201); });
await page.route('**/api/admin/menus/till/tabs/*/add', (route) => { sent.push(['add', route.request().url().replace(/.*tabs\//, ''), route.request().postDataJSON()]); return json(route, { order: row({}) }); });
await page.route('**/api/admin/menus/till/tabs/*/settle', (route) => { sent.push(['settle', route.request().postDataJSON()]); return json(route, { order: row({ payment: 'paid', status: 'completed' }) }); });
await page.route('**/api/admin/menus/till/tabs/*/cancel', (route) => { sent.push(['cancelTab', route.request().postDataJSON()]); return json(route, { order: row({ status: 'cancelled' }) }); });
await page.route('**/api/admin/menus/till/tabs/*/lines/*', (route) => { sent.push(['void', route.request().url().replace(/.*tabs\//, '')]); return json(route, { order: row({}) }); });
await page.route('**/api/admin/menus/orders/*/status', (route) => { sent.push(['status', route.request().url().replace(/.*orders\//, ''), route.request().postDataJSON()]); return json(route, { order: {} }); });
await page.route('**/api/admin/menus/orders/*/receipt**', (route) => json(route, { width: 32, text: '        TISL LTD\n--------------------------------\nOrder Type                Take Out\nOrder #                          8\n--------------------------------\n2  Chapati                  100.00\n--------------------------------\nTOTAL                       116.00\n' }));

await go('MenusTill');
await page.locator('[data-testid="menus-till"]').waitFor({ timeout: 15000 });
await page.locator('[data-dish="Chapati"]').waitFor({ timeout: 10000 });
ok('the menu being served is a grid of dishes; a dish that is sold out can not be tapped', await page.locator('[data-dish="Ribs"]').isDisabled() && !(await page.locator('[data-dish="Chapati"]').isDisabled()));
ok('open tabs and orders to hand over are listed', (await page.locator('[data-tab="Table 4"]').count()) === 1 && /#3\s*READY/.test((await page.locator('[data-order="3"]').innerText()).replace(/\n/g, '')) && /being made/.test(await page.locator('[data-order="4"]').innerText()));
ok('only a ready order can be handed over', !(await page.locator('[data-order="3"]').getByRole('button', { name: 'Handed over' }).isDisabled()) && await page.locator('[data-order="4"]').getByRole('button', { name: 'Handed over' }).isDisabled());

// a quick sale
await page.locator('[data-dish="Chapati"]').click();
await page.locator('[data-dish="Chapati"]').click();
await page.locator('[data-dish="Burger"]').click();
await page.getByRole('dialog', { name: 'Choose for Burger' }).getByLabel('Cheese').check();
await page.getByRole('dialog', { name: 'Choose for Burger' }).getByRole('button', { name: /^Add ·/ }).click();
await page.waitForTimeout(500);
let basket = await page.locator('[data-testid="basket"]').innerText();
ok('the order lists the lines with choices and their amounts', /Chapati/.test(basket) && /Burger/.test(basket) && /Cheese/.test(basket) && /550\.00/.test(basket), basket.replace(/\n+/g, ' | '));
ok('the total comes from the server, with tax', /754\.00/.test(await page.locator('[data-testid="total"]').innerText()), await page.locator('[data-testid="total"]').innerText());
await page.getByRole('button', { name: 'Fewer Chapati' }).click();
await page.waitForTimeout(500);
ok('fewer takes one off', /50\.00/.test(await page.locator('[data-testid="basket"]').innerText()) && /696\.00/.test(await page.locator('[data-testid="total"]').innerText()), await page.locator('[data-testid="total"]').innerText());
ok('a tab needs a name: until given, Open a tab is disabled', await page.getByRole('button', { name: 'Open a tab' }).isDisabled());
await page.getByRole('button', { name: 'Pay', exact: true }).click();
const pay = page.locator('[data-testid="pay"]');
await pay.locator('[data-testid="due"]').waitFor({ timeout: 10000 });
ok('the payment window shows the amount due and that it is still to pay', /696\.00/.test(await pay.locator('[data-testid="due"]').innerText()) && /Still to pay 696\.00/.test(await pay.locator('[data-testid="short"]').innerText()));
ok('a tip can be added (tips are on) but the service charge is not offered for take out', (await pay.getByLabel('Tip').count()) === 1 && !(await pay.getByText(/Waive the/).count()));
await pay.getByLabel('Tip').fill('30');
await page.waitForTimeout(500);
ok('the tip is in the total', /726\.00/.test(await pay.locator('[data-testid="due"]').innerText()), await pay.locator('[data-testid="due"]').innerText());
await pay.getByRole('button', { name: '1000', exact: true }).click();
ok('cash over the total shows the change and allows paying', /Change 274\.00/.test(await pay.locator('[data-testid="change"]').innerText()), await pay.locator('[data-testid="change"]').innerText());
await page.screenshot({ path: D + 'menus-till-pay.png' });
await page.getByRole('button', { name: /^Take 726/ }).click();
await page.locator('[data-testid="receipt"]').waitFor({ timeout: 10000 });
const s = sent.find((x) => x[0] === 'sell')[1];
ok('the sale sends the dishes, choices, service, tip and what was handed over', s.service === 'take_out' && s.tip === 30 && s.items.length === 2 && s.items[1].option_ids.join() === '5' && s.tenders.length === 1 && s.tenders[0].payment_method_id === 1 && s.tenders[0].amount === 1000, JSON.stringify(s));
await page.getByText(/TISL LTD/).waitFor({ timeout: 10000 });
ok('the receipt comes up, to print', /TISL LTD/.test(await page.locator('[data-testid="receipt"]').innerText()));
await page.getByRole('button', { name: 'Print' }).click();
ok('print sends the receipt to a window sized for the roll', /@page\{size:58mm/.test(await page.evaluate(() => window.__printed)) && /Order Type/.test(await page.evaluate(() => window.__printed)));
await page.getByLabel('Paper').selectOption('42');
await page.getByRole('button', { name: 'Done' }).click();
ok('after the sale the order is empty again', /Tap a dish to start/.test(await page.locator('[data-testid="basket"]').innerText()));

// split payment, M-Pesa needs a reference box
await page.locator('[data-dish="Chapati"]').click();
await page.getByRole('button', { name: 'Pay', exact: true }).click();
await pay.locator('[data-testid="due"]').waitFor();
await pay.getByRole('button', { name: 'Split' }).click();
ok('a split adds a second way, and a way other than cash asks for a reference', (await pay.getByLabel('Amount 2').count()) === 1 && (await pay.getByLabel('Reference 2').count()) === 1 && (await pay.getByLabel('Reference 1').count()) === 0);
await pay.getByLabel('Amount 1').fill('20');
await pay.getByLabel('Amount 2').fill('38');
await pay.getByLabel('Reference 2').fill('QWE123');
ok('two ways together cover it', /Change 0\.00/.test(await pay.locator('[data-testid="change"]').innerText()));
await page.getByRole('button', { name: /^Take 58/ }).click();
await page.locator('[data-testid="receipt"]').waitFor({ timeout: 10000 });
const s2 = sent.filter((x) => x[0] === 'sell')[1][1];
ok('both ways are sent, the second with its reference', s2.tenders.length === 2 && s2.tenders[1].payment_method_id === 2 && s2.tenders[1].reference === 'QWE123' && s2.tenders[1].amount === 38);
await page.getByRole('button', { name: 'Done' }).click();

// a new tab, then a round added to an existing one
await page.locator('[data-dish="Chapati"]').click();
await page.getByLabel('Name or table').fill('Window');
await page.getByRole('button', { name: 'Open a tab' }).click();
await page.waitForTimeout(500);
ok('opening a tab sends the name and the dishes', sent.some((x) => x[0] === 'openTab' && x[1].label === 'Window' && x[1].items.length === 1));
await page.locator('[data-testid="tab-open"]').waitFor({ timeout: 10000 });
ok('and the tab is then the one being worked on', /Tab · Window/.test(await page.locator('[data-testid="tab-open"]').innerText()));
await page.locator('[data-tab="Table 4"]').click();
await page.locator('[data-dish="Chapati"]').click();
await page.getByRole('button', { name: 'Send to the kitchen' }).click();
await page.waitForTimeout(500);
ok('another round goes to the same tab', sent.some((x) => x[0] === 'add' && x[1] === '5/add' && x[2].items[0].dish_id === 1));
{
  const t = await page.locator('[data-testid="tab-open"]').innerText();
  ok('the tab shows what was ordered, by round, and what it comes to so far', /1 × Burger/.test(t) && /round 1/.test(t) && /So far 580\.00/.test(t), t.replace(/\n+/g, ' | '));
}
await page.getByRole('button', { name: 'Take Burger off' }).click();
await page.waitForTimeout(300);
ok('a dish can be taken off the tab', sent.some((x) => x[0] === 'void' && x[1] === '5/lines/51'));
await page.getByRole('button', { name: 'Pay the tab' }).click();
await pay.locator('[data-testid="due"]').waitFor({ timeout: 10000 });
ok('paying a tab offers to waive the service charge and shows it in the total', /630\.00/.test(await pay.locator('[data-testid="due"]').innerText()) && (await pay.getByText(/Waive the 10% service charge/).count()) === 1, await pay.locator('[data-testid="due"]').innerText());
await pay.getByText(/Waive the/).click();
await page.waitForTimeout(500);
ok('waiving takes it off', /580\.00/.test(await pay.locator('[data-testid="due"]').innerText()));
await pay.getByRole('button', { name: 'Exact' }).click();
await page.getByRole('button', { name: /^Take 580/ }).click();
await page.locator('[data-testid="receipt"]').waitFor({ timeout: 10000 });
const st = sent.find((x) => x[0] === 'settle')[1];
ok('settling sends the waiver and the payment', st.waive_service === true && st.tenders[0].amount === 580);
await page.getByRole('button', { name: 'Done' }).click();
await page.locator('[data-tab="Table 4"]').click();
await page.getByRole('button', { name: 'Cancel the tab' }).click();
await page.waitForTimeout(400);
ok('a tab can be cancelled with a reason', sent.some((x) => x[0] === 'cancelTab' && x[1].reason === 'Guest left'));
await page.locator('[data-order="3"]').getByRole('button', { name: 'Handed over' }).click();
await page.waitForTimeout(300);
ok('handing over closes the order', sent.some((x) => x[0] === 'status' && x[1] === '9/status' && x[2].to === 'completed'));
await page.screenshot({ path: D + 'menus-till.png', fullPage: true });

// ---------------------------------------------------------------- settings: tip and service charge
await page.route('**/api/admin/menus/settings', (route) => { if (route.request().method() === 'PUT') { sent.push(['settings', route.request().postDataJSON()]); return json(route, { message: 'Saved.', settings: {} }); } return json(route, { settings: { sales_ledger_id: 5, allergen_note: '', receipt_footer: '', tip_ledger_id: null, service_charge_ledger_id: null, service_charge_pct: 0 }, ready: true }); });
await page.route('**/api/admin/menus/channels', (route) => json(route, { channels: [], menus: [], shipping_options: [], payment_modes: {} }));
await page.route('**/api/admin/menus/kitchen/stations', (route) => json(route, { ready: false, stations: [], branches: [] }));
await page.route('**/api/admin/books/groups**', (route) => json(route, []));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, [{ id: 80, name: 'Tips payable', is_active: true, group: { name: 'Current liabilities' } }, { id: 81, name: 'Service charge income', is_active: true, group: { name: 'Income' } }, { id: 90, name: 'Cash in till', is_active: true, group: { name: 'Cash-in-hand' } }]));
await go('MenusSettings');
await page.getByLabel('Tips are booked to').waitFor({ timeout: 15000 });
await page.waitForTimeout(400);
ok('the account lists leave out cash and bank accounts', !(await page.getByLabel('Tips are booked to').innerText()).includes('Cash in till'));
await page.getByLabel('Tips are booked to').selectOption({ label: 'Tips payable — Current liabilities' });
await page.getByLabel('Service charge is booked to').selectOption({ label: 'Service charge income — Income' });
await page.getByLabel('Service charge on dine-in (%)').fill('10');
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(400);
const set = sent.find((x) => x[0] === 'settings')[1];
ok('the settings send the two accounts and the percentage', set.tip_ledger_id === 80 && set.service_charge_ledger_id === 81 && set.service_charge_pct === 10, JSON.stringify(set));

await finish();
