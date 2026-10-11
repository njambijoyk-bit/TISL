// Browser check: the owner's page for the passkey rule (Admin → Security → Passkey rule), in a real Chromium against the real API (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, call, sql, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const rule = '/e2e/harness.html?c=PasskeyRule';
const manager = '/e2e/harness.html?c=PasskeyManager';
const setting = (k) => { const r = rows(`SELECT value FROM security_settings WHERE setting_key = '${k}'`)[0]; return r ? JSON.parse(r.value) : undefined; };

{
  const { ctx, page, keys, plugIn, only } = await open();
  await signInWithPassword(page, 'owner@example.com');
  const later = page.locator('[data-testid="passkey-offer-later"]');
  await later.waitFor({ timeout: 10000 });
  await later.click();

  await page.goto(SITE + rule, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-rule"]').waitFor({ timeout: 15000 });
  await page.locator('[data-stat="Staff accounts"]').waitFor({ timeout: 10000 });
  const stat = async (name) => Number((await page.locator(`[data-stat="${name}"]`).innerText()).split('\n')[0]);
  ok('the page counts the staff, those the rule is for, and those still to add a passkey', (await stat('Staff accounts')) === 3 && (await stat('The rule is for')) === 2 && (await stat('Still to add a passkey')) === 2 && (await stat('Have what it asks')) === 0);
  await page.screenshot({ path: D + 'passkey-rule-1.png', fullPage: true });
  ok('the rule starts Off', await page.getByRole('radio', { name: /Off/ }).isChecked());
  ok('the staff list starts with the people who still have to add one', (await page.getByText('Chege Admin', { exact: true }).count()) === 1 && (await page.getByText('Otieno Driver', { exact: true }).count()) === 0);

  // Test mode
  await page.getByRole('radio', { name: /Test/ }).check();
  await page.locator('#enforce_from').fill(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  await page.locator('[data-testid="rule-save"]').click();
  await page.getByText('Saved').first().waitFor({ timeout: 8000 });
  ok('choosing Test and a date saves', setting('passkeys.mode') === 'log' && !!setting('passkeys.enforce_from'));
  ok('it is written on the record who changed it', rows("SELECT COUNT(*) AS n FROM security_events WHERE event = 'passkey_policy_changed'")[0].n === 1);

  // On, before the owner has done it themselves: refused
  await page.getByRole('radio', { name: /^On/ }).check();
  await page.locator('#enforce_from').fill(new Date().toISOString().slice(0, 10));
  await page.locator('[data-testid="rule-save"]').click();
  await page.getByText(/You would be locked out/).waitFor({ timeout: 8000 });
  ok('turning it on before the owner has their own passkeys is refused in plain words', setting('passkeys.mode') === 'log');
  await page.screenshot({ path: D + 'passkey-rule-refused.png', fullPage: true });

  // The owner does what the rule asks: two devices, recovery codes
  await page.goto(SITE + manager, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="passkey-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 1, null, { timeout: 15000 });
  const second = await plugIn('usb');
  await only([second.id]);
  await page.locator('[data-testid="passkey-add"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="passkey-row"]').length === 2, null, { timeout: 15000 });
  await page.locator('[data-testid="recovery-make"]').click();
  await page.locator('[data-testid="recovery-fresh"]').waitFor({ timeout: 15000 });
  await page.getByLabel('I have saved these codes somewhere safe').check();
  await page.locator('[data-testid="recovery-done"]').click();

  await page.goto(SITE + rule, { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: /^On/ }).check();
  await page.locator('#enforce_from').fill(new Date().toISOString().slice(0, 10));
  await page.locator('[data-testid="rule-save"]').click();
  await page.getByRole('button', { name: /Yes, switch it on/ }).waitFor({ timeout: 8000 });
  ok('with others still to add theirs it asks for a yes first', setting('passkeys.mode') === 'log');
  await page.screenshot({ path: D + 'passkey-rule-confirm.png', fullPage: true });
  await page.getByRole('button', { name: /Yes, switch it on/ }).click();
  await page.getByText('Saved').first().waitFor({ timeout: 8000 });
  ok('and then the rule is on', setting('passkeys.mode') === 'enforce');
  ok('the owner, who has done what it asks, carries on', (await call(page, 'get', '/admin/security-policy')).status === 200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Chege Admin', { exact: true }).waitFor({ timeout: 8000 });
  ok('the list still shows who has to add one, and the counts moved', (await stat('Have what it asks')) === 1 && (await stat('Still to add a passkey')) === 1);

  // what each role needs (starting from the older settings: the owner's two kept on the device by the one all-in-one switch)
  sql("DELETE FROM security_settings WHERE setting_key = 'passkeys.device_bound_roles'");
  sql("INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('passkeys.owner_device_bound', 'true', datetime('now'), datetime('now'))");
  await page.reload({ waitUntil: 'networkidle' });
  const level = (role) => page.locator(`input[name="level-${role}"]:checked`).getAttribute('value');
  await page.locator('[data-testid="role-strength"]').waitFor({ timeout: 10000 });
  ok('each role says how many passkeys it needs', (await level('super_admin')) === '2' && (await level('admin')) === '1' && (await level('logistics')) === '0');
  ok('the owner\'s two stay on the device, the others do not', (await page.locator('input[name="bound-super_admin"]').isChecked()) && !(await page.locator('input[name="bound-admin"]').isChecked()));
  ok('a role that needs none has nothing to keep on the device', await page.locator('input[name="bound-logistics"]').isDisabled());
  ok('showing the older settings this way changes nothing: there is nothing to save', await page.locator('[data-testid="rule-save"]').isDisabled());
  await page.screenshot({ path: D + 'passkey-rule-roles.png', fullPage: true });
  await page.locator('input[name="level-admin"][value="2"]').check();
  await page.locator('input[name="bound-admin"]').check();
  await page.locator('input[name="level-logistics"][value="1"]').check();
  await page.locator('[data-testid="rule-save"]').click();
  await page.getByRole('button', { name: /Yes, switch it on/ }).click();
  await page.getByText('Saved').first().waitFor({ timeout: 8000 });
  ok('the roles are saved: admin needs two on the device, logistics one', JSON.stringify(setting('passkeys.owner_roles')) === JSON.stringify(['super_admin', 'admin']) && setting('passkeys.roles').includes('logistics') && setting('passkeys.device_bound_roles').includes('admin') && setting('passkeys.device_bound_roles').includes('super_admin') && setting('passkeys.owner_device_bound') === false, JSON.stringify([setting('passkeys.roles'), setting('passkeys.owner_roles'), setting('passkeys.device_bound_roles')]));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-stat="Staff accounts"]').waitFor({ timeout: 10000 });
  ok('and the counts follow: the rule is now for three people', (await stat('The rule is for')) === 3);
  ok('a reload shows what was saved and nothing to save', (await level('admin')) === '2' && (await page.locator('input[name="bound-admin"]').isChecked()) && (await level('logistics')) === '1' && (await page.locator('[data-testid="rule-save"]').isDisabled()));
  // taking a role's requirement away takes its "stay on the device" with it
  await page.locator('input[name="level-admin"][value="0"]').check();
  await page.locator('[data-testid="rule-save"]').click();
  await page.getByRole('button', { name: /Yes, switch it on/ }).click();
  await page.getByText('Saved').first().waitFor({ timeout: 8000 });
  ok('a role set to none is no longer kept to the device either', !setting('passkeys.roles').includes('admin') && !setting('passkeys.owner_roles').includes('admin') && !setting('passkeys.device_bound_roles').includes('admin') && setting('passkeys.device_bound_roles').includes('super_admin'), JSON.stringify(setting('passkeys.device_bound_roles')));
  await page.getByRole('combobox', { name: 'Show' }).selectOption('applies');
  ok('the list says how many each person needs', /0 of 1/.test(await page.getByText('Otieno Driver', { exact: true }).locator('xpath=ancestor::tr').innerText()), '');
  await ctx.close();
}
{
  const { ctx, page } = await open();
  await signInWithPassword(page, 'admin@example.com');
  await page.locator('[data-testid="security-gate"]').waitFor({ timeout: 10000 });
  ok('and an admin without a passkey meets the "add a passkey" screen', true);
  await ctx.close();
}

await finish();
