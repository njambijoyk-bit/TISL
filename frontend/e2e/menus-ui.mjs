// Browser check: the Menus screens (ingredients, dishes, recipes, settings) in real Chromium. The Menus API is answered by the check itself (the throw-away database has no
// products or books), so this proves what the screens ask for and show; the rules behind them are proved by the backend tests.
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();

const c = await open({ authenticator: false });
await signInWithPassword(c.page, 'owner@example.com');
const page = c.page;

const units = [{ id: 1, code: 'g', name: 'Gram', dimension: 'mass' }, { id: 2, code: 'kg', name: 'Kilogram', dimension: 'mass' }, { id: 3, code: 'ml', name: 'Millilitre', dimension: 'volume' }];
const allergens = { milk: 'Milk', wheat: 'Wheat / gluten', eggs: 'Eggs' };
const tags = { meat: 'Meat', dairy: 'Dairy' };
const state = {
  families: [{ id: 7, name: 'Wheat flour', unit_id: 1, unit: 'g', pick_rule: 'preferred', allergens: ['wheat'], tags: [], notes: null, is_active: true, on_hand: 14000, unit_cost: 0.15,
    variants: [{ variant_id: 11, name: 'Exe flour — 2 kg', rank: 1, units_per_stock: 2000, is_allowed: true, sell_retail: false }, { variant_id: 12, name: 'Pembe flour — 24 kg', rank: 2, units_per_stock: 24000, is_allowed: true, sell_retail: false }] }],
  dishes: [
    { id: 1, name: 'Chapati', variant_id: 31, is_active: true, sold_out_today: false, has_recipe: true, made_to_order: true, allergens: ['wheat'], tags: [], diets: ['vegetarian', 'vegan'], info_complete: true, declared: false, allergens_declared: false, tags_declared: false, price: 50, cost: 20, margin: 30, food_cost_pct: 40, complete: true, available: 112 },
    { id: 2, name: 'Mystery bowl', variant_id: 32, is_active: true, sold_out_today: false, has_recipe: true, made_to_order: false, allergens: [], tags: [], diets: [], info_complete: false, declared: false, allergens_declared: false, tags_declared: false, price: 300, cost: null, margin: null, food_cost_pct: null, complete: false, available: 0 },
  ],
};
const sent = [];
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/api/admin/menus/ingredients**', async (route) => {
  const m = route.request().method();
  if (m === 'GET') return json(route, { families: state.families, location_id: 1, units, pick_rules: { preferred: 'The preferred one first', cheapest: 'The cheapest first', first_expiring: 'The one that expires first' }, allergens, tags, branches: [{ id: 1, name: 'Kitchen' }] });
  sent.push(['ingredient', m, route.request().postDataJSON()]);

  return json(route, { message: 'Ingredient saved.' }, 201);
});
await page.route('**/api/admin/menus/ingredients/suggest', async (route) => { sent.push(['suggest', route.request().postDataJSON()]); await json(route, { units_per_stock: route.request().postDataJSON().variant_id === 11 ? 2000 : null }); });
await page.route('**/api/admin/menus/dishes**', async (route) => {
  const m = route.request().method();
  if (m === 'GET') return json(route, { dishes: state.dishes, location_id: 1, settings: { sales_ledger_id: 5, allergen_note: 'Tell us about allergies.' }, settings_ready: true, allergens, tags, diets: { vegetarian: 'Vegetarian', vegan: 'Vegan' }, branches: [{ id: 1, name: 'Kitchen' }] });
  sent.push(['dish', m, route.request().url().replace(/.*\/api/, ''), route.request().postDataJSON()]);

  return json(route, { message: 'Done.' }, 200);
});
await page.route('**/api/admin/menus/recipes**', async (route) => {
  const m = route.request().method();
  if (m === 'GET') return json(route, { recipes: [{ id: 1, variant_id: 31, item: 'Chapati', yield_qty: 4, deduct_on_sale: true, note: null, visibility: 'internal', prep_minutes: null, cook_minutes: null, steps: [], cost_each: 20, cost_complete: true,
    items: [{ variant_id: null, family_id: 7, name: 'Wheat flour', quantity: 400, unit_id: 1, waste_pct: 20 }] }], runs: [], branches: [], location_id: 1 });
  sent.push(['recipe', m, route.request().postDataJSON()]);

  return json(route, { message: 'Recipe saved.' });
});
await page.route('**/api/admin/books/lookup**', (route) => json(route, [{ variant_id: 11, product: 'Exe flour', variant: '2 kg', sku: 'EXE2' }, { variant_id: 12, product: 'Pembe flour', variant: '24 kg', sku: 'PEM24' }]));
await page.route('**/api/admin/menus/settings', (route) => json(route, { settings: { sales_ledger_id: 5, allergen_note: 'Tell us about allergies.', receipt_footer: '' }, ready: true }));
await page.route('**/api/admin/books/groups**', (route) => json(route, []));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, []));
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); };

// ---------------------------------------------------------------- ingredients
await go('MenusIngredients');
await page.locator('[data-testid="ingredients"]').waitFor({ timeout: 15000 });
let text = await page.locator('[data-testid="ingredients"]').innerText();
ok('the list shows the ingredient, its items in order, what is on hand and the cost', /Wheat flour/.test(text) && /1\. Exe flour/.test(text) && /2\. Pembe flour/.test(text) && /14,000 g/.test(text) && /0\.15 \/ g/.test(text), text.replace(/\n+/g, ' | ').slice(0, 220));
ok('and its allergens', /Wheat/.test(await page.locator('[data-testid="allergens"]').first().innerText()));
ok('the Menus navigation is there with its eight pages', (await page.locator('[data-testid="menus-nav"] [role="tab"]').count()) === 8);

await page.getByRole('button', { name: /New ingredient/ }).click();
await page.getByLabel('Name', { exact: true }).fill('Cooking oil');
await page.getByLabel('Recipes measure it in').selectOption({ label: 'ml — Millilitre' });
await page.getByLabel('Search products').fill('flour');
await page.getByRole('button', { name: /Exe flour/ }).click();
await page.getByLabel('Search products').fill('flour');
await page.getByRole('button', { name: /Pembe flour/ }).click();
const rows = page.locator('[data-testid="ingredient-item"]');
ok('both items are listed', (await rows.count()) === 2);
await page.waitForTimeout(400);
ok('the amount one holds is filled in when the item says so', (await rows.nth(0).locator('input[type="number"]').inputValue()) === '2000', await rows.nth(0).locator('input[type="number"]').inputValue());
ok('and left for the person when it does not', (await rows.nth(1).locator('input[type="number"]').inputValue()) === '');
await rows.nth(1).locator('input[type="number"]').fill('24000');
await rows.nth(1).getByRole('button', { name: 'Prefer it more' }).click();
ok('moving an item up makes it the preferred one', /Pembe/.test(await rows.nth(0).innerText()));
await page.getByLabel('Milk').check();
await page.screenshot({ path: D + 'menus-ingredient-modal.png' });
await page.getByRole('button', { name: 'Save ingredient' }).click();
await page.waitForTimeout(500);
const saved = sent.find((x) => x[0] === 'ingredient');
ok('the save sends the order, the amounts and the allergens', saved && saved[1] === 'POST' && saved[2].name === 'Cooking oil' && saved[2].unit_id === 3 && saved[2].variants.map((v) => v.variant_id).join() === '12,11'
  && saved[2].variants[0].units_per_stock === 24000 && saved[2].allergens.join() === 'milk', JSON.stringify(saved?.[2]));

// ---------------------------------------------------------------- dishes
await go('MenusDishes');
await page.locator('[data-testid="dishes"]').waitFor({ timeout: 15000 });
const chapati = page.locator('[data-dish="Chapati"]');
text = await chapati.innerText();
ok('a dish shows price, cost, margin, availability, allergens and diet badges', /50/.test(text) && /40% food cost/.test(text) && /112/.test(text) && /Wheat/.test(text) && /Vegetarian/.test(text) && /Made to order/.test(text), text.replace(/\n+/g, ' | ').slice(0, 200));
text = await page.locator('[data-dish="Mystery bowl"]').innerText();
ok('a dish with an unclassified ingredient claims no diet and says so', /Not all ingredients are classified/.test(text) && !/Vegetarian/.test(text));
await page.screenshot({ path: D + 'menus-dishes.png' });
await chapati.getByRole('button', { name: 'Sold out today' }).click();
await page.waitForTimeout(400);
const so = sent.find((x) => x[0] === 'dish' && /sold-out/.test(x[2]));
ok('"Sold out today" asks the server', so && so[1] === 'POST' && so[3].sold_out === true);
await page.getByRole('button', { name: /New dish/ }).click();
await page.getByLabel('Name', { exact: true }).fill('Beef stew');
await page.getByLabel('Price (before tax)').fill('450');
await page.getByLabel('I will say exactly which').first().check();
await page.getByLabel('Milk').check();
await page.getByRole('button', { name: 'Save dish' }).click();
await page.waitForTimeout(500);
const dish = sent.find((x) => x[0] === 'dish' && x[1] === 'POST' && x[2] === '/admin/menus/dishes');
ok('a new dish sends its price and what it declares (and leaves the rest to the ingredients)', dish && dish[3].name === 'Beef stew' && dish[3].price === 450 && dish[3].allergens.join() === 'milk' && dish[3].tags === null, JSON.stringify(dish?.[3]));

// ---------------------------------------------------------------- recipes
await go('MenusRecipes');
await page.getByText('Chapati').first().waitFor({ timeout: 15000 });
text = await page.locator('body').innerText();
ok('the recipe list shows the waste and the cost each', /400 \(\+20% waste\) × Wheat flour/.test(text) && /20/.test(await page.locator('[data-testid="recipe-cost"]').first().innerText()), text.replace(/\n+/g, ' | ').slice(0, 160));
await page.getByRole('button', { name: 'Edit' }).first().click();
await page.getByLabel('Add an ingredient').selectOption({ label: 'Wheat flour (g)' });
ok('an ingredient already in the recipe is not added twice', (await page.locator('[data-testid="recipe-line"]').count()) === 1);
await page.getByLabel('Search products').fill('flour');
await page.getByRole('button', { name: /Exe flour/ }).click();
const lines = page.locator('[data-testid="recipe-line"]');
await lines.nth(1).getByLabel(/Unit of/).selectOption({ label: 'kg' });
await lines.nth(1).getByLabel(/Amount of/).fill('0.5');
await lines.nth(1).getByLabel(/Waste of/).fill('10');
await page.getByRole('button', { name: 'Add a step' }).click();
await page.getByLabel('Step 1', { exact: true }).fill('Knead the dough');
await page.getByLabel('Minutes for step 1').fill('10');
await page.getByLabel('Who may see it').selectOption('publishable');
await page.screenshot({ path: D + 'menus-recipe-modal.png' });
await page.getByRole('button', { name: 'Save recipe' }).click();
await page.waitForTimeout(500);
const rec = sent.find((x) => x[0] === 'recipe' && x[1] === 'PUT');
ok('the recipe is saved with ingredient and exact lines, units, waste, steps and who may see it',
  rec && rec[2].items.length === 2 && rec[2].items[0].family_id === 7 && rec[2].items[0].unit_id === 1 && rec[2].items[0].waste_pct === 20
  && rec[2].items[1].variant_id === 11 && rec[2].items[1].unit_id === 2 && rec[2].items[1].waste_pct === 10 && rec[2].steps[0].body === 'Knead the dough' && rec[2].steps[0].minutes === 10 && rec[2].visibility === 'publishable', JSON.stringify(rec?.[2]));


// ---------------------------------------------------------------- menus (the cards)
await page.route('**/api/admin/menus/menus**', async (route) => {
  const m = route.request().method();
  if (m === 'GET') return json(route, { days: { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }, dishes: [{ id: 1, name: 'Chapati', is_active: true }, { id: 2, name: 'Tea', is_active: true }, { id: 3, name: 'Old dish', is_active: false }],
    menus: [{ id: 1, name: 'Breakfast', slug: 'breakfast', description: null, days: [1, 2, 3, 4, 5], starts_at: '06:00', ends_at: '11:00', sort_order: 0, is_active: true, serves: 'Mon–Fri, 06:00–11:00', serving_now: true, sections: [{ name: 'Mains', description: null, dishes: [{ id: 1, name: 'Chapati' }] }] }] });
  sent.push(['menu', m, route.request().postDataJSON()]);

  return json(route, { message: 'Menu saved.' }, 201);
});
await go('MenuCards');
await page.locator('[data-testid="menu-cards"]').waitFor({ timeout: 15000 });
text = await page.locator('[data-menu="Breakfast"]').innerText();
ok('the menu list shows when it is served, that it is on now and what is in it', /Serving now/.test(text) && /Mon–Fri, 06:00–11:00/.test(text) && /Mains/.test(text) && /Chapati/.test(text), text.replace(/\n+/g, ' | '));
await page.getByRole('button', { name: /New menu/ }).click();
await page.getByLabel('Name', { exact: true }).fill('Dinner');
await page.getByLabel('Mon').check();
await page.getByLabel('Tue').check();
await page.getByLabel('From (blank = all day)').fill('18:00');
await page.getByLabel('Until').fill('23:30');
await page.getByRole('button', { name: 'Add a section' }).click();
await page.getByLabel('Section 1 name').fill('Mains');
await page.getByLabel('Add a dish to Mains').selectOption({ label: 'Chapati' });
await page.getByLabel('Add a dish to Mains').selectOption({ label: 'Tea' });
await page.getByLabel('Move Tea up').click();
ok('dishes can be moved within a section and one already added is not offered again', (await page.locator('[data-testid="section-dish"]').first().innerText()).includes('Tea') && !(await page.getByLabel('Add a dish to Mains').innerText()).includes('Chapati'));
ok('a dish that is off the menu is marked as such in the list', /Old dish \(off the menu\)/.test(await page.getByLabel('Add a dish to Mains').innerText()));
await page.screenshot({ path: D + 'menus-card-modal.png' });
await page.getByRole('button', { name: 'Save menu' }).click();
await page.waitForTimeout(500);
const mn = sent.find((x) => x[0] === 'menu' && x[1] === 'POST');
ok('the save sends the days, the hours and the sections with the dishes in order', mn && mn[2].name === 'Dinner' && mn[2].days.join() === '1,2' && mn[2].starts_at === '18:00' && mn[2].ends_at === '23:30' && mn[2].sections[0].dishes.join() === '2,1', JSON.stringify(mn?.[2]));

// ---------------------------------------------------------------- choices on a dish
await page.route('**/api/admin/menus/dishes/*/options', async (route) => {
  const m = route.request().method();
  if (m === 'GET') return json(route, { dish: { id: 1, name: 'Chapati', has_recipe: true }, groups: [], families: [{ id: 7, name: 'Wheat flour', unit: 'g', unit_id: 1 }, { id: 9, name: 'Cheese', unit: 'g', unit_id: 1 }], units, dishes: [{ id: 2, name: 'Tea' }], recipe_lines: [{ family_id: 7, variant_id: null, name: 'Wheat flour' }] });
  sent.push(['options', m, route.request().postDataJSON()]);

  return json(route, { message: 'Choices saved.', groups: [] });
});
await go('MenusDishes');
await page.locator('[data-testid="dishes"]').waitFor({ timeout: 15000 });
await page.locator('[data-dish="Chapati"]').getByRole('button', { name: 'Choices' }).click();
await page.getByRole('button', { name: 'Add a group of choices' }).click();
await page.getByLabel('Group', { exact: true }).fill('Extras');
await page.getByLabel('People').selectOption('multiple');
await page.getByLabel('At most').fill('2');
await page.getByLabel(/Choice 1 of Extras/).fill('Extra cheese');
await page.getByLabel(/Price change of Extra cheese/).fill('50');
await page.getByRole('button', { name: 'The kitchen uses…' }).click();
await page.getByLabel('Which ingredient').selectOption({ label: 'Cheese (g)' });
await page.getByLabel('How much').fill('20');
await page.getByRole('button', { name: 'Add a choice' }).click();
await page.getByLabel(/Choice 2 of Extras/).fill('No flour');
await page.getByLabel(/Price change of No flour/).fill('30');
await page.locator('[data-testid="option"]').nth(1).getByRole('button', { name: 'The kitchen uses…' }).click();
await page.locator('[data-testid="option"]').nth(1).getByLabel('What it does').selectOption('remove');
await page.locator('[data-testid="option"]').nth(1).getByLabel('Which ingredient').selectOption({ label: 'Wheat flour' });
ok('leaving something out shows no price (it is free)', await page.getByLabel(/Price change of No flour/).isDisabled() && (await page.getByLabel(/Price change of No flour/).inputValue()) === '0');
await page.getByLabel('charge for leaving it out').check();
ok('unless it is charged for on purpose', !(await page.getByLabel(/Price change of No flour/).isDisabled()));
await page.screenshot({ path: D + 'menus-options-modal.png' });
await page.getByRole('button', { name: 'Save choices' }).click();
await page.waitForTimeout(500);
const op = sent.find((x) => x[0] === 'options' && x[1] === 'PUT');
const g0 = op?.[2].groups[0];
ok('the choices are saved with their price, what they use and what they leave out', op && g0.name === 'Extras' && g0.kind === 'multiple' && g0.max_choices === 2 && g0.options[0].price_delta === 50 && g0.options[0].uses[0].mode === 'add' && g0.options[0].uses[0].family_id === 9 && g0.options[0].uses[0].quantity === 20
  && g0.options[1].uses[0].mode === 'remove' && g0.options[1].uses[0].family_id === 7 && g0.options[1].charge_removal === true && g0.options[1].price_delta === 30, JSON.stringify(g0));

// ---------------------------------------------------------------- the public menu
const pubDish = (o) => ({ id: 1, name: 'Chapati', slug: 'chapati', description: 'Soft', photo: null, prep_minutes: 5, price: 50, price_incl: 58, available: true, sold_out_today: false, allergens: ['wheat'], diets: ['vegetarian'], info_complete: true, options: [], ...o });
await page.route('**/api/menu', (route) => json(route, {
  menus: [
    { id: 1, name: 'Breakfast', slug: 'breakfast', description: 'Until eleven', serves: 'Mon–Fri, 06:00–11:00', serving_now: false, sections: [{ id: 1, name: 'Mains', description: null, dishes: [pubDish({}), pubDish({ id: 2, name: 'Fruit bowl', allergens: [], diets: ['vegetarian', 'vegan'], price: 200, price_incl: null }), pubDish({ id: 3, name: 'Mystery pie', allergens: [], diets: [], info_complete: false, available: false, sold_out_today: true }),
      pubDish({ id: 4, name: 'Burger', allergens: ['milk'], diets: [], options: [{ id: 1, name: 'Size', kind: 'single', min_choices: 1, max_choices: 1, options: [{ id: 1, name: 'Regular', price_delta: 0, is_default: true, dish: null }, { id: 2, name: 'Large', price_delta: 100, is_default: false, dish: null }] }] })] }] },
    { id: 2, name: 'Dinner', slug: 'dinner', description: null, serves: 'Every day, 18:00–23:30', serving_now: true, sections: [{ id: 2, name: 'Grill', description: 'From the fire', dishes: [pubDish({ id: 5, name: 'Nyama choma', allergens: [], diets: [], price: 900, price_incl: 1044 })] }] },
  ],
  allergens: { milk: 'Milk', wheat: 'Wheat / gluten' }, diets: { vegetarian: 'Vegetarian', vegan: 'Vegan' }, note: 'Please tell us about any allergy before you order.', now: '2026-10-12T08:00:00+03:00' }));
await go('MenuPublic');
await page.locator('[data-testid="public-menu"]').waitFor({ timeout: 15000 });
ok('the menu being served now opens first', /Nyama choma/.test(await page.locator('[data-testid="public-menu"]').innerText()) && /Serving now/.test(await page.locator('[data-testid="serves"]').innerText()));
await page.getByRole('tab', { name: /Breakfast/ }).click();
ok('another menu says when it is served', /Not being served right now · Mon–Fri, 06:00–11:00/.test(await page.locator('[data-testid="serves"]').innerText()));
text = await page.locator('[data-dish="Chapati"]').innerText();
ok('a dish shows its price with tax, its allergens and its diet badges', /58/.test(text) && /Wheat/.test(text) && /Vegetarian/.test(text), text.replace(/\n+/g, ' | '));
ok('a price with no tax figure says plus tax', /200\s*\+ tax/.test(await page.locator('[data-dish="Fruit bowl"]').innerText()));
ok('a sold-out dish says so', /Sold out today/.test(await page.locator('[data-dish="Mystery pie"]').innerText()));
await page.locator('[data-dish="Burger"] summary').click();
ok('the choices open with their prices', /Size/.test(await page.locator('[data-dish="Burger"]').innerText()) && /Large \(\+100\)/.test(await page.locator('[data-dish="Burger"]').innerText()));
await page.getByRole('button', { name: 'Vegan', exact: true }).click();
ok('the diet filter shows only dishes that suit it', (await page.locator('[data-dish]').count()) === 1 && /Fruit bowl/.test(await page.locator('[data-testid="public-menu"]').innerText()));
await page.getByRole('button', { name: 'Vegan', exact: true }).click();
await page.getByRole('button', { name: 'Wheat / gluten', exact: true }).click();
ok('avoiding an allergen hides the dishes that contain it and says how many', !(await page.locator('[data-dish="Chapati"]').count()) && /1 dish hidden/.test(await page.locator('[data-testid="hidden-count"]').innerText()));
ok('a dish whose ingredients are not all classified is not called safe: it says to ask', /Ask us: not every ingredient is classified/.test(await page.locator('[data-dish="Mystery pie"]').innerText()));
ok('the allergen note is shown', /tell us about any allergy/.test(await page.locator('[data-testid="allergen-note"]').innerText()));
await page.screenshot({ path: D + 'menus-public.png', fullPage: true });

// ---------------------------------------------------------------- settings
await go('MenusSettings');
await page.locator('[data-testid="menus-settings"]').waitFor({ timeout: 15000 });
ok('the settings page has the tip and service charge accounts (managed in the books)', /Tips are booked to/.test(await page.locator('[data-testid="menus-settings"]').innerText()) && /Service charge on dine-in/.test(await page.locator('[data-testid="menus-settings"]').innerText()));

await finish();
