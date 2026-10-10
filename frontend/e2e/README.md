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
```

Needs Playwright (`PLAYWRIGHT_MODULE_DIR` points at the folder holding it, default `/opt/node22/lib/node_modules/`) and a Chromium (`CHROME`).
Screenshots go to `SHOTS` (default `/tmp/`).
