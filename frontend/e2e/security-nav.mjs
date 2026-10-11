// Browser check: the breadcrumb and the row that moves between the four security pages (see e2e/README.md).
import { D, SITE, ok, finish, open, signInWithPassword, resetDatabase } from './lib.mjs';
resetDatabase();
const c = await open();
await signInWithPassword(c.page, 'owner@example.com');
for (const [name, harness] of [['Approvals', 'Approvals'], ['Sensitive actions', 'SensitiveActions'], ['Passkey rule', 'PasskeyRule']]) {
  await c.page.goto(`${SITE}/e2e/harness.html?c=${harness}`, { waitUntil: 'networkidle' });
  const nav = c.page.locator('[data-testid="security-nav"]');
  await nav.waitFor({ timeout: 15000 });
  const crumbs = await nav.locator('nav[aria-label="Breadcrumb"]').innerText();
  ok(`${name}: the breadcrumb starts at Settings and Access`, /Settings\s+Access/.test(crumbs.replace(/\n/g, ' ')), crumbs.replace(/\n/g, ' '));
  const hrefs = await nav.locator('[role="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  ok(`${name}: links to the four security pages`, hrefs.join() === '/admin/security,/admin/security/passkeys,/admin/security/actions,/admin/security/approvals', hrefs.join());
  ok(`${name}: the breadcrumb links go to the settings overview`, (await nav.locator('nav a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))).every((h) => h === '/admin/settings'));
}
await c.page.goto(`${SITE}/e2e/harness.html?c=Approvals`, { waitUntil: 'networkidle' });
await c.page.screenshot({ path: D + 'security-nav.png' });
await finish();
