// Browser check: rates, billing time and costs billed back on the Money tab (builds 5.8 and 5.9): time to bill by person and Books package at Books' price, a person with
// no rate warned about, writing off part of an entry, billing it (posted), a drafted bill waiting and opening Books' sales form with a service
// line, the rate card, and marking costs to bill back or writing them off. The API is answered by the check itself; pricing, marking and the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'books.view', 'books.post', 'projects.use', 'projects.money.view', 'projects.money.bill', 'projects.money.rates', 'projects.money.writeoff'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
const words = { project: { name: 'Matter', plural: 'Matters' }, phase: { name: 'Phase', plural: 'Phases' } };
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words, can: { open: true, money: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));
await page.route(/\/api\/admin\/projects\/413\/money$/, (route) => json(route, { money: { ready: true, currency: 'KES', agreed: null, billed: 0, owed: 0, days_late: 0, paid: 0, income: 0, spent: 0, profit: 0, committed: 0, budget: null, phases: [], cost_centres: 1, held: null }, can: { budget: false } }));
await page.route(/\/api\/admin\/projects\/413\/ledgers$/, (route) => json(route, { ledgers: [], groups: { general: [], bank: [] }, purposes: {}, can: { make: false, bank: false } }));

const P = { partner: { id: 12, service_id: 1, service: 'Professional time', name: 'Partner hour, Imara rate', price: 20000, unit: 'hour' }, assoc: { id: 11, service_id: 1, service: 'Professional time', name: 'Associate hour', price: 12000, unit: 'hour' } };
let mode = 'post';
let groups = [{ person: 'Wanjiru', package: P.partner, hours: 4.8, amount: 96000, entries: [{ id: 1, work_date: '2026-11-16', minutes: 288, written_off_minutes: 0, note: 'First draft', task: 'M-0413-T12 Draft defence' }] },
  { person: 'Otieno', package: P.assoc, hours: 6.5, amount: 78000, entries: [{ id: 2, work_date: '2026-11-17', minutes: 390, written_off_minutes: 0, note: null, task: null }] }, { person: 'Kioko', package: null, hours: 1, amount: null, entries: [{ id: 3, work_date: '2026-11-18', minutes: 60, written_off_minutes: 0, note: null, task: null }] }];
let drafts = [];
const unbilled = () => ({ ready: true, groups, hours: groups.reduce((n, g) => n + g.hours, 0), amount: groups.reduce((n, g) => n + (g.amount ?? 0), 0), no_rate: groups.filter((g) => !g.package).map((g) => g.person), drafts,
  disbursements: [{ id: 5, voucher: 'PV-0201', date: '2026-11-15', narration: 'Court filing fee', ledger: 'Court fees', amount: 3500 }], mode, can: { bill: true, writeoff: true } });
await page.route(/\/api\/admin\/projects\/413\/time-billing(\/\d+)?(\?.*)?$/, (route) => {
  const m = route.request().method();
  if (m === 'POST') {
    sent.push(['bill', route.request().postDataJSON()]);
    if (mode === 'draft') { drafts = [{ id: 31, name: 'Time and costs to 24 Nov 2026', entries: 2, voucher_type_id: 7 }]; return json(route, { mode: 'draft', stage_id: 31, form: { voucher_type_id: 7 }, unbilled: unbilled() }); }
    groups = groups.filter((g) => !g.package); return json(route, { mode: 'post', stage_id: 30, voucher: { id: 90, number: 'INV-0090' }, unbilled: unbilled() }, 201);
  }
  if (m === 'DELETE') { sent.push(['drop']); drafts = []; return json(route, unbilled()); }
  return json(route, unbilled());
});
await page.route(/\/api\/admin\/projects\/time\/\d+\/write-off$/, (route) => { const b = route.request().postDataJSON(); sent.push(['writeoff', Number(route.request().url().match(/time\/(\d+)/)[1]), b]); groups = groups.map((g) => (g.person === 'Wanjiru' ? { ...g, hours: 3.8, amount: 76000, entries: g.entries.map((e) => ({ ...e, written_off_minutes: b.minutes })) } : g)); return json(route, unbilled()); });
let rates = [{ id: 1, who: 'Wanjiru', user_id: 1, project_role_id: null, package: P.partner, valid_from: '2026-11-01', valid_to: null }];
await page.route(/\/api\/admin\/projects\/413\/rates(\/\d+)?$/, (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['rate', b]); rates = [...rates, { id: 2, who: 'Associate (role)', user_id: null, project_role_id: b.project_role_id, package: P.assoc, valid_from: null, valid_to: null }]; }
  return json(route, { ready: true, rates, packages: [P.partner, P.assoc], roles: [{ id: 3, name: 'Associate' }], people: [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Otieno' }], can: { change: true } });
});
let costs = [{ entry_id: 50, id: null, voucher: 'PV-0201', date: '2026-11-15', narration: 'Court filing fee', ledger: 'Court fees', amount: 3500, state: 'not_marked', write_off_reason: null },
  { entry_id: 51, id: 2, voucher: 'PV-0202', date: '2026-11-16', narration: 'Taxi to court', ledger: 'Travel', amount: 1200, state: 'to_bill', write_off_reason: null }];
await page.route(/\/api\/admin\/projects\/413\/disbursements(\/\d+)?$/, (route) => {
  if (route.request().method() === 'PUT') {
    const id = Number(route.request().url().split('/').pop()); const b = route.request().postDataJSON(); sent.push(['cost', id, b]);
    costs = costs.map((c) => (c.entry_id !== id ? c : b.write_off ? { ...c, state: 'written_off', write_off_reason: b.reason } : { ...c, state: b.on ? 'to_bill' : 'not_marked' }));
  }
  return json(route, { ready: true, lines: costs, can: { mark: true, writeoff: true } });
});
await page.route(/\/api\/admin\/projects\/billing-stages\/31\/form$/, (route) => json(route, { bill: { stage_id: 31, customer_id: 1, customer_name: 'Imara Sacco', cost_centre_id: 9, narration: 'M-0413 Imara Sacco v. Baraka Traders: Time and costs to 24 Nov 2026', reference_no: 'M-0413', voucher_type_id: 7,
  lines: [{ type: 'service', service_id: 1, service_variant_id: 11, quantity: 6.5, label: 'Professional time · Associate hour', notes: 'Time to 24 Nov 2026' }, { type: 'custom', description: 'Disbursement: Court filing fee (PV-0201)', quantity: 1, rate: 3500, ledger_id: 4 }] } }));
await page.route('**/api/admin/books/voucher-types**', (route) => json(route, [{ id: 7, code: 'INV', name: 'Sales Invoice', base_type: 'sales', is_active: true, has_items: true, party_kind: 'customer' }]));
await page.route('**/api/admin/cost-centres/options', (route) => json(route, { ready: true, line_override: false, data: [{ id: 9, name: 'M-0413', depth: 0 }] }));
await page.route('**/api/admin/projects/voucher-picker**', (route) => json(route, { rule: 'optional', projects: [{ id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', confidential: false, cost_centre_id: 9, phases: [] }], current: null }));
await page.route('**/api/admin/books/vouchers/preview', (route) => json(route, { warnings: [], lines: [], entries: [], subtotal: 0, total: 0, tax_total: 0, tax_breakdown: [], stock: [], currency: 'KES' }));

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=money')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-time-billing]').waitFor({ timeout: 15000 });
const panel = page.locator('[data-time-billing]');
ok('time to bill is grouped by person and Books package, priced at Books\' price, with costs to bill back', /Wanjiru\s*Professional time · Partner hour, Imara rate\s*4\.8\s*KES 96,000/.test(await text(panel)) && /Otieno\s*Professional time · Associate hour\s*6\.5\s*KES 78,000/.test(await text(panel)) && /Costs to bill back · KES 3,500/.test(await text(panel)));
ok('time with no rate is flagged', /No rate covers the time of Kioko/.test(await text(panel)) && /Kioko\s*No rate/.test(await text(page.locator('[data-group="Kioko no rate"]'))));
await page.locator('[data-group="Wanjiru Partner hour, Imara rate"]').getByRole('button', { name: 'Entries' }).click();
await page.getByRole('button', { name: /Write off time on/ }).click();
await page.getByLabel('Minutes to write off').fill('60');
await page.getByLabel('Why').fill('Research ran long');
await panel.getByRole('button', { name: 'Write off', exact: true }).click();
await page.waitForTimeout(500);
ok('writing off part of an entry sends the minutes and why, and the hours follow', JSON.stringify(last('writeoff')) === JSON.stringify(['writeoff', 1, { minutes: 60, reason: 'Research ran long' }]) && /3\.8\s*KES 76,000/.test(await text(page.locator('[data-group="Wanjiru Partner hour, Imara rate"]'))) && /1h written off/.test(await text(panel)));
await page.screenshot({ path: D + 'projects-time-billing.png', fullPage: true });
await page.getByLabel('Up to').fill('2026-11-22');
await page.waitForTimeout(300);
await panel.getByRole('button', { name: 'Bill it' }).click();
await page.waitForTimeout(500);
ok('billing sends the day it runs to and leaves only what has no rate', last('bill')[1].up_to === '2026-11-22' && (await page.locator('[data-group]').count()) === 1);

// ---------------------------------------------------------------- the rate card on the work
ok('the work\'s rates show who, the Books package and price, and when', /Wanjiru\s*Professional time · Partner hour, Imara rate · 20,000 per hour\s*from/.test(await text(page.locator('[data-rates]'))));
await page.locator('[data-rates]').getByRole('button', { name: 'Add a rate' }).click();
await page.getByLabel('For', { exact: true }).selectOption('r3');
await page.getByLabel('Billed at (Books package)').selectOption('11');
await page.locator('[data-rates]').getByRole('button', { name: 'Add it' }).click();
await page.waitForTimeout(400);
ok('a rate for a project role is sent with its package', last('rate')[1].project_role_id === 3 && last('rate')[1].service_variant_id === 11 && last('rate')[1].user_id === null && (await page.locator('[data-rate="Associate (role)"]').count()) === 1);

// ---------------------------------------------------------------- costs to bill back (5.9)
ok('the costs on the work are listed with their amount and state', /Court filing fee\s*PV-0201 · Court fees\s*KES 3,500/.test(await text(page.locator('[data-cost="Court filing fee"]'))) && /To bill/.test(await text(page.locator('[data-cost="Taxi to court"]'))));
await page.getByRole('button', { name: 'Bill Court filing fee to the client' }).click();
await page.waitForTimeout(400);
ok('marking a cost to bill back is sent', JSON.stringify(last('cost')) === JSON.stringify(['cost', 50, { on: true }]) && /To bill/.test(await text(page.locator('[data-cost="Court filing fee"]'))));
await page.getByRole('button', { name: 'Write off Taxi to court' }).click();
await page.getByLabel('Why it is written off').fill('We agreed not to charge travel');
await page.locator('[data-cost="Taxi to court"]').getByRole('button', { name: 'Write off', exact: true }).click();
await page.waitForTimeout(400);
ok('writing off a cost sends why, and it shows written off', last('cost')[2].write_off === true && last('cost')[2].reason === 'We agreed not to charge travel' && /Written off: We agreed not to charge travel/.test(await text(page.locator('[data-cost="Taxi to court"]'))));

// ---------------------------------------------------------------- drafted
mode = 'draft';
groups = [{ person: 'Otieno', package: P.assoc, hours: 6.5, amount: 78000, entries: [] }];
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=money')}`, { waitUntil: 'networkidle' });
await page.locator('[data-time-billing]').waitFor({ timeout: 15000 });
await page.locator('[data-time-billing]').getByRole('button', { name: 'Open in Books' }).click();
await page.waitForURL(/project_bill=31/, { timeout: 10000 }).catch(() => {});
ok('a drafted time bill opens Books\' sales form', /\/admin\/books\/vouchers\/new\?type=7&project_bill=31/.test(page.url()), page.url());
await page.waitForTimeout(2500);
ok('the Books form has the time as a service line and the cost as a line of its own', (await page.locator('#root').innerText()).includes('Professional time · Associate hour') && (await page.locator('input[placeholder="Description"]').first().inputValue()) === 'Disbursement: Court filing fee (PV-0201)');

await finish(c);
