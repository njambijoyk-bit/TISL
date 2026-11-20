// Browser check: the team view and a person's page (build 8.1), with goals, reviews and one-to-ones (8.3). Who is carrying what this week, the filters going to the server, and one
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

let growth = { goals: [{ id: 1, title: 'File every bundle on time', measure: 'No late filings', due_on: '2026-12-31', progress: 40, state: 'on_track', set_by: 'Wanjiru' }],
  reviews: [{ id: 5, period: '2026, first half', body: 'Careful and quick.', written_by: 'Wanjiru', shared_at: '2026-07-01', acknowledged_at: null, comment: 'Thank you.' }],
  one_to_ones: [{ id: 8, held_on: '2026-11-17', manager: 'Wanjiru', notes: 'Talked about filing.', actions: [{ text: 'Shadow the hearing', who: 3, task_id: null }], private_note: 'Ready for more.' }],
  states: { on_track: 'On track', at_risk: 'At risk', done: 'Done', dropped: 'Dropped' }, can: { manage: true, self: false } };
await page.route('**/api/admin/projects/team/3/growth', (route) => json(route, growth));
let checklist = { id: 4, kind: 'leaving', name: 'Leaving', on_date: '2026-11-30', state: 'open', can: { cancel: true }, items: [
  { id: 41, text: 'Hand over their work', who: 'Kamau', due_on: '2026-11-23', late: false, done: false, done_by: null, action: 'handover', mine: true },
  { id: 42, text: 'Take them off their work on the leaving date', who: 'Kamau', due_on: '2026-11-30', late: false, done: false, done_by: null, action: 'end_places', mine: true }] };
await page.route('**/api/admin/projects/team/3/checklists', (route) => {
  if (route.request().method() === 'POST') { sent.push(['start', route.request().postDataJSON()]); }
  return json(route, { checklists: [checklist], templates: [{ id: 2, kind: 'leaving', name: 'Leaving' }] });
});
await page.route(/\/api\/admin\/projects\/checklist-items\/\d+$/, (route) => { const id = Number(route.request().url().match(/(\d+)$/)[1]); sent.push(['tick', id, route.request().postDataJSON()]);
  checklist = { ...checklist, items: checklist.items.map((i) => (i.id === id ? { ...i, done: true, done_by: 'Wanjiru' } : i)) }; return json(route, { message: 'Saved', mine: [] }); });
await page.route(/\/api\/admin\/projects\/team\/3\/(goals|reviews|one-to-ones)(\/\d+)?(\/actions\/\d+\/task)?$/, (route) => {
  const url = route.request().url(); const b = route.request().postDataJSON(); sent.push(['growth', url.replace(/.*\/team\/3\//, ''), b]);
  if (/goals$/.test(url)) growth = { ...growth, goals: [...growth.goals, { id: 2, title: b.title, measure: b.measure || null, due_on: b.due_on || null, progress: 0, state: 'on_track', set_by: 'Wanjiru' }] };
  else if (/goals\/1$/.test(url)) growth = { ...growth, goals: growth.goals.map((x) => (x.id === 1 ? { ...x, ...b } : x)) };
  else if (/task$/.test(url)) growth = { ...growth, one_to_ones: [{ ...growth.one_to_ones[0], actions: [{ ...growth.one_to_ones[0].actions[0], task_id: 77 }] }] };
  return json(route, growth, /task$/.test(url) ? 201 : 200);
});
const wk = (n, from) => ({ from, to: from, number: n });
await page.route('**/api/admin/projects/insights/capacity', (route) => json(route, { can: { team: true }, weeks: [wk(47, '2026-11-16'), wk(48, '2026-11-23'), wk(49, '2026-11-30'), wk(50, '2026-12-07'), wk(51, '2026-12-14'), wk(52, '2026-12-21'), wk(53, '2026-12-28'), wk(1, '2027-01-04')],
  people: [{ id: 2, name: 'Kamau', no_estimate: 2, weeks: [{ due_hours: 52, can_hours: 40, state: 'over' }, { due_hours: 38, can_hours: 40, state: 'near' }, ...Array(6).fill({ due_hours: 10, can_hours: 40, state: 'ok' })] },
    { id: 3, name: 'Njeri', no_estimate: 0, weeks: [{ due_hours: 6, can_hours: 32, state: 'ok' }, { due_hours: 0, can_hours: 0, state: 'off' }, ...Array(6).fill({ due_hours: 4, can_hours: 40, state: 'ok' })] }] }));
await page.route('**/api/admin/projects/insights/people/3', (route) => json(route, { ready: true, person: { id: 3, name: 'Njeri' }, health: 'warn', weeks: [], kpis: [
  { id: 9, key: 'all_person_utilisation', name: 'Utilisation', unit: 'pct', value: 64, status: 'warn', detail: '102 of 160 working hours' }, { id: 10, key: 'all_person_timesheets', name: 'Timesheets in on time', unit: 'pct', value: 100, status: 'good', detail: '6 weeks with time' }] }));
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/team')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-person="Kamau"]').waitFor({ timeout: 15000 });
ok('each person shows what they carry this week', /Kamau Associate · Litigation Drafting Court work 6 open · 2 late 43h of 40h Over 1 date · 3 meetings — M-0413/.test(await text(page.locator('[data-person="Kamau"]'))));
ok('days away and certificates running out are shown', /A certificate runs out soon/.test(await text(page.locator('[data-person="Njeri"]'))) && /20 Nov/.test(await text(page.locator('[data-person="Njeri"]'))) && /Wanjiru \(you\)/.test(await text(page.locator('[data-person="Wanjiru"]'))));
await page.locator('[data-capacity]').waitFor({ timeout: 10000 });
ok('capacity shows eight weeks: over in red, close in amber, a week off, and tasks with no estimate', /Kamau 2 tasks have no estimate 52 \/ 40 38 \/ 40/.test(await text(page.locator('[data-capacity-person="Kamau"]'))) && (await page.locator('[data-capacity-person="Kamau"] [data-week-state="over"]').count()) === 1 && /off/.test(await text(page.locator('[data-capacity-person="Njeri"]'))));
await page.screenshot({ path: D + 'projects-team.png', fullPage: true });
await page.getByLabel('Has late tasks').click();
await page.waitForTimeout(400);
ok('a filter asks the server', [...sent].reverse().find((x) => x[0] === 'team')[1].late === '1' && (await page.locator('[data-person]').count()) === 1);
await Promise.all([page.waitForResponse((r) => r.url().includes('/admin/projects/team') && !r.url().includes('late=')), page.getByLabel('Has late tasks').click()]);
await Promise.all([page.waitForResponse((r) => r.url().includes('skill=Filing')), page.getByLabel('Skill').selectOption('Filing')]);
await page.waitForTimeout(200);
ok('finding people by skill', [...sent].reverse().find((x) => x[0] === 'team')[1].skill === 'Filing' && (await page.locator('[data-person="Njeri"]').count()) === 1);
await page.getByRole('link', { name: 'Njeri' }).click();
await page.locator('[data-person-page]').waitFor({ timeout: 10000 });
ok('a person\'s page shows their tasks, their week and their HR record', /M-0413-T4 File the bundle/.test(await text(page.locator('[data-person-tasks]'))) && /10h of 32h/.test(await text(page.locator('[data-person-week]')))
  && /First aid · Red Cross Runs out/.test(await text(page.locator('[data-certificate="First aid"]'))) && /No end date/.test(await text(page.locator('[data-certificate="Commissioner for oaths"]'))));
await page.locator('[data-checklists]').waitFor({ timeout: 10000 });
ok('a leaving checklist shows each step, who does it and when, with the hand-over a way in', /Leaving · leaving 30 Nov 2026 0 of 2 done/.test(await text(page.locator('[data-checklist="Leaving"]')))
  && (await page.getByRole('link', { name: 'Hand it over' }).getAttribute('href')) === '/admin/projects/handover?from=3');
await page.getByRole('checkbox', { name: 'Take them off their work on the leaving date' }).click();
await page.waitForTimeout(400);
ok('ticking a step is sent and shown', JSON.stringify([...sent].reverse().find((x) => x[0] === 'tick')) === JSON.stringify(['tick', 42, { done: true }]) && /1 of 2 done/.test(await text(page.locator('[data-checklist="Leaving"]'))));
await page.locator('[data-growth]').waitFor({ timeout: 10000 });
ok('goals, reviews and one-to-ones show under the person', /File every bundle on time On track By 31 Dec 2026 No late filings 40%/.test(await text(page.locator('[data-goal="File every bundle on time"]')))
  && /Shared .*Their words: Thank you\./.test(await text(page.locator('[data-review="2026, first half"]'))) && /Your private note: Ready for more\./.test(await text(page.locator('[data-one-to-one="2026-11-17"]'))));
await page.getByRole('button', { name: 'Set a goal' }).click();
await page.getByLabel('Goal', { exact: true }).fill('Lead a small matter');
await page.getByLabel('By', { exact: true }).fill('2027-03-31');
await page.getByRole('button', { name: 'Set it' }).click();
await page.waitForTimeout(400);
ok('a manager sets a goal', JSON.stringify([...sent].reverse().find((x) => x[0] === 'growth').slice(1)) === JSON.stringify(['goals', { title: 'Lead a small matter', measure: '', due_on: '2027-03-31' }]) && (await page.locator('[data-goal="Lead a small matter"]').count()) === 1);
await page.getByLabel('How far along File every bundle on time is').selectOption('70');
await page.waitForTimeout(400);
ok('progress is updated', JSON.stringify([...sent].reverse().find((x) => x[0] === 'growth').slice(1)) === JSON.stringify(['goals/1', { progress: 70 }]));
await page.getByRole('button', { name: 'Make it a task' }).click();
await page.locator('[data-one-to-one="2026-11-17"]').getByRole('button', { name: 'Make it a task' }).click();
await page.waitForTimeout(400);
ok('an action point becomes a task on one of their pieces of work', JSON.stringify([...sent].reverse().find((x) => x[0] === 'growth').slice(1)) === JSON.stringify(['one-to-ones/8/actions/0/task', { project_id: 413 }]) && /A task/.test(await text(page.locator('[data-one-to-one="2026-11-17"]'))));
ok('a person\'s page shows their scorecard to their manager', /Scorecard .*Needs watching/.test(await text(page.locator('[data-person-scorecard]'))) && /Utilisation 102 of 160 working hours 64% Needs watching/.test(await text(page.locator('[data-person-kpi="all_person_utilisation"]'))));
await page.screenshot({ path: D + 'projects-person.png', fullPage: true });

await finish(c);
