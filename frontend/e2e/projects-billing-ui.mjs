// Browser check: billing plans (build 4.6). On the Money tab: the plan as shares of the agreed value, when each stage falls due, changing it
// (shares over 100% are caught), billing a stage when bills are posted, and, when bills are drafted, Books' own sales form opening filled in
// with the bill and sending which stage it is for when saved. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'books.view', 'books.post', 'projects.use', 'projects.money.view', 'projects.money.bill'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: { project: { name: 'Matter', plural: 'Matters' } }, keys: {} }));
const words = { project: { name: 'Matter', plural: 'Matters' } };
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words, can: { open: true, money: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));
await page.route(/\/api\/admin\/projects\/413\/money$/, (route) => json(route, { money: { ready: true, currency: 'KES', agreed: { amount: 1160000, from: 'sales orders', count: 1 }, billed: 0, owed: 0, days_late: 0, paid: 0, income: 0, spent: 0, profit: 0, committed: 0, budget: null, phases: [], cost_centres: 1, held: null }, can: { budget: false } }));
await page.route(/\/api\/admin\/projects\/413\/ledgers$/, (route) => json(route, { ledgers: [], groups: { general: [], bank: [] }, purposes: {}, can: { make: false, bank: false } }));

const stage = (id, name, share, amount, o = {}) => ({ id, name, share, amount, due_kind: 'manual', due_on: null, phase: null, stage: null, state: 'due', voucher: null, ...o });
let mode = 'post';
let stages = [stage(1, 'Deposit', 30, 300000), stage(2, 'Pleadings filed', 30, 300000, { due_kind: 'phase', phase: { id: 5, name: 'Pleadings' }, state: 'waiting' }), stage(3, 'Judgment', 40, 400000, { due_kind: 'date', due_on: '2027-03-01', state: 'waiting' })];
const billing = () => ({ ready: true, basis: { net: 1000000, from: 'sales orders', count: 1 }, income_ledger: { id: 1, name: 'Legal fees' }, income_chosen: false, shares: stages.reduce((n, s) => n + s.share, 0), mode, stages,
  options: { due_kinds: { manual: 'When someone bills it', date: 'On a date', phase: 'When a phase is done', stage: 'When the work reaches a stage' }, phases: [{ id: 5, name: 'Pleadings' }], stages: [{ id: 1, name: 'Opening' }, { id: 2, name: 'Hearing' }], income_ledgers: [{ id: 1, name: 'Legal fees' }, { id: 2, name: 'Consulting fees' }] },
  can: { plan: true, bill: true } });
await page.route(/\/api\/admin\/projects\/413\/billing$/, (route) => {
  if (route.request().method() === 'PUT') {
    const b = route.request().postDataJSON(); sent.push(['save', b]);
    stages = [...stages.filter((s) => s.state === 'billed'), ...b.stages.filter((s) => s.name).map((s, i) => stage(10 + i, s.name, s.share, s.share * 10000, { due_kind: s.due_kind, due_on: s.due_on }))];
  }
  return json(route, { billing: billing() });
});
await page.route(/\/api\/admin\/projects\/413\/billing\/\d+\/bill$/, (route) => {
  const id = Number(route.request().url().match(/billing\/(\d+)\/bill/)[1]); sent.push(['bill', id]);
  if (mode === 'draft') return json(route, { mode: 'draft', form: { stage_id: id, voucher_type_id: 7 }, billing: billing() });
  stages = stages.map((s) => (s.id === id ? { ...s, state: 'billed', voucher: { id: 88, number: 'INV-0088', status: 'posted', date: '2026-11-17' } } : s));
  return json(route, { mode: 'post', voucher: { id: 88, number: 'INV-0088' }, billing: billing() }, 201);
});

// ---------------------------------------------------------------- the plan on the Money tab
await go('/admin/projects/413?tab=money');
await page.locator('[data-billing]').waitFor({ timeout: 15000 });
const plan = page.locator('[data-billing]');
ok('the plan says it is shares of the agreed value before tax, and how bills are made', /Shares of the agreed value: KES 1,000,000 before tax, from the linked sales orders\./.test(await text(plan)) && /Bills are posted/.test(await text(plan)));
ok('each stage shows its share, when it falls due, its amount and whether it is due', /Deposit\s*30%\s*When billed\s*KES 300,000\s*Due/.test(await text(page.locator('[data-stage="Deposit"]'))) && /When Pleadings is done/.test(await text(page.locator('[data-stage="Pleadings filed"]')))
  && /On .*2027/.test(await text(page.locator('[data-stage="Judgment"]'))) && /Not yet/.test(await text(page.locator('[data-stage="Judgment"]'))));
ok('the bills go to the income ledger the agreed order uses, which decides the tax', /100% of the agreed value is planned\. Bills go to Legal fees; the ledger decides the tax/.test(await text(plan)));
await page.screenshot({ path: D + 'projects-billing.png', fullPage: true });

await page.getByRole('button', { name: 'Bill Deposit' }).click();
await page.waitForTimeout(500);
ok('billing a stage posts it and shows the invoice', last('bill')[1] === 1 && /Billed\s*INV-0088/.test(await text(page.locator('[data-stage="Deposit"]'))) && (await page.getByRole('button', { name: 'Bill Deposit' }).count()) === 0);

// ---------------------------------------------------------------- changing it
await page.getByRole('button', { name: 'Change the plan' }).click();
ok('a billed stage is kept as it is while the rest can change', /Deposit · 30% · billed as INV-0088, kept as it is/.test(await text(plan)) && (await page.locator('[data-edit-stage]').count()) === 2);
await page.getByRole('button', { name: 'Add a stage' }).click();
await page.getByLabel('Stage', { exact: true }).nth(2).fill('Costs');
await page.getByLabel('Share (%)').nth(2).fill('10');
ok('shares over 100% are caught before saving', /110% of the agreed value planned: no more than 100%/.test(await text(page.locator('[data-shares]'))) && await page.getByRole('button', { name: 'Save the plan' }).isDisabled());
await page.getByLabel('Share (%)').nth(1).fill('30');
await page.getByLabel('Falls due').nth(2).selectOption('date');
await page.getByLabel('Date', { exact: true }).last().fill('2027-06-30');
await page.screenshot({ path: D + 'projects-billing-plan.png', fullPage: true });
await page.getByRole('button', { name: 'Save the plan' }).click();
await page.waitForTimeout(500);
const saved = last('save')[1];
ok('the plan is sent with the billed stage kept and the rest as typed', JSON.stringify(saved.stages.map((s) => [s.id ?? null, s.name ?? null, s.share ?? null, s.due_kind ?? null, s.due_on ?? null])) === JSON.stringify([[1, null, null, null, null], [2, 'Pleadings filed', 30, 'phase', null], [3, 'Judgment', 30, 'date', '2027-03-01'], [null, 'Costs', 10, 'date', '2027-06-30']]) && saved.income_ledger_id === null, JSON.stringify(saved));

// ---------------------------------------------------------------- drafted bills open on Books' sales form
mode = 'draft';
await go('/admin/projects/413?tab=money');
await page.locator('[data-billing]').waitFor({ timeout: 15000 });
ok('when bills are drafted, a stage opens in Books instead', /Bills open on the Books form/.test(await text(page.locator('[data-billing]'))) && (await page.getByRole('button', { name: 'Bill Costs' }).innerText()) === 'Open in Books');

await page.route('**/api/admin/books/voucher-types**', (route) => json(route, [{ id: 7, code: 'INV', name: 'Sales Invoice', base_type: 'sales', is_active: true, has_items: true, party_kind: 'customer' }]));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, [{ id: 1, name: 'Legal fees', group: { name: 'Sales', nature: 'income' } }]));
await page.route('**/api/admin/cost-centres/options', (route) => json(route, { ready: true, line_override: false, data: [{ id: 9, name: 'M-0413 Imara Sacco v. Baraka Traders', depth: 0 }] }));
await page.route('**/api/admin/projects/voucher-picker**', (route) => json(route, { rule: 'optional', projects: [{ id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', confidential: false, cost_centre_id: 9, phases: [] }], current: null }));
await page.route(/\/api\/admin\/projects\/billing-stages\/\d+\/form$/, (route) => { sent.push(['form', Number(route.request().url().match(/stages\/(\d+)\/form/)[1])]); return json(route, { bill: { stage_id: 12, stage: 'Costs', customer_id: 1, customer_name: 'Imara Sacco', cost_centre_id: 9, amount: 100000, narration: 'M-0413 Imara Sacco v. Baraka Traders: Costs', reference_no: 'M-0413', voucher_type_id: 7,
  lines: [{ type: 'custom', description: 'Costs: 10% of the agreed order for M-0413', quantity: 1, rate: 100000, ledger_id: 1 }] } }); });
let created = null;
await page.route('**/api/admin/books/vouchers/preview', (route) => json(route, { warnings: [], lines: [{ amount: 100000, taxes: [] }], entries: [], subtotal: 100000, total: 100000, tax_total: 0, tax_breakdown: [], stock: [], currency: 'KES' }));
await page.route(/\/api\/admin\/books\/vouchers$/, (route) => { if (route.request().method() !== 'POST') return json(route, []); created = route.request().postDataJSON(); return json(route, { message: 'INV-0089 saved', data: { id: 89, voucher_number: 'INV-0089' } }, 201); });
await page.getByRole('button', { name: 'Bill Costs' }).click();
await page.waitForURL(/\/admin\/books\/vouchers\/new\?type=7&project_bill=12/, { timeout: 10000 }).catch(() => {});
ok('opening a drafted bill goes to the Books sales form for that stage', /\/admin\/books\/vouchers\/new\?type=7&project_bill=12/.test(page.url()), page.url());
await page.locator('input[placeholder="Description"]').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
ok('the Books form is filled in with the bill: the line, the work and the narration', (await page.locator('input[placeholder="Description"]').first().inputValue()) === 'Costs: 10% of the agreed order for M-0413'
  && (await page.getByLabel('Project').inputValue()) === '9' && (await page.locator('#root').innerHTML()).includes('M-0413 Imara Sacco v. Baraka Traders: Costs') && last('form')[1] === 12);
await page.screenshot({ path: D + 'projects-billing-books-form.png', fullPage: true });
const saveBtn = page.getByRole('button', { name: /^(Save|Post)/ }).first();
if (await saveBtn.count()) { await saveBtn.click(); await page.waitForTimeout(800); }
ok('saving it on the Books form says which billing stage it is for', created?.project_billing_stage_id === 12 && created?.customer_id === 1 && String(created?.cost_centre_id) === '9', JSON.stringify(created));

await finish(c);
