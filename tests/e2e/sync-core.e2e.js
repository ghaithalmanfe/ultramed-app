// Sync core (v123, audit items 2 and 6): one refresh at a time, nothing written
// at start without a tap, and an older copy on one phone never undoes what
// another phone saved. Each scenario was reproduced on v122 first (it fails
// there) — the audit's probes race-products.js and race-restore.js are A1 and A2.
// Several phones share a fake cloud in Node (an atomic update(), reads that
// hang or answer late, writes that land late, a phone with no connection);
// each phone has its own clock; the 20-second refresh is driven by hand.
//  A1  two refreshes overlap on a rep's phone with no copy: no factory catalog
//  A2  the same on the supervisor's phone: no older backup restored, nothing written
//  A3  the one-time repairs are gone: no backup read, nothing written at start
//  A4  a missing settings document is created from the supervisor's phone only
//  A5  a save made while a refresh reads keeps its guard (another phone's targets stay)
//  A6  after a start from the phone's copy, the first settings save lands
//  A7  the app coming back on screen refreshes once, through the same path
//  A8  a second refresh call gets the one on its way; the tick skips meanwhile
//  A9  the wipe banner reads backups at most once a day, only for a list that had 15+
//  B1  a task deleted 9 days ago stays deleted when an old phone uploads
//  B2  day plans: the supervisor's addition survives an offline start / a reopen
//  B3  visits: a correction made on another phone survives an offline upload
//  B4  a settings save that lands late never overwrites a newer one
//  B5  recycle bin: two deletes on two phones keep both entries; a restore stays
//  B6  ERP notes: two phones' notes are both kept
//  B7  "Restore from this phone's copy" changes only the ticked clinics
// Port 8286. ONLY=A1,B3 runs a subset.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8286;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });

// ---- the fake cloud (in Node: shared by every phone, survives reloads) ----
const cloud = {};
// hang: Set of keys whose NEXT read never answers (the app's own timeout fails it)
// failOnce: Set of keys whose NEXT read fails at once (no connection for that read)
// slowGet[k] = ms: the next read of k answers ms later (with the value as it was when it arrived)
// slowWrite[k] = ms: the next write of k (set, or a transaction's read-and-write) happens ms later
const mode = { hang: new Set(), failOnce: new Set(), slowGet: {}, slowWrite: {}, offline: new Set(), reads: [], writes: [], lists: [] };
let held = false; const waiters = [];
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const off = who => { if(mode.offline.has(who)) throw new Error('boom-offline'); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const api = {
  get: async (who, k) => { off(who); mode.reads.push(who + ':' + k);
    if(mode.hang.has(k)){ mode.hang.delete(k); return new Promise(() => {}); }
    if(mode.failOnce.has(k)){ mode.failOnce.delete(k); throw new Error('boom-read'); }
    const v = k in cloud ? cloud[k] : null;
    if(mode.slowGet[k]){ const ms = mode.slowGet[k]; delete mode.slowGet[k]; await wait(ms); }
    return v; },
  set: async (who, k, v) => { off(who); if(mode.slowWrite[k]){ const ms = mode.slowWrite[k]; delete mode.slowWrite[k]; await wait(ms); } mode.writes.push(who + ':' + k); cloud[k] = v; return true; },
  setMany: async (who, e) => { off(who); e.forEach(([k, v]) => { mode.writes.push(who + ':' + k); cloud[k] = v; }); return true; },
  del: async (who, k) => { off(who); delete cloud[k]; return true; },
  list: async (who, p) => { off(who); mode.lists.push(who + ':' + p); return Object.keys(cloud).filter(k => k.startsWith(p)); },
  updDelay: async (who, k) => { off(who); if(mode.slowWrite[k]){ const ms = mode.slowWrite[k]; delete mode.slowWrite[k]; return ms; } return 0; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  -> '+JSON.stringify(info).slice(0,700):'')); if(!ok) failed++; }
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const DAY = 86400000;
const CLOCK = new Date('2026-09-21T10:00:00').getTime();
const SEEDS = { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true };
function seedCloud(opts){
  opts = opts || {};
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  const list = [
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] },
    { id: 'c3', name: 'Hilal Dental Center', rep: 'Mariam', cls: 'B', doctors: [{ id: 'd3', name: 'Dr. Noor' }] }];
  for(let i = 0; i < (opts.fill || 0); i++) list.push({ id: 'f' + i, name: 'Filler Clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'C', doctors: [] });
  cloud.clinics = JSON.stringify(list);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-09' }, Renova: { revenue: 12000, month: '2026-09' } });
  cloud.products = JSON.stringify([{ id: 'LIVE-1', name: 'Catalog as the supervisor edited it', brand: 'Live', price: 9.5, cat: 'Live' }]);
  cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: opts.noSeeds ? {} : SEEDS });
}
const cl = id => (parse(cloud.clinics) || []).find(c => c.id === id) || {};
const writesOf = (who, re) => mode.writes.filter(w => w.startsWith(who + ':') && re.test(w.slice(who.length + 1)));

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  const mkPhone = async (label) => {
    const ctx = await browser.newContext(); await blockFirebase(ctx);
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|save failed|update failed|rows unreadable|timeout/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release); await page.exposeFunction('__cUpdDelay', k => api.updDelay(label, k));
    await page.addInitScript((clock) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { const ms = await window.__cUpdDelay(k); if(ms) await new Promise(r => setTimeout(r, ms));
          await window.__cAcquire(); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(); } },
      };
      // this phone's clock: pinned, moved by whole days with __setDay(n) (kept across reloads)
      const shift = () => { try{ return (parseInt(sessionStorage.getItem('__day') || '0', 10) || 0) * 86400000; }catch(e){ return 0; } };
      const off = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off + shift()); else super(...a); } static now(){ return _D.now() + off + shift(); } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      window.__setDay = n => { sessionStorage.setItem('__day', String(n)); };
      // the 20-second background refresh, driven by the harness instead of the clock
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
      // the app on screen or not (a phone switched to another app)
      window.__vis = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
    }, CLOCK);
    const goto = async () => { await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(200); };
    const boot = async (who, role, opts) => {
      await goto();
      if(opts && opts.clear) await page.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
      if(opts && opts.clear) await goto();
      const p = page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      if(opts && opts.noWait) return p;
      await p; await page.waitForTimeout(250);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; });
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); };
    return { page, boot, tick, label, ctx, goto, ev: (fn, arg) => page.evaluate(fn, arg) };
  };
  const visit = (id, clinicId, rep, extra) => Object.assign({ id, clinicId, rep, date: '2026-09-21', ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: '' }, extra || {});

  // =====================================================================
  // A1 (race-products.js): a rep's phone with no copy on it signs in; its
  // first read of the catalog fails (the probe let it time out: the same
  // failure, 8 s later) and the sales index answers slowly, so the sign-in
  // refresh is still on its way when the 20-second tick starts a second one.
  // v122: the second refresh reset the read flags, so the first took "no
  // catalog" as an empty account and wrote the 133-item factory catalog over
  // the live one.
  // =====================================================================
  if(want('A1')){
    seedCloud(); const live = cloud.products;
    const A = await mkPhone('A1-Mariam');
    mode.failOnce.add('products'); mode.slowGet.erpSales = 3000; mode.writes = [];
    const signin = A.boot('Mariam', 'rep', { noWait: true });
    await A.page.waitForFunction(() => typeof currentUser !== 'undefined' && !!currentUser);   // the sign-in refresh has started
    await new Promise(r => setTimeout(r, 700));
    const same = await A.ev(() => { const p = loadAll(); return p === loadAll(); });
    await signin; await A.page.waitForTimeout(800);
    const r = { productWrites: writesOf('A1-Mariam', /^products$/), cloudLive: cloud.products === live, onScreen: await A.ev(() => products.length), failedFlag: await A.ev(() => !!_loadFailed.products) };
    check('A1. two refreshes overlap on a rep\'s phone whose catalog read failed: the live catalog stays — no factory catalog is written', r.productWrites.length === 0 && r.cloudLive, r);
    check('A1b. …the second refresh call is handed the one on its way, and the screen knows its catalog read failed', same && r.failedFlag, { same, failed: r.failedFlag });
    await A.ctx.close(); mode.hang.clear(); mode.failOnce.clear(); mode.slowGet = {};
  }

  // =====================================================================
  // A2 (race-restore.js): the supervisor's phone with no copy signs in; the
  // first reads of clinics, visits and the sales index fail (the probe let
  // them time out) and the chat read never answers, so the sign-in refresh is
  // still on its way when a second refresh starts. v122: that disarmed the
  // one-time wipe restore, which wrote a 20-clinic backup over the 30 live
  // clinics (names reverted, handovers lost), cut this month's visits from 25
  // to 16 and overwrote today's backup. Now nothing at all is written at start.
  // =====================================================================
  if(want('A2')){
    seedCloud();
    const live = [], backup = [];
    for(let i = 0; i < 30; i++) live.push({ id: 'k' + i, name: 'Live clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [], prevRep: i < 5 ? 'Renova' : undefined, repSince: i < 5 ? '2026-09-01' : undefined });
    for(let i = 0; i < 20; i++) backup.push({ id: 'k' + i, name: 'Backup clinic ' + i, rep: 'Renova', cls: 'B', doctors: [] });
    const vis = n => Array.from({ length: n }, (_, i) => visit('v' + i, 'k' + (i % 20), 'Mariam', { date: '2026-09-' + String(1 + (i % 12)).padStart(2, '0'), notes: (n === 25 ? 'live ' : 'backup ') + i }));
    cloud.clinics = JSON.stringify(live); cloud.visits = JSON.stringify(vis(25)); cloud.chat = '[]'; cloud.memories = '[]';
    cloud['snap_2026-09-05'] = JSON.stringify({ clinics: backup, products: [], visits: vis(16), tasks: [], ts: '2026-09-05T09:00:00Z' });
    const before = { clinics: cloud.clinics, visits: cloud.visits, snap: cloud['snap_2026-09-05'] };
    const S = await mkPhone('A2-sup');
    ['clinics', 'visits', 'erpSales'].forEach(k => mode.failOnce.add(k)); mode.hang.add('chat'); mode.slowGet = {}; mode.writes = [];
    const signin = S.boot('Dr. Ghaith', 'supervisor', { noWait: true });
    await S.page.waitForFunction(() => typeof currentUser !== 'undefined' && !!currentUser);   // the sign-in refresh has started
    await new Promise(r => setTimeout(r, 1000));
    mode.slowGet.erpSales = 12000;
    await S.ev(() => { loadAll(); });
    await signin; await S.page.waitForTimeout(6000);
    const w = writesOf('A2-sup', /./);
    check('A2. overlapping refreshes on the supervisor\'s phone write nothing at start: the 30 live clinics, their handovers and this month\'s 25 visits stay; no backup is overwritten',
      w.length === 0 && cloud.clinics === before.clinics && cloud.visits === before.visits && !Object.keys(cloud).some(k => /^snap_2026-09-21/.test(k)), { writes: w, clinics: (parse(cloud.clinics) || []).length, visits: (parse(cloud.visits) || []).length });
    await S.ctx.close(); mode.hang.clear(); mode.failOnce.clear(); mode.slowGet = {};
  }

  // =====================================================================
  // A3: the one-time repairs of Aug–Sep (orphan sweep, automatic wipe
  // restore, deep restore) ran at every supervisor start whose sales index
  // lacked their flags: they listed and downloaded every backup and added
  // clinics without a tap. They are retired: nothing is read or written.
  // =====================================================================
  if(want('A3')){
    seedCloud({ fill: 17, noSeeds: true });
    cloud.visits = JSON.stringify([visit('vo', 'gone1', 'Mariam', { clinicName: 'Deleted Clinic With Visits' })]);
    cloud['snap_2026-09-19'] = JSON.stringify({ clinics: (parse(cloud.clinics) || []).concat([{ id: 'k99', name: 'Only in a backup', rep: 'Renova', cls: 'C', doctors: [] }]), products: [], visits: [], tasks: [] });
    const before = cloud.clinics;
    const S = await mkPhone('A3-sup');
    mode.writes = []; mode.lists = []; mode.reads = [];
    await S.boot('Dr. Ghaith', 'supervisor'); await S.page.waitForTimeout(400);
    const r = { lists: mode.lists.filter(l => l.startsWith('A3-sup:snap')), snapReads: mode.reads.filter(k => /^A3-sup:snap_/.test(k)), writes: writesOf('A3-sup', /^(clinics|visits|erpSales|snap_)/) };
    check('A3. the supervisor\'s start with the one-time repair flags missing: no backup listed or read, no clinic added, nothing written', cloud.clinics === before && !r.lists.length && !r.snapReads.length && !r.writes.length, r);
    await S.ctx.close();
  }

  // =====================================================================
  // A4: a settings document the account does not have yet is created with its
  // factory default from the supervisor's phone only (v122: from any phone
  // whose read came back empty — a rep's phone too).
  // =====================================================================
  if(want('A4')){
    seedCloud(); delete cloud.benchmarks; delete cloud.categoryGuides;
    const A = await mkPhone('A4-Mariam'), S = await mkPhone('A4-sup');
    mode.writes = [];
    await A.boot('Mariam', 'rep'); await A.page.waitForTimeout(300);
    const rep = { writes: writesOf('A4-Mariam', /^(benchmarks|categoryGuides|products|staff)$/), has: ['benchmarks', 'categoryGuides'].filter(k => k in cloud) };
    check('A4. a rep\'s phone never writes a factory default (the settings stay missing until the supervisor\'s phone creates them)', !rep.writes.length && !rep.has.length, rep);
    await S.boot('Dr. Ghaith', 'supervisor'); await S.page.waitForTimeout(300);
    const sup = { writes: writesOf('A4-sup', /^(benchmarks|categoryGuides)$/), has: ['benchmarks', 'categoryGuides'].filter(k => k in cloud), products: cloud.products };
    check('A4b. …the supervisor\'s phone creates them once; an existing document (the catalog) is never re-seeded', sup.has.length === 2 && sup.writes.length === 2 && /LIVE-1/.test(sup.products), sup);
    await A.ctx.close(); await S.ctx.close();
  }

  // =====================================================================
  // A5 (ARCH-01b): the supervisor's phone started from its own copy; his
  // laptop then saves new targets; when the phone is back online a refresh
  // starts, and while its reads are on their way he saves targets on the
  // phone (an edit of its older copy). v122: the refresh had emptied the read
  // flags, so the save skipped its guard and wrote over the laptop's targets.
  // =====================================================================
  if(want('A5')){
    seedCloud();
    const P = await mkPhone('A5-phone'), L = await mkPhone('A5-laptop');
    await P.boot('Dr. Ghaith', 'supervisor');
    mode.offline.add('A5-phone');
    await P.boot('Dr. Ghaith', 'supervisor');                                       // a start with no connection: the phone's copy
    await L.boot('Dr. Ghaith', 'supervisor');
    await L.ev(async () => { targets.Mariam.revenue = 22222; return persist('targets'); });
    mode.offline.delete('A5-phone');
    mode.slowGet.erpSales = 2500;
    await P.ev(() => { window.__la = loadAll(); }); await P.page.waitForTimeout(400);
    const ok = await P.ev(async () => { targets.Renova.revenue = 15000; return persist('targets'); });
    await P.ev(async () => { await window.__la; });
    const t = parse(cloud.targets) || {};
    check('A5. a settings save made from the phone\'s older copy while a refresh reads: refused, the laptop\'s targets stay', ok === false && t.Mariam.revenue === 22222, { ok, cloud: { Mariam: t.Mariam.revenue, Renova: t.Renova.revenue }, toasts: await P.ev(() => window.__toasts.slice(-2)) });
    // the refusal stays said whatever the screen that saved says next, until a save of the document lands
    const bar1 = await P.ev(() => { showToast('🎯 Monthly targets saved'); return (document.getElementById('refusedPill') || {}).textContent || ''; });
    await P.tick();                                                                 // the next refresh shows the laptop's targets
    const ok2 = await P.ev(async () => { targets.Renova.revenue = 15000; return persist('targets'); });
    const bar2 = await P.ev(() => !!document.getElementById('refusedPill'));
    const t2 = parse(cloud.targets) || {};
    check('A5b. …a bar keeps saying "Not saved — changed on another device" after a screen\'s own "saved"; after the refresh the edit saves and the bar goes', /Not saved — changed on another device/.test(bar1) && ok2 === true && !bar2 && t2.Mariam.revenue === 22222 && t2.Renova.revenue === 15000, { bar1, ok2, bar2, cloud: { Mariam: t2.Mariam.revenue, Renova: t2.Renova.revenue } });
    await P.ctx.close(); await L.ctx.close(); mode.slowGet = {};
  }

  // =====================================================================
  // A6 (A3-refused): after a start from the phone's copy, the first save of a
  // setting was always refused as "refreshed elsewhere" (it compared the cloud
  // with the edited value). Nobody else changed it: it lands.
  // =====================================================================
  if(want('A6')){
    seedCloud();
    const P = await mkPhone('A6-phone');
    await P.boot('Dr. Ghaith', 'supervisor');
    mode.offline.add('A6-phone');
    await P.boot('Dr. Ghaith', 'supervisor');
    mode.offline.delete('A6-phone');
    const ok = await P.ev(async () => { const mu = !!_mirrorUsed.targets; targets.Mariam.revenue = 13000; const ok = await persist('targets'); return { mu, ok }; });
    check('A6. after a start from the phone\'s copy, a targets save nobody else changed lands at once', ok.mu && ok.ok === true && (parse(cloud.targets) || {}).Mariam.revenue === 13000, ok);
    await P.ctx.close();
  }

  // =====================================================================
  // A7: the app coming back on screen refreshes once, through the same path
  // as the 20-second tick (v122: nothing until the next tick — the screen
  // showed data as old as the last refresh). A8: a second refresh call while
  // one is on its way gets that one; the tick skips meanwhile.
  // =====================================================================
  if(want('A7') || want('A8')){
    seedCloud();
    const A = await mkPhone('A7-Mariam');
    await A.boot('Mariam', 'rep');
    const reads = () => mode.reads.filter(k => k === 'A7-Mariam:clinics').length;
    let n0 = reads();
    await A.ev(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); }); await A.page.waitForTimeout(300);
    const hidden = reads() - n0;
    mode.slowGet.erpSales = 1500;
    await A.ev(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
    await A.page.waitForTimeout(400);
    const shown = reads() - n0;
    await A.ev(() => window.__bgTick());   // the tick while that refresh is on its way
    await A.page.waitForTimeout(1800);
    const total = reads() - n0;
    check('A7. the app coming back on screen refreshes at once, and once (told twice, a tick on top: one read of the lists)', hidden === 0 && shown === 1 && total === 1, { hidden, shown, total });
    n0 = reads(); mode.slowGet.erpSales = 800;
    const same = await A.ev(async () => { const a = loadAll(), b = loadAll(); const s = a === b; await a; return s; });
    check('A8. two refresh calls at once: one refresh, the second caller gets the first one\'s promise', same && reads() - n0 === 1, { same, reads: reads() - n0 });
    await A.ctx.close(); mode.slowGet = {};
  }

  // =====================================================================
  // A9: the wipe banner listed and read the daily backups after every refresh
  // while the list had under 15 clinics — on a small new account too. Now: at
  // most once a day per phone, only for a list this phone has seen with 15+.
  // =====================================================================
  if(want('A9')){
    seedCloud(); // 3 clinics: a small account
    cloud['snap_2026-09-20'] = JSON.stringify({ clinics: (parse(cloud.clinics) || []), products: [], visits: [], tasks: [] });
    const S = await mkPhone('A9-sup');
    mode.lists = [];
    await S.boot('Dr. Ghaith', 'supervisor'); await S.tick(); await S.page.waitForTimeout(300);
    const small = mode.lists.filter(l => l === 'A9-sup:snap_').length;
    check('A9. a small account that never had 15 clinics: no backup is listed at start or on a refresh', small === 0, { lists: small });
    // the same phone saw 30 clinics before (its copy kept aside when the list shrank)
    const thirty = Array.from({ length: 30 }, (_, i) => ({ id: 'w' + i, name: 'Wiped ' + i, rep: 'Mariam', cls: 'B', doctors: [] }));
    cloud['snap_2026-09-20'] = JSON.stringify({ clinics: thirty, products: [], visits: [], tasks: [] });
    await S.ev(t => { localStorage.setItem('um_mirror_prev:clinics', t); }, JSON.stringify(thirty));
    mode.lists = [];
    await S.tick(); await S.page.waitForTimeout(400);
    const b1 = await S.ev(() => !!document.getElementById('wipeBanner'));
    await S.tick(); await S.page.waitForTimeout(300);
    await S.boot('Dr. Ghaith', 'supervisor'); await S.page.waitForTimeout(400);
    const b2 = await S.ev(() => !!document.getElementById('wipeBanner'));
    const lists = mode.lists.filter(l => l === 'A9-sup:snap_').length;
    check('A9b. a list this phone saw with 30 clinics, now 3: the banner shows, the backups are read once that day (two refreshes and a reopen later, still once, banner still shown)', b1 && b2 && lists === 1, { b1, b2, lists });
    await S.ctx.close();
  }

  // =====================================================================
  // B1 (P7): the delete log forgot a delete after 7 days — a phone whose copy
  // was older than that put the record back with its next upload.
  // =====================================================================
  if(want('B1')){
    seedCloud();
    cloud.tasks = JSON.stringify([{ id: 't1', text: 'Call Dr. Sara', done: false, created: '2026-09-20', rep: 'Mariam', clinicId: 'c2' }]);
    const M = await mkPhone('B1-Mariam'), S = await mkPhone('B1-sup');
    await M.boot('Mariam', 'rep');                                                  // her phone holds t1
    await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(async () => { tasks = tasks.filter(t => t.id !== 't1'); tomb('tasks', 't1'); await persist('tasks'); });   // day 0: t1 deleted
    await S.ev(() => window.__setDay(8)); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(async () => { tasks.push({ id: 't2', text: 'x', done: false, created: '2026-09-29', rep: 'Renova' }); await persist('tasks'); tasks = tasks.filter(t => t.id !== 't2'); tomb('tasks', 't2'); await persist('tasks'); await new Promise(r => setTimeout(r, 300)); });   // day 8: another delete rewrites the log
    mode.offline.add('B1-Mariam');
    await M.ev(() => window.__setDay(9)); await M.boot('Mariam', 'rep');          // day 9, no connection: her old copy
    await M.ev(async () => { tasks.push({ id: 'tM', text: 'Follow up', done: false, created: '2026-09-30', rep: 'Mariam', clinicId: 'c1' }); return persist('tasks'); });
    mode.offline.delete('B1-Mariam');
    await M.tick();
    const ids = (parse(cloud.tasks) || []).map(t => t.id);
    check('B1. a task deleted 9 days ago stays deleted when a phone with an older copy uploads (the delete log keeps it 120 days)', !ids.includes('t1') && ids.includes('tM'), { ids, log: Object.keys(((parse(cloud.tombs) || {}).tasks) || {}) });
    await M.ctx.close(); await S.ctx.close();
  }

  // =====================================================================
  // B2 (K5): day plans had no merge base after an offline start or a reopen
  // with a queued plan: each of the phone's lists won, so the clinic the
  // supervisor added to her plan meanwhile was dropped.
  // =====================================================================
  if(want('B2')){
    seedCloud();
    cloud.dayPlans = JSON.stringify({ '2026-09-22': { Mariam: [{ id: 'c1', note: '' }] } });
    const M = await mkPhone('B2-Mariam'), S = await mkPhone('B2-sup');
    await M.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    const supAdd = (date, id) => S.ev(async ({ date, id }) => { dayPlans[date] = dayPlans[date] || {}; dayPlans[date].Mariam = (dayPlans[date].Mariam || []).concat([{ id, note: 'from the supervisor' }]); return persist('dayPlans'); }, { date, id });
    const plan = (date, id) => M.ev(async ({ date, id }) => { dayPlans[date] = dayPlans[date] || {}; dayPlans[date].Mariam = (dayPlans[date].Mariam || []).concat([{ id, note: '' }]); return persist('dayPlans'); }, { date, id });
    const ids = date => (((parse(cloud.dayPlans) || {})[date] || {}).Mariam || []).map(e => e.id);
    await supAdd('2026-09-22', 'c2');
    mode.offline.add('B2-Mariam');
    await M.boot('Mariam', 'rep');                                                  // opened with no signal: her copy
    await plan('2026-09-23', 'c3');
    mode.offline.delete('B2-Mariam');
    await M.tick();
    check('B2. an offline start, then a plan for another day: the clinic the supervisor added to her 22 Sep plan stays', JSON.stringify(ids('2026-09-22')) === '["c1","c2"]' && ids('2026-09-23').includes('c3'), { d22: ids('2026-09-22'), d23: ids('2026-09-23') });
    // queued, reopened with no signal, planned again: still merged against what the cloud last confirmed
    mode.offline.add('B2-Mariam');
    await plan('2026-09-24', 'c1');                                                // queued
    await supAdd('2026-09-22', 'c3');                                              // meanwhile
    await M.boot('Mariam', 'rep');                                                  // the app closed and reopened, still no signal
    await plan('2026-09-25', 'c2');
    mode.offline.delete('B2-Mariam');
    await M.tick();
    check('B2b. queued, reopened without a connection, planned again: the supervisor\'s change made meanwhile stays', JSON.stringify(ids('2026-09-22')) === '["c1","c2","c3"]' && ids('2026-09-24').includes('c1') && ids('2026-09-25').includes('c2'), { d22: ids('2026-09-22'), d24: ids('2026-09-24'), d25: ids('2026-09-25') });
    await M.ctx.close(); await S.ctx.close();
  }

  // =====================================================================
  // B3 (K4, P1): visits merged with this phone's copy winning: the
  // supervisor's correction of a visit was undone by a rep's phone that then
  // logged a visit with no signal.
  // =====================================================================
  if(want('B3')){
    seedCloud();
    cloud.visits = JSON.stringify([visit('v1', 'c1', 'Mariam', { date: '2026-09-20', notes: 'original', products: ['P-1'] })]);
    const M = await mkPhone('B3-Mariam'), S = await mkPhone('B3-sup');
    await M.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    const v1 = () => (parse(cloud.visits) || []).find(v => v.id === 'v1') || {};
    await S.ev(async () => { visits.find(v => v.id === 'v1').notes = 'corrected'; return persist('visits'); });
    mode.offline.add('B3-Mariam');
    await M.ev(async (v) => { visits.push(v); return persist('visits'); }, visit('v2', 'c3', 'Mariam'));
    mode.offline.delete('B3-Mariam');
    await M.tick();
    const scr = await M.ev(() => (visits.find(v => v.id === 'v1') || {}).notes);
    check('B3. a rep\'s phone with the older copy logs a visit offline: the supervisor\'s correction of another visit stays — in the cloud and on her screen', v1().notes === 'corrected' && (parse(cloud.visits) || []).some(v => v.id === 'v2') && scr === 'corrected', { cloud: v1().notes, screen: scr });
    await M.ev(async (v) => { visits.push(v); return persist('visits'); }, visit('v2b', 'c3', 'Mariam'));
    check('B3a. …and her next save does not put the old notes back', v1().notes === 'corrected', v1().notes);
    // both changed the same visit, different fields: each keeps its own
    await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(async () => { visits.find(v => v.id === 'v1').notes = 'second correction'; return persist('visits'); });
    mode.offline.add('B3-Mariam');
    await M.ev(async () => { visits.find(v => v.id === 'v1').products = ['P-1', 'P-2']; return persist('visits'); });
    mode.offline.delete('B3-Mariam');
    await M.tick();
    check('B3c. both phones changed the same visit (notes there, products here): both changes are kept', v1().notes === 'second correction' && JSON.stringify(v1().products) === '["P-1","P-2"]', { notes: v1().notes, products: v1().products });
    // queued, the app closed and reopened without a connection: the phone kept what the cloud last confirmed
    mode.offline.add('B3-Mariam');
    await M.ev(async (v) => { visits.push(v); return persist('visits'); }, visit('v3', 'c1', 'Mariam'));
    await S.ev(async () => { visits.find(v => v.id === 'v1').notes = 'third correction'; return persist('visits'); });
    await M.boot('Mariam', 'rep');
    await M.ev(async (v) => { visits.push(v); return persist('visits'); }, visit('v4', 'c1', 'Mariam'));
    mode.offline.delete('B3-Mariam');
    await M.tick();
    const ids = (parse(cloud.visits) || []).map(v => v.id);
    check('B3b. queued, reopened without a connection, another visit logged: the correction made meanwhile stays', v1().notes === 'third correction' && ids.includes('v3') && ids.includes('v4'), { notes: v1().notes, ids });
    // opened with no signal and nothing queued: the phone's copy is the base, field by field
    await M.tick();                                                                // her copy now holds the third correction
    await S.ev(async () => { visits.find(v => v.id === 'v1').notes = 'fourth correction'; return persist('visits'); });
    mode.offline.add('B3-Mariam');
    await M.boot('Mariam', 'rep');
    await M.ev(async () => { const v = visits.find(x => x.id === 'v1'); v.products = ['P-1', 'P-2', 'P-3']; visits.push(Object.assign({}, v, { id: 'v5', notes: '', products: [] })); return persist('visits'); });
    mode.offline.delete('B3-Mariam');
    await M.tick();
    check('B3d. opened with no signal, nothing queued, then a visit edited and one logged: the correction made meanwhile stays, and her edit lands', v1().notes === 'fourth correction' && JSON.stringify(v1().products) === '["P-1","P-2","P-3"]' && (parse(cloud.visits) || []).some(v => v.id === 'v5'), { notes: v1().notes, products: v1().products });
    await M.ctx.close(); await S.ctx.close();
  }

  // =====================================================================
  // B4 (K6): a whole document was a plain set with a 7-second wait — a save
  // the app had given up on ("No connection") could land later over a newer
  // save from another device. Now one compare-and-set in a transaction.
  // =====================================================================
  if(want('B4')){
    seedCloud();
    const P = await mkPhone('B4-phone'), L = await mkPhone('B4-laptop');
    await P.boot('Dr. Ghaith', 'supervisor'); await L.boot('Dr. Ghaith', 'supervisor');
    mode.slowWrite.targets = 7500;                                                  // the phone's write reaches the cloud 7.5 s later (v122 gave up after 7)
    const pP = P.ev(async () => { targets.Mariam.revenue = 11111; return persist('targets'); });
    await new Promise(r => setTimeout(r, 1000));
    const okL = await L.ev(async () => { targets.Mariam.revenue = 22222; return persist('targets'); });
    const okP = await pP; await new Promise(r => setTimeout(r, 1500));
    const t = (parse(cloud.targets) || {}).Mariam.revenue;
    check('B4. a phone\'s targets save that reaches the cloud late never lands over the laptop\'s newer save', okL === true && t === 22222, { okL, okP, cloud: t, toasts: await P.ev(() => window.__toasts.slice(-2)) });
    check('B4b. …and the phone says it was changed on another device', okP === false && (await P.ev(() => window.__toasts.some(m => /Changed on another device/.test(m)))), { okP });
    // a save the app gave up on (no answer in 12 s) that lands after all: the phone follows it and says so
    await P.boot('Dr. Ghaith', 'supervisor');
    mode.slowWrite.targets = 14000;
    const late = await P.ev(async () => { targets.Renova.revenue = 33333; return persist('targets'); });
    await P.page.waitForFunction(() => window.__toasts.some(m => /reached the cloud late/.test(m)), null, { timeout: 15000 }).catch(() => {});
    const said = await P.ev(() => window.__toasts.slice());
    const next = await P.ev(async () => { targets.Mariam.revenue = 44444; return persist('targets'); });
    const t2 = parse(cloud.targets) || {};
    check('B4c. a settings save that lands after the app gave up on it: the phone says it reached the cloud, and its next save lands too', late === false && said.some(m => /No connection/.test(m)) && said.some(m => /reached the cloud late/.test(m)) && next === true && t2.Renova.revenue === 33333 && t2.Mariam.revenue === 44444, { late, said, next, cloud: { Mariam: t2.Mariam.revenue, Renova: t2.Renova.revenue } });
    await P.ctx.close(); await L.ctx.close(); mode.slowWrite = {};
  }

  // =====================================================================
  // B5 (A5-whole): every phone wrote the whole recycle bin on every delete —
  // two deletes on two phones within one refresh lost one bin entry (the
  // record stayed deleted, its undo was gone); a restore from the bin on one
  // phone was put back into the bin by the other phone's next delete.
  // =====================================================================
  if(want('B5')){
    seedCloud();
    cloud.visits = JSON.stringify([visit('vA', 'c1', 'Mariam', { date: '2026-09-20' }), visit('vB', 'c2', 'Renova', { date: '2026-09-20' }), visit('vC', 'c2', 'Renova', { date: '2026-09-19' })]);
    const M = await mkPhone('B5-Mariam'), R = await mkPhone('B5-Renova'), S = await mkPhone('B5-sup');
    await M.boot('Mariam', 'rep'); await R.boot('Renova', 'rep');
    await M.ev(async () => { await deleteVisit('vA'); });
    await R.ev(async () => { await deleteVisit('vB'); });                          // her bin was read before Mariam's delete
    const bin = () => (((parse(cloud.recycleBin) || {}).visits) || []).map(v => v.id).sort();
    check('B5. two deletes on two phones: the recycle bin keeps both entries', JSON.stringify(bin()) === '["vA","vB"]', bin());
    await M.ctx.close(); await R.ctx.close();
    // a restore from the bin on one phone, then a delete on a phone whose bin was read before it
    seedCloud();
    cloud.visits = JSON.stringify([visit('vC', 'c2', 'Renova', { date: '2026-09-19' })]);
    cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [Object.assign(visit('vA', 'c1', 'Mariam', { date: '2026-09-20' }), { _deletedAt: CLOCK - 3600000, _label: 'Dental 5 Clinic' })] });
    cloud.tombs = JSON.stringify({ visits: { vA: CLOCK - 3600000 }, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} });
    const R2 = await mkPhone('B5b-Renova');
    await R2.boot('Renova', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(async () => { const i = recycleBin.visits.findIndex(v => v.id === 'vA'); await restoreFromBin('visits', i); });   // vA restored
    await R2.ev(async () => { await deleteVisit('vC'); });                         // her bin still holds vA
    check('B5b. …a visit restored from the bin on one phone is not put back into the bin by another phone\'s next delete', JSON.stringify(bin()) === '["vC"]' && (parse(cloud.visits) || []).some(v => v.id === 'vA'), { bin: bin() });
    await R2.ctx.close(); await S.ctx.close();
  }

  // =====================================================================
  // B6: the ERP notes (reasons on returns and free goods) were one document
  // written whole: two phones noting two invoices kept only the later one.
  // =====================================================================
  if(want('B6')){
    seedCloud();
    const M = await mkPhone('B6-Mariam'), S = await mkPhone('B6-sup');
    await M.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await M.ev(async () => { erpNotes['ret|SR1|Brush'] = { text: 'damaged box', by: 'Mariam', on: '2026-09-21' }; return persist('erpNotes'); });
    await S.ev(async () => { erpNotes['foc|SF2|Floss'] = { text: 'launch sample', by: 'Dr. Ghaith', on: '2026-09-21', kind: 'sample' }; return persist('erpNotes'); });
    const n = parse(cloud.erpNotes) || {};
    const scr = await S.ev(() => Object.keys(erpNotes).sort());
    check('B6. two phones note two invoices: both notes are kept (and the second phone shows both)', !!n['ret|SR1|Brush'] && !!n['foc|SF2|Floss'] && scr.length === 2, { cloud: Object.keys(n), screen: scr });
    await M.ctx.close(); await S.ctx.close();
  }

  // =====================================================================
  // B7 (S4-device): "Restore from this phone's copy" put the old copy back
  // whole — the owner and handover set since were undone, and a clinic
  // deleted since came back. Now: a sheet of differences, only ticked rows.
  // =====================================================================
  if(want('B7')){
    seedCloud();
    cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', prevRep: 'Renova', repSince: '2026-09-01', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
      { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [] }]);
    cloud.tombs = JSON.stringify({ visits: {}, tasks: {}, clinics: { c4: CLOCK - DAY }, events: {}, dayPlans: {}, doctors: {} });
    const oldCopy = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Renova', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }, { id: 'd9', name: 'Dr. Basma' }] },
      { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [] },
      { id: 'c4', name: 'Deleted On Purpose', rep: 'Mariam', cls: 'C', doctors: [] }, { id: 'c5', name: 'Lost Clinic', rep: 'Renova', cls: 'B', doctors: [] }]);
    const S = await mkPhone('B7-sup');
    await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(c => { localStorage.setItem('um_mirror_prev:clinics', c); }, oldCopy);
    const before = cloud.clinics;
    const sheet = await S.ev(async () => {
      await restoreDeviceClinics('prev'); await new Promise(r => setTimeout(r, 200));
      const body = document.getElementById('devCopyBody');
      return { text: body ? body.innerText.replace(/\s+/g, ' ') : '', boxes: body ? [...body.querySelectorAll('input[data-devcopy]')].map(i => ({ id: i.dataset.devcopy, on: i.checked })) : [] };
    });
    const unchanged = cloud.clinics === before;
    check('B7. the phone\'s copy is compared clinic by clinic before anything changes: missing ones (one deleted on purpose), the owner that differs, a doctor only the copy has — nothing ticked',
      unchanged && sheet.boxes.length === 3 && sheet.boxes.every(b => !b.on) && /Deleted On Purpose/.test(sheet.text) && /deleted in the app/.test(sheet.text) && /Lost Clinic/.test(sheet.text) && /Owner: Mariam → Renova/.test(sheet.text) && /Dr\. Basma/.test(sheet.text), { unchanged, sheet });
    await S.ev(async () => { if(typeof devCopyToggle !== 'function') return; devCopyToggle('c5', true); await applyDeviceCopy(); await new Promise(r => setTimeout(r, 300)); });
    const after = { c1: cl('c1').rep, c1prev: cl('c1').prevRep, c4: !!cl('c4').id, c5: cl('c5').name, c1docs: (cl('c1').doctors || []).map(d => d.id) };
    check('B7b. only the ticked clinic comes back; the handover of Dental 5 and the deleted clinic stay as the list has them', after.c5 === 'Lost Clinic' && after.c1 === 'Mariam' && after.c1prev === 'Renova' && !after.c4 && JSON.stringify(after.c1docs) === '["d1"]', after);
    await S.ctx.close();
  }

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
