// Live check against the real database (creates throwaway sway.test.* accounts).
// Run a copy of the site with the real config.js, then: BASE=http://localhost:8766/ node tests/live/guests.js
// Live: guests vote freely, get a soft prompt, and add an email before asking or creating a circle.
const { chromium } = require('playwright');
const base = (process.env.BASE || 'http://localhost:8766/') + 'index.html', stamp = Date.now().toString(36);
(async () => {
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = [], errs = [];
  const mk = async (n) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
    p.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) r.text().then((t) => errs.push(n + ' HTTP ' + r.status() + ' ' + r.url().split('.co')[1].slice(0, 60) + ' :: ' + t.slice(0, 120))).catch(() => {}); });
    return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 220)); } };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');
  const A = await mk('A'), B = await mk('B'), C = await mk('C'); let invite = '';
  await step('setup: A makes a circle and asks; Bea joins as a guest', async () => {
    await A.goto(base); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await A.fill('#auName', 'Asker A'); await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]');
    await A.waitForSelector('text=Start with a circle', { timeout: 20000 }); await A.click('[data-a="newcircle"]'); await A.fill('#cName', 'Guests ' + stamp); await A.click('form[data-f="newcircle"] button');
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=/.test(c.textContent); }, null, { timeout: 20000 }); invite = await A.locator('.invite code').innerText();
    await B.goto(invite); await B.waitForSelector('.banner', { timeout: 20000 }); await B.fill('#auName', 'Bea'); await B.click('form.authf button[type=submit]'); await B.waitForSelector('.hello', { timeout: 20000 });
    await tab(B, 'circles'); await B.waitForSelector('.ctile:has-text("Guests")', { timeout: 20000 });
    await A.waitForTimeout(1500); await tab(A, 'ask'); await A.fill('#askq', 'Guest test ' + stamp + '?'); await A.click('[data-a="who"] >> nth=0'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 }); });
  await step('Bea has no prompt before voting; votes; then sees "Keep your account"', async () => {
    await tab(B, 'vote'); await B.waitForSelector('.big h2:has-text("Guest test")', { timeout: 40000 });
    log.push('     card before voting: ' + (await B.locator('.keep').count()));
    await B.click('.big .ans button >> nth=0'); await B.waitForSelector('.keep', { timeout: 15000 }); await B.screenshot({ path: require('os').tmpdir() + '/g-keep.png' });
    await B.click('[data-a="keeplater"]'); log.push('     after Later: ' + (await B.locator('.keep').count())); });
  await step('Bea taps Ask → "One quick step" → saves → lands on the Ask screen', async () => {
    await tab(B, 'ask'); await B.waitForSelector('text=One quick step'); log.push('     ' + (await B.locator('.hint').first().innerText())); await B.screenshot({ path: require('os').tmpdir() + '/g-gate.png' });
    await B.fill('#se', 'sway.test.b' + stamp + '@gmail.com'); await B.fill('#sp', 'testpass-' + stamp); await B.click('form[data-f="saveacct"] button[type=submit]');
    await B.waitForSelector('#askq', { timeout: 15000 }); log.push('     toast: ' + (await B.locator('.toast').innerText()));
    await B.fill('#askq', 'From Bea ' + stamp + '?'); await B.click('[data-a="who"] >> nth=0'); await B.click('[data-a="post"]'); await B.waitForSelector('text=Your question is live', { timeout: 20000 });
    await tab(B, 'you'); log.push('     You says: ' + (await B.locator('.me span').innerText())); });
  await step('Cal (guest) taps + New circle → saves → creates the circle', async () => {
    await C.goto(invite); await C.waitForSelector('.banner', { timeout: 20000 }); await C.fill('#auName', 'Cal'); await C.click('form.authf button[type=submit]'); await C.waitForSelector('.hello', { timeout: 20000 });
    await tab(C, 'circles'); await C.click('.ctile.new'); await C.waitForSelector('text=One quick step');
    await C.fill('#se', 'sway.test.c' + stamp + '@gmail.com'); await C.fill('#sp', 'testpass-' + stamp); await C.click('form[data-f="saveacct"] button[type=submit]');
    await C.waitForSelector('#cName', { timeout: 15000 }); await C.fill('#cName', 'Cal crew ' + stamp); await C.click('form[data-f="newcircle"] button'); await C.waitForSelector('.invite code', { timeout: 20000 }); });
  await step('Bea logs out and back in with her new email; still in the circle', async () => {
    await B.click('[data-a="logout"]'); await B.waitForSelector('[data-auth="login"]', { timeout: 15000 }); await B.click('[data-auth="login"]');
    await B.fill('#auEmail', 'sway.test.b' + stamp + '@gmail.com'); await B.fill('#auPw', 'testpass-' + stamp); await B.click('form.authf button[type=submit]'); await B.waitForSelector('.hello', { timeout: 20000 });
    await tab(B, 'circles'); await B.waitForSelector('.ctile:has-text("Guests")', { timeout: 20000 }); });
  console.log(log.join('\n')); console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'NO ERRORS'); await b.close();
})();
