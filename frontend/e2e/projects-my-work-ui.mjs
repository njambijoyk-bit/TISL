// Browser check: My Work (build 5.10): this week's time with the running timer and Submit, what waits for the person, key dates coming up,
// their tasks grouped by when, follow-ups due, and G then M opening it from another Projects page. The API is answered by the check itself;
// what is gathered, and who may see it, is proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.time.log', 'projects.time.approve'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: { go_list: 'P', go_new: 'N', go_log: 'L', go_trash: 'T', go_config: 'C', go_mywork: 'M' } }));
const T = (o) => ({ status: 'todo', status_name: 'To do', priority: 'medium', project_id: 413, project: 'M-0413 Imara Sacco v. Baraka Traders', ...o });
let canSubmit = true;
const answer = () => ({ ready: true, today: '2026-11-18', timer: { project_id: 413, project: 'M-0413 Imara Sacco v. Baraka Traders', task_id: 12, task: 'M-0413-T12 Draft defence', started_at: new Date().toISOString(), seconds: 1500, note: null, cap_hours: 10 },
  tasks: { late: [T({ id: 13, ref: 'M-0413-T13', title: 'Client to confirm dates', status: 'waiting', status_name: 'Awaiting client', due_date: '2026-11-15' })], today: [T({ id: 12, ref: 'M-0413-T12', title: 'Draft defence', status: 'doing', status_name: 'Doing', due_date: '2026-11-18', priority: 'high' })],
    week: [], later: [T({ id: 20, ref: 'CV-0009-T2', title: 'Review the lease', project_id: 409, project: 'CV-0009 Duka Fresh lease', due_date: null })] },
  dates: [{ id: 5, title: 'Mention, HCCC 88', starts_at: '2026-11-20 09:30:00', all_day: false, state: 'open', days: 2, mine: true, project_id: 413, project: 'M-0413' }, { id: 6, title: 'Serve the plaint', starts_at: '2026-11-14 00:00:00', all_day: true, state: 'missed', days: -4, mine: false, project_id: 413, project: 'M-0413' }],
  follow_ups: [{ id: 9, what: 'Call about the deposit', late: true, today: false, subject: { type: 'customer', id: 1, name: 'Imara Sacco', url: '/admin/projects/clients/1' } }],
  week: { from: '2026-11-16', to: '2026-11-22', minutes: 750, state: 'open', can_submit: canSubmit }, waiting: { time: 14, changes: 1, approvals: 0 } });
await page.route(/\/api\/admin\/projects\/my-work$/, (route) => json(route, answer()));
await page.route(/\/api\/admin\/projects\/timesheet\/submit$/, (route) => { sent.push(['submit', route.request().postDataJSON().week]); canSubmit = false; return json(route, { submitted: 3 }); });
await page.route(/\/api\/admin\/projects\/timer$/, (route) => json(route, { timer: null }));

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/my-work')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-mw-tasks]').waitFor({ timeout: 15000 });
ok('this week shows the time logged and the running timer', /This week\s*16 Nov 2026 to 22 Nov 2026\s*Timesheet\s*12h 30m\s*Timer on M-0413-T12 Draft defence · 0:25:00/.test(await text(page.locator('[data-mw-week]'))));
ok('what waits for the person is counted', /Time to approve\s*14\s*Changes to decide on\s*1\s*Approvals\s*0/.test(await text(page.locator('[data-mw-waiting]'))));
ok('key dates say how soon, and a missed one says so', /M-0413 · Mention, HCCC 88\s*In 2 days/.test(await text(page.locator('[data-mw-date="Mention, HCCC 88"]'))) && /Missed/.test(await text(page.locator('[data-mw-date="Serve the plaint"]'))));
ok('tasks are grouped by when, in the industry\'s words, linking to the task', /LATE · 1/.test(await text(page.locator('[data-mw-group="late"]'))) && /Awaiting client/.test(await text(page.locator('[data-mw-group="late"]'))) && /TODAY · 1/.test(await text(page.locator('[data-mw-group="today"]'))) && /High/.test(await text(page.locator('[data-mw-group="today"]')))
  && (await page.getByRole('link', { name: 'M-0413-T12 Draft defence' }).getAttribute('href')).endsWith('/admin/projects/413?tab=work&task=12') && (await page.locator('[data-mw-group="week"]').count()) === 0);
ok('follow-ups due are listed', /Imara Sacco\s*Call about the deposit\s*Late/.test(await text(page.locator('[data-mw-follow-ups]'))));
await page.screenshot({ path: D + 'projects-my-work.png', fullPage: true });
await page.getByRole('button', { name: 'Submit the week' }).click();
await page.waitForTimeout(500);
ok('the week is submitted from here', JSON.stringify(sent[0]) === '["submit","2026-11-16"]' && (await page.getByRole('button', { name: 'Submit the week' }).count()) === 0);

// G then M from another Projects page
await page.route(/\/api\/admin\/projects\/timesheet(\?.*)?$/, (route) => json(route, { ready: true, person: { id: 1, name: 'Wanjiru' }, from: '2026-11-16', to: '2026-11-22', days: [], lines: [], totals: [], attendance: [], state: 'empty', counts: {}, can: { submit: false } }));
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/timesheet')}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.keyboard.press('KeyG');
await page.keyboard.press('KeyM');
await page.locator('[data-mw-tasks]').waitFor({ timeout: 8000 }).catch(() => {});
ok('G then M opens My Work', (await page.locator('[data-mw-tasks]').count()) === 1);

await finish(c);
