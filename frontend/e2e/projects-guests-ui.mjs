// Browser check: guest links (build 9.6). On the Files tab: giving a link (for whom, email, end day at most 90 days away), the list with its
// state and openings, ending it early, and asking a guest for a file. Then the guest's own page with no sign-in: the shared files, a download,
// what is asked of them, and an ended link. The API is answered by the check itself; that a guest only ever sees shared files, that links end
// by themselves and that every opening is logged is proved by ProjectsGuestLinksTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.files.view', 'projects.files.manage', 'projects.files.share', 'projects.files.sign', 'projects.guests'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'legal', company_industry: 'legal', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'M-0413', title: 'Imara v Baraka', description: null, industry: { key: 'legal', name: 'Legal' }, type: { id: 1, name: 'Litigation' }, stage: { id: 1, name: 'Opening', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Opening', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'M-0413', words: {}, can: { open: true }, locks: {}, fields: [] } }));
await page.route(/\/api\/admin\/projects\/413\/files(\?.*)?$/, (route) => json(route, { ready: true, folders: [], files: [{ id: 10, name: 'Expert brief.pdf', folder_id: null, mime: 'application/pdf', extension: 'pdf', size: 120000, versions: 1, shared: true, expires_on: null, source: 'upload', uploaded_by: 'Kamau', updated_at: '2026-11-18', expired: false, expiring: false }], can: { manage: true, share: true, sign: true }, max_kb: 51200 }));
let links = [{ id: 2, name: 'Mr Baraka (old)', email: null, ends_on: '2026-10-01', state: 'ran_out', link: null, visits: 3, last_visit: '2026-09-30 10:00:00', by: 'Kamau', created_at: '2026-09-01' }];
const guestAnswer = () => ({ links, can: { give: true }, max_days: 90, shared: 1 });
await page.route('**/api/admin/projects/413/guests', (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['give', b]); links = [{ id: 3, name: b.name, email: b.email, ends_on: b.ends_on, state: 'live', link: `/guest/${'g'.repeat(48)}`, visits: 0, last_visit: null, by: 'Kamau', created_at: '2026-11-20' }, ...links]; return json(route, guestAnswer(), 201); }
  return json(route, guestAnswer());
});
await page.route('**/api/admin/projects/413/guests/3/end', (route) => { sent.push(['end', 3]); links = links.map((l) => (l.id === 3 ? { ...l, state: 'ended', link: null } : l)); return json(route, guestAnswer()); });
await page.route('**/api/admin/projects/413/guests/2/visits', (route) => json(route, { visits: [{ what: 'file', file: 'Expert brief.pdf', ip: '41.90.1.2', at: '2026-09-30 10:00:00' }, { what: 'opened', file: null, ip: '41.90.1.2', at: '2026-09-30 09:58:00' }] }));
let requests = [];
const reqAnswer = () => ({ requests, can: { ask: true }, people: [{ id: 1, name: 'Kamau' }], contacts: [], guests: links.filter((l) => l.state === 'live').map((l) => ({ id: l.id, name: l.name })) });
await page.route('**/api/admin/projects/413/requests', (route) => {
  if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); sent.push(['ask', b]); requests = [{ id: 6, kind: 'file', what: b.what, state: 'open', due_on: null, late: false, of: 'Dr Otieno', outside: true, guest: true, asked_by: 'Kamau', file: null, version: null, newer: false, answer: null, mine: false }]; return json(route, reqAnswer(), 201); }
  return json(route, reqAnswer());
});

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=files')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-guest-links]').waitFor({ timeout: 15000 });
ok('a link that ran out shows its state and how often it was opened, with no link to copy', /Mr Baraka \(old\) Ran out until 01 Oct 2026 · opened 3 times · given by Kamau/.test(await text(page.locator('[data-guest-link="Mr Baraka (old)"]'))) && (await page.locator('[data-guest-link="Mr Baraka (old)"]').getByRole('button', { name: 'Copy the link' }).count()) === 0);
await page.locator('[data-guest-link="Mr Baraka (old)"]').getByRole('button', { name: 'Openings' }).click();
ok('every opening is listed with what was done and from where', /Downloaded Expert brief\.pdf · 2026-09-30 10:00 · 41\.90\.1\.2 Opened the page · 2026-09-30 09:58/.test(await text(page.locator('[data-guest-visits]'))));
await page.getByRole('button', { name: 'Give a guest link' }).click();
ok('the end day is offered 30 days ahead and cannot be set past 90 days', (await page.getByLabel('Ends on').inputValue()) === inDays(30) && (await page.getByLabel('Ends on').getAttribute('max')) === inDays(90));
await page.getByLabel('For').fill('Dr Otieno');
await page.getByLabel('Email (optional)').fill('otieno@example.test');
await page.getByRole('button', { name: 'Give the link' }).click();
await page.locator('[data-guest-link="Dr Otieno"]').waitFor({ timeout: 5000 });
ok('giving a link sends who, the email and the end day', JSON.stringify(last('give')?.[1]) === JSON.stringify({ name: 'Dr Otieno', email: 'otieno@example.test', ends_on: inDays(30) }));
ok('a live link can be copied and ended', /Dr Otieno Live otieno@example\.test/.test(await text(page.locator('[data-guest-link="Dr Otieno"]'))) && (await page.locator('[data-guest-link="Dr Otieno"]').getByRole('button', { name: 'Copy the link' }).count()) === 1);
await page.screenshot({ path: D + 'projects-guests.png', fullPage: true });
await page.getByRole('button', { name: 'Ask for a file' }).click();
await page.getByLabel('Say what').fill('Your expert report');
await page.getByLabel('Of whom').selectOption({ label: 'Dr Otieno' });
await page.locator('[data-request-form]').getByRole('button', { name: 'Ask', exact: true }).click();
await page.locator('[data-request="Your expert report"]').waitFor({ timeout: 5000 });
ok('a guest can be asked for a file on their link', last('ask')?.[1]?.guest_link_id === 3 && /of Dr Otieno \(guest\)/.test(await text(page.locator('[data-request="Your expert report"]'))));
await page.locator('[data-guest-link="Dr Otieno"]').getByRole('button', { name: 'End it now' }).click();
await page.waitForTimeout(300);
ok('ending it early is sent and shown', JSON.stringify(last('end')) === JSON.stringify(['end', 3]) && /Dr Otieno Ended/.test(await text(page.locator('[data-guest-link="Dr Otieno"]'))));

// the guest's page: no sign-in
const T = 'g'.repeat(48);
const fetched = [];
await page.route(`**/api/guests/${T}`, (route) => json(route, { company: 'Wakili & Co', project: 'M-0413 Imara v Baraka', name: 'Dr Otieno', ends_on: inDays(30), files: [{ id: 10, name: 'Expert brief.pdf', size: 120000, versions: 2, shared_at: '2026-11-18' }],
  requests: [{ what: 'Your expert report', kind: 'file', state: 'open', due_on: null, link: '/request/rrr' }, { what: 'Sign the statement', kind: 'signoff', state: 'done', due_on: null, link: '/request/sss' }] }));
await page.route(`**/api/guests/${T}/files/10`, (route) => { fetched.push(10); return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 brief' }); });
await page.route(`**/api/guests/${'e'.repeat(48)}`, (route) => json(route, { message: 'This link has ended. Ask whoever sent it for a new one.' }, 410));
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(`/guest/${T}`)}`, { waitUntil: 'networkidle' });
await page.locator('[data-guest-page]').waitFor({ timeout: 10000 });
ok('the guest page says whose it is and until when', /Wakili & Co · M-0413 Imara v Baraka Documents shared with Dr Otieno This link works until/.test(await text(page.locator('[data-guest-page]'))));
ok('what is asked of them links to the request page while it waits', (await page.getByRole('link', { name: 'Your expert report' }).getAttribute('href')) === '/request/rrr' && (await page.getByRole('link', { name: 'Sign the statement' }).count()) === 0 && /Sign the statement · a sign-off · Done/.test(await text(page.locator('[data-guest-requests]'))));
const dl = page.waitForEvent('download', { timeout: 5000 });
await page.locator('[data-guest-file="Expert brief.pdf"]').getByRole('button', { name: 'Download' }).click();
ok('a shared file downloads through the guest link', (await dl).suggestedFilename() === 'Expert brief.pdf' && fetched.includes(10));
await page.screenshot({ path: D + 'projects-guest-page.png', fullPage: true });
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(`/guest/${'e'.repeat(48)}`)}`, { waitUntil: 'networkidle' });
await page.getByRole('alert').waitFor({ timeout: 10000 });
ok('an ended link says so', /This link has ended/.test(await page.getByRole('alert').innerText()));
await finish(c);
