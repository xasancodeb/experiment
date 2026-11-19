// Automatic checks that need no database: the app in demo mode.
// Run: serve the repo with an empty config (window.SWAY_CONFIG={}), then
//   BASE=http://localhost:8080/ node tests/demo.js
// Exits with 1 if anything fails, so CI goes red.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8080/';
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failed++; };

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const open = async (w, h, mobile) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!mobile, isMobile: !!mobile });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + 'index.html'); await p.fill('#auName', 'Dani'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
    return p;
  };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');

  // --- main flows ---
  let p = await open(390, 844);
  ok(/waiting for your vote/.test(await p.locator('.hello p').innerText()), 'home says questions are waiting');
  ok((await p.locator('.big .cd').count()) === 1, 'vote card shows a countdown');
  await p.click('.big .ans button >> nth=0'); await p.waitForTimeout(900);
  ok((await p.locator('.big h2').innerText()) !== '', 'voting deals the next card');
  await tab(p, 'ask');
  ok((await p.locator('[data-a="who"][aria-pressed="true"]').count()) === 0, 'no circle is chosen for you');
  ok(/Choose who to ask/.test(await p.locator('[data-a="post"]').innerText()), 'ask button asks you to choose');
  ok((await p.locator('[data-k="priv"]').getAttribute('aria-checked')) === 'false', 'private votes start off');
  ok((await p.locator('[data-k="wo"]').count()) === 0, 'offers switch is hidden');
  await p.fill('#askq', 'Pizza or sushi?'); await p.click('[data-a="type"][data-t="Options"]');
  await p.fill('[data-o="0"]', 'Pizza'); await p.fill('[data-o="1"]', 'Sushi');
  for (let i = 0; i < 9; i++) if (await p.locator('[data-a="addopt"]').count()) await p.click('[data-a="addopt"]');
  ok((await p.locator('[data-o]').count()) === 10, 'up to 10 answers');
  await p.click('[data-a="post"]'); ok((await p.locator('.need').count()) === 1, 'asking without a circle warns');
  await p.click('[data-a="who"][data-id="inner"]'); await p.click('[data-a="post"]'); await p.waitForTimeout(300);
  ok(/Pizza or sushi/.test(await p.locator('.mcard .top b').allInnerTexts().then((x) => x.join(' '))), 'question appears in Mine');
  await tab(p, 'circles');
  await p.click('.starbtn[aria-label="Star Studio 4B"]'); await p.click('.starbtn[aria-label="Star Gym Buddies"]');
  ok(/up to 3/.test(await p.locator('.toast').innerText()), 'starring is limited to 3');
  await p.click('.ctile:has-text("Gym Buddies")'); await p.click('[data-a="crename"]'); await p.fill('#crn', 'Lifters'); await p.press('#crn', 'Enter');
  ok((await p.locator('.bar h2').innerText()) === 'Lifters', 'owner can rename a circle');
  await p.click('[data-a="back"]'); await tab(p, 'you');
  await p.click('[data-a="theme"][data-t="dark"]'); ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark mode switches');
  await p.click('[data-a="theme"][data-t="light"]');
  ok((await p.locator('a[href="privacy/"]').count()) === 1 && (await p.locator('a[href="terms/"]').count()) === 1, 'privacy and terms are linked');
  const shift = await p.evaluate(() => document.getElementById('app').scrollLeft);
  ok(shift === 0, 'the app frame never shifts sideways');

  // --- random taps on every screen ---
  let taps = 0;
  for (let round = 0; round < 6; round++) for (const s of ['vote', 'mine', 'circles', 'you']) {
    await tab(p, s).catch(() => {}); await p.waitForTimeout(50);
    for (let k = 0; k < 12; k++) {
      const btns = await p.$$('#page [data-a]:not([data-a="tab"]):not([data-a="resetdemo"]), #reveal [data-a]'); if (!btns.length) break;
      try { await btns[Math.floor(Math.random() * btns.length)].click({ timeout: 800 }); taps++; } catch (e) {}
      await p.waitForTimeout(40);
      if (await p.$('#reveal') && Math.random() < 0.7) await p.click('[data-a="unreveal"]').catch(() => {});
    }
  }
  ok(taps > 100, 'random taps: ' + taps);
  await p.context().close();

  // --- every text box stays above a phone keyboard ---
  for (const [nm, W, H, KB] of [['small phone', 360, 640, 280], ['large phone', 390, 844, 336]]) {
    p = await open(W, H, true);
    const check = async (label, sel, prep) => {
      if (prep) await prep();
      await p.locator(sel).first().tap(); await p.setViewportSize({ width: W, height: H - KB }); await p.waitForTimeout(700);
      const r = await p.evaluate(() => { const a = document.activeElement.getBoundingClientRect(); return { top: a.top, bottom: a.bottom, vh: innerHeight, tabs: getComputedStyle(document.getElementById('tabs')).display }; });
      ok(r.top >= 0 && r.bottom <= r.vh && r.tabs !== 'grid', nm + ': ' + label + ' visible above the keyboard');
      await p.evaluate(() => document.activeElement.blur()); await p.setViewportSize({ width: W, height: H }); await p.waitForTimeout(300);
    };
    await check('comment box', '#cm', async () => { await tab(p, 'mine'); await p.click('.mcard .top >> nth=0'); await p.waitForTimeout(300); });
    await p.click('[data-a="back"]');
    await check('new circle name', '#cName', async () => { await tab(p, 'circles'); await p.click('[data-a="newcircle"] >> nth=0'); await p.waitForTimeout(300); });
    await p.click('[data-a="back"]');
    await check('question', '#askq', async () => { await tab(p, 'ask'); await p.waitForTimeout(300); });
    await p.context().close();
  }

  // --- static pages load ---
  const s = await (await b.newContext()).newPage();
  for (const path of ['privacy/', 'terms/', 'business/']) { const r = await s.goto(BASE + path); ok(r && r.status() === 200 && (await s.locator('h1').count()) > 0, path + ' loads'); }

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + [...new Set(errs)].join(' | ') : ''));
  await b.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
