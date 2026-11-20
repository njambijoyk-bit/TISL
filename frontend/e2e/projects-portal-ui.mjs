// Browser check: the client portal (build 9.5). A signed-in customer sees their own work, where it is, what is asked of them, the meetings,
// the shared documents (downloaded through the portal) and the invoices on it. The API is answered by the check itself; that only the customer's
// own work and only shared files come back is proved by ProjectsPortalTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 9, name: 'Grace Wambua', email: 'grace@example.test' }, customer: { id: 1 }, security: null, access: { account: 'customer', clearance: 0, permissions: [] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const asked = [];
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/customer/my-work', (route) => json(route, { ready: true, work: [{ id: 413, number: 'M-0413', title: 'Imara v Baraka', state: 'open', stage: 'Hearing', waiting: 1 }, { id: 414, number: 'M-0414', title: 'Lease review', state: 'open', stage: 'Opening', waiting: 0 }] }));
await page.route('**/api/customer/my-work/413', (route) => json(route, {
  work: { id: 413, number: 'M-0413', title: 'Imara v Baraka', state: 'open', start_date: '2026-10-01', due_date: '2027-03-31' },
  stages: [{ name: 'Opening', now: false, past: true }, { name: 'Hearing', now: true, past: false }, { name: 'Judgment', now: false, past: false }],
  phases: [{ name: 'Pleadings', state: 'done' }, { name: 'Discovery', state: 'active' }],
  meetings: [{ title: 'Case review', starts_at: '2026-11-25T10:00:00', ends_at: '2026-11-25T11:00:00', location: 'Our office', online_link: null, state: 'planned', answer: 'pending', answer_link: '/meeting/abc123' }],
  files: [{ id: 10, name: 'Plaint.pdf', size: 245000, versions: 2, shared_at: '2026-11-12' }],
  requests: [{ what: 'The title deed', kind: 'file', due_on: '2026-12-01', of: 'Grace Wambua', link: '/request/tok123' }],
  snags: [{ number: 2, title: 'Chipped tile at the entrance', area: 'Lobby', state: 'fixed', due_on: null }],
  invoices: [{ number: 'INV-0044', type: 'Sales Invoice', date: '2026-11-12', total: 480000, open: 180000 }, { number: 'INV-0031', type: 'Sales Invoice', date: '2026-10-05', total: 50000, open: 0 }],
}));
await page.route('**/api/customer/my-work/413/files/10', (route) => { asked.push('file 10'); return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 plaint' }); });

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/my-work')}`, { waitUntil: 'networkidle' });
await page.locator('[data-my-work]').waitFor({ timeout: 15000 });
ok('the list shows each piece of work, its stage and what is asked of the customer', /Imara v Baraka · M-0413 Hearing 1 waiting/.test(await text(page.locator('[data-my-work-row="413"]'))) && /Lease review · M-0414 Opening Nothing/.test(await text(page.locator('[data-my-work-row="414"]'))));
await page.getByRole('link', { name: 'Imara v Baraka' }).click();
await page.locator('[data-my-work-one]').waitFor({ timeout: 10000 });
ok('the work shows its dates', /M-0413 · Started 1 Oct 2026 · Due 31 Mar 2027/.test(await text(page.locator('[data-my-work-one]'))));
ok('where it is: past stages, the one it is at now, and the phases', (await page.locator('[data-my-stages] li[aria-current="step"]').innerText()) === 'Hearing' && /Pleadings done Discovery active/.test(await text(page.locator('[data-my-stages] ul'))));
ok('what is asked of them links to the page where they send it', (await page.getByRole('link', { name: 'The title deed' }).getAttribute('href')) === '/request/tok123' && /a file · by 1 Dec 2026 · for Grace Wambua/.test(await text(page.locator('[data-my-requests]'))));
ok('a meeting not yet answered offers the answer link, with no answer shown', (await page.locator('[data-my-meetings]').getByRole('link', { name: 'Answer' }).getAttribute('href')) === '/meeting/abc123' && !/pending/i.test(await text(page.locator('[data-my-meetings]'))));
ok('shared documents are listed', /Plaint\.pdf · version 2 239 KB 12 Nov 2026/.test(await text(page.locator('[data-my-file="Plaint.pdf"]'))));
const dl = page.waitForEvent('download', { timeout: 5000 });
await page.locator('[data-my-file="Plaint.pdf"]').getByRole('button', { name: 'Download' }).click();
ok('downloading goes through the portal and saves under the file name', (await dl).suggestedFilename() === 'Plaint.pdf' && asked.includes('file 10'));
ok('invoices show what is still to pay, and point to My account to pay', /INV-0044 12 Nov 2026 480,000 180,000/.test(await text(page.locator('[data-my-invoice="INV-0044"]'))) && /Paid/.test(await text(page.locator('[data-my-invoice="INV-0031"]'))) && (await page.getByRole('link', { name: 'Pay from My account' }).getAttribute('href')) === '/my-account');
ok('snags shared with the client are shown with how far they are', /Chipped tile at the entrance · Lobby Fixed, being checked/.test(await text(page.locator('[data-my-snags]'))));
await page.screenshot({ path: D + 'projects-portal.png', fullPage: true });
await finish(c);
