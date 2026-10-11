// Browser check: a sign-in that does not look like the person is held until they confirm with their passkey (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, call, sql, resetDatabase, rows } from './lib.mjs';
resetDatabase();

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
const gate = (page) => page.locator('[data-testid="security-gate"]');
const mode = (m) => sql(`INSERT OR REPLACE INTO security_settings (setting_key, value, created_at, updated_at) VALUES ('risk.mode', '${JSON.stringify(m)}', datetime('now'), datetime('now'))`);

let phone = [];
{
  // the usual place: Kenya, the usual browser; she adds a passkey
  const { ctx, page, keys } = await open({ headers: { 'CF-IPCountry': 'KE' } });
  await signInWithPassword(page, 'amina@example.com');
  await page.locator('[data-testid="passkey-offer-add"]').click();
  await page.locator('[data-testid="passkey-offer"]').waitFor({ state: 'detached', timeout: 10000 });
  phone = await keys();
  await call(page, 'post', '/auth/logout');
  await ctx.close();
}

mode('log');
{
  const { ctx, page } = await open({ userAgent: IPHONE, headers: { 'CF-IPCountry': 'RU' }, credentials: phone, conditional: false });
  await signInWithPassword(page, 'amina@example.com');
  await page.waitForTimeout(1500);
  ok('in test mode an unusual sign-in is let in', (await gate(page).count()) === 0 && (await call(page, 'get', '/auth/sessions')).status === 200);
  const e = rows("SELECT detail FROM security_events WHERE event = 'risk_would_ask' ORDER BY id DESC LIMIT 1")[0];
  ok('and it is written down what would have been done', !!e && /new_country/.test(e.detail) && /ask_for_passkey/.test(e.detail), e?.detail);
  await call(page, 'post', '/auth/logout');
  await ctx.close();
}

mode('enforce');
{
  const { ctx, page, keys } = await open({ userAgent: ANDROID, headers: { 'CF-IPCountry': 'DE' }, credentials: phone, conditional: false });
  await signInWithPassword(page, 'amina@example.com');
  await gate(page).waitFor({ timeout: 10000 });
  ok('when it is on, an unusual sign-in (a new browser in a new country) meets the "confirm it is you" screen', /Confirm it is you/.test(await gate(page).innerText()) && /looks different/.test(await gate(page).innerText()));
  await page.screenshot({ path: D + 'risk-gate.png' });
  const held = await call(page, 'get', '/customer/cart');
  ok('and the server turns everything else away, saying why', held.status === 403 && held.data.restricted?.reason === 'risk_check', JSON.stringify(held.data).slice(0, 100));
  await page.locator('[data-testid="security-gate-go"]').click();
  await gate(page).waitFor({ state: 'detached', timeout: 15000 });
  ok('the passkey confirms it and the screen goes', (await call(page, 'get', '/auth/sessions')).status === 200 && (await call(page, 'get', '/auth/me')).data.security.gate === null);
  ok('it is on the record that it was held', rows("SELECT COUNT(*) AS n FROM security_events WHERE event = 'risk_stronger'")[0].n === 1);
  phone = await keys();   // (the device counted its use)
  await call(page, 'post', '/auth/logout');
  await ctx.close();
}
{
  // the passkey itself is never judged
  const { ctx, page } = await open({ userAgent: FIREFOX, headers: { 'CF-IPCountry': 'FR' }, credentials: phone, conditional: false });
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) await box.check();
  await page.locator('[data-testid="passkey-signin"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await page.waitForTimeout(1200);
  ok('a sign-in with the passkey from anywhere is never held', (await gate(page).count()) === 0 && rows("SELECT COUNT(*) AS n FROM security_events WHERE event = 'risk_stronger'")[0].n === 1);
  await ctx.close();
}

await finish();
