// Browser check: the self-order kiosk screen and its set-up, in real Chromium. The API is answered by the check itself; the rules (pricing, who pays what, when the kitchen starts)
// are proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); };
await page.addInitScript(() => { window.__printed = null; window.open = () => ({ document: { write: (h) => { window.__printed = h; }, close() {} }, focus() {}, print() {} }); });

const dish = (o) => ({ id: 1, name: 'Chapati', slug: 'chapati', description: null, photo: null, prep_minutes: 5, price: 50, price_incl: 58, available: true, sold_out_today: false, allergens: [], diets: [], info_complete: true, options: [], ...o });
const config = { name: 'Front kiosk', business: 'Mama Pima', welcome: 'Touch to order', idle_seconds: 14, pay_at_screen: true, pay_at_counter: true, services: { dine_in: 'Dine in', take_out: 'Take out' }, service_charge_pct: 10,
  payment_methods: [{ id: 4, name: 'M-Pesa' }],
  menu: { menus: [{ id: 1, name: 'All day', slug: 'all-day', serves: 'Every day', serving_now: true, sections: [{ id: 1, name: 'Mains', description: null, dishes: [dish({}), dish({ id: 2, name: 'Burger', price: 500, price_incl: 580, allergens: ['milk'], options: [{ id: 1, name: 'Size', kind: 'single', min_choices: 1, max_choices: 1, options: [{ id: 1, name: 'Regular', price_delta: 0, is_default: true, dish: null }, { id: 2, name: 'Large', price_delta: 100, is_default: false, dish: null }] }] }), dish({ id: 3, name: 'Ribs', price: 900, available: false })] }] }], allergens: { milk: 'Milk' }, diets: {}, note: 'Tell us about allergies.' } };
await page.route('**/api/kiosk/*', (route) => (route.request().method() === 'GET' ? json(route, config) : route.fallback()));
await page.route('**/api/kiosk/*/quote', (route) => {
  const b = route.request().postDataJSON(); sent.push(['quote', b]);
  const food = b.items.reduce((n, i) => n + i.quantity * (i.dish_id === 2 ? 500 + (i.option_ids.includes(2) ? 100 : 0) : 50), 0);
  const svc = b.service === 'dine_in' ? food * 0.1 : 0;

  return json(route, { subtotal: food, service_charge: svc, tax_total: food * 0.16, total: food * 1.16 + svc, tax_breakdown: [] });
});
let orderMode = 'counter';
await page.route('**/api/kiosk/*/orders', (route) => { const b = route.request().postDataJSON(); sent.push(['order', b]); return json(route, { session: 'ABCDE12345', number: 7, payment: b.pay === 'screen' ? 'pending' : 'open', total: 777, attempt: b.pay === 'screen' ? { id: 88, token: 't'.repeat(32) } : null }, 201); });
await page.route('**/api/kiosk/*/orders/ABCDE12345', (route) => json(route, { number: 7, session: 'ABCDE12345', status: 'placed', payment: 'paid', lines: [] }));
await page.route('**/api/kiosk/*/orders/ABCDE12345/cancel', (route) => { sent.push(['cancel']); return json(route, { message: 'Cancelled.' }); });
await page.route('**/api/kiosk/*/orders/ABCDE12345/receipt', (route) => json(route, { width: 32, text: '       MAMA PIMA\nKiosk Session           ABCDE12345\nOrder #                          7\n' }));
let status = 'pending';
await page.route('**/api/payments/attempts/88**', (route) => json(route, { id: 88, status, failure_reason: status === 'failed' ? 'Wrong PIN' : null }));

await go('Kiosk');
await page.locator('[data-testid="welcome"]').waitFor({ timeout: 15000 });
ok('the welcome screen shows the business and the line to touch', /Mama Pima/.test(await page.locator('[data-testid="welcome"]').innerText()) && /Touch to order/.test(await page.locator('[data-testid="welcome"]').innerText()));
await page.screenshot({ path: D + 'menus-kiosk-welcome.png' });
await page.locator('[data-testid="welcome"]').click();
await page.locator('[data-dish="Chapati"]').waitFor({ timeout: 10000 });
ok('the dishes are big buttons with the price including tax; a sold-out dish can not be touched', /58\.00/.test(await page.locator('[data-dish="Chapati"]').innerText()) && await page.locator('[data-dish="Ribs"]').isDisabled());
ok('allergens are said plainly', /Contains Milk/.test(await page.locator('[data-dish="Burger"]').innerText()));
await page.locator('[data-dish="Chapati"]').click();
await page.locator('[data-dish="Chapati"]').click();
await page.locator('[data-dish="Burger"]').click();
await page.getByRole('dialog', { name: 'Choose for Burger' }).getByLabel('Large').check();
await page.getByRole('dialog', { name: 'Choose for Burger' }).getByRole('button', { name: /^Add ·/ }).click();
ok('the basket bar says how many items', /3 items/.test(await page.locator('[data-testid="basket-bar"]').innerText()));
await page.screenshot({ path: D + 'menus-kiosk-menu.png' });
await page.getByRole('button', { name: 'See my order' }).click();
await page.locator('[data-testid="review"]').waitFor();
await page.getByRole('button', { name: 'Fewer Chapati' }).click();
await page.getByRole('button', { name: 'Dine in' }).click();
await page.waitForTimeout(600);
let totals = await page.locator('[data-testid="totals"]').innerText();
ok('the order shows lines, eat here or take away and the total with service charge for dine in', /Chapati/.test(await page.locator('[data-testid="review"]').innerText()) && /Large/.test(await page.locator('[data-testid="review"]').innerText()) && /Service charge/.test(totals) && /Total/.test(totals), totals.replace(/\n+/g, ' | '));
await page.getByRole('button', { name: 'Take out' }).click();
await page.waitForTimeout(600);
ok('take out has no service charge', !/Service charge/.test(await page.locator('[data-testid="totals"]').innerText()));
await page.getByRole('button', { name: 'Pay', exact: true }).click();
await page.getByLabel(/Pay here with M-Pesa/).waitFor();
ok('both ways to pay are offered, and paying here needs a phone number', await page.getByRole('button', { name: /Pay .* now/ }).isDisabled() && (await page.getByRole('button', { name: 'Pay at the counter' }).count()) === 1);
await page.screenshot({ path: D + 'menus-kiosk-pay.png' });
await page.getByLabel(/Pay here with M-Pesa/).fill('0712345678');
await page.getByRole('button', { name: /Pay .* now/ }).click();
await page.getByText('Check your phone').waitFor({ timeout: 10000 });
const o = sent.find((x) => x[0] === 'order')[1];
ok('the order is sent with the dishes, the choice, the service, M-Pesa and the phone', o.pay === 'screen' && o.service === 'take_out' && o.payment_method_id === 4 && o.phone === '0712345678' && o.items.length === 2 && o.items[1].option_ids.join() === '2' && o.items[0].quantity === 1, JSON.stringify(o));
status = 'failed';
await page.getByRole('alert').waitFor({ timeout: 15000 });
ok('a payment that fails says so, the order is cancelled, and the guest can try again', /Wrong PIN/.test(await page.getByRole('alert').innerText()) && sent.some((x) => x[0] === 'cancel'));
await page.getByRole('button', { name: 'Try again' }).click();
await page.getByRole('button', { name: 'Pay at the counter' }).click();
await page.locator('[data-testid="number"]').waitFor({ timeout: 10000 });
ok('paying at the counter gives a big number and says to take it to the counter', (await page.locator('[data-testid="number"]').innerText()) === '7' && /pay/i.test(await page.locator('[data-testid="kiosk"]').innerText()) && /ABCDE12345/.test(await page.locator('[data-testid="kiosk"]').innerText()));
await page.screenshot({ path: D + 'menus-kiosk-done.png' });
await page.getByRole('button', { name: 'Print my slip' }).click();
await page.waitForTimeout(300);
ok('the slip prints with the session code', /ABCDE12345/.test(await page.evaluate(() => window.__printed)));
await page.getByRole('button', { name: 'Done' }).click();
ok('Done goes back to the welcome screen for the next guest', (await page.locator('[data-testid="welcome"]').count()) === 1);

// paid at the screen, then the screen resets by itself when nobody touches it
status = 'confirmed';
await page.locator('[data-testid="welcome"]').click();
await page.locator('[data-dish="Chapati"]').click();
await page.getByRole('button', { name: 'See my order' }).click();
await page.getByRole('button', { name: 'Pay', exact: true }).click();
await page.getByLabel(/Pay here with M-Pesa/).fill('0712345678');
await page.getByRole('button', { name: /Pay .* now/ }).click();
await page.locator('[data-testid="number"]').waitFor({ timeout: 15000 });
ok('when the money arrives the number is shown as paid', /Paid/.test(await page.locator('[data-testid="kiosk"]').innerText()));
await page.getByRole('button', { name: 'Done' }).click();
await page.locator('[data-testid="welcome"]').click();
await page.locator('[data-dish="Chapati"]').click();
await page.getByRole('alertdialog', { name: 'Still there?' }).waitFor({ timeout: 12000 });
ok('after a while with no touch the screen asks if anyone is there', true);
await page.getByRole('button', { name: 'Yes, keep my order' }).click();
ok('touching it keeps the order', (await page.getByRole('alertdialog').count()) === 0 && /1 item/.test(await page.locator('[data-testid="basket-bar"]').innerText()));
await page.locator('[data-testid="welcome"]').waitFor({ timeout: 25000 });
ok('with nobody there the screen starts again and the basket is empty', (await page.locator('[data-testid="basket-bar"]').count()) === 0);

// ---------------------------------------------------------------- set-up in settings
const kiosk = { id: 1, name: 'Front kiosk', location_id: 1, pay_at_screen: true, pay_at_counter: true, idle_seconds: 60, welcome: null, is_active: true, url: `${SITE}/kiosk/${'a'.repeat(32)}` };
await page.route('**/api/admin/menus/kiosks', (route) => { if (route.request().method() === 'POST') { sent.push(['kiosk', route.request().postDataJSON()]); return json(route, { message: 'Kiosk saved.' }, 201); } return json(route, { ready: true, kiosks: [kiosk], branches: [{ id: 1, name: 'Kitchen' }] }); });
await page.route('**/api/admin/menus/kiosks/*/renew', (route) => { sent.push(['renew']); return json(route, { message: 'New address made.', kiosk }); });
await page.route('**/api/admin/menus/kiosks/*', (route) => { if (!route.request().url().endsWith('/renew')) { sent.push(['kioskput', route.request().method(), route.request().postDataJSON()]); return json(route, { message: 'Kiosk saved.', kiosk }); } return route.fallback(); });
await page.route('**/api/admin/menus/settings', (route) => json(route, { settings: { sales_ledger_id: 5, allergen_note: '', receipt_footer: '', tip_ledger_id: null, service_charge_ledger_id: null, service_charge_pct: 0, qr_ordering: true, qr_open_by_scan: false }, ready: true }));
await page.route('**/api/admin/menus/channels', (route) => json(route, { channels: [{ id: 3, code: 'kiosk', name: 'Kiosk', order_type: 'kiosk', is_active: true, prep_minutes: 0, slot_minutes: 15, max_days_ahead: 0, allow_asap: true, payment_modes: ['online'], menu_ids: null, shipping_option_ids: null, min_order: '0.00', note: null, sort_order: 20, updated_at: 'a' }], menus: [{ id: 1, name: 'All day' }], shipping_options: [], payment_modes: { online: 'Pay now', later: 'Pay later' } }));
await page.route('**/api/admin/menus/kitchen/stations', (route) => json(route, { ready: false, stations: [], branches: [] }));
await page.route('**/api/admin/books/groups**', (route) => json(route, []));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, []));
await go('MenusSettings');
await page.locator('[data-testid="kiosks"]').waitFor({ timeout: 15000 });
await page.waitForTimeout(400);
ok('a kiosk is listed with the address to open on the screen', (await page.locator('[data-kiosk="1"] input[readonly]').inputValue()) === kiosk.url);
ok('the Kiosk way in shows only its on/off switch and menus, not delivery times', /Kiosk is on/.test(await page.locator('[data-channel="kiosk"]').innerText()) && !/Kitchen needs/i.test(await page.locator('[data-channel="kiosk"]').innerText()));
await page.locator('[data-kiosk="1"]').getByRole('button', { name: 'New address' }).click();
await page.waitForTimeout(300);
ok('a new address can be made', sent.some((x) => x[0] === 'renew'));
const nk = page.locator('[data-kiosk="new"]');
await nk.getByLabel('Name').fill('Back kiosk');
await nk.getByLabel('Resets after (seconds)').fill('90');
await nk.getByLabel('Pay at the counter').uncheck();
await nk.getByRole('button', { name: 'Add kiosk' }).click();
await page.waitForTimeout(400);
const ks = sent.find((x) => x[0] === 'kiosk')[1];
ok('a new kiosk is saved with its name, reset time and ways to pay', ks.name === 'Back kiosk' && ks.idle_seconds === 90 && ks.pay_at_counter === false && ks.pay_at_screen === true, JSON.stringify(ks));

await finish();
