// Browser check: the Links tab of a piece of work (build 1.7): what is attached from other modules, linking and unlinking, amounts read from the books, and what is said about
// links a person cannot see and modules that are not on. The API is answered by the check itself; the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Kamau', email: 'kamau@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'projects.use', 'projects.links', 'books.view', 'events.view'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };
const body = async () => (await page.locator('#root').innerText()).replace(/\s+/g, ' ');

const W = { project: ['Contract', 'Contracts'], client: ['Client', 'Clients'], lead: ['Contracts manager', 'Contracts managers'], reference: ['Contract number', 'Contract numbers'], authority: ['Approving authority', 'Approving authorities'], place: ['Site', 'Sites'], phase: ['Section', 'Sections'], closing_period: ['Defects liability period', 'Defects liability periods'] };
const words = Object.fromEntries(Object.entries(W).map(([k, [name, plural]]) => [k, { name, plural }]));
const CAN = { open: true, edit: true, stage: true, close: true, freeze: true, confidential: true, phases: true, members: true, members_view: false, links: true, log: false };
const project = { id: 52, number: 'BW-0052', title: 'Karura Lodge, 12-room wing', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 5, name: 'Building works' }, stage: { id: 1, name: 'Works', status: 'info' }, state: 'open', priority: 'medium',
  customer: null, lead: { id: 1, name: 'Kamau' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'Projects › BW-0052', words, can: CAN };
let groups = [
  { type: 'books.voucher', label: 'Voucher', plural: 'Vouchers', items: [
    { id: 1, linked_id: 10, title: 'Quotation QT-0231', detail: 'Karura Lodge · 2026-11-10', url: '/admin/books/vouchers/10', amount: 48600000, currency: 'KES', gone: false, note: 'The contract sum', added_by: 'Kamau', added_at: null },
    { id: 2, linked_id: 11, title: 'Sales Invoice INV-0044', detail: 'Karura Lodge · 2026-11-12', url: '/admin/books/vouchers/11', amount: 3990000.5, currency: 'KES', gone: false, note: null, added_by: 'Amina', added_at: null }] },
  { type: 'events.event', label: 'Event', plural: 'Events', items: [{ id: 3, linked_id: 5, title: 'No longer there', detail: null, url: null, amount: null, currency: null, gone: true, note: null, added_by: 'Kamau', added_at: null }] }];
let extra = { hidden: 0, off: [] };
let canLinks = true;
const answer = () => ({ groups, ...extra, can: { links: canLinks } });

await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: words }));
await page.route(/\/api\/admin\/projects\/\d+$/, (route) => json(route, { project }));
await page.route(/\/api\/admin\/projects\/\d+\/links\/find(\?.*)?$/, (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['find', q]);
  return json(route, { found: q.q === 'zzz' ? [] : q.type === 'events.event' ? [{ id: 6, title: 'Wing opening night', detail: 'Karura Lodge · Published' }] : [{ id: 12, title: 'Purchase PUR-0090', detail: 'Bamburi Cement · 2026-11-13' }] }); });
await page.route(/\/api\/admin\/projects\/\d+\/links(\/\d+)?$/, (route) => {
  const method = route.request().method(); const id = Number((route.request().url().match(/links\/(\d+)$/) || [])[1]);
  if (method === 'POST') { const b = route.request().postDataJSON(); sent.push(['add', b]); if (b.linked_id === 12) return json(route, { message: 'It is already linked.' }, 422);
    groups = groups.map((g) => (g.type === b.type ? { ...g, items: [...g.items, { id: 9, linked_id: b.linked_id, title: 'Wing opening night', detail: 'Karura Lodge · Published', url: '/admin/events/6', amount: null, currency: null, gone: false, note: b.note, added_by: 'Kamau', added_at: null }] } : g)); }
  if (method === 'DELETE') { sent.push(['remove', id]); groups = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== id) })); }
  return json(route, answer(), method === 'POST' ? 201 : 200);
});

await go('/admin/projects/52');
await page.getByRole('tab', { name: 'Links' }).click();
await page.locator('[data-links="books.voucher"]').waitFor({ timeout: 15000 });
let text = await body();
ok('each module\'s records are grouped, with what they are and a way to open them', /Vouchers/.test(text) && (await page.getByRole('link', { name: 'Quotation QT-0231' }).getAttribute('href')) === '/admin/books/vouchers/10' && /Karura Lodge · 2026-11-10/.test(text) && /The contract sum/.test(text));
ok('an amount is shown with its currency and thousands separated', /KES 48,600,000/.test(text) && /KES 3,990,000\.5/.test(text));
ok('and it is said that amounts are read from the books and not kept here', /Amounts are read from the books each time\. Nothing about money is kept here\./.test(text));
ok('a record that has gone says so, is not a link, and can still be unlinked', /It was removed from where it lived/.test(text) && (await page.getByRole('link', { name: 'No longer there' }).count()) === 0 && (await page.getByRole('button', { name: 'Unlink No longer there' }).count()) === 1);
await page.screenshot({ path: D + 'projects-links.png', fullPage: true });

await page.getByRole('button', { name: 'Link a event' }).click();
await page.getByRole('option', { name: /Wing opening night/ }).waitFor({ timeout: 5000 });
ok('linking searches that module\'s records', last('find')[1].type === 'events.event');
await page.getByLabel('Find the event').fill('zzz');
await page.getByText('Nothing found.').waitFor({ timeout: 5000 });
await page.getByLabel('Find the event').fill('wing');
await page.getByRole('option', { name: /Wing opening night/ }).click();
ok('nothing is linked until one is chosen', await page.getByRole('button', { name: 'Link it' }).isEnabled() && !last('add'));
await page.getByLabel('Why it is linked (optional)').fill('Handover celebration');
await page.getByRole('button', { name: 'Link it' }).click();
await page.locator('[data-link="Wing opening night"]').waitFor({ timeout: 5000 });
ok('linking sends the kind of record, which one, and the note', JSON.stringify(last('add')[1]) === JSON.stringify({ type: 'events.event', linked_id: 6, note: 'Handover celebration' }), JSON.stringify(last('add')[1]));
await page.getByRole('button', { name: 'Link a voucher' }).click();
await page.getByRole('option', { name: /Purchase PUR-0090/ }).click();
await page.getByRole('button', { name: 'Link it' }).click();
await page.getByText('It is already linked.').waitFor({ timeout: 5000 });
ok('a refusal from the server is said and no note is sent when none was written', last('add')[1].note === null);
await page.getByRole('button', { name: 'Cancel', exact: true }).click();

await page.getByRole('button', { name: 'Unlink Sales Invoice INV-0044' }).click();
ok('unlinking asks first and says the record itself is not touched', /Take this link off\? The record itself is not touched\./.test(await body()) && !last('remove'));
await page.getByRole('button', { name: 'No', exact: true }).click();
ok('saying no keeps it', !last('remove') && (await page.locator('[data-link="Sales Invoice INV-0044"]').count()) === 1);
await page.getByRole('button', { name: 'Unlink Sales Invoice INV-0044' }).click();
await page.getByRole('button', { name: 'Yes, take it off' }).click();
await page.locator('[data-link="Sales Invoice INV-0044"]').waitFor({ state: 'detached', timeout: 5000 });
ok('saying yes sends it', JSON.stringify(last('remove')) === JSON.stringify(['remove', 2]));

groups = [groups[0]];
extra = { hidden: 2, off: ['Events'] };
await go('/admin/projects/52');
await page.getByRole('tab', { name: 'Links' }).click();
await page.locator('[data-links="books.voucher"]').waitFor({ timeout: 15000 });
text = await body();
ok('a module that is not on is not offered, and is named so an owner knows what switching it on brings', (await page.locator('[data-links="events.event"]').count()) === 0 && /Not switched on, so not offered: Events\./.test(text));
ok('links a person cannot see are counted and nothing more is said about them', /2 more links are here that you cannot see/.test(text) && !/Wing opening night/.test(text));
canLinks = false;
extra = { hidden: 0, off: [] };
await go('/admin/projects/52');
await page.getByRole('tab', { name: 'Links' }).click();
await page.locator('[data-links="books.voucher"]').waitFor({ timeout: 15000 });
ok('someone who may not change links sees them with nothing to press', (await page.getByRole('button', { name: /Link one|Link a |Unlink / }).count()) === 0 && (await page.getByRole('link', { name: 'Quotation QT-0231' }).count()) === 1);
groups = [];
await go('/admin/projects/52');
await page.getByRole('tab', { name: 'Links' }).click();
await page.getByText('Nothing from another module can be linked by you here').waitFor({ timeout: 15000 });
ok('someone who may see no other module\'s records is told so', true);

await finish();
