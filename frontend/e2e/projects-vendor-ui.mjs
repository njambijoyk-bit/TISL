// Browser check: the subcontractor's view in the vendor portal (build 10.4). Their subcontracts with what is certified and held back, their
// claims with our bills, and making a claim with a file (sent as a real upload). The API is answered by the check itself; that a vendor
// sees only their own is proved by ProjectsSubcontractsTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 9, name: 'Grace', email: 'grace@juja.test' }, customer: null, security: null, access: { account: 'vendor', clearance: 0, permissions: [] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const sent = [];
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
let subs = [{ id: 81, project: 'C-0413 Kilimani flats', vendor_id: 3, vendor: 'Juja Electrical', title: 'Electrical works', scope: 'All wiring and fittings', starts_on: null, ends_on: null, state: 'active', retention_pct: 10, order: { id: 30, number: 'PO-0030', status: 'sent' },
  certified_pct: 25, value: 2000000, certified: 500000, held: 50000, released: false,
  claims: [{ id: 91, number: 1, period_to: '2026-10-31', claimed_pct: 30, certified_pct: 25, state: 'certified', note: null, answer_note: 'Second floor not finished', by_vendor: true, at: '2026-11-01', file_id: null, bill: { id: 5, number: 'PI-0012', total: 580000 } }] }];
let vsnags = [{ id: 4, project: 'C-0413', subcontract: 'Electrical works', number: 3, title: 'Socket loose in kitchen', area: 'Flat 2B', due_on: '2026-11-18', late: true, state: 'open', note: null }];
await page.route('**/api/vendor-portal/subcontracts', (route) => json(route, { ready: true, subcontracts: subs, snags: vsnags }));
await page.route('**/api/vendor-portal/subcontracts/snags/4/fix', (route) => { sent.push('fix:' + route.request().postDataJSON().note); vsnags = [{ ...vsnags[0], state: 'fixed', late: false }]; return json(route, { ready: true, subcontracts: subs, snags: vsnags }); });
await page.route('**/api/vendor-portal/subcontracts/81/claims', (route) => { sent.push(route.request().headers()['content-type'] ?? ''); subs = [{ ...subs[0], claims: [{ id: 92, number: 2, period_to: null, claimed_pct: 60, certified_pct: null, state: 'submitted', note: null, answer_note: null, by_vendor: true, at: '2026-11-20', file_id: 4, bill: null }, ...subs[0].claims] }]; return json(route, { ready: true, subcontracts: subs, snags: vsnags }, 201); });

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/vendor-portal/subcontracts')}`, { waitUntil: 'networkidle' });
await page.locator('[data-vendor-subcontracts]').waitFor({ timeout: 15000 });
ok('the subcontract names the work, the order and retention, with what is certified and held back', /C-0413 Kilimani flats · PO-0030 · retention 10%/.test(await text(page.locator('[data-vendor-subcontract="Electrical works"]'))) && /Certified 25% · (KES )?500,000 of (KES )?2,000,000 before tax · held back (KES )?50,000/.test(await text(page.locator('[data-vendor-totals]'))));
ok('a certified claim shows why it was less and our bill', /Claim 1: 30%, certified 25% · up to 31 Oct 2026 · "Second floor not finished" · our bill PI-0012 (KES )?580,000 Certified/.test(await text(page.locator('[data-vendor-claim="1"]'))));
await page.getByRole('button', { name: 'Make a claim' }).click();
await page.getByLabel('How far the whole work is (%)').fill('60');
await page.getByLabel('A file (optional)').setInputFiles({ name: 'progress.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 progress') });
await page.getByRole('button', { name: 'Send the claim' }).click();
await page.locator('[data-vendor-claim="2"]').waitFor({ timeout: 5000 });
ok('a claim is sent with its file as a real upload and then waits', /^multipart\/form-data/.test(sent[0] ?? '') && /Claim 2: 60% Waiting/.test(await text(page.locator('[data-vendor-claim="2"]'))) && (await page.getByRole('button', { name: 'Make a claim' }).count()) === 0);
page.on('dialog', (d) => d.accept('Tightened and tested'));
ok('snags given to them are listed, late ones marked', /3. Socket loose in kitchen · C-0413 · Electrical works · Flat 2B · by 18 Nov 2026 Late Open/.test(await text(page.locator('[data-vendor-snag="3"]'))));
await page.locator('[data-vendor-snag="3"]').getByRole('button', { name: 'Mark fixed' }).click();
await page.waitForTimeout(300);
ok('they mark a snag fixed with what was done', sent.includes('fix:Tightened and tested') && /Fixed, being checked/.test(await text(page.locator('[data-vendor-snag="3"]'))));
await page.screenshot({ path: D + 'projects-vendor-subcontracts.png', fullPage: true });
await finish(c);
