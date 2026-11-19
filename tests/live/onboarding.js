// Live check: a brand-new account gets the four first-time steps; an invited guest doesn't.
//   BASE=http://localhost:8766/ node tests/live/onboarding.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8766/', stamp = Date.now().toString(36), SHOTS = process.env.SHOTS || require('os').tmpdir();
(async () => {
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = [], errs = []; let failed = 0;
  const mk = async (n, dark) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: dark ? 'dark' : 'light' })).newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message)); return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { failed++; log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 220)); } };
  const A = await mk('A'); let invite = '';
  await step('new account sees the welcome, with no tab bar', async () => {
    await A.goto(BASE + 'index.html'); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 }); await A.screenshot({ path: SHOTS + '/ux-landing.png' });
    await A.fill('#auName', 'Nina'); await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]');
    await A.waitForSelector('.onb h1:has-text("Here’s how it works")', { timeout: 20000 }); await A.waitForTimeout(400);
    if (!(await A.locator('#tabs').isHidden())) throw new Error('tab bar shown'); await A.screenshot({ path: SHOTS + '/ux-onb1.png' }); });
  await step('step 2: a suggestion fills the name; the circle is created', async () => {
    await A.click('[data-a="onbnext"]'); await A.click('[data-a="onbidea"][data-t="Best friends"]');
    if ((await A.inputValue('#onbName')) !== 'Best friends') throw new Error('suggestion not filled'); await A.screenshot({ path: SHOTS + '/ux-onb2.png' });
    await A.click('form[data-f="onbcircle"] button[type=submit]'); await A.waitForSelector('.onb h1:has-text("invite them")', { timeout: 20000 }); });
  await step('step 3: the invite link appears', async () => {
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=/.test(c.textContent); }, null, { timeout: 20000 }); invite = await A.locator('.invite code').innerText(); await A.screenshot({ path: SHOTS + '/ux-onb3.png' }); await A.click('[data-a="onbnext"]'); });
  await step('step 4: an example question starts the Ask screen with it filled in', async () => {
    await A.screenshot({ path: SHOTS + '/ux-onb4.png' }); await A.click('[data-a="onbq"][data-t="Where should we eat?"]'); await A.waitForSelector('#askq', { timeout: 10000 });
    log.push('     question: ' + (await A.inputValue('#askq')) + ' | circle chosen for you: ' + (await A.locator('[data-a="who"][aria-pressed="true"]').count()) + ' | tab bar: ' + (await A.locator('#tabs').isVisible()));
    if ((await A.inputValue('#askq')) !== 'Where should we eat?') throw new Error('not prefilled'); await A.click('[data-a="cancelask"]'); });
  await step('it doesn\'t come back after reloading', async () => { await A.reload(); await A.waitForSelector('.hello', { timeout: 20000 }); await A.waitForTimeout(3000); if (await A.locator('.onb').count()) throw new Error('shown again'); });
  await step('an invited guest goes straight in, no first-time steps', async () => {
    const G = await mk('G', true); await G.goto(invite); await G.waitForSelector('.banner', { timeout: 20000 }); await G.screenshot({ path: SHOTS + '/ux-invite-dark.png' });
    await G.fill('#auName', 'Gus'); await G.click('form.authf button[type=submit]'); await G.waitForSelector('.hello', { timeout: 20000 }); await G.waitForTimeout(3000);
    if (await G.locator('.onb').count()) throw new Error('guest got onboarding'); await G.screenshot({ path: SHOTS + '/ux-home-dark.png' }); });
  console.log(log.join('\n')); if (errs.length) { failed++; console.log('ERRORS\n' + [...new Set(errs)].join('\n')); } console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); await b.close(); process.exit(failed ? 1 : 0);
})();
