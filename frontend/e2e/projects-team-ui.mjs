// Browser check: the team view and a person's page (build 8.1). Who is carrying what this week, the filters going to the server, and one
// person's tasks, week and HR record. The API is answered by the check itself; who may see whom is proved by ProjectsTeamViewTest.
// It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.team.view', 'projects.team.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
const row = (o) => ({ job_title: null, department: 'Litigation', skills: [], tasks: { open: 0, late: 0 }, week: { minutes: 0, capacity: 2400 }, dates: 0, meetings: 0, away: [], work: [], me: false, expiring: 0, ...o });
const people = [
  row({ id: 2, name: 'Kamau', job_title: 'Associate', skills: ['Drafting', 'Court work'], tasks: { open: 6, late: 2 }, week: { minutes: 2580, capacity: 2400 }, dates: 1, meetings: 3, work: [{ id: 413, number: 'M-0413', title: 'Imara v Baraka' }] }),
  row({ id: 3, name: 'Njeri', job_title: 'Clerk', skills: ['Filing'], tasks: { open: 2, late: 0 }, week: { minutes: 600, capacity: 1920 }, away: ['2026-11-20'], expiring: 1, work: [{ id: 413, number: 'M-0413', title: 'Imara v Baraka' }] }),
  row({ id: 1, name: 'Wanjiru', job_title: 'Partner', me: true }),
];
await page.route(/\/api\/admin\/projects\/team(\?.*)?$/, (route) => {
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['team', q]);
  let list = people;
  if (q.late) list = list.filter((p) => p.tasks.late > 0);
  if (q.skill) list = list.filter((p) => p.skills.includes(q.skill));
  return json(route, { week: { from: '2026-11-16', to: '2026-11-22' }, people: list, departments: ['Litigation'], skills: ['Court work', 'Drafting', 'Filing'], projects: [{ id: 413, number: 'M-0413', title: 'Imara v Baraka' }] });
});
await page.route('**/api/admin/projects/team/3', (route) => json(route, { person: { ...people[1], task_list: [{ id: 9, ref: 'M-0413-T4', title: 'File the bundle', status: 'todo', due_date: '2026-11-25', late: false, project_id: 413 }],
  days: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map((d, i) => ({ date: d, minutes: [240, 360, 0, 0, 0, 0, 0][i] })),
  certificates: [{ name: 'First aid', issuer: 'Red Cross', date: '2024-12-01', expires_on: '2026-12-01' }, { name: 'Commissioner for oaths', issuer: null, date: null, expires_on: null }], can: { manage: true, checklists: false } } }));

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/team')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-person="Kamau"]').waitFor({ timeout: 15000 });
ok('each person shows what they carry this week', /Kamau Associate · Litigation Drafting Court work 6 open · 2 late 43h of 40h Over 1 date · 3 meetings — M-0413/.test(await text(page.locator('[data-person="Kamau"]'))));
ok('days away and certificates running out are shown', /A certificate runs out soon/.test(await text(page.locator('[data-person="Njeri"]'))) && /20 Nov/.test(await text(page.locator('[data-person="Njeri"]'))) && /Wanjiru \(you\)/.test(await text(page.locator('[data-person="Wanjiru"]'))));
await page.screenshot({ path: D + 'projects-team.png', fullPage: true });
await page.getByLabel('Has late tasks').click();
await page.waitForTimeout(400);
ok('a filter asks the server', [...sent].reverse().find((x) => x[0] === 'team')[1].late === '1' && (await page.locator('[data-person]').count()) === 1);
await page.getByLabel('Has late tasks').click();
await page.getByLabel('Skill').selectOption('Filing');
await page.waitForTimeout(400);
ok('finding people by skill', [...sent].reverse().find((x) => x[0] === 'team')[1].skill === 'Filing' && (await page.locator('[data-person="Njeri"]').count()) === 1);
await page.getByRole('link', { name: 'Njeri' }).click();
await page.locator('[data-person-page]').waitFor({ timeout: 10000 });
ok('a person\'s page shows their tasks, their week and their HR record', /M-0413-T4 File the bundle/.test(await text(page.locator('[data-person-tasks]'))) && /10h of 32h/.test(await text(page.locator('[data-person-week]')))
  && /First aid · Red Cross Runs out/.test(await text(page.locator('[data-certificate="First aid"]'))) && /No end date/.test(await text(page.locator('[data-certificate="Commissioner for oaths"]'))));
await page.screenshot({ path: D + 'projects-person.png', fullPage: true });

await finish(c);
