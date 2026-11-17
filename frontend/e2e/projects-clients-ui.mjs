// Browser check: clients (build 3.5): the list (health, flags, what they owe, filters, the export), one client's page (health with its reasons,
// flags on and off, account manager, work and opportunities, people and history), the health rules, and a flag in the client picker.
// The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.create', 'projects.clients.view', 'projects.clients.manage', 'projects.clients.export', 'projects.health.view', 'projects.flags', 'projects.pipeline', 'projects.interactions', 'projects.money.view', 'projects.config.view', 'projects.config.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

const row = (id, name, o = {}) => ({ id, name, number: `C-00${id}`, email: null, phone: null, manager: null, since: '2026-03-01', source: null, open_work: 0, last_contact: null, next: null, flags: [], money: null, health: { colour: 'green', reasons: [] }, ...o });
const list = [
  row(1, 'Imara Sacco', { manager: { id: 1, name: 'Kamau' }, source: 'Referral', open_work: 2, last_contact: '2026-10-06 11:00:00', next: { what: 'Quarterly review', due_on: '2026-11-07', late: true, today: false, days_late: 9 }, flags: [{ name: 'Credit hold', status: 'problem' }], money: { owed: 412000, overdue: 150000, days_late: 75, currency: 'KES' }, health: { colour: 'red', reasons: ['No contact for 41 days', 'Next action 9 days late', 'Flag: Credit hold', 'Money overdue for 75 days'] } }),
  row(2, 'Duka Fresh Ltd', { open_work: 1, last_contact: '2026-11-12 09:00:00', next: { what: 'Send lease draft', due_on: '2026-11-20', late: false, today: false, days_late: 0 } }),
  row(4, 'Karura Lodge', { next: null, health: { colour: 'amber', reasons: ['Nothing planned next'] } })];
let client = { ...list[0], email: 'office@imara.test', phone: '0700000001', flags: [{ id: 5, name: 'Credit hold', status: 'problem', reason: 'Over the limit', set_by: 'Njeri', set_at: '2026-11-02 10:00:00' }],
  projects: [{ id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', state: 'open', stage: 'Opening', status: 'info', confidential: false }, { id: 371, number: 'M-0371', title: 'Safiri debt recovery', state: 'closed', stage: 'Closed', status: 'good', confidential: false }],
  opportunities: [{ id: 3, title: 'Retainer 2027', for: { type: 'client', id: 1, name: 'Imara Sacco' }, kind: null, stage: { id: 4, key: 'negotiation', name: 'Negotiation', kind: 'open' }, owner: { id: 1, name: 'Kamau' }, expected_on: null, value: null, estimate: null, estimate_currency: null, quotation_voucher_id: null, project: null, lost_reason: null, closed_at: null, next: null, notes: null, can: { change: true } }],
  lead: null, can: { manage: true, flags: true, pipeline: true, create: true, export: true } };
const clientPage = () => ({ client, managers: [{ id: 1, name: 'Kamau' }, { id: 2, name: 'Njeri' }], flag_choices: [{ id: 40, name: 'Credit hold' }, { id: 41, name: 'Key client' }, { id: 42, name: 'Slow payer' }] });

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: { project: { name: 'Matter', plural: 'Matters' } }, keys: {} }));
await page.route('**/api/admin/projects/clients?**', (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['list', q]);
  const data = list.filter((r) => (!q.health || r.health.colour === q.health) && (!q.flagged || r.flags.length));
  return json(route, { data, total: data.length, page: 1, per_page: 25, counts: { green: 1, amber: 1, red: 1 }, ready: true, can: { export: true, health: true, money: true } }); });
await page.route('**/api/admin/projects/clients/export**', (route) => { sent.push(['export', Object.fromEntries(new URL(route.request().url()).searchParams)]); return route.fulfill({ status: 200, contentType: 'text/csv', body: 'Client\nImara Sacco\n' }); });
await page.route(/\/api\/admin\/projects\/clients\/1(\/flags(\/\d+)?)?$/, (route) => {
  const method = route.request().method(); const b = method === 'GET' ? null : route.request().postDataJSON();
  if (method === 'PUT') { sent.push(['manager', b]); client = { ...client, manager: b.manager_id ? { id: b.manager_id, name: 'Njeri' } : null }; }
  if (method === 'POST') { sent.push(['flag', b]); if (!b.reason) return json(route, { message: 'Say why the flag is there.' }, 422); client = { ...client, flags: [...client.flags, { id: 6, name: 'Slow payer', status: 'warning', reason: b.reason, set_by: 'Kamau', set_at: '2026-11-16 10:00:00' }] }; }
  if (method === 'DELETE') { sent.push(['unflag', Number(route.request().url().match(/(\d+)$/)[1]), b]); client = { ...client, flags: client.flags.filter((f) => f.id !== 5), health: { colour: 'amber', reasons: ['Flag: Slow payer'] } }; }
  return json(route, clientPage(), method === 'POST' ? 201 : 200);
});
await page.route(/\/api\/admin\/projects\/contacts\/customer\/1$/, (route) => json(route, { contacts: [{ id: 21, name: 'A. Otieno', job_title: 'CEO', email: null, phone: null, is_main: true, notes: null, roles: [{ key: 'decision_maker', name: 'Decision maker' }] }], roles: [], can: { change: true } }));
await page.route(/\/api\/admin\/projects\/history\/customer\/1$/, (route) => json(route, { entries: [{ id: 1, kind: 'call', kind_name: 'Call', summary: 'Agreed to file by November', happened_at: '2026-10-06 11:00:00', by: 'Kamau', contact: { id: 21, name: 'A. Otieno' }, project: { id: 413, number: 'M-0413' }, opportunity: null, team_only: false, mine: true }],
  next: [{ id: 7, what: 'Quarterly review', due_on: '2026-11-07', owner: { id: 1, name: 'Kamau' }, late: true, today: false, days_late: 9, subject_type: 'customer' }], kinds: { call: 'Call', note: 'Note' }, owners: [{ id: 1, name: 'Kamau' }], can: { write: true, next: true } }));
await page.route('**/api/admin/projects/pipeline/options', (route) => json(route, { types: [], owners: [], lost_reasons: [], stages: [], books: false, can: { books: false } }));
await page.route(/\/api\/admin\/projects\/history\/opportunity\/\d+$/, (route) => json(route, { entries: [], next: [], kinds: {}, owners: [], can: { write: true, next: true } }));
let health = { contact_amber_days: 30, contact_red_days: 60, late_red_days: 14, nothing_planned_amber: true, overdue_amber_days: 1, overdue_red_days: 60 };
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, ''); const method = route.request().method();
  if (path === '/health') { if (method === 'PUT') { const b = route.request().postDataJSON(); sent.push(['health', b]); if (b.contact_red_days <= b.contact_amber_days) return json(route, { message: 'No contact: red must come after amber.' }, 422); health = b; } return json(route, { health, can: { change: true } }); }
  return json(route, { ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, access: { warn_days: 7, default_hours: [], read_outside_hours: false, passes: true, pass_minutes: 60, unlock_minutes: 15, lock_tries: 5, lock_wait_minutes: 15, approval_hours: 24 }, version: 1, industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], viewing: 'legal', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
});

// ---------------------------------------------------------------- the list
await go('/admin/projects/clients');
await page.locator('[data-client="Imara Sacco"]').waitFor({ timeout: 15000 });
const imara = page.locator('[data-client="Imara Sacco"]');
ok('each client shows its manager, open work, last contact and next action', /Kamau/.test(await text(imara)) && /Quarterly review · 9 days late/.test(await text(imara)) && /6 Oct 2026/.test(await text(imara)));
ok('what they owe comes from the books, with what is overdue', /KES 412,000/.test(await text(imara)) && /KES 150,000 overdue/.test(await text(imara)));
ok('flags and health show on the row', /Credit hold/.test(await text(imara)) && /At risk/.test(await text(imara)) && /Needs attention/.test(await text(page.locator('[data-client="Karura Lodge"]'))));
ok('nothing planned is said on the row', /Nothing planned/.test(await text(page.locator('[data-client="Karura Lodge"]'))));
await page.screenshot({ path: D + 'projects-clients.png', fullPage: true });
await page.getByRole('button', { name: 'At risk 1' }).click();
await page.waitForTimeout(300);
ok('the list can be cut to one health colour', last('list')[1].health === 'red' && (await page.locator('[data-client]').count()) === 1);
await page.getByRole('button', { name: 'Export' }).click();
await page.waitForTimeout(400);
ok('the export takes the list as filtered', last('export')?.[1].health === 'red');
await page.getByRole('button', { name: 'Any health' }).click();
await page.getByRole('button', { name: 'I manage' }).click();
await page.waitForTimeout(300);
ok('it can show only the clients I manage', last('list')[1].scope === 'mine');

// ---------------------------------------------------------------- one client
await go('/admin/projects/clients/1');
await page.getByRole('heading', { name: 'Imara Sacco' }).waitFor({ timeout: 15000 });
ok('the health says why, every reason', /At risk/.test(await text()) && /No contact for 41 days · Next action 9 days late · Flag: Credit hold · Money overdue for 75 days/.test(await text()));
ok('a flag shows with why, who set it and when', /Credit hold: Over the limit \(Njeri, 0?2 Nov 2026\)/.test(await text()), (await text()).match(/Credit hold: [^)]*\)/)?.[0]);
ok('the work lists its pieces of work and open opportunities', /M-0413 · Imara Sacco v\. Baraka Traders/.test(await text(page.locator('[data-work="M-0413"]'))) && /Opportunity · Negotiation/.test(await text()));
ok('its people and its history are on the page', /A\. Otieno/.test(await text(page.locator('[data-contacts="customer"]'))) && /Agreed to file by November/.test(await text(page.locator('[data-history="customer"]'))));
ok('what it owes comes from the books, with the oldest overdue', /KES 150,000 overdue, oldest 75 days/.test(await text()));
await page.screenshot({ path: D + 'projects-client.png', fullPage: true });
await page.getByRole('button', { name: 'Add a flag' }).click();
await page.getByLabel('Flag', { exact: true }).selectOption('42');
await page.getByLabel('Why').fill('Pays at 90 days');
await page.getByRole('button', { name: 'Add the flag' }).click();
await page.locator('[data-flag="Slow payer"]').waitFor({ timeout: 5000 });
ok('a flag is added with why', JSON.stringify(last('flag')[1]) === JSON.stringify({ flag_id: 42, reason: 'Pays at 90 days' }));
await page.getByRole('button', { name: 'Take the flag Credit hold off' }).click();
await page.getByLabel('Why it is coming off').fill('Paid in full');
await page.getByRole('button', { name: 'Take it off' }).click();
await page.waitForTimeout(400);
ok('a flag comes off only with why, and the health follows', JSON.stringify(last('unflag')) === JSON.stringify(['unflag', 5, { note: 'Paid in full' }]) && (await page.locator('[data-flag="Credit hold"]').count()) === 0 && /Needs attention/.test(await text()));
await page.getByRole('button', { name: 'Change', exact: true }).first().click();
await page.getByLabel('Account manager').selectOption('2');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(400);
ok('the account manager is changed', JSON.stringify(last('manager')[1]) === JSON.stringify({ manager_id: 2 }) && /Njeri/.test(await text()));
await page.getByRole('button', { name: 'Retainer 2027' }).click();
await page.locator('[data-opportunity="3"]').waitFor({ timeout: 5000 });
ok('an opportunity opens in place from the client page', /For Imara Sacco, a client/.test(await text(page.locator('[data-opportunity="3"]'))));

// ---------------------------------------------------------------- the health rules
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Client health' }).click();
await page.getByLabel('No contact for this many days: amber').fill('60');
await page.getByRole('button', { name: 'Save the health rules' }).click();
await page.waitForTimeout(300);
ok('rules that contradict each other are refused in words', (await page.getByText('No contact: red must come after amber.').count()) > 0);
await page.getByLabel('No contact for this many days: amber').fill('21');
await page.getByLabel('Nothing planned next: amber').uncheck();
await page.getByRole('button', { name: 'Save the health rules' }).click();
await page.waitForTimeout(400);
ok('the rules are sent as numbers, with the switch', last('health')[1].contact_amber_days === 21 && last('health')[1].nothing_planned_amber === false && typeof last('health')[1].overdue_red_days === 'number');
ok('it says flags decide by how each is shown', /a flag shown as a problem makes a client red/.test(await text()));

await finish(c);
