// Clinic owners and prices changed outside the supervisor's screens (v129, the security audit's C4). The rules let any
// team login write the clinic list and the catalog whole, so a rep's direct write moved another rep's clinic to her —
// its sales lines with it, closed months included — or changed a price, while the app's screens let only the
// supervisor do that; on 65f9a90 nothing said so. The supervisor's phone now keeps what it last saw of those decisions
// and says what changed other than by his own taps; nothing is written back without his tap.
//   W1  the supervisor's first open only notes what it sees: nothing is listed, nothing written
//   W2  a rep's direct write (another rep's clinic made hers, a price changed): his next refresh lists both
//   W3  "Put back" asks first, the second tap saves the earlier owner again — the cloud's list has it back
//   W4  "Keep" takes the new price: nothing written, the card goes
//   W5  his own handover (Admin → Territory) is never listed as made elsewhere
//   W6  a rep's phone shows no such card
//   W7  in Arabic: the card and the sheet in Arabic
//   W8  guard: no page errors
// Invented data, a fake cloud, a fixed clock (Tue 10 Nov 2026, 10:00). Port 8312. Env: WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8312, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const cloud = {}, writes = [];
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { writes.push(k); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { writes.push(k); cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info).slice(0, 600):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'm1', name: 'Alpha Dental Clinic (invented)', rep: M, cls: 'B', doctors: [] },
    { id: 'r1', name: 'Beta Dental Clinic (invented)', rep: R, cls: 'B', doctors: [] },
    { id: 'r2', name: 'Gamma Clinic (invented)', rep: R, cls: 'A', doctors: [] },
  ]);
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Plain floss (invented)', brand: 'TePe', cat: 'Floss', price: 2 }, { id: 'p2', name: 'Soft brush (invented)', brand: 'TePe', cat: 'Brush', price: 3 }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.erpMap = '{}';
  cloud.targets = JSON.stringify({ [M]: { revenue: 1000, month: '2026-11' }, [R]: { revenue: 1000, month: '2026-11' } });
}
(async()=>{
  const server = http.createServer((req,res)=>{
    const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
  });
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = [];
  const open = async (who, role, lang) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: '+m.text()); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
    await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
    await page.exposeFunction('__cSetMany', api.setMany);
    await page.addInitScript(l => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v),
        setMany: async entries => window.__cSetMany(entries),
        delete: async k => window.__cDel(k),
        list: async p => ({ keys: await window.__cList(p) }),
      };
      if(l) try{ localStorage.setItem('ultramed_lang', l); }catch(e){}
      const off = new Date(2026, 10, 10, 10, 0, 0).getTime() - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => ms === 20000 ? -1 : _si(fn, ms, ...a);
    }, lang || null);
    await page.goto(URL); await page.waitForTimeout(200);
    await page.evaluate(async a => { await selectUser(a[0], a[1]); if(typeof msWhenReady === 'function') await msWhenReady(); }, [who, role]);
    await page.waitForTimeout(300);
    return { ctx, page };
  };
  const card = page => page.evaluate(() => { const el = document.getElementById('ownerWatch'); return el && el.style.display !== 'none' ? el.innerText.replace(/\s+/g, ' ').trim() : ''; });
  const refresh = page => page.evaluate(async () => { await loadAll(); await new Promise(r => setTimeout(r, 200)); });
  const sheetText = page => page.evaluate(() => document.getElementById('modalInner').innerText.replace(/\s+/g, ' '));
  const tapIn = (page, re, nth) => page.evaluate(a => { const bs = [...document.querySelectorAll('#modalInner button')].filter(b => new RegExp(a[0]).test(b.textContent)); const b = bs[a[1] || 0]; if(!b) throw new Error('no button ' + a[0]); b.click(); }, [re.source, nth || 0]);
  try{
    seed();
    let { ctx, page } = await open(G, 'supervisor');
    const w0 = writes.filter(k => k === 'clinics' || k === 'products').length;
    check('W1 the supervisor\'s first open notes what it sees: nothing listed, nothing written', !(await card(page)) && w0 === 0, { card: await card(page), w0 });
    // W2 — a rep writes the documents directly: Renova's clinic r1 made Mariam's, a price changed
    const cs = JSON.parse(cloud.clinics); cs.find(c => c.id === 'r1').rep = M; cloud.clinics = JSON.stringify(cs);
    const ps = JSON.parse(cloud.products); ps.find(p => p.id === 'p1').price = 0.5; cloud.products = JSON.stringify(ps);
    await refresh(page);
    const c2 = await card(page);
    await page.evaluate(() => openOwnerWatch()); await page.waitForTimeout(150);
    const s2 = await sheetText(page);
    check('W2 a rep\'s direct write: his next refresh lists the clinic made hers and the changed price', /Clinic owners or prices changed outside your screens \(2\)/.test(c2)
      && /Beta Dental Clinic/.test(s2) && /Owner: Renova → Mariam/.test(s2) && /Plain floss/.test(s2) && /Price: 2\.00 KD → 0\.50 KD/.test(s2), { c2, s2: s2.slice(0, 400) });
    // W3 — Put back: asked first, then saved
    const before = writes.length;
    await tapIn(page, /Put back/, 0); await page.waitForTimeout(150);
    const asked = await sheetText(page), wroteOnAsk = writes.length - before;
    await tapIn(page, /Yes, put it back/); await page.waitForTimeout(400);
    const r1 = JSON.parse(cloud.clinics).find(c => c.id === 'r1');
    check('W3 "Put back" asks first (nothing written), the second tap saves the earlier owner again', /Put back what this phone saw before\?/.test(asked) && wroteOnAsk === 0 && r1.rep === R && /\(1\)/.test(await card(page)), { asked: asked.slice(0, 200), wroteOnAsk, r1, card: await card(page) });
    // W4 — Keep the price
    const beforeKeep = writes.length;
    await page.evaluate(() => openOwnerWatch()); await page.waitForTimeout(100);
    await tapIn(page, /^\s*Keep\s*$/); await page.waitForTimeout(200);
    check('W4 "Keep" takes the new price: nothing written, the card goes', writes.length === beforeKeep && !(await card(page)) && JSON.parse(cloud.products).find(p => p.id === 'p1').price === 0.5, { wrote: writes.slice(beforeKeep), card: await card(page) });
    await page.evaluate(() => closeModal());
    // W5 — his own handover
    await page.evaluate(async () => { await reassignClinic('r2', 'Mariam'); });
    await refresh(page);
    check('W5 his own handover is never listed as made elsewhere', !(await card(page)) && JSON.parse(cloud.clinics).find(c => c.id === 'r2').rep === M, await card(page));
    await ctx.close();
    // W6 — a rep's phone
    ({ ctx, page } = await open(M, 'rep'));
    const cs6 = JSON.parse(cloud.clinics); cs6.find(c => c.id === 'r1').rep = M; cloud.clinics = JSON.stringify(cs6);
    await refresh(page);
    check('W6 a rep\'s phone shows no such card', !(await card(page)), await card(page));
    await ctx.close();
    // W7 — Arabic (a fresh supervisor phone notes first; then a direct write)
    seed();
    ({ ctx, page } = await open(G, 'supervisor', 'ar'));
    const cs7 = JSON.parse(cloud.clinics); cs7.find(c => c.id === 'r1').rep = M; cloud.clinics = JSON.stringify(cs7);
    await refresh(page);
    const c7 = await card(page);
    await page.evaluate(() => openOwnerWatch()); await page.waitForTimeout(150);
    const s7 = await sheetText(page);
    check('W7 in Arabic: the card and the sheet in Arabic', /أصحاب عيادات أو أسعار تغيّرت من خارج شاشاتك/.test(c7) && /مراجعة/.test(c7) && /تغيّرت من خارج شاشاتك/.test(s7) && /إرجاع/.test(s7) && /إبقاء/.test(s7)
      && !/Put back|Keep|Owner|Changed outside/.test(s7 + c7), { c7, s7: s7.slice(0, 300) });
    await ctx.close();
    check('W8 guard: no page errors', errors.length === 0, errors.slice(0, 5));
  } catch(e){ check('harness ran without throwing', false, e.stack); }
  finally {
    await browser.close(); server.close();
    console.log(results.join('\n'));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
