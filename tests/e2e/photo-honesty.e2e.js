// Visit photos that wait to upload: what the screens say about them (v122).
// A visit is saved first and each full photo is kept on the phone that took it
// until the cloud holds it (visit-photo-offline.e2e.js). Each check below was
// first seen failing as the bug the reviewers confirmed, then fixed — except
// the controls (G0, G5, T2, K2, K3, E3, R1b, R4), which guard what must stay:
//   G  the Visit photos gallery and the lightbox on another phone: a photo still
//      waiting (or lost before it uploaded) is marked, the gallery no longer
//      promises "full size", and a tap shows its thumbnail enlarged with what
//      it is — never an empty frame; the full photo as soon as the cloud has it,
//      even while the visit still says waiting (a late mark); unchanged for a
//      photo that uploaded
//   W  "kept on this phone" only for the photos this phone holds, counted
//   B  a full phone: the red bar stays while a photo is only in the app's
//      memory, says so, and says "Saved" only once it has landed
//   T  the queue's "uploaded & merged" toast names the photos still waiting
//   K  the supervisor's full backup keeps the photos waiting on his phone, apart
//   E  Edit visit → add photo on a full phone with no signal: its own true
//      message (English, with Arabic), not the new visit's "not saved"
//   R  Edit visit: a save that settles late never repaints another visit's
//      sheet; a photo removed while its add is saving is never kept or sent,
//      and the toast says so
//   I  Arabic for every new message
// Fake cloud in Node (shared by the phones, survives reloads), clock pinned to
// Mon 21 Sep 2026, the 20-second refresh driven by hand (window.__bgTick).
// Names, clinics and doctors are invented. Port 8273.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8273;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- fake cloud (Node: shared by every phone, survives reloads) ----
// net.down: that phone has no signal — every read and write fails at once,
// except a photo write: the cloud's client keeps it until the connection is
// back (only in that page's memory) — it lands with land(), or is lost with
// the page. net.photoHold: a weak link — that phone's photo writes wait the
// same way while everything else goes through (the small visit lands first).
// net.lag[phone] = ms: every read from that phone answers ms later.
const cloud = {};
const net = { down: new Set(), photoFail: new Set(), photoHold: new Set(), lag: {}, reads: [], writes: [] };
let held = []; // photo writes waiting: { who, k, v, res }
const busy = {}, queue = {}; // one transaction per document at a time, first come first served
const acquire = async k => { if(!busy[k]){ busy[k] = true; return true; } await new Promise(r => (queue[k] = queue[k] || []).push(r)); return true; };
const release = async k => { const next = (queue[k] || []).shift(); if(next) next(); else busy[k] = false; return true; };
const down = who => { if(net.down.has(who)) throw new Error('boom-offline'); };
const api = {
  get: async (who, k) => { down(who); net.reads.push(who + ' ' + k); if(net.lag[who]) await sleep(net.lag[who]); return k in cloud ? cloud[k] : null; },
  set: async (who, k, v) => {
    if(/^photo:/.test(k)){
      if(net.photoFail.has(who)) throw new Error('boom-photo');
      if(net.down.has(who) || net.photoHold.has(who)) return new Promise(res => held.push({ who, k, v, res }));
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
const cloudVisit = id => (J('visits') || []).find(v => v && v.id === id) || null;

const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info).slice(0,900):'')); if(!ok) failed++; }
async function phase(id, name, fn){
  results.push('— ' + id + ' ' + name);
  try{ await fn(); }catch(e){ check(id + ' ' + name + ': phase crashed', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
}
const until = async (test, ms) => { const t0 = Date.now(); while(Date.now() - t0 < (ms || 8000)){ if(await test()) return true; await sleep(100); } return !!(await test()); };
const CLOCK = new Date('2026-09-21T10:00:00').getTime();
const M = 'Mariam', G = 'Dr. Ghaith';
const visitRec = (id, clinicId, docId, notes, extra) => Object.assign({ id, clinicId, rep: M, withRep: null, date: '2026-09-21', ts: CLOCK - 3600000, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorId: docId, doctorIds: [docId], notes }, extra || {});
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
  net.down.clear(); net.photoFail.clear(); net.photoHold.clear(); net.lag = {}; net.reads.length = 0; net.writes.length = 0; held = [];
  Object.keys(busy).forEach(k => delete busy[k]); Object.keys(queue).forEach(k => delete queue[k]); // a phone closed mid-transaction holds no lock into the next phase
}

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  // opts: noIDB (no IndexedDB), fullRe (web-storage keys refused as if the quota were reached)
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
    await page.addInitScript(({ clock, noIDB, fullRe }) => {
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
      if(fullRe){ const re = new RegExp(fullRe), real = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(re.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; }
      // a photo as pickImage hands it over: a full image and its thumbnail (data URLs)
      window.__shot = n => { const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = ['#c33', '#3a3', '#33c', '#cc3', '#3cc', '#c3c', '#888', '#a52'][n % 8]; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillText('photo ' + n, 4, 14); return c.toDataURL('image/jpeg', 0.8); };
        return { id: uid(), full: mk(160, 120), thumb: mk(40, 30) }; };
    }, { clock: CLOCK, noIDB: !!opts.noIDB, fullRe: opts.fullRe || null });
    const boot = async (who, role) => {
      forget(label);
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); };
        const lb = showLightbox; window.showLightbox = (...a) => (window.__lbP = lb(...a)); }); // a tap's lightbox, awaited by the checks
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); };
    // closed only once nothing is on its way (no save, no flush, no photo write held for it)
    const close = async () => { forget(label); await page.waitForFunction(() => !_flushing && _localSaving === 0, null, { timeout: 30000 }).catch(() => {}); await sleep(200); await ctx.close(); };
    return { page, ctx, boot, tick, close, label };
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
  const onToday = ph => until(async () => (await ph.page.evaluate(() => activeView)) === 'today', 30000);
  // the camera as pickImage hands a photo over: a new photo on every tap
  const pickStub = ph => ph.page.evaluate(() => { let n = 10; window.pickImage = (cb) => { window.__picked = Promise.resolve(cb(window.__shot(++n))); }; });
  // IndexedDB as the app left it — read without ever creating the database (the app owns it)
  const idb = ph => ph.page.evaluate(() => new Promise(res => {
    if(!window.indexedDB) return res([]);
    let rq; try{ rq = indexedDB.open('um_photos'); }catch(e){ return res([]); }
    rq.onupgradeneeded = () => { try{ rq.transaction.abort(); }catch(e){} };
    rq.onerror = () => res([]);
    rq.onsuccess = () => { const db = rq.result; if(!db.objectStoreNames.contains('up')){ db.close(); return res([]); }
      const g = db.transaction('up', 'readonly').objectStore('up').getAll();
      g.onsuccess = () => { res(g.result.map(r => ({ id: r.id }))); db.close(); }; g.onerror = () => { db.close(); res([]); }; };
  }));
  const WAIT = /photo waiting to upload|photos waiting to upload/i;
  // Today → My visit log → "Photo gallery" (real taps): what the sheet says, and which tiles are marked
  const gallery = async ph => {
    await ph.page.evaluate(() => { closeModal(); switchView('today'); openVisitLog(); });
    await ph.page.click('#modalInner button:has-text("Photo gallery")');
    await sleep(150);
    return ph.page.evaluate(() => ({ text: document.getElementById('modalInner').innerText,
      marked: [...document.querySelectorAll('#modalInner [data-photo-state] img')].map(i => ((i.getAttribute('onclick') || '').match(/showLightbox\('([^']+)'/) || [])[1]) }));
  };
  // a real tap on a thumbnail, then what the lightbox shows once it has looked everywhere
  const tapThumb = async (ph, sel) => {
    await ph.page.click(sel);
    const lb = await ph.page.evaluate(async () => {
      try{ await window.__lbP; }catch(e){}
      const img = document.getElementById('lbImg'), note = document.getElementById('lbNote');
      if(img.getAttribute('src')) await img.decode().catch(() => {});
      const r = img.getBoundingClientRect();
      return { shown: document.getElementById('lightbox').classList.contains('show'), src: img.getAttribute('src') || '', natW: img.naturalWidth, boxW: Math.round(r.width),
        note: note && note.style.display !== 'none' ? note.textContent : '' };
    });
    await ph.page.evaluate(() => closeLightbox(null, true));
    return lb;
  };
  const short = lb => Object.assign({}, lb, { src: (lb.src || '').slice(0, 40) });
  const logText = ph => ph.page.evaluate(() => { closeModal(); openVisitLog(); const t = document.getElementById('modalInner').innerText; closeModal(); return t; });
  const waitLine = t => ((t || '').match(/[^\n]*(?:photo|photos) waiting to upload[^\n]*/i) || [''])[0];
  const sheetNote = ph => ph.page.evaluate(() => { const w = document.getElementById('editPhotoWait'); return w ? w.innerText : ''; });
  const barState = (ph, pid) => ph.page.evaluate(pid => { const b = document.getElementById('memOnlyBar'), rec = _photoKept.get(pid);
    return { bar: b ? b.textContent : null, kept: rec ? rec.on : null, memOnly: [..._memOnly], toasts: (window.__toasts || []).slice() }; }, pid);

  // =====================================================================
  // G — the gallery and the lightbox on the supervisor's phone
  // =====================================================================
  await phase('G', 'Visit photos gallery and lightbox, another phone', async () => {
    seed();
    const A = await mkPhone('G-A-Mariam'), S = await mkPhone('G-S-Ghaith');
    await A.boot(M, 'rep'); await S.boot(G, 'supervisor');
    // control: a photo that uploads as it always did
    const g0 = await fill(A, { clinicId: 'c1', docId: 'd1', note: 'G0 photo that uploaded', photos: 1 });
    await tap(A); await onToday(A);
    await until(() => { const v = inCloud('G0 photo that uploaded'); return v.length === 1 && cloud['photo:' + g0[0].id] === g0[0].full && !v[0].photos[0].pending; });
    await S.tick();
    const gal0 = await gallery(S);
    check('G0. control — only a photo that uploaded: the gallery is exactly as before ("1 photo across 1 visit. Tap any photo to view it full size.", no note, no mark)',
      /1 photo across 1 visit\. Tap any photo to view it full size\./.test(gal0.text) && !WAIT.test(gal0.text) && !/lost/i.test(gal0.text) && gal0.marked.length === 0, gal0);
    const lb0 = await tapThumb(S, `#modalInner img[onclick*="${g0[0].id}"]`);
    check('G0b. …a tap opens the full photo, with no note', lb0.shown && lb0.src === g0[0].full && !lb0.note, short(lb0));
    // a photo still waiting on Mariam's phone (a weak link: the visit has landed, the photo not yet)
    net.photoHold.add(A.label);
    const g1 = await fill(A, { clinicId: 'c3', docId: 'd3', note: 'G1 photo waiting on her phone', photos: 1 });
    await tap(A); await onToday(A);
    await until(() => { const v = inCloud('G1 photo waiting on her phone'); return v.length === 1 && v[0].photos && v[0].photos[0].pending; });
    // and a photo another phone marked as lost before it uploaded — only its thumbnail exists
    const lostThumb = await A.page.evaluate(() => window.__shot(6).thumb);
    const vs = J('visits'); vs.push(visitRec('vlost', 'c1', 'd1', 'G2 photo lost before it uploaded', { photos: [{ id: 'plost1', thumb: lostThumb, lost: true }] })); cloud.visits = JSON.stringify(vs);
    await S.tick();
    const gal = await gallery(S);
    check('G1. the gallery on the supervisor\'s phone marks the photo still waiting on Mariam\'s phone and the one lost before it uploaded, says so, and no longer promises "full size" for every photo',
      WAIT.test(gal.text) && /Photo lost before it uploaded/.test(gal.text) && !/view it full size/.test(gal.text) && gal.marked.includes(g1[0].id) && gal.marked.includes('plost1') && !gal.marked.includes(g0[0].id), gal);
    const asked0 = net.reads.filter(r => r === S.label + ' photo:' + g1[0].id).length;
    const lb1 = await tapThumb(S, `#modalInner img[onclick*="${g1[0].id}"]`);
    const asked = net.reads.filter(r => r === S.label + ' photo:' + g1[0].id).length > asked0;
    check('G2. a tap on the waiting photo (the cloud is asked first — none yet): its thumbnail enlarged, with a plain note that the full photo is still waiting to upload from the phone that took it — never an empty frame',
      asked && lb1.shown && lb1.src === g1[0].thumb && lb1.boxW >= 200 && /still waiting to upload from the phone that took it/.test(lb1.note), Object.assign({ asked }, short(lb1)));
    const lb2 = await tapThumb(S, '#modalInner img[onclick*="plost1"]');
    check('G3. a tap on the lost photo: its thumbnail enlarged, with "Photo lost before it uploaded — only this small preview is kept"',
      lb2.shown && lb2.src === lostThumb && lb2.boxW >= 200 && /Photo lost before it uploaded — only this small preview is kept/.test(lb2.note), short(lb2));
    await S.page.evaluate(() => { closeModal(); openVisitLog(); });
    const log = await S.page.evaluate(() => document.getElementById('modalInner').innerText);
    check('G4. the visit log says both too: waiting, and lost', WAIT.test(log) && /Photo lost before it uploaded — only this small preview is kept/.test(log), log.slice(0, 500));
    const lb3 = await tapThumb(S, `#modalInner .photo-thumb[onclick*="${g1[0].id}"]`);
    check('G4b. …and its thumbnail there opens the same enlarged preview with the note', lb3.src === g1[0].thumb && /still waiting to upload/.test(lb3.note), short(lb3));
    // the photo lands; the supervisor's phone has not refreshed: its copy still says waiting (a late mark)
    net.photoHold.delete(A.label); land(A.label);
    await until(() => cloud['photo:' + g1[0].id] === g1[0].full);
    const stale = await S.page.evaluate(id => visits.some(v => (v.photos || []).some(p => p.id === id && p.pending)), g1[0].id);
    const lb4 = await tapThumb(S, `#modalInner .photo-thumb[onclick*="${g1[0].id}"]`);
    check('G5. a late mark (his copy still says waiting, the cloud already has the photo): a tap opens the full photo, and the note of the tap before is gone',
      stale && lb4.src === g1[0].full && !lb4.note, Object.assign({ stale }, short(lb4)));
    await until(() => { const v = inCloud('G1 photo waiting on her phone'); return v.length === 1 && !v[0].photos[0].pending; });
    await S.tick();
    const gal2 = await gallery(S);
    check('G6. once it has landed and his phone refreshed: that photo is no longer marked; the lost one still is', !gal2.marked.includes(g1[0].id) && gal2.marked.includes('plost1') && !WAIT.test(gal2.text), gal2);
    await A.close(); await S.close();
  });

  // =====================================================================
  // W — "kept on this phone": only for the photos this phone holds
  // =====================================================================
  await phase('W', 'kept on this phone, counted', async () => {
    seed();
    const A = await mkPhone('W-A-Mariam'), S = await mkPhone('W-S-Ghaith');
    await A.boot(M, 'rep'); await S.boot(G, 'supervisor');
    net.photoHold.add(A.label);
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'W1 photos on two phones', photos: 1 });
    await tap(A); await onToday(A);
    await until(() => inCloud('W1 photos on two phones').length === 1);
    const vid = inCloud('W1 photos on two phones')[0].id;
    await S.tick();
    await pickStub(S); net.photoHold.add(S.label);
    await S.page.evaluate(id => { openEditVisit(id); addEditPhoto(id); return window.__picked; }, vid);
    const sw = await sheetNote(S);
    check('W1. the supervisor adds a second photo in Edit visit (his upload waiting too): his sheet says 2 waiting, 1 of them kept on this phone — not both',
      /^⏳ 2 photos waiting to upload · 1 kept on this phone$/.test(sw.trim()), sw);
    const slog = waitLine(await logText(S));
    check('W1b. …and his visit log the same', /2 photos waiting to upload · 1 kept on this phone$/.test(slog.trim()), slog);
    await A.tick();
    const alog = waitLine(await logText(A));
    check('W2. Mariam\'s phone after its refresh: 2 waiting, 1 kept on this phone', /2 photos waiting to upload · 1 kept on this phone$/.test(alog.trim()), alog);
    // one phone: while its own Edit visit → add photo is still saving, the new photo is kept nowhere yet
    await pickStub(A); net.lag[A.label] = 2500;
    await A.page.evaluate(id => { openEditVisit(id); addEditPhoto(id); }, vid);
    await sleep(900);
    const mid = await sheetNote(A);
    const kept0 = await A.page.evaluate(() => _photoKept.size);
    check('W3. one phone, its add still saving (the new photo not kept yet): 3 waiting, 1 kept on this phone', kept0 === 1 && /^⏳ 3 photos waiting to upload · 1 kept on this phone$/.test(mid.trim()), { mid, kept: kept0 });
    await A.page.evaluate(() => window.__picked); delete net.lag[A.label];
    const after = await sheetNote(A);
    check('W3b. …once it is kept: 3 waiting, 2 kept on this phone', /^⏳ 3 photos waiting to upload · 2 kept on this phone$/.test(after.trim()), after);
    net.photoHold.clear(); land(A.label); land(S.label);
    await A.close(); await S.close();
  });

  // =====================================================================
  // B — a full phone: the red bar and a photo kept only in the app's memory
  // =====================================================================
  await phase('B', 'full phone: the red bar until the photo has landed', async () => {
    seed();
    const F = await mkPhone('B-F-Mariam-full', { noIDB: true, fullRe: '^(um_photo|um_mirror:visits$|um_outbox$)' });
    await F.boot(M, 'rep');
    net.down.add(F.label);
    const b1 = await fill(F, { clinicId: 'c3', docId: 'd3', note: 'B1 full phone', photos: 1 });
    const pid = b1[0].id;
    await tap(F); await onToday(F); await sleep(300);
    const s1 = await barState(F, pid);
    check('B1. full phone, no signal: the red bar says the visit and its photo are only in the app\'s memory', s1.kept === 'mem' && !!s1.bar && /this visit/.test(s1.bar) && /photo/i.test(s1.bar), s1);
    await F.page.evaluate(() => { window.__toasts = []; });
    net.down.delete(F.label); // the signal is back; the photo's write (kept by the cloud's client) has not landed yet
    await F.tick(); await sleep(500);
    const s2 = await barState(F, pid);
    check('B2. signal back, the visit reaches the cloud before the photo: the red bar stays and says a photo is still only in the app\'s memory — no "Saved" yet',
      inCloud('B1 full phone').length === 1 && heldFor(F.label, 'photo:' + pid) === 1 && !!s2.bar && /photo is only in the app's memory/.test(s2.bar) && /until it says Saved/.test(s2.bar) && !s2.toasts.some(t => /Saved — it reached the cloud/.test(t)), s2);
    await F.page.evaluate(() => { window.__toasts = []; });
    land(F.label);
    const gone = await until(async () => !(await barState(F, pid)).bar, 8000);
    const s3 = await barState(F, pid);
    check('B3. the photo lands: the bar goes, and only now "✅ Saved — it reached the cloud"', gone && s3.toasts.some(t => /^✅ Saved — it reached the cloud/.test(t)) && cloud['photo:' + pid] === b1[0].full, s3);
    await F.close();
    // only the photo is too big for this phone (the visit fits): no red bar before — the photo was only in memory and nothing on screen stayed
    seed();
    const P = await mkPhone('B-P-Mariam-photo-only', { noIDB: true, fullRe: '^um_photo' });
    await P.boot(M, 'rep');
    net.down.add(P.label);
    const b4 = await fill(P, { clinicId: 'c1', docId: 'd1', note: 'B4 photo only in memory', photos: 1 });
    await tap(P); await onToday(P); await sleep(300);
    const t1 = await barState(P, b4[0].id);
    check('B4. the visit fits on the phone, its photo does not (no IndexedDB, no room): a red bar says the photo is only in the app\'s memory', t1.kept === 'mem' && t1.memOnly.length === 0 && !!t1.bar && /photo is only in the app's memory/.test(t1.bar), t1);
    await P.page.evaluate(() => { window.__toasts = []; });
    net.down.delete(P.label);
    await P.tick(); await sleep(500);
    const t2 = await barState(P, b4[0].id);
    check('B4b. signal back, the queue sent, the photo still on its way: the bar stays, and the queue\'s toast names the photo still waiting',
      inCloud('B4 photo only in memory').length === 1 && !!t2.bar && t2.toasts.some(t => /Offline changes uploaded & merged/.test(t) && /1 photo still waiting to upload/.test(t)), t2);
    await P.page.evaluate(() => { window.__toasts = []; });
    land(P.label);
    const gone4 = await until(async () => !(await barState(P, b4[0].id)).bar, 8000);
    const t3 = await barState(P, b4[0].id);
    check('B4c. it lands: the bar goes, "✅ Saved — it reached the cloud"', gone4 && t3.toasts.some(t => /^✅ Saved — it reached the cloud/.test(t)), t3);
    await P.close();
  });

  // =====================================================================
  // T — the queue's "uploaded & merged" toast while a photo is still on its way
  // =====================================================================
  await phase('T', 'the flush toast', async () => {
    seed();
    const A = await mkPhone('T-A-Mariam');
    await A.boot(M, 'rep');
    net.down.add(A.label);
    const t1 = await fill(A, { clinicId: 'c1', docId: 'd1', note: 'T1 offline with a photo', photos: 1 });
    await tap(A); await onToday(A);
    await A.page.evaluate(() => { window.__toasts = []; });
    net.down.delete(A.label); // signal back; the photo write the cloud's client keeps has not landed yet (a slow upload)
    await A.tick();
    await until(() => inCloud('T1 offline with a photo').length === 1); await sleep(300);
    const toasts = await A.page.evaluate(() => window.__toasts.slice());
    check('T1. signal back: the queue\'s toast says the changes are uploaded and that 1 photo is still waiting to upload (it is not in the cloud yet) — never a plain "uploaded"',
      !cloud['photo:' + t1[0].id] && toasts.some(t => /Offline changes uploaded & merged/.test(t) && /1 photo still waiting to upload/.test(t)) && !toasts.includes('✅ Offline changes uploaded & merged'), toasts);
    land(A.label);
    await until(async () => { const v = inCloud('T1 offline with a photo'); return v[0] && !v[0].photos[0].pending && (await idb(A)).length === 0; });
    net.down.add(A.label);
    await fill(A, { clinicId: 'c3', docId: 'd3', note: 'T2 offline, no photo' });
    await tap(A); await onToday(A);
    await A.page.evaluate(() => { window.__toasts = []; });
    net.down.delete(A.label);
    await A.tick();
    await until(() => inCloud('T2 offline, no photo').length === 1); await sleep(300);
    const toasts2 = await A.page.evaluate(() => window.__toasts.slice());
    check('T2. control — nothing waiting: exactly "✅ Offline changes uploaded & merged", as before', toasts2.includes('✅ Offline changes uploaded & merged') && !toasts2.some(t => /still waiting/.test(t)), toasts2);
    await A.close();
  });

  // =====================================================================
  // K — the full backup on the supervisor's phone
  // =====================================================================
  await phase('K', 'full backup', async () => {
    seed({ visits: [visitRec('vk1', 'c1', 'd1', 'K1 visit')] });
    const S = await mkPhone('K-S-Ghaith');
    await S.boot(G, 'supervisor');
    await pickStub(S); net.photoHold.add(S.label);
    await S.page.evaluate(() => { openEditVisit('vk1'); addEditPhoto('vk1'); return window.__picked; });
    const ph = await S.page.evaluate(() => { const v = visits.find(x => x.id === 'vk1'); const p = v.photos[v.photos.length - 1]; const r = _photoKept.get(p.id); return { id: p.id, full: r && r.data, on: r && r.on }; });
    const backup = () => S.page.evaluate(async () => {
      closeModal(); await openFullBackup();
      const pend = document.querySelector('[data-backup-pending]');
      const file = (typeof _fullBackup !== 'undefined' && _fullBackup) ? JSON.parse(await _fullBackup.blob.text()) : null;
      const v = file ? UMCore.verifyBackupFile(file) : null;
      return { ready: !!document.querySelector('[data-backup-download]'), pending: pend ? pend.innerText : '', file, ok: !!(v && v.ok), problems: v ? v.problems : null };
    });
    const k = 'photo:' + ph.id;
    const b1 = await backup();
    check('K1. the full backup while the photo he added waits on his phone: the screen lists it among this phone\'s changes the cloud does not have yet, and the file keeps its full copy apart (verified intact)',
      ph.on === 'idb' && heldFor(S.label, k) === 1 && b1.ready && b1.pending.includes(k) && b1.file && b1.file.pending[k] && b1.file.pending[k].value === ph.full && !b1.file.data[k] && b1.ok,
      { on: ph.on, ready: b1.ready, pending: b1.pending, keys: b1.file && Object.keys(b1.file.pending), problems: b1.problems });
    cloud[k] = ph.full; // the read finds it in the cloud (the production client's reads include its own write on its way)
    const b2 = await backup();
    check('K2. when the read finds it in the cloud: the file holds it once, with the cloud\'s documents, and it is not listed as waiting',
      b2.ready && b2.file.data[k] && b2.file.data[k].value === ph.full && !b2.file.pending[k] && !b2.pending.includes(k) && b2.ok, { pending: b2.pending, data: !!(b2.file && b2.file.data[k]) });
    delete cloud[k];
    net.photoHold.delete(S.label); land(S.label);
    await until(async () => { const v = cloudVisit('vk1'); return v && v.photos && !v.photos[0].pending && (await idb(S)).length === 0; });
    const b3 = await backup();
    check('K3. once it has landed: the next backup holds it with the cloud\'s documents and lists nothing waiting', b3.ready && b3.file.data[k] && !b3.file.pending[k] && !b3.pending && b3.ok, { pending: b3.pending });
    await S.close();
  });

  // =====================================================================
  // E — Edit visit → add photo on a full phone with no signal
  // =====================================================================
  await phase('E', 'Edit visit → add photo, full phone, no signal', async () => {
    const NOT_SAVED = '⚠️ لم تُحفظ الزيارة على السحابة ولا على الجهاز (الذاكرة ممتلئة) — أبقِ التطبيق مفتوحًا حتى يعود الاتصال';
    for(const [id, label, opts] of [['E1', 'E-F-Mariam-full', { fullRe: '^(um_mirror:visits$|um_outbox$)' }], ['E2', 'E-F2-Mariam-full-noIDB', { noIDB: true, fullRe: '^(um_photo|um_mirror:visits$|um_outbox$)' }]]){
      seed({ visits: [visitRec('vE1', 'c1', 'd1', 'E visit saved this morning')] });
      const F = await mkPhone(label, opts);
      await F.boot(M, 'rep');
      await pickStub(F); net.down.add(F.label);
      await F.page.evaluate(() => { openEditVisit('vE1'); addEditPhoto('vE1'); });
      const done = await F.page.evaluate(() => Promise.race([window.__picked.then(() => true), new Promise(r => setTimeout(() => r(false), 25000))]));
      const e = await F.page.evaluate(() => ({ toast: window.__toasts.slice(-1)[0] || '', lang: uiLang, kept: [..._photoKept.values()].map(r => r.on), memOnly: [..._memOnly] }));
      const ar = await F.page.evaluate(t => window.UMI18N ? UMI18N.tr(t) : null, e.toast);
      check(id + '. Edit visit → add photo, no signal, storage full (the visit is in the cloud since this morning; photo kept: ' + (e.kept[0] || '?') + '): the toast is the photo\'s own message, in English — added only in the app\'s memory — not the new visit\'s Arabic "not saved"',
        done && e.lang === 'en' && e.memOnly.includes('visits') && !/[؀-ۿ]/.test(e.toast) && /photo was added only in the app's memory/.test(e.toast) && cloudVisit('vE1') !== null, e);
      check(id + 'b. …and its Arabic says the same thing (never "the visit was not saved")', !!ar && /[؀-ۿ]/.test(ar) && !/لم تُحفظ الزيارة/.test(ar) && !/[A-Za-z]{2,}/.test(ar), ar);
      if(id === 'E1'){
        await F.page.evaluate(() => { window.__toasts = []; });
        await fill(F, { clinicId: 'c1', docId: 'd1', note: 'E3 new visit, no photo' });
        await tap(F); await onToday(F);
        const t = await F.page.evaluate(() => window.__toasts.slice(-1)[0]);
        check('E3. control — a NEW visit with no photo on the same full phone: the message it always had', t === NOT_SAVED, t);
      }
      await F.close();
    }
  });

  // =====================================================================
  // R — Edit visit: a late repaint, and a photo removed while its add saves
  // =====================================================================
  await phase('R', 'Edit visit: late repaint, removed while saving', async () => {
    seed({ visits: [visitRec('vx', 'c1', 'd1', 'X visit at Harbor'), visitRec('vy', 'c3', 'd3', 'Y visit at Opal')] });
    const A = await mkPhone('R-A-Mariam');
    await A.boot(M, 'rep');
    await A.page.evaluate(async () => { const s = window.__shot(3); const v = visits.find(x => x.id === 'vy'); v.photos = [{ id: 'py', thumb: s.thumb }]; await window.storage.set('photo:py', s.full); await persist('visits'); });
    await pickStub(A);
    const sheet = () => A.page.evaluate(() => { const row = document.getElementById('editPhotoRow'), sub = document.querySelector('#modalInner h3 + p');
      return { clinic: sub && sub.innerText, rowVisit: row ? (row.dataset.visit || null) : 'no row',
        thumbs: row ? [...row.querySelectorAll('.photo-thumb')].map(i => ((i.getAttribute('onclick') || '').match(/showLightbox\('([^']+)'/) || [])[1]) : [],
        add: row && row.querySelector('.photo-add') ? row.querySelector('.photo-add').getAttribute('onclick') : null,
        dels: row ? [...row.querySelectorAll('.ph-del')].map(b => b.getAttribute('onclick')) : [] }; });
    const openEdit = async id => { await A.page.evaluate(() => { closeModal(); openVisitLog(); }); await A.page.click(`#modalInner button[onclick*="openEditVisit('${id}')"]`); };
    // R1: Edit X → ADD on a slow link; she moves on to Edit Y before that save settles
    net.lag[A.label] = 2500;
    await openEdit('vx');
    await A.page.click('#editPhotoRow .photo-add');
    await sleep(300);
    await openEdit('vy');
    const y0 = await sheet();
    await A.page.evaluate(() => window.__picked);
    const y1 = await sheet();
    check('R1. Edit X → ADD on a slow link, then Edit Y before it settles: when it settles, Y\'s sheet still shows Y\'s photo, and ADD and × still act on Y',
      y0.rowVisit === 'vy' && y1.rowVisit === 'vy' && JSON.stringify(y1.thumbs) === '["py"]' && y1.add === "addEditPhoto('vy')" && y1.dels.length === 1 && y1.dels.every(d => /'vy'/.test(d)), { y0, y1 });
    delete net.lag[A.label];
    await until(() => { const v = cloudVisit('vx'); return v && v.photos && v.photos.length === 1 && !v.photos[0].pending; }, 10000);
    const cvx = cloudVisit('vx'), xPh = cvx && cvx.photos && cvx.photos[0] && cvx.photos[0].id;
    check('R1b. …and X\'s photo landed on X', !!xPh, cvx);
    // R2: × on X's photo on a slow link, then Edit Y before that save settles
    net.lag[A.label] = 2500;
    await openEdit('vx');
    await A.page.click(`#editPhotoRow .ph-del[onclick*="'${xPh}'"]`);
    await sleep(300);
    await openEdit('vy');
    await until(() => { const v = cloudVisit('vx'); return v && (v.photos || []).length === 0; }, 20000);
    await A.page.waitForFunction(() => _localSaving === 0, null, { timeout: 20000 }); await sleep(200);
    const y2 = await sheet();
    check('R2. Edit X → × on a slow link, then Edit Y: when the removal\'s save settles, Y\'s sheet is still Y\'s', y2.rowVisit === 'vy' && JSON.stringify(y2.thumbs) === '["py"]' && y2.add === "addEditPhoto('vy')", y2);
    // R3: ADD on Y (its sheet opened afresh), then × on that new photo while its add is still saving
    delete net.lag[A.label];
    await openEdit('vy');
    net.lag[A.label] = 2000;
    await A.page.click('#editPhotoRow .photo-add');
    await sleep(250);
    const nid = await A.page.evaluate(() => { const v = visits.find(x => x.id === 'vy'); return v.photos[v.photos.length - 1].id; });
    await A.page.evaluate(() => { window.__toasts = []; });
    await A.page.click(`#editPhotoRow .ph-del[onclick*="'${nid}'"]`);
    await sleep(200);
    const r0 = await sheet();
    check('R3c. × on a photo whose add is still saving: it leaves the sheet at once', nid !== 'py' && !r0.thumbs.includes(nid) && r0.thumbs.includes('py'), { nid, r0 });
    await A.page.evaluate(() => window.__picked);
    delete net.lag[A.label];
    await A.page.waitForFunction(() => _localSaving === 0, null, { timeout: 20000 }); await sleep(2500);
    const r1 = await A.page.evaluate(id => ({ kept: _photoKept.has(id), onVisit: visits.some(v => (v.photos || []).some(p => p.id === id)), toasts: window.__toasts.slice() }), nid);
    const ix = await idb(A);
    const cy = cloudVisit('vy');
    check('R3. a photo removed while its add was still saving is never kept on the phone and never sent to the cloud',
      !r1.kept && !r1.onVisit && !ix.some(r => r.id === nid) && !net.writes.includes(A.label + ' photo:' + nid) && !(('photo:' + nid) in cloud) && cy && !(cy.photos || []).some(p => p.id === nid), { r1, ix, writes: net.writes.filter(w => /photo:/.test(w)), cloudPhotos: cy && cy.photos.map(p => p.id) });
    check('R3b. …and the toast does not say "Photo added": it says the photo was removed', !r1.toasts.some(t => /Photo added/.test(t)) && r1.toasts.includes('Photo removed'), r1.toasts);
    // the add that is not removed still says "added" (unchanged)
    await A.page.click('#editPhotoRow .photo-add');
    await A.page.evaluate(() => window.__picked);
    const r2 = await A.page.evaluate(() => window.__toasts.slice(-1)[0]);
    check('R4. control — an add left alone: "📸 Photo added…", as before', /^📸 Photo added/.test(r2 || ''), r2);
    await A.close();
  });

  // =====================================================================
  // I — Arabic for every new message (the notes as the app writes them)
  // =====================================================================
  await phase('I', 'Arabic', async () => {
    seed();
    const A = await mkPhone('I-A-Mariam');
    await A.boot(M, 'rep');
    const notes = await A.page.evaluate(() => {
      const lines = h => { const d = document.createElement('div'); d.innerHTML = h; return [...d.children].map(c => c.textContent); };
      const keep = [['i1', 'idb'], ['i3', 'mem'], ['i4', 'mem']]; keep.forEach(([id, on]) => _photoKept.set(id, { id, data: 'x', on }));
      const out = lines(photoWaitHTML({ photos: [{ id: 'i1', pending: true }, { id: 'i2', pending: true }, { id: 'i3', pending: true }, { id: 'i4', pending: true }, { id: 'l1', lost: true }, { id: 'l2', lost: true }] }))
        .concat(lines(photoWaitHTML({ photos: [{ id: 'i1', pending: true }, { id: 'i2', pending: true }] })), lines(photoWaitHTML({ photos: [{ id: 'l1', lost: true }] })));
      keep.forEach(([id]) => _photoKept.delete(id));
      return out;
    });
    const strs = notes.concat([
      '⏳ The full photo is still waiting to upload from the phone that took it — this is its small preview',
      '1 photo across 1 visit. Tap any photo to view it full size.', '3 photos across 2 visits. Tap any photo to view it.', '1 photo across 1 visit. Tap any photo to view it.',
      '⏳ marks a photo still waiting to upload — until it arrives, other phones show only its small preview.',
      '⚠️ marks a photo lost before it uploaded — only its small preview is kept.',
      "This phone's storage is full — a photo is only in the app's memory: keep the app open and connected until it says Saved",
      "This phone's storage is full — 2 photos are only in the app's memory: keep the app open and connected until it says Saved",
      "A photo is only in the app's memory too", "2 photos are only in the app's memory too",
      '✅ Offline changes uploaded & merged · ⏳ 1 photo still waiting to upload', '✅ Offline changes uploaded & merged · ⏳ 3 photos still waiting to upload',
      '✅ Saved — it reached the cloud · ⏳ 1 photo still waiting to upload',
      "⚠️ This phone's storage is full — the photo was added only in the app's memory: keep the app open and connected until it says Saved",
      'Photo removed']);
    const out = await A.page.evaluate(strs => strs.map(s => [s, window.UMI18N ? UMI18N.tr(s) : null]), strs);
    const bad = out.filter(([, a]) => !a || !/[؀-ۿ]/.test(a) || /[A-Za-z]{2,}/.test(a));
    check('I. every new message and note has its Arabic, nothing left in English (counts by pattern) — notes as written: ' + notes.length, notes.length === 4 && bad.length === 0, bad.length ? bad : notes);
    await A.close();
  });

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
