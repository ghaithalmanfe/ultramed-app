// Adversarial review of the start-up speed change (v126, branch speed-v1:
// the phone keeps sales chunks and past months in IndexedDB "um_keep", the
// home figures are worked out after the paint). Every check fails on f0e04e5;
// all but S4 pass on the live v125 (e3ce672) — S4 fails there too (it is older
// than the change). The scenarios that held are in the review's report.
//  S1  another phone's save landed in a past month but not its index write (the
//      app closed between the two): after a restart this phone still shows the
//      month as its store kept it — a visit logged into that month is hidden
//  S2  the same two days later (past KEEP_RECHECK_MS): after a start and three
//      20-second rounds the visit is still hidden (a kept month is checked
//      again only at a round, one month a round, oldest month first)
//  S3  a visit moved from one past month to the next on another phone (Edit
//      visit, its date corrected; the save stopped before the index): this
//      phone restarts and edits a visit of the later month — the moved visit
//      must stay in the cloud with its corrected date. S3a (the fixture's own
//      month order: every save rewrites every month) — put back at its old
//      date; S3b (months in the order the app writes them) — gone from every
//      document: the store's older copy of the earlier month counts as "the
//      cloud holds it there", so the tidy removes it from the later one
//  S4  the home screen's frames after a change (a refresh brings new targets):
//      every painted frame shows the figures of ONE data state — the target
//      card's ring and remaining agree with its target and achieved
//  S5  a store that never answers: the start and every 20-second round are not
//      slower than with a store that fails at once
//  S6  a first start (nothing kept): the past months are asked for before a
//      slow delete log answers (they used to be read beside it)
//  S7  a 20-second round on a phone whose copy holds every sales file reads
//      nothing from the store
// Invented data (fixtures/heavy-year.js, scale 0.1), a fake cloud in Node, a
// fixed clock, the 20-second round driven by hand. Port 8283. ONLY=S1,S3 runs a subset.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const PORT = 8283;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const FIX = require('./fixtures/heavy-year.js').build({ scale: 0.1 });
const CLOCK = Date.parse(FIX.now);
const SUP = 'Dr. Ghaith';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = path.join(WWW, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); }); });

// ---- the fake cloud: key → stored string, shared by every phone, survives reloads ----
let cloud = new Map();
const resetCloud = () => { cloud = new Map(Object.entries(FIX.docs)); };
// slow[k] = ms: every read of k answers ms later (slow['visitsArch:*']: every past month); log: every read asked for / answered
const mode = { slow: {}, log: [] };
let held = false; const waiters = [];
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const api = {
  get: async (who, k) => { mode.log.push({ who, k, ev: 'ask', t: Date.now() }); const ms = mode.slow[k] || mode.slow[k.split(':')[0] + ':*']; if(ms) await wait(ms);
    const v = cloud.has(k) ? cloud.get(k) : null; mode.log.push({ who, k, ev: 'answer', t: Date.now() }); return v; },
  set: async (who, k, v) => { cloud.set(k, v); return true; },
  setMany: async (who, e) => { e.forEach(([k, v]) => cloud.set(k, v)); return true; },
  del: async (who, k) => { cloud.delete(k); return true; },
  list: async (who, p) => [...cloud.keys()].filter(k => k.startsWith(p)),
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  -> ' + JSON.stringify(info).slice(0, 900) : '')); if(!ok) failed++; }
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const visitDocs = () => [...cloud.keys()].filter(k => k === 'visits' || k.startsWith('visitsArch:'));
const findVisit = id => visitDocs().map(k => { const v = (parse(cloud.get(k)) || []).find(x => x && x.id === id); return v ? k + '@' + v.date : null; }).filter(Boolean);
// the phone's store, read from the page without creating it
function storeDumpInPage(){
  return new Promise(res => {
    let rq; try{ rq = indexedDB.open('um_keep'); }catch(e){ return res(null); }
    rq.onupgradeneeded = () => { try{ rq.transaction.abort(); }catch(e){} };
    rq.onerror = () => res(null);
    rq.onsuccess = () => { const db = rq.result; if(!db.objectStoreNames.contains('docs')){ db.close(); return res([]); }
      const g = db.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => { db.close(); res(g.result.map(e => ({ k: e.k, rev: e.rev, n: (e.text || '').length, at: e.at }))); }; g.onerror = () => { db.close(); res(null); }; };
  });
}
const MONTHS = Object.keys(parse(FIX.docs.visitsIndex).months).sort();
const CHUNKS = Object.keys(FIX.docs).filter(k => k.startsWith('erpRows:')).length;

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const errors = [];
  const mkPhone = async (label) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await blockFirebase(ctx);
    await ctx.route(/fonts\.googleapis|fonts\.gstatic/, r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v));
    await page.exposeFunction('__cDel', k => api.del(label, k)); await page.exposeFunction('__cList', p => api.list(label, p));
    await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript((clock) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { await window.__cAcquire(); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(); } },
      };
      // this phone's clock: pinned, moved by whole days with __setDay(n) (kept across reloads)
      const shift = () => { try{ return (parseInt(sessionStorage.getItem('__day') || '0', 10) || 0) * 86400000; }catch(e){ return 0; } };
      const off = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off + shift()); else super(...a); } static now(){ return _D.now() + off + shift(); } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      window.__setDay = n => { sessionStorage.setItem('__day', String(n)); };
      // the 20-second round, driven by the harness
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      // the store "um_keep": sessionStorage __keep = 'throw' (does not open) | 'hang' (never answers); its reads counted
      const open0 = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function(name){
        const m = (() => { try{ return sessionStorage.getItem('__keep') || ''; }catch(e){ return ''; } })();
        if(name === 'um_keep' && m === 'throw') throw new Error('harness: the store does not open');
        if(name === 'um_keep' && m === 'hang') return { readyState: 'pending', result: null, error: null };
        return open0.apply(this, arguments);
      };
      window.__keepReads = 0;
      const ga = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.getAll = function(){ try{ if(this.transaction.db.name === 'um_keep') window.__keepReads++; }catch(e){} return ga.apply(this, arguments); };
    }, CLOCK);
    const goto = async () => { await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(150); };
    const boot = async (who, role) => { await goto(); const t0 = Date.now(); await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role }); const ms = Date.now() - t0; await page.waitForTimeout(150); return ms; };
    const tick = async () => { await page.waitForFunction(() => typeof _flushing === 'undefined' || !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); };
    const dump = () => page.evaluate(storeDumpInPage);
    // the store has every past month and chunk the first open read (v125 has no store: gives up after ~3 s)
    const waitStore = async () => { for(let i = 0; i < 30; i++){ const d = await dump(); if(d && d.filter(e => /^visitsArch:/.test(e.k)).length >= MONTHS.length && d.filter(e => /^erpRows:/.test(e.k)).length >= CHUNKS) return d.length; await wait(100); } return 0; };
    return { page, ctx, goto, boot, tick, dump, waitStore, ev: (fn, arg) => page.evaluate(fn, arg) };
  };

  // =====================================================================
  // S1 + S2: a past month changed in the cloud, its index revision owed.
  // Mariam's phone uploads a visit dated 29 October after days without
  // signal; the archive of October landed, the index write did not (the app
  // was closed). The supervisor's phone, which keeps October, restarts.
  // =====================================================================
  if(want('S1') || want('S2')){
    resetCloud();
    const A = await mkPhone('S1-sup');
    await A.boot(SUP, 'supervisor');
    const kept = await A.waitStore();
    const N = '2026-10', oct = parse(cloud.get('visitsArch:' + N));
    const tpl = oct.find(v => v && v.rep === 'Mariam' && !v.callOnly) || oct[0];
    const Z = Object.assign({}, tpl, { id: 'rv-late-29oct', date: '2026-10-29', ts: Date.parse('2026-10-29T12:00:00'), notes: 'uploaded late, after days without signal', photos: [] });
    cloud.set('visitsArch:' + N, JSON.stringify(oct.concat([Z]))); // Pass A landed; Pass C (visitsIndex) did not
    await A.boot(SUP, 'supervisor');
    const s1 = await A.ev(id => ({ shown: (visits || []).some(v => v && v.id === id), oct: (visits || []).filter(v => v && String(v.date).slice(0, 7) === '2026-10').length,
      fromStore: Object.keys(_visitsArch || {}).filter(m => _visitsArch[m] && _visitsArch[m].kept != null).length }), Z.id);
    const inCloud = parse(cloud.get('visitsArch:' + N)).length;
    if(want('S1')) check(`S1: after a restart, a visit another phone saved into a past month (its index write lost) is on screen — the cloud's October has ${inCloud} visits`,
      s1.shown && s1.oct === inCloud, Object.assign({ storeEntries: kept }, s1));
    if(want('S2')){
      await A.ev(() => window.__setDay(2));
      await A.boot(SUP, 'supervisor');
      const atStart = await A.ev(id => (visits || []).some(v => v && v.id === id), Z.id);
      for(let i = 0; i < 3; i++) await A.tick();
      const s2 = await A.ev(id => ({ shown: (visits || []).some(v => v && v.id === id), today: todayStr(),
        keptAges: Object.keys(_visitsArch || {}).filter(m => _visitsArch[m].kept != null).map(m => m + ':' + Math.round((Date.now() - _visitsArch[m].kept) / 3600000) + 'h') }), Z.id);
      check(`S2: two days later (past KEEP_RECHECK_MS), after a start and three 20-second rounds, that visit is on screen`, atStart && s2.shown, Object.assign({ atStart }, s2));
    }
    await A.ctx.close();
  }

  // =====================================================================
  // S3: a visit moved between two past months on another phone (Mariam's
  // laptop corrects its date from September to 1 October; the save wrote
  // September and October, then the laptop closed before the index). The
  // supervisor's phone restarts and edits a visit of October.
  // =====================================================================
  // S3 runs twice: on the fixture as built, and with every month in the order the app itself writes it (visits sorted by
  // time: a save then writes only the months it changed — the fixture's months are in another order, so every save
  // rewrites them all). The visit must be in the cloud, at its corrected date, both times.
  for(const ordered of [false, true]) if(want('S3')){
    resetCloud();
    if(ordered){ const ord = v => (v && v.ts) || (v && v.date ? new Date(v.date + 'T00:00:00').getTime() : 0);
      [...cloud.keys()].filter(k => k.startsWith('visitsArch:')).forEach(k => cloud.set(k, JSON.stringify(parse(cloud.get(k)).sort((a, b) => ord(a) - ord(b))))); }
    const A = await mkPhone('S3-sup' + (ordered ? '-ordered' : ''));
    await A.boot(SUP, 'supervisor');
    await A.waitStore();
    const M = '2026-09', N = '2026-10', sep = parse(cloud.get('visitsArch:' + M)), oct = parse(cloud.get('visitsArch:' + N));
    const X = sep.find(v => v && !v.callOnly && v.rep === 'Mariam' && !(v.photos || []).length) || sep.find(v => v && !v.callOnly);
    const Y = oct.find(v => v && !v.callOnly && v.id !== X.id);
    const X2 = Object.assign({}, X, { date: '2026-10-01', editedBy: 'Mariam', editedAt: Date.parse('2026-11-24T08:00:00') });
    // what the laptop's save had written when it stopped: September without X (Pass A, then the tidy of Pass B), October with X — no index write
    cloud.set('visitsArch:' + M, JSON.stringify(sep.filter(v => v.id !== X.id)));
    cloud.set('visitsArch:' + N, JSON.stringify([X2].concat(oct)));
    await A.boot(SUP, 'supervisor');
    const before = await A.ev(id => { const v = (visits || []).find(x => x && x.id === id); return v ? v.date : null; }, X.id);
    const saved = await A.ev(async id => { const v = visits.find(x => x && x.id === id); v.notes = (v.notes || '') + ' [checked by the supervisor]'; const r = await persistTold('visits'); return r && r.ok; }, Y.id);
    const where = findVisit(X.id), yNotes = ((parse(cloud.get('visitsArch:' + N)) || []).find(v => v.id === Y.id) || {}).notes || '';
    const wrote = Object.keys(parse(cloud.get('visitsIndex')).months).filter(m => parse(cloud.get('visitsIndex')).months[m].rev !== parse(FIX.docs.visitsIndex).months[m].rev);
    check(`S3${ordered ? 'b' : 'a'}: a visit another phone moved from September to 1 October stays in the cloud with its corrected date after this phone restarts and saves a visit of October${ordered ? ' (months in the app\'s own order)' : ''}`,
      saved && where.length === 1 && where[0] === 'visitsArch:2026-10@2026-10-01', { saved, where, shownBeforeSave: before, yEdited: /checked by the supervisor/.test(yNotes), monthsWritten: wrote });
    await A.ctx.close();
  }

  // =====================================================================
  // S4: the frames painted after a change. The supervisor's laptop saved new
  // targets for November; this phone's next 20-second round brings them in.
  // =====================================================================
  if(want('S4')){
    resetCloud();
    const A = await mkPhone('S4-sup');
    await A.boot(SUP, 'supervisor');
    await A.ev(() => msWhenReady());
    await A.ev(() => {
      window.__frames = [];
      window.__readHero = () => { const g = s => { const el = document.querySelector('#msSales [data-ms="' + s + '"]'); return el ? el.getAttribute('data-value') : null; };
        return { sales: g('sales'), goal: g('of-target'), pct: g('achievement'), remaining: g('remaining'), fresh: !!(_msModel && _msModel.sig === msSig(msView())) }; };
      const orig = window.renderToday;
      window.renderToday = function(){ const r = orig.apply(this, arguments); requestAnimationFrame(() => window.__frames.push(window.__readHero())); return r; };
    });
    const ready0 = await A.ev(() => window.__readHero());
    const tg = parse(cloud.get('targets'));
    Object.keys(tg).forEach(p => { if(!p.startsWith('_') && tg[p] && tg[p].revenue > 0) tg[p].revenue = Math.round(tg[p].revenue * 0.7); });
    cloud.set('targets', JSON.stringify(tg));
    await A.tick();
    await A.ev(() => msWhenReady());
    await A.page.waitForTimeout(100);
    const frames = await A.ev(() => window.__frames), ready = await A.ev(() => window.__readHero());
    // one data state: the ring is achieved ÷ target, the remaining is target − achieved
    const bad = f => { const s = +f.sales, g = +f.goal; if(!(g > 0) || f.pct == null || f.sales == null) return false;
      const r = f.remaining == null || f.remaining === '' ? null : +f.remaining;
      return Math.abs(+f.pct - s / g * 100) > 1.5 || (r != null && Math.abs(r - Math.max(0, g - s)) > 1); };
    const shown = frames.filter(f => f.goal === ready.goal);
    check(`S4: every frame painted after new targets arrive shows one data state (ring ${ready.pct}% = achieved ÷ target, remaining = target − achieved)`,
      !bad(ready) && !bad(ready0) && shown.length > 0 && !shown.some(bad), { before: ready0, frames: shown.slice(0, 3), ready });
    await A.ctx.close();
  }

  // =====================================================================
  // S5: a store that never answers (IndexedDB open hangs) against one that
  // fails at once: the start takes as long (each a new phone, its first open).
  // =====================================================================
  if(want('S5')){
    const times = { throw: [], hang: [] }, rounds = { throw: [], hang: [] };
    for(let i = 0; i < 2; i++) for(const m of ['throw', 'hang']){
      resetCloud();
      const A = await mkPhone('S5-' + m + i);
      await A.goto(); await A.ev(k => sessionStorage.setItem('__keep', k), m);
      times[m].push(await A.boot('Mariam', 'rep'));
      const t0 = Date.now(); await A.tick(); rounds[m].push(Date.now() - t0);
      await A.ctx.close();
    }
    const t = (o, m) => Math.min(...o[m]);
    check(`S5: with a store that never answers, the start and the 20-second round are not slower than with one that fails at once (start ${t(times, 'hang')} vs ${t(times, 'throw')} ms, round ${t(rounds, 'hang')} vs ${t(rounds, 'throw')} ms)`,
      t(times, 'hang') - t(times, 'throw') < 400 && t(rounds, 'hang') - t(rounds, 'throw') < 400, { times, rounds });
  }

  // =====================================================================
  // S6: a first start, the delete log slow to answer (1.5 s), each past month
  // 0.8 s: the past months are asked for beside the log, not after it.
  // =====================================================================
  if(want('S6')){
    resetCloud();
    const A = await mkPhone('S6-rep');
    mode.slow = { tombs: 1500, 'visitsArch:*': 800 }; mode.log = [];
    const ms = await A.boot('Mariam', 'rep');
    mode.slow = {};
    const L = mode.log.filter(e => e.who === 'S6-rep');
    const tombsAns = Math.min(...L.filter(e => e.k === 'tombs' && e.ev === 'answer').map(e => e.t));
    const monthAsk = Math.min(...L.filter(e => /^visitsArch:/.test(e.k) && e.ev === 'ask').map(e => e.t));
    const idxAns = Math.min(...L.filter(e => e.k === 'visitsIndex' && e.ev === 'answer').map(e => e.t));
    check(`S6: on a first start the past months are asked for before a slow delete log answers (the index answered ${tombsAns - idxAns} ms before it; the start took ${ms} ms)`,
      monthAsk < tombsAns, { firstMonthAskedAfterLog: monthAsk - tombsAns, bootMs: ms });
    await A.ctx.close();
  }

  // =====================================================================
  // S7: a light phone (its copy holds every sales file): the 20-second round
  // reads nothing from the store.
  // =====================================================================
  if(want('S7')){
    resetCloud();
    const A = await mkPhone('S7-rep');
    await A.boot('Mariam', 'rep');
    const n = await A.waitStore();
    const held = await A.ev(() => { const m = UMCore.safeParse(localStorage.getItem('um_mirror:erpSales'), null); return m ? m.periods.filter(p => Array.isArray(p.rows) && p.rows.length).length : 0; });
    await A.ev(() => { window.__keepReads = 0; });
    await A.tick(); await A.tick();
    const reads = await A.ev(() => window.__keepReads);
    const bytes = ((await A.dump()) || []).filter(e => /^erpRows:/.test(e.k)).reduce((s, e) => s + e.n, 0);
    check(`S7: two 20-second rounds on a phone whose copy holds all ${held} sales files read nothing from the store`, reads === 0, { storeReads: reads, keptSalesBytes: bytes, storeEntries: n });
    await A.ctx.close();
  }

  console.log(results.join('\n'));
  if(errors.length) console.log('page errors:\n' + errors.slice(0, 10).join('\n'));
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
