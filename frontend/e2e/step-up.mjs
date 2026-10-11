// Browser check: "One more step" for a sensitive action - the question with facts from the server, the reason, the passkey, and the action going through by itself (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, call, sql, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const rule = '/e2e/harness.html?c=PasskeyRule';
const manager = '/e2e/harness.html?c=PasskeyManager';
const setting = (k) => { const r = rows(`SELECT value FROM security_settings WHERE setting_key = '${k}'`)[0]; return r ? JSON.parse(r.value) : undefined; };
const question = (page) => page.locator('[data-testid="step-up"]');

{
  const { ctx, page, keys } = await open();
  await signInWithPassword(page, 'owner@example.com');
  await page.locator('[data-testid="passkey-offer-later"]').click();

  // a passkey that has been on the account a while (a critical action will not take one added a moment ago)
  await page.goto(SITE + manager, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 1, null, { timeout: 15000 });
  sql("UPDATE auth_credentials SET created_at = datetime('now','-3 days')");
  // the owner switches the rule for "change the security rules" on (as the screen will, in 2.5)
  sql("INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('stepup.security_settings.mode', '\"enforce\"', datetime('now'), datetime('now'))");

  await page.goto(SITE + rule, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-rule"]').waitFor({ timeout: 15000 });
  await page.getByRole('radio', { name: /Test/ }).check();
  await page.locator('[data-testid="rule-save"]').click();
  await question(page).waitFor({ timeout: 10000 });
  ok('changing a security rule is held back and the question appears', true);
  const facts = await page.locator('[data-testid="step-up-facts"]').innerText();
  ok('it says who is acting, what is being done and what is being sent, from the server', /Wanjiku Owner/.test(facts) && /Change the security rules/.test(facts) && /The passkey rule\s+Test/.test(facts), facts.replace(/\n+/g, ' | ').slice(0, 200));
  await page.screenshot({ path: D + 'step-up.png' });
  ok('nothing has been saved yet', setting('passkeys.mode') === undefined);
  ok('a serious action will not go on without a reason', await page.locator('[data-testid="step-up-passkey"]').isDisabled());
  await page.getByLabel('Reason').fill('Trying the rule out');
  await page.locator('[data-testid="step-up-passkey"]').click();
  await question(page).waitFor({ state: 'detached', timeout: 15000 });
  await page.getByText('Saved').first().waitFor({ timeout: 8000 });
  ok('with the passkey the action goes through by itself', setting('passkeys.mode') === 'log');
  const approved = rows("SELECT detail FROM security_events WHERE event = 'stepup_approved'");
  ok('the approval and the reason are on the record', approved.length === 1 && /Trying the rule out/.test(approved[0].detail) && /passkey/.test(approved[0].detail));

  // giving up
  await page.getByRole('radio', { name: /Off/ }).check();
  await page.locator('[data-testid="rule-save"]').click();
  await question(page).waitFor({ timeout: 10000 });
  await page.locator('[data-testid="step-up-cancel"]').click();
  await question(page).waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(800);
  ok('saying no leaves things as they were', setting('passkeys.mode') === 'log' && rows("SELECT COUNT(*) AS n FROM security_events WHERE event = 'stepup_cancelled'")[0].n === 1);

  // the same question, asked through the app's own client (any screen that makes a change would do)
  const viaClient = call(page, 'put', '/admin/security-policy', { mode: 'off', enforce_from: null });
  await question(page).waitFor({ timeout: 10000 });
  await page.getByLabel('Reason').fill('Switching it off again');
  await page.locator('[data-testid="step-up-passkey"]').click();
  const result = await viaClient;
  ok('any change made through the app is held and finished the same way', result.status === 200 && setting('passkeys.mode') === 'off', JSON.stringify(result.data).slice(0, 100));
  ok('each approval was used once: a second question was needed for the second change', rows("SELECT COUNT(*) AS n FROM auth_pending_actions WHERE used_at IS NOT NULL")[0].n === 2);
  await ctx.close();
}

{
  // test mode: nobody is asked, but it is written down
  sql("INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('stepup.security_settings.mode', '\"log\"', datetime('now'), datetime('now'))");
  const { ctx, page } = await open({ authenticator: false });
  await signInWithPassword(page, 'owner@example.com');
  const r = await call(page, 'put', '/admin/security-policy', { mode: 'log', enforce_from: null });
  ok('in test mode the change simply goes through', r.status === 200 && (await question(page).count()) === 0);
  ok('and it is written down that it would have been asked', rows("SELECT COUNT(*) AS n FROM security_events WHERE event = 'stepup_would_ask'")[0].n >= 1);
  await ctx.close();
}

await finish();
