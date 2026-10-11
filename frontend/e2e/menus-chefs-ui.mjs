// Browser check: the chefs screen (profiles, certificates with their standing, who is on duty), the chefs page guests see, and the chef named on a dish. The API is answered by the
// check itself; the rules (warnings once each, standing, on duty) are proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sent = [];
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); };
await page.addInitScript(() => { window.confirm = () => true; });

const cert = (o) => ({ id: 1, kind: 'food_handler', kind_label: 'Food handler', name: 'Food handler', number: 'FH-12', issued_on: '2025-10-20', expires_on: '2026-10-20', standing: 'expiring', days_left: 8, notes: null, ...o });
const chef = (o) => ({ id: 1, user_id: 5, user: 'Wanjiru Kamau', email: 'wanjiru@example.com', display_name: 'Chef Wanjiru', title: 'Head chef', bio: 'Loves smoke.', photo: null, station_ids: [1], stations: ['Grill'], is_instructor: true, is_public: true, is_active: true, sort_order: 0, on_duty: true, attention: 1, dishes: 2,
  certs: [cert({}), cert({ id: 2, kind: 'first_aid', kind_label: 'First aid', name: 'First aid', number: null, expires_on: '2027-10-20', standing: 'valid', days_left: 373 })], ...o });
let roster = { ready: true, kinds: { food_handler: 'Food handler', medical: 'Medical', first_aid: 'First aid', haccp: 'HACCP', other: 'Other' }, warn_days: 30, stations: [{ id: 1, name: 'Grill' }, { id: 2, name: 'Cold' }],
  chefs: [chef({}), chef({ id: 2, user_id: 6, user: 'Baraka Otieno', email: 'baraka@example.com', display_name: 'Baraka Otieno', title: null, is_public: false, is_instructor: false, on_duty: false, station_ids: [], stations: [], dishes: 0, attention: 1, certs: [cert({ id: 3, kind: 'medical', kind_label: 'Medical', name: 'Medical', expires_on: '2026-09-01', standing: 'expired', days_left: -41 })] })] };
await page.route('**/api/admin/menus/chefs', (route) => { if (route.request().method() === 'POST') { sent.push(['chef', 'POST', route.request().postDataJSON()]); return json(route, { message: 'Chef saved.' }, 201); } return json(route, roster); });
await page.route('**/api/admin/menus/chefs/*', (route) => { sent.push(['chefput', route.request().method(), route.request().url().replace(/.*chefs\//, ''), route.request().postDataJSON()]); return json(route, { message: 'Saved.' }); });
await page.route('**/api/admin/menus/chefs/candidates**', (route) => { sent.push(['find', route.request().url().replace(/.*q=/, '')]); return json(route, { users: [{ id: 9, name: 'Amina Said', email: 'amina@example.com' }] }); });
await page.route('**/api/admin/menus/chefs/*/certs', (route) => { sent.push(['cert', route.request().postDataJSON()]); return json(route, { message: 'Certificate saved.' }, 201); });

await page.route('**/api/admin/menus/chefs/*/certs/*', (route) => { sent.push(['chefput', route.request().method(), route.request().url().replace(/.*chefs\//, ''), null]); return json(route, { message: 'Done.' }); });
await go('MenusChefs');
await page.locator('[data-testid="menus-chefs"]').waitFor({ timeout: 15000 });
await page.locator('[data-chef="Chef Wanjiru"]').waitFor({ timeout: 10000 });
let text = await page.locator('[data-chef="Chef Wanjiru"]').innerText();
ok('a chef shows the name, title, staff name, stations, dishes and that they are on duty and shown to guests', /Chef Wanjiru/.test(text) && /Head chef/.test(text) && /Wanjiru Kamau/.test(text) && /On duty/.test(text) && /Shown to guests/.test(text) && /Grill/.test(text) && /2 dishes/.test(text) && /Teaches/.test(text), text.replace(/\n+/g, ' | '));
ok('certificates show their standing and days left', /Runs out soon/.test(await page.locator('[data-cert="Food handler"]').first().innerText()) && /8 days/.test(await page.locator('[data-cert="Food handler"]').first().innerText()) && /Valid/.test(await page.locator('[data-cert="First aid"]').innerText()));
ok('a certificate that has run out says so, and the page says how many need attention', /Has run out/.test(await page.locator('[data-cert="Medical"]').innerText()) && /2 certificates need attention/.test(await page.locator('[data-testid="menus-chefs"]').innerText()));
ok('a chef who is not on duty or not shown says so', !/On duty/.test(await page.locator('[data-chef="Baraka Otieno"]').innerText()) && /Not shown/.test(await page.locator('[data-chef="Baraka Otieno"]').innerText()));
await page.screenshot({ path: D + 'menus-chefs.png', fullPage: true });

await page.getByRole('button', { name: 'Add a chef' }).click();
await page.getByLabel('Member of staff').fill('ami');
await page.getByRole('button', { name: /Amina Said/ }).click();
ok('staff are found by typing, and choosing one fills in the name to show', (await page.getByLabel('Name shown to guests').inputValue()) === 'Amina Said' && sent.some((x) => x[0] === 'find' && x[1] === 'ami'));
await page.getByLabel('Name shown to guests').fill('Chef Amina');
await page.getByLabel('Title').fill('Pastry chef');
await page.getByLabel('Cold').check();
await page.getByLabel('Show on the chefs page').check();
await page.getByRole('button', { name: 'Save chef' }).click();
await page.waitForTimeout(400);
const nc = sent.find((x) => x[0] === 'chef')[2];
ok('a new chef is saved with the staff member, name, title, station and visibility', nc.user_id === 9 && nc.display_name === 'Chef Amina' && nc.title === 'Pastry chef' && nc.station_ids.join() === '2' && nc.is_public === true, JSON.stringify(nc));
await page.locator('[data-chef="Chef Wanjiru"]').getByRole('button', { name: 'Add certificate' }).click();
await page.getByLabel('Kind').selectOption({ label: 'HACCP' });
await page.getByLabel('Number').fill('HC-9');
await page.getByLabel('Runs out on').fill('2027-03-01');
await page.getByRole('button', { name: 'Save certificate' }).click();
await page.waitForTimeout(400);
const nx = sent.find((x) => x[0] === 'cert')[1];
ok('a certificate is saved with its kind, number and the day it runs out', nx.kind === 'haccp' && nx.number === 'HC-9' && nx.expires_on === '2027-03-01' && nx.issued_on === null, JSON.stringify(nx));
await page.locator('[data-cert="Medical"]').getByRole('button', { name: 'Remove' }).click();
await page.waitForTimeout(300);
ok('a certificate can be removed', sent.some((x) => x[0] === 'chefput' && x[1] === 'DELETE' && x[2] === '2/certs/3'));

// ---------------------------------------------------------------- what guests see
await page.route('**/api/menu-chefs', (route) => json(route, { chefs: [{ id: 1, name: 'Chef Wanjiru', title: 'Head chef', bio: 'Loves smoke.', photo: null, instructor: true, stations: ['Grill'], dishes: ['Nyama choma', 'Ribs'] }] }));
await go('ChefsPublic');
await page.locator('[data-testid="chefs-page"]').waitFor({ timeout: 15000 });
await page.locator('[data-chef="Chef Wanjiru"]').waitFor({ timeout: 10000 });
text = await page.locator('[data-chef="Chef Wanjiru"]').innerText();
ok('guests see the name, title, a few words, the station and the dishes, and that the chef teaches', /Head chef · Teaches/.test(text) && /Loves smoke/.test(text) && /Works at: Grill/.test(text) && /Nyama choma, Ribs/.test(text), text.replace(/\n+/g, ' | '));
ok('and never a certificate or an email', !/FH-12|@example/.test(await page.locator('[data-testid="chefs-page"]').innerText()));

// the chef named on the menu
const dish = (o) => ({ id: 1, name: 'Nyama choma', slug: 'nyama-choma', description: null, photo: null, prep_minutes: 5, price: 900, price_incl: 1044, available: true, sold_out_today: false, allergens: [], diets: [], info_complete: true, options: [], chef: null, ...o });
await page.route('**/api/menu', (route) => json(route, { menus: [{ id: 1, name: 'Dinner', slug: 'dinner', description: null, serves: 'Every day', serving_now: true, sections: [{ id: 1, name: 'Grill', description: null, dishes: [dish({ chef: 'Chef Wanjiru' }), dish({ id: 2, name: 'Chips' })] }] }], allergens: {}, diets: {}, note: null, now: 'x' }));
await go('MenuPublic');
await page.locator('[data-dish="Nyama choma"]').waitFor({ timeout: 15000 });
ok('a dish by a chef says so; others do not', /by Chef Wanjiru/.test(await page.locator('[data-dish="Nyama choma"]').innerText()) && !/by /.test(await page.locator('[data-dish="Chips"]').innerText()) && (await page.getByRole('link', { name: 'Meet our chefs' }).count()) === 1);

await finish();
