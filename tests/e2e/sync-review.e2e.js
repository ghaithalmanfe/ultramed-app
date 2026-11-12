// Sync review scenarios (v121, the independent review of the sync-safety work).
// Several phones share a fake cloud; one can be offline, a read can fail, a
// phone's storage can be full; the 20-second refresh is driven by hand.
//  S1/S1b  a phone that starts without reading the cloud (offline, or the read
//          failed) merges against its own copy as the base: its next upload
//          never puts back records it did not touch (a handover, a closed task)
//  S3/S3b  two overlapping saves of the same list on one phone: the second
//          merges against the base its list was taken with, never undoing an
//          edit the first had just kept
//  N1      a full phone: a growing queue that no longer fits keeps the phone's
//          list, so a reopen still uploads the earlier saves
//  N2      a full phone: a refresh without a connection never serves a device
//          copy older than what the screen holds
//  T1      chat on a full phone without connection: queued, said honestly, kept
//  R1      an edit kept on the phone by a refresh that raced its save rides along
//          with the next upload after a reopen without connection
//  D1      two overlapping day-plan saves keep the plan another phone changed
// Port 8251. ONLY=S1,N2 runs a subset.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8251;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });

const cloud = {};
const mode = { failGet: null, failSet: null, offline: new Set(), slow: {}, reads: [], writes: [] };
let held = false; const waiters = [];
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const off = who => { if(mode.offline.has(who)) throw new Error('boom-offline'); };
const api = {
  get: async (who, k) => { off(who); mode.reads.push(k); if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); const v = k in cloud ? cloud[k] : null;
    if(mode.slow[k]){ const ms = mode.slow[k]; delete mode.slow[k]; await new Promise(r => setTimeout(r, ms)); } return v; },
  set: async (who, k, v) => { off(who); if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set'); mode.writes.push(k); cloud[k] = v; return true; },
  setMany: async (who, e) => { off(who); e.forEach(([k, v]) => { mode.writes.push(k); cloud[k] = v; }); return true; },
  del: async (who, k) => { off(who); delete cloud[k]; return true; },
  list: async (who, p) => { off(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  -> '+JSON.stringify(info).slice(0,700):'')); if(!ok) failed++; }
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const CLOCK = new Date('2026-09-21T10:00:00').getTime();
function seedCloud(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }, { id: 'dX', name: 'Dr. Khalid' }] },
    { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] },
    { id: 'c3', name: 'Hilal Dental Center', rep: 'Mariam', cls: 'B', doctors: [{ id: 'd3', name: 'Dr. Noor' }] }]);
  cloud.visits = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}';
  cloud.tasks = JSON.stringify([{ id: 't1', text: 'Call Dr. Sara', done: false, created: '2026-09-20', rep: 'Renova', clinicId: 'c2' }]);
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-09' }, Renova: { revenue: 12000, month: '2026-09' } });
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
const cl = id => (parse(cloud.clinics) || []).find(c => c.id === id) || {};
const tk = id => (parse(cloud.tasks) || []).find(t => t.id === id) || {};

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
        update: async (k, fn) => { if(window.__hang && new RegExp(window.__hang).test(k)) return new Promise(() => {}); await window.__cAcquire(); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(); } },
      };
      const off = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
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
  const supEdit = (S) => S.page.evaluate(async () => {
    const c3 = clinics.find(x => x.id === 'c3'); c3.rep = 'Renova'; c3.phone = '+965 1111';   // a handover
    const ok1 = await persist('clinics'); tasks.find(t => t.id === 't1').done = true; const ok2 = await persist('tasks'); return { ok1, ok2 }; });

  // ---------------------------------------------------------------------
  // S1: a phone that STARTS without a connection (served from its copy, nothing
  // queued) has no merge base: its queued upload is the old local-wins merge.
  // ---------------------------------------------------------------------
  if(!ONLY || ONLY.has('S1')){
    seedCloud();
    const A = await mkPhone('S1-A'), S = await mkPhone('S1-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');      // A has a copy of the lists on the phone
    const sv = await supEdit(S);                                                   // the supervisor hands c3 over, closes t1
    mode.offline.add('S1-A');
    await A.boot('Mariam', 'rep');                                                 // the rep opens the app in a basement
    const a = await A.page.evaluate(async () => {
      const base = { clinics: !!mergeBaseFor('clinics'), tasks: !!mergeBaseFor('tasks') };
      const c = clinics.find(x => x.id === 'c1'); c.lastVisit = '2026-09-21'; const ok1 = await persist('clinics');
      tasks.push({ id: 'tA', text: 'Follow up: Dental 5 Clinic', done: false, created: '2026-09-21', rep: 'Mariam', clinicId: 'c1', kind: 'followup' }); const ok2 = await persist('tasks');
      return { base, ok1, ok2, outbox: outboxList(), mu: Object.keys(_mirrorUsed) };
    });
    mode.offline.delete('S1-A');
    await A.tick();
    const r = { c3rep: cl('c3').rep, c3phone: cl('c3').phone, t1done: tk('t1').done, c1last: cl('c1').lastVisit, tA: !!tk('tA').id, outbox: await A.page.evaluate(() => outboxList()) };
    check('S1. offline START, edit, back online: the supervisor\'s handover of c3 and the closed task survive', sv.ok1 && r.c3rep === 'Renova' && r.c3phone === '+965 1111' && r.t1done === true, { a, r });
    await A.ctx.close(); await S.ctx.close();
  }
  // S1b: the start-up read of the list merely timed out (served from the phone's copy); the next save lands at once
  if(!ONLY || ONLY.has('S1b')){
    seedCloud();
    const A = await mkPhone('S1b-A'), S = await mkPhone('S1b-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await supEdit(S);
    mode.failGet = /^clinics$/;
    await A.boot('Mariam', 'rep');
    mode.failGet = null;
    const a = await A.page.evaluate(async () => { const b = !!mergeBaseFor('clinics'); const c = clinics.find(x => x.id === 'c1'); c.lastVisit = '2026-09-21'; const ok = await persist('clinics'); return { base: b, ok }; });
    const r = { c3rep: cl('c3').rep, c3phone: cl('c3').phone, c1last: cl('c1').lastVisit };
    check('S1b. a start-up read that timed out, then a save that lands: the handover of c3 survives', a.ok && r.c3rep === 'Renova' && r.c3phone === '+965 1111', { a, r });
    await A.ctx.close(); await S.ctx.close();
  }
  // ---------------------------------------------------------------------
  // S2: a doctor removed on this phone comes back when another phone changed
  // another doctor of the same clinic since this phone's last read.
  // ---------------------------------------------------------------------
  if(!ONLY || ONLY.has('S2')){
    seedCloud();
    const A = await mkPhone('S2-A'), S = await mkPhone('S2-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    const sv = await S.page.evaluate(async () => { clinics.find(x => x.id === 'c1').doctors.find(d => d.id === 'd1').phone = '+965 2222'; return persist('clinics'); });
    const a = await A.page.evaluate(async () => { await removeDoctor('c1', 'dX'); return { screen: clinics.find(x => x.id === 'c1').doctors.map(d => d.id), tomb: tombSet('doctors').has('c1|dX') }; });
    const cloudDocs = (cl('c1').doctors || []).map(d => d.id + (d.phone ? ':' + d.phone : ''));
    check('S2. a doctor removed on this phone stays removed (screen and cloud) when another phone edited another doctor of the clinic', sv && !a.screen.includes('dX') && !cloudDocs.some(x => x.startsWith('dX')) && cloudDocs.includes('d1:+965 2222'), { a, cloudDocs });
    // what a phone that starts without a connection (it never made that delete) shows
    await S.tick();
    mode.offline.add('S2-B');
    const B = await mkPhone('S2-B'); mode.offline.delete('S2-B');
    await B.boot('Renova', 'rep');
    await B.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('um_tombs') || '{}'); return s; });
    mode.offline.add('S2-B'); await B.boot('Renova', 'rep');
    const b = await B.page.evaluate(() => (clinics.find(x => x.id === 'c1') || { doctors: [] }).doctors.map(d => d.id));
    mode.offline.delete('S2-B');
    check('S2b. …and a phone that starts offline does not show the removed doctor', !b.includes('dX'), { b });
    await A.ctx.close(); await S.ctx.close(); await B.ctx.close();
  }
  // ---------------------------------------------------------------------
  // S3: two saves of the clinic list overlap on one phone (two quick edits on a
  // slow line): the first merges the supervisor's handover and moves the base;
  // the second still carries the list from before and now counts it as "mine".
  // ---------------------------------------------------------------------
  if(!ONLY || ONLY.has('S3')){
    seedCloud();
    const A = await mkPhone('S3-A'), S = await mkPhone('S3-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await supEdit(S);
    const a = await A.page.evaluate(async () => {
      const c = clinics.find(x => x.id === 'c1');
      c.contact = 'Reception'; const p1 = persist('clinics');
      c.phone = '+965 3333';  const p2 = persist('clinics');
      const r = await Promise.all([p1, p2]);
      return { r, screenC3: (clinics.find(x => x.id === 'c3') || {}).rep };
    });
    const r = { c3rep: cl('c3').rep, c3phone: cl('c3').phone, c1: { contact: cl('c1').contact, phone: cl('c1').phone } };
    check('S3. two overlapping saves on one phone keep the supervisor\'s handover of c3', r.c3rep === 'Renova' && r.c3phone === '+965 1111' && r.c1.phone === '+965 3333', { a, r });
    // and after the next refresh the phone shows what the cloud holds
    await A.tick();
    const a2 = await A.page.evaluate(() => (clinics.find(x => x.id === 'c3') || {}).rep);
    check('S3-after. …and after the next refresh the handover is still there (screen and cloud)', a2 === 'Renova' && cl('c3').rep === 'Renova', { screen: a2, cloud: cl('c3').rep });
    await A.ctx.close(); await S.ctx.close();
  }
  // S3 control + trace: one save only (expected to keep the handover) and, for two saves, which base each merge saw
  if(!ONLY || ONLY.has('S3c')){
    seedCloud();
    const A = await mkPhone('S3c-A'), S = await mkPhone('S3c-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await supEdit(S);
    await A.page.evaluate(async () => { clinics.find(x => x.id === 'c1').contact = 'Reception'; return persist('clinics'); });
    check('S3c-control. ONE save from the same stale phone keeps the handover (the three-way merge works when saves do not overlap)', cl('c3').rep === 'Renova', { c3: cl('c3').rep });
    seedCloud(); await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor'); await supEdit(S);
    const trace = await A.page.evaluate(async () => {
      const seen = []; const real = mergeById;
      window.mergeById = function(key, local, cloud, base){ if(key === 'clinics') seen.push({ localC3: (local.find(x => x && x.id === 'c3') || {}).rep, cloudC3: (cloud.find(x => x && x.id === 'c3') || {}).rep, baseC3: base && (base.get('c3') || {}).rep }); return real.apply(this, arguments); };
      const c = clinics.find(x => x.id === 'c1');
      c.contact = 'Reception'; const p1 = persist('clinics');
      c.phone = '+965 3333';  const p2 = persist('clinics');
      await Promise.all([p1, p2]); window.mergeById = real; return seen;
    });
    console.log('S3c trace (information): what each merge saw', JSON.stringify({ trace, cloudAfter: cl('c3').rep }).slice(0, 400));
    await A.ctx.close(); await S.ctx.close();
  }
  // S3b: the realistic trigger — the queued upload (refresh tick) overlapping the rep's next save
  if(!ONLY || ONLY.has('S3b')){
    seedCloud();
    const A = await mkPhone('S3b-A'), S = await mkPhone('S3b-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    mode.offline.add('S3b-A');
    await A.page.evaluate(async () => { clinics.find(x => x.id === 'c1').lastVisit = '2026-09-21'; await persist('clinics'); });
    await supEdit(S);
    mode.offline.delete('S3b-A');
    const a = await A.page.evaluate(async () => {
      const t = window.__bgTick();                                  // back online: the queue uploads
      await new Promise(r => setTimeout(r, 5));
      clinics.find(x => x.id === 'c1').contact = 'Reception';       // the rep saves the next change meanwhile
      const p = persist('clinics');
      await Promise.all([t, p]);
      return { outbox: outboxList() };
    });
    const r = { c3rep: cl('c3').rep, c3phone: cl('c3').phone, c1: { last: cl('c1').lastVisit, contact: cl('c1').contact } };
    check('S3b. the queued upload and a save made meanwhile keep the supervisor\'s handover of c3', r.c3rep === 'Renova' && r.c3phone === '+965 1111', { a, r });
    await A.ctx.close(); await S.ctx.close();
  }
  // ---------------------------------------------------------------------
  // N1 (a4111b5): a longer queue that no longer fits on the phone deletes the
  // phone's queue — entries queued earlier (with their copies on the phone) are
  // forgotten if the app is reopened before it uploads.
  // ---------------------------------------------------------------------
  if(!ONLY || ONLY.has('N1')){
    seedCloud();
    const A = await mkPhone('N1-A'); await A.boot('Mariam', 'rep');
    mode.offline.add('N1-A');
    const q1 = await A.page.evaluate(async () => { clinics.find(x => x.id === 'c1').notes = 'offline note'; const ok = await persist('clinics');
      return { ok, device: localStorage.getItem('um_outbox'), toasts: window.__toasts.slice() }; });
    const q2 = await A.page.evaluate(async () => {
      const real = Storage.prototype.setItem;
      const used = () => { let n = 0; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; };
      const quota = used() + 3;   // a phone whose storage is full to within a few bytes
      Storage.prototype.setItem = function(k, v){ const old = localStorage.getItem(k); if(used() - (old != null ? k.length + old.length : 0) + k.length + String(v).length > quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); };
      visits.push({ id: 'vN1', clinicId: 'c1', rep: 'Mariam', date: '2026-09-21', ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: '' });
      const r = await persistFor('visits');
      Storage.prototype.setItem = real;
      return { r: r.outcome, device: localStorage.getItem('um_outbox'), mem: outboxList(), bar: (document.getElementById('memOnlyBar') || {}).textContent || '' };
    });
    await A.boot('Mariam', 'rep');          // the phone closed the app; reopened, still no connection
    const q3 = await A.page.evaluate(() => ({ outbox: outboxList(), note: (clinics.find(x => x.id === 'c1') || {}).notes }));
    mode.offline.delete('N1-A');
    await A.tick();
    check('N1. an edit queued on the phone ("Saved on this device") survives a later save that found the phone full, and a reopen', cl('c1').notes === 'offline note', { q1, q2, q3, cloudNotes: cl('c1').notes });
    await A.ctx.close();
  }
  // ---------------------------------------------------------------------
  // N2 (a4111b5): a key whose phone copy could not be written but that is not
  // queued (its save landed) is still served from that older copy when a read
  // fails — the screen rolls back, and the next queued upload writes it back.
  // ---------------------------------------------------------------------
  if(!ONLY || ONLY.has('N2')){
    seedCloud();
    const A = await mkPhone('N2-A'); await A.boot('Mariam', 'rep');
    const s1 = await A.page.evaluate(async () => {
      const real = window.__realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v){ if(/^um_mirror:/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); };
      clinics.find(x => x.id === 'c1').notes = 'online note'; const ok = await persist('clinics');
      visits.push({ id: 'vN2', clinicId: 'c1', rep: 'Mariam', date: '2026-09-21', ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: '' });
      const r = await persistFor('visits');
      return { ok, visitOk: r.ok, stale: Object.keys(_deviceStale) };
    });
    const inCloud = { notes: cl('c1').notes, visit: (parse(cloud.visits) || []).some(v => v.id === 'vN2') };
    mode.offline.add('N2-A');
    await A.tick();                          // the next refresh, in a basement
    const s2 = await A.page.evaluate(() => ({ notes: (clinics.find(x => x.id === 'c1') || {}).notes, visit: visits.some(v => v.id === 'vN2') }));
    await A.page.evaluate(async () => { clinics.find(x => x.id === 'c2').cls = 'C'; await persist('clinics'); });
    mode.offline.delete('N2-A');
    await A.tick();
    await A.page.evaluate(() => { if(window.__realSet) Storage.prototype.setItem = window.__realSet; });
    check('N2a. full phone, saved online, then a refresh without connection: the screen keeps the saved note and visit', s2.notes === 'online note' && s2.visit, { s1, inCloud, s2 });
    check('N2b. …and the next upload from that phone does not undo its own saved note', cl('c1').notes === 'online note' && cl('c2').cls === 'C', { notes: cl('c1').notes, c2: cl('c2').cls });
    await A.ctx.close();
  }
  // ---------------------------------------------------------------------
  // T1: a chat message posted on a full phone with no connection is queued
  // (in memory at least), said so honestly, kept by the next refresh, and
  // uploads when the connection is back.
  // ---------------------------------------------------------------------
  if(!ONLY || ONLY.has('T1')){
    seedCloud(); cloud.chat = '[]';
    const A = await mkPhone('T1-A'); await A.boot('Mariam', 'rep');
    mode.offline.add('T1-A');
    const t1 = await A.page.evaluate(async () => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v){ throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
      chatMsgs.push({ id: 'm1', rep: 'Mariam', text: 'invented test message', ts: Date.now() });
      const ok = await persistTeam('chat');
      await loadTeam();                       // the next refresh, still offline
      const kept = chatMsgs.some(m => m && m.id === 'm1');
      Storage.prototype.setItem = real;
      return { ok, mem: outboxList(), kept, bar: (document.getElementById('memOnlyBar') || {}).textContent || '', toasts: window.__toasts.slice(-2) };
    });
    mode.offline.delete('T1-A');
    await A.page.evaluate(async () => { await flushOutbox(); });
    const up = (parse(cloud.chat) || []).some(m => m && m.id === 'm1');
    check('T1. a chat message on a full phone without connection: queued, said honestly, kept by the refresh, uploaded when back',
      t1.ok === false && t1.mem.includes('chat') && t1.kept && /storage is full/.test(t1.bar) && !t1.toasts.some(m => /Saved on this device/.test(m)) && up, { t1, up });
    await A.ctx.close();
  }
  // R1 (fix #1 x the raced branch): a save still on its way when a refresh ends raced; the raced branch puts
  // memory (with that unconfirmed edit) into the phone's copy; the app dies before the save lands; reopened
  // offline, that copy becomes the merge base, so the next upload treats the edit as "not mine".
  if(!ONLY || ONLY.has('R1')){
    seedCloud();
    const A = await mkPhone('R1-A'); await A.boot('Mariam', 'rep');
    mode.slow.erpSales = 1500; await A.page.evaluate(() => { window.__la = loadAll(); }); await A.page.waitForTimeout(250);
    await A.page.evaluate(() => { window.__hang = '^clinics$'; clinics.find(x => x.id === 'c1').notes = 'E'; window.__p = persist('clinics'); });
    await A.page.evaluate(async () => { await window.__la; });
    const m = await A.page.evaluate(() => ({ phoneCopy: (JSON.parse(localStorage.getItem('um_mirror:clinics') || '[]').find(c => c.id === 'c1') || {}).notes, outbox: outboxList() }));
    mode.offline.add('R1-A'); await A.boot('Mariam', 'rep');      // the app was closed before that save landed; reopened with no connection
    const r = await A.page.evaluate(async () => { const shown = (clinics.find(x => x.id === 'c1') || {}).notes; const base = !!mergeBaseFor('clinics');
      clinics.find(x => x.id === 'c2').cls = 'C'; await persist('clinics'); return { shown, base, outbox: outboxList() }; });
    mode.offline.delete('R1-A'); await A.tick();
    check('R1. an edit the reopened phone shows (kept by the raced refresh) rides along with its next upload', cl('c1').notes === 'E' && cl('c2').cls === 'C', { m, r, cloudNotes: cl('c1').notes, c2: cl('c2').cls });
    await A.ctx.close();
  }
  // D1: the same overlap as #3, for day plans (mergeDayPlans reads _dpBase at merge time)
  if(!ONLY || ONLY.has('D1')){
    seedCloud(); cloud.dayPlans = JSON.stringify({ '2026-09-22': { Renova: ['c2'] } });
    const A = await mkPhone('D1-A'), S = await mkPhone('D1-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.page.evaluate(async () => { dayPlans['2026-09-22'].Renova = ['c2', 'c3']; return persist('dayPlans'); });
    const a = await A.page.evaluate(async () => {
      dayPlans['2026-09-23'] = { Mariam: ['c1'] }; const p1 = persist('dayPlans');
      dayPlans['2026-09-24'] = { Mariam: ['c3'] }; const p2 = persist('dayPlans');
      return Promise.all([p1, p2]);
    });
    const dp = parse(cloud.dayPlans) || {};
    check('D1. two overlapping day-plan saves keep the plan another phone changed', JSON.stringify((dp['2026-09-22'] || {}).Renova) === JSON.stringify(['c2', 'c3']) && dp['2026-09-24'], { a, dp });
    // control: one save
    seedCloud(); cloud.dayPlans = JSON.stringify({ '2026-09-22': { Renova: ['c2'] } });
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await S.page.evaluate(async () => { dayPlans['2026-09-22'].Renova = ['c2', 'c3']; return persist('dayPlans'); });
    await A.page.evaluate(async () => { dayPlans['2026-09-23'] = { Mariam: ['c1'] }; return persist('dayPlans'); });
    const dp2 = parse(cloud.dayPlans) || {};
    check('D1-control. one day-plan save from the same stale phone keeps it', JSON.stringify((dp2['2026-09-22'] || {}).Renova) === JSON.stringify(['c2', 'c3']), { dp2 });
    await A.ctx.close(); await S.ctx.close();
  }
  check('no page errors', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
