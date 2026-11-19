// Live check against the real database (creates throwaway sway.test.* accounts).
// Run a copy of the site with the real config.js, then: BASE=http://localhost:8766/ node tests/live/business-page.js
// Live: the business page — apply with a new account, come back, open the app, apply as an existing user.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const base = process.env.BASE || 'http://localhost:8766/', stamp = Date.now().toString(36);
const sql = (q) => execSync('curl -sS -m 30 -X POST https://api.supabase.com/v1/projects/tsxoecarlbekrgjxrjyu/database/query -H "Content-Type: application/json" --data-binary @-', { input: JSON.stringify({ query: q }) }).toString();
(async () => {
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = ['STAMP ' + stamp], errs = [];
  const mk = async (n, w, h) => { const p = await (await b.newContext({ viewport: { width: w || 390, height: h || 844 } })).newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
    p.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) r.text().then((t) => errs.push(n + ' HTTP ' + r.status() + ' ' + r.url().split('.co')[1].slice(0, 50) + ' :: ' + t.slice(0, 110))).catch(() => {}); });
    return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 220)); } };
  const P = await mk('Phone'), D = await mk('Desk', 1280, 900), U = await mk('User');
  await step('the app landing links to the business page', async () => {
    await P.goto(base + 'index.html'); await P.waitForSelector('a[href="business/"]', { timeout: 20000 }); await P.click('a[href="business/"]'); await P.waitForSelector('#form:not([hidden])', { timeout: 20000 });
    await P.screenshot({ path: require('os').tmpdir() + '/bp-phone-top.png' }); });
  await step('desktop layout', async () => { await D.goto(base + 'business/'); await D.waitForSelector('#form:not([hidden])', { timeout: 20000 }); await D.screenshot({ path: require('os').tmpdir() + '/bp-desk.png', fullPage: true }); });
  await step('a new owner applies (new account)', async () => {
    await P.click('a[href="#apply"]'); await P.fill('#bName', 'Apply Test ' + stamp); await P.click('[data-c="cafe"]'); await P.fill('#bCity', 'Lisbon'); await P.fill('#bAddr', 'Rua Nova 5');
    await P.fill('#bWeb', '@applytest'); await P.fill('#bPhone', '+351 900 000 000'); await P.fill('#cName', 'Maria'); await P.fill('#cEmail', 'sway.test.p' + stamp + '@gmail.com'); await P.fill('#cPw', 'testpass-' + stamp);
    await P.click('#go'); await P.waitForSelector('#done:not([hidden])', { timeout: 20000 }); log.push('     shows: ' + (await P.locator('#done').innerText()).replace(/\n/g, ' / ')); await P.screenshot({ path: require('os').tmpdir() + '/bp-done.png' });
    log.push('     you see in Supabase: ' + sql("select name, category, city, address, website, phone, contact_name, contact_email, verified from public.businesses where name = 'Apply Test " + stamp + "'").trim()); });
  await step('coming back shows the status, not the form', async () => { await P.reload(); await P.waitForSelector('#done:not([hidden])', { timeout: 20000 }); log.push('     ' + (await P.locator('#done .badge').innerText())); });
  await step('"Open your business page" goes into the app', async () => { await P.click('#done a.btn'); await P.waitForSelector('text=Apply Test ' + stamp, { timeout: 25000 }); log.push('     app shows: ' + (await P.locator('.bizhead').innerText()).replace(/\n/g, ' / ')); });
  await step('an existing user applies without retyping email or password', async () => {
    await U.goto(base + 'index.html'); await U.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await U.fill('#auName', 'Rui'); await U.fill('#auEmail', 'sway.test.u' + stamp + '@gmail.com'); await U.fill('#auPw', 'testpass-' + stamp); await U.click('form.authf button[type=submit]'); await U.waitForSelector('.hello', { timeout: 20000 });
    await U.goto(base + 'business/'); await U.waitForSelector('#asWho:not([hidden])', { timeout: 20000 }); log.push('     ' + (await U.locator('#asWho').innerText()) + ' | email field shown: ' + (await U.locator('#cEmail').isVisible()) + ' | name prefilled: ' + (await U.inputValue('#cName')));
    await U.fill('#bName', 'Second Test ' + stamp); await U.fill('#bCity', 'Porto'); await U.click('#go'); await U.waitForSelector('#done:not([hidden])', { timeout: 20000 }); });
  await step('an email that already has an account gets a clear message', async () => {
    const X = await mk('X'); await X.goto(base + 'business/'); await X.waitForSelector('#form:not([hidden])', { timeout: 20000 });
    await X.fill('#bName', 'Dup ' + stamp); await X.fill('#bCity', 'Lisbon'); await X.fill('#cName', 'Dup'); await X.fill('#cEmail', 'sway.test.p' + stamp + '@gmail.com'); await X.fill('#cPw', 'wrongpass-1');
    await X.click('#go'); await X.waitForSelector('#err:not([hidden])', { timeout: 20000 }); log.push('     ' + (await X.locator('#err').innerText())); });
  await step('missing fields are caught', async () => {
    const Y = await mk('Y'); await Y.goto(base + 'business/'); await Y.waitForSelector('#form:not([hidden])', { timeout: 20000 }); await Y.click('#go'); log.push('     ' + (await Y.locator('#err').innerText())); });
  console.log(log.join('\n')); console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'NO ERRORS'); await b.close();
})();
