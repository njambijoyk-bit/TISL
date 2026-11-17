// Browser check: client money (builds 4.4 and 4.5): accounts (pooled and dedicated), opening one with its bank and liability ledgers, balances for one
// client or several jointly, receiving into a balance, paying out of one (never more than it holds; a serious action), switching an account's guard,
// and what is held showing on the Money tab. The API is answered by the check itself;
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
let askSupervisor = false;
await page.route(/\/api\/admin\/projects\/client-money\/(balances\/\d+\/pay-out|accounts\/\d+\/guard)$/, (route) => {
  const url = route.request().url(); const b = route.request().postDataJSON(); const headers = route.request().headers();
  if (/guard$/.test(url)) { sent.push(['guard', Number(url.match(/accounts\/(\d+)/)[1]), b.on]); accounts = accounts.map((a) => (a.id === Number(url.match(/accounts\/(\d+)/)[1]) ? { ...a, guard_on: b.on } : a)); return json(route, answer()); }
  const id = Number(url.match(/balances\/(\d+)/)[1]);
  sent.push(['payOut', id, b, headers['x-projects-ask'] || null, headers['x-projects-reason'] ? decodeURIComponent(headers['x-projects-reason']) : null]);
  if (askSupervisor && !headers['x-projects-ask']) return json(route, { message: 'This needs a supervisor to approve it first.', serious: { state: 'ask', action: 'held.pay_out', label: 'Pay out of held client money', needs: 'supervisor', reason_required: true } }, 428);
  if (askSupervisor) return json(route, { message: 'Sent to 2 people who can approve it. Nothing has changed yet.', serious: { state: 'asked', approvers: 2 } }, 409);
  accounts = accounts.map((a) => ({ ...a, balances: a.balances.map((x) => (x.id === id ? { ...x, held: x.held - b.amount } : x)) }));
  return json(route, answer(), 201);
});
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

// ---------------------------------------------------------------- paying out (4.5)
ok('a balance with nothing in it offers no pay out', (await page.getByRole('button', { name: 'Pay out of Grace Wambua and Peter Wambua' }).count()) === 1 && (await page.locator('[data-balance="Imara Sacco"]').getByRole('button', { name: /Pay out/ }).count()) === 1);
await page.getByRole('button', { name: 'Pay out of Imara Sacco' }).click();
await page.getByLabel('Amount').fill('2000000');
ok('more than the balance holds is caught before it is sent', /More than this balance holds/.test(await text(page.locator('[data-pay-out]'))) && await page.getByRole('button', { name: 'Pay it out' }).isDisabled());
await page.getByLabel('Amount').fill('250000');
await page.getByLabel('Paid to', { exact: true }).fill('Imara Sacco');
await page.getByLabel('What for (optional)').fill('Refund of unused deposit');
ok('paying out says what will be posted, and that other clients are not touched', /out of Client Account, KCB, and less owed through Client money owed\. Never more than this balance holds; other clients' money is not touched/.test(await text(page.locator('[data-pay-out]'))));
await page.screenshot({ path: D + 'projects-client-money-pay-out.png', fullPage: true });
await page.getByRole('button', { name: 'Pay it out' }).click();
await page.waitForTimeout(500);
const po = last('payOut');
ok('the payment is sent to that balance with who it went to', po[1] === 1 && po[2].amount === 250000 && po[2].to === 'Imara Sacco' && po[2].note === 'Refund of unused deposit' && /KES 1,000,000/.test(await text(page.locator('[data-balance="Imara Sacco"]'))));

// when the rules say a supervisor approves it first, the person is asked why and it is sent for approval; nothing is paid
askSupervisor = true;
await page.getByRole('button', { name: 'Pay out of Imara Sacco' }).click();
await page.getByLabel('Amount').fill('1000');
await page.getByLabel('Paid to', { exact: true }).fill('Imara Sacco');
await page.getByRole('button', { name: 'Pay it out' }).click();
await page.getByRole('dialog').waitFor({ timeout: 5000 });
await page.getByLabel('Why it needs doing').fill('Client asked for it in writing');
await page.getByRole('button', { name: 'Ask a supervisor' }).click();
await page.waitForTimeout(600);
const asked = last('payOut');
ok('a pay out that needs a supervisor is sent for approval with the reason, and the screen says nothing has changed', asked[3] === '1' && asked[4] === 'Client asked for it in writing' && /Sent to 2 people who can approve it\. Nothing has changed yet\./.test(await text(page.locator('[data-pay-out]'))));
await page.getByRole('button', { name: 'Cancel' }).click();
askSupervisor = false;

// the guard
await page.getByRole('button', { name: 'Switch on the guard on Client Account, KCB' }).click();
await page.waitForTimeout(400);
ok('switching the guard on is sent, and the account then shows it', JSON.stringify(last('guard')) === JSON.stringify(['guard', 1, true]) && /Guard on/.test(await text(page.locator('[data-account="Client Account, KCB"]'))) && (await page.getByRole('button', { name: 'Switch off the guard on Client Account, KCB' }).count()) === 1);

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
