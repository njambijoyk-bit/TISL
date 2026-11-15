// Browser check: the activity log (on a piece of work and for the whole module), the trash (restore, delete for good), and deleting a piece of work (build 1.6).
// The API is answered by the check itself; the rules (who sees which lines, what the books protect, the keeping period) are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
let permissions = ['admin.access', 'projects.use', 'projects.edit', 'projects.delete', 'projects.purge', 'projects.log.view'];
const me = () => ({ user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions } });
const signIn = async () => { await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me()); };
await signIn();
await page.route('**/api/me', (route) => json(route, me()));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const body = () => page.locator('#root').innerText();

const W = { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], phase: ['Phase', 'Phases'], closing_period: ['Appeal period', 'Appeal periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const CAN = { open: true, edit: true, stage: true, close: true, freeze: true, confidential: true, phases: true, members: true, members_view: true, links: true, log: true };
let project = { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }, { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [] }], cost_centre_path: 'Projects › M-0413', words, can: CAN };
const LINES = [
  { id: 5, at: '2026-11-14 21:16:00', actor: 'Odhiambo', action: 'project.edit', what: 'Project edit', project_id: 413, project_number: 'M-0413', result: 'refused', reason: 'Not on it', old: null, new: null },
  { id: 4, at: '2026-11-14 10:31:00', actor: 'Njeri', action: 'project.changed', what: 'Project changed', project_id: 413, project_number: 'M-0413', result: 'done', reason: null, old: { authority: 'Milimani', customer_id: null }, new: { authority: 'Milimani Commercial', customer_id: 7 } },
  { id: 3, at: '2026-11-14 10:05:00', actor: 'Kamau', action: 'phase.added', what: 'Phase added', project_id: 413, project_number: 'M-0413', result: 'done', reason: null, old: null, new: { name: 'Pre-trial', own_cost_centre: true } },
  { id: 2, at: '2026-11-14 10:02:00', actor: 'Kamau', action: 'project.created', what: 'Project created', project_id: 413, project_number: 'M-0413', result: 'done', reason: null, old: null, new: { number: 'M-0413' } },
  { id: 1, at: '2026-11-14 09:00:00', actor: 'The system', action: 'settings.saved', what: 'Settings saved', project_id: null, project_number: null, result: 'done', reason: null, old: { trash_days: 30 }, new: { trash_days: 45 } }];
const logPage = (route, rows) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['log', q]);
  let data = rows.filter((r) => (!q.result || r.result === q.result) && (!q.q || JSON.stringify(r).toLowerCase().includes(q.q.toLowerCase())));
  return json(route, { data, total: q.q === 'many' ? 120 : data.length, page: Number(q.page || 1), per_page: 50 }); };
let items = [
  { type: 'project', id: 402, label: 'M-0402 Old lease draft', within: null, deleted_at: '2026-11-03 09:00:00', deleted_by: 'Njeri', days_left: 19, in_the_books: false },
  { type: 'phase', id: 77, label: '3 Enforcement', within: 'M-0390 Safiri debt recovery', deleted_at: '2026-11-12 09:00:00', deleted_by: 'Kamau', days_left: 2, in_the_books: false },
  { type: 'project', id: 380, label: 'M-0380 Billed work', within: null, deleted_at: '2026-10-01 09:00:00', deleted_by: null, days_left: 0, in_the_books: true }];
let canPurge = true;

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => json(route, { data: [], total: 0, page: 1, per_page: 25, counts: { open: 0, on_hold: 0, closed: 0, cancelled: 0 } }));
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => { if (route.request().method() === 'DELETE') { sent.push(['delete', Number(route.request().url().match(/(\d+)$/)[1])]); return json(route, { message: 'In the trash.' }); } return json(route, { project }); });
await page.route(/\/api\/admin\/projects\/\d+\/log(\?.*)?$/, (route) => logPage(route, LINES.filter((l) => l.project_id === 413)));
await page.route(/\/api\/admin\/projects\/log(\?.*)?$/, (route) => logPage(route, LINES));
await page.route('**/api/admin/projects/trash', (route) => json(route, { items, days: 30, can: { purge: canPurge } }));
await page.route('**/api/admin/projects/trash/*', (route) => { const b = route.request().postDataJSON(); const what = route.request().url().endsWith('restore') ? 'restore' : 'purge'; sent.push([what, b]);
  if (what === 'purge' && b.id === 77) return json(route, { message: 'The books hold vouchers for this. It cannot be deleted for good: restore it and mark it done instead.' }, 422);
  items = items.filter((i) => !(i.type === b.type && i.id === b.id)); return json(route, { items, days: 30, can: { purge: canPurge } }); });

// ---------------------------------------------------------------- the log of one piece of work
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Activity' }).click();
await page.locator('[data-log="project.created"]').waitFor({ timeout: 15000 });
let text = (await body()).replace(/\s+/g, ' ');
ok('the log names things in the industry\'s words', /Matter created/.test(text) && /Matter changed/.test(text) && !/Project created/.test(text));
ok('a change shows the old value struck through and the new one', /Authority: Milimani → Milimani Commercial/.test(text) && /Customer: nothing → 7/.test(text) && (await page.locator('[data-log="project.changed"] s').first().innerText()) === 'Milimani');
ok('a refusal is marked, with who was refused and why', /Refused/.test(await page.locator('[data-log="project.edit"]').innerText()) && /Not on it/.test(await page.locator('[data-log="project.edit"]').innerText()) && /Odhiambo/.test(await page.locator('[data-log="project.edit"]').innerText()));
ok('there is nothing to press on a line: the log only reads', (await page.locator('[data-log] button').count()) === 0);
await page.screenshot({ path: D + 'projects-activity.png', fullPage: true });
await page.getByLabel('Show').selectOption('refused');
await page.locator('[data-log="project.created"]').waitFor({ state: 'detached', timeout: 5000 });
ok('it can show only what was refused', last('log')[1].result === 'refused' && (await page.locator('[data-log]').count()) === 1);
await page.getByLabel('Show').selectOption('');
await page.getByLabel('Search the log').fill('njeri');
await page.waitForTimeout(600);
ok('and be searched by person', last('log')[1].q === 'njeri' && (await page.locator('[data-log]').count()) === 1);

// ---------------------------------------------------------------- the log of the whole module
await go('/admin/projects/log');
await page.getByRole('heading', { name: 'Matters activity log' }).waitFor({ timeout: 15000 });
await page.locator('[data-log="settings.saved"]').waitFor({ timeout: 10000 });
ok('the module log says which piece of work each line is about, and shows lines about none', (await page.locator('[data-log="project.created"]').getByRole('link', { name: 'M-0413' }).count()) === 1 && /Trash days: 30 → 45/.test((await body()).replace(/\s+/g, ' ')) && /The system/.test(await page.locator('[data-log="settings.saved"]').innerText()));
await page.getByLabel('Search the log').fill('many');
await page.getByRole('button', { name: 'Next' }).waitFor({ timeout: 5000 });
ok('a long log pages', /Page 1 of 3 · 120 lines/.test(await body()));

// ---------------------------------------------------------------- deleting a piece of work
await go('/admin/projects/413');
await page.getByRole('button', { name: 'Delete', exact: true }).click();
ok('deleting asks first and says it can be undone', /Put it in the trash\? It can be taken back out/.test(await body()) && !last('delete'));
await page.getByRole('button', { name: 'Yes, put it in the trash' }).click();
await page.getByRole('heading', { name: 'Matters', exact: true }).waitFor({ timeout: 10000 });
ok('saying yes sends it and returns to the list', JSON.stringify(last('delete')) === JSON.stringify(['delete', 413]));

// ---------------------------------------------------------------- the trash
ok('the list offers the trash and the activity log to someone who may use them', (await page.getByRole('button', { name: 'Trash', exact: true }).count()) === 1 && (await page.getByRole('button', { name: 'Activity log' }).count()) === 1);
await page.getByRole('button', { name: 'Trash', exact: true }).click();
await page.locator('[data-trash="M-0402 Old lease draft"]').waitFor({ timeout: 10000 });
text = (await body()).replace(/\s+/g, ' ');
ok('the trash says how long things are kept, who deleted each and how long each has left', /Kept for 30 days, then removed/.test(text) && /Njeri/.test(await page.locator('[data-trash="M-0402 Old lease draft"]').innerText()) && /19 days/.test(await page.locator('[data-trash="M-0402 Old lease draft"]').innerText()) && /2 days/.test(await page.locator('[data-trash="3 Enforcement"]').innerText()));
ok('a phase says which piece of work it belongs to, in the industry\'s words', /Phase/.test(await page.locator('[data-trash="3 Enforcement"]').innerText()) && /of M-0390 Safiri debt recovery/.test(await page.locator('[data-trash="3 Enforcement"]').innerText()) && /Matter/.test(await page.locator('[data-trash="M-0402 Old lease draft"]').innerText()));
ok('what the books hold vouchers for stays until restored and is never offered for deleting for good', /Until restored/.test(await page.locator('[data-trash="M-0380 Billed work"]').innerText()) && /can never be deleted for good/.test(await page.locator('[data-trash="M-0380 Billed work"]').innerText())
  && (await page.getByRole('button', { name: 'Delete M-0380 Billed work for good' }).count()) === 0 && (await page.getByRole('button', { name: 'Restore M-0380 Billed work' }).count()) === 1);
await page.screenshot({ path: D + 'projects-trash.png', fullPage: true });
await page.getByRole('button', { name: 'Restore M-0402 Old lease draft' }).click();
await page.locator('[data-trash="M-0402 Old lease draft"]').waitFor({ state: 'detached', timeout: 5000 });
ok('restoring sends what it is and which', JSON.stringify(last('restore')[1]) === JSON.stringify({ type: 'project', id: 402 }));
await page.getByRole('button', { name: 'Delete 3 Enforcement for good' }).click();
ok('deleting for good asks first and says it cannot be undone', /This cannot be undone/.test(await body()) && !last('purge'));
await page.getByRole('button', { name: 'Keep it', exact: true }).click();
ok('saying no keeps it', !last('purge') && (await page.locator('[data-trash="3 Enforcement"]').count()) === 1);
await page.getByRole('button', { name: 'Delete 3 Enforcement for good' }).click();
await page.getByRole('button', { name: 'Yes, delete it for good' }).click();
await page.getByText('The books hold vouchers for this').waitFor({ timeout: 5000 });
ok('a refusal from the server is said and the item stays', JSON.stringify(last('purge')[1]) === JSON.stringify({ type: 'phase', id: 77 }) && (await page.locator('[data-trash="3 Enforcement"]').count()) === 1);
canPurge = false;
await go('/admin/projects/trash');
await page.locator('[data-trash="3 Enforcement"]').waitFor({ timeout: 10000 });
ok('without the permission nothing can be deleted for good, only restored', (await page.getByRole('button', { name: /for good/ }).count()) === 0 && (await page.getByRole('button', { name: /^Restore / }).count()) === 2);
items = [];
await go('/admin/projects/trash');
await page.getByText('The trash is empty.').waitFor({ timeout: 10000 });
ok('an empty trash says so', true);

// ---------------------------------------------------------------- without the permissions
permissions = ['admin.access', 'projects.use', 'projects.edit'];
await signIn();
project = { ...project, can: { ...CAN, log: false } };
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Phases' }).waitFor({ timeout: 15000 });
ok('without them there is no Activity tab and no Delete', (await page.getByRole('tab', { name: 'Activity' }).count()) === 0 && (await page.getByRole('button', { name: 'Delete', exact: true }).count()) === 0);
await go('/admin/projects');
await page.getByRole('heading', { name: 'Matters', exact: true }).waitFor({ timeout: 15000 });
ok('and the list offers neither the trash nor the log', (await page.getByRole('button', { name: /Trash|Activity log/ }).count()) === 0);

await finish();
