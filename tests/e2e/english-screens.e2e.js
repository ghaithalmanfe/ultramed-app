// English screens on an Arabic computer (the owner's report of 19 Nov: "my system writes Arabic words in the English
// version"). His computer's language is Arabic, so anything the app formats in the BROWSER's language (a date or a time
// with no locale of the app's own) or writes in Arabic whatever the screen's language shows Arabic in English. Every view
// and the sheets of the sweep (tools/sweep-steps.js), the supervisor and a rep, a laptop (1440 px) and a phone (390 px),
// the app in English and the browser in Arabic (ar-KW): no Arabic letter in any visible text, placeholder, title,
// aria-label or alt — except the language switch's own name for Arabic. Invented data only
// (tests/e2e/fixtures/main-screen-data.js), a fixed clock, a fake cloud; nothing leaves localhost.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const { G, M, seed } = require('./fixtures/main-screen-data.js');
const PORT = 8305;
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

// Every visible piece of text, placeholder, title, aria-label and alt that holds an Arabic letter, with where it is.
// The language switch names Arabic in Arabic on purpose (العربية): that one is not a finding.
function arabicOnScreen(){
  const AR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const ALLOW = new Set(['العربية', 'عربي', 'ع']);
  const out = new Set();
  const vis = el => { if(!el || el.closest('script,style,noscript,template')) return false; const cs = getComputedStyle(el); if(cs.visibility === 'hidden' || +cs.opacity === 0) return false; return el.getClientRects().length > 0; };
  const where = el => { const h = el.closest('[id]'); return (h ? '#' + h.id : '') + (el.className && typeof el.className === 'string' ? ' .' + el.className.split(' ')[0] : ''); };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while((n = tw.nextNode())){
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if(!t || !AR.test(t) || ALLOW.has(t)) continue;
    const el = n.parentElement; if(!vis(el)) continue;
    out.add('"' + t.slice(0, 90) + '" ' + where(el));
  }
  document.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(el => {
    if(!vis(el)) return;
    ['placeholder', 'title', 'aria-label', 'alt'].forEach(a => { const v = (el.getAttribute(a) || '').trim(); if(v && AR.test(v) && !ALLOW.has(v)) out.add(a + '="' + v.slice(0, 90) + '" ' + where(el)); });
  });
  if(AR.test(document.title)) out.add('title: ' + document.title);
  return [...out];
}

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
    for(const lang of ['en']){
      const key = (role === 'rep' ? 'rep' : 'supervisor') + ' ' + lang, f = found[key] = { pages: 0, arabic: [], errors: [] };
      for(const w of [1440, 390]){
        seed(cloud, {});
        const ctx = await browser.newContext({ viewport: { width: w, height: w < 1024 ? 844 : 900 }, isMobile: w < 1024, hasTouch: w < 1024, locale: 'ar-KW', timezoneId: 'Asia/Kuwait' });
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
          const ar = await page.evaluate(arabicOnScreen);
          const at = `${st.name}@${w}`;
          f.pages++;
          ar.forEach(t => f.arabic.push(at + ': ' + t));
          errors.splice(0).forEach(e => f.errors.push(at + ': ' + e));
          await page.evaluate(() => { closeModal(); const lb = document.getElementById('lightbox'); if(lb) lb.classList.remove('show'); try{ hideProReport(); }catch(e){} }).catch(() => {});
        }
        await ctx.close();
      }
    }
  }
  for(const [key, f] of Object.entries(found)){
    check(`${key}, the browser in Arabic, a laptop and a phone (${f.pages} pages: every view and its sheets): no Arabic on an English screen`, f.pages > 60 && f.arabic.length === 0, f.arabic.slice(0, 40));
    check(`${key}: no page or console error`, f.errors.length === 0, f.errors.slice(0, 10));
  }
  if(process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(found, null, 1)); // every finding, for the one fixing them
  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
