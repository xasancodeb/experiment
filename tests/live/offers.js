// Live check against the real database (creates throwaway sway.test.* accounts).
// Run a copy of the site with the real config.js, then: BASE=http://localhost:8766/ node tests/live/offers.js
// Live: offers only from the places a group listed, only when the group asks.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const base = (process.env.BASE || 'http://localhost:8766/') + 'index.html', stamp = Date.now().toString(36);
const sql = (q) => execSync('curl -sS -m 30 -X POST https://api.supabase.com/v1/projects/tsxoecarlbekrgjxrjyu/database/query -H "Content-Type: application/json" --data-binary @-', { input: JSON.stringify({ query: q }) }).toString();
(async () => {
  const skipOnb = async (P) => { await P.waitForSelector('.onb, .hello', { timeout: 20000 }); await P.waitForFunction(() => document.querySelector('.onb, .qhero') || (document.querySelector('.hello') && !document.body.innerText.includes('Loading your circles')), null, { timeout: 20000 }); if (await P.locator('.onb').count()) await P.click('[data-a="onbskip"]'); await P.waitForSelector('.hello, .qhero', { timeout: 20000 }); };
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = ['STAMP ' + stamp], errs = [];
  const mk = async (n) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
    p.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) r.text().then((t) => errs.push(n + ' HTTP ' + r.status() + ' ' + r.url().split('.co')[1].slice(0, 50) + ' :: ' + t.slice(0, 110))).catch(() => {}); });
    return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 220)); } };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');
  const rpc = (P, fn, body) => P.evaluate(async ([fn, body]) => { const raw = Object.keys(localStorage).find((k) => /auth-token/.test(k)); const s = JSON.parse(localStorage.getItem(raw));
    const r = await fetch(SWAY_CONFIG.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SWAY_CONFIG.key, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.status + ' ' + (await r.text()).slice(0, 220); }, [fn, body]);
  const O = await mk('Owner'), A = await mk('A'), B = await mk('B'); let invite = '', pollId = '';
  const PLACE = 'Luigi Test ' + stamp;
  await step('business signs up from the business link and saves a go-to offer', async () => {
    await O.goto(base + '?business'); await O.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); log.push('     landing says: ' + (await O.locator('.land .hint').last().innerText()));
    await O.fill('#auName', 'Owner'); await O.fill('#auEmail', 'sway.test.o' + stamp + '@gmail.com'); await O.fill('#auPw', 'testpass-' + stamp); await O.click('form.authf button[type=submit]');
    await O.waitForSelector('#bzName', { timeout: 20000 }); await O.fill('#bzName', PLACE); await O.click('[data-a="bizcat"][data-t="food"]'); await O.fill('#bzCity', 'Lisbon'); await O.click('form[data-f="bizcreate"] button[type=submit]');
    await O.waitForSelector('text=Waiting for approval', { timeout: 15000 }); await O.fill('#ofT', '15% off the bill'); await O.fill('#ofG', '2'); await O.click('form[data-f="offernew"] button[type=submit]');
    await O.waitForSelector('.tog:has-text("15% off the bill")', { timeout: 15000 });
    log.push('     approve: ' + sql("update public.businesses set verified = true where name = '" + PLACE + "' returning verified").trim()); });
  await step('A (preview on) and B: circle; B\'s Ask screen has no offers switch', async () => {
    await A.goto(base + '?offers=on'); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await A.fill('#auName', 'Asker A'); await A.fill('#auEmail', 'sway.test.a' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]'); await skipOnb(A);
    await tab(A, 'circles'); await A.click('.ctile.new'); await A.fill('#cName', 'Outings ' + stamp); await A.click('form[data-f="newcircle"] button');
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=/.test(c.textContent); }, null, { timeout: 20000 }); invite = await A.locator('.invite code').innerText();
    await B.goto(invite); await B.waitForSelector('.banner', { timeout: 20000 }); await B.fill('#auName', 'Bea'); await B.fill('#auName', 'Bea'); await B.click('form.authf button[type=submit]'); await skipOnb(B);
    await tab(B, 'circles'); await B.waitForSelector('.ctile:has-text("Outings")', { timeout: 20000 });
    await tab(B, 'ask'); await B.waitForTimeout(500); if (await B.locator('text=One quick step').count()) { await B.fill('#se', 'sway.test.b' + stamp + '@gmail.com'); await B.fill('#sp', 'testpass-' + stamp); await B.click('form[data-f="saveacct"] button[type=submit]'); await B.waitForSelector('#askq', { timeout: 15000 }); }
    await B.click('[data-a="type"][data-t="Options"]'); const sw = await B.locator('[data-k="wo"]').count(); log.push('     B sees offers switch: ' + sw); if (sw) throw new Error('switch visible by default'); await B.click('[data-a="cancelask"]'); });
  await step('A lists the place + another, switches offers on, asks → the place is invited', async () => {
    await tab(A, 'ask'); await A.fill('#askq', 'Dinner Friday ' + stamp + '?'); await A.click('[data-a="type"][data-t="Options"]');
    log.push('     switch starts: ' + (await A.locator('[data-k="wo"]').getAttribute('aria-checked')));
    await A.fill('[data-o="0"]', 'luigi test ' + stamp); await A.fill('[data-o="1"]', 'Somewhere else'); await A.click('[data-k="wo"]');
    await A.click('[data-a="who"] >> nth=0'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 });
    await A.waitForSelector('.toast:has-text("invited")', { timeout: 10000 }); log.push('     toast: ' + (await A.locator('.toast').innerText()));
    pollId = (await A.locator('.invite code').innerText()).split('q=')[1]; await A.click('[data-a="tab"][data-t="mine"]'); });
  await step('the place sees the request (size and count only) and sends its saved offer', async () => {
    await O.reload(); await skipOnb(O); await tab(O, 'you'); await O.click('[data-a="biz"]'); await O.waitForSelector('text=A group of', { timeout: 20000 });
    log.push('     request: ' + (await O.locator('.mcard').first().innerText()).replace(/\n/g, ' / ')); await O.screenshot({ path: require('os').tmpdir() + '/n-req.png' });
    log.push('     raw request fields: ' + (await rpc(O, 'business_requests', {})));
    await O.click('[data-a="bidsend"]'); await O.waitForSelector('text=You offered', { timeout: 15000 }); });
  await step('B sees the offer on that answer and votes for it', async () => {
    await tab(B, 'vote'); await B.waitForSelector('.big h2:has-text("Dinner Friday")', { timeout: 40000 }); await B.waitForSelector('.big .ofr', { timeout: 30000 });
    log.push('     B sees: ' + (await B.locator('.big .ans button').allInnerTexts()).map((x) => x.replace(/\n/g, ' / ')).join(' || ')); await B.screenshot({ path: require('os').tmpdir() + '/n-card.png' });
    await B.click('.big .ans button >> nth=0'); await B.waitForTimeout(2500); });
  await step('A ends it; both get the same code', async () => {
    await A.click('.mcard:has-text("Dinner Friday") .top'); await A.click('.chips [data-a="close"]'); await A.waitForSelector('#reveal .btn', { timeout: 15000 }); await A.waitForTimeout(900);
    log.push('     reveal: ' + (await A.locator('#reveal').innerText()).replace(/\n/g, ' / ')); await A.click('[data-a="unreveal"]'); await A.waitForTimeout(400);
    await A.click('[data-a="claim"]'); await A.waitForSelector('.unlock .code', { timeout: 15000 }); const cA = await A.locator('.unlock .code').innerText();
    await tab(B, 'vote'); await B.click('.rcard:has-text("Dinner Friday")', { timeout: 30000 }); await B.waitForSelector('#reveal .btn', { timeout: 15000 }); await B.waitForTimeout(900); await B.click('[data-a="unreveal"]'); await B.waitForTimeout(400);
    await B.click('[data-a="claim"]'); await B.waitForSelector('.unlock .code', { timeout: 15000 }); const cB = await B.locator('.unlock .code').innerText(); await B.screenshot({ path: require('os').tmpdir() + '/n-code.png', fullPage: true });
    log.push('     codes: ' + cA + ' / ' + cB); if (cA !== cB) throw new Error('different codes'); global.CODE = cA; });
  await step('the place checks the code: once valid, then refused; totals', async () => {
    await O.fill('#rdc', global.CODE); await O.click('form[data-f="redeem"] button'); await O.waitForSelector('.result', { timeout: 15000 }); log.push('     first: ' + (await O.locator('.result').innerText()));
    await O.waitForTimeout(1200); await O.fill('#rdc', global.CODE); await O.click('form[data-f="redeem"] button'); await O.waitForTimeout(1500); log.push('     again: ' + (await O.locator('.result').innerText()));
    log.push('     totals: ' + (await O.locator('.stat').allInnerTexts()).map((x) => x.replace(/\n/g, ' ')).join(' | ')); await O.screenshot({ path: require('os').tmpdir() + '/n-owner.png', fullPage: true }); });
  await step('privacy and rules', async () => {
    log.push('     place reads the group\'s offers list: ' + (await rpc(O, 'poll_bids', { ids: [pollId] })));
    log.push('     place unlocks the code itself: ' + (await rpc(O, 'claim_offer', { p: pollId })));
    log.push('     Bea invites places on A\'s question: ' + (await rpc(B, 'request_offers', { p: pollId })));
    log.push('     Bea answers a request: ' + (await rpc(B, 'send_bid', { r: '00000000-0000-0000-0000-000000000000', t: 'hack', d: '', g: 1, s: null }))); });
  console.log(log.join('\n')); console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'NO ERRORS'); await b.close();
})();
