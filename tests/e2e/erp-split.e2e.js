// End-to-end check of the split ERP storage against the REAL uploaded file,
// in a real browser, with a fake cloud that survives reloads and can fail.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, salesFixture } = require('./_env.js');
const SALES_B64 = fs.readFileSync(salesFixture()).toString('base64');
const SEED = JSON.parse(fs.readFileSync(WWW + '/sales-seed-aug26.json', 'utf8'));
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});

// ---- fake cloud (lives in Node, so it persists across page reloads) ----
const cloud = {};
const mode = { failSet: null, failGet: null, sets: [], gets: [] };
const api = {
  get: async k => { mode.gets.push(k); if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { mode.sets.push(k); if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set'); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  // atomic like a Firestore batch: refuse everything if any key is set to fail
  setMany: async entries => { entries.forEach(([k]) => mode.sets.push(k)); if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); if(mode.delaySetMs) await new Promise(r => setTimeout(r, mode.delaySetMs)); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }

(async()=>{
  await new Promise(r=>server.listen(8188,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext();
  await ctx.route('**/gstatic.com/**', r => r.abort()); // no real Firebase in the harness
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR/i.test(m.text())) errors.push('console: '+m.text()); });
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
  });
  const boot = async () => {
    await page.goto('http://localhost:8188/index.html'); await page.waitForTimeout(300);
    await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); });
    await page.waitForTimeout(200);
  };
  const state = () => page.evaluate(() => ({
    periods: erpPeriods().map(p => ({ id: p.id, from: p.from, to: p.to, rows: (p.rows||[]).length, rowCount: p.rowCount, net: p.net, missing: !!p.rowsMissing, ref: p.rowsRef && p.rowsRef.key })),
    removed: Object.keys(erpSales.removed || {}),
    loadFailed: !!_loadFailed.erpSales, mirrorUsed: !!_mirrorUsed.erpSales,
    mirrorRows: (() => { try{ const m = JSON.parse(localStorage.getItem('um_mirror:erpSales')); return (m.periods||[]).map(p => (p.rows||[]).length); }catch(e){ return 'none'; } })(),
    mtd: erpMtdMap(), status: (document.getElementById('erpStatus')||{}).textContent || '',
  }));
  const importFile = () => page.evaluate(async (b64) => {
    const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer;
    if(typeof openErpImport === 'function') openErpImport();
    await erpImportXlsx(buf, 'Ultramed_Sales3_28.xlsx');
    await new Promise(r => setTimeout(r, 300));
  }, SALES_B64);
  const cloudKeys = () => Object.keys(cloud).filter(k => /^erp/.test(k)).sort();

  // ---------- 1) LEGACY account: rows inline in the single erpSales document ----------
  cloud.clinics = JSON.stringify([{id:'c1',name:'Dental 8 Clinic',rep:'Mariam',cls:'A'},{id:'c2',name:'Crown Dental Center',rep:'Renova',cls:'A'},{id:'c3',name:'Bayan Dental Center',rep:'Mariam',cls:'B'}]);
  cloud.erpSales = JSON.stringify({ periods: [{ id:'seed_sales3_aug26', from: SEED.from, to: SEED.to, net: SEED.net, rowCount: SEED.rowCount, repMap: SEED.repMap, rows: SEED.rows }],
    repMapGlobal: SEED.repMap, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  const legacyBytes = cloud.erpSales.length;
  await boot();
  let s = await state();
  check('legacy account boots with its August rows inline', s.periods.length===1 && s.periods[0].rows===312 && !s.loadFailed, s.periods);

  mode.sets = [];
  await importFile();
  s = await state();
  const idx = JSON.parse(cloud.erpSales);
  check('Sep 1–21 file auto-imported (2 periods in memory, rows attached)', s.periods.length===2 && s.periods[1].rows===146, s.periods);
  check('index document is now tiny (was ' + legacyBytes + ' bytes)', cloud.erpSales.length < 2500 && idx.periods.every(p => !('rows' in p) && p.rowsRef), { bytes: cloud.erpSales.length, refs: idx.periods.map(p=>p.rowsRef) });
  check('rows live in chunk documents (Aug in 1, Sep in 1)', cloudKeys().filter(k=>k.startsWith('erpRows:')).length===2, cloudKeys());
  check('status line reports success, not an error', !/❌/.test(s.status), s.status);
  const mtd1 = s.mtd;
  check('month-to-date figures computed from the new file', mtd1.Mariam && mtd1.Mariam.asOf==='2026-09-21' && mtd1.Renova && mtd1.Renova.asOf==='2026-09-21', mtd1);
  check('mirror keeps the ASSEMBLED copy (rows inline)', JSON.stringify(s.mirrorRows)===JSON.stringify([312,146]), s.mirrorRows);
  console.log('DBG', JSON.stringify(s).slice(0,1500)); const sepId1 = s.periods[1].id;

  // ---------- 2) RELOAD: boot from index + chunks ----------
  mode.gets = [];
  await boot();
  s = await state();
  check('after reload both periods come back with all rows', s.periods.length===2 && s.periods[0].rows===312 && s.periods[1].rows===146 && !s.loadFailed && !s.mirrorUsed, s.periods);
  check('boot read the index and 2 chunks in parallel', mode.gets.filter(k=>k.startsWith('erpRows:')).length===2, mode.gets.filter(k=>/erp/.test(k)));
  check('MTD identical after reload', JSON.stringify(s.mtd)===JSON.stringify(mtd1), s.mtd);

  // ---------- 3) RE-UPLOAD the same cumulative file: replaces, never piles up ----------
  await importFile(); await page.waitForTimeout(400);
  s = await state();
  check('re-upload replaced the Sep period (still 2 periods, old id tombstoned)', s.periods.length===2 && s.periods[1].id!==sepId1 && s.removed.includes(sepId1), { periods: s.periods.map(p=>p.id), removed: s.removed });
  check('old Sep chunk kept for the grace period (recorded as orphan), new one present', cloudKeys().some(k=>k.includes(sepId1)) && cloudKeys().some(k=>k.includes(s.periods[1].id)) && Object.keys(JSON.parse(cloud.erpSales).orphans||{}).some(k=>k.includes(sepId1)), { keys: cloudKeys(), orphans: JSON.parse(cloud.erpSales).orphans });
  check('MTD unchanged by the re-upload (no double counting)', JSON.stringify(s.mtd)===JSON.stringify(mtd1), s.mtd);

  // ---------- 4) SAVE FAILURE: cloud rejects the chunk write ----------
  const before = await state();
  const cloudBefore = JSON.stringify(cloud);
  mode.failSet = /^erpRows:/;
  await importFile();
  s = await state();
  mode.failSet = null;
  check('failed save is rolled back on screen (same periods as before)', JSON.stringify(s.periods)===JSON.stringify(before.periods), s.periods.map(p=>p.id));
  check('failed save shows ❌, not "✅ imported"', /❌/.test(s.status), s.status);
  check('cloud untouched by the failed import', JSON.stringify(cloud)===cloudBefore);
  await importFile(); s = await state();
  check('retry after the failure succeeds', !/❌/.test(s.status) && s.periods.length===2 && s.periods[1].rows===146, s.status);

  // ---------- 5) CHUNK READ FAILURE at boot: previous mirror fills the gap ----------
  mode.failGet = /^erpRows:/;
  await boot(); s = await state();
  check('unreadable chunks at boot → rows recovered from the last good mirror', s.periods.every(p=>p.rows>0 && !p.missing) && !s.loadFailed, s.periods);
  // …and with NO mirror either, the periods are listed as missing (warning on
  // screen), the index itself is fine, and a save keeps their stored references
  await page.evaluate(() => localStorage.removeItem('um_mirror:erpSales'));
  await boot(); s = await state();
  const refsBefore = JSON.parse(cloud.erpSales).periods.map(p => p.rowsRef && p.rowsRef.key);
  const savedOk = await page.evaluate(async () => persist('erpSales'));
  const refsAfter = JSON.parse(cloud.erpSales).periods.map(p => p.rowsRef && p.rowsRef.key);
  check('no chunks + no mirror → rowsMissing listed, index not flagged, save keeps the missing periods\' references', s.periods.every(p=>p.missing) && !s.loadFailed && savedOk && JSON.stringify(refsBefore)===JSON.stringify(refsAfter), { periods: s.periods, savedOk, refsAfter });
  mode.failGet = null;
  await boot(); s = await state();
  check('healthy again once the cloud is reachable', s.periods.every(p=>p.rows>0) && !s.loadFailed, s.periods);

  // ---------- 6) TWO DEVICES: a period imported elsewhere is kept; a tombstone wins ----------
  const idx2 = JSON.parse(cloud.erpSales);
  const other = { id:'other-device', from:'2026-07-01', to:'2026-07-31', net: 10, rowCount: 1, repMap:{}, rev: 5, rowsRef:{ key:'erpRows:other-device:5', chunks:1, count:1 } };
  cloud['erpRows:other-device:5:0'] = JSON.stringify([['2026-07-03','SINV1',0,'P',1,10,10,0,'Mariam Zohair','TEPE','Dental 8 Clinic','Clinics',0]]);
  idx2.periods.push(other);
  idx2.removed = Object.assign({}, idx2.removed, { [s.periods[0].id]: Date.now() }); // the other device deleted the Aug period
  cloud.erpSales = JSON.stringify(idx2);
  const ok6 = await page.evaluate(async () => { erpSales.seeds = Object.assign({}, erpSales.seeds, {touch:1}); return persist('erpSales'); });
  s = await state();
  check('merge-on-save: July period from the other device arrives WITH its rows', ok6 && s.periods.some(p=>p.id==='other-device' && p.rows===1), s.periods);
  check('merge-on-save: period the other device deleted is dropped here too', !s.periods.some(p=>p.id==='seed_sales3_aug26'), s.periods.map(p=>p.id));

  // ---------- 7) a rep (non-supervisor) reads the same split data ----------
  await page.goto('http://localhost:8188/index.html'); await page.waitForTimeout(200);
  await page.evaluate(async () => { await selectUser('Mariam', 'rep'); });
  await page.waitForTimeout(200);
  s = await state();
  check('rep view loads periods with rows from the split storage', s.periods.length>=2 && s.periods.every(p=>p.rows>0), s.periods.map(p=>[p.id,p.rows]));

  const realErrors = errors.filter(e => !/boom|rows unreadable/.test(String(e))); check('no page errors', realErrors.length===0, realErrors.slice(0,5).map(e=>String(e).slice(0,200)));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
