// Browser check: configuring the shape of the work (build 1.8): kinds of work with their number series, stages and what each asks for, extra fields; and those fields on the
// form and on the open piece of work. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Owner', email: 'owner@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 6, permissions: ['admin.access', 'projects.use', 'projects.create', 'projects.edit', 'projects.config.view', 'projects.config.stages', 'projects.config.fields'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const body = async () => (await page.locator('#root').innerText()).replace(/\s+/g, ' ');

const W = { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], phase: ['Phase', 'Phases'], closing_period: ['Appeal period', 'Appeal periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const industries = [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }, { key: 'construction', name: 'Construction', group: 'common', is_active: true }];
let can = { stages: true, fields: true };
let types = [{ id: 1, name: 'Litigation', prefix: 'M', is_active: true, projects: 12, next_number: 414, stages: [
    { id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: ['customer_id'], projects: 4 },
    { id: 2, name: 'Pleadings', state: 'open', status: 'info', required_fields: ['reference', 'field:opposing_party'], projects: 0 },
    { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [], projects: 8 }] },
  { id: 2, name: 'Conveyancing', prefix: 'CV', is_active: false, projects: 0, next_number: 1, stages: [{ id: 7, name: 'Open', state: 'open', status: 'info', required_fields: [], projects: 0 }] }];
let fields = [
  { id: 1, key: 'practice_area', label: 'Practice area', kind: 'pick_one', options: ['Commercial', 'Land', 'Family'], scope: 'industry', type_id: null, type_name: null, required: true, sensitive: false, is_active: true },
  { id: 2, key: 'opposing_party', label: 'Opposing party', kind: 'text', options: [], scope: 'type', type_id: 1, type_name: 'Litigation', required: false, sensitive: false, is_active: true },
  { id: 3, key: 'settlement_ceiling', label: 'Settlement ceiling', kind: 'text', options: [], scope: 'type', type_id: 1, type_name: 'Litigation', required: false, sensitive: true, is_active: true }];
const shape = (industry) => ({ types: industry === 'legal' ? types : [], fields: industry === 'legal' ? fields : [], industry,
  field_kinds: { text: 'Text', number: 'Number (a count or a measure, never money)', date: 'Date', yes_no: 'Yes or no', pick_one: 'Pick one', pick_many: 'Pick several', person: 'A member of staff' },
  statuses: { info: 'Information', good: 'Good', warning: 'Warning', problem: 'Problem' }, stage_states: { open: 'Open', closed: 'Closed' }, requirable: ['customer_id', 'reference', 'authority', 'place', 'start_date', 'due_date', 'description'], can });

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route('**/api/admin/projects/configuration**', (route) => {
  const url = new URL(route.request().url()); const path = url.pathname.replace(/.*\/configuration/, ''); const method = route.request().method(); const industry = url.searchParams.get('industry') || 'legal';
  const b = method === 'GET' || method === 'DELETE' ? null : route.request().postDataJSON();
  if (path === '') return json(route, { ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, version: 1, industries, viewing: 'legal', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
  if (path === '/shape') { sent.push(['shape', industry]); return json(route, shape(industry)); }
  sent.push([`${method} ${path.replace(/\/\d+/g, '/N')}`, Number((path.match(/\/(\d+)/) || [])[1]) || null, b]);
  if (path === '/types' && b.prefix === 'M') return json(route, { message: 'Another kind of work already uses that prefix. Each needs its own, so no two pieces of work share a number.' }, 422);
  if (path === '/types') types = [...types, { id: 9, name: b.name, prefix: b.prefix, is_active: true, projects: 0, next_number: 1, stages: [{ id: 90, name: 'Open', state: 'open', status: 'info', required_fields: [], projects: 0 }, { id: 91, name: 'Closed', state: 'closed', status: 'good', required_fields: [], projects: 0 }] }];
  if (path === '/fields') fields = [...fields, { id: 9, key: 'x', label: b.label, kind: b.kind, options: b.options || [], scope: b.scope, type_id: b.type_id, type_name: b.type_id ? 'Litigation' : null, required: b.required, sensitive: b.sensitive, is_active: true }];
  return json(route, shape(industry), method === 'POST' ? 201 : 200);
});

// ---------------------------------------------------------------- kinds of work and stages
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Kinds of work and stages' }).click();
await page.locator('[data-type="Litigation"]').waitFor({ timeout: 15000 });
let text = await body();
ok('each kind of work shows its prefix, its next number and how much work it has', /Numbers run M-0414 next · 12 started/.test(text) && /Off/.test(await page.locator('[data-type="Conveyancing"]').innerText()));
ok('each stage shows how much work is at it and what it asks for, in the industry\'s words', /4 here/.test(await page.locator('[data-stage="Opening"]').innerText()) && /Client/.test(await page.locator('[data-stage="Opening"]').innerText()) && /Case number, Opposing party/.test(await page.locator('[data-stage="Pleadings"]').innerText()));
ok('a stage with work at it, and the last stage of a kind of work, cannot be removed', (await page.getByRole('button', { name: 'Remove the stage Opening' }).count()) === 0 && (await page.getByRole('button', { name: 'Remove the stage Pleadings' }).count()) === 1 && (await page.getByRole('button', { name: 'Remove the stage Open', exact: true }).count()) === 0);
await page.screenshot({ path: D + 'projects-stages.png', fullPage: true });

await page.getByLabel('How Pleadings is shown').selectOption('warning');
await page.waitForTimeout(300);
ok('how a stage is shown is one of the theme\'s named statuses, sent by name', JSON.stringify(last('PUT /stages/N')) === JSON.stringify(['PUT /stages/N', 2, { status: 'warning' }]) && (await page.getByLabel('How Pleadings is shown').locator('option').allInnerTexts()).join() === 'Information,Good,Warning,Problem');
await page.getByRole('button', { name: 'What Pleadings asks for' }).click();
await page.getByLabel('Court').check();
await page.getByLabel('Opposing party').uncheck();
await page.getByRole('button', { name: 'Save what it asks for' }).click();
await page.waitForTimeout(300);
ok('what a stage asks for is chosen from the fields this kind of work has, built-in and extra', JSON.stringify(last('PUT /stages/N')[2]) === JSON.stringify({ required_fields: ['reference', 'authority'] }), JSON.stringify(last('PUT /stages/N')));
await page.getByRole('button', { name: 'Move Pleadings up' }).click();
await page.waitForTimeout(300);
ok('a stage moves up or down', JSON.stringify(last('PUT /stages/N')[2]) === JSON.stringify({ move: 'up' }));
await page.getByRole('button', { name: 'Rename the stage Pleadings' }).click();
await page.getByLabel('New name for Pleadings').fill('Statements of case');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(300);
ok('and is renamed', JSON.stringify(last('PUT /stages/N')[2]) === JSON.stringify({ name: 'Statements of case' }));
await page.getByRole('button', { name: 'New stage for Litigation' }).click();
await page.getByLabel('Name of the stage').fill('Mediation');
await page.getByRole('button', { name: 'Add stage' }).click();
await page.waitForTimeout(300);
ok('a new stage is sent with its state and how it is shown', JSON.stringify(last('POST /types/N/stages')) === JSON.stringify(['POST /types/N/stages', 1, { name: 'Mediation', state: 'open', status: 'info' }]));
await page.getByRole('button', { name: 'Remove the stage Pleadings' }).click();
await page.waitForTimeout(300);
ok('an empty stage can be removed', JSON.stringify(last('DELETE /stages/N').slice(0, 2)) === JSON.stringify(['DELETE /stages/N', 2]));
await page.getByRole('button', { name: 'Switch on Conveyancing' }).click();
await page.waitForTimeout(300);
ok('a kind of work is switched on and off', JSON.stringify(last('PUT /types/N')) === JSON.stringify(['PUT /types/N', 2, { is_active: true }]));

await page.getByRole('button', { name: 'New kind of work' }).click();
await page.getByLabel('Name of the kind of work').fill('Probate');
await page.getByLabel('Number prefix').fill('m');
await page.getByRole('button', { name: 'Add kind of work' }).click();
await page.getByText('Another kind of work already uses that prefix').waitFor({ timeout: 5000 });
ok('a prefix that is taken is refused, and typed prefixes are upper case', last('POST /types')[2].prefix === 'M' && (await page.getByLabel('Number prefix').inputValue()) === 'M');
await page.getByLabel('Number prefix').fill('pb');
await page.getByRole('button', { name: 'Add kind of work' }).click();
await page.locator('[data-type="Probate"]').waitFor({ timeout: 5000 });
ok('a new kind of work arrives with its own series and two stages to start from', JSON.stringify(last('POST /types')[2]) === JSON.stringify({ name: 'Probate', prefix: 'PB', industry_key: 'legal' }) && /Numbers run PB-0001 next/.test(await body()));
await page.getByLabel('Industry').selectOption('construction');
await page.getByText('This industry has no kinds of work yet.').waitFor({ timeout: 5000 });
ok('each industry is looked at on its own', last('shape')[1] === 'construction');

// ---------------------------------------------------------------- extra fields
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Fields' }).click();
await page.locator('[data-field="Practice area"]').waitFor({ timeout: 15000 });
ok('each field shows its kind, its choices, where it shows and whether it is required or sensitive', /Pick one/.test(await page.locator('[data-field="Practice area"]').innerText()) && /Commercial, Land, Family/.test(await page.locator('[data-field="Practice area"]').innerText())
  && /Litigation/.test(await page.locator('[data-field="Opposing party"]').innerText()) && await page.getByLabel('Practice area must be filled in').isChecked() && await page.getByLabel('Settlement ceiling is sensitive').isChecked());
await page.screenshot({ path: D + 'projects-fields.png', fullPage: true });
await page.getByLabel('Opposing party must be filled in').click();
await page.waitForTimeout(300);
ok('required and sensitive are saved the moment they change', JSON.stringify(last('PUT /fields/N')) === JSON.stringify(['PUT /fields/N', 2, { required: true }]));
await page.getByRole('button', { name: 'Switch off the field Settlement ceiling' }).click();
await page.waitForTimeout(300);
ok('a field is switched off, not deleted', JSON.stringify(last('PUT /fields/N')) === JSON.stringify(['PUT /fields/N', 3, { is_active: false }]));
await page.getByRole('button', { name: 'New field' }).click();
ok('the form says a number is never money and the kind cannot change later', /money is never a field here/.test(await body()) && /The kind cannot be changed later/.test(await body()));
await page.getByLabel('Name of the field').fill('Remedies sought');
await page.getByLabel('Kind').selectOption('pick_many');
await page.getByLabel('Choices, one per line').fill('Damages\nInjunction, Costs');
await page.getByLabel('Shows on').selectOption('type');
await page.getByLabel('Which kind of work').selectOption({ label: 'Litigation' });
await page.locator('#field-sensitive').check();
await page.getByRole('button', { name: 'Add field' }).click();
await page.locator('[data-field="Remedies sought"]').waitFor({ timeout: 5000 });
ok('a new field is sent with its kind, choices, where it shows, and its ticks', JSON.stringify(last('POST /fields')[2]) === JSON.stringify({ label: 'Remedies sought', kind: 'pick_many', scope: 'type', industry_key: 'legal', type_id: 1, required: false, sensitive: true, options: ['Damages', 'Injunction', 'Costs'] }), JSON.stringify(last('POST /fields')[2]));
can = { stages: false, fields: false };
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Fields' }).click();
await page.locator('[data-field="Practice area"]').waitFor({ timeout: 15000 });
const noFieldButtons = (await page.getByRole('button', { name: /New field|Switch o/ }).count()) === 0 && (await page.getByRole('checkbox').count()) === 0;
await page.getByRole('tab', { name: 'Kinds of work and stages' }).click();
await page.locator('[data-type="Litigation"]').waitFor({ timeout: 15000 });
ok('someone who may only look sees the shape with nothing to press', noFieldButtons && (await page.locator('[data-type] button').count()) === 0 && (await page.getByRole('button', { name: 'New kind of work' }).count()) === 0 && /Information/.test(await page.locator('[data-stage="Opening"]').innerText()));

// ---------------------------------------------------------------- the extra fields on the form and on the work
const EXTRA = [{ key: 'practice_area', label: 'Practice area', kind: 'pick_one', options: ['Commercial', 'Land'], required: true, sensitive: false }, { key: 'opposing_party', label: 'Opposing party', kind: 'text', options: [], required: false, sensitive: false },
  { key: 'witnesses', label: 'Witnesses', kind: 'number', options: [], required: false, sensitive: false }, { key: 'limitation_date', label: 'Limitation date', kind: 'date', options: [], required: false, sensitive: false },
  { key: 'legal_aid', label: 'Legal aid', kind: 'yes_no', options: [], required: false, sensitive: false }, { key: 'remedies', label: 'Remedies sought', kind: 'pick_many', options: ['Damages', 'Injunction', 'Costs'], required: false, sensitive: false },
  { key: 'partner', label: 'Supervising partner', kind: 'person', options: [], required: false, sensitive: false }];
const CAN = { open: true, edit: true, stage: true, close: true, freeze: true, confidential: false, phases: true, members: true, members_view: false, links: true, log: false };
let project = null;
await page.route('**/api/admin/projects/options', (route) => json(route, { default_industry: 'legal', industries: [industries[0]], types: [{ id: 1, industry: 'legal', name: 'Litigation', prefix: 'M' }, { id: 2, industry: 'legal', name: 'Conveyancing', prefix: 'CV' }], branches: [],
  leads: [{ id: 1, name: 'P. Kamau' }, { id: 2, name: 'W. Njeri' }], fields: { 1: EXTRA, 2: [EXTRA[0]] }, priorities: ['low', 'medium', 'high', 'urgent'], words: { legal: words }, cost_centres: true, can: { create: true, confidential: false } }));
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => { if (route.request().method() !== 'POST') return json(route, { data: [], total: 0, page: 1, per_page: 25, counts: { open: 0, on_hold: 0, closed: 0, cancelled: 0 } });
  const b = route.request().postDataJSON(); sent.push(['create', b]);
  project = { id: 5, number: 'M-0414', title: b.title, description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium', customer: null, lead: { id: 1, name: 'P. Kamau' }, branch: null,
    cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false, stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }],
    cost_centre_path: 'Projects › M-0414', words, can: CAN, fields: EXTRA.map((f) => ({ ...f, value: b.fields[f.key], ...(f.kind === 'person' ? { display: 'W. Njeri' } : {}) })).concat([{ key: 'ceiling', label: 'Settlement ceiling', kind: 'text', options: [], required: false, sensitive: true, value: 'Up to 2.5M' }]) };
  return json(route, { project }, 201); });
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => json(route, { project }));
await go('/admin/projects/new');
await page.getByLabel('Practice area *').waitFor({ timeout: 15000 });
ok('the form shows the extra fields of the chosen kind of work, each as the right kind of input', (await page.getByLabel('Witnesses').getAttribute('type')) === 'number' && (await page.getByLabel('Limitation date').getAttribute('type')) === 'date' && (await page.getByLabel('Legal aid').getAttribute('type')) === 'checkbox'
  && (await page.getByLabel('Supervising partner').locator('option').allInnerTexts()).join() === 'Choose…,P. Kamau,W. Njeri' && (await page.getByLabel('Injunction').count()) === 1);
await page.getByLabel('Kind of work').selectOption({ label: 'Conveyancing' });
ok('and they follow the kind of work', (await page.getByLabel('Practice area *').count()) === 1 && (await page.getByLabel('Witnesses').count()) === 0);
await page.getByLabel('Kind of work').selectOption({ label: 'Litigation' });
await page.getByLabel('Title').fill('Imara v. Baraka');
await page.getByLabel('Practice area *').selectOption('Land');
await page.getByLabel('Opposing party').fill('Baraka Traders');
await page.getByLabel('Witnesses').fill('3');
await page.getByLabel('Limitation date').fill('2027-06-30');
await page.getByLabel('Legal aid').check();
await page.getByLabel('Damages').check();
await page.getByLabel('Costs').check();
await page.getByLabel('Supervising partner').selectOption({ label: 'W. Njeri' });
await page.screenshot({ path: D + 'projects-new-with-fields.png', fullPage: true });
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('heading', { name: /M-0414/ }).waitFor({ timeout: 10000 });
ok('saving sends every extra field by its key', JSON.stringify(last('create')[1].fields) === JSON.stringify({ practice_area: 'Land', opposing_party: 'Baraka Traders', witnesses: '3', limitation_date: '2027-06-30', legal_aid: true, remedies: ['Damages', 'Costs'], partner: 2 }), JSON.stringify(last('create')[1].fields));
text = await body();
ok('the open piece of work shows them in words', /Practice area Land/.test(text) && /Witnesses 3/.test(text) && /Limitation date 30 Jun 2027/.test(text) && /Legal aid Yes/.test(text) && /Remedies sought Damages, Costs/.test(text) && /Supervising partner W\. Njeri/.test(text));
ok('and marks a sensitive one', /Settlement ceiling ?Sensitive ?Up to 2\.5M/.test(text));

await finish();
