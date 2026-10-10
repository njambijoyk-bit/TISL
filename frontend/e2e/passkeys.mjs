// Browser check: passkeys, end to end, in a real Chromium with a virtual authenticator (a pretend fingerprint reader) against the real API (see e2e/README.md).
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const D = process.env.SHOTS || '/tmp/';
const SITE = process.env.SITE || 'http://localhost:5177', API = 'http://localhost:8000/api', DB = process.env.E2E_DB || '/tmp/tisl-e2e.sqlite';
const PASSWORD = 'purple-giraffe-lantern-77';
execSync(`php tests/e2e/boot.php ${DB}`, { cwd: new URL('../../backend/', import.meta.url).pathname, stdio: 'ignore' });   // a clean database every run: nobody has a passkey yet
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let failures = 0;
const ok = (name, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

/** A fresh browser with a pretend authenticator that always "verifies" the person. */
async function open({ authenticator = true, conditional = true, credentials = [], picksFromList = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  await ctx.addInitScript(() => { localStorage.setItem('tisl_cookie_consent', 'accepted'); });
  if (!conditional) await ctx.addInitScript(() => { PublicKeyCredential.isConditionalMediationAvailable = async () => false; });   // a browser without the email-field list: only the button
  // The email field's list is a piece of the browser that a test can not click. Here the "person" picks a saved passkey from it 0.8 s after the page starts waiting (the pretend device then answers as it would).
  if (picksFromList) await ctx.addInitScript(() => {
    const original = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = async (options) => {
      if (options?.mediation !== 'conditional') return original(options);
      await new Promise((r) => setTimeout(r, 800));
      const { mediation, ...asked } = options;
      try { const answer = await original(asked); console.log('picked from the list'); return answer; } catch (e) { console.log('the list failed', e.name); throw e; }
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  if (process.env.DEBUG_E2E) page.on('console', (m) => { if (!/Failed to load|Server error|vite|React DevTools|Resource not found|ThemeProvider/.test(m.text())) console.log('   console:', m.text().slice(0, 160)); });
  if (process.env.DEBUG_E2E) page.on('response', async (r) => { if (r.url().startsWith(API) && r.request().method() !== 'GET') console.log('  ', r.status(), r.request().method(), r.url().replace(API, ''), (await r.text().catch(() => '')).slice(0, 160)); });
  const cdp = await ctx.newCDPSession(page);
  let id = null;
  if (authenticator) {
    await cdp.send('WebAuthn.enable');
    ({ authenticatorId: id } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } }));
  }
  for (const credential of credentials) await cdp.send('WebAuthn.addCredential', { authenticatorId: id, credential });   // the same device, back in a new browser window
  const keys = async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId: id })).credentials;
  // another device in the same browser (a plugged-in security key, a tap-on key): a device that already holds a passkey for the account refuses to make a second one, so each new passkey needs a new device
  const plugIn = async (transport) => {
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport, hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const list = async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
    list.id = authenticatorId;
    list.unplug = async () => { extra.splice(extra.indexOf(authenticatorId), 1); await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }); };
    extra.push(authenticatorId);

    return list;
  };
  // With several devices answering at once the browser races them, and a device that holds an excluded passkey ends the whole request. A person picks one device in the browser's own chooser; here the others are switched
  // off for the moment the new passkey is made (just after the server's question arrives, which is after any proof with the old one).
  const only = (authenticatorIds) => page.route('**/auth/passkeys/register/options', async (route) => {
    const answer = await route.fetch();
    for (const a of [id, ...extra]) await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: a, enabled: authenticatorIds.includes(a) });
    await route.fulfill({ response: answer });
  });
  const everyone = async () => { for (const a of [id, ...extra]) await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: a, enabled: true }); };
  const extra = [];
  return { ctx, page, cdp, keys, plugIn, only, everyone };
}

async function signInWithPassword(page, email) {
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) await box.check();
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

const call = (page, method, url, body) => page.evaluate(async ([m, u, b]) => {
  const { default: api } = await import('/src/_shared/api/axios.js');
  try { const r = await api.request({ method: m, url: u, data: b }); return { status: r.status, data: r.data }; } catch (e) { return { status: e.response?.status ?? 0, data: e.response?.data ?? String(e) }; }
}, [method, url, body]);

// (no sqlite3 program here: PHP's PDO does the same job)
const sql = (q) => execSync(`php -r '$p = new PDO("sqlite:" . $argv[1]); $r = $p->exec($argv[2]);' ${JSON.stringify(DB)} ${JSON.stringify(q)}`).toString().trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let aminasDevice = [], staleCopy = [];   // what her phone/laptop holds, carried into later browser windows
// ── 1. A password sign-in: the offer appears; adding a passkey from it works ───────────────────────────────────────────────────────────────
{
  const { ctx, page, keys, plugIn, only, everyone } = await open();
  await signInWithPassword(page, 'amina@example.com');
  await page.locator('[data-testid="passkey-offer"]').waitFor({ timeout: 10000 });
  ok('after a password sign-in with no passkey, the offer appears', true);
  await page.screenshot({ path: D + 'passkey-offer.png' });
  await page.locator('[data-testid="passkey-offer-add"]').click();
  await page.locator('[data-testid="passkey-offer"]').waitFor({ state: 'detached', timeout: 10000 });
  ok('the offer closes once the passkey is added', true);
  const mine = await call(page, 'get', '/auth/passkeys');
  ok('the server lists one passkey, named from the browser', mine.data.data.length === 1 && /on /.test(mine.data.data[0].name), JSON.stringify(mine.data.data.map((c) => c.name)));
  ok('the pretend device holds it (discoverable, so sign-in needs no email)', (await keys()).length === 1 && (await keys())[0].isResidentCredential === true);
  ok('the passkey added in this session counts as the one used here', mine.data.data[0].current === true);

  // ── 2. My devices: add another (needs proof from the first, which the page gets by itself), rename, replace, remove ─────────────────────
  // (the real profile page needs a much bigger database than this check builds: the same component is shown on its own, signed in as the same person)
  await page.goto(SITE + '/e2e/harness.html?c=PasskeyManager', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-manager"]').waitFor({ timeout: 10000 });
  ok('"My devices" shows the passkey', (await page.locator('[data-testid="passkey-row"]').count()) === 1);
  await page.screenshot({ path: D + 'passkey-manager-1.png' });

  // age the session so the proof is no longer fresh: adding another must ask the device by itself
  sql("UPDATE auth_sessions SET last_strong_at = datetime('now','-30 minutes')");
  // the same device can not make a second passkey for the account: the page says so in plain words
  await page.getByLabel('Name for the new passkey').first().fill('Office laptop');
  await page.locator('[data-testid="passkey-add"]').click();
  await page.getByText(/already has a passkey for your account/).waitFor({ timeout: 15000 });
  ok('the same device is told it already has a passkey for the account', (await page.locator('[data-testid="passkey-row"]').count()) === 1 && (await keys()).length === 1);
  const usbKeys = await plugIn('usb');
  await only([usbKeys.id]);
  await page.locator('[data-testid="passkey-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 2, null, { timeout: 15000 });
  ok('a second passkey (on a plugged-in key) was added after the page proved it was the person, with no typing', (await usbKeys()).length === 1 && (await keys()).length === 1);
  ok('the second one is named as asked and says another passkey approved it', (await page.locator('[data-testid="passkey-row"]').nth(1).innerText()).includes('Office laptop') && /Added with another of your passkeys/.test(await page.locator('[data-testid="passkey-manager"]').innerText()));

  // rename
  await page.locator('[data-testid="passkey-row"]').nth(1).getByRole('button', { name: /Rename/ }).click();
  await page.getByLabel('Passkey name').fill('Front desk laptop');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Front desk laptop').first().waitFor({ timeout: 5000 });
  ok('renaming works', true);

  // replace the second with a new one: the old key is gone for good (unplugged) and a new one is plugged in
  await usbKeys.unplug();
  const newKeys = await plugIn('usb');
  await page.unroute('**/auth/passkeys/register/options');
  await only([newKeys.id]);
  await page.locator('[data-testid="passkey-row"]').nth(1).getByRole('button', { name: /Replace/ }).click();
  await page.getByLabel('Name for the new passkey').first().fill('New laptop');
  await page.getByRole('button', { name: /Add the new one and retire this one/ }).click();
  await page.getByText(/Took the place of/).waitFor({ timeout: 8000 }).catch(async () => { console.log('  toasts:', JSON.stringify(await page.locator('[role=status]').allInnerTexts())); throw new Error('replace did not finish'); });
  const afterReplace = await call(page, 'get', '/auth/passkeys');
  await page.unroute('**/auth/passkeys/register/options');
  await everyone();
  ok('replace: the new passkey sits on the new device', (await newKeys()).length === 1);
  ok('replace: the old one is gone, the new one says what it replaced', afterReplace.data.data.length === 2 && afterReplace.data.data.some((c) => c.name === 'New laptop' && c.replaces?.[0]?.name === 'Front desk laptop'), JSON.stringify(afterReplace.data.data.map((c) => [c.name, c.replaces])));
  ok('replace: the history keeps the retired one and what replaced it', afterReplace.data.history[0]?.name === 'Front desk laptop' && afterReplace.data.history[0]?.replaced_by_name === 'New laptop');
  await page.screenshot({ path: D + 'passkey-manager-2.png', fullPage: true });

  // remove one ("I lost it")
  await page.locator('[data-testid="passkey-row"]').nth(1).getByRole('button', { name: /Remove/ }).click();
  await page.getByRole('button', { name: /I lost this device/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 1, null, { timeout: 15000 });
  const afterLost = await call(page, 'get', '/auth/passkeys');
  ok('"I lost this device" removed it and recorded why', afterLost.data.history.some((h) => h.reason === 'lost'), JSON.stringify(afterLost.data.history.map((h) => h.reason)));
  await newKeys.unplug();   // the lost device is out of the story from here on

  // ── 3. Sign out; a browser that has no email-field list: the button alone signs in, with no email and no password ────────────────────────
  aminasDevice = await keys();
  await call(page, 'post', '/auth/logout');
  await ctx.close();
}
{
  const { ctx, page, keys } = await open({ conditional: false, credentials: aminasDevice });
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  const button = page.locator('[data-testid="passkey-signin"]');
  await button.waitFor({ timeout: 10000 });
  ok('the sign-in page offers "Sign in with a passkey"', true);
  ok('the button waits for the policy box to be ticked', await button.isDisabled());
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) await box.check();
  await page.screenshot({ path: D + 'passkey-login.png' });
  await button.click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  const me = await call(page, 'get', '/auth/me');
  ok('signed in with the passkey alone', me.status === 200 && me.data.user.email === 'amina@example.com');
  const sessions = await call(page, 'get', '/auth/sessions');
  ok('the session says it was opened with a passkey', sessions.data.data.some((s) => s.current && /passkey/i.test(JSON.stringify(s))), JSON.stringify(sessions.data.data.find((s) => s.current)));
  await page.waitForTimeout(1500);
  ok('a person who has a passkey is not pestered with the offer', (await page.locator('[data-testid="passkey-offer"]').count()) === 0);
  staleCopy = aminasDevice;                    // what a thief who copied the key a moment ago would hold
  aminasDevice = await keys();                 // the real device, which counted this sign-in
  await ctx.close();
}

// ── 3b. A browser with the email-field list: the pretend device answers at once, the answer waits for the policy box, then signs in ──────
{
  const { ctx, page } = await open({ credentials: aminasDevice, picksFromList: true });
  const logins = [];
  page.on('request', (r) => { if (r.url().endsWith('/auth/passkeys/login')) logins.push(Date.now()); });
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  ok('the answer from the device is not sent before the policy box is ticked', logins.length === 0);
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) await box.check();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  const me = await call(page, 'get', '/auth/me');
  ok('then the person is signed in, from the email field\'s list alone', me.status === 200 && me.data.user.email === 'amina@example.com' && logins.length === 1);
  await ctx.close();
}

// ── 3c. A copy of the key, used after the real one moved on: switched off, and the page says so ────────────────────────────────────────
{
  const { ctx, page } = await open({ conditional: false, credentials: staleCopy });
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) await box.check();
  await page.locator('[data-testid="passkey-signin"]').click();
  await page.getByText(/switched off because it looked copied/).first().waitFor({ timeout: 10000 });
  ok('a copied key is refused, and the person is told it was switched off', page.url().includes('/login'));
  await ctx.close();
}
{
  // and the real device is switched off too, until the person sees it and decides: the manager says so
  const { ctx, page } = await open();
  await signInWithPassword(page, 'amina@example.com');
  await page.goto(SITE + '/e2e/harness.html?c=PasskeyManager', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-manager"]').waitFor({ timeout: 10000 });
  await page.getByText(/behaved like a copy/).waitFor({ timeout: 5000 });
  ok('"My devices" shows the switched-off passkey and what to do about it', true);
  await page.screenshot({ path: D + 'passkey-manager-clone.png' });
  await ctx.close();
}

// ── 4. "Not now" is remembered ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open();
  await signInWithPassword(page, 'baraka@example.com');
  await page.locator('[data-testid="passkey-offer"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="passkey-offer-later"]').click();
  await page.locator('[data-testid="passkey-offer"]').waitFor({ state: 'detached', timeout: 5000 });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1500);
  ok('"Not now" keeps the offer away on the next visit', (await page.locator('[data-testid="passkey-offer"]').count()) === 0);
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('passkey-offer:')).map(([, v]) => JSON.parse(v)));
  ok('and it comes back in about a week', saved.length === 1 && saved[0].until > Date.now() + 6 * 86400000 && saved[0].until < Date.now() + 8 * 86400000);
  await ctx.close();
}

// ── 5. The very first passkey, long after signing in: the page asks for the password ─────────────────────────────────────────────────────
{
  const { ctx, page, keys } = await open();
  await signInWithPassword(page, 'baraka@example.com');
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('passkey-offer:')).forEach((k) => localStorage.removeItem(k)));
  sql("UPDATE personal_access_tokens SET created_at = datetime('now','-30 minutes') WHERE tokenable_id = (SELECT id FROM users WHERE email='baraka@example.com')");
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-offer"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="passkey-offer-add"]').click();
  await page.getByLabel('Your password').waitFor({ timeout: 5000 });
  ok('with a stale sign-in, adding the first passkey asks for the password first', (await keys()).length === 0);
  await page.getByLabel('Your password').fill('not-the-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await wait(1500);
  ok('a wrong password adds nothing', (await keys()).length === 0);
  await page.getByLabel('Your password').fill(PASSWORD).catch(() => {});
  if (await page.getByLabel('Your password').count() === 0) {
    await page.locator('[data-testid="passkey-offer-add"]').click();
    await page.getByLabel('Your password').waitFor({ timeout: 5000 });
    await page.getByLabel('Your password').fill(PASSWORD);
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('[data-testid="passkey-offer"]').waitFor({ state: 'detached', timeout: 15000 });
  ok('with the right password the first passkey is added', (await keys()).length === 1);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
