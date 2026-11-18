// Browser check: how staff hear about things (build 6.4). A staff member's own page: groups of notices, the company's default, choosing bell only,
// WhatsApp unavailable without a phone, a locked group; then the company's "How staff hear" tab in Notifications settings: defaults and locks
// saved in the general settings. The API is answered by the check itself; the rules are proved by the backend tests (NotifyStaffChannelsTest).
// It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Wanjiru', email: 'wanjiru@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'notifications.view', 'notifications.settings'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));

const modes = { bell: 'Bell only', email: 'Bell and email', whatsapp: 'Bell and WhatsApp' };
let mine = {};
const groups = () => [
  { key: 'projects', label: 'Projects: your work', types: ['Projects: tasks given to you'], company: 'email', locked: false },
  { key: 'security', label: 'Security and approvals', types: ['A second person is needed to approve something'], company: 'email', locked: true },
].map((g) => ({ ...g, mine: g.locked ? null : (mine[g.key] ?? null), uses: g.locked ? g.company : (mine[g.key] ?? g.company) }));
const pageData = () => ({ ready: true, modes, groups: groups(), phone: null, email: 'wanjiru@example.com', whatsapp_on: true, email_on: true });
await page.route('**/api/admin/notifications/my-channels', (route) => {
  if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['mine', b]); Object.entries(b.choices).forEach(([k, v]) => { if (v === 'default') delete mine[k]; else mine[k] = v; }); return json(route, { message: 'Saved.', data: pageData() }); }
  return json(route, pageData());
});

await page.goto(`${SITE}/e2e/harness.html?c=MyChannels`, { waitUntil: 'networkidle' });
await page.locator('[data-my-channels]').waitFor({ timeout: 15000 });
const proj = page.locator('[data-channel-group="projects"]');
ok('each group shows what it uses now and follows the company until chosen', /Projects: your work Now: Bell and email/.test(await text(proj)) && await proj.getByRole('radio', { name: /As the company sets it \(bell and email\)/ }).isChecked());
ok('WhatsApp cannot be chosen without a phone on the staff profile', await proj.getByRole('radio', { name: 'Bell and WhatsApp' }).isDisabled() && /the phone on your staff profile \(none yet\)/.test(await text(page.locator('[data-my-channels]'))));
await proj.getByRole('radio', { name: 'Bell only' }).click();
await page.waitForTimeout(400);
ok('choosing bell only is saved and shown', JSON.stringify(last('mine')[1]) === JSON.stringify({ choices: { projects: 'bell' } }) && /Now: Bell only/.test(await text(proj)));
ok('a locked group says the company decides it, with no choice', /The company decides this one: bell and email\./.test(await text(page.locator('[data-channel-group="security"]'))) && (await page.locator('[data-channel-group="security"] input').count()) === 0);
await page.screenshot({ path: D + 'notify-my-channels.png', fullPage: true });

// the company's side
let general = { default_mode: 'both', email_enabled: true, whatsapp_enabled: false, whatsapp_number_sources: 'both', essential_only_default: false, staff_groups: { security: { mode: 'email', locked: true } } };
const settings = () => ({ ready: true, parts: { general, types: { rules: {} }, email: {}, whatsapp: { provider: null } }, saved: {}, unreadable: {}, current_version: { general: { id: 3 }, types: null, email: null, whatsapp: null }, whatsapp_waiting: 0, types: [],
  staff_groups: [{ key: 'projects', label: 'Projects: your work', types: ['Projects: tasks given to you'] }, { key: 'security', label: 'Security and approvals', types: [] }], staff_modes: modes,
  whatsapp_api: { providers: {}, automatic: false, webhooks: {}, types_ready: 0 }, health: { ok: true, problems: [] }, server: {}, can: { settings: true, send: true, purge: false } });
await page.route('**/api/admin/notifications/settings', (route) => json(route, settings()));
await page.route('**/api/admin/notifications/settings/general', (route) => { const b = route.request().postDataJSON(); sent.push(['general', b]); general = { ...general, ...b }; return json(route, { message: 'Saved.' }); });
await page.goto(`${SITE}/e2e/harness.html?c=NotificationSettings&tab=staff`, { waitUntil: 'networkidle' });
await page.locator('[data-staff-tab]').waitFor({ timeout: 15000 });
ok('the company sees each group with its default and whether staff may change it', (await page.getByLabel('Projects: your work default').inputValue()) === 'email' && await page.getByLabel('Staff may change Projects: your work').isChecked() && !(await page.getByLabel('Staff may change Security and approvals').isChecked()));
ok('WhatsApp cannot be a default while the company does not send WhatsApp', await page.locator('select[aria-label="Projects: your work default"] option[value="whatsapp"]').isDisabled());
await page.getByLabel('Projects: your work default').selectOption('bell');
await page.getByLabel('Staff may change Projects: your work').uncheck();
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
ok('defaults and locks are saved in the general settings', JSON.stringify(last('general')[1]) === JSON.stringify({ staff_groups: { projects: { mode: 'bell', locked: true }, security: { mode: 'email', locked: true } } }));
await page.screenshot({ path: D + 'notify-staff-tab.png', fullPage: true });

await finish(c);
