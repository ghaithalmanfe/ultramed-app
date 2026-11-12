// Full backup to this device (supervisor, v120). Export → "Full backup" reads
// every document of the cloud collection, part by part, writes ONE file on the
// phone and nothing to the cloud. Checked here: every key — the visit months,
// the sales lines, the daily backups, photos, team, targets, links, settings,
// logs — is in the file byte for byte; a failed read of any part gives no file
// and names the part; this phone's unsent changes (the outbox) are reported and
// kept apart in the file; the file's per-part sha256 and counts pass
// scripts/backup/verify.js; only the supervisor sees and uses it (screen and
// functions); the file restores into an empty TEST cloud
// (scripts/backup/restore.js) identical key by key, and the app opens the
// restored cloud with the same figures; the production Firestore adapter (a
// fake Firestore here); a large account (30,000 ERP lines, 20 visit months, 12
// daily backups, photos) inside a phone's budget with a 4× slower CPU; Arabic.
// Port 8231.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const ROOT = path.join(__dirname, '..', '..');
const tryReq = p => { try{ return require(p); }catch(e){ return null; } };
const VERIFY_JS = path.join(ROOT, 'scripts', 'backup', 'verify.js'), RESTORE_JS = path.join(ROOT, 'scripts', 'backup', 'restore.js');
const verifyLib = tryReq(VERIFY_JS), restoreLib = tryReq(RESTORE_JS);
const PORT = 8231, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'um-full-backup-'));
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info).slice(0, 900):'')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
// placeholder addresses only — the repository is public
const EMAIL = { [M]: 'rep1@example.com', [R]: 'rep2@example.com', [G]: 'supervisor@example.com' };
const STAFF = () => J([{ name: M, role: 'rep', email: EMAIL[M] }, { name: R, role: 'rep', email: EMAIL[R] }, { name: G, role: 'supervisor', email: EMAIL[G], sells: false }]);

// ---------- the fake cloud: key → {value: stored string, updated: ms|null} ----------
const cloud = {};
const stats = { reads: 0, writes: 0, lists: 0, queries: [] };
const mode = { failGet: null, goneGet: null, failSet: null, failList: false, failQuery: null };
const setDoc = (k, v, u) => { cloud[k] = { value: v, updated: u == null ? Date.now() : u }; };
// window.storage as the other harnesses give it (strings only)
const api = {
  get: async k => { stats.reads++; if(mode.failGet && mode.failGet(k)) throw new Error('boom-get'); if(mode.goneGet && mode.goneGet(k)) return null; return own(cloud, k) ? cloud[k].value : null; },
  set: async (k, v) => { if(mode.failSet && mode.failSet(k)) throw new Error('boom-set'); stats.writes++; setDoc(k, v); return true; },
  setMany: async entries => { if(entries.some(([k]) => mode.failSet && mode.failSet(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { stats.writes++; setDoc(k, v); }); return true; },
  del: async k => { stats.writes++; delete cloud[k]; return true; },
  list: async p => { stats.lists++; if(mode.failList) throw new Error('boom-list'); return Object.keys(cloud).filter(k => k.startsWith(p)).sort(); },
};
// the Firestore adapter's view of the same cloud (01-config.js runs against a fake firebase)
const fsApi = {
  get: async k => { stats.reads++; if(mode.failGet && mode.failGet(k)) throw new Error('boom-get'); return own(cloud, k) ? { value: cloud[k].value, updated: cloud[k].updated } : null; },
  set: async (k, d) => { if(mode.failSet && mode.failSet(k)) throw new Error('boom-set'); stats.writes++; setDoc(k, d && d.value, d && d.updated); return true; },
  setMany: async ops => { if(ops.some(([k]) => mode.failSet && mode.failSet(k))) throw new Error('boom-set'); ops.forEach(([k, d]) => { stats.writes++; setDoc(k, d && d.value, d && d.updated); }); return true; },
  del: async k => { stats.writes++; delete cloud[k]; return true; },
  query: async q => {
    stats.queries.push(q);
    if(mode.failQuery && mode.failQuery(q)) throw new Error('boom-query');
    let keys = Object.keys(cloud).sort();
    (q.f || []).forEach(([op, v]) => { keys = keys.filter(k => op === '>=' ? k >= v : op === '<' ? k < v : op === '>' ? k > v : op === '<=' ? k <= v : op === '==' ? k === v : true); });
    if(q.a != null) keys = keys.filter(k => k > q.a);
    if(q.l != null) keys = keys.slice(0, q.l);
    stats.reads += keys.length;
    return keys.map(k => ({ id: k, value: cloud[k].value, updated: cloud[k].updated }));
  },
};
const snapCloud = () => JSON.parse(JSON.stringify(cloud));
function fillCloud(src){ Object.keys(cloud).forEach(k => { delete cloud[k]; }); Object.keys(src).forEach(k => { cloud[k] = { value: src[k].value, updated: src[k].updated == null ? null : src[k].updated }; }); }

// ---------- a small account holding every kind of record ----------
const J = JSON.stringify;
const SEEDS = { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true };
const ROW = (d, doc, cust, net, sm, brand) => [d, doc, 0, (brand || 'Intensiv') + ' Ortho-Strips', 1, net, net, 0, sm, brand || 'Intensiv', cust, 'Clinics', 0, ''];
const repMap = { 'Mariam Zohair': M, 'Renova Ayman': R };
const dataUrl = (seed, n) => 'data:image/jpeg;base64,' + Buffer.from(Array.from({ length: n }, (_, i) => (i * 31 + seed * 7) % 256)).toString('base64');
function smallAccount(){
  const out = {}, put = (k, v, u) => { out[k] = { value: typeof v === 'string' ? v : J(v), updated: u == null ? 1762800000000 : u }; };
  const C = (id, name, rep, docs) => ({ id, name, rep, cls: 'B', area: 'Salmiya', doctors: docs || [] });
  const clinics = [C('c1', 'عيادة النور — Al Noor Dental', M, [{ id: 'd1', name: 'Dr. Sara Al-Ali' }, { id: 'd2', name: 'د. خالد' }]),
    C('c2', 'Bayan Dental Center 🦷', R, [{ id: 'd3', name: 'Dr. Omar' }]), C('c3', 'Dental 8 Clinic', M)]
    .concat(Array.from({ length: 14 }, (_, i) => C('f' + i, 'Filler Clinic ' + i, i % 2 ? M : R)));
  put('clinics', clinics, 1762810000000);
  put('staff', STAFF());
  put('products', [{ id: 'WP-450ME', name: 'Waterpik Cordless Plus', brand: 'Waterpik', price: 30, stock: true }, { id: 'TP-1', name: 'Tepe Interdental', brand: 'Tepe', price: 2 }]);
  const v = (id, date, cid, rep, extra) => Object.assign({ id, clinicId: cid, rep, date, type: 'visit', doctorIds: [], notes: 'ملاحظة — note ' + id }, extra || {});
  put('visits', [v('v1', '2026-11-02', 'c1', M, { doctorIds: ['d1'], photos: [{ id: 'ph1', thumb: dataUrl(1, 60) }] }), v('v2', '2026-11-03', 'c2', R), v('v3', '2026-11-04', 'c3', M), v('v4', '2026-11-05', 'c1', M)]);
  put('visitsArch:2026-09', [v('a1', '2026-09-02', 'c1', M), v('a2', '2026-09-10', 'c2', R), v('a3', '2026-09-20', 'c3', M)]);
  put('visitsArch:2026-10', [v('b1', '2026-10-02', 'c1', M), v('b2', '2026-10-12', 'c2', R), v('b3', '2026-10-22', 'c3', M)]);
  put('visitsIndex', { months: { '2026-09': { n: 3, rev: 1 }, '2026-10': { n: 3, rev: 2 } }, v: 1, updated: 1762800000000 });
  put('tasks', [{ id: 't1', title: 'Send the Tepe price list', rep: M, due: '2026-11-12', done: false }, { id: 't2', title: 'Call Dr. Omar', rep: R, due: '2026-11-13', done: true }]);
  put('events', [{ id: 'e1', kind: 'request', rep: M, at: '2026-11-03T08:00:00.000Z', text: 'Stand at Bayan' }]);
  put('dayPlans', { '2026-11-11': { [M]: [{ clinicId: 'c1', at: '2026-11-11T05:00:00.000Z' }], [R]: [{ clinicId: 'c2' }] }, '2026-11-10': { [M]: [] } });
  put('recycleBin', { clinics: [Object.assign({ _deletedAt: 1762000000000, _label: 'Old Clinic' }, C('cx', 'Old Clinic', M))], products: [], visits: [] });
  put('tombs', { visits: {}, tasks: {}, clinics: { cx: 1762000000000 }, events: {}, dayPlans: {}, doctors: {} });
  put('benchmarks', { maxDiscount: 15, kpi: { visitsPerDay: 6 } });
  put('targets', { [M]: { revenue: 1000, month: '2026-11', brands: { Intensiv: 400 } }, [R]: { revenue: 900, month: '2026-11' }, _history: { '2026-10': { [M]: { revenue: 950 } } } });
  put('categoryGuides', { Waterpik: { how: 'Show the flosser', why: 'Gum health' } });
  put('erpMap', { 'Al Noor Dental Co': 'c1', 'Marketing Philips': '@ignore' });
  put('erpMapLog', [{ at: '2026-11-01T08:00:00.000Z', by: G, name: 'Al Noor Dental Co', to: 'c1' }]);
  put('erpNotes', { c2: 'Budget cycle in January' });
  put('rxTypes', { rev: 2, types: [{ id: 'fast', name: 'Ultramed fast moving products', active: true }, { id: 'tepe', name: 'Tepe prescription', active: true }] });
  put('repairLog', [{ at: '2026-11-01T08:00:00.000Z', kind: 'from-phone-copy', doctors: [] }]);
  put('mailLog', { last: { kind: 'morning', sent: 3 }, history: [{ kind: 'morning', sent: 3 }, { kind: 'evening', sent: 3 }] });
  put('chat', [{ id: 'm1', who: M, text: 'صباح الخير 👋', ts: 1762800000000 }]);
  put('memories', [{ id: 'ph2', thumb: dataUrl(2, 60), cap: 'Stand', who: R, ts: 1762800000000 }]);
  put('photo:ph1', dataUrl(3, 6000)); put('photo:ph2', dataUrl(4, 5000));
  const OCT = [ROW('2026-10-05', 'SINV1', 'Al Noor Dental Co', 25, 'Mariam Zohair'), ROW('2026-10-06', 'SINV2', 'Bayan Dental Center', 30, 'Renova Ayman'),
    ROW('2026-10-07', 'SINV3', 'Dental 8 Clinic', 12, 'Mariam Zohair'), ROW('2026-10-08', 'SINV4', 'Al Noor Dental Co', 8, 'Mariam Zohair', 'Tepe')];
  const NOV = [ROW('2026-11-02', 'SINV5', 'Al Noor Dental Co', 40, 'Mariam Zohair'), ROW('2026-11-03', 'SINV6', 'Bayan Dental Center', 15, 'Renova Ayman')];
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: repMap, seeds: SEEDS, periods: [
    { id: 'oct', from: '2026-10-01', to: '2026-10-31', net: 75, rowCount: OCT.length, repMap, rev: 3, rows: OCT },
    { id: 'nov', from: '2026-11-01', to: '2026-11-08', net: 55, rowCount: NOV.length, repMap, rev: 1, rows: NOV }] }, 3);   // 3 lines per chunk: several chunks
  put('erpSales', sp.index); Object.keys(sp.docs).forEach(k => put(k, sp.docs[k]));
  put('erpRows:oct:2:0', [ROW('2026-10-05', 'SINV1', 'Al Noor Dental Co', 25, 'Mariam Zohair')], 1762000000000);   // a replaced version, kept a week
  const snap = day => ({ clinics, products: [], visits: [], visitsMonths: { '2026-09': 3, '2026-10': 3 }, tasks: [], erpIndex: sp.index, ts: day + 'T06:00:00.000Z' });
  put('snap_2026-11-09', snap('2026-11-09')); put('snap_2026-11-10', snap('2026-11-10'));
  put('someFutureDoc', { a: 1, note: 'a document no data set claims yet' });
  put('plainNote', 'not JSON — kept as stored');
  return out;
}
// ---------- a large account: 30,000 ERP lines, 20 visit months, 12 daily backups, photos ----------
function bigAccount(scale){
  scale = scale || 1;
  const out = {}, put = (k, v) => { out[k] = { value: typeof v === 'string' ? v : J(v), updated: 1762800000000 }; };
  const reps = [M, R], sm = ['Mariam Zohair', 'Renova Ayman'];
  const clinics = Array.from({ length: 450 }, (_, i) => ({ id: 'bc' + i, name: (i % 3 ? 'Clinic ' : 'عيادة ') + i + ' Dental', rep: reps[i % 2], cls: 'ABC'[i % 3], area: 'Hawalli',
    phone: '000-' + (1000 + i), notes: 'Synthetic clinic ' + i,   // not a phone number
    doctors: [0, 1, 2].map(j => ({ id: 'bd' + i + '_' + j, name: (j ? 'Dr. ' : 'د. ') + 'Name ' + i + '-' + j, title: 'Dentist', phone: '', birthday: '', cadence: '', notes: '', handovers: [] })) }));
  put('clinics', clinics);
  put('staff', STAFF());
  const products = Array.from({ length: 600 }, (_, i) => ({ id: 'P' + i, name: 'Product ' + i + ' — interdental brush size ' + (i % 8), brand: ['Tepe', 'Waterpik', 'Intensiv', 'Philips Sonicare'][i % 4], price: 1 + (i % 50), stock: true, cat: 'Category ' + (i % 12) }));
  put('products', products);
  const visit = (id, date, ci) => ({ id, clinicId: 'bc' + ci, rep: reps[ci % 2], date, ts: Date.parse(date + 'T09:00:00Z'), type: 'visit',
    doctorIds: ['bd' + ci + '_0'], doctorNames: { ['bd' + ci + '_0']: 'Dr. Name ' + ci + '-0' }, outcome: 'positive', products: ['P' + (ci % 600)],
    notes: 'Discussed the interdental range and the flosser; asked for samples; follow-up next week. ' + 'ملاحظات الزيارة '.repeat(4) });
  const months = []; for(let y = 2025, m = 3; months.length < 20; m++){ if(m > 12){ m = 1; y++; } months.push(y + '-' + String(m).padStart(2, '0')); }
  const idx = { months: {}, v: 1, updated: 1762800000000 };
  let vn = 0;
  months.forEach(mo => {
    const arr = Array.from({ length: 450 }, (_, i) => visit('bv' + (vn++), mo + '-' + String(1 + (i % 28)).padStart(2, '0'), (i * 7) % 450));
    put('visitsArch:' + mo, arr); idx.months[mo] = { n: arr.length, rev: 1 };
  });
  const live = Array.from({ length: 300 }, (_, i) => visit('bv' + (vn++), '2026-11-' + String(1 + (i % 10)).padStart(2, '0'), (i * 11) % 450));
  put('visits', live); put('visitsIndex', idx);
  const periods = ['2026-08', '2026-09', '2026-10'].map((mo, pi) => {
    const rows = Array.from({ length: 10000 }, (_, i) => [mo + '-' + String(1 + (i % 28)).padStart(2, '0'), 'SINV' + (pi * 100000 + i), i % 37 ? 0 : 1,
      'Product ' + (i % 600) + ' — interdental brush size ' + (i % 8), 1 + (i % 4), 10 + (i % 90), 9 + (i % 80), 0, sm[i % 2], ['Tepe', 'Waterpik', 'Intensiv', 'Philips Sonicare'][i % 4], 'Clinic ' + (i % 450) + ' Dental', 'Clinics', 0, '']);
    return { id: 'big' + mo, from: mo + '-01', to: mo + '-28', net: rows.length, rowCount: rows.length, repMap, rev: 1, rows };
  });
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: repMap, seeds: SEEDS, periods });
  put('erpSales', sp.index); Object.keys(sp.docs).forEach(k => put(k, sp.docs[k]));
  for(let d = 0; d < 12; d++){
    const day = '2026-10-' + String(31 - d).padStart(2, '0');
    put('snap_' + day, { clinics, products, visits: live, visitsMonths: {}, tasks: [], erpIndex: sp.index, ts: day + 'T06:00:00.000Z' });
  }
  for(let i = 0; i < 40 * scale; i++) put('photo:big' + i, dataUrl(i, 220000));
  put('targets', { [M]: { revenue: 1000, month: '2026-11' }, [R]: { revenue: 1000, month: '2026-11' } });
  put('tombs', { visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} });
  return out;
}

// ---------- the fake firebase the production adapter (01-config.js) runs on ----------
function fakeFirebase(){
  const ID = '__name__';
  const snapOf = (id, rec) => ({ id, exists: !!rec, data: () => rec ? { value: rec.value, updated: rec.updated } : undefined });
  class Query {
    constructor(f, a, l){ this.f = f || []; this.a = a == null ? null : a; this.l = l == null ? null : l; }
    where(field, op, v){ return new Query(this.f.concat([[op, v]]), this.a, this.l); }
    orderBy(){ return new Query(this.f, this.a, this.l); }
    startAfter(v){ return new Query(this.f, v, this.l); }
    limit(n){ return new Query(this.f, this.a, n); }
    async get(opts){
      const docs = await window.__fsQuery({ f: this.f, a: this.a, l: this.l, source: (opts && opts.source) || null });
      const arr = docs.map(d => snapOf(d.id, d));
      return { docs: arr, size: arr.length, empty: !arr.length, forEach: fn => arr.forEach(fn) };
    }
  }
  class Col extends Query {
    doc(id){ return { id, get: async () => snapOf(id, await window.__fsGet(id)), set: async d => { await window.__fsSet(id, d); }, delete: async () => { await window.__fsDel(id); } }; }
  }
  const db = {
    collection: () => new Col(),
    batch(){ const ops = []; return { set(ref, d){ ops.push([ref.id, d]); }, async commit(){ await window.__fsSetMany(ops); } }; },
    async runTransaction(fn){ const w = []; const tx = { get: async ref => snapOf(ref.id, await window.__fsGet(ref.id)), set(ref, d){ w.push([ref.id, d]); } }; const r = await fn(tx); if(w.length) await window.__fsSetMany(w); return r; },
  };
  let user = null; const subs = [];
  const auth = {
    get currentUser(){ return user; },
    onAuthStateChanged(cb){ subs.push(cb); setTimeout(() => cb(user), 0); return () => {}; },
    async signInWithEmailAndPassword(email){ user = { email }; subs.forEach(cb => { try{ cb(user); }catch(e){} }); return { user }; },
    async signOut(){ user = null; subs.forEach(cb => { try{ cb(null); }catch(e){} }); },
  };
  window.firebase = { initializeApp(){}, firestore: Object.assign(() => db, { FieldPath: { documentId: () => ID } }), auth: Object.assign(() => auth, { EmailAuthProvider: { credential: () => ({}) } }) };
}
function fakeClock(){
  const off = new Date(2026, 10, 11, 10, 0, 0).getTime() - Date.now();   // 11 Nov 2026, ticking
  const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
}
function genericStorage(){
  window.storage = {
    kind: 'test-cloud',
    get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
    set: async (k, v) => window.__cSet(k, v),
    setMany: async entries => window.__cSetMany(entries),
    delete: async k => window.__cDel(k),
    list: async p => ({ keys: await window.__cList(p) }),
  };
}

// ---------- page helpers ----------
const errors = [], dialogs = [];
let downloads = 0, nDl = 0;
async function newContext(browser, kind){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  if(kind === 'generic'){
    await ctx.exposeFunction('__cGet', api.get); await ctx.exposeFunction('__cSet', api.set); await ctx.exposeFunction('__cSetMany', api.setMany);
    await ctx.exposeFunction('__cDel', api.del); await ctx.exposeFunction('__cList', api.list);
    await ctx.addInitScript(genericStorage);
  } else {
    await ctx.exposeFunction('__fsGet', fsApi.get); await ctx.exposeFunction('__fsSet', fsApi.set); await ctx.exposeFunction('__fsSetMany', fsApi.setMany);
    await ctx.exposeFunction('__fsDel', fsApi.del); await ctx.exposeFunction('__fsQuery', fsApi.query);
    await ctx.addInitScript(fakeFirebase);
  }
  await ctx.addInitScript(fakeClock);
  return ctx;
}
async function newPage(ctx, kind){
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(kind + ': ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|full backup/i.test(m.text())) errors.push(kind + ' console: ' + m.text()); });
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  page.on('download', () => { downloads++; });
  return page;
}
async function prep(page, local){
  await page.goto(URL); await page.waitForTimeout(120);
  await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local || null);
  await page.goto(URL); await page.waitForTimeout(250);
}
const loaded = page => page.waitForFunction(() => typeof currentUser !== 'undefined' && !!currentUser && typeof _bootLoaded !== 'undefined' && _bootLoaded, null, { timeout: 90000 });
async function bootA(page, who, role, local){
  await prep(page, local);
  await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role });
  await loaded(page); await page.waitForTimeout(500);
}
async function bootB(page, who, local){
  await prep(page, local);
  await page.evaluate(e => firebase.auth().signInWithEmailAndPassword(e, 'pw'), EMAIL[who]);
  await loaded(page); await page.waitForTimeout(600);
}
// Export → Full backup, and wait for the file or the refusal
async function openBackup(page, ms){
  return page.evaluate(async ms => {
    const sl = t => new Promise(r => setTimeout(r, t));
    openExport(); await sl(80);
    const btn = [...document.querySelectorAll('#modalInner button')].find(b => /Full backup|نسخة (احتياطية )?كاملة/.test(b.textContent));
    if(!btn) return { err: 'no button' };
    btn.click();
    const t0 = Date.now();
    while(Date.now() - t0 < ms && !document.querySelector('[data-backup-download], [data-backup-failed]')) await sl(40);
    const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    return { ready: !!document.querySelector('[data-backup-download]'), failed: !!document.querySelector('[data-backup-failed]'),
      text: txt(document.getElementById('modalInner')), held: typeof _fullBackup !== 'undefined' && !!_fullBackup,
      sets: [...document.querySelectorAll('#fullBackupBody [data-set]')].map(e => e.dataset.set),
      pending: txt(document.querySelector('[data-backup-pending]')), ms: Date.now() - t0 };
  }, ms || 60000);
}
async function download(page){
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-backup-download]')]);
  const p = path.join(TMP, 'backup-' + (++nDl) + '.json'); await dl.saveAs(p);
  const text = fs.readFileSync(p, 'utf8');
  let file = null; try{ file = JSON.parse(text); }catch(e){}
  return { path: p, name: dl.suggestedFilename(), text, file };
}
async function noDownloadFrom(page, fn){
  const before = downloads;
  await page.evaluate(fn).catch(() => {});
  await page.waitForTimeout(900);
  return downloads === before;
}
function compareFile(file, snap){
  const data = (file && file.data) || {};
  const keys = Object.keys(snap);
  return { missing: keys.filter(k => !own(data, k)), differ: keys.filter(k => own(data, k) && (data[k] || {}).value !== snap[k].value), extra: Object.keys(data).filter(k => !own(snap, k)) };
}
function runNode(script, args){ const r = spawnSync(process.execPath, [script].concat(args), { encoding: 'utf8', cwd: ROOT, timeout: 300000 }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; }
const figures = page => page.evaluate(() => ({ clinics: clinics.length, doctors: clinics.reduce((s, c) => s + ((c && c.doctors) || []).length, 0), visits: visits.length,
  lines: erpPeriods().reduce((s, p) => s + ((p && p.rows) || []).length, 0), tasks: tasks.length, staff: staff.length, products: products.length, events: events.length }));
const latinLeft = page => page.evaluate(() => {
  const root = document.getElementById('modalInner'); if(!root) return ['(no sheet)'];
  const c = root.cloneNode(true); c.querySelectorAll('[data-notr], [dir="auto"], script, style').forEach(e => e.remove());
  return (c.textContent.replace(/\b(ERP|DSR|KPI|KB|MB|GB|SHA-256|sha256|JSON|Google Drive)\b/g, '').match(/[A-Za-z]{2,}/g) || []);
});

// The large account in a browser of its own: the V8 heap capped at heapMB (a
// phone's tab budget), the CPU 4× slower, the production adapter (fake
// Firestore). Measures the JS heap while the backup reads, and after it.
async function bigRun(heapMB, scale){
  fillCloud(bigAccount(scale));
  const out = { bytes: Object.values(cloud).reduce((s, d) => s + Buffer.byteLength(d.value, 'utf8'), 0), crashed: false };
  const opts = launchOpts();
  opts.args = (opts.args || []).concat(heapMB ? ['--js-flags=--max-old-space-size=' + heapMB] : []);
  const br = await chromium.launch(opts);
  try{
    const ctx = await newContext(br, 'firestore');
    const pg = await newPage(ctx, 'big');
    pg.on('crash', () => { out.crashed = true; });
    await bootB(pg, G);
    const cdp = await ctx.newCDPSession(pg);
    const heap = async () => (await cdp.send('Runtime.getHeapUsage')).usedSize;
    await cdp.send('HeapProfiler.collectGarbage'); await pg.waitForTimeout(300); await cdp.send('HeapProfiler.collectGarbage');
    out.base = await heap();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await pg.evaluate(() => { openExport(); setTimeout(() => { const b = [...document.querySelectorAll('#modalInner button')].find(x => /Full backup/.test(x.textContent)); if(b) b.click(); }, 60); });
    out.peak = out.base; out.done = false;
    while(Date.now() - t0 < 300000 && !out.crashed){
      try{ out.peak = Math.max(out.peak, await heap()); }catch(e){}
      out.done = await pg.evaluate(() => !!document.querySelector('[data-backup-download], [data-backup-failed]')).catch(() => false);
      if(out.done) break;
      await sleep(100);
    }
    out.ms = Date.now() - t0;
    if(out.crashed) return out;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('HeapProfiler.collectGarbage'); await pg.waitForTimeout(300); await cdp.send('HeapProfiler.collectGarbage');
    out.retained = (await heap()) - out.base;
    out.ready = await pg.evaluate(() => !!document.querySelector('[data-backup-download]'));
    if(out.ready){ const f = await download(pg); out.path = f.path; out.fileBytes = Buffer.byteLength(f.text); }
    await cdp.detach().catch(() => {});
  }catch(e){ out.error = String(e && e.message || e); if(/crash|Target closed|has been closed/i.test(out.error)) out.crashed = true; }
  finally{ await br.close().catch(() => {}); }
  return out;
}

(async()=>{
  const server = http.createServer((req,res)=>{
    const f = path.join(WWW, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
  });
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctxA = await newContext(browser, 'generic');
  const page = await newPage(ctxA, 'A');

  // ===== 1) every kind of record is in the file, byte for byte; nothing is written =====
  fillCloud(smallAccount());
  await bootA(page, G, 'supervisor');
  const before = snapCloud(), w0 = stats.writes;
  let r = await openBackup(page);
  check('supervisor: Export offers the full backup, and the read finishes with a file to download', r.ready && !r.failed && !r.err, r);
  const f1 = r.ready ? await download(page) : {};
  const cmp = compareFile(f1.file, before);
  check('every cloud document is in the file with its value exactly as stored — daily backups, sales lines, every visit month, photos included',
    !!f1.file && !cmp.missing.length && !cmp.differ.length, cmp);
  check('the file invents no document', !!f1.file && !cmp.extra.length, cmp.extra);
  ['clinics', 'visits', 'visitsIndex', 'visitsArch:2026-09', 'visitsArch:2026-10', 'erpSales', 'erpRows:oct:3:0', 'erpRows:oct:2:0', 'snap_2026-11-09', 'snap_2026-11-10',
   'tombs', 'recycleBin', 'staff', 'targets', 'erpMap', 'erpMapLog', 'products', 'events', 'dayPlans', 'rxTypes', 'benchmarks', 'chat', 'memories', 'photo:ph1', 'photo:ph2',
   'tasks', 'categoryGuides', 'erpNotes', 'repairLog', 'mailLog', 'someFutureDoc', 'plainNote'].forEach(k =>
    check(`in the file: ${k}`, !!f1.file && own(f1.file.data, k) && f1.file.data[k].value === before[k].value));
  check('nothing was written to the cloud while backing up', stats.writes === w0 && JSON.stringify(snapCloud()) === JSON.stringify(before), { writes: stats.writes - w0 });
  const shownSets = r.sets || [];
  ['visits', 'clinics', 'doctors', 'tasks', 'events', 'dayPlans', 'erpSales', 'erpMap', 'targets', 'staff', 'products', 'rxTypes', 'categoryGuides', 'erpNotes', 'benchmarks',
   'recycleBin', 'tombs', 'photos', 'chat', 'memories', 'logs', 'snapshots', 'other:someFutureDoc', 'other:plainNote'].forEach(s =>
    check(`the screen lists the data set "${s}"`, shownSets.includes(s), shownSets));
  check('the file name says what and when (ultramed-full-backup-YYYY-MM-DD-HHMM.json)', /^ultramed-full-backup-2026-11-11-\d{4}\.json$/.test(f1.name || ''), f1.name);
  // integrity: per-part counts and a sha256 inside the file, checked by the script
  const fm = f1.file || {};
  check('the file carries a manifest: every part with its size, sha256 and record counts', !!(fm.manifest && Array.isArray(fm.manifest.parts) && fm.manifest.parts.length === Object.keys(before).length
    && fm.manifest.parts.every(p => /^[0-9a-f]{64}$/.test(p.sha256 || '') && typeof p.bytes === 'number')), fm.manifest && fm.manifest.parts && fm.manifest.parts.slice(0, 2));
  check('the file carries one sha256 over the whole manifest', !!(fm.integrity && /^[0-9a-f]{64}$/.test(fm.integrity.sha256 || '')), fm.integrity);
  const part = k => ((fm.manifest && fm.manifest.parts) || []).find(p => p.key === k) || {};
  check('per-part counts: clinics 17 with 3 doctors, 4 live visits, 3 lines in a sales chunk, 2 people with a target, 3 daily-plan entries',
    J(part('clinics').counts) === J({ clinics: 17, doctors: 3 }) && J(part('visits').counts) === J({ visits: 4 }) && J(part('erpRows:oct:3:0').counts) === J({ lines: 3 })
    && (part('targets').counts || {}).people === 2 && (part('dayPlans').counts || {}).plans === 3, { clinics: part('clinics').counts, visits: part('visits').counts, chunk: part('erpRows:oct:3:0').counts, targets: part('targets').counts, dayPlans: part('dayPlans').counts });
  let vr = f1.path ? runNode(VERIFY_JS, [f1.path]) : { status: -1, out: 'no file' };
  check('scripts/backup/verify.js: the file is intact (exit 0) and it prints the counts per key', vr.status === 0 && /intact/i.test(vr.out) && /clinics/.test(vr.out) && /erpRows:oct:3:0/.test(vr.out) && /snap_2026-11-10/.test(vr.out) && /3 lines/.test(vr.out), vr.out.slice(0, 1500));

  // ===== 2) a failed read of ANY part gives no file, and names the part =====
  const failCase = async (label, setup, expect) => {
    setup();
    const res = await openBackup(page);
    mode.failGet = null; mode.goneGet = null; mode.failList = false;
    const noDl = await noDownloadFrom(page, () => downloadFullBackup());
    check(`failed read of ${label}: no file, and the screen names the part`, res.failed && !res.ready && !res.held && noDl && expect.every(x => res.text.includes(x)), { text: res.text.slice(0, 600), held: res.held, ready: res.ready });
  };
  for(const k of ['clinics', 'staff', 'targets', 'erpMap', 'tombs', 'recycleBin', 'visitsIndex', 'visitsArch:2026-09', 'erpSales', 'erpRows:nov:1:0', 'photo:ph2', 'snap_2026-11-10', 'chat', 'memories', 'rxTypes', 'someFutureDoc'])
    await failCase(k, () => { mode.failGet = x => x === k; }, [k]);
  await failCase('a document listed, then gone when read', () => { mode.goneGet = x => x === 'events'; }, ['events']);
  await failCase('the list of documents', () => { mode.failList = true; }, ['list']);
  check('a refused read wrote nothing either', JSON.stringify(snapCloud()) === JSON.stringify(before));

  // ===== 3) this phone's unsent changes (the outbox) are reported, and kept apart in the file =====
  const localTasks = JSON.parse(before.tasks.value).concat([{ id: 't9', title: 'Typed offline, not sent yet', rep: G, due: '2026-11-14', done: false }]);
  mode.failSet = k => k === 'tasks';   // the cloud refuses the upload: the change stays in this phone's outbox
  await bootA(page, G, 'supervisor', { um_outbox: J(['tasks']), 'um_mirror:tasks': J(localTasks) });
  const ob0 = await page.evaluate(() => outboxList());
  r = await openBackup(page);
  const f3 = r.ready ? await download(page) : {};
  mode.failSet = null;
  check('outbox: the screen says this phone holds changes the cloud does not have, and names them (Tasks)', !!r.pending && /Tasks|المهام/.test(r.pending), { pending: r.pending, ob0 });
  check('outbox: the file keeps this phone\'s copy apart (pending), the cloud copy stays the cloud\'s', !!f3.file && own(f3.file.pending || {}, 'tasks') && f3.file.pending.tasks.value === J(localTasks) && f3.file.data.tasks.value === before.tasks.value,
    f3.file && { pending: Object.keys(f3.file.pending || {}), data: f3.file.data && f3.file.data.tasks && f3.file.data.tasks.value.slice(0, 80) });
  const ob1 = await page.evaluate(() => outboxList());
  check('outbox: the backup sent nothing and left the queue as it was', J(ob1) === J(['tasks']) && JSON.stringify(snapCloud()) === JSON.stringify(before), ob1);
  vr = f3.path ? runNode(VERIFY_JS, [f3.path]) : { status: -1, out: 'no file' };
  check('outbox: verify.js passes and lists the pending change as NOT part of the cloud copy', vr.status === 0 && /pending/i.test(vr.out) && /tasks/.test(vr.out), vr.out.slice(-700));

  // ===== 4) only the supervisor =====
  await bootA(page, M, 'rep');
  const repUi = await page.evaluate(async () => { openExport(); await new Promise(r => setTimeout(r, 80)); return document.getElementById('modalInner').innerText; });
  check('rep: the Export screen has no full backup', !/Full backup|نسخة احتياطية كاملة|نسخة كاملة/.test(repUi), repUi.slice(-400));
  const reads0 = stats.reads, lists0 = stats.lists;
  const repOpen = await page.evaluate(async () => { try{ await openFullBackup(); }catch(e){} await new Promise(r => setTimeout(r, 300)); return { sheet: !!document.getElementById('fullBackupBody'), held: typeof _fullBackup !== 'undefined' && !!_fullBackup }; });
  check('rep: openFullBackup() opens nothing and reads nothing', !repOpen.sheet && !repOpen.held && stats.reads === reads0 && stats.lists === lists0, { repOpen, reads: stats.reads - reads0 });
  const repRead = await page.evaluate(async () => { try{ const x = await readCloudForBackup(() => {}); return { got: !!x, docs: x && x.docs ? Object.keys(x.docs).length : null }; }catch(e){ return { refused: true }; } });
  check('rep: the cloud reader refuses a rep and reads nothing', stats.reads === reads0 && stats.lists === lists0 && !(repRead.docs > 0), { repRead, reads: stats.reads - reads0, lists: stats.lists - lists0 });
  check('rep: downloadFullBackup() gives no file', await noDownloadFrom(page, () => downloadFullBackup()));
  // the supervisor reads, signs out; a rep signs in on the same phone
  await bootA(page, G, 'supervisor');
  r = await openBackup(page);
  await page.evaluate(async () => { closeModal(); switchUser(); await selectUser('Mariam', 'rep'); });
  await loaded(page);
  check('the supervisor\'s file is not handed to a rep who signs in after him on the same phone', r.ready && await noDownloadFrom(page, () => downloadFullBackup()));

  // ===== 5) restore into an empty TEST cloud, identical key by key =====
  check('scripts/backup/restore.js and verify.js exist', !!restoreLib && !!verifyLib);
  if(restoreLib && f1.file){
    const store = {};
    let rr = null, rerr = null;
    try{ rr = await restoreLib.restoreBackup(f1.file, restoreLib.memoryTestCloud(store)); }catch(e){ rerr = String(e.message || e); }
    const keysB = Object.keys(before).sort(), keysS = Object.keys(store).sort();
    const bad = keysB.filter(k => !store[k] || store[k].value !== before[k].value);
    check('restore: every key back in an empty test cloud, byte for byte, and nothing else', !rerr && rr && J(keysB) === J(keysS) && !bad.length
      && keysB.every(k => Buffer.compare(Buffer.from(store[k].value, 'utf8'), Buffer.from(before[k].value, 'utf8')) === 0), { rerr, bad: bad.slice(0, 5), extra: keysS.filter(k => !own(before, k)) });
    check('restore: each document comes back with the time stored in the file (none from this storage: null, never invented)', keysB.every(k => store[k] && store[k].updated === f1.file.data[k].updated && f1.file.data[k].updated === null));
    let refused = null; try{ await restoreLib.restoreBackup(f1.file, restoreLib.memoryTestCloud({ clinics: { value: '[]', updated: 1 } })); }catch(e){ refused = String(e.message || e); }
    check('restore: a test cloud that already holds data is refused', !!refused && /not empty|already holds/i.test(refused), refused);
    const busy = { clinics: { value: '[]', updated: 1 }, keepMe: { value: '"x"', updated: 2 } };
    let forced = null; try{ forced = await restoreLib.restoreBackup(f1.file, restoreLib.memoryTestCloud(busy), { force: true }); }catch(e){ forced = { err: String(e.message || e) }; }
    check('restore --force: written over, and a document the backup does not have is left and named', forced && !forced.err && busy.clinics.value === before.clinics.value && busy.keepMe.value === '"x"' && (forced.kept || []).includes('keepMe'), forced);
    let notTest = null; try{ await restoreLib.restoreBackup(f1.file, { kind: 'firestore', list: async () => [], get: async () => null, set: async () => true }); }catch(e){ notTest = String(e.message || e); }
    check('restore: a target that is not a test cloud is refused', !!notTest && /test cloud/i.test(notTest), notTest);
    const tampered = JSON.parse(J(f1.file)); tampered.data.clinics.value = tampered.data.clinics.value.replace('Al Noor', 'Al Nour');
    let tam = null; try{ await restoreLib.restoreBackup(tampered, restoreLib.memoryTestCloud({})); }catch(e){ tam = String(e.message || e); }
    check('restore: a damaged or edited file is refused before anything is written', !!tam && /clinics/.test(tam), tam);
    // the command line
    const into = path.join(TMP, 'restored.test-cloud.json');
    let cl = runNode(RESTORE_JS, [f1.path, '--into', into]);
    let tc = null; try{ tc = JSON.parse(fs.readFileSync(into, 'utf8')); }catch(e){}
    check('restore.js CLI: into a new test-cloud file, every key identical (exit 0)', cl.status === 0 && tc && J(Object.keys(tc.docs || {}).sort()) === J(keysB) && keysB.every(k => tc.docs[k].value === before[k].value), cl.out.slice(-600));
    cl = runNode(RESTORE_JS, [f1.path, '--into', into]);
    check('restore.js CLI: a second restore into the same, now full, test cloud is refused without --force', cl.status !== 0 && /--force/.test(cl.out), cl.out.slice(-400));
    cl = runNode(RESTORE_JS, [f1.path, '--into', 'https://firestore.googleapis.com/v1/projects/ultramed-field-ops/databases/(default)/documents']);
    check('restore.js CLI: the production cloud is refused (it only writes a local test-cloud file)', cl.status !== 0 && /production|test cloud/i.test(cl.out), cl.out.slice(-400));
    cl = runNode(RESTORE_JS, [f1.path, '--into', path.join(ROOT, 'www', 'x.test-cloud.json')]);
    check('restore.js CLI: never into the published folder', cl.status !== 0 && !fs.existsSync(path.join(ROOT, 'www', 'x.test-cloud.json')), cl.out.slice(-300));
    // verify catches a damaged file and names the part
    const tp = path.join(TMP, 'tampered.json'); fs.writeFileSync(tp, J(tampered));
    vr = runNode(VERIFY_JS, [tp]);
    check('verify.js: an edited value is caught (exit 1), naming the part', vr.status === 1 && /clinics/.test(vr.out) && /sha256|changed/i.test(vr.out), vr.out.slice(-500));
    const cut = JSON.parse(J(f1.file)); delete cut.data['erpRows:nov:1:0']; fs.writeFileSync(tp, J(cut));
    vr = runNode(VERIFY_JS, [tp]);
    check('verify.js: a missing part is caught (exit 1), naming it', vr.status === 1 && /erpRows:nov:1:0/.test(vr.out), vr.out.slice(-500));
    // the restored test cloud opens in the app with the same figures
    fillCloud(before);
    await bootA(page, G, 'supervisor');
    const figA = await figures(page);
    fillCloud(tc && tc.docs ? tc.docs : {});
    await bootA(page, G, 'supervisor');
    const figB = await figures(page);
    check('the restored test cloud opens with the same figures (clinics, doctors, visits, sales lines, tasks, team, products)', J(figA) === J(figB) && figA.lines === 6 && figA.visits === 10, { figA, figB });
  }

  // ===== 6) the production adapter (Firestore) — a fake Firestore under the real 01-config.js =====
  const ctxB = await newContext(browser, 'firestore');
  const pageB = await newPage(ctxB, 'B');
  fillCloud(smallAccount());
  await bootB(pageB, G);
  const adapter = await pageB.evaluate(() => ({ fs: /Firestore/.test(String(window.storage && window.storage.list)) || typeof window.storage.scan === 'function' || typeof window.storage.dump === 'function', scan: typeof window.storage.scan === 'function' }));
  check('Firestore: the app runs on the production adapter (fake Firestore underneath)', adapter.fs, adapter);
  const beforeB = snapCloud(), wB = stats.writes; stats.queries = [];
  r = await openBackup(pageB);
  const fB = r.ready ? await download(pageB) : {};
  const cmpB = compareFile(fB.file, beforeB);
  check('Firestore: every document is in the file, daily backups included, values exactly as stored', !!fB.file && !cmpB.missing.length && !cmpB.differ.length && !cmpB.extra.length, cmpB);
  check('Firestore: the time each document was last written is kept', !!fB.file && Object.keys(beforeB).every(k => fB.file.data[k] && fB.file.data[k].updated === beforeB[k].updated));
  const paged = stats.queries.filter(q => q.l != null);
  check('Firestore: read straight from the server, range by range and page by page (never the whole collection in one answer)', paged.length >= 9 && paged.every(q => q.source === 'server') && Math.max(...paged.map(q => q.l)) <= 25,
    { queries: stats.queries.length, paged: paged.length, limits: [...new Set(stats.queries.map(q => q.l))] });
  check('Firestore: nothing written while backing up', stats.writes === wB && JSON.stringify(snapCloud()) === JSON.stringify(beforeB), stats.writes - wB);
  vr = fB.path ? runNode(VERIFY_JS, [fB.path]) : { status: -1, out: 'no file' };
  check('Firestore: verify.js passes', vr.status === 0, vr.out.slice(-500));
  if(restoreLib && fB.file){
    const storeB = {};
    let eB = null; try{ await restoreLib.restoreBackup(fB.file, restoreLib.memoryTestCloud(storeB)); }catch(e){ eB = String(e.message || e); }
    check('Firestore: restored into an empty test cloud — every key, and the time it was last written, identical', !eB && J(Object.keys(storeB).sort()) === J(Object.keys(beforeB).sort())
      && Object.keys(beforeB).every(k => storeB[k].value === beforeB[k].value && storeB[k].updated === beforeB[k].updated), eB);
  }
  mode.failQuery = q => (q.f || []).some(([op, v]) => op === '>=' && v === 'erpRows:');
  r = await openBackup(pageB);
  mode.failQuery = null;
  check('Firestore: a range the cloud does not answer (the sales lines) gives no file and names it', r.failed && !r.ready && !r.held && /erpRows:/.test(r.text) && /sales|المبيعات/i.test(r.text), r.text.slice(0, 500));
  mode.failQuery = q => (q.f || []).some(([op, v]) => op === '<' && v === 'erpRows:');
  r = await openBackup(pageB);
  mode.failQuery = null;
  check('Firestore: a failed range of single documents names the documents it holds (clinics, the team chat …)', r.failed && !r.ready && /clinics/.test(r.text) && /chat/.test(r.text), r.text.slice(0, 600));
  // a rep on the production adapter
  await pageB.evaluate(e => firebase.auth().signInWithEmailAndPassword(e, 'pw'), EMAIL[R]);
  await pageB.waitForFunction(() => currentUser && currentUser.name === 'Renova' && _bootLoaded, null, { timeout: 60000 }); await pageB.waitForTimeout(500);
  stats.queries = [];
  const repB = await pageB.evaluate(async () => { closeModal(); document.getElementById('modalInner').innerHTML = ''; try{ await openFullBackup(); }catch(e){} let read = null; try{ read = await readCloudForBackup(() => {}); }catch(e){ read = 'refused'; } return { sheet: !!document.getElementById('fullBackupBody'), read: read === 'refused' ? read : !!read }; });
  check('Firestore: a rep can neither open nor run the full read', !repB.sheet && repB.read === 'refused' && !stats.queries.some(q => q.l != null && q.l <= 25 && !(q.f || []).length), { repB, q: stats.queries.length });

  // ===== 7) a large account inside a phone's budget: a capped JS heap and a 4× slower CPU =====
  const HEAP_MB = +(process.env.BK_HEAP_MB || 384), SCALE = +(process.env.BK_SCALE || 1);
  const big = await bigRun(HEAP_MB, SCALE);
  const MB = x => Math.round(x / 1048576 * 10) / 10;
  console.log(`large account x${SCALE}: ${MB(big.bytes)} MB in the cloud, file ${big.fileBytes ? MB(big.fileBytes) : '?'} MB, ${Math.round((big.ms || 0) / 1000)} s at 4x slower CPU, JS heap cap ${HEAP_MB} MB: app open ${MB(big.base || 0)} MB, peak +${MB((big.peak || 0) - (big.base || 0))} MB, kept after the read +${MB(big.retained || 0)} MB${big.crashed ? ', THE TAB CRASHED' : ''}${big.error ? ' (' + big.error.slice(0, 120) + ')' : ''}`);
  check(`large account (30,000 ERP lines, 20 visit months, 12 daily backups, ${40 * SCALE} photos) in a phone-sized JS heap (${HEAP_MB} MB): the file is ready within 3 minutes on a 4× slower CPU, the tab never runs out of memory`,
    big.done && big.ready && !big.crashed && big.ms < 180000, { ms: big.ms, crashed: big.crashed, ready: big.ready, error: big.error });
  vr = big.path ? runNode(VERIFY_JS, [big.path, '--json']) : { status: -1, out: '{}' };
  let vj = {}; try{ vj = JSON.parse(vr.out); }catch(e){}
  const vset = id => ((vj.sets || []).find(s => s.id === id) || {});
  check(`large account: verify.js passes; 30,000 lines, 20 past months and 9,300 visits, 12 daily backups, ${40 * SCALE} photos counted`,
    vr.status === 0 && (vset('erpSales').extra || {}).lines === 30000 && vset('visits').records === 9300 && (vset('visits').extra || {}).archivedMonths === 20 && vset('snapshots').records === 12 && vset('photos').records === 40 * SCALE,
    { status: vr.status, erp: vset('erpSales'), visits: vset('visits'), snaps: vset('snapshots').records, photos: vset('photos').records, out: vr.status !== 0 ? vr.out.slice(0, 400) : undefined });
  check(`large account: the page keeps the file outside its JS memory (kept after the read: +${MB(big.retained || 0)} MB for a ${MB(big.bytes)} MB cloud)`, big.ready && big.retained < 12 * 1048576, { retainedMB: MB(big.retained || 0) });

  // ===== 8) without crypto.subtle (an old WebView): the built-in sha256 gives the same file =====
  fillCloud(smallAccount());
  await bootA(page, G, 'supervisor');
  await page.evaluate(() => { try{ Object.defineProperty(window.crypto, 'subtle', { value: undefined, configurable: true }); }catch(e){} });
  r = await openBackup(page);
  const f8 = r.ready ? await download(page) : {};
  vr = f8.path ? runNode(VERIFY_JS, [f8.path]) : { status: -1, out: 'no file' };
  check('without crypto.subtle the file is still made, and verify.js passes', r.ready && vr.status === 0, { ready: r.ready, out: vr.out.slice(-300) });

  // ===== 9) Arabic =====
  await bootA(page, G, 'supervisor', { ultramed_lang: 'ar' });
  r = await openBackup(page);
  let left = await latinLeft(page);
  check('Arabic: the full backup sheet is Arabic (no English left outside names and codes)', r.ready && !left.length, left.slice(0, 20));
  mode.failGet = x => x === 'erpRows:nov:1:0';
  r = await openBackup(page);
  mode.failGet = null;
  left = await latinLeft(page);
  check('Arabic: the refusal is Arabic and names the part', r.failed && /erpRows:nov:1:0/.test(r.text) && !left.length, { left: left.slice(0, 20), text: r.text.slice(0, 300) });
  mode.failSet = k => k === 'tasks';
  await bootA(page, G, 'supervisor', { ultramed_lang: 'ar', um_outbox: J(['tasks']), 'um_mirror:tasks': J(localTasks) });
  r = await openBackup(page);
  mode.failSet = null;
  left = await latinLeft(page);
  check('Arabic: the unsent-changes warning is Arabic', r.ready && /المهام/.test(r.pending) && !left.length, { left: left.slice(0, 20), pending: r.pending });

  // ===== 10) the restore is never reachable from the app =====
  const inApp = await page.evaluate(() => ({ fn: typeof restoreBackup !== 'undefined' || typeof restoreFullBackup !== 'undefined', btn: /restore the full|استرجاع النسخة الكاملة/i.test(document.getElementById('modalInner').innerText) }));
  const srcHits = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if(e.isDirectory()) walk(p); else if(/\.(js|html|json)$/.test(e.name) && /\b(restoreBackup|restoreFullBackup|fileTestCloud|memoryTestCloud)\b|require\([^)]*scripts\/backup|ultramed-test-cloud/.test(fs.readFileSync(p, 'utf8'))) srcHits.push(path.relative(ROOT, p)); });
  walk(WWW);
  check('the restore is not in the app: no function, no button, no reference in the published folder', !inApp.fn && !inApp.btn && !srcHits.length, { inApp, srcHits });

  check('no native dialogs', dialogs.length === 0, dialogs.slice(0, 3));
  check('no page errors', errors.length === 0, errors.slice(0, 6));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  try{ fs.rmSync(TMP, { recursive: true, force: true }); }catch(e){}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
