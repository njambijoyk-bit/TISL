// Browser check: handing work over (build 6.8). Opened from the People tab with the person and the work filled in: what would move, grouped by
// kind; a piece of work where the new person is not on it stays and says why; leaving some items out; handing over the rest. The API is answered
// by the check itself; the rules (who may, the serious action, nothing moves when a piece is refused) are proved by ProjectsHandoverTest.
// It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.members.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
await page.route('**/api/admin/projects/handover/people', (route) => json(route, { people: [{ id: 1, name: 'Wanjiru' }, { id: 2, name: 'Njeri' }, { id: 3, name: 'Otieno' }] }));
let moved = false;
const A = { project: { id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders' }, blocked: null, items: [
  { kind: 'task', id: 11, label: 'M-0413-T3 File the defence', when: '2026-11-25' }, { kind: 'date', id: 21, label: 'Hearing', when: '2026-12-03' },
  { kind: 'thread', id: 31, label: 'Strategy', when: null }, { kind: 'meeting', id: 41, label: 'Case review', when: '2026-11-20 10:00' }, { kind: 'follow_up', id: 51, label: 'Call about fees', when: '2026-11-25' }] };
const B = { project: { id: 420, number: 'J-0420', title: 'Office fit-out' }, blocked: 'Otieno is not on this work. Add them first.', items: [{ kind: 'task', id: 12, label: 'J-0420-T1 Measure the office', when: null }] };
const kinds = { task: 'Open tasks', date: 'Key dates they are responsible for', thread: 'Conversations they answer', meeting: 'Meetings they organise', follow_up: 'Follow-ups on the client' };
await page.route(/\/api\/admin\/projects\/handover\/preview\?.*/, (route) => {
  const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['preview', q]);
  const projects = moved ? [{ ...A, items: A.items.filter((i) => i.kind === 'follow_up') }] : q.project_id ? [A] : [A, B];
  return json(route, { from: { id: 2, name: 'Njeri' }, to: { id: Number(q.to), name: 'Otieno' }, kinds, projects, serious: true });
});
await page.route('**/api/admin/projects/handover', (route) => { sent.push(['go', route.request().postDataJSON()]); moved = true; return json(route, { moved: 4, projects: 1, message: 'Handed over: 4 items.' }); });

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/handover?from=2&project=413')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
ok('opened from the People tab, the person and the work are filled in', (await page.getByLabel('Whose work').inputValue()) === '2' && (await page.getByLabel('On', { exact: true }).inputValue()) === 'one');
await page.getByLabel('Goes to').selectOption('3');
await page.locator('[data-handover]').waitFor({ timeout: 10000 });
ok('what would move is listed by kind, all chosen, and it says this is a serious action', JSON.stringify(last('preview')[1]) === JSON.stringify({ from: '2', to: '3', project_id: '413' })
  && /Open tasks M-0413-T3 File the defence .*Key dates they are responsible for Hearing .*Conversations they answer Strategy .*Meetings they organise Case review .*Follow-ups on the client Call about fees/.test(await text(page.locator('[data-handover-project="M-0413"]')))
  && /serious action/.test(await text(page.locator('[data-handover]'))) && (await page.getByRole('button', { name: 'Hand 5 items to Otieno' }).count()) === 1);
await page.getByLabel('On', { exact: true }).selectOption('all');
await page.waitForTimeout(400);
ok('on all their work, a piece where the new person is not on it stays and says why', last('preview')[1].project_id === undefined && /Otieno is not on this work\. Add them first\. Stays/.test(await text(page.locator('[data-handover-project="J-0420"]'))) && await page.getByRole('checkbox', { name: /Measure the office/ }).isDisabled());
await page.getByRole('checkbox', { name: /Call about fees/ }).uncheck();
await page.screenshot({ path: D + 'projects-handover.png', fullPage: true });
await page.getByRole('button', { name: 'Hand 4 items to Otieno' }).click();
await page.waitForTimeout(500);
ok('handing over sends exactly the chosen items', JSON.stringify(last('go')[1]) === JSON.stringify({ from: 2, to: 3, items: [{ kind: 'task', id: 11 }, { kind: 'date', id: 21 }, { kind: 'thread', id: 31 }, { kind: 'meeting', id: 41 }] }));
ok('afterwards what is left is shown again', /Call about fees/.test(await text(page.locator('[data-handover]'))) && (await page.locator('[data-handover-project="J-0420"]').count()) === 0);

await finish(c);
