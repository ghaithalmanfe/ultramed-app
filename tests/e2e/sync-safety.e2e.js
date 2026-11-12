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
const mode = { failGet: null, failSet: null, offline: new Set(), slow: {}, reads: [], writes: [] };
let held = false; const waiters = [];   // one transaction at a time, first come first served
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const off = who => { if(mode.offline.has(who)) throw new Error('boom-offline'); };   // that phone has no connection
const api = {
  // mode.slow[k] = ms: the next read of k answers with the value as it is when the read ARRIVES, delivered ms later
  get: async (who, k) => { off(who); mode.reads.push(k); if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); const v = k in cloud ? cloud[k] : null;
    if(mode.slow[k]){ const ms = mode.slow[k]; delete mode.slow[k]; await new Promise(r => setTimeout(r, ms)); } return v; },
  set: async (who, k, v) => { off(who); if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set'); mode.writes.push(k); cloud[k] = v; return true; },
  setMany: async (who, e) => { off(who); if(mode.failSet && e.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); e.forEach(([k, v]) => { mode.writes.push(k); cloud[k] = v; }); return true; },
  del: async (who, k) => { off(who); delete cloud[k]; return true; },
  list: async (who, p) => { off(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
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
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
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
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); }; // as 20 s later: a queue flush still running is done by then
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

  // =====================================================================
  // 2) A phone that was offline uploads its clinic / task lists: its copy of
  //    EVERY record used to win over the cloud's (only doctors were joined),
  //    so edits other phones made meanwhile — even to records this phone
  //    never touched — were silently undone.
  // =====================================================================
  seedCloud();
  cloud.tasks = JSON.stringify([{ id: 't1', text: 'Call Dr. Sara', done: false, created: '2026-09-20', rep: 'Renova', clinicId: 'c2' }]);
  const A2 = await mkPhone('A2-Mariam'), S2 = await mkPhone('S2-supervisor');
  await A2.boot('Mariam', 'rep'); await S2.boot('Dr. Ghaith', 'supervisor');
  const cl = id => (parse(cloud.clinics) || []).find(c => c.id === id) || {};
  const tk = id => (parse(cloud.tasks) || []).find(t => t.id === id) || {};
  // Mariam is in the field with no connection: she logs a visit at c1 (its last visit / follow-up) and adds a task
  mode.offline.add('A2-Mariam');
  const qa = await A2.page.evaluate(async () => { const c = clinics.find(x => x.id === 'c1'); c.lastVisit = '2026-09-21'; c.nextFollowUp = '2026-09-28'; const ok1 = await persist('clinics');
    tasks.push({ id: 'tA', text: 'Follow up: Dental 8 Clinic', done: false, created: '2026-09-21', rep: 'Mariam', clinicId: 'c1', dueDate: '2026-09-28', kind: 'followup' }); const ok2 = await persist('tasks');
    return { ok1, ok2, outbox: outboxList() }; });
  // meanwhile the supervisor hands c3 to Renova, notes c1, records Dr. Ahmed's phone, and closes Renova's task
  const sv = await S2.page.evaluate(async () => { const c3 = clinics.find(x => x.id === 'c3'); c3.rep = 'Renova'; c3.phone = '+965 1111';
    const c1 = clinics.find(x => x.id === 'c1'); c1.notes = 'supervisor note'; c1.doctors.find(d => d.id === 'd1').phone = '+965 2222';
    const ok1 = await persist('clinics'); tasks.find(t => t.id === 't1').done = true; const ok2 = await persist('tasks'); return { ok1, ok2 }; });
  mode.offline.delete('A2-Mariam');
  await A2.tick(); // back online: the queue uploads
  const r2 = { c3: { rep: cl('c3').rep, phone: cl('c3').phone }, c1: { lastVisit: cl('c1').lastVisit, notes: cl('c1').notes, d1: ((cl('c1').doctors || []).find(d => d.id === 'd1') || {}).phone }, t1: tk('t1').done, tA: !!tk('tA').id, outbox: await A2.page.evaluate(() => outboxList()) };
  check('2a. the offline queue uploads without undoing the supervisor: c3 stays handed to Renova with its new phone', !qa.ok1 && qa.outbox.includes('clinics') && sv.ok1 && r2.c3.rep === 'Renova' && r2.c3.phone === '+965 1111' && r2.outbox.length === 0, r2);
  check('2b. …on the clinic both changed, each keeps its own fields: Mariam\'s visit date, the supervisor\'s note and Dr. Ahmed\'s phone', r2.c1.lastVisit === '2026-09-21' && r2.c1.notes === 'supervisor note' && r2.c1.d1 === '+965 2222', r2.c1);
  check('2c. …and a task closed on another phone stays closed when the offline phone uploads its new task', r2.t1 === true && r2.tA, { t1: r2.t1, tA: r2.tA });
  const m2 = await A2.page.evaluate(() => ({ c3: (clinics.find(c => c.id === 'c3') || {}).rep, t1: (tasks.find(t => t.id === 't1') || {}).done }));
  check('2d. …and Mariam\'s screen shows the merged truth (c3 is Renova\'s, the task is closed)', m2.c3 === 'Renova' && m2.t1 === true, m2);
  // the same with the app closed and reopened before the connection came back (a phone kills the app in the field)
  mode.offline.add('A2-Mariam');
  await A2.page.evaluate(async () => { const c = clinics.find(x => x.id === 'c1'); c.nextFollowUp = '2026-10-05'; await persist('clinics'); });
  await S2.page.evaluate(async () => { const c2 = clinics.find(x => x.id === 'c2'); c2.cls = 'B'; c2.doctors.find(d => d.id === 'd2').title = 'Orthodontist'; return persist('clinics'); });
  await A2.boot('Mariam', 'rep'); // reopened, still no connection: the screen comes from the phone's copy
  const offBoot = await A2.page.evaluate(() => ({ c1: (clinics.find(c => c.id === 'c1') || {}).nextFollowUp, outbox: outboxList() }));
  mode.offline.delete('A2-Mariam');
  await A2.tick();
  const r3 = { c2: { cls: cl('c2').cls, d2: ((cl('c2').doctors || []).find(d => d.id === 'd2') || {}).title }, c1: cl('c1').nextFollowUp, c3: cl('c3').rep };
  check('2e. reopened offline, then online: the queue still keeps every edit the other phone made meanwhile', offBoot.c1 === '2026-10-05' && offBoot.outbox.includes('clinics') && r3.c1 === '2026-10-05' && r3.c2.cls === 'B' && r3.c2.d2 === 'Orthodontist' && r3.c3 === 'Renova', { offBoot, r3 });
  await A2.ctx.close(); await S2.ctx.close();

  // =====================================================================
  // 3) A save made while a background refresh was on its way: when its
  //    slowest read came back, the refresh put back the copies it had read
  //    BEFORE the save — on screen, and in the next save of that list (the
  //    change undone; a recycle-bin entry gone for good).
  // =====================================================================
  seedCloud();
  cloud.visits = JSON.stringify([visit('vM', 'c1', 'Mariam', { date: '2026-09-20' }), visit('vD1', 'c1', 'Mariam', { date: '2026-09-19' }), visit('vD2', 'c3', 'Mariam', { date: '2026-09-18' })]);
  const P = await mkPhone('P-supervisor'); await P.boot('Dr. Ghaith', 'supervisor');
  const startRefresh = async () => { mode.slow.erpSales = 1500; await P.page.evaluate(() => { window.__la = loadAll(); }); await P.page.waitForTimeout(250); };
  const endRefresh = () => P.page.evaluate(async () => { await window.__la; });
  await startRefresh();
  await P.page.evaluate(async () => { clinics.find(c => c.id === 'c3').rep = 'Renova'; return persist('clinics'); });
  await endRefresh();
  const r3a = await P.page.evaluate(() => (clinics.find(c => c.id === 'c3') || {}).rep);
  await P.page.evaluate(async () => { clinics.find(c => c.id === 'c2').notes = 'next edit'; return persist('clinics'); });
  check('3a. a clinic edit saved while a refresh was on its way stays — on screen, and in the cloud after the next save', r3a === 'Renova' && cl('c3').rep === 'Renova' && cl('c2').notes === 'next edit', { screen: r3a, cloud: cl('c3').rep });
  await startRefresh();
  await P.page.evaluate(async () => { visits.find(v => v.id === 'vM').clinicId = 'c3'; return persist('visits'); });
  await endRefresh();
  const r3b = await P.page.evaluate(() => (visits.find(v => v.id === 'vM') || {}).clinicId);
  await addVisit(P, visit('vN', 'c2', 'Renova'));
  const vmCloud = ((parse(cloud.visits) || []).find(v => v.id === 'vM') || {}).clinicId;
  check('3b. a visit moved to another clinic while a refresh was on its way stays moved — on screen, and after the next visit save', r3b === 'c3' && vmCloud === 'c3', { screen: r3b, cloud: vmCloud });
  await startRefresh();
  await P.page.evaluate(async () => { await deleteVisit('vD1'); });
  await endRefresh();
  const r3c = await P.page.evaluate(() => (recycleBin.visits || []).map(v => v.id));
  await P.page.evaluate(async () => { await deleteVisit('vD2'); });
  const bin = ((parse(cloud.recycleBin) || {}).visits || []).map(v => v.id);
  check('3c. a visit deleted while a refresh was on its way keeps its recycle-bin entry after the next delete', r3c.includes('vD1') && bin.includes('vD1') && bin.includes('vD2'), { screen: r3c, cloud: bin });
  // the read of the clinic list itself arrives after the save (answered with the copy from before it)
  mode.slow.clinics = 1500; await P.page.evaluate(() => { window.__la = loadAll(); }); await P.page.waitForTimeout(250);
  await P.page.evaluate(async () => { clinics.find(c => c.id === 'c2').cls = 'C'; return persist('clinics'); });
  await endRefresh();
  const r3d = await P.page.evaluate(() => ({ screen: (clinics.find(c => c.id === 'c2') || {}).cls, phone: ((JSON.parse(localStorage.getItem('um_mirror:clinics') || '[]')).find(c => c.id === 'c2') || {}).cls }));
  check('3d. a read of the list that arrives after the save: the screen and the phone\'s own copy (what an offline start shows) keep the saved edit', r3d.screen === 'C' && r3d.phone === 'C' && cl('c2').cls === 'C', r3d);
  await P.ctx.close();

  // =====================================================================
  // 4) A visit saved with no connection on a phone whose storage is full:
  //    neither the queue entry nor the phone's copy could be written. The
  //    save said "kept in memory" — but nothing retried it, and the next
  //    refresh put the phone's older copy over it: the visit vanished.
  // =====================================================================
  seedCloud();
  const F = await mkPhone('F-Mariam'); await F.boot('Mariam', 'rep');
  const full = () => F.page.evaluate(() => { const real = window.__realSet = window.__realSet || Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){ if(/^um_outbox$|^um_mirror:/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; });
  const roomy = () => F.page.evaluate(() => { if(window.__realSet) Storage.prototype.setItem = window.__realSet; });
  await full(); mode.offline.add('F-Mariam');
  const f0 = await F.page.evaluate(async (v) => { visits.push(v); const r = await persistFor('visits'); return { ok: r.ok, toasts: window.__toasts.slice() }; }, visit('vF1', 'c1', 'Mariam'));
  await F.tick();
  const f1 = await F.page.evaluate(() => ({ has: visits.some(v => v.id === 'vF1'), outbox: outboxList() }));
  await F.page.evaluate(() => loadAll()); // a refresh that reads anyway (after the queue's retries ran out)
  const f2 = await F.page.evaluate(() => ({ has: visits.some(v => v.id === 'vF1'), bar: (document.getElementById('memOnlyBar') || {}).textContent || '', toasts: window.__toasts.slice() }));
  check('4a. storage full, no connection: the visit is still there after a refresh tick and after a full refresh — the queue is kept in memory, the older phone copy is never served', f1.has && f1.outbox.includes('visits') && f2.has, { f1, has2: f2.has });
  check('4b. …and a red bar says the truth until it uploads — nothing claims "Saved"', /storage is full — this visit is only in the app's memory/.test(f2.bar) && !f2.toasts.some(t => /Saved|محفوظة|حُفظ/.test(t)), { bar: f2.bar, toasts: f2.toasts });
  mode.offline.delete('F-Mariam');
  await F.tick();
  const f3 = await F.page.evaluate(() => ({ outbox: outboxList(), bar: !!document.getElementById('memOnlyBar'), toasts: window.__toasts.slice(-3) }));
  check('4c. back online: the next refresh uploads it, the red bar goes, and only then it says Saved', (parse(cloud.visits) || []).some(v => v.id === 'vF1') && f3.outbox.length === 0 && !f3.bar && f3.toasts.some(t => /Saved/.test(t)), f3);
  await roomy();
  await F.page.evaluate(() => loadAll()); await F.page.waitForFunction(() => !_flushing); // room again: the next refresh downloads the sales rows the phone dropped
  // nearly full, with a copy the cloud can send again (the sales rows): the app makes room first
  mode.offline.add('F-Mariam');
  const f4 = await F.page.evaluate(async (v) => {
    const real = window.__realSet || Storage.prototype.setItem;
    const used = () => { let n = 0; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; };
    const quota = used() + 60;
    Storage.prototype.setItem = function(k, val){ const old = localStorage.getItem(k); if(used() - (old != null ? k.length + old.length : 0) + k.length + String(val).length > quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, val); };
    const rowsBefore = ((JSON.parse(localStorage.getItem('um_mirror:erpSales') || '{}').periods) || []).reduce((n, p) => n + ((p && p.rows) || []).length, 0);
    visits.push(v); const r = await persistFor('visits');
    Storage.prototype.setItem = real;
    const es = JSON.parse(localStorage.getItem('um_mirror:erpSales') || 'null');
    return { outcome: r.outcome, onPhone: JSON.parse(localStorage.getItem('um_mirror:visits') || '[]').some(x => x.id === v.id), outbox: JSON.parse(localStorage.getItem('um_outbox') || '[]'),
      rowsBefore, rowsAfter: ((es && es.periods) || []).reduce((n, p) => n + ((p && p.rows) || []).length, 0), heads: ((es && es.periods) || []).length, bar: !!document.getElementById('memOnlyBar'), screen: erpPeriods().reduce((n, p) => n + (p.rows || []).length, 0) };
  }, visit('vF2', 'c1', 'Mariam'));
  check('4d. nearly full: the phone first drops its copy of the sales rows (the cloud sends them again), then keeps the visit and the queue entry — no red bar; the figures on screen are untouched', f4.onPhone && f4.outbox.includes('visits') && f4.rowsBefore > 0 && f4.rowsAfter === 0 && f4.heads === 2 && !f4.bar && f4.screen === 7 && f4.outcome.mirrored, f4);
  mode.offline.delete('F-Mariam');
  await F.tick();
  check('4e. …and it uploads on the next refresh', (parse(cloud.visits) || []).some(v => v.id === 'vF2'));
  await F.ctx.close();

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
