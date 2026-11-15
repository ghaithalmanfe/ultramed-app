// The passphrase page of the nightly backup (www/backup-passphrase.html,
// docs/backup.md), in a real browser. The encrypted backups are public to
// anyone signed in to GitHub, so their passphrase is the only protection and
// the backup accepts only one this page made:
//   - the button makes a passphrase scripts/backup/nightly accepts, a new one
//     at every press, shown in eleven groups of four;
//   - "Copy" puts exactly that passphrase on the clipboard;
//   - typed back from paper (capitals, no hyphens, O for 0) the box says it is
//     the one shown; one wrong character, or another passphrase, is told apart;
//   - nothing leaves the page and nothing is stored: no request but the page
//     itself, no cookie, no web storage, nothing in the address;
//   - its Content-Security-Policy lets no other script run and no request out
//     (tried from inside the page).
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts } = require('./_env.js');
const B = require('../../scripts/backup/nightly/bundle.js');
const PORT = 8291;
const served = [];   // every request that reached the server: what really left the page
const server = http.createServer((req, res) => {
  served.push(req.url);
  const f = path.join(WWW, req.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'text/plain' }); res.end(d); });
});
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 400) : '')); if(!ok) failed++; }

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 390, height: 844 } });   // a phone
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const url = `http://localhost:${PORT}/backup-passphrase.html`;
  await page.goto(url);

  const first = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, hidden: document.getElementById('made').hidden, button: document.getElementById('make').textContent, can: window.UMBackupPassphrase.canMake() }));
  check('the page opens in Arabic, right to left, with nothing shown before the button is pressed', first.dir === 'rtl' && first.lang === 'ar' && first.hidden === true && /اصنع عبارة مرور/.test(first.button) && first.can === true, first);

  await page.click('#make');
  await page.waitForFunction(() => !document.getElementById('made').hidden);
  const shown = async () => page.evaluate(() => ({ text: document.getElementById('pass').textContent, groups: Array.from(document.querySelectorAll('#pass span')).map(s => s.textContent), dir: getComputedStyle(document.getElementById('pass')).direction }));
  const one = await shown();
  check('the button makes a passphrase the backup accepts, as printed', B.passphraseProblem(one.text) === null && B.canonicalPassphrase(one.text) === one.text, { length: one.text.length });
  check('it is shown left to right in eleven groups of four', one.dir === 'ltr' && one.groups.length === 11 && one.groups.every((g, i) => /^[0-9a-hjkmnp-tv-z]{4}$/.test(g.replace(/-$/, '')) && g.endsWith('-') === (i < 10)), { groups: one.groups.length, dir: one.dir });

  await page.click('#copy');
  await page.waitForFunction(() => document.getElementById('copied').textContent !== '');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('"Copy" puts exactly that passphrase on the clipboard, and says to paste it in the password manager first', clip === one.text && /مدير كلمات المرور/.test(await page.textContent('#copied')), { same: clip === one.text });

  // typed back from paper: capitals, spaces for hyphens, the letter O for zero
  const fromPaper = one.text.toUpperCase().replace(/-/g, ' ').replace(/0/g, 'O');
  await page.fill('#check', fromPaper);
  await page.waitForFunction(() => document.getElementById('result').textContent !== '');
  const okText = await page.evaluate(() => ({ t: document.getElementById('result').textContent, c: document.getElementById('result').className }));
  check('typed back from paper (capitals, no hyphens, O for 0), the box says it is the passphrase shown', okText.c === 'ok' && /المعروضة أعلاه نفسها/.test(okText.t), okText);
  const wrong = fromPaper.slice(0, 7) + (fromPaper[7] === 'A' ? 'B' : 'A') + fromPaper.slice(8);
  await page.fill('#check', wrong);
  await page.waitForFunction(() => document.getElementById('result').className === 'bad');
  check('one wrong character is caught', /ناقصة أو فيها حرف خاطئ/.test(await page.textContent('#result')));
  await page.fill('#check', fromPaper.slice(0, -3));
  await page.waitForFunction(() => /ناقصة/.test(document.getElementById('result').textContent));
  check('an incomplete one is caught', true);
  const other = B.makePassphrase();
  await page.fill('#check', other);
  await page.waitForFunction(() => /ليست العبارة المعروضة/.test(document.getElementById('result').textContent));
  check('another complete passphrase is not called the one shown', (await page.getAttribute('#result', 'class')) === 'bad');

  await page.click('#make');
  await page.waitForFunction((prev) => document.getElementById('pass').textContent !== prev, one.text);
  const two = await shown();
  check('every press makes a new passphrase', two.text !== one.text && B.passphraseProblem(two.text) === null);
  const many = await page.evaluate(async () => { const s = new Set(); for(let i = 0; i < 300; i++) s.add(await window.UMBackupPassphrase.make()); return Array.from(s); });
  check('300 more: all different, all accepted by the backup', many.length === 300 && many.every(p => B.canonicalPassphrase(p) === p));

  // nothing leaves the page, nothing is stored
  const kept = await page.evaluate(() => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length, href: location.href }));
  check('nothing is stored and nothing is in the address', kept.cookie === '' && kept.local === 0 && kept.session === 0 && kept.href === url, kept);
  check('the page asked the network for nothing but itself', served.length === 1 && served[0] === '/backup-passphrase.html', served);
  const tried = await page.evaluate(async (pass) => {
    const out = {};
    try{ await fetch('/sw.js?' + pass); out.fetch = 'went out'; }catch(e){ out.fetch = 'blocked'; }
    await new Promise(r => { const i = new Image(); i.onload = () => { out.img = 'went out'; r(); }; i.onerror = () => { out.img = 'blocked'; r(); }; i.src = '/icons/icon-192.png?' + pass; });
    try{ const s = document.createElement('script'); s.textContent = 'window.__injected = 1'; document.body.appendChild(s); }catch(e){}
    out.injected = window.__injected === 1 ? 'ran' : 'blocked';
    return out;
  }, two.text);
  check('its Content-Security-Policy lets nothing out and no other script run (tried from inside the page)', tried.fetch === 'blocked' && tried.img === 'blocked' && tried.injected === 'blocked' && served.length === 1, { tried, served });

  // the only page errors are the three refusals just provoked
  const real = errors.filter(e => !/Content Security Policy|Refused to|violates the following/i.test(e));
  check('no page errors', real.length === 0, real.slice(0, 4));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
