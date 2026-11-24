// One wrong-typed value in a shared list never stops the app (v129, the security audit's C6). On 65f9a90 a stored
// "dayPlans": null made start-up throw on the main screen for every person who signed in, on every open, and a clinic
// name stored as a number did the same for that clinic's owner and the supervisor — the target card, figures,
// follow-ups and recent activity stayed empty and _bootLoaded never became true (the daily backup and the queue's
// upload never ran). Any team login can write such a value: the rules check only that the document is text.
//   R1  dayPlans = null: a rep and the supervisor sign in; the start completes and the main screen is drawn
//   R2  a clinic name that is a number: its owner and the supervisor sign in; the start completes, the clinic shows as text
//   R3  a catalog holding a null, a text and a product whose name is a number: the Products screen draws the products
//   R4  a plan saved afterwards keeps every good day and entry the cloud held (nothing good is lost by the clean-up)
//   R5  guard: no page error other than the cards that are told to have failed (none expected here)
// Invented data, a fake cloud, a fixed clock (Tue 10 Nov 2026, 10:00). Port 8310. Env: WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8310, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const cloud = {};
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info).slice(0, 600):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
function seed(over){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'a', name: 'Alpha Dental Clinic (invented)', rep: M, cls: 'B', doctors: [], nextFollowUp: '2026-11-02' },
    { id: 'b', name: 'Beta Dental Clinic (invented)', rep: R, cls: 'B', doctors: [] },
  ]);
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Plain floss (invented)', brand: 'TePe', cat: 'Floss', price: 2 }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.erpMap = '{}';
  cloud.dayPlans = JSON.stringify({ '2026-11-12': { [M]: [{ id: 'a', note: 'good' }] } });
  cloud.targets = JSON.stringify({ [M]: { revenue: 1000, month: '2026-11' }, [R]: { revenue: 1000, month: '2026-11' } });
  Object.assign(cloud, over || {});
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
  const open = async (who, role) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(who + ': ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push(who + ' console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
    await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
    await page.exposeFunction('__cSetMany', api.setMany);
    await page.addInitScript(() => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v),
        setMany: async entries => window.__cSetMany(entries),
        delete: async k => window.__cDel(k),
        list: async p => ({ keys: await window.__cList(p) }),
      };
      const off = new Date(2026, 10, 10, 10, 0, 0).getTime() - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => ms === 20000 ? -1 : _si(fn, ms, ...a);
    });
    await page.goto(URL); await page.waitForTimeout(200);
    const r = await page.evaluate(async a => {
      let err = null;
      try{ await selectUser(a[0], a[1]); if(typeof msWhenReady === 'function') await msWhenReady(); }catch(e){ err = e.message; }
      await new Promise(r => setTimeout(r, 300));
      const t = id => ((document.getElementById(id) || {}).innerText || '').replace(/\s+/g, ' ').trim();
      return { err, boot: typeof _bootLoaded !== 'undefined' && _bootLoaded === true, target: t('targetCard') || t('msSales'), due: t('dueList') };
    }, [who, role]);
    return { ctx, page, r };
  };
  try{
    // R1 — dayPlans = null
    seed({ dayPlans: 'null' });
    for(const [who, role] of [[M, 'rep'], [G, 'supervisor']]){
      const { ctx, r } = await open(who, role);
      check(`R1 dayPlans = null: ${who} signs in, the start completes and the main screen is drawn`, !r.err && r.boot && /target|Target|KD/.test(r.target), r);
      await ctx.close();
    }
    // R2 — a clinic whose name is a number
    seed({ clinics: JSON.stringify([
      { id: 'a', name: 5, rep: M, cls: 'B', doctors: [], nextFollowUp: '2026-11-02' },
      { id: 'b', name: 'Beta Dental Clinic (invented)', rep: R, cls: 'B', doctors: [] }]) });
    for(const [who, role] of [[M, 'rep'], [G, 'supervisor']]){
      const { ctx, page, r } = await open(who, role);
      const list = await page.evaluate(() => { switchView('clinics'); setClinicMode('list'); return [...document.querySelectorAll('#clinicList .clinic-name')].map(x => x.textContent.trim()); }).catch(e => 'threw ' + e.message);
      check(`R2 a clinic name that is a number: ${who} signs in, the start completes, the clinic shows as text`, !r.err && r.boot && /\b5\b/.test(r.due) && Array.isArray(list) && list.some(x => /^5\b/.test(x)), { r, list });
      await ctx.close();
    }
    // R3 — a catalog with odd entries
    seed({ products: JSON.stringify([null, 'x', { id: 'p2', name: 77, brand: 'TePe', price: 1 }, { id: 'p1', name: 'Plain floss (invented)', brand: 'TePe', cat: 'Floss', price: 2 }]) });
    {
      const { ctx, page, r } = await open(G, 'supervisor');
      const prod = await page.evaluate(() => { try{ switchView('products'); return document.getElementById('view-products').innerText.replace(/\s+/g, ' '); }catch(e){ return 'threw ' + e.message; } });
      check('R3 a catalog holding a null, a text and a number for a name: the start completes and the Products screen draws', !r.err && r.boot && !/^threw/.test(prod) && /TePe/.test(prod), { r, prod: prod.slice(0, 160) });
      await ctx.close();
    }
    // R4 — a plan saved after the clean-up keeps every good day and entry
    seed({ dayPlans: JSON.stringify({ '2026-11-12': { [M]: [{ id: 'a', note: 'good' }], bad: null }, '2026-11-13': 'odd', '2026-11-14': { [M]: ['a', { id: 'b' }] } }) });
    {
      const { ctx, page, r } = await open(M, 'rep');
      const saved = await page.evaluate(async () => { (dayPlans['2026-11-16'] = dayPlans['2026-11-16'] || {})['Mariam'] = [{ id: 'a', note: '' }]; const x = await persistTold('dayPlans'); return x.ok; });
      const dp = JSON.parse(cloud.dayPlans || '{}');
      check('R4 a plan saved afterwards keeps every good day and entry the cloud held', saved && dp['2026-11-12'] && dp['2026-11-12'][M] && dp['2026-11-12'][M][0].note === 'good'
        && JSON.stringify(dp['2026-11-14'] && dp['2026-11-14'][M]) === JSON.stringify(['a', { id: 'b' }]) && dp['2026-11-16'] && dp['2026-11-16'][M], { saved, dp, r });
      await ctx.close();
    }
    check('R5 guard: no page errors', errors.length === 0, errors.slice(0, 6));
  } catch(e){ check('harness ran without throwing', false, e.stack); }
  finally {
    await browser.close(); server.close();
    console.log(results.join('\n'));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
