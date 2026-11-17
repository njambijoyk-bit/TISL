// Browser check: changes on the Work tab (build 5.5): raising one that adds a scope line, moves a key date and changes the price, sending it,
// the person who raised it unable to decide, approving it (as someone else) with Books' sales order form then opening filled in, and rejecting
// one with a note. The API is answered by the check itself; applying the effects and the rules are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Amina', email: 'amina@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: ['admin.access', 'books.view', 'books.post', 'projects.use', 'projects.changes', 'projects.changes.approve'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
const sent = [];
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const text = async (l = page.locator('#root')) => (await l.innerText()).replace(/\s+/g, ' ');

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects/names', (route) => json(route, { ready: true, industry: 'construction', company_industry: 'construction', names: {}, keys: {} }));
const words = { project: { name: 'Contract', plural: 'Contracts' }, phase: { name: 'Section', plural: 'Sections' }, task: { name: 'Task', plural: 'Tasks' }, scope_line: { name: 'BoQ item', plural: 'Bill of quantities' }, key_date: { name: 'Key date', plural: 'Key dates' }, change: { name: 'Variation', plural: 'Variations' } };
await page.route(/\/api\/admin\/projects\/509$/, (route) => json(route, { project: { id: 509, number: 'C-0509', title: 'Office block, Upper Hill', description: null, industry: { key: 'construction', name: 'Construction' }, type: { id: 1, name: 'Building' }, stage: { id: 1, name: 'Site works', status: 'info' }, state: 'open', priority: 'medium',
  customer: { id: 1, name: 'Imara Sacco' }, lead: { id: 1, name: 'Amina' }, branch: null, cost_centre_id: 9, reference: null, authority: null, place: null, start_date: null, due_date: null, closing_period_ends: null, closed_at: null, confidential: false, frozen: false,
  stages: [{ id: 1, name: 'Site works', state: 'open', status: 'info', required_fields: [] }], cost_centre_path: 'C-0509', words, can: { open: true, members_view: true, log: true, links: true, parties: true }, locks: {}, fields: [] } }));

const Ch = (o) => ({ reason: null, changes_price: false, decided_by: null, decided_at: null, decision_note: null, effects: [], order: null, mine: false, can: { edit: false, decide: false, withdraw: false }, ...o });
let changes = [Ch({ id: 2, number: 2, ref: 'C-02', title: 'Move the gate to the east side', state: 'submitted', raised_by: 'Kamau', effects: [{ id: 9, kind: 'date_move', what: 'Moves Site inspection to 29 Nov 2026', applied: false }], can: { edit: false, decide: true, withdraw: true } })];
const answer = (extra = {}) => ({ ...extra, ready: true, changes, kinds: { scope_add: 'Adds a scope line', scope_alter: 'Alters a scope line', date_move: 'Moves a key date', task_move: 'Moves a task' },
  states: { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' },
  options: { scope_lines: [{ id: 1, label: '3.4 Blockwork', unit: 'm2', quantity: 1850 }], key_dates: [{ id: 5, label: 'Roof handover (6 Dec 2026)' }], tasks: [], phases: [] }, can: { raise: true, approve: true } });
await page.route(/\/api\/admin\/projects\/509\/changes(\/\d+(\/[a-z]+)?)?$/, (route) => {
  const url = route.request().url(); const m = route.request().method(); const b = route.request().postDataJSON?.() ?? null;
  const step = (url.match(/changes\/\d+\/([a-z]+)$/) || [])[1]; const id = Number((url.match(/changes\/(\d+)/) || [])[1]);
  if (m === 'POST' && !step) { sent.push(['raise', b]); changes = [Ch({ id: 3, number: 3, ref: 'C-03', title: b.title, reason: b.reason, changes_price: b.changes_price, state: 'draft', raised_by: 'Amina', mine: true, effects: b.effects.map((e, i) => ({ id: 20 + i, kind: e.kind, target_id: e.target_id, data: e.data, what: e.kind === 'scope_add' ? `Adds ${e.data.code} ${e.data.description}` : 'Moves Roof handover to 20 Dec 2026', applied: false })), can: { edit: true, decide: false, withdraw: true } }), ...changes]; return json(route, answer(), 201); }
  if (step) {
    sent.push([step, id, b]);
    changes = changes.map((x) => {
      if (x.id !== id) return x;
      if (step === 'submit') return { ...x, state: 'submitted', can: { edit: false, decide: false, withdraw: true } };
      if (step === 'approve') return { ...x, state: 'approved', decided_by: 'Amina', decided_at: '2026-11-17', decision_note: b.note, effects: x.effects.map((e) => ({ ...e, applied: true })), can: { edit: false, decide: false, withdraw: false } };
      if (step === 'reject') return { ...x, state: 'rejected', decided_by: 'Amina', decided_at: '2026-11-17', decision_note: b.note, can: { edit: false, decide: false, withdraw: false } };
      return x;
    });
    return json(route, answer(step === 'approve' && id === 3 ? { order_needed: true } : {}));
  }
  return json(route, answer());
});
await page.route(/\/api\/admin\/projects\/changes\/3\/order-form$/, (route) => json(route, { order: { change_id: 3, voucher_type_id: 8, customer_id: 1, customer_name: 'Imara Sacco', cost_centre_id: 9, narration: 'C-0509 change C-03: Extra blockwork for the store room', reference_no: 'C-0509 C-03', lines: [{ type: 'custom', description: 'Change C-03: Extra blockwork for the store room', quantity: 1, rate: null, ledger_id: 1 }] } }));
// what Books' sales order form needs
await page.route('**/api/admin/books/voucher-types**', (route) => json(route, [{ id: 8, code: 'SO', name: 'Sales Order', base_type: 'sales_order', is_active: true, has_items: true, party_kind: 'customer' }]));
await page.route('**/api/admin/books/ledgers**', (route) => json(route, [{ id: 1, name: 'Construction income', group: { name: 'Sales', nature: 'income' } }]));
await page.route('**/api/admin/cost-centres/options', (route) => json(route, { ready: true, line_override: false, data: [{ id: 9, name: 'C-0509 Office block', depth: 0 }] }));
await page.route('**/api/admin/projects/voucher-picker**', (route) => json(route, { rule: 'optional', projects: [{ id: 509, number: 'C-0509', title: 'Office block, Upper Hill', confidential: false, cost_centre_id: 9, phases: [] }], current: null }));
await page.route('**/api/admin/books/vouchers/preview', (route) => json(route, { warnings: [], lines: [{ amount: 0, taxes: [] }], entries: [], subtotal: 0, total: 0, tax_total: 0, tax_breakdown: [], stock: [], currency: 'KES' }));

await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/509?tab=work&part=changes')}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#root{max-width:1150px!important}' });
await page.locator('[data-changes]').waitFor({ timeout: 15000 });
ok('changes are named in the industry\'s words, with what each does', /Variations/.test(await text(page.locator('[data-work-parts]'))) && /C-02 · Move the gate to the east side\s*Submitted/.test(await text(page.locator('[data-change="C-02"]'))) && /Moves Site inspection to 29 Nov 2026/.test(await text(page.locator('[data-change="C-02"]'))));

// ---------------------------------------------------------------- raising one
await page.getByRole('button', { name: 'Raise a variation' }).click();
await page.getByLabel('What changes').fill('Extra blockwork for the store room');
await page.getByLabel('Why (optional)').fill('Client asked on site');
await page.getByLabel(/It changes the price/).check();
await page.getByRole('button', { name: 'Add what it does' }).click();
await page.getByLabel('Code').fill('3.5');
await page.getByLabel('Description').fill('Store room blockwork');
await page.getByLabel('Unit').fill('m2');
await page.getByLabel('Quantity').fill('120');
await page.getByRole('button', { name: 'Add what it does' }).click();
await page.locator('#ef-kind-1').selectOption('date_move');
await page.locator('#ef-target-1').selectOption('5');
await page.locator('#ef-date-1').fill('2026-12-20');
await page.screenshot({ path: D + 'projects-change-form.png', fullPage: true });
await page.getByRole('button', { name: 'Save and send for a decision' }).click();
await page.waitForTimeout(700);
const r = last('raise')[1];
ok('the change is sent with what it does and that it changes the price, then sent for a decision', r.title === 'Extra blockwork for the store room' && r.changes_price === true && r.effects[0].kind === 'scope_add' && r.effects[0].data.quantity === '120'
  && r.effects[1].kind === 'date_move' && r.effects[1].target_id === 5 && r.effects[1].data.date === '2026-12-20' && JSON.stringify(last('submit').slice(0, 2)) === '["submit",3]', JSON.stringify(r));
ok('whoever raised it cannot decide on it', /Waiting for someone else to decide/.test(await text(page.locator('[data-change="C-03"]'))) && (await page.locator('[data-change="C-03"]').getByRole('button', { name: 'Approve' }).count()) === 0);

// ---------------------------------------------------------------- deciding
await page.locator('[data-change="C-02"]').getByRole('button', { name: 'Reject' }).click();
await page.getByLabel('Why not').fill('The east side floods');
await page.getByRole('button', { name: 'Reject it' }).click();
await page.waitForTimeout(500);
ok('rejecting sends the note and the change shows who rejected it and why', last('reject')[2].note === 'The east side floods' && /Rejected/.test(await text(page.locator('[data-change="C-02"]'))) && /rejected by Amina .*: The east side floods/.test(await text(page.locator('[data-change="C-02"]'))));
await page.screenshot({ path: D + 'projects-changes.png', fullPage: true });

changes = changes.map((x) => (x.id === 3 ? { ...x, mine: false, can: { edit: false, decide: true, withdraw: true } } : x));   // as someone else would see it
await page.goto(`${SITE}/e2e/harness.html?c=ProjectsApp&at=${encodeURIComponent('/admin/projects/509?tab=work&part=changes')}`, { waitUntil: 'networkidle' });
await page.locator('[data-change="C-03"]').waitFor({ timeout: 15000 });
await page.locator('[data-change="C-03"]').getByRole('button', { name: 'Approve' }).click();
await page.getByLabel('Note (optional)').fill('Agreed at the site meeting');
await page.getByRole('button', { name: 'Approve and apply it' }).click();
await page.waitForURL(/project_change=3/, { timeout: 10000 }).catch(() => {});
ok('approving one that changes the price opens Books\' sales order form for it', last('approve')[2].note === 'Agreed at the site meeting' && /\/admin\/books\/vouchers\/new\?type=8&project_change=3/.test(page.url()), page.url());
await page.locator('input[placeholder="Description"]').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
ok('the sales order is filled in for the client and the work, with the change as its line', (await page.locator('input[placeholder="Description"]').first().inputValue()) === 'Change C-03: Extra blockwork for the store room' && (await page.getByLabel('Project').inputValue()) === '9');

await finish(c);
