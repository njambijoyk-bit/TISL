// Browser check: "reset sign-in methods" - an administrator takes away every passkey and recovery code of a colleague (not their password). For staff the passkey rule is for it asks a serious-action question,
// waits a day, can be cancelled by another administrator, and is carried out by the sweep; for everyone else it happens at once (see e2e/README.md).
import { execSync } from 'child_process';
import { D, SITE, DB, ok, finish, open, signInWithPassword, call, sql, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const approvals = '/e2e/harness.html?c=Approvals';
const probe = (email, name) => `/e2e/harness.html?c=ResetSigninMethods&id=${rows(`SELECT id FROM users WHERE email = '${email}'`)[0].id}&name=${encodeURIComponent(name)}`;
const put = (k, v) => sql(`INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('${k}', '${JSON.stringify(v)}', datetime('now'), datetime('now'))`);
const gate = (page) => page.locator('[data-testid="security-gate"]');
const question = (page) => page.locator('[data-testid="step-up"]');
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const backend = new URL('../../backend/', import.meta.url).pathname;
/** The sweep the scheduler runs every few minutes. */
const sweep = () => execSync(`cd ${backend} && eval "$(php -r '$e = require "tests/e2e/env.php"; foreach ($e as $k => $v) echo "export $k=" . escapeshellarg($v) . "\\n";')" && DB_DATABASE=${DB} php artisan security:release-resets`, { shell: '/bin/bash' }).toString().trim();

// the passkey rule is on (due yesterday); the serious-action question is on for resets of sign-in methods
put('passkeys.mode', 'enforce');
put('passkeys.enforce_from', yesterday);
put('passkeys.roles', ['admin', 'finance', 'super_admin']);
put('passkeys.owner_roles', []);
put('passkeys.owner_device_bound', false);
put('stepup.signin_reset.mode', 'enforce');
sql("UPDATE users SET role = 'finance', name = 'Lena Locked' WHERE email = 'amina@example.com'");
sql("UPDATE users SET role = 'finance', name = 'Barry Blocked' WHERE email = 'baraka@example.com'");

const enrol = async (email) => {
  const c = await open();
  await signInWithPassword(c.page, email);
  await gate(c.page).waitFor({ timeout: 10000 });
  await c.page.locator('[data-testid="security-gate-go"]').click();
  await gate(c.page).waitFor({ state: 'detached', timeout: 15000 });

  return c;
};

const A1 = await enrol('owner@example.com');
const A2 = await enrol('admin@example.com');
const lena = await enrol('amina@example.com');                                          // stays signed in on her computer
const barry = await enrol('baraka@example.com');
sql("UPDATE auth_credentials SET created_at = datetime('now','-3 days')");
const active = (email) => rows(`SELECT COUNT(*) AS n FROM auth_credentials WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = '${email}')`)[0].n;

/** Open the "reset sign-in methods" window for a person, give a reason, and answer the serious-action question. */
const startReset = async (c, email, name, reason) => {
  await c.page.goto(SITE + probe(email, name), { waitUntil: 'networkidle' });
  await c.page.locator('[data-testid="probe-open"]').click();
  await c.page.locator('[data-testid="reset-methods"]').waitFor({ timeout: 10000 });
  await c.page.getByLabel('Reason').fill(reason);
  await c.page.locator('[data-testid="reset-methods-go"]').click();
};
const answer = async (c, reason) => {
  await question(c.page).waitFor({ timeout: 10000 });
  await c.page.getByLabel('Reason').last().fill(reason);
  await c.page.locator('[data-testid="step-up-passkey"]').click();
  await question(c.page).waitFor({ state: 'detached', timeout: 15000 });
};

// ── 1. A reset for staff: the question, then a waiting day in which nothing changes ───────────────────────────────────────────────────────
{
  await A1.page.goto(SITE + probe('amina@example.com', 'Lena Locked'), { waitUntil: 'networkidle' });
  await A1.page.locator('[data-testid="probe-open"]').click();
  await A1.page.locator('[data-testid="reset-methods"]').waitFor({ timeout: 10000 });
  ok('it will not go on without a reason', await A1.page.locator('[data-testid="reset-methods-go"]').isDisabled());
  await A1.page.getByLabel('Reason').fill('ok');
  ok('a couple of letters is not a reason', await A1.page.locator('[data-testid="reset-methods-go"]').isDisabled());
  await A1.page.getByLabel('Reason').fill('Her phone fell in the lake');
  ok('with one it can', await A1.page.locator('[data-testid="reset-methods-go"]').isEnabled());
  await A1.page.screenshot({ path: D + 'reset-window.png' });
  await A1.page.locator('[data-testid="reset-methods-go"]').click();
  await question(A1.page).waitFor({ timeout: 10000 });
  const facts = await A1.page.locator('[data-testid="step-up-facts"]').innerText();
  ok('it is a serious action: the question says whose sign-in, what is taken away, and that there is a waiting day', /Lena Locked/.test(facts) && /Take away ALL their passkeys and recovery codes/.test(facts) && /after a waiting day/.test(facts) && /their password stays/.test(facts), facts.replace(/\n+/g, ' | ').slice(0, 220));
  await A1.page.screenshot({ path: D + 'reset-question.png' });
  ok('nothing has been done before the answer', active('amina@example.com') === 1 && rows('SELECT COUNT(*) AS n FROM auth_recovery_requests')[0].n === 0);
  await A1.page.getByLabel('Reason').last().fill('Her phone fell in the lake');
  await A1.page.locator('[data-testid="step-up-passkey"]').click();
  await A1.page.locator('[data-testid="probe-answer"]').filter({ hasText: 'unless somebody cancels it' }).waitFor({ timeout: 15000 });
  ok('the administrator is told it waits, and until when', /Asked\. Lena Locked and the other administrators were told, and it happens at/.test(await A1.page.locator('[data-testid="probe-answer"]').innerText()));
  ok('and the same is said in a message on the screen', (await A1.page.getByRole('status').filter({ hasText: 'unless somebody cancels it' }).count()) >= 1);
  const row = rows("SELECT kind, note FROM auth_recovery_requests")[0];
  ok('the request is kept as a reset, with the reason', row.kind === 'reset' && row.note === 'Her phone fell in the lake');
  ok('and nothing has changed for her yet: still one passkey, still signed in', active('amina@example.com') === 1 && (await call(lena.page, 'get', '/auth/me')).status === 200);
}

// ── 2. Another administrator sees it and can cancel it ───────────────────────────────────────────────────────────────────────────────────
{
  await A2.page.goto(SITE + approvals, { waitUntil: 'networkidle' });
  const card = A2.page.locator('[data-recovery]').first();
  await card.waitFor({ timeout: 15000 });
  const text = await card.innerText();
  ok('the other administrator sees who started it, why, and when it happens', /The sign-in methods of Lena Locked will be reset/.test(text) && /Started by\s+Wanjiku Owner/.test(text) && /Her phone fell in the lake/.test(text) && /It happens/.test(text), text.replace(/\n+/g, ' | ').slice(0, 260));
  ok('there is nothing to approve: only to cancel', (await A2.page.locator('[data-testid="recovery-approve"]').count()) === 0 && (await A2.page.locator('[data-testid="recovery-decline"]').count()) === 0 && (await A2.page.locator('[data-testid="recovery-cancel"]').count()) === 1);
  ok('and the button says it cancels the reset', /Cancel the reset/.test(await A2.page.locator('[data-testid="recovery-cancel"]').innerText()));
  await A2.page.screenshot({ path: D + 'reset-approvals.png', fullPage: true });
}

// ── 3. The day passes: the sweep carries it out ──────────────────────────────────────────────────────────────────────────────────────────
{
  ok('before the day is over the sweep does nothing', /Nothing was due/.test(sweep()) && active('amina@example.com') === 1);
  sql("UPDATE auth_recovery_requests SET release_at = datetime('now','-1 minute')");
  ok('afterwards it carries it out', /1 reset\(s\) carried out/.test(sweep()));
  ok('her passkey is gone, with the reason on it', active('amina@example.com') === 0 && rows("SELECT revoked_reason FROM auth_credentials WHERE user_id = (SELECT id FROM users WHERE email = 'amina@example.com')")[0].revoked_reason === 'reset');
  ok('it is on the record as an alert, saying it waited', rows("SELECT severity, detail FROM security_events WHERE event = 'signin_methods_reset'")[0].severity === 'alert' && /"waited":true/.test(rows("SELECT detail FROM security_events WHERE event = 'signin_methods_reset'")[0].detail));
  // her open computer is signed out the next time it asks
  ok('her computer is signed out', (await call(lena.page, 'get', '/auth/me')).status === 401);
  await lena.ctx.close();

  // she signs in again with her password: the rule asks for a new passkey, and she adds one
  const again = await open();
  await signInWithPassword(again.page, 'amina@example.com');
  await gate(again.page).waitFor({ timeout: 10000 });
  ok('her password still works, and the passkey rule asks her for a new passkey', /Add a passkey to carry on/.test(await gate(again.page).innerText()));
  await again.page.locator('[data-testid="security-gate-go"]').click();
  await gate(again.page).waitFor({ state: 'detached', timeout: 15000 });
  ok('and a new passkey lifts the screen', active('amina@example.com') === 1);
  await again.ctx.close();
}

// ── 4. One that is cancelled by another administrator is never carried out ───────────────────────────────────────────────────────────────
{
  await startReset(A1, 'baraka@example.com', 'Barry Blocked', 'Testing a cancel');
  await answer(A1, 'Testing a cancel');
  await A1.page.locator('[data-testid="probe-answer"]').filter({ hasText: 'unless somebody cancels it' }).waitFor({ timeout: 15000 });
  // a second one for the same person while one waits is refused, in words
  await startReset(A1, 'baraka@example.com', 'Barry Blocked', 'Again');
  await answer(A1, 'Again');
  await A1.page.locator('[data-testid="reset-methods"] [role="alert"]').waitFor({ timeout: 15000 });
  ok('a second reset while one is waiting is refused, with the reason on the screen', /already waiting/.test(await A1.page.locator('[data-testid="reset-methods"] [role="alert"]').innerText()) && rows("SELECT COUNT(*) AS n FROM auth_recovery_requests WHERE kind = 'reset' AND user_id = (SELECT id FROM users WHERE email = 'baraka@example.com')")[0].n === 1);
  await A2.page.goto(SITE + approvals, { waitUntil: 'networkidle' });
  await A2.page.locator('[data-recovery]').first().waitFor({ timeout: 15000 });
  await A2.page.getByLabel('Your reason').fill('Barry says he did not ask');
  await A2.page.locator('[data-testid="recovery-cancel"]').click();
  await A2.page.getByText('Cancelled. Nothing was changed.').waitFor({ timeout: 10000 });
  sql("UPDATE auth_recovery_requests SET release_at = datetime('now','-1 minute') WHERE kind = 'reset' AND executed_at IS NULL");
  ok('a cancelled reset is not carried out, even when its day is over', /Nothing was due/.test(sweep()) && active('baraka@example.com') === 1);
  ok('and who cancelled it, and why, is on the record', rows("SELECT cancelled_by FROM auth_recovery_requests WHERE user_id = (SELECT id FROM users WHERE email = 'baraka@example.com')")[0].cancelled_by === 'admin' && /Barry says he did not ask/.test(rows("SELECT detail FROM security_events WHERE event = 'recovery_cancelled' ORDER BY id DESC LIMIT 1")[0].detail));
}

// ── 5. For someone the rule is not for it happens at once ────────────────────────────────────────────────────────────────────────────────
{
  const dr = await open();
  await signInWithPassword(dr.page, 'logistics@example.com');
  await dr.page.locator('[data-testid="passkey-offer-add"]').click();
  await dr.page.locator('[data-testid="passkey-offer"]').waitFor({ state: 'detached', timeout: 15000 });
  ok('the driver has a passkey (the rule is not for them: they added it to sign in faster)', active('logistics@example.com') === 1);
  await startReset(A1, 'logistics@example.com', 'Otieno Driver', 'Lost the phone');
  await answer(A1, 'Lost the phone');
  await A1.page.locator('[data-testid="probe-answer"]').filter({ hasText: 'Done:' }).waitFor({ timeout: 15000 });
  ok('it happens at once: the answer says so and the passkey is gone', /every passkey, recovery code and sign-in of Otieno Driver was taken away/.test(await A1.page.locator('[data-testid="probe-answer"]').innerText()) && active('logistics@example.com') === 0);
  await dr.ctx.close();
}

await A1.ctx.close();
await A2.ctx.close();
await barry.ctx.close();
await finish();
