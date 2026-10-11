// Shared pieces of the browser checks: a real Chromium, a pretend fingerprint reader (Chromium's virtual authenticator), a clean throw-away database, and the few things every check does (see e2e/README.md).
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
export const D = process.env.SHOTS || '/tmp/';
export const SITE = process.env.SITE || 'http://localhost:5177', API = 'http://localhost:8000/api', DB = process.env.E2E_DB || '/tmp/tisl-e2e.sqlite';
export const PASSWORD = 'purple-giraffe-lantern-77';

/** A clean database: the people from E2eSeed, nobody has a passkey, no rate-limit memory. */
export const resetDatabase = () => execSync(`php tests/e2e/boot.php ${DB}`, { cwd: new URL('../../backend/', import.meta.url).pathname, stdio: 'ignore' });
export const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let failures = 0;
export const ok = (name, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
/** Close the browser, say how it went and leave with the right exit code. */
export async function finish() {
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

/** A fresh browser with a pretend authenticator that always "verifies" the person. */
export async function open({ authenticator = true, conditional = true, credentials = [], picksFromList = false, userAgent, headers } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 }, ...(userAgent ? { userAgent } : {}), ...(headers ? { extraHTTPHeaders: headers } : {}) });
  await ctx.addInitScript(() => { localStorage.setItem('tisl_cookie_consent', 'accepted'); });
  if (!conditional) await ctx.addInitScript(() => { PublicKeyCredential.isConditionalMediationAvailable = async () => false; });   // a browser without the email-field list: only the button
  // The email field's list is a piece of the browser that a test can not click. Here the "person" picks a saved passkey from it 0.8 s after the page starts waiting (the pretend device then answers as it would).
  if (picksFromList) await ctx.addInitScript(() => {
    const original = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = async (options) => {
      if (options?.mediation !== 'conditional') return original(options);
      await new Promise((r) => setTimeout(r, 800));
      const { mediation, ...asked } = options;
      try { const answer = await original(asked); console.log('picked from the list'); return answer; } catch (e) { console.log('the list failed', e.name); throw e; }
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  if (process.env.DEBUG_E2E) page.on('console', (m) => { if (!/Failed to load|Server error|vite|React DevTools|Resource not found|ThemeProvider/.test(m.text())) console.log('   console:', m.text().slice(0, 160)); });
  if (process.env.DEBUG_E2E) page.on('response', async (r) => { if (r.url().startsWith(API) && r.request().method() !== 'GET') console.log('  ', r.status(), r.request().method(), r.url().replace(API, ''), (await r.text().catch(() => '')).slice(0, 160)); });
  const cdp = await ctx.newCDPSession(page);
  let id = null;
  if (authenticator) {
    await cdp.send('WebAuthn.enable');
    ({ authenticatorId: id } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } }));
  }
  for (const credential of credentials) await cdp.send('WebAuthn.addCredential', { authenticatorId: id, credential });   // the same device, back in a new browser window
  const keys = async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId: id })).credentials;
  // another device in the same browser (a plugged-in security key, a tap-on key): a device that already holds a passkey for the account refuses to make a second one, so each new passkey needs a new device
  const plugIn = async (transport) => {
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport, hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const list = async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
    list.id = authenticatorId;
    list.unplug = async () => { extra.splice(extra.indexOf(authenticatorId), 1); await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }); };
    extra.push(authenticatorId);

    return list;
  };
  // With several devices answering at once the browser races them, and a device that holds an excluded passkey ends the whole request. A person picks one device in the browser's own chooser; here the others are switched
  // off for the moment the new passkey is made (just after the server's question arrives, which is after any proof with the old one).
  const only = (authenticatorIds) => page.route('**/auth/passkeys/register/options', async (route) => {
    const answer = await route.fetch();
    for (const a of [id, ...extra]) await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: a, enabled: authenticatorIds.includes(a) });
    await route.fulfill({ response: answer });
  });
  const everyone = async () => { for (const a of [id, ...extra]) await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: a, enabled: true }); };
  const extra = [];
  return { ctx, page, cdp, keys, plugIn, only, everyone };
}

export async function signInWithPassword(page, email) {
  await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) await box.check();
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

export const call = (page, method, url, body) => page.evaluate(async ([m, u, b]) => {
  const { default: api } = await import('/src/_shared/api/axios.js');
  try { const r = await api.request({ method: m, url: u, data: b }); return { status: r.status, data: r.data }; } catch (e) { return { status: e.response?.status ?? 0, data: e.response?.data ?? String(e) }; }
}, [method, url, body]);

// (no sqlite3 program here: PHP's PDO does the same job)
export const sql = (q) => execSync(`php -r '$p = new PDO("sqlite:" . $argv[1]); $r = $p->exec($argv[2]);' ${JSON.stringify(DB)} ${JSON.stringify(q)}`).toString().trim();
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read rows straight from the throw-away database, as plain objects. */
export const rows = (q) => JSON.parse(execSync(`php -r '$p = new PDO("sqlite:" . $argv[1]); echo json_encode($p->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));' ${JSON.stringify(DB)} ${JSON.stringify(q)}`).toString() || '[]');
