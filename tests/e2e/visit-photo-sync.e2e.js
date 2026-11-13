// Visit photos and saves that overlap (v122 review). The first cut of the
// offline-photo change saved the whole visits list when a photo landed, and a
// visits save recorded what it had "stored" by reading the visits on screen
// AFTER its commit — so:
// - an edit (Edit visit → Save changes, Edit visit → add photo) made while a
//   background visits save was committing (the queue's flush, a photo landing)
//   was counted as stored: "✅ Changes saved", nothing written, reverted at
//   the next refresh (the added photo ended on no visit);
// - the second photo of a visit landing during the first one's save kept
//   "waiting to upload" on every phone for good;
// - a landing wrote this phone's older copy of every visit back over the
//   cloud: the supervisor's notes, a photo he removed (back) or added (gone),
//   another rep's correction — undone;
// - a phone still on the older version put "waiting" back for good;
// - a photo kept only in memory and lost when the app closed said "waiting to
//   upload" for good;
// - the double-tap guard refused a NEW form for the whole save, then moved the
//   person to Today: that visit was lost behind "Visit saved".
// Each case is reproduced here and stays as a check. Fake cloud in Node shared
// by the phones; a photo write can be held (a slow upload) and a phone's next
// write of the visits can be held after its merge ran (the commit's round
// trip). Clock pinned to Mon 21 Sep 2026; the 20-second refresh driven by
// hand. Names, clinics and doctors are invented.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8271;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- fake cloud (Node: shared by every phone, survives reloads) ----
// net.down: that phone has no signal (every read and write fails at once).
// net.photoHold: photo writes from that phone wait until landPhoto(id) — a
//   slow upload; a page that closes takes its waiting writes with it.
// gate: holds that phone's next write of 'visits' AFTER its merge ran.
// net.lag[phone] = ms: every read from that phone answers ms later.
const cloud = {};
const net = { down: new Set(), photoHold: new Set(), lag: {}, writes: [] };
let heldPhotos = [], gate = null;
const busy = {}, queue = {}; // one transaction per document at a time, first come first served
const acquire = async k => { if(!busy[k]){ busy[k] = true; return true; } await new Promise(r => (queue[k] = queue[k] || []).push(r)); return true; };
const release = async k => { const next = (queue[k] || []).shift(); if(next) next(); else busy[k] = false; return true; };
const down = who => { if(net.down.has(who)) throw new Error('boom-offline'); };
const api = {
  get: async (who, k) => { down(who); if(net.lag[who]) await sleep(net.lag[who]); return k in cloud ? cloud[k] : null; },
  set: async (who, k, v) => {
    if(/^photo:/.test(k) && net.photoHold.has(who)) return new Promise(res => heldPhotos.push({ who, k, v, res }));
    down(who);
    if(k === 'visits' && gate && gate.who === who && !gate.hit){ gate.hit = true; gate.value = v; await gate.open; }
    net.writes.push(who + ' ' + k); cloud[k] = v; return true; },
  setMany: async (who, e) => { down(who); e.forEach(([k, v]) => { net.writes.push(who + ' ' + k); cloud[k] = v; }); return true; },
  del: async (who, k) => { down(who); delete cloud[k]; return true; },
  list: async (who, p) => { down(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
const landPhoto = id => { const h = heldPhotos.find(x => x.k === 'photo:' + id); if(!h) return false; heldPhotos = heldPhotos.filter(x => x !== h); net.writes.push(h.who + ' ' + h.k); cloud[h.k] = h.v; h.res(true); return true; };
const dropHeld = who => { heldPhotos = heldPhotos.filter(h => h.who !== who); }; // that page closed: its waiting uploads are gone
const armGate = who => { let rel; const open = new Promise(r => { rel = r; }); gate = { who, hit: false, value: null, open, release: () => { rel(); gate = null; } }; return gate; };
const J = k => { try{ return JSON.parse(cloud[k]); }catch(e){ return null; } };
const cv = id => (J('visits') || []).find(v => v && v.id === id) || null;
const byNote = note => (J('visits') || []).filter(v => v && v.notes === note);
const marks = v => v && v.photos ? v.photos.map(p => ({ id: p.id, pending: !!p.pending, lost: !!p.lost, thumb: /^data:image/.test(p.thumb || '') })) : null;
const writesOf = (who, k) => net.writes.filter(w => w === who + ' ' + k).length;

const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,700):'')); if(!ok) failed++; }
async function phase(id, name, fn){
  results.push('— ' + id + ' ' + name);
  try{ await fn(); }catch(e){ check(id + ' ' + name + ': phase crashed', false, String(e && e.message || e).split('\n')[0].slice(0, 300)); }
  if(gate){ gate.release(); } // never leave a phone's write hanging into the next phase
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
  net.down.clear(); net.photoHold.clear(); net.lag = {}; heldPhotos = []; gate = null;
}
const oldVisit = (id, rep, clinicId, docId, notes) => ({ id, clinicId, rep, withRep: null, date: '2026-09-20', ts: new Date('2026-09-20T09:00:00').getTime(), products: [], orderTaken: false, orders: [], orderItems: [], orderGross: 0, orderDiscount: 0, orderTotal: 0, doctorId: docId, doctorIds: [docId], nextFollowUp: null, notes, noOrderReason: 'just a call' });

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
      window.__shot = n => { const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = ['#c33', '#3a3', '#33c', '#cc3', '#3cc', '#c3c', '#888', '#a52'][n % 8]; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillText('photo ' + n, 4, 14); return c.toDataURL('image/jpeg', 0.8); };
        return { id: uid(), full: mk(160, 120), thumb: mk(40, 30) }; };
    }, { clock: CLOCK, noIDB: !!opts.noIDB, fullLS: !!opts.fullLS });
    const boot = async (who, role) => {
      dropHeld(label);
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; });
    };
    // the 20-second refresh, by hand (not awaited when a held write would block it)
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); };
    return { page, ctx, boot, tick, label };
  };
  const fill = (ph, o) => ph.page.evaluate(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId);
    document.getElementById('visitNotes').value = o.note;
    for(let i = 0; i < (o.photos || 0); i++) visitPhotos.push(window.__shot(i));
    renderVisitPhotos();
    return visitPhotos.map(p => p.id); }, o);
  const tap = ph => ph.page.evaluate(() => { const b = [...document.querySelectorAll('#view-log button')].find(x => (x.getAttribute('onclick') || '').trim() === 'saveVisit()');
    const on = !!(b && document.getElementById('view-log').classList.contains('active') && b.offsetParent); if(on) b.click(); return on; });
  const toasts = ph => ph.page.evaluate(() => window.__toasts.slice());
  const phoneVisit = (ph, id) => ph.page.evaluate(id => { const v = visits.find(x => x.id === id);
    return v ? { notes: v.notes, edits: (v.editHistory || []).length, photos: (v.photos || []).map(p => ({ id: p.id, pending: !!p.pending, lost: !!p.lost })) } : null; }, id);
  const idb = ph => ph.page.evaluate(() => new Promise(res => {
    if(!window.indexedDB) return res(null);
    let rq; try{ rq = indexedDB.open('um_photos'); }catch(e){ return res('err'); }
    rq.onupgradeneeded = () => { try{ rq.transaction.abort(); }catch(e){} };
    rq.onerror = () => res([]);
    rq.onsuccess = () => { const db = rq.result; if(!db.objectStoreNames.contains('up')){ db.close(); return res([]); }
      const g = db.transaction('up', 'readonly').objectStore('up').getAll();
      g.onsuccess = () => { res(g.result.map(r => r.id)); db.close(); }; g.onerror = () => { db.close(); res('err'); }; };
  }));
  // a visit logged as a rep does, its photo uploads held; → { vid, pids }
  const logVisit = async (ph, note, n, clinicId, docId) => {
    const pids = await fill(ph, { clinicId: clinicId || 'c1', docId: docId || 'd1', note, photos: n });
    await tap(ph);
    await until(() => byNote(note).length === 1, 10000);
    await until(() => heldPhotos.filter(h => pids.some(id => h.k === 'photo:' + id)).length === n, 10000);
    await until(() => ph.page.evaluate(() => !_visitSaveBusy.size), 10000);
    return { vid: (byNote(note)[0] || {}).id, pids };
  };
  // Edit visit → new notes → the real "Save changes" button (not awaited: the sheet closes when the save settles)
  const editNotes = (ph, vid, notes) => ph.page.evaluate(({ vid, notes }) => {
    openEditVisit(vid);
    document.getElementById('evNotes').value = notes;
    const b = [...document.querySelectorAll('#modalInner button')].find(x => (x.getAttribute('onclick') || '').startsWith('saveEditVisit('));
    if(b) b.click();
    return !!b;
  }, { vid, notes });
  const sheetClosed = ph => ph.page.evaluate(() => !document.getElementById('modalBack').classList.contains('show'));
  const pickStub = (ph, n) => ph.page.evaluate(n => { window.pickImage = (cb) => { window.__picked = Promise.resolve(cb(window.__shot(n))); }; }, n);
  // the id the added photo got on the visit (addEditPhoto gives it its own)
  const addedId = (ph, vid, known) => ph.page.evaluate(({ vid, known }) => { const v = visits.find(x => x.id === vid); const p = v && (v.photos || []).find(x => !known.includes(x.id)); return p ? p.id : null; }, { vid, known });

  const A = await mkPhone('A-Mariam');

  // =====================================================================
  // Q — an edit while the queue's flush of the visits is committing
  // =====================================================================
  await phase('Q', 'Edit visit → Save changes while the offline queue is being sent', async () => {
    seed([oldVisit('vy', M, 'c3', 'd3', 'Q the visit to edit')]);
    await A.boot(M, 'rep');
    net.down.add(A.label);
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'Q logged with no signal' });
    await tap(A);
    await until(() => A.page.evaluate(() => outboxHas('visits') && !_visitSaveBusy.size), 10000);
    net.down.delete(A.label);
    const g = armGate(A.label);
    const tp = A.tick(); // the refresh sends the queue: its visits write is held after it merged
    const hit = await until(() => g.hit, 10000);
    await A.page.evaluate(() => { window.__toasts = []; });
    const clicked = await editNotes(A, 'vy', 'Q edited while the queue was sent');
    await sleep(400);
    g.release();
    await tp;
    await until(() => sheetClosed(A), 15000); await sleep(500);
    const c = cv('vy');
    const t = await toasts(A);
    check('Q. an edit made while the offline queue\'s visits write is committing reaches the cloud — with its edit history — and the toast says saved',
      hit && clicked && c && c.notes === 'Q edited while the queue was sent' && (c.editHistory || []).length === 1 && byNote('Q logged with no signal').length === 1 && t.some(x => /Changes saved/.test(x)),
      { hit, clicked, cloudNotes: c && c.notes, edits: c && (c.editHistory || []).length, queued: byNote('Q logged with no signal').length, toasts: t });
    await A.tick(); await sleep(200);
    const p = await phoneVisit(A, 'vy');
    check('Q2. …and the next refresh keeps it on the phone', p && p.notes === 'Q edited while the queue was sent' && p.edits === 1, p);
  });

  // =====================================================================
  // L — an edit while a photo's "uploaded" mark is being saved
  // =====================================================================
  let L = null;
  await phase('L', 'Edit visit → Save changes while a photo\'s mark is saved', async () => {
    seed();
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    L = await logVisit(A, 'L to be edited', 1);
    const g = armGate(A.label);
    landPhoto(L.pids[0]); // the photo lands: its mark is saved, and that write is held
    const hit = await until(() => g.hit, 10000);
    await A.page.evaluate(() => { window.__toasts = []; });
    const clicked = await editNotes(A, L.vid, 'L edited while the mark was saved');
    await sleep(400);
    g.release();
    await until(() => sheetClosed(A), 15000); await sleep(600);
    const c = cv(L.vid);
    check('L. an edit made while a photo\'s "uploaded" mark is committing reaches the cloud, with its history; the mark is cleared too',
      hit && clicked && c && c.notes === 'L edited while the mark was saved' && (c.editHistory || []).length === 1 && marks(c).every(p => !p.pending),
      { hit, clicked, notes: c && c.notes, edits: c && (c.editHistory || []).length, photos: marks(c), toasts: await toasts(A) });
    await A.tick(); await sleep(200);
    const p = await phoneVisit(A, L.vid);
    const ix = await idb(A);
    check('L2. …after the next refresh the phone agrees, and it let go of its copy of the photo', p && p.notes === 'L edited while the mark was saved' && p.edits === 1 && p.photos.every(x => !x.pending) && Array.isArray(ix) && ix.length === 0, { p, idb: ix });
  });

  // =====================================================================
  // AP — Edit visit → add photo while a photo's mark is being saved
  // =====================================================================
  await phase('AP', 'Edit visit → add photo while a photo\'s mark is saved', async () => {
    seed();
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'AP gets a photo', 1);
    await pickStub(A, 5);
    const g = armGate(A.label);
    landPhoto(V.pids[0]);
    const hit = await until(() => g.hit, 10000);
    await A.page.evaluate(vid => { window.__toasts = []; openEditVisit(vid); addEditPhoto(vid); }, V.vid);
    const newId = await addedId(A, V.vid, V.pids);
    await sleep(400);
    g.release();
    await A.page.evaluate(() => window.__picked);
    await until(() => (marks(cv(V.vid)) || []).length === 2, 10000); await sleep(400);
    const c = cv(V.vid);
    check('AP. a photo added while another photo\'s mark is committing is on the visit in the cloud (waiting to upload); the first photo\'s mark is cleared',
      hit && c && marks(c).length === 2 && marks(c).some(p => p.id === newId && p.pending) && marks(c).some(p => p.id === V.pids[0] && !p.pending), { hit, photos: marks(c), toasts: await toasts(A) });
    await A.page.evaluate(() => closeModal());
    await A.tick(); await sleep(200);
    const p1 = await phoneVisit(A, V.vid);
    landPhoto(newId);
    await until(() => (marks(cv(V.vid)) || []).every(p => !p.pending), 10000); await sleep(300);
    const ix = await idb(A);
    check('AP2. …a refresh keeps it on the phone; when it lands its mark goes and the phone lets go of its copy',
      p1 && p1.photos.length === 2 && marks(cv(V.vid)).length === 2 && marks(cv(V.vid)).every(p => !p.pending) && cloud['photo:' + newId] && Array.isArray(ix) && ix.length === 0, { phone: p1, cloud: marks(cv(V.vid)), idb: ix });
  });

  // =====================================================================
  // TWO — the second photo lands while the first one's mark is saved
  // =====================================================================
  await phase('TWO', 'two photos land one after the other', async () => {
    seed();
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'TWO photos', 2);
    const g = armGate(A.label);
    landPhoto(V.pids[0]);
    const hit = await until(() => g.hit, 10000);
    landPhoto(V.pids[1]); // lands while the first one's mark is committing
    await sleep(400);
    const during = marks(J('visits').find(v => v.id === V.vid));
    g.release();
    await until(() => (marks(cv(V.vid)) || []).every(p => !p.pending), 10000); await sleep(300);
    const ix = await idb(A);
    check('TWO. the second photo of a visit lands while the first one\'s mark is committing: both marks are cleared in the cloud, the phone keeps neither copy',
      hit && marks(cv(V.vid)).length === 2 && marks(cv(V.vid)).every(p => !p.pending && !p.lost) && Array.isArray(ix) && ix.length === 0, { hit, during, after: marks(cv(V.vid)), idb: ix });
    await A.tick(); await sleep(200);
    const p = await phoneVisit(A, V.vid);
    check('TWO2. …and every refresh after says so', p && p.photos.every(x => !x.pending), p);
  });

  // =====================================================================
  // X — a photo lands on a phone whose copy of the visits is old
  // =====================================================================
  const S = await mkPhone('S-supervisor');
  let X = null;
  await phase('X', 'other phones\' edits survive a photo landing', async () => {
    seed([oldVisit('vr', 'Renova', 'c2', 'd2', 'X Renova as she logged it')]);
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    X = await logVisit(A, 'X joint visit', 2);
    // the supervisor, online: notes on that visit, removes its second photo, adds his own; corrects Renova's visit
    await S.boot(G, 'supervisor');
    await pickStub(S, 6);
    await S.page.evaluate(async ({ vid, p2 }) => { openEditVisit(vid); await removeEditPhoto(vid, p2); addEditPhoto(vid); await window.__picked; }, { vid: X.vid, p2: X.pids[1] });
    const sPhoto = await addedId(S, X.vid, X.pids);
    await until(() => (marks(cv(X.vid)) || []).some(p => p.id === sPhoto && !p.pending), 10000);
    await S.page.evaluate(() => closeModal());
    await editNotes(S, X.vid, 'X the supervisor\'s notes'); await until(() => sheetClosed(S), 10000);
    await editNotes(S, 'vr', 'X Renova corrected by the supervisor'); await until(() => sheetClosed(S), 10000);
    await sleep(300);
    // Mariam's phone has not refreshed since: its copy is the old one. Her first photo lands.
    const before = J('visits');
    const w0 = writesOf(A.label, 'visits');
    landPhoto(X.pids[0]);
    await until(() => (marks(cv(X.vid)) || []).some(p => p.id === X.pids[0] && !p.pending), 10000); await sleep(500);
    const after = J('visits');
    const expect = JSON.parse(JSON.stringify(before)); expect.find(v => v.id === X.vid).photos.find(p => p.id === X.pids[0]) && delete expect.find(v => v.id === X.vid).photos.find(p => p.id === X.pids[0]).pending;
    const c = cv(X.vid), r = cv('vr');
    check('X. a photo landing on a phone with an old copy: the supervisor\'s notes, the photo he removed (stays removed) and the one he added (stays) are all kept',
      c.notes === 'X the supervisor\'s notes' && (c.editHistory || []).length === 1 && marks(c).map(p => p.id).join() === [X.pids[0], sPhoto].join() && marks(c).every(p => !p.pending),
      { notes: c.notes, edits: (c.editHistory || []).length, photos: marks(c), expected: [X.pids[0], sPhoto] });
    check('X2. …Renova\'s visit keeps the supervisor\'s correction', r && r.notes === 'X Renova corrected by the supervisor', r && r.notes);
    check('X3. …the landing changed that one mark and nothing else in the cloud (one write)', JSON.stringify(after) === JSON.stringify(expect) && writesOf(A.label, 'visits') - w0 === 1, { writes: writesOf(A.label, 'visits') - w0 });
    // the removed photo's upload lands later: it never comes back on the visit
    landPhoto(X.pids[1]); await sleep(800);
    await A.tick(); await sleep(300); await A.tick(); await sleep(300);
    const p = await phoneVisit(A, X.vid);
    check('X4. …the photo he removed lands later from Mariam\'s phone: it stays off the visit; her phone now shows his notes and photos',
      marks(cv(X.vid)).map(x => x.id).join() === [X.pids[0], sPhoto].join() && p && p.notes === 'X the supervisor\'s notes' && p.photos.map(x => x.id).join() === [X.pids[0], sPhoto].join(), { cloud: marks(cv(X.vid)), phone: p });
  });

  // =====================================================================
  // OLD — a phone on the older version puts "waiting" back
  // =====================================================================
  await phase('OLD', 'an older phone puts the mark back', async () => {
    const putBack = () => { const all = J('visits'); const v = all.find(x => x.id === X.vid); v.photos.find(p => p.id === X.pids[0]).pending = true; cloud.visits = JSON.stringify(all); };
    putBack(); // as a v121 phone's save of its older copy does
    await A.tick(); await sleep(300); await A.tick(); await sleep(500);
    const once = marks(cv(X.vid)).find(p => p.id === X.pids[0]);
    check('OLD. an older phone writes "waiting" back over a landed photo: the phone that uploaded it clears it again at its next refresh', once && !once.pending && !once.lost, marks(cv(X.vid)));
    await A.boot(M, 'rep'); // a later day: the app reopened, it no longer remembers the landing
    putBack();
    await A.tick(); await sleep(300); await A.tick(); await sleep(500);
    const twice = marks(cv(X.vid)).find(p => p.id === X.pids[0]);
    check('OLD2. …and after the app was reopened too: its own photo, found in the cloud, is cleared (never called lost)', twice && !twice.pending && !twice.lost, marks(cv(X.vid)));
  });

  // =====================================================================
  // LOST — a photo kept only in memory, the app closed before it uploaded
  // =====================================================================
  await phase('LOST', 'a photo only in memory, the app closed', async () => {
    seed();
    const F = await mkPhone('F-Mariam-full', { noIDB: true, fullLS: true });
    await F.boot(M, 'rep');
    net.photoHold.add(F.label);
    const pids = await fill(F, { clinicId: 'c3', docId: 'd3', note: 'LOST photo in memory', photos: 1 });
    await tap(F);
    await until(() => byNote('LOST photo in memory').length === 1, 10000);
    await until(() => F.page.evaluate(() => !_visitSaveBusy.size), 10000);
    const t = await toasts(F);
    const vid = byNote('LOST photo in memory')[0].id;
    await F.boot(M, 'rep'); // closed and reopened: the photo only it held is gone
    await F.tick(); await sleep(400); await F.tick(); await sleep(500);
    const c = marks(cv(vid));
    check('LOST. a photo kept only in the app\'s memory, the app closed before it uploaded: once reopened, that phone finds it in no store and not in the cloud, and the visit says "lost" (its small preview kept), no longer "waiting"',
      t.some(x => /only in the app's memory/.test(x)) && c && c.length === 1 && c[0].lost && !c[0].pending && c[0].thumb && !cloud['photo:' + pids[0]], { toast: t.slice(-1), photos: c });
    await S.boot(G, 'supervisor');
    const s = await phoneVisit(S, vid);
    check('LOST2. …the supervisor\'s phone has it as lost too', s && s.photos.length === 1 && s.photos[0].lost && !s.photos[0].pending, s);
    await F.ctx.close();
  });

  // =====================================================================
  // KEPT — a photo kept on the phone is never called lost
  // =====================================================================
  await phase('KEPT', 'a photo kept on the phone, the app closed before it uploaded', async () => {
    seed();
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    const V = await logVisit(A, 'KEPT photo on the phone', 1);
    await A.boot(M, 'rep'); // closed with the upload on its way
    await A.tick(); await sleep(400); await A.tick(); await sleep(400);
    const mid = marks(cv(V.vid));
    const resent = heldPhotos.some(h => h.k === 'photo:' + V.pids[0]);
    landPhoto(V.pids[0]);
    await until(() => (marks(cv(V.vid)) || []).every(p => !p.pending), 10000);
    check('KEPT. a photo the phone keeps (IndexedDB) is sent again after the app reopens and never called lost; it lands and the mark goes',
      mid && mid[0].pending && !mid[0].lost && resent && marks(cv(V.vid))[0] && !marks(cv(V.vid))[0].lost && !marks(cv(V.vid))[0].pending, { mid, resent, after: marks(cv(V.vid)) });
  });

  // =====================================================================
  // ARCH — a photo added to a visit of a past month: its archive is patched
  // =====================================================================
  await phase('ARCH', 'a photo on a past month\'s visit lands', async () => {
    seed();
    const aug = Object.assign(oldVisit('va', M, 'c1', 'd1', 'ARCH an August visit'), { date: '2026-08-20', ts: new Date('2026-08-20T09:00:00').getTime() });
    cloud['visitsArch:2026-08'] = JSON.stringify([aug]);
    cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-08': { n: 1, rev: 1 } } });
    await A.boot(M, 'rep');
    net.photoHold.add(A.label);
    await pickStub(A, 7);
    await A.page.evaluate(async () => { openEditVisit('va'); addEditPhoto('va'); await window.__picked; closeModal(); });
    const pid = await addedId(A, 'va', []);
    const archived = () => ((J('visitsArch:2026-08') || []).find(v => v.id === 'va') || {}).photos || [];
    await until(() => archived().length === 1, 10000);
    await S.boot(G, 'supervisor'); // reads August with the photo still waiting
    const sBefore = await phoneVisit(S, 'va');
    const rev0 = (J('visitsIndex').months['2026-08'] || {}).rev;
    landPhoto(pid);
    await until(() => archived().length === 1 && !archived()[0].pending, 10000); await sleep(300);
    const rev1 = (J('visitsIndex').months['2026-08'] || {}).rev;
    await S.tick(); await sleep(300);
    const sAfter = await phoneVisit(S, 'va');
    check('ARCH. a photo added to a past month\'s visit lands: its mark is cleared in that month\'s archive, the month\'s revision moves, and the other phones see it at their next refresh',
      sBefore && sBefore.photos[0] && sBefore.photos[0].pending && archived()[0] && !archived()[0].pending && rev1 !== rev0 && sAfter && sAfter.photos[0] && !sAfter.photos[0].pending && !(J('visits') || []).some(v => v.id === 'va'),
      { sBefore, archive: archived(), rev0, rev1, sAfter });
  });

  // =====================================================================
  // G — the double-tap guard belongs to the form being saved
  // =====================================================================
  await phase('G', 'a slow save: the same form is locked, a new form saves', async () => {
    seed();
    await A.boot(M, 'rep');
    net.lag[A.label] = 1500; // every read answers 1.5 s later: the save takes several seconds
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'G first visit' });
    await tap(A);
    await sleep(300);
    const lock = await A.page.evaluate(() => ({ cls: document.getElementById('view-log').classList.contains('log-saving'), note: (document.getElementById('logSavingNote') || {}).textContent || '', busy: document.getElementById('view-log').getAttribute('aria-busy') }));
    const n0 = (await toasts(A)).filter(t => t === 'Already saving…').length;
    await tap(A);
    const refused = (await toasts(A)).filter(t => t === 'Already saving…').length > n0;
    check('G. while a visit saves, its form is locked and says "Saving the visit…"; a second tap on it is refused', lock.cls && /Saving the visit/.test(lock.note) && lock.busy === 'true' && refused, { lock, refused });
    // she opens a fresh form and fills another visit while the first one is still saving
    await fill(A, { clinicId: 'c3', docId: 'd3', note: 'G second visit' });
    const open2 = await A.page.evaluate(() => ({ cls: document.getElementById('view-log').classList.contains('log-saving'), note: !!document.getElementById('logSavingNote') }));
    await until(() => byNote('G first visit').length === 1, 30000);
    await until(() => A.page.evaluate(() => _visitSaveBusy.size === 0), 30000); await sleep(200);
    const mid = await A.page.evaluate(() => ({ view: activeView, notes: document.getElementById('visitNotes').value }));
    check('G2. …a new form is not locked, and the first save ending leaves her on it with what she typed (not moved to Today)', !open2.cls && !open2.note && mid.view === 'log' && mid.notes === 'G second visit', { open2, mid });
    const n1 = (await toasts(A)).filter(t => t === 'Already saving…').length;
    await tap(A);
    await sleep(200);
    const refused2 = (await toasts(A)).filter(t => t === 'Already saving…').length > n1;
    await until(() => byNote('G second visit').length === 1, 30000);
    await until(() => A.page.evaluate(() => _visitSaveBusy.size === 0 && activeView === 'today'), 30000);
    delete net.lag[A.label];
    const mem = await A.page.evaluate(() => ({ g1: visits.filter(v => v.notes === 'G first visit').length, g2: visits.filter(v => v.notes === 'G second visit').length, view: activeView, locked: document.getElementById('view-log').classList.contains('log-saving') }));
    check('G3. …her second visit saves (not refused): each visit once in the cloud and on the phone, then Today, the form unlocked',
      !refused2 && byNote('G first visit').length === 1 && byNote('G second visit').length === 1 && mem.g1 === 1 && mem.g2 === 1 && mem.view === 'today' && !mem.locked, { refused2, mem });
    // a new form opened while a save is on its way, saved meanwhile: the earlier one is never "Already saving…"
    const ar = await A.page.evaluate(() => window.UMI18N ? UMI18N.tr('⏳ Saving the visit…') : null);
    check('G4. the lock\'s words have their Arabic', !!ar && /[؀-ۿ]/.test(ar), ar);
  });

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
