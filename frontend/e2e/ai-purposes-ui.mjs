// Browser check: AI → Keys with purposes (docs/AI_PURPOSES_SPEC.md, build A.2). The Keys tab: open to all or kept to some, a resting key. The Purposes tab:
// each purpose with who uses it, this month's usage against a limit and setting one (A.3), the Usage tab by purpose, by key and by month, its line with a model per place, changing the line, testing a purpose down its line, the rest length.
// The API is answered by the check itself; what the gateway does is proved by AiPurposesTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Owner', email: 'owner@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 6, permissions: ['admin.access', 'ai.keys'] } };
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');

const K = (id, label, provider, model, extra = {}) => ({ id, provider, label, model, effective_model: model, base_url: null, used_for: 'all', priority: id * 10, is_active: true, open_to_all: true, kept_to: [], resting_until: null, rest_reason: null,
  last_used_at: null, last_error: null, key_hint: '••••abcd', created_by: 'Owner', ...extra });
const soon = new Date(Date.now() + 25 * 60000).toISOString();
let keys = [K(1, 'Anthropic main', 'anthropic', 'claude-sonnet-4-5'), K(2, 'Gemini general', 'gemini', 'gemini-2.5-flash', { open_to_all: false, kept_to: ['analytics', 'drafts', 'explain'], resting_until: soon, rest_reason: 'over quota' }), K(3, 'OpenAI backup', 'openai', 'gpt-4o-mini')];
const P = (key, name, used, readers) => ({ key, name, about: `About ${name}`, readers, used_by: used });
const place = (k, model, position, own) => ({ key_id: k.id, label: k.label, provider: k.provider, model, position, own, resting_until: k.resting_until });
let draftsLine = [place(keys[1], 'gemini-2.5-flash', 1, true), place(keys[0], 'claude-haiku-4-5', 2, true), place(keys[2], 'gpt-4o-mini', 3, false)];
let draftsOwn = [{ key_id: 2, model: null }, { key_id: 1, model: 'claude-haiku-4-5' }];
let rest = 10;
let draftsUsage = { key: 'drafts', calls: 38, failed: 9, refused: 0, fell_back: 9, tokens: 410000, cost: 0.42, ms: 900, limit: 500000, limit_unit: 'tokens', used_pct: 82, stopped: false };
const answer = () => ({ columns_ready: true, ready: true, rest_minutes: rest, first_choice: { mimi: 1, drafts: 2 },
  providers: [{ value: 'anthropic', label: 'Anthropic', desc: 'Claude models', model: 'claude-sonnet-4-5', models: ['claude-sonnet-4-5', 'claude-haiku-4-5'] }, { value: 'gemini', label: 'Google Gemini', desc: 'Gemini models', model: 'gemini-2.5-flash', models: ['gemini-2.5-flash'] }, { value: 'openai', label: 'OpenAI', desc: 'GPT models', model: 'gpt-4o-mini', models: ['gpt-4o-mini'] }],
  purposes: [
    { ...P('mimi', 'Mimi chat', ['Mimi chat'], 'customers and staff'), line: [place(keys[0], 'claude-sonnet-4-5', 1, false), place(keys[2], 'gpt-4o-mini', 2, false)], own_line: [], usage: { key: 'mimi', calls: 4812, failed: 31, refused: 0, fell_back: 31, tokens: 2100000, cost: 18.4, ms: 1200, limit: null, limit_unit: 'tokens', used_pct: null, stopped: false } },
    { ...P('drafts', 'Drafts', ['Projects weekly updates'], 'whoever checks the draft, then its reader'), line: draftsLine, own_line: draftsOwn, usage: draftsUsage },
  ], keys });

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/ai-analytics/keys', (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['add', b]); keys = [...keys, K(4, b.label, b.provider, 'gpt-4o-mini', { open_to_all: b.open_to_all, kept_to: b.kept_to })]; return json(route, { success: true, id: 4 }, 201); }
  return json(route, answer());
});
await page.route(/\/api\/admin\/ai-analytics\/purposes\/drafts\/line$/, (route) => { const b = route.request().postDataJSON(); sent.push(['line', b]); draftsOwn = b.line; draftsLine = b.line.map((l, i) => place(keys.find((k) => k.id === l.key_id), l.model || keys.find((k) => k.id === l.key_id).model, i + 1, true)); return json(route, answer()); });
await page.route(/\/api\/admin\/ai-analytics\/purposes\/drafts\/test$/, (route) => { sent.push(['test']); return json(route, { ok: true, key: 'Anthropic main', model: 'claude-haiku-4-5', position: 2, ms: 640, reply: 'OK', purpose: 'Drafts', failed: [{ key: 'Gemini general', error: 'Google Gemini said: quota exceeded' }] }); });
await page.route(/\/api\/admin\/ai-analytics\/purposes\/drafts\/limit$/, (route) => { const b = route.request().postDataJSON(); sent.push(['limit', b]); draftsUsage = { ...draftsUsage, limit: b.monthly_limit, limit_unit: b.limit_unit, used_pct: b.monthly_limit ? Math.round((b.limit_unit === 'cost' ? 0.42 : 410000) / b.monthly_limit * 1000) / 10 : null }; return json(route, answer()); });
await page.route(/\/api\/admin\/ai-analytics\/usage$/, (route) => json(route, { ready: true, month: 'November 2026',
  purposes: [{ ...draftsUsage, name: 'Drafts' }, { key: 'mimi', name: 'Mimi chat', calls: 4812, failed: 31, refused: 0, fell_back: 31, tokens: 2100000, cost: 18.4, ms: 1200, limit: null, limit_unit: 'tokens', used_pct: null, stopped: false }],
  keys: [{ key_id: 1, label: 'Anthropic main', provider: 'anthropic', calls: 4700, failed: 0, tokens: 2300000, cost: 18.2, ms: 1100, purposes: ['drafts', 'mimi'] }, { key_id: 2, label: 'Gemini general', provider: 'gemini', calls: 20, failed: 40, tokens: 90000, cost: 0.03, ms: 700, purposes: ['drafts'] }],
  months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m, i) => ({ month: m, label: m, by_purpose: { mimi: { calls: 100 * i, tokens: 300000 * i, cost: 1 }, drafts: { calls: 5 * i, tokens: 50000 * i, cost: 0.1 } } })) }));
await page.route(/\/api\/admin\/ai-analytics\/purposes-rest$/, (route) => { rest = route.request().postDataJSON().rest_minutes; sent.push(['rest', rest]); return json(route, answer()); });

await page.goto(`${SITE}/e2e/harness.html?c=AiKeys`, { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'KEYS' }).waitFor({ timeout: 10000 });
const gem = page.locator('div', { hasText: /^Gemini general/ }).first();
ok('a key kept to some purposes says which, by name', /KEPT TO · PAGE ANALYSIS, DRAFTS, EXPLAIN IN WORDS|KEPT TO · .*DRAFTS/.test(await text(page.locator('[data-ai-kept]').first())));
ok('a resting key says until when and how to wake it', (await page.locator('[data-ai-resting]').count()) === 1 && /RESTING UNTIL .* TEST TO WAKE IT/.test(await text(page.locator('[data-ai-resting]'))));

await page.getByRole('button', { name: /NEW KEY/ }).click();
await page.locator('[data-ai-who]').getByRole('button', { name: 'Kept to some' }).click();
ok('only the purposes that show can be ticked', JSON.stringify((await page.locator('[data-ai-who] label:has(input)').allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['Mimi chat', 'Drafts']));
await page.locator('[data-ai-who]').getByLabel('Drafts').check();
await page.getByPlaceholder('e.g. Primary Anthropic Key').fill('Drafts only');
await page.getByPlaceholder('sk-••••••••••••••••').fill('sk-test');
await page.getByRole('button', { name: 'REGISTER KEY' }).click();
await page.waitForTimeout(300);
ok('a new key is saved kept to the ticked purpose', last('add')?.[1]?.open_to_all === false && JSON.stringify(last('add')?.[1]?.kept_to) === JSON.stringify(['drafts']) && last('add')?.[1]?.used_for === undefined);

await page.getByRole('tab', { name: 'PURPOSES' }).click();
await page.locator('[data-ai-purposes]').waitFor({ timeout: 5000 });
const drafts = page.locator('[data-ai-purpose="drafts"]');
ok('each purpose says who uses it', /Used by: Projects weekly updates/.test(await text(drafts.locator('[data-ai-used-by]'))));
ok('the line shows each place with its model, then the other keys allowed', /1 Gemini general resting until .* gemini-2.5-flash 2 Anthropic main claude-haiku-4-5 THEN THE OTHER KEYS ALLOWED FOR IT 3 OpenAI backup gpt-4o-mini/.test(await text(drafts.locator('[data-ai-line]'))));
ok('a purpose with no line of its own says it uses the keys allowed for it', /NO LINE OF ITS OWN: THE KEYS ALLOWED FOR IT 1 Anthropic main/.test(await text(page.locator('[data-ai-purpose="mimi"] [data-ai-line]'))));
ok('a purpose shows this month against its limit, amber past 80%', /This month: 38 calls · 9 fell back · 9 failed tries 410,000 tokens of 500,000 tokens/.test(await text(drafts.locator('[data-ai-usage="drafts"]'))) && (await drafts.getByRole('meter').getAttribute('aria-valuenow')) === '82');
ok('a purpose with no limit says so', /2,100,000 tokens · no limit/.test(await text(page.locator('[data-ai-usage="mimi"]'))));
await page.screenshot({ path: D + 'ai-purposes.png', fullPage: true });

await drafts.getByRole('button', { name: 'Change the line' }).click();
await drafts.getByRole('button', { name: 'Earlier' }).nth(1).click();
await drafts.getByLabel('Model for Gemini general').fill('gemini-2.5-pro');
await drafts.getByLabel('Add a key to Drafts').selectOption({ label: 'OpenAI backup · gpt-4o-mini' });
await drafts.getByRole('button', { name: 'Save the line' }).click();
await page.waitForTimeout(300);
ok('the line is saved in its new order with a model per place', JSON.stringify(last('line')?.[1]) === JSON.stringify({ line: [{ key_id: 1, model: 'claude-haiku-4-5' }, { key_id: 2, model: 'gemini-2.5-pro' }, { key_id: 3, model: null }] }));
ok('the card shows the new line', /1 Anthropic main claude-haiku-4-5 2 Gemini general .*gemini-2.5-pro 3 OpenAI backup gpt-4o-mini/.test(await text(drafts.locator('[data-ai-line]'))));

await drafts.getByRole('button', { name: 'Test this purpose' }).click();
await drafts.locator('[data-ai-test="drafts"]').waitFor({ timeout: 5000 });
ok('testing a purpose says which key answered, at which place, and what failed first', /Anthropic main answered at place 2 \(claude-haiku-4-5, 640 ms\) Gemini general failed first: Google Gemini said: quota exceeded/.test(await text(drafts.locator('[data-ai-test="drafts"]'))));

await drafts.getByRole('button', { name: 'Change the limit' }).click();
await drafts.locator('#lim-drafts').fill('1');
await drafts.getByLabel('Limit in').selectOption('cost');
await drafts.getByRole('button', { name: 'Save the limit' }).click();
await page.waitForTimeout(300);
ok('a monthly limit is saved in estimated cost', JSON.stringify(last('limit')?.[1]) === JSON.stringify({ monthly_limit: 1, limit_unit: 'cost' }));

await page.getByRole('tab', { name: 'USAGE' }).click();
await page.locator('[data-ai-usage-tab]').waitFor({ timeout: 5000 });
ok('the Usage tab lists each purpose this month with fallbacks, failed tries, tokens, estimated cost and limit', /Mimi chat 4,812 31 31 2,100,000 \$18.40 1,200 ms none/.test(await text(page.locator('[data-ai-usage-purpose="mimi"]'))));
ok('and each key with the purposes it served', /Anthropic main Drafts, Mimi chat 4,700 0 2,300,000 \$18.20/.test(await text(page.locator('[data-ai-usage-key="Anthropic main"]'))));
ok('and the last six months, drawn to one scale', (await page.locator('[data-ai-month]').count()) === 6 && /2026-11 1,750,000/.test(await text(page.locator('[data-ai-month="2026-11"]'))));
await page.screenshot({ path: D + 'ai-usage.png', fullPage: true });
await page.getByRole('tab', { name: 'PURPOSES' }).click();
await page.locator('#ai-rest').fill('30');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(300);
ok('how long a refused key rests is saved', last('rest')?.[1] === 30);
await finish(c);
