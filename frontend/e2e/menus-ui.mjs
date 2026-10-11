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
ok('the Menus navigation is there with its four pages', (await page.locator('[data-testid="menus-nav"] [role="tab"]').count()) === 4);

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

// ---------------------------------------------------------------- settings
await go('MenusSettings');
await page.locator('[data-testid="menus-settings"]').waitFor({ timeout: 15000 });
ok('the settings page says tips and service charge live in the books', /Tips and service charge are accounts like any other/.test(await page.locator('[data-testid="menus-settings"]').innerText()));

await finish();
