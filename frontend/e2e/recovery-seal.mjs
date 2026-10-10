// Browser check: recovery codes (the way back from a lost phone) and the seal phrase on the sign-in page, in a real Chromium against the real API (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, call, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const manager = '/e2e/harness.html?c=PasskeyManager';
const dismissOffer = async (page) => {
  const later = page.locator('[data-testid="passkey-offer-later"]');
  if (await later.count()) await later.click();
};

// ── 1. Make recovery codes (the page proves it is the person by itself, then shows them once) ─────────────────────────────────────────────
let codes = [];
let phone = [];
{
  const { ctx, page, keys } = await open();
  await signInWithPassword(page, 'amina@example.com');
  await page.locator('[data-testid="passkey-offer"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="passkey-offer-add"]').click();
  await page.locator('[data-testid="passkey-offer"]').waitFor({ state: 'detached', timeout: 10000 });
  await page.goto(SITE + manager, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="recovery-codes"]').waitFor({ timeout: 10000 });
  ok('"My devices" starts with no recovery codes', /no recovery codes/.test(await page.locator('[data-testid="recovery-remaining"]').innerText()));
  await page.locator('[data-testid="recovery-make"]').click();
  await page.locator('[data-testid="recovery-fresh"]').waitFor({ timeout: 15000 });
  codes = await page.locator('[data-testid="recovery-code"]').allInnerTexts();
  ok('ten codes are shown, easy to read', codes.length === 10 && codes.every((c) => /^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/.test(c)), codes[0]);
  await page.screenshot({ path: D + 'recovery-codes.png' });
  ok('the page will not let go of them until they are saved', await page.locator('[data-testid="recovery-done"]').isDisabled());
  await page.getByLabel('I have saved these codes somewhere safe').check();
  await page.locator('[data-testid="recovery-done"]').click();
  await page.locator('[data-testid="recovery-fresh"]').waitFor({ state: 'detached' });
  ok('afterwards only the count is shown, never the codes again', /10 of 10/.test(await page.locator('[data-testid="recovery-remaining"]').innerText()) && (await page.locator('[data-testid="recovery-code"]').count()) === 0);
  const stored = rows('SELECT code_hash FROM auth_recovery_codes').map((r) => r.code_hash);
  ok('the database holds fingerprints, not the codes', stored.length === 10 && !stored.some((h) => codes.some((c) => h.includes(c.replace('-', '')))));
  phone = await keys();
  await call(page, 'post', '/auth/logout');
  await ctx.close();
}

// ── 2. The phone is lost: a new computer, the password, a recovery code, a new passkey ────────────────────────────────────────────────────
{
  const { ctx, page, keys } = await open();            // a new device that holds nothing
  await signInWithPassword(page, 'amina@example.com');
  await dismissOffer(page);
  await page.goto(SITE + manager, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-manager"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="passkey-add"]').click();
  await page.locator('[data-testid="recovery-open"]').waitFor({ timeout: 15000 });
  ok('without the old device, adding a passkey fails and points to the recovery code', (await keys()).length === 0);
  await page.locator('[data-testid="recovery-open"]').click();
  await page.getByLabel('Recovery code').fill('AAAAA-BBBBB');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.getByText(/That code did not work/).waitFor({ timeout: 5000 });
  ok('a wrong code is refused in plain words', true);
  await page.getByLabel('Recovery code').fill(codes[0].toLowerCase().replace('-', ' '));
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.getByText(/Code accepted/).waitFor({ timeout: 5000 });
  ok('a right code is accepted however it is typed', true);
  await page.locator('[data-testid="passkey-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 2, null, { timeout: 15000 });
  const list = await call(page, 'get', '/auth/passkeys');
  ok('the new passkey is added and says it came from a recovery', list.data.data.some((c) => c.added_method === 'recovery') && (await keys()).length === 1);
  await page.screenshot({ path: D + 'recovery-added.png' });
  // and the lost one goes
  const lost = page.locator('[data-testid="passkey-row"]').filter({ hasNotText: 'Added during an account recovery' }).first();
  await lost.getByRole('button', { name: /Remove/ }).click();
  await page.getByRole('button', { name: /I lost this device/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 1, null, { timeout: 15000 });
  ok('the lost passkey is removed, and why is on record', (await call(page, 'get', '/auth/passkeys')).data.history.some((h) => h.reason === 'lost'));
  ok('the code that was used is gone', (await call(page, 'get', '/auth/recovery-codes')).data.remaining === 9);
  await call(page, 'post', '/auth/logout');
  await ctx.close();
}

// ── 3. The same code does not work twice ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open();
  await signInWithPassword(page, 'amina@example.com');
  const again = await call(page, 'post', '/auth/recovery-codes/use', { code: codes[0] });
  ok('a used code is refused', again.status === 422);
  const other = await call(page, 'post', '/auth/recovery-codes/use', { code: codes[1] });
  ok('another code still works', other.status === 200 && other.data.remaining === 8);
  await ctx.close();
}

// ── 4. The seal phrase ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open({ authenticator: false });
  await signInWithPassword(page, 'baraka@example.com');
  await dismissOffer(page);
  await page.goto(SITE + '/e2e/harness.html?c=SealPhraseCard', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="seal-card"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="seal-edit"]').click();
  await page.getByLabel('Seal phrase').fill('blue elephant 42');
  await page.getByLabel('Your password').fill('wrong password');
  await page.locator('[data-testid="seal-save"]').click();
  await page.getByText(/password is not right/).waitFor({ timeout: 5000 });
  ok('choosing a phrase needs the right password', true);
  await page.getByLabel('Your password').fill('purple-giraffe-lantern-77');
  await page.locator('[data-testid="seal-save"]').click();
  await page.locator('[data-testid="seal-current"]').filter({ hasText: 'blue elephant 42' }).waitFor({ timeout: 5000 });
  ok('the phrase is saved', true);
  await call(page, 'post', '/auth/logout');

  // the same browser, signed out: the sign-in page shows it once the email is typed
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill('baraka@example.com');
  await page.locator('[data-testid="seal-shown"]').waitFor({ timeout: 8000 });
  ok('this browser has signed in as them before, so it sees their phrase', /blue elephant 42/.test(await page.locator('[data-testid="seal-shown"]').innerText()));
  await page.screenshot({ path: D + 'seal-login.png' });
  await page.locator('input[name="email"]').fill('amina@example.com');
  await page.waitForTimeout(1500);
  ok('typing someone else\'s email shows nothing', (await page.locator('[data-testid="seal-shown"]').count()) === 0);
  await ctx.close();
}
{
  const { ctx, page } = await open({ authenticator: false });     // a browser that has never been theirs
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill('baraka@example.com');
  await page.waitForTimeout(2000);
  ok('a browser that has never signed in as them sees nothing, whatever they type', (await page.locator('[data-testid="seal-shown"]').count()) === 0);
  const asked = await page.evaluate(async () => { const r = await fetch('http://localhost:8000/api/auth/seal', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email: 'baraka@example.com' }), credentials: 'include' }); return r.json(); });
  ok('and the server says so plainly', asked.phrase === null);
  await ctx.close();
}

await finish();
