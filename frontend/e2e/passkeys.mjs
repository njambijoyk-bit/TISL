// Browser check: passkeys, end to end, in a real Chromium with a virtual authenticator (a pretend fingerprint reader) against the real API (see e2e/README.md).
import { D, SITE, PASSWORD, resetDatabase, ok, finish, open, signInWithPassword, call, sql, wait } from './lib.mjs';
resetDatabase();   // a clean database every run: nobody has a passkey yet


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

await finish();
