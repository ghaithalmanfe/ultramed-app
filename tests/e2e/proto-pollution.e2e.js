// A stored "__proto__" never reaches Object.prototype (v129, the security audit's C3). On 65f9a90 a team member's visit
// with clinicId "__proto__", ordering a catalog product whose category is "authoritative", wrote
// Object.prototype.authoritative = true the first time any phone opened a clinic card (the sell guide's tallies); every
// later visits save of that phone then took the whole-day Restore's overwrite and deleted the visits other phones had
// saved meanwhile — told "saved". With the category "shared", every clinic counted its invoices for their issuer.
//   P1  opening a clinic card with those records leaves Object.prototype clean (no "authoritative", "shared", n, orders)
//   P2  another phone's visit saved meanwhile is still in the cloud after this phone's ordinary save (and the save landed)
//   P3  a clinic stays not shared: its invoices count for its owner (UMCore.clinicSharedOn)
//   P4  a delete log or a day plan holding a "__proto__" key changes nothing outside it (a delete made here, a plan
//       saved here), and the parsed documents do not keep the key
//   P5  guard: the clinic card still opens and draws its sell guide; no page errors
// Invented data, a fake cloud, a fixed clock (Tue 10 Nov 2026, 10:00). Port 8309. Env: WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8309, URL = `http://localhost:${PORT}/index.html`;
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
const V = (id, clinicId, rep, date, x) => Object.assign({ id, clinicId, rep, date, ts: 1793000000000, doctorIds: [], notes: '', products: [], orders: [], orderItems: [] }, x || {});
const order = pid => ({ orderTaken: true, products: [pid], orders: [{ id: 'o-' + pid, items: [{ productId: pid, qty: 1 }] }], orderTotal: 1 });
function seed(cat){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'a', name: 'Alpha Dental Clinic (invented)', rep: M, cls: 'B', doctors: [] },
    { id: 'b', name: 'Beta Dental Clinic (invented)', rep: R, cls: 'B', doctors: [] },
  ]);
  cloud.products = JSON.stringify([
    { id: 'pq', name: 'Probe kit Q (invented)', brand: 'Probe', cat, price: 1 },
    { id: 'p1', name: 'Plain floss (invented)', brand: 'TePe', cat: 'Floss', price: 2 },
  ]);
  cloud.visits = JSON.stringify([
    V('v1', 'b', R, '2026-11-03', order('p1')), V('v2', 'a', M, '2026-11-04'),
    V('vq1', 'b', R, '2026-11-05', order('pq')), V('vqz', '__proto__', R, '2026-11-05', order('pq')),
  ]);
  cloud.tombs = JSON.stringify({ clinics: {}, visits: {}, tasks: {}, events: {}, dayPlans: {}, doctors: {}, ['__proto__']: { authoritative: 1793000000000, shared: 1793000000000 } });
  cloud.dayPlans = JSON.stringify({ '2026-11-12': { [M]: [{ id: 'a', note: '' }] }, ['__proto__']: { authoritative: [{ id: 'a' }] } });
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.erpMap = '{}';
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
  const open = async () => {
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
    await page.evaluate(async g => { await selectUser(g, 'supervisor'); if(typeof msWhenReady === 'function') await msWhenReady(); }, G);
    await page.waitForTimeout(300);
    return { ctx, page };
  };
  const proto = page => page.evaluate(() => Object.getOwnPropertyNames(Object.prototype).filter(k => ['authoritative', 'shared', 'n', 'orders', 'a', 'b'].includes(k)));
  try{
    // P1 + P2 — the deletion gadget
    seed('authoritative');
    let { ctx, page } = await open();
    const card = await page.evaluate(() => { openClinicDetail('a'); return (document.getElementById('modalInner') || {}).innerText || ''; });
    await page.waitForTimeout(200);
    const p1 = await proto(page);
    check('P1 opening a clinic card with a "__proto__" visit leaves Object.prototype clean', p1.length === 0 && ({}).authoritative === undefined, p1);
    check('P5 guard: the clinic card opens', /Alpha Dental Clinic/.test(card), card.slice(0, 120));
    await page.evaluate(() => closeModal());
    // another phone saves a visit this phone has not read
    const vs = JSON.parse(cloud.visits); vs.push(V('vOther', 'a', M, '2026-11-09')); cloud.visits = JSON.stringify(vs);
    const r = await page.evaluate(async () => {
      visits.push({ id: 'vSup', clinicId: 'a', rep: 'Dr. Ghaith', date: '2026-11-10', ts: Date.now(), doctorIds: [], notes: '', products: [], orders: [], orderItems: [] });
      const r = await persistTold('visits'); return { ok: r.ok };
    });
    const ids = JSON.parse(cloud.visits).map(v => v.id);
    check('P2 another phone\'s visit saved meanwhile is still in the cloud after this phone\'s ordinary save', r.ok && ids.includes('vOther') && ids.includes('vSup'), { r, ids });
    // P4 — the delete log and the day plans with a "__proto__" key
    const p4 = await page.evaluate(async () => {
      const parsed = { tombs: Object.keys(UMCore.safeParse('{"__proto__":{"x":1},"visits":{}}', {})), plans: Object.keys(dayPlans || {}) };
      tomb('tasks', 't-gone'); if(typeof persistTombs === 'function') await persistTombs();
      (dayPlans['2026-11-13'] = dayPlans['2026-11-13'] || {})['Mariam'] = [{ id: 'a', note: '' }];
      const rp = await persistTold('dayPlans');
      return { parsed, rp: rp.ok, leaked: Object.getOwnPropertyNames(Object.prototype).filter(k => ['authoritative', 'shared'].includes(k)) };
    });
    check('P4 a delete log or a day plan with a "__proto__" key changes nothing outside it, and the key is not kept',
      p4.leaked.length === 0 && !p4.parsed.tombs.includes('__proto__') && !p4.parsed.plans.includes('__proto__') && p4.rp, p4);
    await ctx.close();
    // P3 — the sales-credit gadget
    seed('shared');
    ({ ctx, page } = await open());
    const p3 = await page.evaluate(() => { openClinicDetail('a'); const c = clinics.find(x => x.id === 'a'); closeModal(); return { shared: UMCore.clinicSharedOn(c, '2026-11-05'), leaked: Object.getOwnPropertyNames(Object.prototype).filter(k => k === 'shared') }; });
    check('P3 a clinic stays not shared after the card is opened: its invoices count for its owner', p3.shared === false && p3.leaked.length === 0, p3);
    const again = await page.evaluate(() => { try{ openClinicDetail('b'); return /Beta Dental/.test(document.getElementById('modalInner').innerText); }catch(e){ return 'threw ' + e.message; } });
    check('P5 guard: a second clinic card opens too (it threw "Cannot create property … on boolean" once polluted)', again === true, again);
    await ctx.close();
    check('P5 guard: no page errors', errors.length === 0, errors.slice(0, 5));
  } catch(e){ check('harness ran without throwing', false, e.stack); }
  finally {
    await browser.close(); server.close();
    console.log(results.join('\n'));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
