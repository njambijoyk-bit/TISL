// Browser check: the shortcut keys of Projects (build 1.9): G then a letter to move about, Shift and a letter on an open piece of work, the keys in the key list (Shift+A),
// and the keys as settings (the company's, and each person's own). The API is answered by the check itself; the rules for a set of keys are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
let permissions = ['admin.access', 'projects.use', 'projects.create', 'projects.edit', 'projects.stage', 'projects.delete', 'projects.log.view', 'projects.config.view', 'projects.shortcuts'];
const me = () => ({ user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions } });
const signIn = () => page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me());
await signIn();
await page.route('**/api/me', (route) => json(route, me()));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const at = () => page.evaluate(() => window.location.pathname);
const press = async (...keys) => { for (const k of keys) await page.keyboard.press(k); await page.waitForTimeout(250); };

const KEYS = { go_list: ['go', 'The list', 'P'], go_new: ['go', 'Start a new one', 'N'], go_log: ['go', 'The activity log', 'L'], go_trash: ['go', 'The trash', 'T'], go_config: ['go', 'Configuration', 'C'],
  act_edit: ['on', 'Edit it', 'E'], act_hold: ['on', 'Put it on hold, or resume it', 'H'], act_next: ['on', 'Move it to the next stage', 'F'], act_delete: ['on', 'Delete it', 'D'],
  tab_overview: ['on', 'Overview', 'O'], tab_phases: ['on', 'Phases', 'P'], tab_people: ['on', 'People', 'I'], tab_links: ['on', 'Links', 'K'], tab_activity: ['on', 'Activity', 'Y'] };
const defaults = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, v[2]]));
let company = { ...defaults };
let mine = {};
let canCompany = true;
const inUse = () => ({ ...company, ...mine });
const shortcuts = () => ({ keys: Object.fromEntries(Object.entries(KEYS).map(([k, [group, what, d]]) => [k, { group, what, default: d }])), company, mine, in_use: inUse(), taken_with_shift: ['A', 'U', 'M', 'N', 'R', 'T', 'V'], can: { company: canCompany } });

const W = { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], phase: ['Phase', 'Phases'], closing_period: ['Appeal period', 'Appeal periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const STAGES = [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }, { id: 2, name: 'Pleadings', state: 'open', status: 'info', required_fields: [] }, { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [] }];
const CAN = { open: true, edit: true, stage: true, close: true, freeze: false, confidential: false, phases: true, members: true, members_view: true, links: true, log: true };
let current = { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: '', industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'high',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'P. Kamau' }, branch: { id: 1, name: 'Nairobi' }, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: '2026-11-14', due_date: null, closing_period_ends: null, closed_at: null,
  confidential: false, frozen: false, created_at: '2026-11-14 10:02:00', stages: STAGES, cost_centre_path: 'Nairobi › Projects › M-0413', words, can: CAN, fields: [] };

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words, keys: inUse() }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route('**/api/admin/projects/options**', (route) => json(route, { default_industry: 'legal', industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], types: [{ id: 1, industry: 'legal', name: 'Litigation', prefix: 'M' }], branches: [], leads: [], priorities: ['low', 'medium', 'high', 'urgent'], words: { legal: words }, cost_centres: true, customers: [], can: { create: true, confidential: false } }));
await page.route('**/api/admin/projects/shortcuts', (route) => json(route, shortcuts()));
await page.route('**/api/admin/projects/my/shortcuts', (route) => { const b = route.request().postDataJSON(); sent.push(['mine', b]); mine = b.keys ? Object.fromEntries(Object.entries(b.keys).filter(([k, v]) => company[k] !== v)) : {}; return json(route, shortcuts()); });
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, '');
  if (path === '/shortcuts') { const b = route.request().postDataJSON(); sent.push(['company', b]); if (b.keys.act_edit === 'A') return json(route, { message: 'Shift with A already does something everywhere in TISL. Choose another letter for "Edit it".' }, 422); company = b.keys; return json(route, shortcuts()); }
  if (path === '') return json(route, { ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, version: 1, industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], viewing: 'legal', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } });
  return json(route, {});
});
await page.route(/\/api\/admin\/projects\/(log|trash)(\?.*)?$/, (route) => json(route, { data: [], total: 0, page: 1, per_page: 25, items: [], days: 30, actions: [], can: { purge: false } }));
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => json(route, { data: [current], total: 1, page: 1, per_page: 25, counts: { open: 1, on_hold: 0, closed: 0, cancelled: 0 } }));
await page.route(/\/api\/admin\/projects\/413(\/[\w/]+)?(\?.*)?$/, (route) => {
  const sub = (route.request().url().match(/413\/([\w/]+)/) || [])[1]; const method = route.request().method(); const b = method === 'GET' || method === 'DELETE' ? null : route.request().postDataJSON();
  if (!sub && method === 'DELETE') { sent.push(['delete']); return json(route, { message: 'In the trash.' }); }
  if (!sub) return json(route, { project: current });
  if (sub === 'state') { sent.push(['state', b]); current = { ...current, state: { hold: 'on_hold', resume: 'open' }[b.action] }; return json(route, { project: current }); }
  if (sub === 'stage') { sent.push(['stage', b]); const s = STAGES.find((x) => x.id === b.stage_id); current = { ...current, stage: { id: s.id, name: s.name, status: s.status }, state: s.state }; return json(route, { project: current }); }
  return json(route, { phases: [], members: [], roles: [], candidates: [], groups: [], hidden: 0, off: [], data: [], total: 0, page: 1, per_page: 25, actions: [], can: {} });
});

// ---------------------------------------------------------------- moving about: G, then a letter
await go('/admin/projects');
await page.getByRole('link', { name: 'Imara Sacco v. Baraka Traders' }).waitFor({ timeout: 15000 });
await press('g', 'n');
ok('G then N starts a new one', (await at()) === '/admin/projects/new', await at());
await press('g', 'l');
ok('on the new form the cursor is in a field, so the keys stay quiet', (await at()) === '/admin/projects/new');
await page.evaluate(() => document.activeElement.blur());
await press('g', 'l');
ok('G then L opens the activity log', (await at()) === '/admin/projects/log', await at());
await press('g', 't');
ok('G then T opens the trash', (await at()) === '/admin/projects/trash', await at());
await press('g', 'c');
ok('G then C opens Configuration', (await at()) === '/admin/projects/configuration', await at());
await press('g', 'p');
ok('G then P goes back to the list', (await at()) === '/admin/projects', await at());
await press('n');
ok('a letter without G first does nothing', (await at()) === '/admin/projects');

// ---------------------------------------------------------------- the key list (Shift+A)
await press('Shift+A');
let sheet = (await page.locator('[data-shortcut-list]').innerText()).replace(/\s+/g, ' ');
ok('the key list shows the Projects keys in the company\'s words', /Go to Matters, start a new one \(press G, then N\)/.test(sheet) && /Go to Matters, the trash/.test(sheet), sheet.slice(0, 300));
ok('away from an open piece of work it does not list the keys that need one', !/Edit it/.test(sheet));
await page.screenshot({ path: D + 'projects-keys-list.png' });
await press('Escape');

// ---------------------------------------------------------------- on an open piece of work: Shift and a letter
await go('/admin/projects/413');
await page.getByRole('heading', { name: 'Imara Sacco v. Baraka Traders' }).waitFor({ timeout: 15000 });
await press('Shift+I');
ok('Shift+I opens People', (await page.getByRole('tab', { name: 'People' }).getAttribute('aria-selected')) === 'true');
await press('Shift+K');
ok('Shift+K opens Links', (await page.getByRole('tab', { name: 'Links' }).getAttribute('aria-selected')) === 'true');
await press('Shift+Y');
ok('Shift+Y opens Activity', (await page.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected')) === 'true');
await press('Shift+P');
ok('Shift+P opens the phases', (await page.getByRole('tab', { name: 'Phases' }).getAttribute('aria-selected')) === 'true');
await press('Shift+O');
ok('Shift+O goes back to the Overview', (await page.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')) === 'true');
await press('Shift+H');
ok('Shift+H puts it on hold', JSON.stringify(last('state')) === JSON.stringify(['state', { action: 'hold' }]));
await press('Shift+H');
ok('and the same key resumes it', JSON.stringify(last('state')) === JSON.stringify(['state', { action: 'resume' }]));
await press('Shift+F');
ok('Shift+F moves it to the next stage', JSON.stringify(last('stage')) === JSON.stringify(['stage', { stage_id: 2 }]), JSON.stringify(last('stage')));
await press('Shift+D');
ok('Shift+D asks before deleting, and deletes nothing by itself', /Put it in the trash\?/.test(await page.locator('#root').innerText()) && !last('delete'));
await press('Shift+A');
sheet = (await page.locator('[data-shortcut-list]').innerText()).replace(/\s+/g, ' ');
ok('on an open piece of work the key list adds its keys', /Edit it/.test(sheet) && /Move it to the next stage/.test(sheet) && /Open its Links/.test(sheet));
await press('Escape');
await press('Shift+E');
ok('Shift+E opens it for editing', (await at()) === '/admin/projects/413/edit', await at());

// a key presses what is on the screen: someone who may not delete has no button, so the key does nothing; and G leads only where they may go
permissions = ['admin.access', 'projects.use'];
current = { ...current, can: { ...CAN, edit: false, stage: false, close: false, members_view: false, log: false } };
await signIn();
await go('/admin/projects/413');
await page.getByRole('heading', { name: 'Imara Sacco v. Baraka Traders' }).waitFor({ timeout: 15000 });
const before = sent.length;
await press('Shift+H'); await press('Shift+F'); await press('Shift+D'); await press('Shift+E');
ok('a key does nothing the person could not do with the mouse', sent.length === before && (await at()) === '/admin/projects/413' && !/Put it in the trash\?/.test(await page.locator('#root').innerText()));
await press('g', 't');
ok('G does not lead to a part the person may not open', (await at()) === '/admin/projects/413');
await press('g', 'p');
ok('but still leads where they may go', (await at()) === '/admin/projects');
await press('Shift+A');
sheet = (await page.locator('[data-shortcut-list]').innerText()).replace(/\s+/g, ' ');
ok('and the key list shows them only those', /Go to Matters, the list/.test(sheet) && !/the trash/.test(sheet) && !/Configuration \(press/.test(sheet));
await press('Escape');

// ---------------------------------------------------------------- the keys as settings
permissions = ['admin.access', 'projects.use', 'projects.create', 'projects.edit', 'projects.delete', 'projects.log.view', 'projects.config.view', 'projects.shortcuts'];
current = { ...current, can: CAN };
await signIn();
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Shortcuts' }).click();
await page.locator('#my-key-go_new').waitFor({ timeout: 15000 });
ok('the tab shows my keys and the company\'s, each letter in a box', (await page.locator('#my-key-go_new').inputValue()) === 'N' && (await page.locator('#company-key-act_edit').inputValue()) === 'E');
ok('and says which letters Shift already uses everywhere', /Shift with A, U, M, N, R, T, V already does something everywhere/.test(await page.locator('#root').innerText()));
await page.screenshot({ path: D + 'projects-keys-settings.png', fullPage: true });

await page.locator('#company-key-act_edit').fill('a');
await page.getByRole('button', { name: 'Save the company\'s keys' }).click();
await page.waitForTimeout(300);
ok('a letter that cannot be used is refused in plain words, next to the keys', /Shift with A already does something everywhere in TISL/.test(await page.locator('#root').innerText()));
await page.locator('#company-key-act_edit').fill('w');
await page.getByRole('button', { name: 'Save the company\'s keys' }).click();
await page.waitForTimeout(300);
ok('the company\'s keys are sent whole, in capitals', last('company')[1].keys.act_edit === 'W' && Object.keys(last('company')[1].keys).length === 14);
ok('and my keys follow the company\'s where I have none of my own', (await page.locator('#my-key-act_edit').inputValue()) === 'W');

await page.locator('#my-key-go_new').fill('s');
await page.getByRole('button', { name: 'Save my keys' }).click();
await page.waitForTimeout(400);
ok('my own keys are saved for me alone', last('mine')[1].keys.go_new === 'S' && /You have keys of your own/.test(await page.locator('#root').innerText()) && (await page.locator('#company-key-go_new').inputValue()) === 'N');
await page.evaluate(() => document.activeElement.blur());
await press('g', 's');
ok('and work at once, with no reload', (await at()) === '/admin/projects/new', await at());
await page.evaluate(() => document.activeElement.blur());
await press('g', 'c');
await page.getByRole('tab', { name: 'Shortcuts' }).click();
await page.getByRole('button', { name: 'Use the company\'s keys' }).click();
await page.waitForTimeout(400);
ok('I can go back to the company\'s keys', last('mine')[1].keys === null && (await page.locator('#my-key-go_new').inputValue()) === 'N' && (await page.getByRole('button', { name: 'Use the company\'s keys' }).count()) === 0);

canCompany = false;
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Shortcuts' }).click();
await page.locator('#my-key-go_new').waitFor({ timeout: 15000 });
ok('someone who may not change the company\'s keys sees them but cannot change them, and still has their own', (await page.locator('#company-key-go_new').isDisabled()) && (await page.getByRole('button', { name: 'Save the company\'s keys' }).count()) === 0 && (await page.locator('#my-key-go_new').isEnabled()));

await finish(c);
