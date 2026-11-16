// How fast the app opens (the owner, 13 Nov: "I don't want the app to be slow
// to open — neither on the laptop nor on the mobile"). Opens the BUILT site
// (what GitHub Pages publishes: one index.html with the app script inlined,
// the service worker) on a heavy year of invented data
// (fixtures/heavy-year.js) and measures, for a rep and for the supervisor:
//   daily open  the app was opened on this device before: the service worker
//               is installed, the phone's copies (um_mirror:*) are there; the
//               browser starts again from its disk (a phone reopened the next day)
//   first open  a new device: nothing cached, then sign-in (e-mail + password)
// each on a LAPTOP (1440x900, no throttling) and a PHONE (390x844, the CPU 4x
// slower through CDP, the network like 4G: every request pays a round trip,
// the bytes share one link, a new connection pays its set-up).
// Times are from the navigation start: the shell painted (first contentful
// paint), the person's own data on the Today screen painted (her greeting,
// follow-ups and month figure — the frame in which they first were in the
// page; that frame is painted before the next task, so the figures' msRun
// starting after it bounds it), the figures drawn (msBuild's model: ring,
// remaining, KPI), up to date (the boot's cloud read merged, drawn, its
// figures too); plus the cloud reads and bytes per key, the main thread's
// long tasks. Checks: the right person's own data is shown (her follow-ups,
// her month figure as UMCore.monthAchievement gives it from the fixture),
// nothing is written at start, no page errors — and the v126 start-up work
// (each check fails on v125): a daily open downloads no sales chunk the phone
// keeps, nor does the 20-second round (measured on the laptop rep's daily
// open); it draws the past months it keeps from the store and reads each from
// the cloud once, after its own read (the v126 review: a kept month is for the
// first paint only — the start confirms it before it ends); chat and memories
// are read beside the other lists, msBuild works out the month's lines once.
// Then the phone's store's rules (storeRules, one laptop device, K1–K11: only
// what the cloud returned, never a revision this phone wrote, a stale month is
// put right before the start ends and loses nothing, the held deletes, the
// daily backup, the Restore and the full backup take only cloud reads, a store
// that fails is a miss, a sign-out keeps it, the queue keeps its room).
//
// Nothing here depends on the internet: the Firebase SDK is replaced by a
// stand-in that keeps the app's own Firestore adapter (01-config.js) and its
// sign-in flow (03-gate.js) running unchanged on a fake cloud; the fonts
// stylesheet is answered locally; every other outside request is refused.
//
// Env:
//   WWW=<dir>          open that folder as the site (a dist/, or a source www/); default: build dist into a temp folder
//   RUNS=n             devices per row (each: a first open, then a daily open); default 1
//   PROFILE=1          one more phone device per person with a CPU profile and a trace of both opens (OUT gets the files)
//   OUT=<dir>          write startup-speed.json (every run) and the profiles there
//   ONLY=rep|sup       one person; PROFILES=laptop|phone one profile; AR=1 adds the rep's phone daily open in Arabic
//   FIREBASE_SDK_DIR   a folder with the real firebase-*-compat.js files: their bytes are served and evaluated
//                      (parse and compile cost on the critical path), then the stand-in takes over
//   HEAVY_SCALE=x      scale the data (fixtures/heavy-year.js; 1 = a heavy year)
//   REFRESH=1          also wait for the first 20-second background refresh of each daily open and measure it (the laptop rep's always)
//   STORE_RULES=0      leave out the store's rules (on by default whenever the laptop profile runs)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const zlib = require('zlib'); const crypto = require('crypto'); const { spawnSync } = require('child_process');
const { launchOpts } = require('./_env.js');
const PORT = 8281;
const ROOT = path.join(__dirname, '..', '..');
const RUNS = Math.max(1, +process.env.RUNS || 1);
const PROFILE = process.env.PROFILE === '1';
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : null;
const REFRESH = process.env.REFRESH === '1';
const fixture = require('./fixtures/heavy-year.js');
const core = require(path.join(process.env.WWW ? path.resolve(process.env.WWW) : path.join(ROOT, 'www'), 'js', 'core.js'));

// ---------- the site: the built one (dist) unless WWW names a folder ----------
let SITE = process.env.WWW ? path.resolve(process.env.WWW) : null, builtTmp = null;
if(!SITE){
  builtTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'um-startup-dist-'));
  const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js'), path.join(ROOT, 'www'), builtTmp], { encoding: 'utf8' });
  if(b.status !== 0){ console.error('HARNESS ERROR build failed', b.stderr || b.stdout); process.exit(2); }
  SITE = builtTmp;
}
const SITE_KIND = fs.existsSync(path.join(SITE, 'js', 'app')) ? 'source (js/app files)' : 'built (app script inlined)';

// ---------- the network model ----------
// LAPTOP: no throttling at all. PHONE: 4G — a round trip of 150 ms on every
// request, 10 Mbit/s down and 4 Mbit/s up shared by everything in flight, a
// new connection (DNS + TCP + TLS) 3 round trips, and the cloud's first
// request of a page 4 more (the sign-in token refreshed, the cloud's channel
// opened) — the real SDK pays these too. The site's files travel gzip'd (as
// GitHub Pages serves them, with ETag and max-age=600); the cloud's documents
// at their stored size (the app's JSON strings, no compression counted).
const NETS = { laptop: null, phone: { rtt: 150, down: 1.25e6, up: 0.5e6, newConnRtts: 3, cloudSetupRtts: 4 } };
let NET = null;
const link = { down: 0, up: 0 };
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
async function netDown(bytes, extraRtts){
  if(!NET) return;
  const t = Date.now() + (extraRtts || 0) * NET.rtt;
  const start = Math.max(t + NET.rtt / 2, link.down);
  link.down = start + bytes * 1000 / NET.down;
  await sleep(link.down + NET.rtt / 2 - Date.now());
}
async function netUp(bytes){
  if(!NET) return;
  const t = Date.now();
  const start = Math.max(t, link.up);
  link.up = start + bytes * 1000 / NET.up;
  await sleep(link.up + NET.rtt - Date.now());
}

// ---------- the fake cloud (Node: it outlives every page and browser) ----------
const FIX = fixture.build({ scale: +process.env.HEAVY_SCALE || 1 });
let cloud = new Map();
function resetCloud(){ cloud = new Map(Object.entries(FIX.docs).map(([k, v]) => [k, { value: v, updated: Date.parse(FIX.now) - 3600000 }])); }
resetCloud();
const STAFF = JSON.parse(FIX.docs.staff);
const ARCH_MONTHS = Object.keys(JSON.parse(FIX.docs.visitsIndex).months).length;
let acct = null; // the open being measured: what the cloud served and took
function freshAcct(){ return { reads: 0, readBytes: 0, readKeys: {}, writes: 0, writeBytes: 0, writeKeys: {}, queries: 0, http: 0, httpBytes: 0, httpWire: 0, setupAt: null }; }
let cloudSetup = null; // the cloud's first request of a page pays the set-up
// <link rel="preconnect"> (v126 speed): the stand-in SDK makes no real request, so what a preconnect buys is modelled —
// the new connection's set-up (newConnRtts) is paid from the moment the page's parser met the hint, beside the page's
// own work, and is lost if Chrome closed the idle socket (~10 s) before the first request; the requests themselves
// (cloudSetupRtts: the token refreshed, the channel opened; the sign-in's own) are paid as before.
let preconnect = null; // { at: epoch ms the hints were parsed, hosts: [..] } of the page being measured
const PRECONNECT_IDLE_MS = 10000;
function connLeft(host){
  const conn = NET.newConnRtts * NET.rtt;
  if(!preconnect || !preconnect.hosts.includes(host) || Date.now() - preconnect.at > PRECONNECT_IDLE_MS) return conn;
  return Math.max(0, preconnect.at + conn - Date.now());
}
function onCloud(){ if(!NET) return Promise.resolve(); if(!cloudSetup){ const warm = ['firestore.googleapis.com', 'securetoken.googleapis.com'].every(h => connLeft(h) < NET.newConnRtts * NET.rtt);
  cloudSetup = sleep((warm ? connLeft('firestore.googleapis.com') : NET.newConnRtts * NET.rtt) + NET.cloudSetupRtts * NET.rtt); if(acct) acct.setupAt = Date.now(); } return cloudSetup; }
const group = k => k.replace(/^(erpRows|visitsArch|photo):.*/, '$1:*').replace(/^snap_.*/, 'snap_*');
function countRead(k, n){ if(!acct) return; acct.reads++; acct.readBytes += n; const g = group(k); const e = acct.readKeys[g] = acct.readKeys[g] || [0, 0]; e[0]++; e[1] += n; }
function countWrite(k, n){ if(!acct) return; acct.writes++; acct.writeBytes += n; const g = group(k); const e = acct.writeKeys[g] = acct.writeKeys[g] || [0, 0]; e[0]++; e[1] += n; }
const locks = {};
async function lockKey(k){
  const prev = locks[k] || Promise.resolve(); let release;
  const mine = new Promise(r => { release = r; });
  locks[k] = prev.then(() => mine);
  await prev;
  const timer = setTimeout(release, 30000); // a page that went away never releases
  return () => { clearTimeout(timer); release(); };
}
const held = {};
let txSeq = 0;
let cloudDown = false; // no signal: every request fails (the store-rules step K11)
let failGet = null;     // a pattern: the reads of those keys fail (the store-rules steps K6, K7: the kept months cannot be read)
const down = () => { if(cloudDown){ const e = new Error('unavailable: no signal'); e.code = 'unavailable'; throw e; } };
const api = {
  async get(k){ down(); if(failGet && failGet.test(k)){ const e = new Error('unavailable: no signal for this read'); e.code = 'unavailable'; throw e; } await onCloud(); const d = cloud.get(k); const n = d ? d.value.length + 60 : 60; await netDown(n); countRead(k, d ? d.value.length : 0); return d ? { exists: true, value: d.value, updated: d.updated } : { exists: false }; },
  async set(k, v){ down(); await onCloud(); await netUp(v.length + 60); cloud.set(k, { value: v, updated: Date.now() }); countWrite(k, v.length); return true; },
  async del(k){ await onCloud(); await netUp(60); cloud.delete(k); countWrite(k, 0); return true; },
  async commit(entries){ down(); await onCloud(); await netUp(entries.reduce((s, [k, v]) => s + v.length + 60, 0)); entries.forEach(([k, v]) => { cloud.set(k, { value: v, updated: Date.now() }); countWrite(k, v.length); }); return true; },
  async query(q){
    down(); await onCloud(); if(acct) acct.queries++;
    let keys = [...cloud.keys()].sort();
    if(q.from != null) keys = keys.filter(k => k >= q.from);
    if(q.to != null) keys = keys.filter(k => k < q.to);
    if(q.after != null) keys = keys.filter(k => k > q.after);
    if(q.limit) keys = keys.slice(0, q.limit);
    const docs = keys.map(k => ({ id: k, value: cloud.get(k).value, updated: cloud.get(k).updated }));
    const n = docs.reduce((s, d) => s + d.value.length + 60, 60);
    await netDown(n); docs.forEach(d => countRead(d.id, d.value.length));
    return docs;
  },
  async txGet(k){ down(); const release = await lockKey(k); const id = ++txSeq; held[id] = release; const d = await api.get(k); return { id, doc: d }; },
  async txEnd(id, k, v){ try{ if(v != null) await api.set(k, v); } finally { if(held[id]){ held[id](); delete held[id]; } } return true; },
  async signIn(email, pwd){ if(NET){ await sleep(connLeft('identitytoolkit.googleapis.com')); await netDown(2000); await netDown(1500); } return !!pwd && STAFF.some(s => (s.email || '').toLowerCase() === String(email || '').toLowerCase()); },
};

// ---------- the Firebase stand-in (served at the SDK's addresses) ----------
const FAKE_FIREBASE = `;(function(){
  var U = function(){ return window.__um; };
  var t = function(){ return performance.now(); };
  function log(op, key, t0, n){ var u = U(); if(u) u.cloud.push([op, key, Math.round(t0), Math.round(t()), n]); }
  var LS = '__fakefb_user', listeners = [], user = null, known = false, apiKey = null;
  // the real SDK keeps its signed-in session on the phone (IndexedDB, else web storage) under this key: kept here the
  // web-storage way, so the app can see whose session it is before the sign-in is confirmed (v126 speed, part 3)
  function saved(email){ try{ if(!apiKey) return; var k = 'firebase:authUser:' + apiKey + ':[DEFAULT]'; if(email) localStorage.setItem(k, JSON.stringify({ uid: 'u-' + email, email: email })); else localStorage.removeItem(k); }catch(err){} }
  try{ var e = localStorage.getItem(LS); if(e) user = { email: e, uid: 'u-' + e }; }catch(err){}
  function tell(){ if(window.__umWrap) window.__umWrap(); listeners.slice().forEach(function(cb){ try{ cb(user); }catch(err){ setTimeout(function(){ throw err; }); } }); }
  // the real SDK reads its saved session asynchronously, then tells every listener
  setTimeout(function(){ known = true; tell(); }, 0);
  var auth = {
    get currentUser(){ return user; },
    onAuthStateChanged: function(cb){ listeners.push(cb); if(known) setTimeout(function(){ if(window.__umWrap) window.__umWrap(); cb(user); }, 0); return function(){ listeners = listeners.filter(function(x){ return x !== cb; }); }; },
    signInWithEmailAndPassword: function(email, pwd){ return window.__fbSignIn(email, pwd).then(function(ok){
      if(!ok){ var er = new Error('wrong password'); er.code = 'auth/wrong-password'; throw er; }
      user = { email: email, uid: 'u-' + email }; try{ localStorage.setItem(LS, email); }catch(err){} saved(email);
      setTimeout(tell, 0); return { user: user }; }); },
    signOut: function(){ user = null; try{ localStorage.removeItem(LS); }catch(err){} saved(null); setTimeout(tell, 0); return Promise.resolve(); },
  };
  function snap(id, d){ return { id: id, exists: !!(d && d.exists !== false && d.value != null), data: function(){ return d && d.value != null ? { value: d.value, updated: d.updated } : undefined; } }; }
  function docRef(id){ return {
    id: id,
    get: function(){ var t0 = t(); return window.__fbGet(id).then(function(d){ log('get', id, t0, d && d.value ? d.value.length : 0); return snap(id, d); }); },
    set: function(data){ var t0 = t(); return window.__fbSet(id, data.value).then(function(){ log('set', id, t0, data.value.length); }); },
    delete: function(){ var t0 = t(); return window.__fbDel(id).then(function(){ log('del', id, t0, 0); }); },
  }; }
  function query(q){ return {
    where: function(f, op, v){ var n = Object.assign({}, q); if(op === '>=') n.from = v; else if(op === '<') n.to = v; return query(n); },
    orderBy: function(){ return query(q); },
    startAfter: function(v){ return query(Object.assign({}, q, { after: v })); },
    limit: function(n){ return query(Object.assign({}, q, { limit: n })); },
    get: function(){ var t0 = t(); return window.__fbQuery(q).then(function(docs){
      log('query', (q.from || '') + '…', t0, docs.reduce(function(s, d){ return s + d.value.length; }, 0));
      var list = docs.map(function(d){ return snap(d.id, d); });
      return { size: list.length, docs: list, forEach: function(fn){ list.forEach(fn); } }; }); },
  }; }
  var db = {
    collection: function(){ var c = query({}); c.doc = docRef; return c; },
    batch: function(){ var es = []; return { set: function(ref, data){ es.push([ref.id, data.value]); }, commit: function(){ var t0 = t(); return window.__fbCommit(es).then(function(){ log('commit', es.length + ' docs', t0, 0); }); } }; },
    runTransaction: function(fn){
      var id = null, key = null, out = null, t0 = t();
      var tx = { get: function(ref){ key = ref.id; return window.__fbTxGet(ref.id).then(function(r){ id = r.id; return snap(ref.id, r.doc); }); },
                 set: function(ref, data){ out = data.value; } };
      return Promise.resolve().then(function(){ return fn(tx); }).then(function(res){
        return window.__fbTxEnd(id, key, out).then(function(){ log('tx', key, t0, out ? out.length : 0); return res; }); },
        function(err){ return (id ? window.__fbTxEnd(id, key, null) : Promise.resolve()).then(function(){ throw err; }); });
    },
  };
  var firestore = function(){ return db; };
  firestore.FieldPath = { documentId: function(){ return '__name__'; } };
  var fb = { __fake: true, apps: [], initializeApp: function(c){ fb.apps.push(c); apiKey = c && c.apiKey; return {}; }, firestore: firestore, auth: function(){ return auth; } };
  fb.auth.EmailAuthProvider = { credential: function(){ return {}; } };
  window.firebase = fb;
})();`;
const SDK_DIR = process.env.FIREBASE_SDK_DIR ? path.resolve(process.env.FIREBASE_SDK_DIR) : null;
function sdkBody(file){
  // the real SDK's bytes when given (its parse/compile/run cost is real), with the stand-in last
  const real = SDK_DIR && fs.existsSync(path.join(SDK_DIR, file)) ? fs.readFileSync(path.join(SDK_DIR, file), 'utf8') : '';
  return real + (file === 'firebase-auth-compat.js' ? '\n' + FAKE_FIREBASE : '') + '\n';
}
const SDK_FILES = ['firebase-app-compat.js', 'firebase-firestore-compat.js', 'firebase-auth-compat.js'];
const SDK = {}; SDK_FILES.forEach(f => { const b = sdkBody(f); SDK[f] = { body: b, wire: zlib.gzipSync(b).length + 300 }; });

// ---------- the web server (GitHub Pages-like: gzip, ETag, max-age=600) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const fileCache = {};
function fileEntry(f){
  if(fileCache[f]) return fileCache[f];
  const raw = fs.readFileSync(f);
  const text = /\.(html|js|json|css|svg)$/.test(f);
  return (fileCache[f] = { raw, gz: text ? zlib.gzipSync(raw) : null, etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"', type: MIME[path.extname(f)] || 'application/octet-stream' });
}
let httpWarm = false; // a connection to the site is open (per browser start)
// Playwright turns the browser's HTTP cache off while requests are routed, so the
// service worker's background revalidation (sw.js: fetch with cache 'no-cache')
// cannot send its ETag here and gets whole files back. On a phone it gets a 304
// for every file the HTTP cache still holds (all of the shell after a first
// open), so on a daily open the site's answers are charged to the link as 304s.
let siteCached = false;
const server = http.createServer(async (req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(SITE, u === '/' ? 'index.html' : u);
  if(!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
  const e = fileEntry(f);
  const extra = NET && !httpWarm ? NET.newConnRtts : 0; httpWarm = true;
  if(req.headers['if-none-match'] === e.etag){
    await netDown(250, extra); if(acct){ acct.http++; acct.httpWire += 250; }
    res.writeHead(304, { ETag: e.etag, 'Cache-Control': 'max-age=600' }); res.end(); return;
  }
  const gz = e.gz && /gzip/.test(req.headers['accept-encoding'] || '');
  const body = gz ? e.gz : e.raw;
  const wire = siteCached ? 250 : body.length + 300;
  await netDown(wire, extra);
  if(acct){ acct.http++; acct.httpBytes += e.raw.length; acct.httpWire += wire; }
  const h = { 'Content-Type': e.type, ETag: e.etag, 'Cache-Control': 'max-age=600' };
  if(gz) h['Content-Encoding'] = 'gzip';
  res.writeHead(200, h); res.end(body);
});

// ---------- what the page records (installed before any page script) ----------
const OFFSET_SRC = (Date.parse(FIX.now) - Date.now());
function initScript(arg){
  const off = arg.off;
  const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  if(arg.lang){ try{ localStorage.setItem('ultramed_lang', arg.lang); }catch(e){} }
  if(window.top !== window) return;
  try{
    const how = localStorage.getItem('__keepFail');
    if(how && window.indexedDB){
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = function(name){ if(name !== 'um_keep') return open.apply(null, arguments);
        if(how === 'throw') throw new DOMException('the store cannot be opened', 'UnknownError');
        return { set onsuccess(f){}, set onerror(f){}, set onupgradeneeded(f){}, set onblocked(f){}, result: null }; }; // never answers
    }
  }catch(e){}
  const U = window.__um = { marks: {}, longtasks: [], cloud: [], timeline: [], fns: {}, loadAlls: 0, renders: 0, msRuns: [], unshared: 0, inBuild: 0 };
  // whether this phone kept a copy of chat and memories when the open began (a full phone may not have room for one)
  try{ U.teamCopy = { chat: localStorage.getItem('um_mirror:chat') != null, memories: localStorage.getItem('um_mirror:memories') != null }; }catch(e){ U.teamCopy = {}; }
  const now = () => performance.now();
  const mark = (n, t) => { if(U.marks[n] == null) U.marks[n] = Math.round(t == null ? now() : t); };
  U.mark = mark;
  try{ new PerformanceObserver(l => l.getEntries().forEach(e => U.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); }catch(e){}
  // the boot sequence: the app's own global functions, timed where they run (wrapped once they exist)
  const ASYNC = ['selectUser', 'loadAll', 'loadVisits', 'loadErpSales', 'refreshTombs', 'loadTeam', 'flushOutbox', 'photoReadKept', 'retryPhotos', 'settlePhotos', 'purgeIgnoredSalesmen', 'checkWipeBanner', 'autoRestoreWipe', 'deepRestoreSweep', 'restoreOrphanClinics', 'applyProductImgSeed', 'archiveTargetsMonth'];
  const SYNC = ['renderAll', 'renderToday', 'renderTargetCard', 'renderDormant', 'renderStreak', 'renderBadges', 'renderPlanList', 'renderOccasionsCard', 'renderFocusCard', 'renderMissedPlans', 'renderTasks', 'renderWelcome', 'renderErpNudge', 'renderDocCardsNudge', 'renderGate',
    'normalizeClinics', 'hidePlaceholderClinics', 'visitsMirrorSave', 'erpMirrorSave', 'mirrorSave', 'applyDoctorRemap', 'translateTree', 'erpFillFromMirror', 'setMergeBase', 'outboxList'];
  U.wrapped = false;
  window.__umWrap = () => {
    if(U.wrapped || typeof window.loadAll !== 'function') return;
    U.wrapped = true;
    ASYNC.forEach(n => { const f = window[n]; if(typeof f !== 'function') return; window[n] = function(){ const t0 = now(); if(n === 'loadAll'){ U.loadAlls++; if(U.loadAlls === 1) mark('loadAllStart', t0); else mark('refreshStart', t0); }
      const p = f.apply(this, arguments); const end = () => { const t1 = now(); U.timeline.push([n, Math.round(t0), Math.round(t1)]); if(n === 'loadAll'){ if(U.loadAlls === 1 || U.marks.loadAllEnd == null){ mark('loadAllEnd', t1); try{ msWhenReady().then(() => requestAnimationFrame(() => requestAnimationFrame(() => mark('upToDate')))); }catch(err){} } else mark('refreshEnd', t1); } };
      if(p && typeof p.then === 'function') p.then(end, end); else end(); return p; }; });
    // the figures: msBuild's month figures worked out without the month's lines it already has (bestMonthRevenue called bare)
    if(typeof window.msBuild === 'function'){ const f = window.msBuild; window.msBuild = function(){ U.inBuild++; try{ return f.apply(this, arguments); } finally { U.inBuild--; } }; }
    if(window.UMCore && typeof UMCore.monthAchievement === 'function'){ const f = UMCore.monthAchievement; UMCore.monthAchievement = function(rep, data, mtd){ if(U.inBuild && mtd === undefined) U.unshared++; return f.apply(this, arguments); }; }
    if(typeof window.msRun === 'function'){ const f = window.msRun; window.msRun = function(){ const t0 = now(); try{ return f.apply(this, arguments); } finally { const d = now() - t0; U.msRuns.push([Math.round(t0), Math.round(now())]); const e = U.fns.msRun = U.fns.msRun || [0, 0, 0]; e[0]++; e[1] += d; if(d > e[2]) e[2] = d;
      try{ if(typeof _msModel !== 'undefined' && _msModel && _msModel.D && _msModel.key === msKey(msView()) && U.marks.figures == null){ mark('figures'); requestAnimationFrame(() => requestAnimationFrame(() => mark('figuresVisible'))); } }catch(err){} } }; }
    SYNC.forEach(n => { const f = window[n]; if(typeof f !== 'function') return; window[n] = function(){ const t0 = now(); if(n === 'renderAll') mark('firstDraw', t0); try{ return f.apply(this, arguments); } finally { const d = now() - t0; const e = U.fns[n] = U.fns[n] || [0, 0, 0]; e[0]++; e[1] += d; if(d > e[2]) e[2] = d; } }; });
  };
  // the person's own data on the Today screen: her greeting, her follow-ups, her month figure
  const ex = arg.expect;
  const amountShown = tc => tc.textContent.indexOf(ex.amount) >= 0 || [...tc.querySelectorAll('[data-ms="sales"]')].some(e => e.getAttribute('data-value') !== '' && Math.abs(+e.getAttribute('data-value') - ex.raw) < 0.006);
  U.amountShown = amountShown;
  let pend = false;
  const check = () => {
    pend = false;
    const gate = document.getElementById('gate'), app = document.getElementById('app');
    if(U.marks.gateShown == null && gate && gate.style.display !== 'none' && document.querySelector('#gateGrid .gate-tile')) mark('gateShown');
    if(!app || app.style.display !== 'block') return;
    mark('appShown');
    if(U.marks.ownDom != null) return;
    const g = document.getElementById('greeting'), due = document.getElementById('dueList'), tc = document.getElementById('targetCard');
    if(!g || !due || !tc) return;
    if(g.textContent.indexOf(ex.greet) < 0) return;
    if(ex.dueMarker && due.textContent.indexOf(ex.dueMarker) < 0) return;
    if(!amountShown(tc)) return;
    mark('ownDom');
    requestAnimationFrame(() => requestAnimationFrame(() => mark('ownVisible')));
  };
  const schedule = () => { if(!pend){ pend = true; requestAnimationFrame(check); } };
  const start = () => { new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] }); schedule(); };
  if(document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
  document.addEventListener('DOMContentLoaded', () => { mark('dcl'); window.__umWrap(); });
  // the preconnect hints, when the parser met them (the network model pays their set-up from then)
  { let sent = false; const seen = () => { if(sent) return; const ls = [...document.querySelectorAll('link[rel="preconnect"]')]; if(!ls.length) return; sent = true;
      U.preconnect = ls.map(l => l.href.replace(/^https?:\/\//, '').replace(/\/.*$/, '') + (l.crossOrigin != null ? ' (crossorigin)' : ''));
      try{ window.__fbPreconnect({ at: performance.timeOrigin + performance.now(), hosts: [...new Set(ls.map(l => l.href.replace(/^https?:\/\//, '').replace(/\/.*$/, '')))] }); }catch(e){} };
    const mo = new MutationObserver(seen); mo.observe(document, { childList: true, subtree: true }); document.addEventListener('DOMContentLoaded', () => { seen(); mo.disconnect(); }, { once: true }); }
  document.addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('button'); if(b && /submitEmailLogin|submitGateLogin/.test(b.getAttribute('onclick') || '')) mark('signInTap'); }, true);
}

// ---------- one open ----------
const PROFILES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, cpu: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, cpu: 4,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 600) : '')); if(!ok) failed++; }
const runs = [];
const median = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const minOf = a => { const s = a.filter(x => x != null); return s.length ? Math.min(...s) : null; };

async function launch(dir, prof, ctxOpts){
  httpWarm = false; // a browser starting again opens new connections
  siteCached = !!ctxOpts.cached;
  const ctx = await chromium.launchPersistentContext(dir, Object.assign({}, launchOpts(), {
    headless: true, viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor, isMobile: !!prof.isMobile, hasTouch: !!prof.hasTouch,
    userAgent: prof.userAgent, locale: 'en-US', timezoneId: 'Asia/Kuwait', serviceWorkers: 'allow',
  }));
  // nothing leaves the machine: the SDK's addresses get the stand-in, the fonts stylesheet an empty one
  await ctx.route(/^https?:\/\/(?!localhost[:/])/, async route => {
    const url = route.request().url();
    const sdk = SDK_FILES.find(f => url.endsWith('/firebasejs/10.13.0/' + f));
    if(sdk){
      // each file travels once per browser start (the service worker's own copy comes from the HTTP cache, which Playwright turns off here)
      const fresh = !ctxOpts.cached && !(ctxOpts.sdkSeen = ctxOpts.sdkSeen || new Set()).has(sdk);
      if(fresh){ ctxOpts.sdkSeen.add(sdk); if(NET){ if(!ctxOpts.gstaticWarm){ ctxOpts.gstaticWarm = true; await netDown(SDK[sdk].wire, NET.newConnRtts); } else await netDown(SDK[sdk].wire); } }
      if(acct){ acct.http++; acct.httpBytes += SDK[sdk].body.length; acct.httpWire += fresh ? SDK[sdk].wire : 0; }
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: SDK[sdk].body, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=31536000' } });
    }
    if(/fonts\.googleapis\.com/.test(url)){
      if(NET && !ctxOpts.cached) await netDown(1200, NET.newConnRtts); // a new origin, render-blocking (a daily open has it in the HTTP cache)
      return route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts stand-in */' });
    }
    return route.abort();
  });
  await ctx.exposeFunction('__fbPreconnect', info => { if(info && !preconnect) preconnect = { at: info.at, hosts: info.hosts || [] }; });
  for(const [n, fn] of Object.entries({ __fbGet: api.get, __fbSet: api.set, __fbDel: api.del, __fbCommit: api.commit, __fbQuery: api.query, __fbTxGet: api.txGet, __fbTxEnd: api.txEnd, __fbSignIn: api.signIn })) await ctx.exposeFunction(n, fn);
  return ctx;
}

async function openOnce(ctx, prof, who, kind, opts){
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::ERR/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  await cdp.send('Performance.enable');
  let trace = null;
  if(opts.profile){
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start');
    trace = { events: [] };
    cdp.on('Tracing.dataCollected', e => { trace.events.push(...e.value); });
    trace.done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordAsMuchAsPossible',
      includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-v8.compile', 'blink.user_timing', 'loading', 'toplevel', 'blink', 'ServiceWorker'] } });
  }
  acct = freshAcct(); cloudSetup = null; preconnect = null; link.down = link.up = Date.now();
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'commit', timeout: 120000 });
  if(kind === 'first'){
    await page.waitForSelector('#gateGrid .gate-tile', { timeout: 120000 });
    await page.click(`#gateGrid .gate-tile:has-text("${who}")`);
    await page.waitForSelector('#elEmail', { timeout: 30000 });
    await page.fill('#elEmail', STAFF.find(s => s.name === who).email);
    await page.fill('#elPwd', 'invented-password');
    await page.click('#modalInner button.btn');
  }
  // settled: the boot's loadAll is done and nothing has moved for 2 s (no cloud request, no long task) — or the 20-second refresh began
  let state = null;
  const deadline = Date.now() + 150000;
  for(;;){
    await sleep(250);
    state = await page.evaluate(() => { const U = window.__um || { marks: {}, cloud: [], longtasks: [] }; const lastCloud = U.cloud.reduce((m, c) => Math.max(m, c[3]), 0); const lastLt = U.longtasks.reduce((m, l) => Math.max(m, l[0] + l[1]), 0);
      return { now: performance.now(), m: U.marks, lastCloud, lastLt, cloudN: U.cloud.length }; }).catch(() => null);
    if(state && state.m.loadAllEnd != null){
      const quiet = state.now - Math.max(state.m.loadAllEnd, state.lastCloud, state.lastLt);
      if((quiet >= 2000 && !Object.keys(held).length) || state.m.refreshStart != null) break;
    }
    if(Date.now() > deadline) break;
    // a daily open that shows the sign-in screen: the browser lost the phone's storage on its restart (a harness hazard, not the app's) — the device is run again
    if(kind === 'daily' && state && state.m.gateShown != null && state.m.appShown == null && state.now > 15000){ opts.lost = true; break; }
  }
  const settledAt = state ? Math.round(state.now) : null;
  const bootAcct = JSON.parse(JSON.stringify(acct)); // what the open itself read (a later refresh is not counted)
  acct = freshAcct();
  const metrics = {}; (await cdp.send('Performance.getMetrics')).metrics.forEach(m => { metrics[m.name] = m.value; });
  const pg = await page.evaluate(({ who, amount, dueMarker, notMine, dueCount }) => {
    const U = window.__um, nav = performance.getEntriesByType('navigation')[0] || {}, paint = {};
    performance.getEntriesByType('paint').forEach(p => { paint[p.name] = Math.round(p.startTime); });
    const res = performance.getEntriesByType('resource').filter(r => /core\.js|i18n\.js|firebase/.test(r.name)).map(r => [r.name.replace(/^.*\//, ''), Math.round(r.startTime), Math.round(r.responseEnd), r.transferSize, r.workerStart > 0]);
    const ls = {}; let lsTotal = 0;
    try{ for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i), v = localStorage.getItem(k) || ''; lsTotal += k.length + v.length; if(v.length > 20000) ls[k] = Math.round(v.length / 1024); } }catch(e){}
    const due = document.getElementById('dueList'), tc = document.getElementById('targetCard'), g = document.getElementById('greeting');
    const dueText = due ? due.textContent : '';
    return {
      marks: U.marks, preconnect: U.preconnect || [], teamCopy: U.teamCopy || {}, paint, longtasks: U.longtasks, timeline: U.timeline, fns: U.fns, cloudOps: U.cloud.length, cloudLog: U.cloud.slice(0, 400), msRuns: U.msRuns, unshared: U.unshared,
      nav: { workerStart: Math.round(nav.workerStart || 0), responseStart: Math.round(nav.responseStart || 0), responseEnd: Math.round(nav.responseEnd || 0), domInteractive: Math.round(nav.domInteractive || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), transfer: nav.transferSize, sw: !!navigator.serviceWorker.controller },
      res, ls, lsKB: Math.round(lsTotal / 1024),
      shown: { greeting: g ? g.textContent : '', who: typeof currentUser !== 'undefined' && currentUser ? currentUser.name : null, amountOnCard: tc ? window.__um.amountShown(tc) : false,
        dueCards: due ? due.querySelectorAll('.card').length : 0, marker: dueMarker ? dueText.indexOf(dueMarker) >= 0 : true, notMine: (notMine || []).filter(n => dueText.indexOf(n) >= 0),
        appAmount: typeof bestMonthRevenue === 'function' ? UMCore.money(bestMonthRevenue(who).amount) : null, mirrorUsed: typeof _mirrorUsed !== 'undefined' ? Object.keys(_mirrorUsed) : null,
        loadFailed: typeof _loadFailed !== 'undefined' ? Object.keys(_loadFailed) : null, booted: typeof _bootLoaded !== 'undefined' ? _bootLoaded : null, outbox: typeof outboxList === 'function' ? outboxList() : null,
        early: typeof _early !== 'undefined' && _early ? _early.state : null, copyLine: !!document.getElementById('copyLine') },
    };
  }, opts.expect);
  let refresh = null;
  if(opts.refresh && state && state.m.loadAllEnd != null){
    acct = freshAcct();
    await page.waitForFunction(() => window.__um && window.__um.marks.refreshEnd != null, null, { timeout: 60000, polling: 500 }).catch(() => {});
    refresh = await page.evaluate(() => { const U = window.__um, a = U.marks.refreshStart, b = U.marks.refreshEnd; const lt = U.longtasks.filter(l => l[0] >= a - 5); const ra = U.fns.renderAll ? U.fns.renderAll[1] : 0; return { ms: b != null ? b - a : null, renderAllTotal: Math.round(ra), longTasks: lt.length, longMs: lt.reduce((s, l) => s + l[1], 0), maxLong: lt.reduce((m, l) => Math.max(m, l[1]), 0) }; }).catch(() => null);
    if(refresh) Object.assign(refresh, { reads: acct.reads, readKB: Math.round(acct.readBytes / 1024), writes: acct.writes, erpRows: (acct.readKeys['erpRows:*'] || [0])[0], visitsArch: (acct.readKeys['visitsArch:*'] || [0])[0] });
  }
  let profileSummary = null;
  if(opts.profile){
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Tracing.end'); await trace.done;
    profileSummary = { cpu: summarizeProfile(profile), trace: summarizeTrace(trace.events) };
    if(OUT){
      const base = path.join(OUT, `startup-${opts.label}`);
      fs.writeFileSync(base + '.cpuprofile', JSON.stringify(profile));
      fs.writeFileSync(base + '.trace.json', JSON.stringify({ traceEvents: trace.events }));
    }
  }
  await cdp.detach().catch(() => {});
  return { kind, who, t0, settledAt, page: pg, acct: bootAcct, refresh, errors, metrics: { TaskDuration: Math.round((metrics.TaskDuration || 0) * 1000), ScriptDuration: Math.round((metrics.ScriptDuration || 0) * 1000), LayoutDuration: Math.round((metrics.LayoutDuration || 0) * 1000), RecalcStyleDuration: Math.round((metrics.RecalcStyleDuration || 0) * 1000), JSHeapUsedMB: Math.round((metrics.JSHeapUsedSize || 0) / 1048576) }, profile: profileSummary };
}

// ---------- CPU profile and trace summaries ----------
const APP_FILES = (() => { // function name → the js/app file that declares it (for the inlined script)
  const dir = path.join(ROOT, 'www', 'js', 'app'), map = {};
  if(!fs.existsSync(dir)) return map;
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => { const t = fs.readFileSync(path.join(dir, f), 'utf8'); for(const m of t.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)) map[m[1]] = f.replace(/\.js$/, ''); });
  return map;
})();
function shortUrl(u){ return !u ? '' : u.replace(/^https?:\/\/localhost:\d+\//, '').replace(/^https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\//, 'gstatic/'); }
function summarizeProfile(p){
  const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map();
  p.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
  const self = new Map();
  for(let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
  const fnKey = cf => (cf.functionName || '(anonymous)') + ' @' + shortUrl(cf.url) + (cf.url ? ':' + (cf.lineNumber + 1) : '');
  const agg = {}, cats = {}, incl = {};
  let total = 0;
  const catOf = cf => {
    const n = cf.functionName, u = cf.url;
    if(n === '(garbage collector)') return 'GC';
    if(n === '(idle)') return 'idle';
    if(n === '(program)') return 'browser native (parse HTML, style, layout, compile…)';
    if(!u){ if(n === 'parse') return 'JSON.parse'; if(n === 'stringify') return 'JSON.stringify'; if(/^(getItem|setItem|removeItem|key)$/.test(n)) return 'localStorage'; return 'builtins / DOM (' + n + ')'; }
    const s = shortUrl(u);
    if(/^gstatic\//.test(s)) return 'Firebase SDK / stand-in';
    if(/core\.js/.test(s)) return 'core.js';
    if(/i18n\.js/.test(s)) return 'i18n.js';
    if(/index\.html/.test(s) || /js\/app\//.test(s)) return 'app ' + (APP_FILES[n] || (s.match(/js\/app\/([^.]+)/) || [])[1] || 'script (top level / unnamed)');
    return 'other ' + s;
  };
  for(const [id, us] of self){
    const n = byId.get(id); const cf = n.callFrame;
    total += us;
    const k = fnKey(cf); agg[k] = (agg[k] || 0) + us;
    const c = catOf(cf); cats[c] = (cats[c] || 0) + us;
    // inclusive time per function (once per stack)
    const seen = new Set();
    for(let x = id; x != null; x = parent.get(x)){ const k2 = fnKey(byId.get(x).callFrame); if(!seen.has(k2)){ seen.add(k2); incl[k2] = (incl[k2] || 0) + us; } }
  }
  const ms = us => Math.round(us / 1000);
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, ms(v)]);
  // the native "builtins / DOM (x)" categories folded when small
  const catsOut = {}; Object.entries(cats).forEach(([k, v]) => { const kk = /^builtins/.test(k) && v < 20000 ? 'builtins / DOM (other)' : k; catsOut[kk] = (catsOut[kk] || 0) + v; });
  return { totalMs: ms(total), categories: top(catsOut, 40), selfTop: top(agg, 40), inclusiveTop: top(Object.fromEntries(Object.entries(incl).filter(([k]) => !/^\(root\)|^\(program\)|^\(idle\)/.test(k))), 40) };
}
function summarizeTrace(events){
  // the page's renderer main thread: the CrRendererMain with the most work
  const names = {}; events.filter(e => e.ph === 'M' && e.name === 'thread_name').forEach(e => { names[e.pid + ':' + e.tid] = e.args.name; });
  const work = {}; events.forEach(e => { const k = e.pid + ':' + e.tid; if(names[k] === 'CrRendererMain' && e.ph === 'X') work[k] = (work[k] || 0) + (e.dur || 0); });
  const main = Object.entries(work).sort((a, b) => b[1] - a[1])[0];
  if(!main) return null;
  const [pid, tid] = main[0].split(':').map(Number);
  const xs = [];
  const open = [];
  events.filter(e => e.pid === pid && e.tid === tid).sort((a, b) => a.ts - b.ts).forEach(e => {
    if(e.ph === 'X' && e.dur != null) xs.push({ name: e.name, ts: e.ts, end: e.ts + e.dur, args: e.args });
    else if(e.ph === 'B') open.push(e);
    else if(e.ph === 'E'){ for(let i = open.length - 1; i >= 0; i--){ if(open[i].name === e.name){ const b = open.splice(i, 1)[0]; xs.push({ name: b.name, ts: b.ts, end: e.ts, args: Object.assign({}, b.args, e.args) }); break; } } }
  });
  xs.sort((a, b) => a.ts - b.ts || b.end - a.end);
  const self = {}, stack = [];
  const compile = [], evals = [];
  xs.forEach(x => {
    while(stack.length && stack[stack.length - 1].end <= x.ts) stack.pop();
    const par = stack[stack.length - 1];
    x.self = x.end - x.ts;
    if(par) par.self -= Math.min(x.end, par.end) - x.ts;
    stack.push(x);
    if(/^v8\.compile$|^V8\.CompileCode$|v8\.compileModule|^v8\.produceCache|^v8\.consumeCache|^v8\.deserializeOnBackground/.test(x.name)) compile.push(x);
    if(x.name === 'EvaluateScript' || x.name === 'v8.run') evals.push(x);
  });
  xs.forEach(x => { self[x.name] = (self[x.name] || 0) + Math.max(0, x.self); });
  const total = xs.filter(x => !stack.includes(x) || true).reduce((s, x) => s + Math.max(0, x.self), 0);
  const top = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v / 1000)]);
  const urlOf = x => shortUrl((x.args && (x.args.data && (x.args.data.url || x.args.data.fileName) || x.args.fileName)) || '');
  const comp = {}; compile.forEach(x => { const k = x.name + ' ' + urlOf(x); const c = comp[k] = comp[k] || { ms: 0, n: 0, cache: new Set() }; c.ms += (x.end - x.ts) / 1000; c.n++; const d = (x.args && x.args.data) || {}; if(d.consumedCacheSize) c.cache.add('consumed ' + d.consumedCacheSize); if(d.cacheRejected) c.cache.add('rejected'); if(d.producedCacheSize) c.cache.add('produced ' + d.producedCacheSize); if(d.notStreamedReason) c.cache.add('not streamed: ' + d.notStreamedReason); if(d.streamed) c.cache.add('streamed'); });
  const ev = {}; evals.forEach(x => { const k = x.name + ' ' + urlOf(x); ev[k] = (ev[k] || 0) + (x.end - x.ts) / 1000; });
  const bg = {}; events.forEach(e => { const k = e.pid + ':' + e.tid; if(e.ph === 'X' && /parseOnBackground|compileOnBackground|v8\.parseOnBackground|V8\.Stream/i.test(e.name)) bg[e.name + ' (' + (names[k] || k) + ')'] = (bg[e.name + ' (' + (names[k] || k) + ')'] || 0) + e.dur / 1000; });
  return { mainThreadBusyMs: Math.round(total / 1000), selfByEvent: top,
    compile: Object.entries(comp).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, c]) => [k, Math.round(c.ms), c.n, [...c.cache].slice(0, 4).join(', ')]),
    evaluate: Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)]),
    background: Object.entries(bg).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, Math.round(v)]) };
}

// ---------- the expected picture for each person ----------
const SHORT = n => { const w = n.trim().split(/\s+/); return /^(dr|prof|mr|mrs|ms)\.?$/i.test(w[0]) && w[1] ? w[1] : w[0]; }; // the greeting's first name, a title left out (v125)
function expectFor(who){
  const role = FIX.people[who];
  const today = FIX.today;
  const due = FIX.data.clinics.filter(c => c.cls !== 'Closed' && c.nextFollowUp && c.nextFollowUp <= today && (role !== 'rep' || c.rep === who)).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
  const own = due.filter(c => c.rep === who);
  const others = FIX.data.clinics.filter(c => c.rep !== who && c.cls !== 'Closed' && c.nextFollowUp && c.nextFollowUp <= today).map(c => c.name)
    .filter(n => !FIX.data.clinics.some(c => c.rep === who && (c.name.indexOf(n) >= 0 || n.indexOf(c.name) >= 0)));
  const raw = Math.round(core.monthAchievement(who, FIX.data).amount * 100) / 100, amount = core.money(raw);
  return { who, role, greet: SHORT(who), dueMarker: own.length ? own[0].name : null, dueCount: due.length, notMine: role === 'rep' ? others.slice(0, 12) : [], amount, raw }; // the greeting names her in either language ("Good morning, Mariam" / "صباح الخير، Mariam")
}

// ---------- one device: a first open, then (browser started again) a daily open ----------
let devicesRedone = 0;
async function device(profName, who, n, opts){
  for(let attempt = 1; attempt <= 3; attempt++){
    const r = await deviceOnce(profName, who, n, opts);
    if(r) return r;
    devicesRedone++;
    console.log(`  (${profName} ${who} #${n}: the browser lost the phone's storage on its restart — device run again)`);
  }
  throw new Error('the browser kept losing the phone storage on restart');
}
async function deviceOnce(profName, who, n, opts){
  const prof = PROFILES[profName];
  NET = NETS[profName];
  resetCloud();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'um-startup-dev-'));
  const exp = expectFor(who);
  const label = `${profName}-${who === 'Dr. Ghaith' ? 'sup' : 'rep'}-${n}${opts.lang ? '-' + opts.lang : ''}`;
  const out = [];
  try{
    // first open: a new device
    let ctx = await launch(dir, prof, { cached: false });
    await ctx.addInitScript(initScript, { off: OFFSET_SRC, expect: exp, lang: opts.lang || null });
    const first = await openOnce(ctx, prof, who, 'first', { expect: exp, profile: opts.profile, label: label + '-first' });
    // the service worker installed and its cache full before the device "closes for the night"
    await ctx.pages()[0].evaluate(async () => { const r = await navigator.serviceWorker.ready; for(let i = 0; i < 100; i++){ const k = await caches.keys(); if(k.length){ const c = await caches.open(k[0]); const m = await c.match('./index.html'); if(m) break; } await new Promise(z => setTimeout(z, 200)); } return !!r; }).catch(() => false);
    // leave the app (its storage connection closes, so the browser commits the page's storage now) and let the commit reach the disk
    await ctx.pages()[0].goto('about:blank').catch(() => {});
    await sleep(6000);
    await ctx.close();
    out.push(Object.assign(first, { device: profName, label: label + '-first', lang: opts.lang || 'en' }));
    // daily open: the same device the next morning — the browser starts again from its disk
    resetCloud();
    ctx = await launch(dir, prof, { cached: true });
    await ctx.addInitScript(initScript, { off: OFFSET_SRC, expect: exp, lang: opts.lang || null });
    const dOpts = { expect: exp, profile: opts.profile, label: label + '-daily', refresh: (REFRESH || (profName === 'laptop' && who === 'Mariam')) && !opts.profile };
    const daily = await openOnce(ctx, prof, who, 'daily', dOpts);
    await ctx.close();
    if(dOpts.lost) return null;
    out.push(Object.assign(daily, { device: profName, label: label + '-daily', lang: opts.lang || 'en' }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  out.forEach(r => { r.expect = exp; r.profiled = !!opts.profile; });
  return out;
}

// ---------- the phone's store (v126): its rules, each shown on one laptop device (the supervisor's) ----------
function storeDumpInPage(){
  return new Promise(res => {
    let rq; try{ rq = indexedDB.open('um_keep'); }catch(e){ return res(null); }
    rq.onupgradeneeded = () => { try{ rq.transaction.abort(); }catch(e){} }; // never create it from here
    rq.onerror = () => res(null);
    rq.onsuccess = () => { const db = rq.result; if(!db.objectStoreNames.contains('docs')){ db.close(); return res([]); }
      const g = db.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => { db.close(); res(g.result.map(e => ({ k: e.k, rev: e.rev, text: e.text, at: e.at, canon: e.canon }))); }; g.onerror = () => { db.close(); res(null); }; };
  });
}
async function storeRules(){
  const prof = PROFILES.laptop; NET = NETS.laptop; resetCloud();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'um-startup-store-'));
  const sup = 'Dr. Ghaith', exp = expectFor(sup);
  const reads = (r, g) => ((r.acct || r).readKeys[g] || [0])[0];
  const ctx = await launch(dir, prof, { cached: false });
  await ctx.addInitScript(initScript, { off: OFFSET_SRC, expect: exp, lang: null });
  const errors = [];
  try{
    const first = await openOnce(ctx, prof, sup, 'first', { expect: exp, label: 'store-first' });
    const page = ctx.pages()[0];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    const dump = () => page.evaluate(storeDumpInPage);
    const ix = () => JSON.parse(cloud.get('visitsIndex').value).months;
    // (the store's own path: each start here reads the cloud first — the phone forgets whom it last signed in, so no early
    // open draws from its copy before; the early open's window has its own harness, speed-open.e2e.js)
    const reopen = async label => { await page.evaluate(() => { try{ localStorage.removeItem('um_lastUser'); }catch(e){} }).catch(() => {}); return openOnce(ctx, prof, sup, 'daily', { expect: exp, label }); };
    // the past months a start read during its own read (loadVisits), before anything was drawn — the others stood in from the store
    const startReads = r => { const lv = cloudLoadVisits(r.page); return (r.page.cloudLog || []).filter(c => c[0] === 'get' && /^visitsArch:/.test(c[1]) && (!lv || c[2] < lv[2])).length; };
    const lsState = () => page.evaluate(() => { const o = {}; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); o[k] = (localStorage.getItem(k) || '').length; } return o; });
    const lsFirst = await lsState();
    // K1 — only what the cloud returned: its exact text, at the key (and for a month the index revision) it was read at
    let ents = await dump();
    const months = Object.keys(ix()).sort();
    const bad = (ents || []).filter(e => !cloud.has(e.k) || e.text !== cloud.get(e.k).value || (/^visitsArch:/.test(e.k) && e.rev !== ix()[e.k.slice(11)].rev)).map(e => e.k);
    check(`store K1: the store holds each sales chunk and past month exactly as the cloud returned it (text, key, index revision)`,
      !!ents && ents.filter(e => /^erpRows:/.test(e.k)).length === 26 && ents.filter(e => /^visitsArch:/.test(e.k)).length === months.length && !bad.length, { n: ents && ents.length, bad: bad.slice(0, 5) });
    // K2 — a month this phone saves is never kept at the revision it wrote, nor as its own copy; the next start reads it
    const M1 = months[0], before1 = cloud.get('visitsArch:' + M1).value, rev1 = ix()[M1].rev;
    const revsBefore = ix(), textsBefore = Object.fromEntries(months.map(m => [m, cloud.get('visitsArch:' + m).value]));
    const s1 = await page.evaluate(async M => { const v = visits.find(x => x && x.date && x.date.slice(0, 7) === M && !x.callOnly); v.notes = (v.notes || '') + ' [edited on this phone]'; const r = await persistTold('visits'); return { id: v.id, ok: r.ok }; }, M1);
    await sleep(500);
    let e1 = (await dump()).find(e => e.k === 'visitsArch:' + M1);
    // the months that save wrote (their index revision moved): none of them is in the store as written
    const moved = months.filter(m => ix()[m].rev !== revsBefore[m].rev), d2 = await dump();
    const asWritten = moved.filter(m => { const e = d2.find(x => x.k === 'visitsArch:' + m); return !e || e.rev !== revsBefore[m].rev || e.text !== textsBefore[m]; });
    check(`store K2: the past months this phone saved stay in the store as the cloud returned them before — never this phone's copy, never the revision it wrote`,
      s1.ok && moved.includes(M1) && cloud.get('visitsArch:' + M1).value.indexOf('[edited on this phone]') >= 0 && !!e1 && e1.rev === rev1 && e1.text === before1 && !asWritten.length, { s1, moved: moved.length, asWritten });
    const r2 = await reopen('store-K2');
    const dbg2 = await page.evaluate(() => ({ kept: Object.keys(_visitsArch).filter(m => _visitsArch[m].kept != null).length, quiet: visitsTombsQuiet(), held: Object.keys(_tombsHeld).map(k => k + ':' + _tombsHeld[k].size), pend: Object.keys(_tombsPending).map(k => k + ':' + _tombsPending[k].size), again: Object.keys(_tombsAgain).map(k => k + ':' + _tombsAgain[k].size), outbox: outboxList() }));
    e1 = (await dump()).find(e => e.k === 'visitsArch:' + M1);
    const d2b = await dump(), notNew = moved.filter(m => { const e = d2b.find(x => x.k === 'visitsArch:' + m); return !e || e.rev !== ix()[m].rev || e.text !== cloud.get('visitsArch:' + m).value; });
    check(`store K2: the next start reads at once the months whose revision moved (${moved.length}), draws the others from the store and reads them from the cloud before it ends, and keeps what the cloud returned at the new revisions`,
      startReads(r2) === moved.length && reads(r2, 'visitsArch:*') === months.length && dbg2.kept === 0 && !notNew.length, { atStart: startReads(r2), read: reads(r2, 'visitsArch:*'), dbg2, notNew });
    // K3 — a photo mark settled in a past month (patchVisitPhotos) is not taken into the store either
    // a waiting photo mark in a past month (the fixture's are in the running month): another phone's, put in the cloud's
    // archive with the index revision moved, as a save would, then read in by a refresh
    const M2 = months[1], a2 = JSON.parse(cloud.get('visitsArch:' + M2).value), v2 = a2.find(x => x && !x.callOnly) || a2[0];
    v2.photos = (v2.photos || []).concat([{ id: 'harness-photo-1', thumb: 'data:image/jpeg;base64,AAAA', pending: true, dev: 'dev-sample-other-phone', at: Date.parse(FIX.now) - 86400000 }]);
    cloud.set('visitsArch:' + M2, { value: JSON.stringify(a2), updated: Date.now() });
    { const idx = JSON.parse(cloud.get('visitsIndex').value); idx.months[M2].rev = Date.now(); cloud.set('visitsIndex', { value: JSON.stringify(idx), updated: Date.now() }); }
    await page.evaluate(() => loadAll());
    const pv = { M: M2, visitId: v2.id, photoId: 'harness-photo-1' };
    if(pv){
      const before3 = cloud.get('visitsArch:' + pv.M).value, rev3 = ix()[pv.M].rev;
      await page.evaluate(c => patchVisitPhotos([{ visitId: c.visitId, photoId: c.photoId, lost: false }]), pv);
      await sleep(500);
      const e3 = (await dump()).find(e => e.k === 'visitsArch:' + pv.M);
      check(`store K3: a photo mark settled in a past month (patchVisitPhotos) leaves the store as it was; the index revision moves`,
        cloud.get('visitsArch:' + pv.M).value !== before3 && ix()[pv.M].rev !== rev3 && !!e3 && e3.rev === rev3 && e3.text === before3, { M: pv.M });
      acct = freshAcct();
      await page.evaluate(() => loadAll());
      const e3b = (await dump()).find(e => e.k === 'visitsArch:' + pv.M);
      check(`store K3: the next refresh reads that month from the cloud and keeps it at the new revision`, reads(acct, 'visitsArch:*') === 1 && !!e3b && e3b.rev === ix()[pv.M].rev && e3b.text === cloud.get('visitsArch:' + pv.M).value, acct.readKeys['visitsArch:*']);
    } else check('store K3: the fixture has a waiting photo mark in a past month', false);
    // K4 + K8 — a month changed in the cloud with its revision still owed: the stale kept copy stands in on screen;
    // the full backup reads the cloud's; a save of that month merges three ways against the cloud and loses nothing
    const M3 = months[months.length - 1], arch = JSON.parse(cloud.get('visitsArch:' + M3).value), X = arch[0], Y = arch[1];
    X.notes = 'changed on another phone'; cloud.set('visitsArch:' + M3, { value: JSON.stringify(arch), updated: Date.now() });
    const r4 = await reopen('store-K4');
    const seen4 = await page.evaluate(id => (visits.find(x => x.id === id) || {}).notes, X.id);
    check(`store K4: a past month changed in the cloud while its index revision was owed stands in from the store for the first paint only — the start reads it from the cloud before it ends, and the screen shows the other phone's change`,
      startReads(r4) === 0 && reads(r4, 'visitsArch:*') === months.length && seen4 === 'changed on another phone', { atStart: startReads(r4), read: reads(r4, 'visitsArch:*'), seen4 });
    const fb = await page.evaluate(async k => { let v = null; await readCloudForBackup(async d => { if(d.key === k) v = d.value; }); return v; }, 'visitsArch:' + M3);
    check(`store K8: the full backup reads the cloud's documents — that month is in it as the cloud holds it, not as the store keeps it`, fb === cloud.get('visitsArch:' + M3).value && fb.indexOf('changed on another phone') >= 0);
    const s4 = await page.evaluate(async id => { const v = visits.find(x => x.id === id); v.notes = 'edited on this phone'; const r = await persistTold('visits'); return r.ok; }, Y.id);
    const after4 = JSON.parse(cloud.get('visitsArch:' + M3).value), seen4b = await page.evaluate(id => (visits.find(x => x.id === id) || {}).notes, X.id);
    check(`store K4: saving that month keeps the other phone's change and this phone's edit (three-way merge in the transaction), and the screen takes the other's`,
      s4 && (after4.find(x => x.id === X.id) || {}).notes === 'changed on another phone' && (after4.find(x => x.id === Y.id) || {}).notes === 'edited on this phone' && seen4b === 'changed on another phone', { s4, seen4b });
    // K6 — the daily backup: never taken while a past month on screen came from the store and was not read from the
    // cloud yet (here: their reads fail at the start); taken by itself once a refresh has read them. Sales files from the
    // store are the cloud's own rows (exact under their key): they hold nothing back and are not downloaded again
    const snapKey = 'snap_' + FIX.today;
    cloud.delete(snapKey); await page.evaluate(() => { try{ localStorage.removeItem('um_snapDay'); localStorage.removeItem('um_snapFail'); }catch(e){} });
    failGet = /^visitsArch:/;
    const r6 = await reopen('store-K6');
    const s6 = await page.evaluate(async () => { await maybeSnapshot(); return { why: snapshotBlockedWhy(), kept: keptOnScreen(), asked: _keptForSnap }; });
    const kept6 = await page.evaluate(() => Object.keys(_visitsArch).filter(m => _visitsArch[m].kept != null).length);
    check(`store K6: today's backup is not taken while past months on screen came from the store and could not be read from the cloud yet`, kept6 > 0 && s6.why === 'copy' && s6.kept && s6.asked && !cloud.has(snapKey), Object.assign({ kept6, snap: cloud.has(snapKey) }, s6));
    failGet = null;
    acct = freshAcct();
    const s6b = await page.evaluate(async () => { await loadAll(); if(_refreshFlush){ try{ await _refreshFlush; }catch(e){} } return { why: snapshotBlockedWhy(), kept: keptOnScreen() }; });
    for(let i = 0; i < 40 && !cloud.has(snapKey); i++) await sleep(250); // the backup is tried again by itself once they are read
    // (every month: the kept ones, and any the start could not read at all — its revision had moved)
    check(`store K6: the next refresh reads them from the cloud (every past month, no sales chunk), then today's backup is taken by itself`, reads(acct, 'visitsArch:*') === months.length && reads(acct, 'erpRows:*') === 0 && !s6b.kept && s6b.why === null && cloud.has(snapKey), { s6b, kept6, v: reads(acct, 'visitsArch:*'), e: reads(acct, 'erpRows:*') });
    // K7 — the whole-day Restore stops, nothing changed, while a past month on screen came from the store and was not
    // read from the cloud yet, and asks for it; once read, nothing holds it back
    failGet = /^visitsArch:/;
    const r7a = await reopen('store-K7');
    const day = (() => { const d = new Date(FIX.today + 'T00:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    acct = freshAcct();
    const s7 = await page.evaluate(async d => { const said = [], orig = window.showToast; window.showToast = function(m){ said.push(String(m)); return orig.apply(this, arguments); };
      try{ await restoreSnapshotNow(d); } finally { window.showToast = orig; } return { said, kept: keptOnScreen() }; }, day);
    const w7 = acct.writes;
    failGet = null;
    const s7b = await page.evaluate(async () => { try{ await visitsConfirmKept(); }catch(e){} return { kept: keptOnScreen() }; });
    check(`store K7: a whole-day Restore stops with nothing changed while past months on screen came from the store and could not be read from the cloud yet, and asks for them; once read, nothing holds it back`,
      startReads(r7a) === 0 && s7.kept && w7 === 0 && s7.said.some(t => /first reads the past months again from the cloud/.test(t)) && !s7b.kept, { said: s7.said, writes: w7, s7b });
    // K5 — while a delete of a visit is held, every past month comes from the cloud
    const victim = 'harness-deleted-visit'; // deleted on this phone 10 days ago; the log lost it (an older app's 7-day cut) and no list holds it
    await page.evaluate(id => { const raw = JSON.parse(localStorage.getItem('um_tombs') || '{}'); raw.visits = raw.visits || {}; raw.visits[id] = Date.now() - 10 * 86400000; localStorage.setItem('um_tombs', JSON.stringify(raw)); localStorage.setItem('um_tombsMig123', '1'); }, victim);
    const r5 = await reopen('store-K5');
    const held5 = await page.evaluate(id => !!(_tombsHeld.visits && _tombsHeld.visits.has(id)), victim);
    const dbg5 = await page.evaluate(id => ({ ts: _tombstones.visits.has(id), at: (_tombsLocalAt.visits || {})[id], doc: (tombsDoc.visits || {})[id], unpub: !!(_tombsUnpublished.visits && _tombsUnpublished.visits.has(id)), now: Date.now(), raw: localStorage.getItem('um_tombs').slice(0, 200) }), victim);
    const v5 = await page.evaluate(() => Object.keys(_visitsArch).filter(m => _visitsArch[m].kept != null).length);
    check(`store K5: while a delete of a visit is held on this phone, every past month is read from the cloud (none from the store)`, held5 && reads(r5, 'visitsArch:*') === months.length && v5 === 0, { held5, read: reads(r5, 'visitsArch:*'), v5, dbg5 });
    await page.evaluate(id => { const raw = JSON.parse(localStorage.getItem('um_tombs') || '{}'); if(raw.visits) delete raw.visits[id]; localStorage.setItem('um_tombs', JSON.stringify(raw)); localStorage.removeItem('um_tombsHeldAt'); }, victim);
    // K9 — the store does not open, does not answer, or was emptied: a miss — the cloud is read, the screen is right
    for(const how of ['throw', 'hang', 'evicted']){
      await page.evaluate(h => { if(h === 'evicted') return new Promise(r => { const d = indexedDB.deleteDatabase('um_keep'); d.onsuccess = d.onerror = d.onblocked = () => r(); }); localStorage.setItem('__keepFail', h); }, how);
      const r9 = await reopen('store-K9-' + how);
      await page.evaluate(() => localStorage.removeItem('__keepFail'));
      const m9 = r9.page.marks;
      check(`store K9: the store ${how === 'throw' ? 'does not open' : how === 'hang' ? 'does not answer' : 'was emptied by the browser'} — a miss: every past month and chunk is read from the cloud, her figure is right`,
        reads(r9, 'visitsArch:*') === months.length && reads(r9, 'erpRows:*') === 26 && r9.page.shown.amountOnCard && m9.loadAllEnd - m9.loadAllStart < 9000 && !r9.errors.length, { v: reads(r9, 'visitsArch:*'), e: reads(r9, 'erpRows:*'), ms: m9.loadAllEnd - m9.loadAllStart, errors: r9.errors.slice(0, 3) });
    }
    ents = await dump();
    check(`store K9: once it answers again, the store is filled from the cloud's reads`, !!ents && ents.length === 26 + months.length, { n: ents && ents.length });
    // K10 — a sign-out and another person: the store and the phone's copies stay exactly as they are; her start uses them
    const mirrors = async () => Object.keys(await lsState()).filter(k => /^um_mirror:/.test(k)).sort().join(',');
    const m10 = await mirrors(), n10 = ents.length;
    await page.evaluate(() => switchUser());
    const e10 = await dump(), mm10 = await mirrors();
    acct = freshAcct();
    await page.waitForSelector('#gateGrid .gate-tile', { timeout: 30000 });
    await page.click(`#gateGrid .gate-tile:has-text("Mariam")`);
    await page.waitForSelector('#gatePassword', { timeout: 30000 }); // the phone knows the team's addresses now: the password only
    await page.fill('#gatePassword', 'invented-password');
    await page.click('#modalInner button.btn');
    await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Mariam' && _bootLoaded && !refreshRunning(), null, { timeout: 60000, polling: 250 });
    const own10 = await page.evaluate(() => UMCore.money(bestMonthRevenue('Mariam').amount));
    check(`store K10: a sign-out leaves the store and the phone's copies as they are; the next person's start uses them (no past month, no chunk downloaded)`,
      !!e10 && e10.length === n10 && mm10 === m10 && reads(acct, 'visitsArch:*') === 0 && reads(acct, 'erpRows:*') === 0 && own10 === expectFor('Mariam').amount, { n: e10 && e10.length, n10, v: reads(acct, 'visitsArch:*'), e: reads(acct, 'erpRows:*'), own10 });
    // K11 — no signal on a phone holding a heavy year: a visit saved now is queued and lands in the phone's own storage
    // (not memory only); the store takes no room in web storage (the same keys and sizes as before it existed)
    const lsNow = await lsState();
    const grew = Object.keys(lsNow).filter(k => !(k in lsFirst) && !/^(um_snapDay|um_snapFail|__keepFail|um_base:|um_tombs|um_tombsHeldAt|um_tombsUnpub|um_renamePending)/.test(k));
    cloudDown = true;
    const q = await page.evaluate(async () => {
      const id = 'harness-queued-visit'; const c = clinics.find(x => x && x.rep === currentUser.name) || clinics[0];
      visits.push({ id, date: todayStr(), ts: Date.now(), rep: currentUser.name, clinicId: c.id, clinicName: c.name, doctorIds: [], notes: 'saved with no signal' });
      const r = await persistTold('visits');
      return { ok: r.ok, queued: outboxList().includes('visits'), onPhone: (localStorage.getItem('um_mirror:visits') || '').indexOf(id) >= 0, memOnly: _memOnly.has('visits'), stale: !!_deviceStale.visits };
    });
    cloudDown = false;
    check(`store K11: no signal, a heavy year on the phone: a visit saved now is queued and kept in the phone's storage, not memory only`, q.queued && q.onPhone && !q.memOnly && !q.stale, q);
    check(`store K11: the store takes no room in the phone's web storage (no key beyond what the first open wrote)`, !grew.length, grew);
    check(`store: no page errors`, !errors.length && !first.errors.length, errors.slice(0, 5));
  } finally { await ctx.close().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); cloudDown = false; failGet = null; }
}
// the boot's loadVisits that read the cloud: the first that began with the boot's loadAll (an early open draws from the
// phone's copy with a loadVisits of its own before it, v126 speed part 3)
function cloudLoadVisits(pg){ const a = pg.marks && pg.marks.loadAllStart; return (pg.timeline || []).find(x => x[0] === 'loadVisits' && (a == null || x[1] >= a - 1)); }
function ownPainted(pg){
  const m = pg.marks; if(m.ownDom == null) return null;
  const next = (pg.msRuns || []).find(x => x[0] >= m.ownDom);
  return next && m.ownVisible != null && next[0] < m.ownVisible ? next[0] : m.ownVisible;
}
function rowOf(r){
  const m = r.page.marks, lt = r.page.longtasks.filter(l => l[0] <= (r.settledAt || Infinity));
  return {
    shell: r.page.paint['first-contentful-paint'] != null ? r.page.paint['first-contentful-paint'] : null,
    gate: m.gateShown, appShown: m.appShown, signIn: m.signInTap, loadAllStart: m.loadAllStart, data: ownPainted(r.page), figures: m.figuresVisible, upToDate: m.upToDate, cloud: m.loadAllEnd, settled: r.settledAt,
    afterTap: m.signInTap != null && ownPainted(r.page) != null ? ownPainted(r.page) - m.signInTap : null,
    render: r.page.fns.renderAll ? Math.round(r.page.fns.renderAll[1]) : null, targetCard: r.page.fns.renderTargetCard ? Math.round(r.page.fns.renderTargetCard[1]) : null,
    netDone: (() => { const t = r.page.timeline.filter(x => /^(loadVisits|loadErpSales|refreshTombs|loadTeam)$/.test(x[0]) && x[1] <= (m.loadAllEnd || Infinity)); return t.length ? Math.max(...t.map(x => x[2])) : null; })(),
    refreshMs: r.refresh ? r.refresh.ms : null, refreshRender: r.refresh && r.refresh.renderAllTotal != null ? Math.round(r.refresh.renderAllTotal - (r.page.fns.renderAll ? r.page.fns.renderAll[1] : 0)) : null, refreshReads: r.refresh ? r.refresh.reads : null, refreshKB: r.refresh ? r.refresh.readKB : null, refreshLongMs: r.refresh ? r.refresh.longMs : null, refreshMaxLong: r.refresh ? r.refresh.maxLong : null,
    reads: r.acct.reads, readKB: Math.round(r.acct.readBytes / 1024), writes: r.acct.writes, httpKB: Math.round(r.acct.httpWire / 1024),
    longTasks: lt.length, longMs: lt.reduce((s, l) => s + l[1], 0), maxLong: lt.reduce((x, l) => Math.max(x, l[1]), 0),
    task: r.metrics.TaskDuration, script: r.metrics.ScriptDuration, heap: r.metrics.JSHeapUsedMB, lsKB: r.page.lsKB,
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  if(OUT) fs.mkdirSync(OUT, { recursive: true });
  const people = (process.env.ONLY === 'rep' ? ['Mariam'] : process.env.ONLY === 'sup' ? ['Dr. Ghaith'] : ['Mariam', 'Dr. Ghaith']);
  const profs = process.env.PROFILES ? process.env.PROFILES.split(',') : ['laptop', 'phone'];
  console.log(`site: ${SITE_KIND} — ${SITE}`);
  console.log(`data: ${JSON.stringify(FIX.counts)}`);
  console.log(`firebase SDK: ${SDK_DIR ? 'real bytes from ' + SDK_DIR + ' + stand-in' : 'stand-in only (the real SDK\'s ~515 KB are not parsed here)'}`);
  for(const profName of profs){
    for(const who of people){
      for(let n = 1; n <= (process.env.PROFILE_ONLY === '1' ? 0 : RUNS); n++){
        const t = Date.now();
        const rs = await device(profName, who, n, {});
        rs.forEach(r => runs.push(r));
        { const f = rowOf(rs[0]), d = rowOf(rs[1]); console.log(`  ${profName} ${who} #${n}: first own ${f.data} / figures ${f.figures} / up to date ${f.upToDate} ms, daily own ${d.data} / figures ${d.figures} / up to date ${d.upToDate} ms (${Math.round((Date.now() - t) / 1000)} s)`); }
        if(process.env.VERBOSE === '1') rs.forEach(r => {
          console.log(`    ${r.kind}: marks ${JSON.stringify(r.page.marks)} fcp ${r.page.paint['first-contentful-paint']} nav ${JSON.stringify(r.page.nav)}`);
          console.log(`      boot: ${r.page.timeline.filter(x => x[1] <= (r.page.marks.refreshStart || Infinity)).map(x => `${x[0]} ${x[1]}→${x[2]}`).join(', ')}`);
          console.log(`      sync fns (calls, ms, max): ${Object.entries(r.page.fns).sort((a, b) => b[1][1] - a[1][1]).slice(0, 14).map(([k, v]) => `${k} ${v[0]}×${Math.round(v[1])}/${Math.round(v[2])}`).join(', ')}`);
          console.log(`      long tasks: ${JSON.stringify(r.page.longtasks.slice(0, 12))} reads: ${JSON.stringify(r.acct.readKeys)} writes: ${JSON.stringify(r.acct.writeKeys)} http ${r.acct.http} (${Math.round(r.acct.httpWire / 1024)} KB wire) ls ${r.page.lsKB} KB ${JSON.stringify(r.page.ls)}`);
          console.log(`      resources: ${JSON.stringify(r.page.res)} refresh: ${JSON.stringify(r.refresh)}`);
        });
      }
      if(PROFILE && profName === 'phone'){
        const rs = await device(profName, who, 'p', { profile: true });
        rs.forEach(r => runs.push(r));
        console.log(`  ${profName} ${who} profiled: first ${rowOf(rs[0]).data} ms, daily ${rowOf(rs[1]).data} ms`);
      }
    }
  }
  if(process.env.AR === '1' && profs.includes('phone') && people.includes('Mariam')){
    for(let n = 1; n <= RUNS; n++){ const rs = await device('phone', 'Mariam', n, { lang: 'ar' }); rs.forEach(r => runs.push(r)); console.log(`  phone Mariam (Arabic) #${n}: daily ${rowOf(rs[1]).data} ms`); }
  }

  if(process.env.STORE_RULES !== '0' && profs.includes('laptop')){ const t = Date.now(); await storeRules(); console.log(`  the store's rules: ${Math.round((Date.now() - t) / 1000)} s`); }
  // ---------- correctness: the right person's own data, nothing written, no errors ----------
  runs.forEach(r => {
    const s = r.page.shown, e = r.expect, tag = `${r.label} (${r.who})`;
    check(`${tag}: her own Today screen is drawn — greeting, follow-ups, month figure`, r.page.marks.ownVisible != null && s.who === r.who, { marks: r.page.marks, who: s.who });
    check(`${tag}: her month figure is ${e.amount} (UMCore.monthAchievement on the fixture), on the card and in the app`, s.amountOnCard && s.appAmount === e.amount, { app: s.appAmount, want: e.amount });
    check(`${tag}: the follow-ups due are hers (${e.dueCount}${e.role === 'rep' ? ', none of another rep\'s' : ', the team\'s'})`, s.dueCards === e.dueCount && s.marker && s.notMine.length === 0, { cards: s.dueCards, want: e.dueCount, notMine: s.notMine });
    check(`${tag}: read from the cloud (no copy used in its place, no read failed), nothing queued`, (s.mirrorUsed || []).length === 0 && (s.loadFailed || []).length === 0 && (s.outbox || []).length === 0 && s.booted === true, { mirrorUsed: s.mirrorUsed, loadFailed: s.loadFailed, outbox: s.outbox });
    check(`${tag}: opening writes nothing to the cloud`, r.acct.writes === 0, r.acct.writeKeys);
    check(`${tag}: no page errors`, r.errors.length === 0, r.errors.slice(0, 5));
    if(r.kind === 'daily') check(`${tag}: the daily open is served by the service worker`, r.page.nav.sw === true, r.page.nav);
    // v126: what did not change is not downloaded again; the team lists beside the others; the figures share the month's lines
    const rk = r.acct.readKeys, n = g => (rk[g] || [0])[0];
    if(r.kind === 'daily'){
      check(`${tag}: the daily open downloads no sales file it keeps (erpRows:* read ${n('erpRows:*')} times, v125: 26)`, n('erpRows:*') === 0, rk['erpRows:*']);
      // v126 review: a kept month stands in for the first paint only — the start reads it from the cloud before it ends
      const lv = cloudLoadVisits(r.page), arch = (r.page.cloudLog || []).filter(c => c[0] === 'get' && /^visitsArch:/.test(c[1]));
      // v126 speed, part 3: a daily open draws from the phone's copy first (the early open) — every past month is on screen
      // before any is read, and the start's read then reads each from the cloud once (the store stands in only for a month
      // whose read fails); without the early open, a kept month stands in from the store and is read after the start's read
      const fd0 = r.page.marks.firstDraw, firstAsk = arch.length ? Math.min(...arch.map(c => c[2])) : null;
      if(r.page.shown.early) check(`${tag}: the daily open draws the past months from the phone's copy before any is read (the early open), and reads each from the cloud once (visitsArch:* read ${n('visitsArch:*')} times)`,
        !!lv && n('visitsArch:*') === ARCH_MONTHS && arch.length === n('visitsArch:*') && fd0 != null && firstAsk != null && fd0 < firstAsk, { reads: rk['visitsArch:*'], firstDraw: fd0, firstAsked: firstAsk, early: r.page.shown.early });
      else check(`${tag}: the daily open draws the past months it keeps from the store and reads each from the cloud once, after the start's read (visitsArch:* read ${n('visitsArch:*')} times, none during it)`,
        !!lv && n('visitsArch:*') === ARCH_MONTHS && arch.length === n('visitsArch:*') && arch.every(c => c[2] >= lv[2]), { reads: rk['visitsArch:*'], loadVisits: lv, firstAsked: firstAsk });
    }
    const tl = r.page.timeline, first = name => tl.find(x => x[0] === name);
    const team = first('loadTeam'), lists = [first('loadVisits'), first('loadErpSales')].filter(Boolean);
    // v126 speed: chat and memories never hold back the first draw; a daily open does not read them at all (the phone keeps
    // their last read; they are read when their screen opens, and every 15 minutes) — a new device reads them beside the lists
    const listsEnd = lists.length ? Math.max(...lists.map(x => x[2])) : null, fd = r.page.marks.firstDraw;
    const tc = r.page.teamCopy || {};
    if(r.kind === 'daily') check(`${tag}: a daily open reads neither chat nor memories when this phone kept their copy (chat read ${n('chat')}, memories ${n('memories')} times; copies kept: ${!!tc.chat}, ${!!tc.memories})`,
      (n('chat') === 0 || !tc.chat) && (n('memories') === 0 || !tc.memories) && (tc.chat || tc.memories) && fd != null && (!team || team[2] <= listsEnd || fd < team[2]), { chat: rk.chat, memories: rk.memories, copies: tc, team, firstDraw: fd });
    else check(`${tag}: chat and memories are read beside the other lists, and the first draw does not wait for them`, !!team && lists.length === 2 && team[1] < listsEnd && fd != null && (team[2] <= listsEnd || fd < team[2]), { team, lists, firstDraw: fd });
    check(`${tag}: the page connects early to the hosts its first reads go to (the sign-in's, the cloud's)`,
      ['securetoken.googleapis.com (crossorigin)', 'identitytoolkit.googleapis.com (crossorigin)', 'firestore.googleapis.com', 'firestore.googleapis.com (crossorigin)'].every(h => (r.page.preconnect || []).includes(h)), r.page.preconnect);
    check(`${tag}: the figures (msBuild) work out the month's lines once — no month figure worked out again without them`, r.page.unshared === 0, { unshared: r.page.unshared });
    if(r.refresh) check(`${tag}: the 20-second refresh downloads no sales file it keeps`, r.refresh.erpRows === 0, r.refresh);
  });

  // ---------- the report ----------
  const rows = {};
  runs.filter(r => !r.profiled).forEach(r => { const k = `${r.kind === 'daily' ? 'daily open' : 'first open'} · ${r.who === 'Dr. Ghaith' ? 'supervisor' : 'rep'} (${r.who})${r.lang === 'ar' ? ' · Arabic' : ''}|${r.device}`; (rows[k] = rows[k] || []).push(rowOf(r)); });
  const table = Object.entries(rows).map(([k, list]) => {
    const [scenario, dev] = k.split('|');
    const col = f => ({ med: median(list.map(x => x[f])), min: minOf(list.map(x => x[f])) });
    const o = { scenario, device: dev, n: list.length };
    ['shell', 'gate', 'signIn', 'afterTap', 'loadAllStart', 'netDone', 'render', 'targetCard', 'data', 'figures', 'upToDate', 'cloud', 'settled', 'reads', 'readKB', 'writes', 'httpKB', 'longTasks', 'longMs', 'maxLong', 'task', 'script', 'heap', 'lsKB',
      'refreshMs', 'refreshRender', 'refreshReads', 'refreshKB', 'refreshLongMs', 'refreshMaxLong'].forEach(f => { o[f] = col(f); });
    return o;
  });
  const fmt = v => v == null ? '—' : String(v);
  console.log('\nmedian (min) of each row, ms from the navigation start');
  console.log('scenario | device | n | shell painted | own data shown | figures shown | up to date | cloud merged | settled | boot reads (KB) | data in hand | renderAll (target card) | long tasks (ms, max) | main thread busy | refresh: ms, reads (KB), long ms (max)');
  table.forEach(o => console.log(`${o.scenario} | ${o.device} | ${o.n} | ${fmt(o.shell.med)} (${fmt(o.shell.min)}) | ${fmt(o.data.med)} (${fmt(o.data.min)})${o.signIn.med != null ? ' [sign-in tap ' + o.signIn.med + ', then ' + o.afterTap.med + ' (' + o.afterTap.min + ')]' : ''} | ${fmt(o.figures.med)} | ${fmt(o.upToDate.med)} | ${fmt(o.cloud.med)} (${fmt(o.cloud.min)}) | ${fmt(o.settled.med)} | ${o.reads.med} (${o.readKB.med}) | ${fmt(o.netDone.med)} | ${fmt(o.render.med)} (${fmt(o.targetCard.med)}) | ${o.longTasks.med} (${o.longMs.med}, ${o.maxLong.med}) | ${o.task.med} (script ${o.script.med}) | ${o.refreshMs.med != null ? `${o.refreshMs.med} (render ${o.refreshRender.med}), ${o.refreshReads.med} (${o.refreshKB.med}), ${o.refreshLongMs.med} (${o.refreshMaxLong.med})` : '—'}`));
  const profiled = runs.filter(r => r.profiled);
  profiled.forEach(r => {
    console.log(`\n--- ${r.label}: CPU profile (${r.profile.cpu.totalMs} ms sampled) ---`);
    console.log(r.profile.cpu.categories.slice(0, 18).map(([k, v]) => `  ${v} ms  ${k}`).join('\n'));
    console.log('  top self time:'); console.log(r.profile.cpu.selfTop.slice(0, 15).map(([k, v]) => `    ${v} ms  ${k}`).join('\n'));
    if(r.profile.trace){ console.log(`  trace: main thread busy ${r.profile.trace.mainThreadBusyMs} ms`); console.log(r.profile.trace.selfByEvent.slice(0, 12).map(([k, v]) => `    ${v} ms  ${k}`).join('\n')); console.log('  compile:'); console.log(r.profile.trace.compile.map(c => '    ' + c.join(' | ')).join('\n')); }
  });
  if(OUT) fs.writeFileSync(path.join(OUT, 'startup-speed.json'), JSON.stringify({ site: SITE_KIND, data: FIX.counts, bytes: FIX.bytes, sdk: !!SDK_DIR, nets: NETS, table, runs: runs.map(r => Object.assign({}, r, { expect: r.expect })) }, null, 1));
  if(devicesRedone) console.log(`\n(${devicesRedone} device(s) run again: the browser lost the phone's storage on its restart)`);
  console.log('\n' + results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  server.close();
  if(builtTmp) fs.rmSync(builtTmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); if(builtTmp) fs.rmSync(builtTmp, { recursive: true, force: true }); process.exit(2); });
