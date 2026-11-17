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
