// Browser check: time on the Work tab and the timer (build 5.6): the list with totals, logging time (an Attendance warning shown), starting a
// timer, the timer bar on the page with its clock, Alt+T stopping it, and someone else's time asking why. The API is answered by the check
// itself; rounding, the Attendance check and the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.time.log', 'projects.time.others'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
const words = { project: { name: 'Matter', plural: 'Matters' }, phase: { name: 'Phase', plural: 'Phases' }, task: { name: 'Task', plural: 'Tasks' } };
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words, can: { open: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));

const E = (o) => ({ user_id: 1, person: 'Wanjiru', billable: true, note: null, state: 'draft', source: 'manual', task: null, entered_by_someone_else: false, written_off_minutes: 0, billed: false, ...o });
let entries = [E({ id: 1, work_date: '2026-11-16', minutes: 258, task: { id: 12, ref: 'M-0413-T12', title: 'Draft defence' }, note: 'First draft', source: 'timer' }), E({ id: 2, work_date: '2026-11-16', minutes: 30, person: 'Otieno', user_id: 2, state: 'approved', billable: false })];
const answer = () => ({ ready: true, entries, totals: { minutes: entries.reduce((n, e) => n + e.minutes, 0), billable: entries.filter((e) => e.billable).reduce((n, e) => n + e.minutes, 0) }, everyone: true, me: 1,
  tasks: [{ id: 12, ref: 'M-0413-T12', title: 'Draft defence' }], people: [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Otieno' }], rounding: 6, can: { log: true, others: true } });
await page.route(/\/api\/admin\/projects\/413\/time$/, (route) => json(route, answer()));
await page.route(/\/api\/admin\/projects\/time$/, (route) => {
  const b = route.request().postDataJSON(); sent.push(['log', b]);
  const minutes = Math.ceil((b.hours * 60) / 6) * 6;
  entries = [E({ id: 3, work_date: b.work_date, minutes, note: b.note, user_id: b.user_id ?? 1, person: b.user_id === 2 ? 'Otieno' : 'Wanjiru', entered_by_someone_else: !!b.user_id }), ...entries];
  return json(route, { id: 3, minutes, warnings: b.user_id ? [] : ['That makes 9h 6m logged on Tue 17 Nov, more than the 8h Attendance says was worked.'] }, 201);
});
let timer = null;
await page.route(/\/api\/admin\/projects\/timer(\/stop)?$/, (route) => {
  const m = route.request().method(); const url = route.request().url();
  if (m === 'GET') return json(route, { timer });
  if (/stop$/.test(url)) { sent.push(['stop']); timer = null; entries = [E({ id: 4, work_date: '2026-11-17', minutes: 42, source: 'timer' }), ...entries]; return json(route, { stopped: { id: 4, minutes: 42, warnings: [], capped: false }, timer: null }); }
  if (m === 'DELETE') { timer = null; return json(route, { timer: null }); }
  const b = route.request().postDataJSON(); sent.push(['start', b]);
  timer = { project_id: 413, project: 'M-0413 Imara Sacco v. Baraka Traders', task_id: b.task_id ?? null, task: b.task_id ? 'M-0413-T12 Draft defence' : null, started_at: new Date(Date.now() - 2460000).toISOString(), seconds: 2460, note: null, cap_hours: 10 };
  return json(route, { stopped: null, timer }, 201);
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=work&part=time')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-time]').waitFor({ timeout: 15000 });
ok('the time part totals everyone\'s time and what is billable, and says how it rounds', /Everyone's time here: 4h 48m, of which 4h 18m billable\. Rounded up to 6 minutes\./.test(await text(page.locator('[data-time]'))));
ok('each entry says who, on what, how long and its state', /Wanjiru\s*M-0413-T12 Draft defence\s*First draft\s*4h 18m\s*Timer\s*Draft/.test(await text(page.locator('[data-entry="1"]'))) && /Otieno.*30m\s*Not billable\s*Approved/.test(await text(page.locator('[data-entry="2"]'))) && (await page.locator('[data-entry="2"]').getByRole('button').count()) === 0);

await page.getByRole('button', { name: 'Log time' }).click();
await page.getByLabel('Hours').fill('1.1');
await page.getByLabel('Task').selectOption('12');
await page.getByLabel('What was done').fill('Reviewed the reply');
await page.getByRole('button', { name: 'Log it' }).click();
await page.waitForTimeout(500);
ok('logging sends the hours and task, and shows what Attendance says', last('log')[1].hours === 1.1 && last('log')[1].task_id === '12' && /more than the 8h Attendance says was worked/.test(await text(page.locator('[data-time]'))) && /1h 6m/.test(await text(page.locator('[data-entry="3"]'))));

await page.getByRole('button', { name: 'Log time' }).click();
await page.getByLabel('Whose time').selectOption('2');
ok('logging for someone else asks why', (await page.getByLabel('Why you are logging it for them').count()) === 1);
await page.getByLabel('Hours').fill('0.5');
await page.getByLabel('Why you are logging it for them').fill('He was in court all day');
await page.getByRole('button', { name: 'Log it' }).click();
await page.waitForTimeout(500);
ok('someone else\'s time is sent with whose it is and why', last('log')[1].user_id === 2 && last('log')[1].reason === 'He was in court all day');

// ---------------------------------------------------------------- the timer
await page.getByRole('button', { name: 'Start a timer' }).click();
await page.locator('[data-timer]').waitFor({ timeout: 5000 });
ok('starting a timer shows the timer bar with its clock', last('start')[1].project_id === 413 && /M-0413 Imara Sacco v\. Baraka Traders\s*0:41:/.test(await text(page.locator('[data-timer]'))));
await page.screenshot({ path: D + 'projects-time.png', fullPage: true });
await page.keyboard.press('Alt+KeyT');
await page.waitForTimeout(600);
ok('Alt+T stops it, and the time part shows the new entry', last('stop') && (await page.locator('[data-timer]').count()) === 0 && (await page.locator('[data-entry="4"]').count()) === 1);
await page.keyboard.press('Alt+KeyT');
await page.locator('[data-timer]').waitFor({ timeout: 5000 });
ok('on an open piece of work, Alt+T starts one there', last('start')[1].project_id === 413);

await finish(c);
