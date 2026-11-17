// Browser check: advances and retention on the Money tab (build 4.7): the terms and what is held or unused, changing them, receiving an
// advance, releasing retention (never more than is held), and a billed stage showing what came off it or offering to take it off again.
// The API is answered by the check itself; the rules and the journals are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'books.post', 'projects.use', 'projects.money.view', 'projects.money.bill', 'projects.money.retention'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'general', company_industry: 'general', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'P-0413', title: 'Office block', description: null, industry: { key: 'general', name: 'General' }, type: { id: 1, name: 'Build' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'P-0413', words: {}, can: { open: true, money: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));
await page.route(/\/api\/admin\/projects\/413\/money$/, (route) => json(route, { money: { ready: true, currency: 'KES', agreed: { amount: 1160000, from: 'sales orders', count: 1 }, billed: 464000, owed: 0, days_late: 0, paid: 0, income: 400000, spent: 0, profit: 400000, committed: 0, budget: null, phases: [], cost_centres: 1, held: null }, can: { budget: false } }));
await page.route(/\/api\/admin\/projects\/413\/ledgers$/, (route) => json(route, { ledgers: [], groups: { general: [], bank: [] }, purposes: {}, can: { make: false, bank: false } }));
let owing = true;
const plan = () => ({ ready: true, basis: { net: 1000000, from: 'sales orders', count: 1 }, income_ledger: { id: 1, name: 'Legal fees' }, income_chosen: false, shares: 100, mode: 'post',
  stages: [{ id: 1, name: 'Foundations', share: 40, amount: 400000, due_kind: 'manual', due_on: null, phase: null, stage: null, state: 'billed', voucher: { id: 50, number: 'INV-0050', status: 'posted' }, retention: owing ? null : 40000, advance: owing ? null : 200000, owing },
    { id: 2, name: 'Roof', share: 60, amount: 600000, due_kind: 'manual', due_on: null, phase: null, stage: null, state: 'due', voucher: null, retention: null, advance: null, owing: false }],
  options: { due_kinds: {}, phases: [], stages: [], income_ledgers: [] }, can: { plan: true, bill: true } });
await page.route(/\/api\/admin\/projects\/413\/billing$/, (route) => json(route, { billing: plan() }));
await page.route(/\/api\/admin\/projects\/413\/billing\/1\/deduct$/, (route) => { sent.push(['deduct']); owing = false; return json(route, { taken: { retention: 7, advance: 8 }, billing: plan() }); });

let terms = { ready: true, retention_percent: 10, retention_ledger: { id: 2, name: 'Retention receivable', from: 'the company' }, retention_mode: 'company', advance_ledger: { id: 4, name: 'Advances from clients' }, retention_held: 40000, advance_unused: 300000,
  options: { retention_ledgers: [{ id: 2, name: 'Retention receivable' }, { id: 6, name: 'Retention: Imara Sacco' }], advance_ledgers: [{ id: 4, name: 'Advances from clients' }], cash_ledgers: [{ id: 5, name: 'KCB Main' }] }, can: { retention: true, advance: true } };
await page.route(/\/api\/admin\/projects\/413\/terms$/, (route) => {
  if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['terms', b]); terms = { ...terms, retention_percent: b.retention_percent, retention_ledger: b.retention_ledger_id === 6 ? { id: 6, name: 'Retention: Imara Sacco', from: 'this work' } : terms.retention_ledger }; }
  return json(route, { terms });
});
await page.route(/\/api\/admin\/projects\/413\/advances$/, (route) => { const b = route.request().postDataJSON(); sent.push(['advance', b]); terms = { ...terms, advance_unused: terms.advance_unused + b.amount }; return json(route, { voucher_id: 9, terms }, 201); });
await page.route(/\/api\/admin\/projects\/413\/retention\/release$/, (route) => { const b = route.request().postDataJSON(); sent.push(['release', b]); terms = { ...terms, retention_held: terms.retention_held - b.amount }; return json(route, { voucher_id: 10, terms }, 201); });

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=money')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-terms]').waitFor({ timeout: 15000 });
const panel = page.locator('[data-terms]');
ok('the terms say the percentage, before tax, and whose ledger it is', /10% of each bill, before tax/.test(await text(panel)) && /Retention receivable \(as the company\)/.test(await text(panel)));
ok('what is held and unused is shown', /Retention held\s*KES 40,000/.test(await text(panel)) && /Advance not yet used\s*KES 300,000/.test(await text(panel)));
ok('a billed stage whose retention and advance could not be taken offers to take them off', (await page.getByRole('button', { name: 'Take retention and advance off Foundations' }).count()) === 1);
await page.getByRole('button', { name: 'Take retention and advance off Foundations' }).click();
await page.waitForTimeout(500);
ok('once taken, the stage shows what came off its bill', last('deduct') && /less KES 40,000 retention\s*less KES 200,000 advance/.test(await text(page.locator('[data-stage="Foundations"]'))) && (await page.getByRole('button', { name: /Take retention and advance off/ }).count()) === 0);
await page.screenshot({ path: D + 'projects-terms.png', fullPage: true });

await panel.getByRole('button', { name: 'Change' }).click();
await page.getByLabel('Retention (%)').fill('5');
await page.getByLabel('Retention ledger').selectOption('6');
await panel.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(500);
ok('changing the terms sends the percentage and this work\'s own ledger', JSON.stringify(last('terms')[1]) === JSON.stringify({ retention_percent: 5, retention_ledger_id: 6, advance_ledger_id: 4 }) && /Retention: Imara Sacco \(chosen for this work\)/.test(await text(page.locator('[data-terms]'))));

await page.getByRole('button', { name: 'Receive an advance' }).click();
await page.getByLabel('Amount').fill('150000');
await page.getByLabel('Paid into').selectOption('5');
await page.getByLabel('From (optional)').fill('Imara Sacco');
await page.getByRole('button', { name: 'Record it' }).click();
await page.waitForTimeout(500);
ok('an advance is sent with the ledger it was paid into, and the unused figure grows', last('advance')[1].amount === 150000 && last('advance')[1].ledger_id === 5 && /Advance not yet used\s*KES 450,000/.test(await text(page.locator('[data-terms]'))));

await page.getByRole('button', { name: 'Release retention' }).click();
await page.getByLabel('Amount to release').fill('50000');
ok('releasing more than is held is caught before it is sent', /More than is held/.test(await text(page.locator('[data-release]'))) && await page.getByRole('button', { name: 'Release it' }).isDisabled());
await page.getByLabel('Amount to release').fill('15000');
await page.screenshot({ path: D + 'projects-terms-release.png', fullPage: true });
await page.getByRole('button', { name: 'Release it' }).click();
await page.waitForTimeout(500);
ok('releasing sends the amount, and what is held goes down', last('release')[1].amount === 15000 && /Retention held\s*KES 25,000/.test(await text(page.locator('[data-terms]'))));

await finish(c);
