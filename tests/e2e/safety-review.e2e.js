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
// The re-review of 13 Nov (round 3; its probes q10–q19):
//  R6a rewritten (the phone that holds an old delete publishes it again by
//      itself once a read of the list from the cloud confirms the record is
//      gone — no other delete in between), R6d (an older app brings the record
//      back with two writes; the delete marked "again"), R6e (re-created with
//      the same id)
//  R8b the backups screen says why this phone is not taking today's backup
//  R11 old deletes of records the team brought back never delete them again
//      (a task, a past month's visit; the first start of v123 and a v123
//      phone's own old delete); R11c a delete made with no signal survives a
//      reopen of the app
//  R12 restoring today's backup after a visit was logged since the full backup;
//  R13 two restores of earlier days; R14 a change on another phone while the
//      restore asks or writes
//  R15 one list that cannot be sent (refused, too large) never stops the
//      refresh of the others; a refused list is sent again about hourly
//  R17 a rename whose team-list save landed after the app was closed
//  R19 the access check gets no answer: true words
// (re-review 3, new clinics from the call log, the imports and re-create, is
// save-truth E9–E12; 6, the revision fallback, tests/storage-adapter.test.js;
// 10, the full backup's delete count, tests/core.test.js.)
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
// slowCommit[k] = ms: the next transaction of k is a real one's optimistic commit — read, computed,
// committed ms later only if k is still exactly as read (else it runs again), holding no lock;
// versioned: "as read" means not written since (any write counts, as a real commit's precondition)
const cloud = {};
const LIMIT = 1048576 - 100;
const mode = { deny: null, offline: new Set(), hang: {}, slowGet: {}, slowWrite: {}, slowCommit: {}, versioned: false, onWrite: null, reads: [], writes: [], tries: [] };
const ver = {}; // how many times each document was written
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
    mode.writes.push(who + '|' + k); cloud[k] = v; ver[k] = (ver[k] || 0) + 1; if(mode.onWrite) try{ mode.onWrite(who, k, v); }catch(e){} return true; },
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
  held = false; waiters.length = 0; mode.hang = {}; mode.slowGet = {}; mode.slowWrite = {}; mode.slowCommit = {}; mode.versioned = false; mode.deny = null; mode.onWrite = null;
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
  // opts.ls: other things on the phone before the app starts ({ key: text }, set once)
  // opts.fakeAuth: a stand-in for the Firebase sign-in (onAuthStateChanged), to end a sign-in
  // opts.ctx: browser context options (acceptDownloads)
  // ph.shift(ms): this phone's clock moves on by ms (kept across reloads)
  const mkPhone = async (label, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext(opts.ctx || {}); await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cGetTx', k => api.get(label, k, true)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.exposeFunction('__cSlowCommit', k => { const ms = mode.slowCommit[k] || 0; if(ms) delete mode.slowCommit[k]; return ms; });
    await page.exposeFunction('__cCommit', async (k, cur, next, ms) => { const v0 = ver[k] || 0; await wait(ms); const now = k in cloud ? cloud[k] : null;
      if(mode.versioned ? (ver[k] || 0) !== v0 : now !== cur) return 'retry'; mode.writes.push(label + '|late:' + k); cloud[k] = next; ver[k] = (ver[k] || 0) + 1; return true; });
    await page.addInitScript(({ clock, tombs, fakeAuth, ls }) => {
      // what the Firebase SDK throws: a FirebaseError with its code
      const fail = r => { if(r && r.__err){ const e = new Error(r.__err === 'permission-denied' ? 'Missing or insufficient permissions.' : (r.msg || r.__err)); e.code = r.__err; e.name = 'FirebaseError'; throw e; } return r; };
      window.storage = {
        get: async k => { const v = fail(await window.__cGet(k)); return v == null ? null : { value: v }; },
        set: async (k, v) => fail(await window.__cSet(k, v)), setMany: async e => fail(await window.__cSetMany(e)), delete: async k => fail(await window.__cDel(k)), list: async p => ({ keys: fail(await window.__cList(p)) }),
        update: async (k, fn) => {
          const slow = await window.__cSlowCommit(k);
          if(slow){ for(let i = 0; i < 5; i++){ const cur = fail(await window.__cGet(k)); const next = fn(cur == null ? null : cur); if(next == null) return null; if(fail(await window.__cCommit(k, cur == null ? null : cur, next, slow)) === true) return next; } throw new Error('contention'); }
          await window.__cAcquire(); try{ const cur = fail(await window.__cGetTx(k)); const next = fn(cur == null ? null : cur); if(next == null) return null; fail(await window.__cSet(k, next)); return next; } finally { await window.__cRelease(); } },
      };
      if(tombs && !sessionStorage.getItem('__tombsSet')){ try{ localStorage.setItem('um_tombs', tombs); sessionStorage.setItem('__tombsSet', '1'); }catch(e){} }
      if(ls && !sessionStorage.getItem('__lsSet')){ try{ Object.keys(ls).forEach(k => localStorage.setItem(k, ls[k])); sessionStorage.setItem('__lsSet', '1'); }catch(e){} }
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
      const shift = () => { try{ return parseFloat(sessionStorage.getItem('__shift') || '0') || 0; }catch(e){ return 0; } };
      const offs = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + offs + shift()); else super(...a); } static now(){ return _D.now() + offs + shift(); } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      window.__shiftBy = ms => { sessionStorage.setItem('__shift', String(shift() + ms)); };
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    }, { clock: CLOCK, tombs: opts.tombs ? JSON.stringify(opts.tombs) : null, fakeAuth: !!opts.fakeAuth, ls: opts.ls || null });
    const watch = () => page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; try{ _lastOfflineToast = 0; }catch(e){} });
    const boot = async (who, role) => {
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(350);
      await watch();
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing, null, { timeout: 30000 }); await page.evaluate(async () => { await window.__bgTick(); }); await page.waitForTimeout(150); };
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shift = ms => page.evaluate(ms => { window.__shiftBy(ms); }, ms);
    return { page, boot, tick, ev, label, ctx, watch, shift };
  };
  // a full backup to this device, as the supervisor makes it: the sheet reads the cloud, he downloads the file
  const fullBackup = ph => ph.ev(async () => {
    await openFullBackup();
    for(const t0 = Date.now(); Date.now() - t0 < 60000 && !document.querySelector('[data-backup-download], [data-backup-failed]');) await new Promise(r => setTimeout(r, 50));
    if(!document.querySelector('[data-backup-download]')) return false;
    downloadFullBackup(); closeModal();
    return typeof _fullBackupSaved !== 'undefined' ? !!_fullBackupSaved : !!_fullBackupSavedAt;
  });
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
    // v129 (the security audit's C7): her changes are never sent under his login unasked — he is asked first, naming her
    // (queueOwnerCheck); here he chooses "Upload them under my login", and what had not uploaded then goes
    await P.ev(() => { window.__selR1c = selectUser('Dr. Ghaith', 'supervisor'); });
    await P.page.waitForTimeout(400);
    const askedR1c = await P.ev(() => { const b = document.getElementById('modalBack'); return b && b.classList.contains('show') ? document.getElementById('modalInner').innerText.replace(/\s+/g, ' ') : ''; });
    const unaskedR1c = { visit: cloudList('visits').some(v => v.notes === 'R1c visit logged offline'), task: cloudList('tasks').some(t => t.id === 'tR1c') };
    await P.ev(async () => { const y = document.querySelector('#modalInner [data-queue="yes"]'); if(y) y.click(); await window.__selR1c; });
    await P.page.waitForTimeout(400);
    for(let i = 0; i < 3; i++) await P.tick();
    check('R1c. she signs out on a shared phone while her queue uploads: what had not uploaded stays queued on the phone; the supervisor signing in on it is asked first (naming her), and it uploads once he chooses to',
      afterOut.outbox.length > 0 && !afterOut.aside.length && /Changes waiting on this phone/.test(askedR1c) && /Mariam/.test(askedR1c)
        && cloudList('visits').some(v => v.notes === 'R1c visit logged offline') && cloudList('tasks').some(t => t.id === 'tR1c'),
      { queued: q, afterSignOut: afterOut, asked: askedR1c.slice(0, 160), unasked: unaskedR1c, visitInCloud: cloudList('visits').some(v => v.notes === 'R1c visit logged offline'), taskInCloud: cloudList('tasks').some(t => t.id === 'tR1c') });
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
    await S.ev(() => { closeModal(); });
    const fbB = await fullBackup(S); // (round 3: the file itself is checked against the cloud, so a real one is made here)
    await S.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const tb = await S.ev(() => window.__toasts.slice());
    check('R3b. with a full backup on this device, today\'s backup is restored (20 good clinics) and stays as it was — never replaced by the damaged data',
      fbB && allGood(cloudList('clinics')) && allGood(snapClinics()), { fullBackupMade: fbB, toasts: tb, live: cloudList('clinics').length + ' e.g. ' + (cloudList('clinics')[0] || {}).name, todaysBackup: snapClinics().length + ' e.g. ' + (snapClinics()[0] || {}).name });
    await S.ctx.close();
    // c — the connection drops half-way; the second try restores the same good copy
    seedR3();
    const T = await mkPhone('R3c'); await T.boot('Dr. Ghaith', 'supervisor');
    await T.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} });
    const fbC = await fullBackup(T);
    let dropped = false;
    mode.onWrite = (who, k) => { if(who === 'R3c' && (k === 'tombs' || k === SNAP) && !dropped){ dropped = true; mode.offline.add('R3c'); mode.onWrite = null; } };
    await T.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const t1 = await T.ev(() => window.__toasts.slice());
    mode.offline.delete('R3c'); mode.onWrite = null;
    await T.tick(); await T.tick();
    await T.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const t2 = await T.ev(() => window.__toasts.slice());
    check('R3c. a restore of today\'s backup that fails half-way can be done again: the second try brings back the same 20 good clinics, and today\'s backup still holds them',
      fbC && dropped && allGood(cloudList('clinics')) && allGood(snapClinics()) && !t1.some(x => /Restored|Nothing was changed/.test(x)), { fullBackupMade: fbC, dropped, firstTry: t1, secondTry: t2, live: cloudList('clinics').length + ' e.g. ' + (cloudList('clinics')[0] || {}).name, todaysBackup: snapClinics().length });
    await T.ctx.close();
  }

  // ===================== R12–R14. a restore removes only what is kept somewhere (re-review 2, 7) =====================
  if(want('R12')){
    // today's backup is restored (it is never replaced, R3): what it removes must be in the full
    // backup on this device — as the cloud holds it NOW, not as it was when the file was made
    const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [{ id: 'dk' + i, name: 'Dr. K' + i }] }));
    const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id }));
    const mv = visit('vMorning', { clinicId: 'k1', rep: 'Renova', date: TODAY, ts: CLOCK - 7200000, notes: 'morning visit', doctorIds: ['dk1'] });
    seedCloud({ clinics: JSON.stringify(broken), visits: JSON.stringify([mv]), [SNAP]: JSON.stringify({ clinics: good, products: [], visits: [mv], tasks: [], ts: TODAY + 'T05:00:00.000Z' }) });
    const S = await mkPhone('R12-S'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; });
    await S.ev(async () => { await restoreSnapshot('2026-11-13'); });
    const asked0 = await S.ev(() => /full backup/i.test((document.getElementById('modalInner') || {}).textContent || ''));
    await S.ev(() => closeModal());
    const fb1 = await fullBackup(S);
    // a few minutes later Renova logs a visit
    const R = await mkPhone('R12-R'); await R.boot('Renova', 'rep');
    await R.ev(async () => { visits.push({ id: 'vAfternoon', clinicId: 'k3', rep: 'Renova', date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['dk3'], notes: 'logged after the full backup' }); await persist('visits'); });
    const reached = cloudList('visits').some(v => v.id === 'vAfternoon');
    // the supervisor taps Restore again
    await S.ev(async () => { window.__asked = []; window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const a = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice(), modal: (document.getElementById('modalInner') || {}).textContent || '' }));
    const liveA = cloudList('visits').map(v => v.id);
    check('R12a. a visit logged after the full backup was made: the restore of today\'s backup does not start — it says this month\'s visits changed after the full backup and asks for a new one; nothing is asked, nothing changes, the visit is still in the cloud',
      asked0 && fb1 && reached && !a.asked.length && /this month's visits changed after the full backup/.test(a.modal) && /Nothing was changed/.test(a.modal) && liveA.includes('vAfternoon') && cloudList('clinics').length === 6,
      { askedFirst: asked0, fullBackupMade: fb1, visitReachedTheCloud: reached, questions: a.asked, sheet: a.modal.slice(0, 260), liveVisits: liveA, liveClinics: cloudList('clinics').length });
    // …with a new full backup the restore runs: what it removes is in that file, and its question says so
    await S.ev(() => closeModal());
    const fb2 = await fullBackup(S);
    const inFile = await S.ev(async () => (await _fullBackup.blob.text()).includes('vAfternoon'));
    await S.ev(async () => { window.__asked = []; window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const b = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice() }));
    check('R12b. …after a new full backup the restore runs: its question says what it removes (1 visit) and that everything it replaces is in the full backup saved to this device (with its time); the visit is in that file, today\'s backup is untouched',
      fb2 && inFile && /0 clinics, 0 tasks and 1 visits of this month/.test(b.asked[0] || '') && /in the full backup saved to this device at \d\d:\d\d \(checked just now\)\. Today's backup stays as it is\./.test(b.asked[0] || '')
        && b.toasts.some(t => /Restored 2026-11-13/.test(t)) && cloudList('clinics').length === 20 && cloudList('visits').map(v => v.id).join() === 'vMorning' && ((parse(cloud[SNAP]) || {}).clinics || []).length === 20,
      { fullBackupMade: fb2, visitInTheFile: inFile, question: (b.asked[0] || '').slice(0, 420), toasts: b.toasts, liveVisits: cloudList('visits').map(v => v.id) });
    await S.ctx.close(); await R.ctx.close();
  }
  if(want('R13')){
    // two restores of earlier days: the copy the first one kept as today's backup is never written over
    const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [] }));
    const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id }));
    const morning = { id: 'kMorning', name: 'New Smile Clinic (added this morning)', rep: 'Mariam', cls: 'B', doctors: [{ id: 'dm', name: 'Dr. Noor' }], isNew: true, addedOn: TODAY };
    seedCloud({ clinics: JSON.stringify(broken.concat([morning])),
      'snap_2026-11-12': JSON.stringify({ clinics: broken.slice(0, 3), products: [], visits: [], tasks: [], ts: '2026-11-12T05:00:00.000Z' }), // damaged already
      'snap_2026-11-11': JSON.stringify({ clinics: good, products: [], visits: [], tasks: [], ts: '2026-11-11T05:00:00.000Z' }) });
    const holders = () => Object.keys(cloud).filter(k => /^snap_/.test(k) && ((parse(cloud[k]) || {}).clinics || []).some(c => c && c.id === 'kMorning')).concat(cloudList('clinics').some(c => c.id === 'kMorning') ? ['clinics'] : []);
    const S = await mkPhone('R13-S'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; });
    await S.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-12'); });
    const first = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice() }));
    const afterFirst = holders(), keptCopy = cloud[SNAP];
    // that day was damaged too: the day before
    await S.ev(async () => { window.__asked = []; window.__toasts = []; await restoreSnapshot('2026-11-11'); });
    const gate = await S.ev(() => ({ asked: window.__asked.slice(), modal: (document.getElementById('modalInner') || {}).textContent || '' }));
    const untouched = cloud[SNAP] === keptCopy && cloudList('clinics').length === 3;
    await S.ev(() => closeModal());
    const fb = await fullBackup(S);
    await S.ev(async () => { window.__asked = []; window.__toasts = []; await restoreSnapshot('2026-11-11'); });
    const second = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice() }));
    check('R13. a second restore of an earlier day never writes over the copy the first one kept as today\'s backup: it asks for a full backup first (nothing changes), then restores — and the clinic added this morning is still in today\'s backup, exactly as the first restore kept it',
      /First, the data as it is now is kept as today's backup/.test(first.asked[0] || '') && afterFirst.join() === SNAP
        && !gate.asked.length && /full backup/i.test(gate.modal) && /a restore never replaces it/.test(gate.modal) && untouched
        && fb && second.toasts.some(t => /Restored 2026-11-11/.test(t)) && cloudList('clinics').length === 20 && cloud[SNAP] === keptCopy && holders().join() === SNAP
        && /Today's backup stays as it is/.test(second.asked[0] || '') && !/kept as today's backup/.test(second.asked[0] || ''),
      { firstQuestion: (first.asked[0] || '').slice(-80), heldAfterFirst: afterFirst, secondGate: gate.modal.slice(0, 200), nothingChangedAtTheGate: untouched, fullBackupMade: fb,
        secondQuestion: (second.asked[0] || '').slice(-190), secondToasts: second.toasts, heldAfterSecond: holders(), todaysBackupUnchanged: cloud[SNAP] === keptCopy });
    await S.ctx.close();
  }
  if(want('R14')){
    // the restore writes only over exactly what it checked: a change on another phone in between stops it
    const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [] }));
    const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id }));
    const other = JSON.stringify([task('tOther', 'added on another phone just now', { rep: 'Renova' })]);
    for(const variant of ['while the question was open', 'while the restore was writing']){
      const open = variant.startsWith('while the question');
      seedCloud({ clinics: JSON.stringify(broken), tasks: JSON.stringify([task('tMine', 'an open task')]),
        'snap_2026-11-12': JSON.stringify({ clinics: good, products: [], visits: [], tasks: [], ts: '2026-11-12T05:00:00.000Z' }) });
      const S = await mkPhone('R14-' + (open ? 'q' : 'w')); await S.boot('Dr. Ghaith', 'supervisor');
      await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} });
      if(open) await S.ev(other => { window.confirm = () => { window.__cSet('tasks', other); return true; }; }, other); // another phone's save lands while he reads the question
      else { await S.ev(() => { window.confirm = () => true; }); mode.onWrite = (who, k) => { if(who === S.label && k === 'tombs'){ mode.onWrite = null; cloud.tasks = other; } }; } // …or between its check and its writes
      await S.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-12'); });
      mode.onWrite = null;
      const t = await S.ev(() => window.__toasts.slice());
      await S.tick();
      const mem = await S.ev(() => ({ clinics: clinics.length, tasks: tasks.map(x => x.id) }));
      check(`R14 [${variant}] a task another phone saved ${variant} is never written over: the restore stops, says so, and nothing is changed (the clinics are as they were, the task is in the cloud and on this screen)`,
        t.some(x => /Restore stopped — the tasks changed on another phone/.test(x) && /Nothing was changed/.test(x)) && !t.some(x => /Restored/.test(x))
          && cloudList('tasks').map(x => x.id).join() === 'tOther' && cloudList('clinics').length === 6 && /^Broken/.test(cloudList('clinics')[0].name) && mem.clinics === 6 && mem.tasks.join() === 'tOther',
        { toasts: t, cloudTasks: cloudList('tasks').map(x => x.id), cloudClinics: cloudList('clinics').length + ' e.g. ' + cloudList('clinics')[0].name, onScreen: mem, todaysBackupKept: !!cloud[SNAP] });
      await S.ctx.close();
    }
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
    const R = await mkPhone('R6a-R', { tombs: { tasks: { tOld: CLOCK - 9 * DAY } }, ls: { um_tombsMig123: '1' } }); await R.boot('Renova', 'rep');
    // the older app (v122) deletes tNew: it rewrites the log with its 7-day cutoff and nothing else
    cloud.tasks = JSON.stringify(cloudList('tasks').filter(t => t.id !== 'tNew'));
    cloud.tombs = JSON.stringify(Object.assign(emptyLog(), { tasks: { tNew: CLOCK } }));
    await R.tick();
    const rHolds = await R.ev(() => tombSet('tasks').has('tOld'));
    const logHeld = parse(cloud.tombs) || {};
    // Renova deletes nothing more: her app just stays open (round 3 — until then the delete went
    // back to the log only with her next delete). Once the hold has stood its five minutes, the
    // first refresh that reads the tasks from the cloud and does not find tOld publishes it again.
    await R.shift(6 * 60000); await R.tick();
    const log = parse(cloud.tombs) || {};
    mode.offline.delete('R6a-C');
    await C.tick(); await C.tick();
    const t = cloudList('tasks').map(x => x.id);
    await R.tick();
    const rShows = await R.ev(() => tasks.some(x => x && x.id === 'tOld'));
    check('R6a. an older app rewrote the delete log without a task deleted 9 days ago: the phone that deleted it keeps the delete (not published while it is only held) and, once a read of the tasks from the cloud has confirmed the task is not there, publishes it again by itself — no other delete needed — so a phone with an old copy does not bring it back',
      rHolds && !(logHeld.tasks || {}).tOld && !t.includes('tOld') && t.includes('tC') && !t.includes('tNew') && !!(log.tasks || {}).tOld && Number(log.rev) >= 123 && !rShows,
      { renovaKeepsItsDelete: rHolds, logWhileOnlyHeld: Object.keys(logHeld.tasks || {}), cloudTasks: t, logTasks: Object.keys(log.tasks || {}), logRev: log.rev, renovaShowsItAgain: rShows });
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
    // d — an older app BRINGS BACK a task deleted 9 days ago: it writes the log first (the delete
    // goes) and the list a moment later (the task returns). A v123 phone that refreshes between
    // the two holds the delete and waits: published again at once, it deleted the task the
    // moment the list landed (round 3: why a held delete waits before it goes back to the log)
    seedCloud({ tasks: JSON.stringify([task('tKeep', 'open task')]), tombs: JSON.stringify(Object.assign(emptyLog(), { tasks: { tX: CLOCK - 9 * DAY } }, { revived: {}, rev: 123 })) });
    const Q3 = await mkPhone('R6d-Q', { tombs: { tasks: { tX: CLOCK - 9 * DAY } }, ls: { um_tombsMig123: '1' } }); await Q3.boot('Renova', 'rep');
    cloud.tombs = JSON.stringify(emptyLog()); // the older app's log write: tX is no longer deleted (no rev, no revived)
    await Q3.tick(); await Q3.tick();
    const dLog1 = parse(cloud.tombs) || {};
    cloud.tasks = JSON.stringify(cloudList('tasks').concat([task('tX', 'brought back on an older app')])); // …and its list write
    await Q3.tick();
    const d1 = await Q3.ev(() => ({ shows: tasks.some(t => t && t.id === 'tX'), tombed: tombSet('tasks').has('tX') }));
    await Q3.ev(async () => { const x = tasks.find(y => y && y.id === 'tKeep'); if(x){ x.done = true; await persist('tasks'); } });
    check('R6d. an older app brings a task back (the log first, the list a moment later) while a v123 phone holds its 9-day-old delete: the delete is not published in between, the task shows on that phone and stays in the cloud after its next save',
      !(dLog1.tasks || {}).tX && d1.shows && !d1.tombed && cloudList('tasks').some(x => x.id === 'tX') && !((parse(cloud.tombs) || {}).tasks || {}).tX,
      { logBetweenTheTwoWrites: Object.keys(dLog1.tasks || {}), holder: d1, cloudTasks: cloudList('tasks').map(x => x.id), log: Object.keys((parse(cloud.tombs) || {}).tasks || {}) });
    await Q3.ctx.close();
    // …and when that list write comes later than the wait (the older phone lost its signal for an
    // hour): the delete was published again meanwhile — marked as such in the log — and a task the
    // cloud's list holds under a marked delete is kept and written down as brought back
    seedCloud({ tasks: JSON.stringify([task('tKeep', 'open task')]), tombs: JSON.stringify(Object.assign(emptyLog(), { tasks: { tX: CLOCK - 9 * DAY } }, { revived: {}, rev: 123 })) });
    const Q4 = await mkPhone('R6d-Q2', { tombs: { tasks: { tX: CLOCK - 9 * DAY } }, ls: { um_tombsMig123: '1' } }); await Q4.boot('Renova', 'rep');
    cloud.tombs = JSON.stringify(emptyLog());
    await Q4.tick(); await Q4.shift(6 * 60000); await Q4.tick();
    const dLog2 = parse(cloud.tombs) || {};
    cloud.tasks = JSON.stringify(cloudList('tasks').concat([task('tX', 'brought back on an older app')])); // the older phone's list write lands an hour later
    const P4 = await mkPhone('R6d-P'); await P4.boot('Mariam', 'rep');
    const p4 = await P4.ev(() => ({ shows: tasks.some(t => t && t.id === 'tX') }));
    await P4.ev(async () => { tasks.push({ id: 'tP', text: 'Mariam adds a task', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    for(const t0 = Date.now(); ((parse(cloud.tombs) || {}).tasks || {}).tX && Date.now() - t0 < 8000;) await wait(50);
    await Q4.tick();
    const q4 = await Q4.ev(() => ({ shows: tasks.some(t => t && t.id === 'tX'), tombed: tombSet('tasks').has('tX') }));
    const dLog3 = parse(cloud.tombs) || {};
    check('R6d. …and when the older app\'s list lands after the delete was published again: the log marks such a delete (again), so the task the cloud\'s list holds is kept on every phone, stays in the cloud after the next save, and the log writes it down as brought back',
      !!(dLog2.tasks || {}).tX && !!((dLog2.again || {}).tasks || {}).tX && p4.shows && q4.shows && !q4.tombed && cloudList('tasks').some(x => x.id === 'tX') && !(dLog3.tasks || {}).tX && !!((dLog3.revived || {}).tasks || {}).tX,
      { logAfterPublishedAgain: { tasks: dLog2.tasks, again: dLog2.again }, anotherPhoneShows: p4.shows, holder: q4, cloudTasks: cloudList('tasks').map(x => x.id), logAtTheEnd: { tasks: dLog3.tasks, revived: dLog3.revived } });
    await Q4.ctx.close(); await P4.ctx.close();
    // e — a task re-created with the same id on a phone that knew no delete of it (the log had
    // lost it to an older app): the revival is written down all the same, and the phone that
    // held the old delete lets it go at once — before the list with the task has even landed
    seedCloud({ tasks: JSON.stringify([task('tKeep', 'open task')]), tombs: JSON.stringify(emptyLog()) });
    const Q5 = await mkPhone('R6e-Q', { tombs: { tasks: { tAgain: CLOCK - 9 * DAY } }, ls: { um_tombsMig123: '1' } }); await Q5.boot('Renova', 'rep');
    const P5 = await mkPhone('R6e-P'); await P5.boot('Mariam', 'rep');
    const q5a = await Q5.ev(() => tombSet('tasks').has('tAgain'));
    mode.slowWrite.tasks = 2500; // the list lands after the log
    const p5save = P5.ev(async () => { untomb('tasks', 'tAgain'); tasks.push({ id: 'tAgain', text: 're-created with the same id', done: false, created: '2026-11-01', rep: 'Mariam' }); await persist('tasks'); });
    for(const t0 = Date.now(); !(((parse(cloud.tombs) || {}).revived || {}).tasks || {}).tAgain && Date.now() - t0 < 8000;) await wait(50);
    await Q5.shift(6 * 60000); await Q5.tick();
    const q5b = await Q5.ev(() => tombSet('tasks').has('tAgain'));
    const eLog = parse(cloud.tombs) || {};
    await p5save; await Q5.tick();
    const q5c = await Q5.ev(() => tasks.some(t => t && t.id === 'tAgain'));
    await Q5.ev(async () => { const x = tasks.find(y => y && y.id === 'tKeep'); if(x){ x.done = true; await persist('tasks'); } });
    check('R6e. a task re-created with the same id on a phone that knew no delete of it: the log writes the revival down, the phone that held the 9-day-old delete lets it go at once (nothing published again), shows the task and keeps it in the cloud',
      q5a && !q5b && !(eLog.tasks || {}).tAgain && q5c && cloudList('tasks').some(x => x.id === 'tAgain'),
      { heldBefore: q5a, heldAfterTheRevivalWasWritten: q5b, logTasks: Object.keys(eLog.tasks || {}), logRevived: eLog.revived, holderShows: q5c, cloudTasks: cloudList('tasks').map(x => x.id) });
    await Q5.ctx.close(); await P5.ctx.close();
  }

  // ===================== R11. old deletes of records the team brought back (re-review 1) =====================
  // v122 ignored this phone's own deletes older than 7 days but never pruned them from the phone;
  // v123 reads the phone's deletes back for 120 days. A record deleted here long ago and brought
  // back by the team since (a bin restore, a whole-day restore — on the older app: nothing in the
  // log says so) must stay: on this phone's screen, in the cloud, on every other phone.
  if(want('R11')){
    for(const variant of ['the first start of v123 on this phone', 'a delete this phone made on v123']){
      const first = variant.startsWith('the first');
      seedCloud({ tasks: JSON.stringify([task('tKeep', 'open task'), task('tBack', 'brought back by the supervisor 10 days ago')]), tombs: JSON.stringify(emptyLog()) });
      const M = await mkPhone('R11-' + (first ? 'first' : 'own')); await M.boot('Mariam', 'rep');
      // the phone as the older app left it: its own 20-day-old delete of tBack still on it
      await M.ev(first => { localStorage.setItem('um_tombs', JSON.stringify({ tasks: { tBack: Date.now() - 20 * 86400000 } })); if(first) localStorage.removeItem('um_tombsMig123'); }, first);
      mode.offline.add(M.label);
      await M.boot('Mariam', 'rep'); // opened in the field with no signal
      const start = await M.ev(() => ({ shows: tasks.some(t => t && t.id === 'tBack') }));
      await M.ev(async () => { await deleteTask('tKeep'); });
      await M.ev(async () => { tasks.push({ id: 'tNew', text: 'added in the field', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
      const queue = await M.ev(() => outboxList());
      mode.offline.delete(M.label);
      await M.tick(); await M.tick();
      const log = parse(cloud.tombs) || {};
      const afterUpload = cloudList('tasks').map(x => x.id);
      const m = await M.ev(() => ({ shows: tasks.some(t => t && t.id === 'tBack'), outbox: outboxList() }));
      const S = await mkPhone('R11-S-' + (first ? 'first' : 'own')); await S.boot('Dr. Ghaith', 'supervisor');
      await S.ev(async () => { tasks.push({ id: 'tS', text: 'supervisor task', done: false, created: todayStr(), rep: 'Dr. Ghaith' }); await persist('tasks'); });
      await S.tick();
      const sSees = await S.ev(() => tasks.some(t => t && t.id === 'tBack'));
      const final = cloudList('tasks').map(x => x.id);
      check(`R11a [${variant}] a task this phone deleted 20 days ago and the team brought back since: the phone opens with no signal, removes one task and adds one, the signal returns — the task brought back is not deleted again (not in the log, still in the cloud, on her phone and on the supervisor's after his next save)`,
        (first ? start.shows : true) && !(log.tasks || {}).tBack && !!(log.tasks || {}).tKeep && afterUpload.includes('tBack') && afterUpload.includes('tNew') && !afterUpload.includes('tKeep') && m.shows && sSees && final.includes('tBack'),
        { showsAtTheOfflineStart: start.shows, queueOffline: queue, logTasks: Object.keys(log.tasks || {}), cloudAfterUpload: afterUpload, herPhoneAfter: m, supervisorSees: sSees, cloudAtTheEnd: final });
      await M.ctx.close(); await S.ctx.close();
    }
    // b — a past month's visit (in no daily backup; the bin let it go when it was restored)
    for(const variant of ['the first start of v123 on this phone', 'a delete this phone made on v123']){
      const first = variant.startsWith('the first'), tag = first ? 'first' : 'own';
      const ov = (id, date, notes) => visit(id, { date, ts: new Date(date + 'T10:00:00').getTime(), notes });
      seedCloud({ 'visitsArch:2026-10': JSON.stringify([ov('vBack', '2026-10-24', 'brought back from the recycle bin'), ov('vOct', '2026-10-27', 'another October visit')]),
        visitsIndex: JSON.stringify({ v: 1, months: { '2026-10': { n: 2, rev: CLOCK - 10 * DAY } }, updated: CLOCK - 10 * DAY }),
        tasks: JSON.stringify([task('tDone', 'call the clinic')]), tombs: JSON.stringify(emptyLog()) });
      const M = await mkPhone('R11b-M-' + tag); await M.boot('Mariam', 'rep');
      const before = await M.ev(() => visits.some(v => v && v.id === 'vBack'));
      await M.ev(first => { localStorage.setItem('um_tombs', JSON.stringify({ visits: { vBack: Date.now() - 20 * 86400000 } })); if(first) localStorage.removeItem('um_tombsMig123'); }, first);
      // this morning, no signal: she removes a task and logs a visit — both wait in the queue
      mode.offline.add(M.label);
      await M.ev(async () => { await deleteTask('tDone'); });
      await fill(M, { clinicId: 'c1', docId: 'd1', note: 'logged with no signal' });
      await M.ev(async () => { await saveVisit(); });
      const queue = await M.ev(() => outboxList());
      // the app is opened again with signal, with that queue
      mode.offline.delete(M.label);
      await M.boot('Mariam', 'rep');
      await M.tick(); await M.tick();
      const arch = (parse(cloud['visitsArch:2026-10']) || []).map(v => v.id);
      const log = parse(cloud.tombs) || {};
      const m = await M.ev(() => ({ shows: visits.some(v => v && v.id === 'vBack'), outbox: outboxList() }));
      const S = await mkPhone('R11b-S-' + tag); await S.boot('Dr. Ghaith', 'supervisor');
      const sSees = await S.ev(() => visits.some(v => v && v.id === 'vBack'));
      check(`R11b [${variant}] an October visit this phone deleted 20 days ago and the supervisor restored from the bin: the phone's queue (a delete, a task, a visit) uploads when the app is opened again — the October visit is still in the cloud, not in the delete log, on her phone and on the supervisor's`,
        before && arch.includes('vBack') && arch.includes('vOct') && !(log.visits || {}).vBack && cloudList('visits').some(v => v.notes === 'logged with no signal') && m.shows && sSees,
        { shownBefore: before, queue, octoberInTheCloud: arch, logVisits: Object.keys(log.visits || {}), logTasks: Object.keys(log.tasks || {}), liveVisits: cloudList('visits').map(v => v.notes), herPhone: m, supervisorSees: sSees });
      // (found by this check) the task she removed with no signal, before the app was opened again:
      // her delete was only in memory — the reopened app took "not in the log" for "brought back
      // elsewhere", forgot it, and the task came back from the cloud
      check(`R11c [${variant}] …and the task she removed with no signal before reopening the app stays removed: her delete reaches the log and the task is gone from the cloud and from her screen`,
        !!(log.tasks || {}).tDone && !cloudList('tasks').some(t => t.id === 'tDone') && !(await M.ev(() => tasks.some(t => t && t.id === 'tDone'))),
        { logTasks: Object.keys(log.tasks || {}), cloudTasks: cloudList('tasks').map(t => t.id) });
      await M.ctx.close(); await S.ctx.close();
    }
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
    // b — the supervisor's phone in that state: the backups screen says today's backup has not been taken and why this phone
    // is not taking it (round 3: it said nothing); once the lists have loaded from the cloud the backup is taken and the note goes
    seedCloud({ visits: JSON.stringify(Array.from({ length: 12 }, (_, i) => v('v' + i, i % 2 ? 'Renova' : 'Mariam', '2026-11-' + String(1 + i).padStart(2, '0')))) });
    const B = await mkPhone('R8-B');
    mode.hang.visits = 1;
    await B.boot('Dr. Ghaith', 'supervisor');
    const backups = () => B.ev(async () => {
      openExport();
      for(let i = 0; i < 100 && /Loading backups/.test((document.getElementById('backupList') || {}).textContent || ''); i++) await new Promise(r => setTimeout(r, 50));
      const out = { held: (document.querySelector('#backupList [data-snap-held]') || {}).textContent || '', list: ((document.getElementById('backupList') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 160) };
      closeModal(); return out;
    });
    const n1 = await backups(), taken1 = !!cloud[SNAP];
    await B.tick(); // the next refresh reads this month's visits
    await B.ev(async () => { await maybeSnapshot(); });
    const n2 = await backups(), snapB = parse(cloud[SNAP]);
    check('R8b. the backups screen says so: today\'s backup has not been taken and this phone is not taking it because not every list on it came from the cloud — and once they have loaded, the backup is taken (with the month\'s 12 visits) and the note is gone',
      !taken1 && /Today's backup has not been taken yet, and this phone is not taking it: not every list on it came from the cloud/.test(n1.held) && !!snapB && (snapB.visits || []).length === 12 && !n2.held && /2026-11-13/.test(n2.list),
      { before: n1, backupTakenBefore: taken1, after: n2, todaysBackupVisits: snapB ? (snapB.visits || []).length : null });
    await B.ctx.close();
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

  // ===================== R15. one list that cannot be sent never freezes the others (re-review 5) =====================
  if(want('R15')){
    for(const variant of ['the rules refuse it', 'it is too large for the cloud']){
      const refusedV = variant.startsWith('the rules');
      seedCloud();
      const A = await mkPhone('R15-' + (refusedV ? 'r' : 'l')); await A.boot('Mariam', 'rep');
      mode.offline.add(A.label);
      await A.ev(async big => { const d = todayStr(); dayPlans[d] = dayPlans[d] || {}; dayPlans[d].Mariam = [{ id: 'c3', note: big ? 'x'.repeat(1100000) : '', at: Date.now() }]; await persist('dayPlans'); }, !refusedV);
      mode.offline.delete(A.label);
      if(refusedV) mode.deny = { re: /^dayPlans$/, ops: 'w', who: new Set([A.label]) };
      await A.tick();
      const st = await A.ev(() => ({ outbox: outboxList(), parked: [..._saveParked.entries()], blocked: [..._saveBlocked], bar: ((document.getElementById('tooLargeBar') || {}).textContent || '').slice(0, 90) }));
      // the supervisor renames a clinic and gives her a task
      const S = await mkPhone('R15-S' + (refusedV ? 'r' : 'l')); await S.boot('Dr. Ghaith', 'supervisor');
      await S.ev(async () => { const c = clinics.find(x => x.id === 'c1'); c.name = 'Dental 5 Clinic (Salmiya)'; await persist('clinics'); tasks.push({ id: 'tS', text: 'call Dr. Ahmed today', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
      const reads0 = mode.reads.filter(r => r === A.label + '|clinics').length;
      await A.tick(); await A.tick();
      const seen = await A.ev(() => ({ name: (clinics.find(x => x.id === 'c1') || {}).name, task: tasks.some(t => t && t.id === 'tS'), plan: (((dayPlans[todayStr()] || {}).Mariam || [])[0] || {}).id || null, kept: /"c3"/.test(localStorage.getItem('um_mirror:dayPlans') || ''), outbox: outboxList() }));
      const reads = mode.reads.filter(r => r === A.label + '|clinics').length - reads0;
      check(`R15 [${variant}] a day's plan waits on her phone because ${variant}: the phone still refreshes every round — the clinic the supervisor renamed and the task he gave her show at once — and her plan stays on her phone and in the queue`,
        (refusedV ? st.parked.some(([k, why]) => k === 'dayPlans' && why === 'refused') : st.blocked.includes('dayPlans')) && seen.name === 'Dental 5 Clinic (Salmiya)' && seen.task && reads >= 2 && seen.plan === 'c3' && seen.kept && seen.outbox.includes('dayPlans'),
        { afterTheFirstRound: st, afterTwoMoreRounds: seen, clinicReadsInTwoRounds: reads });
      if(refusedV){
        const tries = () => mode.tries.filter(x => x === A.label + '|dayPlans').length;
        const t0 = tries();
        await A.tick(); await A.tick();
        const t1 = tries();
        await A.shift(61 * 60000); await A.tick();
        const t2 = tries();
        const still = await A.ev(() => ({ outbox: outboxList(), parked: [..._saveParked.entries()] }));
        mode.deny = null; // the supervisor fixed the rules
        await A.shift(61 * 60000); await A.tick();
        const end = await A.ev(() => ({ outbox: outboxList(), parked: [..._saveParked.entries()], bar: !!document.getElementById('tooLargeBar') }));
        const inCloud = ((((parse(cloud.dayPlans) || {})[TODAY] || {}).Mariam || [])[0] || {}).id || null;
        check('R15. …a list the rules refused is not sent every round, but again about hourly: refused again it stays kept; once the rules allow it, it lands by itself (no tap, no reopen) and the bar goes',
          t1 === t0 && t2 === t1 + 1 && still.outbox.includes('dayPlans') && still.parked.some(([k]) => k === 'dayPlans') && inCloud === 'c3' && !end.outbox.length && !end.parked.length && !end.bar,
          { triesBefore: t0, afterTwoRounds: t1, afterAnHour: t2, stillKept: still, planInTheCloudAfterTheNextHour: inCloud, end });
      }
      mode.deny = null;
      await A.ctx.close(); await S.ctx.close();
    }
  }

  // ===================== R17. a rename that landed after the app was closed (re-review 8) =====================
  if(want('R17')){
    seedCloud();
    const S = await mkPhone('R17-S'); await S.boot('Dr. Ghaith', 'supervisor');
    mode.slowWrite.staff = 16000; // the team list's write lands 16 s later (a slow link)
    const p = S.ev(async () => { const idx = staff.findIndex(s => s.name === 'Renova'); openStaffForm(idx); await new Promise(r => setTimeout(r, 200)); document.getElementById('sfName').value = 'Renova K.'; await saveStaff(idx); }).catch(() => {});
    await S.page.waitForTimeout(13500); // "no answer yet" was said; he closes the app
    const before = await S.ev(() => ({ toasts: window.__toasts.slice(), note: localStorage.getItem('um_renamePending') })).catch(() => ({}));
    await S.page.goto('about:blank');
    await S.page.waitForTimeout(4000); // the write lands meanwhile
    held = false; waiters.length = 0; // (the page that closed held this fake cloud's one write lock: gone with the page)
    const team = cloudList('staff').map(x => x.name);
    await S.boot('Dr. Ghaith', 'supervisor'); // he opens the app again
    const st = await S.ev(() => ({ team: staff.map(x => x.name), oldNameClinics: clinics.filter(c => c.rep === 'Renova').length, banner: (document.getElementById('renameBanner') || {}).textContent || '' }));
    const untouched = cloudList('clinics').some(c => c.rep === 'Renova') && Object.keys(parse(cloud.targets) || {}).includes('Renova'); // nothing renamed itself
    await S.ev(async () => { window.__toasts = []; const b = document.querySelector('#renameBanner button'); if(b && typeof finishPendingRename === 'function') await finishPendingRename(); });
    const done = await S.ev(() => ({ toasts: window.__toasts.slice(), banner: !!document.getElementById('renameBanner'), note: localStorage.getItem('um_renamePending'), hers: clinics.filter(c => c.rep === 'Renova K.').length }));
    const R = await mkPhone('R17-R'); await R.boot('Renova K.', 'rep');
    const mine = await R.ev(() => ({ myClinics: clinics.filter(c => canViewClinic(c)).map(c => c.name), myTarget: !!(targets[currentUser.name] && targets[currentUser.name].revenue) }));
    check('R17. a rename whose team-list save landed only after the app was closed: at the next start the supervisor is told the rename was not finished (the team list has the new name, her clinic and target the old one) — nothing renames itself — and one tap on "Finish the rename" renames the rest: she sees her clinic and her target under the new name',
      team.includes('Renova K.') && /Renova K\./.test(before.note || '') && /was not finished/.test(st.banner) && /Renova K\./.test(st.banner) && st.oldNameClinics === 1 && untouched
        && done.toasts.some(t => /Rename finished/.test(t)) && !done.banner && !done.note && done.hers === 1 && !cloudList('clinics').some(c => c.rep === 'Renova') && Object.keys(parse(cloud.targets) || {}).includes('Renova K.')
        && mine.myClinics.includes('Summit Dental Center') && mine.myTarget,
      { saidBeforeClosing: before.toasts, noteOnThePhone: before.note, teamListInTheCloud: team, atTheNextStart: st, nothingRenamedItself: untouched, afterTheTap: done, cloudOwners: cloudList('clinics').map(c => c.rep), cloudTargets: Object.keys(parse(cloud.targets) || {}), renovaK: mine });
    await p; await S.ctx.close(); await R.ctx.close();
  }

  // ===================== R19. the access check gets no answer (re-review 9) =====================
  if(want('R19')){
    seedCloud();
    const A = await mkPhone('R19-A'); await A.boot('Mariam', 'rep');
    mode.deny = { re: /^dayPlans$/, ops: 'w', who: new Set(['R19-A']) }; // the rules refuse this one document for her login
    mode.hang.staff = 1;                                                 // …and the access check's read does not answer (a slow link)
    const first = await A.ev(async () => { window.__toasts = []; const d = todayStr(); dayPlans[d] = { Mariam: [{ id: 'c3', note: '', at: Date.now() }] }; const r = await persistTold('dayPlans');
      return { outcome: r.outcome, text: (saveFailText(r, 'dayPlans') || [])[0] || '', toasts: window.__toasts.slice(), parked: [..._saveParked.entries()], queued: outboxHas('dayPlans'), onPhone: /"c3"/.test(localStorage.getItem('um_mirror:dayPlans') || '') }; });
    mode.hang.staff = 0;
    await A.ev(() => { window.__toasts = []; });
    await A.tick();
    const next = await A.ev(() => ({ toasts: window.__toasts.slice(), parked: [..._saveParked.entries()], queued: outboxHas('dayPlans'), onPhone: /"c3"/.test(localStorage.getItem('um_mirror:dayPlans') || ''), bar: ((document.getElementById('tooLargeBar') || {}).textContent || '').slice(0, 120) }));
    mode.deny = null;
    const said = first.toasts.concat([first.text]), UNSURE = /Kept on this phone — the cloud did not answer whether this login may save it; it is tried again/;
    check('R19. the rules refuse a save and the access check gets no answer in time: the plan is kept on the phone and queued, and the words say so — "the cloud did not answer whether this login may save it; it is tried again" — never "signed out?", never "not saved"; at the next round, when the cloud answers, it says "Not allowed for this login — kept on this phone, not sent"',
      first.queued && first.onPhone && !first.parked.length && said.every(t => !/signed out\?|not saved/i.test(t)) && first.toasts.some(t => UNSURE.test(t)) && UNSURE.test(first.text)
        && next.queued && next.onPhone && next.parked.some(([k, why]) => k === 'dayPlans' && why === 'refused') && next.toasts.some(t => /Not allowed for this login — kept on this phone, not sent/.test(t)) && !next.toasts.some(t => /not saved|signed out\?/i.test(t)),
      { firstSave: first, nextRound: next });
    await A.ctx.close();
  }

  // ===================== R20. a full backup read but never downloaded (round 4, finding 1) =====================
  if(want('R20')){
    // a full backup downloaded; Renova logs a visit; he reads a new full backup but closes the
    // sheet without Download: the restore must compare the cloud with the file ON the device
    const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [{ id: 'dk' + i, name: 'Dr. K' + i }] }));
    const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id }));
    const mv = visit('vMorning', { clinicId: 'k1', rep: 'Renova', date: TODAY, ts: CLOCK - 7200000, notes: 'morning visit', doctorIds: ['dk1'] });
    seedCloud({ clinics: JSON.stringify(broken), visits: JSON.stringify([mv]), [SNAP]: JSON.stringify({ clinics: good, products: [], visits: [mv], tasks: [], ts: TODAY + 'T05:00:00.000Z' }) });
    const S = await mkPhone('R20-S'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; });
    const fb1 = await fullBackup(S);
    const R = await mkPhone('R20-R'); await R.boot('Renova', 'rep');
    await R.ev(async () => { visits.push({ id: 'vAfternoon', clinicId: 'k3', rep: 'Renova', date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['dk3'], notes: 'logged after the full backup' }); await persist('visits'); });
    const reached = cloudList('visits').some(v => v.id === 'vAfternoon');
    const read2 = await S.ev(async () => { await openFullBackup();
      for(const t0 = Date.now(); Date.now() - t0 < 60000 && !document.querySelector('[data-backup-download], [data-backup-failed]');) await new Promise(r => setTimeout(r, 50));
      const ok = !!document.querySelector('[data-backup-download]'); closeModal(); return ok; }); // read, NOT downloaded
    await S.ev(async () => { window.__asked = []; window.__toasts = []; await restoreSnapshot('2026-11-13'); });
    const a = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice(), modal: (document.getElementById('modalInner') || {}).textContent || '' }));
    check('R20. a full backup read but never downloaded does not count: the restore compares the cloud with the file saved to this device (made before the afternoon visit) — it does not start, says the visits changed after that file and that the newer read was not downloaded; nothing is asked, nothing changes, the visit is still in the cloud',
      fb1 && reached && read2 && !a.asked.length && !a.toasts.some(t => /Restored/.test(t)) && /First, a full backup to this device/.test(a.modal)
        && /this month's visits changed after the full backup on this device was made \(at \d\d:\d\d\)/.test(a.modal) && /was not downloaded to this device/.test(a.modal) && /Nothing was changed/.test(a.modal)
        && cloudList('visits').some(v => v.id === 'vAfternoon') && cloudList('clinics').length === 6,
      { fullBackupDownloaded: fb1, visitReachedTheCloud: reached, secondReadNotDownloaded: read2, questions: a.asked.map(q => q.slice(0, 300)), toasts: a.toasts, sheet: a.modal.slice(0, 420), liveVisits: cloudList('visits').map(v => v.id), liveClinics: cloudList('clinics').length });
    await S.ctx.close(); await R.ctx.close();
  }

  // ===================== R21. a day planned again after its plan was deleted (round 4, finding 3) =====================
  if(want('R21')){
    // the delete log's date|rep entry stayed after the day was planned again: the next plan save
    // on ANY phone (one whose copy of that day had not changed) erased the day from the cloud
    const MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18';
    const planOf = (d, r) => ((((parse(cloud.dayPlans) || {})[d] || {})[r]) || []).map(e => e && typeof e === 'object' ? e.id : e);
    const ways = [
      ['moved back', MON, A => A.ev(async ({ MON, TUE }) => { const mv = async (f, t) => { const el = document.createElement('input'); el.id = 'rsDate'; el.value = t; document.body.appendChild(el); await saveReschedulePlan(f, 'Mariam', 'c1'); el.remove(); }; await mv(TUE, MON); }, { MON, TUE })],
      ['planned again for that date', MON, A => A.ev(async MON => { window._dpDate = MON; window._dpRep = 'Mariam'; window._dpMine = [{ id: 'c1', note: '', at: Date.now() }]; await saveDatePlan(); }, MON)],
      ['a visit\'s follow-up on that day', MON, A => A.ev(async MON => { await scheduleFollowUp(clinics.find(c => c.id === 'c1'), MON, 'Mariam'); }, MON)],
      ['"Add to today\'s plan"', TODAY, A => A.ev(async () => { await addToPlan('c1'); })],
      ['the supervisor plans it for her', MON, (A, B) => B.ev(async MON => { window._dpDate = MON; window._dpRep = 'Mariam'; window._dpMine = [{ id: 'c1', note: '', at: Date.now() }]; await saveDatePlan(); }, MON)],
    ];
    for(const [way, D, replan] of ways){
      seedCloud({ dayPlans: JSON.stringify({ [D]: { Mariam: [{ id: 'c1', note: '', at: CLOCK - 3600000 }] } }) });
      const tag = 'R21-' + ways.findIndex(w => w[0] === way);
      const A = await mkPhone(tag + 'A'); await A.boot('Mariam', 'rep');
      const B = await mkPhone(tag + 'B'); await B.boot('Dr. Ghaith', 'supervisor');
      // the day's only clinic leaves it (moved to Tuesday, or removed): date|Mariam goes in the delete log
      if(way === 'moved back') await A.ev(async ({ MON, TUE }) => { const el = document.createElement('input'); el.id = 'rsDate'; el.value = TUE; document.body.appendChild(el); await saveReschedulePlan(MON, 'Mariam', 'c1'); el.remove(); }, { MON, TUE });
      else await A.ev(async D => { await removeMissedPlan(D, 'Mariam', 'c1'); }, D);
      await A.tick(); await B.tick();
      const deleted = !planOf(D, 'Mariam').length && !!((parse(cloud.tombs) || {}).dayPlans || {})[D + '|Mariam'];
      await replan(A, B); await A.tick(); await B.tick();
      const back = planOf(D, 'Mariam').join();
      // later, unrelated plan saves: hers for Wednesday, then the supervisor's own day
      await A.ev(async WED => { window._dpDate = WED; window._dpRep = 'Mariam'; window._dpMine = [{ id: 'c2', note: '', at: Date.now() }]; await saveDatePlan(); }, WED);
      await B.ev(async WED => { window._dpDate = WED; window._dpRep = 'Dr. Ghaith'; window._dpMine = [{ id: 'c3', note: '', at: Date.now() }]; await saveDatePlan(); }, WED);
      await A.tick(); await B.tick();
      const seen = ph => ph.ev(D => ((dayPlans[D] || {}).Mariam || []).map(e => e && typeof e === 'object' ? e.id : e).join(), D);
      const after = { cloud: planOf(D, 'Mariam').join(), mariam: await seen(A), supervisor: await seen(B), wed: planOf(WED, 'Mariam').join() + '/' + planOf(WED, 'Dr. Ghaith').join() };
      check(`R21 [${way}] a day planned again after its plan was deleted stays planned: later plan saves on her phone and on the supervisor's (open since before) keep it — in the cloud and on both screens`,
        deleted && back === 'c1' && after.cloud === 'c1' && after.mariam === 'c1' && after.supervisor === 'c1' && after.wed === 'c2/c3', { deletedFirst: deleted, plannedAgain: back, after, log: ((parse(cloud.tombs) || {}).dayPlans || {})[D + '|Mariam'] || null });
      // …and the same day emptied again: the new delete reaches the log (a revival on this phone never hides a later delete)
      if(way === 'moved back'){
        await A.ev(async ({ MON, TUE }) => { const el = document.createElement('input'); el.id = 'rsDate'; el.value = TUE; document.body.appendChild(el); await saveReschedulePlan(MON, 'Mariam', 'c1'); el.remove(); }, { MON, TUE });
        await A.tick(); await B.tick();
        const again = { cloud: planOf(MON, 'Mariam').join(), tue: planOf(TUE, 'Mariam').join(), inLog: !!((parse(cloud.tombs) || {}).dayPlans || {})[MON + '|Mariam'], supervisor: await seen(B) };
        check('R21 [moved out again] …moved out of Monday once more: Monday is empty in the cloud and on the supervisor\'s screen, and its delete is in the log again',
          !again.cloud && again.tue === 'c1' && again.inLog && !again.supervisor, again);
      }
      await A.ctx.close(); await B.ctx.close();
    }
  }

  // ===================== R22. a restore whose write lands late (round 4, finding 4) =====================
  if(want('R22')){
    // the restore's compare-and-set write of the clinics gets no answer within its 15 s and its
    // commit lands a few seconds later (a slow link): it said "Nothing was changed" and wrote
    // nothing back, so the late commit removed the clinic added since that day
    const c1 = { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [] };
    const c2 = { id: 'c2', name: 'Added after the backup', rep: 'Mariam', cls: 'B', doctors: [] };
    const v1 = visit('v1', { date: '2026-11-09', ts: CLOCK - 4 * DAY, notes: 'before the backup' });
    const v2 = visit('v2', { clinicId: 'c2', date: '2026-11-12', ts: CLOCK - DAY, notes: 'after the backup' });
    for(const versioned of [false, true]){
    seedCloud({ clinics: JSON.stringify([c1, c2]), visits: JSON.stringify([v1, v2]),
      'snap_2026-11-10': JSON.stringify({ clinics: [c1], products: [], visits: [v1], visitsMonths: {}, tasks: [], ts: '2026-11-10T08:00:00.000Z' }) });
    mode.versioned = versioned; // the commit's precondition: the text as read (it lands, then is put back) or no write since (the put-back makes it run again, and it writes nothing)
    const S = await mkPhone('R22-S' + (versioned ? 'v' : ''), { ls: { um_snapDay: TODAY } }); await S.boot('Dr. Ghaith', 'supervisor');
    await S.ev(() => { window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; });
    const w0 = mode.writes.length;
    mode.slowCommit = { clinics: 19000 }; // committed 19 s after it was sent
    const r = await S.ev(async () => { window.__toasts = []; const res = await restoreSnapshot('2026-11-10'); return { res, toasts: window.__toasts.slice() }; });
    const meanwhile = { clinics: cloudList('clinics').map(c => c.id).join() };
    await S.ev(() => { window.__toasts = []; });
    await new Promise(res => setTimeout(res, 9000)); // the commit lands
    await S.tick();
    const later = await S.ev(() => ({ toasts: window.__toasts.slice(), clinics: clinics.map(c => c.id).join() }));
    const live = cloudList('clinics').map(c => c.id).join();
    const lateWrites = mode.writes.slice(w0).filter(w => /late:/.test(w));
    check(versioned
      ? 'R22b. …and when the put-back makes the commit on its way run again: it writes nothing (the restore had stopped), the clinic added after that day never leaves the cloud, and the screen then says the write did not land — "Nothing was changed" only now'
      : 'R22. a restore write that got no answer in time is never told "Nothing was changed": it says the write may still land and that this phone puts it back; when it lands late it is put back (the clinic added after that day is in the cloud and on the screen again, its visit points at it) and that is said',
      r.res === 'stopped' && !r.toasts.some(t => /Nothing was changed/.test(t)) && r.toasts.some(t => /may still land/.test(t))
        && live === 'c1,c2' && later.clinics === 'c1,c2' && cloudList('visits').some(v => v.id === 'v2' && v.clinicId === 'c2')
        && (versioned ? meanwhile.clinics === 'c1,c2' && !lateWrites.length && later.toasts.some(t => /did not land\. Nothing was changed/.test(t))
          : later.toasts.some(t => /reached the cloud late — it was put back/.test(t))),
      { restore: r, cloudWhileWaiting: meanwhile, afterTheLateCommit: { live, screen: later.clinics, toasts: later.toasts }, lateWrites });
    await S.ctx.close();
    }
  }

  console.log(results.join('\n'));
  const pageErrs = Object.keys(errors).filter(k => errors[k].length).map(k => k + ': ' + errors[k].join(' | ').slice(0, 400));
  check('no page errors', !pageErrs.length, pageErrs);
  if(pageErrs.length) console.log('❌ no page errors  → ' + JSON.stringify(pageErrs).slice(0, 900));
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
