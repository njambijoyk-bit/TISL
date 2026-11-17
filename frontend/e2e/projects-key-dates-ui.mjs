// Browser check: key dates on the Work tab (build 5.4): the list with how soon each is, adding one with a time and someone responsible, moving
// one (asking why, and showing where it was), marking one done, and key dates as diamonds on the timeline. The API is answered by the check
// itself; the warnings, the calendar and the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.dates', 'projects.tasks'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
const words = { project: { name: 'Matter', plural: 'Matters' }, phase: { name: 'Phase', plural: 'Phases' }, task: { name: 'Task', plural: 'Tasks' }, scope_line: { name: 'Fee line', plural: 'Fee schedule' }, key_date: { name: 'Court date', plural: 'Court dates' } };
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words, can: { open: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));

const iso = (days, time = '00:00:00') => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.toISOString().slice(0, 10)} ${time}`; };
const K = (o) => ({ kind: null, kind_name: null, all_day: true, state: 'open', responsible: null, phase_id: null, task: null, warn_days: null, moved_from: null, move_reason: null, moved_by: null, ...o });
let dates = [K({ id: 1, title: 'Mention, HCCC 88', kind: 'mention', kind_name: 'Mention', starts_at: iso(2, '09:30:00'), all_day: false, days: 2, responsible: { id: 2, name: 'Otieno' } }),
  K({ id: 2, title: 'Filing deadline: defence', kind: 'filing', kind_name: 'Filing deadline', starts_at: iso(12), days: 12 }), K({ id: 3, title: 'Serve the plaint', starts_at: iso(-3), days: -3, state: 'missed' })];
const answer = () => ({ ready: true, dates, kinds: [{ key: 'hearing', name: 'Hearing' }, { key: 'mention', name: 'Mention' }, { key: 'filing', name: 'Filing deadline' }], people: [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Otieno' }], phases: [], tasks: [], warn_days: '14,7,1', can: { manage: true } });
await page.route(/\/api\/admin\/projects\/413\/key-dates(\/\d+)?(\?.*)?$/, (route) => {
  const m = route.request().method(); const b = route.request().postDataJSON?.() ?? null; const id = Number((route.request().url().match(/key-dates\/(\d+)/) || [])[1]);
  if (m === 'POST') { sent.push(['add', b]); dates = [...dates, K({ id: 4, title: b.title, kind: b.kind, kind_name: 'Hearing', starts_at: `${b.date} ${b.time ? `${b.time}:00` : '00:00:00'}`, all_day: !b.time, days: 20, responsible: { id: Number(b.responsible_id), name: 'Otieno' } })]; return json(route, answer(), 201); }
  if (m === 'PUT' && b.reason) { sent.push(['move', id, b]); dates = dates.map((d) => (d.id === id ? { ...d, moved_from: d.starts_at, move_reason: b.reason, moved_by: 'Wanjiru', starts_at: `${b.date} 00:00:00`, days: 19 } : d)); return json(route, answer()); }
  if (m === 'PUT' && 'done' in b) { sent.push(['done', id, b.done]); dates = dates.map((d) => (d.id === id ? { ...d, state: b.done ? 'done' : 'open' } : d)); return json(route, answer()); }
  return json(route, answer());
});
await page.route(/\/api\/admin\/projects\/413\/tasks(\?.*)?$/, (route) => json(route, { ready: true, tasks: [{ id: 12, number: 12, ref: 'M-0413-T12', title: 'Draft defence', depth: 0, parent_id: null, phase_id: null, status: 'doing', priority: 'medium', start_date: iso(-2).slice(0, 10), due_date: iso(5).slice(0, 10), overdue: false, estimate_minutes: null, logged_minutes: 0, billable: null, people: [], mine: true, checks: { total: 0, done: 0 }, waits_for: [] }],
  statuses: { todo: 'To do', doing: 'Doing', waiting: 'Awaiting client', done: 'Done', cancelled: 'Cancelled' }, priorities: { medium: 'Medium' }, phases: [], people: [], billable_default: true, can: { manage: true } }));

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=work&part=dates')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-key-dates]').waitFor({ timeout: 15000 });
ok('the key dates are named in the industry\'s words and say how soon each is', /Court dates/.test(await text(page.locator('[data-work-parts]'))) && /Mention, HCCC 88\s*Mention\s*Otieno\s*In 2 days/.test(await text(page.locator('[data-key-date="Mention, HCCC 88"]'))) && /, 09:30/.test(await text(page.locator('[data-key-date="Mention, HCCC 88"]'))) && /Missed/.test(await text(page.locator('[data-key-date="Serve the plaint"]'))));
ok('the warning days are said', /Warnings 14, 7, 1 days before/.test(await text(page.locator('[data-key-dates]'))));

await page.getByRole('button', { name: 'Add a date' }).click();
await page.getByLabel('What it is').fill('Hearing of the application');
await page.getByLabel('Kind').selectOption('hearing');
await page.getByLabel('Date', { exact: true }).fill('2026-12-15');
await page.getByLabel('Time (empty: all day)').fill('10:00');
await page.getByLabel('Responsible').selectOption('2');
await page.getByLabel('Its own warnings (days before)').fill('21,7');
await page.getByRole('button', { name: 'Add the date' }).click();
await page.waitForTimeout(500);
const a = last('add')[1];
ok('a new date is sent with its kind, time, the person responsible and its own warnings', a.title === 'Hearing of the application' && a.kind === 'hearing' && a.date === '2026-12-15' && a.time === '10:00' && a.responsible_id === '2' && a.warn_days === '21,7', JSON.stringify(a));

await page.getByRole('button', { name: 'Move Filing deadline: defence' }).click();
await page.getByLabel('New date').fill('2026-12-05');
await page.getByLabel('Why it moved').fill('Extension granted by consent');
await page.getByRole('button', { name: 'Move it' }).click();
await page.waitForTimeout(500);
ok('moving a date sends the reason, and the list shows where it was', JSON.stringify(last('move')) === JSON.stringify(['move', 2, { date: '2026-12-05', time: '', reason: 'Extension granted by consent' }]) && /moved from .* by Wanjiru: Extension granted by consent/.test(await text(page.locator('[data-key-date="Filing deadline: defence"]'))));
await page.getByRole('button', { name: 'Mark Mention, HCCC 88 done' }).click();
await page.waitForTimeout(400);
ok('marking a date done is sent and shown', JSON.stringify(last('done')) === JSON.stringify(['done', 1, true]) && /Done/.test(await text(page.locator('[data-key-date="Mention, HCCC 88"] td:nth-child(4)'))));
await page.screenshot({ path: D + 'projects-key-dates.png', fullPage: true });

await page.locator('[data-work-parts]').getByRole('button', { name: 'Tasks' }).click();
await page.getByRole('button', { name: 'Timeline', exact: true }).click();
await page.locator('[data-timeline]').waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
ok('key dates not done are diamonds on the timeline', (await page.locator('[data-key-date-mark]').count()) === 3 && (await page.locator('[data-key-date-mark="Mention, HCCC 88"]').count()) === 0);

await finish(c);
