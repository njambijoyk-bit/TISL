// Browser check: the Council of Two - a serious action waits for a second person, who sees the server's facts, approves with their own passkey (or declines), and the first person's action then goes ahead by itself (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, sql, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const rule = '/e2e/harness.html?c=PasskeyRule';
const approvals = '/e2e/harness.html?c=Approvals';
const manager = '/e2e/harness.html?c=PasskeyManager';
const setting = (k) => { const r = rows(`SELECT value FROM security_settings WHERE setting_key = '${k}'`)[0]; return r ? JSON.parse(r.value) : undefined; };
const put = (k, v) => sql(`INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('${k}', '"${v}"', datetime('now'), datetime('now'))`);

// a second owner, and the rule for changing security rules asking for two people
sql("UPDATE users SET role = 'super_admin', name = 'Bola Backer' WHERE email = 'logistics@example.com'");
put('stepup.security_settings.mode', 'enforce');
put('stepup.security_settings.two', 'enforce');

const withPasskey = async (email) => {
  const c = await open();
  await signInWithPassword(c.page, email);
  await c.page.locator('[data-testid="passkey-offer-later"]').click();
  await c.page.goto(SITE + manager, { waitUntil: 'networkidle' });
  await c.page.locator('[data-testid="passkey-add"]').click();
  await c.page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 1, null, { timeout: 15000 });
  return c;
};

const A = await withPasskey('owner@example.com');
const B = await withPasskey('logistics@example.com');
sql("UPDATE auth_credentials SET created_at = datetime('now','-3 days')");   // a passkey that has been on the account a while (a serious action will not take a brand-new one)

const asked = async (pg, mode, reason) => {
  await pg.goto(SITE + rule, { waitUntil: 'networkidle' });
  await pg.locator('[data-testid="passkey-rule"]').waitFor({ timeout: 15000 });
  await pg.getByRole('radio', { name: mode }).check();
  await pg.locator('[data-testid="rule-save"]').click();
  await pg.locator('[data-testid="step-up"]').waitFor({ timeout: 10000 });
  await pg.getByLabel('Reason').fill(reason);
};

{
  // the second person already has the page open (it looks for new requests by itself)
  await B.page.goto(SITE + approvals, { waitUntil: 'networkidle' });
  await B.page.locator('[data-testid="approvals-empty"]').waitFor({ timeout: 15000 });

  // the first person asks
  const { page } = A;
  await asked(page, /Test/, 'Trying the rule out');
  ok('the first person is told beforehand that a second person will be asked', /second person/.test(await page.locator('[data-testid="step-up-second-note"]').innerText()));
  await page.locator('[data-testid="step-up-passkey"]').click();
  await page.locator('[data-testid="step-up-waiting"]').waitFor({ timeout: 15000 });
  ok('after confirming, the first person waits for the second', /Waiting for a second person/.test(await page.locator('[data-testid="step-up-waiting-title"]').innerText()));
  await page.screenshot({ path: D + 'council-waiting.png' });
  ok('nothing has happened yet', setting('passkeys.mode') === undefined);

  // the second person sees it, with the server's facts
  const other = B.page;
  await other.locator('[data-testid="council-facts"]').waitFor({ timeout: 25000 });   // no reload: the page found it by itself
  const facts = await other.locator('[data-testid="council-facts"]').innerText();
  ok('the second person sees who asked, what, and the values', /Wanjiku Owner/.test(facts) && /Change the security rules/.test(facts) && /The passkey rule\s+Test/.test(facts), facts.replace(/\n+/g, ' | ').slice(0, 200));
  ok('and the first person\'s reason', /Their reason:\s*Trying the rule out/.test(await other.locator('[data-testid="approvals"]').innerText()));
  // the alert's link opens that very request (the second person's email, bell and WhatsApp all point at it), and says so when it is not open any more
  const pendingId = rows("SELECT id FROM auth_pending_actions WHERE second_required = 1 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1")[0].id;
  const linked = await B.ctx.newPage();
  await linked.goto(`${SITE}${approvals}&open=${pendingId}`, { waitUntil: 'networkidle' });
  await linked.locator(`[data-request="${pendingId}"][data-opened="true"]`).waitFor({ timeout: 15000 });
  ok('the link from the alert brings that request into view and marks it', (await linked.locator('[data-opened="true"]').count()) === 1 && (await linked.locator('[data-testid="approvals-gone"]').count()) === 0);
  await linked.goto(`${SITE}${approvals}&open=does-not-exist`, { waitUntil: 'networkidle' });
  await linked.locator('[data-testid="approvals-gone"]').waitFor({ timeout: 15000 });
  ok('a link to a request that is no longer open says so', /no longer open/.test(await linked.locator('[data-testid="approvals-gone"]').innerText()) && (await linked.locator('[data-opened="true"]').count()) === 0);
  await linked.close();
  // the one who asked, in another tab of the same sign-in, is not offered their own request
  const tab = await A.ctx.newPage();
  await tab.goto(SITE + approvals, { waitUntil: 'networkidle' });
  await tab.locator('[data-testid="approvals-empty"]').waitFor({ timeout: 15000 });
  ok('the one who asked is not offered their own request to approve', (await tab.locator('[data-request]').count()) === 0);
  await tab.close();
  await other.screenshot({ path: D + 'council-approvals.png', fullPage: true });
  ok('a serious action will not be approved without a reason', await other.locator('[data-testid="council-approve"]').isDisabled());
  await other.getByLabel('Your reason').fill('Looked at it with the owner');
  await other.locator('[data-testid="council-approve"]').click();
  await other.getByText('Approved. The person who asked can go ahead now.').waitFor({ timeout: 15000 });
  await other.locator('[data-testid="approvals-empty"]').waitFor({ timeout: 15000 });
  ok('once approved it is no longer waiting for them', (await other.locator('[data-request]').count()) === 0);

  // and the first person's action goes ahead by itself
  await page.locator('[data-testid="step-up-waiting"]').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(800);
  ok('the first person\'s action went through by itself', setting('passkeys.mode') === 'log');
  const events = rows("SELECT event, subject_id FROM security_events WHERE event IN ('council_asked','council_approved','stepup_approved') ORDER BY id");
  ok('both answers are on the record', events.map((e) => e.event).join() === 'stepup_approved,council_asked,council_approved' && events[1].subject_id !== events[2].subject_id);
}

{
  // the second person says no
  const { page } = A;
  await asked(page, /Off/, 'Switching it off again');
  await page.locator('[data-testid="step-up-passkey"]').click();
  await page.locator('[data-testid="step-up-waiting"]').waitFor({ timeout: 15000 });
  const other = B.page;
  await other.goto(SITE + approvals, { waitUntil: 'networkidle' });
  await other.locator('[data-testid="council-decline"]').waitFor({ timeout: 15000 });
  await other.getByLabel('Your reason').fill('Not now, we agreed to wait');
  await other.locator('[data-testid="council-decline"]').click();
  await other.getByText('Declined. Nothing was done.').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="step-up-waiting-title"]').filter({ hasText: 'A second person declined' }).waitFor({ timeout: 15000 });
  ok('the first person is told it was declined, by whom and why', /Bola Backer declined: "Not now, we agreed to wait"/.test(await page.locator('[data-testid="step-up-waiting"]').innerText()));
  await page.screenshot({ path: D + 'council-declined.png' });
  await page.locator('[data-testid="step-up-close"]').click();
  await page.locator('[data-testid="step-up-waiting"]').waitFor({ state: 'detached', timeout: 5000 });
  ok('and nothing was done', setting('passkeys.mode') === 'log');
}

{
  // the first person gives up while waiting
  const { page } = A;
  await asked(page, /Off/, 'Changed my mind soon');
  await page.locator('[data-testid="step-up-passkey"]').click();
  await page.locator('[data-testid="step-up-waiting"]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid="step-up-cancel"]').click();
  await page.locator('[data-testid="step-up-waiting"]').waitFor({ state: 'detached', timeout: 5000 });
  const other = B.page;
  await other.goto(SITE + approvals, { waitUntil: 'networkidle' });
  await other.locator('[data-testid="approvals-empty"]').waitFor({ timeout: 15000 });
  ok('a request that was given up disappears from the second person\'s list and nothing was done', setting('passkeys.mode') === 'log' && rows("SELECT COUNT(*) AS n FROM auth_pending_actions WHERE cancelled_at IS NOT NULL")[0].n === 1);
}

{
  // the one who asked can not be the second person
  const { page } = A;
  await page.goto(SITE + approvals, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="approvals-empty"]').waitFor({ timeout: 15000 });
  ok('with nothing waiting the page says so', (await page.locator('[data-request]').count()) === 0);
}

await A.ctx.close();
await B.ctx.close();
await finish();
