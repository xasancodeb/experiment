# Tests

**Automatic (no database):** `tests/demo.js` runs the app in demo mode. It checks the main
flows, every text box above a phone keyboard, the legal and business pages, and taps randomly
for crashes. GitHub runs it on every push (`.github/workflows/test.yml`); a red mark on a commit
means something broke.

Run it yourself:

```
npm install && npx playwright install chromium
echo 'window.SWAY_CONFIG={};' > /tmp/config.js   # demo config, don't overwrite the real one
python3 -m http.server 8080                         # in a copy of the repo with that config
BASE=http://localhost:8080/ npm test
```

**Live (real database):** `tests/live/*.js` use real accounts against Supabase: three people
voting, offers, the business page, guests, notification choices, softer notifications, and
report/block/delete account. They create throwaway accounts named `sway.test.*` (remove them
with `supabase/maintenance.sql`), and some read owner-only tables through the Supabase
management API, so they need an access token. Serve the site with the real `config.js`, then
`BASE=http://localhost:8766/ node tests/live/core.js`.
