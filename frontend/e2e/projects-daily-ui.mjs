// Browser check: the daily record on a phone (build 10.5). Weather and work done, adding a person, a crew and plant hours, a photo (sent as a
// real upload), signing with a typed name, and that a signed day only takes notes. Run at phone width. The API is answered by the check
// itself; locking, the Files folder and the 18:00 reminder are proved by ProjectsDailyTest. It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
await page.setViewportSize({ width: 390, height: 844 });
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Achieng', email: 'achieng@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.daily'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');
const today = new Date().toISOString().slice(0, 10);
await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: {}, keys: {} }));
await page.route(/\/api\/admin\/projects\/413$/, (route) => json(route, { project: { id: 413, number: 'C-0413', title: 'Kilimani flats', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 1, name: 'Building' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'C-0413', words: { daily_record: { name: 'Site diary', plural: 'Site diaries' }, material: { name: 'Material', plural: 'Materials' } }, can: { open: true }, locks: {}, fields: [] } }));
let record = null;
let lines = [];
const day = () => ({ ready: true, day: today, today, keeps_daily: false, record, lines, people: [{ id: 2, name: 'Njeri' }], plant: [{ instance_id: null, hire_id: 5, name: 'Tower crane (hired)' }], recent: record ? [{ day: today, state: record.state }] : [],
  can: { write: !record || record.state === 'draft', note: true, sign: !!record && record.state === 'draft', photos: true, settings: true } });
const ensure = () => { record ??= { id: 1, weather: null, work_done: null, delays: null, notes: null, state: 'draft', signed: null }; };
await page.route(`**/api/admin/projects/413/daily/${today}`, (route) => { if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['save', b]); ensure(); record = { ...record, ...b }; } return json(route, day()); });
await page.route(`**/api/admin/projects/413/daily/${today}/lines`, (route) => { const b = route.request().postDataJSON(); sent.push(['line', b]); ensure();
  const l = { id: lines.length + 1, kind: b.kind, person: b.user_id ? 'Njeri' : null, trade: b.trade ?? null, head_count: b.head_count ?? null, hours: b.hours != null ? Number(b.hours) : null, plant: b.hire_id ? 'Tower crane (hired)' : null, material: null, quantity: null, text: b.text, file: null, after_signing: record.state === 'signed', by: 'Achieng' };
  lines = [...lines, l]; return json(route, day(), 201); });
await page.route(`**/api/admin/projects/413/daily/${today}/photos`, (route) => { sent.push(['photo', route.request().headers()['content-type'] ?? '']); ensure(); lines = [...lines, { id: 99, kind: 'photo', file: { id: 7, name: 'slab.jpg' }, text: 'Level 2 slab', after_signing: false }]; return json(route, day(), 201); });
await page.route(`**/api/admin/projects/413/daily/${today}/sign`, (route) => { sent.push(['sign', route.request().postDataJSON()]); record = { ...record, state: 'signed', signed: { name: 'Achieng Otieno', by: 'Achieng', at: `${today} 17:40:00` } }; return json(route, day()); });

page.on('dialog', (d) => d.accept('Level 2 slab'));
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/413?tab=site&part=daily')}`, { waitUntil: 'networkidle' });
await page.locator('[data-daily]').waitFor({ timeout: 15000 });
ok('it opens on today, named in the industry\'s words', /Site diary/.test(await text(page.locator('[data-daily-text]'))) && (await page.getByLabel('The day', { exact: true }).inputValue()) === today);
ok('the page fits a phone with no sideways scrolling', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.getByRole('button', { name: 'Rain', exact: true }).click();
await page.getByLabel('Work done').fill('Slab cast on level 2');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(300);
ok('weather and work done are saved', last('save')?.[1]?.weather === 'Rain' && last('save')?.[1]?.work_done === 'Slab cast on level 2');
await page.getByRole('button', { name: '+ Person' }).click();
await page.getByLabel('Who').selectOption({ label: 'Njeri' });
await page.getByLabel('Hours (optional)').fill('8');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByRole('button', { name: '+ Crew' }).click();
await page.getByLabel('Trade').fill('Masons');
await page.getByLabel('How many').fill('6');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByRole('button', { name: '+ Plant hours' }).click();
await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'Tower crane (hired)' });
await page.getByLabel('Hours (optional)').fill('6.5');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('[data-daily-group="plant"]').waitFor({ timeout: 5000 });
ok('people, crews and plant hours are added and grouped', JSON.stringify(last('line')?.[1]) === JSON.stringify({ kind: 'plant', text: null, hours: '6.5', hire_id: 5 }) && /Njeri · 8 h/.test(await text(page.locator('[data-daily-group="person"]'))) && /6 Masons/.test(await text(page.locator('[data-daily-group="crew"]'))) && /Tower crane \(hired\) · 6.5 h/.test(await text(page.locator('[data-daily-group="plant"]'))));
await page.getByLabel('Take a photo').setInputFiles({ name: 'slab.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpeg') });
await page.locator('[data-daily-group="photo"]').waitFor({ timeout: 5000 });
ok('a photo is sent as a real upload', /^multipart\/form-data/.test(last('photo')?.[1] ?? '') && /slab.jpg · Level 2 slab/.test(await text(page.locator('[data-daily-group="photo"]'))));
await page.screenshot({ path: D + 'projects-daily.png', fullPage: true });
await page.getByLabel('Type your full name to sign').fill('Achieng Otieno');
await page.getByRole('button', { name: 'Sign', exact: true }).click();
await page.locator('[data-daily-signed]').waitFor({ timeout: 5000 });
ok('signing locks the day: no more adding, only a note', JSON.stringify(last('sign')?.[1]) === JSON.stringify({ name: 'Achieng Otieno' }) && (await page.getByRole('button', { name: '+ Crew' }).count()) === 0 && (await page.getByRole('button', { name: '+ A note' }).count()) === 1);
await page.getByRole('button', { name: '+ A note' }).click();
await page.getByLabel('The note').fill('Test cubes taken late');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('[data-daily-group="note"]').waitFor({ timeout: 5000 });
ok('a note after signing is marked so', /Test cubes taken late Added after signing/.test(await text(page.locator('[data-daily-group="note"]'))));
await finish(c);
