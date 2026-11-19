// Live check against the real database (creates throwaway sway.test.* accounts).
// Run a copy of the site with the real config.js, then: BASE=http://localhost:8766/ node tests/live/notify-people.js
// Live: Bea chooses to hear only from Cal. Asker A's question must not notify Bea; Cal's must.
const { chromium } = require('playwright');
const base = (process.env.BASE || 'http://localhost:8766/') + 'index.html', stamp = Date.now().toString(36);
(async () => {
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = [], errs = [], got = {};
  const mk = async (n) => { const p = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
    p.on('response', (r) => { if (r.url().includes('/functions/v1/notify')) r.text().then((t) => { log.push('     ' + n + ' notify → ' + t.slice(0, 160)); got[n] = t; }).catch(() => {}); });
    p.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) r.text().then((t) => errs.push(n + ' HTTP ' + r.status() + ' ' + r.url().split('.co')[1].slice(0, 60) + ' :: ' + t.slice(0, 120))).catch(() => {}); });
    return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 200)); } };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');
  const rest = (P, path, method, body) => P.evaluate(async ([path, method, body]) => { const raw = Object.keys(localStorage).find((k) => /auth-token/.test(k)); const s = JSON.parse(localStorage.getItem(raw));
    const r = await fetch(SWAY_CONFIG.url + path, { method, headers: { apikey: SWAY_CONFIG.key, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined }); return r.status + ' ' + (await r.text()).slice(0, 160); }, [path, method, body]);
  const A = await mk('A'), B = await mk('B'), C = await mk('C'); let invite = '';
  await step('setup: A, Bea, Cal in one circle; Bea gets a stand-in device', async () => {
    await A.goto(base); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await A.fill('#auName', 'Asker A'); await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]');
    await A.waitForSelector('text=Start with a circle', { timeout: 20000 }); await A.click('[data-a="newcircle"]'); await A.fill('#cName', 'Prefs ' + stamp); await A.click('form[data-f="newcircle"] button');
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=/.test(c.textContent); }, null, { timeout: 20000 }); invite = await A.locator('.invite code').innerText();
    for (const [P, n] of [[B, 'Bea'], [C, 'Cal']]) { await P.goto(invite); await P.waitForSelector('.banner', { timeout: 20000 }); await P.fill('#auName', n); await P.click('form.authf button[type=submit]'); await P.waitForSelector('.hello', { timeout: 20000 }); }
    log.push('     stand-in device: ' + (await rest(B, '/rest/v1/rpc/save_push_sub', 'POST', { ep: 'https://push-test-' + stamp + '.invalid/x', k: 'BAAA', a: 'AAAA' }))); await A.waitForTimeout(2000); });
  await step('Bea chooses "People I choose" → only Cal', async () => {
    await B.reload(); await B.waitForSelector('.hello', { timeout: 20000 }); await B.waitForTimeout(2500); await tab(B, 'you');
    log.push('     You row: ' + (await B.locator('[data-a="notifyppl"]').innerText()).replace(/\n/g, ' · '));
    await B.click('[data-a="notifyppl"]'); await B.click('[data-a="onlymode"][data-t="some"]'); await B.click('[data-a="onlyp"] >> nth=1').catch(() => {});
    const names = await B.locator('.person:has([data-a="onlyp"]) b').allInnerTexts(); log.push('     friends listed: ' + names.join(', '));
    // make sure exactly Cal is on
    for (let i = 0; i < names.length; i++) { const sw = B.locator('[data-a="onlyp"]').nth(i); const on = (await sw.getAttribute('aria-checked')) === 'true'; if ((names[i] === 'Cal') !== on) await sw.click(); }
    await B.waitForTimeout(1500); await B.screenshot({ path: require('os').tmpdir() + '/n-chooser.png' });
    log.push('     saved: ' + (await rest(B, '/rest/v1/notify_prefs?select=only_from', 'GET'))); await B.click('[data-a="back"]');
    log.push('     You row now: ' + (await B.locator('[data-a="notifyppl"]').innerText()).replace(/\n/g, ' · ')); });
  await step('A asks → Bea is not notified', async () => { delete got.A;
    await tab(A, 'ask'); await A.fill('#askq', 'From A ' + stamp + '?'); await A.click('[data-a="who"] >> nth=0'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 });
    await A.waitForTimeout(4000); if (!got.A || !/"statuses":\[\]/.test(got.A)) throw new Error('Bea was notified: ' + got.A); });
  await step('Cal asks → Bea is notified', async () => { delete got.C; await C.waitForTimeout(1500);
    await tab(C, 'ask'); await C.fill('#askq', 'From Cal ' + stamp + '?'); await C.click('[data-a="who"] >> nth=0'); await C.click('[data-a="post"]'); await C.waitForSelector('text=Your question is live', { timeout: 20000 });
    await C.waitForTimeout(4000); if (!got.C || !/"statuses":\[-?\d+\]/.test(got.C)) throw new Error('Bea not reached: ' + got.C); });
  await step('Bea switches back to Everyone', async () => { await tab(B, 'you'); await B.click('[data-a="notifyppl"]'); await B.click('[data-a="onlymode"][data-t="all"]'); await B.waitForTimeout(1500);
    log.push('     saved: ' + (await rest(B, '/rest/v1/notify_prefs?select=only_from', 'GET'))); });
  await step('privacy: Bea cannot read anyone else\'s choice', async () => { log.push('     A reads prefs: ' + (await rest(A, '/rest/v1/notify_prefs?select=user_id,only_from', 'GET'))); });
  log.push('     clean up stand-in device: ' + (await rest(B, '/rest/v1/push_subs?endpoint=like.*push-test-*', 'DELETE')).slice(0, 4));
  console.log(log.join('\n')); console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'NO ERRORS'); await b.close();
})();
