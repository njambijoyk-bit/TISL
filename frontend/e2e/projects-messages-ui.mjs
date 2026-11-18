// Browser check: the Messages tab (builds 6.1 and 6.2): conversations with unread counts, opening one, a client conversation showing what was sent
// where and a reply that came in, writing a message, starting a client conversation with chosen contacts, and closing one; then
// @mention suggestions, /time, changing and removing a message, making one a task, and tags on a conversation. The API is answered
// by the check itself; who may read and write, and sending through the Notifier, are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.messages.internal', 'projects.messages.client'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words: { project: { name: 'Matter', plural: 'Matters' } }, can: { open: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));

const msg = (o) => ({ via: 'app', sent_to: null, edited: false, removed: null, task_id: null, mine: false, can_change: false, ...o });
const tagList = [{ id: 1, key: 'urgent', name: 'Urgent', status: 'problem' }, { id: 2, key: 'waiting', name: 'Waiting on them', status: 'warning' }];
let threads = {
  1: { id: 1, subject: 'Defence draft for review', audience: 'client', state: 'open', owner: { id: 1, name: 'Wanjiru' }, contacts: [{ id: 7, name: 'Grace Wambua' }], unread: 1, last_message_at: '2026-11-17 14:40:00',
    messages: [msg({ id: 1, from: { type: 'person', id: 1, name: 'Wanjiru' }, mine: true, body: 'Dear Grace, the draft defence is ready for your comments by Friday.', at: '2026-11-17 09:12:00', sent_to: [{ contact: 'Grace Wambua', channels: ['email'] }] }),
      msg({ id: 2, from: { type: 'contact', id: 7, name: 'Grace Wambua' }, body: 'Paragraph 14 should say the 3rd, not the 5th.', via: 'email', at: '2026-11-17 14:40:00' })] },
  2: { id: 2, subject: 'Strategy before the mention', audience: 'team', state: 'open', owner: { id: 2, name: 'Otieno' }, contacts: [], unread: 0, last_message_at: '2026-11-16 10:00:00', messages: [msg({ id: 3, from: { type: 'person', id: 2, name: 'Otieno' }, body: 'We rely on the delivery note.', at: '2026-11-16 10:00:00' })] },
};
const shape = (t) => ({ tags: [], ...t, people: [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Otieno' }], tag_list: tagList, last: { from: t.messages.at(-1).from.name, text: t.messages.at(-1).body, at: t.messages.at(-1).at } });
const list = (q) => ({ ready: true, threads: Object.values(threads).filter((t) => (q.state ?? 'open') === 'all' || t.state === (q.state ?? 'open')).map(shape), audiences: { team: 'Team', client: 'Client', others: 'Others' },
  contacts: { client: [{ id: 7, name: 'Grace Wambua', email: 'grace@example.test', phone: null, reachable: true }, { id: 8, name: 'Peter Wambua', email: null, phone: null, reachable: false }], others: [] }, team: [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Otieno' }], can: { start: true } });
const one = (id) => ({ thread: { ...shape(threads[id]), can: { write: true, manage: true } } });
await page.route(/\/api\/admin\/projects\/413\/threads(\?.*)?$/, (route) => {
  if (route.request().method() === 'POST') {
    const b = route.request().postDataJSON(); sent.push(['start', b]);
    threads[3] = { id: 3, subject: b.subject, audience: b.audience, state: 'open', owner: { id: 1, name: 'Wanjiru' }, contacts: [{ id: 7, name: 'Grace Wambua' }], unread: 0, last_message_at: 'now', messages: [msg({ id: 9, from: { type: 'person', id: 1, name: 'Wanjiru' }, mine: true, body: b.body, at: '2026-11-18 10:00:00', sent_to: [{ contact: 'Grace Wambua', channels: ['email', 'whatsapp'] }] })] };
    return json(route, one(3), 201);
  }
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['list', q]); return json(route, list(q));
});
await page.route(/\/api\/admin\/projects\/413\/threads\/\d+\/(messages\/\d+(\/task)?|tags)$/, (route) => {
  const url = route.request().url(); const id = Number(url.match(/threads\/(\d+)/)[1]); const m = route.request().method(); const b = route.request().postDataJSON?.() ?? null;
  if (/tags$/.test(url)) { sent.push(['tags', id, b.tags]); threads[id].tags = tagList.filter((g) => b.tags.includes(g.id)); return json(route, one(id)); }
  const mid = Number(url.match(/messages\/(\d+)/)[1]); const x = threads[id].messages.find((y) => y.id === mid);
  if (/task$/.test(url)) { sent.push(['task', id, mid]); x.task_id = 50; return json(route, one(id), 201); }
  if (m === 'DELETE') { sent.push(['remove', id, mid]); x.removed = { by: 'Wanjiru' }; return json(route, one(id)); }
  sent.push(['edit', id, mid, b.body]); x.body = b.body; x.edited = true; return json(route, one(id));
});
await page.route('**/api/admin/projects/time', (route) => { sent.push(['time', route.request().postDataJSON()]); return json(route, { entry: { id: 1 } }, 201); });
await page.route(/\/api\/admin\/projects\/413\/threads\/\d+(\/messages)?$/, (route) => {
  const url = route.request().url(); const id = Number(url.match(/threads\/(\d+)/)[1]); const m = route.request().method();
  if (/messages$/.test(url)) { const b = route.request().postDataJSON(); sent.push(['post', id, b.body, b.mentions ?? []]); threads[id].messages.push(msg({ id: 20 + threads[id].messages.length, from: { type: 'person', id: 1, name: 'Wanjiru' }, mine: true, can_change: true, body: b.body, at: '2026-11-18 10:05:00', sent_to: [{ contact: 'Grace Wambua', channels: ['email'] }] })); return json(route, one(id), 201); }
  if (m === 'PUT') { const b = route.request().postDataJSON(); sent.push(['put', id, b]); threads[id] = { ...threads[id], ...b }; return json(route, one(id)); }
  threads[id].unread = 0; return json(route, one(id));
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=messages')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-messages]').waitFor({ timeout: 15000 });
ok('the conversations are listed with who they are with, the last message and unread counts', /Defence draft for review\s*1\s*Client\s*Grace Wambua\s*Grace Wambua: Paragraph 14/.test(await text(page.locator('[data-thread="Defence draft for review"]'))) && /Team/.test(await text(page.locator('[data-thread="Strategy before the mention"]'))));
await page.locator('[data-thread="Defence draft for review"]').click();
await page.locator('[data-thread-open]').waitFor({ timeout: 5000 });
const t = page.locator('[data-thread-open]');
ok('a client conversation shows what was sent where, and the reply that came in by email', /Answered by Wanjiru/.test(await text(t)) && /sent to Grace Wambua by email/.test(await text(page.locator('[data-message="1"]'))) && /Grace Wambua · .* · replied by email/.test(await text(page.locator('[data-message="2"]'))));
ok('the send button says who it goes to', (await page.getByRole('button', { name: 'Send to Grace Wambua' }).count()) === 1);
await page.getByLabel('Your message').fill('Thank you, Grace. Corrected.');
await page.getByRole('button', { name: 'Send to Grace Wambua' }).click();
await page.waitForTimeout(500);
ok('writing a message sends it and shows it', JSON.stringify(last('post')) === JSON.stringify(['post', 1, 'Thank you, Grace. Corrected.', []]) && /Thank you, Grace\. Corrected\./.test(await text(t)));
await page.screenshot({ path: D + 'projects-messages.png', fullPage: true });

await page.getByRole('button', { name: 'New conversation' }).click();
await page.getByLabel('Subject').fill('Hearing date confirmed');
await page.getByLabel('With').selectOption('client');
ok('a contact with no email or phone cannot be chosen', await page.getByRole('checkbox', { name: /Peter Wambua/ }).isDisabled());
await page.getByRole('checkbox', { name: /Grace Wambua/ }).check();
await page.getByLabel('First message').fill('The hearing is on 3 December at 9:30.');
await page.getByRole('button', { name: 'Start it' }).click();
await page.waitForTimeout(500);
ok('a client conversation is started with its contacts and first message', JSON.stringify(last('start')[1]) === JSON.stringify({ subject: 'Hearing date confirmed', audience: 'client', contacts: [7], owner_id: null, body: 'The hearing is on 3 December at 9:30.' }) && /sent to Grace Wambua by email and whatsapp/.test(await text(page.locator('[data-thread-open]'))));

await page.getByRole('button', { name: 'Close it' }).click();
await page.waitForTimeout(400);
ok('closing it is sent and it leaves the open list', JSON.stringify(last('put').slice(1)) === JSON.stringify([3, { state: 'closed' }]) && (await page.locator('[data-thread="Hearing date confirmed"]').count()) === 0);

// build 6.2, in the team conversation
await page.locator('[data-thread="Strategy before the mention"]').click();
await page.locator('[data-thread-open]').waitFor({ timeout: 5000 });
const box = page.getByLabel('Your message');
await box.click(); await box.pressSequentially('Please check this @Oti');
ok('typing @ suggests people on the work', (await page.getByRole('listbox', { name: 'People' }).getByRole('option', { name: 'Otieno' }).count()) === 1);
await page.getByRole('option', { name: 'Otieno' }).click();
ok('choosing one completes the name', (await box.inputValue()) === 'Please check this @Otieno ');
await box.pressSequentially('#urg');
ok('typing # suggests tags', (await page.getByRole('listbox', { name: 'Tags' }).getByRole('option', { name: /#urgent/ }).count()) === 1);
await page.getByRole('option', { name: /#urgent/ }).click();
await page.getByRole('button', { name: 'Send to the team' }).click();
await page.waitForTimeout(500);
ok('the message is sent with who it mentions', JSON.stringify(last('post')) === JSON.stringify(['post', 2, 'Please check this @Otieno #urgent ', [2]]));
const mine = page.locator('[data-message="21"]');
await mine.getByRole('button', { name: 'Change message 21' }).click();
await page.getByLabel('Change the message').fill('Please check the delivery note @Otieno');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(400);
ok('your own message can be changed', JSON.stringify(last('edit')) === JSON.stringify(['edit', 2, 21, 'Please check the delivery note @Otieno']) && /edited/.test(await text(mine)));
ok('someone else\'s message cannot be changed, but can be made a task', (await page.getByRole('button', { name: 'Change message 3' }).count()) === 0 && (await page.getByRole('button', { name: 'Make message 3 a task' }).count()) === 1);
await page.getByRole('button', { name: 'Make message 3 a task' }).click();
await page.waitForTimeout(400);
ok('making a message a task marks it', JSON.stringify(last('task')) === JSON.stringify(['task', 2, 3]) && /Made into a task/.test(await text(page.locator('[data-message="3"]'))));
await mine.getByRole('button', { name: 'Remove message 21' }).click();
await page.waitForTimeout(400);
ok('removing leaves who removed it', /Removed by Wanjiru/.test(await text(mine)));
await box.fill('/time 1h30 reviewing the note');
await page.getByRole('button', { name: 'Send to the team' }).click();
await page.waitForTimeout(400);
ok('/time logs time on the work instead of sending a message', JSON.stringify(last('time')[1]) === JSON.stringify({ project_id: 413, minutes: 90, note: 'reviewing the note' }) && (await box.inputValue()) === '');
await page.getByRole('button', { name: 'Tags', exact: true }).click();
await page.locator('[data-tag-editor]').getByRole('button', { name: '#waiting' }).click();
await page.waitForTimeout(400);
ok('a conversation can be tagged', JSON.stringify(last('tags')) === JSON.stringify(['tags', 2, [2]]) && /#waiting/.test(await text(page.locator('[data-thread-open]'))));

await finish(c);
