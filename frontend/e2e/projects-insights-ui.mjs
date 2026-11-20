// Browser check: insights (stage 12). KPIs in Configuration (12.1): the list with targets in the measure's unit, adding one (amber on the right
// side of green, from Books marked). The API is answered by the check itself; what each measure works out is proved by ProjectsKpisTest.
// Scorecards (12.2): the scorecard on a work with eight weeks, a money figure from Books, and health in the list with its filter.
// Rules (12.5): each rule read as when, if, then; adding one with its actions; trying one; switching it on; the last runs.
// Mimi (12.6): the weekly update draft on a work (change it, send it, throw it away) and what the AI may see.
// Forecasts (12.4): the pipeline chart and table, setting a stage's chance, when works will end, what will be billed.
// It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.config.view', 'projects.config.manage', 'projects.kpis', 'projects.rules', 'projects.insights', 'projects.insights.team', 'projects.capacity', 'projects.money.view', 'projects.messages.client'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1150px!important}' }); };
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/configuration(\?.*)?$/, (route) => json(route, { ready: true, general: { default_industry: 'construction', project_may_use_other_industry: true, trash_days: 30 }, access: null, version: 1, industries: [{ key: 'construction', name: 'Construction', group: 'common', is_active: true }], viewing: 'construction', terms: [], personal: null, can: { manage: true, industry: true, names: true, roles: true } }));
const M = (key, name, unit, about, higher, books = false) => ({ key, name, unit, about, higher, books, how: `How ${name} is worked out` });
const measures = [M('tasks_on_time', 'Tasks done on time', 'pct', 'work', true), M('snags_open', 'Snags open', 'count', 'work', false), M('budget_used', 'Budget used', 'pct', 'work', false, true), M('utilisation', 'Utilisation', 'pct', 'person', true), M('win_rate', 'Win rate', 'pct', 'company', true)];
let kpis = [{ id: 1, key: 'all_tasks_on_time', measure: 'tasks_on_time', name: 'Tasks done on time', industry: null, type_id: null, type: null, target_good: 90, target_warn: 75, client_sees: false, is_active: true, unit: 'pct', about: 'work', higher: true, books: false },
  { id: 2, key: 'construction_budget', measure: 'budget_used', name: 'Budget used', industry: 'construction', type_id: null, type: null, target_good: 100, target_warn: 110, client_sees: false, is_active: true, unit: 'pct', about: 'work', higher: false, books: true }];
const kpiAnswer = () => ({ ready: true, kpis, measures, industries: [{ key: 'construction', name: 'Construction' }, { key: 'legal', name: 'Legal' }], can: { change: true } });
await page.route('**/api/admin/projects/configuration/kpis', (route) => { if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['kpi', b]); kpis = [...kpis, { id: 3, key: 'k3', measure: b.measure, name: b.name || 'Snags open', industry: b.industry_key, type_id: null, type: null, target_good: b.target_good, target_warn: b.target_warn, client_sees: b.client_sees, is_active: true, unit: 'count', about: 'work', higher: false, books: false }]; return json(route, kpiAnswer(), 201); } return json(route, kpiAnswer()); });

await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'KPIs and rules' }).click();
await page.locator('[data-kpis]').waitFor({ timeout: 10000 });
ok('each KPI shows where it applies and its targets in its own unit, lower-is-better the right way round', /Tasks done on time A piece of work Every industry ≥ 90% ≥ 75%/.test(await text(page.locator('[data-kpi="all_tasks_on_time"]'))) && /Budget used from Books A piece of work Construction ≤ 100% ≤ 110%/.test(await text(page.locator('[data-kpi="construction_budget"]'))));
await page.getByRole('button', { name: 'Add a KPI' }).click();
await page.getByLabel('Measures').selectOption('snags_open');
await page.getByLabel('Applies to').selectOption({ label: 'Construction' });
await page.getByLabel(/^Green up to/).fill('0');
await page.getByLabel(/^Amber up to/).fill('3');
await page.getByLabel('The client sees it').check();
ok('the form says how the measure is worked out and which way is better', /How Snags open is worked out. Lower is better; past amber is red./.test(await text(page.locator('[data-kpi-form]'))));
await page.getByRole('button', { name: 'Save the KPI' }).click();
await page.locator('[data-kpi="k3"]').waitFor({ timeout: 5000 });
ok('a KPI is saved with its targets and where it applies', JSON.stringify(last('kpi')?.[1]) === JSON.stringify({ measure: 'snags_open', name: '', industry_key: 'construction', target_good: 0, target_warn: 3, client_sees: true, is_active: true }));
await page.getByRole('button', { name: 'Add a KPI' }).click();
await page.getByLabel('Measures').selectOption('utilisation');
ok('a measure about people applies everywhere: the industry cannot be chosen and the client never sees it', await page.getByLabel('Applies to').isDisabled() && (await page.getByLabel('The client sees it').count()) === 0);
await page.screenshot({ path: D + 'projects-kpis.png', fullPage: true });

// ---------------------------------------------------------------- rules
let rules = [
  { id: 1, key: 'missed_filing', name: 'Missed filing', trigger_event: 'date_missed', trigger_value: 'filing', conditions: { industry: 'legal' }, actions: [{ do: 'tell', who: 'lead' }, { do: 'task', who: 'lead', title: 'Explain the missed filing date', days: 1 }], is_active: false, max_per_day: 50, last_run_at: null, runs_today: 0, last_runs: [] },
  { id: 2, key: 'new_work_follow', name: 'Manager follows new work', trigger_event: 'work_started', trigger_value: null, conditions: [], actions: [{ do: 'follow', who: 'lead_manager' }], is_active: true, max_per_day: 50, last_run_at: '2026-11-19T08:00:00Z', runs_today: 2,
    last_runs: [{ subject: 'BW-0510 Westlands office', outcome: 'done', note: null, created_at: '2026-11-19T08:00:00Z' }, { subject: 'BW-0511 Ngong road', outcome: 'skipped', note: 'Reached its runs for today.', created_at: '2026-11-19T09:00:00Z' }] },
];
let insightSettings = { weekly_updates: true, ai_drafts: true, ai_confidential: false, ai_sensitive_fields: false };
const ruleAnswer = () => ({ ready: true, rules, settings: insightSettings, events: [{ key: 'work_started', name: 'A piece of work starts', value: null }, { key: 'date_missed', name: 'A key date is missed', value: 'Kind of key date (empty = any)' }, { key: 'snag_late', name: 'A snag is late by so many days', value: 'Days late' }],
  who: { lead: 'The lead', members: 'Everyone on the work', followers: 'Its followers', lead_manager: 'The lead\'s manager', owner: 'The opportunity\'s owner', person: 'The person it is about' },
  industries: [{ key: 'construction', name: 'Construction' }, { key: 'legal', name: 'Legal' }], tags: [{ key: 'urgent', name: 'Urgent' }], flags: [{ key: 'slow_payer', name: 'Slow payer' }], can: { change: true, settings: true } });
await page.route('**/api/admin/projects/configuration/rules', (route) => { if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['rule', b]); rules = [...rules, { ...b, id: 3, key: null, trigger_value: b.trigger_value || null, last_runs: [], runs_today: 0 }]; return json(route, ruleAnswer(), 201); } return json(route, ruleAnswer()); });
await page.route(/\/api\/admin\/projects\/configuration\/rules\/\d+$/, (route) => { const b = route.request().postDataJSON(); const id = Number(route.request().url().split('/').pop()); sent.push(['rule-put', id, b]); rules = rules.map((r) => (r.id === id ? { ...r, ...b } : r)); return json(route, ruleAnswer()); });
await page.route(/\/api\/admin\/projects\/configuration\/rules\/\d+\/try$/, (route) => { sent.push(['try', route.request().url()]); return json(route, { runs: 2, examples: ['LIT-0042: Filing deadline missed', 'LIT-0057: Defence filing missed'] }); });
await go('/admin/projects/configuration');
await page.getByRole('tab', { name: 'KPIs and rules' }).click();
await page.locator('[data-rules]').waitFor({ timeout: 10000 });
ok('a rule reads as when, if, then', /When a key date is missed: filing, if Legal, then tell the lead; make the task "Explain the missed filing date" for the lead, due in 1 day\(s\)\./.test(await text(page.locator('[data-rule="missed_filing"]'))));
ok('a rule shows whether it is on and how often it ran today', /Manager follows new work On · 2 today/.test(await text(page.locator('[data-rule="new_work_follow"]'))));
await page.locator('[data-rule="new_work_follow"] summary').click();
ok('the last runs show what was done and what was held back', /BW-0511 Ngong road skipped Reached its runs for today\./.test(await text(page.locator('[data-rule="new_work_follow"]'))));
await page.locator('[data-rule="missed_filing"]').getByRole('button', { name: 'Try it' }).click();
await page.locator('[data-rule-tried="1"]').waitFor({ timeout: 5000 });
ok('trying a rule says what it would have done in the last 30 days', /would have run 2 times\. LIT-0042: Filing deadline missed/.test(await text(page.locator('[data-rule-tried="1"]'))) && /\/rules\/1\/try$/.test(last('try')?.[1] ?? ''));
await page.locator('[data-rule="missed_filing"]').getByRole('button', { name: 'Switch on' }).click();
await page.waitForTimeout(200);
ok('a rule is switched on', JSON.stringify(last('rule-put')) === JSON.stringify(['rule-put', 1, { is_active: true }]));
await page.getByRole('button', { name: 'Add a rule' }).click();
await page.getByLabel('Name').fill('Late snag');
await page.locator('#ru-e').selectOption('snag_late');
await page.getByLabel('Days late').fill('7');
await page.locator('#ru-w0').selectOption('lead_manager');
await page.getByRole('button', { name: 'Add another' }).click();
await page.locator('#ru-a1').selectOption('task');
await page.locator('#ru-t1').fill('Chase the subcontractor');
await page.locator('#ru-d1').fill('2');
ok('only the safe actions are offered', JSON.stringify(await page.locator('#ru-a0 option').allInnerTexts()) === JSON.stringify(['Tell', 'Make a task', 'Make a key date', 'Add a follower', 'Tag the conversation', 'Flag the client']));
await page.screenshot({ path: D + 'projects-rules.png', fullPage: true });
await page.getByRole('button', { name: 'Save the rule' }).click();
await page.locator('[data-rule="3"]').waitFor({ timeout: 5000 });
const saved = last('rule')?.[1];
ok('a rule is saved with its event, value and actions', saved?.trigger_event === 'snag_late' && saved?.trigger_value === '7' && JSON.stringify(saved?.actions) === JSON.stringify([{ do: 'tell', who: 'lead_manager' }, { do: 'task', who: 'lead', title: 'Chase the subcontractor', days: '2' }]) && saved?.is_active === false);
await page.route('**/api/admin/projects/configuration/insights', (route) => { insightSettings = route.request().postDataJSON().settings; sent.push(['insights', insightSettings]); return json(route, ruleAnswer()); });
ok('Mimi says what the AI may see, confidential work and sensitive fields off out of the box', await page.locator('[data-mimi-setting="ai_drafts"] input').isChecked() && !(await page.locator('[data-mimi-setting="ai_confidential"] input').isChecked()) && !(await page.locator('[data-mimi-setting="ai_sensitive_fields"] input').isChecked()));
await page.locator('[data-mimi-setting="ai_confidential"] input').click();
await page.waitForTimeout(200);
ok('letting the AI see confidential work is saved', last('insights')?.[1]?.ai_confidential === true && last('insights')?.[1]?.ai_sensitive_fields === false);

// ---------------------------------------------------------------- the scorecard on a work, health in the list
await page.route(/\/api\/admin\/projects\/509$/, (route) => json(route, { project: { id: 509, number: 'BW-0509', title: 'Kilimani flats', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 5, name: 'Building works' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: '2027-03-31', closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'BW-0509', words: {}, can: { open: true, money: true }, locks: {}, fields: [] } }));
const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
const K = (key, name, unit, higher, good, status, value, detail, w, extra = {}) => ({ id: key.length, key, measure: key, name, unit, higher, target_good: good, target_warn: good, status, value, detail, weeks: w, books: false, client_sees: false, about: 'work', ...extra });
await page.route('**/api/admin/projects/509/scorecard', (route) => json(route, { ready: true, health: 'bad', weeks, can: { change: true }, kpis: [
  K('inspections_passed', 'Inspections passed', 'pct', true, 90, 'good', 94, '16 of 17 finished inspections', ['good', 'good', 'warn', 'good', 'good', 'good', 'good', 'good'], { client_sees: true }),
  K('snags_on_time', 'Snags closed on time', 'pct', true, 85, 'warn', 78, '18 of 23 snags due', [null, null, 'good', 'warn', 'warn', 'warn', 'warn', 'warn']),
  K('budget_used', 'Budget used', 'pct', false, 100, 'bad', 114, 'costs against the budget, from Books', [null, null, 'good', 'good', 'warn', 'warn', 'bad', 'bad'], { books: true }),
] }));
let updates = [{ id: 7, week: '2026-11-16', body: 'This week we poured the third floor slab.', state: 'draft', by_ai: true, decided_by: null, decided_at: null, message_id: null }, { id: 6, week: '2026-11-09', body: 'x', state: 'sent', by_ai: false, decided_by: 'Kamau', decided_at: '2026-11-13T14:00:00Z', message_id: 3 }];
const updAnswer = () => ({ ready: true, updates, threads: [{ id: 41, subject: 'Site progress', state: 'open' }] });
await page.route('**/api/admin/projects/509/updates', (route) => json(route, updAnswer()));
await page.route(/\/api\/admin\/projects\/509\/updates\/\d+\/(save|send|discard)$/, (route) => { const what = route.request().url().split('/').pop(); sent.push(['update', what, route.request().postDataJSON()]); updates = updates.map((u) => (u.id === 7 ? { ...u, state: { save: 'draft', send: 'sent', discard: 'discarded' }[what], decided_by: what === 'save' ? null : 'Kamau' } : u)); return json(route, updAnswer()); });
await go('/admin/projects/509');
await page.locator('[data-scorecard]').waitFor({ timeout: 10000 });
ok('the scorecard shows the health as the worst KPI, each figure against green and how it was worked out', /Scorecard .* Off track/.test(await text(page.locator('[data-scorecard]'))) && /Budget used from Books costs against the budget, from Books 114% ≤ 100%/.test(await text(page.locator('[data-scorecard-kpi="budget_used"]'))) && /Inspections passed Client sees it 16 of 17 finished inspections 94% ≥ 90%/.test(await text(page.locator('[data-scorecard-kpi="inspections_passed"]'))));
ok('each KPI shows its last eight weeks', (await page.locator('[data-scorecard-kpi="snags_on_time"] [aria-label="Last eight weeks"] [role="img"]').count()) === 8 && (await page.locator('[data-scorecard-kpi="snags_on_time"] [aria-label="2026-11-16: Needs watching"]').count()) === 1);
await page.screenshot({ path: D + 'projects-scorecard.png', fullPage: true });
await page.locator('[data-update-draft]').waitFor({ timeout: 5000 });
ok('the weekly draft says Mimi wrote it and waits for the lead', /Week of 16 Nov · written by Mimi/.test(await text(page.locator('[data-updates]'))) && (await page.locator('#up-body').inputValue()) === 'This week we poured the third floor slab.' && /Week of 9 Nov Sent by Kamau/.test(await text(page.locator('[data-updates]'))));
await page.locator('#up-body').fill('This week we poured the third floor slab. Next: the roof.');
await page.locator('#up-thread').selectOption('41');
await page.locator('[data-updates]').screenshot({ path: D + 'projects-weekly-update.png' });
await page.getByRole('button', { name: 'Send to the client' }).click();
await page.locator('[data-update="7"]').waitFor({ timeout: 5000 });
ok('the lead sends the changed update into the conversation chosen', JSON.stringify(last('update')) === JSON.stringify(['update', 'send', { body: 'This week we poured the third floor slab. Next: the roof.', thread_id: '41' }]) && /No draft waiting/.test(await text(page.locator('[data-updates]'))));
const listed = [];
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); listed.push(q); const all = [{ id: 509, number: 'BW-0509', title: 'Kilimani flats', health: 'bad' }, { id: 510, number: 'BW-0510', title: 'Ruaka road', health: 'good' }, { id: 511, number: 'BW-0511', title: 'New office', health: null }];
  const data = all.filter((p) => !q.health || p.health === q.health).map((p) => ({ ...p, description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 5, name: 'Building works' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium', customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, due_date: null, confidential: false, frozen: false }));
  return json(route, { data, total: data.length, page: 1, per_page: 25, counts: { open: 3, on_hold: 0, closed: 0, cancelled: 0 } }); });
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await go('/admin/projects');
await page.getByText('Kilimani flats').waitFor({ timeout: 10000 });
ok('the list shows each work\'s health, and none for one not measured', (await page.getByRole('row').filter({ hasText: 'Kilimani flats' }).getByText('Off track').count()) === 1 && (await page.getByRole('row').filter({ hasText: 'Ruaka road' }).getByText('On track').count()) === 1 && !/track|watching/i.test(await text(page.getByRole('row').filter({ hasText: 'New office' }))));
await page.getByLabel('Health').selectOption({ label: 'Off track' });
await page.waitForTimeout(400);
ok('the list can be filtered by health', listed.at(-1)?.health === 'bad' && (await page.getByText('Ruaka road').count()) === 0);

// ---------------------------------------------------------------- forecasts
const mo = (month, label, count, quoted, estimated, weighted) => ({ month, label, count, quoted, estimated, weighted });
let pipeline = { ready: true, currency: 'KES', win_rate: 30, late: 1, can: { odds: true }, months: [mo('2026-11', 'Nov 2026', 2, 3000000, 1200000, 1260000), mo('2026-12', 'Dec 2026', 3, 4000000, 2800000, 2040000), mo('2027-01', 'Jan 2027', 1, 0, 3100000, 930000),
  mo('2027-02', 'Feb 2027', 0, 0, 0, 0), mo('2027-03', 'Mar 2027', 1, 5000000, 0, 1500000), mo('2027-04', 'Apr 2027', 0, 0, 0, 0)], stages: [{ id: 1, name: 'Qualified', chance: 30, set: false }, { id: 2, name: 'Proposal', chance: 60, set: true }] };
await page.route('**/api/admin/projects/insights/forecasts', (route) => json(route, { pipeline, billing: { ready: true, currency: 'KES', unbilled_hours: 212, months: [{ month: '2026-12', label: 'Dec 2026', staged: 3400000, bills: 2 }] },
  finish: [{ id: 31, number: 'SW-0031', title: 'Payroll app', due: '2027-01-15', likely: '2027-02-06', days: 22, left: 24, per_week: 7.5, state: 'bad' }, { id: 413, number: 'M-0413', title: 'Imara v Baraka', due: '2027-02-28', likely: '2027-02-20', days: -8, left: 6, per_week: 1.5, state: 'good' }] }));
await page.route('**/api/admin/projects/insights/odds/1', (route) => { sent.push(['odds', route.request().postDataJSON()]); pipeline = { ...pipeline, stages: [{ id: 1, name: 'Qualified', chance: 40, set: true }, pipeline.stages[1]] }; return json(route, { pipeline }); });
await go('/admin/projects/insights');
await page.locator('[data-forecast-pipeline]').waitFor({ timeout: 10000 });
ok('the pipeline is drawn by month and listed with what is quoted, estimated and expected', (await page.locator('[data-pipeline-chart] [data-pipeline-month]').count()) === 6 && /Dec 2026 3 KES 4,000,000 KES 2,800,000 KES 2,040,000/.test(await text(page.locator('[data-pipeline-row="2026-12"]'))) && /one expected earlier is still open/.test(await text(page.locator('[data-forecast-pipeline]'))));
page.on('dialog', (dlg) => dlg.accept('40'));
await page.locator('[data-pipeline-odds]').getByRole('button', { name: 'Qualified: 30% (win rate)' }).click();
await page.waitForTimeout(300);
ok('a stage\'s chance can be set by hand', last('odds')?.[1]?.chance === 40 && (await page.locator('[data-pipeline-odds]').getByRole('button', { name: 'Qualified: 40%' }).count()) === 1);
ok('when the work will end: late ones first, with the pace', /SW-0031 Payroll app 15 Jan 2027 06 Feb 2027 · 22 days late 24 tasks left at 7.5 a week Late/.test(await text(page.locator('[data-finish="SW-0031"]'))) && /8 days early .*On time/.test(await text(page.locator('[data-finish="M-0413"]'))));
ok('what will be billed, with the unbilled time', /Dec 2026 KES 3,400,000 2/.test(await text(page.locator('[data-billing-row="2026-12"]'))) && /212 hours/.test(await text(page.locator('[data-forecast-billing]'))));
await page.screenshot({ path: D + 'projects-forecasts.png', fullPage: true });
await finish(c);
