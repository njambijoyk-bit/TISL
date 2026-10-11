// Browser check: Menus → Operations (the prep list for a day, the waste log with its report, and what to buy with the purchase orders it makes). The API is answered by the check
// itself; the arithmetic (forecast, first-expiring-first write-off, whole packs, one order per supplier) is proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async () => { await page.goto(`${SITE}/e2e/harness.html?c=MenusOperations`, { waitUntil: 'networkidle' }); };
await page.addInitScript(() => { window.confirm = () => true; });

const branches = [{ id: 1, name: 'Westlands' }];
await page.route('**/api/admin/menus/operations/prep**', (route) => { sent.push(['prep', new URL(route.request().url()).searchParams.toString()]); return json(route, { date: '2026-10-19', weekday: 'Monday', weeks: 4, buffer: 10, location_id: 1, branches,
  dishes: [{ dish_id: 1, name: 'Samosa', mode: 'ahead', average: 30, booked: 0, expect: 33, on_shelf: 8, to_make: 25, batches: 3 }, { dish_id: 2, name: 'Chapati', mode: 'to_order', average: 40, booked: 60, expect: 60, on_shelf: null, to_make: 0, batches: 0 }, { dish_id: 3, name: 'Soda', mode: 'no_recipe', average: 8, booked: 0, expect: 9, on_shelf: null, to_make: 0, batches: 0 }],
  ingredients: [{ key: 'f1', name: 'Flour', need: 6000, on_hand: 2000, short: 4000, unit: 'g' }, { key: 'v5', name: 'Oil', need: 2, on_hand: 5, short: 0, unit: 'l' }] }); });

let wasteList = { ready: true, kinds: { spoilage: 'Spoilage', over_prep: 'Made too much', plate: 'Left on plates', staff_meal: 'Staff meal', other: 'Other' },
  report: { total: 1250, percent_of_sales: 2.5, by_kind: [{ kind: 'spoilage', label: 'Spoilage', cost: 1000 }, { kind: 'plate', label: 'Left on plates', cost: 250 }, { kind: 'other', label: 'Other', cost: 0 }], by_item: [{ name: 'Tomatoes', cost: 1000 }], by_day: [] },
  recent: [{ id: 7, date: '2026-10-11', item: 'Tomatoes', quantity: 4, kind: 'spoilage', kind_label: 'Spoilage', note: 'Fridge failed', cost: 1000, voided: false }, { id: 6, date: '2026-10-10', item: 'Rice', quantity: 1, kind: 'plate', kind_label: 'Left on plates', note: null, cost: 250, voided: true }] };
await page.route('**/api/admin/menus/operations/waste**', (route) => { if (route.request().method() === 'POST') { sent.push(['waste', route.request().postDataJSON()]); return json(route, { cost: 480 }, 201); } return json(route, wasteList); });
await page.route('**/api/admin/menus/operations/waste/*/void', (route) => { sent.push(['void', route.request().url().replace(/.*waste\//, '')]); return json(route, { message: 'Taken back.' }); });
await page.route('**/api/admin/books/lookup**', (route) => json(route, [{ variant_id: 11, product: 'Chapati', variant: 'Standard', sku: 'CH1' }]));

const buyRows = [
  { variant_id: 21, name: 'Oil 1 l', quantity: 3, need: 5, on_hand: 2, par: 0, reason: 'forecast', for: null, supplier_id: 90, supplier: 'Mama Mboga Ltd', unit_cost: 250 },
  { variant_id: 22, name: 'Pembe 24 kg', quantity: 1, need: 10000, on_hand: 2000, par: 0, reason: 'forecast', for: 'Flour', supplier_id: 91, supplier: 'Unga Traders', unit_cost: 3000 },
  { variant_id: 23, name: 'Salt 1 kg', quantity: 4, need: 0, on_hand: 1, par: 5, reason: 'below_par', for: null, supplier_id: null, supplier: null, unit_cost: 50 }];
await page.route('**/api/admin/menus/operations/reorder**', (route) => {
  if (route.request().method() === 'POST') { sent.push(['orders', route.request().postDataJSON()]); return json(route, { created: [{ voucher_id: 1, number: 'PO-1', supplier: 'Mama Mboga Ltd', lines: 1 }, { voucher_id: 2, number: 'PO-2', supplier: 'Unga Traders', lines: 1 }], skipped: ['Salt 1 kg'] }, 201); }
  sent.push(['reorder', new URL(route.request().url()).searchParams.toString()]); return json(route, { days: 7, rows: buyRows });
});

await go();
await page.locator('[data-testid="prep"]').waitFor({ timeout: 15000 });
await page.locator('[data-dish="Samosa"]').waitFor({ timeout: 10000 });
let text = await page.locator('[data-dish="Samosa"]').innerText();
ok('a dish made ahead shows what is usually sold, what to expect, what is on the shelf and what to make', /30/.test(text) && /33/.test(text) && /25 \(3 batches\)/.test(text), text.replace(/\n+/g, ' | '));
text = await page.locator('[data-dish="Chapati"]').innerText();
ok('a dish made to order says so and shows what is already ordered', /Made to order/.test(text) && /60/.test(text) && !/batch/.test(text), text);
ok('a dish with no recipe says so', /No recipe/.test(await page.locator('[data-dish="Soda"]').innerText()));
ok('an ingredient that falls short says by how much; one that is enough says so', /Short 4,000 g/.test(await page.locator('[data-ingredient="Flour"]').innerText()) && /Enough/.test(await page.locator('[data-ingredient="Oil"]').innerText()));
await page.screenshot({ path: D + 'menus-operations-prep.png', fullPage: true });
await page.getByLabel('For the day').fill('2026-10-19');
await page.getByLabel('A little extra (%)').fill('20');
await page.waitForTimeout(500);
ok('changing the day or the extra asks again', sent.some((x) => x[0] === 'prep' && /date=2026-10-19/.test(x[1]) && /buffer=20/.test(x[1])), JSON.stringify(sent.filter((x) => x[0] === 'prep').slice(-1)));

// ---------------------------------------------------------------- waste
await page.getByRole('tab', { name: 'Waste' }).click();
await page.locator('[data-testid="waste-report"]').waitFor({ timeout: 10000 });
text = await page.locator('[data-testid="waste-report"]').innerText();
ok('the report shows the total, its share of food sales, the reasons that cost something and the biggest items', /1,250\.00/.test(text) && /2\.5% of food sales/.test(text) && /Spoilage: 1,000\.00/.test(text) && !/Other: /.test(text) && /Tomatoes \(1,000\.00\)/.test(text), text.replace(/\n+/g, ' | '));
ok('entries are listed, and one already taken back says so', /Fridge failed/.test(await page.locator('[data-waste="Tomatoes"]').innerText()) && /Taken back/.test(await page.locator('[data-waste="Rice"]').innerText()));
ok('recording needs an item and an amount', await page.getByRole('button', { name: 'Record it' }).isDisabled());
await page.getByLabel('Search products').fill('chap');
await page.getByRole('button', { name: /Chapati/ }).click();
await page.getByLabel('How much').fill('6');
await page.getByLabel('Why').selectOption({ label: 'Made too much' });
await page.getByLabel('Note').fill('Quiet night');
await page.getByRole('button', { name: 'Record it' }).click();
await page.waitForTimeout(400);
const w = sent.find((x) => x[0] === 'waste')?.[1];
ok('the waste is sent with the item, amount, reason and note', w && w.variant_id === 11 && w.quantity === 6 && w.kind === 'over_prep' && w.note === 'Quiet night', JSON.stringify(w));
await page.locator('[data-waste="Tomatoes"]').getByRole('button', { name: 'Take back' }).click();
await page.waitForTimeout(300);
ok('an entry can be taken back', sent.some((x) => x[0] === 'void' && x[1] === '7/void'), JSON.stringify(sent.filter((x) => x[0] === 'void')));
await page.screenshot({ path: D + 'menus-operations-waste.png', fullPage: true });

// before the script has been run
wasteList = { ready: false, kinds: {}, report: null, recent: [] };
await page.getByRole('tab', { name: 'Prep list' }).click();
await page.getByRole('tab', { name: 'Waste' }).click();
await page.getByText(/142_menus_operations\.sql/).waitFor({ timeout: 10000 });
ok('before the database script is run the screen says which one', true);

// ---------------------------------------------------------------- what to buy
await page.getByRole('tab', { name: 'What to buy' }).click();
await page.locator('[data-buy="Oil 1 l"]').waitFor({ timeout: 10000 });
ok('rows with a known supplier are ticked and rows without one cannot be', await page.getByLabel('Order Oil 1 l').isChecked() && await page.getByLabel('Order Pembe 24 kg').isChecked() && await page.getByLabel('Order Salt 1 kg').isDisabled());
text = await page.locator('[data-buy="Pembe 24 kg"]').innerText();
ok('a family item says what it is for and who it comes from', /for Flour/.test(text) && /Unga Traders/.test(text), text.replace(/\n+/g, ' | '));
ok('an item under its level says so and one without a supplier says so', /Under its level/.test(await page.locator('[data-buy="Salt 1 kg"]').innerText()) && /No supplier yet/.test(await page.locator('[data-buy="Salt 1 kg"]').innerText()));
await page.getByLabel('Cover the next (days)').fill('14');
await page.waitForTimeout(500);
ok('changing the days asks again', sent.some((x) => x[0] === 'reorder' && /days=14/.test(x[1])));
await page.getByLabel('Order Pembe 24 kg').uncheck();
await page.getByRole('button', { name: 'Make orders for 1 item' }).click();
await page.waitForTimeout(400);
const po = sent.find((x) => x[0] === 'orders')?.[1];
ok('only the ticked rows are sent, with the amounts shown', po && po.picks.length === 1 && po.picks[0].variant_id === 21 && po.picks[0].quantity === 3, JSON.stringify(po));
text = await page.locator('[data-testid="made"]').innerText();
ok('the orders made and the item with no supplier are listed', /PO-1 to Mama Mboga Ltd/.test(text) && /PO-2 to Unga Traders/.test(text) && /Salt 1 kg/.test(text), text.replace(/\n+/g, ' | '));
await page.screenshot({ path: D + 'menus-operations-buy.png', fullPage: true });

await finish();
