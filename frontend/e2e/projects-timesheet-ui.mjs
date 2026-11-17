// Browser check: the timesheet (build 5.7). My week: work and task by day, totals, what Attendance says (a day over it flagged), a sent-back
// note, moving between weeks and submitting. To approve: time by person, ticking it and approving it, or sending it back with a note.
// The API is answered by the check itself; who may approve, and locking, are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.time.log', 'projects.time.approve'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
let state = 'returned';
const week = (from) => ({ ready: true, person: { id: 1, name: 'Kamau' }, from, to: days[6], days, state,
  lines: [{ project_id: 413, project: 'M-0413 Imara Sacco v. Baraka Traders', task: 'M-0413-T12 Draft defence', days: [180, 78, 0, 0, 0, 0, 0], total: 258, states: ['draft'], entries: [{ id: 1, work_date: '2026-11-16', minutes: 180, state: 'draft' }, { id: 2, work_date: '2026-11-17', minutes: 78, state: state === 'returned' ? 'returned' : state, return_note: 'Tuesday was a public holiday' }] },
    { project_id: 409, project: 'CV-0009 Duka Fresh lease', task: null, days: [120, 372, 0, 0, 0, 0, 0], total: 492, states: ['draft'], entries: [] }],
  totals: [300, 450, 0, 0, 0, 0, 0], attendance: [{ status: 'present', minutes: 485 }, { status: 'present', minutes: 400 }, null, null, null, { status: 'off', minutes: 0 }, { status: 'off', minutes: 0 }],
  counts: {}, can: { submit: state !== 'submitted' } });
await page.route(/\/api\/admin\/projects\/timesheet(\?.*)?$/, (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['week', q.week ?? null]); return json(route, week(days[0])); });
await page.route(/\/api\/admin\/projects\/timesheet\/submit$/, (route) => { sent.push(['submit', route.request().postDataJSON().week]); state = 'submitted'; return json(route, { submitted: 2, ...week(days[0]) }); });
let queue = [{ user_id: 2, person: 'Njeri', minutes: 390, entries: [{ id: 11, work_date: '2026-11-16', minutes: 150, billable: true, note: 'Research', project: 'M-0413 Imara Sacco v. Baraka Traders', task: null }, { id: 12, work_date: '2026-11-17', minutes: 240, billable: false, note: null, project: 'M-0413 Imara Sacco v. Baraka Traders', task: 'M-0413-T13 Client to confirm dates' }] }];
const q = (extra = {}) => ({ ...extra, ready: true, people: queue, count: queue.reduce((n, p) => n + p.entries.length, 0), approve_by: 'lead' });
await page.route(/\/api\/admin\/projects\/timesheet\/approvals$/, (route) => {
  if (route.request().method() === 'GET') return json(route, q());
  const b = route.request().postDataJSON(); sent.push(['decide', b]);
  queue = queue.map((p) => ({ ...p, entries: p.entries.filter((e) => !b.ids.includes(e.id)) })).filter((p) => p.entries.length);
  return json(route, q({ done: b.ids.length }));
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/timesheet')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-week]').waitFor({ timeout: 15000 });
ok('the week is a grid of work and task by day, with a total each', /M-0413-T12 Draft defence\s*3h\s*1h 18m.*4h 18m/.test(await text(page.locator('[data-line="M-0413-T12 Draft defence"]'))) && /CV-0009 Duka Fresh lease\s*2h\s*6h 12m.*8h 12m/.test(await text(page.locator('[data-line="CV-0009 Duka Fresh lease"]'))));
ok('what Attendance says sits under each day, and a day over it is flagged', /Attendance says\s*8h 5m\s*6h 40m\s*off\s*off/.test(await text(page.locator('[data-attendance]'))) && (await page.locator('[data-totals] [data-over="yes"]').count()) === 1);
ok('a sent-back entry shows why', /Tue 17 Nov, M-0413-T12 Draft defence: Tuesday was a public holiday/.test(await text(page.locator('[data-week]'))) && /Some sent back/.test(await text(page.locator('[data-week]'))));
await page.screenshot({ path: D + 'projects-timesheet.png', fullPage: true });
await page.getByRole('button', { name: 'The week before' }).click();
await page.waitForTimeout(400);
ok('moving to the week before asks for it', last('week')[1] === '2026-11-09');
await page.getByRole('button', { name: 'Submit the week' }).click();
await page.waitForTimeout(400);
ok('submitting sends the week and shows it submitted', last('submit')[1] === '2026-11-16' && /Submitted/.test(await text(page.locator('[data-week]'))) && (await page.getByRole('button', { name: 'Submit the week' }).count()) === 0);

// ---------------------------------------------------------------- approving
await page.getByRole('tab', { name: /To approve/ }).click();
await page.locator('[data-approvals]').waitFor({ timeout: 5000 });
ok('time waiting is listed by person with the total', /Njeri\s*· 6h 30m/.test(await text(page.locator('[data-person="Njeri"]'))) && /Research/.test(await text(page.locator('[data-person="Njeri"]'))));
await page.getByLabel('Njeri, Mon 16 Nov, 2h 30m').check();
await page.getByRole('button', { name: 'Approve 1' }).click();
await page.waitForTimeout(400);
ok('approving the ticked time sends it', JSON.stringify(last('decide')[1].ids) === '[11]' && last('decide')[1].step === 'approve');
await page.getByLabel("All of Njeri's time").check();
await page.getByRole('button', { name: 'Send back 1' }).click();
await page.getByLabel('What needs changing').fill('Which task was this?');
await page.getByRole('button', { name: 'Send it back' }).click();
await page.waitForTimeout(400);
ok('sending back needs a note and sends it', JSON.stringify(last('decide')[1]) === JSON.stringify({ ids: [12], step: 'return', note: 'Which task was this?' }) && /Nothing waits for you/.test(await text(page.locator('[data-approvals]'))));

await finish(c);
