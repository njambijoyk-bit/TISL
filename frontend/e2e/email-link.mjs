// Browser check: the emailed sign-in link for customers (phase 4.1), in real Chromium against the real API. The email goes through the real Notifier and the log mailer; the check reads the link from the server's log.
import { readFileSync, writeFileSync } from 'fs';
import { open, ok, finish, resetDatabase, SITE } from './lib.mjs';

resetDatabase();
const LOG = '/tmp/tisl-e2e.log';
const links = () => {
  const text = readFileSync(LOG, 'utf8').replace(/=\r?\n/g, '').replace(/=3D/g, '=');   // (mail text wraps long lines and writes "=" as =3D)
  return [...text.matchAll(/sign-in\/email\?k=([A-Za-z0-9]{48})/g)].map((m) => m[1]);
};
const known = () => new Set(links());
const askFromLoginPage = async (page, email) => {
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('[data-testid="email-link-ask"]').click();
  await page.locator('[data-testid="email-link-sent"]').waitFor({ timeout: 10000 });
  return (await page.locator('[data-testid="email-link-sent"]').innerText()).trim();
};
const newest = (before) => links().filter((l) => !before.has(l)).pop() || null;

// the staff member and a stranger: the same answer, and no email
let before = known();
const staff = await open({ authenticator: false });
const staffAnswer = await askFromLoginPage(staff.page, 'logistics@example.com');
const stranger = await open({ authenticator: false });
const strangerAnswer = await askFromLoginPage(stranger.page, 'nobody@example.com');
ok('staff and a stranger get the same answer on the page', staffAnswer === strangerAnswer && staffAnswer.length > 20, staffAnswer);
await new Promise((r) => setTimeout(r, 800));
ok('and no link is emailed to either', newest(before) === null);

// the customer asks
before = known();
const a = await open({ authenticator: false });
const customerAnswer = await askFromLoginPage(a.page, 'amina@example.com');
ok('a customer gets the very same answer', customerAnswer === staffAnswer, customerAnswer);
await new Promise((r) => setTimeout(r, 800));
const code = newest(before);
ok('a link was emailed to the customer', !!code && code.length === 48);
const cookie = (await a.ctx.cookies('http://localhost:8000')).find((c) => c.name === 'tisl_link');
ok('the asking browser holds a protected cookie that ties the link to it', !!cookie && cookie.httpOnly && cookie.sameSite === 'Lax', JSON.stringify({ httpOnly: cookie?.httpOnly, sameSite: cookie?.sameSite }));

// the link on another computer does nothing
const other = await open({ authenticator: false });
await other.page.goto(`${SITE}/sign-in/email?k=${code}`, { waitUntil: 'networkidle' });
const problem = await other.page.locator('[data-testid="email-link-problem"]').innerText({ timeout: 10000 }).catch(() => '');
ok('opened on another browser it says to use the one that asked, and shows no name', /same browser/i.test(problem) && !(await other.page.content()).includes('Amina'), problem);
await other.page.screenshot({ path: '/tmp/email-link-other.png' });

// opening the link in the right browser signs nobody in (a mail scanner would do the same), the button does
await a.page.goto(`${SITE}/sign-in/email?k=${code}`, { waitUntil: 'networkidle' });
await a.page.locator('[data-testid="email-link-confirm"]').waitFor({ timeout: 10000 });
ok('the page offers the button and names the person', (await a.page.content()).includes('Amina Wanjiru'));
const sessionBefore = (await a.ctx.cookies('http://localhost:8000')).find((c) => c.name === 'tisl_session');
ok('just opening the link has not signed anyone in', !sessionBefore);
ok('the button waits for the policy box', await a.page.locator('[data-testid="email-link-confirm"]').isDisabled());
await a.page.locator('input[type="checkbox"]').first().check();
await a.page.screenshot({ path: '/tmp/email-link-ready.png' });
await a.page.locator('[data-testid="email-link-confirm"]').click();
await a.page.waitForURL((u) => !u.pathname.startsWith('/sign-in/email'), { timeout: 15000 });
const session = (await a.ctx.cookies('http://localhost:8000')).find((c) => c.name === 'tisl_session');
ok('pressing it signed the customer in with the usual protected session cookie', !!session && session.httpOnly);
ok('and the binder cookie is gone', !(await a.ctx.cookies('http://localhost:8000')).some((c) => c.name === 'tisl_link' && c.value));

// once only
await a.page.goto(`${SITE}/sign-in/email?k=${code}`, { waitUntil: 'networkidle' });
const again = await a.page.locator('[data-testid="email-link-problem"]').innerText({ timeout: 10000 }).catch(() => '');
ok('the same link a second time is refused', /expired|already used/i.test(again), again);

await finish();
