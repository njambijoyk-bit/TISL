// Browser check: Projects configuration (build 1.2): the default industry, what things are called, a person's own names, switching industries on and off, and the
// history with roll back. The API is answered by the check itself; the rules (who may change what, versions, plain-text names) are proved by the backend tests.
// It needs only the website (npx vite --port 5177): who is signed in is stood in for too, so no server and no database are used.
import { D, SITE, ok, finish, open } from './lib.mjs';

const c = await open({ authenticator: false });
const page = c.page;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { user: { id: 1, name: 'Owner', email: 'owner@example.com' }, customer: null, security: null,
  access: { account: 'staff', clearance: 6, permissions: ['admin.access', 'projects.use', 'projects.config.view', 'projects.config.manage', 'projects.config.industry', 'projects.config.names', 'projects.naming.personal'] } };
await page.addInitScript((who) => { localStorage.setItem('auth-storage', JSON.stringify({ state: { ...who, isAuthenticated: true }, version: 0 })); }, me);
await page.route('**/api/me', (route) => json(route, me));
await page.route('**/api/admin/projects?**', (route) => json(route, { data: [], total: 0, page: 1, per_page: 25, counts: { open: 0, on_hold: 0, closed: 0, cancelled: 0 } }));
const sent = [];
const go = async (which) => { await page.goto(`${SITE}/e2e/harness.html?c=${which}`, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: '#root{max-width:1100px!important}' }); };

const industries = [
  { key: 'legal', name: 'Legal', group: 'common', is_active: true }, { key: 'construction', name: 'Construction', group: 'common', is_active: true },
  { key: 'fashion', name: 'Fashion', group: 'niche', is_active: true }, { key: 'healthcare', name: 'Healthcare', group: 'niche', is_active: false },
  { key: 'general', name: 'General projects', group: 'basic', is_active: true },
];
const NAMES = {
  legal: { project: ['Matter', 'Matters'], reference: ['Case number', 'Case numbers'], progress_bill: ['Interim fee note', 'Interim fee notes'] },
  construction: { project: ['Contract', 'Contracts'], reference: ['Contract number', 'Contract numbers'], progress_bill: ['Payment certificate', 'Payment certificates'] },
  general: { project: ['Project', 'Projects'], reference: ['Reference', 'References'], progress_bill: ['Invoice', 'Invoices'] },
};
const DESCRIBE = { project: 'The piece of work itself', reference: 'An outside number that identifies it', progress_bill: 'A bill raised while the work is going on' };
let state;
const fresh = (o = {}) => ({ ready: true, general: { default_industry: 'legal', project_may_use_other_industry: true, trash_days: 30 }, version: 3, overrides: {}, personal: null, mayPersonal: true,
  can: { manage: true, industry: true, names: true }, ...o });
const termsOf = (industry) => Object.entries(NAMES[industry] || NAMES.general).map(([key, [name, plural]]) => {
  const own = state.overrides[`${industry}.${key}`];
  return { key, description: DESCRIBE[key], name: own ? own[0] : name, plural: own ? own[1] : plural, shipped_name: name, shipped_plural: plural, changed: !!own };
});
const myIndustry = () => (state.mayPersonal && state.personal) || state.general.default_industry;
const namesBody = () => ({ ready: state.ready, industry: myIndustry(), company_industry: state.general.default_industry, names: Object.fromEntries(termsOf(myIndustry()).map((t) => [t.key, { name: t.name, plural: t.plural }])) });

await page.route('**/api/admin/projects/names', (route) => json(route, namesBody()));
await page.route('**/api/admin/projects/my/naming', (route) => { const b = route.request().postDataJSON(); sent.push(['my', b]); state.personal = b.industry; return json(route, namesBody()); });
await page.route('**/api/admin/projects/configuration**', (route) => {
  const url = new URL(route.request().url()); const method = route.request().method(); const path = url.pathname.replace(/.*\/configuration/, '');
  const body = method === 'GET' || method === 'DELETE' ? null : route.request().postDataJSON();
  if (path === '' && method === 'GET') {
    const viewing = url.searchParams.get('industry') || state.general.default_industry;
    return json(route, { ready: state.ready, general: state.general, version: state.version, industries, viewing, terms: termsOf(viewing),
      personal: state.mayPersonal ? { industry: state.personal, in_use: myIndustry() } : null, can: state.can });
  }
  if (path === '/general') { sent.push(['general', body]); const changed = Object.keys(body).filter((k) => body[k] !== state.general[k]); state.general = { ...state.general, ...body }; state.version++; return json(route, { version: state.version, value: state.general, changed }); }
  if (path === '/history') return json(route, { versions: [
    { version: 3, value: { default_industry: 'legal', trash_days: 30 }, note: null, saved_at: '2026-11-14 10:02:00', saved_by: 'Owner', is_current: true },
    { version: 2, value: { default_industry: 'construction', trash_days: 60 }, note: null, saved_at: '2026-11-13 09:00:00', saved_by: 'Amina M.', is_current: false },
    { version: 1, value: { default_industry: 'general', trash_days: 30 }, note: 'As shipped', saved_at: '2026-11-12 08:00:00', saved_by: null, is_current: false }] });
  if (path === '/rollback') { sent.push(['rollback', body]); return json(route, { version: 4, value: state.general, changed: [] }); }
  if (path.startsWith('/industries/')) { sent.push(['industry', path.split('/')[2], body]); return json(route, { industries }); }
  if (path.startsWith('/names/')) {
    const [, , industry, term] = path.split('/');
    if (method === 'DELETE') { sent.push(['reset', industry, term]); delete state.overrides[`${industry}.${term}`]; } else { sent.push(['rename', industry, term, body]); state.overrides[`${industry}.${term}`] = [body.name, body.plural]; }
    return json(route, { term: termsOf(industry).find((t) => t.key === term) });
  }
  return json(route, { message: 'Not found.' }, 404);
});
const last = (kind) => [...sent].reverse().find((x) => x[0] === kind);
const body = () => page.locator('#root').innerText();

// ---------------------------------------------------------------- an owner
state = fresh();
await go('ProjectConfiguration');
await page.getByRole('heading', { name: 'Matters configuration' }).waitFor({ timeout: 15000 });
let text = await body();
ok('the page is named in the company\'s own words (Matters, not Projects)', /Matters configuration/.test(text) && !/Projects configuration/.test(text));
ok('it shows the default industry, the trash days and the names in use', (await page.getByLabel('Industry', { exact: true }).inputValue()) === 'legal' && (await page.getByLabel('Days things stay in the trash').inputValue()) === '30' && /Interim fee note/.test(text) && /Case number/.test(text));
ok('each name says what it is a name for', /A bill raised while the work is going on/.test(text));
ok('an industry that is switched off cannot be chosen as the default', (await page.getByLabel('Industry', { exact: true }).locator('option').allInnerTexts()).join('|') === 'Legal|Construction|Fashion|General projects');
await page.screenshot({ path: D + 'projects-configuration.png', fullPage: true });

await page.getByRole('button', { name: 'Rename Interim fee note' }).click();
await page.getByLabel('One', { exact: true }).fill('Fee note');
await page.getByLabel('Several', { exact: true }).fill('Fee notes');
await page.getByRole('button', { name: 'Save name' }).click();
await page.getByText('Changed by you').waitFor({ timeout: 5000 });
ok('renaming sends the industry, the term and both forms of the name', JSON.stringify(last('rename')) === JSON.stringify(['rename', 'legal', 'progress_bill', { name: 'Fee note', plural: 'Fee notes' }]), JSON.stringify(last('rename')));
ok('a renamed term is marked as changed and still shows the shipped name beside it', /Interim fee note/.test(await body()) && /Fee note \/ Fee notes/.test((await body()).replace(/\s+/g, ' ')));
await page.getByRole('button', { name: 'Put Interim fee note back' }).click();
await page.getByText('Changed by you').waitFor({ state: 'detached', timeout: 5000 });
ok('putting it back removes the company\'s own name', JSON.stringify(last('reset')) === JSON.stringify(['reset', 'legal', 'progress_bill']));

await page.getByLabel('Names of', { exact: true }).selectOption('construction');
await page.getByText('What things are called in Construction').waitFor({ timeout: 5000 });
ok('the names of any industry can be looked at without changing the default', /Payment certificate/.test(await body()) && (await page.getByLabel('Industry', { exact: true }).inputValue()) === 'legal');

await page.getByLabel('Show me the names of').selectOption('construction');
await page.getByRole('heading', { name: 'Contracts configuration' }).waitFor({ timeout: 5000 });
ok('choosing my own names changes my screen at once and is sent as my choice only', JSON.stringify(last('my')) === JSON.stringify(['my', { industry: 'construction' }]) && !sent.some((x) => x[0] === 'general'));
await page.getByLabel('Show me the names of').selectOption('');
await page.getByRole('heading', { name: 'Matters configuration' }).waitFor({ timeout: 5000 });
ok('and going back to the company\'s names sends no industry', JSON.stringify(last('my')) === JSON.stringify(['my', { industry: null }]));

await page.getByLabel('Industry', { exact: true }).selectOption('construction');
await page.getByLabel('Days things stay in the trash').fill('45');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('heading', { name: 'Contracts configuration' }).waitFor({ timeout: 5000 });
ok('saving sends the default industry and the trash days, and every word on the page follows', last('general')[1].default_industry === 'construction' && last('general')[1].trash_days === 45 && /What things are called in Construction/.test(await body()), JSON.stringify(last('general')));

await page.getByRole('tab', { name: 'Industries' }).click();
ok('the industries tab lists them with their state and marks the default', /Healthcare/.test(await body()) && (await page.locator('tr', { hasText: 'Construction' }).innerText()).includes('Default'));
ok('the default industry has no switch', (await page.getByRole('button', { name: 'Switch off Construction' }).count()) === 0);
await page.getByRole('button', { name: 'Switch off Fashion' }).click();
await page.waitForTimeout(300);
ok('switching an industry off is sent', JSON.stringify(last('industry')) === JSON.stringify(['industry', 'fashion', { is_active: false }]));
await page.getByRole('button', { name: 'Switch on Healthcare' }).click();
await page.waitForTimeout(300);
ok('and one that is off can be switched on', JSON.stringify(last('industry')) === JSON.stringify(['industry', 'healthcare', { is_active: true }]));

await page.getByRole('tab', { name: 'History and roll back' }).click();
await page.getByRole('button', { name: 'Bring back version 2' }).waitFor({ timeout: 5000 });
text = await body();
ok('the history shows each version, who saved it and which is in use', /In use/.test(text) && /Amina M\./.test(text) && /As shipped/.test(text) && /The system/.test(text) && /60 days/.test(text));
ok('the version in use cannot be brought back', (await page.getByRole('button', { name: 'Bring back version 3' }).count()) === 0);
await page.getByRole('button', { name: 'Bring back version 2' }).click();
await page.waitForTimeout(400);
ok('bringing a version back sends its number', JSON.stringify(last('rollback')) === JSON.stringify(['rollback', { version: 2 }]));
await page.screenshot({ path: D + 'projects-configuration-history.png', fullPage: true });

// ---------------------------------------------------------------- the theme decides every colour and font
state = fresh();
await go('ProjectConfiguration');
await page.getByRole('button', { name: 'Save', exact: true }).waitFor({ timeout: 15000 });
const look = async () => page.evaluate(() => {
  const save = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save');
  const panel = save.closest('form');
  return { button: getComputedStyle(save).backgroundColor, panel: getComputedStyle(panel).backgroundColor, text: getComputedStyle(panel).color, font: getComputedStyle(panel).fontFamily };
});
await page.addStyleTag({ content: ':root{--color-primary-500: rgb(1, 2, 3) !important; --surface-card: rgb(4, 5, 6) !important; --text-primary: rgb(7, 8, 9) !important; --font-body: "Check Font", fantasy !important;}' });
const themed = await look();
ok('changing the theme changes the screen: the button, the panel, the text and the font all follow', themed.button === 'rgb(1, 2, 3)' && themed.panel === 'rgb(4, 5, 6)' && themed.text === 'rgb(7, 8, 9)' && /Check Font/.test(themed.font), JSON.stringify(themed));

// ---------------------------------------------------------------- someone who may only look
sent.length = 0;
state = fresh({ can: { manage: false, industry: false, names: false }, mayPersonal: false });
await go('ProjectConfiguration');
await page.getByText('What things are called in Legal').waitFor({ timeout: 15000 });
text = await body();
ok('without the permissions there is no Save, no Rename and no box for own names at all', (await page.getByRole('button', { name: 'Save', exact: true }).count()) === 0 && (await page.getByRole('button', { name: /^Rename / }).count()) === 0 && !/My own names/.test(text) && (await page.getByLabel('Show me the names of').count()) === 0);
ok('and the default industry is shown but cannot be changed', await page.getByLabel('Industry', { exact: true }).isDisabled());
await page.getByRole('tab', { name: 'Industries' }).click();
ok('nor can industries be switched', (await page.getByRole('button', { name: /^Switch / }).count()) === 0);

// ---------------------------------------------------------------- may change settings but not the default industry
state = fresh({ can: { manage: true, industry: false, names: false } });
await go('ProjectConfiguration');
await page.getByRole('button', { name: 'Save', exact: true }).waitFor({ timeout: 15000 });
ok('someone who may not change the default industry is told so', /You may not change the default industry/.test(await body()) && await page.getByLabel('Industry', { exact: true }).isDisabled());
await page.getByLabel('Days things stay in the trash').fill('10');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(400);
ok('and what they save never carries the default industry', last('general') && !('default_industry' in last('general')[1]) && last('general')[1].trash_days === 10, JSON.stringify(last('general')));

// ---------------------------------------------------------------- before the database scripts were run
state = fresh({ ready: false });
await go('ProjectConfiguration');
await page.getByText('Projects is not set up yet').waitFor({ timeout: 15000 });
ok('before the database is in place the page says so and offers nothing to save', (await page.getByRole('button', { name: 'Save', exact: true }).count()) === 0);
await go('ProjectsList');
await page.getByText('The database for the new module is not in place yet').waitFor({ timeout: 15000 });
ok('the list of work says the same', true);

await finish();
