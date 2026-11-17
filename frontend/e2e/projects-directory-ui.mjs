// Browser check: the directory (build 3.6): yellow pages by trade, white pages by name, masked details and showing them, setting trades,
// who can see an entry, and the levels in Configuration. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.directory.yellow', 'projects.directory.white', 'projects.directory.contacts', 'projects.directory.manage', 'projects.directory.visibility', 'projects.config.view', 'projects.config.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');
const row = (name) => page.locator(`[data-entry="${name}"]`);

const TRADES = [{ id: 1, key: 'quantity_surveyor', name: 'Quantity surveyors', is_active: true }, { id: 2, key: 'architect', name: 'Architects', is_active: true }, { id: 3, key: 'valuer', name: 'Valuers', is_active: true }];
const e = (type, id, name, is, o = {}) => ({ type, id, name, is, works_for: null, job_title: null, phone: null, email: null, has_phone: false, has_email: false, trades: [], visibility: 'staff', work: 0, url: null, ...o });
let yellow = [
  e('vendor', 3, 'Costwise Consultants', 'Vendor', { phone: '•••••••902', has_phone: true, visibility: 'clients', trades: [{ key: 'quantity_surveyor', name: 'Quantity surveyors' }] }),
  e('customer', 1, 'Imara Sacco', 'Client', { email: 'o•••@imara.test', has_email: true, work: 2, url: '/admin/projects/clients/1' }),
  e('party', 7, 'Njoroge QS Partners', 'Party', { phone: '•••••••418', email: 'q•••@njoroge.test', has_phone: true, has_email: true, work: 3, trades: [{ key: 'quantity_surveyor', name: 'Quantity surveyors' }] })];
const white = [e('contact', 21, 'A. Otieno', 'Contact', { works_for: 'Imara Sacco', job_title: 'CEO', phone: '•••••••222', has_phone: true }), e('employee', 5, 'Kamau', 'Staff', { job_title: 'Partner' })];
let levels = ['staff', 'clients', 'public'];
const answer = (q) => {
  const book = q.book === 'white' ? 'white' : 'yellow';
  let entries = book === 'white' ? white : yellow;
  if (q.trade) entries = entries.filter((x) => (q.trade === 'none' ? !x.trades.length : x.trades.some((t) => t.key === q.trade)));
  if (q.q) entries = entries.filter((x) => x.name.toLowerCase().includes(q.q.toLowerCase()));
  return { book, entries, total: entries.length, page: 1, per_page: 25, trades: book === 'yellow' ? TRADES.map((t) => ({ ...t, count: yellow.filter((x) => x.trades.some((y) => y.key === t.key)).length })) : [], no_trade: yellow.filter((x) => !x.trades.length).length,
    levels, ready: true, can: { reveal: true, visibility: true, publish: false, manage: true, export: false, yellow: true, white: true } };
};

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'general', company_industry: 'general', names: { project: { name: 'Project', plural: 'Projects' } }, keys: {} }));
await page.route('**/api/admin/projects/directory?**', (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['list', q]); return json(route, answer(q)); });
await page.route(/\/api\/admin\/projects\/directory\/\w+\/\d+(\/reveal)?$/, (route) => {
  const [, type, id, rev] = route.request().url().match(/directory\/(\w+)\/(\d+)(\/reveal)?$/);
  if (rev) { sent.push(['reveal', type, Number(id)]); return json(route, { phone: '0712345418', email: 'qs@njoroge.test' }); }
  const b = route.request().postDataJSON(); sent.push(['change', type, Number(id), b]);
  yellow = yellow.map((x) => (x.type === type && x.id === Number(id) ? { ...x, ...(b.trades ? { trades: TRADES.filter((t) => b.trades.includes(t.key)).map((t) => ({ key: t.key, name: t.name })) } : {}), ...(b.visibility ? { visibility: b.visibility } : {}) } : x));
  return json(route, { message: 'Saved.' });
});
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, '');
  if (path === '/directory') { if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['levels', b]); levels = ['staff', ...b.levels]; }
    return json(route, { directory: { levels: levels.filter((l) => l !== 'staff') }, levels: { staff: 'Staff only', clients: 'Clients who share work with them', public: 'Public' }, can: { change: true } }); }
  return json(route, { ready: true, general: { default_industry: 'general', project_may_use_other_industry: true, trash_days: 30 }, access: { warn_days: 7, default_hours: [], read_outside_hours: false, passes: true, pass_minutes: 60, unlock_minutes: 15, lock_tries: 5, lock_wait_minutes: 15, approval_hours: 24 }, version: 1, industries: [{ key: 'general', name: 'General projects', group: 'basic', is_active: true }], viewing: 'general', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
});

// ---------------------------------------------------------------- yellow pages
await go('/admin/projects/directory');
await row('Njoroge QS Partners').waitFor({ timeout: 15000 });
ok('the yellow pages list organisations, each with what it is and its trades', /Party/.test(await text(row('Njoroge QS Partners'))) && /Quantity surveyors/.test(await text(row('Njoroge QS Partners'))) && /Vendor/.test(await text(row('Costwise Consultants'))));
ok('phone numbers and emails are masked', /•••••••418/.test(await text(row('Njoroge QS Partners'))) && /q•••@njoroge\.test/.test(await text(row('Njoroge QS Partners'))) && !/0712345418/.test(await text()));
ok('the trades down the side carry their counts, with the ones that have no trade yet', /Quantity surveyors\s*2/.test(await text(page.getByRole('navigation', { name: 'Trades' }))) && /No trade yet\s*1/.test(await text(page.getByRole('navigation', { name: 'Trades' }))));
ok('each says how many pieces of work you have done with it, and who can see it', /3 pieces of work/.test(await text(row('Njoroge QS Partners'))) && (await page.getByLabel('Who can see Costwise Consultants').inputValue()) === 'clients');
ok('making an entry public is not offered without its permission', !(await page.getByLabel('Who can see Imara Sacco').locator('option').allInnerTexts()).includes('Public'));
await page.screenshot({ path: D + 'projects-directory.png', fullPage: true });
await page.getByRole('navigation', { name: 'Trades' }).getByRole('button', { name: /Quantity surveyors/ }).click();
await page.waitForTimeout(300);
ok('a trade shows only its organisations', last('list')[1].trade === 'quantity_surveyor' && (await page.locator('[data-entry]').count()) === 2);
await page.getByRole('navigation', { name: 'Trades' }).getByRole('button', { name: /Every trade/ }).click();
await page.getByRole('button', { name: 'Show the details of Njoroge QS Partners' }).click();
await page.waitForTimeout(300);
ok('showing the details asks the server, once, and puts them in full on the row', JSON.stringify(last('reveal')) === JSON.stringify(['reveal', 'party', 7]) && /0712345418/.test(await text(row('Njoroge QS Partners'))) && (await page.getByRole('button', { name: 'Show the details of Njoroge QS Partners' }).count()) === 0);
ok('it says each showing is written to the log', /Each time details are shown it is written to the activity log/.test(await text()));
await page.getByRole('button', { name: 'Set the trades of Imara Sacco' }).click();
await page.getByLabel('Valuers').check();
await page.getByRole('button', { name: 'Save trades' }).click();
await page.waitForTimeout(400);
ok('trades are set from the list', JSON.stringify(last('change')) === JSON.stringify(['change', 'customer', 1, { trades: ['valuer'] }]) && /Valuers/.test(await text(row('Imara Sacco'))));
await page.getByLabel('Who can see Njoroge QS Partners').selectOption('clients');
await page.waitForTimeout(400);
ok('who can see an entry is changed in place', JSON.stringify(last('change')) === JSON.stringify(['change', 'party', 7, { visibility: 'clients' }]));

// ---------------------------------------------------------------- white pages
await page.getByRole('button', { name: 'White pages' }).click();
await row('A. Otieno').waitFor({ timeout: 5000 });
ok('the white pages list people, with who they work for', /CEO, Imara Sacco/.test(await text(row('A. Otieno'))) && /Staff/.test(await text(row('Kamau'))));
ok('the white pages have no trades down the side', (await page.getByRole('navigation', { name: 'Trades' }).count()) === 0);
await page.getByLabel('Search the directory').fill('otieno');
await page.waitForTimeout(500);
ok('a name can be searched', last('list')[1].q === 'otieno' && (await page.locator('[data-entry]').count()) === 1);

// ---------------------------------------------------------------- levels in Configuration
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Directory' }).click();
await page.getByLabel('Public').uncheck();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(400);
ok('a level can be switched off; staff only always stays', JSON.stringify(last('levels')[1]) === JSON.stringify({ levels: ['clients'] }) && (await page.getByLabel('Staff only (always)').isDisabled()));
await go('/admin/projects/directory');
await row('Njoroge QS Partners').waitFor({ timeout: 15000 });
ok('a switched-off level is no longer offered', !(await page.getByLabel('Who can see Imara Sacco').locator('option').allInnerTexts()).includes('Public'));

await finish(c);
