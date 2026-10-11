// Browser check: cakes and catering, in real Chromium. The API is answered by the check itself (the throw-away database has no dishes or books), so this proves what the screens ask
// for and show; the rules behind them (lead times, deposits, quotes, the books) are proved by the backend tests (MenusCookingTest).
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async (which, extra = '') => { await page.goto(`${SITE}/e2e/harness.html?c=${which}${extra}`, { waitUntil: 'networkidle' }); };
await page.addInitScript(() => { window.confirm = () => true; window.prompt = () => 'Fully booked that day'; });

// ---------------------------------------------------------------- asking for a cake or catering
await page.route('**/api/menu/custom', (route) => json(route, { enabled: true, catering_lead_hours: 72, deposit_pct: 50, locations: [{ id: 1, name: 'Kitchen' }],
  payment_methods: [{ id: 4, name: 'M-Pesa', kind: 'mpesa', gateway: 'mpesa_stk' }],
  cakes: [{ id: 7, name: 'Chocolate cake', description: 'Rich and dark', photo: null, price: 3000, lead_hours: 48, groups: [
    { name: 'Size', kind: 'single', min: 1, max: 1, options: [{ id: 1, name: '1 kg', price_delta: 0, is_default: true }, { id: 2, name: '2 kg', price_delta: 1500, is_default: false }] },
    { name: 'Extras', kind: 'multiple', min: 0, max: null, options: [{ id: 3, name: 'Fresh berries', price_delta: 300, is_default: false }] }] }] }));
await page.route('**/api/menu/custom/requests', (route) => { sent.push(['ask', route.request().postDataJSON()]); return json(route, { message: 'Your quote is ready.', token: 'T'.repeat(40), request: {} }, 201); });
await go('CustomOrder');
await page.locator('[data-testid="custom-order"]').waitFor({ timeout: 15000 });
await page.getByLabel('Which cake').waitFor({ timeout: 10000 });
ok('the cake is offered with its starting price', /Chocolate cake · from 3,000.00/.test(await page.getByLabel('Which cake').innerText()));
ok('the price shown follows the default choice and the notice is said', /3,000\.00/.test(await page.locator('[data-testid="cake-price"]').innerText()) && /2 days notice/.test(await page.locator('[data-testid="cake-price"]').innerText()), await page.locator('[data-testid="cake-price"]').innerText());
await page.getByLabel('2 kg').check();
await page.getByLabel('Fresh berries').check();
ok('choosing a size and an extra changes the price', /4,800\.00/.test(await page.locator('[data-testid="cake-price"]').innerText()), await page.locator('[data-testid="cake-price"]').innerText());
const min = await page.locator('input[type="datetime-local"]').getAttribute('min');
ok('the earliest date cannot be sooner than the notice', new Date(min).getTime() - Date.now() > 46 * 3600000 && new Date(min).getTime() - Date.now() < 50 * 3600000, min);
await page.getByLabel('Words on the cake (optional)').fill('Happy birthday Zuri');
await page.locator('input[type="datetime-local"]').fill('2099-10-20T15:00');
await page.getByLabel('Your name').fill('Amina');
await page.getByLabel('Phone').fill('0712345678');
await page.screenshot({ path: D + 'menus-cooking-ask.png', fullPage: true });
await page.getByRole('button', { name: 'Get my price' }).click();
await page.waitForTimeout(500);
const ask = sent.find((x) => x[0] === 'ask')[1];
ok('the cake request sends the dish, the choices, the words and the date', ask.kind === 'cake' && ask.items[0].dish_id === 7 && ask.items[0].option_ids.sort().join() === '2,3' && ask.message === 'Happy birthday Zuri' && ask.event_at === '2099-10-20T15:00' && ask.phone === '0712345678', JSON.stringify(ask));
ok('and the customer is taken to the page for their quote', /\/menu\/request\/T{40}/.test(page.url()), page.url());

await go('CustomOrder');
await page.getByRole('tab', { name: 'Catering' }).click();
await page.getByLabel('How many people').fill('80');
await page.getByLabel(/What are you planning/).fill('Wedding lunch');
ok('catering asks for people and wishes, not for a cake', !(await page.getByLabel('Which cake').count()) && /3 days notice/.test(await page.locator('[aria-label="The job"]').innerText()));
await page.getByLabel('How would you like it').selectOption('serve');
await page.getByRole('textbox', { name: 'Venue' }).fill('Karen Country Club');
await page.locator('input[type="datetime-local"]').fill('2099-10-20T12:00');
await page.getByLabel('Your name').fill('Brian');
await page.getByLabel('Phone').fill('0722000111');
await page.getByRole('button', { name: 'Ask for a quote' }).click();
await page.waitForTimeout(500);
const cat = sent.filter((x) => x[0] === 'ask')[1][1];
ok('the catering request sends the headcount, venue and wishes and no dishes', cat.kind === 'catering' && cat.headcount === 80 && cat.fulfil === 'serve' && cat.address === 'Karen Country Club' && cat.wishes === 'Wedding lunch' && cat.items.length === 0, JSON.stringify(cat));

// ---------------------------------------------------------------- following the request
const base = { number: 'CR-000007', kind: 'cake', kind_label: 'Custom cake', status: 'quoted', status_label: 'Quoted', name: 'Amina', event_at: '2099-10-20T15:00:00+03:00', fulfil: 'pickup', address: null, headcount: null,
  message: 'Happy birthday Zuri', wishes: null, cancel_reason: null, valid_until: '2099-10-10', subtotal: 3000, tax_total: 480, total: 3480, deposit_pct: 50, deposit_amount: 1740, paid_total: 0, balance: 3480,
  lines: [{ id: 1, dish_id: 7, name: 'Chocolate cake', quantity: 1, per_head: false, unit_price: 3000, amount: 3000, options: ['2 kg'], note: null }], can_accept: true, can_decline: true, pay_due: 0 };
let req = { ...base };
const methods = [{ id: 4, name: 'M-Pesa', kind: 'mpesa', gateway: 'mpesa_stk' }];
await page.route('**/api/menu/custom/requests/*', (route) => json(route, { request: req, payment_methods: methods }));
await page.route('**/api/menu/custom/requests/*/accept', (route) => { sent.push(['accept', route.request().postDataJSON()]); req = { ...req, status: 'accepted', status_label: 'Waiting for the deposit', can_accept: false, pay_due: 1740 }; return json(route, { message: 'Check your phone and enter your M-Pesa PIN to pay 1,740.00.', request: req, attempt: { id: 1, token: 'x' }, redirect_url: null }); });
await page.route('**/api/menu/custom/requests/*/pay', (route) => { sent.push(['pay', route.request().postDataJSON()]); return json(route, { message: 'Check your phone.', request: req, attempt: { id: 2, token: 'y' }, redirect_url: null }); });
await page.route('**/api/menu/custom/requests/*/decline', (route) => { sent.push(['decline']); req = { ...req, status: 'declined', status_label: 'Declined', can_accept: false, can_decline: false, cancel_reason: 'Declined by the customer' }; return json(route, { request: req }); });
await go('CustomRequest');
await page.locator('[data-testid="custom-request"]').waitFor({ timeout: 15000 });
await page.locator('[data-testid="total"]').waitFor({ timeout: 10000 });
let t = await page.locator('[data-testid="custom-request"]').innerText();
ok('the quote shows the cake with its choice, the total, the deposit and how long it is open', /CR-000007/.test(t) && /1 × Chocolate cake/.test(t) && /2 kg/.test(t) && /3,480\.00/.test(t) && /1,740\.00/.test(t) && /2099-10-10/.test(t) && /Happy birthday Zuri/.test(t), t);
ok('someone not signed in is sent to sign in, and brought back here', (await page.getByRole('link', { name: 'Sign in' }).getAttribute('href')).includes('redirect=') && !(await page.getByRole('button', { name: /Accept and pay/ }).count()));
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('auth-storage')); s.state.customer = { id: 5, phone: '0712345678' }; localStorage.setItem('auth-storage', JSON.stringify(s)); });
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Accept and pay 1,740\.00/ }).waitFor({ timeout: 10000 });
await page.screenshot({ path: D + 'menus-cooking-quote.png', fullPage: true });
await page.getByRole('button', { name: /Accept and pay 1,740\.00/ }).click();
await page.waitForTimeout(500);
ok('accepting sends the payment method and then says to check the phone', sent.find((x) => x[0] === 'accept')[1].payment_method_id === 4 && /Waiting for your payment/.test(await page.locator('[data-testid="custom-request"]').innerText()));
ok('what is still due can be paid again', (await page.getByRole('button', { name: 'Pay 1,740.00' }).count()) === 1);
req = { ...req, status: 'confirmed', status_label: 'Confirmed', paid_total: 1740, balance: 1740, pay_due: 1740 };
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Pay 1,740.00' }).click();
await page.waitForTimeout(400);
t = await page.locator('[data-testid="custom-request"]').innerText();
ok('once the deposit is in it says the customer is booked, and the balance can be paid', /You are booked/.test(t) && /Still to pay/.test(t) && sent.some((x) => x[0] === 'pay' && x[1].payment_method_id === 4));
req = { ...base, can_accept: true };
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'No thanks' }).click();
await page.waitForTimeout(400);
ok('a quote can be turned down by the customer', sent.some((x) => x[0] === 'decline') && /Declined/.test(await page.locator('[data-testid="status"]').innerText()));

// ---------------------------------------------------------------- the kitchen's screen
const staff = (o) => ({ id: 1, number: 'CR-000007', kind: 'cake', kind_label: 'Custom cake', status: 'quoted', status_label: 'Quoted', name: 'Amina', phone: '0712345678', email: null, event_at: '2099-10-20T15:00:00+03:00', fulfil: 'pickup', address: null,
  headcount: null, message: 'Happy birthday Zuri', wishes: null, notes: 'VIP', cancel_reason: null, valid_until: '2099-10-10', subtotal: 3000, tax_total: 480, total: 3480, deposit_pct: 50, deposit_amount: 1740, paid_total: 0, balance: 3480,
  lines: [{ id: 1, dish_id: 7, name: 'Chocolate cake', quantity: 1, per_head: false, unit_price: 3000, amount: 3000, options: ['2 kg'], note: null }], refund_due: false, stock: null, next: [], can_quote: true, can_take_payment: false, ...o });
const list = { ready: true, statuses: { requested: 'Requested', quoted: 'Quoted', confirmed: 'Confirmed' }, kinds: {}, payment_methods: [{ id: 1, name: 'Cash', kind: 'cash' }, { id: 4, name: 'M-Pesa', kind: 'mpesa' }],
  requests: [staff({}), staff({ id: 2, number: 'CR-000008', kind: 'catering', kind_label: 'Catering', status: 'requested', status_label: 'Requested', name: 'Brian', headcount: 80, fulfil: 'serve', address: 'Karen Country Club', message: null, wishes: 'Wedding lunch', lines: [], total: 0, deposit_amount: 0, balance: 0, notes: null }),
    staff({ id: 3, number: 'CR-000009', status: 'confirmed', status_label: 'Confirmed', paid_total: 1740, balance: 1740, next: ['preparing', 'ready'], can_quote: false, can_take_payment: true, stock: 'Stock was not taken: Not enough flour' })] };
await page.route('**/api/admin/menus/custom**', (route) => json(route, list));
await page.route('**/api/admin/menus/custom/*/quote', (route) => { sent.push(['quote', route.request().url().replace(/.*custom\//, ''), route.request().postDataJSON()]); return json(route, { message: 'Quote sent.', request: staff({}) }); });
await page.route('**/api/admin/menus/custom/*/status', (route) => { sent.push(['status', route.request().url().replace(/.*custom\//, ''), route.request().postDataJSON()]); return json(route, { request: staff({}) }); });
await page.route('**/api/admin/menus/custom/*/pay', (route) => { sent.push(['paid', route.request().url().replace(/.*custom\//, ''), route.request().postDataJSON()]); return json(route, { message: 'Payment recorded.', request: staff({}) }); });
await go('MenusCooking');
await page.locator('[data-testid="menus-cooking"]').waitFor({ timeout: 15000 });
await page.locator('[data-request="CR-000007"]').waitFor({ timeout: 10000 });
t = await page.locator('[data-request="CR-000007"]').innerText();
ok('a cake request shows who, when, the words on it, the lines and the money', /Amina/.test(t) && /Happy birthday Zuri/.test(t) && /1 × Chocolate cake/.test(t) && /Total 3,480\.00/.test(t) && /Note: VIP/.test(t), t);
t = await page.locator('[data-request="CR-000008"]').innerText();
ok('a catering request shows the headcount, the venue and the wishes', /80 people/.test(t) && /Served at: Karen Country Club/.test(t) && /Wedding lunch/.test(t) && /Make the quote/.test(t));
ok('a job whose stock was not taken says so', /Not enough flour/.test(await page.locator('[data-request="CR-000009"]').innerText()));
await page.screenshot({ path: D + 'menus-cooking.png', fullPage: true });

await page.locator('[data-request="CR-000008"]').getByRole('button', { name: 'Make the quote' }).click();
const dlg = page.getByRole('dialog');
await dlg.getByLabel('Line name').first().fill('Buffet lunch');
await dlg.getByLabel('per head').first().check();
await dlg.getByLabel('Price each').first().fill('1500');
ok('a per-head line takes its quantity from the number of people', (await dlg.getByLabel('Quantity').first().inputValue()) === '80' && /120,000\.00/.test(await dlg.locator('[data-testid="quote-subtotal"]').innerText()), await dlg.locator('[data-testid="quote-subtotal"]').innerText());
await dlg.getByRole('button', { name: 'Add a line' }).click();
await dlg.getByLabel('Line name').nth(1).fill('Waiters');
await dlg.getByLabel('Quantity').nth(1).fill('4');
await dlg.getByLabel('Price each').nth(1).fill('2000');
await dlg.getByLabel('Deposit (%)').fill('30');
await dlg.getByRole('button', { name: 'Send the quote' }).click();
await page.waitForTimeout(500);
const q = sent.find((x) => x[0] === 'quote');
ok('sending the quote posts the lines, headcount and deposit for that request', q[1] === '2/quote' && q[2].lines.length === 2 && q[2].lines[0].per_head === true && q[2].lines[0].unit_price === 1500 && q[2].lines[1].quantity === 4 && q[2].headcount === 80 && q[2].deposit_pct === 30, JSON.stringify(q));

await page.locator('[data-request="CR-000009"]').getByRole('button', { name: 'Take payment' }).click();
const pay = page.getByRole('dialog');
ok('taking payment starts with what is still to pay', (await pay.getByLabel('Amount received').inputValue()) === '1740');
await pay.getByLabel('Amount received').fill('1000');
await pay.getByRole('button', { name: 'Record payment' }).click();
await page.waitForTimeout(400);
const pd = sent.find((x) => x[0] === 'paid');
ok('the payment is sent with the method and the amount', pd[1] === '3/pay' && pd[2].tenders[0].payment_method_id === 1 && pd[2].tenders[0].amount === 1000, JSON.stringify(pd));
await page.locator('[data-request="CR-000009"]').getByRole('button', { name: 'Ready' }).click();
await page.waitForTimeout(300);
ok('a job is moved along with a button', sent.some((x) => x[0] === 'status' && x[1] === '3/status' && x[2].to === 'ready'));
await page.locator('[data-request="CR-000007"]').getByRole('button', { name: 'Turn down' }).click();
await page.waitForTimeout(300);
ok('turning down asks why and tells the server', sent.some((x) => x[0] === 'status' && x[1] === '1/status' && x[2].to === 'declined' && x[2].reason === 'Fully booked that day'));

await finish();
