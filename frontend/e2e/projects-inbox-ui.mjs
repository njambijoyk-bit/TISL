// Browser check: the inbox (builds 6.3 and 6.5): conversations across all the person's work with unread counts, the views (unread, mentions, mine to
// answer) with their totals, the filters going to the server and into the address, and a line opening its conversation; then following the
// work and a conversation from the Messages tab. The API is answered by the check itself; who sees what and who is told are proved by the
// backend tests. It needs only the website (npx vite --port 5177).
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
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: { go_inbox: 'I' } }));
const row = (o) => ({ state: 'open', tags: [], contacts: [], owner: { id: 1, name: 'Wanjiru' }, unread: 0, mentioned: false, mine: false, ...o });
const all = [
  row({ id: 1, subject: 'Defence draft for review', audience: 'client', contacts: [{ id: 7, name: 'Grace Wambua' }], unread: 2, mentioned: true, tags: [{ id: 1, key: 'urgent', name: 'Urgent', status: 'problem' }], project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders' }, last_message_at: '2026-11-18 09:40:00', last: { from: 'Grace Wambua', text: 'Paragraph 14 should say the 3rd.' } }),
  row({ id: 5, subject: 'Paint colours', audience: 'team', mine: true, project: { id: 420, number: 'J-0420', title: 'Office fit-out' }, last_message_at: '2026-11-17 16:00:00', last: { from: 'Otieno', text: 'Grey or white?' } }),
];
let waiting = [
  { id: 31, channel: 'email', from: 'grace@example.test', from_name: 'Grace Wambua', subject: 'Did you get my letter?', body: 'I posted it on Monday.', received_at: '2026-11-18 08:10:00', note: 'No reply address it answers was found in it.', matches: [{ thread_id: 1, label: 'M-0413 · Defence draft for review', contact_id: 7, contact: 'Grace Wambua' }] },
  { id: 32, channel: 'whatsapp', from: '+254799999999', from_name: null, subject: null, body: 'Win a prize', received_at: '2026-11-18 08:20:00', note: 'Nothing open wrote to this number.', matches: [] },
];
await page.route('**/api/admin/projects/replies/waiting', (route) => json(route, { ready: true, replies: waiting }));
await page.route(/\/api\/admin\/projects\/replies\/\d+\/(file|discard)$/, (route) => {
  const [, id, act] = route.request().url().match(/replies\/(\d+)\/(file|discard)$/); sent.push([act, Number(id), route.request().postDataJSON()]);
  waiting = waiting.filter((w) => w.id !== Number(id)); return json(route, { ready: true, replies: waiting });
});
await page.route(/\/api\/admin\/projects\/inbox(\?.*)?$/, (route) => {
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['inbox', q]);
  let threads = all;
  if (q.unread) threads = threads.filter((t) => t.unread);
  if (q.mentions) threads = threads.filter((t) => t.mentioned);
  if (q.mine) threads = threads.filter((t) => t.mine);
  if (q.project_id) threads = threads.filter((t) => String(t.project.id) === q.project_id);
  if (q.tag) threads = threads.filter((t) => t.tags.some((g) => g.key === q.tag));
  return json(route, { ready: true, threads, totals: { unread: 1, mentions: 1, mine: 1 }, audiences: { team: 'Team', client: 'Client', others: 'Others' }, tags: [{ id: 1, key: 'urgent', name: 'Urgent' }],
    projects: [{ id: 413, label: 'M-0413 Imara Sacco v. Baraka Traders' }, { id: 420, label: 'J-0420 Office fit-out' }], all: false, waiting_replies: waiting.length });
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/inbox')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-inbox]').waitFor({ timeout: 15000 });
ok('conversations from all the work are listed, newest first, with unread counts and what they are', /Defence draft for review Client Mentions you #urgent M-0413 Imara Sacco v\. Baraka Traders · with Grace Wambua Grace Wambua: Paragraph 14.*2 new/.test(await text(page.locator('[data-inbox-thread="Defence draft for review"]')))
  && /Paint colours Team Yours to answer J-0420 Office fit-out/.test(await text(page.locator('[data-inbox-thread="Paint colours"]'))));
ok('the views show their totals', (await page.getByRole('tab', { name: 'Unread · 1' }).count()) === 1 && (await page.getByRole('tab', { name: 'Mentions · 1' }).count()) === 1 && (await page.getByRole('tab', { name: 'Mine to answer · 1' }).count()) === 1);
await page.screenshot({ path: D + 'projects-inbox.png', fullPage: true });
await page.getByRole('tab', { name: 'Mine to answer · 1' }).click();
await page.waitForTimeout(400);
ok('a view asks the server for just those', JSON.stringify(last('inbox')[1]) === JSON.stringify({ mine: '1' }) && (await page.locator('[data-inbox-thread]').count()) === 1);
await page.getByRole('tab', { name: 'Everything' }).click();
await page.getByLabel('Tag').selectOption('urgent');
await page.waitForTimeout(400);
ok('filtering by tag asks the server', last('inbox')[1].tag === 'urgent' && (await page.locator('[data-inbox-thread]').count()) === 1);
await page.getByLabel('Tag').selectOption('');
await page.getByLabel('Piece of work').selectOption('420');
await page.waitForTimeout(400);
ok('filtering by piece of work asks the server', last('inbox')[1].project_id === '420' && (await text(page.locator('[data-inbox]'))).includes('Paint colours'));
ok('a line opens its conversation on its work', (await page.locator('[data-inbox-thread="Paint colours"]').getAttribute('href')) === '/admin/projects/420?tab=messages&thread=5');

// replies waiting (a moderator)
await page.getByRole('tab', { name: 'Replies waiting · 2' }).click();
await page.locator('[data-waiting-replies]').waitFor({ timeout: 5000 });
ok('replies nothing could match wait, with why and the conversations their sender is in', /Email Grace Wambua · grace@example\.test .*Did you get my letter\? I posted it on Monday\. Why it waits: No reply address it answers was found in it\./.test(await text(page.locator('[data-reply="31"]'))) && /No conversation has this sender/.test(await text(page.locator('[data-reply="32"]'))));
await page.screenshot({ path: D + 'projects-replies-waiting.png', fullPage: true });
await page.getByLabel('File reply 31 into').selectOption('1:7');
await page.locator('[data-reply="31"]').getByRole('button', { name: 'File it' }).click();
await page.waitForTimeout(400);
ok('filing one sends the conversation and who it is from', JSON.stringify(last('file')) === JSON.stringify(['file', 31, { thread_id: 1, contact_id: 7 }]) && (await page.locator('[data-reply="31"]').count()) === 0);
await page.locator('[data-reply="32"]').getByRole('button', { name: 'Throw it away' }).click();
await page.waitForTimeout(400);
ok('throwing one away is sent and the list empties', last('discard')[1] === 32 && /Nothing is waiting\./.test(await text(page.locator('[data-waiting-replies]'))));

// following, from the Messages tab
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words: { project: { name: 'Matter', plural: 'Matters' } }, can: { open: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));
let projectFollow = { on: false, automatic: false };
let threadFollow = { on: true, automatic: true };
const thread = () => ({ id: 1, subject: 'Defence draft for review', audience: 'team', state: 'open', tags: [], owner: { id: 1, name: 'Wanjiru' }, contacts: [], unread: 0, last_message_at: '2026-11-18 09:40:00', last: null, people: [], tag_list: [],
  messages: [{ id: 1, from: { type: 'person', id: 2, name: 'Otieno' }, body: 'Have a look.', via: 'app', at: '2026-11-18 09:40:00', sent_to: null, edited: false, removed: null, task_id: null, mine: false, can_change: false }], following: threadFollow, can: { write: true, manage: true } });
await page.route(/\/api\/admin\/projects\/413\/threads(\?.*)?$/, (route) => json(route, { ready: true, threads: [thread()], audiences: { team: 'Team' }, contacts: { client: [], others: [] }, team: [], following: projectFollow, can: { start: true } }));
await page.route(/\/api\/admin\/projects\/413\/threads\/1$/, (route) => json(route, { thread: thread() }));
await page.route('**/api/admin/projects/413/follow', (route) => {
  const b = route.request().postDataJSON(); sent.push(['follow', b]);
  if (b.type === 'project') projectFollow = { on: b.on, automatic: false }; else threadFollow = { on: b.on, automatic: true };
  return json(route, { following: b.type === 'project' ? projectFollow : threadFollow });
});
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=messages&thread=1')}`, { waitUntil: 'networkidle' });
await page.locator('[data-thread-open]').waitFor({ timeout: 15000 });
ok('someone in a conversation follows it on their own, and the work is not followed yet', (await page.locator('[data-follow="this conversation"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('[data-follow="this work"]').getAttribute('aria-pressed')) === 'false');
await page.locator('[data-follow="this work"]').click();
await page.waitForTimeout(400);
ok('following the work is sent and shown', JSON.stringify(last('follow')[1]) === JSON.stringify({ type: 'project', id: 413, on: true }) && (await page.locator('[data-follow="this work"]').innerText()) === 'Following');
await page.locator('[data-follow="this conversation"]').click();
await page.waitForTimeout(400);
ok('stopping following a conversation is sent and shown', JSON.stringify(last('follow')[1]) === JSON.stringify({ type: 'thread', id: 1, on: false }) && (await page.locator('[data-follow="this conversation"]').innerText()) === 'Follow');

await finish(c);
