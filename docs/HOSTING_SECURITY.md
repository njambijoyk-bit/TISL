# Hosting TISL safely

What to set where the website and the server live. Nothing here changes how TISL works; it closes doors a browser or a stranger could otherwise use.
Two places matter: **the website** (the files built from `frontend/`) and **the server** (Laravel in `backend/`). Both must be reached over **https** only.

**The website and the server must share one domain.** Since sign-in moved into a protected cookie (the page can no longer read it, so a script that gets onto the page can no longer steal it), a browser only sends that cookie
between addresses of the same domain: the website at `targetisl.co.ke` and the server at `api.targetisl.co.ke` work; the server on `something.up.railway.app` does not (nobody could stay signed in).
So point `api.targetisl.co.ke` at the server, and set (before `npm run build`) `VITE_API_URL=https://api.targetisl.co.ke/api`, and on the server `APP_URL=https://api.targetisl.co.ke`, `FRONTEND_URL=https://targetisl.co.ke`.
`php artisan security:check` tells you if the two are not on one domain. The first time this goes live, everybody who was signed in is signed out once and signs in again.

When you are done, on the server run:

```
php artisan security:check
```

It reads the settings, the database and the accounts and prints OK / WARN / FAIL with what to do about each one. Run it after every change to the server's settings.

## 1. The server (`backend/.env`)

| Setting | Live value | Why |
|---|---|---|
| `APP_ENV` | `production` | |
| `APP_DEBUG` | `false` | `true` shows keys, passwords and code to anyone who causes an error |
| `APP_KEY` | set once, never changed | everything encrypted or signed (sign-in links, tickets, QR codes) depends on it; losing it breaks them all |
| `APP_URL` | `https://<the API address>` | links in emails and PDFs |
| `FRONTEND_URL` | `https://<the website address>` | the buttons in emails ("This was not me", "View my tickets") |
| `TRUSTED_PROXIES` | the address of the load balancer / CDN / host proxy, or `*` if you cannot know it | behind a proxy every visitor looks like one address, so the sign-in speed limits count everyone together. On Railway, Cloudflare or nginx-in-front use `*` |
| `SESSION_SECURE_COOKIE` | `true` | cookies only over https |
| `SECURITY_COOKIE_SECURE` | leave empty; `true` if the server sits behind a proxy it does not trust | the sign-in cookie is marked Secure and host-only (`__Host-`) whenever the address is https |
| `SECURITY_COOKIE_SESSIONS` | leave empty (on); `false` only to go back to handing the sign-in code to the page | the safe default is the protected cookie |
| `CACHE_STORE` | `database`, `file` or `redis`, **never** `array` | the waits after wrong passwords and the speed limits live in the cache |
| `QUEUE_CONNECTION` | `database` (or redis) **and a worker running** | emails are sent in the background, not while someone waits |
| `MAIL_MAILER` | `smtp` (or your provider), not `log` | with `log`, password reset links never leave the server |
| `SECURITY_*` | leave as they are | every number in `config/security.php` can be changed here: idle times, waits, password length, new-sign-in email, headers |

Also: the cron entry `* * * * * php /path/to/backend/artisan schedule:run` must exist (backups, reminders, `security:prune`), and
the web server must serve only `backend/public/`, never the project folder (so `.env` can not be downloaded). The database user should be able to do
only what TISL does (no `DROP DATABASE`, no access to other databases).

`config/cors.php` lists the websites allowed to call the API. For the live server it should name only the real website(s)
(today it also lists `localhost` addresses for development; `security:check` will say so).

The API already sends, on every answer: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that switches off camera, microphone and location for it,
`Strict-Transport-Security` (over https), and, on JSON answers, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and `X-Frame-Options: DENY`.
Sign-in and security answers are never cached. Files the API hands out (a PDF, a ticket, a document preview) can still be shown in a frame on the website.

## 2. The website (the built files in `frontend/dist`)

These headers must be added by whatever serves the files. They tell the browser what the page may and may not do.

| Header | Value | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | the browser never tries plain http again |
| `X-Content-Type-Options` | `nosniff` | |
| `X-Frame-Options` | `DENY` | nobody can put the site in a frame to trick a click |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(self), payment=()` | the code scanner and driver app need the camera and location, nothing else does |

**Netlify / Cloudflare Pages**: nothing to do; `frontend/public/_headers` is already in the build and carries exactly these.

**nginx** (inside the `server { ... }` that serves the website):

```
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(self), payment=()" always;
location / { try_files $uri /index.html; }                    # the app has its own page routes
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
```

**Apache** (`.htaccess` next to `index.html`, with `mod_headers` on):

```
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "camera=(self), microphone=(), geolocation=(self), payment=()"
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [L]
```

Set `VITE_API_URL` to the API's https address **before** `npm run build` (the website is built with it inside).

### Content-Security-Policy (the strongest one, try it carefully)

A Content-Security-Policy lists where a page may load scripts, styles, images and frames from, so an injected script can not phone home.
TISL is not ready to *enforce* one yet: the delivery maps are built inside frames (`srcdoc`) that run an inline script, and a few pages pull a map library from `cdnjs.cloudflare.com`.
So start in **report-only** mode: the browser only writes warnings in its console (F12) and blocks nothing.

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  script-src 'self' https://cdnjs.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob: https:;
  media-src 'self' blob: https:;
  connect-src 'self' https://<the API address> https://nominatim.openstreetmap.org;
  frame-src https://www.openstreetmap.org https://www.youtube.com https://player.vimeo.com https://www.facebook.com https://www.tiktok.com;
  worker-src 'self' blob:;
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Browse the whole site (shop, checkout, events, admin, driver app) and read the warnings. Anything that is yours and legitimate goes into the list; when the console stays quiet for a week, rename the header to `Content-Security-Policy`.
The map frames will keep warning until they are rebuilt; leave `script-src` report-only until then.

## 3. The order to do it in

1. `php artisan security:check` on the server; fix every FAIL and WARN it prints.
2. Run `database/sql/123_security_core.sql` (and `118`–`122` if not yet run) in Workbench, then `php artisan access:seed`.
3. `php artisan security:check --fix` once: it finds accounts still on a password the old imports gave out and makes each choose a new one at their next sign-in.
4. Put the website headers in place (section 2); open the site and check nothing broke.
5. Try the Content-Security-Policy in report-only mode.

## 4. Passkeys, recovery codes and the passkey rule

Run these in Workbench, in order, each on its own, then `php artisan access:seed` (it adds the permission to change the sign-in rules, for the owner only):

| Script | What it adds |
|---|---|
| `124_passkeys.sql` | passkeys ("My devices") and what strength each sign-in reached |
| `125_security_policy.sql` | the owner's settings for the passkey rule |
| `126_recovery_codes.sql` | recovery codes, the way back from a lost phone |
| `127_seal_phrase.sql` | the seal phrase on the sign-in page (optional) |
| `128_step_up.sql` | "one more step" questions for sensitive actions (payment keys, roles, payroll, restore, exports, voucher cancel, staff accounts, bank details) |

Server settings (the project has no `.env` file of its own, so these go wherever the other settings live):

| Setting | Meaning |
|---|---|
| `PASSKEY_RP_ID=targetisl.co.ke` | The domain passkeys are made for. **Never change it after anyone has added a passkey.** |
| `PASSKEY_ORIGINS=https://targetisl.co.ke,https://www.targetisl.co.ke` | The exact website addresses that may ask for a passkey (https only; subdomains are not accepted unless listed). |
| `SECURITY_PASSKEY_MODE=off` | The starting value of the passkey rule: `off`, `log` or `enforce`. Once the owner chooses on the Passkey rule page, that choice wins. |
| `SECURITY_PASSKEY_ENFORCE_FROM=2026-12-01` | The starting value of the date from which the rule holds people back. |
| `SECURITY_RISK_MODE=off` | The starting value of the unusual-sign-in check: `off`, `log` (only written down) or `enforce`. |
| `SECURITY_RISK_NOTICE_AT=1`, `SECURITY_RISK_STRONGER_AT=2` | How many signals tell the person (1) and hold the sign-in until a passkey confirms it (2). New browser, new network, an odd hour = 1 each; a new country, or several wrong passwords just before = 2 each. |
| `SECURITY_STEPUP_NEW_PASSKEY_HOURS=24` | A passkey added more recently than this can not approve a critical action (someone who just got into an account adds their own device first). |
| `SECURITY_ALERTS_EMAIL=false` | Stops the emails about passkeys and recovery codes being added, removed or used. |
| `SECURITY_POLICY_OFF=true` | **Emergency only.** Puts the whole passkey rule, the sensitive-action questions and the unusual-sign-in check to sleep whatever the page says (for a lock-out). Take it out again afterwards; `security:check` warns while it is set. |

### Turning the passkey rule on, safely

1. Run the scripts above and `php artisan security:check`.
2. Everyone the rule is for adds a passkey (they are offered one when they sign in; it is under their profile, "My devices") and the owner makes recovery codes and keeps them somewhere safe, away from the phone.
3. Admin → Security → **Passkey rule**: choose **Test** and a date. Nobody is stopped; each sign-in that would have been held is written to the sign-in log. Look at who is still to add one.
4. Switch it to **On**. The page refuses if it would lock you out, or if you have no recovery codes yet, and asks you to confirm while others still have to add theirs. From the date, a person the rule is for who has not done what it asks can only add or use a passkey.
5. If something goes wrong and nobody can get in: set `SECURITY_POLICY_OFF=true` in the server settings, reload, sign in, fix it, take the setting out.
