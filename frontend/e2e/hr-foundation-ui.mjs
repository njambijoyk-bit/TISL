// Browser check: HR stage 1 (docs/HR_STAGE1_SPEC.md). The record page's tabs, pay and identity hidden without the permission and masked with it
// (Show writes to the history), the History tab, the list's new filters, and HR configuration (types, numbers, required fields, versions).
// The API is answered by the check itself; what the server does is proved by HrFoundationTest, HrTiersTest, HrHistoryTest and HrConfigurationTest.
// It needs only the website (npx vite --port 5177).
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const perms = ['admin.access', 'hr.view', 'hr.manage', 'hr.configure'];
const me = { user: { id: 1, name: 'Grace', email: 'grace@example.com' }, customer: null, security: null, access: { account: 'staff', clearance: 5, permissions: perms } };
const sent = [];
const last = (k) => [...sent].reverse().find((x) => x[0] === k);
const text = async (l) => (await l.innerText()).replace(/\s+/g, ' ');

const work = { id: 42, user_id: 7, employee_number: 'EMP-2026-0042', job_title: 'Site engineer', department: 'Construction', status: 'active', employment_type: 'full_time', hire_date: '2025-02-03', manager_id: 3,
  work_email: 'wanjiru@tisl.test', annual_leave_days: 21, leave_balance: 14, skills: ['Surveying'], certifications: [], full_name: 'Wanjiru Kamau', tenure_years: 1.8,
  user: { id: 7, name: 'Wanjiru Kamau', email: 'wanjiru@example.com', role: 'staff' }, manager: { id: 3, job_title: 'Director', user: { id: 3, name: 'Otieno M.' } }, subordinates: [],
  gender: 'female', date_of_birth: '1994-03-02', marital_status: 'single', emergency_contact_name: 'Peter K.', emergency_contact_phone: '+254700000000', emergency_contact_relationship: 'Brother' };
let sensitive = false;
const employee = () => sensitive
  ? { ...work, tiers: ['work', 'personal', 'sensitive'], can: { change: ['work', 'personal', 'sensitive'], show: true }, salary_grade: 'G4', base_salary: '185000.00', currency: 'KES', bank_name: 'Equity Bank', bank_account_name: 'W. Kamau', bank_account_number: '••••4471', id_number: '••••2219', kra_pin: '••••567Q', nssf_number: null, nhif_number: null }
  : { ...work, tiers: ['work', 'personal'], can: { change: ['work', 'personal'], show: false } };

await page.route(/\/api\/(admin|me|v1)\b/, (route) => json(route, []));
await page.route('**/api/me', (route) => json(route, me));
await page.route(/\/api\/admin\/employees(\?.*)?$/, (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); sent.push(['list', q]); return json(route, { data: [employee()], current_page: 1, last_page: 1, total: 1 }); });
await page.route(/\/api\/admin\/employees\/42$/, (route) => json(route, { employee: employee(), stats: { assigned_customers_count: 0, subordinates_count: 0, tenure_years: 1.8 } }));
await page.route(/\/api\/admin\/employees\/42\/reveal$/, (route) => { sent.push(['reveal', route.request().postDataJSON()]); return json(route, { field: 'bank_account_number', value: '0712004471' }); });
await page.route(/\/api\/admin\/employees\/42\/history(\?.*)?$/, (route) => { const tier = new URL(route.request().url()).searchParams.get('tier'); sent.push(['history', tier]); return json(route, { history: [
  { id: 3, field: 'bank_account_number', tier: 'sensitive', action: 'shown', old: null, new: null, reason: null, by: 'Otieno M.', at: '2026-11-20T11:02:00Z' },
  { id: 2, field: 'bank_name', tier: 'sensitive', action: 'changed', old: 'KCB', new: 'Equity Bank', reason: 'New account', by: 'Grace N.', at: '2026-11-18T06:40:00Z' },
  { id: 1, field: 'department', tier: 'work', action: 'changed', old: 'Survey', new: 'Construction', reason: null, by: 'Grace N.', at: '2026-10-02T08:15:00Z' },
].filter((r) => !tier || r.tier === tier) }); });
await page.route(/\/api\/admin\/employees\/42\/leave-logs$/, (route) => json(route, { data: [{ id: 1, action: 'use', days: '3.0', reason: 'Family visit', created_at: '2026-08-11T09:00:00Z' }] }));
await page.route(/\/api\/admin\/employees\/potential-managers/, (route) => json(route, { data: [{ id: 3, name: 'Otieno M.' }, { id: 5, name: 'Grace N.' }] }));
await page.route(/\/api\/admin\/hr\/employment-types$/, (route) => json(route, { types: [{ key: 'full_time', name: 'Permanent' }, { key: 'contract', name: 'Contract' }, { key: 'seasonal', name: 'Seasonal' }], required: {} }));

const go = async (at) => { await page.goto(`${SITE}/e2e/harness.html?c=HrApp&at=${encodeURIComponent(at)}`, { waitUntil: 'networkidle' }); };

// ── the record without the pay permission
await go('/admin/employees/42');
await page.getByRole('button', { name: /Pay and identity/ }).waitFor({ timeout: 10000 });
const TABS = ['Overview', 'Work', 'Personal', 'Pay and identity', 'Skills', 'Leave', 'History'];
ok('the record has the seven tabs', JSON.stringify((await page.locator('button').allInnerTexts()).map((t) => t.trim()).filter((t) => TABS.includes(t))) === JSON.stringify(TABS));
await page.getByRole('button', { name: /Pay and identity/ }).click();
ok('without the permission, pay and identity say so and nothing is shown', /need the permission for pay, bank and identity details/.test(await text(page.locator('[data-hr-pay]'))) && (await page.locator('[data-hr-masked]').count()) === 0);
await page.getByRole('button', { name: /^Personal$/ }).click();
ok('the emergency contact sits with the personal details', /Emergency Contact .*Peter K\./.test(await text(page.locator('main, #root').first())));
await page.getByRole('button', { name: /^Leave$/ }).click();
await page.locator('[data-hr-leave]').waitFor({ timeout: 5000 });
ok('the Leave tab shows the balance and the log', /Balance 14 days/.test(await text(page.locator('[data-hr-leave]'))) && /Used 3 day\(s\) · Family visit/.test(await text(page.locator('[data-hr-leave]'))));

// ── with the permission: masked, Show writes to the history
sensitive = true;
await go('/admin/employees/42');
await page.getByRole('button', { name: /Pay and identity/ }).click();
await page.locator('[data-hr-masked="bank_account_number"]').waitFor({ timeout: 5000 });
ok('pay is shown and numbers are masked to their last four', /Base Salary KES 185,000/.test(await text(page.locator('[data-hr-pay]'))) && /Account Number ••••4471 Show/.test(await text(page.locator('[data-hr-masked="bank_account_number"]'))));
await page.locator('[data-hr-masked="bank_account_number"]').getByRole('button', { name: 'Show' }).click();
await page.locator('[data-hr-masked="bank_account_number"]').getByText('0712004471').waitFor({ timeout: 5000 });
ok('Show asks the server for that one number', last('reveal')?.[1]?.field === 'bank_account_number');
await page.screenshot({ path: D + 'hr-record-pay.png', fullPage: true });

await page.getByRole('button', { name: /^History$/ }).click();
await page.locator('[data-hr-history] [data-hr-change]').first().waitFor({ timeout: 5000 });
ok('the History tab tells each change in words, newest first, with the reason', /Otieno M\. · Account number was shown/.test(await text(page.locator('[data-hr-change="bank_account_number"]'))) && /Grace N\. · Bank: KCB → Equity Bank\s*Pay and identity\s*Why: New account/.test(await text(page.locator('[data-hr-change="bank_name"]'))));
await page.getByRole('button', { name: 'Work', exact: true }).last().click();
await page.waitForTimeout(300);
ok('the history filters by tier', last('history')?.[1] === 'work' && (await page.locator('[data-hr-change]').count()) === 1);
await page.screenshot({ path: D + 'hr-record-history.png', fullPage: true });

// ── the list's filters
await go('/admin/employees');
await page.getByText('Wanjiru Kamau').first().waitFor({ timeout: 10000 });
const filtersBtn = page.getByRole('button', { name: /Filter/ }).first();
if (await filtersBtn.count()) await filtersBtn.click();
await page.getByLabel('Joined').selectOption('90');
await page.getByLabel('Manager').selectOption('3');
await page.getByRole('button', { name: 'Apply' }).click();
await page.waitForTimeout(300);
ok('the list filters by manager and who joined lately', last('list')?.[1]?.joined_days === '90' && last('list')?.[1]?.manager_id === '3');
ok('employment types come from HR configuration', (await page.locator('select option', { hasText: 'Seasonal' }).count()) === 1);

// ── HR configuration
let config = { ready: true, version: 2, next_number: 'EMP-2026-0043', general: { number_prefix: 'EMP-{YYYY}-', number_width: 4, required: { work_email: false, department: true, manager: false, hire_date: false, phone: false }, own_details: true },
  types: [{ id: 1, key: 'full_time', name: 'Permanent', paid_by_payroll: true, is_active: true, people: 12 }, { id: 2, key: 'intern', name: 'Intern', paid_by_payroll: true, is_active: true, people: 1 }],
  versions: [{ version: 2, action: 'saved', note: null, by: 'Grace', created_at: '2026-11-20T09:00:00Z' }, { version: 1, action: 'saved', note: null, by: 'Grace', created_at: '2026-11-19T09:00:00Z' }] };
await page.route(/\/api\/admin\/hr\/configuration$/, (route) => { if (route.request().method() === 'PUT') { const b = route.request().postDataJSON(); sent.push(['save', b]); config = { ...config, general: b.general, version: 3 }; } return json(route, config); });
await page.route(/\/api\/admin\/hr\/configuration\/rollback\/\d+$/, (route) => { sent.push(['rollback', route.request().url().split('/').pop()]); return json(route, config); });
await page.route(/\/api\/admin\/hr\/employment-types(\/\d+)?$/, (route) => { if (route.request().method() === 'GET') return json(route, { types: config.types, required: {} }); const b = route.request().postDataJSON(); sent.push(['type', route.request().method(), b]);
  config = { ...config, types: route.request().method() === 'POST' ? [...config.types, { id: 9, key: 'seasonal', name: b.name, paid_by_payroll: true, is_active: true, people: 0 }] : config.types.map((t) => (route.request().url().endsWith(`/${t.id}`) ? { ...t, ...b } : t)) }; return json(route, config, 201); });
await go('/admin/hr/configuration');
await page.locator('[data-hr-config]').waitFor({ timeout: 10000 });
ok('employment types show how many people have each', /Permanent 12 people/.test(await text(page.locator('[data-hr-type="full_time"]'))));
await page.locator('#hr-new-type').fill('Seasonal');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('[data-hr-type="seasonal"]').waitFor({ timeout: 5000 });
ok('a type is added by name', JSON.stringify(last('type')) === JSON.stringify(['type', 'POST', { name: 'Seasonal' }]));
await page.locator('[data-hr-type="intern"]').getByRole('button', { name: 'Switch off' }).click();
await page.waitForTimeout(300);
ok('a type can be switched off', last('type')?.[1] === 'PUT' && last('type')?.[2]?.is_active === false);
await page.locator('#hr-prefix').fill('TISL/{YYYY}/');
await page.locator('#hr-width').fill('3');
ok('the number format previews as you type', /Looks like TISL\/\d{4}\/001/.test(await text(page.locator('[data-hr-preview]'))));
await page.locator('[data-hr-required]').getByLabel('Work email').check();
await page.locator('[data-hr-own]').getByRole('checkbox').uncheck();
await page.screenshot({ path: D + 'hr-configuration.png', fullPage: true });
await page.getByRole('button', { name: 'Save the settings' }).click();
await page.waitForTimeout(300);
const g = last('save')?.[1]?.general;
ok('the settings are saved together', g?.number_prefix === 'TISL/{YYYY}/' && g?.number_width === 3 && g?.required?.work_email === true && g?.own_details === false);
await page.locator('[data-hr-versions]').getByRole('button', { name: 'Bring back' }).first().click();
await page.waitForTimeout(300);
ok('an earlier version can be brought back', last('rollback')?.[1] === '2' || last('rollback')?.[1] === '1');
await finish(c);
