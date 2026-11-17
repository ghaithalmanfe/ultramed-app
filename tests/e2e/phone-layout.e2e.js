// Phones (360 and 390 px), English and Arabic, the supervisor and a rep: every view and the sheets they open
// (the screenshot sweep's steps of the redesign's integration pass) — no page that pans sideways, no tap target
// under 44 × 44 px, nothing lying over a target in view, no page or console error. The rules are tools/audit.js (shared with the sweep tool
// tools/shots.js): a ::before / ::after hit area counts, a checkbox is measured by its label, an element that
// takes no taps (pointer-events: none) is not a target. Invented data only (tests/e2e/fixtures/main-screen-data.js),
// a fixed clock (Thursday 8 October 2026, 10:00), a fake cloud; nothing leaves localhost.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const { audit } = require('./tools/audit.js');
const { G, M, seed } = require('./fixtures/main-screen-data.js');
const PORT = 8279;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 1600) : '')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// every view, then the sheets (sup: the supervisor's only); "gate" = the sign-in screen, before signing in (tools/sweep-steps.js)
const { STEPS } = require('./tools/sweep-steps.js');

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const cloud = {};
  const api = {
    get: async k => k in cloud ? cloud[k] : null,
    set: async (k, v) => { cloud[k] = v; return true; },
    setMany: async e => { e.forEach(([k, v]) => { cloud[k] = v; }); return true; },
    del: async k => { delete cloud[k]; return true; },
    list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  };
  const found = {};   // "<who> <lang>" → { wide: [], small: [], errors: [] }
  for(const [who, role] of [[G, 'supervisor'], [M, 'rep']]){
    for(const lang of ['en', 'ar']){
      const key = (role === 'rep' ? 'rep' : 'supervisor') + ' ' + lang, f = found[key] = { pages: 0, wide: [], small: [], covered: [], errors: [] };
      for(const w of [360, 390]){
        seed(cloud, {});
        const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
        await blockFirebase(ctx);
        await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
        await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
        await page.addInitScript(({ lang, staff }) => {
          try{ localStorage.setItem('ultramed_lang', lang); localStorage.setItem('ultramed_staff_cache', staff); }catch(e){}
          window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
            setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
          const off = new Date('2026-10-08T10:00:00').getTime() - Date.now();
          const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
        }, { lang, staff: cloud.staff });
        await page.goto(`http://localhost:${PORT}/index.html`);
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        await sleep(300);
        let signedIn = false;
        for(const st of STEPS){
          if(st.sup && role !== 'supervisor') continue;
          if(!st.gate && !signedIn){ await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role }); await sleep(1500); signedIn = true; }
          if(st.view) await page.evaluate(v => { closeModal(); switchView(v); scrollTo(0, 0); }, st.view).catch(e => errors.push('step ' + st.name + ': ' + e.message.split('\n')[0]));
          if(st.pre) await page.evaluate(async js => { const r = (0, eval)(js); if(r && typeof r.then === 'function') await r; }, st.pre).catch(e => errors.push('step ' + st.name + ' (pre): ' + e.message.split('\n')[0]));
          if(st.js) await page.evaluate(async js => { const r = (0, eval)(js); if(r && typeof r.then === 'function') await r; }, st.js).catch(e => errors.push('step ' + st.name + ': ' + e.message.split('\n')[0]));
          await page.evaluate(() => typeof msWhenReady === 'function' ? msWhenReady() : null).catch(() => {});
          await sleep(st.wait || 200);
          const a = await page.evaluate(audit, { phone: true, width: w });
          const at = `${st.name}@${w}`;
          f.pages++;
          if(a.scrollWidth > a.vw || a.wide.length) f.wide.push(at + ': ' + (a.scrollWidth > a.vw ? `scrollWidth ${a.scrollWidth} > ${a.vw} ` : '') + a.wide.slice(0, 3).join(' | '));
          a.small.forEach(s => f.small.push(at + ': ' + s));
          a.covered.forEach(s => f.covered.push(at + ': ' + s));
          errors.splice(0).forEach(e => f.errors.push(at + ': ' + e));
          await page.evaluate(() => { closeModal(); const lb = document.getElementById('lightbox'); if(lb) lb.classList.remove('show'); try{ hideProReport(); }catch(e){} }).catch(() => {});
        }
        await ctx.close();
      }
    }
  }
  for(const [key, f] of Object.entries(found)){
    check(`${key} at 360 and 390 px (${f.pages} pages: every view and its sheets): no page pans sideways`, f.pages > 60 && f.wide.length === 0, f.wide.slice(0, 12));
    check(`${key}: every tap target is at least 44 × 44 px`, f.small.length === 0, f.small.slice(0, 20));
    check(`${key}: nothing lies over a tap target in view (the chrome the page scrolls under excepted)`, f.covered.length === 0, f.covered.slice(0, 12));
    check(`${key}: no page or console error`, f.errors.length === 0, f.errors.slice(0, 10));
  }
  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
