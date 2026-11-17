// Browser check: contacts and other parties (build 3.3): contacts on a lead (adding, roles, the main contact, removing), and the Parties tab of a
// piece of work (the client's contacts on it, adding a party new or already known, the both-sides warning, taking one off).
// The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.leads.manage', 'projects.parties', 'projects.clients.view', 'projects.clients.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

const W = { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], phase: ['Phase', 'Phases'], closing_period: ['Appeal period', 'Appeal periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const ROLES = [{ key: 'decision_maker', name: 'Decision maker' }, { key: 'billing', name: 'Billing' }, { key: 'day_to_day', name: 'Day to day' }];
let contacts = [{ id: 1, name: 'Grace Wambua', job_title: 'Head teacher', email: 'head@tumaini.test', phone: '0711000111', is_main: true, notes: null, roles: [{ key: 'decision_maker', name: 'Decision maker' }] }];
const contactsAnswer = () => ({ contacts, roles: ROLES, can: { change: true } });
const lead = { id: 1, name: 'Tumaini Academy', contact_name: 'Grace Wambua', email: null, phone: null, industry: null, source: null, referred_by: null, owner: { id: 1, name: 'Kamau' }, status: 'working', lost: null, customer_id: null, created_at: '2026-11-14 09:00:00', next: null, notes: null, can: { change: true } };
const CAN = { open: true, edit: true, stage: true, close: true, freeze: false, confidential: true, phases: true, members: true, members_view: true, links: true, log: true, access: true, parties: true };
const project = { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }, { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [] }], cost_centre_path: 'Projects › M-0413', words, can: CAN, locks: {}, fields: [] };
let parties = [{ id: 1, party_id: 7, name: 'Baraka Traders Ltd', kind: 'organisation', email: null, phone: '+254712345678', role: 'Opposing party', note: 'Served 3 Nov', contact: { id: 9, name: 'J. Baraka', phone: '0722000222' }, also: ['A lead, owned by Njeri'] }];
let clientContacts = [];
const available = [{ id: 21, name: 'A. Otieno' }, { id: 22, name: 'M. Chebet' }];
const partiesAnswer = () => ({ ready: true, parties, client_contacts: clientContacts, roles: [{ id: 30, name: 'Opposing party' }, { id: 31, name: 'Opposing counsel' }, { id: 32, name: 'Court or tribunal' }, { id: 33, name: 'Consultant' }], available_contacts: available.filter((a) => !clientContacts.some((x) => x.contact_id === a.id)), can: { change: true } });

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words, keys: {} }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route('**/api/admin/projects/known**', (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); return json(route, { known: /mwangi/i.test(q.name || '') ? [{ type: 'party', id: 8, name: 'Mwangi and Co. Advocates', detail: 'Another party on M-0371', url: null }] : [] }); });
await page.route(/\/api\/admin\/projects\/leads\/1$/, (route) => json(route, { lead }));
await page.route(/\/api\/admin\/projects\/pipeline\/of\/lead\/1$/, (route) => json(route, { opportunities: [] }));
await page.route(/\/api\/admin\/projects\/contacts\/(lead\/1|\d+)$/, (route) => {
  const method = route.request().method(); const id = Number((route.request().url().match(/contacts\/(\d+)$/) || [])[1]); const b = method === 'GET' || method === 'DELETE' ? null : route.request().postDataJSON();
  if (method === 'POST') { sent.push(['add contact', b]); if (contacts.length === 0 || b.is_main) contacts = contacts.map((x) => ({ ...x, is_main: false })); contacts = [...contacts, { id: 2, name: b.name, job_title: b.job_title || null, email: b.email || null, phone: b.phone || null, is_main: !!b.is_main, notes: null, roles: ROLES.filter((r) => b.roles.includes(r.key)) }]; }
  if (method === 'PUT') { sent.push(['change contact', id, b]); contacts = contacts.map((x) => (b.is_main ? { ...x, is_main: x.id === id } : x)).map((x) => (x.id === id ? { ...x, name: b.name, job_title: b.job_title, roles: ROLES.filter((r) => b.roles.includes(r.key)) } : x)); }
  if (method === 'DELETE') { sent.push(['remove contact', id]); const gone = contacts.find((x) => x.id === id); contacts = contacts.filter((x) => x.id !== id); if (gone.is_main && contacts[0]) contacts[0] = { ...contacts[0], is_main: true }; }
  return json(route, contactsAnswer(), method === 'POST' ? 201 : 200);
});
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => json(route, { project }));
await page.route('**/api/admin/projects/parties?**', (route) => json(route, { parties: [{ id: 7, name: 'Baraka Traders Ltd', detail: '+254712345678' }, { id: 8, name: 'Mwangi and Co. Advocates', detail: null }] }));
await page.route(/\/api\/admin\/projects\/413\/(parties|party-contacts)(\/\d+)?$/, (route) => {
  const [, what, linkPart] = route.request().url().match(/413\/(parties|party-contacts)(?:\/(\d+))?$/); const method = route.request().method(); const b = method === 'POST' ? route.request().postDataJSON() : null;
  if (method === 'POST' && what === 'parties') { sent.push(['add party', b]); if (b.role_id === 32 && b.party_id === 7) return json(route, { message: 'They are already on this in that role.' }, 422);
    const role = partiesAnswer().roles.find((r) => r.id === b.role_id).name; parties = [...parties, { id: 2, party_id: b.party_id || 99, name: b.party_id ? 'Mwangi and Co. Advocates' : b.name, kind: b.kind || 'organisation', email: b.email || null, phone: b.phone || null, role, note: b.note || null, contact: null, also: [] }]; }
  if (method === 'POST' && what === 'party-contacts') { sent.push(['add client contact', b]); clientContacts = [...clientContacts, { id: 5, contact_id: b.contact_id, name: available.find((a) => a.id === b.contact_id).name, job_title: 'CEO', phone: '0733000333', email: null, note: b.note || null }]; }
  if (method === 'DELETE') { sent.push([`remove ${what}`, Number(linkPart)]); if (what === 'parties') parties = parties.filter((p) => p.id !== Number(linkPart)); else clientContacts = clientContacts.filter((x) => x.id !== Number(linkPart)); }
  return json(route, partiesAnswer(), method === 'POST' ? 201 : 200);
});

// ---------------------------------------------------------------- contacts on a lead
await go('/admin/projects/leads/1');
await page.locator('[data-contact="Grace Wambua"]').waitFor({ timeout: 15000 });
ok('a lead shows its people, with what each is there for and the main contact', /Main contact/.test(await text(page.locator('[data-contact="Grace Wambua"]'))) && /Decision maker/.test(await text(page.locator('[data-contact="Grace Wambua"]'))) && /Head teacher/.test(await text(page.locator('[data-contact="Grace Wambua"]'))));
await page.getByRole('button', { name: 'Add contact' }).click();
await page.getByLabel('Name', { exact: true }).fill('Peter Mutua');
await page.getByLabel('Job title').fill('Bursar');
await page.getByLabel('Billing').check();
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('[data-contact="Peter Mutua"]').waitFor({ timeout: 5000 });
ok('a contact is added with the reasons ticked, not as the main contact', JSON.stringify(last('add contact')[1]) === JSON.stringify({ name: 'Peter Mutua', job_title: 'Bursar', email: '', phone: '', roles: ['billing'], is_main: false }) && /Billing/.test(await text(page.locator('[data-contact="Peter Mutua"]'))));
await page.getByRole('button', { name: 'Change Peter Mutua' }).click();
await page.getByLabel('The main contact').check();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(400);
ok('making another the main contact takes it from the first', last('change contact')[2].is_main === true && /Main contact/.test(await text(page.locator('[data-contact="Peter Mutua"]'))) && !/Main contact/.test(await text(page.locator('[data-contact="Grace Wambua"]'))));
await page.screenshot({ path: D + 'projects-contacts.png', fullPage: true });
await page.getByRole('button', { name: 'Change Peter Mutua' }).click();
ok('the main contact cannot be un-made by unticking: another is made main instead', (await page.getByLabel('The main contact').count()) === 0);
await page.getByRole('button', { name: 'Remove Peter Mutua' }).click();
await page.waitForTimeout(400);
ok('removing the main contact makes another the main contact', JSON.stringify(last('remove contact')) === JSON.stringify(['remove contact', 2]) && /Main contact/.test(await text(page.locator('[data-contact="Grace Wambua"]'))));

// ---------------------------------------------------------------- the Parties tab
await go('/admin/projects/413?tab=parties');
await page.locator('[data-party="Baraka Traders Ltd"]').waitFor({ timeout: 15000 });
ok('each party shows its role here and who to talk to there', /Opposing party/.test(await text(page.locator('[data-party="Baraka Traders Ltd"]'))) && /J\. Baraka/.test(await text(page.locator('[data-party="Baraka Traders Ltd"]'))) && /Served 3 Nov/.test(await text(page.locator('[data-party="Baraka Traders Ltd"]'))));
ok('a party that is also a lead or a client says so', /A lead, owned by Njeri/.test(await text(page.locator('[data-party="Baraka Traders Ltd"]'))));
ok('with no client contacts chosen it says the main contact is the one to call', /The client's main contact is the one to call/.test(await text()));
await page.getByRole('button', { name: 'Add from the client' }).click();
await page.getByLabel('Contact', { exact: true }).selectOption('21');
await page.getByLabel('For what, on this (optional)').fill('Signs the pleadings');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('[data-client-contact="A. Otieno"]').waitFor({ timeout: 5000 });
ok('one of the client\'s contacts is put on it, with what for', JSON.stringify(last('add client contact')[1]) === JSON.stringify({ contact_id: 21, note: 'Signs the pleadings' }) && /Signs the pleadings/.test(await text(page.locator('[data-client-contact="A. Otieno"]'))));

await page.getByRole('button', { name: 'Add a party' }).click();
await page.getByLabel('Party', { exact: true }).fill('Mwangi and Co');
await page.locator('[data-known]').waitFor({ timeout: 5000 });
ok('typing a new name warns when a party by that name is already known', /Another party on M-0371/.test(await text(page.locator('[data-known]'))));
await page.getByRole('button', { name: /^Mwangi and Co\. Advocates/ }).click();
ok('picking a known party hides the boxes for a new one', (await page.getByLabel('Phone').count()) === 0 && /Already known/.test(await text()));
ok('the roles offered are this industry\'s and every industry\'s', (await page.getByLabel('What they are on this').locator('option').allInnerTexts()).join() === 'Choose…,Opposing party,Opposing counsel,Court or tribunal,Consultant');
await page.getByLabel('What they are on this').selectOption('31');
await page.getByRole('button', { name: 'Add the party' }).click();
await page.locator('[data-party="Mwangi and Co. Advocates"]').waitFor({ timeout: 5000 });
ok('a known party is put on by its record, not typed again', JSON.stringify(last('add party')[1]) === JSON.stringify({ role_id: 31, note: '', party_id: 8 }));
await page.getByRole('button', { name: 'Add a party' }).click();
await page.getByLabel('Party', { exact: true }).fill('Milimani Commercial Court');
await page.getByLabel('What they are on this').selectOption('32');
await page.getByRole('button', { name: 'Add the party' }).click();
await page.locator('[data-party="Milimani Commercial Court"]').waitFor({ timeout: 5000 });
ok('a new party is sent with its name and details', last('add party')[1].name === 'Milimani Commercial Court' && last('add party')[1].kind === 'organisation' && !('party_id' in last('add party')[1]));
await page.screenshot({ path: D + 'projects-parties.png', fullPage: true });
await page.getByRole('button', { name: 'Take Baraka Traders Ltd off this' }).click();
await page.waitForTimeout(400);
ok('a party is taken off this piece of work', JSON.stringify(last('remove parties')) === JSON.stringify(['remove parties', 1]) && (await page.locator('[data-party="Baraka Traders Ltd"]').count()) === 0);

await finish(c);
