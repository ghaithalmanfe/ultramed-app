// Sync safety (v121): the data-loss risks of the sync layer (docs/sync-findings.md),
// each reproduced on a fake cloud before its fix. Several phones share one
// cloud with an atomic update(); reads and writes can be made to fail; the
// 20-second background refresh is driven by hand (window.__bgTick), so every
// check is deterministic. Clock pinned to 21 Sep 2026.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8250;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });

// ---- fake cloud (in Node: shared by every phone, survives reloads) ----
const cloud = {};
const mode = { failGet: null, failSet: null, reads: [], writes: [] };
let held = false; const waiters = [];   // one transaction at a time, first come first served
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const api = {
  get: async k => { mode.reads.push(k); if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set'); mode.writes.push(k); cloud[k] = v; return true; },
  setMany: async e => { if(mode.failSet && e.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); e.forEach(([k, v]) => { mode.writes.push(k); cloud[k] = v; }); return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,600):'')); if(!ok) failed++; }
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const CLOCK = new Date('2026-09-21T10:00:00').getTime();

// ---- sales fixture: two files of the same salesman whose days overlap (5–10 Sep) ----
const row = (d, doc, sm, net, cust) => [d, doc, 0, 'P-1', 1, net, net, 0, sm, 'TEPE', cust || 'Dental 8 Clinic', 'Clinics', 0, ''];
const OLD_ROWS = ['2026-09-01','2026-09-03','2026-09-05','2026-09-08','2026-09-10'].map((d, i) => row(d, 'SO' + i, 'Mariam Zohair', 100));
const NEW_ROWS = ['2026-09-05','2026-09-08','2026-09-10','2026-09-12','2026-09-15'].map((d, i) => row(d, 'SN' + i, 'Mariam Zohair', 100));
const head = (id, from, to, rows, importedAt, rev, repMap) => ({ id, from, to, net: rows.length * 100, rowCount: rows.length, importedAt, rev, repMap: repMap || { 'Mariam Zohair': 'Mariam' }, rowsRef: { key: `erpRows:${id}:${rev}`, chunks: 1, count: rows.length } });
function seedCloud(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 8 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Crown Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] },
    { id: 'c3', name: 'Bayan Dental Center', rep: 'Mariam', cls: 'B', doctors: [{ id: 'd3', name: 'Dr. Noor' }] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-09' }, Renova: { revenue: 12000, month: '2026-09' } });
  cloud.erpSales = JSON.stringify({ periods: [
      head('p-old', '2026-09-01', '2026-09-10', OLD_ROWS, '2026-09-11T08:00:00.000Z', 1),
      head('p-new', '2026-09-05', '2026-09-15', NEW_ROWS, '2026-09-16T08:00:00.000Z', 1)],
    repMapGlobal: { 'Mariam Zohair': 'Mariam', 'Ranova Ayman Mohammed': 'Renova' }, returnPolicy: 'erp',
    seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud['erpRows:p-old:1:0'] = JSON.stringify(OLD_ROWS);
  cloud['erpRows:p-new:1:0'] = JSON.stringify(NEW_ROWS);
}

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  const mkPhone = async (label) => {
    const ctx = await browser.newContext(); await blockFirebase(ctx);
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|save failed|update failed|rows unreadable/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set); await page.exposeFunction('__cDel', api.del);
    await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript((clock) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { await window.__cAcquire(); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(); } },
      };
      const off = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      // The 20-second background refresh, driven by the harness instead of the clock.
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    }, CLOCK);
    const boot = async (who, role) => {
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; });
    };
    const tick = () => page.evaluate(async () => { await window.__bgTick(); });
    return { page, boot, tick, label, ctx };
  };
  const visit = (id, clinicId, rep, extra) => Object.assign({ id, clinicId, rep, date: '2026-09-21', ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: '' }, extra || {});
  const addVisit = (ph, v) => ph.page.evaluate(async (v) => { visits.push(v); return persist('visits'); }, v);

  // =====================================================================
  // 1) A start-up trim of overlapping sales files (or a sales file put back
  //    from the phone's own copy) marked the sales data "unsaved" — and that
  //    flag stopped the whole 20-second refresh and the retry of queued
  //    offline saves until a sales save, which a rep's phone never makes.
  // =====================================================================
  seedCloud();
  const A = await mkPhone('A-Mariam'), B = await mkPhone('B-Renova'), S = await mkPhone('S-supervisor');
  await A.boot('Mariam', 'rep'); await B.boot('Renova', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
  const a0 = await A.page.evaluate(() => ({ mtd: (erpMtdMap().Mariam || {}).amount, vis: document.visibilityState, tick: typeof window.__bgTick }));
  check('1a. the overlapping days are counted once on the phone (700, not 1000) — the trim itself stays', a0.mtd === 700 && a0.vis === 'visible' && a0.tick === 'function', a0);
  await addVisit(B, visit('vB1', 'c2', 'Renova'));
  await A.tick();
  const a1 = await A.page.evaluate(() => visits.some(v => v.id === 'vB1'));
  check('1b. after the start-up trim a rep\'s phone still refreshes: a visit Renova logged reaches Mariam\'s phone on the next 20-second refresh', a1, { cloudHas: (parse(cloud.visits) || []).some(v => v.id === 'vB1') });
  mode.failSet = /^visits$/;
  const q = await A.page.evaluate(async (v) => { visits.push(v); const ok = await persist('visits'); return { ok, queued: outboxHas('visits') }; }, visit('vA1', 'c1', 'Mariam'));
  mode.failSet = null;
  await A.tick();
  const a2 = { q, inCloud: (parse(cloud.visits) || []).some(v => v.id === 'vA1'), outbox: await A.page.evaluate(() => outboxList()) };
  check('1c. …and still retries its queued offline saves: a visit saved with no connection uploads on the next refresh', !q.ok && q.queued && a2.inCloud && a2.outbox.length === 0, a2);
  mode.reads = [];
  await A.tick(); await A.tick();
  const chunkReads = mode.reads.filter(k => /^erpRows:/.test(k));
  check('1d. the refresh downloads no sales file twice while the cloud still holds the overlap (the phone keeps the cloud\'s copy, trims in memory)', chunkReads.length === 0, chunkReads);
  const s1 = await S.page.evaluate(() => ({ paused: erpLinksPaused(), pill: !!document.getElementById('erpDirtyPill') }));
  check('1e. the supervisor\'s account-link editor is not paused on a "red bar" that is not on screen', s1.paused !== 'busy' || s1.pill, s1);
  // the supervisor imports another file: every phone follows on its next refresh
  await S.page.evaluate(async (rows) => { erpSales.periods.push({ id: 'p-ren', from: '2026-09-14', to: '2026-09-17', importedAt: new Date().toISOString(), rev: Date.now(), repMap: { 'Ranova Ayman Mohammed': 'Renova' }, rowCount: rows.length, net: 300, rows }); return persist('erpSales'); },
    [row('2026-09-14', 'SR1', 'Ranova Ayman Mohammed', 100, 'Crown Dental Center'), row('2026-09-17', 'SR2', 'Ranova Ayman Mohammed', 200, 'Crown Dental Center')]);
  await A.tick();
  const a3 = await A.page.evaluate(() => ({ has: erpPeriods().some(p => p.id === 'p-ren'), ren: (erpMtdMap().Renova || {}).amount, mar: (erpMtdMap().Mariam || {}).amount }));
  check('1f. a sales file the supervisor imports reaches a rep\'s phone on its next refresh (figures follow the cloud)', a3.has && a3.ren === 300 && a3.mar === 700, a3);
  // a file whose cloud rows are gone, put back from the phone's own copy
  const idx = parse(cloud.erpSales); const pn = idx.periods.find(p => p.id === 'p-new');
  pn.rev = 2; pn.rowsRef = { key: 'erpRows:p-new:2', chunks: 1, count: NEW_ROWS.length }; // a stale device left the index pointing at chunks that never arrived
  cloud.erpSales = JSON.stringify(idx);
  await B.boot('Renova', 'rep');
  const b0 = await B.page.evaluate(() => ({ rows: (erpPeriods().find(p => p.id === 'p-new') || {}).rows, pill: !!document.getElementById('erpDirtyPill') }));
  await addVisit(A, visit('vA2', 'c1', 'Mariam'));
  await B.tick();
  const b1 = await B.page.evaluate(() => visits.some(v => v.id === 'vA2'));
  check('1g. a rep\'s phone that put a sales file back from its own copy keeps refreshing (no unsaved-sales flag she cannot clear)', b0.rows && b0.rows.length === 5 && !b0.pill && b1, { b0: { rows: b0.rows && b0.rows.length, pill: b0.pill }, b1 });
  await S.boot('Dr. Ghaith', 'supervisor');
  const s2 = await S.page.evaluate(() => ({ rows: ((erpPeriods().find(p => p.id === 'p-new') || {}).rows || []).length, pill: (document.getElementById('erpDirtyPill') || {}).textContent || '' }));
  await S.page.evaluate(async () => { const el = document.getElementById('erpDirtyPill'); if(el) await el.onclick(); });
  await S.page.waitForTimeout(200);
  const idx2 = parse(cloud.erpSales), refs = [];
  idx2.periods.forEach(p => { for(let i = 0; i < ((p.rowsRef || {}).chunks || 0); i++) refs.push(p.rowsRef.key + ':' + i); });
  check('1h. on the supervisor\'s phone the same put-back is offered as a save (the red bar) — and the save puts the rows back in the cloud', s2.rows === 5 && /غير محفوظة/.test(s2.pill) && refs.every(k => k in cloud) && !(await S.page.evaluate(() => !!document.getElementById('erpDirtyPill'))), { s2, missing: refs.filter(k => !(k in cloud)) });
  await A.ctx.close(); await B.ctx.close(); await S.ctx.close();

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
