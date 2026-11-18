// Browser check: meetings (builds 6.6 and 6.7). The Meetings tab: planning a client meeting with the free-time search, the invitation going out, answering,
// who answered what, moving and cancelling; minutes with action items, an item made into a task, sharing the minutes; /meet in a conversation opening the form with its people; and the answer page an outside contact
// opens without signing in. The API is answered by the check itself; the rules are proved by the backend tests (ProjectsMeetingsTest).
// It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.meetings', 'projects.messages.internal', 'projects.messages.client'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words: { project: { name: 'Matter', plural: 'Matters' } }, can: { open: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));

const meetings = {};
const shape = (m) => ({ ...m, answers: { yes: m.people.filter((p) => p.answer === 'yes').length, no: m.people.filter((p) => p.answer === 'no').length, maybe: m.people.filter((p) => p.answer === 'maybe').length, pending: m.people.filter((p) => p.answer === 'pending').length },
  my_answer: m.people.find((p) => p.type === 'person' && p.id === 1)?.answer, minutes: m.minutes ?? null, minutes_shared_at: m.minutes_shared_at ?? null, actions: m.actions ?? [], can: { manage: true, answer: m.state === 'planned' && !m.past, minutes: !!m.past && m.state !== 'cancelled', tasks: true } });
await page.route(/\/api\/admin\/projects\/413\/meetings(\?.*)?$/, (route) => {
  if (route.request().method() === 'POST') {
    const b = route.request().postDataJSON(); sent.push(['plan', b]);
    const s = `${b.date} ${b.time}:00`; const e = new Date(new Date(s.replace(' ', 'T')).getTime() + b.minutes * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    meetings[7] = { id: 7, title: b.title, starts_at: s, ends_at: `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())} ${pad(e.getHours())}:${pad(e.getMinutes())}:00`, minutes_long: b.minutes, location: b.location, online_link: b.online_link, agenda: b.agenda, audience: b.audience, state: 'planned', past: false,
      organiser: { id: 1, name: 'Wanjiru' }, people: [{ type: 'person', id: 1, name: 'Wanjiru', answer: 'yes', organiser: true }, { type: 'person', id: 2, name: 'Otieno', answer: 'pending', organiser: false }, { type: 'contact', id: 7, name: 'Grace Wambua', answer: 'pending', organiser: false }] };
    return json(route, { meeting: shape(meetings[7]) }, 201);
  }
  return json(route, { ready: true, meetings: Object.values(meetings).map(shape), team: [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Otieno' }], audiences: { team: 'Team', client: 'Client', others: 'Others' },
    contacts: { client: [{ id: 7, name: 'Grace Wambua', email: 'grace@example.test', phone: null, reachable: true }, { id: 8, name: 'Peter Wambua', email: null, phone: null, reachable: false }], others: [] }, can: { plan: true } });
});
await page.route('**/api/admin/projects/413/meetings/free-time', (route) => { sent.push(['free', route.request().postDataJSON()]); return json(route, { slots: [{ starts_at: '2026-11-19 08:00:00', ends_at: '2026-11-19 09:00:00' }, { starts_at: '2026-11-19 11:00:00', ends_at: '2026-11-19 12:00:00' }], hours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] }, away: [{ name: 'Otieno', why: 'on leave some days' }] }); });
await page.route(/\/api\/admin\/projects\/413\/meetings\/\d+\/(minutes|share|actions\/\d+\/task)$/, (route) => {
  const url = route.request().url(); const m = meetings[Number(url.match(/meetings\/(\d+)/)[1])]; const b = route.request().postDataJSON?.() ?? null;
  if (/minutes$/.test(url)) { sent.push(['minutes', b]); m.minutes = b.minutes; m.state = 'held'; m.actions = b.actions.map((a, i) => ({ ...a, id: 50 + i, task: null })); }
  else if (/share$/.test(url)) { sent.push(['share']); m.minutes_shared_at = '2026-11-19 12:30:00'; }
  else { const aid = Number(url.match(/actions\/(\d+)/)[1]); sent.push(['task', aid]); m.actions.find((a) => a.id === aid).task = { id: 90, ref: 'M-0413-T12', status: 'todo' }; return json(route, { task_id: 90, meeting: shape(m) }, 201); }
  return json(route, { meeting: shape(m) });
});
await page.route(/\/api\/admin\/projects\/413\/meetings\/\d+(\/(answer|cancel))?$/, (route) => {
  const url = route.request().url(); const id = Number(url.match(/meetings\/(\d+)/)[1]); const m = meetings[id]; const b = route.request().postDataJSON?.() ?? null;
  if (/answer$/.test(url)) { sent.push(['answer', b.answer]); m.people[0].answer = b.answer; }
  else if (/cancel$/.test(url)) { sent.push(['cancel', b.reason]); m.state = 'cancelled'; }
  else if (route.request().method() === 'PUT') { sent.push(['move', b]); m.starts_at = `${b.date} ${b.time}:00`; m.people.forEach((p) => { if (!p.organiser) p.answer = 'pending'; }); }
  return json(route, { meeting: shape(m) });
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=meetings')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-meetings]').waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Plan a meeting' }).click();
await page.getByLabel('Title', { exact: true }).fill('Defence strategy');
await page.getByLabel('With').selectOption('client');
ok('a contact with no email or phone cannot be invited', await page.getByRole('checkbox', { name: /Peter Wambua/ }).isDisabled());
await page.getByRole('checkbox', { name: /Grace Wambua/ }).check();
await page.getByRole('checkbox', { name: 'Otieno' }).check();
ok('the organiser is always in', await page.getByRole('checkbox', { name: 'Wanjiru (you)' }).isChecked() && await page.getByRole('checkbox', { name: 'Wanjiru (you)' }).isDisabled());
await page.getByRole('button', { name: 'Find a time everyone is free' }).click();
await page.waitForTimeout(400);
ok('the free-time search asks for the team and the length, and says who is away', JSON.stringify(last('free')[1]) === JSON.stringify({ people: [1, 2], minutes: 60 }) && /08:00 to 17:00 on working days\. Otieno is on leave some days\./.test(await text(page.locator('[data-free-time]'))));
await page.getByRole('option', { name: /19 Nov.*11:00/ }).click();
ok('choosing a free time fills the day and time', (await page.getByLabel('Day').inputValue()) === '2026-11-19' && (await page.getByLabel('Time', { exact: true }).inputValue()) === '11:00');
await page.getByLabel('Where').fill('Board room');
await page.getByLabel('Online link').fill('https://meet.example.test/abc');
await page.getByLabel('Agenda').fill('1. The delivery note');
await page.screenshot({ path: D + 'projects-meeting-plan.png', fullPage: true });
await page.getByRole('button', { name: 'Plan it and send the invitations' }).click();
await page.waitForTimeout(500);
ok('planning it sends everything the meeting holds', JSON.stringify(last('plan')[1]) === JSON.stringify({ title: 'Defence strategy', audience: 'client', date: '2026-11-19', time: '11:00', minutes: 60, location: 'Board room', online_link: 'https://meet.example.test/abc', agenda: '1. The delivery note', people: [1, 2], contacts: [7], thread_id: null }));
const open1 = page.locator('[data-meeting-open]');
ok('the meeting shows who is invited and their answers', /Wanjiru \(organiser\) Yes Otieno Not answered Grace Wambua · contact Not answered/.test(await text(page.locator('[data-meeting-people]'))) && /Coming up Defence strategy/.test(await text(page.locator('[data-meetings]'))));
await page.screenshot({ path: D + 'projects-meeting.png', fullPage: true });
await open1.getByRole('group', { name: 'Your answer' }).getByRole('button', { name: 'Maybe' }).click();
await page.waitForTimeout(300);
ok('answering is sent', last('answer')[1] === 'maybe');
await page.getByRole('button', { name: 'Move or change it' }).click();
await page.getByLabel('Time', { exact: true }).fill('14:30');
await page.getByRole('button', { name: 'Save and tell everyone' }).click();
await page.waitForTimeout(400);
ok('moving sends the new time and everyone is asked again', last('move')[1].time === '14:30' && /Otieno Not answered/.test(await text(page.locator('[data-meeting-people]'))));
page.once('dialog', (dlg) => dlg.accept('Settled'));
await page.getByRole('button', { name: 'Cancel the meeting' }).click();
await page.waitForTimeout(400);
ok('cancelling asks why, and the meeting says it was cancelled', last('cancel')[1] === 'Settled' && /This meeting was cancelled\./.test(await text(open1)));

// minutes, on a meeting that has taken place
meetings[8] = { id: 8, title: 'Case review', starts_at: '2026-11-17 10:00:00', ends_at: '2026-11-17 11:00:00', minutes_long: 60, location: null, online_link: null, agenda: null, audience: 'client', state: 'planned', past: true,
  organiser: { id: 1, name: 'Wanjiru' }, people: [{ type: 'person', id: 1, name: 'Wanjiru', answer: 'yes', organiser: true }, { type: 'person', id: 2, name: 'Otieno', answer: 'yes', organiser: false }, { type: 'contact', id: 7, name: 'Grace Wambua', answer: 'yes', organiser: false }] };
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=meetings&meeting=8')}`, { waitUntil: 'networkidle' });
await page.locator('[data-minutes]').waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Write the minutes' }).click();
await page.getByLabel('Minutes', { exact: true }).fill('We rely on the delivery note.');
await page.getByLabel('Action item 1', { exact: true }).fill("Get the driver's statement");
await page.getByLabel('Who does action item 1').selectOption('u2');
await page.getByLabel('Action item 1 due').fill('2026-11-26');
await page.getByRole('button', { name: 'Add an action item' }).click();
await page.getByLabel('Action item 2', { exact: true }).fill('Send the signed delivery note');
await page.getByLabel('Who does action item 2').selectOption('c7');
await page.screenshot({ path: D + 'projects-meeting-minutes.png', fullPage: true });
await page.getByRole('button', { name: 'Save the minutes' }).click();
await page.waitForTimeout(400);
ok('the minutes and action items are sent, each with who and when', JSON.stringify(last('minutes')[1]) === JSON.stringify({ minutes: 'We rely on the delivery note.', actions: [{ text: "Get the driver's statement", user_id: 2, contact_id: null, due_date: '2026-11-26' }, { text: 'Send the signed delivery note', user_id: null, contact_id: 7, due_date: null }] }));
ok('the action items show who does them', /Get the driver's statement · Otieno · by 26 Nov/.test(await text(page.locator('[data-actions]'))) && /Send the signed delivery note · Grace Wambua/.test(await text(page.locator('[data-actions]'))));
await page.getByRole('button', { name: `Make "Get the driver's statement" a task` }).click();
await page.waitForTimeout(400);
ok('an action item becomes a task in one click', last('task')[1] === 50 && /Task M-0413-T12/.test(await text(page.locator(`[data-action="Get the driver's statement"]`))));
await page.getByRole('button', { name: 'Share the minutes' }).click();
await page.waitForTimeout(400);
ok('sharing the minutes is sent and shown', last('share') !== undefined && /Shared 19 Nov/.test(await text(page.locator('[data-minutes]'))) && (await page.getByRole('button', { name: 'Share again' }).count()) === 1);

// /meet from a conversation
await page.route(/\/api\/admin\/projects\/413\/threads(\?.*)?$/, (route) => json(route, { ready: true, threads: [{ id: 3, subject: 'Hearing', audience: 'client', state: 'open', tags: [], owner: { id: 2, name: 'Otieno' }, contacts: [{ id: 7, name: 'Grace Wambua' }], unread: 0, last_message_at: null, last: null }], audiences: { client: 'Client' }, contacts: { client: [], others: [] }, team: [], following: null, can: { start: true } }));
await page.route(/\/api\/admin\/projects\/413\/threads\/3$/, (route) => json(route, { thread: { id: 3, subject: 'Hearing', audience: 'client', state: 'open', tags: [], owner: { id: 2, name: 'Otieno' }, contacts: [{ id: 7, name: 'Grace Wambua' }], unread: 0, people: [], tag_list: [], following: null, messages: [], can: { write: true, manage: true } } }));
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=messages&thread=3')}`, { waitUntil: 'networkidle' });
await page.locator('[data-thread-open]').waitFor({ timeout: 15000 });
await page.getByLabel('Your message').fill('/meet Prepare the hearing');
await page.getByRole('button', { name: 'Send to Grace Wambua' }).click();
await page.locator('[data-meeting-form]').waitFor({ timeout: 5000 });
ok('/meet opens the meeting form with the conversation, its contacts and its people', (await page.getByLabel('Title', { exact: true }).inputValue()) === 'Prepare the hearing' && (await page.getByLabel('With').inputValue()) === 'client'
  && await page.getByRole('checkbox', { name: /Grace Wambua/ }).isChecked() && await page.getByRole('checkbox', { name: 'Otieno' }).isChecked());

// the answer page an outside contact opens
let pub = { title: 'Defence strategy', project: 'M-0413 Imara Sacco v. Baraka Traders', starts_at: '2026-11-19 11:00:00', ends_at: '2026-11-19 12:00:00', location: 'Board room', online_link: 'https://meet.example.test/abc', agenda: '1. The delivery note', state: 'planned', organiser: 'Wanjiru', who: 'Grace Wambua', response: 'pending', answers: { yes: 'Yes', no: 'No', maybe: 'Maybe' }, company: 'Imara Advocates' };
const token = 'a'.repeat(40);
await page.route(`**/api/meetings/${token}`, (route) => json(route, pub));
await page.route(`**/api/meetings/${token}/answer`, (route) => { sent.push(['public', route.request().postDataJSON()]); pub = { ...pub, response: route.request().postDataJSON().answer }; return json(route, pub); });
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(`/meeting/${token}`)}`, { waitUntil: 'networkidle' });
await page.locator('[data-meeting-answer]').waitFor({ timeout: 15000 });
ok('the answer page shows the meeting and asks the contact by name', /Imara Advocates · M-0413 .*Defence strategy .*Where: Board room .*Organised by: Wanjiru .*Grace Wambua, can you come\?/.test(await text(page.locator('[data-meeting-answer]'))));
await page.getByRole('button', { name: 'Yes, I will come' }).click();
await page.waitForTimeout(400);
ok('answering without signing in is sent and thanked', JSON.stringify(last('public')[1]) === JSON.stringify({ answer: 'yes' }) && /Your answer is "Yes"/.test(await text(page.locator('[data-meeting-answer]'))));
await page.screenshot({ path: D + 'projects-meeting-answer.png', fullPage: true });

await finish(c);
