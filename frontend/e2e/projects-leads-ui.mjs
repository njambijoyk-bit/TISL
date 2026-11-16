// Browser check: leads and the managed lists (build 3.1): the list of leads, adding one with the "already known" warning, a lead's page, marking it
// lost with a reason, and the Lists tab in Configuration. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 2, name: 'Njeri', email: 'njeri@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.leads.view', 'projects.leads.manage', 'projects.config.view', 'projects.config.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');
const row = (name) => page.locator(`[data-lead="${name}"]`);

const lead = (id, name, o = {}) => ({ id, name, contact_name: null, email: null, phone: null, industry: null, source: { id: 1, name: 'Website' }, referred_by: null, owner: { id: 2, name: 'Njeri' }, status: 'new', lost: null, customer_id: null, created_at: '2026-11-14 09:00:00', next: null, notes: null, can: { change: true }, ...o });
let leads = [
  lead(1, 'Baraka Traders Ltd', { contact_name: 'J. Baraka', status: 'working', source: { id: 2, name: 'Referral' }, referred_by: { id: 1, name: 'Imara Sacco' }, next: { what: 'Send fee proposal', due_on: '2026-11-16', late: false, today: true, days_late: 0 } }),
  lead(2, 'Faith Wanjiru', { next: { what: 'First call', due_on: '2026-11-13', late: true, today: false, days_late: 3 } }),
  lead(3, 'Tumaini Academy', { owner: { id: 1, name: 'Kamau' }, status: 'working', source: { id: 3, name: 'Tender or bid notice' } }),
  lead(4, 'Karibu Hotels', { status: 'lost', lost: { reason: 'Went with someone else', note: null } })];
const options = { sources: [{ id: 1, key: 'website', name: 'Website' }, { id: 2, key: 'referral', name: 'Referral' }, { id: 3, key: 'tender', name: 'Tender or bid notice' }], lost_reasons: [{ id: 11, key: 'price', name: 'Price' }, { id: 12, key: 'competitor', name: 'Went with someone else' }], owners: [{ id: 1, name: 'Kamau' }, { id: 2, name: 'Njeri' }], industries: [{ key: 'legal', name: 'Legal' }, { key: 'construction', name: 'Construction' }] };

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'general', company_industry: 'general', names: { project: { name: 'Project', plural: 'Projects' } }, keys: {} }));
await page.route('**/api/admin/projects/leads/options', (route) => json(route, options));
await page.route('**/api/admin/projects/options/customers**', (route) => json(route, { customers: [{ id: 1, name: 'Imara Sacco', detail: 'C-001' }] }));
await page.route('**/api/admin/projects/known**', (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['known', q]); return json(route, { known: /baraka/i.test(q.name || '') && !q.except_id ? [{ type: 'party', id: 7, name: 'Baraka Traders Ltd', detail: 'Another party on M-0413', url: null }, { type: 'lead', id: 1, name: 'Baraka Traders Ltd', detail: 'A lead, owned by Njeri', url: '/admin/projects/leads/1' }] : [] }); });
await page.route(/\/api\/admin\/projects\/leads(\?.*)?$/, (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['add', b]); if (b.email === 'bad@x') return json(route, { message: 'That is not an email address.' }, 422); const l = lead(9, b.name, { contact_name: b.contact_name }); leads = [l, ...leads]; return json(route, { lead: l }, 201); }
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['list', q]);
  let data = leads.filter((l) => (q.status === 'open' ? ['new', 'working'].includes(l.status) : l.status === q.status) && (q.scope === 'all' || l.owner.id === 2) && (!q.q || l.name.toLowerCase().includes(q.q.toLowerCase())));
  return json(route, { data, total: data.length, page: 1, per_page: 25, counts: { new: 1, working: 2, won: 0, lost: 1 }, sees_all: true, ready: true, can: { change: true } });
});
await page.route(/\/api\/admin\/projects\/leads\/\d+$/, (route) => {
  const id = Number(route.request().url().match(/(\d+)$/)[1]); let l = leads.find((x) => x.id === id);
  if (!l) return json(route, { message: 'Not found.' }, 404);
  if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['change', id, b]); l = b.status ? { ...l, status: b.status, lost: b.status === 'lost' ? { reason: 'Price', note: b.lost_note || null } : null } : { ...l, name: b.name, contact_name: b.contact_name }; leads = leads.map((x) => (x.id === id ? l : x)); }
  return json(route, { lead: l });
});
let rows = { source: [{ id: 1, key: 'website', name: 'Website', industry: null, status: null, is_active: true, is_system: true }, { id: 2, key: 'referral', name: 'Referral', industry: null, status: null, is_active: true, is_system: true }], lost_reason: [], contact_role: [], party_role: [{ id: 30, key: 'opponent', name: 'Opposing party', industry: 'legal', status: null, is_active: true, is_system: true }], flag: [{ id: 40, key: 'credit_hold', name: 'Credit hold', industry: null, status: 'problem', is_active: true, is_system: true }], trade: [] };
const listsPage = () => ({ lists: [['source', 'Where leads come from', 'Chosen when a lead is added.'], ['lost_reason', 'Why a lead or opportunity was lost', 'Asked when one is marked lost.'], ['contact_role', 'What a contact is there for', 'A contact can have several.'], ['party_role', 'What another party is on a project', 'Can belong to one industry or to all.'], ['flag', 'Flags on a client', 'Each is shown as one of the four named statuses.'], ['trade', 'Trades in the yellow pages', 'How organisations are grouped in the directory.']].map(([key, name, hint]) => ({ key, name, hint })), rows, ready: true, industries: options.industries, can: { change: true } });
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, ''); const method = route.request().method();
  if (path === '') return json(route, { ready: true, general: { default_industry: 'general', project_may_use_other_industry: true, trash_days: 30 }, access: { warn_days: 7, default_hours: [], read_outside_hours: false, passes: true, pass_minutes: 60, unlock_minutes: 15, lock_tries: 5, lock_wait_minutes: 15, approval_hours: 24 }, version: 1, industries: [{ key: 'general', name: 'General projects', group: 'basic', is_active: true }], viewing: 'general', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
  const [, list, id] = path.match(/^\/lists(?:\/(\w+))?(?:\/(\d+))?$/) || [];
  if (method !== 'GET') {
    const b = route.request().postDataJSON(); sent.push([`${method} list`, list, id ? Number(id) : null, b]);
    if (method === 'POST' && /^website$/i.test(b.name)) return json(route, { message: 'That name is already on the list.' }, 422);
    if (method === 'POST') rows = { ...rows, [list]: [...rows[list], { id: 99, key: 'x', name: b.name, industry: b.industry || null, status: list === 'flag' ? b.status : null, is_active: true, is_system: false }] };
    else rows = { ...rows, [list]: rows[list].map((r) => (r.id === Number(id) ? { ...r, ...(b.name ? { name: b.name } : {}), ...('is_active' in b ? { is_active: b.is_active } : {}) } : r)) };
  }
  return json(route, listsPage(), method === 'POST' ? 201 : 200);
});

// ---------------------------------------------------------------- the list
await go('/admin/projects/leads');
await row('Baraka Traders Ltd').waitFor({ timeout: 15000 });
ok('the list starts on my open leads', JSON.stringify(sent.find((x) => x[0] === 'list')[1]) === JSON.stringify({ scope: 'mine', status: 'open', q: '', page: '1' }) && (await page.locator('[data-lead]').count()) === 2);
ok('a referral names the client who sent them', /Referred by Imara Sacco/.test(await text(row('Baraka Traders Ltd'))));
ok('the next action shows with its date, late ones marked', /Send fee proposal · today/.test(await text(row('Baraka Traders Ltd'))) && /First call · 3 days late/.test(await text(row('Faith Wanjiru'))));
await page.getByRole('button', { name: 'Everyone\'s' }).click();
await row('Tumaini Academy').waitFor({ timeout: 5000 });
ok('someone who may see every lead can switch to everyone\'s', /Kamau/.test(await text(row('Tumaini Academy'))));
await page.getByRole('button', { name: /^Lost/ }).click();
await row('Karibu Hotels').waitFor({ timeout: 5000 });
ok('lost leads stay findable, with why', /Went with someone else/.test(await text(row('Karibu Hotels'))));
await page.getByRole('button', { name: 'Open', exact: true }).click();
await row('Baraka Traders Ltd').waitFor({ timeout: 5000 });
await page.screenshot({ path: D + 'projects-leads.png', fullPage: true });

// ---------------------------------------------------------------- adding one
await page.getByRole('button', { name: 'New lead' }).click();
ok('the form says a lead stays out of customers and the books', /stays out of your customers and your books until it is won/.test(await text()));
await page.getByLabel('Lead (the company, or the person)').fill('Baraka Traders Ltd');
await page.locator('[data-known]').waitFor({ timeout: 5000 });
ok('it warns when the name is already known, and says as what', /You may already know them/.test(await text(page.locator('[data-known]'))) && /Another party on M-0413/.test(await text(page.locator('[data-known]'))) && /A lead, owned by Njeri/.test(await text(page.locator('[data-known]'))));
await page.screenshot({ path: D + 'projects-lead-new.png', fullPage: true });
await page.getByLabel('Lead (the company, or the person)').fill('Duka Fresh Ltd');
await page.waitForTimeout(600);
ok('and the warning goes when the name is new', (await page.locator('[data-known]').count()) === 0);
await page.getByLabel('Who to talk to there').fill('M. Achieng');
ok('the referring client is asked only for a referral', (await page.getByLabel('Referred by which client').count()) === 0);
await page.getByLabel('Where they came from').selectOption('2');
await page.getByLabel('Referred by which client').fill('im');
await page.getByRole('button', { name: 'Imara Sacco' }).click();
await page.getByLabel('Email').fill('bad@x');
await page.getByRole('button', { name: 'Add the lead' }).click();
await page.waitForTimeout(300);
ok('a refusal is shown next to the form', (await page.getByText('That is not an email address.').count()) > 0);
await page.getByLabel('Email').fill('');
await page.getByRole('button', { name: 'Add the lead' }).click();
await page.getByRole('heading', { name: 'Duka Fresh Ltd' }).waitFor({ timeout: 10000 });
const added = sent.filter((x) => x[0] === 'add').at(-1)[1];
ok('the lead is sent with its source, the referrer and no owner (so it is mine), and its page opens', added.name === 'Duka Fresh Ltd' && added.source_id === 2 && added.referred_by_customer_id === 1 && added.owner_id === undefined && (await page.evaluate(() => window.location.pathname)) === '/admin/projects/leads/9', JSON.stringify(added));

// ---------------------------------------------------------------- one lead
await page.getByRole('button', { name: 'Start working it' }).click();
await page.waitForTimeout(300);
ok('a new lead is started with one button', JSON.stringify(sent.at(-1)) === JSON.stringify(['change', 9, { status: 'working' }]) && /Working/.test(await text()));
await page.getByRole('button', { name: 'Mark as lost' }).first().click();
await page.getByLabel('Reason').selectOption('11');
await page.getByLabel('A few words (optional)').fill('Fees too high for them');
await page.locator('form').getByRole('button', { name: 'Mark as lost' }).click();
await page.waitForTimeout(400);
ok('losing one asks why, from the list', JSON.stringify(sent.at(-1)[2]) === JSON.stringify({ status: 'lost', lost_reason_id: 11, lost_note: 'Fees too high for them' }) && /Price: Fees too high for them/.test(await text()));
ok('a lost lead can be brought back, and not marked lost twice', (await page.getByRole('button', { name: 'Bring it back' }).count()) === 1 && (await page.getByRole('button', { name: 'Mark as lost' }).count()) === 0);
await page.getByRole('button', { name: 'Edit' }).click();
await page.getByLabel('Who to talk to there').fill('M. Achieng, CFO');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(400);
ok('its details can be changed', sent.at(-1)[2].contact_name === 'M. Achieng, CFO' && /M\. Achieng, CFO/.test(await text()));
await go('/admin/projects/leads/777');
await page.getByText('There is no lead here that you can see.').waitFor({ timeout: 10000 });
ok('a lead someone may not see reads as not there', true);

// ---------------------------------------------------------------- the lists
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Lists' }).click();
await page.locator('[data-row="Website"]').waitFor({ timeout: 15000 });
ok('the Lists tab shows the six lists and the rows of the first', (await page.getByRole('group', { name: 'Which list' }).getByRole('button').count()) === 6 && (await page.locator('[data-row]').count()) === 2);
await page.getByLabel('Add to this list').fill('Website');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(300);
ok('a name already on the list is refused', (await page.getByText('That name is already on the list.').count()) > 0);
await page.getByLabel('Add to this list').fill('Radio advert');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('[data-row="Radio advert"]').waitFor({ timeout: 5000 });
ok('a new row is added and the box is emptied', (await page.getByLabel('Add to this list').inputValue()) === '');
await page.getByRole('button', { name: 'Switch off Referral' }).click();
await page.waitForTimeout(300);
ok('a row is switched off, not deleted', JSON.stringify(sent.at(-1)) === JSON.stringify(['PUT list', 'source', 2, { is_active: false }]) && /Off/.test(await text(page.locator('[data-row="Referral"]'))));
await page.getByRole('button', { name: 'What another party is on a project' }).click();
ok('party roles show which industry they belong to, and a new one can be given one', /Legal/.test(await text(page.locator('[data-row="Opposing party"]'))) && (await page.getByLabel('For which industry').count()) === 1);
await page.getByRole('button', { name: 'Flags on a client' }).click();
ok('a flag is shown as one of the four named statuses', (await page.getByLabel('Shown as').locator('option').allInnerTexts()).join() === 'Information,Good,Warning,Problem' && /Problem/.test(await text(page.locator('[data-row="Credit hold"]'))));
await page.screenshot({ path: D + 'projects-lists.png', fullPage: true });

await finish(c);
