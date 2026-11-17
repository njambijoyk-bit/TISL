// Browser check: the Work tab (build 5.1). Tasks grouped by phase with subtasks under their task, filters, adding a task with people, the task
// panel: moving the status (asking why when it waits for something open), the checklist, changing and deleting it; and someone on a task who
// may not manage tasks. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.tasks'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: { project: { name: 'Matter', plural: 'Matters' } }, keys: {} }));
const words = { project: { name: 'Matter', plural: 'Matters' }, phase: { name: 'Phase', plural: 'Phases' }, task: { name: 'Task', plural: 'Tasks' } };
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Wanjiru' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words, can: { open: true, tasks: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));

const people = [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Otieno' }];
const T = (o) => ({ description: null, parent_id: null, phase_id: 5, scope_line_id: null, status: 'todo', priority: 'medium', start_date: null, due_date: null, overdue: false, estimate_minutes: null, logged_minutes: 0, billable: null, people: [], checks: { total: 0, done: 0 }, waits_for: [], completed_at: null, ...o, ref: `M-0413-T${o.number}` });
let tasks = [T({ id: 12, number: 12, title: 'Draft defence', status: 'doing', people: [people[0], people[1]], due_date: '2026-11-20', estimate_minutes: 360, logged_minutes: 258, checks: { total: 5, done: 3 } }),
  T({ id: 13, number: 13, title: 'Client to confirm dates', parent_id: 12, status: 'waiting', people: [people[1]], due_date: '2026-11-15', overdue: true, estimate_minutes: 60, logged_minutes: 30 }),
  T({ id: 14, number: 14, title: 'File and serve defence', waits_for: [{ id: 12, ref: 'M-0413-T12', title: 'Draft defence', open: true }], due_date: '2026-11-22', priority: 'high' }),
  T({ id: 15, number: 15, title: 'List of documents', phase_id: 6, status: 'done', logged_minutes: 168 })];
let checks = { 14: [{ id: 1, text: 'Court fee paid', done: false }] };
let manage = true;
const depthOf = (t) => (t.parent_id ? depthOf(tasks.find((x) => x.id === t.parent_id)) + 1 : 0);
const order = () => { const out = []; const walk = (pid) => tasks.filter((t) => t.parent_id === pid).forEach((t) => { out.push({ ...t, depth: depthOf(t) }); walk(t.id); }); walk(null); return out; };
const filtered = (q) => {
  const all = order(); const hit = (t) => (!q.overdue || t.overdue) && (!q.q || t.title.toLowerCase().includes(q.q.toLowerCase()));
  if (!q.overdue && !q.q) return all;
  const keep = new Set(all.filter(hit).map((t) => t.id));
  all.filter(hit).forEach((t) => { for (let p = t.parent_id; p; p = all.find((x) => x.id === p)?.parent_id) keep.add(p); });   // as the server does: a match keeps its parents
  return all.filter((t) => keep.has(t.id)).map((t) => ({ ...t, matches: hit(t) }));
};
const list = (q = {}) => ({ ready: true, tasks: filtered(q), statuses: { todo: 'To do', doing: 'Doing', waiting: 'Awaiting client', done: 'Done', cancelled: 'Cancelled' },
  priorities: { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }, phases: [{ id: 5, name: 'Pleadings' }, { id: 6, name: 'Discovery' }], people: manage ? people : [], billable_default: true, can: { manage } });
const one = (id) => { const t = order().find((x) => x.id === id); return { ...t, checklist: checks[id] ?? [], subtasks: tasks.filter((x) => x.parent_id === id).map((s) => ({ id: s.id, ref: s.ref, title: s.title, status: s.status })), can: { manage, work: manage || id === 13 } }; };

await page.route(/\/api\/admin\/projects\/413\/tasks(\?.*)?$/, (route) => {
  if (route.request().method() === 'POST') {
    const b = route.request().postDataJSON(); sent.push(['create', b]);
    const id = 16; tasks = [...tasks, T({ id, number: 16, title: b.title, phase_id: b.phase_id ? Number(b.phase_id) : null, parent_id: b.parent_id ? Number(b.parent_id) : null, people: people.filter((p) => b.people.includes(p.id)), due_date: b.due_date, estimate_minutes: b.estimate_hours ? Number(b.estimate_hours) * 60 : null })];
    return json(route, { task: one(id) }, 201);
  }
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['list', q]);
  return json(route, list(q));
});
let askedWhy = false;
await page.route(/\/api\/admin\/projects\/413\/tasks\/\d+(\/.*)?$/, (route) => {
  const url = route.request().url(); const m = route.request().method(); const id = Number(url.match(/tasks\/(\d+)/)[1]); const b = route.request().postDataJSON?.() ?? null;
  if (/\/status$/.test(url)) {
    sent.push(['move', id, b]);
    if (id === 14 && b.status === 'doing' && !b.reason) { askedWhy = true; return json(route, { message: 'This waits for M-0413-T12, which is not done yet. Say why it goes ahead anyway.', needs_reason: true, waits_for: [12] }, 422); }
    tasks = tasks.map((t) => (t.id === id ? { ...t, status: b.status } : t)); return json(route, { task: one(id) });
  }
  if (/\/checks$/.test(url)) { sent.push(['check', id, b]); checks[id] = [...(checks[id] ?? []), { id: 9, text: b.text, done: false }]; tasks = tasks.map((t) => (t.id === id ? { ...t, checks: { total: checks[id].length, done: checks[id].filter((x) => x.done).length } } : t)); return json(route, { task: one(id) }, 201); }
  if (/\/checks\/\d+$/.test(url)) { const cid = Number(url.match(/checks\/(\d+)/)[1]); sent.push(['tick', id, cid, b]); checks[id] = checks[id].map((x) => (x.id === cid ? { ...x, done: b.done } : x)); tasks = tasks.map((t) => (t.id === id ? { ...t, checks: { total: checks[id].length, done: checks[id].filter((x) => x.done).length } } : t)); return json(route, { task: one(id) }); }
  if (m === 'PUT') { sent.push(['update', id, b]); tasks = tasks.map((t) => (t.id === id ? { ...t, title: b.title, due_date: b.due_date || null, waits_for: [] } : t)); return json(route, { task: one(id) }); }
  if (m === 'DELETE') { sent.push(['delete', id]); tasks = tasks.filter((t) => t.id !== id); return json(route, { message: 'Deleted.', deleted: 1 }); }
  return json(route, { task: one(id) });
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=work')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-work]').waitFor({ timeout: 15000 });
ok('the Work tab sits beside the phases', (await page.getByRole('tab', { name: 'Work' }).count()) === 1 || /Work/.test(await text(page.locator('[role="tablist"]'))));
const rows = await page.locator('[data-task-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-row')));
ok('tasks are grouped by phase, with a subtask under its task', JSON.stringify(rows) === JSON.stringify(['M-0413-T12', 'M-0413-T13', 'M-0413-T14', 'M-0413-T15']) && /PLEADINGS/i.test(await text()) && /DISCOVERY/i.test(await text()), JSON.stringify(rows));
ok('each row shows its checks, what it waits for, people, status in the industry\'s words, due and time', /T12\s*Draft defence\s*3 of 5 checks/.test(await text(page.locator('[data-task-row="M-0413-T12"]'))) && /Wanjiru, Otieno\s*Doing/.test(await text(page.locator('[data-task-row="M-0413-T12"]'))) && /6h\s*4h 18m/.test(await text(page.locator('[data-task-row="M-0413-T12"]')))
  && /Awaiting client\s*Overdue/.test(await text(page.locator('[data-task-row="M-0413-T13"]'))) && /waits for T12/.test(await text(page.locator('[data-task-row="M-0413-T14"]'))));
await page.screenshot({ path: D + 'projects-work.png', fullPage: true });

await page.getByRole('button', { name: 'Overdue' }).click();
await page.waitForTimeout(400);
ok('a filter is sent, and a matching subtask shows under its task', last('list')[1].overdue === '1' && JSON.stringify(await page.locator('[data-task-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-row')))) === JSON.stringify(['M-0413-T12', 'M-0413-T13']));
await page.getByRole('button', { name: 'Overdue' }).click();
await page.waitForTimeout(400);

// ---------------------------------------------------------------- adding
await page.getByRole('button', { name: 'New task' }).click();
await page.getByLabel('Title').fill('Prepare witness statements');
await page.getByLabel('Phase', { exact: true }).last().selectOption('5');
await page.getByLabel('Due').fill('2026-11-28');
await page.getByLabel('Estimate (hours)').fill('3');
await page.locator('[data-new-task]').getByRole('button', { name: 'Otieno' }).click();
await page.getByRole('button', { name: 'Add the task' }).click();
await page.waitForTimeout(500);
const cr = last('create')[1];
ok('a new task is sent with its phase, people, due date and estimate', cr.title === 'Prepare witness statements' && cr.phase_id === '5' && JSON.stringify(cr.people) === '[2]' && cr.due_date === '2026-11-28' && cr.estimate_hours === '3' && (await page.locator('[data-task-row="M-0413-T16"]').count()) === 1, JSON.stringify(cr));

// ---------------------------------------------------------------- the task panel
await page.locator('[data-task-row="M-0413-T14"]').getByRole('button').first().click();
await page.locator('[data-task="M-0413-T14"]').waitFor({ timeout: 5000 });
const panel = page.locator('[data-task="M-0413-T14"]');
ok('the panel shows what it waits for and its checklist', /Starts when done:\s*M-0413-T12/.test(await text(panel)) && /Court fee paid/.test(await text(panel)));
await panel.getByRole('button', { name: 'Doing' }).click();
await page.locator('[data-why]').waitFor({ timeout: 5000 });
ok('starting it before what it waits for is done asks why', askedWhy && /This waits for M-0413-T12, which is not done yet/.test(await text(page.locator('[data-why]'))));
await page.getByLabel('Why it goes ahead').fill('The draft is agreed in principle');
await page.getByRole('button', { name: /Go ahead/ }).click();
await page.waitForTimeout(500);
ok('the reason is sent with the move, and the status changes', last('move')[2].reason === 'The draft is agreed in principle' && last('move')[2].status === 'doing' && /Doing/.test(await text(panel)) && (await page.locator('[data-why]').count()) === 0);
await page.getByRole('checkbox', { name: 'Court fee paid' }).click();
await page.waitForTimeout(300);
await page.getByLabel('New checklist line').fill('Affidavit of service');
await panel.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(400);
ok('ticking and adding checklist lines are sent', JSON.stringify(last('tick')) === JSON.stringify(['tick', 14, 1, { done: true }]) && last('check')[2].text === 'Affidavit of service' && /Checklist\s*· 1 of 2/.test(await text(panel)));
await page.screenshot({ path: D + 'projects-work-task.png', fullPage: true });

await panel.getByRole('button', { name: 'Change' }).click();
await page.getByLabel('Title').fill('File and serve the defence');
await panel.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
ok('changing a task sends it, and the panel shows the new title', last('update')[2].title === 'File and serve the defence' && /File and serve the defence/.test(await text(page.locator('[data-task="M-0413-T14"]'))));
await page.locator('[data-task="M-0413-T14"]').getByRole('button', { name: 'Delete' }).click();
await page.getByRole('button', { name: 'Yes, delete it' }).click();
await page.waitForTimeout(500);
ok('deleting asks first, then the task goes', JSON.stringify(last('delete')) === JSON.stringify(['delete', 14]) && (await page.locator('[data-task-row="M-0413-T14"]').count()) === 0 && (await page.locator('[data-task]').count()) === 0);

// ---------------------------------------------------------------- someone on a task, without managing tasks
manage = false;
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=work&task=13')}`, { waitUntil: 'networkidle' });
await page.locator('[data-task="M-0413-T13"]').waitFor({ timeout: 15000 });
ok('someone the task is given to can move it but not change it or add tasks', (await page.locator('[data-moves]').count()) === 1 && (await page.getByRole('button', { name: 'Change' }).count()) === 0 && (await page.getByRole('button', { name: 'New task' }).count()) === 0);

await finish(c);
