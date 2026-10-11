// Browser check: ordering food online and the kitchen's board, in real Chromium. The API is answered by the check itself (the throw-away database has no dishes or books), so this proves
// what the screens ask for and show; the rules behind them (times, stock, tax, payment) are proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); };
await page.addInitScript(() => { window.confirm = () => true; window.prompt = () => 'Out of rice'; });

// ---------------------------------------------------------------- the customer orders
const dish = (o) => ({ id: 1, name: 'Chapati', slug: 'chapati', description: null, photo: null, prep_minutes: 5, price: 50, price_incl: 58, available: true, sold_out_today: false, allergens: [], diets: [], info_complete: true, options: [], ...o });
await page.route('**/api/menu', (route) => json(route, { menus: [{ id: 1, name: 'Lunch', slug: 'lunch', description: null, serves: 'Every day', serving_now: true, sections: [{ id: 1, name: 'Mains', description: null, dishes: [
  dish({}), dish({ id: 4, name: 'Burger', price: 500, options: [{ id: 1, name: 'Size', kind: 'single', min_choices: 1, max_choices: 1, options: [{ id: 1, name: 'Regular', price_delta: 0, is_default: true, dish: null }, { id: 2, name: 'Large', price_delta: 100, is_default: false, dish: null }] },
    { id: 2, name: 'Extras', kind: 'multiple', min_choices: 0, max_choices: 1, options: [{ id: 3, name: 'Cheese', price_delta: 50, is_default: false, dish: null }, { id: 4, name: 'Bacon', price_delta: 80, is_default: false, dish: null }] }] })] }] }],
  allergens: {}, diets: {}, note: null, now: '2026-10-12T12:00:00+03:00' }));
const channels = { channels: [
  { code: 'online_pickup', name: 'Pickup', order_type: 'pickup', note: 'Collect at the counter.', min_order: 0, payment_modes: ['online', 'later'], asap: '2026-10-12T12:30:00+03:00', slots: ['2026-10-12T12:30:00+03:00', '2026-10-12T12:45:00+03:00'], delivery_options: [] },
  { code: 'online_delivery', name: 'Delivery', order_type: 'delivery', note: null, min_order: 0, payment_modes: ['later'], asap: null, slots: ['2026-10-12T13:00:00+03:00'], delivery_options: [{ id: 70, name: 'Standard' }, { id: 71, name: 'Express' }] }],
  payment_methods: [{ id: 1, name: 'M-Pesa', kind: 'mpesa', gateway: 'mpesa_stk' }], locations: [{ id: 1, name: 'Kitchen' }] };
await page.route('**/api/menu/channels', (route) => json(route, channels));
let quoteFails = false;
await page.route('**/api/menu/quote', (route) => {
  const b = route.request().postDataJSON();
  sent.push(['quote', b]);
  if (quoteFails) return json(route, { message: 'The smallest order is 1,000.00 before tax and delivery.' }, 422);
  const food = b.items.reduce((n, i) => n + i.quantity * (i.dish_id === 4 ? 500 + (i.option_ids.includes(2) ? 100 : 0) + (i.option_ids.includes(3) ? 50 : 0) : 50), 0);
  const fee = b.channel === 'online_delivery' ? 150 : 0;

  return json(route, { subtotal: food + fee, delivery_fee: fee, tax_total: (food + fee) * 0.16, total: (food + fee) * 1.16, currency: { id: 1, code: 'KES', symbol: 'KSh' }, at: '2026-10-12T12:30:00+03:00', asap: true, lines: [] });
});
await page.route('**/api/menu/orders', (route) => { const b = route.request().postDataJSON(); sent.push(['place', b]); return json(route, { status: 'placed', message: 'Thank you!', token: 'T'.repeat(40), order: {}, attempt: null, redirect_url: null }, 201); });

await go('MenuPublic');
await page.locator('[data-testid="public-menu"]').waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Add Chapati' }).waitFor({ timeout: 10000 });
ok('a dish that can be had has an Add button, and one with choices says Choose', /Choose/.test(await page.locator('[data-dish="Burger"]').innerText()) && /Add/.test(await page.locator('[data-dish="Chapati"]').innerText()));
await page.getByRole('button', { name: 'Add Chapati' }).click();
await page.getByRole('button', { name: 'Add Chapati' }).click();
ok('adding twice makes one line of two, and the basket bar says what it comes to before tax', /2 items · 100 \+ tax/.test(await page.locator('[data-testid="basket-bar"]').innerText()), await page.locator('[data-testid="basket-bar"]').innerText());

await page.getByRole('button', { name: 'Add Burger' }).click();
const dialog = page.getByRole('dialog', { name: 'Choose for Burger' });
ok('the choices open with the usual one already picked', await dialog.getByLabel('Regular').isChecked());
await dialog.getByLabel('Large').check();
await dialog.getByLabel('Cheese').check();
await dialog.getByLabel('Bacon').click();
ok('"up to one" stops at one: the second extra is not taken', !(await dialog.getByLabel('Bacon').isChecked()) && (await dialog.getByLabel('Cheese').isChecked()));
await dialog.getByLabel('A note for the kitchen').fill('Hot please');
ok('the add button shows the price with the choices', /Add · 650/.test(await dialog.getByRole('button', { name: /^Add ·/ }).innerText()), await dialog.getByRole('button', { name: /^Add ·/ }).innerText());
await dialog.getByRole('button', { name: /^Add ·/ }).click();
ok('and the basket now holds three items', /3 items · 750 \+ tax/.test(await page.locator('[data-testid="basket-bar"]').innerText()), await page.locator('[data-testid="basket-bar"]').innerText());
await page.reload({ waitUntil: 'networkidle' });
ok('the basket survives a refresh', /3 items/.test(await page.locator('[data-testid="basket-bar"]').innerText()));

await page.locator('[data-testid="basket-bar"]').click();
const form = page.getByRole('dialog', { name: 'Your order' });
await form.getByLabel('Your name').waitFor({ timeout: 10000 });
await page.waitForTimeout(600);
ok('the checkout lists the lines with their choices and note', /Burger/.test(await form.innerText()) && /Large, Cheese/.test(await form.innerText()) && /Hot please/.test(await form.innerText()));
ok('the price comes from the server, with tax', /870\.00/.test(await form.locator('[data-testid="order-totals"]').innerText()), await form.locator('[data-testid="order-totals"]').innerText());
ok('pickup is the way chosen, with its note, and nothing for delivery is asked', /Collect at the counter/.test(await form.innerText()) && !(await form.getByLabel('Delivery address').count()));
await page.screenshot({ path: D + 'menus-checkout.png' });
await form.getByRole('tab', { name: 'Delivery' }).click();
await form.getByLabel('Delivery address').waitFor();
await page.waitForTimeout(700);
ok('choosing delivery asks for an address and a method, and the price adds the fee', (await form.getByLabel('Delivery method').count()) === 1 && /150\.00/.test(await form.locator('[data-testid="order-totals"]').innerText()), await form.locator('[data-testid="order-totals"]').innerText());
ok('delivery that can only be paid on arrival offers only that', !(await form.getByLabel('Pay now').count()) && /Pay when it is delivered/.test(await form.innerText()));
await form.getByRole('tab', { name: 'Pickup' }).click();
quoteFails = true;
await form.getByLabel('A note for the kitchen').fill('x');
await form.getByRole('button', { name: 'Keep browsing' }).click();
ok('keep browsing closes the checkout', !(await page.getByRole('dialog', { name: 'Your order' }).count()));
await page.locator('[data-testid="basket-bar"]').click();
await page.getByRole('dialog', { name: 'Your order' }).getByRole('alert').waitFor({ timeout: 10000 });
ok('a refusal from the server is shown and the order can not be placed', /smallest order/.test(await page.getByRole('dialog', { name: 'Your order' }).getByRole('alert').innerText()) && await page.getByRole('button', { name: /Place order/ }).isDisabled());
quoteFails = false;
await page.getByRole('dialog', { name: 'Your order' }).getByLabel('Quantity of Chapati').fill('3');
await page.waitForTimeout(600);
const f2 = page.getByRole('dialog', { name: 'Your order' });
await f2.getByLabel('Your name').fill('Wanjiru');
await f2.getByLabel('Phone').fill('0712345678');
await f2.getByLabel('Pay when it is collected').check();
await f2.getByRole('button', { name: 'Place order', exact: true }).click();
await page.waitForURL(/\/menu\/order\/T{40}/, { timeout: 10000 });
const placed = sent.filter((x) => x[0] === 'place').at(-1)[1];
ok('the order sent has the lines, choices, note, time and contact', placed.channel === 'online_pickup' && placed.fulfil === 'asap' && placed.name === 'Wanjiru' && placed.phone === '0712345678' && placed.payment_mode === 'later'
  && placed.items.length === 2 && placed.items[0].quantity === 3 && placed.items[1].option_ids.join() === '2,3' && placed.items[1].note === 'Hot please', JSON.stringify(placed));
ok('the customer is taken to the page that follows the order', /\/menu\/order\/T{40}$/.test(page.url()));
ok('and the basket is empty', !(await page.evaluate(() => JSON.parse(localStorage.getItem('tisl.menu.basket') ?? '[]')).then((x) => x.length)));

// ---------------------------------------------------------------- the customer follows the order
let order = { number: 'MO-000042', status: 'preparing', status_label: 'Preparing', order_type: 'pickup', payment: 'later', name: 'Wanjiru', asap: true, fulfil_at: '2026-10-12T12:30:00+03:00', delivery_address: null, notes: null, cancel_reason: null, delivery_fee: 0, subtotal: 750, tax_total: 120, total: 870,
  lines: [{ name: 'Chapati', quantity: 3, unit_price: 50, options: [], note: null }, { name: 'Burger', quantity: 1, unit_price: 650, options: ['Large', 'Cheese'], note: 'Hot please' }], can_cancel: false,
  steps: [{ key: 'placed', label: 'Order received', done: true, current: false }, { key: 'preparing', label: 'Being prepared', done: false, current: true }, { key: 'ready', label: 'Ready to collect', done: false, current: false }, { key: 'completed', label: 'Collected', done: false, current: false }] };
await page.route('**/api/menu/orders/*', (route) => json(route, { order }));
await page.route('**/api/menu/orders/*/cancel', (route) => { sent.push(['cancel']); order = { ...order, status: 'cancelled', cancel_reason: 'Cancelled by the customer', steps: [], can_cancel: false }; return json(route, { order }); });
await go('OrderTrack');
await page.goto(`${SITE}/e2e/harness.html?c=OrderTrack`, { waitUntil: 'networkidle' });
await page.locator('[data-testid="order-track"]').waitFor({ timeout: 15000 });
const t = await page.locator('[data-testid="order-track"]').innerText();
ok('the order page shows the number, the time and what is being done', /Order MO-000042/.test(t) && /Pickup as soon as possible/.test(t) && /Being prepared/.test(t));
ok('it shows the lines with choices and the total, and that payment is on collection', /3 × Chapati/.test(t) && /Large, Cheese/.test(t) && /870\.00/.test(t) && /You pay when it is collected/.test(t));
ok('the current step is marked', (await page.locator('[aria-current="step"]').innerText()).includes('Being prepared'));
ok('no cancel button once the kitchen has started', !(await page.getByRole('button', { name: 'Cancel this order' }).count()));
order = { ...order, status: 'placed', can_cancel: true };
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Cancel this order' }).click();
await page.getByText('Cancelled', { exact: true }).waitFor({ timeout: 10000 });
ok('before the kitchen starts it can be cancelled by the customer', sent.some((x) => x[0] === 'cancel') && /Cancelled by the customer/.test(await page.locator('[data-testid="order-track"]').innerText()));

// ---------------------------------------------------------------- the kitchen's board
const so = (o) => ({ id: 1, number: 'MO-000001', status: 'placed', status_label: 'Placed', order_type: 'pickup', payment: 'paid', name: 'Amina', phone: '0700111222', email: null, asap: false, fulfil_at: '2026-10-12T13:00:00+03:00', delivery_address: null, notes: 'Allergic to nuts', delivery_fee: 0, subtotal: 100, tax_total: 16, total: 116,
  lines: [{ name: 'Chapati', quantity: 2, unit_price: 50, options: [], note: null }], channel: 'Pickup', next: ['accepted', 'preparing', 'ready', 'cancelled'], needs_payment: false, refund_due: false, ...o });
const board = { orders: [so({}), so({ id: 2, number: 'MO-000002', status: 'ready', payment: 'later', next: ['cancelled'], needs_payment: true, notes: null }), so({ id: 3, number: 'MO-000003', status: 'preparing', order_type: 'delivery', delivery_address: 'Kenyatta Ave 12', next: ['ready', 'cancelled'] })],
  waiting_for_payment: 2, statuses: {}, payment_methods: [{ id: 3, name: 'Cash', kind: 'cash' }, { id: 1, name: 'M-Pesa', kind: 'mpesa' }] };
await page.route('**/api/admin/menus/orders**', (route) => json(route, board));
await page.route('**/api/admin/menus/orders/*/status', (route) => { sent.push(['status', route.request().url().replace(/.*orders\//, ''), route.request().postDataJSON()]); return json(route, { order: so({}) }); });
await page.route('**/api/admin/menus/orders/*/pay', (route) => { sent.push(['pay', route.request().postDataJSON()]); return json(route, { order: so({ status: 'completed' }) }); });
await go('MenusOrders');
await page.locator('[data-testid="menus-orders"]').waitFor({ timeout: 15000 });
ok('orders are in columns by where they stand', /New · 1/.test(await page.locator('section[aria-label="New"]').innerText()) && /Preparing · 1/.test(await page.locator('section[aria-label="Preparing"]').innerText()) && /Ready \/ on the way · 1/.test(await page.locator('section[aria-label="Ready / on the way"]').innerText()));
const a = await page.locator('[data-order="MO-000001"]').innerText();
ok('an order shows who, the dish, the customer note and that it is paid', /Amina/.test(a) && /2 ×\s*Chapati/.test(a) && /Allergic to nuts/.test(a) && /Paid/.test(a), a.replace(/\n+/g, ' | '));
ok('and how many are still waiting for payment', /2 waiting for payment/.test(await page.locator('[data-testid="menus-orders"]').innerText()));
ok('a delivery shows the address', /Kenyatta Ave 12/.test(await page.locator('[data-order="MO-000003"]').innerText()));
await page.locator('[data-order="MO-000001"]').getByRole('button', { name: 'Start preparing' }).click();
await page.waitForTimeout(400);
ok('a button moves the order along', sent.some((x) => x[0] === 'status' && x[1] === '1/status' && x[2].to === 'preparing'));
await page.locator('[data-order="MO-000001"]').getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(400);
ok('cancelling asks why and sends the reason', sent.some((x) => x[0] === 'status' && x[2].to === 'cancelled' && x[2].reason === 'Out of rice'));
ok('an order paid at the door offers Take payment, not Done', (await page.locator('[data-order="MO-000002"]').getByRole('button', { name: 'Take payment' }).count()) === 1 && !(await page.locator('[data-order="MO-000002"]').getByRole('button', { name: 'Done' }).count()));
await page.locator('[data-order="MO-000002"]').getByRole('button', { name: 'Take payment' }).click();
await page.getByLabel('Paid by').selectOption({ label: 'M-Pesa' });
await page.getByLabel('Reference (optional)').fill('QWE123');
await page.screenshot({ path: D + 'menus-orders-board.png', fullPage: true });
await page.getByRole('button', { name: 'Take payment', exact: true }).last().click();
await page.waitForTimeout(500);
const pay = sent.find((x) => x[0] === 'pay');
ok('taking payment sends the method, the full amount and the reference', pay && pay[1].tenders[0].payment_method_id === 1 && pay[1].tenders[0].amount === 116 && pay[1].tenders[0].reference === 'QWE123', JSON.stringify(pay));

// ---------------------------------------------------------------- the ways to order, in settings
const chan = (o) => ({ id: 1, code: 'online_pickup', name: 'Pickup', order_type: 'pickup', is_active: false, prep_minutes: 20, slot_minutes: 15, max_days_ahead: 2, allow_asap: true, payment_modes: ['online', 'later'], menu_ids: null, shipping_option_ids: null, min_order: '0.00', note: null, sort_order: 0, updated_at: 'a', ...o });
await page.route('**/api/admin/menus/channels', (route) => json(route, { channels: [chan({}), chan({ id: 2, code: 'online_delivery', name: 'Delivery', order_type: 'delivery' })], menus: [{ id: 1, name: 'Lunch' }], shipping_options: [{ id: 70, name: 'Standard' }], payment_modes: { online: 'Pay now', later: 'Pay when it is collected or delivered' } }));
await page.route('**/api/admin/menus/channels/*', (route) => { sent.push(['channel', route.request().url().replace(/.*channels\//, ''), route.request().postDataJSON()]); return json(route, { message: 'Saved.', channel: {} }); });
await page.route('**/api/admin/menus/settings', (route) => json(route, { settings: { sales_ledger_id: 5, allergen_note: '', receipt_footer: '' }, ready: true }));
await page.route('**/api/admin/books/groups**', (route) => json(route, []));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, []));
await go('MenusSettings');
await page.locator('[data-testid="channels"]').waitFor({ timeout: 15000 });
ok('both ways to order are listed, off', /Pickup is off/.test(await page.locator('[data-channel="online_pickup"]').innerText()) && /Delivery is off/.test(await page.locator('[data-channel="online_delivery"]').innerText()));
const pc = page.locator('[data-channel="online_pickup"]');
await pc.getByLabel('Pickup is off').check();
await pc.getByLabel('Kitchen needs (minutes)').fill('30');
await pc.getByLabel('Pay when it is collected or delivered').uncheck();
await pc.getByLabel('Lunch').check();
await pc.getByRole('button', { name: 'Save Pickup' }).click();
await page.waitForTimeout(500);
const ch = sent.find((x) => x[0] === 'channel');
ok('saving sends the switch, the minutes, the way to pay and the menus', ch && ch[1] === '1' && ch[2].is_active === true && ch[2].prep_minutes === 30 && ch[2].payment_modes.join() === 'online' && ch[2].menu_ids.join() === '1', JSON.stringify(ch));
ok('delivery offers the delivery methods', /Standard/.test(await page.locator('[data-channel="online_delivery"]').innerText()));
await page.screenshot({ path: D + 'menus-channels.png', fullPage: true });

await finish();
