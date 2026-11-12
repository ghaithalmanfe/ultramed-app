'use strict';
// Proof that firestore.rules blocks NO write the app makes today.
//
//  - The app's own storage adapter (window.storage, www/js/app/01-config.js)
//    is taken from the source and run against the Firestore emulator — the
//    very set / transaction / batch / delete / list calls the phones make.
//  - Each phone signs in like the app does (signInWithEmailAndPassword)
//    against the Auth emulator: real password tokens, the company domain.
//  - Every write site in the app is replayed through that adapter as each
//    role that reaches it today: rep A, rep B and the supervisor ("team"
//    sites), the supervisor alone ("supervisor" sites).
//  - The daily e-mail job runs for real (scripts/daily-report/report.js
//    run(): sign-in, batch read, mailLog write), only the e-mail sending is
//    replaced.
//  - A source scan lists every write call in www/js/app/*.js and fails on
//    any target this file does not replay (a new key needs the rules first).
// Nothing here can reach the real project: the config is swapped for a demo
// one before the code runs, and every non-local HTTP request is refused.
// Run from tests/rules: npm ci && npm test   (the scan alone: npm run scan)

// ---- no request may leave this machine (installed before any Firebase code loads) ----
const realFetch = globalThis.fetch;
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if(!LOCAL.test(url)) return Promise.reject(new Error('blocked a non-local request: ' + url));
  return realFetch(input, init);
};

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('./fixtures');
const { ROOT, WWW, PROJECT, HOST, PORT, AUTH_HOST, SUP, REP_A, REP_B, REPORTS, kuwaitDay, localDay, utcDay, snap,
  PHOTO, CHUNK, ARCH, lastMonth, clinicList, stored } = F;

const PASSWORD = 'test-password-1';
const J = JSON.stringify;
const P = (s, d) => { try{ return s == null ? d : JSON.parse(s); }catch(e){ return d; } };
const QUIET = { log(){}, info(){}, warn(){}, error(){}, debug(){} };

// ================= the source scan (no emulator needed) =================
// Every write target, as the rules know it: who writes it today.
const INVENTORY = {
  clinics: 'team', visits: 'team', visitsIndex: 'team', tasks: 'team', dayPlans: 'team', events: 'team', tombs: 'team',
  recycleBin: 'team', erpNotes: 'team', products: 'team', repairLog: 'team', chat: 'team', memories: 'team', mailLog: 'team',
  staff: 'supervisor', targets: 'supervisor', benchmarks: 'supervisor', categoryGuides: 'supervisor', erpSales: 'supervisor',
  erpMap: 'supervisor', erpMapLog: 'supervisor', rxTypes: 'supervisor',
  'visitsArch:YYYY-MM': 'team', 'photo:<id>': 'team', 'snap_YYYY-MM-DD': 'team', 'erpRows:<period>:<rev>:<n>': 'supervisor',
};
// Targets computed at run time, each resolved to inventory keys.
const DYNAMIC = [
  { file: '04-sync.js', arg: 'key', is: 'the generic save paths (persist, persistFor, storageUpdate, flushOutbox) — their callers are scanned' },
  { file: '12-reports.js', arg: 'key', is: 'persistTeam: chat | memories' },
  { file: '04-sync.js', arg: 'keyOf(doc)', is: 'visits | visitsArch:YYYY-MM (persistVisitsInner)' },
  { file: '04-sync.js', arg: 'k', is: 'erpRows chunks (the setMany fallback in persistErpSalesInner)' },
  { file: '04-sync.js', arg: 'entries', is: 'erpRows:<period>:<rev>:<n> chunks + erpSales (persistErpSalesInner)' },
  { file: '04-sync.js', arg: 'key, fn', is: 'storageUpdate → storage.update' },
  { file: '07-clinics.js', arg: 'kind', is: 'clinics | products | visits (restoreFromBin)' },
  { file: '13-exports.js', arg: 'k', is: 'clinics | products | tasks (restoreSnapshot)' },
  { file: '04-sync.js', arg: "'snap_'+", is: 'snap_YYYY-MM-DD' },
  { file: '08-team-orders.js', arg: "'photo:'+", is: 'photo:<id>' },
  { file: '12-reports.js', arg: "'photo:'+", is: 'photo:<id>' },
];
const LOCAL_ONLY = { currentUser: '03-gate.js:7 — only when Firebase is off (localStorage); never in the cloud' };
// The first argument of a call: up to the first comma or closing parenthesis
// outside brackets and quotes.
function firstArg(code, from){
  let depth = 0, q = null, i = from;
  for(; i < code.length; i++){
    const ch = code[i];
    if(q){ if(ch === '\\') i++; else if(ch === q) q = null; continue; }
    if(ch === "'" || ch === '"' || ch === '`'){ q = ch; continue; }
    if('([{'.includes(ch)) depth++;
    else if(')]}'.includes(ch)){ if(depth === 0) break; depth--; }
    else if(ch === ',' && depth === 0) break;
  }
  return code.slice(from, i).replace(/\s+/g, ' ');
}
function scanWrites(){
  const dir = path.join(WWW, 'js', 'app');
  const found = [];
  const re = /\b(persist|persistFor|persistTold|persistTeam|storageUpdate|window\.storage\.set|window\.storage\.update|window\.storage\.delete|window\.storage\.setMany)\(/g;
  for(const file of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()){
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if(/^\s*(\/\/|\*)/.test(line)) return;                                                       // a comment line
      if(/^\s*(async\s+)?function\s+(persist|persistFor|persistTold|persistTeam|storageUpdate)\s*\(/.test(line)) return; // a definition
      const code = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');                                          // messages in double quotes
      let m; re.lastIndex = 0;
      while((m = re.exec(code))){
        const arg = firstArg(code, m.index + m[0].length).trim(), at = file + ':' + (i + 1);
        const lit = arg.match(/^'([A-Za-z0-9_:]+)'$/);
        const pre = arg.match(/^'(snap_|photo:)'\s*\+/);
        if(lit) found.push({ at, call: m[1], key: lit[1] });
        else if(pre) found.push({ at, call: m[1], dynamic: "'" + pre[1] + "'+" });
        else found.push({ at, call: m[1], dynamic: arg });
      }
    });
  }
  return found;
}

// ================= the app's storage adapter, from its source =================
function adapterSource(){
  const src = fs.readFileSync(path.join(WWW, 'js', 'app', '01-config.js'), 'utf8');
  const a = src.indexOf('const FIREBASE_CONFIG = {'), b = src.indexOf('const PRODUCTS_SEED');
  assert.ok(a > 0 && b > a, '01-config.js: the Firebase config + storage adapter block was not found');
  let code = src.slice(a, b);
  const demo = { apiKey: 'demo-api-key', authDomain: '127.0.0.1', projectId: PROJECT, storageBucket: PROJECT + '.appspot.com', messagingSenderId: '0', appId: '1:0:web:0' };
  for(const [k, v] of Object.entries(demo)){
    const field = new RegExp(k + ':\\s*"[^"]*"');
    assert.ok(field.test(code), '01-config.js: FIREBASE_CONFIG.' + k + ' not found');
    code = code.replace(field, k + ': "' + v + '"');
  }
  assert.ok(!/ultramed-field-ops|AIza/.test(code), 'the real project configuration is still in the code under test');
  for(const part of ['window.storage = {', 'async get(key, _shared, opts)', 'async set(key, value)', 'async setMany(entries)', 'async update(key, fn)', 'async delete(key)', 'async list(prefix)'])
    assert.ok(code.includes(part), '01-config.js: the adapter no longer has ' + part);
  return code;
}
let firebase, ADAPTER;
const phones = [];
// One phone = one app instance with its own sign-in, running the adapter code.
function makePhone(name){
  const app = firebase.initializeApp({ apiKey: 'demo-api-key', authDomain: '127.0.0.1', projectId: PROJECT, appId: '1:0:web:0' }, name);
  const db = app.firestore(); db.useEmulator(HOST, Number(PORT));
  const auth = app.auth(); auth.useEmulator('http://' + AUTH_HOST, { disableWarnings: true });
  const ns = {
    initializeApp(cfg){ assert.equal(cfg.projectId, PROJECT); return app; },
    firestore: Object.assign(() => db, { FieldPath: firebase.firestore.FieldPath }),
    auth: Object.assign(() => auth, { EmailAuthProvider: firebase.auth.EmailAuthProvider }),
  };
  const win = { firebase: ns };
  new Function('window', 'firebase', 'console', ADAPTER)(win, ns, QUIET);
  assert.ok(win.storage && typeof win.storage.update === 'function', 'the adapter did not install window.storage');
  const phone = { name, app, db, auth, s: win.storage };
  phones.push(phone);
  return phone;
}
const AUTH_API = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
async function createLogin(email){
  const r = await fetch(`${AUTH_API}/accounts:signUp?key=demo-api-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ email, password: PASSWORD, returnSecureToken: true }) });
  assert.equal(r.status, 200, await r.text());
}

// ================= the account the phones work on =================
let env, SEED;
function appSeed(){
  const seed = F.makeSeed();
  // a sales file whose rows live in the chunk CHUNK, as the app stores it
  seed.erpSales = { periods: [{ id: 'mh1a2b3c4d', rev: 1762300000000, from: utcDay(-20), to: utcDay(-1), net: 0, rowCount: 0, repMap: {}, rowsRef: { key: 'erpRows:mh1a2b3c4d:1762300000000', chunks: 1, count: 0 } }], repMapGlobal: {} };
  return seed;
}
async function reseed(){
  SEED = appSeed();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => { const db = ctx.firestore(); const b = db.batch(); Object.keys(SEED).forEach(k => b.set(db.collection('state').doc(k), stored(SEED[k]))); await b.commit(); });
}
async function asAdmin(fn){ let out; await env.withSecurityRulesDisabled(async ctx => { out = await fn(ctx.firestore().collection('state')); }); return out; }
const storedValue = (key) => asAdmin(async col => { const d = await col.doc(key).get(); return d.exists ? d.data().value : null; });
const unseed = (...keys) => asAdmin(async col => { for(const k of keys) await col.doc(k).delete(); });

// ================= the write sites, as the app makes them =================
// mergeList: persist(key) for a merge-safe list → storageUpdate → storage.update (04-sync.js:1390/1497)
const mergeList = (s, key, item) => s.update(key, cur => { const a = P(cur, []); return J((Array.isArray(a) ? a : []).filter(x => x && x.id !== item.id).concat([item])); });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const TEAM_SITES = [
  { label: 'start-up reads: loadAll (04-sync.js:943-960), team data (12-reports.js:457), archives and backups lists (04-sync.js:497, 13-exports.js:1391), photo, mail log',
    keys: [], run: async (s) => {
      for(const k of ['clinics', 'products', 'visits', 'visitsIndex', 'tasks', 'dayPlans', 'staff', 'recycleBin', 'benchmarks', 'events', 'targets',
        'categoryGuides', 'erpSales', 'erpMap', 'erpNotes', 'rxTypes', 'tombs', 'chat', 'memories', 'mailLog', 'erpMapLog', CHUNK, ARCH, PHOTO]) await s.get(k, true);
      await s.get('erpSales', true, { server: true });
      const arch = await s.list('visitsArch:', true); assert.deepEqual(arch.keys, [ARCH]);
      const snaps = await s.list('snap_', true); assert.equal(snaps.keys.length, F.SNAP_KEYS.length);
      for(const k of snaps.keys) await s.get(k, true);
    } },
  { label: 'clinics: the merge save — saveVisit 06-log-visit.js:540, submitAddClinic 07-clinics.js:553, addDoctor 09-admin.js:607, saveNoSaleReason 07-clinics.js:704, saveEditVisit 08-team-orders.js:591',
    keys: ['clinics'], run: async (s, me) => {
      await s.get('tombs', true); // refreshTombs before every merge save
      await mergeList(s, 'clinics', { id: 'c-' + uid(), name: 'New clinic by ' + me, rep: me, cls: 'C', doctors: [{ id: 'd1', name: 'Dr. New' }] });
      await s.update('clinics', cur => J(P(cur, []).map(c => c.id === 'c-1' ? Object.assign({}, c, { noSaleReason: 'Stock full', lastVisit: kuwaitDay(0) }) : c)));
    } },
  { label: 'clinics + repairLog: restoreLostDoctors at start-up, every phone once a day (04-sync.js:272/277)',
    keys: ['clinics', 'repairLog'], run: async (s, me) => {
      await s.update('clinics', cur => J(P(cur, []).map(c => c.id === 'c-2' ? Object.assign({}, c, { doctors: c.doctors.concat([{ id: 'd-back', name: 'Dr. Back' }]) }) : c)));
      await s.update('repairLog', cur => J(P(cur, []).concat([{ at: new Date().toISOString(), by: me, kind: 'from-phone-copy', saved: true, clinics: [], doctors: [{ id: 'd-back' }] }]).slice(-50)));
    } },
  { label: 'visits: log a visit, a late visit of last month, the tidy and the month index (persistVisitsInner 04-sync.js:569/614/626)',
    keys: ['visits', 'visitsArch:YYYY-MM', 'visitsIndex'], run: async (s, me) => {
      const v = { id: uid(), clinicId: 'c-1', rep: me, date: kuwaitDay(0), ts: Date.now(), products: ['p1'], photos: [], rx: [] };
      await s.update('visits', cur => J(P(cur, []).concat([v, { id: 'stray', clinicId: 'c-3', rep: me, date: lastMonth() + '-28' }]))); // pass A (an old device left a stray)
      await s.update(ARCH, cur => J(P(cur, []).concat([{ id: uid(), clinicId: 'c-4', rep: me, date: lastMonth() + '-27' }, { id: 'stray', clinicId: 'c-3', rep: me, date: lastMonth() + '-28' }]))); // pass A2 re-home
      await s.update('visits', cur => J(P(cur, []).filter(x => x.id !== 'stray'))); // pass B tidy
      await s.update('visitsIndex', cur => { const idx = P(cur, {}) || {}; idx.months = Object.assign({}, idx.months, { [lastMonth()]: { n: 3, rev: Date.now() } }); idx.v = 1; idx.updated = Date.now(); return J(idx); }); // pass C
    } },
  { label: 'tasks: addTask 05-today-calendar.js:742, scheduleFollowUp 06-log-visit.js:571, toggleTask 05-today-calendar.js:745',
    keys: ['tasks'], run: async (s, me) => {
      await mergeList(s, 'tasks', { id: uid(), rep: me, text: 'Follow up: Test clinic 1', clinicId: 'c-1', due: kuwaitDay(3), done: false });
      await s.update('tasks', cur => J(P(cur, []).map(t => t.id === 't1' ? Object.assign({}, t, { done: true }) : t)));
    } },
  { label: 'dayPlans: togglePlanClinic 05-today-calendar.js:830, addToPlan 09-admin.js:640, saveDatePlan 05-today-calendar.js:945',
    keys: ['dayPlans'], run: async (s, me) => {
      await s.update('dayPlans', cur => { const o = P(cur, {}) || {}; const d = kuwaitDay(1); o[d] = Object.assign({}, o[d], { [me]: [{ id: 'c-1', at: new Date().toISOString() }, 'c-2'] }); return J(o); });
    } },
  { label: 'events: saveEventForm 05-today-calendar.js:265, saveClientLog / checkStand 16-kpi.js:140/153',
    keys: ['events'], run: async (s, me) => {
      await mergeList(s, 'events', { id: uid(), kind: 'issue', type: 'request', clinicId: 'c-1', rep: me, createdBy: me, at: new Date().toISOString(), text: 'Needs a stand' });
      await s.update('events', cur => J(P(cur, []).map(e => e.id === 'e1' ? Object.assign({}, e, { checks: [kuwaitDay(0)] }) : e)));
    } },
  { label: 'tombs: the delete log on every delete and restore (tomb / untomb → persistTombs 04-sync.js:1182/1196)',
    keys: ['tombs'], run: async (s) => {
      const cur = P((await s.get('tombs', true) || {}).value, {}) || {};
      cur.visits = Object.assign({}, cur.visits, { ['v-' + uid()]: Date.now() });
      await s.set('tombs', J(cur), true);
    } },
  { label: 'recycleBin: moveToBin 07-clinics.js:993 — a rep deleting her own visit (deleteVisit 08-team-orders.js:649)',
    keys: ['recycleBin'], run: async (s) => {
      const bin = P((await s.get('recycleBin', true) || {}).value, {}) || {};
      bin.visits = (bin.visits || []).concat([{ id: 'v-old', clinicId: 'c-1', _deletedAt: Date.now(), _label: 'Test clinic 1 — visit' }]);
      await s.set('recycleBin', J(bin), true);
    } },
  { label: 'erpNotes: a reason on a return or a free line — saveErpNote 07-clinics.js:651, saveErpNoteKind :661, saveRetKind :687',
    keys: ['erpNotes'], run: async (s, me) => {
      await s.set('erpNotes', J({ 'ret|INV-1|Test brush': { text: 'Damaged box', by: me, on: kuwaitDay(0), kind: 'exchange' } }), true);
    } },
  { label: 'products: "+ Add product" — submitAddProduct 10-doctors-products.js:98 (no supervisor check today)',
    keys: ['products'], run: async (s, me) => {
      const list = P((await s.get('products', true) || {}).value, []) || [];
      await s.set('products', J(list.concat([{ id: uid(), name: 'Product added by ' + me, brand: 'Other', price: 2.5 }])), true);
    } },
  { label: 'chat and memories: the team tab — persistTeam 12-reports.js:473/484 (sendChat :566, saveMemory :598)',
    keys: ['chat', 'memories'], run: async (s, me) => {
      for(const k of ['chat', 'memories']){
        const cur = P((await s.get(k, true) || {}).value, []) || [];
        await s.set(k, J(cur.concat([{ id: uid(), who: me, ts: Date.now(), text: 'hello' }])), true);
      }
    } },
  { label: 'photo: a visit photo saved, then removed from the visit — savePhotoBlob 12-reports.js:415, removeEditPhoto 08-team-orders.js:518',
    keys: ['photo:<id>'], run: async (s) => {
      const id = uid();
      await s.set('photo:' + id, 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', true);
      await s.set('photo:' + id, 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', true); // a retried save of the same visit
      await s.delete('photo:' + id, true);
      await s.delete(PHOTO, true);
    } },
];
// maybeSnapshot (04-sync.js:1507-1528) on a phone whose calendar is in time zone tz
async function dailyBackup(s, tz){
  const day = localDay(tz, 0), key = 'snap_' + day;
  const existing = await s.get(key, true);
  if(!existing) await s.set(key, J({ clinics: clinicList(30), products: [], visits: [], visitsMonths: {}, tasks: [], erpIndex: { periods: [] }, ts: new Date().toISOString() }), true);
  for(let i = 13; i <= 19; i++) await s.delete('snap_' + localDay(tz, -i), true);
  return key;
}
const BACKUP_SITES = [
  { label: 'snap_: today\'s backup and the clean-up 13–19 days back (maybeSnapshot 04-sync.js:1511/1520/1526) — a phone in Kuwait',
    keys: ['snap_YYYY-MM-DD'], run: async (s) => {
      await unseed(snap(0), 'snap_' + kuwaitDay(0));
      for(let i = 13; i <= 19; i++) await asAdmin(col => col.doc('snap_' + kuwaitDay(-i)).set(stored({ clinics: [] })));
      const key = await dailyBackup(s, 'Asia/Kuwait');
      assert.ok(await storedValue(key));
      for(let i = 13; i <= 19; i++) assert.equal(await storedValue('snap_' + kuwaitDay(-i)), null);
      await dailyBackup(s, 'Asia/Kuwait'); // the second save of the day finds it
    } },
  { label: 'snap_: the same on phones at the far ends of the time zones (UTC+14, UTC−11)',
    keys: ['snap_YYYY-MM-DD'], run: async (s) => {
      for(const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']){ await unseed('snap_' + localDay(tz, 0)); await dailyBackup(s, tz); }
    } },
  { label: 'snap_: an app version from before v119 still on a phone — keeps the 12 newest backups, deletes the rest',
    keys: ['snap_YYYY-MM-DD'], run: async (s) => {
      await asAdmin(async col => { for(const k of F.SNAP_KEYS) await col.doc(k).delete(); for(let i = 0; i <= 14; i++) await col.doc('snap_' + kuwaitDay(-i)).set(stored({ clinics: [] })); });
      const list = await s.list('snap_', true);
      const sorted = list.keys.slice().sort();
      for(const k of sorted.slice(0, sorted.length - 12)) await s.delete(k, true);
      assert.equal((await s.list('snap_', true)).keys.length, 12);
    } },
];
const SEEDING_SITE = { label: 'start-up seeding on an account with no documents yet (loadAll 04-sync.js:1035-1039)',
  keys: ['clinics', 'products', 'staff', 'benchmarks', 'categoryGuides'], run: async (s) => {
    await env.clearFirestore();
    for(const k of ['clinics', 'products', 'staff', 'benchmarks', 'categoryGuides']) assert.equal(await s.get(k, true), null);
    await s.update('clinics', cur => cur == null ? J(clinicList(30)) : cur); // persist('clinics', {allowSeed:true})
    await s.set('products', J([{ id: 'p1', name: 'Test brush' }]), true);
    await s.set('staff', J([{ name: 'Rep A', role: 'rep', email: REP_A }, { name: 'Supervisor', role: 'supervisor', email: SUP }]), true);
    await s.set('benchmarks', J({ coverage: 80, priority: 90, conversion: 30, tasks: 85 }), true);
    await s.set('categoryGuides', J({ 'Water Flosser': { sell: '', how: '', objections: '', links: [] } }), true);
  } };
const SUPERVISOR_SITES = [
  { label: 'staff: saveStaff 08-team-orders.js:73, confirmRemoveStaff 08-team-orders.js:102',
    keys: ['staff'], run: async (s) => { await s.set('staff', J(SEED.staff.concat([{ name: 'New rep', role: 'rep', email: 'test-new-rep@ultramed-kw.com' }])), true); } },
  { label: 'a team member renamed: every list, the targets, the sales and the team list (saveStaff 08-team-orders.js:67/73)',
    keys: ['clinics', 'visits', 'tasks', 'dayPlans', 'events', 'targets', 'erpSales', 'staff'], run: async (s) => {
      const ren = x => (x && x.rep === 'Rep A' ? Object.assign({}, x, { rep: 'Rep Alpha' }) : x);
      for(const k of ['clinics', 'visits', 'tasks', 'events']) await s.update(k, cur => J(P(cur, []).map(ren)));
      await s.update('dayPlans', cur => J(P(cur, {})));
      await s.set('targets', J({ 'Rep Alpha': { revenue: 1000 } }), true);
      await s.get('erpSales', true, { server: true });
      await s.setMany([['erpSales', J(Object.assign({}, SEED.erpSales, { repMapGlobal: { 'MARIAM TEST': 'Rep Alpha' } }))]]);
      await s.set('staff', J(SEED.staff.map(x => x.name === 'Rep A' ? Object.assign({}, x, { name: 'Rep Alpha' }) : x)), true);
    } },
  { label: 'targets: saveTargets 09-admin.js:129, the DSR upload applyTargetsFile 11-erp.js:736, archiveTargetsMonth 11-erp.js:725, applyDsrSeed 04-sync.js:375',
    keys: ['targets'], run: async (s) => { await s.set('targets', J({ 'Rep A': { month: kuwaitDay(0).slice(0, 7), revenue: 12000, visits: 80 }, _history: {} }), true); } },
  { label: 'benchmarks: saveBenchmarks 09-admin.js:141, saveKpiSettings 16-kpi.js:86',
    keys: ['benchmarks'], run: async (s) => { await s.set('benchmarks', J({ coverage: 85, priority: 90, conversion: 30, tasks: 85, kpi: {} }), true); } },
  { label: 'categoryGuides: saveCategoryGuide 10-doctors-products.js:1826',
    keys: ['categoryGuides'], run: async (s) => { await s.set('categoryGuides', J({ 'Water Flosser': { sell: 'x', how: 'y', objections: 'z', links: [] } }), true); } },
  { label: 'products: prices, notes, materials, removals, catalog gaps, photos (09-admin.js:429, 10-doctors-products.js:157/1655/1688, 07-clinics.js:965/1023, 04-sync.js:81)',
    keys: ['products'], run: async (s) => { await s.set('products', J([{ id: 'p1', name: 'Test brush', brand: 'Test', price: 4.5, salesNotes: 'n', materials: [] }]), true); } },
  { label: 'erpSales: a sales file imported — server read, row chunks + index in one batch, an old chunk pruned (persistErpSalesInner 04-sync.js:787/833/849)',
    keys: ['erpSales', 'erpRows:<period>:<rev>:<n>'], run: async (s) => {
      await s.get('erpSales', true, { server: true });
      const id = uid(), rev = Date.now(), base = 'erpRows:' + id + ':' + rev;
      const rows = Array.from({ length: 5 }, (_, i) => [kuwaitDay(-i), 'INV-' + i, 'Test clinic 1', 'Test brush', 1, 4, 4, 0, 'TEST SALESMAN']);
      const index = { periods: [{ id, from: kuwaitDay(-4), to: kuwaitDay(0), net: 20, rev, rowCount: 5, repMap: {}, rowsRef: { key: base, chunks: 2, count: 5 } }], repMapGlobal: {}, orphans: {}, savedAt: new Date().toISOString() };
      await s.setMany([[base + ':0', J(rows.slice(0, 3))], [base + ':1', J(rows.slice(3))], ['erpSales', J(index)]]);
      await s.delete(CHUNK, true); // past its grace week
    } },
  { label: 'erpMap + erpMapLog: an account link by compare-and-set — saveErpLink 11-erp.js:1996, erpLinkLog 11-erp.js:2202',
    keys: ['erpMap', 'erpMapLog'], run: async (s) => {
      await s.update('erpMap', cur => { const m = P(cur, {}) || {}; m['TEST ACCOUNT'] = 'c-1'; return J(m); });
      await s.update('erpMapLog', cur => J([{ n: 'TEST ACCOUNT', f: null, t: 'c-1', by: 'Supervisor', at: Date.now() }].concat(P(cur, []) || []).slice(0, 300)));
    } },
  { label: 'rxTypes: the prescription types by compare-and-set — saveRxTypes 10-doctors-products.js:1196',
    keys: ['rxTypes'], run: async (s) => { await s.update('rxTypes', cur => { const d = P(cur, {}) || {}; return J({ v: 1, rev: (d.rev || 0) + 1, by: 'Supervisor', types: [{ id: 'rx1', name: 'Tepe prescription', active: true }] }); }); } },
  { label: 'restore a whole day from a backup — restoreSnapshot 13-exports.js:1506-1541',
    keys: ['clinics', 'products', 'tasks', 'visits', 'visitsArch:YYYY-MM', 'visitsIndex', 'erpSales', 'recycleBin', 'tombs'], run: async (s) => {
      const snapDoc = P((await s.get(snap(-5), true)).value, {});
      const tombs = P((await s.get('tombs', true) || {}).value, {}) || {}; await s.set('tombs', J(tombs), true); // untombMany
      for(const [k, val] of [['clinics', snapDoc.clinics || []], ['products', SEED.products], ['tasks', []]]) await s.set(k, J(val), true);
      await s.update('visits', () => J([])); await s.update(ARCH, cur => cur); await s.update('visitsIndex', cur => cur); // persistVisits({authoritative:true})
      await s.set('erpSales', J({ periods: [] }), true);
      await s.set('recycleBin', J({ clinics: [], products: [], visits: [] }), true);
    } },
  { label: 'the one-time wipe recovery — autoRestoreWipe 04-sync.js:184/188',
    keys: ['clinics', 'snap_YYYY-MM-DD'], run: async (s) => {
      await s.set('clinics', J(clinicList(40)), true);
      await s.set('snap_' + kuwaitDay(0), J({ clinics: clinicList(40), products: [], visits: [], tasks: [], ts: new Date().toISOString() }), true);
    } },
  { label: 'bulk delete of clinics / the device copy restored (allowShrink: bulkDeleteClinics 09-admin.js:889, restoreDeviceClinics 13-exports.js:1563)',
    keys: ['clinics'], run: async (s) => { await s.update('clinics', () => J(clinicList(2))); } },
  { label: 'missing clinics brought back from the backups — restoreMissingClinics 13-exports.js:1491/1492',
    keys: ['clinics', 'recycleBin', 'tombs'], run: async (s) => {
      await s.set('tombs', J(P((await s.get('tombs', true) || {}).value, {})), true);
      await mergeList(s, 'clinics', { id: 'c-back', name: 'Clinic back from a backup', rep: 'Rep B', cls: 'B', doctors: [] });
      await s.set('recycleBin', J({ clinics: [], products: [], visits: [] }), true);
    } },
];
const ALL_SITES = TEAM_SITES.concat(BACKUP_SITES, [SEEDING_SITE], SUPERVISOR_SITES);

// ================= the daily e-mail job, its own code =================
function loadReportJs(){
  const file = path.join(ROOT, 'scripts', 'daily-report', 'report.js');
  let src = fs.readFileSync(file, 'utf8');
  for(const [a, b] of [['https://firestore.googleapis.com', `http://${HOST}:${PORT}`],
    ['https://identitytoolkit.googleapis.com', `http://${AUTH_HOST}/identitytoolkit.googleapis.com`],
    ["projectId: 'ultramed-field-ops'", `projectId: '${PROJECT}'`]]){
    assert.ok(src.includes(a), 'report.js: ' + a + ' not found');
    src = src.split(a).join(b);
  }
  src = src.replace(/apiKey: '[^']*'/, "apiKey: 'demo-api-key'");
  const left = (src.match(/https:\/\/[^\s'"`]+/g) || []).filter(u => u !== 'https://api.resend.com/emails');
  assert.deepEqual(left, [], 'report.js names an endpoint this test did not redirect');
  assert.ok(!/ultramed-field-ops|AIza/.test(src));
  const mod = { exports: {} };
  const req = (p) => (p === '../../www/js/core.js' ? require(path.join(WWW, 'js', 'core.js')) : require(p));
  new Function('module', 'exports', 'require', '__filename', '__dirname', src)(mod, mod.exports, req, file, path.dirname(file));
  return mod.exports;
}

// ================= the tests =================
describe('source scan: every write the app makes is replayed here', () => {
  const found = scanWrites();
  test('every literal write target in www/js/app is a key the rules know', () => {
    const unknown = found.filter(f => f.key && !(f.key in INVENTORY) && !(f.key in LOCAL_ONLY));
    assert.deepEqual(unknown, [], 'write targets missing from firestore.rules: ' + unknown.map(u => u.key + ' (' + u.at + ')').join(', '));
    assert.ok(found.filter(f => f.key).length > 100, 'the scan found ' + found.filter(f => f.key).length + ' literal write calls');
  });
  test('every computed write target is one this file resolves (a new prefix needs the rules first)', () => {
    const unknown = found.filter(f => f.dynamic && !DYNAMIC.some(d => d.arg === f.dynamic && f.at.startsWith(d.file + ':')));
    assert.deepEqual(unknown, [], 'unresolved write targets: ' + unknown.map(u => u.call + '(' + u.dynamic + ') at ' + u.at).join(', '));
  });
  test('the inventory here is the rules file\'s', () => {
    const list = (fn) => { const m = F.RAW_RULES.match(new RegExp('function ' + fn + '\\(key\\) \\{\\s*return key in \\[([^\\]]+)\\]')); return m ? m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)) : []; };
    const team = Object.keys(INVENTORY).filter(k => INVENTORY[k] === 'team' && !/[<:_]/.test(k)).sort();
    const sup = Object.keys(INVENTORY).filter(k => INVENTORY[k] === 'supervisor' && !/[<:_]/.test(k)).sort();
    assert.deepEqual(list('isTeamKey').sort(), team);
    assert.deepEqual(list('isSupervisorKey').sort(), sup);
  });
  test('every key in the inventory is written by at least one replayed site (mailLog: the e-mail job below)', () => {
    const covered = new Set(ALL_SITES.flatMap(x => x.keys).concat(['mailLog']));
    assert.deepEqual(Object.keys(INVENTORY).filter(k => !covered.has(k)), []);
  });
});

describe('the app\'s own storage code on the emulator: no write it makes is refused', () => {
  let repA, repB, sup;
  before(async () => {
    const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
    const compat = require('firebase/compat/app'); firebase = compat.default || compat;
    require('firebase/compat/auth'); require('firebase/compat/firestore');
    firebase.firestore.setLogLevel('silent');
    ADAPTER = adapterSource();
    env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: F.rulesFor(SUP), host: HOST, port: Number(PORT) } });
    await realFetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
    for(const email of [REP_A, REP_B, SUP, REPORTS]) await createLogin(email);
    repA = makePhone('rep-a'); repB = makePhone('rep-b'); sup = makePhone('supervisor');
    await repA.auth.signInWithEmailAndPassword(REP_A, PASSWORD); // exactly 03-gate.js:123/134
    await repB.auth.signInWithEmailAndPassword(REP_B, PASSWORD);
    await sup.auth.signInWithEmailAndPassword(SUP, PASSWORD);
    const t = await repA.auth.currentUser.getIdTokenResult();
    assert.equal(t.signInProvider, 'password'); assert.equal(t.claims.email, REP_A); assert.equal(t.claims.email_verified, false);
  });
  after(async () => {
    for(const p of phones){ try{ await p.app.delete(); }catch(e){} }
    if(env) await env.cleanup();
  });

  const who = () => [['rep A', () => repA, 'Rep A'], ['rep B', () => repB, 'Rep B'], ['the supervisor', () => sup, 'Supervisor']];
  for(const site of TEAM_SITES.concat(BACKUP_SITES, [SEEDING_SITE])){
    for(const [name, phone, me] of who()){
      test(`${name}: ${site.label}`, async () => { await reseed(); await site.run(phone().s, me); });
    }
  }
  for(const site of SUPERVISOR_SITES){
    test(`the supervisor: ${site.label}`, async () => { await reseed(); await site.run(sup.s, 'Supervisor'); });
  }
  test('rep A, rep B and the supervisor saving the same visits within the same second all land (transactions)', async () => {
    await reseed();
    const add = (p, me) => mergeList(p.s, 'visits', { id: 'v-' + me, clinicId: 'c-1', rep: me, date: kuwaitDay(0), ts: Date.now() });
    await Promise.all([add(repA, 'A'), add(repB, 'B'), add(sup, 'S')]);
    const ids = P(await storedValue('visits'), []).map(v => v.id);
    for(const id of ['v-A', 'v-B', 'v-S']) assert.ok(ids.includes(id), id);
  });
  test('the boundary, with real logins: on a rep\'s phone the supervisor-only saves are refused, the account unchanged', async () => {
    for(const site of SUPERVISOR_SITES.filter(x => x.keys.every(k => INVENTORY[k] === 'supervisor'))){
      await reseed();
      await assert.rejects(site.run(repA.s, 'Rep A'), e => e && e.code === 'permission-denied', site.label);
    }
    assert.equal(await storedValue('staff'), J(SEED.staff));
    assert.equal(await storedValue('targets'), J(SEED.targets));
  });
  test('signed out, the same phone reads and writes nothing', async () => {
    await reseed();
    const p = makePhone('signed-out');
    await p.auth.signInWithEmailAndPassword(REP_A, PASSWORD); await p.auth.signOut(); // the adapter waited for a sign-in once, then the person signed out
    await assert.rejects(p.s.get('clinics', true), e => e.code === 'permission-denied');
    await assert.rejects(mergeList(p.s, 'visits', { id: 'x' }), e => e.code === 'permission-denied');
  });

  for(const [name, email] of [['a dedicated job login', REPORTS], ['the supervisor\'s login', SUP]]){
    test(`the daily e-mail job runs for real (report.js run(): sign-in, batch read, mailLog) — ${name}`, async () => {
      await reseed();
      const report = loadReportJs();
      const sent = [];
      const entry = await report.run('morning', {
        manual: true, now: new Date(),
        env: { REPORT_LOGIN_EMAIL: email, REPORT_LOGIN_PASSWORD: PASSWORD, RESEND_API_KEY: 'test-key' },
        io: { sendMail: async (key, from, to) => { sent.push(to); return 'test-' + sent.length; } },
      });
      assert.equal(entry.logError, undefined, 'mailLog not written: ' + entry.logError);
      assert.ok(entry.sent >= 3 && entry.failed === 0, J(entry));
      const log = P(await storedValue('mailLog'), {});
      assert.equal(log.last && log.last.at, entry.at);
    });
  }
});
