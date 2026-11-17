// Browser check: the Money tab (build 4.2): agreed, billed, paid, owed, budget, spend, committed, profit and the phases, all as the books say,
// and what it says when there is no budget or no cost centre. The API is answered by the check itself; the figures are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.money.view', 'projects.money.budget', 'books.view'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

const words = { project: { name: 'Matter', plural: 'Matters' }, phase: { name: 'Phase', plural: 'Phases' } };
let can = { open: true, edit: true, stage: true, close: true, freeze: false, confidential: true, phases: true, members: true, members_view: true, links: true, log: true, access: true, parties: true, money: true };
const project = () => ({ id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'Projects › M-0413', words, can, locks: {}, fields: [] });
let money = { ready: true, currency: 'KES', agreed: { amount: 1500000, from: 'quotations', count: 1 }, billed: 600000, owed: 150000, days_late: 30, paid: 450000, income: 600000, spent: 380000, profit: 220000, committed: 40000, budget: 420000,
  phases: [{ id: 1, name: 'Pleadings', budget: 150000, spent: 142000, billed: 300000 }, { id: 2, name: 'Discovery', budget: null, spent: 96500, billed: 300000 }], cost_centres: 3 };
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: project() }));
await page.route(/\/api\/admin\/projects\/413\/money$/, (route) => json(route, { money, can: { budget: true } }));
const sent = [];
let ledgers = [{ id: 1, ledger_id: 31, name: 'Court fees, Imara v. Baraka', group: 'Direct Expenses', purpose: 'general', purpose_name: 'An account for this work', note: 'Disbursements', made_by: 'Kamau', made_at: '2026-11-14 10:00:00', is_active: true }];
const ledgerAnswer = () => ({ ledgers, groups: { general: [{ id: 1, name: 'Direct Expenses', nature: 'expense' }, { id: 2, name: 'Current Liabilities', nature: 'liability' }], bank: [{ id: 4, name: 'Client Bank Accounts', nature: 'asset' }] },
  purposes: { general: 'An account for this work', bank: 'A bank account', client_money: 'Client money held', retention: 'Retention', advance: 'Advances' }, can: { make: true, bank: true } });
await page.route(/\/api\/admin\/projects\/413\/ledgers$/, (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['ledger', b]); if (b.name === 'Filing fees') return json(route, { message: 'The books already have a ledger by that name. Choose another, or link to that one.' }, 422);
    ledgers = [...ledgers, { id: 2, ledger_id: 32, name: b.name, group: b.purpose === 'bank' ? 'Client Bank Accounts' : 'Direct Expenses', purpose: b.purpose, purpose_name: b.purpose === 'bank' ? 'A bank account' : 'An account for this work', note: b.note || null, made_by: 'Kamau', made_at: '2026-11-17 10:00:00', is_active: true }]; return json(route, ledgerAnswer(), 201); }
  return json(route, ledgerAnswer());
});

await go('/admin/projects/413?tab=money');
await page.locator('[data-money]').waitFor({ timeout: 15000 });
ok('the agreed value says where it comes from', /Agreed\s*KES 1,500,000/.test(await text()) && /From the linked quotations/.test(await text()));
ok('billed, paid and owed read as the books have them, with how late', /Billed\s*KES 600,000/.test(await text()) && /Paid\s*KES 450,000/.test(await text()) && /Owed\s*KES 150,000\s*30 days late/.test(await text()));
ok('the budget, spend, committed and what is left', /Budget\s*KES 420,000/.test(await text()) && /Committed \(open orders\)\s*KES 40,000/.test(await text()) && /Left\s*KES 0/.test(await text()));
ok('spend near the budget is shown as a warning', (await page.locator('[role="meter"]').nth(1).getAttribute('aria-valuenow')) === '100');
ok('profit is income less spend', /Income\s*KES 600,000/.test(await text()) && /Profit\s*KES 220,000/.test(await text()));
ok('each phase with its own cost centre has a row; a phase with no budget says so, not zero', /142,000/.test(await text(page.locator('[data-money-phase="Pleadings"]'))) && /·/.test(await text(page.locator('[data-money-phase="Discovery"]'))));
ok('the budget is planned in Books, where its approval is', (await page.getByRole('link', { name: 'Plan it in Books' }).getAttribute('href')).endsWith('/admin/books?tab=budgets'));
await page.screenshot({ path: D + 'projects-money.png', fullPage: true });

// ---------------------------------------------------------------- ledgers made from the work
ok('the ledgers made from this work are listed with where they sit and who made them', /Court fees, Imara v\. Baraka/.test(await text(page.locator('[data-ledgers]'))) && /Direct Expenses/.test(await text(page.locator('[data-ledgers]'))) && /Kamau/.test(await text(page.locator('[data-ledgers]'))));
await page.getByRole('button', { name: 'New ledger' }).click();
ok('a new ledger says it starts at nothing', /It starts at nothing\. Money only enters the books as a voucher/.test(await text(page.locator('[data-ledgers]'))));
ok('an ordinary account offers income, expense and liability groups only', (await page.getByLabel('Goes under').locator('option').allInnerTexts()).join() === 'Choose…,Direct Expenses,Current Liabilities');
await page.getByLabel('Name in the books').fill('Filing fees');
await page.getByLabel('Goes under').selectOption('1');
await page.getByRole('button', { name: 'Make it in Books' }).click();
await page.waitForTimeout(300);
ok('a name the books already have is refused in words', (await page.getByText('The books already have a ledger by that name').count()) > 0);
await page.getByLabel('What it is for').selectOption('bank');
ok('a bank account offers the bank groups and asks for the bank details', (await page.getByLabel('Goes under').locator('option').allInnerTexts()).join() === 'Choose…,Client Bank Accounts' && (await page.getByLabel('Account number').count()) === 1);
await page.getByLabel('Name in the books').fill('Client Account, KCB');
await page.getByLabel('Goes under').selectOption('4');
await page.getByLabel('Bank', { exact: true }).fill('KCB');
await page.getByLabel('Account number').fill('1234567890');
await page.getByRole('button', { name: 'Make it in Books' }).click();
await page.locator('[data-ledger="Client Account, KCB"]').waitFor({ timeout: 5000 });
const lg = [...sent].reverse().find((x) => x[0] === 'ledger')[1];
ok('the bank ledger is sent with its group and details and no opening balance', lg.purpose === 'bank' && lg.group_id === 4 && lg.bank_name === 'KCB' && lg.account_number === '1234567890' && !('opening_balance' in lg), JSON.stringify(lg));
await page.screenshot({ path: D + 'projects-ledgers.png', fullPage: true });

money = { ...money, agreed: null, budget: null, phases: [] };
await go('/admin/projects/413?tab=money');
await page.locator('[data-money]').waitFor({ timeout: 15000 });
ok('with nothing linked and no budget it says how to get them, and shows no zeroes', /Not linked/.test(await text()) && /Link a quotation or sales order under Links/.test(await text()) && /No budget in the books for this work/.test(await text()) && !/Left/.test(await text()));
money = { ready: false, why: 'This piece of work has no cost centre in the books.' };
await go('/admin/projects/413?tab=money');
await page.getByText('This piece of work has no cost centre in the books.').waitFor({ timeout: 15000 });
ok('without a cost centre it says why there are no figures', true);
can = { ...can, money: false };
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Overview' }).waitFor({ timeout: 15000 });
ok('someone whose role does not see money has no Money tab', (await page.getByRole('tab', { name: 'Money' }).count()) === 0);

await finish(c);
