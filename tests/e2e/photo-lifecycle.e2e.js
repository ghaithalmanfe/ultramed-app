// Visit photo marks across months, tabs, phone stores and backups (v122,
// second review). Each case below was reproduced on the release candidate and
// stays as a check:
// - a photo landing on a past month's visit took that month's new revision as
//   the phone's own without reading the month: the phone never showed another
//   phone's edit to it again, its next save of the month put its old copy back
//   (ARCHREV) and a visit moved between two past months was dropped from the
//   cloud (ARCHLOSS);
// - the index revision after such a landing failed once: nothing retried it,
//   the other phones said "waiting to upload" for good (IDXFAIL);
// - a second tab of the app (the same stores) called a photo lost while the
//   first tab kept it in IndexedDB and was uploading it, and never sent it
//   itself (TABS);
// - an IndexedDB that failed to open (a full disk…) counted as "nothing kept
//   there": the photo it held was called lost on every phone (IDBERR) — one
//   that never opened on the phone still is (IDBNEVER); one whose open never
//   answered stopped every photo retry and mark (HANG), and a photo that had
//   landed was read back from the web storage and sent again (HANG2);
// - a "lost" verdict whose save failed was never sent again (LOSTFAIL);
// - a photo whose phone was reset said "waiting to upload" on every phone for
//   good: after 3 days it is said with its age (AGE);
// - a photo landing while the full backup read the cloud was in neither part
//   of the file (BACKUP);
// - removing a photo kept only in memory, with no signal, said "Saved — it
//   reached the cloud" (MEMRM), also after another one had landed (MEM1).
// Third review: a past month's mark written with its answer lost (IDXLATE,
// IDXRETRY) or a look-up that never answers (STARVE) kept the other phones'
// "waiting"; a second tab holding the photo only in memory (TMEM); a landed
// photo's mark never settled while IndexedDB did not open (IDBLAND); the
// phone that took the photo said it "can only come from the phone that took
// it" (OWNAGE, LANDAGE); a backup while the photo store did not answer, or
// opened during the read (BKNOTREAD, BKLATE), and the words for a photo that
// landed during it (BACKUP2).
// Fake cloud in Node shared by the phones (a photo write can be held: a slow
// upload); clock pinned to Mon 21 Sep 2026; the 20-second refresh by hand.
// Names, clinics and doctors are invented.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8274;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean); // e.g. ONLY=TABS,AGE runs those phases only
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const cloud = {};
const net = { down: new Set(), photoHold: new Set(), lag: {}, writes: [], failKeys: {} };
let heldPhotos = [];
const busy = {}, queue = {};
const acquire = async k => { if(!busy[k]){ busy[k] = true; return true; } await new Promise(r => (queue[k] = queue[k] || []).push(r)); return true; };
const release = async k => { const next = (queue[k] || []).shift(); if(next) next(); else busy[k] = false; return true; };
const down = who => { if(net.down.has(who)) throw new Error('boom-offline'); };
const failKey = (who, k) => { const f = net.failKeys[who]; if(f && f.some(re => re.test(k))) throw new Error('boom-key ' + k); };
const api = {
  get: async (who, k) => { down(who); failKey(who, k); if(net.lag[who]) await sleep(net.lag[who]); return k in cloud ? cloud[k] : null; },
  set: async (who, k, v) => {
    if(/^photo:/.test(k) && net.photoHold.has(who)) return new Promise(res => heldPhotos.push({ who, k, v, res }));
    down(who); failKey(who, k);
    net.writes.push(who + ' ' + k); cloud[k] = v; return true; },
  setMany: async (who, e) => { down(who); e.forEach(([k, v]) => { net.writes.push(who + ' ' + k); cloud[k] = v; }); return true; },
  del: async (who, k) => { down(who); delete cloud[k]; return true; },
  list: async (who, p) => { down(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
const landPhoto = id => { const h = heldPhotos.find(x => x.k === 'photo:' + id); if(!h) return false; heldPhotos = heldPhotos.filter(x => x !== h); net.writes.push(h.who + ' ' + h.k); cloud[h.k] = h.v; h.res(true); return true; };
const dropHeld = who => { heldPhotos = heldPhotos.filter(h => h.who !== who); };
const J = k => { try{ return JSON.parse(cloud[k]); }catch(e){ return null; } };
const cv = id => (J('visits') || []).find(v => v && v.id === id) || null;
const av = (m, id) => (J('visitsArch:' + m) || []).find(v => v && v.id === id) || null;
const byNote = note => (J('visits') || []).filter(v => v && v.notes === note);
const marks = v => v && v.photos ? v.photos.map(p => ({ id: p.id, pending: !!p.pending, lost: !!p.lost, dev: p.dev || null })) : null;
const writesOf = (who, k) => net.writes.filter(w => w === who + ' ' + k).length;

const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,900):'')); if(!ok) failed++; }
async function phase(id, name, fn){
  if(ONLY.length && !ONLY.includes(id)) return;
  results.push('— ' + id + ' ' + name);
  try{ await fn(); }catch(e){ check(id + ' ' + name + ': phase crashed', false, String(e && e.stack || e).split('\n').slice(0,3).join(' | ').slice(0, 500)); }
}
const until = async (test, ms) => { const t0 = Date.now(); while(Date.now() - t0 < (ms || 8000)){ if(await test()) return true; await sleep(60); } return !!(await test()); };
const CLOCK = new Date('2026-09-21T10:00:00').getTime();
const M = 'Mariam', G = 'Dr. Ghaith';
function seed(visits){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Sample Harbor Dental Clinic', rep: M, cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Sample One' }] },
    { id: 'c2', name: 'Sample Willow Smile Clinic', rep: 'Renova', cls: 'B', doctors: [{ id: 'd2', name: 'Dr. Sample Two' }] },
    { id: 'c3', name: 'Sample Opal Dental Center', rep: M, cls: 'B', doctors: [{ id: 'd3', name: 'Dr. Sample Three' }] }]);
  cloud.visits = JSON.stringify(visits || []); cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.erpSales = JSON.stringify({ periods: [], seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  net.down.clear(); net.photoHold.clear(); net.lag = {}; net.failKeys = {}; heldPhotos = [];
}
const oldVisit = (id, rep, clinicId, docId, notes, date) => ({ id, clinicId, rep, withRep: null, date: date || '2026-09-20', ts: new Date((date || '2026-09-20') + 'T09:00:00').getTime(), products: [], orderTaken: false, orders: [], orderItems: [], orderGross: 0, orderDiscount: 0, orderTotal: 0, doctorId: docId, doctorIds: [docId], nextFollowUp: null, notes, noOrderReason: 'just a call' });

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  const initScript = ({ clock, noIDB, fullLS }) => {
    window.storage = {
      get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
      update: async (k, fn) => { await window.__cAcquire(k); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null;
        if(k === 'visitsIndex' && localStorage.getItem('__probe_failIndexOnce') === '1'){ localStorage.removeItem('__probe_failIndexOnce'); window.__idxFailed = true; throw new Error('boom-key visitsIndex (once)'); }
        if(k === 'visits' && /"lost":true/.test(next) && localStorage.getItem('__probe_failLostOnce') === '1'){ localStorage.removeItem('__probe_failLostOnce'); window.__failedOnce = true; throw new Error('boom-key visits (once)'); }
        await window.__cSet(k, next);
        // the archive's write lands but its answer comes after the app's 12 s limit / the transaction is run again (its answer lost)
        if(/^visitsArch:/.test(k) && localStorage.getItem('__probe_archLateOnce') === '1'){ localStorage.removeItem('__probe_archLateOnce'); window.__archLate = true; await new Promise(r => setTimeout(r, 13500)); }
        if(/^visitsArch:/.test(k) && localStorage.getItem('__probe_archRetryOnce') === '1'){ localStorage.removeItem('__probe_archRetryOnce'); window.__archRetry = true; const cur2 = await window.__cGet(k); const next2 = fn(cur2); if(next2 == null) return null; await window.__cSet(k, next2); return next2; }
        return next; } finally { await window.__cRelease(k); } },
    };
    let add = 0; try{ add = Number(localStorage.getItem('__probe_clockAdd') || 0); }catch(e){} // days later (an app opened again after a long gap)
    const off = clock + add - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    if(noIDB){ try{ Object.defineProperty(window, 'indexedDB', { get(){ return undefined; }, configurable: true }); }catch(e){} }
    if(fullLS){ const real = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(/^um_photo/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; }
    // IndexedDB that cannot be opened this session (e.g. Chromium: "Encountered full disk while opening backing store for indexedDB.open.")
    const realOpen = IDBFactory.prototype.open;
    window.__realIdbOpen = (n, v) => realOpen.call(indexedDB, n, v);
    window.__idbRestore = () => { IDBFactory.prototype.open = realOpen; };
    if(localStorage.getItem('__probe_idbHang') === '1'){
      IDBFactory.prototype.open = function(name, ver){
        if(name !== 'um_photos') return realOpen.call(this, name, ver);
        return { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null }; // never answers
      };
    }
    if(localStorage.getItem('__probe_idbFail') === '1'){
      IDBFactory.prototype.open = function(name, ver){
        if(name !== 'um_photos') return realOpen.call(this, name, ver);
        const rq = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
        setTimeout(() => { rq.error = new DOMException('Encountered full disk while opening backing store for indexedDB.open.', 'UnknownError'); if(rq.onerror) rq.onerror({ target: rq }); }, 20);
        return rq;
      };
    }
    window.__shot = n => { const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = ['#c33', '#3a3', '#33c', '#cc3', '#3cc', '#c3c', '#888', '#a52'][n % 8]; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillText('photo ' + n, 4, 14); return c.toDataURL('image/jpeg', 0.8); };
      return { id: uid(), full: mk(160, 120), thumb: mk(40, 30) }; };
  };
  const wirePage = async (page, label, opts) => {
    errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|save failed|update failed|snapshot error/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript(initScript, { clock: CLOCK, noIDB: !!(opts && opts.noIDB), fullLS: !!(opts && opts.fullLS) });
  };
  const mkTab = (ctx, page, label) => {
    const boot = async (who, role) => {
      dropHeld(label);
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; });
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); };
    return { page, ctx, boot, tick, label };
  };
  const mkPhone = async (label, opts) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage();
    await wirePage(page, label, opts);
    return mkTab(ctx, page, label);
  };
  const secondTab = async (ph, label, opts) => { const page = await ph.ctx.newPage(); await wirePage(page, label, opts); return mkTab(ph.ctx, page, label); };
  const bootOffline = async (ph, who, role) => {
    dropHeld(ph.label);
    await ph.page.goto(`http://localhost:${PORT}/index.html`); await ph.page.waitForTimeout(250);
    net.down.add(ph.label); await ph.ctx.setOffline(true);
    await ph.page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await ph.page.waitForTimeout(500);
    await ph.page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; });
  };
  const waitLineOf = (ph, vid) => ph.page.evaluate(vid => { const v = visits.find(x => x.id === vid); return v ? photoWaitHTML(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null; }, vid);
  const fill = (ph, o) => ph.page.evaluate(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId);
    document.getElementById('visitNotes').value = o.note;
    for(let i = 0; i < (o.photos || 0); i++) visitPhotos.push(window.__shot(i));
    renderVisitPhotos();
    return visitPhotos.map(p => p.id); }, o);
  const tap = ph => ph.page.evaluate(() => { const b = [...document.querySelectorAll('#view-log button')].find(x => (x.getAttribute('onclick') || '').trim() === 'saveVisit()');
    const on = !!(b && document.getElementById('view-log').classList.contains('active') && b.offsetParent); if(on) b.click(); return on; });
  const phoneVisit = (ph, id) => ph.page.evaluate(id => { const v = visits.find(x => x.id === id);
    return v ? { notes: v.notes, photos: (v.photos || []).map(p => ({ id: p.id, pending: !!p.pending, lost: !!p.lost })), wait: photoWaitHTML(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } : null; }, id);
  const idbIds = ph => ph.page.evaluate(() => new Promise(res => {
    let rq; try{ rq = window.__realIdbOpen('um_photos'); }catch(e){ return res('err'); }
    rq.onupgradeneeded = () => { try{ rq.transaction.abort(); }catch(e){} };
    rq.onerror = () => res([]);
    rq.onsuccess = () => { const db = rq.result; if(!db.objectStoreNames.contains('up')){ db.close(); return res([]); }
      const g = db.transaction('up', 'readonly').objectStore('up').getAll();
      g.onsuccess = () => { res(g.result.map(r => r.id)); db.close(); }; g.onerror = () => { db.close(); res('err'); }; };
  }));
  const logVisit = async (ph, note, n, clinicId, docId) => {
    const pids = await fill(ph, { clinicId: clinicId || 'c1', docId: docId || 'd1', note, photos: n });
    await tap(ph);
    await until(() => byNote(note).length === 1, 10000);
    await until(() => heldPhotos.filter(h => pids.some(id => h.k === 'photo:' + id)).length === n, 10000);
    await until(() => ph.page.evaluate(() => !_visitSaveBusy.size), 10000);
    return { vid: (byNote(note)[0] || {}).id, pids };
  };
  const editNotes = (ph, vid, notes) => ph.page.evaluate(({ vid, notes }) => {
    openEditVisit(vid);
    document.getElementById('evNotes').value = notes;
    const b = [...document.querySelectorAll('#modalInner button')].find(x => (x.getAttribute('onclick') || '').startsWith('saveEditVisit('));
    if(b) b.click();
    return !!b;
  }, { vid, notes });
  const sheetClosed = ph => ph.page.evaluate(() => !document.getElementById('modalBack').classList.contains('show'));
  const pickStub = (ph, n) => ph.page.evaluate(n => { window.pickImage = (cb) => { window.__picked = Promise.resolve(cb(window.__shot(n))); }; }, n);
  const addedId = (ph, vid, known) => ph.page.evaluate(({ vid, known }) => { const v = visits.find(x => x.id === vid); const p = v && (v.photos || []).find(x => !known.includes(x.id)); return p ? p.id : null; }, { vid, known });

  const toasts = ph => ph.page.evaluate(() => (window.__toasts || []).slice());
  const DAY = 86400000;
  const thumbURL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

  // =====================================================================
  // ARCHREV — a photo landing on a past month's visit: the phone takes the
  // month's new revision as its own without reading the month
  // =====================================================================
  await phase('ARCHREV', 'a landing on a past month leaves the month to be read again', async () => {
    seed();
    cloud['visitsArch:2026-08'] = JSON.stringify([oldVisit('va', M, 'c1', 'd1', 'ARCHREV the visit getting a photo', '2026-08-20'), oldVisit('vb', M, 'c3', 'd3', 'ARCHREV Mariam as she logged it', '2026-08-21')]);
    cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-08': { n: 2, rev: 1 } } });
    const A = await mkPhone('A-Mariam');
    const S = await mkPhone('S-supervisor');
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    await pickStub(A, 7);
    await A.page.evaluate(async () => { openEditVisit('va'); addEditPhoto('va'); await window.__picked; closeModal(); });
    const pid = await addedId(A, 'va', []);
    await until(() => ((av('2026-08', 'va') || {}).photos || []).length === 1, 10000);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pid), 10000);
    // the supervisor, online, corrects Mariam's other August visit (vb)
    await S.boot(G, 'supervisor');
    await editNotes(S, 'vb', 'ARCHREV corrected by the supervisor'); await until(() => sheetClosed(S), 10000); await sleep(300);
    const cloudVb = (av('2026-08', 'vb') || {}).notes;
    const rev0 = J('visitsIndex').months['2026-08'].rev;
    // Mariam's photo lands before her phone has refreshed
    landPhoto(pid);
    await until(() => { const p = ((av('2026-08', 'va') || {}).photos || [])[0]; return p && !p.pending; }, 10000); await sleep(400);
    const rev1 = J('visitsIndex').months['2026-08'].rev;
    const archRev = await A.page.evaluate(() => (_visitsArch['2026-08'] || {}).rev);
    await A.tick(); await sleep(300); await A.tick(); await sleep(300);
    const mine = await phoneVisit(A, 'vb');
    check('ARCHREV. after her photo landed on an August visit, Mariam\'s next refresh shows the supervisor\'s correction of her other August visit (the month\'s revision moved, her phone did not take it as its own)',
      cloudVb === 'ARCHREV corrected by the supervisor' && rev1 !== rev0 && archRev !== rev1 && mine && mine.notes === 'ARCHREV corrected by the supervisor',
      { cloudVb, rev0, rev1, archRevOnPhone: archRev, phoneVb: mine && mine.notes });
    // she then adds a note to her photo visit (an August visit): her save writes August
    await editNotes(A, 'va', 'ARCHREV Mariam adds a note to her photo visit'); await until(() => sheetClosed(A), 10000); await sleep(400);
    const after = av('2026-08', 'vb') || {};
    check('ARCHREV2. …and her next save of an August visit keeps the supervisor\'s correction (and its edit history) in the cloud',
      after.notes === 'ARCHREV corrected by the supervisor' && (after.editHistory || []).length === 1 && (av('2026-08', 'va') || {}).notes === 'ARCHREV Mariam adds a note to her photo visit',
      { cloudVb: after.notes, edits: (after.editHistory || []).length, va: (av('2026-08', 'va') || {}).notes });
    await A.ctx.close(); await S.ctx.close();
  });

  // =====================================================================
  // ARCHLOSS — a visit the supervisor moves from July to August, after a
  // photo on a July visit landed on Mariam's phone: never dropped
  // =====================================================================
  await phase('ARCHLOSS', 'a visit moved between two past months survives a landing', async () => {
    seed();
    cloud['visitsArch:2026-07'] = JSON.stringify([oldVisit('vj', M, 'c1', 'd1', 'ARCHLOSS a July visit', '2026-07-20'), oldVisit('vy', 'Renova', 'c2', 'd2', 'ARCHLOSS logged on 31 July by mistake', '2026-07-31')]);
    cloud['visitsArch:2026-08'] = JSON.stringify([oldVisit('va', M, 'c3', 'd3', 'ARCHLOSS an August visit', '2026-08-12')]);
    cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-07': { n: 2, rev: 1 }, '2026-08': { n: 1, rev: 1 } } });
    const inDoc = (k, id) => (J(k) || []).find(v => v && v.id === id) || null;
    const A = await mkPhone('A-Mariam-loss');
    const S = await mkPhone('S-supervisor-loss');
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    await pickStub(A, 3);
    await A.page.evaluate(async () => { openEditVisit('vj'); addEditPhoto('vj'); await window.__picked; closeModal(); });
    const pid = await addedId(A, 'vj', []);
    await until(() => ((inDoc('visitsArch:2026-07', 'vj') || {}).photos || []).length === 1, 10000);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pid), 10000);
    // the supervisor corrects Renova's visit: it was on 1 August, not 31 July
    await S.boot(G, 'supervisor');
    const moved = await S.page.evaluate(() => { openEditVisit('vy'); document.getElementById('evDate').value = '2026-08-01';
      const b = [...document.querySelectorAll('#modalInner button')].find(x => (x.getAttribute('onclick') || '').startsWith('saveEditVisit(')); if(b) b.click(); return !!b; });
    await until(() => sheetClosed(S), 10000); await sleep(400);
    const afterSup = { jul: !!inDoc('visitsArch:2026-07', 'vy'), aug: (inDoc('visitsArch:2026-08', 'vy') || {}).date || null };
    // Mariam's photo lands, her phone refreshes, then she logs her next visit (an ordinary visits save)
    landPhoto(pid);
    await until(() => { const v = inDoc('visitsArch:2026-07', 'vj'); return v && v.photos && v.photos[0] && !v.photos[0].pending; }, 10000); await sleep(500);
    await A.tick(); await sleep(400);
    const phoneVy = await A.page.evaluate(() => { const v = visits.find(x => x.id === 'vy'); return v ? v.date : null; });
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'ARCHLOSS next visit' });
    await tap(A);
    await until(() => byNote('ARCHLOSS next visit').length === 1, 10000);
    await until(() => A.page.evaluate(() => !_visitSaveBusy.size), 10000); await sleep(600);
    const where = { live: !!cv('vy'), jul: !!inDoc('visitsArch:2026-07', 'vy'), aug: (inDoc('visitsArch:2026-08', 'vy') || {}).date || null };
    await S.tick(); await sleep(400);
    const supSees = await S.page.evaluate(() => { const v = visits.find(x => x.id === 'vy'); return v ? v.date : null; });
    check('ARCHLOSS. the visit the supervisor moved from 31 July to 1 August is still in the cloud (in August only) after Mariam\'s next visits save, and on his phone',
      moved && afterSup.aug === '2026-08-01' && !afterSup.jul && where.aug === '2026-08-01' && !where.jul && !where.live && supSees === '2026-08-01' && phoneVy === '2026-08-01',
      { moved, afterSup, mariamPhoneVyDate: phoneVy, cloudAfterMariamSave: where, supervisorSees: supSees });
    await A.ctx.close(); await S.ctx.close();
  });

  // =====================================================================
  // IDXFAIL — the month's index revision fails once after its archive was patched
  // =====================================================================
  await phase('IDXFAIL', 'the index revision after a past month\'s mark fails once', async () => {
    seed();
    cloud['visitsArch:2026-08'] = JSON.stringify([oldVisit('va', M, 'c1', 'd1', 'IDXFAIL an August visit', '2026-08-20')]);
    cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-08': { n: 1, rev: 1 } } });
    const A = await mkPhone('A-Mariam-idx');
    const S = await mkPhone('S-supervisor-idx');
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    await pickStub(A, 7);
    await A.page.evaluate(async () => { openEditVisit('va'); addEditPhoto('va'); await window.__picked; closeModal(); });
    const pid = await addedId(A, 'va', []);
    await until(() => ((av('2026-08', 'va') || {}).photos || []).length === 1, 10000);
    await S.boot(G, 'supervisor');
    const sBefore = await phoneVisit(S, 'va');
    await A.page.evaluate(() => localStorage.setItem('__probe_failIndexOnce', '1'));
    landPhoto(pid);
    await until(() => { const p = ((av('2026-08', 'va') || {}).photos || [])[0]; return p && !p.pending; }, 10000); await sleep(500);
    const idxFailed = await A.page.evaluate(() => !!window.__idxFailed);
    for(let i = 0; i < 3; i++){ await A.tick(); await sleep(300); await S.tick(); await sleep(300); }
    const sAfter = await phoneVisit(S, 'va');
    check('IDXFAIL. the archive got the mark but the index revision failed once: it moves at a later round and the supervisor\'s phone stops saying "waiting"',
      idxFailed && sBefore && sBefore.photos[0] && sBefore.photos[0].pending && sAfter && sAfter.photos[0] && !sAfter.photos[0].pending && !sAfter.photos[0].lost,
      { idxFailed, archive: marks(av('2026-08', 'va')), index: J('visitsIndex'), sBefore, sAfter });
    await A.ctx.close(); await S.ctx.close();
  });

  // =====================================================================
  // TABS — the same phone, two tabs (shared stores)
  // =====================================================================
  await phase('TABS', 'two tabs of the app on one phone', async () => {
    seed();
    const A = await mkPhone('A-tab1');
    const B = await secondTab(A, 'A-tab2');
    await B.boot(M, 'rep'); // tab 2 open first: its first round read the phone's stores (nothing kept yet)
    await B.tick(); await sleep(300);
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'TABS photo on its way', 1);
    const ix0 = await idbIds(A);
    await B.tick(); await sleep(500); await B.tick(); await sleep(500);
    const c = marks(cv(V.vid));
    const onB = await phoneVisit(B, V.vid);
    check('TABS. a photo tab 1 keeps in IndexedDB and is still uploading is never called lost by tab 2 of the same phone: tab 2 finds it in the phone\'s store and sends it',
      ix0.includes(V.pids[0]) && c && c[0] && !c[0].lost && !!cloud['photo:' + V.pids[0]] && !c[0].pending,
      { cloudMark: c, idbBefore: ix0, inCloud: !!cloud['photo:' + V.pids[0]], tab2: onB });
    await A.page.close(); dropHeld(A.label);
    await B.tick(); await sleep(400); await B.tick(); await sleep(400);
    const c2 = marks(cv(V.vid));
    check('TABS2. …tab 1 closed before its own upload landed: the photo stays uploaded on every phone, never "lost"', c2 && c2[0] && !c2[0].lost && !c2[0].pending, { cloudMark: c2 });
    await A.ctx.close();
  });

  // =====================================================================
  // IDBERR — IndexedDB holds the photo but does not open this session
  // =====================================================================
  await phase('IDBERR', 'IndexedDB cannot be opened in a later session', async () => {
    seed();
    const A = await mkPhone('A-Mariam-idb');
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'IDBERR photo kept in IndexedDB', 1);
    const ix0 = await idbIds(A);
    // the app is closed before the upload lands; at the next start IndexedDB fails to open
    await A.page.evaluate(() => localStorage.setItem('__probe_idbFail', '1'));
    await A.boot(M, 'rep');
    const openFails = await A.page.evaluate(async () => (await photoDb()) === false);
    await A.tick(); await sleep(500); await A.tick(); await sleep(500);
    const c = marks(cv(V.vid));
    const onPhone = await phoneVisit(A, V.vid);
    check('IDBERR. a photo kept in IndexedDB is never called lost because IndexedDB could not be opened at this start (it stays "waiting")',
      openFails && ix0.includes(V.pids[0]) && c && c[0] && c[0].pending && !c[0].lost, { openFails, idbBefore: ix0, cloudMark: c, phone: onPhone });
    await A.page.evaluate(() => localStorage.removeItem('__probe_idbFail'));
    await A.boot(M, 'rep');
    await A.tick(); await sleep(400);
    const resent = heldPhotos.some(h => h.k === 'photo:' + V.pids[0]);
    landPhoto(V.pids[0]); await sleep(600); await A.tick(); await sleep(400);
    const c2 = marks(cv(V.vid));
    check('IDBERR2. when IndexedDB opens again the photo is sent and its mark ends uploaded', resent && c2[0] && !c2[0].lost && !c2[0].pending, { resent, after: c2 });
    await A.ctx.close();
  });

  // =====================================================================
  // IDBNEVER — IndexedDB never opens on this phone (some private modes):
  // nothing can be kept there, so a photo kept only in memory is still said lost
  // =====================================================================
  await phase('IDBNEVER', 'IndexedDB never opened on this phone', async () => {
    seed();
    const F = await mkPhone('F-Mariam-noidb', { fullLS: true });
    await F.page.goto(`http://localhost:${PORT}/index.html`); await F.page.evaluate(() => localStorage.setItem('__probe_idbFail', '1'));
    await F.boot(M, 'rep');
    net.photoHold.add(F.label);
    await fill(F, { clinicId: 'c3', docId: 'd3', note: 'IDBNEVER photo in memory', photos: 1 });
    await tap(F);
    await until(() => byNote('IDBNEVER photo in memory').length === 1, 15000);
    await until(() => F.page.evaluate(() => !_visitSaveBusy.size), 15000);
    const vid = byNote('IDBNEVER photo in memory')[0].id;
    const kept = await F.page.evaluate(() => [..._photoKept.values()].map(r => r.on));
    await F.boot(M, 'rep'); // closed before it uploaded: the photo only memory held is gone
    for(let i = 0; i < 3; i++){ await F.tick(); await sleep(400); }
    const c = marks(cv(vid));
    check('IDBNEVER. on a phone where IndexedDB never opened, a photo kept only in memory and lost when the app closed is said lost (nothing could be kept there)',
      kept[0] === 'mem' && c && c[0] && c[0].lost && !c[0].pending, { kept, cloudMark: c });
    await F.ctx.close();
  });

  // =====================================================================
  // HANG — IndexedDB's open never answers this session
  // =====================================================================
  await phase('HANG', 'IndexedDB open never answers', async () => {
    seed();
    const A = await mkPhone('A-Mariam-hang');
    await A.page.goto(`http://localhost:${PORT}/index.html`); await A.page.evaluate(() => { localStorage.setItem('__probe_idbHang', '1'); localStorage.setItem('um_idbOk', '1'); }); // it opened on this phone before
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const pids = await fill(A, { clinicId: 'c1', docId: 'd1', note: 'HANG photo', photos: 1 });
    await tap(A);
    await until(() => byNote('HANG photo').length === 1, 15000);
    await until(() => A.page.evaluate(() => !_visitSaveBusy.size), 15000);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pids[0]), 15000);
    const vid = byNote('HANG photo')[0].id;
    landPhoto(pids[0]); net.photoHold.delete(A.label); // from now on a photo write lands at once (a second upload would show)
    await until(async () => { const c = marks(cv(vid)); if(c && c[0] && !c[0].pending) return true; await A.tick(); await sleep(400); return false; }, 30000);
    for(let i = 0; i < 2; i++){ await A.tick(); await sleep(400); }
    await sleep(6000); // a round waits up to 5 s for the IndexedDB that never answers
    const st = await A.page.evaluate(() => ({ retrying: _photoRetrying, read: _photoRead, landed: [..._photoLanded], kept: [..._photoKept.keys()] }));
    const c = marks(cv(vid)), sent = writesOf(A.label, 'photo:' + pids[0]);
    check('HANG. the photo has landed: its mark is settled even though IndexedDB never answered this session (the phone stops waiting for it)',
      c && c[0] && !c[0].pending && !c[0].lost && !st.retrying, { cloudMark: c, inCloud: !!cloud['photo:' + pids[0]], state: st });
    check('HANG2. …and the phone lets go of it: never read back from its web storage and sent again while IndexedDB does not answer',
      !st.kept.includes(pids[0]) && sent === 1, { sent, state: st });
    await A.ctx.close();
  });

  // =====================================================================
  // LOSTFAIL — a "lost" verdict whose save fails once
  // =====================================================================
  await phase('LOSTFAIL', 'the lost verdict\'s save fails once', async () => {
    seed();
    const F = await mkPhone('F-Mariam-full', { noIDB: true, fullLS: true });
    await F.boot(M, 'rep');
    net.photoHold.add(F.label);
    await fill(F, { clinicId: 'c3', docId: 'd3', note: 'LOSTFAIL photo in memory', photos: 1 });
    await tap(F);
    await until(() => byNote('LOSTFAIL photo in memory').length === 1, 10000);
    await until(() => F.page.evaluate(() => !_visitSaveBusy.size), 10000);
    const vid = byNote('LOSTFAIL photo in memory')[0].id;
    // closed and reopened: the photo only it held is gone; the save of the "lost" mark fails once (a dropped connection)
    await F.page.evaluate(() => localStorage.setItem('__probe_failLostOnce', '1'));
    await F.boot(M, 'rep');
    await F.tick(); await sleep(500);
    const mid = marks(cv(vid));
    for(let i = 0; i < 4; i++){ await F.tick(); await sleep(600); } // a verdict waits up to 1 s for another tab of the phone to answer
    const failedOnce = await F.page.evaluate(() => !!window.__failedOnce);
    const c = marks(cv(vid));
    const onPhone = await phoneVisit(F, vid);
    check('LOSTFAIL. a lost photo whose "lost" save failed once is said lost at a later round of the same session, in the cloud and on the phone',
      failedOnce && c && c[0] && c[0].lost && !c[0].pending && onPhone && onPhone.photos[0].lost, { failedOnce, afterFirstRound: mid, after: c, phone: onPhone });
    await F.ctx.close();
  });

  // =====================================================================
  // AGE — a photo whose phone was reset (a new mark): no phone ever settles
  // it; after 3 days every phone says how long it has waited
  // =====================================================================
  await phase('AGE', 'a photo waiting for days on a phone that may be gone', async () => {
    const old = { id: 'pOld', thumb: thumbURL, pending: true, dev: 'dGoneBeforeReset', at: CLOCK - 4 * DAY - 3600000 };
    const fresh = { id: 'pNew', thumb: thumbURL, pending: true, dev: 'dGoneBeforeReset', at: CLOCK - 3600000 };
    seed([Object.assign(oldVisit('vOld', M, 'c1', 'd1', 'AGE photo from four days ago'), { photos: [old] }), Object.assign(oldVisit('vNew', M, 'c3', 'd3', 'AGE photo from an hour ago'), { photos: [fresh] })]);
    const S = await mkPhone('S-supervisor-age');
    await S.boot(G, 'supervisor');
    await S.tick(); await sleep(300);
    const lines = await S.page.evaluate(() => ({ old: photoWaitHTML(visits.find(v => v.id === 'vOld')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      fresh: photoWaitHTML(visits.find(v => v.id === 'vNew')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));
    const lb = await S.page.evaluate(async () => { await showLightbox('pOld', 'AGE'); const n = document.getElementById('lbNote'); const t = n && n.style.display !== 'none' ? n.textContent : ''; closeLightbox(null, true);
      await showLightbox('pNew', 'AGE'); const n2 = document.getElementById('lbNote'); const t2 = n2 && n2.style.display !== 'none' ? n2.textContent : ''; closeLightbox(null, true); return { old: t, fresh: t2 }; });
    const ar = await S.page.evaluate(() => ({ line: UMI18N.tr('4 days now — it can only come from the phone that took it, if that phone still has it'), line12: UMI18N.tr('12 days now — it can only come from the phone that took it, if that phone still has it'),
      lb: UMI18N.tr('⏳ The full photo has not arrived in 4 days — it can only come from the phone that took it, if that phone still has it. This is its small preview') }));
    const c = marks(cv('vOld'));
    check('AGE. a photo waiting 4 days that no phone holds says its age and where it can only come from — on the visit and in the lightbox; nothing is marked lost',
      /4 days now — it can only come from the phone that took it, if that phone still has it/.test(lines.old) && /has not arrived in 4 days/.test(lb.old) && c && c[0] && c[0].pending && !c[0].lost,
      { lines, lb, cloudMark: c });
    check('AGE2. …a photo waiting an hour keeps the plain "waiting to upload" words', /Photo waiting to upload/.test(lines.fresh) && !/days now/.test(lines.fresh) && /still waiting to upload from the phone that took it/.test(lb.fresh), { lines, lb });
    check('AGE3. …and the new words have their Arabic (أيام up to 10 days, يومًا from 11)', /[؀-ۿ]/.test(ar.line) && /أيام/.test(ar.line) && /يومًا/.test(ar.line12) && /[؀-ۿ]/.test(ar.lb) && !/days/.test(ar.line + ar.lb), ar);
    await S.ctx.close();
  });

  // =====================================================================
  // BACKUP — the supervisor's photo lands while the full backup reads
  // =====================================================================
  const backupRun = async (label, failReread) => {
    seed([oldVisit('vk1', M, 'c1', 'd1', 'BACKUP visit')]);
    ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'].forEach(d => { cloud['snap_' + d] = JSON.stringify({ clinics: [], products: [], visits: [], tasks: [], ts: d + 'T07:00:00.000Z' }); });
    const S = await mkPhone(label);
    await S.boot(G, 'supervisor');
    net.photoHold.add(S.label);
    await pickStub(S, 5);
    await S.page.evaluate(async () => { openEditVisit('vk1'); addEditPhoto('vk1'); await window.__picked; closeModal(); });
    const pid = await addedId(S, 'vk1', []);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pid), 10000);
    await until(() => ((cv('vk1') || {}).photos || []).length === 1, 10000);
    const k = 'photo:' + pid;
    // the held upload goes up while the backup reads the daily backups (after the photos' part of the read)
    const realGet = api.get; let landedAt = null;
    api.get = async (who, key) => {
      if(failReread && who === S.label && key === k && landedAt) throw new Error('boom-reread');
      const r = await realGet(who, key);
      if(who === S.label && /^snap_/.test(key) && !landedAt){ landedAt = key; net.photoHold.delete(S.label); landPhoto(pid); }
      return r;
    };
    const b = await S.page.evaluate(async () => {
      await openFullBackup();
      const pend = document.querySelector('[data-backup-pending]');
      const file = (typeof _fullBackup !== 'undefined' && _fullBackup) ? JSON.parse(await _fullBackup.blob.text()) : null;
      const v = file ? UMCore.verifyBackupFile(file) : null;
      const landedCard = document.querySelector('[data-backup-landed]');
      return { ready: !!document.querySelector('[data-backup-download]'), pendingCard: pend ? pend.innerText : '', landedCard: landedCard ? landedCard.innerText : '', dataKeys: file ? Object.keys(file.data) : [], pendKeys: file ? Object.keys(file.pending || {}) : [],
        file, ok: !!(v && v.ok), kept: [..._photoKept.keys()] };
    });
    api.get = realGet;
    const inData = b.dataKeys.includes(k), inPend = b.pendKeys.includes(k);
    const value = inData ? b.file.data[k].value : inPend ? b.file.pending[k].value : null;
    await S.page.evaluate(() => closeModal());
    await S.ctx.close();
    return { k, landedAt, ready: b.ready, ok: b.ok, inData, inPend, sameAsCloud: value === cloud[k], pendingCard: b.pendingCard, landedCard: b.landedCard, from: inPend ? b.file.pending[k].from : null, kept: b.kept };
  };
  await phase('BACKUP', 'full backup: a photo lands while the cloud is read', async () => {
    const r = await backupRun('S-supervisor-bk', false);
    check('BACKUP. a photo kept on the supervisor\'s phone when he starts the full backup, landing during the read, is in the file once — read again, among the cloud\'s documents — and the file verifies',
      r.landedAt && r.ready && r.ok && r.inData && !r.inPend && r.sameAsCloud && !/Visit photo|photo:/.test(r.pendingCard), r);
    const r2 = await backupRun('S-supervisor-bk2', true);
    check('BACKUP2. …and when it cannot be read again, the file keeps this phone\'s copy of it apart (pending), once — said as reached the cloud during the read, never as a change the cloud lacks',
      r2.landedAt && r2.ready && r2.ok && !r2.inData && r2.inPend && r2.sameAsCloud && !/photo:/.test(r2.pendingCard) && /Reached the cloud while the backup was being read/.test(r2.landedCard) && r2.landedCard.includes(r2.k) && /reached the cloud during the read/.test(r2.from || ''), r2);
  });

  // =====================================================================
  // MEMRM — a photo kept only in memory (a full phone), removed with no signal
  // =====================================================================
  await phase('MEMRM', 'a memory-only photo removed offline', async () => {
    seed([oldVisit('vm', M, 'c1', 'd1', 'MEMRM visit')]);
    const F = await mkPhone('F-Mariam-memrm', { noIDB: true, fullLS: true });
    await F.boot(M, 'rep');
    await pickStub(F, 2);
    net.down.add(F.label); await F.ctx.setOffline(true);
    await F.page.evaluate(async () => { openEditVisit('vm'); addEditPhoto('vm'); await window.__picked; });
    await sleep(400);
    const s1 = await F.page.evaluate(() => { const b = document.getElementById('memOnlyBar'); const v = visits.find(x => x.id === 'vm'); const p = v.photos[v.photos.length - 1];
      return { bar: b ? b.textContent : null, kept: [..._photoKept.values()].map(r => r.on), pid: p.id }; });
    await F.page.evaluate(() => { window.__toasts = []; });
    await F.page.click(`#editPhotoRow .ph-del[onclick*="'${s1.pid}'"]`);
    await sleep(3500);
    const s2 = await F.page.evaluate(() => { const b = document.getElementById('memOnlyBar'); return { bar: b ? b.textContent : null, toasts: window.__toasts.slice(), outbox: outboxList(), memOnly: [..._memOnly] }; });
    check('MEMRM. offline, × on a photo that was only in the app\'s memory: the red bar goes, and nothing says "Saved — it reached the cloud" (the removal waits in the queue)',
      s1.kept[0] === 'mem' && /photo is only in the app's memory/.test(s1.bar || '') && !s2.bar && !s2.toasts.some(t => /reached the cloud/.test(t)) && s2.outbox.includes('visits'),
      { s1, s2 });
    // the signal is back: the removal uploads; a new photo kept only in memory lands → that one does say "Saved"
    net.down.delete(F.label); await F.ctx.setOffline(false);
    await F.page.evaluate(async () => { closeModal(); await flushOutbox(); });
    await until(() => ((cv('vm') || {}).photos || []).length === 0 && F.page.evaluate(() => !outboxList().length), 10000);
    net.photoHold.add(F.label);
    await pickStub(F, 4);
    await F.page.evaluate(async () => { openEditVisit('vm'); addEditPhoto('vm'); await window.__picked; });
    const pid2 = await addedId(F, 'vm', []);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pid2), 10000);
    await until(() => ((cv('vm') || {}).photos || []).length === 1, 10000);
    await F.page.evaluate(() => { window.__toasts = []; });
    landPhoto(pid2);
    await until(() => F.page.evaluate(() => (window.__toasts || []).some(t => /reached the cloud/.test(t))), 6000);
    const s3 = await F.page.evaluate(() => { const b = document.getElementById('memOnlyBar'); return { bar: b ? b.textContent : null, toasts: window.__toasts.slice() }; });
    check('MEMRM2. …a photo kept only in memory that lands does say "Saved — it reached the cloud", and the bar goes', !s3.bar && s3.toasts.some(t => /Saved — it reached the cloud/.test(t)) && !!cloud['photo:' + pid2], s3);
    await F.ctx.close();
  });


  // =====================================================================
  // IDXLATE / IDXRETRY / STARVE — the past month's revision must still move
  // =====================================================================
  const idxCase = async (id, probe, label) => {
    seed();
    cloud['visitsArch:2026-08'] = JSON.stringify([oldVisit('va', M, 'c1', 'd1', id + ' an August visit', '2026-08-20')]);
    cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-08': { n: 1, rev: 1 } } });
    const A = await mkPhone('A-Mariam-' + id);
    const S = await mkPhone('S-supervisor-' + id);
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    await pickStub(A, 7);
    await A.page.evaluate(async () => { openEditVisit('va'); addEditPhoto('va'); await window.__picked; closeModal(); });
    const pid = await addedId(A, 'va', []);
    await until(() => ((av('2026-08', 'va') || {}).photos || []).length === 1, 10000);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pid), 10000);
    await sleep(500);
    await S.boot(G, 'supervisor');
    const sBefore = await phoneVisit(S, 'va');
    await A.page.evaluate(p => localStorage.setItem(p, '1'), probe);
    landPhoto(pid);
    await until(() => { const p = ((av('2026-08', 'va') || {}).photos || [])[0]; return p && !p.pending; }, 10000);
    await until(() => A.page.evaluate(() => !_visitsSaving && !_photoSettling), 25000); await sleep(500);
    const probeHit = await A.page.evaluate(() => ({ late: !!window.__archLate, retry: !!window.__archRetry }));
    for(let i = 0; i < 3; i++){
      await A.tick(); await until(() => A.page.evaluate(() => !_visitsSaving && !_photoSettling), 25000); await sleep(300);
      await S.tick(); await sleep(300);
    }
    const sAfter = await phoneVisit(S, 'va');
    check(id + '. ' + label + ': the month\'s revision still moves and the supervisor\'s phone stops saying "waiting"',
      (probeHit.late || probeHit.retry) && sBefore && sBefore.photos[0] && sBefore.photos[0].pending && sAfter && sAfter.photos[0] && !sAfter.photos[0].pending,
      { probeHit, archive: marks(av('2026-08', 'va')), index: J('visitsIndex'), sBefore, sAfter });
    await A.ctx.close(); await S.ctx.close();
  };
  await phase('IDXLATE', 'the archive mark lands but its answer comes after 12 s', () => idxCase('IDXLATE', '__probe_archLateOnce', 'the archive write landed and its answer came after the app\'s 12 s limit'));
  await phase('IDXRETRY', 'the archive mark lands, the transaction is run again', () => idxCase('IDXRETRY', '__probe_archRetryOnce', 'the archive write landed, the transaction was run again and found nothing to change'));
  await phase('STARVE', 'an owed revision while a look-up gets no answer', async () => {
    seed();
    const devA = 'dHarnessMariam';
    cloud.visits = JSON.stringify([Object.assign(oldVisit('vlive', M, 'c3', 'd3', 'STARVE a visit with an earlier photo', '2026-09-18'), { photos: [{ id: 'pxold', thumb: thumbURL, pending: true, dev: devA, at: CLOCK - 2 * 3600000 }] })]);
    cloud['photo:pxold'] = 'data:image/jpeg;base64,AAAA'; // it did land, in an earlier session
    cloud['visitsArch:2026-08'] = JSON.stringify([oldVisit('va', M, 'c1', 'd1', 'STARVE an August visit', '2026-08-20')]);
    cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-08': { n: 1, rev: 1 } } });
    const A = await mkPhone('A-Mariam-starve');
    const S = await mkPhone('S-supervisor-starve');
    await A.page.goto(`http://localhost:${PORT}/index.html`); await A.page.evaluate(d => localStorage.setItem('um_device', d), devA);
    net.failKeys[A.label] = [/^photo:pxold$/]; // its download never answers here (a weak link, a big photo)
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    await pickStub(A, 7);
    await A.page.evaluate(async () => { openEditVisit('va'); addEditPhoto('va'); await window.__picked; closeModal(); });
    const pid = await addedId(A, 'va', []);
    await until(() => ((av('2026-08', 'va') || {}).photos || []).length === 1, 10000);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pid), 10000);
    await sleep(500);
    await S.boot(G, 'supervisor');
    const sBefore = await phoneVisit(S, 'va');
    await A.page.evaluate(() => localStorage.setItem('__probe_failIndexOnce', '1'));
    landPhoto(pid);
    await until(() => { const p = ((av('2026-08', 'va') || {}).photos || [])[0]; return p && !p.pending; }, 10000);
    await until(() => A.page.evaluate(() => !_visitsSaving && !_photoSettling), 25000); await sleep(500);
    const idxFailed = await A.page.evaluate(() => !!window.__idxFailed);
    for(let i = 0; i < 4; i++){
      await A.tick(); await until(() => A.page.evaluate(() => !_visitsSaving && !_photoSettling), 25000); await sleep(300);
      await S.tick(); await sleep(300);
    }
    const sAfter = await phoneVisit(S, 'va');
    const st = await A.page.evaluate(() => ({ owed: visitsIndexOwed(), checked: _photoChecked.has('pxold') }));
    check('STARVE. a revision owed after a failed index write moves at a later round even while the look-up of her earlier photo never answers: the supervisor\'s phone stops saying "waiting"',
      idxFailed && sBefore && sBefore.photos[0] && sBefore.photos[0].pending && sAfter && sAfter.photos[0] && !sAfter.photos[0].pending && st.owed === 0,
      { idxFailed, st, index: J('visitsIndex'), sBefore, sAfter });
    delete net.failKeys[A.label];
    await A.ctx.close(); await S.ctx.close();
  });

  // =====================================================================
  // TMEM — two tabs on a full phone: the photo only in tab 1's memory
  // =====================================================================
  await phase('TMEM', 'a second tab and a photo only in the first tab\'s memory', async () => {
    seed();
    const A = await mkPhone('A-tab1-mem', { noIDB: true, fullLS: true });
    const B = await secondTab(A, 'A-tab2-mem', { noIDB: true, fullLS: true });
    await B.boot(M, 'rep');
    await B.tick(); await sleep(300);
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'TMEM photo on its way', 1);
    const keptA = await A.page.evaluate(() => [..._photoKept.values()].map(r => r.on));
    await B.tick(); await sleep(600); await B.tick(); await sleep(600);
    const c = marks(cv(V.vid));
    check('TMEM. a second tab never calls lost a photo the first tab holds only in its memory and is uploading (a full phone)',
      keptA[0] === 'mem' && c && c[0] && c[0].pending && !c[0].lost, { keptA, cloudMark: c, tab2: await phoneVisit(B, V.vid) });
    landPhoto(V.pids[0]); await sleep(800); await A.tick(); await sleep(500);
    const c2 = marks(cv(V.vid));
    check('TMEM2. …once it lands its mark is uploaded', c2 && c2[0] && !c2[0].lost && !c2[0].pending, { after: c2 });
    await A.ctx.close();
  });

  // =====================================================================
  // IDBLAND — a landed photo whose mark did not land; IndexedDB not opening at the next start
  // =====================================================================
  await phase('IDBLAND', 'a landed photo\'s mark, IndexedDB failing at the next start', async () => {
    seed();
    const A = await mkPhone('A-Mariam-idbland');
    const S = await mkPhone('S-supervisor-idbland');
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'IDBLAND photo', 1);
    net.failKeys[A.label] = [/^visits$/]; // the photo lands, the visits write right after fails (the link drops)
    landPhoto(V.pids[0]);
    await sleep(1500);
    await A.page.evaluate(() => localStorage.setItem('__probe_idbFail', '1')); // at the next start IndexedDB does not open (it did before)
    delete net.failKeys[A.label];
    await A.boot(M, 'rep');
    for(let i = 0; i < 4; i++){ await A.tick(); await sleep(500); }
    const c = marks(cv(V.vid));
    await S.boot(G, 'supervisor'); await S.tick(); await sleep(300);
    check('IDBLAND. a photo the cloud holds, its mark left waiting, IndexedDB not opening at this start: the phone still looks it up in the cloud and its mark settles on every phone',
      !!cloud['photo:' + V.pids[0]] && c && c[0] && !c[0].pending && !c[0].lost, { cloudMark: c, supervisor: await phoneVisit(S, V.vid) });
    await A.page.evaluate(() => localStorage.removeItem('__probe_idbFail'));
    await A.ctx.close(); await S.ctx.close();
  });

  // =====================================================================
  // OWNAGE / LANDAGE — the phone that took the photo never says it can only come from "the phone that took it"
  // =====================================================================
  await phase('OWNAGE', 'her own photo kept in IndexedDB, 4 days later, no signal', async () => {
    seed();
    const A = await mkPhone('A-Mariam-own');
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'OWNAGE photo kept on her phone', 1);
    await A.page.evaluate(ms => localStorage.setItem('__probe_clockAdd', String(ms)), 4 * DAY + 3600000);
    await bootOffline(A, M, 'rep'); // the app closed before it uploaded; opened again 4 days later with no signal
    for(let i = 0; i < 2; i++){ await A.tick(); await sleep(400); }
    const line = await waitLineOf(A, V.vid);
    check('OWNAGE. 4 days later, offline, the phone that took the photo and keeps it says "kept on this phone" — never that it can only come from the phone that took it',
      /kept on this phone/.test(line || '') && !/days now/.test(line || ''), { line });
    await A.page.evaluate(() => localStorage.removeItem('__probe_clockAdd'));
    net.down.delete(A.label); await A.ctx.setOffline(false);
    await A.ctx.close();
  });
  await phase('LANDAGE', 'her own 4-day-old photo lands, its mark\'s save fails', async () => {
    seed();
    const A = await mkPhone('A-Mariam-land');
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'LANDAGE photo', 1);
    await A.page.evaluate(ms => localStorage.setItem('__probe_clockAdd', String(ms)), 4 * DAY + 3600000);
    net.photoHold.delete(A.label);
    net.failKeys[A.label] = [/^visits$/]; // the visits document cannot be written for a while (the link drops right after the upload)
    await A.boot(M, 'rep');
    await until(() => !!cloud['photo:' + V.pids[0]], 10000); await sleep(800);
    await A.tick(); await sleep(600);
    const line = await waitLineOf(A, V.vid);
    check('LANDAGE. her photo has landed (the cloud holds it) while its mark\'s save fails: her phone neither says it is waiting nor that it can only come from the phone that took it',
      !!cloud['photo:' + V.pids[0]] && !/waiting to upload|days now/.test(line || ''), { line, cloudMark: marks(cv(V.vid)) });
    delete net.failKeys[A.label];
    await A.page.evaluate(() => localStorage.removeItem('__probe_clockAdd'));
    await A.ctx.close();
  });

  // =====================================================================
  // BKNOTREAD / BKLATE — a full backup while this phone's photo store does not answer
  // =====================================================================
  const bkSetup = async (label) => {
    seed([oldVisit('vk1', M, 'c1', 'd1', 'BK visit')]);
    ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'].forEach(d => { cloud['snap_' + d] = JSON.stringify({ clinics: [], products: [], visits: [], tasks: [], ts: d + 'T07:00:00.000Z' }); });
    const S = await mkPhone(label);
    await S.boot(G, 'supervisor');
    net.photoHold.add(S.label);
    await pickStub(S, 5);
    await S.page.evaluate(async () => { openEditVisit('vk1'); addEditPhoto('vk1'); await window.__picked; closeModal(); });
    const pid = await addedId(S, 'vk1', []);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + pid), 10000);
    await until(() => ((cv('vk1') || {}).photos || []).length === 1, 10000);
    await S.page.evaluate(() => localStorage.setItem('__probe_idbHang', '1')); // closed before it uploaded; at the next start IndexedDB does not answer
    net.photoHold.delete(S.label);
    await S.boot(G, 'supervisor');
    await sleep(6500); // a round waits 5 s for the store that does not answer
    return { S, pid };
  };
  const runBackup = S => S.page.evaluate(async () => {
    await openFullBackup();
    const file = (typeof _fullBackup !== 'undefined' && _fullBackup) ? JSON.parse(await _fullBackup.blob.text()) : null;
    const v = file ? UMCore.verifyBackupFile(file) : null;
    const t = sel => { const e = document.querySelector(sel); return e ? e.innerText : ''; };
    return { ready: !!document.querySelector('[data-backup-download]'), storeCard: t('[data-backup-store]'), pendingCard: t('[data-backup-pending]'),
      dataKeys: file ? Object.keys(file.data).filter(k => /^photo:/.test(k)) : [], pendKeys: file ? Object.keys(file.pending || {}) : [], ok: !!(v && v.ok) };
  });
  await phase('BKNOTREAD', 'a full backup while the photo store does not answer', async () => {
    const { S, pid } = await bkSetup('S-supervisor-bknr');
    const b = await runBackup(S);
    check('BKNOTREAD. a full backup while this phone\'s photo store does not answer says so: a photo still waiting on this phone may be missing from the file',
      b.ready && b.ok && /This phone's photo store did not answer/.test(b.storeCard), { pid, b });
    await S.page.evaluate(() => { closeModal(); localStorage.removeItem('__probe_idbHang'); });
    await S.ctx.close();
  });
  await phase('BKLATE', 'the photo store answers during the read: the photo is read and lands', async () => {
    const { S, pid } = await bkSetup('S-supervisor-bklate');
    const k = 'photo:' + pid;
    const realGet = api.get; let trig = null;
    api.get = async (who, key) => {
      const r = await realGet(who, key);
      if(who === S.label && /^snap_/.test(key)){
        if(!trig){ trig = key; S.page.evaluate(() => { window.__idbRestore(); flushOutbox(); }).catch(() => {}); }
        await sleep(400); // the daily backups are big
      }
      return r;
    };
    const b = await runBackup(S);
    api.get = realGet;
    check('BKLATE. the photo the phone read and uploaded while the backup read the cloud is in the file, among the cloud\'s documents',
      trig && b.ready && b.ok && !!cloud[k] && b.dataKeys.includes(k) && !b.pendKeys.includes(k), { trig, b, inCloud: !!cloud[k] });
    await S.page.evaluate(() => { closeModal(); localStorage.removeItem('__probe_idbHang'); });
    await S.ctx.close();
  });

  // =====================================================================
  // MEM1 — a full phone, two photos only in memory: the first lands, the second is removed offline
  // =====================================================================
  await phase('MEM1', 'two memory-only photos: one lands, the other is removed offline', async () => {
    seed([oldVisit('vm', M, 'c1', 'd1', 'MEM1 visit')]);
    const F = await mkPhone('F-Mariam-mem1', { noIDB: true, fullLS: true });
    await F.boot(M, 'rep');
    net.photoHold.add(F.label);
    await pickStub(F, 2);
    await F.page.evaluate(async () => { openEditVisit('vm'); addEditPhoto('vm'); await window.__picked; });
    const p1 = await addedId(F, 'vm', []);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + p1), 10000);
    await pickStub(F, 3);
    await F.page.evaluate(async () => { addEditPhoto('vm'); await window.__picked; });
    const p2 = await addedId(F, 'vm', [p1]);
    await until(() => heldPhotos.some(h => h.k === 'photo:' + p2), 10000);
    await until(() => ((cv('vm') || {}).photos || []).length === 2, 10000);
    await F.page.evaluate(() => { window.__toasts = []; });
    landPhoto(p1);
    await sleep(3000);
    const s1 = await F.page.evaluate(() => { const b = document.getElementById('memOnlyBar'); return { bar: b ? b.textContent : null, toasts: window.__toasts.slice() }; });
    net.down.add(F.label); await F.ctx.setOffline(true);
    await F.page.evaluate(() => { window.__toasts = []; });
    await F.page.click(`#editPhotoRow .ph-del[onclick*="'${p2}'"]`);
    await sleep(3500);
    const s2 = await F.page.evaluate(() => { const b = document.getElementById('memOnlyBar'); return { bar: b ? b.textContent : null, toasts: window.__toasts.slice(), outbox: outboxList() }; });
    check('MEM1. the first of two memory-only photos lands: it is said at once ("A photo reached the cloud"), the bar keeps the other',
      s1.toasts.some(t => /A photo reached the cloud/.test(t)) && /photo is only in the app's memory/.test(s1.bar || ''), s1);
    check('MEM1b. …then, offline, × on the second: the bar goes and nothing says "Saved — it reached the cloud"',
      !s2.bar && !s2.toasts.some(t => /reached the cloud/.test(t)) && s2.outbox.includes('visits'), s2);
    await F.ctx.close();
  });

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
