// The adversarial review of release v123 "data safety" (13 Nov): each finding
// reproduced on a fake cloud before its fix (the review's probes p1–p9).
//  R1  a phone whose sign-in ended (signed out, a password changed on another
//      device, a login disabled) keeps what waits in its queue: a save the
//      cloud refuses for a phone with no access stays queued on the phone and
//      uploads once access is back — in place, after a reopen, after Sign out
//      on a shared phone while the queue was uploading; the sign-in ending
//      while the app is open shows the sign-in screen and keeps the queue
//  R2  a refresh that kept the lists on screen (a save ran while it read) does
//      not move the visits' merge base: the next visit save keeps another
//      phone's correction
//  R3  restoring TODAY's backup never replaces it: a full backup to this
//      device first, today's backup untouched, a restore that fails half-way
//      can be done again from the same good copy
//  R4  a whole-day Restore reads the lists again first and refuses when they
//      did not load: its counts and the copy it keeps are the cloud's
//  R6  an older app version that rewrote the delete log with its 7-day cutoff
//      brings no deleted record back (the log is stamped, a revival is
//      recorded, the deletes it dropped are kept and published again) — and a
//      record that older version brought back is never deleted again
//  R7  two phones edit the same visit / the same day's plan: after a reopen with
//      no signal the visit still merges field by field; a day's plan merges
//      entry by entry (her removal and his addition both stay)
//  R8  the daily backup is never written from a phone whose read of a list failed
//  R10 a rename whose team-list save is refused leaves nothing half-renamed; a
//      product code change whose catalog save is refused re-points no visit
// (R5, new clinics from the visit and order forms, is in save-truth.e2e.js
// section E; R9, the app revision on every document, in tests/rules.)
// Several phones share one cloud (in Node); the 20-second refresh is driven by
// hand; clock pinned to Fri 13 Nov 2026. Port 8288. ONLY=R1,R3 runs a subset.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8288;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{ const u = req.url.split('?')[0]; const f = path.join(WWW, u==='/'?'index.html':u); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });

// ---- the fake cloud (in Node: shared by every phone, survives reloads) ----
// deny: { re, ops: 'r'|'w'|'rw', who?: Set of phone labels } — permission-denied, as the rules answer
// offline: phones with no connection · hang[k] = n: the next n reads of k never answer
// slowWrite[k] = ms: the next write of k lands ms later · onWrite(who, key): called after each write
const cloud = {};
const LIMIT = 1048576 - 100;
const mode = { deny: null, offline: new Set(), hang: {}, slowGet: {}, slowWrite: {}, onWrite: null, reads: [], writes: [], tries: [] };
let held = false; const waiters = [];
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const off = who => mode.offline.has(who) ? { __err: 'unavailable', msg: 'boom-offline: the client is offline' } : null;
const denied = (who, k, op) => !!(mode.deny && mode.deny.re.test(k) && mode.deny.ops.includes(op) && (!mode.deny.who || mode.deny.who.has(who)));
const api = {
  get: async (who, k, tx) => { const o = off(who); if(o) return o; mode.reads.push(who + '|' + k);
    if(!tx && mode.hang[k] > 0){ mode.hang[k]--; return new Promise(() => {}); } // (a transaction's own read never hangs: it would hold the lock)
    if(denied(who, k, 'r')) return { __err: 'permission-denied' };
    const v = k in cloud ? cloud[k] : null;
    if(mode.slowGet[k]){ const ms = mode.slowGet[k]; delete mode.slowGet[k]; await wait(ms); }
    return v; },
  set: async (who, k, v) => { const o = off(who); if(o) return o;
    if(mode.slowWrite[k]){ const ms = mode.slowWrite[k]; delete mode.slowWrite[k]; await wait(ms); }
    if(denied(who, k, 'w')){ mode.tries.push(who + '|' + k); return { __err: 'permission-denied' }; }
    if(Buffer.byteLength(v, 'utf8') > LIMIT){ mode.tries.push(who + '|' + k); return { __err: 'invalid-argument', msg: `Document 'state/${k}' cannot be written because its size exceeds the maximum allowed size of 1,048,576 bytes.` }; }
    mode.writes.push(who + '|' + k); cloud[k] = v; if(mode.onWrite) try{ mode.onWrite(who, k, v); }catch(e){} return true; },
  setMany: async (who, e) => { const o = off(who); if(o) return o; for(const [k] of e){ if(denied(who, k, 'w')) return { __err: 'permission-denied' }; } e.forEach(([k, v]) => { mode.writes.push(who + '|' + k); cloud[k] = v; }); return true; },
  del: async (who, k) => { const o = off(who); if(o) return o; if(denied(who, k, 'w')) return { __err: 'permission-denied' }; mode.writes.push(who + '|del:' + k); delete cloud[k]; return true; },
  list: async (who, p) => { const o = off(who); if(o) return o; return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,900):'')); if(!ok) failed++; }
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const DAY = 86400000;
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const TODAY = '2026-11-13', SNAP = 'snap_' + TODAY;
const SEEDS = { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true };
const visit = (id, extra) => Object.assign({ id, clinicId: 'c1', rep: 'Mariam', date: '2026-11-12', ts: CLOCK - DAY, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['d1'], notes: 'original notes' }, extra || {});
const task = (id, text, extra) => Object.assign({ id, text, done: false, created: '2026-11-01', rep: 'Mariam' }, extra || {});
const emptyLog = () => ({ visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} });
function seedCloud(extra){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  held = false; waiters.length = 0; mode.hang = {}; mode.slowGet = {}; mode.slowWrite = {}; mode.deny = null; mode.onWrite = null;
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] },
    { id: 'c3', name: 'Hilal Dental Center', rep: 'Mariam', cls: 'B', doctors: [] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-11' }, Renova: { revenue: 12000, month: '2026-11' } });
  cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: SEEDS });
  Object.assign(cloud, extra || {});
}

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  // opts.tombs: this phone's own delete log on the phone (um_tombs) before the app starts
  // opts.fakeAuth: a stand-in for the Firebase sign-in (onAuthStateChanged), to end a sign-in
  const mkPhone = async (label, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext(); await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cGetTx', k => api.get(label, k, true)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript(({ clock, tombs, fakeAuth }) => {
      // what the Firebase SDK throws: a FirebaseError with its code
      const fail = r => { if(r && r.__err){ const e = new Error(r.__err === 'permission-denied' ? 'Missing or insufficient permissions.' : (r.msg || r.__err)); e.code = r.__err; e.name = 'FirebaseError'; throw e; } return r; };
      window.storage = {
        get: async k => { const v = fail(await window.__cGet(k)); return v == null ? null : { value: v }; },
        set: async (k, v) => fail(await window.__cSet(k, v)), setMany: async e => fail(await window.__cSetMany(e)), delete: async k => fail(await window.__cDel(k)), list: async p => ({ keys: fail(await window.__cList(p)) }),
        update: async (k, fn) => { await window.__cAcquire(); try{ const cur = fail(await window.__cGetTx(k)); const next = fn(cur == null ? null : cur); if(next == null) return null; fail(await window.__cSet(k, next)); return next; } finally { await window.__cRelease(); } },
      };
      if(tombs && !sessionStorage.getItem('__tombsSet')){ try{ localStorage.setItem('um_tombs', tombs); sessionStorage.setItem('__tombsSet', '1'); }catch(e){} }
      if(fakeAuth){
        const cbs = [];
        const auth = { currentUser: null,
          onAuthStateChanged(cb){ cbs.push(cb); setTimeout(() => { try{ cb(auth.currentUser); }catch(e){} }, 0); return () => {}; },
          signOut: async () => { auth.currentUser = null; cbs.forEach(cb => { try{ cb(null); }catch(e){} }); },
          signInWithEmailAndPassword: async email => { auth.currentUser = { email, getIdToken: async () => 'test-token' }; cbs.forEach(cb => { try{ cb(auth.currentUser); }catch(e){} }); return {}; } };
        window.__fakeAuth = auth;
        window.__authEnds = () => { auth.currentUser = null; cbs.forEach(cb => { try{ cb(null); }catch(e){} }); };
        window.firebase = { auth: Object.assign(() => auth, { EmailAuthProvider: { credential(){ return {}; } } }) };
      }
      const offs = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + offs); else super(...a); } static now(){ return _D.now() + offs; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    }, { clock: CLOCK, tombs: opts.tombs ? JSON.stringify(opts.tombs) : null, fakeAuth: !!opts.fakeAuth });
    const watch = () => page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; try{ _lastOfflineToast = 0; }catch(e){} });
    const boot = async (who, role) => {
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(350);
      await watch();
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing, null, { timeout: 30000 }); await page.evaluate(async () => { await window.__bgTick(); }); await page.waitForTimeout(150); };
    const ev = (fn, arg) => page.evaluate(fn, arg);
    return { page, boot, tick, ev, label, ctx, watch };
  };
  const fill = (ph, o) => ph.ev(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId); document.getElementById('visitNotes').value = o.note; }, o);
  const cloudList = k => parse(cloud[k]) || [];

  // ===================== R1. a sign-in that ended keeps the queue =====================
  if(want('R1')){
    const NOTE = 'R1 visit logged with no signal';
    for(const variant of ['in place', 'app reopened']){
      seedCloud();
      const A = await mkPhone('R1-' + variant.replace(/\W/g, '')); await A.boot('Mariam', 'rep');
      mode.offline.add(A.label);
      await fill(A, { clinicId: 'c1', docId: 'd1', note: NOTE });
      await A.ev(async () => { await saveVisit(); });
      await A.ev(async () => { tasks.push({ id: 'tR1', text: 'R1 follow-up logged offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
      const queued = await A.ev(() => outboxList());
      // signal back — but this phone's sign-in has ended: every request is refused
      mode.offline.delete(A.label);
      mode.deny = { re: /.*/, ops: 'rw', who: new Set([A.label]) };
      await A.ev(() => { window.__toasts = []; });
      await A.tick(); await A.tick();
      const during = await A.ev(() => ({ outbox: outboxList(), onScreen: visits.some(v => v && v.notes === 'R1 visit logged with no signal'), aside: Object.keys(localStorage).filter(k => /^um_refused:/.test(k)), toasts: window.__toasts.slice() }));
      // signed in again: access is back
      mode.deny = null;
      if(variant === 'app reopened') await A.boot('Mariam', 'rep');
      for(let i = 0; i < 3; i++) await A.tick();
      const after = await A.ev(() => ({ outbox: outboxList(), onScreen: visits.some(v => v && v.notes === 'R1 visit logged with no signal'), task: tasks.some(t => t && t.id === 'tR1') }));
      const inCloud = cloudList('visits').some(v => v.notes === NOTE), taskInCloud = cloudList('tasks').some(t => t.id === 'tR1');
      check(`R1a [${variant}] a visit and a task queued with no signal survive a sign-in that ended: they stay queued on the phone (never "Not allowed, not saved", nothing set aside) and upload once access is back`,
        queued.includes('visits') && queued.includes('tasks') && during.outbox.includes('visits') && during.outbox.includes('tasks') && during.onScreen && !during.aside.length
          && !during.toasts.some(t => /Not allowed, not saved/.test(t)) && inCloud && taskInCloud && after.onScreen && after.task && !after.outbox.length,
        { queued, during, after, inCloud, taskInCloud });
      await A.ctx.close();
    }
    // R1c — a shared phone: she signs out while her queue uploads; the supervisor signs in on it
    seedCloud();
    const P = await mkPhone('R1c'); await P.boot('Mariam', 'rep');
    mode.offline.add('R1c');
    await P.ev(async () => { tasks.push({ id: 'tR1c', text: 'R1c task logged offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    await fill(P, { clinicId: 'c1', docId: 'd1', note: 'R1c visit logged offline' });
    await P.ev(async () => { await saveVisit(); });
    const q = await P.ev(() => outboxList());
    mode.offline.delete('R1c');
    mode.slowWrite[q[0]] = 2500; // the first list takes a few seconds (a slow office network)
    const flush = P.ev(async () => { await flushOutbox(); });
    await P.page.waitForTimeout(600);
    await P.ev(() => { switchUser(); });
    mode.deny = { re: /.*/, ops: 'rw', who: new Set(['R1c']) }; // requests after the sign-out carry no login
    await flush.catch(() => {});
    await P.page.waitForTimeout(300);
    const afterOut = await P.ev(() => ({ outbox: outboxList(), aside: Object.keys(localStorage).filter(k => /^um_refused:/.test(k)) }));
    mode.deny = null;
    await P.ev(async () => { await selectUser('Dr. Ghaith', 'supervisor'); });
    await P.page.waitForTimeout(400);
    for(let i = 0; i < 3; i++) await P.tick();
    check('R1c. she signs out on a shared phone while her queue uploads: what had not uploaded stays queued on the phone and uploads under the next sign-in',
      afterOut.outbox.length > 0 && !afterOut.aside.length && cloudList('visits').some(v => v.notes === 'R1c visit logged offline') && cloudList('tasks').some(t => t.id === 'tR1c'),
      { queued: q, afterSignOut: afterOut, visitInCloud: cloudList('visits').some(v => v.notes === 'R1c visit logged offline'), taskInCloud: cloudList('tasks').some(t => t.id === 'tR1c') });
    await P.ctx.close();
    // R1d — the sign-in ends while the app is open (Firebase says "no user"): the sign-in screen, the queue kept
    seedCloud();
    const D = await mkPhone('R1d', { fakeAuth: true });
    await D.page.goto(`http://localhost:${PORT}/index.html`); await D.page.waitForTimeout(300);
    await D.ev(async () => { await window.__fakeAuth.signInWithEmailAndPassword('mariam@example.com'); });
    await D.page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Mariam' && _bootLoaded, null, { timeout: 10000 });
    await D.page.waitForTimeout(300); await D.watch();
    mode.offline.add('R1d');
    await D.ev(async () => { tasks.push({ id: 'tR1d', text: 'R1d task logged offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    mode.offline.delete('R1d');
    mode.deny = { re: /.*/, ops: 'rw', who: new Set(['R1d']) };
    await D.ev(() => { window.__toasts = []; window.__authEnds(); });
    await D.page.waitForTimeout(300);
    await D.ev(async () => { if(typeof window.__bgTick === 'function') await window.__bgTick(); await flushOutbox(); });
    const ended = await D.ev(() => ({ gate: getComputedStyle(document.getElementById('gate')).display !== 'none', app: getComputedStyle(document.getElementById('app')).display !== 'none', outbox: outboxList(), toasts: window.__toasts.slice() }));
    mode.deny = null;
    await D.ev(async () => { await window.__fakeAuth.signInWithEmailAndPassword('mariam@example.com'); });
    await D.page.waitForFunction(() => currentUser && currentUser.name === 'Mariam', null, { timeout: 10000 });
    await D.page.waitForTimeout(600);
    for(let i = 0; i < 2; i++) await D.tick();
    check('R1d. the sign-in ends while the app is open: the sign-in screen shows, the queued task stays on the phone (said), and it uploads after the next sign-in',
      ended.gate && !ended.app && ended.outbox.includes('tasks') && ended.toasts.some(t => /sign in again/i.test(t)) && cloudList('tasks').some(t => t.id === 'tR1d'),
      { ended, taskInCloud: cloudList('tasks').some(t => t.id === 'tR1d') });
    await D.ctx.close();
  }

  // ===================== R2. a raced refresh keeps the visits' base =====================
  if(want('R2')){
    seedCloud({ visits: JSON.stringify([visit('V1')]), tasks: JSON.stringify([task('t1', 'call back')]) });
    const A = await mkPhone('R2-A'), S = await mkPhone('R2-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(async () => { const v = visits.find(x => x.id === 'V1'); v.notes = 'corrected by the supervisor'; await persist('visits'); });
    const n0 = mode.reads.length;
    mode.slowGet.erpSales = 2500; // her 20-second refresh: the sales index answers late
    const t = A.ev(async () => { await window.__bgTick(); });
    for(const t0 = Date.now(); !mode.reads.slice(n0).includes('R2-A|visits') && Date.now() - t0 < 5000;) await wait(50);
    await wait(500); // the visits are read (the correction is in them); the sales index is still on its way
    await A.ev(async () => { const x = tasks.find(y => y.id === 't1'); x.done = true; await persist('tasks'); }); // she ticks a task meanwhile
    await t;
    const shown = await A.ev(() => (visits.find(v => v.id === 'V1') || {}).notes);
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'R2 next visit' });
    await A.ev(async () => { await saveVisit(); });
    const v1 = cloudList('visits').find(v => v.id === 'V1') || {};
    check('R2. a refresh that kept the lists on screen (a save ran while it read) never lets the next visit save undo another phone\'s correction',
      v1.notes === 'corrected by the supervisor' && cloudList('visits').some(v => v.notes === 'R2 next visit'),
      { onHerScreenAfterTheRefresh: shown, v1InCloud: v1.notes, visits: cloudList('visits').length });
    await A.ctx.close(); await S.ctx.close();
  }

  // ===================== R3. restoring today's own backup =====================
  if(want('R3')){
    const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [] }));
    const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id, rep: 'Renova' }));
    const mv = visit('v1', { clinicId: 'k1', rep: 'Renova', date: TODAY, ts: CLOCK - 7200000, notes: 'morning visit' });
    const seedR3 = () => seedCloud({ clinics: JSON.stringify(broken), visits: JSON.stringify([mv]),
      [SNAP]: JSON.stringify({ clinics: good, products: [], visits: [mv], tasks: [], ts: TODAY + 'T05:00:00.000Z' }) });
    const snapClinics = () => ((parse(cloud[SNAP]) || {}).clinics || []);
    const allGood = list => list.length === 20 && list.every(c => /^Good/.test(c.name));
    // a — no full backup on this device yet: nothing changes, today's backup stays
    seedR3();
    const S = await mkPhone('R3a'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} });
    await S.ev(async () => { await restoreSnapshot('2026-11-13'); });
    const asked = await S.ev(() => /full backup/i.test((document.getElementById('modalInner') || {}).textContent || ''));
    check('R3a. restoring today\'s own backup with no full backup on this device: it asks for the full backup first, and nothing changes (today\'s backup still holds the 20 good clinics)',
      asked && allGood(snapClinics()) && cloudList('clinics').length === 6, { asked, todaysBackup: snapClinics().length + ' clinics, e.g. ' + (snapClinics()[0] || {}).name, live: cloudList('clinics').length });
    // b — after a full backup: restored, and today's backup is never replaced
    await S.ev(() => { _fullBackupSavedAt = Date.now(); closeModal(); });
    await S.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const tb = await S.ev(() => window.__toasts.slice());
    check('R3b. with a full backup on this device, today\'s backup is restored (20 good clinics) and stays as it was — never replaced by the damaged data',
      allGood(cloudList('clinics')) && allGood(snapClinics()), { toasts: tb, live: cloudList('clinics').length + ' e.g. ' + (cloudList('clinics')[0] || {}).name, todaysBackup: snapClinics().length + ' e.g. ' + (snapClinics()[0] || {}).name });
    await S.ctx.close();
    // c — the connection drops half-way; the second try restores the same good copy
    seedR3();
    const T = await mkPhone('R3c'); await T.boot('Dr. Ghaith', 'supervisor');
    await T.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} _fullBackupSavedAt = Date.now(); });
    let dropped = false;
    mode.onWrite = (who, k) => { if(who === 'R3c' && (k === 'tombs' || k === SNAP) && !dropped){ dropped = true; mode.offline.add('R3c'); mode.onWrite = null; } };
    await T.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const t1 = await T.ev(() => window.__toasts.slice());
    mode.offline.delete('R3c'); mode.onWrite = null;
    await T.tick(); await T.tick();
    await T.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const t2 = await T.ev(() => window.__toasts.slice());
    check('R3c. a restore of today\'s backup that fails half-way can be done again: the second try brings back the same 20 good clinics, and today\'s backup still holds them',
      allGood(cloudList('clinics')) && allGood(snapClinics()), { dropped, firstTry: t1, secondTry: t2, live: cloudList('clinics').length + ' e.g. ' + (cloudList('clinics')[0] || {}).name, todaysBackup: snapClinics().length });
    await T.ctx.close();
  }

  // ===================== R4. a restore on a phone whose visits did not load =====================
  if(want('R4')){
    const v = (id, rep, date, notes) => visit(id, { rep, date, ts: new Date(date + 'T09:00:00').getTime(), notes, doctorIds: [] });
    const vY = v('vY', 'Mariam', '2026-11-12', 'yesterday');
    for(const variant of ['the visits still do not load', 'the visits load on the second read']){
      seedCloud({ visits: JSON.stringify([vY, v('vT1', 'Mariam', '2026-11-13', 'this morning, Mariam'), v('vT2', 'Renova', '2026-11-13', 'this morning, Renova')]) });
      cloud['snap_2026-11-12'] = JSON.stringify({ clinics: cloudList('clinics'), products: [], visits: [vY], tasks: [], ts: '2026-11-12T17:00:00.000Z' });
      const S = await mkPhone('R4-' + (variant.includes('still') ? 'still' : 'second'));
      mode.hang.visits = variant.startsWith('the visits still') ? 2 : 1; // the live month's read never answers (the app gives up after 8 s)
      await S.boot('Dr. Ghaith', 'supervisor');
      const st = await S.ev(() => ({ failed: !!_loadFailed.visits, onScreen: visits.length }));
      await S.ev(async () => { window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; window.__toasts = []; await restoreSnapshot('2026-11-12'); });
      const out = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice() }));
      mode.hang.visits = 0;
      const live = cloudList('visits').map(x => x.id);
      const kept = ((parse(cloud[SNAP]) || {}).visits || []).map(x => x.id);
      const lost = ['vT1', 'vT2'].filter(id => !live.includes(id) && !kept.includes(id));
      const refusedOk = variant.startsWith('the visits still') ? (!out.asked.length && live.length === 3 && out.toasts.some(t => /Restore stopped/.test(t))) : (live.join() === 'vY' && /2 visits/.test(out.asked[0] || ''));
      check(`R4 [${variant}] a whole-day Restore on a phone whose visits did not load at start: this morning's visits are never lost — the restore reads again first, and refuses (nothing changed) while they do not load`,
        lost.length === 0 && refusedOk, { readFailedAtStart: st.failed, onScreenAtStart: st.onScreen, asked: (out.asked[0] || '').slice(0, 200), toasts: out.toasts, liveAfter: live, keptAsTodaysBackup: kept, lostEverywhere: lost });
      await S.ctx.close();
    }
  }

  // ===================== R6. an older app version rewrote the delete log =====================
  if(want('R6')){
    // a — a task deleted 9 days ago on Renova's phone; an older app deletes another one with its
    // 7-day cutoff; Mariam's phone, offline since before the first delete, uploads its old copy
    seedCloud({ tasks: JSON.stringify([task('tOld', 'deleted 9 days ago'), task('tKeep', 'open task'), task('tNew', 'deleted today on an older app')]) });
    const C = await mkPhone('R6a-C'); await C.boot('Mariam', 'rep');
    mode.offline.add('R6a-C');
    await C.ev(async () => { tasks.push({ id: 'tC', text: 'added offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    cloud.tasks = JSON.stringify(cloudList('tasks').filter(t => t.id !== 'tOld'));
    cloud.tombs = JSON.stringify(Object.assign(emptyLog(), { tasks: { tOld: CLOCK - 9 * DAY } }));
    const R = await mkPhone('R6a-R', { tombs: { tasks: { tOld: CLOCK - 9 * DAY } } }); await R.boot('Renova', 'rep');
    // the older app (v122) deletes tNew: it rewrites the log with its 7-day cutoff and nothing else
    cloud.tasks = JSON.stringify(cloudList('tasks').filter(t => t.id !== 'tNew'));
    cloud.tombs = JSON.stringify(Object.assign(emptyLog(), { tasks: { tNew: CLOCK } }));
    await R.tick();
    const rHolds = await R.ev(() => tombSet('tasks').has('tOld'));
    await R.ev(async () => { tasks.push({ id: 'tR', text: 'Renova adds and deletes a task', done: false, created: todayStr(), rep: 'Renova' }); await persist('tasks'); await deleteTask('tR'); });
    for(const t0 = Date.now(); !((parse(cloud.tombs) || {}).tasks || {}).tR && Date.now() - t0 < 8000;) await wait(50); // her delete reached the log
    const log = parse(cloud.tombs) || {};
    mode.offline.delete('R6a-C');
    await C.tick(); await C.tick();
    const t = cloudList('tasks').map(x => x.id);
    check('R6a. an older app rewrote the delete log without a task deleted 9 days ago: the phone that deleted it keeps it and publishes it again, so a phone with an old copy does not bring it back',
      rHolds && !t.includes('tOld') && t.includes('tC') && !t.includes('tNew') && !!(log.tasks || {}).tOld && Number(log.rev) >= 123,
      { renovaKeepsItsDelete: rHolds, cloudTasks: t, logTasks: Object.keys(log.tasks || {}), logRev: log.rev });
    await C.ctx.close(); await R.ctx.close();
    // b — a revival on a v123 phone is written in the log: another phone holding the delete lets it go
    seedCloud({ tasks: JSON.stringify([task('tKeep', 'open task')]), tombs: JSON.stringify(Object.assign(emptyLog(), { tasks: { tBack: CLOCK - 9 * DAY } })) });
    const P = await mkPhone('R6b-P', { tombs: { tasks: { tBack: CLOCK - 9 * DAY } } }), Q = await mkPhone('R6b-Q', { tombs: { tasks: { tBack: CLOCK - 9 * DAY } } });
    await P.boot('Mariam', 'rep'); await Q.boot('Renova', 'rep');
    await P.ev(async () => { untomb('tasks', 'tBack'); tasks.push({ id: 'tBack', text: 'brought back', done: false, created: '2026-11-01', rep: 'Mariam' }); await persist('tasks'); });
    for(const t0 = Date.now(); ((parse(cloud.tombs) || {}).tasks || {}).tBack && Date.now() - t0 < 8000;) await wait(50); // the revival reached the log
    const logB = parse(cloud.tombs) || {};
    await Q.tick();
    const qb = await Q.ev(() => ({ holds: tombSet('tasks').has('tBack'), shows: tasks.some(t => t && t.id === 'tBack') }));
    await Q.ev(async () => { const x = tasks.find(y => y && y.id === 'tKeep'); if(x){ x.done = true; await persist('tasks'); } });
    check('R6b. a task brought back on a v123 phone is written in the log as brought back: another phone that held its delete lets it go, shows it, and its next save keeps it',
      !!((logB.revived || {}).tasks || {}).tBack && !qb.holds && qb.shows && cloudList('tasks').some(x => x.id === 'tBack'), { logRevived: logB.revived, q: qb, cloudTasks: cloudList('tasks').map(x => x.id) });
    await P.ctx.close(); await Q.ctx.close();
    // c — an older app brought back a task deleted 9 days ago (the log no longer has it, the task is in the list): never deleted again
    seedCloud({ tasks: JSON.stringify([task('tKeep', 'open task'), task('tOld2', 'brought back on an older app')]), tombs: JSON.stringify(emptyLog()) });
    const Q2 = await mkPhone('R6c-Q', { tombs: { tasks: { tOld2: CLOCK - 9 * DAY } } }); await Q2.boot('Renova', 'rep');
    await Q2.ev(async () => { const x = tasks.find(y => y && y.id === 'tKeep'); if(x){ x.done = true; await persist('tasks'); } await deleteTask('tKeep'); });
    await Q2.page.waitForTimeout(400); await Q2.tick();
    check('R6c. a task an older app brought back (no longer in the log, back in the list) is never deleted again by a phone that still held its delete',
      cloudList('tasks').some(x => x.id === 'tOld2'), { cloudTasks: cloudList('tasks').map(x => x.id), log: Object.keys((parse(cloud.tombs) || {}).tasks || {}) });
    await Q2.ctx.close();
  }

  // ===================== R7. two phones, the same visit / the same day's plan =====================
  if(want('R7')){
    for(const reopened of [false, true]){
      seedCloud({ visits: JSON.stringify([visit('V1'), visit('V2', { notes: 'other visit', clinicId: 'c3' })]),
        dayPlans: JSON.stringify({ '2026-11-15': { Mariam: [{ id: 'c1', note: '', at: CLOCK - DAY }, { id: 'c3', note: '', at: CLOCK - DAY }] } }) });
      const tag = reopened ? 'r' : '';
      const A = await mkPhone('R7-A' + tag), S = await mkPhone('R7-S' + tag);
      await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
      mode.offline.add(A.label);
      // Mariam, no signal: adds the product she forgot to V1, takes c3 off Sunday's plan
      await A.ev(async () => {
        const v = visits.find(x => x.id === 'V1'); v.products = ['p1']; await persist('visits');
        dayPlans['2026-11-15'].Mariam = dayPlans['2026-11-15'].Mariam.filter(e => e.id !== 'c3'); await persist('dayPlans');
      });
      if(reopened) await A.boot('Mariam', 'rep'); // the app closed and opened again, still no signal
      // the supervisor corrects V1's notes and adds c2 to her Sunday
      await S.ev(async () => {
        const v = visits.find(x => x.id === 'V1'); v.notes = 'corrected by the supervisor'; await persist('visits');
        dayPlans['2026-11-15'].Mariam.push({ id: 'c2', note: 'please visit', at: Date.now() }); await persist('dayPlans');
      });
      mode.offline.delete(A.label);
      await A.tick(); await A.tick();
      const v1 = cloudList('visits').find(v => v.id === 'V1') || {};
      const plan = ((parse(cloud.dayPlans) || {})['2026-11-15'] || {}).Mariam || [];
      check(`R7a [${reopened ? 'app reopened with no signal' : 'same session'}] the same visit edited on two phones: her product AND his corrected notes both stay`,
        JSON.stringify(v1.products) === '["p1"]' && v1.notes === 'corrected by the supervisor', { products: v1.products, notes: v1.notes });
      check(`R7b [${reopened ? 'app reopened with no signal' : 'same session'}] the same day's plan edited on two phones: her removal of one clinic AND his added clinic both stay`,
        plan.map(e => e.id).join(',') === 'c1,c2', plan.map(e => e.id));
      await A.ctx.close(); await S.ctx.close();
    }
  }

  // ===================== R8. the daily backup from a phone whose read failed =====================
  if(want('R8')){
    const v = (id, rep, date) => visit(id, { rep, date, ts: new Date(date + 'T09:00:00').getTime(), notes: 'visit ' + id, doctorIds: [] });
    seedCloud({ visits: JSON.stringify(Array.from({ length: 12 }, (_, i) => v('v' + i, i % 2 ? 'Renova' : 'Mariam', '2026-11-' + String(1 + i).padStart(2, '0')))),
      tasks: JSON.stringify([task('t1', 'open task', { created: '2026-11-10' })]) });
    const A = await mkPhone('R8-A');
    mode.hang.visits = 1; // her first read of this month's visits never answers
    await A.boot('Mariam', 'rep');
    const st = await A.ev(() => ({ failed: !!_loadFailed.visits, onScreen: visits.length }));
    await A.ev(async () => { tasks.push({ id: 'tA', text: 'first save of the day', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    await A.page.waitForTimeout(800);
    const snap = parse(cloud[SNAP]);
    check('R8. the day\'s backup is never written from a phone whose read of this month\'s visits failed (it would hold none of them, and nobody on the team could replace it)',
      st.failed && (!snap || (snap.visits || []).length === 12), { visitsReadFailed: st.failed, onScreen: st.onScreen, todaysBackupVisits: snap ? (snap.visits || []).length : null });
    await A.ctx.close();
  }

  // ===================== R10. a rename / a product code whose first save is refused =====================
  if(want('R10')){
    seedCloud({ clinics: JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [] }, { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [] }]),
      visits: JSON.stringify([visit('v1', { clinicId: 'c2', rep: 'Renova', notes: 'Renova visit', doctorIds: [] })]) });
    const S = await mkPhone('R10-S'); await S.boot('Dr. Ghaith', 'supervisor');
    // his laptop added someone to the team a moment ago (this phone has not refreshed since)
    const st = parse(cloud.staff); st.push({ name: 'Noor', role: 'rep', email: 'noor@example.com' }); cloud.staff = JSON.stringify(st);
    const out = await S.ev(async () => {
      openAdminPanel(); setAdminTab('staff'); await new Promise(r => setTimeout(r, 50));
      const idx = staff.findIndex(s => s.name === 'Renova'); openStaffForm(idx); await new Promise(r => setTimeout(r, 30));
      document.getElementById('sfName').value = 'Ranova';
      window.__toasts = []; await saveStaff(idx); await new Promise(r => setTimeout(r, 100));
      return { toasts: window.__toasts.slice(), memStaff: staff.map(s => s.name), memOwner: (clinics.find(c => c.id === 'c2') || {}).rep };
    });
    const names = cloudList('staff').map(s => s.name);
    const c2 = cloudList('clinics').find(c => c.id === 'c2') || {}, v1 = cloudList('visits')[0] || {}, tg = Object.keys(parse(cloud.targets) || {});
    check('R10a. a rename whose team-list save is refused ("Changed on another device") leaves nothing half-renamed: clinics, visits and targets keep the name the team list has, and this screen keeps it too',
      names.includes(c2.rep) && names.includes(v1.rep) && tg.every(n => names.includes(n) || n === '_history') && out.memStaff.includes('Renova') && out.memOwner === 'Renova',
      { toasts: out.toasts, teamListInCloud: names, clinicOwner: c2.rep, visitRep: v1.rep, targetsFor: tg, onScreen: { staff: out.memStaff, owner: out.memOwner } });
    const R = await mkPhone('R10-R'); await R.boot('Renova', 'rep');
    const mine = await R.ev(() => ({ myClinics: clinics.filter(c => canViewClinic(c)).map(c => c.name), myTarget: !!(targets.Renova && targets.Renova.revenue) }));
    check('R10a. …and Renova (still "Renova" on the team list) still sees her clinic and her target', mine.myClinics.includes('Summit Dental Center') && mine.myTarget, mine);
    await R.ctx.close(); await S.ctx.close();
    // b — a product's code changed while another device changed the catalog: the catalog save is refused, no visit is re-pointed
    seedCloud({ visits: JSON.stringify([visit('vp', { products: ['p1'], orderTaken: true, orders: [{ id: 'o1', items: [{ productId: 'p1', qty: 2 }], total: 8 }], orderItems: [{ productId: 'p1', qty: 2 }], orderTotal: 8 })]) });
    const S2 = await mkPhone('R10b-S'); await S2.boot('Dr. Ghaith', 'supervisor');
    cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 5 }]); // the laptop changed the price meanwhile
    const pb = await S2.ev(async () => {
      openEditProduct('p1'); await new Promise(r => setTimeout(r, 30));
      document.getElementById('epCode').value = 'p1-new';
      window.__toasts = []; await saveEditProduct('p1'); await new Promise(r => setTimeout(r, 100));
      const v = visits.find(x => x.id === 'vp') || {};
      return { toasts: window.__toasts.slice(), memVisit: [v.products, (v.orderItems || []).map(i => i.productId)], memCodes: products.map(p => p.id) };
    });
    const vp = cloudList('visits').find(x => x.id === 'vp') || {};
    check('R10b. a product code change whose catalog save is refused re-points no visit (in the cloud or on this screen) and keeps the code on screen as the catalog has it',
      JSON.stringify(vp.products) === '["p1"]' && JSON.stringify(pb.memVisit) === '[["p1"],["p1"]]' && pb.memCodes.includes('p1') && !pb.memCodes.includes('p1-new') && cloudList('products').some(p => p.id === 'p1'),
      { toasts: pb.toasts, cloudVisit: vp.products, onScreen: pb, cloudCodes: cloudList('products').map(p => p.id) });
    await S2.ctx.close();
  }

  console.log(results.join('\n'));
  const pageErrs = Object.keys(errors).filter(k => errors[k].length).map(k => k + ': ' + errors[k].join(' | ').slice(0, 400));
  check('no page errors', !pageErrs.length, pageErrs);
  if(pageErrs.length) console.log('❌ no page errors  → ' + JSON.stringify(pageErrs).slice(0, 900));
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
