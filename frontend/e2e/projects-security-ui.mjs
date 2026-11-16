// Browser check: Projects security (build 2.5): the signals that fired, reviewing one, releasing a paused person, the signal settings, and what a
// paused person sees. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Amina', email: 'amina@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.security.view', 'projects.config.actions'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');
const row = (id) => page.locator(`[data-event="${id}"]`);

const event = (id, o) => ({ id, signal: 'refusals', signal_label: 'Many refusals', user_id: 10 + id, who: 'Otieno', project_id: null, project: null, detail: '11 refusals in 10 minutes across 9 projects', response: 'alert', held: false, hold_until: null, released_by: null, released_at: null, reviewed_by: null, reviewed_at: null, review_note: null, at: '2026-11-16 14:12:00', mine: false, ...o });
let events = [
  event(4, { response: 'pause', held: true }),
  event(3, { signal: 'lock_tries', signal_label: 'Wrong lock passwords', who: 'Wambui', detail: '5 wrong lock passwords in 15 minutes', project_id: 413, project: 'M-0413', response: 'slow', held: true, hold_until: '2026-11-16 11:55:00', at: '2026-11-16 11:40:00' }),
  event(2, { signal: 'outside_hours', signal_label: 'Tries outside hours', who: 'Amina', detail: '4 tries outside hours in 30 minutes', at: '2026-11-15 22:05:00', mine: true }),
  event(1, { signal: 'opening_spree', signal_label: 'Opening spree', who: 'Odhiambo', detail: 'Opened 64 projects in 15 minutes', at: '2026-11-12 16:30:00', reviewed_by: 'Bob', reviewed_at: '2026-11-12 17:00:00', review_note: 'Preparing the quarterly file review' })];
const sig = (count, minutes) => ({ on: true, count, minutes, response: 'alert' });
let settings = { refusals: sig(10, 10), lock_tries: sig(5, 15), outside_hours: sig(4, 30), opening_spree: sig(50, 15), cool_off_minutes: 15 };
let canSettings = true; let watchers = 2;
const answer = () => ({ ready: true, events, summary: { paused: events.filter((e) => e.held && e.response === 'pause').length, open: events.filter((e) => !e.reviewed_at).length }, settings,
  signals: [{ key: 'refusals', label: 'Many refusals', counts: 'Refusals for things they may not do' }, { key: 'lock_tries', label: 'Wrong lock passwords', counts: 'Wrong passwords for locked areas' }, { key: 'outside_hours', label: 'Tries outside hours', counts: 'Tries to open a project outside its hours' }, { key: 'opening_spree', label: 'Opening spree', counts: 'Different projects opened' }],
  responses: { alert: 'Alert only', slow: 'Cool off: read only for a while', pause: 'Pause their access to Projects' }, watchers, can: { settings: canSettings } });

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'general', company_industry: 'general', names: { project: { name: 'Project', plural: 'Projects' } }, keys: {} }));
await page.route('**/api/admin/projects/invitations', (route) => json(route, { invitations: [] }));
await page.route('**/api/admin/projects/security', (route) => json(route, answer()));
await page.route(/\/api\/admin\/projects\/security\/events\/\d+$/, (route) => {
  const id = Number(route.request().url().match(/(\d+)$/)[1]); const b = route.request().postDataJSON(); sent.push(['event', id, b]);
  events = events.map((e) => (e.id === id ? { ...e, reviewed_by: 'Amina', reviewed_at: '2026-11-16 15:00:00', review_note: b.note, ...(b.release ? { held: false, released_by: 'Amina', released_at: '2026-11-16 15:00:00' } : {}) } : e));
  return json(route, answer());
});
await page.route('**/api/admin/projects/configuration/security', (route) => {
  const b = route.request().postDataJSON(); sent.push(['settings', b]);
  if (b.settings.refusals.count < 2) return json(route, { message: '"Many refusals" needs a count from 2 to 1,000 and a time from 1 minute to 24 hours.' }, 422);
  settings = b.settings; return json(route, answer());
});

await go('/admin/projects/security');
await row(4).waitFor({ timeout: 15000 });
ok('each signal shows who, what happened and what was done', /Otieno/.test(await text(row(4))) && /11 refusals in 10 minutes across 9 projects/.test(await text(row(4))) && /Paused/.test(await text(row(4))) && /Read only until 11:55/.test(await text(row(3))) && /M-0413/.test(await text(row(3))) && /Alert only/.test(await text(row(2))));
ok('the heading counts who is paused and what is still to review', /1 paused/.test(await text()) && /3 to review/.test(await text()));
ok('a signal already reviewed shows who reviewed it and what they found', /Bob: Preparing the quarterly file review/.test(await text(row(1))) && (await row(1).getByRole('button').count()) === 0);
ok('nobody reviews a signal about themselves', (await row(2).getByRole('button').count()) === 0);
ok('only someone held back can be released', (await page.getByRole('button', { name: /^Release / }).count()) === 2 && (await row(4).getByRole('button', { name: 'Release Otieno' }).count()) === 1);
await page.screenshot({ path: D + 'projects-security.png', fullPage: true });

await page.getByRole('button', { name: 'Release Otieno' }).click();
await page.getByLabel('Why you are releasing Otieno').fill('Was relinking files after the reorganisation');
await page.getByRole('button', { name: 'Release them' }).click();
await page.waitForTimeout(400);
ok('a release is sent with its reason and the row and count follow', JSON.stringify(sent.at(-1)) === JSON.stringify(['event', 4, { note: 'Was relinking files after the reorganisation', release: true }]) && /Released by Amina/.test(await text(row(4))) && /0 paused/.test(await text()));
await page.getByRole('button', { name: 'Review the signal about Wambui' }).click();
await page.getByLabel('What you found about Wambui').fill('Password was changed last week; she had the old one');
await page.getByRole('button', { name: 'Mark as reviewed' }).click();
await page.waitForTimeout(400);
ok('a review is sent as a note, without releasing', JSON.stringify(sent.at(-1)[2]) === JSON.stringify({ note: 'Password was changed last week; she had the old one', release: false }) && /Reviewed/.test(await text(row(3))));

// ---------------------------------------------------------------- the settings
const refusals = page.locator('[data-signal="refusals"]');
ok('each signal has a count, a time and what happens then; out of the box each only alerts', (await page.getByLabel('Many refusals: how many').inputValue()) === '10' && (await page.getByLabel('Many refusals: within how many minutes').inputValue()) === '10' && (await page.getByLabel('Many refusals: what happens').inputValue()) === 'alert' && /Refusals for things they may not do/.test(await text(refusals)));
ok('it says a pause covers Projects only and that the watchers are never held', /A pause covers Projects only/.test(await text()) && /never paused or cooled off themselves/.test(await text()));
await page.getByLabel('Many refusals: how many').fill('1');
await page.getByRole('button', { name: 'Save signal settings' }).click();
await page.waitForTimeout(300);
ok('a count of one is stopped by the form itself', sent.filter((x) => x[0] === 'settings').length === 0);
await page.getByLabel('Many refusals: how many').fill('8');
await page.getByLabel('Many refusals: what happens').selectOption('pause');
await page.getByLabel('Watch for Opening spree').click();
await page.getByLabel('Cooling off lasts this many minutes').fill('30');
await page.getByRole('button', { name: 'Save signal settings' }).click();
await page.waitForTimeout(400);
const st = sent.at(-1)[1].settings;
ok('the settings are sent whole, with numbers as numbers', JSON.stringify(st.refusals) === JSON.stringify({ on: true, count: 8, minutes: 10, response: 'pause' }) && st.opening_spree.on === false && st.cool_off_minutes === 30 && st.lock_tries.count === 5, JSON.stringify(st.refusals));

canSettings = false; watchers = 1; events = [];
await go('/admin/projects/security');
await page.getByText('Signal settings').waitFor({ timeout: 15000 });
ok('with nothing fired it says that is the normal state', /Nothing has fired\. That is the normal state/.test(await text()));
ok('it warns when only one person watches', /You are the only person who sees this page/.test(await text()));
ok('someone who may not change the settings sees them greyed', (await page.getByLabel('Many refusals: how many').isDisabled()) && (await page.getByRole('button', { name: 'Save signal settings' }).count()) === 0);

// ---------------------------------------------------------------- what a paused person sees
await page.route(/\/api\/admin\/projects(\?.*)?$/, (route) => json(route, { message: 'Your access to Projects is paused after unusual activity. Someone who looks after Projects security can release it. The rest of TISL still works.', paused: true }, 403));
await go('/admin/projects');
await page.getByText(/Your access to Projects is paused/).first().waitFor({ timeout: 15000 });
ok('a paused person is told why nothing loads and that the rest of TISL still works', /The rest of TISL still works/.test(await text()));
await page.screenshot({ path: D + 'projects-paused.png', fullPage: true });

await finish(c);
