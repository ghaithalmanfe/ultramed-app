// Month rollover: the same account opened on 2026-10-01 (clock shifted).
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, salesFixture, blockFirebase } = require('./_env.js');
const PORT = 8211;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const cloud = {};
const api = { get: async k => k in cloud ? cloud[k] : null, set: async (k, v) => { cloud[k] = v; return true; }, setMany: async e => { e.forEach(([k, v]) => { cloud[k] = v; }); return true; }, del: async k => { delete cloud[k]; return true; }, list: async p => Object.keys(cloud).filter(k => k.startsWith(p)) };
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,500):'')); if(!ok) failed++; }
const SEED = JSON.parse(fs.readFileSync(WWW + '/sales-seed-aug26.json', 'utf8'));
const SALES_B64 = fs.readFileSync(salesFixture()).toString('base64');
const REAL_TODAY = new Date(); // container clock (any day); the first context is pinned to 2026-09-21
const SEP_OFFSET = new Date('2026-09-21T10:00:00').getTime() - REAL_TODAY.getTime();
const targetDay = new Date('2026-10-01T09:00:00'); // Kuwait morning of Oct 1
const OFFSET = targetDay.getTime() - REAL_TODAY.getTime();

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext();
  await blockFirebase(ctx);
  const page = await ctx.newPage();
  const errors = []; let acceptDialogs = false;
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load/i.test(m.text())) errors.push('console: '+m.text().slice(0,200)); });
  page.on('dialog', async d => { if(acceptDialogs) await d.accept(); else await d.dismiss(); });
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set); await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript((off) => {
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
    if(off){ const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate; }
  }, SEP_OFFSET);
  const boot = async (off, who='Dr. Ghaith', role='supervisor') => {
    await page.addInitScript((o) => { window.__dateOffset = o; }, off);
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(300);
  };
  // seed: clinics, September visits, September DSR targets (as-of Sep 14), Aug ERP seed, and the real Sep sales file
  const c1 = { id:'c1', name:'Dental 8 Clinic', rep:'Mariam', cls:'A', doctors:[{id:'d1', name:'Dr. Ahmed'}] }, c2 = { id:'c2', name:'Crown Dental Center', rep:'Renova', cls:'A', doctors:[] };
  cloud.clinics = JSON.stringify([c1, c2]);
  cloud.visits = JSON.stringify([
    { id:'v1', clinicId:'c1', rep:'Mariam', date:'2026-09-15', ts:1, doctorIds:['d1'], products:[], orderTaken:true, orders:[{id:'o1', items:[{productId:'x', qty:1}], discountPct:0, gross:100, discountAmount:0, total:100, notes:''}], orderItems:{x:1}, orderGross:100, orderDiscount:0, orderTotal:100, nextFollowUp:'2026-10-02' },
    { id:'v2', clinicId:'c1', rep:'Mariam', date:'2026-09-29', ts:2, doctorIds:['d1'], products:[], orderTaken:false, orderTotal:0 },
    { id:'v3', clinicId:'c2', rep:'Renova', date:'2026-09-30', ts:3, doctorIds:[], products:[], orderTaken:false, orderTotal:0 },
  ]);
  cloud.targets = JSON.stringify({ Mariam: { revenue: 9071.2, visits: 40, achieved: 791.18, achievedAsOf: '2026-09-05', month: '2026-09', brands: { Waterpik: 1000 }, achievedBrands: { Waterpik: 200 } }, Renova: { revenue: 11364.8, visits: 40, achieved: 449.67, achievedAsOf: '2026-09-05', month: '2026-09' } });
  cloud.erpSales = JSON.stringify({ periods: [{ id:'seed_sales3_aug26', from: SEED.from, to: SEED.to, net: SEED.net, rowCount: SEED.rowCount, repMap: SEED.repMap, rows: SEED.rows, importedAt:'2026-08-27T00:00:00Z' }], repMapGlobal: SEED.repMap, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, returnPolicy: 'erp' });

  // ---- September 21: upload the sales file, note the figures ----
  await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(200);
  await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); });
  await page.waitForTimeout(300);
  await page.evaluate(async (b64) => { const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer; openErpImport(); await erpImportXlsx(buf, 'Ultramed_Sales3_28.xlsx'); await new Promise(r => setTimeout(r, 300)); closeModal(); }, SALES_B64);
  const sep = await page.evaluate(() => ({ today: todayStr(), pct: targetPctMap(), team: teamTargetNow(), card: (document.getElementById('targetCard')||{}).innerText || '' }));
  check('Sep 21: figures as expected before the rollover', sep.today==='2026-09-21' && sep.pct.Mariam && sep.pct.Renova && /DSR Sep 5 \+ ERP/.test(sep.pct.Mariam.src), { today: sep.today, pct: sep.pct, team: sep.team.pct });

  // ---- October 1 morning: same account, clock moved on ----
  const ctx2 = await browser.newContext(); await blockFirebase(ctx2);
  const p2 = await ctx2.newPage();
  const errors2 = [];
  p2.on('pageerror', e => errors2.push('pageerror: ' + e.message));
  p2.on('dialog', async d => { await d.dismiss(); });
  await p2.exposeFunction('__cGet', api.get); await p2.exposeFunction('__cSet', api.set); await p2.exposeFunction('__cDel', api.del); await p2.exposeFunction('__cList', api.list); await p2.exposeFunction('__cSetMany', api.setMany);
  await p2.addInitScript((off) => {
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  }, OFFSET);
  await p2.goto(`http://localhost:${PORT}/index.html`); await p2.waitForTimeout(250);
  await p2.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); }); await p2.waitForTimeout(400);
  const oct = await p2.evaluate(() => {
    const out = { today: todayStr(), pct: targetPctMap(), card: (document.getElementById('targetCard')||{}).innerText || '', nudge: (document.getElementById('erpNudge')||{}).innerText || '', hero: (document.getElementById('heroCard')||{}).innerText || '' };
    out.mtd = erpMtdMap();
    out.hist = Object.keys((targets._history||{}));
    renderMonthClose('2026-09'); out.sepReport = (document.getElementById('modalInner')||{}).innerText || ''; closeModal();
    renderMonthClose('2026-10'); out.octReport = (document.getElementById('modalInner')||{}).innerText || ''; closeModal();
    switchView('reports'); reportRange = 30; renderReports(); out.reports = (document.getElementById('view-reports')||{}).innerText.length;
    return out;
  });
  check('Oct 1: the app sees the new month', oct.today==='2026-10-01', oct.today);
  check('Oct 1: month-to-date sales restart from zero (no October invoices yet)', Object.keys(oct.mtd).length===0, oct.mtd);
  check('Oct 1: the Today card flags that the target is from September and asks for the new DSR', /Target is from September 2026/.test(oct.card) && /المدخلات الشهرية مطلوبة/.test(oct.nudge) && /2026|October/.test(oct.nudge), { card: oct.card.split('\n').filter(l=>/Target is|Source/.test(l)), nudge: oct.nudge.slice(0,70) });
  check('Oct 1: September\'s official figures were archived and its month report still shows target/achieved/%', oct.hist.includes('2026-09') && /التارغت/.test(oct.sepReport) && /9071\.20/.test(oct.sepReport) && /%/.test(oct.sepReport), { hist: oct.hist, sep: oct.sepReport.split('\n').slice(0,10) });
  check('Oct 1: the hero week (Sun 27 Sep – Thu 1 Oct) counts the Sep 29/30 visits, nothing from mid-September', /2 visits/.test(oct.hero), oct.hero.split('\n').slice(0,3));
  check('Oct 1: reports view renders across the month boundary', oct.reports > 200, oct.reports);
  // upload October's DSR (synthetic, as parseDsrTargets would return it)
  const afterDsr = await p2.evaluate(async () => {
    await applyTargetsFile({ targets: { Mariam: { revenue: 9500, achieved: 120.5, achievedAsOf: '2026-10-01', brands: { Waterpik: 1200 }, achievedBrands: {} }, Renova: { revenue: 12000, achieved: 0, achievedAsOf: '2026-10-01', brands: {}, achievedBrands: {} } }, matched: [{ rep: 'Mariam', name: 'Mariam Zohair', revenue: 9500, achieved: 120.5 }, { rep: 'Renova', name: 'Ranova Ayman', revenue: 12000 }], unmatched: [] });
    closeModal();
    return { pct: targetPctMap(), card: (document.getElementById('targetCard')||{}).innerText || '', nudge: (document.getElementById('erpNudge')||{}).innerText || '', month: targets.Mariam.month, hist: Object.keys(targets._history||{}) };
  });
  check('Oct 1: after uploading October\'s DSR the target is October\'s, the stale note and the month-inputs card disappear, Sep stays archived', afterDsr.month==='2026-10' && !/Target is from/.test(afterDsr.card) && !/المدخلات الشهرية/.test(afterDsr.nudge) && afterDsr.pct.Mariam.pct===1 && /DSR official Oct 1/.test(afterDsr.pct.Mariam.src) && afterDsr.hist.includes('2026-09'), { pct: afterDsr.pct, month: afterDsr.month, hist: afterDsr.hist });
  check('Oct 1: no page errors', errors2.length===0 && errors.length===0, errors2.concat(errors).slice(0,4));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
