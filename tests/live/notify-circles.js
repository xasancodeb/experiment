// Live check against the real database (creates throwaway sway.test.* accounts).
// Run a copy of the site with the real config.js, then: BASE=http://localhost:8766/ node tests/live/notify-circles.js
// Live: Bea mutes one of two circles.
const { chromium } = require('playwright');
const base = (process.env.BASE || 'http://localhost:8766/') + 'index.html', stamp = Date.now().toString(36);
(async () => {
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = [], errs = [], got = [];
  const mk = async (n) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
    p.on('response', (r) => { if (r.url().includes('/functions/v1/notify')) r.text().then((t) => got.push(n + ' ' + t)).catch(() => {}); });
    p.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) r.text().then((t) => errs.push(n + ' HTTP ' + r.status() + ' ' + r.url().split('.co')[1].slice(0, 60) + ' :: ' + t.slice(0, 120))).catch(() => {}); });
    return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 220)); } };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');
  const rest = (P, path, method, body) => P.evaluate(async ([path, method, body]) => { const raw = Object.keys(localStorage).find((k) => /auth-token/.test(k)); const s = JSON.parse(localStorage.getItem(raw));
    const r = await fetch(SWAY_CONFIG.url + path, { method, headers: { apikey: SWAY_CONFIG.key, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined }); return r.status + ' ' + (await r.text()).slice(0, 160); }, [path, method, body]);
  const lastNotify = async (who, re) => { for (let i = 0; i < 20; i++) { const m = got.filter((g) => g.startsWith(who + ' ') && re.test(g)); if (m.length) return m[m.length - 1]; await new Promise((r) => setTimeout(r, 300)); } return got.filter((g) => g.startsWith(who + ' ')).slice(-1)[0] || 'none'; };
  const A = await mk('A'), B = await mk('B'); const inv = {};
  const circleOf = async (nm) => { await tab(A, 'circles'); await A.click('[data-a="newcircle"] >> nth=0'); await A.fill('#cName', nm); await A.click('form[data-f="newcircle"] button');
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=/.test(c.textContent); }, null, { timeout: 20000 }); return A.locator('.invite code').innerText(); };
  const ask = async (q, names) => { got.length = 0; await tab(A, 'ask'); await A.fill('#askq', q); if (await A.locator('[data-a="allc"]').count()) await A.click('[data-a="allc"]');
    for (const n of names) await A.click('[data-a="who"]:has-text("' + n + '")'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 }); await A.click('[data-a="tab"][data-t="mine"]');
    return lastNotify('A', /statuses/); };
  const X = 'Loud ' + stamp, Y = 'Quiet ' + stamp;
  await step('setup: A makes two circles; Bea joins both and gets a stand-in device', async () => {
    await A.goto(base); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await A.fill('#auName', 'Asker A'); await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]');
    await A.waitForSelector('.hello', { timeout: 20000 }); inv.x = await circleOf(X); await A.click('[data-a="back"]'); inv.y = await circleOf(Y);
    await B.goto(inv.x); await B.waitForSelector('.banner', { timeout: 20000 }); await B.fill('#auName', 'Bea'); await B.click('form.authf button[type=submit]'); await B.waitForSelector('.hello', { timeout: 20000 });
    await tab(B, 'circles'); await B.waitForSelector('.ctile:has-text("' + X + '")', { timeout: 20000 });
    await B.goto(inv.y); await B.waitForSelector('.hello', { timeout: 20000 }); await tab(B, 'circles'); await B.waitForSelector('.ctile:has-text("' + Y + '")', { timeout: 20000 }); await B.waitForTimeout(1500);
    log.push('     device: ' + (await rest(B, '/rest/v1/rpc/save_push_sub', 'POST', { ep: 'https://push-test-' + stamp + '.invalid/x', k: 'BAAA', a: 'AAAA' }))); await A.waitForTimeout(1500); });
  await step('Bea mutes "' + Y + '" from its circle page', async () => {
    await tab(B, 'circles'); await B.waitForSelector('.ctile:has-text("' + Y + '")', { timeout: 20000 }); await B.click('.ctile:has-text("' + Y + '")'); await B.click('[data-a="mutec"]');
    log.push('     toast: ' + (await B.locator('.toast').innerText())); await B.screenshot({ path: require('os').tmpdir() + '/m-circle.png' }); await B.click('[data-a="back"]'); await B.waitForTimeout(1500);
    log.push('     tiles: ' + (await B.locator('.ctile:not(.new)').allInnerTexts()).join(' / ').replace(/\n/g, ' · '));
    log.push('     saved: ' + (await rest(B, '/rest/v1/notify_prefs?select=only_from,muted_circles', 'GET'))); await B.screenshot({ path: require('os').tmpdir() + '/m-tiles.png' });
    await tab(B, 'you'); log.push('     You row: ' + (await B.locator('[data-a="notifyppl"]').innerText()).replace(/\n/g, ' · ')); await B.click('[data-a="notifyppl"]'); await B.waitForTimeout(300); await B.screenshot({ path: require('os').tmpdir() + '/m-page.png', fullPage: true }); await B.click('[data-a="back"]'); });
  await step('question to the muted circle: Bea not notified', async () => { const r = await ask('To quiet ' + stamp + '?', [Y]); log.push('     ' + r); if (!/"statuses":\[\]/.test(r)) throw new Error('reached Bea'); });
  await step('question to the other circle: Bea notified', async () => { const r = await ask('To loud ' + stamp + '?', [X]); log.push('     ' + r); if (!/"statuses":\[-?\d+\]/.test(r)) throw new Error('missed Bea'); });
  await step('question to both circles: Bea notified', async () => { const r = await ask('To both ' + stamp + '?', [X, Y]); log.push('     ' + r); if (!/"statuses":\[-?\d+\]/.test(r)) throw new Error('missed Bea'); });
  await step('nudge on the muted circle still reaches Bea', async () => { got.length = 0; await A.click('.mcard:has-text("To quiet") [data-a="nudge"]'); const r = await lastNotify('A', /statuses/); log.push('     ' + r); if (!/"statuses":\[-?\d+\]/.test(r)) throw new Error('nudge blocked'); });
  log.push('     clean up device: ' + (await rest(B, '/rest/v1/push_subs?endpoint=like.*push-test-*', 'DELETE')).slice(0, 4));
  console.log(log.join('\n')); console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'NO ERRORS'); await b.close();
})();
