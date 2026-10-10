// Browser check: the passkey rule for staff, end to end - the reminder while there is time, the "one more step" screen once it is due, and who is never held to it (see e2e/README.md).
import { D, SITE, resetDatabase, ok, finish, open, signInWithPassword, call, sql, rows } from './lib.mjs';
resetDatabase();

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const rule = (mode, from) => {
  sql(`INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('passkeys.mode', '${JSON.stringify(mode)}', datetime('now'), datetime('now'))`);
  sql(`INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('passkeys.enforce_from', '${JSON.stringify(from ?? null)}', datetime('now'), datetime('now'))`);
};
const gate = (page) => page.locator('[data-testid="security-gate"]');
const quiet = async (page) => { await page.waitForTimeout(1500); };

// ── A. Off (the way it ships): nothing happens ────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open();
  await signInWithPassword(page, 'admin@example.com');
  await quiet(page);
  ok('with the rule off an admin sees neither a reminder nor the gate', (await gate(page).count()) === 0 && (await page.locator('[data-testid="passkey-reminder"]').count()) === 0);
  const me = await call(page, 'get', '/auth/me');
  ok('and the server says the rule is off', me.data.security.mode === 'off' && me.data.security.gate === null);
  await ctx.close();
}

// ── B. Enforce with a date still to come: a reminder, not a block ──────────────────────────────────────────────────────────────────────
{
  rule('enforce', day(10));
  const { ctx, page } = await open();
  await signInWithPassword(page, 'admin@example.com');
  await page.locator('[data-testid="passkey-offer"]').waitFor({ timeout: 10000 });
  ok('the offer to add a passkey does not let an admin refuse for good (no "Don\'t ask again")', (await page.getByText("Don't ask again").count()) === 0);
  await page.locator('[data-testid="passkey-offer-later"]').click();
  await page.locator('[data-testid="passkey-reminder"]').waitFor({ timeout: 10000 });
  const text = await page.locator('[data-testid="passkey-reminder"]').innerText();
  ok('before the date a reminder says what is coming and how long is left', /a passkey from/.test(text) && /\b(9|10) days left/.test(text), JSON.stringify(text.slice(0, 120)));
  ok('and nothing is blocked', (await gate(page).count()) === 0 && (await call(page, 'get', '/admin/security-policy')).status === 200);
  await page.screenshot({ path: D + 'passkey-reminder.png' });
  await page.getByLabel('Remind me tomorrow').click();
  await page.reload({ waitUntil: 'networkidle' });
  await quiet(page);
  ok('closing the reminder keeps it away for the day', (await page.locator('[data-testid="passkey-reminder"]').count()) === 0);
  await ctx.close();
}

// ── C. Due: the one-more-step screen; adding a passkey lifts it ─────────────────────────────────────────────────────────────────────────
let adminDevice = [];
{
  rule('enforce', day(-2));
  const { ctx, page, keys } = await open();
  await signInWithPassword(page, 'admin@example.com');
  await gate(page).waitFor({ timeout: 10000 });
  ok('once the date has come an admin with no passkey gets the "add a passkey" screen', /Add a passkey to carry on/.test(await gate(page).innerText()));
  await page.waitForTimeout(1200);
  ok('and the gentler offer does not pile on top of it', (await page.locator('[data-testid="passkey-offer"]').count()) === 0 && (await page.locator('[data-testid="passkey-reminder"]').count()) === 0);
  await page.screenshot({ path: D + 'passkey-gate.png' });
  const refused = await call(page, 'get', '/admin/security-policy');
  ok('and the server turns every other request away, saying why', refused.status === 403 && refused.data.restricted?.reason === 'passkey_missing', JSON.stringify(refused.data).slice(0, 120));
  ok('the way out stays open (who am I, my sessions, my passkeys)', (await call(page, 'get', '/auth/me')).status === 200 && (await call(page, 'get', '/auth/sessions')).status === 200 && (await call(page, 'get', '/auth/passkeys')).status === 200);
  await page.locator('[data-testid="security-gate-go"]').click();
  await gate(page).waitFor({ state: 'detached', timeout: 15000 });
  ok('adding a passkey lifts the screen at once', (await keys()).length === 1);
  ok('and the server lets the admin through', (await call(page, 'get', '/admin/security-policy')).status === 200);
  await page.waitForTimeout(1200);
  ok('nothing nags once the rule is met', (await page.locator('[data-testid="passkey-reminder"]').count()) === 0 && (await page.locator('[data-testid="passkey-offer"]').count()) === 0);
  adminDevice = await keys();
  await call(page, 'post', '/auth/logout');
  await ctx.close();
}

// ── D. The same admin on a password alone: must use the passkey once ──────────────────────────────────────────────────────────────────────
{
  const { ctx, page, keys } = await open({ credentials: adminDevice });
  await signInWithPassword(page, 'admin@example.com');
  await gate(page).waitFor({ timeout: 10000 });
  ok('signing in with the password alone asks for the passkey', /Confirm it is you/.test(await gate(page).innerText()));
  await page.locator('[data-testid="security-gate-go"]').click();
  await gate(page).waitFor({ state: 'detached', timeout: 15000 });
  ok('using it lifts the screen', (await call(page, 'get', '/admin/security-policy')).status === 200);
  await call(page, 'post', '/auth/logout');
  adminDevice = await keys();   // (the device counted its use: the next window gets the up-to-date copy, as a real device would have)
  await ctx.close();
}

// ── E. Signing in with the passkey itself: never held ─────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page, keys } = await open({ credentials: adminDevice, conditional: false });
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) await box.check();
  await page.locator('[data-testid="passkey-signin"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
  await quiet(page);
  const me = await call(page, 'get', '/auth/me');
  if (me.status === 200) {
    ok('a sign-in with the passkey is never held', (await gate(page).count()) === 0 && me.data.security.gate === null && me.data.security.session_strong === true);
    adminDevice = await keys();
  } else {
    ok('a sign-in with the passkey is never held', false, 'could not sign in with the passkey: ' + JSON.stringify(me.data).slice(0, 100));
  }
  await ctx.close();
}

// ── F. Staff the rule is not for, and customers ──────────────────────────────────────────────────────────────────────────────────────────
for (const email of ['logistics@example.com', 'amina@example.com']) {
  const { ctx, page } = await open();
  await signInWithPassword(page, email);
  await quiet(page);
  ok(`${email} is never held to the rule`, (await gate(page).count()) === 0 && (await call(page, 'get', '/auth/passkeys')).status === 200);
  await ctx.close();
}

// ── G. The owner needs two devices ───────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page, keys, plugIn, only, everyone } = await open();
  await signInWithPassword(page, 'owner@example.com');
  await gate(page).waitFor({ timeout: 10000 });
  await page.locator('[data-testid="security-gate-go"]').click();
  await page.getByText(/Add a passkey on a second device/).waitFor({ timeout: 15000 });
  ok('the owner is asked for a second device after the first', (await keys()).length === 1 && /1 of 2 added so far/.test(await gate(page).innerText()));
  await page.screenshot({ path: D + 'passkey-gate-second.png' });
  const key2 = await plugIn('usb');
  await only([key2.id]);
  await page.locator('[data-testid="security-gate-go"]').click();
  await gate(page).waitFor({ state: 'detached', timeout: 20000 });
  ok('with the second device the owner is through', (await key2()).length === 1 && (await call(page, 'get', '/admin/security-policy')).status === 200);
  await ctx.close();
}

// ── H. The owner switches the rule on while someone is signed in: the next refusal puts the screen up, and it goes once they have done what it asks ──
{
  rule('log', day(-2));
  sql('DELETE FROM auth_credentials');   // (everyone starts again without a passkey)
  const { ctx, page, keys } = await open();
  await signInWithPassword(page, 'admin@example.com');
  await page.locator('[data-testid="passkey-offer"]').waitFor({ timeout: 10000 });       // (left open on purpose: the gate must cover it and it must not come back)
  const inLog = await call(page, 'get', '/admin/security-policy');
  ok('in log mode nobody is stopped', (await gate(page).count()) === 0 && inLog.status === 200, JSON.stringify(inLog.data).slice(0, 150));
  ok('and the sign-in is written down as "would have been held"', rows("SELECT COUNT(*) AS n FROM security_events WHERE event = 'passkey_policy_would_restrict'")[0].n >= 1);
  rule('enforce', day(-2));
  await call(page, 'get', '/admin/security-policy');
  await gate(page).waitFor({ timeout: 10000 });
  ok('when the owner then switches the rule on, the next refusal puts the screen up', true);
  ok('and the offer that was open is out of the way', (await page.locator('[data-testid="passkey-offer"]').count()) === 0);
  await page.locator('[data-testid="security-gate-go"]').click();
  await gate(page).waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(1200);
  ok('once the passkey is added the screen goes and the offer does not come back', (await page.locator('[data-testid="passkey-offer"]').count()) === 0 && (await keys()).length === 1);
  await ctx.close();
}
{
  rule('enforce', day(-2));
  sql('DELETE FROM auth_credentials');
  const { ctx, page } = await open();
  await signInWithPassword(page, 'admin@example.com');
  await gate(page).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 10000 });
  ok('"Sign out" on the screen really signs out', (await call(page, 'get', '/auth/me')).status === 401);
  await ctx.close();
}

await finish();
