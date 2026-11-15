// Browser check: the people on a piece of work (invite, role, withdraw, remove, transfer), invitations on the list, and the project roles grid in Configuration (build 1.5).
// The API is answered by the check itself; the rules (accepting, dates, the last lead, rescue, the Lead role's fixed ticks) are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null,
  access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.view_all', 'projects.members.view', 'projects.members.manage', 'projects.transfer', 'projects.config.view', 'projects.config.roles'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
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
const ROLES = [{ id: 1, name: 'Lead' }, { id: 2, name: 'Member' }, { id: 3, name: 'Finance' }, { id: 4, name: 'Reviewer' }];
let members = [
  { id: 1, user_id: 1, name: 'Kamau', role: { id: 1, key: 'lead', name: 'Lead' }, status: 'active', starts_at: null, ends_at: null, invited_by: null, invited_at: null, is_lead: true, on_it: true },
  { id: 2, user_id: 2, name: 'Njeri', role: { id: 2, key: 'member', name: 'Member' }, status: 'active', starts_at: null, ends_at: '2027-01-31 23:59:59', invited_by: 'Kamau', invited_at: null, is_lead: false, on_it: true },
  { id: 3, user_id: 3, name: 'Mwangi', role: { id: 3, key: 'finance', name: 'Finance' }, status: 'invited', starts_at: null, ends_at: null, invited_by: 'Kamau', invited_at: '2026-11-14 10:00:00', is_lead: false, on_it: false },
  { id: 4, user_id: 4, name: 'Odhiambo', role: { id: 2, key: 'member', name: 'Member' }, status: 'active', starts_at: null, ends_at: '2026-10-31 23:59:59', invited_by: 'Kamau', invited_at: null, is_lead: false, on_it: false }];
let can = { members: true, transfer: true };
const list = () => ({ members, roles: ROLES, candidates: can.members || can.transfer ? [{ id: 5, name: 'Amina' }, { id: 6, name: 'Wambui' }] : [], can });
let invitations = [{ project_id: 500, number: 'M-0500', title: 'Karura Lodge v. Mwangi', confidential: false, role: 'Member', invited_by: 'Njeri', invited_at: '2026-11-14 09:00:00' },
  { project_id: 501, number: 'M-0501', title: null, confidential: true, role: 'Reviewer', invited_by: 'Amina', invited_at: '2026-11-14 09:30:00' }];

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations }));
await page.route(/\/api\/admin\/projects\/\d+\/invitation$/, (route) => { const id = Number(route.request().url().match(/projects\/(\d+)/)[1]); sent.push(['answer', id, route.request().postDataJSON()]); invitations = invitations.filter((i) => i.project_id !== id); return json(route, { invitations }); });
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => json(route, { data: [], total: 0, page: 1, per_page: 25, counts: { open: 0, on_hold: 0, closed: 0, cancelled: 0 } }));
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => json(route, { project }));
await page.route(/\/api\/admin\/projects\/\d+\/phases$/, (route) => json(route, { phases: [], can: { phases: true, delete: true } }));
await page.route(/\/api\/admin\/projects\/\d+\/transfer$/, (route) => { const b = route.request().postDataJSON(); sent.push(['transfer', b]); if (b.user_id === 6) return json(route, { message: 'Choose someone who can open Projects.' }, 422);
  project = { ...project, lead: { id: 2, name: 'Njeri' } }; members = members.map((m) => ({ ...m, is_lead: m.user_id === 2, role: m.user_id === 2 ? { id: 1, key: 'lead', name: 'Lead' } : m.user_id === 1 ? { id: 2, key: 'member', name: 'Member' } : m.role })); return json(route, { project }); });
await page.route(/\/api\/admin\/projects\/\d+\/members(\/\d+)?$/, (route) => {
  const method = route.request().method(); const id = Number((route.request().url().match(/members\/(\d+)$/) || [])[1]);
  if (method === 'POST') { const b = route.request().postDataJSON(); sent.push(['invite', b]); members = [...members, { id: 9, user_id: b.user_id, name: 'Amina', role: { id: b.project_role_id, key: 'x', name: ROLES.find((r) => r.id === b.project_role_id).name }, status: 'invited', starts_at: b.starts_at, ends_at: b.ends_at, invited_by: 'Kamau', invited_at: null, is_lead: false, on_it: false }]; }
  if (method === 'PUT') { const b = route.request().postDataJSON(); sent.push(['change', id, b]); if (b.project_role_id === 4) return json(route, { message: 'That would leave nobody on it who can manage its people. Give someone else that role first.' }, 422); members = members.map((m) => (m.id === id ? { ...m, role: { id: b.project_role_id, key: 'x', name: ROLES.find((r) => r.id === b.project_role_id).name } } : m)); }
  if (method === 'DELETE') { sent.push(['remove', id]); members = members.filter((m) => m.id !== id); }
  return json(route, list(), method === 'POST' ? 201 : 200);
});

// ---------------------------------------------------------------- invitations on the list
await go('/admin/projects');
await page.getByRole('button', { name: 'Accept the invitation to M-0500' }).waitFor({ timeout: 15000 });
let text = await body();
ok('an invitation says who asked, to what and as what', /Njeri invited you to M-0500 · Karura Lodge v\. Mwangi as Member/.test(text.replace(/\s+/g, ' ')));
ok('an invitation to confidential work keeps its title back until accepted', /Amina invited you to M-0501 \(confidential: you see what it is once you accept\) as Reviewer/.test(text.replace(/\s+/g, ' ')) );
await page.getByRole('button', { name: 'Decline the invitation to M-0501' }).click();
await page.getByRole('button', { name: 'Decline the invitation to M-0501' }).waitFor({ state: 'detached', timeout: 5000 });
ok('declining sends no and the notice goes', JSON.stringify(last('answer')) === JSON.stringify(['answer', 501, { accept: false }]));
await page.getByRole('button', { name: 'Accept the invitation to M-0500' }).click();
await page.getByRole('heading', { name: /M-0413/ }).waitFor({ timeout: 10000 });
ok('accepting sends yes and opens the work', JSON.stringify(last('answer')) === JSON.stringify(['answer', 500, { accept: true }]));

// ---------------------------------------------------------------- the people on it
await page.getByRole('tab', { name: 'People' }).click();
await page.locator('[data-member="Njeri"]').waitFor({ timeout: 10000 });
text = await body();
ok('each person shows their role, whether they are on it, and the dates of their access', /On it/.test(await page.locator('[data-member="Njeri"]').innerText()) && /Now to 31 Jan 2027/.test(await page.locator('[data-member="Njeri"]').innerText()));
ok('someone invited says so and by whom; someone whose dates have passed says that', /Invited/.test(await page.locator('[data-member="Mwangi"]').innerText()) && /by Kamau/.test(await page.locator('[data-member="Mwangi"]').innerText()) && /Outside its dates/.test(await page.locator('[data-member="Odhiambo"]').innerText()));
ok('the lead is marked in the industry\'s word and cannot be removed or given another role here', /Responsible advocate/.test(await page.locator('[data-member="Kamau"]').innerText()) && (await page.getByRole('button', { name: 'Remove Kamau' }).count()) === 0 && (await page.getByLabel('Role of Kamau').count()) === 0);
await page.screenshot({ path: D + 'projects-people.png', fullPage: true });
await page.getByRole('button', { name: 'Invite', exact: true }).click();
await page.getByLabel('Person').selectOption({ label: 'Amina' });
await page.getByLabel('As', { exact: true }).selectOption({ label: 'Reviewer' });
await page.getByLabel('Until (optional)').fill('2027-03-31');
await page.getByRole('button', { name: 'Send invitation' }).click();
await page.locator('[data-member="Amina"]').waitFor({ timeout: 5000 });
ok('inviting sends the person, the role and the dates', JSON.stringify(last('invite')[1]) === JSON.stringify({ user_id: 5, project_role_id: 4, starts_at: null, ends_at: '2027-03-31' }), JSON.stringify(last('invite')[1]));
await page.getByLabel('Role of Njeri').selectOption({ label: 'Finance' });
await page.waitForTimeout(300);
ok('changing a role is sent at once', JSON.stringify(last('change')) === JSON.stringify(['change', 2, { project_role_id: 3 }]));
await page.getByLabel('Role of Njeri').selectOption({ label: 'Reviewer' });
await page.getByText('That would leave nobody on it who can manage its people').waitFor({ timeout: 5000 });
ok('a change the server refuses is said, and the role stays as it was', (await page.getByLabel('Role of Njeri').inputValue()) === '3');
await page.getByRole('button', { name: 'Withdraw the invitation to Mwangi' }).click();
ok('withdrawing asks first', /Withdraw the invitation to Mwangi\?/.test((await body()).replace(/\s+/g, ' ')) && !last('remove'));
await page.getByRole('button', { name: 'Yes', exact: true }).click();
await page.locator('[data-member="Mwangi"]').waitFor({ state: 'detached', timeout: 5000 });
ok('and then sends it', JSON.stringify(last('remove')) === JSON.stringify(['remove', 3]));
await page.getByRole('button', { name: 'Remove Odhiambo' }).click();
ok('removing someone says what it means', /They will no longer be able to open it/.test(await body()));
await page.getByRole('button', { name: 'No', exact: true }).click();
ok('saying no leaves them on it', (await page.locator('[data-member="Odhiambo"]').count()) === 1 && last('remove')[1] === 3);

await page.getByRole('button', { name: 'Transfer' }).click();
ok('transfer offers the people on it and everyone who could be, and says what happens', (await page.getByLabel('New responsible advocate').locator('option').allInnerTexts()).join() === 'Choose…,Njeri,Odhiambo,Amina,Wambui' && /They lead it at once/.test(await body()));
await page.getByLabel('New responsible advocate').selectOption({ label: 'Wambui' });
await page.getByRole('button', { name: 'Hand it over' }).click();
await page.getByText('Choose someone who can open Projects.').waitFor({ timeout: 5000 });
ok('a transfer the server refuses is said and nothing changes', /Kamau/.test(await page.locator('[data-member="Kamau"]').innerText()) && /Responsible advocate/.test(await page.locator('[data-member="Kamau"]').innerText()));
await page.getByLabel('New responsible advocate').selectOption({ label: 'Njeri' });
await page.getByLabel('Hand-over note').fill('On leave from Monday');
await page.getByRole('button', { name: 'Hand it over' }).click();
await page.waitForTimeout(600);
ok('a transfer sends the new lead and the note, and the page shows the new lead', JSON.stringify(last('transfer')[1]) === JSON.stringify({ user_id: 2, note: 'On leave from Monday' }) && /Responsible advocate/.test(await page.locator('[data-member="Njeri"]').innerText()) && !/Responsible advocate/.test(await page.locator('[data-member="Kamau"]').innerText()));

can = { members: false, transfer: false };
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'People' }).click();
await page.locator('[data-member="Njeri"]').waitFor({ timeout: 10000 });
ok('someone who may only look sees the list and nothing to press', (await page.getByRole('button', { name: /Invite|Transfer|Remove|Withdraw/ }).count()) === 0 && (await page.getByRole('combobox').count()) === 0);
project = { ...project, can: { ...CAN, members_view: false } };
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Phases' }).waitFor({ timeout: 10000 });
ok('without the permission to see who is on it there is no People tab at all', (await page.getByRole('tab', { name: 'People' }).count()) === 0);

// ---------------------------------------------------------------- project roles in Configuration
const ABILITIES = { open: 'Open it', edit: 'Change its details, freeze it, make it confidential', stage: 'Move its stage, hold, close and cancel it', phases: 'Add and change its phases', members: 'Invite and remove people', links: 'Add and remove links', log: 'Read its activity log', open_shared: 'See only what is shared with them (for clients and guests)' };
let roles = [{ id: 1, key: 'lead', name: 'Lead', description: null, is_system: true, is_active: true, abilities: ['open', 'edit', 'stage', 'phases', 'members', 'links', 'log'], people: 12 },
  { id: 2, key: 'member', name: 'Member', description: null, is_system: true, is_active: true, abilities: ['open', 'phases', 'links'], people: 30 },
  { id: 6, key: 'guest', name: 'Guest', description: null, is_system: true, is_active: false, abilities: ['open_shared'], people: 0 }];
let canRoles = true;
await page.route('**/api/admin/projects/configuration**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/.*\/configuration/, ''); const method = route.request().method();
  if (path === '') return json(route, { ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, version: 1, industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], viewing: 'legal', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: canRoles } });
  if (path === '/roles' && method === 'GET') return json(route, { roles, abilities: ABILITIES });
  if (path === '/roles' && method === 'POST') { const b = route.request().postDataJSON(); sent.push(['role.add', b]); roles = [...roles, { id: 7, key: 'site_agent', name: b.name, description: null, is_system: false, is_active: true, abilities: b.abilities, people: 0 }]; return json(route, { roles, abilities: ABILITIES }, 201); }
  const id = Number(path.split('/')[2]); const b = route.request().postDataJSON(); sent.push(['role.change', id, b]);
  if (id === 2 && b.is_active === false) return json(route, { message: 'People hold this role. Give them another role before switching it off.' }, 422);
  roles = roles.map((r) => (r.id === id ? { ...r, ...b } : r)); return json(route, { roles, abilities: ABILITIES });
});
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Project roles' }).click();
await page.getByLabel('Member: Open it').waitFor({ timeout: 10000 });
ok('the grid shows each role against what it allows, and how many people hold it', await page.getByLabel('Member: Add and change its phases').isChecked() && !(await page.getByLabel('Member: Invite and remove people').isChecked()) && /30/.test(await body()));
ok('the Lead role\'s three fixed ticks cannot be taken off, and it has no off switch', await page.getByLabel('Lead: Open it').isDisabled() && await page.getByLabel('Lead: Invite and remove people').isDisabled() && !(await page.getByLabel('Lead: Read its activity log').isDisabled()) && (await page.getByRole('button', { name: 'Switch off Lead' }).count()) === 0);
await page.screenshot({ path: D + 'projects-roles.png', fullPage: true });
await page.getByLabel('Member: Read its activity log').click();   // (the tick shows once the server has answered)
await page.waitForTimeout(300);
ok('a tick is saved the moment it changes, with the whole list for that role', JSON.stringify(last('role.change')) === JSON.stringify(['role.change', 2, { abilities: ['open', 'phases', 'links', 'log'] }]), JSON.stringify(last('role.change')));
await page.getByRole('button', { name: 'Switch off Member' }).click();
await page.getByText('People hold this role').waitFor({ timeout: 5000 });
ok('a role people hold cannot be switched off under them', true);
await page.getByRole('button', { name: 'Switch on Guest' }).click();
await page.waitForTimeout(300);
ok('a role that is off can be switched on', JSON.stringify(last('role.change')) === JSON.stringify(['role.change', 6, { is_active: true }]));
await page.getByRole('button', { name: 'New role' }).click();
await page.getByLabel('Name of the role').fill('Site agent');
await page.getByRole('button', { name: 'Add role' }).click();
await page.getByLabel('Site agent: Open it').waitFor({ timeout: 5000 });
ok('a new role starts with opening the work only, ready for its ticks', JSON.stringify(last('role.add')[1]) === JSON.stringify({ name: 'Site agent', abilities: ['open'] }) && await page.getByLabel('Site agent: Open it').isChecked());
canRoles = false;
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Project roles' }).click();
await page.getByLabel('Member: Open it').waitFor({ timeout: 10000 });
ok('someone who may not change roles sees the grid with nothing to press', await page.getByLabel('Member: Open it').isDisabled() && (await page.getByRole('button', { name: /New role|Switch o/ }).count()) === 0);

await finish();
