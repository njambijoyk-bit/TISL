// Browser check: locked areas and approvals (build 2.3): a tab behind a password, wrong tries, locking it again, managing locks on the Access tab,
// asking for a reset, and the Approvals page. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.phases', 'projects.members.view', 'projects.access.rules', 'projects.locks.reset', 'projects.fields.sensitive'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

const W = { project: ['Matter', 'Matters'], client: ['Client', 'Clients'], lead: ['Responsible advocate', 'Responsible advocates'], reference: ['Case number', 'Case numbers'], authority: ['Court', 'Courts'], place: ['Registry', 'Registries'], phase: ['Phase', 'Phases'], closing_period: ['Appeal period', 'Appeal periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const CAN = { open: true, edit: true, stage: true, close: true, freeze: false, confidential: true, phases: true, members: true, members_view: true, links: true, log: true, access: true };
const AREAS = { people: 'People and access', phases: 'Phases', links: 'Links', activity: 'Activity', sensitive_fields: 'Sensitive fields' };
let locked = { phases: true, sensitive_fields: true }; let opened = {}; let tries = 0; let reset = null;
const state = () => Object.fromEntries(Object.entries(AREAS).map(([a, label]) => [a, { label, locked: !!locked[a], open: !locked[a] || !!opened[a], until: locked[a] && opened[a] ? '2026-11-16 10:15:00' : null }]));
const list = () => Object.entries(AREAS).map(([area, label]) => ({ area, label, locked: !!locked[area], set_by: locked[area] ? 'Kamau' : null, set_at: locked[area] ? '2026-11-14 09:00:00' : null, reset: area === 'phases' ? reset : null }));
const project = () => ({ id: 413, number: 'M-0413', title: 'Imara Sacco v. Baraka Traders', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }, { id: 4, name: 'Closed', state: 'closed', status: 'good', required_fields: [] }], cost_centre_path: 'Projects › M-0413', words, can: CAN, locks: state(),
  fields: opened.sensitive_fields ? [{ key: 'ceiling', label: 'Settlement ceiling', kind: 'text', value: 'KES 4m', sensitive: true, options: [] }] : [] });
let approvals = { waiting: [{ id: 5, kind: 'lock_reset', action: 'lock.reset', summary: 'Reset the password of Links on M-0500 (Karura Lodge v. Mwangi)', reason: 'The person who set it has left', project_id: 500, project: 'M-0500', asked_by: 'Njeri', asked_at: '2026-11-16 09:00:00', expires_at: '2026-11-17 09:00:00', hours_left: 22, status: 'waiting', answered_by: null, answer_note: null }], mine: [], can: { answer: true } };

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: words, keys: {} }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => json(route, { project: project() }));
await page.route(/\/api\/admin\/projects\/\d+\/phases$/, (route) => (locked.phases && !opened.phases ? json(route, { message: 'Phases is locked here. Enter its password to open it.', locked: { area: 'phases' } }, 423) : json(route, { phases: [{ id: 1, parent_id: null, name: 'Pleadings', code: null, status: 'open', depth: 0, has_children: false, cost_centre_id: null }], can: { phases: true, delete: false } })));
await page.route(/\/api\/admin\/projects\/\d+\/access$/, (route) => json(route, { people_locked: false, people: [], others: { kind: 'gets_in', people: [] }, project_hours: null, hours: { project: [], read_outside_hours: false, ready: true, key_holders: ['Kamau'] }, passes: [], locks: list(), summary: { ending_soon: 0, warn_days: 7 }, can: { access: true } }));
await page.route(/\/api\/admin\/projects\/\d+\/locks\/\w+(\/\w+)?$/, (route) => {
  const [, area, act] = route.request().url().match(/locks\/(\w+)(?:\/(\w+))?$/); const method = route.request().method(); const b = route.request().postDataJSON?.() ?? null;
  sent.push([`${method} ${act || ''}`.trim(), area, b]);
  if (act === 'open') {
    if (b.password !== 'blue-kettle-42') { tries += 1; return tries >= 2 ? json(route, { message: 'That is not the password. That was 5 wrong tries: wait 15 minutes before trying again.' }, 429) : json(route, { message: 'That is not the password. 4 tries left before a wait.', locked: { area, tries_left: 4 } }, 422); }
    opened[area] = true; return json(route, { until: '2026-11-16 10:15:00', locks: state() });
  }
  if (act === 'close') { delete opened[area]; return json(route, { locks: state() }); }
  if (act === 'reset') { reset = { status: 'waiting', mine: true, asked_by: 'Kamau' }; return json(route, { locks: list() }, 201); }
  if (method === 'DELETE') { if (b.password !== 'blue-kettle-42') return json(route, { message: 'That is not the password. If it is lost, ask for a reset.' }, 422); delete locked[area]; return json(route, { locks: list() }); }
  if (b.after_reset) { reset = null; return json(route, { locks: list() }); }
  if (b.password.length < 8) return json(route, { message: 'Use at least 8 characters for the password.' }, 422);
  locked[area] = true; return json(route, { locks: list() });
});
await page.route(/\/api\/admin\/projects\/approvals(\/\d+)?$/, (route) => {
  const method = route.request().method(); const id = Number((route.request().url().match(/(\d+)$/) || [])[1]);
  if (method === 'PUT') { const b = route.request().postDataJSON(); sent.push(['answer', id, b]); approvals = { ...approvals, waiting: [] }; }
  if (method === 'DELETE') { sent.push(['withdraw', id]); approvals = { ...approvals, mine: approvals.mine.map((a) => ({ ...a, status: 'withdrawn' })) }; }
  return json(route, approvals);
});

// ---------------------------------------------------------------- a tab behind a password
await go('/admin/projects/413');
await page.getByRole('tab', { name: 'Phases' }).click();
await page.locator('[data-locked-area="phases"]').waitFor({ timeout: 15000 });
ok('a locked tab asks for its password instead of showing what is behind it', /Phases is locked/.test(await text()) && !/Pleadings/.test(await text()));
await page.getByLabel('Password for Phases').fill('a-guess');
await page.getByRole('button', { name: 'Unlock' }).click();
await page.waitForTimeout(300);
ok('a wrong password says how many tries are left, and the box is emptied', /That is not the password\. 4 tries left before a wait/.test(await text()) && (await page.getByLabel('Password for Phases').inputValue()) === '');
await page.screenshot({ path: D + 'projects-locked.png', fullPage: true });
await page.getByLabel('Password for Phases').fill('another');
await page.getByRole('button', { name: 'Unlock' }).click();
await page.waitForTimeout(300);
ok('too many wrong tries mean a wait, said in words', /wait 15 minutes before trying again/.test(await text()));
await page.getByLabel('Password for Phases').fill('blue-kettle-42');
await page.getByRole('button', { name: 'Unlock' }).click();
await page.locator('[data-open-area="phases"]').waitFor({ timeout: 10000 });
ok('the right password opens it, and the page says until when', /Unlocked for you until 10:15/.test(await text()) && /Pleadings/.test(await text()));
ok('the password is sent once, to the unlock door only', sent.filter((x) => x[0] === 'POST open').length === 3 && sent.every((x) => x[0] === 'POST open'));
await page.getByRole('button', { name: 'Lock it again' }).click();
await page.locator('[data-locked-area="phases"]').waitFor({ timeout: 10000 });
ok('it can be locked again without waiting', sent.at(-1)[0] === 'POST close');

await page.getByRole('tab', { name: 'Overview' }).click();
ok('sensitive fields behind a lock are not on the page at all', !/Settlement ceiling/.test(await text()) && /Locked\. Unlock to see them/.test(await text()));
await page.getByRole('button', { name: 'Locked. Unlock to see them' }).click();
await page.getByLabel('Password for Sensitive fields').fill('blue-kettle-42');
await page.getByRole('button', { name: 'Unlock' }).click();
await page.getByText('Settlement ceiling').waitFor({ timeout: 10000 });
ok('and appear once their password is entered', /KES 4m/.test(await text()));

// ---------------------------------------------------------------- managing locks on the Access tab
await page.getByRole('tab', { name: 'Access' }).click();
await page.locator('[data-lock="phases"]').waitFor({ timeout: 15000 });
ok('the Access tab lists every area, which are locked and who set the password', /Locked/.test(await text(page.locator('[data-lock="phases"]'))) && /14 Nov 2026, Kamau/.test(await text(page.locator('[data-lock="phases"]'))) && /Open/.test(await text(page.locator('[data-lock="links"]'))));
await page.getByRole('button', { name: 'Lock Links' }).click();
await page.getByLabel('New password (at least 8 characters)').fill('green-ladder-77');
ok('locking says the password cannot be shown again', /It cannot be shown again, by anyone/.test(await text()));
await page.getByRole('button', { name: 'Lock it', exact: true }).click();
await page.waitForTimeout(400);
ok('a new lock is sent with its password and the row follows', JSON.stringify(sent.at(-1)) === JSON.stringify(['PUT', 'links', { password: 'green-ladder-77' }]) && /Locked/.test(await text(page.locator('[data-lock="links"]'))));
await page.screenshot({ path: D + 'projects-locks.png', fullPage: true });
await page.getByRole('button', { name: 'Take the lock off Links' }).click();
await page.getByLabel('Current password').fill('not-it');
await page.getByRole('button', { name: 'Remove the lock' }).click();
await page.waitForTimeout(300);
ok('removing a lock needs its password; a wrong one is refused next to the form', /That is not the password\. If it is lost, ask for a reset/.test(await text()) && /Locked/.test(await text(page.locator('[data-lock="links"]'))));
await page.getByLabel('Current password').fill('blue-kettle-42');
await page.getByRole('button', { name: 'Remove the lock' }).click();
await page.waitForTimeout(400);
ok('with the password the lock comes off', /Open/.test(await text(page.locator('[data-lock="links"]'))));

await page.getByRole('button', { name: 'Ask for a reset of Phases' }).click();
await page.getByLabel('Why it needs resetting').fill('The person who set it has left');
await page.getByRole('button', { name: 'Ask for a reset', exact: true }).click();
await page.waitForTimeout(400);
ok('a lost password is asked for with a reason, and the row shows it is waiting', JSON.stringify(sent.at(-1)) === JSON.stringify(['POST reset', 'phases', { reason: 'The person who set it has left' }]) && /Reset asked by Kamau/.test(await text(page.locator('[data-lock="phases"]'))) && (await page.getByRole('button', { name: 'Ask for a reset of Phases' }).count()) === 0);
reset = { status: 'approved', mine: true, asked_by: 'Kamau' };
await go('/admin/projects/413?tab=access');
await page.locator('[data-lock="phases"]').waitFor({ timeout: 15000 });
ok('once approved, the person who asked is offered the new password, and nothing else', /Reset approved/.test(await text(page.locator('[data-lock="phases"]'))) && (await page.locator('[data-lock="phases"]').getByRole('button').count()) === 1);
await page.getByRole('button', { name: 'Set the new password of Phases' }).click();
await page.getByLabel('New password (at least 8 characters)').fill('third-password-9');
await page.getByRole('button', { name: 'Set the new password', exact: true }).click();
await page.waitForTimeout(400);
ok('the new password is sent as the end of the reset', JSON.stringify(sent.at(-1)) === JSON.stringify(['PUT', 'phases', { password: 'third-password-9', after_reset: true }]));

// ---------------------------------------------------------------- the Approvals page
await go('/admin/projects/approvals');
await page.locator('[data-approval="5"]').waitFor({ timeout: 15000 });
ok('what waits for me shows who asked, for what, why, and how long is left', /Njeri asks to: Reset the password of Links on M-0500/.test(await text()) && /They say: The person who set it has left/.test(await text()) && /22 h left/.test(await text()));
ok('it says approving does not carry it out', /Approving does not carry it out/.test(await text()));
await page.screenshot({ path: D + 'projects-approvals.png', fullPage: true });
await page.getByRole('button', { name: 'Decline', exact: true }).click();
await page.getByLabel('Why you are declining').fill('Ask the lead first');
await page.getByRole('button', { name: 'Decline it' }).click();
await page.waitForTimeout(400);
ok('declining needs a reason and is sent with it', JSON.stringify(sent.at(-1)) === JSON.stringify(['answer', 5, { approve: false, note: 'Ask the lead first' }]) && /Nothing is waiting for you/.test(await text()));
approvals = { waiting: [], mine: [{ id: 9, kind: 'lock_reset', action: 'lock.reset', summary: 'Reset the password of Phases on M-0413 (Imara Sacco v. Baraka Traders)', reason: 'Lost', project_id: 413, project: 'M-0413', asked_by: 'Kamau', asked_at: '2026-11-16 09:30:00', expires_at: '2026-11-17 09:30:00', hours_left: 23, status: 'approved', answered_by: 'Amina', answer_note: 'Confirmed with HR' }], can: { answer: false } };
await go('/admin/projects/approvals');
await page.locator('[data-mine="9"]').waitFor({ timeout: 15000 });
ok('what I asked for shows the answer and who gave it', /Approved, not done yet/.test(await text()) && /Amina: Confirmed with HR/.test(await text()));
ok('someone who approves nothing does not see an empty inbox', !/Waiting for me/.test(await text()));
await page.getByRole('button', { name: 'Go and do it' }).click();
await page.waitForTimeout(600);
ok('an approved request leads back to where it is carried out', (await page.evaluate(() => window.location.pathname + window.location.search)) === '/admin/projects/413?tab=access');

await finish(c);
