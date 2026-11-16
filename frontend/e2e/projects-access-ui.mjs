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
const person = (member_id, name, o = {}) => ({ member_id, user_id: member_id, name, is_lead: false, reason: 'On it as Member', role: 'Member', can: ['Open it', 'Add and change its phases'], hours: null, hour_days: [], starts_at: null, ends_at: null, ends_in_days: null, ending_soon: false, state: 'in', state_words: 'Can get in', status: 'good', ...o });
let people = [
  person(1, 'Kamau', { is_lead: true, reason: 'On it as Lead', role: 'Lead', can: ['Open it', 'Change its details, freeze it, make it confidential', 'Set its hours, end dates and locked areas'] }),
  person(2, 'Njeri', { ends_at: '2027-01-31 23:59:59' }),
  person(3, 'Mwangi', { reason: 'On it as Finance', role: 'Finance', can: ['Open it'], ends_at: '2026-11-20 23:59:59', ends_in_days: 4, ending_soon: true }),
  person(4, 'Wambui', { reason: 'Was on it as Member', ends_at: '2026-10-31 23:59:59', state: 'ended', state_words: 'Ended 31 Oct 2026', status: 'problem' }),
  person(5, 'Amina', { reason: 'Invited as Reviewer', role: 'Reviewer', can: ['Open it', 'Read its activity log'], state: 'invited', state_words: 'Invited, has not answered', status: 'info' })];
let others = { kind: 'kept_out', people: [{ user_id: 8, name: 'Baraka' }, { user_id: 9, name: 'Zawadi' }] };
let canAccess = true;
let projectDays = []; let readOutside = false; let passes = [];
const WORDS = (days) => (days.length === 5 ? 'Mon to Fri, 07:00 to 19:00' : days.length ? 'Sat, 09:00 to 13:00' : null);
const answer = () => ({ people, others, project_hours: WORDS(projectDays), hours: { project: projectDays, read_outside_hours: readOutside, ready: true, key_holders: ['Kamau'] }, passes, people_locked: false, locks: [{ area: 'people', label: 'People and access', locked: false, set_by: null, set_at: null, reset: null }], summary: { ending_soon: people.filter((p) => p.ending_soon).length, warn_days: 7 }, can: { access: canAccess } });

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words, keys: {} }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => json(route, { project }));
await page.route(/\/api\/admin\/projects\/\d+\/access$/, (route) => json(route, answer()));
await page.route(/\/api\/admin\/projects\/\d+\/access\/hours$/, (route) => {
  const b = route.request().postDataJSON(); sent.push(['hours', b]);
  if (b.days.some((d) => d.opens >= d.closes)) return json(route, { message: 'Monday closes before it opens.' }, 422);
  if (b.member_id) people = people.map((p) => (p.member_id === b.member_id ? { ...p, hour_days: b.days, hours: WORDS(b.days), state: 'outside_hours', state_words: 'Outside hours, back on Saturday at 09:00', status: 'info' } : p));
  else { projectDays = b.days; readOutside = !!b.read_outside_hours; }
  return json(route, answer());
});
await page.route(/\/api\/admin\/projects\/\d+\/access\/passes\/\d+$/, (route) => {
  const b = route.request().postDataJSON(); sent.push(['pass', b]);
  passes = b.approve ? passes.map((s) => ({ ...s, status: 'approved', ends_at: '2026-11-16 20:40:00' })) : [];
  return json(route, answer());
});
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
ok('someone only invited has no end date to move yet', (await row('Amina').getByRole('button', { name: /Extend|end date/ }).count()) === 0);
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

// ---------------------------------------------------------------- hours
await page.getByRole('button', { name: 'Set hours', exact: true }).click();
ok('with no hours the editor says it can be opened at any time', /With no day ticked there are no hours: it can be opened at any time/.test(await text(page.locator('#root'))));
for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) { await page.getByLabel(`Open on ${d}`).click(); await page.getByLabel(`${d} opens`).fill('07:00'); await page.getByLabel(`${d} closes`).fill('19:00'); }
ok('a day that is not ticked reads as closed', /Saturday\s*Closed/.test(await text(page.locator('#root'))));
ok('it says the people who set the hours are never held by them', /The hours never hold the people who can set them \(Kamau\)/.test(await text(page.locator('#root'))));
await page.getByLabel('Outside these hours people can still read it, but not change it').click();
await page.getByRole('button', { name: 'Save the hours' }).click();
await page.waitForTimeout(400);
const h = sent.at(-1)[1];
ok('the project\'s hours are sent as days with a time to open and close, with the reading switch', sent.at(-1)[0] === 'hours' && h.days.length === 5 && JSON.stringify(h.days[0]) === JSON.stringify({ day: 1, opens: '07:00', closes: '19:00' }) && h.read_outside_hours === true && !h.member_id, JSON.stringify(h));
ok('the hours show above the list and each person follows them', /Hours: Mon to Fri, 07:00 to 19:00/.test(await text(page.locator('#root'))) && /The hours above/.test(await text(row('Njeri'))));
await page.screenshot({ path: D + 'projects-access-hours.png', fullPage: true });

await page.getByRole('button', { name: 'Set hours for Njeri' }).click();
await page.getByLabel('Open on Saturday').click();
await page.getByLabel('Saturday opens').fill('09:00');
await page.getByLabel('Saturday closes').fill('13:00');
await page.getByRole('button', { name: 'Save the hours' }).click();
await page.waitForTimeout(400);
ok('one person can be given narrower hours of their own', sent.at(-1)[1].member_id === 2 && sent.at(-1)[1].days.length === 1 && !('read_outside_hours' in sent.at(-1)[1]) && /Sat, 09:00 to 13:00/.test(await text(row('Njeri'))));
ok('and the list says when someone outside their hours is back', /Outside hours, back on Saturday at 09:00/.test(await text(row('Njeri'))));
await page.getByRole('button', { name: 'Set hours', exact: true }).click();
await page.getByLabel('Monday opens').fill('20:00');
await page.getByRole('button', { name: 'Save the hours' }).click();
await page.waitForTimeout(400);
ok('hours that make no sense are refused in words and the editor stays open', (await page.getByText('Monday closes before it opens.').count()) > 0 && (await page.getByRole('button', { name: 'Save the hours' }).count()) === 1);
await page.getByRole('button', { name: 'Cancel', exact: true }).click();

// someone asked to be let in
passes = [{ id: 7, user_id: 2, name: 'Njeri', status: 'asked', reason: 'Filing closes at midnight', asked_at: '2026-11-16 19:40:00', ends_at: null }];
await go('/admin/projects/413?tab=access');
await page.locator('[data-pass="Njeri"]').waitFor({ timeout: 15000 });
ok('a request to get in outside hours shows on the tab with its reason', /Njeri asks to get in outside the hours\. "Filing closes at midnight"/.test(await text(page.locator('[data-pass="Njeri"]'))));
await page.getByRole('button', { name: 'Let them in' }).click();
await page.waitForTimeout(400);
ok('letting them in is sent, and the tab shows until when', JSON.stringify(sent.at(-1)) === JSON.stringify(['pass', { approve: true }]) && /Njeri has a pass until 20:40/.test(await text(page.locator('[data-pass="Njeri"]'))));

// ---------------------------------------------------------------- closed for now
let closedNow = { message: 'M-0413 is closed for now. It can be opened Mon to Fri, 07:00 to 19:00. It opens again tomorrow at 07:00.', closed: { hours: 'Mon to Fri, 07:00 to 19:00', opens_at: '2026-11-17 07:00:00', opens_words: 'tomorrow at 07:00', can_ask: true, asked: false, lead: 'Kamau' } };
await page.unroute(/\/api\/admin\/projects\/\d+$/);
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => (closedNow ? json(route, closedNow, 403) : json(route, { project })));
await page.route(/\/api\/admin\/projects\/\d+\/access\/pass$/, (route) => { sent.push(['ask', route.request().postDataJSON()]); return json(route, { message: 'Asked.' }, 201); });
await go('/admin/projects/413');
await page.getByRole('heading', { name: 'Closed for now' }).waitFor({ timeout: 15000 });
ok('outside its hours the page says when it opens and who leads it, not "not found"', /It opens again tomorrow at 07:00/.test(await text(page.locator('#root'))) && /Need it now\? Kamau leads it and can let you in/.test(await text(page.locator('#root'))));
await page.screenshot({ path: D + 'projects-closed.png', fullPage: true });
await page.getByRole('button', { name: 'Ask to be let in' }).click();
await page.waitForTimeout(400);
ok('asking to be let in is sent once, and the page says it is waiting', sent.at(-1)[0] === 'ask' && /You have asked to be let in/.test(await text(page.locator('#root'))) && (await page.getByRole('button', { name: 'Ask to be let in' }).count()) === 0);
closedNow = null;
await page.getByRole('button', { name: 'Try again' }).click();
await page.getByRole('heading', { name: /Imara Sacco/ }).waitFor({ timeout: 15000 });
ok('once let in, trying again opens it', true);

// ---------------------------------------------------------------- the company's settings
let access = { warn_days: 7, default_hours: [], read_outside_hours: false, passes: true, pass_minutes: 60, unlock_minutes: 15, lock_tries: 5, lock_wait_minutes: 15, approval_hours: 24 };
let canManage = true;
const configPage = () => ({ ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, access, version: 1, industries: [{ key: 'legal', name: 'Legal', group: 'common', is_active: true }], viewing: 'legal', terms: [], personal: null, can: { manage: canManage, industry: true, names: true, roles: true } });
await page.route('**/api/admin/projects/configuration**', (route) => {
  if (route.request().method() === 'GET') return json(route, configPage());
  const b = route.request().postDataJSON(); sent.push(['settings', b]);
  if (b.pass_minutes < 5) return json(route, { message: 'A pass lasts from 5 minutes to 24 hours.' }, 422);
  access = { ...access, ...b };
  return json(route, configPage());
});
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Access' }).click();
await page.getByLabel('Warn the lead this many days before someone\'s end date').fill('14');
await page.getByLabel('A pass outside hours lasts this many minutes').fill('2');
await page.getByLabel('Open on Monday').click();
await page.getByRole('button', { name: 'Save access settings' }).click();
await page.waitForTimeout(400);
ok('a setting that cannot be is refused next to the form', (await page.getByText('A pass lasts from 5 minutes to 24 hours.').count()) > 0);
await page.getByLabel('A pass outside hours lasts this many minutes').fill('30');
await page.getByRole('button', { name: 'Save access settings' }).click();
await page.waitForTimeout(400);
const st = sent.at(-1)[1];
ok('the company\'s access settings are sent together: warning days, pass length, default hours', st.warn_days === 14 && st.pass_minutes === 30 && st.passes === true && JSON.stringify(st.default_hours) === JSON.stringify([{ day: 1, opens: '08:00', closes: '17:00' }]), JSON.stringify(st));
await page.screenshot({ path: D + 'projects-access-settings.png', fullPage: true });
canManage = false;
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'Access' }).click();
ok('someone who may not change settings sees them greyed, with a note', (await page.getByLabel('Open on Monday').isDisabled()) && /may not change them/.test(await text(page.locator('#root'))));

// an open piece of work, seen by someone who may not set access
passes = [];
project = { ...project, confidential: false };
others = { kind: 'gets_in', people: [{ user_id: 8, name: 'Baraka' }] };
canAccess = false;
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Access' }).click();
await row('Kamau').waitFor({ timeout: 15000 });
ok('an open one says who reads it without being on it, in the industry\'s words', /1 more person reads it without being on it, because they see every matter that is not confidential/.test(await text(page.locator('[data-others="gets_in"]'))));
ok('someone who may not set access sees the list and no way to change it', (await page.getByRole('button', { name: /^(Extend|Set an end date|Set hours)/ }).count()) === 0);

await finish(c);
