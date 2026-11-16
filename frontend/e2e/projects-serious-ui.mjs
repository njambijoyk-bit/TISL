// Browser check: serious actions (build 2.4): the table in Configuration that says what each action needs, and the question a person is asked
// before an action is sent to a supervisor. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.edit', 'projects.delete', 'projects.config.view', 'projects.config.actions'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');
const row = (key) => page.locator(`[data-action="${key}"]`);

const W = { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], phase: ['Phase', 'Phases'], closing_period: ['Appeal period', 'Appeal periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const ACTIONS = { 'project.purge': 'Delete a project for good', 'project.open_up': 'Make a confidential project open', 'project.unfreeze': 'Unfreeze a project', 'project.transfer': 'Hand a project to another lead', 'project.reopen': 'Reopen a closed or cancelled project', 'project.delete': 'Put a project in the trash', 'member.remove': 'Remove someone from a project', 'role.change': 'Change what a project role can do' };
const none = { needs: 'none', on_project: false, reason: false };
let rules = Object.fromEntries(Object.keys(ACTIONS).map((k) => [k, none]));
const suggested = { ...rules, 'project.purge': { needs: 'both', on_project: false, reason: true }, 'project.open_up': { needs: 'supervisor', on_project: false, reason: true }, 'project.unfreeze': { needs: 'supervisor', on_project: true, reason: true }, 'project.transfer': { needs: 'identity', on_project: false, reason: false }, 'role.change': { needs: 'supervisor', on_project: false, reason: true } };
let canChange = true; let approvers = 1;
const seriousPage = () => ({ actions: Object.entries(ACTIONS).map(([key, label]) => ({ key, label, can_be_on_project: !['role.change', 'project.purge'].includes(key) })), needs: { none: 'Nothing', identity: 'Confirm identity', supervisor: 'A supervisor approves', both: 'Identity and a supervisor' }, rules, suggested, identity_ready: false, approvers, can: { change: canChange } });
const CAN = { open: true, edit: true, stage: true, close: true, freeze: false, confidential: true, phases: true, members: true, members_view: true, links: true, log: true, access: true };
const project = { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }, { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [] }], cost_centre_path: 'Projects › M-0413', words, can: CAN, locks: {}, fields: [] };
let deleteNeeds = { state: 'ask', action: 'project.delete', label: 'Put a project in the trash', needs: 'supervisor', reason_required: true };

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words, keys: {} }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => json(route, { data: [], total: 0, page: 1, per_page: 25, counts: { open: 0, on_hold: 0, closed: 0, cancelled: 0 } }));
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, '');
  if (path === '/serious') { if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['rules', b]); rules = b.rules; } return json(route, seriousPage()); }
  return json(route, { ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, access: { warn_days: 7, default_hours: [], read_outside_hours: false, passes: true, pass_minutes: 60, unlock_minutes: 15, lock_tries: 5, lock_wait_minutes: 15, approval_hours: 24 }, version: 1, industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], viewing: 'legal', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
});
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => {
  if (route.request().method() !== 'DELETE') return json(route, { project });
  const h = route.request().headers(); sent.push(['delete', h['x-projects-ask'] || null, h['x-projects-reason'] || null]);
  if (!deleteNeeds) return json(route, { message: 'In the trash.' });
  if (!h['x-projects-ask']) return json(route, { message: 'This needs a supervisor to approve it first.', serious: deleteNeeds }, 428);
  return json(route, { message: 'Sent to 2 people who can approve it. Nothing has changed yet.', serious: { ...deleteNeeds, state: 'asked', approvers: 2 } }, 409);
});

// ---------------------------------------------------------------- the table in Configuration
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Serious actions' }).click();
await row('project.purge').waitFor({ timeout: 15000 });
ok('every action that can be marked serious is listed, and out of the box each needs nothing', (await page.locator('[data-action]').count()) === 8 && (await page.locator('[data-action] select').evaluateAll((els) => els.every((e) => e.value === 'none'))));
ok('an action that needs nothing offers no supervisor or reason boxes', (await row('project.delete').getByRole('checkbox').count()) === 0);
await page.getByRole('button', { name: 'Use the suggested set' }).click();
ok('the suggested set fills the table without saving it', (await row('project.purge').locator('select').inputValue()) === 'both' && (await row('project.unfreeze').getByRole('checkbox').first().isChecked()) && sent.length === 0);
ok('it warns when confirming identity is not set up, and says such an action is refused, not let through', /Confirming identity is not set up on this system yet/.test(await text()) && /refused, not let through/.test(await text()));
ok('and when too few people can approve', /Only one person holds the permission to approve serious actions/.test(await text()));
ok('deleting for good and changing a role cannot ask for a supervisor on the project', (await row('project.purge').getByRole('checkbox').count()) === 1 && (await row('role.change').getByRole('checkbox').count()) === 1 && (await row('project.unfreeze').getByRole('checkbox').count()) === 2);
await page.screenshot({ path: D + 'projects-serious.png', fullPage: true });
await page.getByLabel('What "Put a project in the trash" needs').selectOption('supervisor');
await page.getByLabel('"Put a project in the trash" must say why').click();
await page.getByLabel('What "Hand a project to another lead" needs').selectOption('none');
await page.getByRole('button', { name: 'Save serious actions' }).click();
await page.waitForTimeout(400);
const saved = sent.at(-1)[1].rules;
ok('the whole table is sent as it reads', JSON.stringify(saved['project.delete']) === JSON.stringify({ needs: 'supervisor', on_project: false, reason: true }) && saved['project.transfer'].needs === 'none' && saved['project.purge'].needs === 'both' && Object.keys(saved).length === 8, JSON.stringify(saved['project.delete']));
canChange = false; approvers = 3;
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Serious actions' }).click();
await row('project.purge').waitFor({ timeout: 15000 });
ok('someone who may not change it reads the table with everything greyed', (await page.locator('[data-action] select').evaluateAll((els) => els.every((e) => e.disabled))) && (await page.getByRole('button', { name: 'Save serious actions' }).count()) === 0 && /may not change it/.test(await text()));

// ---------------------------------------------------------------- doing something serious
await go('/admin/projects/413');
await page.getByRole('heading', { name: /Imara Sacco/ }).waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.getByRole('button', { name: 'Yes, put it in the trash' }).click();
await page.getByRole('dialog').waitFor({ timeout: 10000 });
ok('a serious action stops and says it needs a supervisor, naming the action', /This needs a supervisor first/.test(await text(page.getByRole('dialog'))) && /Put a project in the trash is marked as a serious action/.test(await text(page.getByRole('dialog'))) && /nothing changes until one of them does/.test(await text(page.getByRole('dialog'))));
await page.screenshot({ path: D + 'projects-serious-ask.png', fullPage: true });
await page.getByRole('button', { name: 'Do not ask' }).click();
await page.waitForTimeout(400);
ok('choosing not to ask sends nothing more and the page stays', sent.filter((x) => x[0] === 'delete').length === 1 && (await page.evaluate(() => window.location.pathname)) === '/admin/projects/413' && (await page.getByText('Not sent. Nothing has changed.').count()) > 0);

await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.getByRole('button', { name: 'Yes, put it in the trash' }).click();
await page.getByRole('dialog').waitFor({ timeout: 10000 });
await page.getByRole('button', { name: 'Ask a supervisor' }).click();
ok('a reason is required when the table says so', (await page.getByRole('dialog').count()) === 1 && sent.filter((x) => x[0] === 'delete').length === 2);
await page.getByLabel('Why it needs doing').fill('Opened twice by mistake: 100% a duplicate');
await page.getByRole('button', { name: 'Ask a supervisor' }).click();
await page.waitForTimeout(600);
ok('the same request is sent again with the answer and the reason', JSON.stringify(sent.at(-1)) === JSON.stringify(['delete', '1', encodeURIComponent('Opened twice by mistake: 100% a duplicate')]), JSON.stringify(sent.at(-1)));
ok('the page says who it went to and that nothing has changed, and stays where it is', (await page.getByText('Sent to 2 people who can approve it. Nothing has changed yet.').count()) > 0 && (await page.evaluate(() => window.location.pathname)) === '/admin/projects/413');

deleteNeeds = null;   // approved meanwhile: the same button now goes through
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.getByRole('button', { name: 'Yes, put it in the trash' }).click();
await page.waitForTimeout(600);
ok('once approved, the same button carries it out with no question', (await page.getByRole('dialog').count()) === 0 && (await page.evaluate(() => window.location.pathname)) === '/admin/projects');

await finish(c);
