// Browser check: the owner's page for sensitive actions (Admin → Security → Sensitive actions) and the payment keys screen once the "one more step" rule is on (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, sql, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const actions = '/e2e/harness.html?c=SensitiveActions';
const payments = '/e2e/harness.html?c=PaymentSettings';
const manager = '/e2e/harness.html?c=PasskeyManager';
const setting = (k) => { const r = rows(`SELECT value FROM security_settings WHERE setting_key = '${k}'`)[0]; return r ? JSON.parse(r.value) : undefined; };
const question = (page) => page.locator('[data-testid="step-up"]');
const pick = (page, rule, mode) => page.locator(`[data-rule="${rule}"] input[value="${mode}"]`).check();
const save = (page) => page.locator('[data-testid="actions-save"]').click();
/** The save went through (the server answered 200 to the change; a held one answers 403 first and 200 when it is tried again after the answer). */
const saved = (page) => page.waitForResponse((r) => r.url().includes('/admin/security-policy/actions') && r.request().method() === 'PUT' && r.status() === 200, { timeout: 15000 });

{
  const { ctx, page } = await open();
  await signInWithPassword(page, 'owner@example.com');
  await page.locator('[data-testid="passkey-offer-later"]').click();

  // a passkey added a moment ago
  await page.goto(SITE + manager, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 1, null, { timeout: 15000 });

  await page.goto(SITE + actions, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="sensitive-actions"]').waitFor({ timeout: 15000 });
  await page.locator('[data-rule="payment_keys"]').waitFor({ timeout: 10000 });
  ok('the page lists every sensitive action and the unusual-sign-in check', (await page.locator('[data-rule]').count()) === 11);
  ok('all of them start off', (await page.locator('[data-testid="tally"]').innerText()).startsWith('0 on · 0 in test · 10 off'));
  ok('there is nothing to save until something changes', await page.locator('[data-testid="actions-save"]').isDisabled());
  ok('each says what it asks for', /Needs a passkey/.test(await page.locator('[data-rule="payroll_run"]').innerText()) && /A passkey or the password/.test(await page.locator('[data-rule="export_bulk"]').innerText()));
  ok('and whether the person must say why', /They say why/.test(await page.locator('[data-rule="payroll_run"]').innerText()) && !/They say why/.test(await page.locator('[data-rule="export_bulk"]').innerText()));
  await page.screenshot({ path: D + 'actions-1.png', fullPage: true });

  // the owner could not answer a serious question yet with a passkey added a moment ago: it can not be switched on, an everyday one can
  ok('a serious action can not be switched on with a passkey added today', await page.locator('[data-rule="payment_keys"] input[value="enforce"]').isDisabled());
  ok('and it says why', /could not answer this yourself yet/.test(await page.locator('[data-rule="payment_keys"]').innerText()));
  ok('an everyday one can', await page.locator('[data-rule="export_bulk"] input[value="enforce"]').isEnabled());
  sql("UPDATE auth_credentials SET created_at = datetime('now','-3 days')");
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-rule="payment_keys"]').waitFor({ timeout: 10000 });
  ok('a day later the serious ones can be switched on too', await page.locator('[data-rule="payment_keys"] input[value="enforce"]').isEnabled());

  // Test mode first, for two actions and the sign-in check
  await pick(page, 'payroll_run', 'log');
  await pick(page, 'payment_keys', 'log');
  await pick(page, 'risk', 'log');
  ok('choosing something makes it savable', await page.locator('[data-testid="actions-save"]').isEnabled());
  await Promise.all([saved(page), save(page)]);
  ok('Test is saved for each', setting('stepup.payroll_run.mode') === 'log' && setting('stepup.payment_keys.mode') === 'log' && setting('risk.mode') === 'log' && setting('stepup.export_bulk.mode') === undefined);
  ok('the page counts them', (await page.locator('[data-testid="tally"]').innerText()).startsWith('0 on · 2 in test · 8 off'));
  const logged = rows("SELECT detail FROM security_events WHERE event = 'stepup_rules_changed'");
  ok('who changed what is on the record, with before and after', logged.length === 1 && /payroll_run/.test(logged[0].detail) && /"to":"log"/.test(logged[0].detail));
  ok('there is nothing left to save', await page.locator('[data-testid="actions-save"]').isDisabled());

  // what test mode has seen shows up beside the rule
  sql("INSERT INTO security_events (subject_type, subject_id, event, severity, detail, created_at) VALUES ('user', 1, 'stepup_would_ask', 'info', '{\"rule\":\"payroll_run\"}', datetime('now'))");
  sql("INSERT INTO security_events (subject_type, subject_id, event, severity, detail, created_at) VALUES ('user', 1, 'stepup_would_ask', 'info', '{\"rule\":\"payroll_run\"}', datetime('now'))");
  sql("INSERT INTO security_events (subject_type, subject_id, event, severity, detail, created_at) VALUES ('user', 1, 'risk_would_ask', 'info', '{\"signals\":[\"new_network\"],\"score\":1}', datetime('now'))");
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-rule="payroll_run"]').waitFor({ timeout: 10000 });
  ok('it says how often the rule would have asked in the last week', /would have asked 2 times/.test(await page.locator('[data-rule="payroll_run"] [data-line="stats"]').innerText()));
  ok('and how the sign-in check would have acted', /1 would have been flagged/.test(await page.locator('[data-rule="risk"] [data-line="stats"]').innerText()) && /part of the internet they have not used lately \(1\)/.test(await page.locator('[data-rule="risk"] [data-line="stats"]').innerText()));
  await page.screenshot({ path: D + 'actions-2.png', fullPage: true });

  // a stale page: the passkey is made "new" behind the page's back, so the server refuses a switch the page thought possible
  sql("UPDATE auth_credentials SET created_at = datetime('now')");
  await pick(page, 'backup_restore', 'enforce');
  await save(page);
  await page.getByRole('alert').filter({ hasText: /could not answer this question yourself yet/ }).waitFor({ timeout: 8000 });
  ok('a switch the server refuses is explained in words, and nothing is saved', setting('stepup.backup_restore.mode') === undefined);
  sql("UPDATE auth_credentials SET created_at = datetime('now','-3 days')");
  await page.getByRole('button', { name: 'Undo changes' }).click();
  ok('undo clears the explanation', (await page.getByRole('alert').filter({ hasText: /could not answer/ }).count()) === 0);

  // On, for the payment keys and for changing these rules: the first needs nothing (the rule that guards this page is not on yet)
  await pick(page, 'payment_keys', 'enforce');
  await pick(page, 'security_settings', 'enforce');
  await Promise.all([saved(page), save(page)]);
  ok('On is saved', setting('stepup.payment_keys.mode') === 'enforce' && setting('stepup.security_settings.mode') === 'enforce');

  // now changing a rule is itself a sensitive action
  await pick(page, 'payroll_run', 'enforce');
  await save(page);
  await question(page).waitFor({ timeout: 10000 });
  const facts = await page.locator('[data-testid="step-up-facts"]').innerText();
  ok('changing the rules is held back and says what it would set, in words', /Change the security rules/.test(facts) && /Run or pay payroll\s+On: the person must confirm/.test(facts), facts.replace(/\n+/g, ' | ').slice(0, 220));
  await page.screenshot({ path: D + 'actions-question.png' });
  ok('nothing is changed until the owner has answered', setting('stepup.payroll_run.mode') === 'log');
  await page.getByLabel('Reason').fill('Payroll should be confirmed too');
  await page.locator('[data-testid="step-up-passkey"]').click();
  await question(page).waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(500);
  ok('with the passkey the change goes through by itself', setting('stepup.payroll_run.mode') === 'enforce');
  ok('the page now counts three on', (await page.locator('[data-testid="tally"]').innerText()).startsWith('3 on · 0 in test · 7 off'));

  // saying no
  await pick(page, 'export_bulk', 'log');
  await save(page);
  await question(page).waitFor({ timeout: 10000 });
  await page.locator('[data-testid="step-up-cancel"]').click();
  await question(page).waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(600);
  ok('giving up leaves everything as it was', setting('stepup.export_bulk.mode') === undefined);
  ok('the page still has the unsaved choice, ready to try again', await page.locator('[data-testid="actions-save"]').isEnabled());
  await page.getByRole('button', { name: 'Undo changes' }).click();
  ok('undo puts it back', await page.locator('[data-rule="export_bulk"] input[value="off"]').isChecked());

  // the payment keys screen, with that rule on: the door asks once, and the screen does not ask for the password as well
  const answer = async (reason) => {
    await question(page).waitFor({ timeout: 10000 });
    await page.getByLabel('Reason').fill(reason);
    await page.locator('[data-testid="step-up-passkey"]').click();
    await question(page).waitFor({ state: 'detached', timeout: 15000 });
  };
  await page.goto(SITE + payments, { waitUntil: 'networkidle' });
  await page.getByLabel('Consumer key').waitFor({ timeout: 15000 });
  await page.getByLabel('Consumer key').fill('KEY-AAAA-1111');
  await page.getByLabel('Consumer secret').fill('SECRET-BBBB-2222');
  await page.getByLabel('Passkey').fill('PASS-CCCC-3333');
  await page.getByLabel('Shortcode').fill('174379');
  await page.getByRole('button', { name: /Test and save/ }).click();
  await question(page).waitFor({ timeout: 10000 });
  const keyFacts = await page.locator('[data-testid="step-up-facts"]').innerText();
  ok('saving payment keys asks the one question, with the facts, and never the keys', /Save new payment settings/.test(keyFacts) && !/KEY-AAAA|SECRET-BBBB|PASS-CCCC/.test(keyFacts), keyFacts.replace(/\n+/g, ' | ').slice(0, 200));
  ok('the screen did not ask for the password as well', (await page.getByLabel('Your password').count()) === 0);
  await page.screenshot({ path: D + 'actions-payments.png' });
  await page.getByLabel('Reason').fill('Rotating the keys');
  await page.locator('[data-testid="step-up-passkey"]').click();
  await question(page).waitFor({ state: 'detached', timeout: 15000 });
  const anyway = page.getByRole('button', { name: /Save anyway/ });
  const inUse = page.getByText(/Version 1 is in use/);
  await anyway.or(inUse).first().waitFor({ timeout: 20000 });
  if (await anyway.count()) {   // Safaricom can not be reached from here: the keys are saved anyway, which is its own question
    await anyway.click();
    await answer('Saving although Safaricom could not be reached');
    await inUse.waitFor({ timeout: 15000 });
  }
  ok('the keys are saved', rows("SELECT COUNT(*) AS n FROM payment_setting_versions")[0].n === 1);
  ok('no wrong password was ever recorded, and no password was typed', rows("SELECT COUNT(*) AS n FROM payment_setting_logs WHERE event = 'password_failed'")[0].n === 0 && (await page.getByLabel('Your password').count()) === 0);

  await page.getByRole('button', { name: /Make a new callback token/ }).click();
  await answer('A new callback token');
  await page.getByText(/A new callback token is in use/).first().waitFor({ timeout: 10000 });
  ok('making a new callback token goes the same way', rows("SELECT COUNT(*) AS n FROM payment_setting_versions")[0].n === 2 && (await page.getByLabel('Your password').count()) === 0);

  // the history: putting an earlier version back goes the same way
  await page.getByRole('tab', { name: /History/ }).click();
  await page.getByRole('button', { name: /Restore/ }).first().waitFor({ timeout: 10000 });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Restore/ }).first().click();
  await answer('Putting the earlier keys back');
  await page.waitForTimeout(1500);
  ok('putting an earlier version back is one question too, and no password', rows("SELECT COUNT(*) AS n FROM payment_setting_versions")[0].n === 3 && (await page.getByLabel('Your password').count()) === 0);
  await page.getByRole('tab', { name: /M-Pesa/ }).click();

  // the KES 1 test prompt does not go through that door, so it keeps asking for the password
  await page.getByLabel('Your M-Pesa number').fill('0712345678');
  await page.getByRole('button', { name: /Send the KES 1 prompt/ }).click();
  await page.getByLabel('Your password').waitFor({ timeout: 8000 });
  ok('the KES 1 test prompt still asks for the password', true);
  await page.keyboard.press('Escape');

  // a rule that is chosen but can not act (its database script is missing) says so on the page
  sql('ALTER TABLE auth_pending_actions RENAME TO auth_pending_actions_away');
  await page.goto(SITE + actions, { waitUntil: 'networkidle' });
  await page.locator('[data-rule="payment_keys"]').waitFor({ timeout: 15000 });
  ok('a rule that is chosen but asleep says so', /not in force/.test(await page.locator('[data-rule="payment_keys"]').innerText()) && (await page.locator('[data-rule="payment_keys"] input[value="log"]').isDisabled()));
  sql('ALTER TABLE auth_pending_actions_away RENAME TO auth_pending_actions');
  await ctx.close();
}

{
  // with the rule off the screen asks for the password as it always did
  sql("INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('stepup.payment_keys.mode', '\"off\"', datetime('now'), datetime('now'))");
  const { ctx, page } = await open({ authenticator: false });
  await signInWithPassword(page, 'owner@example.com');
  await page.goto(SITE + payments, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Make a new callback token/ }).click();
  await page.getByLabel('Your password').waitFor({ timeout: 8000 });
  ok('with the rule off the screen still asks for the password', (await question(page).count()) === 0);
  await page.screenshot({ path: D + 'actions-payments-password.png' });
  await ctx.close();
}

{
  // someone who may see the page but not change it
  const { ctx, page } = await open({ authenticator: false });
  await signInWithPassword(page, 'admin@example.com');
  await page.goto(SITE + actions, { waitUntil: 'networkidle' });
  await page.locator('[data-rule="payment_keys"]').waitFor({ timeout: 15000 });
  ok('an admin sees the rules but has no way to change them', (await page.locator('[data-rule="payment_keys"] input[value="log"]').isDisabled()) && (await page.locator('[data-testid="actions-save"]').count()) === 0 && /not change them/.test(await page.locator('[data-testid="tally"]').innerText()));
  await ctx.close();
}

await finish();
