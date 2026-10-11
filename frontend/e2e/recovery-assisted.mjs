// Browser check: assisted recovery - a member of staff who has lost every device asks two administrators for help, they approve (or decline, or stop it), a day passes, and only then
// may one sign-in add a new passkey (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, sql, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const approvals = '/e2e/harness.html?c=Approvals';
const put = (k, v) => sql(`INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('${k}', '${JSON.stringify(v)}', datetime('now'), datetime('now'))`);
const gate = (page) => page.locator('[data-testid="security-gate"]');
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// the passkey rule is on (due yesterday) for these roles; two people who are locked out, two who can help
put('passkeys.mode', 'enforce');
put('passkeys.enforce_from', yesterday);
put('passkeys.roles', ['admin', 'finance', 'super_admin']);
put('passkeys.owner_roles', []);              // (one passkey each is enough here: the owner's two devices are not what is being tried)
put('passkeys.owner_device_bound', false);
sql("UPDATE users SET role = 'finance', name = 'Lena Locked' WHERE email = 'amina@example.com'");
sql("UPDATE users SET role = 'finance', name = 'Barry Blocked' WHERE email = 'baraka@example.com'");

/** Sign in with the password and add a passkey from the "one more step" screen (the way staff meet the rule). */
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
for (const email of ['amina@example.com', 'baraka@example.com']) {   // the phones that are about to be lost
  const c = await enrol(email);
  await c.ctx.close();
}
sql("UPDATE auth_credentials SET created_at = datetime('now','-3 days')");   // passkeys that have been on the accounts a while (a serious action will not take a new one)

/** A new computer: nothing on it but the person's password. They meet the passkey screen and open "I can't use my passkey device". */
const lockedOut = async (email) => {
  const c = await open();
  await signInWithPassword(c.page, email);
  await gate(c.page).waitFor({ timeout: 10000 });
  await c.page.locator('[data-testid="gate-lost"]').click();
  await c.page.locator('[data-testid="assist"], [data-testid="assist-unavailable"]').first().waitFor({ timeout: 10000 });

  return c;
};
const card = (page) => page.locator('[data-recovery]').first();
const open_ = async (c) => { await c.page.goto(SITE + approvals, { waitUntil: 'networkidle' }); };

// ── 1. Lena asks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let lena = await lockedOut('amina@example.com');
{
  const { page } = lena;
  ok('the passkey screen offers help from administrators next to the recovery code', (await page.locator('[data-testid="recovery-use"]').count()) === 1 && /No recovery codes either/.test(await page.locator('[data-testid="assist"]').innerText()));
  await page.screenshot({ path: D + 'assist-ask.png' });
  await page.getByLabel('What happened').fill('My phone was stolen on the bus');
  await page.locator('[data-testid="assist-ask"]').click();
  await page.locator('[data-testid="assist-state"]').waitFor({ timeout: 10000 });
  ok('she is told where it stands: none of two approved yet', /0 of 2/.test(await page.locator('[data-testid="assist-state"]').innerText()));
  const row = rows('SELECT note FROM auth_recovery_requests')[0];
  ok('the request is kept with what she said', row.note === 'My phone was stolen on the bus');
  ok('and nothing else opens for her: the server still holds her at the passkey screen', (await gate(page).count()) === 1);
}

// ── 2. The two administrators look at it and approve ─────────────────────────────────────────────────────────────────────────────────────
{
  await open_(A1);
  await card(A1.page).waitFor({ timeout: 15000 });
  const facts = await A1.page.locator('[data-testid="recovery-facts"]').innerText();
  ok('the administrator sees who it is, what they said, where from, and what their account has', /Lena Locked/.test(await card(A1.page).innerText()) && /My phone was stolen on the bus/.test(facts) && /1 passkey they can not use, and 0 recovery codes left/.test(facts), facts.replace(/\n+/g, ' | ').slice(0, 220));
  await A1.page.screenshot({ path: D + 'assist-approvals.png', fullPage: true });
  ok('an approval will not go on without saying how they checked', await A1.page.locator('[data-testid="recovery-approve"]').isDisabled());
  await A1.page.getByLabel('Your reason').fill('Phoned Lena on her own number');
  await A1.page.locator('[data-testid="recovery-approve"]').click();
  await A1.page.getByText(/One more administrator has to approve it/).waitFor({ timeout: 15000 });
  await A1.page.locator('[data-testid="recovery-approvals"]').filter({ hasText: '1 of 2' }).waitFor({ timeout: 15000 });
  ok('the first approval counts, and the same administrator can not approve again', (await A1.page.locator('[data-testid="recovery-approve"]').count()) === 0);

  await open_(A2);
  await card(A2.page).waitFor({ timeout: 15000 });
  ok('the second administrator sees it with the first approval on it', /1 of 2/.test(await A2.page.locator('[data-testid="recovery-approvals"]').innerText()));
  await A2.page.getByLabel('Your reason').fill('Saw Lena at the office');
  await A2.page.locator('[data-testid="recovery-approve"]').click();
  await A2.page.getByText(/last approval/).waitFor({ timeout: 15000 });
  await A2.page.locator('[data-testid="recovery-state"]').filter({ hasText: 'waiting day ends' }).waitFor({ timeout: 15000 });
  ok('then the waiting day starts, and any administrator may still cancel it', /any administrator may cancel/.test(await A2.page.locator('[data-testid="recovery-state"]').innerText()));
  const log = rows("SELECT event FROM security_events WHERE event IN ('recovery_requested','recovery_approved') ORDER BY id").map((e) => e.event).join();
  ok('everything is on the record', log === 'recovery_requested,recovery_approved,recovery_approved');
}

// ── 3. The waiting day ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { page } = lena;
  // her screen has been open all the while: it finds out for itself (it looks every fifteen seconds)
  await page.locator('[data-testid="assist-state"]').filter({ hasText: 'Approved by' }).waitFor({ timeout: 40000 });
  const text = await page.locator('[data-testid="assist-state"]').innerText();
  ok('Lena is told who approved, and when she can start', /Approved by (Wanjiku Owner and Chege Admin|Chege Admin and Wanjiku Owner)/.test(text) && /start the recovery from/.test(text), text.slice(0, 160));
  ok('she can not start it yet', (await page.locator('[data-testid="assist-start"]').count()) === 0);
  await page.screenshot({ path: D + 'assist-cooling.png' });
  // the day passes
  sql("UPDATE auth_recovery_requests SET release_at = datetime('now','-1 minute')");
  await page.locator('[data-testid="assist-start"]').waitFor({ timeout: 40000 });
  ok('afterwards she may start it', /waiting day is over/.test(await page.locator('[data-testid="assist-state"]').innerText()));
  await page.locator('[data-testid="assist-start"]').click();
  await page.getByText(/Add a new passkey/).first().waitFor({ timeout: 10000 });
  ok('starting it changes the screen to "add a new passkey"', /Add a new passkey/.test(await gate(page).innerText()));
  await page.locator('[data-testid="security-gate-go"]').click();
  await gate(page).waitFor({ state: 'detached', timeout: 15000 });
  ok('and a new passkey lifts the screen', rows("SELECT COUNT(*) AS n FROM auth_credentials WHERE user_id = (SELECT id FROM users WHERE email = 'amina@example.com') AND revoked_at IS NULL")[0].n === 2);
  ok('the request is used up and written down as an alert', rows("SELECT used_at FROM auth_recovery_requests")[0].used_at !== null && rows("SELECT severity FROM security_events WHERE event = 'recovery_started'")[0].severity === 'alert');
  await lena.ctx.close();
}

// ── 4. A request that is declined, one the person gives up, one an administrator stops ───────────────────────────────────────────────────
{
  const barry = await lockedOut('baraka@example.com');
  await barry.page.getByLabel('What happened').fill('Dropped my phone in the lake');
  await barry.page.locator('[data-testid="assist-ask"]').click();
  await barry.page.locator('[data-testid="assist-state"]').waitFor({ timeout: 10000 });

  await open_(A1);
  await card(A1.page).waitFor({ timeout: 15000 });
  await A1.page.getByLabel('Your reason').fill('Could not reach Barry');
  await A1.page.locator('[data-testid="recovery-decline"]').click();
  await A1.page.getByText('Declined. Nothing was changed.').waitFor({ timeout: 10000 });
  ok('an administrator can decline, and it ends', rows("SELECT declined_at, decline_note FROM auth_recovery_requests WHERE note LIKE 'Dropped%'")[0].decline_note === 'Could not reach Barry');
  await barry.page.reload({ waitUntil: 'networkidle' });
  await gate(barry.page).waitFor({ timeout: 10000 });
  await barry.page.locator('[data-testid="gate-lost"]').click();
  await barry.page.locator('[data-testid="assist-ask"]').waitFor({ timeout: 10000 });
  ok('Barry may ask again', (await barry.page.locator('[data-testid="assist-ask"]').count()) === 1);

  await barry.page.getByLabel('What happened').fill('Still lost');
  await barry.page.locator('[data-testid="assist-ask"]').click();
  await barry.page.locator('[data-testid="assist-cancel"]').click();
  await barry.page.locator('[data-testid="assist-ask"]').waitFor({ timeout: 10000 });
  ok('and he can give up his own request', rows("SELECT cancelled_by FROM auth_recovery_requests WHERE note = 'Still lost'")[0].cancelled_by === 'person');

  await barry.page.getByLabel('What happened').fill('Truly lost');
  await barry.page.locator('[data-testid="assist-ask"]').click();
  await barry.page.locator('[data-testid="assist-state"]').waitFor({ timeout: 10000 });
  await open_(A1);
  await card(A1.page).waitFor({ timeout: 15000 });
  await A1.page.getByLabel('Your reason').fill('Phoned Barry');
  await A1.page.locator('[data-testid="recovery-approve"]').click();
  await A1.page.getByText(/One more administrator has to approve it/).waitFor({ timeout: 15000 });
  await open_(A2);
  await card(A2.page).waitFor({ timeout: 15000 });
  await A2.page.getByLabel('Your reason').fill('Barry says it was not him');
  await A2.page.locator('[data-testid="recovery-cancel"]').click();
  await A2.page.getByText('Cancelled. Nothing was changed.').waitFor({ timeout: 10000 });
  ok('an administrator can stop one that is still going, and say why', rows("SELECT cancelled_by, cancelled_by_id FROM auth_recovery_requests WHERE note = 'Truly lost'")[0].cancelled_by === 'admin' && /Barry says it was not him/.test(rows("SELECT detail FROM security_events WHERE event = 'recovery_cancelled' ORDER BY id DESC LIMIT 1")[0].detail));
  await A2.page.locator('[data-testid="approvals-empty"]').waitFor({ timeout: 15000 });
  ok('and it leaves the list', (await A2.page.locator('[data-recovery]').count()) === 0);
  await barry.ctx.close();
}

// ── 5. A server where script 130 has not been run says so instead of offering something that can not work ──────────────────────────────────
{
  sql('DROP TABLE auth_recovery_approvals');
  const late = await lockedOut('baraka@example.com');
  ok('without the script the panel says help is not set up', /not set up on this server/.test(await late.page.locator('[data-testid="assist-unavailable"]').innerText()));
  ok('and offers no way to ask', (await late.page.locator('[data-testid="assist-ask"]').count()) === 0);
  await late.ctx.close();
}

await A1.ctx.close();
await A2.ctx.close();
await finish();
