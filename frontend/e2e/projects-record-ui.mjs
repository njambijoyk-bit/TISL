// Browser check: the Projects list, starting a piece of work, opening it, changing it and moving it through its stages (build 1.3). The API is answered by the check itself;
// the rules (numbers, the cost centre, who may see and change what, confidential, frozen) are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const ALL = ['admin.access', 'projects.use', 'projects.view_all', 'projects.create', 'projects.edit', 'projects.stage', 'projects.close', 'projects.freeze', 'projects.confidential', 'projects.config.view'];
let permissions = ALL;
const me = () => ({ user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions } });
await page.addInitScript(() => { window.__who && localStorage.setItem('auth-storage', JSON.stringify({ state: { ...window.__who, isAuthenticated: true }, version: 0 })); });
const signIn = async () => { await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me()); };
await signIn();
await page.route('**/api/me', (route) => json(route, me()));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const body = () => page.locator('#root').innerText();

const WORDS = {
  legal: { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], closing_period: ['Appeal period', 'Appeal periods'] },
  construction: { project: ['Contract', 'Contracts'], client: ['Client', 'Clients'], lead: ['Contracts manager', 'Contracts managers'], reference: ['Contract number', 'Contract numbers'], authority: ['Approving authority', 'Approving authorities'], place: ['Site', 'Sites'], closing_period: ['Defects liability period', 'Defects liability periods'] },
};
const words = (i) => Object.fromEntries(Object.entries(WORDS[i]).map(([k, [name, plural]]) => [k, { name, plural }]));
const STAGES = [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }, { id: 2, name: 'Pleadings', state: 'open', status: 'info', required_fields: [] }, { id: 3, name: 'Hearing', state: 'open', status: 'warning', required_fields: [] }, { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [] }];
const CAN = { open: true, edit: true, stage: true, close: true, freeze: true, confidential: true, phases: true, members: true, members_view: true, links: true, log: true };
const project = (o = {}) => ({ id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: 'Recovery of an unpaid loan.', industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' },
  stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'high', customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'P. Kamau' }, branch: { id: 1, name: 'Nairobi' }, cost_centre_id: 9,
  reference: 'HCCC E214 of 2026', authority: 'Milimani Commercial', place: null, start_date: '2026-11-14', due_date: '2027-06-30', closing_period_ends: null, closed_at: null, confidential: true, frozen: false,
  created_at: '2026-11-14 10:02:00', stages: STAGES, cost_centre_path: 'Nairobi › Projects › M-0413 Imara Sacco v. Baraka Traders', words: words('legal'), can: CAN, ...o });
let current = project();
let listed = [project(), project({ id: 409, number: 'CV-0009', title: 'Duka Fresh lease, Branch 3', type: { id: 2, name: 'Conveyancing' }, stage: { id: 7, name: 'In progress', status: 'info' }, customer: { id: 2, name: 'Duka Fresh Ltd' }, lead: { id: 2, name: 'W. Njeri' }, due_date: '2026-12-15', confidential: false }),
  project({ id: 398, number: 'AD-0004', title: 'Karura Lodge staff contracts', type: { id: 4, name: 'Advisory' }, state: 'on_hold', customer: { id: 3, name: 'Karura Lodge' }, lead: { id: 2, name: 'W. Njeri' }, due_date: null, confidential: false }),
  project({ id: 371, number: 'M-0371', title: 'Safiri Logistics debt recovery', stage: { id: 4, name: 'Closed', status: 'good' }, state: 'closed', customer: { id: 4, name: 'Safiri Logistics' }, due_date: '2026-10-02', confidential: false, frozen: true })];
let ready = true;

await page.route('**/api/admin/projects/names', (route) => json(route, { ready, industry: 'legal', company_industry: 'legal', names: words('legal') }));
await page.route('**/api/admin/projects/options', (route) => json(route, { default_industry: 'legal', industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }, { key: 'construction', name: 'Construction', group: 'common', is_active: true }],
  types: [{ id: 1, industry: 'legal', name: 'Litigation', prefix: 'M' }, { id: 2, industry: 'legal', name: 'Conveyancing', prefix: 'CV' }, { id: 5, industry: 'construction', name: 'Building works', prefix: 'BW' }],
  branches: [{ id: 1, name: 'Nairobi' }, { id: 2, name: 'Mombasa' }], leads: [{ id: 1, name: 'P. Kamau' }, { id: 2, name: 'W. Njeri' }], priorities: ['low', 'medium', 'high', 'urgent'],
  words: { legal: words('legal'), construction: words('construction') }, cost_centres: true, can: { create: true, confidential: permissions.includes('projects.confidential') } }));
await page.route('**/api/admin/projects/options/customers**', (route) => { const q = new URL(route.request().url()).searchParams.get('q'); sent.push(['find', q]); return json(route, { customers: /nobody/.test(q) ? [] : [{ id: 1, name: 'Imara Sacco', detail: 'C-001' }, { id: 5, name: 'Imara Holdings', detail: 'C-005' }] }); });
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['create', b]); if (b.title === 'Refuse me') return json(route, { message: 'Choose a kind of work from that industry.' }, 422); current = project({ id: 414, number: 'M-0414', title: b.title, confidential: !!b.confidential }); return json(route, { project: current }, 201); }
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['list', q]);
  let data = listed.filter((p) => (q.state === 'active' ? ['open', 'on_hold'].includes(p.state) : !q.state || p.state === q.state) && (!q.q || p.title.toLowerCase().includes(q.q.toLowerCase())));
  if (q.scope === 'mine') data = data.filter((p) => p.lead.id === 1);
  return json(route, { data, total: q.q === 'many' ? 60 : data.length, page: Number(q.page || 1), per_page: 25, counts: { open: 2, on_hold: 1, closed: 1, cancelled: 0 } });
});
await page.route(/\/api\/admin\/projects\/\d+(\/\w+)?$/, (route) => {
  const [, id, sub] = route.request().url().match(/projects\/(\d+)(?:\/(\w+))?$/); const method = route.request().method(); const b = method === 'GET' ? null : route.request().postDataJSON();
  if (id === '999') return json(route, { message: 'Not found.' }, 404);
  if (method === 'GET') return json(route, { project: current });
  if (!sub) { sent.push(['update', b]); current = { ...current, ...b, customer: b.customer_id ? { id: b.customer_id, name: 'Imara Holdings' } : null }; return json(route, { project: current }); }
  if (sub === 'stage') { sent.push(['stage', b]); if (b.stage_id === 3) return json(route, { message: 'Fill these in first: Court.' }, 422); const s = STAGES.find((x) => x.id === b.stage_id); current = { ...current, stage: { id: s.id, name: s.name, status: s.status }, state: s.state }; return json(route, { project: current }); }
  if (sub === 'state') { sent.push(['state', b]); current = { ...current, state: { hold: 'on_hold', resume: 'open', cancel: 'cancelled', reopen: 'open' }[b.action] }; return json(route, { project: current }); }
  if (sub === 'freeze') { sent.push(['freeze', b]); current = { ...current, frozen: b.frozen, can: b.frozen ? { ...CAN, edit: false, stage: false, close: false } : CAN }; return json(route, { project: current }); }
  return json(route, { message: 'Not found.' }, 404);
});

// ---------------------------------------------------------------- the list
await go('/admin/projects');
await page.getByRole('heading', { name: 'Matters', exact: true }).waitFor({ timeout: 15000 });
await page.getByRole('link', { name: 'Imara Sacco v. Baraka Traders' }).waitFor({ timeout: 10000 });
let text = await body();
ok('the list is named in the company\'s words and starts on my open work', /The matters you are on/.test(text) && JSON.stringify(last('list')[1]) === JSON.stringify({ scope: 'mine', state: 'active', q: '', page: '1', per_page: '25' }), JSON.stringify(last('list')[1]));
ok('each row shows the number, the client, the kind of work, where it is and who leads it', /M-0413/.test(text) && /Imara Sacco/.test(text) && /Litigation/.test(text) && /Opening/.test(text) && /P\. Kamau/.test(text) && /30 Jun 2027/.test(text));
ok('a confidential one is marked', (await page.locator('tr', { hasText: 'M-0413' }).innerText()).includes('Confidential'));
ok('the column headings use the industry\'s words', /RESPONSIBLE ADVOCATE/i.test(text));
ok('the new button names the thing and carries the F2 key', (await page.getByRole('button', { name: 'New matter' }).getAttribute('data-hotkey')) === 'F2');
await page.getByRole('button', { name: 'All I may see' }).click();
await page.getByRole('link', { name: 'Duka Fresh lease, Branch 3' }).waitFor({ timeout: 5000 });
ok('someone who may see every project can switch to all of it', last('list')[1].scope === 'all' && /On hold/.test(await page.locator('tr', { hasText: 'AD-0004' }).innerText()));
await page.screenshot({ path: D + 'projects-list.png', fullPage: true });
await page.getByLabel('Show').selectOption('closed');
await page.getByRole('link', { name: 'Safiri Logistics debt recovery' }).waitFor({ timeout: 5000 });
ok('the state filter shows counts and a frozen one is marked', /Closed \(1\)/.test(await page.getByLabel('Show').innerText()) && (await page.locator('tr', { hasText: 'M-0371' }).innerText()).includes('Frozen'));
await page.getByLabel('Show').selectOption('');
await page.getByLabel('Search').fill('duka');
await page.waitForTimeout(600);
ok('searching asks the server after a pause and goes back to the first page', last('list')[1].q === 'duka' && last('list')[1].page === '1' && (await page.getByRole('link', { name: /Imara/ }).count()) === 0);
await page.getByLabel('Search').fill('zzz');
await page.getByText('No matters match').waitFor({ timeout: 5000 });
ok('an empty result says so and what to try', /Try another search/.test(await body()));
await page.getByLabel('Search').fill('many');
await page.getByRole('button', { name: 'Next' }).waitFor({ timeout: 5000 });
await page.getByRole('button', { name: 'Next' }).click();
await page.waitForTimeout(300);
ok('long lists page with Previous and Next', last('list')[1].page === '2' && await page.getByRole('button', { name: 'Previous' }).isEnabled());

// ---------------------------------------------------------------- starting one
await page.getByRole('button', { name: 'New matter' }).click();
await page.getByRole('heading', { name: 'New matter' }).waitFor({ timeout: 10000 });
await page.getByLabel('Case number').waitFor({ timeout: 10000 });
ok('the form labels are the industry\'s words', (await page.getByLabel('Case number').count()) === 1 && (await page.getByLabel('Court').count()) === 1 && (await page.getByLabel('Responsible advocate').count()) === 1);
ok('it says what will happen on saving, with the number series of the kind of work', /next number in the M- series/.test((await body()).replace(/\s+/g, ' ')) && /cost centre is made in the books/.test(await body()));
await page.getByLabel('Kind of work').selectOption({ label: 'Conveyancing' });
ok('the series follows the kind of work', /CV- series/.test((await body()).replace(/\s+/g, ' ')));
await page.getByLabel('Industry').selectOption('construction');
await page.getByRole('heading', { name: 'New contract' }).waitFor({ timeout: 5000 });
ok('choosing another industry changes every word and the kinds of work on offer', (await page.getByLabel('Contract number').count()) === 1 && (await page.getByLabel('Approving authority').count()) === 1 && (await page.getByLabel('Site').count()) === 1
  && (await page.getByLabel('Kind of work').locator('option').allInnerTexts()).join() === 'Building works');
await page.getByLabel('Industry').selectOption('legal');
await page.getByLabel('Title').fill('Refuse me');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Choose a kind of work from that industry.').waitFor({ timeout: 5000 });
ok('what the server refuses is said on the form, and the form stays as it was', (await page.getByLabel('Title').inputValue()) === 'Refuse me');
await page.getByLabel('Title').fill('Karura Lodge v. Mwangi');
await page.getByLabel('Client', { exact: true }).fill('nobody');
await page.getByText('Nobody found').waitFor({ timeout: 5000 });
await page.getByLabel('Client', { exact: true }).fill('imara');
await page.getByRole('option', { name: /Imara Sacco/ }).click();
await page.getByLabel('Responsible advocate').selectOption({ label: 'W. Njeri' });
await page.getByLabel('Branch').selectOption({ label: 'Nairobi' });
await page.getByLabel('Priority').selectOption('urgent');
await page.getByLabel('Case number').fill('HCCC E300 of 2026');
await page.getByLabel('Court').fill('Milimani Commercial');
await page.getByLabel('Start').fill('2026-11-16');
await page.getByLabel('Expected end').fill('2027-05-01');
await page.getByLabel(/Confidential/).check();
await page.screenshot({ path: D + 'projects-new.png', fullPage: true });
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('heading', { name: /M-0414/ }).waitFor({ timeout: 10000 });
const made = last('create')[1];
ok('starting sends the industry, kind of work, title, client, lead, branch, priority, the renamed fields, dates and confidential', made.industry_key === 'legal' && made.type_id === 1 && made.title === 'Karura Lodge v. Mwangi' && made.customer_id === 1
  && made.lead_user_id === 2 && made.location_id === 1 && made.priority === 'urgent' && made.reference === 'HCCC E300 of 2026' && made.authority === 'Milimani Commercial' && made.start_date === '2026-11-16' && made.due_date === '2027-05-01' && made.confidential === true, JSON.stringify(made));
ok('and it never sends an amount of money', !Object.keys(made).some((k) => /amount|value|price|budget|cost/.test(k)));
ok('after saving you are on the new piece of work', /M-0414 · Karura Lodge v\. Mwangi/.test(await body()));

// ---------------------------------------------------------------- an open piece of work
current = project();
await go('/admin/projects/413');
await page.getByRole('heading', { name: /M-0413/ }).waitFor({ timeout: 15000 });
text = await body();
ok('it shows its details in the industry\'s words', /Case number\s+HCCC E214 of 2026/.test(text) && /Court\s+Milimani Commercial/.test(text) && /Responsible advocate\s+P\. Kamau/.test(text) && /14 Nov 2026/.test(text));
ok('it shows its cost centre in the books and says money is not kept here', /Nairobi › Projects › M-0413/.test(text) && /Nothing about money is kept here/.test(text));
ok('an empty field is left out, not shown blank', !/Registry/.test(text));
ok('the stage it is at is marked as the current step', (await page.locator('[aria-current="step"]').innerText()) === 'Opening');
await page.screenshot({ path: D + 'projects-open.png', fullPage: true });
await page.getByRole('button', { name: 'Move to Pleadings' }).first().click();
await page.waitForTimeout(400);
ok('moving on sends the next stage', JSON.stringify(last('stage')[1]) === JSON.stringify({ stage_id: 2 }) && (await page.locator('[aria-current="step"]').innerText()) === 'Pleadings');
await page.getByRole('button', { name: 'Move to Hearing' }).first().click();
await page.getByText('Fill these in first: Court.').waitFor({ timeout: 5000 });
ok('a stage that needs something filled in says what', (await page.locator('[aria-current="step"]').innerText()) === 'Pleadings');
await page.getByRole('button', { name: 'Put on hold' }).click();
await page.getByRole('button', { name: 'Resume' }).waitFor({ timeout: 5000 });
ok('on hold: the stages cannot be moved and Resume is offered', last('state')[1].action === 'hold' && (await page.getByRole('button', { name: /^Move to/ }).count()) === 0 && /On hold/.test(await body()));
await page.getByRole('button', { name: 'Resume' }).click();
await page.getByRole('button', { name: 'Put on hold' }).waitFor({ timeout: 5000 });
await page.getByRole('button', { name: 'Cancel it' }).click();
ok('cancelling asks first and does nothing until answered', /It can be reopened later/.test(await body()) && last('state')[1].action === 'resume');
await page.getByRole('button', { name: 'Keep it as it is' }).click();
ok('saying no leaves it alone', last('state')[1].action === 'resume' && (await page.getByRole('button', { name: 'Yes, cancel it' }).count()) === 0);
await page.getByRole('button', { name: 'Cancel it' }).click();
await page.getByRole('button', { name: 'Yes, cancel it' }).click();
await page.getByRole('button', { name: 'Reopen' }).waitFor({ timeout: 5000 });
ok('saying yes cancels it, and Reopen and Freeze are then offered', last('state')[1].action === 'cancel' && (await page.getByRole('button', { name: 'Freeze' }).count()) === 1);
await page.getByRole('button', { name: 'Freeze' }).click();
await page.getByRole('button', { name: 'Yes, freeze it' }).click();
await page.getByRole('button', { name: 'Unfreeze' }).waitFor({ timeout: 5000 });
ok('frozen: it says so, and only Unfreeze and Close are left', JSON.stringify(last('freeze')[1]) === JSON.stringify({ frozen: true }) && /nothing on it can be changed until it is unfrozen/.test(await body())
  && (await page.getByRole('button', { name: 'Edit' }).count()) === 0 && (await page.getByRole('button', { name: 'Reopen' }).count()) === 0);
await page.getByRole('button', { name: 'Unfreeze' }).click();
await page.getByRole('button', { name: 'Edit' }).waitFor({ timeout: 5000 });

// ---------------------------------------------------------------- its phases
let phases = [
  { id: 1, parent_id: null, depth: 0, code: '1', name: 'Pre-trial', state: 'open', start_date: '2026-11-14', due_date: '2027-02-01', has_own_cost_centre: true, cost_centre_id: 20, cost_centre_path: 'Nairobi › Projects › M-0413 › 1 Pre-trial', children: 1 },
  { id: 2, parent_id: 1, depth: 1, code: '1.1', name: 'Pleadings', state: 'done', start_date: null, due_date: null, has_own_cost_centre: false, cost_centre_id: 20, cost_centre_path: 'Nairobi › Projects › M-0413 › 1 Pre-trial', children: 0 },
  { id: 3, parent_id: null, depth: 0, code: '2', name: 'Trial', state: 'open', start_date: null, due_date: null, has_own_cost_centre: false, cost_centre_id: 9, cost_centre_path: 'Nairobi › Projects › M-0413', children: 0 }];
let phaseCan = { phases: true, delete: true };
await page.route(/\/api\/admin\/projects\/\d+\/phases(\/\d+)?$/, (route) => {
  const method = route.request().method(); const id = (route.request().url().match(/phases\/(\d+)$/) || [])[1];
  if (method === 'POST') sent.push(['phase.add', route.request().postDataJSON()]);
  if (method === 'PUT') sent.push(['phase.change', Number(id), route.request().postDataJSON()]);
  if (method === 'DELETE') { sent.push(['phase.remove', Number(id)]); phases = phases.filter((x) => x.id !== Number(id) && x.parent_id !== Number(id)); }
  return json(route, { phases, can: phaseCan }, method === 'POST' ? 201 : 200);
});
words('legal');
current = project({ words: { ...words('legal'), phase: { name: 'Phase', plural: 'Phases' } } });
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Phases' }).click();
await page.locator('[data-phase="Pre-trial"]').waitFor({ timeout: 10000 });
text = await body();
ok('the phases show as a tree with their codes, dates and whether each is done', /1\s*Pre-trial/.test(text) && /14 Nov 2026 to 01 Feb 2027/.test(text) && /Done/.test(await page.locator('[data-phase="Pleadings"]').innerText()));
ok('each says where its costs land: its own cost centre, or the one above', /Its own/.test(await page.locator('[data-phase="Pre-trial"]').innerText()) && /1 Pre-trial/.test(await page.locator('[data-phase="Pre-trial"]').innerText()) && /The one above/.test(await page.locator('[data-phase="Trial"]').innerText()));
ok('a phase that already has its own cost centre is not offered another', (await page.getByRole('button', { name: 'Give 1 Pre-trial its own cost centre' }).count()) === 0 && (await page.getByRole('button', { name: 'Give 2 Trial its own cost centre' }).count()) === 1);
await page.screenshot({ path: D + 'projects-phases.png', fullPage: true });
await page.getByRole('button', { name: 'Add under 1 Pre-trial' }).click();
await page.getByLabel('Code').fill('1.2');
await page.getByLabel('Name', { exact: true }).fill('Discovery');
await page.getByLabel(/cost centre of its own/).check();
await page.getByRole('button', { name: 'Add phase' }).click();
await page.waitForTimeout(400);
ok('adding under a phase sends its parent, code, name and the wish for its own cost centre', JSON.stringify(last('phase.add')[1]) === JSON.stringify({ code: '1.2', name: 'Discovery', start_date: null, due_date: null, parent_id: 1, own_cost_centre: true }), JSON.stringify(last('phase.add')[1]));
await page.getByRole('button', { name: 'Mark 2 Trial done' }).click();
await page.waitForTimeout(300);
ok('marking done sends the state', JSON.stringify(last('phase.change')) === JSON.stringify(['phase.change', 3, { state: 'done' }]));
await page.getByRole('button', { name: 'Move 2 Trial up' }).click();
await page.waitForTimeout(300);
ok('moving sends the direction', JSON.stringify(last('phase.change')) === JSON.stringify(['phase.change', 3, { move: 'up' }]));
await page.getByRole('button', { name: 'Give 2 Trial its own cost centre' }).click();
await page.waitForTimeout(300);
ok('a cost centre of its own can be given later', JSON.stringify(last('phase.change')) === JSON.stringify(['phase.change', 3, { own_cost_centre: true }]));
await page.getByRole('button', { name: 'Change 2 Trial' }).click();
await page.getByLabel('Name', { exact: true }).fill('Trial and judgment');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForTimeout(300);
ok('changing sends the code, name and dates and never the parent', JSON.stringify(last('phase.change')) === JSON.stringify(['phase.change', 3, { code: '2', name: 'Trial and judgment', start_date: null, due_date: null }]), JSON.stringify(last('phase.change')));
await page.getByRole('button', { name: 'Delete 1 Pre-trial' }).click();
ok('deleting asks first and says what goes with it', /and everything under it in the trash\? It can be taken back out/.test(await body()) && !last('phase.remove'));
await page.getByRole('button', { name: 'Yes, put it in the trash' }).click();
await page.locator('[data-phase="Pre-trial"]').waitFor({ state: 'detached', timeout: 5000 });
ok('saying yes sends it', JSON.stringify(last('phase.remove')) === JSON.stringify(['phase.remove', 1]) && (await page.locator('[data-phase="Pleadings"]').count()) === 0);
phaseCan = { phases: false, delete: false };
current = project({ industry: { key: 'construction', name: 'Construction' }, words: { ...words('construction'), phase: { name: 'Section', plural: 'Sections' } } });
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Sections' }).click();
await page.locator('[data-phase="Trial"]').waitFor({ timeout: 10000 });
ok('the tab and the panel use the industry\'s word, and someone who may not change phases is offered nothing', /Break the work into sections/.test(await body()) && (await page.getByRole('button', { name: /New section|Add under|Change |Delete |Mark / }).count()) === 0);

// ---------------------------------------------------------------- changing it
current = project();
await go('/admin/projects/413/edit');
await page.getByRole('heading', { name: 'Change M-0413' }).waitFor({ timeout: 15000 });
ok('changing shows what is there and does not offer what was fixed at the start', (await page.getByLabel('Title').inputValue()) === 'Imara Sacco v. Baraka Traders' && (await page.getByLabel('Case number').inputValue()) === 'HCCC E214 of 2026'
  && (await page.getByLabel('Kind of work').count()) === 0 && (await page.getByLabel('Industry').count()) === 0 && (await page.getByLabel('Branch').count()) === 0 && (await page.getByLabel('Responsible advocate').count()) === 0 && /Imara Sacco/.test(await body()));
await page.getByLabel('Title').fill('Imara Sacco v. Baraka Traders Ltd');
await page.getByRole('button', { name: 'Remove Imara Sacco' }).click();
await page.getByLabel('Client', { exact: true }).fill('imara');
await page.getByRole('option', { name: /Imara Holdings/ }).click();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('heading', { name: /Baraka Traders Ltd/ }).waitFor({ timeout: 10000 });
const upd = last('update')[1];
ok('saving sends the changed details and nothing that was fixed at the start', upd.title === 'Imara Sacco v. Baraka Traders Ltd' && upd.customer_id === 5 && !('type_id' in upd) && !('industry_key' in upd) && !('lead_user_id' in upd) && !('location_id' in upd) && !('confidential' in upd), JSON.stringify(upd));

// ---------------------------------------------------------------- what a person may not do is not offered
current = project({ can: { ...CAN, edit: false, stage: false, close: false, freeze: false } });
await go('/admin/projects/413');
await page.getByRole('heading', { name: /M-0413/ }).waitFor({ timeout: 15000 });
ok('someone who may only read sees no Edit, no moves, no hold, cancel or freeze', (await page.getByRole('button', { name: /Edit|Move to|Put on hold|Cancel it|Freeze/ }).count()) === 0 && (await page.locator('[aria-current="step"]').innerText()) === 'Opening');
current = project({ can: { ...CAN, close: false } });
await go('/admin/projects/413');
await page.getByRole('button', { name: 'Move to Pleadings' }).first().waitFor({ timeout: 15000 });
ok('someone who may move stages but not close is not offered the closed stage', (await page.getByRole('button', { name: 'Move to Closed' }).count()) === 0 && (await page.getByRole('button', { name: 'Cancel it' }).count()) === 0);
await go('/admin/projects/999');
await page.getByText('There is nothing here that you can open').waitFor({ timeout: 15000 });
ok('something that does not exist, or that you are not on, reads the same: nothing here', /you may not be on it/.test(await body()));

permissions = ['admin.access', 'projects.use'];
await signIn();
await go('/admin/projects');
await page.getByRole('heading', { name: 'Matters', exact: true }).waitFor({ timeout: 15000 });
ok('without the permissions there is no New, no Configuration and no switch to all', (await page.getByRole('button', { name: /New matter|Configuration|All I may see/ }).count()) === 0);
ready = false;
await go('/admin/projects');
await page.getByText('The database for the new module is not in place yet').waitFor({ timeout: 15000 });
ok('before the database is in place the list says so', true);

await finish();
