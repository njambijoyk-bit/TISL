# Browser checks (end to end)

These drive a real Chromium against the real Laravel server and the real Vite site, on a throw-away sqlite database, so cookies, CORS and the browser's own rules are tested for real
(unit tests can not do that).

```
cd backend
php tests/e2e/boot.php /tmp/tisl-e2e.sqlite     # makes the database and two people (password purple-giraffe-lantern-77)
tests/e2e/serve.sh                              # API on http://localhost:8000   (stop: kill $(cat /tmp/tisl-e2e.pid))
cd ../frontend
npx vite --port 5177 --strictPort &             # the website on http://localhost:5177
node e2e/cookie-session.mjs                     # prints PASS / FAIL lines
node e2e/passkeys.mjs                           # passkeys with Chromium's pretend fingerprint reader (it remakes the database itself, so run it as often as you like)
node e2e/passkey-policy.mjs                     # the passkey rule for staff: the reminder, the "one more step" screen, the owner needing two devices, a lost device and a recovery code
node e2e/recovery-seal.mjs                      # recovery codes (make, save, use) and the seal phrase on the sign-in page
node e2e/passkey-rule.mjs                       # the owner's page for the passkey rule
node e2e/step-up.mjs                            # "is this what you meant?": a sensitive action held, the facts, the reason, the passkey, the action finishing by itself
node e2e/risk.mjs                               # a sign-in that does not look like the person: let in (test mode), held until the passkey confirms it (on), never for a passkey sign-in
node e2e/actions.mjs                            # the owner's page for sensitive actions and the sign-in check, and the real payment keys screen asking once (passkey) instead of the password
```

Needs Playwright (`PLAYWRIGHT_MODULE_DIR` points at the folder holding it, default `/opt/node22/lib/node_modules/`) and a Chromium (`CHROME`).
Screenshots go to `SHOTS` (default `/tmp/`).

## What `passkeys.mjs` covers

Sign-in offer after a password sign-in, adding the first passkey (and asking for the password when the sign-in is no longer fresh), "My devices" (add a second on another device after the page proves it by itself,
rename, replace a lost key and keep the story, "I lost this device"), signing in with the button and from the email field's list, the policy box that must be ticked first, "Not now" being remembered,
a copied key being refused and switched off, and what the page shows then.

Two things to know about it:
- The real profile pages need a much bigger database than this check builds, so "My devices" is shown on its own by `e2e/harness.html` (served by the dev server only, never part of the build), signed in as the same person.
- The browser's own list under the email field can not be clicked by a test; the check stands in for the person picking from it (`picksFromList`). A device that already holds a passkey for the account refuses to make a second one,
  so each new passkey in the check goes onto a new pretend device.

`passkey-policy.mjs` writes the rule's settings straight into the throw-away database (the way the owner's page will), then signs in as the admin, the owner, a logistics user and a customer
(all in `backend/tests/Support/E2eSeed.php`). `recovery-seal.mjs` uses the same pretend device for a lost phone: a second browser window with nothing on it, the password, and one of the codes.
`lib.mjs` holds what the checks share (the browser, the database reset, the pretend devices).
