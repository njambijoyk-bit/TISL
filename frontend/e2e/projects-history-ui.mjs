// Browser check: history and next actions (build 3.4): the history on a lead (logging a call with a contact, team only, changing one's own entry),
// setting a next action, marking it done with what happened and what is next, and the My follow-ups page.
// The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 2, name: 'Njeri', email: 'njeri@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.leads.manage', 'projects.leads.view', 'projects.interactions'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

const KINDS = { call: 'Call', meeting: 'Meeting', visit: 'Visit', email: 'Email', note: 'Note' };
const OWNERS = [{ id: 1, name: 'Kamau' }, { id: 2, name: 'Njeri' }];
const lead = { id: 1, name: 'Tumaini Academy', contact_name: 'Grace Wambua', email: null, phone: null, industry: null, source: null, referred_by: null, owner: { id: 2, name: 'Njeri' }, status: 'working', lost: null, customer_id: null, created_at: '2026-11-14 09:00:00', next: null, notes: null, can: { change: true } };
let entries = [{ id: 1, kind: 'note', kind_name: 'Note', summary: 'Prefers WhatsApp to email', happened_at: '2026-11-14 09:30:00', by: 'Kamau', contact: null, project: null, opportunity: null, team_only: false, mine: false }];
let next = [{ id: 7, what: 'First call', due_on: '2026-11-13', owner: { id: 2, name: 'Njeri' }, late: true, today: false, days_late: 3, subject_type: 'lead' }];
const history = () => ({ entries, next, kinds: KINDS, owners: OWNERS, can: { write: true, next: true } });
const contacts = [{ id: 11, name: 'Grace Wambua', job_title: 'Head teacher', email: null, phone: null, is_main: true, notes: null, roles: [] }];

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'general', company_industry: 'general', names: { project: { name: 'Project', plural: 'Projects' } }, keys: {} }));
await page.route(/\/api\/admin\/projects\/leads\/1$/, (route) => json(route, { lead }));
await page.route(/\/api\/admin\/projects\/pipeline\/of\/lead\/1$/, (route) => json(route, { opportunities: [] }));
await page.route(/\/api\/admin\/projects\/contacts\/lead\/1$/, (route) => json(route, { contacts, roles: [], can: { change: true } }));
await page.route(/\/api\/admin\/projects\/history\/(lead\/1|entries\/\d+)$/, (route) => {
  const method = route.request().method(); const id = Number((route.request().url().match(/entries\/(\d+)$/) || [])[1]); const b = method === 'GET' || method === 'DELETE' ? null : route.request().postDataJSON();
  if (method === 'POST') { sent.push(['log', b]); if (!b.summary.trim()) return json(route, { message: 'Say what was said or done.' }, 422); entries = [{ id: 2, kind: b.kind, kind_name: KINDS[b.kind], summary: b.summary, happened_at: '2026-11-16 10:00:00', by: 'Njeri', contact: b.contact_id ? { id: 11, name: 'Grace Wambua' } : null, project: null, opportunity: null, team_only: b.team_only, mine: true }, ...entries]; }
  if (method === 'PUT') { sent.push(['change', id, b]); entries = entries.map((e) => (e.id === id ? { ...e, summary: b.summary } : e)); }
  if (method === 'DELETE') { sent.push(['remove', id]); entries = entries.filter((e) => e.id !== id); }
  return json(route, history(), method === 'POST' ? 201 : 200);
});
await page.route(/\/api\/admin\/projects\/next\/(lead\/1|\d+\/done)$/, (route) => {
  const b = route.request().postDataJSON(); const id = Number((route.request().url().match(/next\/(\d+)\/done$/) || [])[1]);
  if (!id) { sent.push(['next', b]); next = [...next, { id: 8, what: b.what, due_on: b.due_on, owner: OWNERS.find((o) => o.id === (b.owner_id || 2)), late: false, today: false, days_late: 0, subject_type: 'lead' }]; return json(route, history(), 201); }
  sent.push(['done', id, b]);
  if (!b.no_next && !b.next_what) return json(route, { message: 'Say what happens next, or that nothing more is planned.' }, 422);
  const was = next.find((n) => n.id === id); next = next.filter((n) => n.id !== id);
  if (b.summary) entries = [{ id: 3, kind: b.kind, kind_name: KINDS[b.kind], summary: b.summary, happened_at: '2026-11-16 10:05:00', by: 'Njeri', contact: null, project: null, opportunity: null, team_only: false, mine: true }, ...entries];
  if (!b.no_next) next = [...next, { id: 9, what: b.next_what, due_on: b.next_due, owner: OWNERS.find((o) => o.id === b.next_owner_id), late: false, today: false, days_late: 0, subject_type: 'lead' }];
  if (b.from_list) { mine = mine.filter((f) => f.id !== id); return json(route, myPage()); }
  return json(route, history());
});
let mine = [
  { id: 21, what: 'Quarterly review', due_on: '2026-11-07', owner: { id: 2, name: 'Njeri' }, late: true, today: false, days_late: 9, subject_type: 'customer', subject: { type: 'customer', id: 1, name: 'Imara Sacco', url: '/admin/projects/clients/1' } },
  { id: 22, what: 'Send fee proposal', due_on: '2026-11-16', owner: { id: 2, name: 'Njeri' }, late: false, today: true, days_late: 0, subject_type: 'lead', subject: { type: 'lead', id: 1, name: 'Tumaini Academy', url: '/admin/projects/leads/1' } },
  { id: 23, what: 'Chase the board', due_on: '2026-11-21', owner: { id: 2, name: 'Njeri' }, late: false, today: false, days_late: 0, subject_type: 'opportunity', subject: { type: 'opportunity', id: 4, name: 'Classroom block', url: '/admin/projects/pipeline?open=4' } }];
const myPage = () => ({ items: mine, counts: { late: mine.filter((f) => f.late).length, today: mine.filter((f) => f.today).length, later: mine.filter((f) => !f.late && !f.today).length }, sees_all: true, ready: true, kinds: KINDS, owners: OWNERS });
await page.route('**/api/admin/projects/follow-ups**', (route) => { sent.push(['mine', Object.fromEntries(new URL(route.request().url()).searchParams)]); return json(route, myPage()); });

// ---------------------------------------------------------------- the history on a lead
await go('/admin/projects/leads/1');
await page.locator('[data-history="lead"]').waitFor({ timeout: 15000 });
ok('the next action shows at the top, late in red', /Next: First call · Njeri/.test(await text(page.locator('[data-next="First call"]'))) && /3 days late/.test(await text(page.locator('[data-next="First call"]'))));
ok('the history shows who wrote what and when', /Note · Kamau/.test(await text(page.locator('[data-entry="1"]'))) && /Prefers WhatsApp to email/.test(await text(page.locator('[data-entry="1"]'))));
ok('someone else\'s entry cannot be changed here', (await page.locator('[data-entry="1"]').getByRole('button').count()) === 0);
await page.getByRole('button', { name: 'Log a call or note' }).click();
await page.getByLabel('With').selectOption('11');
await page.getByLabel('What was said or done').fill('Spoke to the head teacher about the block');
await page.getByLabel('Team only: never shown to the client').check();
await page.getByRole('button', { name: 'Log it' }).click();
await page.locator('[data-entry="2"]').waitFor({ timeout: 5000 });
ok('a call is logged with who it was with and team only', JSON.stringify(last('log')[1]) === JSON.stringify({ kind: 'call', summary: 'Spoke to the head teacher about the block', contact_id: 11, team_only: true }) && /Call · Njeri with Grace Wambua/.test(await text(page.locator('[data-entry="2"]'))) && /Team only/.test(await text(page.locator('[data-entry="2"]'))));
await page.locator('[data-entry="2"]').getByRole('button', { name: /^Change/ }).click();
await page.getByLabel('What was said or done').fill('Spoke to the head teacher about the two-storey block');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(400);
ok('my own entry can be changed', last('change')[2].summary === 'Spoke to the head teacher about the two-storey block' && /two-storey/.test(await text(page.locator('[data-entry="2"]'))));
await page.screenshot({ path: D + 'projects-history.png', fullPage: true });

// ---------------------------------------------------------------- done, and what is next
await page.getByRole('button', { name: 'Mark "First call" done' }).click();
await page.locator('[data-done-form="7"]').waitFor({ timeout: 5000 });
await page.getByLabel('What happened (kept in the history)').fill('Called; they want a site visit');
await page.getByLabel('Nothing more is planned').check();
await page.getByLabel('Nothing more is planned').uncheck();
await page.getByRole('button', { name: 'Mark it done' }).click();
ok('done without saying what is next is stopped by the form', (await page.locator('[data-done-form="7"]').count()) === 1 && !last('done'));
await page.getByLabel('What is next').fill('Site visit');
await page.getByLabel('By').fill('2026-11-21');
await page.getByLabel('Whose').selectOption('1');
await page.screenshot({ path: D + 'projects-done.png', fullPage: true });
await page.getByRole('button', { name: 'Mark it done' }).click();
await page.locator('[data-next="Site visit"]').waitFor({ timeout: 5000 });
const d = last('done')[2];
ok('done sends what happened and what is next, and whose', d.kind === 'call' && d.summary === 'Called; they want a site visit' && d.next_what === 'Site visit' && d.next_due === '2026-11-21' && d.next_owner_id === 1 && d.no_next === false, JSON.stringify(d));
ok('what happened is now in the history and the new next action is shown', /Called; they want a site visit/.test(await text(page.locator('[data-entry="3"]'))) && /Kamau/.test(await text(page.locator('[data-next="Site visit"]'))) && (await page.locator('[data-next="First call"]').count()) === 0);
await page.getByRole('button', { name: 'Set a next action' }).click();
await page.getByLabel('What is next').fill('Send the drawings');
await page.getByRole('button', { name: 'Set it' }).click();
await page.locator('[data-next="Send the drawings"]').waitFor({ timeout: 5000 });
ok('a next action is set, mine unless given to someone', last('next')[1].what === 'Send the drawings' && last('next')[1].owner_id === undefined);

// ---------------------------------------------------------------- my follow-ups
await go('/admin/projects/follow-ups');
await page.locator('[data-follow-up="Quarterly review"]').waitFor({ timeout: 15000 });
ok('my follow-ups list late first, with counts', /1 late/.test(await text()) && /1 today/.test(await text()) && /1 later/.test(await text()) && (await page.locator('[data-follow-up]').evaluateAll((els) => els.map((e) => e.getAttribute('data-follow-up')))).join() === 'Quarterly review,Send fee proposal,Chase the board');
ok('each says what it is on and links there', /Client: Imara Sacco/.test(await text(page.locator('[data-follow-up="Quarterly review"]'))) && (await page.getByRole('link', { name: 'Classroom block' }).getAttribute('href')).endsWith('/admin/projects/pipeline?open=4'));
await page.screenshot({ path: D + 'projects-follow-ups.png', fullPage: true });
await page.getByRole('button', { name: 'Mark "Quarterly review" done' }).click();
await page.getByLabel('Nothing more is planned').check();
await page.getByRole('button', { name: 'Mark it done' }).click();
await page.waitForTimeout(500);
ok('one can be done from the list, saying nothing more is planned', last('done')[2].no_next === true && last('done')[2].from_list === true && (await page.locator('[data-follow-up="Quarterly review"]').count()) === 0 && /0 late/.test(await text()));
await page.getByRole('button', { name: 'Everyone\'s' }).click();
await page.waitForTimeout(300);
ok('someone who may see every lead can see everyone\'s', last('mine')[1].scope === 'all');

await finish(c);
