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
// paint), the person's own data on the Today screen, the cloud's data merged
// and drawn (loadAll done); plus the cloud reads and bytes, the main thread's
// long tasks. At this stage it REPORTS the numbers and checks only
// correctness: the right person's own data is shown (her follow-ups, her
// month figure as UMCore.monthAchievement gives it from the fixture), nothing
// is written at start, no page errors. Budgets come with the fixes.
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
//   REFRESH=1          also wait for the first 20-second background refresh of each daily open and measure it
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const zlib = require('zlib'); const crypto = require('crypto'); const { spawnSync } = require('child_process');
const { launchOpts } = require('./_env.js');
const PORT = 8279;
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
let acct = null; // the open being measured: what the cloud served and took
function freshAcct(){ return { reads: 0, readBytes: 0, readKeys: {}, writes: 0, writeBytes: 0, writeKeys: {}, queries: 0, http: 0, httpBytes: 0, httpWire: 0, setupAt: null }; }
let cloudSetup = null; // the cloud's first request of a page pays the set-up
function onCloud(){ if(!NET) return Promise.resolve(); if(!cloudSetup){ cloudSetup = sleep((NET.newConnRtts + NET.cloudSetupRtts) * NET.rtt); if(acct) acct.setupAt = Date.now(); } return cloudSetup; }
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
const api = {
  async get(k){ await onCloud(); const d = cloud.get(k); const n = d ? d.value.length + 60 : 60; await netDown(n); countRead(k, d ? d.value.length : 0); return d ? { exists: true, value: d.value, updated: d.updated } : { exists: false }; },
  async set(k, v){ await onCloud(); await netUp(v.length + 60); cloud.set(k, { value: v, updated: Date.now() }); countWrite(k, v.length); return true; },
  async del(k){ await onCloud(); await netUp(60); cloud.delete(k); countWrite(k, 0); return true; },
  async commit(entries){ await onCloud(); await netUp(entries.reduce((s, [k, v]) => s + v.length + 60, 0)); entries.forEach(([k, v]) => { cloud.set(k, { value: v, updated: Date.now() }); countWrite(k, v.length); }); return true; },
  async query(q){
    await onCloud(); if(acct) acct.queries++;
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
  async txGet(k){ const release = await lockKey(k); const id = ++txSeq; held[id] = release; const d = await api.get(k); return { id, doc: d }; },
  async txEnd(id, k, v){ try{ if(v != null) await api.set(k, v); } finally { if(held[id]){ held[id](); delete held[id]; } } return true; },
  async signIn(email, pwd){ if(NET){ await netDown(2000, NET.newConnRtts); await netDown(1500); } return !!pwd && STAFF.some(s => (s.email || '').toLowerCase() === String(email || '').toLowerCase()); },
};

// ---------- the Firebase stand-in (served at the SDK's addresses) ----------
const FAKE_FIREBASE = `;(function(){
  var U = function(){ return window.__um; };
  var t = function(){ return performance.now(); };
  function log(op, key, t0, n){ var u = U(); if(u) u.cloud.push([op, key, Math.round(t0), Math.round(t()), n]); }
  var LS = '__fakefb_user', listeners = [], user = null, known = false;
  try{ var e = localStorage.getItem(LS); if(e) user = { email: e, uid: 'u-' + e }; }catch(err){}
  function tell(){ if(window.__umWrap) window.__umWrap(); listeners.slice().forEach(function(cb){ try{ cb(user); }catch(err){ setTimeout(function(){ throw err; }); } }); }
  // the real SDK reads its saved session asynchronously, then tells every listener
  setTimeout(function(){ known = true; tell(); }, 0);
  var auth = {
    get currentUser(){ return user; },
    onAuthStateChanged: function(cb){ listeners.push(cb); if(known) setTimeout(function(){ if(window.__umWrap) window.__umWrap(); cb(user); }, 0); return function(){ listeners = listeners.filter(function(x){ return x !== cb; }); }; },
    signInWithEmailAndPassword: function(email, pwd){ return window.__fbSignIn(email, pwd).then(function(ok){
      if(!ok){ var er = new Error('wrong password'); er.code = 'auth/wrong-password'; throw er; }
      user = { email: email, uid: 'u-' + email }; try{ localStorage.setItem(LS, email); }catch(err){}
      setTimeout(tell, 0); return { user: user }; }); },
    signOut: function(){ user = null; try{ localStorage.removeItem(LS); }catch(err){} setTimeout(tell, 0); return Promise.resolve(); },
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
  var fb = { __fake: true, apps: [], initializeApp: function(c){ fb.apps.push(c); return {}; }, firestore: firestore, auth: function(){ return auth; } };
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
  const U = window.__um = { marks: {}, longtasks: [], cloud: [], timeline: [], fns: {}, loadAlls: 0, renders: 0 };
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
      const p = f.apply(this, arguments); const end = () => { const t1 = now(); U.timeline.push([n, Math.round(t0), Math.round(t1)]); if(n === 'loadAll'){ if(U.loadAlls === 1 || U.marks.loadAllEnd == null) mark('loadAllEnd', t1); else mark('refreshEnd', t1); } };
      if(p && typeof p.then === 'function') p.then(end, end); else end(); return p; }; });
    SYNC.forEach(n => { const f = window[n]; if(typeof f !== 'function') return; window[n] = function(){ const t0 = now(); try{ return f.apply(this, arguments); } finally { const d = now() - t0; const e = U.fns[n] = U.fns[n] || [0, 0, 0]; e[0]++; e[1] += d; if(d > e[2]) e[2] = d; } }; });
  };
  // the person's own data on the Today screen: her greeting, her follow-ups, her month figure
  const ex = arg.expect;
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
    if(tc.textContent.indexOf(ex.amount) < 0) return;
    mark('ownDom');
    requestAnimationFrame(() => requestAnimationFrame(() => mark('ownVisible')));
  };
  const schedule = () => { if(!pend){ pend = true; requestAnimationFrame(check); } };
  const start = () => { new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] }); schedule(); };
  if(document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
  document.addEventListener('DOMContentLoaded', () => { mark('dcl'); window.__umWrap(); });
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
  acct = freshAcct(); cloudSetup = null; link.down = link.up = Date.now();
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
      marks: U.marks, paint, longtasks: U.longtasks, timeline: U.timeline, fns: U.fns, cloudOps: U.cloud.length, cloudLog: U.cloud.slice(0, 400),
      nav: { workerStart: Math.round(nav.workerStart || 0), responseStart: Math.round(nav.responseStart || 0), responseEnd: Math.round(nav.responseEnd || 0), domInteractive: Math.round(nav.domInteractive || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), transfer: nav.transferSize, sw: !!navigator.serviceWorker.controller },
      res, ls, lsKB: Math.round(lsTotal / 1024),
      shown: { greeting: g ? g.textContent : '', who: typeof currentUser !== 'undefined' && currentUser ? currentUser.name : null, amountOnCard: tc ? tc.textContent.indexOf(amount) >= 0 : false,
        dueCards: due ? due.querySelectorAll('.card').length : 0, marker: dueMarker ? dueText.indexOf(dueMarker) >= 0 : true, notMine: (notMine || []).filter(n => dueText.indexOf(n) >= 0),
        appAmount: typeof bestMonthRevenue === 'function' ? UMCore.money(bestMonthRevenue(who).amount) : null, mirrorUsed: typeof _mirrorUsed !== 'undefined' ? Object.keys(_mirrorUsed) : null,
        loadFailed: typeof _loadFailed !== 'undefined' ? Object.keys(_loadFailed) : null, booted: typeof _bootLoaded !== 'undefined' ? _bootLoaded : null, outbox: typeof outboxList === 'function' ? outboxList() : null },
    };
  }, opts.expect);
  let refresh = null;
  if(opts.refresh && state && state.m.loadAllEnd != null){
    acct = freshAcct();
    await page.waitForFunction(() => window.__um && window.__um.marks.refreshEnd != null, null, { timeout: 60000, polling: 500 }).catch(() => {});
    refresh = await page.evaluate(() => { const U = window.__um, a = U.marks.refreshStart, b = U.marks.refreshEnd; const lt = U.longtasks.filter(l => l[0] >= a - 5); const ra = U.fns.renderAll ? U.fns.renderAll[1] : 0; return { ms: b != null ? b - a : null, renderAllTotal: Math.round(ra), longTasks: lt.length, longMs: lt.reduce((s, l) => s + l[1], 0), maxLong: lt.reduce((m, l) => Math.max(m, l[1]), 0) }; }).catch(() => null);
    if(refresh) Object.assign(refresh, { reads: acct.reads, readKB: Math.round(acct.readBytes / 1024), writes: acct.writes });
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
const SHORT = n => { const w = n.split(' ')[0]; return /^(dr|prof|mr|mrs|ms)\.?$/i.test(w) ? n : w; };
function expectFor(who){
  const role = FIX.people[who];
  const today = FIX.today;
  const due = FIX.data.clinics.filter(c => c.cls !== 'Closed' && c.nextFollowUp && c.nextFollowUp <= today && (role !== 'rep' || c.rep === who)).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
  const own = due.filter(c => c.rep === who);
  const others = FIX.data.clinics.filter(c => c.rep !== who && c.cls !== 'Closed' && c.nextFollowUp && c.nextFollowUp <= today).map(c => c.name)
    .filter(n => !FIX.data.clinics.some(c => c.rep === who && (c.name.indexOf(n) >= 0 || n.indexOf(c.name) >= 0)));
  const amount = core.money(core.monthAchievement(who, FIX.data).amount);
  return { who, role, greet: SHORT(who), dueMarker: own.length ? own[0].name : null, dueCount: due.length, notMine: role === 'rep' ? others.slice(0, 12) : [], amount }; // the greeting names her in either language ("Good morning, Mariam" / "صباح الخير، Mariam")
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
    const dOpts = { expect: exp, profile: opts.profile, label: label + '-daily', refresh: REFRESH && !opts.profile };
    const daily = await openOnce(ctx, prof, who, 'daily', dOpts);
    await ctx.close();
    if(dOpts.lost) return null;
    out.push(Object.assign(daily, { device: profName, label: label + '-daily', lang: opts.lang || 'en' }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  out.forEach(r => { r.expect = exp; r.profiled = !!opts.profile; });
  return out;
}

function rowOf(r){
  const m = r.page.marks, lt = r.page.longtasks.filter(l => l[0] <= (r.settledAt || Infinity));
  return {
    shell: r.page.paint['first-contentful-paint'] != null ? r.page.paint['first-contentful-paint'] : null,
    gate: m.gateShown, appShown: m.appShown, signIn: m.signInTap, loadAllStart: m.loadAllStart, data: m.ownVisible, cloud: m.loadAllEnd, settled: r.settledAt,
    afterTap: m.signInTap != null && m.ownVisible != null ? m.ownVisible - m.signInTap : null,
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
        console.log(`  ${profName} ${who} #${n}: first ${rowOf(rs[0]).data} ms, daily ${rowOf(rs[1]).data} ms (${Math.round((Date.now() - t) / 1000)} s)`);
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
  });

  // ---------- the report ----------
  const rows = {};
  runs.filter(r => !r.profiled).forEach(r => { const k = `${r.kind === 'daily' ? 'daily open' : 'first open'} · ${r.who === 'Dr. Ghaith' ? 'supervisor' : 'rep'} (${r.who})${r.lang === 'ar' ? ' · Arabic' : ''}|${r.device}`; (rows[k] = rows[k] || []).push(rowOf(r)); });
  const table = Object.entries(rows).map(([k, list]) => {
    const [scenario, dev] = k.split('|');
    const col = f => ({ med: median(list.map(x => x[f])), min: minOf(list.map(x => x[f])) });
    const o = { scenario, device: dev, n: list.length };
    ['shell', 'gate', 'signIn', 'afterTap', 'loadAllStart', 'netDone', 'render', 'targetCard', 'data', 'cloud', 'settled', 'reads', 'readKB', 'writes', 'httpKB', 'longTasks', 'longMs', 'maxLong', 'task', 'script', 'heap', 'lsKB',
      'refreshMs', 'refreshRender', 'refreshReads', 'refreshKB', 'refreshLongMs', 'refreshMaxLong'].forEach(f => { o[f] = col(f); });
    return o;
  });
  const fmt = v => v == null ? '—' : String(v);
  console.log('\nmedian (min) of each row, ms from the navigation start');
  console.log('scenario | device | n | shell painted | own data shown | cloud merged | settled | boot reads (KB) | data in hand | renderAll (target card) | long tasks (ms, max) | main thread busy | refresh: ms, reads (KB), long ms (max)');
  table.forEach(o => console.log(`${o.scenario} | ${o.device} | ${o.n} | ${fmt(o.shell.med)} (${fmt(o.shell.min)}) | ${fmt(o.data.med)} (${fmt(o.data.min)})${o.signIn.med != null ? ' [sign-in tap ' + o.signIn.med + ', then ' + o.afterTap.med + ' (' + o.afterTap.min + ')]' : ''} | ${fmt(o.cloud.med)} (${fmt(o.cloud.min)}) | ${fmt(o.settled.med)} | ${o.reads.med} (${o.readKB.med}) | ${fmt(o.netDone.med)} | ${fmt(o.render.med)} (${fmt(o.targetCard.med)}) | ${o.longTasks.med} (${o.longMs.med}, ${o.maxLong.med}) | ${o.task.med} (script ${o.script.med}) | ${o.refreshMs.med != null ? `${o.refreshMs.med} (render ${o.refreshRender.med}), ${o.refreshReads.med} (${o.refreshKB.med}), ${o.refreshLongMs.med} (${o.refreshMaxLong.med})` : '—'}`));
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
