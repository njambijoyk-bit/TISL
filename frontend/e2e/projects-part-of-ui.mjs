// Browser check: the "Part of" strip on a module's own record page (build 7.4): which pieces of work the record is part of, and adding it to one.
// It says nothing at all when Projects answers no (off, or not this person's). The API is answered by the check itself; who may see and add is
// proved by ProjectsLinksTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.links', 'tickets.manage'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
let linked = [{ id: 413, number: 'M-0413', title: 'Karura Lodge wing' }];
let mode = 'on';
await page.route(/\/api\/admin\/projects\/linked\/targets\?.*/, (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['targets', q]); return json(route, { projects: [{ id: 420, number: 'J-0420', title: 'Gate house' }] }); });
await page.route(/\/api\/admin\/projects\/linked(\?.*)?$/, (route) => {
  if (mode === 'off') return json(route, { message: 'This module is not switched on.' }, 403);
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['add', b]); linked = [...linked, { id: 420, number: 'J-0420', title: 'Gate house' }]; }
  return json(route, { projects: linked, can_add: true });
});

await page.goto(`${SITE}/e2e/harness.html?c=PartOfWork`, { waitUntil: 'networkidle' });
await page.locator('[data-part-of]').waitFor({ timeout: 15000 });
ok('the record says which pieces of work it is part of, each a way in', /Part of M-0413 Karura Lodge wing/.test(await text(page.locator('[data-part-of]'))) && (await page.getByRole('link', { name: 'M-0413 Karura Lodge wing' }).getAttribute('href')) === '/admin/projects/413?tab=links');
await page.getByRole('button', { name: 'Add to a piece of work' }).click();
await page.getByLabel('Find the piece of work').fill('gate');
await page.getByRole('option', { name: 'J-0420 Gate house' }).waitFor({ timeout: 5000 });
ok('adding looks only for work it could go on', [...sent].reverse().find((x) => x[0] === 'targets')[1].q === 'gate');
await page.getByRole('option', { name: 'J-0420 Gate house' }).click();
await page.waitForTimeout(400);
ok('choosing one adds it there and the strip shows both', JSON.stringify([...sent].reverse().find((x) => x[0] === 'add')[1]) === JSON.stringify({ type: 'support.ticket', id: 3, project_id: 420 }) && /Part of M-0413 Karura Lodge wing J-0420 Gate house/.test(await text(page.locator('[data-part-of]'))));
await page.screenshot({ path: D + 'projects-part-of.png' });
mode = 'off';
await page.goto(`${SITE}/e2e/harness.html?c=PartOfWork`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
ok('when Projects answers no, the page shows nothing about it', (await page.locator('[data-part-of]').count()) === 0);

await finish(c);
