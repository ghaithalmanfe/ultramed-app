// Stored script from a team member's records (v129, the security audit's C1 and C2). Any team login can store any
// text in the shared lists; these probes are what the audit's verifiers stored, and on 65f9a90 each ran as script in
// the supervisor's signed-in page:
//   C1  a value inside an inline handler's JavaScript: a plan entry's clinic id (raw — it ran on the Today screen
//       with no tap), a rep key escaped with esc() (HTML encoding, decoded again before the handler runs), a clinic id
//       in the clinic list, a product key in the product list and in the supervisor's Edit chip, a chat photo id,
//       a memory id
//   C2  a value placed into markup unescaped: a clinic's class (Today's follow-ups, with no tap; the clinic card),
//       a visit photo's preview in src="…" (the clinic card, the visit log, Edit visit), a chat and a memory preview,
//       a memory's tag, the daily backup's photo count, a product price in value="…" (Admin → Catalog, Edit product),
//       an order quantity (the product detail), a visit's follow-up date (Edit visit)
// Each probe calls __hit(tag); after every screen no probe ran and no injected node is in the page. Positive
// controls: the very same odd ids still work — the clinic row with a quote in its id opens that clinic, the chat
// photo and the memory open the photo with their exact ids, Reschedule opens for the odd rep key.
// Invented data only, a fake cloud, a fixed clock (Tue 10 Nov 2026, 10:00); nothing leaves localhost. Port 8308.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8308, URL = `http://localhost:${PORT}/index.html`;
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
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info).slice(0, 700):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
const hit = t => `__hit('${t}')`;
const IMG = t => `<img src=x data-xs=${t} onerror=__hit("${t}")>`;
const ATTR = t => `x" data-xs="${t}" onerror="__hit('${t}')`;
const CLINIC_Q = `c2'+${hit('T1')}+'`, REP_Q = `Renova'+${hit('T2')}+'`, PROD_Q = `p9'+${hit('T3')}+'`;
const PHOTO_Q = `ph1'+${hit('C1')}+'`, MEM_Q = `mem1'+${hit('M1')}+'`;
const PLAN_BREAK = `c9" data-xs="plan"><img data-xs="plan" src="x" onerror="__hit('plan')">`;
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Alpha Dental (invented)', rep: M, cls: IMG('cls'), nextFollowUp: '2026-11-01', doctors: [] },
    { id: CLINIC_Q, name: 'Beta Dental (invented)', rep: M, cls: 'B', doctors: [] },
    { id: 'c3', name: 'Gamma Clinic (invented)', rep: R, cls: 'A', doctors: [] },
  ]);
  cloud.products = JSON.stringify([
    { id: PROD_Q, name: 'Gamma Paste (invented)', brand: 'TePe', cat: 'Paste', price: `"><img src=x data-xs=price onerror=__hit("price")>` },
    { id: 'p1', name: 'Plain Floss (invented)', brand: 'TePe', cat: 'Floss', price: 2 },
  ]);
  cloud.visits = JSON.stringify([
    { id: 'v1', clinicId: 'c1', rep: M, date: '2026-11-05', ts: 1793000000000, doctorIds: [], notes: 'invented',
      photos: [{ id: 'ph-v1', thumb: ATTR('thumb') }], nextFollowUp: `"><img src=x data-xs=follow onerror=__hit("follow")>` },
    { id: 'v2', clinicId: 'c3', rep: R, date: '2026-11-06', ts: 1793000100000, doctorIds: [], notes: '', orderTaken: true,
      products: [PROD_Q], orders: [{ id: 'o1', items: [{ productId: PROD_Q, qty: IMG('qty') }] }], orderItems: [] },
  ]);
  cloud.dayPlans = JSON.stringify({ '2026-11-09': { [M]: [{ id: PLAN_BREAK, note: '' }] }, '2026-11-08': { [REP_Q]: [{ id: 'c1', note: '' }] } });
  cloud.chat = JSON.stringify([{ id: 'm1', who: M, text: 'photo from the road', photoId: PHOTO_Q, thumb: ATTR('chat'), ts: 1793000200000 }]);
  cloud.memories = JSON.stringify([{ id: MEM_Q, who: M, cap: 'a memory', tag: IMG('memtag'), thumb: ATTR('memthumb'), ts: 1793000300000 }]);
  cloud['snap_2026-11-10'] = JSON.stringify({ day: '2026-11-10', clinics: [], visits: [], tasks: [], slim: { photos: IMG('snap') } });
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.erpMap = '{}';
  cloud.targets = JSON.stringify({ [M]: { revenue: 1000, month: '2026-11' }, [R]: { revenue: 1000, month: '2026-11' } });
}
(async()=>{
  const server = http.createServer((req,res)=>{
    const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
  });
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = [];
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
    window.__hits = [];
    window.__hit = t => { window.__hits.push(t); };
    const off = new Date(2026, 10, 10, 10, 0, 0).getTime() - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => ms === 20000 ? -1 : _si(fn, ms, ...a);
  });
  const wait = ms => page.waitForTimeout(ms || 250);
  const state = () => page.evaluate(() => ({ hits: window.__hits.slice(), nodes: [...document.querySelectorAll('[data-xs]')].map(n => n.getAttribute('data-xs') + '@' + ((n.closest('[id]') || {}).id || '?')) }));
  const clear = () => page.evaluate(() => { window.__hits = []; document.querySelectorAll('[data-xs]').forEach(n => n.remove()); });
  const step = async (name, fn) => {
    await clear();
    let err = null;
    try { await fn(); } catch(e){ err = e.message.split('\n')[0]; }
    await wait(300);
    const s = await state();
    check(name, !err && !s.hits.length && !s.nodes.length, { err, hits: s.hits, nodes: s.nodes });
    return s;
  };
  const click = (sel, re) => page.evaluate(a => { const el = [...document.querySelectorAll(a[0])].find(x => !a[1] || new RegExp(a[1]).test(x.textContent)); if(!el) throw new Error('not found: ' + a[0] + ' ' + a[1]); el.click(); }, [sel, re ? re.source : null]);
  try{
    seed();
    await page.goto(URL); await wait(200);
    // a spy on the photo viewer: which id it was asked to open
    await page.evaluate(() => { window.__lb = []; const o = window.showLightbox; window.showLightbox = function(id, cap){ window.__lb.push(id); return o.apply(this, arguments); }; });
    await step('Today right after the supervisor signs in: no plan id, rep key or clinic class runs (C1 plan id, C2 class — no tap)', async () => {
      await page.evaluate(async g => { await selectUser(g, 'supervisor'); if(typeof msWhenReady === 'function') await msWhenReady(); }, G);
      await wait(400);
    });
    const today = await page.evaluate(() => ({ missed: (document.getElementById('missedList') || {}).innerText || '', due: (document.getElementById('dueList') || {}).innerText || '' }));
    check('guard: the Today screen lists the missed plans and the overdue follow-up', /Alpha Dental/.test(today.missed) && /Alpha Dental/.test(today.due), today);
    await step('Reschedule on the plan of an odd rep key: nothing runs (C1, esc() inside a handler)', async () => {
      await click('#missedList button', /Reschedule/);
    });
    const resch = await page.evaluate(() => !!document.querySelector('#modalInner') && /Move visit|Reschedule/i.test(document.getElementById('modalInner').innerText));
    check('positive control: the reschedule sheet opens for that rep key', resch);
    await page.evaluate(() => closeModal());
    await step('Customers → List: tapping the clinic whose id holds a quote runs nothing (C1 raw id)', async () => {
      await page.evaluate(() => { switchView('clinics'); setClinicMode('list'); }); await wait(200);
      await click('#clinicList .cl-row', /Beta Dental/);
    });
    const opened = await page.evaluate(() => (document.getElementById('modalInner') || {}).innerText || '');
    check('positive control: that row opens Beta Dental\'s card', /Beta Dental \(invented\)/.test(opened), opened.slice(0, 120));
    await page.evaluate(() => closeModal());
    await step('Clinic card with a crafted class and a crafted photo preview: nothing runs (C2)', async () => {
      await page.evaluate(() => openClinicDetail('c1'));
    });
    await page.evaluate(() => closeModal());
    await step('Products: tapping the product whose id holds a quote runs nothing (C1)', async () => {
      await page.evaluate(() => switchView('products')); await wait(200);
      await page.evaluate(() => { document.querySelectorAll('#view-products details').forEach(d => { d.open = true; }); const g = [...document.querySelectorAll('#view-products [onclick]')].find(x => /^TePe/.test(x.textContent.trim())); if(g && !document.querySelector('.product-item')) g.click(); });
      await wait(150);
      await click('.product-item', /Gamma Paste/);
    });
    await step('Product detail with a crafted order quantity, then the supervisor\'s Edit chip and Edit product: nothing runs (C1 esc() key, C2 qty and price)', async () => {
      const k = await page.evaluate(() => { const p = products.find(x => /Gamma Paste/.test(x.name)); openProductDetail(productKey(p)); return productKey(p); });
      await wait(200);
      await click('#modalInner button', /Edit/);
    });
    await page.evaluate(() => closeModal());
    await step('Admin → Catalog with a crafted price: nothing runs (C2)', async () => {
      await page.evaluate(() => { openAdminPanel(); setAdminTab('prices'); });
    });
    await page.evaluate(() => closeModal());
    await step('Visit log, then Edit visit with a crafted preview and follow-up date: nothing runs (C2)', async () => {
      await page.evaluate(() => openVisitLog()); await wait(250);
      await page.evaluate(() => openEditVisit('v1'));
    });
    await page.evaluate(() => closeModal());
    await step('Team chat with a crafted photo id and preview, and tapping the photo: nothing runs (C1, C2)', async () => {
      await page.evaluate(async () => { switchView('team'); if(typeof loadTeam === 'function') await loadTeam(); });
      await wait(300);
      await click('#view-team .msg button, #view-team .msg img');
    });
    await page.evaluate(() => closeLightbox(null, true));
    await step('Memories with a crafted tag, preview and id, and tapping the memory: nothing runs (C1, C2)', async () => {
      await page.evaluate(() => setTeamTab('mem')); await wait(250);
      await click('.mcard');
    });
    const lb = await page.evaluate(() => window.__lb.slice());
    check('positive control: the chat photo and the memory open with their exact ids', lb.includes("ph1'+__hit('C1')+'") && lb.includes("mem1'+__hit('M1')+'"), lb);
    await page.evaluate(() => closeLightbox(null, true));
    await step('Export → Automatic backups with a crafted photo count in today\'s backup: nothing runs (C2)', async () => {
      await page.evaluate(() => { switchView('today'); openExport(); }); await wait(600);
    });
    check('no page or console error', errors.length === 0, errors.slice(0, 6));
  } catch(e){ check('harness ran without throwing', false, e.stack); }
  finally {
    await browser.close(); server.close();
    console.log(results.join('\n'));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
