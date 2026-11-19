// Browser check: the Files tab (build 9.1), making a document from a template (9.2), asking for files and sign-off with the outsider's page (9.3), and registers (9.4). Folders, files with their versions, team only or shared, adding a file (sent as a real upload),
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

await page.route('**/api/admin/projects/413/templates', (route) => json(route, { templates: [{ id: 3, name: 'Engagement letter' }] }));
await page.route('**/api/admin/projects/413/templates/3/preview', (route) => json(route, { html: '<p>Dear Grace Wambua,</p><p>Re: Imara v Baraka</p>', missing: ['project.place'], name: 'Engagement letter M-0413' }));
await page.route('**/api/admin/projects/413/templates/3/make', (route) => { sent.push(['make', route.request().postDataJSON()]); files = [...files, file({ id: 13, name: 'Engagement letter M-0413.pdf', source: 'template' })]; return json(route, { file_id: 13, ...answer(false) }, 201); });
let requests = [{ id: 5, kind: 'file', what: 'A copy of the title deed', state: 'open', due_on: '2026-12-01', late: false, of: 'Grace Wambua', outside: true, asked_by: 'Kamau', file: null, version: null, newer: false, answer: null, mine: false }];
const reqAnswer = () => ({ requests, can: { ask: true }, people: [{ id: 1, name: 'Kamau' }, { id: 2, name: 'Njeri' }], contacts: [{ id: 7, name: 'Grace Wambua', email: 'grace@example.test' }] });
await page.route('**/api/admin/projects/413/requests', (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['ask', b]); requests = [{ id: 6, kind: b.kind, what: b.what, state: 'open', due_on: b.due_on, late: false, of: 'Grace Wambua', outside: true, asked_by: 'Kamau', file: { id: b.file_id, name: 'Plaint.pdf' }, version: 2, newer: false, answer: null, mine: false }, ...requests]; return json(route, reqAnswer(), 201); }
  return json(route, reqAnswer());
});
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=files')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-files]').waitFor({ timeout: 15000 });
await page.locator('[data-requests]').waitFor({ timeout: 10000 });
ok('requests show what was asked of whom, by when, and that it is waiting', /File A copy of the title deed of Grace Wambua \(by email\) · by 01 Dec 2026 Waiting/.test(await text(page.locator('[data-request="A copy of the title deed"]'))));
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

await page.getByRole('button', { name: 'Back to the files' }).click();
await page.getByRole('button', { name: 'All files' }).click();
await page.locator('[data-folder="Pleadings"]').getByRole('button', { name: '▸ Pleadings' }).click();
await page.locator('[data-file="Plaint.pdf"]').getByRole('button', { name: 'More' }).click();
await page.getByRole('button', { name: 'Ask for sign-off' }).click();
await page.locator('[data-request-form]').waitFor({ timeout: 5000 });
ok('asking for sign-off from a file fills in the file', (await page.getByLabel('What', { exact: true }).inputValue()) === 'signoff' && (await page.getByLabel('Say what').inputValue()) === 'Sign off Plaint.pdf');
await page.getByLabel('Of whom').selectOption('c:7');
await page.getByRole('button', { name: 'Ask', exact: true }).click();
await page.waitForTimeout(400);
ok('the sign-off is asked of the contact on that file', JSON.stringify(last('ask')[1]) === JSON.stringify({ kind: 'signoff', what: 'Sign off Plaint.pdf', due_on: null, file_id: 10, contact_id: 7 }) && /Sign-off Sign off Plaint\.pdf of Grace Wambua \(by email\) · Plaint\.pdf, version 2/.test(await text(page.locator('[data-requests]'))));
await page.getByRole('button', { name: 'All files' }).click();
await page.getByRole('button', { name: 'Make a document' }).click();
await page.locator('[data-make-document] iframe').waitFor({ timeout: 5000 });
ok('a template is shown filled from the work, naming what is missing', (await page.getByLabel('Name of the file').inputValue()) === 'Engagement letter M-0413' && /Nothing on this work for: project\.place/.test(await text(page.locator('[data-make-document]')))
  && /Dear Grace Wambua/.test(await page.frameLocator('[data-make-document] iframe').locator('body').innerText()));
await page.screenshot({ path: D + 'projects-make-document.png', fullPage: true });
await page.getByRole('button', { name: 'Make it' }).click();
await page.waitForTimeout(400);
ok('making it keeps it on the files', JSON.stringify(last('make')[1]) === JSON.stringify({ folder_id: null, name: 'Engagement letter M-0413' }) && /made from a template/.test(await text(page.locator('[data-file="Engagement letter M-0413.pdf"]'))));

// registers
let registers = [{ id: 2, name: 'Drawing register', kind: 'Drawing register', statuses: ['For information', 'For comment', 'For construction', 'Superseded'], lines: [{ id: 30, number: 'A-101', title: 'Ground floor plan', revision: 'B', status: 'For comment', file: { id: 10, name: 'Plaint.pdf' }, updated_at: null }] }];
const regAnswer = () => ({ registers, kinds: [{ id: 1, key: 'drawings', name: 'Drawing register', statuses: [], is_active: true }], can: { change: true } });
await page.route('**/api/admin/projects/413/registers', (route) => json(route, regAnswer()));
await page.route('**/api/admin/projects/413/registers/2/lines', (route) => { const b = route.request().postDataJSON(); sent.push(['line', b]); registers = [{ ...registers[0], lines: [...registers[0].lines, { id: 31, ...b, file: null }] }]; return json(route, regAnswer()); });
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=files')}`, { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'Registers' }).click();
await page.locator('[data-register="Drawing register"]').waitFor({ timeout: 10000 });
ok('a register lists its lines with revision, status and file', /A-101 Ground floor plan B For comment Plaint\.pdf/.test(await text(page.locator('[data-line="A-101"]'))));
await page.getByRole('button', { name: 'Add a line' }).click();
await page.getByLabel('Number', { exact: true }).fill('A-102');
await page.getByLabel('Title', { exact: true }).fill('First floor plan');
await page.getByLabel('Status', { exact: true }).selectOption('For information');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(300);
ok('a new line is sent with its status from the kind', JSON.stringify(last('line')[1]) === JSON.stringify({ number: 'A-102', title: 'First floor plan', revision: '', status: 'For information', file_id: null }) && (await page.locator('[data-line="A-102"]').count()) === 1);
await page.screenshot({ path: D + 'projects-registers.png', fullPage: true });

// the outsider's page
let pub = { kind: 'signoff', what: 'Sign off the contract', due_on: null, state: 'open', project: 'M-0413 Imara v Baraka', company: 'Imara Advocates', who: 'Grace Wambua', file: { name: 'Contract.pdf', version: 2 }, answer: null };
const token = 'a'.repeat(48);
await page.route(`**/api/requests/${token}`, (route) => json(route, pub));
await page.route(`**/api/requests/${token}/answer`, (route) => { sent.push(['public', route.request().headers()['content-type']]); pub = { ...pub, state: 'done', answer: { name: 'Grace Wambua', note: null, at: '2026-11-19 10:00:00' } }; return json(route, pub); });
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(`/request/${token}`)}`, { waitUntil: 'networkidle' });
await page.locator('[data-request-answer]').waitFor({ timeout: 10000 });
ok('the outsider sees what is asked and the exact version to open', /Imara Advocates · M-0413 Imara v Baraka Sign off the contract Open Contract\.pdf \(version 2\)/.test(await text(page.locator('[data-request-answer]'))) && (await page.getByRole('link', { name: /Open Contract/ }).getAttribute('href')).endsWith(`/requests/${token}/file`));
await page.getByLabel('Type your full name to sign').fill('Grace Wambua');
await page.getByRole('button', { name: 'Approve' }).click();
await page.waitForTimeout(400);
ok('approving sends it and thanks them', /^multipart\/form-data/.test(last('public')[1]) && /Signed off by Grace Wambua\. Thank you\./.test(await text(page.locator('[data-request-answer]'))));
await page.screenshot({ path: D + 'projects-request-answer.png', fullPage: true });

await finish(c);
