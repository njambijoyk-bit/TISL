// Browser check: industry finish (stage 11). Work templates (11.1): choosing one when a piece of work starts (the usual one chosen, or none),
// a kind of work that starts confidential, making a template in Configuration, and adding what is missing on a running work. The opening check (11.2):
// answering yes or no with a note, signing with a typed name, a failed check, and who else is involved with a possible conflict.
// The API is answered by the check itself; what a template makes is proved by ProjectsWorkTemplatesTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.create', 'projects.tasks', 'projects.config.view', 'projects.config.stages', 'projects.config.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
await page.route('**/api/admin/projects/options', (route) => json(route, { default_industry: 'legal', industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }, { key: 'healthcare', name: 'Healthcare', group: 'niche', is_active: true }],
  types: [{ id: 1, industry: 'legal', name: 'Litigation', prefix: 'M' }, { id: 7, industry: 'healthcare', name: 'Treatment plan', prefix: 'TP' }], branches: [], leads: [{ id: 1, name: 'Kamau' }], priorities: ['low', 'medium', 'high', 'urgent'], words: { legal: {}, healthcare: {} }, cost_centres: true,
  fields: {}, templates: { 1: [{ id: 11, name: 'Civil suit', is_default: true }, { id: 12, name: 'Judicial review', is_default: false }], 7: [] }, start_confidential: { 1: false, 7: true }, can: { create: true, confidential: false } }));
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => { if (route.request().method() === 'POST') { sent.push(['create', route.request().postDataJSON()]); return json(route, { project: { id: 414, number: 'M-0414' } }, 201); } return json(route, { data: [], total: 0, page: 1, per_page: 25, counts: {} }); });

// ---------------------------------------------------------------- starting a piece of work
await go('/admin/projects/new');
await page.getByLabel('Kind of work').waitFor({ timeout: 15000 });
ok('the usual template of the kind of work is chosen', (await page.getByLabel('Start from').locator('option:checked').innerText()) === 'Civil suit (usual)');
await page.getByLabel('Title').fill('Imara v Baraka');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
ok('left as it is, the kind of work decides (no template sent)', last('create') && !('template_id' in last('create')[1]));
await go('/admin/projects/new');
await page.getByLabel('Kind of work').waitFor({ timeout: 15000 });
await page.getByLabel('Start from').selectOption({ label: 'Nothing: start empty' });
await page.getByLabel('Title').fill('A blank one');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
ok('starting empty sends 0', last('create')?.[1]?.template_id === 0);
await go('/admin/projects/new');
await page.getByLabel('Kind of work').waitFor({ timeout: 15000 });
await page.getByLabel('Industry').selectOption({ label: 'Healthcare' });
ok('a kind of work that starts confidential says so, and with no templates offers none', (await page.getByText('This kind of work starts confidential').count()) === 1 && (await page.getByLabel('Start from').count()) === 0);

// ---------------------------------------------------------------- Configuration: how work starts
let templates = [];
await page.route('**/api/admin/projects/configuration/types/1/templates', (route) => json(route, { ready: true, type: { id: 1, name: 'Litigation', industry: 'legal' }, settings: { confidential_default: false, opening_required: true }, templates, date_kinds: [{ key: 'hearing', name: 'Hearing' }, { key: 'filing', name: 'Filing deadline' }], can: { change: true } }));
await page.route('**/api/admin/projects/configuration/work-templates', (route) => { const b = route.request().postDataJSON(); sent.push(['template', b]); templates = [{ id: 13, name: b.name, is_default: b.is_default, is_active: true, items: b.items }];
  return json(route, { ready: true, type: { id: 1, name: 'Litigation', industry: 'legal' }, settings: { confidential_default: false, opening_required: true }, templates, date_kinds: [], can: { change: true } }, 201); });
await page.route(/\/api\/admin\/projects\/configuration(\?.*)?$/, (route) => json(route, { ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, access: null, version: 1, industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], viewing: 'legal', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } }));
await page.route('**/api/admin/projects/configuration/opening-questions**', (route) => json(route, { ready: true, name: 'Conflict check', types: [{ id: 1, name: 'Litigation' }], questions: [{ id: 1, type_id: null, question: 'No conflict with an existing client', must_be_yes: true, is_active: true }], can: { change: true } }));
await page.route('**/api/admin/projects/configuration/shape**', (route) => json(route, { types: [], fields: [], industry: 'legal', kinds: [], can: { stages: true, fields: true } }));
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Kinds of work and stages' }).click();
await page.locator('[data-work-templates]').waitFor({ timeout: 10000 });
ok('the opening check questions are listed under the industry\'s name for it', /Conflict check .*No conflict with an existing client · every kind of work Must be yes/.test(await text(page.locator('[data-opening-questions]'))));
ok('the kind of work shows its settings', await page.getByLabel('The opening check must pass before it leaves its first stage').isChecked());
await page.getByRole('button', { name: 'Add a template' }).click();
await page.getByLabel('Template name').fill('Employment claim');
await page.getByLabel('Line 1 name').fill('Pleadings');
await page.getByRole('button', { name: '+ Task' }).click();
await page.getByLabel('Line 2 name').fill('File the claim');
await page.getByLabel('Line 2 under').selectOption('Pleadings');
await page.getByLabel('Line 2 days').fill('14');
await page.getByRole('button', { name: '+ Key date' }).click();
await page.getByLabel('Line 3 name').fill('First mention');
await page.getByLabel('Line 3 days').fill('30');
await page.getByLabel('Line 3 kind of date').selectOption({ label: 'Hearing' });
await page.getByLabel('Line 3 warn days').fill('7,1');
await page.getByRole('button', { name: 'Save the template' }).click();
await page.locator('[data-work-template="Employment claim"]').waitFor({ timeout: 5000 });
const t = last('template')?.[1];
ok('a template is saved with its phase, the task under it and a key date', t?.name === 'Employment claim' && t.is_default === true && JSON.stringify(t.items.map((i) => [i.kind, i.title, i.parent_ref, i.offset_days, i.date_kind])) === JSON.stringify([['phase', 'Pleadings', '', null, ''], ['task', 'File the claim', 'Pleadings', 14, ''], ['date', 'First mention', '', 30, 'hearing']]));
await page.screenshot({ path: D + 'projects-work-templates.png', fullPage: true });

// ---------------------------------------------------------------- on a running work
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara v Baraka', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words: {}, can: { open: true }, locks: {}, fields: [] } }));
await page.route('**/api/admin/projects/413/work-templates', (route) => json(route, { templates: [{ id: 11, name: 'Civil suit', is_default: true }] }));
await page.route('**/api/admin/projects/413/work-templates/11/apply', (route) => { sent.push(['apply', 11]); return json(route, { made: { phases: 2, tasks: 5, dates: 1 } }); });
await page.route(/\/api\/admin\/projects\/413\/tasks(\?.*)?$/, (route) => json(route, { ready: true, tasks: [], statuses: { todo: 'To do', doing: 'Doing', waiting: 'Waiting', done: 'Done', cancelled: 'Cancelled' }, priorities: { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }, phases: [], people: [], billable_default: true, can: { manage: true } }));
await page.route(/\/api\/admin\/projects\/saved-views\/work(\/\d+)?$/, (route) => json(route, { views: [] }));
await go('/admin/projects/413?tab=work');
await page.locator('[data-apply-template]').waitFor({ timeout: 10000 });
await page.getByLabel('A work template').selectOption({ label: 'Civil suit' });
await page.getByRole('button', { name: 'Add what is missing' }).click();
await page.waitForTimeout(400);
ok('a template applied later says what it added', JSON.stringify(last('apply')) === JSON.stringify(['apply', 11]) && (await page.getByText('Added 2 phases, 5 tasks and 1 key dates').count()) === 1);

// ---------------------------------------------------------------- the opening check
let oc = { ready: true, name: 'Conflict check', required: true, state: 'none', passed: null, signed: null,
  questions: [{ key: 'q1', question: 'No conflict with an existing client', must_be_yes: true, answer: null, note: null }, { key: 'q2', question: 'Retainer asked for', must_be_yes: false, answer: null, note: null }],
  involved: [{ who: 'Imara Sacco', as: 'Client', matches: [] }, { who: 'Baraka Traders', as: 'Party', matches: [{ type: 'customer', id: 2, name: 'Baraka Traders Ltd', detail: 'Already a client (C-002)', url: null, conflict: true }] }], can: { answer: true, redo: false } };
await page.route('**/api/admin/projects/413/opening-check', (route) => { if (route.request().method() === 'PUT') { const b = route.request().postDataJSON().answers; sent.push(['oc', b]); oc = { ...oc, state: 'draft', questions: oc.questions.map((q) => (b[q.key] ? { ...q, ...b[q.key] } : q)) }; } return json(route, oc); });
await page.route('**/api/admin/projects/413/opening-check/sign', (route) => { sent.push(['ocsign', route.request().postDataJSON()]); oc = { ...oc, state: 'done', passed: oc.questions[0].answer === 'yes', signed: { name: 'Kamau Njoroge', by: 'Kamau', at: '2026-11-20 10:00:00' }, can: { answer: false, redo: true } }; return json(route, oc); });
await go('/admin/projects/413');
await page.locator('[data-opening-check]').waitFor({ timeout: 10000 });
ok('the check is named in the industry\'s words and says it must pass', /Conflict check It must pass before the work moves on from its first stage. Not done/.test(await text(page.locator('[data-opening-check]'))));
ok('a party who is already a client is marked as a possible conflict', /Baraka Traders \(party\) Possible conflict Baraka Traders Ltd: Already a client \(C-002\)/.test(await text(page.locator('[data-involved-who="Baraka Traders"]'))) && /not found anywhere else/.test(await text(page.locator('[data-involved-who="Imara Sacco"]'))));
await page.getByRole('button', { name: 'No conflict with an existing client: yes' }).click();
await page.waitForTimeout(200);
await page.getByLabel('Note on: No conflict with an existing client').fill('Baraka Traders Ltd is a different company');
await page.getByLabel('Note on: No conflict with an existing client').blur();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Retainer asked for: no' }).click();
await page.waitForTimeout(200);
ok('answers and notes are sent as they are given', JSON.stringify(sent.filter((x) => x[0] === 'oc').map((x) => x[1])) === JSON.stringify([{ q1: { answer: 'yes', note: null } }, { q1: { answer: 'yes', note: 'Baraka Traders Ltd is a different company' } }, { q2: { answer: 'no', note: null } }]));
await page.getByLabel('Type your full name to sign the check').fill('Kamau Njoroge');
await page.getByRole('button', { name: 'Sign', exact: true }).click();
await page.waitForTimeout(300);
ok('signed, it passes (the second question need not be yes) and offers to do it again', JSON.stringify(last('ocsign')?.[1]) === JSON.stringify({ name: 'Kamau Njoroge' }) && /Passed/.test(await text(page.locator('[data-opening-check]'))) && /Signed by Kamau Njoroge/.test(await text(page.locator('[data-opening-check]'))) && (await page.getByRole('button', { name: 'Do it again' }).count()) === 1);
await page.screenshot({ path: D + 'projects-opening-check.png', fullPage: true });
await finish(c);
