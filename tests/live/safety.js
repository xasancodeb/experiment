// Live checks (real database): report, block, usage numbers, error log, delete account.
// Creates throwaway accounts named sway.test.*. Needs a running copy of the site with the real
// config.js, and an access token for api.supabase.com to read the owner-only tables:
//   BASE=http://localhost:8766/ SUPABASE_REF=... node tests/live/safety.js
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const BASE = process.env.BASE || 'http://localhost:8766/', REF = process.env.SUPABASE_REF || 'tsxoecarlbekrgjxrjyu', stamp = Date.now().toString(36);
const sql = (q) => JSON.parse(execSync('curl -sS -m 30 -X POST https://api.supabase.com/v1/projects/' + REF + '/database/query -H "Content-Type: application/json" --data-binary @-', { input: JSON.stringify({ query: q }) }).toString());
(async () => {
  const opts = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); opts.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(opts);
  const log = [], errs = []; let failed = 0;
  const mk = async (n) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', (e) => { if (!/test-error-/.test(e.message)) errs.push(n + ': ' + e.message); }); return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { failed++; log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 220)); } };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');
  const A = await mk('A'), B = await mk('B'); let invite = '', aId = '', bId = '';
  const uid = (P) => P.evaluate(() => { const raw = Object.keys(localStorage).find((k) => /auth-token/.test(k)); return JSON.parse(localStorage.getItem(raw)).user.id; });
  await step('setup: A signs up, makes a circle, asks; Bea joins as a guest and comments', async () => {
    await A.goto(BASE + 'index.html'); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await A.fill('#auName', 'Asker A'); await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]');
    await A.waitForSelector('text=Start with a circle', { timeout: 20000 }); await A.click('[data-a="newcircle"]'); await A.fill('#cName', 'Safety ' + stamp); await A.click('form[data-f="newcircle"] button');
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=/.test(c.textContent); }, null, { timeout: 20000 }); invite = await A.locator('.invite code').innerText();
    await B.goto(invite); await B.waitForSelector('.banner', { timeout: 20000 }); await B.fill('#auName', 'Bea'); await B.click('form.authf button[type=submit]'); await B.waitForSelector('.hello', { timeout: 20000 });
    await tab(B, 'circles'); await B.waitForSelector('.ctile:has-text("Safety")', { timeout: 20000 }); aId = await uid(A); bId = await uid(B);
    await A.waitForTimeout(1500); await tab(A, 'ask'); await A.fill('#askq', 'Safety test ' + stamp + '?'); await A.click('[data-a="who"] >> nth=0'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 });
    await tab(B, 'vote'); await B.waitForSelector('.big h2:has-text("Safety test")', { timeout: 40000 }); await B.click('.big .go'); await B.fill('#cm', 'rude comment ' + stamp); await B.press('#cm', 'Enter'); await B.waitForTimeout(2000); });
  await step('A reports Bea\'s comment and blocks her: her comments disappear', async () => {
    await A.click('[data-a="tab"][data-t="mine"]'); await A.click('.mcard:has-text("Safety test") .top'); await A.waitForSelector('text=rude comment ' + stamp, { timeout: 40000 });
    await A.click('.replink'); await A.waitForSelector('text=Report comment'); await A.click('[data-a="repreason"][data-t="Spam or scam"]'); await A.fill('#repD', 'test report'); await A.click('[data-a="repblock"]');
    await A.click('[data-a="repsend"]'); await A.waitForSelector('.toast:has-text("Thanks")', { timeout: 15000 }); log.push('     ' + (await A.locator('.toast').innerText()));
    await A.waitForTimeout(2500); if (await A.locator('text=rude comment ' + stamp).count()) throw new Error('blocked comment still shown');
    await tab(A, 'you'); await A.click('[data-a="blocked"]'); log.push('     blocked list: ' + (await A.locator('.person b').allInnerTexts()).join(', '));
    await A.click('[data-a="unblock"]'); await A.click('[data-a="back"]'); });
  await step('after unblocking, her comment is back', async () => { await A.click('[data-a="tab"][data-t="mine"]'); await A.click('.mcard:has-text("Safety test") .top'); await A.waitForSelector('text=rude comment ' + stamp, { timeout: 30000 }); await A.click('[data-a="back"]'); });
  await step('Bea reports the question', async () => { await B.click('[data-a="back"]').catch(() => {}); await tab(B, 'vote'); await B.click('.big .go'); await B.click('[data-a="report"][data-k="poll"]'); await B.click('[data-a="repreason"][data-t="Something else"]'); await B.click('[data-a="repsend"]'); await B.waitForSelector('.toast:has-text("Thanks")', { timeout: 15000 }); });
  await step('the owner sees both reports', async () => { const r = sql("select reason, details, (about_user is not null) as about_someone from public.reports where reporter in ('" + aId + "','" + bId + "') order by created_at"); log.push('     ' + JSON.stringify(r)); if (r.length !== 2) throw new Error('expected 2 reports'); });
  await step('usage numbers were recorded', async () => { await A.waitForTimeout(1500); const r = sql("select name, count(*) n from public.events where user_id in ('" + aId + "','" + bId + "') group by name order by name"); log.push('     ' + r.map((x) => x.name + '×' + x.n).join(' ')); for (const k of ['signup', 'guest_join', 'circle_create', 'ask', 'comment', 'report', 'block']) if (!r.some((x) => x.name === k)) throw new Error('missing ' + k); });
  await step('errors are logged', async () => { await A.evaluate((s) => setTimeout(() => { throw new Error('test-error-' + s); }), stamp); await A.waitForTimeout(2500); const r = sql("select message from public.client_errors where message like '%test-error-" + stamp + "%'"); log.push('     ' + JSON.stringify(r)); if (!r.length) throw new Error('not logged'); });
  await step('A deletes their account: the circle passes to Bea', async () => {
    await tab(A, 'you'); await A.click('[data-a="delacctpage"]'); await A.click('[data-a="delacct"]'); await A.click('[data-a="delacct"]'); await A.waitForSelector('text=Your account was deleted.', { timeout: 20000 });
    const u = sql("select count(*) n from auth.users where id = '" + aId + "'"); const c = sql("select (owner = '" + bId + "') as bea_owns from public.circles where name = 'Safety " + stamp + "'");
    log.push('     A still exists: ' + u[0].n + ' | circle: ' + JSON.stringify(c)); if (u[0].n !== 0 || !c.length || !c[0].bea_owns) throw new Error('not handed over'); });
  await step('Bea (guest) deletes her account: the empty circle goes too', async () => {
    await B.reload(); await B.waitForSelector('.hello', { timeout: 20000 }); await tab(B, 'you'); await B.click('[data-a="delacctpage"]'); await B.click('[data-a="delacct"]'); await B.click('[data-a="delacct"]'); await B.waitForSelector('text=Your account was deleted.', { timeout: 20000 });
    const c = sql("select count(*) n from public.circles where name = 'Safety " + stamp + "'"); const u = sql("select count(*) n from auth.users where id = '" + bId + "'"); log.push('     circle left: ' + c[0].n + ' | Bea exists: ' + u[0].n); if (c[0].n !== 0 || u[0].n !== 0) throw new Error('left behind'); });
  console.log(log.join('\n')); if (errs.length) { failed++; console.log('ERRORS\n' + [...new Set(errs)].join('\n')); } console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); await b.close(); process.exit(failed ? 1 : 0);
})();
