// Live check against the real database (creates throwaway sway.test.* accounts).
// Run a copy of the site with the real config.js, then: BASE=http://localhost:8766/ node tests/live/notify-soft.js
// Live: the softer notification rules.
const { chromium } = require('playwright');
const base = (process.env.BASE || 'http://localhost:8766/') + 'index.html', stamp = Date.now().toString(36);
(async () => {
  const skipOnb = async (P) => { await P.waitForSelector('.onb, .hello', { timeout: 20000 }); await P.waitForFunction(() => document.querySelector('.onb, .qhero') || (document.querySelector('.hello') && !document.body.innerText.includes('Loading your circles')), null, { timeout: 20000 }); if (await P.locator('.onb').count()) await P.click('[data-a="onbskip"]'); await P.waitForSelector('.hello, .qhero', { timeout: 20000 }); };
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = ['STAMP ' + stamp], errs = [], got = [];
  const mk = async (n) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
    p.on('response', (r) => { if (r.url().includes('/functions/v1/notify')) r.text().then((t) => got.push(n + ' ' + t)).catch(() => {}); });
    return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 220)); } };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');
  const rest = (P, path, method, body) => P.evaluate(async ([path, method, body]) => { const raw = Object.keys(localStorage).find((k) => /auth-token/.test(k)); const s = JSON.parse(localStorage.getItem(raw));
    const r = await fetch(SWAY_CONFIG.url + path, { method, headers: { apikey: SWAY_CONFIG.key, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.status; }, [path, method, body]);
  const wait = async (who, re) => { for (let i = 0; i < 25; i++) { const m = got.filter((g) => g.startsWith(who + ' ') && re.test(g)); if (m.length) return m[m.length - 1]; await new Promise((r) => setTimeout(r, 300)); } return 'none'; };
  const A = await mk('A'), B = await mk('B'), C = await mk('C'), D = await mk('D'); let invite = '';
  const ask = async (q, early) => { await tab(A, 'ask'); await A.fill('#askq', q); if (early) await A.click('[data-a="dtog"][data-k="early"]'); await A.click('[data-a="who"] >> nth=0'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 }); await A.click('[data-a="tab"][data-t="mine"]'); };
  const vote = async (P, q, i) => { got.length = 0; await tab(P, 'vote'); await P.waitForSelector('.big h2:has-text("' + q + '")', { timeout: 40000 }); await P.click('.big .ans button >> nth=' + (i || 0)); };
  await step('setup: A, Bea, Cal, Dee; Bea and Cal get stand-in devices', async () => {
    await A.goto(base); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await A.fill('#auName', 'Asker A'); await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]');
    await skipOnb(A); await A.waitForSelector('text=Start with a circle', { timeout: 20000 }); await A.click('[data-a="newcircle"]'); await A.fill('#cName', 'Soft ' + stamp); await A.click('form[data-f="newcircle"] button');
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=/.test(c.textContent); }, null, { timeout: 20000 }); invite = await A.locator('.invite code').innerText();
    for (const [P, n] of [[B, 'Bea'], [C, 'Cal'], [D, 'Dee']]) { await P.goto(invite); await P.waitForSelector('.banner', { timeout: 20000 }); await P.fill('#auName', n); await P.click('form.authf button[type=submit]'); await skipOnb(P); await tab(P, 'circles'); await P.waitForSelector('.ctile:has-text("Soft")', { timeout: 20000 }); }
    for (const [P, n] of [[B, 'b'], [C, 'c']]) log.push('     device ' + n + ': ' + (await rest(P, '/rest/v1/rpc/save_push_sub', 'POST', { ep: 'https://push-test-' + n + stamp + '.invalid/x', k: 'BAAA', a: 'AAAA' })));
    await A.waitForTimeout(1500); });
  await step('first vote → asker told at once; second vote right after → held for the roundup', async () => {
    await ask('Soft one ' + stamp + '?'); await vote(B, 'Soft one'); log.push('     Bea votes → ' + (await wait('B', /asker|held|skipped/)));
    await vote(C, 'Soft one'); const r = await wait('C', /asker|held|skipped/); log.push('     Cal votes → ' + r); if (!/held/.test(r)) throw new Error('not held'); });
  await step('verdict reaches the asker and voters only (Bea voted, Cal did not)', async () => {
    await ask('Soft two ' + stamp + '?'); await vote(B, 'Soft two'); await wait('B', /asker|held/); got.length = 0;
    await A.waitForSelector('.mcard:has-text("Soft two") .top'); await A.click('.mcard:has-text("Soft two") .top'); await A.click('.chips [data-a="close"]');
    const r = await wait('A', /statuses|skipped/); log.push('     verdict → ' + r); await A.click('[data-a="unreveal"]').catch(() => {});
    if (!/"statuses":\[-?\d+\]/.test(r)) throw new Error('expected exactly one device (Bea)'); });
  await step('end-once-everyone-voted: the last vote sends no "everyone voted", only the verdict later', async () => {
    await ask('Soft three ' + stamp + '?', true); await vote(B, 'Soft three'); await wait('B', /asker|held/); await vote(C, 'Soft three'); await wait('C', /asker|held/);
    await vote(D, 'Soft one'); await wait('D', /asker|held|skipped/); await D.waitForTimeout(1200);
    await vote(D, 'Soft three'); const r = await wait('D', /verdict|asker|held/); log.push('     Dee (last) votes → ' + r); if (!/"verdict":"scheduled"/.test(r) || /asker/.test(r)) throw new Error('double ping'); });
  console.log(log.join('\n')); console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'NO ERRORS');
  for (const P of [B, C]) await rest(P, '/rest/v1/push_subs?endpoint=like.*push-test-*', 'DELETE');
  await b.close();
})();
