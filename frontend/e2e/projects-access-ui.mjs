// Browser check: the Access tab of a piece of work (build 2.1): who can get in and why, whether they can right now, the people it is hidden from
// or who read it without being on it, and moving an end date. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.members.view', 'projects.access.rules'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const row = (name) => page.locator(`[data-person="${name}"]`);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');

const W = { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], phase: ['Phase', 'Phases'], closing_period: ['Appeal period', 'Appeal periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const CAN = { open: true, edit: true, stage: true, close: true, freeze: false, confidential: true, phases: true, members: true, members_view: true, links: true, log: true, access: true };
let project = { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: true, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }, { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [] }], cost_centre_path: 'Projects › M-0413', words, can: CAN, fields: [] };
const person = (member_id, name, o = {}) => ({ member_id, user_id: member_id, name, is_lead: false, reason: 'On it as Member', role: 'Member', can: ['Open it', 'Add and change its phases'], hours: null, starts_at: null, ends_at: null, ends_in_days: null, ending_soon: false, state: 'in', state_words: 'Can get in', status: 'good', ...o });
let people = [
  person(1, 'Kamau', { is_lead: true, reason: 'On it as Lead', role: 'Lead', can: ['Open it', 'Change its details, freeze it, make it confidential', 'Set its hours, end dates and locked areas'] }),
  person(2, 'Njeri', { ends_at: '2027-01-31 23:59:59' }),
  person(3, 'Mwangi', { reason: 'On it as Finance', role: 'Finance', can: ['Open it'], ends_at: '2026-11-20 23:59:59', ends_in_days: 4, ending_soon: true }),
  person(4, 'Wambui', { reason: 'Was on it as Member', ends_at: '2026-10-31 23:59:59', state: 'ended', state_words: 'Ended 31 Oct 2026', status: 'problem' }),
  person(5, 'Amina', { reason: 'Invited as Reviewer', role: 'Reviewer', can: ['Open it', 'Read its activity log'], state: 'invited', state_words: 'Invited, has not answered', status: 'info' })];
let others = { kind: 'kept_out', people: [{ user_id: 8, name: 'Baraka' }, { user_id: 9, name: 'Zawadi' }] };
let canAccess = true;
const answer = () => ({ people, others, project_hours: null, summary: { ending_soon: people.filter((p) => p.ending_soon).length, warn_days: 7 }, can: { access: canAccess } });

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words, keys: {} }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => json(route, { project }));
await page.route(/\/api\/admin\/projects\/\d+\/access$/, (route) => json(route, answer()));
await page.route(/\/api\/admin\/projects\/\d+\/access\/members\/\d+$/, (route) => {
  const id = Number(route.request().url().match(/(\d+)$/)[1]); const b = route.request().postDataJSON(); sent.push([id, b]);
  if (b.ends_at === '2030-01-01') return json(route, { message: 'You may not do that here.' }, 403);
  people = people.map((p) => (p.member_id === id ? { ...p, ends_at: b.ends_at ? `${b.ends_at} 23:59:59` : null, ends_in_days: null, ending_soon: false, state: 'in', state_words: 'Can get in', status: 'good', reason: p.reason.replace('Was on it', 'On it') } : p));
  return json(route, answer());
});

// a message links straight to the tab
await go('/admin/projects/413?tab=access');
await row('Kamau').waitFor({ timeout: 15000 });
ok('a link can open the Access tab directly', (await page.getByRole('tab', { name: 'Access' }).getAttribute('aria-selected')) === 'true');
ok('each person is shown with why they get in and what they can do', /On it as Lead/.test(await text(row('Kamau'))) && /Set its hours, end dates and locked areas/.test(await text(row('Kamau'))) && /On it as Finance/.test(await text(row('Mwangi'))));
ok('and whether they can get in right now', /Can get in/.test(await text(row('Njeri'))) && /Ended 31 Oct 2026/.test(await text(row('Wambui'))) && /Invited, has not answered/.test(await text(row('Amina'))));
ok('an end date close by is flagged on the row and counted above', /20 Nov 2026\s*4 days/.test(await text(row('Mwangi'))) && /1 person ends within 7 days/.test(await text(page.locator('#root'))));
ok('with no hours set it says the work is open at any time', /Open at any time/.test(await text(page.locator('#root'))) && /Any time/.test(await text(row('Njeri'))));
ok('a confidential one says who it is hidden from, by count first', /Hidden from 2 people who would otherwise see it, because it is confidential/.test(await text(page.locator('[data-others="kept_out"]'))) && !/Baraka/.test(await text(page.locator('[data-others]'))));
await page.getByRole('button', { name: 'Show them' }).click();
ok('and by name when asked', /Baraka, Zawadi/.test(await text(page.locator('[data-others]'))));
ok('someone only invited has no end date to move yet', (await row('Amina').getByRole('button').count()) === 0);
await page.screenshot({ path: D + 'projects-access.png', fullPage: true });

await page.getByRole('button', { name: 'Extend Mwangi' }).click();
ok('extending starts from the date they have', (await page.getByLabel('Mwangi is on it until').inputValue()) === '2026-11-20');
await page.getByLabel('Mwangi is on it until').fill('2027-03-31');
await page.getByRole('button', { name: 'Save the date' }).click();
await page.waitForTimeout(400);
ok('the new end date is sent and the row and the count follow', JSON.stringify(sent.at(-1)) === JSON.stringify([3, { ends_at: '2027-03-31' }]) && /31 Mar 2027/.test(await text(row('Mwangi'))) && !/ends within/.test(await text(page.locator('#root'))), JSON.stringify(sent.at(-1)));
await page.getByRole('button', { name: 'Extend Wambui' }).click();
ok('a date that has passed is not offered again', (await page.getByLabel('Wambui is on it until').inputValue()) === '');
await page.getByLabel('Wambui is on it until').fill('2027-06-30');
await page.getByRole('button', { name: 'Save the date' }).click();
await page.waitForTimeout(400);
ok('someone whose place had ended is back on it', /On it as Member/.test(await text(row('Wambui'))) && /Can get in/.test(await text(row('Wambui'))));
await page.getByRole('button', { name: 'Extend Njeri' }).click();
await page.getByRole('button', { name: 'No end date' }).click();
await page.waitForTimeout(400);
ok('an end date can be taken away', JSON.stringify(sent.at(-1)) === JSON.stringify([2, { ends_at: null }]) && /No end/.test(await text(row('Njeri'))) && (await row('Njeri').getByRole('button', { name: 'Set an end date for Njeri' }).count()) === 1);
await page.getByRole('button', { name: 'Set an end date for Njeri' }).click();
await page.getByLabel('Njeri is on it until').fill('2030-01-01');
await page.getByRole('button', { name: 'Save the date' }).click();
await page.waitForTimeout(400);
ok('a refusal is shown in its own words and nothing changes', /No end/.test(await text(row('Njeri'))) && (await page.getByText('You may not do that here.').count()) > 0);

// an open piece of work, seen by someone who may not set access
project = { ...project, confidential: false };
others = { kind: 'gets_in', people: [{ user_id: 8, name: 'Baraka' }] };
canAccess = false;
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Access' }).click();
await row('Kamau').waitFor({ timeout: 15000 });
ok('an open one says who reads it without being on it, in the industry\'s words', /1 more person reads it without being on it, because they see every matter that is not confidential/.test(await text(page.locator('[data-others="gets_in"]'))));
ok('someone who may not set access sees the list and no way to change it', (await page.getByRole('button', { name: /^(Extend|Set an end date)/ }).count()) === 0);

await finish(c);
