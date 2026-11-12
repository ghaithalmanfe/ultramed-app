// Visit photos with no signal (v122). saveVisit waited for every photo upload
// before the visit was added to the list or saved, and the upload
// (savePhotoBlob) had no timeout: with no signal the save never finished — no
// toast, the form stayed, and the visit was in no list, on no phone and in no
// queue. Closing the app lost it; a second tap after the 4-second guard started
// a second save, and when the signal came back both landed: two visits.
// R1–R3 reproduce that and stay as checks. The rest checks the fix: the visit
// is saved first with its photos marked "waiting to upload", each photo is
// kept on the phone (IndexedDB, else the web storage, else the app's memory —
// said) until the cloud holds it, retried by the 20-second refresh, and the
// mark is cleared once it lands; visits without photos are unchanged; Edit
// visit → add photo, the team chat and memories never hang either; and a visit
// saved while another save of the visits is on its way is kept (P10).
// Fake cloud in Node (shared by the phones, survives reloads), clock pinned to
// Mon 21 Sep 2026, the 20-second refresh driven by hand (window.__bgTick).
// Names, clinics and doctors are invented.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8270;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- fake cloud (Node: shared by every phone, survives reloads) ----
// net.down: phones with no signal — every read and write fails at once, except
// a photo write: the cloud's client keeps a write until the connection is back
// (persistence is off, so only in that page's memory) — it waits, lands when
// the signal returns if the page is still open, and is lost with the page.
// net.photoFail: photo writes from that phone are refused (a server error).
// net.lag[phone] = ms: every read from that phone answers ms later (a slow link).
const cloud = {};
const net = { down: new Set(), photoFail: new Set(), lag: {}, reads: [], writes: [] };
let held = []; // photo writes waiting for the signal: { who, k, v, res }
const busy = {}, queue = {}; // one transaction per document at a time, first come first served
const acquire = async k => { if(!busy[k]){ busy[k] = true; return true; } await new Promise(r => (queue[k] = queue[k] || []).push(r)); return true; };
const release = async k => { const next = (queue[k] || []).shift(); if(next) next(); else busy[k] = false; return true; };
const down = who => { if(net.down.has(who)) throw new Error('boom-offline'); };
const api = {
  get: async (who, k) => { down(who); net.reads.push(who + ' ' + k); if(net.lag[who]) await sleep(net.lag[who]); return k in cloud ? cloud[k] : null; },
  set: async (who, k, v) => {
    if(/^photo:/.test(k)){
      if(net.photoFail.has(who)) throw new Error('boom-photo');
      if(net.down.has(who)) return new Promise(res => held.push({ who, k, v, res }));
    } else down(who);
    net.writes.push(who + ' ' + k); cloud[k] = v; return true; },
  setMany: async (who, e) => { down(who); e.forEach(([k, v]) => { net.writes.push(who + ' ' + k); cloud[k] = v; }); return true; },
  del: async (who, k) => { down(who); delete cloud[k]; return true; },
  list: async (who, p) => { down(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
// the signal is back: what that open page's client kept goes up now
const land = who => { const mine = held.filter(h => h.who === who); held = held.filter(h => h.who !== who); mine.forEach(h => { net.writes.push(who + ' ' + h.k); cloud[h.k] = h.v; h.res(true); }); return mine.length; };
const forget = who => { held = held.filter(h => h.who !== who); }; // the page closed: what it kept is gone with it
const heldFor = (who, k) => held.filter(h => h.who === who && (!k || h.k === k)).length;
const J = k => { try{ return JSON.parse(cloud[k]); }catch(e){ return null; } };
const inCloud = note => (J('visits') || []).filter(v => v && v.notes === note);
const writesOf = (who, k) => net.writes.filter(w => w === who + ' ' + k).length;

const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,700):'')); if(!ok) failed++; }
async function phase(id, name, fn){
  results.push('— ' + id + ' ' + name);
  try{ await fn(); }catch(e){ check(id + ' ' + name + ': phase crashed', false, String(e && e.message || e).split('\n')[0].slice(0, 300)); }
}
const until = async (test, ms) => { const t0 = Date.now(); while(Date.now() - t0 < (ms || 8000)){ if(await test()) return true; await sleep(100); } return !!(await test()); };
const CLOCK = new Date('2026-09-21T10:00:00').getTime();
const M = 'Mariam', G = 'Dr. Ghaith';
function seed(extra){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Sample Harbor Dental Clinic', rep: M, cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Sample One' }] },
    { id: 'c2', name: 'Sample Willow Smile Clinic', rep: 'Renova', cls: 'B', doctors: [{ id: 'd2', name: 'Dr. Sample Two' }] },
    { id: 'c3', name: 'Sample Opal Dental Center', rep: M, cls: 'B', doctors: [{ id: 'd3', name: 'Dr. Sample Three' }] }]);
  cloud.visits = JSON.stringify((extra && extra.visits) || []); cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.erpSales = JSON.stringify({ periods: [], seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  net.down.clear(); net.photoFail.clear(); net.lag = {}; held = [];
}

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  const mkPhone = async (label, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort()); // hermetic
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|save failed|update failed|snapshot error/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript(({ clock, noIDB, fullLS }) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { await window.__cAcquire(k); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(k); } },
      };
      const off = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
      if(noIDB){ try{ Object.defineProperty(window, 'indexedDB', { get(){ return undefined; }, configurable: true }); }catch(e){} }
      if(fullLS){ const real = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(/^um_photo/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; }
      // a photo as pickImage hands it over: a full image and its thumbnail (data URLs)
      window.__shot = n => { const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = ['#c33', '#3a3', '#33c', '#cc3', '#3cc', '#c3c', '#888', '#a52'][n % 8]; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillText('photo ' + n, 4, 14); return c.toDataURL('image/jpeg', 0.8); };
        return { id: uid(), full: mk(160, 120), thumb: mk(40, 30) }; };
    }, { clock: CLOCK, noIDB: !!opts.noIDB, fullLS: !!opts.fullLS });
    const boot = async (who, role) => {
      forget(label);
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); };
        if(typeof PHOTO_UP_MS !== 'undefined') PHOTO_UP_MS = 1500; }); // a quicker give-up for the chat and memories checks (as ERP_WRITE_MS in hardening)
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); };
    return { page, ctx, boot, tick, label };
  };
  // the log-visit form, filled as a rep does; photos as pickImage hands them over
  const fill = (ph, o) => ph.page.evaluate(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId);
    document.getElementById('visitNotes').value = o.note;
    for(let i = 0; i < (o.photos || 0); i++) visitPhotos.push(window.__shot(i));
    renderVisitPhotos();
    return visitPhotos.map(p => ({ id: p.id, full: p.full, thumb: p.thumb })); }, o);
  // a tap on "Save visit" — only lands if the button is on screen
  const tap = ph => ph.page.evaluate(() => { const b = [...document.querySelectorAll('#view-log button')].find(x => (x.getAttribute('onclick') || '').trim() === 'saveVisit()');
    const on = !!(b && document.getElementById('view-log').classList.contains('active') && b.offsetParent); if(on) b.click(); return on; });
  const state = (ph, note) => ph.page.evaluate(note => {
    const mine = visits.filter(v => v.notes === note);
    const copy = (JSON.parse(localStorage.getItem('um_mirror:visits') || '[]') || []).filter(v => v.notes === note);
    return { mem: mine.length, ids: mine.map(v => v.id), photos: mine[0] && mine[0].photos ? mine[0].photos.map(p => ({ id: p.id, pending: !!p.pending, thumb: /^data:image/.test(p.thumb || '') })) : null,
      onPhone: copy.length, queued: outboxHas('visits'), view: activeView, toasts: (window.__toasts || []).slice(-4) };
  }, note);
  // IndexedDB as the app left it — read without ever creating the database (the app owns it)
  const idb = ph => ph.page.evaluate(() => new Promise(res => {
    if(!window.indexedDB) return res(null);
    let rq; try{ rq = indexedDB.open('um_photos'); }catch(e){ return res('err'); }
    rq.onupgradeneeded = () => { try{ rq.transaction.abort(); }catch(e){} };
    rq.onerror = () => res([]);
    rq.onsuccess = () => { const db = rq.result; if(!db.objectStoreNames.contains('up')){ db.close(); return res([]); }
      const g = db.transaction('up', 'readonly').objectStore('up').getAll();
      g.onsuccess = () => { res(g.result.map(r => ({ id: r.id, visitId: r.visitId || null, n: (r.data || '').length }))); db.close(); }; g.onerror = () => { db.close(); res('err'); }; };
  }));
  const lsPhotos = ph => ph.page.evaluate(() => Object.keys(localStorage).filter(k => /^um_photo/.test(k)));
  // what the visit shows: the calendar agenda, the clinic's visit history, the visit log
  const cards = (ph, clinicId) => ph.page.evaluate(id => { const out = {}; closeModal();
    switchView('calendar'); calGoToday(); out.calendar = document.getElementById('calAgenda').innerText; out.calThumbs = [...document.querySelectorAll('#calAgenda .photo-thumb')].map(i => i.getAttribute('src'));
    openClinicDetail(id); out.clinic = document.getElementById('modalInner').innerText; out.clinicThumbs = document.querySelectorAll('#modalInner .photo-thumb').length; closeModal();
    openVisitLog(); out.log = document.getElementById('modalInner').innerText; closeModal(); switchView('today'); return out; }, clinicId);
  const WAIT = /photo waiting to upload|photos waiting to upload/i;
  const pickStub = ph => ph.page.evaluate(() => { window.pickImage = (cb) => { window.__picked = Promise.resolve(cb(window.__shot(5))); }; });

  // =====================================================================
  // R — the bug, reproduced: no signal, a visit with a photo
  // =====================================================================
  seed();
  const A = await mkPhone('A-Mariam');
  let r1 = null, r1shots = null;
  await phase('R', 'no signal: the visit with a photo', async () => {
    await A.boot(M, 'rep');
    net.down.add(A.label);
    r1shots = await fill(A, { clinicId: 'c1', docId: 'd1', note: 'R1 visit with a photo', photos: 1 });
    const tapped = await tap(A);
    await sleep(1500);
    r1 = await state(A, 'R1 visit with a photo');
    check('R1. no signal: the visit with a photo is in the list, on the phone and in the upload queue at once — the save does not wait for the photo',
      tapped && r1.mem === 1 && r1.onPhone === 1 && r1.queued, r1);
    check('R1b. …the toast says the truth: saved on this phone, uploads when the signal is back; the form is gone',
      r1.view === 'today' && r1.toasts.some(t => /saved on this phone/i.test(t) && /back online/i.test(t)), { view: r1.view, toasts: r1.toasts });
    check('R1c. …and the visit carries its photo (thumbnail inline), marked as waiting to upload',
      r1.photos && r1.photos.length === 1 && r1.photos[0].pending && r1.photos[0].thumb && r1.photos[0].id === r1shots[0].id, r1.photos);
    // two refreshes while still offline: the photo write the cloud's client is keeping is not sent a second time
    await A.tick(); await A.tick();
    check('R1d. …two refreshes later, still no signal: the photo waits once (no second copy of the write piled up)', heldFor(A.label, 'photo:' + r1shots[0].id) === 1, { held: heldFor(A.label) });
    const ix = await idb(A);
    check('R1e. …the full photo is kept in IndexedDB on the phone', Array.isArray(ix) && ix.length === 1 && ix[0].id === r1shots[0].id && ix[0].n === r1shots[0].full.length, ix);
  });
  await phase('R', 'closed and reopened, still no signal', async () => {
    await A.boot(M, 'rep'); // the app closed in the field and reopened — the photo write it was keeping is gone
    const s = await state(A, 'R1 visit with a photo');
    check('R2. closed and reopened with no signal: the visit is still there, with its photo marked as waiting to upload',
      s.mem === 1 && s.onPhone === 1 && s.queued && s.photos && s.photos.length === 1 && s.photos[0].pending, s);
    const ix = await idb(A);
    check('R2b. …and the full photo is still on the phone (IndexedDB)', Array.isArray(ix) && ix.length === 1 && ix[0].n === (r1shots ? r1shots[0].full.length : -1), ix);
    const c = await cards(A, 'c1');
    check('R2c. …the visit says so wherever it shows (calendar, clinic history, visit log), the thumbnail still drawn',
      WAIT.test(c.calendar) && WAIT.test(c.clinic) && WAIT.test(c.log) && c.calThumbs.length === 1 && c.calThumbs[0] === (r1shots && r1shots[0].thumb) && c.clinicThumbs === 1, { cal: c.calendar.slice(0, 200), thumbs: c.calThumbs.length });
    const pid = r1shots[0].id; net.reads.length = 0;
    const lb = await A.page.evaluate(async id => { await showLightbox(id, 'Visit photo'); const s = document.getElementById('lbImg').getAttribute('src'); closeLightbox(null, true); return s; }, pid);
    check('R2d. …tapping the thumbnail opens the full photo from this phone, without asking the cloud', lb === r1shots[0].full && !net.reads.some(r => r.endsWith('photo:' + pid)), { same: lb === r1shots[0].full, reads: net.reads.filter(r => /photo:/.test(r)) });
  });
  await phase('P1', 'the signal is back', async () => {
    net.down.delete(A.label); land(A.label);
    await A.tick();
    const pid = r1shots[0].id;
    const ok = await until(() => { const v = inCloud('R1 visit with a photo'); return v.length === 1 && cloud['photo:' + pid] === r1shots[0].full && v[0].photos && v[0].photos.length === 1 && !v[0].photos[0].pending; });
    const v = inCloud('R1 visit with a photo');
    check('P1. signal back, next refresh: the visit reaches the cloud once, the full photo lands in its own document, and the visit no longer says "waiting"',
      ok, { visits: v.length, photo: !!cloud['photo:' + pid], photos: v[0] && v[0].photos });
    const ix = await until(async () => { const r = await idb(A); return Array.isArray(r) && r.length === 0; });
    const s = await state(A, 'R1 visit with a photo');
    const c = await cards(A, 'c1');
    check('P1b. …the phone lets go of its copy only once the cloud holds the photo and the visit says so; the screen agrees', ix && !s.queued && s.photos && !s.photos[0].pending && !WAIT.test(c.calendar) && c.calThumbs.length === 1, { s, cal: c.calendar.slice(0, 160) });
    check('P1c. …the full photo was written once after the signal came back (nothing piled up while waiting)', writesOf(A.label, 'photo:' + pid) === 1, { writes: writesOf(A.label, 'photo:' + pid) });
  });
  await phase('R', 'a second tap with no signal', async () => {
    net.down.add(A.label);
    await fill(A, { clinicId: 'c3', docId: 'd3', note: 'R3 tapped twice', photos: 1 });
    const t1 = await tap(A);
    await sleep(4500); // past the old 4-second guard
    const t2 = await tap(A);
    await sleep(300);
    net.down.delete(A.label); land(A.label);
    await A.tick(); await sleep(400); await A.tick();
    await until(() => inCloud('R3 tapped twice').length >= 1 && !(inCloud('R3 tapped twice')[0].photos || []).some(p => p.pending));
    await sleep(500);
    const s = await state(A, 'R3 tapped twice');
    const c = inCloud('R3 tapped twice');
    check('R3. no signal, a second tap after 4 seconds, then the signal comes back: ONE visit (in the cloud and on the phone), not two with different ids',
      t1 && c.length === 1 && s.mem === 1, { firstTap: t1, secondTapOnScreen: t2, cloud: c.map(v => v.id), phone: s.ids });
  });
  await phase('R', 'a second tap while a slow save is still on its way', async () => {
    await sleep(4200); // clear of the last tap, so the old 4-second guard cannot refuse the first one
    net.lag[A.label] = 2500; // every read answers 2.5 s later: the save takes well over 4 seconds
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'R3b slow cloud', photos: 1 });
    const t1 = await tap(A);
    await sleep(4500);
    const busy0 = await A.page.evaluate(() => window.__toasts.filter(t => t === 'Already saving…').length);
    const t2 = await tap(A);
    const refused = await A.page.evaluate(n => window.__toasts.filter(t => t === 'Already saving…').length > n, busy0);
    await until(async () => (await state(A, 'R3b slow cloud')).view === 'today', 40000);
    delete net.lag[A.label];
    await until(() => inCloud('R3b slow cloud').length >= 1, 15000); await sleep(800);
    const s = await state(A, 'R3b slow cloud');
    check('R3b. a slow cloud: a second tap while the first save is still on its way (4.5 s in) is refused — "Already saving…" — one visit',
      t1 && t2 && refused && inCloud('R3b slow cloud').length === 1 && s.mem === 1, { secondTapOnScreen: t2, refused, cloud: inCloud('R3b slow cloud').length, phone: s.mem });
    await until(() => !(inCloud('R3b slow cloud')[0] || { photos: [{ pending: 1 }] }).photos.some(p => p.pending), 10000);
  });

  // =====================================================================
  // P2 — online, but the photo upload is refused: the visit lands at once
  // =====================================================================
  await phase('P2', 'online, the photo upload refused', async () => {
    const S = await mkPhone('S-supervisor');
    await S.boot(G, 'supervisor');
    net.photoFail.add(A.label);
    const shots = await fill(A, { clinicId: 'c3', docId: 'd3', note: 'P2 photo refused', photos: 2 });
    await tap(A); await sleep(1500);
    const s = await state(A, 'P2 photo refused');
    const v = inCloud('P2 photo refused');
    check('P2. online, the photo upload refused: the visit is in the cloud at once with both photos marked waiting; the toast says it is saved and the photos are uploading, kept on this phone',
      v.length === 1 && v[0].photos.length === 2 && v[0].photos.every(p => p.pending && p.thumb) && s.view === 'today' && s.toasts.some(t => /Visit saved/.test(t) && /this phone/.test(t)), { photos: v[0] && v[0].photos.map(p => p.pending), toasts: s.toasts });
    await S.tick();
    const sc = await S.page.evaluate(() => { openVisitLog(); const t = document.getElementById('modalInner').innerText; closeModal(); return t; });
    check('P2b. …the supervisor\'s phone shows the visit with "2 photos waiting to upload"', /2 photos waiting to upload/i.test(sc), sc.slice(0, 300));
    await A.tick(); await sleep(600);
    const ix = await idb(A);
    check('P2c. …a refresh while it is still refused: both photos stay on the phone, the visit still says waiting', Array.isArray(ix) && ix.length === 2 && inCloud('P2 photo refused')[0].photos.every(p => p.pending), ix);
    net.photoFail.delete(A.label);
    await A.tick();
    const ok = await until(() => shots.every(p => cloud['photo:' + p.id] === p.full) && inCloud('P2 photo refused')[0].photos.every(p => !p.pending));
    check('P2d. …accepted again: the next refresh uploads both and the visit in the cloud stops saying waiting', ok, inCloud('P2 photo refused')[0].photos.map(p => p.pending));
    // the supervisor's copy is now stale (still "waiting"); he saves a visit of his own before his next refresh
    await S.page.evaluate(async () => { visits.push({ id: 'sv-own', clinicId: 'c2', rep: 'Dr. Ghaith', date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'P2 supervisor visit' }); return persist('visits'); });
    check('P2e. …a phone whose copy still says "waiting" saves the visits: the mark does not come back in the cloud', inCloud('P2 supervisor visit').length === 1 && inCloud('P2 photo refused')[0].photos.every(p => !p.pending), inCloud('P2 photo refused')[0].photos);
    await S.tick();
    const sc2 = await S.page.evaluate(() => ({ pend: visits.filter(v => v.notes === 'P2 photo refused').map(v => v.photos.map(p => !!p.pending)), log: (openVisitLog(), document.getElementById('modalInner').innerText) }));
    check('P2f. …and the supervisor\'s phone stops saying waiting after its refresh', !WAIT.test(sc2.log) && sc2.pend[0].every(x => !x), sc2.pend);
    const lb = await S.page.evaluate(async id => { await showLightbox(id, 'x'); const s = document.getElementById('lbImg').getAttribute('src'); closeLightbox(null, true); return s; }, shots[0].id);
    check('P2g. …where it opens the full photo from the cloud', lb === shots[0].full);
    await S.ctx.close();
  });

  // =====================================================================
  // P3 — no IndexedDB on this phone: the web storage keeps the photo
  // =====================================================================
  await phase('P3', 'no IndexedDB', async () => {
    const B = await mkPhone('B-Mariam-noIDB', { noIDB: true });
    await B.boot(M, 'rep');
    net.down.add(B.label);
    const shots = await fill(B, { clinicId: 'c1', docId: 'd1', note: 'P3 no indexedDB', photos: 1 });
    await tap(B); await sleep(1500);
    const s = await state(B, 'P3 no indexedDB'), ls = await lsPhotos(B);
    check('P3. no IndexedDB: the photo is kept in the phone\'s web storage, the visit queued, the toast says saved on this phone',
      s.mem === 1 && s.queued && ls.length === 1 && s.toasts.some(t => /saved on this phone/i.test(t)), { s, ls });
    await B.boot(M, 'rep');
    const s2 = await state(B, 'P3 no indexedDB'), ls2 = await lsPhotos(B);
    check('P3b. …reopened, still no signal: visit and photo both still there', s2.mem === 1 && s2.photos && s2.photos[0].pending && ls2.length === 1, { s2, ls2 });
    net.down.delete(B.label); land(B.label);
    await B.tick();
    const ok = await until(() => cloud['photo:' + shots[0].id] === shots[0].full && inCloud('P3 no indexedDB').length === 1 && !inCloud('P3 no indexedDB')[0].photos[0].pending);
    const ls3 = await until(async () => (await lsPhotos(B)).length === 0);
    check('P3c. …signal back: the photo lands, the mark goes, the web storage copy is removed', ok && ls3, { ok, ls: await lsPhotos(B) });
    await B.ctx.close();
  });

  // =====================================================================
  // P4 — a full phone: no IndexedDB and no room in the web storage
  // =====================================================================
  await phase('P4', 'a full phone', async () => {
    const F = await mkPhone('F-Mariam-full', { noIDB: true, fullLS: true });
    await F.boot(M, 'rep');
    net.down.add(F.label);
    const shots = await fill(F, { clinicId: 'c3', docId: 'd3', note: 'P4 full phone', photos: 1 });
    await tap(F); await sleep(1500);
    const s = await state(F, 'P4 full phone');
    const c = await cards(F, 'c3');
    check('P4. full phone: the visit is still saved on the phone and queued; the toast says the photo is only in the app\'s memory — keep the app open',
      s.mem === 1 && s.onPhone === 1 && s.queued && s.toasts.some(t => /only in the app's memory/.test(t)) && !s.toasts.some(t => /saved on this phone/i.test(t)), s);
    check('P4b. …and the visit says it too', /only in the app's memory/.test(c.clinic), c.clinic.slice(0, 300));
    net.down.delete(F.label); land(F.label);
    await F.tick();
    const ok = await until(() => cloud['photo:' + shots[0].id] === shots[0].full && inCloud('P4 full phone').length === 1 && !inCloud('P4 full phone')[0].photos[0].pending);
    check('P4c. …kept open until the signal is back: it uploads and the mark goes', ok, inCloud('P4 full phone')[0]);
    await F.ctx.close();
  });

  // =====================================================================
  // P5 — visits without photos: unchanged
  // =====================================================================
  await phase('P5', 'visits without photos', async () => {
    const before = writesOf(A.label, 'visits');
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'P5 online no photo' });
    await A.page.evaluate(async () => { window._lastVisitSaveAt = 0; await saveVisit(); });
    const s = await state(A, 'P5 online no photo');
    const v = inCloud('P5 online no photo');
    const msgs = await A.page.evaluate(() => SAVE_MSGS.slice());
    check('P5. online, no photo: saved as before — one write of the visits, no photos field, the usual "logged" toast',
      v.length === 1 && !('photos' in v[0]) && writesOf(A.label, 'visits') - before === 1 && msgs.includes(s.toasts[s.toasts.length - 1]), { writes: writesOf(A.label, 'visits') - before, keys: v[0] && Object.keys(v[0]), toast: s.toasts });
    net.down.add(A.label);
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'P5 offline no photo' });
    await A.page.evaluate(async () => { window._lastVisitSaveAt = 0; await saveVisit(); });
    const s2 = await state(A, 'P5 offline no photo');
    check('P5b. no signal, no photo: the same toast as before ("saved on this device") and no photos field',
      s2.mem === 1 && s2.queued && s2.photos === null && s2.toasts[s2.toasts.length - 1] === '📴 الزيارة محفوظة على هذا الجهاز — سترفع تلقائيًا عند عودة الاتصال', s2);
    net.down.delete(A.label); await A.tick();
    await until(() => inCloud('P5 offline no photo').length === 1);
  });

  // =====================================================================
  // P6 — Edit visit → add photo, no signal
  // =====================================================================
  await phase('P6', 'Edit visit → add photo', async () => {
    const vid = (inCloud('P5 online no photo')[0] || {}).id;
    await pickStub(A);
    net.down.add(A.label);
    await A.page.evaluate(id => { openEditVisit(id); addEditPhoto(id); }, vid);
    const done = await A.page.evaluate(() => Promise.race([window.__picked.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))]));
    const s = await A.page.evaluate(id => { const v = visits.find(x => x.id === id); return { photos: (v.photos || []).map(p => ({ id: p.id, pending: !!p.pending })), row: document.querySelectorAll('#editPhotoRow .photo-thumb').length, sheet: document.getElementById('modalInner').innerText, queued: outboxHas('visits'), toasts: window.__toasts.slice(-3) }; }, vid);
    check('P6. Edit visit → add photo with no signal: it finishes at once, the photo is on the visit marked waiting, the sheet shows it, the toast says added on this phone',
      done && s.photos.length === 1 && s.photos[0].pending && s.row === 1 && WAIT.test(s.sheet) && s.queued && s.toasts.some(t => /Photo added on this phone/.test(t)), s);
    net.down.delete(A.label); land(A.label);
    await A.page.evaluate(() => closeModal());
    await A.tick();
    const pid = s.photos[0] && s.photos[0].id;
    const ok = await until(() => !!cloud['photo:' + pid] && !(inCloud('P5 online no photo')[0].photos || [{ pending: 1 }])[0].pending);
    check('P6b. …signal back: the photo lands and the visit stops saying waiting', ok, inCloud('P5 online no photo')[0].photos);
  });

  // =====================================================================
  // P7 — the team chat with a photo, no signal
  // =====================================================================
  await phase('P7', 'team chat', async () => {
    await pickStub(A);
    net.down.add(A.label);
    await A.page.evaluate(() => { switchView('team'); pickChatPhoto(); document.getElementById('chatInput').value = 'P7 hello with a photo'; window.__s1 = sendChat(); setTimeout(() => { window.__s2 = sendChat(); }, 300); });
    await sleep(4000);
    const s = await A.page.evaluate(() => ({ sending: chatSending, text: document.getElementById('chatInput').value, draft: !!pendingChatPhoto, posted: chatMsgs.filter(m => m.text === 'P7 hello with a photo').length, toasts: window.__toasts.slice(-3) }));
    check('P7. chat with a photo, no signal: the send gives up within seconds (no hang), keeps the message and the photo as a draft, and says the photo did not upload',
      !s.sending && s.text === 'P7 hello with a photo' && s.draft && s.posted === 0 && s.toasts.some(t => /Photo failed to upload/.test(t)), s);
    net.down.delete(A.label); land(A.label);
    await A.page.evaluate(async () => { await sendChat(); });
    const chat = (J('chat') || []).filter(m => m.text === 'P7 hello with a photo');
    check('P7b. …signal back, sent again: one message with its photo', chat.length === 1 && !!chat[0].photoId && !!cloud['photo:' + chat[0].photoId], chat.map(m => m.id));
  });

  // =====================================================================
  // P8 — a memory with a photo, no signal
  // =====================================================================
  await phase('P8', 'memories', async () => {
    await pickStub(A);
    net.down.add(A.label);
    await A.page.evaluate(() => { pickMemoryPhoto(); document.getElementById('memCap').value = 'P8 team day'; window.__m1 = saveMemory(); setTimeout(() => { window.__m2 = saveMemory(); }, 300); });
    await sleep(4000);
    const s = await A.page.evaluate(() => ({ open: document.getElementById('modalBack').classList.contains('show'), pending: !!window._pendingMem, shared: memories.filter(m => m.cap === 'P8 team day').length, toasts: window.__toasts.slice(-3) }));
    check('P8. a memory with a photo, no signal: the share gives up within seconds, the sheet stays open with the photo, and it says the photo did not upload',
      s.open && s.pending && s.shared === 0 && s.toasts.some(t => /Photo failed to upload/.test(t)), s);
    net.down.delete(A.label); land(A.label);
    await A.page.evaluate(async () => { await saveMemory(); });
    await sleep(300);
    const mem = (J('memories') || []).filter(m => m.cap === 'P8 team day');
    check('P8b. …signal back, shared again (two taps earlier): one memory, with its photo in the cloud', mem.length === 1 && !!cloud['photo:' + mem[0].id], mem.map(m => m.id));
  });

  // =====================================================================
  // P10 — a visit saved while another save of the visits is on its way (a
  // photo's "uploaded" mark, the queue's flush): that save ended by putting
  // back the list it had read, without the new visit — whose own save then
  // found nothing to write, and still said "saved"
  // =====================================================================
  await phase('P10', 'a visit saved while another visits save is on its way', async () => {
    net.lag[A.label] = 1500; // the background save reads for 1.5 s, writes for another 1.5 s
    await A.page.evaluate(() => { const v = visits.find(x => x.notes === 'R3 tapped twice'); if(v) v.notes = 'R3 tapped twice · edited'; window.__bg = persist('visits'); }); // it has something to write, as a cleared photo mark does
    await sleep(1800); // it has read the list by now and is writing
    await fill(A, { clinicId: 'c3', docId: 'd3', note: 'P10 saved meanwhile' });
    const t = await tap(A);
    await until(async () => (await state(A, 'P10 saved meanwhile')).view === 'today', 30000);
    delete net.lag[A.label];
    await sleep(600);
    const s = await state(A, 'P10 saved meanwhile');
    const msgs = await A.page.evaluate(() => SAVE_MSGS.slice());
    check('P10. a visit saved while a background save of the visits is on its way: it stays on screen and reaches the cloud — and only then the toast says "logged"',
      t && s.mem === 1 && inCloud('P10 saved meanwhile').length === 1 && inCloud('R3 tapped twice · edited').length === 1 && msgs.includes(s.toasts[s.toasts.length - 1]), { tapped: t, phone: s.mem, cloud: inCloud('P10 saved meanwhile').length, edit: inCloud('R3 tapped twice · edited').length, toast: s.toasts.slice(-1) });
  });

  // =====================================================================
  // P9 — Arabic for every new message
  // =====================================================================
  await phase('P9', 'Arabic', async () => {
    const strs = ['✅ Visit saved — its photos upload in the background and stay on this phone until they do',
      '📴 Visit and its photos saved on this phone — they upload automatically when back online',
      "⚠️ This phone's storage is full — the photo is only in the app's memory: keep the app open until it uploads",
      '📸 Photo added — it uploads in the background and stays on this phone until it does',
      '📴 Photo added on this phone — it uploads automatically when back online',
      '⏳ Photo waiting to upload', '⏳ 2 photos waiting to upload', '⏳ 12 photos waiting to upload',
      '⏳ Photo waiting to upload · kept on this phone', "⚠️ Photo waiting to upload · only in the app's memory — keep the app open"];
    const out = await A.page.evaluate(strs => strs.map(s => [s, window.UMI18N ? UMI18N.tr(s) : null]), strs);
    const bad = out.filter(([, a]) => !a || !/[؀-ۿ]/.test(a));
    check('P9. every new message and note has its Arabic (counts by pattern)', bad.length === 0, bad.length ? bad : out.map(x => x[1]));
  });

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
