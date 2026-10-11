// Browser check: the sign-in cookie, end to end, in a real Chromium against the real API (see e2e/README.md).
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const D = process.env.SHOTS || '/tmp/';
execSync(`php tests/e2e/boot.php ${process.env.E2E_DB || '/tmp/tisl-e2e.sqlite'}`, { cwd: new URL('../../backend/', import.meta.url).pathname, stdio: 'ignore' });   // a clean database every run
const SITE = process.env.SITE || 'http://localhost:5177', API = 'http://localhost:8000/api';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('tisl_cookie_consent', 'accepted'); });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const seen = [];
page.on('request', (r) => { if (r.url().startsWith(API)) seen.push(`${r.method()} ${r.url().replace(API, '')} auth=${!!r.headers()['authorization']} csrf=${!!r.headers()['x-csrf-token']}`); });
const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);

// 1. sign in through the real page
await page.goto(SITE + '/login', { waitUntil: 'networkidle' });
await page.locator('input[name="email"]').fill('amina@example.com');
await page.locator('input[name="password"]').fill('purple-giraffe-lantern-77');
const box = page.locator('input[type="checkbox"]').first();
if (await box.count()) await box.check();
await page.screenshot({ path: D + 'cookie-login.png' });
await page.locator('button[type="submit"]').first().click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
const cookies = await ctx.cookies(API);
const session = cookies.find((c) => c.name === 'tisl_session');
ok('a session cookie was set, HttpOnly, SameSite=Lax', !!session && session.httpOnly && session.sameSite === 'Lax', JSON.stringify({ httpOnly: session?.httpOnly, sameSite: session?.sameSite, path: session?.path }));
const store = await page.evaluate(() => ({ token: localStorage.getItem('token'), csrf: localStorage.getItem('csrf-token'), mode: localStorage.getItem('session-mode'), auth: localStorage.getItem('auth-storage'), cookie: document.cookie }));
ok('the page does not hold the session code', !store.token && !(store.auth || '').includes('"token"') && !store.cookie.includes('tisl_session'), `token=${store.token} cookie="${store.cookie}"`);
ok('the page holds a CSRF code and knows the mode', !!store.csrf && store.mode === 'cookie');
ok('the stored state contains no copy of the session code', !JSON.stringify(store).includes(decodeURIComponent(session.value)));

// the app's own API client, in the real browser, against the real server
const call = (method, url, body) => page.evaluate(async ([m, u, b]) => {
  const { default: api } = await import('/src/_shared/api/axios.js');
  try { const r = await api.request({ method: m, url: u, data: b }); return { status: r.status, data: r.data }; } catch (e) { return { status: e.response?.status ?? 0, data: e.response?.data ?? String(e) }; }
}, [method, url, body]);

// 2. a signed-in request works with only the cookie
seen.length = 0;
const list = await call('get', '/auth/sessions');
ok('the sessions list loads over the cookie alone', list.status === 200 && list.data.data.length === 1 && list.data.data[0].current === true, JSON.stringify(list.data).slice(0, 120));
ok('no request carried an Authorization header', seen.filter((s) => s.includes('auth=true')).length === 0, seen.join('|'));

// 3. a change needs the CSRF code: make a second session elsewhere, then end it from the page
execSync(`curl -s -o /dev/null -X POST ${API}/auth/login -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' -d '{"email":"amina@example.com","password":"purple-giraffe-lantern-77"}'`);
seen.length = 0;
const ended = await call('post', '/auth/sessions/revoke-others');
ok('ending the other device worked, and the request carried the CSRF code', ended.status === 200 && ended.data.ended === 1 && seen.some((s) => s.startsWith('POST /auth/sessions/revoke-others') && s.includes('csrf=true')), JSON.stringify(ended.data) + ' ' + seen.join(' | '));

// 4. a stale CSRF code is refreshed and the change retried
execSync(`curl -s -o /dev/null -X POST ${API}/auth/login -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0' -d '{"email":"amina@example.com","password":"purple-giraffe-lantern-77"}'`);
const real = await page.evaluate(() => localStorage.getItem('csrf-token'));
await page.evaluate(() => localStorage.setItem('csrf-token', 'stale-code'));
seen.length = 0;
const retried = await call('post', '/auth/sessions/revoke-others');
const after = await page.evaluate(() => localStorage.getItem('csrf-token'));
ok('a 419 fetched a fresh code and the change went through', retried.status === 200 && retried.data.ended === 1 && after === real && seen.filter((s) => s.startsWith('POST /auth/sessions/revoke-others')).length >= 1, seen.join(' | ') + ' ended=' + retried.data.ended);

// 5. what another website can do with the cookie
const cookieHeader = `tisl_session=${session.value}`;
const forged = execSync(`curl -s -o /dev/null -w '%{http_code}' -X POST ${API}/auth/sessions/revoke-others -H 'Cookie: ${cookieHeader}' -H 'Origin: https://evil.example' -H 'X-CSRF-Token: ${real}' -H 'Accept: application/json'`).toString();
const noCode = execSync(`curl -s -o /dev/null -w '%{http_code}' -X POST ${API}/auth/sessions/revoke-others -H 'Cookie: ${cookieHeader}' -H 'Accept: application/json'`).toString();
const corsHeaders = execSync(`curl -s -D - -o /dev/null ${API}/auth/me -H 'Cookie: ${cookieHeader}' -H 'Origin: https://evil.example' -H 'Accept: application/json'`).toString();
ok('a forged change from another website is refused (even with the right code)', forged === '419', forged);
ok('a change with the cookie but no CSRF code is refused', noCode === '419', noCode);
ok('another website is not allowed to read the answer', !/access-control-allow-origin/i.test(corsHeaders));

// 6. signing out clears the cookie, and the old cookie is dead on the server
const out = await call('post', '/auth/logout');
const left = (await ctx.cookies(API)).find((c) => c.name === 'tisl_session');
ok('logout answered and the browser dropped the cookie', out.status === 200 && !left, JSON.stringify({ status: out.status, left: !!left }));
const dead = execSync(`curl -s -o /dev/null -w '%{http_code}' ${API}/auth/me -H 'Cookie: ${cookieHeader}' -H 'Accept: application/json'`).toString();
ok('the old cookie no longer signs anyone in', dead === '401', dead);
await browser.close();
