// A randomized two-device simulation of the visits sync (v126 candidate, branch alerts-v126 at 6b3f503): two pages — a
// phone and a laptop of the same person, or Mariam's phone and the supervisor's laptop — on one fake cloud, driven by
// seeded random actions, and checked once both devices have settled online. Not hand-written cases: every seed is a
// different interleaving of
//   log a visit · edit a field (notes, a harness field) · move a visit's date across months (past↔past, past↔live, into a
//   past month with no document yet) · delete a visit (the app's own deleteVisit, recycle bin first) · add a photo (the
//   app's own photo mark, kept on the phone and uploaded in the background) · no signal / airplane mode / back online ·
//   one past month slow (beyond the read limit) or failing · a flaky link (a share of the requests fail) · close and
//   reopen the app (the early open from its copy; or the sign-in held so that saves are made in the window) · a
//   20-second round · the next commits of a device land late (after the app gave up on them)
// with a model of what each device intended. The invariants, checked after both devices settle online:
//   I1  every visit some device logged (or the account held) and nobody deleted exists exactly once, in the document of
//       its date (the live document for the running month, visitsArch:YYYY-MM for a past one), listed in visitsIndex
//   I2  a deleted visit is gone from every document and every screen (visits have no revival but the recycle bin's
//       restore, which this harness never taps)
//   I3  for each field a device edited: the value of an edit no later edit superseded (an edit made on a screen that
//       showed another edit's value supersedes it) — two concurrent edits of one field: either; one device's edit alone:
//       that one. A move is the date field: never undone by another device's unrelated save. Fields nobody edited keep
//       their value. Photos added on either device are all on the visit, uploaded (not "waiting"), the photo in the cloud
//   I4  every save the app told as landed (persistTold ok, or sent by the queue since) is in the cloud at that moment
//   I5  once both devices are online, nothing stays queued (the outbox, the index revisions owed) and both screens show
//       exactly what the cloud holds
// Known and older than the speed work (not counted as new; reported as "known"): K1 another device moved a visit between
// this phone's read of a document and its write of it (the union keeps the copy the cloud's document lacks; the tidy
// trusts an old read): classified from the cloud's own log of commits (k1 below).
// The cloud, the Firebase stand-in, the sign-in and the clock are those of speed-review-2.e2e.js / rerev.e2e.js (whose
// helpers this harness reuses); timers of 2.5 s and more run 4× faster in the pages (the app's 8 s read and 12 s write
// limits become 2 s / 3 s) and the cloud's delays are scaled the same way. Invented data (fixtures/heavy-year.js at scale
// 0.1, its visits cut to 16 in three past months and the running one). Port 8296.
// Options (environment):
//   CASES=F1,F2,F3,F4,K1b  the minimal replays of what the seeds found (see CASES below); the default run is all five and
//                       6 seeds (about 2 minutes)
//   SEEDS=n SEED0=s      n seeds from s (default 6 from 1) · STEPS=n actions a seed (14) · PAR=n worlds at once (2)
//   REPLAY=seed          one seed, its actions printed as they run · SEEDLIST=3,7,9 those seeds
//   TRACE=1              both screens after each step and every visits commit · VERBOSE=1
//   KNOWN_OK=1           a finding classified as K1 (known) does not fail the run
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts } = require('./_env.js');
const PORT = 8296;
const fixture = require('./fixtures/heavy-year.js');
const BASE = fixture.build({ scale: 0.1 });
const env = process.env;
const REPLAY = env.REPLAY != null && env.REPLAY !== '' ? Number(env.REPLAY) : null;
const SEED0 = Number(env.SEED0 || 1), NSEEDS = Number(env.SEEDS || 6), STEPS = Number(env.STEPS || 14);
const PAR = REPLAY != null ? 1 : Math.max(1, Number(env.PAR || 2));
const VERBOSE = !!env.VERBOSE || REPLAY != null;
const KNOWN_OK = !!env.KNOWN_OK;
const TRACE = !!env.TRACE;
const TS = 4;                                  // page timers ≥ 2.5 s run this many times faster
const SLOW_MS = 2600, LATE_MS = 3700;          // a slow read (beyond the app's 8 s → 2 s), a late commit (beyond 12 s → 3 s)
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
const EMAIL = { [M]: 'mariam@example.com', [R]: 'renova@example.com', [G]: 'ghaith@example.com' };
const TODAY = BASE.today, LIVE = TODAY.slice(0, 7);
const ARCH = ['2026-08', '2026-09', '2026-10'], NEWM = '2026-07';
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const clone = o => JSON.parse(JSON.stringify(o));
const homeOf = date => { const m = typeof date === 'string' && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null; return !m || m >= LIVE ? 'visits' : 'visitsArch:' + m; };
function rng(seed){ let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------- the account: the heavy year's documents, its visits cut to 16 (three past months and the running one) ----------
function buildAccount(){
  const docs = {};
  for(const [k, v] of Object.entries(BASE.docs)){
    if(v == null || /^(photo:|erpRows:|snap_|visitsArch:)/.test(k)) continue;
    if(['erpSales', 'visits', 'visitsIndex', 'chat', 'memories', 'dayPlans'].includes(k)) continue;
    docs[k] = v;
  }
  docs.chat = '[]'; docs.memories = '[]'; docs.dayPlans = '{}';
  const all = BASE.data.visits, out = [];
  for(const m of [...ARCH, LIVE]){
    const of = rep => all.filter(v => v.date.slice(0, 7) === m && v.rep === rep && !v.callOnly && !v.photos);
    out.push(...of(M).slice(0, 3), ...of(R).slice(0, 1));
  }
  const vs = out.map(v => { const c = clone(v); delete c.photos; c.notes = 'orig ' + c.id; return c; });
  docs.visits = JSON.stringify(vs.filter(v => homeOf(v.date) === 'visits'));
  const idx = { months: {}, v: 1, updated: Date.parse(BASE.now) - 86400000 };
  ARCH.forEach((m, i) => { const arr = vs.filter(v => homeOf(v.date) === 'visitsArch:' + m); docs['visitsArch:' + m] = JSON.stringify(arr); idx.months[m] = { n: arr.length, rev: Date.parse(m + '-28T20:00:00') + i }; });
  docs.visitsIndex = JSON.stringify(idx);
  const clinicsM = (parse(docs.clinics) || []).filter(c => c && c.rep === M && c.cls !== 'Closed').map(c => c.id);
  return { docs, visits: vs, clinicsM };
}
const ACCOUNT = buildAccount();

// ---------- the site ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); }); });

// ---------- a world: one fake cloud (key → { value, updated }) and what each of its devices' links do ----------
const unavailable = () => { const e = new Error('unavailable: no signal (harness)'); e.code = 'unavailable'; return e; };
const VISIT_KEY = k => k === 'visits' || k === 'visitsIndex' || k.startsWith('visitsArch:');
class World {
  constructor(seed){
    this.seed = seed; this.rand = rng(seed); this.t0 = Date.now();
    this.cloud = new Map(Object.entries(ACCOUNT.docs).map(([k, v]) => [k, { value: v, updated: Date.parse(BASE.now) - 3600000 }]));
    this.ops = [];          // { who, op, k, kind, t, v? }
    this.down = new Map();  // label → 'nosignal' | 'airplane': every request fails
    this.month = new Map(); // label → { key, mode: 'slow' | 'fail' | 'failall' }
    this.flaky = new Map(); // label → { p, rand }
    this.late = new Map();  // label → n: the next n commits to a visits document land after the app gave up on them
    this.auth = {};         // label → { gate, release, mode }
    this.gen = {};          // label → the page's generation (moves at a reopen: a transaction of the closed page is abandoned)
    this.locks = {}; this.held = {}; this.txSeq = 0; this.tok = 0; this.seq = 0; this.verSeq = 0; this.lateP = new Set();
    this.log = [];
  }
  say(s){ this.log.push(s); if(VERBOSE && PAR === 1) console.log(s); }
  doc(k){ return this.cloud.has(k) ? parse(this.cloud.get(k).value) : null; }
  visitDocs(){ return [...this.cloud.keys()].filter(k => k === 'visits' || k.startsWith('visitsArch:')).sort(); }
  where(id){ return this.visitDocs().map(k => { const v = (this.doc(k) || []).find(x => x && x.id === id); return v ? { k, v } : null; }).filter(Boolean); }
  async heldFor(who, k, kind){
    if(this.down.has(who)) throw unavailable();
    const mt = this.month.get(who);
    if(mt && mt.key === k){
      if(mt.mode === 'slow' && kind === 'get') await sleep(SLOW_MS);
      if(mt.mode === 'fail' && kind === 'get') throw unavailable();
      if(mt.mode === 'failall') throw unavailable();
    }
    const fl = this.flaky.get(who);
    if(fl && fl.rand() < fl.p) throw unavailable();
  }
  async lockKey(k){ const prev = this.locks[k] || Promise.resolve(); let release; const mine = new Promise(r => { release = r; }); this.locks[k] = prev.then(() => mine); await prev; const tm = setTimeout(release, 8000); return () => { clearTimeout(tm); release(); }; }
  releaseHeldBy(who){ Object.keys(this.held).forEach(id => { if(this.held[id].who === who && !this.held[id].gone){ this.held[id].release(); this.held[id].gone = true; } }); }
  api(who){
    const W = this;
    return {
      async get(k){ await W.heldFor(who, k, 'get'); W.ops.push({ who, op: 'get', k, t: Date.now() }); const d = W.cloud.get(k); return d ? { exists: true, value: d.value, updated: d.updated } : { exists: false }; },
      async set(k, v){ await W.heldFor(who, k, 'set'); W.ops.push({ who, op: 'set', k, t: Date.now() }); W.cloud.set(k, { value: v, updated: Date.now(), ver: ++W.verSeq }); return true; },
      async del(k){ await W.heldFor(who, k, 'set'); W.ops.push({ who, op: 'del', k, t: Date.now() }); W.cloud.delete(k); return true; },
      async commit(entries){ for(const [k] of entries) await W.heldFor(who, k, 'set'); W.ops.push({ who, op: 'commit', k: entries.map(e => e[0]).join(','), t: Date.now() }); entries.forEach(([k, v]) => W.cloud.set(k, { value: v, updated: Date.now(), ver: ++W.verSeq })); return true; },
      async query(q){ W.ops.push({ who, op: 'query', k: q.from || '', t: Date.now() }); if(W.down.has(who)) throw unavailable();
        let keys = [...W.cloud.keys()].sort(); if(q.from != null) keys = keys.filter(k => k >= q.from); if(q.to != null) keys = keys.filter(k => k < q.to); if(q.after != null) keys = keys.filter(k => k > q.after); if(q.limit) keys = keys.slice(0, q.limit);
        return keys.map(k => ({ id: k, value: W.cloud.get(k).value, updated: W.cloud.get(k).updated })); },
      async txGet(k){
        const g0 = W.gen[who];
        await W.heldFor(who, k, 'tx');
        const release = await W.lockKey(k);
        if(W.gen[who] !== g0){ release(); throw unavailable(); } // the page that asked was closed meanwhile
        const id = ++W.txSeq; W.held[id] = { release, who, ver: W.cloud.has(k) ? W.cloud.get(k).ver || 0 : -1 };
        W.ops.push({ who, op: 'txget', k, t: Date.now() });
        const d = W.cloud.get(k); return { id, doc: d ? { exists: true, value: d.value, updated: d.updated } : { exists: false } };
      },
      async txEnd(id, k, v){
        try{
          if(v != null){
            await W.heldFor(who, k, 'commit');
            const n = W.late.get(who) || 0;
            if(n > 0 && VISIT_KEY(k)){
              if(n > 1) W.late.set(who, n - 1); else W.late.delete(who);
              let done; const p = new Promise(r => { done = r; }); W.lateP.add(p);
              try{ await sleep(LATE_MS); } finally { W.lateP.delete(p); done(); }
              W.say(`    (late commit of ${k} by ${who} lands now)`);
            }
            const ver = W.cloud.has(k) ? W.cloud.get(k).ver || 0 : -1, h = W.held[id];
            if(h && h.ver !== ver){ W.say(`    (a commit of ${k} by ${who} refused: the document changed since its read — Firestore's precondition)`); const e = new Error('aborted: the document changed (harness)'); e.code = 'aborted'; throw e; }
            W.ops.push({ who, op: 'commit1', k, t: Date.now(), v });
            if(TRACE && (k === 'visits' || k.startsWith('visitsArch:'))) W.say(`    · ${who} commits ${k}: ${(parse(v) || []).map(x => x && String(x.id).replace(/^v2026/, '') + '@' + (x.date || '').slice(5)).join(' ')}`);
            W.cloud.set(k, { value: v, updated: Date.now(), ver: ++W.verSeq });
          }
        } finally { if(W.held[id]){ if(!W.held[id].gone) W.held[id].release(); delete W.held[id]; } }
        return true;
      },
      async signIn(email, pwd){ return !!pwd && Object.values(EMAIL).includes(String(email || '').toLowerCase()); },
      async confirm(){ const a = W.auth[who]; if(a && a.gate) await a.gate; return a ? a.mode : 'ok'; },
    };
  }
  holdAuth(label){ let release; const p = new Promise(r => { release = r; }); this.auth[label] = { gate: p, release, mode: 'ok' }; }
  releaseAuth(label){ const a = this.auth[label]; if(a && a.release) a.release(); this.auth[label] = null; }
}

// ---------- the Firebase stand-in (served at the SDK's addresses; as speed-review-2.e2e.js) ----------
const FAKE_FB = `;(function(){
  var LS = '__fakefb_user', listeners = [], user = null, known = false, apiKey = null;
  function saved(email){ try{ if(!apiKey) return; var k = 'firebase:authUser:' + apiKey + ':[DEFAULT]'; if(email) localStorage.setItem(k, JSON.stringify({ uid: 'u-' + email, email: email })); else localStorage.removeItem(k); }catch(err){} }
  try{ var e = localStorage.getItem(LS); if(e) user = { email: e, uid: 'u-' + e }; }catch(err){}
  function tell(){ listeners.slice().forEach(function(cb){ try{ cb(user); }catch(err){ setTimeout(function(){ throw err; }); } }); }
  var started = Promise.resolve(user ? window.__fbConfirm(user.email) : 'none').then(function(r){
    if(r === 'ended'){ user = null; try{ localStorage.removeItem(LS); }catch(err){} saved(null); }
    known = true; tell();
  });
  var auth = {
    get currentUser(){ return known ? user : null; },
    onAuthStateChanged: function(cb){ listeners.push(cb); if(known) setTimeout(function(){ cb(user); }, 0); return function(){ listeners = listeners.filter(function(x){ return x !== cb; }); }; },
    signInWithEmailAndPassword: function(email, pwd){ return window.__fbSignIn(email, pwd).then(function(ok){
      if(!ok){ var er = new Error('wrong password'); er.code = 'auth/wrong-password'; throw er; }
      user = { email: email, uid: 'u-' + email }; try{ localStorage.setItem(LS, email); }catch(err){} saved(email); known = true;
      setTimeout(tell, 0); return { user: user }; }); },
    signOut: function(){ var out = function(){ user = null; try{ localStorage.removeItem(LS); }catch(err){} saved(null); setTimeout(tell, 0); }; if(!known) return started.then(out); out(); return Promise.resolve(); },
  };
  function snap(id, d){ return { id: id, exists: !!(d && d.exists !== false && d.value != null), data: function(){ return d && d.value != null ? { value: d.value, updated: d.updated } : undefined; } }; }
  function docRef(id){ return { id: id,
    get: function(){ return window.__fbGet(id).then(function(d){ return snap(id, d); }); },
    set: function(data){ return window.__fbSet(id, data.value); },
    delete: function(){ return window.__fbDel(id); } }; }
  function query(q){ return {
    where: function(f, op, v){ var n = Object.assign({}, q); if(op === '>=') n.from = v; else if(op === '<') n.to = v; return query(n); },
    orderBy: function(){ return query(q); }, startAfter: function(v){ return query(Object.assign({}, q, { after: v })); }, limit: function(n){ return query(Object.assign({}, q, { limit: n })); },
    get: function(){ return window.__fbQuery(q).then(function(docs){ var list = docs.map(function(d){ return snap(d.id, d); }); return { size: list.length, docs: list, forEach: function(fn){ list.forEach(fn); } }; }); } }; }
  var db = {
    collection: function(){ var c = query({}); c.doc = docRef; return c; },
    batch: function(){ var es = []; return { set: function(ref, data){ es.push([ref.id, data.value]); }, commit: function(){ return window.__fbCommit(es); } }; },
    runTransaction: function(fn){
      var id = null, key = null, out = null;
      var tx = { get: function(ref){ key = ref.id; return window.__fbTxGet(ref.id).then(function(r){ id = r.id; return snap(ref.id, r.doc); }); }, set: function(ref, data){ out = data.value; } };
      return Promise.resolve().then(function(){ return fn(tx); }).then(function(res){ return window.__fbTxEnd(id, key, out).then(function(){ return res; }); },
        function(err){ return (id ? window.__fbTxEnd(id, key, null) : Promise.resolve()).then(function(){ throw err; }); });
    },
  };
  var firestore = function(){ return db; };
  firestore.FieldPath = { documentId: function(){ return '__name__'; } };
  var fb = { __fake: true, apps: [], initializeApp: function(c){ fb.apps.push(c); apiKey = c && c.apiKey; return {}; }, firestore: firestore, auth: function(){ return auth; } };
  fb.auth.EmailAuthProvider = { credential: function(){ return {}; } };
  window.firebase = fb;
})();`;

// ---------- before any page script: the clock, the 20-second round driven by hand, faster long timers, navigator.onLine ----------
function initScript(arg){
  const off = arg.off, TS = arg.ts;
  const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  const _si = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
  const _st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => _st(fn, (typeof ms === 'number' && ms >= 2500) ? ms / TS : ms, ...a);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  let offl = false; try{ offl = localStorage.getItem('__h_off') === '1'; }catch(e){}
  Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => !offl });
  window.__setOff = v => { offl = !!v; try{ localStorage.setItem('__h_off', v ? '1' : '0'); }catch(e){} window.dispatchEvent(new Event(v ? 'offline' : 'online')); };
  const U = window.__um = { toasts: [] };
  document.addEventListener('DOMContentLoaded', () => { const st = window.showToast; if(typeof st === 'function') window.showToast = function(m){ U.toasts.push(String(m)); return st.apply(this, arguments); }; });
}

// ---------- a device ----------
let browser;
async function mkDevice(W, label, who){
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Kuwait' });
  await ctx.route(/^https?:\/\/(?!localhost[:/])/, route => {
    const url = route.request().url();
    if(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|firestore|auth)-compat\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: /auth-compat/.test(url) ? FAKE_FB : '/* stand-in */' });
    if(/fonts\.googleapis\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts stand-in */' });
    return route.abort();
  });
  const a = W.api(label);
  W.gen[label] = 1;
  const errors = [];
  for(const [n, fn] of Object.entries({ __fbGet: k => a.get(k), __fbSet: (k, v) => a.set(k, v), __fbDel: k => a.del(k), __fbCommit: e => a.commit(e), __fbQuery: q => a.query(q),
    __fbTxGet: k => a.txGet(k), __fbTxEnd: (id, k, v) => a.txEnd(id, k, v), __fbSignIn: (e, p) => a.signIn(e, p), __fbConfirm: () => a.confirm() })) await ctx.exposeFunction(n, fn);
  await ctx.addInitScript(initScript, { off: Date.parse(BASE.now) - Date.now(), ts: TS });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  const ev = (fn, x) => page.evaluate(fn, x);
  const D = { label, who, W, ctx, page, ev, errors, sup: who === G, lastRead: 0,
    async goto(){ await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'commit' }); await page.waitForFunction(() => document.readyState !== 'loading', null, { timeout: 60000 }); },
    boot: () => page.waitForFunction(w => typeof _bootLoaded !== 'undefined' && _bootLoaded && typeof currentUser !== 'undefined' && currentUser && currentUser.name === w && typeof refreshRunning === 'function' && !refreshRunning(), who, { timeout: 60000, polling: 50 }),
    idle: () => page.waitForFunction(() => typeof refreshRunning === 'function' && !refreshRunning() && !_roundBusy && !_flushing && !_visitsSaving, null, { timeout: 60000, polling: 50 }),
    async firstOpen(){
      W.auth[label] = null; await D.goto();
      await page.waitForSelector('#gateGrid .gate-tile', { timeout: 60000 });
      await page.click(`#gateGrid .gate-tile:has-text("${who}")`);
      const pw = await Promise.race([page.waitForSelector('#elEmail', { timeout: 30000 }).then(() => 'email'), page.waitForSelector('#gatePassword', { timeout: 30000 }).then(() => 'pw')]);
      if(pw === 'email'){ await page.fill('#elEmail', EMAIL[who]); await page.fill('#elPwd', 'invented-password'); }
      else await page.fill('#gatePassword', 'invented-password');
      await page.click('#modalInner button.btn');
      await D.boot(); await D.idle();
    },
    async round(){ await D.idle(); await ev(async () => { await window.__bgTick(); }); await D.idle(); },
  };
  return D;
}

// ---------- the model: what each device intended ----------
// visit id → { init (the record as the account held it, or as logged), by, deleted: [{dev, step}], edits: { field: [{dev, step, value, saw}] }, photos: [{dev, pid}] }
const FIELDS = ['notes', 'fz', 'date'];
function frontier(edits){ return edits.filter(e => !edits.some(o => o !== e && o.saw === e.value && o.seq > e.seq)); }

// ---------- minimal replays of what the random seeds found (CASES=F1,F2,F3,K1b; the default run takes them all) ----------
// A = Mariam's phone, B = her laptop (or the supervisor's: sup). Each is checked with the same invariants as a seed.
const CASES = {
  // F1: a visit first changed AFTER a start from the phone's copy with visits already queued has only a fingerprint as
  // its base in memory (its whole record went to the phone's um_base:visitsRec only): once the signal is back, the
  // phone's whole copy is written over the laptop's move
  F1: { name: 'F1', steps: [
    { dev: 'A', act: 'net', mode: 'nosignal' }, { dev: 'A', act: 'notes', id: 'v202610-349' }, { dev: 'A', act: 'restart' },
    { dev: 'A', act: 'fz', id: 'v202609-320' }, { dev: 'B', act: 'move', id: 'v202609-320', date: '2026-10-20' }] },
  // F2: the month's document lands, the index write does not (a weak link, the app closed between the two writes): after
  // a reopen the phone finds its change already in the cloud, writes nothing, and the month's revision never moves — the
  // laptop keeps its old copy of that month for good
  F2: { name: 'F2', steps: [
    { dev: 'B', act: 'round' }, { dev: 'A', act: 'month', key: 'visitsIndex', mode: 'failall' }, { dev: 'A', act: 'notes', id: 'v202608-283' },
    { dev: 'A', act: 'month', clear: true }, { dev: 'A', act: 'restart' }] },
  // F3: a move writes this phone's whole copy of the visit into its new month; the copy in the old month — with the
  // laptop's edit made since this phone's last read — is tidied away unmerged
  F3: { name: 'F3', steps: [{ dev: 'B', act: 'fz', id: 'v202611-374' }, { dev: 'A', act: 'move', id: 'v202611-374', date: '2026-09-19' }] },
  // K1b (the known K1, a worse outcome): the laptop moved a visit into September; the phone (its copy older) saves an edit
  // of another September visit — the union keeps the moved visit, then the tidy takes it out of September because the
  // phone's old read of the live month "holds" it: the visit is in no document at all
  // F4: deleting the only visit of a past month: the save is told landed ("Moved to recycle bin") but that month's
  // document is never written (Pass A looks only at the months the phone's list still has visits in) — the visit stays
  // in the cloud, hidden only by the delete log (120 days; the daily e-mail does not read the log)
  F4: { name: 'F4', steps: [{ dev: 'B', act: 'move', id: 'v202609-320', date: '2026-07-10' }, { dev: 'A', act: 'round' }, { dev: 'A', act: 'del', id: 'v202609-320' }] },
  K1b: { name: 'K1b', steps: [{ dev: 'B', act: 'move', id: 'v202611-374', date: '2026-09-10' }, { dev: 'A', act: 'notes', id: 'v202609-320' }] },
};

// ---------- one seed ----------
async function runSeed(seed, script){
  const W = new World(seed), rnd = W.rand;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const chance = p => rnd() < p;
  const say = s => W.say(s);
  const supLaptop = script ? !!script.sup : chance(0.5);
  const A = await mkDevice(W, 's' + seed + '-phone', M), B = await mkDevice(W, 's' + seed + '-laptop', supLaptop ? G : M);
  const devs = [A, B];
  const model = new Map();
  ACCOUNT.visits.forEach(v => model.set(v.id, { init: clone(v), by: 'account', deleted: [], edits: { notes: [], fz: [], date: [] }, photos: [] }));
  const pool = ACCOUNT.visits.filter(v => v.rep === M).map(v => v.id).filter(() => script ? true : chance(0.6));
  const told = []; // I4 findings
  const said = []; // what each device's saves were told
  let step = 0, logN = 0, photoN = 0;
  say(`${script ? 'case ' + script.name : 'seed ' + seed}: phone = ${M}, laptop = ${supLaptop ? G : M}; pool ${pool.join(',')}`);
  try{
    await A.firstOpen(); await B.firstOpen();
    const screenOf = async D => D.ev(ids => (visits || []).filter(v => v && ids.includes(v.id)).map(v => ({ id: v.id, notes: v.notes, fz: v.fz, date: v.date })), [...pool]);
    // what the cloud holds of one visit: { docs: [doc keys], v (the copy at home, else the first) }
    const cloudVisit = id => { const w = W.where(id); const home = w.find(x => homeOf(x.v.date) === x.k); return { docs: w.map(x => x.k), v: (home || w[0] || {}).v || null }; };
    // I4: a save told as landed is in the cloud now — unless another device wrote that visit's document since it began
    const checkLanded = (D, t0, kind, id, fields, r) => {
      if(!r || !(r.ok || r.sent)) return;
      const c = cloudVisit(id), others = W.ops.filter(o => o.who !== D.label && o.t >= t0 && /commit|set/.test(o.op) && VISIT_KEY(o.k)).length;
      const tombed = !!((W.doc('tombs') || {}).visits || {})[id];
      let bad = null;
      if(kind === 'del'){ if(c.docs.length) bad = 'still in ' + c.docs.join(','); }
      else if(tombed) return;
      else if(!c.v) bad = 'not in the cloud';
      else { for(const f of Object.keys(fields)) if(JSON.stringify(c.v[f]) !== JSON.stringify(fields[f])) bad = `${f} is ${JSON.stringify(c.v[f])}, not ${JSON.stringify(fields[f])}`;
        if(!bad && c.docs.length !== 1) bad = 'in ' + c.docs.join(' and ');
        if(!bad && c.docs[0] !== homeOf(c.v.date)) bad = 'in ' + c.docs[0] + ' at ' + c.v.date; }
      if(bad && !others) told.push(`I4 step ${step} ${D.label} ${kind} ${id}: told saved (${r.ok ? 'ok' : 'sent by the queue'}) but ${bad}`);
    };
    const canTouch = (D, id) => pool.includes(id) || (model.get(id) && model.get(id).by !== 'account');
    const targets = async D => (await D.ev(() => (visits || []).filter(v => v && v.rep === 'Mariam').map(v => v.id))).filter(id => canTouch(D, id));
    const freshDate = (id, month) => {
      const m = model.get(id), used = new Set([m.init.date, ...m.edits.date.map(e => e.value)]);
      const last = month === LIVE ? Number(TODAY.slice(8)) : 28;
      for(let i = 0; i < 40; i++){ const d = month + '-' + String(1 + Math.floor(rnd() * last)).padStart(2, '0'); if(!used.has(d)) return d; }
      return null;
    };
    const monthPick = cur => { const all = [...ARCH, LIVE, NEWM].filter(m => m !== cur); return pick(all); };
    // an edit of one or more fields of one visit, saved (inWindow: the save is started, not awaited)
    const doEdit = async (D, kind, inWindow, sc) => {
      const ids = await targets(D);
      if(!ids.length) return null;
      const id = sc && sc.id ? sc.id : pick(ids);
      if(!ids.includes(id)) return null;
      const cur = await D.ev(x => { const v = (visits || []).find(y => y && y.id === x); return v ? { notes: v.notes, fz: v.fz, date: v.date } : null; }, id);
      if(!cur) return null;
      const fields = {};
      if(kind === 'notes' || kind === 'notesMove') fields.notes = `N:${D.label.split('-')[1]}:${++W.tok}`;
      if(kind === 'fz') fields.fz = `F:${D.label.split('-')[1]}:${++W.tok}`;
      if(kind === 'move' || kind === 'notesMove'){ const d = sc && sc.date ? sc.date : freshDate(id, monthPick(cur.date.slice(0, 7))); if(!d) return null; fields.date = d; }
      const m = model.get(id);
      for(const f of Object.keys(fields)) m.edits[f].push({ dev: D.label, step, seq: ++W.seq, value: fields[f], saw: cur[f] === undefined ? null : cur[f] });
      say(`  ${step} ${D.label} ${kind} ${id} ${JSON.stringify(cur)} → ${JSON.stringify(fields)}${inWindow ? ' (in the early open\'s window)' : ''}`);
      const t0 = Date.now();
      const run = D.ev(async a => { const v = (visits || []).find(y => y && y.id === a.id); if(!v) return { missing: true };
        Object.assign(v, a.fields); const r = await persistTold('visits'); return { ok: r.ok, sent: sentSince('visits', r), outcome: r.outcome, words: !r.ok && typeof saveFailText === 'function' ? ((saveFailText(r, 'visits') || [''])[0]) : '' }; }, { id, fields });
      const after = r => { said.push({ step, dev: D.label, kind, id, r }); checkLanded(D, t0, kind, id, fields, r); say(`     → ${r.ok ? 'saved' : r.sent ? 'sent since' : 'not saved: ' + (r.words || JSON.stringify(r.outcome))}`); };
      if(inWindow) return run.then(after);
      after(await run);
      return null;
    };
    const doLog = async (D, inWindow) => {
      const id = `fz${seed}-${D.label.split('-')[1]}-${++logN}`;
      const month = chance(0.6) ? LIVE : pick([...ARCH, NEWM]);
      const date = month === LIVE ? TODAY : month + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0');
      const v = { id, clinicId: pick(ACCOUNT.clinicsM), rep: M, withRep: null, date, ts: Date.parse(BASE.now) + step * 1000, products: [], orderTaken: false, orders: [], orderItems: [], orderGross: 0, orderDiscount: 0, orderTotal: 0,
        doctorId: null, doctorIds: [], nextFollowUp: null, notes: 'logged ' + id, noOrderReason: null, fz: 'F0:' + id };
      model.set(id, { init: clone(v), by: D.label, deleted: [], edits: { notes: [], fz: [], date: [] }, photos: [] });
      say(`  ${step} ${D.label} log ${id} at ${date}${inWindow ? ' (in the early open\'s window)' : ''}`);
      const t0 = Date.now();
      const run = D.ev(async x => { visits.push(x); const r = await persistTold('visits'); return { ok: r.ok, sent: sentSince('visits', r), outcome: r.outcome, words: !r.ok && typeof saveFailText === 'function' ? ((saveFailText(r, 'visits') || [''])[0]) : '' }; }, v);
      const after = r => { said.push({ step, dev: D.label, kind: 'log', id, r }); checkLanded(D, t0, 'log', id, { date, notes: v.notes }, r); say(`     → ${r.ok ? 'saved' : r.sent ? 'sent since' : 'not saved: ' + (r.words || JSON.stringify(r.outcome))}`); };
      if(inWindow) return run.then(after);
      after(await run);
      return null;
    };
    const doDelete = async (D, sc) => {
      const ids = await targets(D);
      if(!ids.length) return;
      const id = sc && sc.id ? sc.id : pick(ids);
      if(!ids.includes(id)) return;
      const t0 = Date.now();
      const r = await D.ev(async x => { const n0 = window.__um.toasts.length; await deleteVisit(x); const gone = !(visits || []).some(v => v && v.id === x); return { gone, toasts: window.__um.toasts.slice(n0) }; }, id);
      if(r.gone){ model.get(id).deleted.push({ dev: D.label, step }); }
      const claimed = r.toasts.some(t => /Moved to recycle bin/.test(t));
      say(`  ${step} ${D.label} delete ${id} → ${r.gone ? 'deleted' : 'refused'}; ${r.toasts.join(' | ')}`);
      if(claimed) checkLanded(D, t0, 'del', id, {}, { ok: true });
    };
    const doPhoto = async D => {
      const ids = await targets(D);
      if(!ids.length) return;
      const id = pick(ids), pid = `p${seed}x${++photoN}${D.label.split('-')[1][0]}`;
      const r = await D.ev(async a => { const v = (visits || []).find(y => y && y.id === a.id); if(!v) return { missing: true };
        v.photos = v.photos || []; v.photos.push(photoMark(a.pid, 'data:image/png;base64,iVBORw0KGgo' + a.pid));
        const s = await persistFor('visits');
        const on = (visits || []).some(y => y && y.id === a.id && (y.photos || []).some(p => p && p.id === a.pid));
        if(on) await keepVisitPhotos(a.id, [{ id: a.pid, full: 'data:image/jpeg;base64,/9j/' + a.pid + 'A'.repeat(200) }]);
        return { ok: s.ok, sent: sentSince('visits', s), on }; }, { id, pid });
      if(r.on) model.get(id).photos.push({ dev: D.label, pid });
      say(`  ${step} ${D.label} photo ${pid} on ${id} → ${r.ok ? 'saved' : r.sent ? 'sent since' : 'not saved'}${r.on ? '' : ' (not on the visit)'}`);
    };
    const restart = async (D, hold) => {
      W.gen[D.label]++; W.releaseHeldBy(D.label);
      if(hold) W.holdAuth(D.label); else W.auth[D.label] = null;
      await D.goto();
      if(hold){
        const drew = await D.page.waitForFunction(() => typeof _early !== 'undefined' && !!_early && _early.state === 'drawn', null, { timeout: 4000, polling: 50 }).then(() => true, () => false);
        if(!drew){ say(`     (the early open did not draw)`); W.releaseAuth(D.label); await D.boot(); return false; }
        return true;
      }
      await D.boot();
      return true;
    };
    const ACTIONS = [['log', 9], ['notes', 11], ['fz', 7], ['move', 14], ['notesMove', 4], ['del', 6], ['photo', 5], ['net', 9], ['month', 6], ['flaky', 3], ['restart', 7], ['window', 5], ['round', 12], ['late', 5]];
    const total = ACTIONS.reduce((s, a) => s + a[1], 0);
    const choose = () => { let x = rnd() * total; for(const [n, w] of ACTIONS){ if((x -= w) < 0) return n; } return 'round'; };
    const N = script ? script.steps.length : STEPS;
    for(step = 1; step <= N; step++){
      const sc = script ? script.steps[step - 1] : null;
      const D = sc ? (sc.dev === 'A' ? A : B) : chance(0.5) ? A : B, act = sc ? sc.act : choose();
      if(act === 'log') await doLog(D);
      else if(['notes', 'fz', 'move', 'notesMove'].includes(act)) await doEdit(D, act, false, sc);
      else if(act === 'del') await doDelete(D, sc);
      else if(act === 'photo') await doPhoto(D);
      else if(act === 'net'){
        if(sc ? sc.mode === 'online' : W.down.has(D.label)){ W.down.delete(D.label); await D.ev(() => window.__setOff(false)); say(`  ${step} ${D.label} back online`); }
        else { const mode = sc ? sc.mode : chance(0.5) ? 'nosignal' : 'airplane'; W.down.set(D.label, mode); if(mode === 'airplane') await D.ev(() => window.__setOff(true)); say(`  ${step} ${D.label} ${mode === 'airplane' ? 'airplane mode (navigator offline)' : 'no signal (says online)'}`); }
      }
      else if(act === 'month'){
        if(sc ? sc.clear : W.month.has(D.label)){ W.month.delete(D.label); say(`  ${step} ${D.label} months answer again`); }
        else { const key = sc ? sc.key : 'visitsArch:' + pick([...ARCH, NEWM]), mode = sc ? sc.mode : pick(['slow', 'slow', 'fail', 'failall']); W.month.set(D.label, { key, mode }); say(`  ${step} ${D.label} ${key} ${mode}`); }
      }
      else if(act === 'flaky'){
        if(W.flaky.has(D.label)){ W.flaky.delete(D.label); say(`  ${step} ${D.label} link steady again`); }
        else { W.flaky.set(D.label, { p: 0.3, rand: rng(seed * 7 + step) }); say(`  ${step} ${D.label} flaky link (30% of requests fail)`); }
      }
      else if(act === 'late'){ const n = 1 + Math.floor(rnd() * 3); W.late.set(D.label, n); say(`  ${step} ${D.label} its next ${n} visits commit(s) land late`); }
      else if(act === 'round'){ say(`  ${step} ${D.label} round`); await D.round(); }
      else if(act === 'restart'){ say(`  ${step} ${D.label} closed and reopened${W.down.has(D.label) ? ' (no signal)' : ''}`); await restart(D, false); await D.idle(); }
      else if(act === 'window'){
        say(`  ${step} ${D.label} reopened, the sign-in held (the early open's window)${W.down.has(D.label) ? ' (no signal)' : ''}`);
        const drew = await restart(D, true);
        const pend = [];
        if(drew){
          const n = 1 + Math.floor(rnd() * 2);
          for(let i = 0; i < n; i++){ const k = pick(['notes', 'move', 'fz', 'log', 'move']); const p = k === 'log' ? await doLog(D, true) : await doEdit(D, k, true); if(p) pend.push(p); }
          await sleep(50 + Math.floor(rnd() * 400));
          W.releaseAuth(D.label);
          await Promise.all(pend);
          await D.boot();
        }
        await D.idle();
      }
      await Promise.all(devs.map(x => x.idle().catch(() => {})));
      if(TRACE) for(const D of devs){ const sc = await D.ev(() => ({ v: (visits || []).filter(v => v && v.rep === 'Mariam').map(v => v.id.replace(/^v2026/, '') + '@' + (v.date || '').slice(5)).join(' '), out: outboxList().join(','), unread: typeof visitsUnread === 'function' ? visitsUnread() : null, owed: typeof _visitsIdxOwed === 'object' ? Object.keys(_visitsIdxOwed).join(',') : '' })).catch(e => ({ v: 'n/a' })); say(`     [${D.label}] ${sc.v} | queued: ${sc.out || '-'}${sc.unread ? ' | unread' : ''}${sc.owed ? ' | owed: ' + sc.owed : ''}`); }
    }
    // ---------- settle: everything online, every hold let go, rounds until nothing moves ----------
    step = 'settle';
    say(`  settle`);
    W.down.clear(); W.month.clear(); W.flaky.clear(); W.late.clear();
    for(const D of devs){ W.releaseAuth(D.label); await D.ev(() => window.__setOff(false)); }
    const stateKey = () => W.visitDocs().map(k => k + '=' + W.cloud.get(k).value).join('\n') + '\n' + (W.cloud.get('visitsIndex') || {}).value + '\n' + (W.cloud.get('tombs') || {}).value;
    const quiet = async () => { for(const D of devs){ const q = await D.ev(() => ({ out: outboxList(), owed: typeof visitsIndexOwed === 'function' ? visitsIndexOwed() : 0, up: Object.keys(_photoUp).length, settling: !!_photoSettling })); if(q.out.length || q.owed || q.up || q.settling) return false; } return true; };
    let calm = 0;
    for(let i = 0; i < 10 && calm < 2; i++){
      await Promise.all([...W.lateP]);
      const k0 = stateKey();
      for(const D of devs) await D.round();
      await Promise.all([...W.lateP]);
      await sleep(150);
      calm = (stateKey() === k0 && await quiet()) ? calm + 1 : 0;
    }
    // ---------- the checks ----------
    const v = [];
    const cloudAll = new Map();
    W.visitDocs().forEach(k => (W.doc(k) || []).forEach(x => { if(x && x.id != null){ if(!cloudAll.has(x.id)) cloudAll.set(x.id, []); cloudAll.get(x.id).push({ k, v: x }); } }));
    const idx = W.doc('visitsIndex') || {}, tombs = ((W.doc('tombs') || {}).visits) || {};
    W.visitDocs().filter(k => k !== 'visits').forEach(k => { const arr = W.doc(k) || []; if(arr.length && !(idx.months || {})[k.slice('visitsArch:'.length)]) v.push(`I1 ${k} holds ${arr.length} visit(s) but visitsIndex does not list it (other phones never read it)`); });
    for(const [id, m] of model){
      const at = cloudAll.get(id) || [];
      if(m.deleted.length){
        if(at.length) v.push(`I2 ${id} deleted (${m.deleted.map(d => d.dev + '@' + d.step).join(', ')}) but in the cloud: ${at.map(x => x.k + '@' + x.v.date).join(', ')}`);
        continue;
      }
      if(at.length !== 1){ v.push(`I1 ${id} (${m.by === 'account' ? 'the account\'s' : 'logged by ' + m.by}) is in ${at.length} documents: ${at.map(x => x.k + '@' + x.v.date).join(', ') || 'none'}`); if(!at.length) continue; }
      const x = (at.find(a => homeOf(a.v.date) === a.k) || at[0]);
      if(homeOf(x.v.date) !== x.k) v.push(`I1 ${id} at ${x.v.date} sits in ${x.k}, not ${homeOf(x.v.date)}`);
      for(const f of FIELDS){
        const E = m.edits[f], val = x.v[f] === undefined ? null : x.v[f];
        if(!E.length){ if(JSON.stringify(val) !== JSON.stringify(m.init[f] === undefined ? null : m.init[f])) v.push(`I3 ${id}.${f} nobody edited it, yet it is ${JSON.stringify(val)} (was ${JSON.stringify(m.init[f])})`); continue; }
        const fr = frontier(E), ok = fr.map(e => e.value);
        if(!ok.includes(val)) v.push(`I3 ${id}.${f} is ${JSON.stringify(val)}; the edits standing: ${fr.map(e => JSON.stringify(e.value) + ' (' + e.dev + '@' + e.step + ')').join(' or ')}; all: ${E.map(e => e.dev + '@' + e.step + ' ' + JSON.stringify(e.saw) + '→' + JSON.stringify(e.value)).join(', ')}`);
      }
      const other = Object.keys(Object.assign({}, m.init, x.v)).filter(k => !FIELDS.includes(k) && k !== 'photos');
      other.forEach(k => { if(JSON.stringify(x.v[k]) !== JSON.stringify(m.init[k])) v.push(`I3 ${id}.${k} changed by itself: ${JSON.stringify(m.init[k])} → ${JSON.stringify(x.v[k])}`); });
      for(const ph of m.photos){
        const p = (x.v.photos || []).find(y => y && y.id === ph.pid);
        if(!p) v.push(`I3 ${id} lost the photo ${ph.pid} (added by ${ph.dev})`);
        else if(p.pending || p.lost) v.push(`I3 ${id} photo ${ph.pid} still says ${p.pending ? 'waiting' : 'lost'} after settling (added by ${ph.dev})`);
        if(!W.cloud.has('photo:' + ph.pid)) v.push(`I3 photo:${ph.pid} never reached the cloud`);
      }
      const extra = (x.v.photos || []).filter(p => p && !m.photos.some(y => y.pid === p.id));
      if(extra.length) v.push(`I3 ${id} has photos nobody added: ${extra.map(p => p.id).join(',')}`);
    }
    for(const [id, at] of cloudAll) if(!model.has(id)) v.push(`I1 ${id} is in the cloud (${at.map(a => a.k).join(',')}) but no device logged it`);
    // I5: nothing queued, the screens show what the cloud holds
    const cloudRec = new Map([...cloudAll].map(([id, at]) => [id, JSON.stringify((at.find(a => homeOf(a.v.date) === a.k) || at[0]).v)]));
    for(const D of devs){
      const s = await D.ev(() => ({ out: outboxList(), owed: typeof visitsIndexOwed === 'function' ? visitsIndexOwed() : 0, vs: (visits || []).filter(v => v && !tombSet('visits').has(v.id)).map(v => [v.id, JSON.stringify(v)]), broken: _visitsBroken.slice(), kept: Object.keys(_visitsArch).filter(m => _visitsArch[m] && _visitsArch[m].kept != null) }));
      if(s.out.length) v.push(`I5 ${D.label} still has queued: ${s.out.join(',')}`);
      if(s.owed) v.push(`I5 ${D.label} still owes ${s.owed} index revision(s)`);
      if(s.broken.length || s.kept.length) v.push(`I5 ${D.label} months not read: broken ${s.broken.join(',')} kept ${s.kept.join(',')}`);
      const mine = new Map(s.vs);
      for(const [id, rec] of cloudRec){ if(!mine.has(id)) v.push(`I5 ${D.label} does not show ${id} (the cloud holds it at ${parse(rec).date})`); else if(mine.get(id) !== rec){ const a = parse(mine.get(id)), b = parse(rec); const diff = Object.keys(Object.assign({}, a, b)).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])); v.push(`I5 ${D.label} shows ${id} unlike the cloud: ${diff.map(k => k + ' ' + JSON.stringify(a[k]) + ' vs ' + JSON.stringify(b[k])).join('; ')}`); } }
      for(const id of mine.keys()) if(!cloudRec.has(id)) v.push(`I5 ${D.label} shows ${id}, which the cloud does not hold${tombs[id] ? ' (deleted)' : ''}`);
    }
    v.push(...told);
    const errs = [].concat(...devs.map(D => D.errors));
    const ids = [...new Set([].concat(...v.map(l => l.match(/\b(v\d{6}-\d+|fz\d+-[a-z]+-\d+)\b/g) || [])).filter(x => model.has(x)))];
    const hist = [];
    ids.forEach(id => { hist.push(`    history of ${id} (the cloud's commits):`); hist.push(...history(W, id)); });
    return { seed, v, known: classify(W, model, v), log: W.log, hist, errs, said };
  }catch(e){
    return { seed, v: ['HARNESS ERROR ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')], known: [], log: W.log, errs: [].concat(...devs.map(D => D.errors)), said, crashed: true };
  }finally{ for(const D of devs) await D.ctx.close().catch(() => {}); }
}

// What the cloud's commits did to one visit: who wrote which document, and the visit's date / notes / fz / photos there.
function history(W, id){
  const out = [], prev = {};
  W.ops.filter(o => o.op === 'commit1' && (o.k === 'visits' || o.k.startsWith('visitsArch:'))).forEach(o => {
    const arr = parse(o.v) || [], x = Array.isArray(arr) ? arr.find(y => y && y.id === id) : null;
    const now = x ? `${x.date} ${x.notes || ''} ${x.fz || ''} ${(x.photos || []).map(p => p.id + (p.pending ? '⏳' : p.lost ? '⚠' : '✓')).join('/')}`.trim() : null;
    if(now !== (prev[o.k] === undefined ? null : prev[o.k])) out.push(`      t+${((o.t - W.t0) / 1000).toFixed(1)}s ${o.who} ${o.k}: ${prev[o.k] == null ? '(absent)' : prev[o.k]} → ${now == null ? '(absent)' : now}`);
    prev[o.k] = now;
  });
  return out;
}
// K1 (older, known): another device moved visit X out of document K between this phone's read of K and its write of K —
// the union keeps the phone's copy of X, which the cloud's K no longer holds. Found from the cloud's own log of commits.
function classify(W, model, v){
  const out = [];
  v.forEach(line => {
    const ids = (line.match(/\b(v\d{6}-\d+|fz\d+-[a-z]+-\d+)\b/g) || []).filter(x => model.has(x));
    out.push(ids.some(id => k1(W, model, id)));
  });
  return out;
}
function k1(W, model, id){
  const m = model.get(id);
  if(!m) return false;
  const commits = W.ops.filter(o => o.op === 'commit1' && (o.k === 'visits' || o.k.startsWith('visitsArch:')));
  // the visit's state in each document after each commit (from the account's own documents on); a move = a commit that
  // holds the visit at its home under a date it did not have just before
  const prev = {}; let last = m.init ? m.init.date : null;
  if(m.init && m.by === 'account') prev[homeOf(m.init.date)] = m.init.date;
  const steps = [];
  commits.forEach(o => { const a = parse(o.v) || [], y = Array.isArray(a) ? a.find(z => z && z.id === id) : null, now = y ? y.date : null;
    const before = prev[o.k] === undefined ? null : prev[o.k];
    steps.push({ o, before, now, move: !!now && now !== last && homeOf(now) === o.k });
    prev[o.k] = now; if(now && homeOf(now) === o.k) last = now; });
  for(const st of steps){
    if(st.before === st.now) continue;
    const c = st.o;
    for(const mv of steps){
      if(!mv.move || mv.o.who === c.who || mv.o.t >= c.t) continue;
      // c writes the visit at another date than that move gave it, or takes the moved copy out — on a copy of those
      // documents older than the move (c's device read neither of them since)
      const docs = new Set([mv.o.k]); steps.forEach(z => { if(z.o.who === mv.o.who && Math.abs(z.o.t - mv.o.t) < 2000 && z.before && !z.now) docs.add(z.o.k); });
      const stale = (st.now && st.now !== mv.now) || (!st.now && st.before === mv.now);
      if(!stale) continue;
      if(!W.ops.some(o => o.who === c.who && o.op === 'get' && docs.has(o.k) && o.t > mv.o.t && o.t < c.t)) return true;
    }
  }
  return false;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  browser = await chromium.launch(launchOpts());
  const seeds = REPLAY != null ? [REPLAY] : env.SEEDLIST ? env.SEEDLIST.split(',').map(Number) : (env.CASES != null && !env.SEEDS && !env.SEED0) ? [] : Array.from({ length: NSEEDS }, (_, i) => SEED0 + i);
  const cases = env.CASES != null ? env.CASES.split(',').filter(Boolean) : (REPLAY != null || env.SEEDLIST || env.SEEDS || env.SEED0) ? [] : Object.keys(CASES);
  const jobs = cases.map((c, i) => ({ seed: 9001 + i, script: CASES[c] })).concat(seeds.map(seed => ({ seed })));
  const results = [];
  let next = 0;
  const t0 = Date.now();
  const worker = async () => { while(next < jobs.length){ const j = jobs[next++], s = j.script ? 'case ' + j.script.name : j.seed; const t = Date.now(); const r = await runSeed(j.seed, j.script); r.name = s; r.ms = Date.now() - t; results.push(r);
    const nNew = r.v.filter((_, i) => !r.known[i]).length, nKnown = r.v.length - nNew;
    console.log(`${typeof s === 'number' ? 'seed ' + s : s}: ${!r.v.length ? 'ok' : (nNew ? nNew + ' new' : '') + (nNew && nKnown ? ', ' : '') + (nKnown ? nKnown + ' known (K1)' : '')}  (${Math.round(r.ms / 1000)}s)`);
    if(r.v.length || VERBOSE){ if(!(VERBOSE && PAR === 1)) console.log(r.log.join('\n')); r.v.forEach((x, i) => console.log('   ' + (r.known[i] ? '[K1] ' : '❌ ') + x)); if(r.hist && r.hist.length) console.log(r.hist.join('\n')); if(r.errs.length) console.log('   page errors: ' + r.errs.slice(0, 5).join(' | ')); } } };
  await Promise.all(Array.from({ length: PAR }, worker));
  results.sort((a, b) => a.seed - b.seed);
  results.forEach(r => { if(r.v.length) console.log(`  ${r.name}: ${r.v.length} finding(s)`); });
  let failedChecks = 0, knownChecks = 0;
  results.forEach(r => r.v.forEach((x, i) => { if(r.known[i]) knownChecks++; else failedChecks++; }));
  console.log(`\n${results.length} run(s) (${cases.length} case(s), ${seeds.length} seed(s) of ${STEPS} actions), ${Math.round((Date.now() - t0) / 1000)}s; with a new failure: ${results.filter(r => r.v.some((_, i) => !r.known[i])).map(r => r.name).join(', ') || 'none'}; with a known one only: ${results.filter(r => r.v.length && r.v.every((_, i) => r.known[i])).map(r => r.name).join(', ') || 'none'}`);
  const failed = failedChecks + (KNOWN_OK ? 0 : knownChecks);
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED'); // the words tests/e2e/run-all.js reads
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
