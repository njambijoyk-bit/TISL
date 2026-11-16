// Browser check: the pipeline (build 3.2): the board, adding an opportunity, moving and losing one, winning (lead to client, starting the work),
// and the stages in Configuration. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 2, name: 'Njeri', email: 'njeri@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.leads.view', 'projects.leads.manage', 'projects.pipeline', 'projects.clients.manage', 'projects.create', 'projects.config.view', 'projects.config.manage', 'books.view'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1200px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');
const col = (key) => page.locator(`[data-stage="${key}"]`);

const STAGES = [[1, 'new', 'New', 'open'], [2, 'qualified', 'Qualified', 'open'], [3, 'proposal', 'Proposal sent', 'open'], [4, 'negotiation', 'Negotiation', 'open'], [5, 'won', 'Won', 'won'], [6, 'lost', 'Lost', 'lost']].map(([id, key, name, kind]) => ({ id, key, name, kind, is_active: true, opportunities: 0 }));
const stage = (key) => { const s = STAGES.find((x) => x.key === key); return { id: s.id, key: s.key, name: s.name, kind: s.kind }; };
const opp = (id, title, o = {}) => ({ id, title, for: { type: 'lead', id: 1, name: 'Tumaini Academy' }, kind: null, stage: stage('new'), owner: { id: 2, name: 'Njeri' }, expected_on: null, value: null, estimate: null, estimate_currency: null, quotation_voucher_id: null, project: null, lost_reason: null, closed_at: null, next: null, notes: null, can: { change: true }, ...o });
let opps = [
  opp(1, 'Lease review', { for: { type: 'lead', id: 2, name: 'Faith Wanjiru' }, value: { amount: 120000, currency: 'KES', from: 'estimate', title: null, url: null }, estimate: 120000, estimate_currency: 'KES' }),
  opp(2, 'New classroom block', { stage: stage('proposal'), kind: { id: 5, name: 'Building works' }, value: { amount: 48600000, currency: 'KES', from: 'quotation', title: 'Quotation QT-0231', url: '/admin/books/vouchers/10' }, quotation_voucher_id: 10, expected_on: '2026-12-15' }),
  opp(3, 'Retainer 2027', { for: { type: 'client', id: 1, name: 'Imara Sacco' }, stage: stage('negotiation'), next: { what: 'Call the CEO', due_on: '2026-11-10', late: true, today: false, days_late: 6 } }),
  opp(4, 'Duka Fresh lease', { for: { type: 'client', id: 2, name: 'Duka Fresh Ltd' }, stage: stage('won'), closed_at: '2026-11-10 10:00:00', project: { id: 409, number: 'CV-0009' } })];
const board = () => ({ stages: STAGES.map((s) => { const items = opps.filter((o) => o.stage.id === s.id); const withValue = items.filter((o) => o.value && o.value.amount !== null);
  return { ...s, items, totals: withValue.length ? [{ currency: 'KES', amount: withValue.reduce((n, o) => n + o.value.amount, 0), estimated: withValue.some((o) => o.value.from === 'estimate') }] : [] }; }),
  open: opps.filter((o) => o.stage.kind === 'open').length, sees_all: true, ready: true, can: { change: true, start: true, make_client: true } });
const options = { types: [{ id: 5, name: 'Building works', industry: 'Construction' }, { id: 1, name: 'Litigation', industry: 'Legal' }], owners: [{ id: 1, name: 'Kamau' }, { id: 2, name: 'Njeri' }], lost_reasons: [{ id: 11, key: 'price', name: 'Price' }], stages: STAGES.map((s) => ({ id: s.id, name: s.name, kind: s.kind })), books: true, can: { books: true } };

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'general', company_industry: 'general', names: { project: { name: 'Project', plural: 'Projects' } }, keys: {} }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route('**/api/admin/projects/pipeline?**', (route) => { sent.push(['board', Object.fromEntries(new URL(route.request().url()).searchParams)]); return json(route, board()); });
await page.route('**/api/admin/projects/pipeline/options', (route) => json(route, options));
await page.route('**/api/admin/projects/pipeline/quotations**', (route) => json(route, { vouchers: [{ id: 10, title: 'Quotation QT-0231', detail: 'Tumaini Academy · 2026-11-10' }] }));
await page.route('**/api/admin/projects/options/customers**', (route) => json(route, { customers: [{ id: 1, name: 'Imara Sacco', detail: 'C-001' }] }));
await page.route(/\/api\/admin\/projects\/leads(\?.*)?$/, (route) => json(route, { data: [{ id: 1, name: 'Tumaini Academy' }], total: 1 }));
await page.route(/\/api\/admin\/projects\/opportunities(\/\d+)?(\/\w+)?$/, (route) => {
  const [, idPart, act] = route.request().url().match(/opportunities(?:\/(\d+))?(?:\/(\w+))?$/); const id = Number(idPart); const b = route.request().postDataJSON?.() ?? {};
  if (!idPart) { sent.push(['add', b]); if (b.title === 'Refuse me') return json(route, { message: 'Choose a kind of work that is switched on.' }, 422); const o = opp(9, b.title, { for: b.customer_id ? { type: 'client', id: 1, name: 'Imara Sacco' } : { type: 'lead', id: 1, name: 'Tumaini Academy' }, value: b.quotation_voucher_id ? { amount: 48600000, currency: 'KES', from: 'quotation', title: 'Quotation QT-0231', url: null } : null, quotation_voucher_id: b.quotation_voucher_id }); opps = [...opps, o]; return json(route, { opportunity: o }, 201); }
  let o = opps.find((x) => x.id === id);
  if (act === 'win') { sent.push(['win', id, b]); o = { ...o, stage: stage('won'), for: { type: 'client', id: 7, name: o.for.name }, project: b.start_project ? { id: 500, number: 'BW-0001' } : null }; opps = opps.map((x) => (x.id === id ? o : x)); return json(route, { customer_id: 7, project_id: b.start_project ? 500 : null, opportunity: o }); }
  if (act === 'project') { sent.push(['start', id, b]); o = { ...o, project: { id: 501, number: 'BW-0002' } }; opps = opps.map((x) => (x.id === id ? o : x)); return json(route, { project_id: 501, opportunity: o }, 201); }
  sent.push(['change', id, b]);
  if (b.stage_id) { const s = STAGES.find((x) => x.id === b.stage_id); o = { ...o, stage: { id: s.id, key: s.key, name: s.name, kind: s.kind }, lost_reason: s.kind === 'lost' ? 'Price' : null }; } else o = { ...o, title: b.title };
  opps = opps.map((x) => (x.id === id ? o : x)); return json(route, { opportunity: o });
});
await page.route(/\/api\/admin\/projects\/50\d$/, (route) => json(route, { message: 'Not found.' }, 404));
let stages = STAGES.map((s) => ({ ...s, opportunities: s.key === 'new' ? 2 : 0 }));
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, ''); const method = route.request().method();
  if (path === '') return json(route, { ready: true, general: { default_industry: 'general', project_may_use_other_industry: true, trash_days: 30 }, access: { warn_days: 7, default_hours: [], read_outside_hours: false, passes: true, pass_minutes: 60, unlock_minutes: 15, lock_tries: 5, lock_wait_minutes: 15, approval_hours: 24 }, version: 1, industries: [{ key: 'general', name: 'General projects', group: 'basic', is_active: true }], viewing: 'general', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
  if (method !== 'GET') { const b = route.request().postDataJSON(); const id = Number((path.match(/(\d+)$/) || [])[1]) || null; sent.push([`${method} stage`, id, b]);
    if (b.is_active === false && id === 1) return json(route, { message: 'There are opportunities at this stage. Move them first.' }, 422);
    if (method === 'POST') stages = [...stages.slice(0, 4), { id: 9, key: 'x', name: b.name, kind: 'open', is_active: true, opportunities: 0 }, ...stages.slice(4)]; }
  return json(route, { stages, ready: true, can: { change: true } }, method === 'POST' ? 201 : 200);
});

// ---------------------------------------------------------------- the board
await go('/admin/projects/pipeline');
await col('new').waitFor({ timeout: 15000 });
ok('every stage is a column, in order, with its count', (await page.locator('[data-stage]').count()) === 6 && /New\s*1/.test(await text(col('new'))) && /3 open/.test(await text()));
ok('a card shows who it is for and whether that is a lead or a client', /Tumaini Academy · lead/.test(await text(col('proposal'))) && /Imara Sacco · client/.test(await text(col('negotiation'))));
ok('a value from the books shows as it is; an estimate is marked as one', /KES 48,600,000/.test(await text(col('proposal'))) && !/~/.test(await text(col('proposal'))) && /~ KES 120,000/.test(await text(col('new'))));
ok('a column total says when it includes estimates', /KES 120,000 \(includes estimates\)/.test(await text(col('new'))) && !/includes estimates/.test(await text(col('proposal'))));
ok('a late next action shows on the card, and a won one shows the work it became', /Next action late/.test(await text(col('negotiation'))) && /CV-0009/.test(await text(col('won'))));
await page.screenshot({ path: D + 'projects-pipeline.png', fullPage: true });

// ---------------------------------------------------------------- adding
await page.getByRole('button', { name: 'New opportunity' }).click();
await page.getByLabel('What the work is').fill('Perimeter wall');
await page.getByRole('button', { name: 'Add the opportunity' }).click();
ok('it must be for someone', (await page.getByText('Say who it is for: a lead, or a client.').count()) > 0 && !sent.some((x) => x[0] === 'add'));
await page.getByLabel('A lead or a client').selectOption('lead');
await page.getByLabel('Who it is for').fill('tu');
await page.getByRole('button', { name: 'Tumaini Academy', exact: true }).click();
ok('the estimate says it is a guess that never reaches the books', /An estimate is a guess\. It is never posted to the books, and a linked quotation replaces it/.test(await text()));
await page.getByLabel('Estimate').fill('900000');
await page.getByLabel('Or link a quotation from the books').fill('QT');
await page.getByRole('button', { name: /Quotation QT-0231/ }).click();
ok('linking a quotation replaces the estimate boxes', (await page.getByLabel('Estimate').count()) === 0 && /From the books: Quotation QT-0231/.test(await text()));
await page.getByRole('button', { name: 'Add the opportunity' }).click();
await page.locator('[data-opportunity="9"]').waitFor({ timeout: 10000 });
const added = sent.find((x) => x[0] === 'add')[1];
ok('it is sent for the lead, with the quotation and no estimate, and opens', added.lead_id === 1 && added.quotation_voucher_id === 10 && added.estimate === null && !('customer_id' in added), JSON.stringify(added));

// ---------------------------------------------------------------- moving, losing
await page.locator('[data-card="Lease review"]').click();
await page.locator('[data-opportunity="1"]').waitFor({ timeout: 5000 });
await page.getByLabel('Move to stage').selectOption('2');
await page.waitForTimeout(400);
ok('it moves to another stage from its panel', JSON.stringify(last('change')) === JSON.stringify(['change', 1, { stage_id: 2 }]) && /Lease review/.test(await text(col('qualified'))));
ok('Won and Lost are not in the list of stages to move to', (await page.getByLabel('Move to stage').locator('option').allInnerTexts()).join() === 'New,Qualified,Proposal sent,Negotiation');
await page.getByRole('button', { name: 'Lost', exact: true }).click();
await page.getByLabel('Why was it lost?').selectOption('11');
await page.getByRole('button', { name: 'Mark as lost' }).click();
await page.waitForTimeout(400);
ok('losing asks why, from the list', JSON.stringify(last('change')[2]) === JSON.stringify({ stage_id: 6, lost_reason_id: 11 }) && /Price/.test(await text(col('lost'))));
ok('a lost one can be brought back but not won or lost again', (await page.getByLabel('Move to stage').inputValue()) === '' && (await page.getByRole('button', { name: 'Win it' }).count()) === 0);

// ---------------------------------------------------------------- winning
await page.locator('[data-card="New classroom block"]').click();
await page.locator('[data-opportunity="2"]').waitFor({ timeout: 5000 });
await page.getByRole('button', { name: 'Win it' }).click();
ok('winning for a lead says the lead becomes a client with its account in the books', /Tumaini Academy becomes a client: a customer record with its account in the books/.test(await text(page.locator('[data-opportunity="2"]'))));
ok('starting the work is offered, and asks nothing until it is ticked', (await page.getByLabel('Title of the project').count()) === 0);
await page.screenshot({ path: D + 'projects-pipeline-win.png', fullPage: true });
await page.getByLabel('Start the project now').click();
ok('the title and kind of work start from the opportunity', (await page.getByLabel('Title of the project').inputValue()) === 'New classroom block' && (await page.getByLabel('Kind of work').inputValue()) === '5');
await page.getByRole('button', { name: 'Win it and start the project' }).click();
await page.waitForTimeout(700);
ok('it is won with the work started, and the new work opens', JSON.stringify(sent.find((x) => x[0] === 'win')) === JSON.stringify(['win', 2, { title: 'New classroom block', type_id: 5, start_project: true }]) && (await page.evaluate(() => window.location.pathname)) === '/admin/projects/500');

await go('/admin/projects/pipeline');
await page.locator('[data-card="Retainer 2027"]').click();
await page.getByRole('button', { name: 'Win it' }).click();
ok('winning for a client makes no new client', /This is marked as won for Imara Sacco/.test(await text(page.locator('[data-opportunity="3"]'))));
await page.locator('[data-opportunity="3"] form').getByRole('button', { name: 'Win it' }).click();
await page.waitForTimeout(500);
ok('it can be won without starting the work, and the work started later', last('win')[2].start_project === false && (await page.getByRole('button', { name: 'Start the project' }).count()) === 1);
await page.getByRole('button', { name: 'Start the project' }).click();
await page.getByLabel('Kind of work').selectOption('1');
await page.locator('[data-opportunity="3"] form').getByRole('button', { name: 'Start the project' }).click();
await page.waitForTimeout(700);
ok('starting later sends the title and the kind of work', JSON.stringify(last('start')) === JSON.stringify(['start', 3, { title: 'Retainer 2027', type_id: 1 }]));

// ---------------------------------------------------------------- stages in Configuration
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Pipeline' }).click();
await page.locator('[data-pipeline-stage="New"]').waitFor({ timeout: 15000 });
ok('the two ends are marked and cannot be moved or switched off', /An end/.test(await text(page.locator('[data-pipeline-stage="Won"]'))) && (await page.locator('[data-pipeline-stage="Won"]').getByRole('button').count()) === 1 && (await page.locator('[data-pipeline-stage="Lost"]').getByRole('button').count()) === 1);
await page.getByLabel('New stage').fill('Site visit done');
await page.getByRole('button', { name: 'Add stage' }).click();
await page.locator('[data-pipeline-stage="Site visit done"]').waitFor({ timeout: 5000 });
ok('a new stage lands before Won', (await page.locator('[data-pipeline-stage]').evaluateAll((els) => els.map((e) => e.getAttribute('data-pipeline-stage')))).join() === 'New,Qualified,Proposal sent,Negotiation,Site visit done,Won,Lost');
await page.getByRole('button', { name: 'Switch off the stage New' }).click();
await page.waitForTimeout(300);
ok('a stage with opportunities at it cannot be switched off, and says why', (await page.getByText('There are opportunities at this stage. Move them first.').count()) > 0);

await finish(c);
