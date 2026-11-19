// Browser check: the Files tab (build 9.1). Folders, files with their versions, team only or shared, adding a file (sent as a real upload),
// sharing, moving, a new version, removing and putting back. The API is answered by the check itself; the vault, the versions and who may do
// what are proved by ProjectsFilesTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.files.view', 'projects.files.manage', 'projects.files.share'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara v Baraka', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words: {}, can: { open: true }, locks: {}, fields: [] } }));
const file = (o) => ({ folder_id: null, mime: 'application/pdf', extension: 'pdf', size: 245000, versions: 1, shared: false, expires_on: null, source: 'upload', uploaded_by: 'Kamau', updated_at: '2026-11-18', expired: false, expiring: false, ...o });
let folders = [{ id: 1, parent_id: null, name: 'Pleadings' }];
let files = [file({ id: 10, name: 'Plaint.pdf', folder_id: 1, versions: 2, shared: true }), file({ id: 11, name: 'Engagement letter.pdf', expires_on: '2026-12-01', expiring: true })];
let removedFiles = [];
const answer = (removed) => ({ ready: true, folders, files: removed ? removedFiles : files, can: { manage: true, share: true, sign: true }, max_kb: 51200 });
await page.route(/\/api\/admin\/projects\/413\/files(\?.*)?$/, async (route) => {
  if (route.request().method() === 'POST') { sent.push(['upload', route.request().headers()['content-type'] ?? 'none']); /* the browser does not hand a file upload's body to the check: its kind is enough */ files = [...files, file({ id: 12, name: 'Witness statement.pdf' })]; return json(route, answer(false), 201); }
  return json(route, answer(new URL(route.request().url()).searchParams.get('removed') === '1'));
});
await page.route(/\/api\/admin\/projects\/413\/files\/\d+(\/(versions|restore))?$/, (route) => {
  const url = route.request().url(); const id = Number(url.match(/files\/(\d+)/)[1]); const m = route.request().method();
  if (/versions$/.test(url) && m === 'GET') return json(route, { versions: [{ number: 2, size: 1, note: 'Amended', by: 'Kamau', at: '2026-11-18 10:00:00' }, { number: 1, size: 1, note: 'First version', by: 'Kamau', at: '2026-11-10 09:00:00' }] });
  if (/versions$/.test(url)) { sent.push(['version', id]); return json(route, answer(false), 201); }
  if (/restore$/.test(url)) { sent.push(['restore', id]); files = [...files, ...removedFiles]; removedFiles = []; return json(route, answer(false)); }
  if (m === 'DELETE') { sent.push(['remove', id]); removedFiles = files.filter((f) => f.id === id); files = files.filter((f) => f.id !== id); return json(route, answer(false)); }
  const b = route.request().postDataJSON(); sent.push(['change', id, b]); files = files.map((f) => (f.id === id ? { ...f, ...b } : f)); return json(route, answer(false));
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=files')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-files]').waitFor({ timeout: 15000 });
ok('folders and files at the top, each saying who sees it and when it runs out', (await page.locator('[data-folder="Pleadings"]').count()) === 1 && /Engagement letter\.pdf Team only Runs out 01 Dec 2026 239 KB · Kamau/.test(await text(page.locator('[data-file="Engagement letter.pdf"]'))));
await page.locator('[data-folder="Pleadings"]').getByRole('button', { name: '▸ Pleadings' }).click();
ok('opening a folder shows its files', /Plaint\.pdf Shared with the client 2 versions/.test(await text(page.locator('[data-file="Plaint.pdf"]'))) && (await page.locator('[data-file="Engagement letter.pdf"]').count()) === 0);
await page.getByLabel('Choose files').setInputFiles({ name: 'Witness statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 statement') });
await page.waitForTimeout(500);
ok('adding a file sends it as a real upload', /^multipart\/form-data/.test(String(last('upload')?.[1])), String(last('upload')));
await page.getByRole('button', { name: 'All files' }).click();
await page.locator('[data-file="Engagement letter.pdf"]').getByRole('button', { name: 'More' }).click();
await page.locator('[data-file-more]').waitFor({ timeout: 5000 });
ok('a file\'s versions are listed with what changed', /Version 2 Kamau · 2026-11-18 10:00 · Amended .*Version 1/.test(await text(page.locator('[data-versions]'))));
await page.getByRole('button', { name: 'Share with the client' }).click();
await page.waitForTimeout(300);
ok('sharing with the client is sent and shown', JSON.stringify(last('change')) === JSON.stringify(['change', 11, { shared: true }]) && /Shared with the client/.test(await text(page.locator('[data-file="Engagement letter.pdf"]'))));
await page.getByLabel('Move Engagement letter.pdf').selectOption('1');
await page.waitForTimeout(300);
ok('moving to a folder is sent', JSON.stringify(last('change')) === JSON.stringify(['change', 11, { folder_id: 1 }]));
await page.screenshot({ path: D + 'projects-files.png', fullPage: true });
await page.locator('[data-folder="Pleadings"]').getByRole('button', { name: '▸ Pleadings' }).click();
await page.locator('[data-file-more]').getByRole('button', { name: 'Remove', exact: true }).click();   // its details are still open
await page.waitForTimeout(300);
ok('removing sends it to the removed files', JSON.stringify(last('remove')) === JSON.stringify(['remove', 11]) && (await page.locator('[data-file="Engagement letter.pdf"]').count()) === 0);
await page.getByRole('button', { name: 'Removed files' }).click();
await page.locator('[data-file="Engagement letter.pdf"]').getByRole('button', { name: 'Put it back' }).click();
await page.waitForTimeout(300);
ok('it can be put back', JSON.stringify(last('restore')) === JSON.stringify(['restore', 11]));

await finish(c);
