// Browser check: client money (build 4.4): accounts (pooled and dedicated), opening one with its bank and liability ledgers, balances for one
// client or several jointly, receiving into a balance, and what is held showing on the Money tab. The API is answered by the check itself;
// the rules and the Books journal are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.money.view', 'projects.money.held.view', 'projects.money.held.pay', 'projects.ledgers.bank'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

const bal = (id, label, held, o = {}) => ({ id, label, held, owners: [{ id: 1, name: label }], joint: false, project: null, is_closed: false, ...o });
let accounts = [
  { id: 1, name: 'Client Account, KCB', kind: 'pooled', guard_on: false, is_active: true, bank_ledger: { id: 1, name: 'Client Account, KCB' }, liability_ledger: { id: 2, name: 'Client money owed' }, held: 7450000,
    balances: [bal(1, 'Imara Sacco', 1250000, { project: { id: 413, number: 'M-0413' } }), bal(2, 'Grace and Peter Wambua', 6200000, { joint: true, owners: [{ id: 5, name: 'Grace Wambua' }, { id: 6, name: 'Peter Wambua' }] })] },
  { id: 2, name: 'Mwangi Estate, Equity', kind: 'dedicated', guard_on: false, is_active: true, bank_ledger: { id: 3, name: 'Mwangi Estate, Equity' }, liability_ledger: { id: 4, name: 'Client money: Mwangi Estate' }, held: 2000000, balances: [bal(3, 'Mwangi Estate', 2000000)] }];
const options = { kinds: { pooled: 'Pooled: a balance per client inside one account', dedicated: 'Dedicated: this account holds one balance' }, bank_ledgers: [{ id: 7, name: 'Equity Main' }], bank_groups: [{ id: 1, name: 'Bank Accounts' }], liability_ledgers: [{ id: 2, name: 'Client money owed' }], liability_groups: [{ id: 9, name: 'Current Liabilities' }] };
const answer = () => ({ accounts, ready: true, currency: 'KES', options, can: { manage: true, bank: true } });
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: { project: { name: 'Matter', plural: 'Matters' } }, keys: {} }));
await page.route('**/api/admin/projects/client-money', (route) => json(route, answer()));
await page.route('**/api/admin/projects/options/customers**', (route) => json(route, { customers: [{ id: 5, name: 'Grace Wambua', detail: 'C-005' }, { id: 6, name: 'Peter Wambua', detail: 'C-006' }] }));
await page.route(/\/api\/admin\/projects\/client-money\/(accounts(\/\d+\/balances)?|balances\/\d+\/receive)$/, (route) => {
  const url = route.request().url(); const b = route.request().postDataJSON();
  if (/accounts$/.test(url)) { sent.push(['account', b]); accounts = [...accounts, { id: 3, name: b.name, kind: b.kind, guard_on: false, is_active: true, bank_ledger: { id: 7, name: 'Equity Main' }, liability_ledger: { id: 8, name: `Client money: ${b.name}` }, held: 0, balances: [] }]; }
  else if (/balances$/.test(url)) { sent.push(['balance', Number(url.match(/accounts\/(\d+)/)[1]), b]); accounts = accounts.map((a) => (a.id === 3 ? { ...a, balances: [bal(9, b.label || 'Grace Wambua and Peter Wambua', 0, { joint: b.owners.length > 1, owners: b.owners.map((id) => ({ id, name: id === 5 ? 'Grace Wambua' : 'Peter Wambua' })) })] } : a)); }
  else { sent.push(['receive', Number(url.match(/balances\/(\d+)/)[1]), b]); if (!b.from) return json(route, { message: 'Say who the money came from.' }, 422); accounts = accounts.map((a) => ({ ...a, balances: a.balances.map((x) => (x.id === Number(url.match(/balances\/(\d+)/)[1]) ? { ...x, held: x.held + b.amount } : x)) })); }
  return json(route, answer(), 201);
});

await go('/admin/projects/client-money');
await page.locator('[data-account="Client Account, KCB"]').waitFor({ timeout: 15000 });
const kcb = page.locator('[data-account="Client Account, KCB"]');
ok('each account says what it is, its two Books ledgers, what it holds, and that its guard is off', /Pooled · bank ledger Client Account, KCB · owed through Client money owed/.test(await text(kcb)) && /KES 7,450,000 held/.test(await text(kcb)) && /Guard off/.test(await text(kcb)));
ok('a joint balance shows who it belongs to', /Grace and Peter Wambua\s*Joint\s*Grace Wambua, Peter Wambua/.test(await text(page.locator('[data-balance="Grace and Peter Wambua"]'))));
ok('a balance held for a piece of work links to its Money tab', (await page.getByRole('link', { name: 'M-0413' }).getAttribute('href')).endsWith('/admin/projects/413?tab=money'));
ok('a dedicated account that already has its balance offers no new one', (await page.locator('[data-account="Mwangi Estate, Equity"]').getByRole('button', { name: 'New balance' }).count()) === 0 && (await kcb.getByRole('button', { name: 'New balance' }).count()) === 1);
await page.screenshot({ path: D + 'projects-client-money.png', fullPage: true });

// ---------------------------------------------------------------- a new account and a joint balance
await page.getByRole('button', { name: 'New account' }).click();
await page.getByLabel('Name', { exact: true }).fill('Wambua Award');
await page.getByLabel('Kind').selectOption('dedicated');
await page.getByLabel('Bank ledger').selectOption('7');
ok('the liability ledger is opened for it unless one is chosen', (await page.getByLabel('Owed to clients (liability ledger)').inputValue()) === 'new' && /Open "Client money: Wambua Award" in Books/.test(await text()));
await page.getByLabel('Under', { exact: true }).selectOption('9');
await page.getByRole('button', { name: 'Open the account' }).click();
await page.locator('[data-account="Wambua Award"]').waitFor({ timeout: 5000 });
ok('the account is sent with an existing bank ledger and a new liability ledger', JSON.stringify(last('account')[1]) === JSON.stringify({ name: 'Wambua Award', kind: 'dedicated', bank_ledger_id: 7, liability_group_id: 9 }), JSON.stringify(last('account')[1]));
await page.locator('[data-account="Wambua Award"]').getByRole('button', { name: 'New balance' }).click();
await page.getByLabel('Held for (one client, or several jointly)').fill('wa');
await page.getByRole('button', { name: 'Grace Wambua' }).click();
await page.getByLabel('Held for (one client, or several jointly)').fill('wa');
await page.getByRole('button', { name: 'Peter Wambua' }).click();
ok('two clients make it a joint balance', /Joint/.test(await text(page.locator('[data-account="Wambua Award"]'))));
await page.getByRole('button', { name: 'Open the balance' }).click();
await page.locator('[data-balance="Grace Wambua and Peter Wambua"]').waitFor({ timeout: 5000 });
ok('the balance is sent with both owners', JSON.stringify(last('balance')) === JSON.stringify(['balance', 3, { owners: [5, 6], label: null }]));

// ---------------------------------------------------------------- receiving
await page.getByRole('button', { name: 'Receive money for Grace Wambua and Peter Wambua' }).click();
ok('receiving says what will be posted in the books', /A journal is posted in the books: into Equity Main, owed through Client money: Wambua Award/.test(await text()));
await page.getByLabel('Amount').fill('6200000');
await page.getByLabel('From', { exact: true }).fill('Court award, HCCC 88 of 2025');
await page.getByLabel('Reference (optional)').fill('EFT 9921');
await page.getByRole('button', { name: 'Record it' }).click();
await page.waitForTimeout(500);
const rc = last('receive');
ok('the money is sent to that balance with who it came from', rc[1] === 9 && rc[2].amount === 6200000 && rc[2].from === 'Court award, HCCC 88 of 2025' && rc[2].reference === 'EFT 9921' && /KES 6,200,000/.test(await text(page.locator('[data-balance="Grace Wambua and Peter Wambua"]'))));

// ---------------------------------------------------------------- on the Money tab
const words = { project: { name: 'Matter', plural: 'Matters' } };
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words, can: { open: true, money: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));
await page.route(/\/api\/admin\/projects\/413\/money$/, (route) => json(route, { money: { ready: true, currency: 'KES', agreed: null, billed: 0, owed: 0, days_late: 0, paid: 0, income: 0, spent: 0, profit: 0, committed: 0, budget: null, phases: [], cost_centres: 1,
  held: { total: 1250000, balances: [{ id: 1, label: 'Imara Sacco', held: 1250000, joint: false, account: 'Client Account, KCB', owners: [], project: null, is_closed: false }] } }, can: { budget: false } }));
await page.route(/\/api\/admin\/projects\/413\/ledgers$/, (route) => json(route, { ledgers: [], groups: { general: [], bank: [] }, purposes: {}, can: { make: false, bank: false } }));
await go('/admin/projects/413?tab=money');
await page.locator('[data-held]').waitFor({ timeout: 15000 });
ok('the Money tab shows what is held for this work, and in which account', /Held for clients/.test(await text(page.locator('[data-held]'))) && /Imara Sacco\s*Client Account, KCB\s*KES 1,250,000/.test(await text(page.locator('[data-held]'))));

await finish(c);
