// Live check against the real database (creates throwaway sway.test.* accounts).
// Run a copy of the site with the real config.js, then: BASE=http://localhost:8766/ node tests/live/core.js
// Three real people against the live database: A signs up, B joins by invite link as a guest,
// C votes straight from a question link. Covers stars, anonymous votes, nudges, photos, reveal, comments.
const { chromium } = require('playwright');
const base = (process.env.BASE || 'http://localhost:8766/') + 'index.html';
const stamp = Date.now().toString(36);
(async () => {
  const launch = {}; if (process.env.HTTPS_PROXY) { const px = new URL(process.env.HTTPS_PROXY); launch.proxy = { server: px.protocol + '//' + px.host, username: decodeURIComponent(px.username), password: decodeURIComponent(px.password), bypass: 'localhost,127.0.0.1' }; }
  const b = await chromium.launch(launch);
  const log = [], errs = [];
  const mk = async (n, w) => { const ctx = await b.newContext({ viewport: { width: w || 390, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(n + ' pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts|favicon|sw\.js|ServiceWorker/i.test(m.text())) errs.push(n + ' console: ' + m.text().slice(0, 220)); });
    p.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) r.text().then((t) => errs.push(n + ' HTTP ' + r.status() + ' ' + r.url().split('.co')[1].slice(0, 80) + ' :: ' + t.slice(0, 200))).catch(() => {}); });
    return p; };
  const step = async (name, fn) => { try { await fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0].slice(0, 200)); } };
  const tab = (p, t) => p.click('[data-a="tab"][data-t="' + t + '"]');
  const A = await mk('A'), B = await mk('B'), C = await mk('C', 1200);
  let invite = '', qlink = '';
  const Q1 = 'Test ' + stamp + ': pizza, sushi or tacos?', Q2 = 'Test ' + stamp + ': gym tomorrow?', Q3 = 'Test ' + stamp + ': which photo?';

  await step('A: sign up with email', async () => { await A.goto(base); await A.waitForSelector('[data-auth="signup"]', { timeout: 20000 });
    await A.fill('#auName', 'Tester A'); await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]');
    await A.waitForSelector('.hello', { timeout: 20000 }); await A.waitForSelector('text=Start with a circle', { timeout: 15000 }); });
  await step('A: create a circle and get its invite link', async () => { await A.click('[data-a="newcircle"]'); await A.fill('#cName', 'Test ' + stamp); await A.click('form[data-f="newcircle"] button');
    await A.waitForFunction(() => { const c = document.querySelector('.invite code'); return c && /join=[A-Z0-9]{8}/.test(c.textContent); }, null, { timeout: 20000 });
    invite = await A.locator('.invite code').innerText(); log.push('     invite: ' + invite); await A.screenshot({ path: 'r-A-circle.png' }); });
  await step('A: star the circle (saved in the database)', async () => { await A.click('[data-a="star"]'); await A.waitForTimeout(2500);
    await A.reload(); await A.waitForSelector('.hello', { timeout: 20000 }); await tab(A, 'circles'); await A.waitForSelector('.starbtn[aria-pressed="true"]', { timeout: 15000 }); });
  await step('B: opens invite link, sees who invited, joins as guest', async () => { await B.goto(invite); await B.waitForSelector('.banner', { timeout: 20000 }); log.push('     banner: ' + (await B.locator('.banner').innerText()));
    await B.screenshot({ path: 'r-B-invite.png' });
    await B.fill('#auName', 'Guest B'); await B.click('form.authf button[type=submit]'); await B.waitForSelector('.hello', { timeout: 20000 });
    await tab(B, 'circles'); await B.waitForSelector('.ctile:not(.new)', { timeout: 20000 }); log.push('     B circle: ' + (await B.locator('.ctile:not(.new)').first().innerText()).replace(/\n/g, ' · ')); });
  await step('A: ask with nothing pre-chosen, 3 answers, then share link', async () => { await A.waitForTimeout(1500); await tab(A, 'ask'); await A.waitForSelector('#askq');
    const chosen = await A.locator('[data-a="who"][aria-pressed="true"]').count(); if (chosen) throw new Error('a circle was pre-chosen');
    await A.fill('#askq', Q1); await A.click('[data-a="type"][data-t="Options"]'); await A.fill('[data-o="0"]', 'Pizza'); await A.fill('[data-o="1"]', 'Sushi'); await A.click('[data-a="addopt"]'); await A.fill('[data-o="2"]', 'Tacos'); log.push('     private votes switch starts: ' + (await A.locator('[data-a="dtog"][data-k="priv"]').getAttribute('aria-checked'))); await A.click('[data-a="dtog"][data-k="priv"]');
    await A.click('[data-a="who"] >> nth=0'); await A.waitForSelector('text=1 person will see this', { timeout: 8000 }); log.push('     hint: ' + (await A.locator('.hint').last().innerText()));
    await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 }); qlink = await A.locator('.invite code').innerText(); log.push('     question link: ' + qlink);
    await A.screenshot({ path: 'r-A-shared.png' }); await A.click('[data-a="tab"][data-t="mine"]'); });
  await step('C: opens question link, taps an answer, gives a name, vote is in', async () => { await C.goto(qlink); await C.waitForSelector('[data-pick]', { timeout: 20000 }); await C.screenshot({ path: 'r-C-landing.png' });
    await C.click('[data-pick="2"]'); await C.fill('#auName', 'Guest C'); await C.click('form.authf button[type=submit]'); await C.waitForSelector('.hello', { timeout: 20000 });
    await C.waitForSelector('.qhero h1', { timeout: 25000 }); log.push('     C status: ' + (await C.locator('.status').innerText())); await C.waitForTimeout(2500); await C.screenshot({ path: 'r-C-after.png' }); });
  await step('B: sees the big card, votes anonymously', async () => { await tab(B, 'vote'); await B.waitForSelector('.big h2:has-text("pizza, sushi")', { timeout: 40000 });
    await B.click('.big [data-a="anonme"]'); await B.screenshot({ path: 'r-B-card.png' }); await B.click('.big .ans button >> nth=1'); await B.waitForTimeout(3000);
    await B.click('.row:has-text("pizza, sushi")'); log.push('     B status: ' + (await B.locator('.status').innerText())); await B.click('[data-a="back"]'); });
  await step('A: Mine shows 2 of 2; people list hides B\'s choice', async () => { await tab(A, 'mine'); await A.waitForSelector('.mcard:has-text("pizza, sushi") >> text=2 of 2 voted', { timeout: 40000 });
    await A.screenshot({ path: 'r-A-mine.png' }); await A.click('.mcard:has-text("pizza, sushi") .top'); await A.waitForSelector('.person');
    log.push('     A people: ' + (await A.locator('.person').allInnerTexts()).join(' / ').replace(/\n/g, ' ')); });
  await step('A: asks a Yes/No and nudges', async () => { await tab(A, 'ask'); await A.fill('#askq', Q2); await A.click('[data-a="who"] >> nth=0'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 });
    await A.click('[data-a="tab"][data-t="mine"]'); await A.waitForSelector('.mcard:has-text("gym tomorrow") [data-a="nudge"]', { timeout: 30000 }); await A.click('.mcard:has-text("gym tomorrow") [data-a="nudge"]');
    log.push('     ' + (await A.locator('.toast').innerText())); });
  await step('B: gets the nudge', async () => { await B.waitForSelector('text=Tester nudged you', { timeout: 40000 }); });
  await step('B: comments on the first question', async () => { await tab(B, 'vote'); await B.click('.row:has-text("pizza, sushi")'); await B.fill('#cm', 'test comment ' + stamp); await B.press('#cm', 'Enter'); await B.waitForTimeout(2000); await B.click('[data-a="back"]'); });
  await step('A: sees the comment, closes the question, reveal', async () => { await tab(A, 'mine'); await A.click('.mcard:has-text("pizza, sushi") .top'); await A.waitForSelector('text=test comment ' + stamp, { timeout: 40000 });
    await A.click('[data-a="close"]'); await A.waitForSelector('#reveal h2', { timeout: 15000 }); await A.waitForTimeout(1200); log.push('     A reveal: ' + (await A.locator('#reveal h2').innerText()) + ' ' + (await A.locator('#reveal .bigp').innerText().catch(() => '')));
    await A.screenshot({ path: 'r-A-reveal.png' }); await A.click('[data-a="unreveal"]'); await A.waitForTimeout(800); log.push('     A people after close: ' + (await A.locator('.person').allInnerTexts()).join(' / ').replace(/\n/g, ' ')); });
  await step('B: verdict arrives, reveal, own vote marked private', async () => { await tab(B, 'vote'); await B.click('.rcard:has-text("pizza, sushi")', { timeout: 20000 });
    await B.waitForSelector('#reveal h2', { timeout: 15000 }); await B.waitForTimeout(1200); log.push('     B reveal: ' + (await B.locator('#reveal h2').innerText())); await B.click('[data-a="unreveal"]'); await B.waitForTimeout(800);
    log.push('     B people: ' + (await B.locator('.person').allInnerTexts()).join(' / ').replace(/\n/g, ' ')); await B.screenshot({ path: 'r-B-detail.png', fullPage: true }); });
  await step('C: sees B as "Voted privately" after close', async () => { await C.reload(); await C.waitForSelector('.hello', { timeout: 20000 }); await C.waitForTimeout(3000);
    await tab(C, 'mine'); await tab(C, 'vote'); const r = C.locator('.rcard:has-text("pizza, sushi")'); await r.click({ timeout: 20000 }); await C.waitForSelector('#reveal .btn', { timeout: 15000 }); await C.waitForTimeout(1000); await C.click('[data-a="unreveal"]'); await C.waitForTimeout(800);
    const ppl = (await C.locator('.person').allInnerTexts()).join(' / ').replace(/\n/g, ' '); log.push('     C people: ' + ppl); if (!/Voted privately/.test(ppl)) throw new Error('B choice visible'); if (/Guest B Sushi/.test(ppl)) throw new Error('leak'); });
  await step('A: photo question with two uploads', async () => { const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDGgAcQAAPuSBP2Zp0fxAAAAAElFTkSuQmCC', 'base64');
    await tab(A, 'ask'); await A.fill('#askq', Q3); await A.click('[data-a="type"][data-t="Photos"]');
    await A.setInputFiles('[data-many="1"]', [{ name: 'a.png', mimeType: 'image/png', buffer: png }, { name: 'b.png', mimeType: 'image/png', buffer: png }]); await A.waitForSelector('.optin .thumb >> nth=1');
    await A.click('[data-a="who"] >> nth=0'); await A.click('[data-a="post"]'); await A.waitForSelector('text=Your question is live', { timeout: 20000 }); await A.click('[data-a="tab"][data-t="mine"]');
    await tab(B, 'vote'); await B.waitForSelector('.big h2:has-text("gym tomorrow")', { timeout: 40000 }); await B.click('.big .ans button >> nth=0'); await B.waitForTimeout(1200); await B.waitForSelector('.big .ph img', { timeout: 40000 }); await B.screenshot({ path: 'r-B-photo.png' }); log.push('     B sees photo grid: ' + (await B.locator('.big .ph').count()) + ' photos'); });
  await step('A: delete a question', async () => { await A.click('.mcard:has-text("gym tomorrow") .top'); await A.click('[data-a="del"]'); await A.click('[data-a="del"]'); await A.waitForTimeout(2500); await A.reload(); await A.waitForSelector('.hello', { timeout: 20000 }); await tab(A, 'mine'); await A.waitForTimeout(3000);
    if (await A.locator('.mcard:has-text("gym tomorrow")').count()) throw new Error('still there'); });
  await step('A: log out and log back in', async () => { await tab(A, 'you'); await A.click('[data-a="logout"]'); await A.waitForSelector('[data-auth="login"]', { timeout: 15000 }); await A.click('[data-auth="login"]');
    await A.fill('#auEmail', 'sway.test.' + stamp + '@gmail.com'); await A.fill('#auPw', 'testpass-' + stamp); await A.click('form.authf button[type=submit]'); await A.waitForSelector('.hello', { timeout: 20000 });
    await tab(A, 'circles'); await A.waitForSelector('.starbtn[aria-pressed="true"]', { timeout: 15000 }); });
  console.log(log.join('\n')); console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'NO ERRORS'); await b.close();
})();
