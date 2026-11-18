// Browser check: the casebook (build 8.5). Reporting something with a hidden name, then a handler's view: the name hidden, taking it, moving it
// on, a note for handlers only, and revealing the name. The API is answered by the check itself; routing and who may see what are proved by
// ProjectsCasebookTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 3, name: 'Njeri', email: 'njeri@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.casebook.report', 'projects.casebook.handle', 'projects.casebook.identity'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
const states = { new: 'New', looking: 'Being looked into', action: 'Action taken', closed: 'Closed' };
let theCase = { id: 1, number: 'CB-0001', kind: { name: 'Harassment or bullying', client_flag: false }, state: 'new', states, what: 'He keeps shouting at me in meetings.', happened_on: '2026-11-16', reported_at: '2026-11-18 10:00:00',
  reporter: 'Name hidden', hidden: true, revealed: null, about: [{ type: 'person', id: 2, name: 'Kamau' }], project: null, handler: null, outcome: null, routed_to: 'Everyone who handles cases',
  messages: [], log: [{ action: 'reported', who: 'The reporter', detail: 'name hidden', at: '2026-11-18 10:00:00' }, { action: 'routed', who: 'Achieng', detail: 'sent to this person', at: '2026-11-18 10:00:00' }], flags: [], can: { handle: true, reveal: true, message: true } };
await page.route(/\/api\/admin\/projects\/casebook(\?.*)?$/, (route) => {
  if (route.request().method() === 'POST') { sent.push(['report', route.request().postDataJSON()]); return json(route, { case: { ...theCase, reporter: 'You', can: { handle: false, reveal: false, message: true }, log: [] } }, 201); }
  return json(route, { mine: [], handling: [{ id: 1, number: 'CB-0001', kind: 'Harassment or bullying', state: 'new', state_name: 'New', reported_at: '2026-11-18 10:00:00', reporter: 'Name hidden', what: 'He keeps shouting at me in meetings.' }], states,
    kinds: [{ id: 1, name: 'Harassment or bullying' }, { id: 2, name: 'A difficult client' }], people: [{ id: 2, name: 'Kamau' }, { id: 4, name: 'Otieno' }], clients: [{ id: 1, name: 'Imara Sacco' }], can: { report: true, handle: true } });
});
await page.route(/\/api\/admin\/projects\/casebook\/1(\/(messages|reveal))?$/, (route) => {
  const url = route.request().url(); const m = route.request().method(); const b = route.request().postDataJSON?.() ?? null;
  if (/messages$/.test(url)) { sent.push(['message', b]); theCase = { ...theCase, messages: [...theCase.messages, { id: 9, from: 'Njeri', from_reporter: false, internal: b.internal, body: b.body, at: '2026-11-18 11:00:00' }] }; }
  else if (/reveal$/.test(url)) { sent.push(['reveal', b, route.request().headers()['x-projects-reason']]); theCase = { ...theCase, reporter: 'Wairimu', hidden: false, revealed: { at: '2026-11-18 12:00:00', by: 'Njeri' }, can: { ...theCase.can, reveal: false } }; }
  else if (m === 'PUT') { sent.push(['change', b]); theCase = { ...theCase, ...(b.take ? { handler: 'Njeri' } : {}), ...(b.state ? { state: b.state } : {}) }; }
  return json(route, { case: theCase });
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/casebook')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-report]').waitFor({ timeout: 15000 });
ok('reports to handle show the name hidden', /CB-0001 Harassment or bullying New .*Name hidden/.test(await text(page.locator('[data-handling]'))));
await page.getByRole('button', { name: 'Report something' }).click();
await page.getByLabel('What happened').fill('He keeps shouting at me in meetings.');
await page.getByLabel('Who it is about (optional; they never see it)').selectOption(['2']);
await page.getByLabel('Hide my name from whoever handles it').check();
ok('hiding the name says what it means', /Only someone with the right permission can reveal your name, and you are told if they do\./.test(await text(page.locator('[data-report-form]'))));
await page.screenshot({ path: D + 'projects-casebook.png', fullPage: true });
await page.getByRole('button', { name: 'Send the report' }).click();
await page.locator('[data-case-page]').waitFor({ timeout: 10000 });
ok('the report sends what happened, who it is about and the hidden name', JSON.stringify(last('report')[1]) === JSON.stringify({ kind_id: 1, what: 'He keeps shouting at me in meetings.', happened_on: '', about_people: [2], about_clients: [], hide_name: true }));

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/casebook/1')}`, { waitUntil: 'networkidle' });
await page.locator('[data-case-handle]').waitFor({ timeout: 10000 });
ok('a handler sees what happened, who it is about, the hidden name and the log', /About: Kamau .*The reporter asked for their name to be hidden\./.test(await text(page.locator('[data-case-report]'))) && /The reporter · reported: name hidden/.test(await text(page.locator('[data-case-log]'))));
await page.getByRole('button', { name: 'Take it' }).click();
await page.getByLabel('State').selectOption('looking');
await page.waitForTimeout(300);
ok('taking it and moving it on are sent', sent.filter((x) => x[0] === 'change').map((x) => JSON.stringify(x[1])).join() === '{"take":true},{"state":"looking"}');
await page.getByLabel('Your message').fill('Spoke to two witnesses.');
await page.getByLabel('A note for handlers only').check();
await page.getByRole('button', { name: 'Save the note' }).click();
await page.waitForTimeout(300);
ok('a note for handlers only is sent as one and marked', JSON.stringify(last('message')[1]) === JSON.stringify({ body: 'Spoke to two witnesses.', internal: true }) && /note for handlers only/.test(await text(page.locator('[data-case-messages]'))));
page.once('dialog', (d) => d.accept('Needed for the formal hearing'));
await page.getByRole('button', { name: 'Reveal the name' }).click();
await page.waitForTimeout(400);
ok('revealing asks why, sends it with the serious-action reason, and shows who revealed it', last('reveal')[1].reason === 'Needed for the formal hearing' && last('reveal')[2] === encodeURIComponent('Needed for the formal hearing') && /Name revealed by Njeri/.test(await text(page.locator('[data-case-report]'))));
await page.screenshot({ path: D + 'projects-case.png', fullPage: true });

await finish(c);
