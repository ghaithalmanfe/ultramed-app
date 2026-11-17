// The daily open drawn from the phone's copy before the sign-in is confirmed (v126 speed, part 3: the early open,
// 04-sync.js earlyOpen). A phone that has its copy draws the screen of the person it last signed in from that copy
// right after the app boots — before the sign-in is confirmed and before any cloud read — and the start's cloud read
// then replaces it. The window between the two is an offline start in every respect. Each check fails on 87486c4
// (the speed work's part 2), where nothing is drawn before the cloud read — and every one of them says why it holds.
//   W  the window: before the sign-in is confirmed the screen is her own (greeting, follow-ups, month figure), nothing
//      is asked of the cloud, every list drawn counts as served from the phone's copy; the line says what the screen is
//      ("This phone's copy, saved <time> — updating from the cloud…", the copy's own time) on every view; nothing says
//      "up to date" and no text claims the cloud before the read is in; viewing writes nothing; after the read the
//      flags are the cloud's, the line goes, nothing is drawn again (nothing changed)
//   F  the read fails: the line says so; a later read clears it
//   A  Arabic: the line in Arabic, no English left
//   N  something changed on another phone: the whole frame is swapped once (every painted frame one data state)
//   S2 saves made in the window are an offline start's: a visit, a clinic edit and a day plan merge three ways against
//      the copy (each changed meanwhile on another device, all land with both changes); a whole document (the catalog,
//      the targets) is ONE compare-and-set against the exact text the copy came from — changed on another device since,
//      refused and said ("Changed on another device — reopen the app, then save again", the bar), nothing written, the
//      screen then the cloud's (part 4: part 3 merged it); a second edit made while a save is on its way is never
//      dropped — its save runs after the first, against what it landed, in the window and after it, and also when the
//      first had no answer within 12 s (S2i–S2k)
//   S3 the window is never taken for a cloud read: the daily backup, the whole-day Restore, the held deletes,
//      salesCheckComplete / visitsComplete, the nameless-clinic and lost-doctor flows, the clinic-recovery sheets and the
//      factory defaults
//   S4 nothing is written at start (the daily open of a rep and of the supervisor)
//   S5 a sign-in that has ended (a password changed on another device, a login disabled): the sign-in screen, the queue
//      kept on the phone and uploaded after the next sign-in; the next start shows the sign-in screen
//   S6 another person: a phone whose remembered person differs from the session Firebase keeps, or from the one who
//      signs in on the sign-in screen, never shows the other person's copy (every painted frame); a Sign out tapped before
//      the sign-in is confirmed stays signed out when the SDK then tells the session (S6d), one tapped while the start's
//      read is on its way draws nothing when the read comes in (S6e)
//   P  the time to her own data and to the figures, on a 4x phone (4G) and a laptop (wifi), a rep and the supervisor, on
//      a heavy year: drawn before the start's cloud read begins, the figures before its lists are taken; the first open
//      (no copy) unchanged; the numbers printed (own data / figures / up to date)
//   AL the alerts center in the window (alerts-v126): the bell works nothing out before the start's read has ended;
//      opened by a tap there, the sheet says it is this phone's copy (the line's words, the copy's time) on its line and
//      on every card the lists make, and nothing claims the cloud; after the read the bell has its number, worked out
//      after it, and no card speaks of a copy (each fails on 7d6ebae, the alerts before this change)
// The sign-in is the app's own (03-gate.js) over a stand-in for the Firebase SDK that keeps its session on the phone as
// the real SDK does and confirms it with the sign-in service before it tells the app (here: when the harness answers);
// the cloud is a fake in Node; the clock is fixed; the 20-second round is driven by hand. Invented data
// (fixtures/heavy-year.js). Port 8292. Env: ONLY=W,F,A,N,S2,S3,S4,S5,S6,P,AL  PROFILES=phone,laptop (P)  HEAVY_SCALE=x  WWW=<dir>
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts } = require('./_env.js');
const PORT = 8292;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const fixture = require('./fixtures/heavy-year.js');
const SMALL = fixture.build({ scale: 0.1 });
const core = require(path.join(WWW, 'js', 'core.js'));
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
const EMAIL = { [M]: 'mariam@example.com', [R]: 'renova@example.com', [G]: 'ghaith@example.com' };
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 900) : '')); if(!ok) failed++; }

// ---------- the site ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); }); });

// ---------- the network (P only): every request pays a round trip, the bytes share one link ----------
const NETS = { phone: { rtt: 150, down: 1.25e6, up: 0.5e6, auth: 3, setup: 4 }, laptop: { rtt: 30, down: 6e6, up: 2e6, auth: 3, setup: 4 } };
let NET = null; const link = { down: 0, up: 0 }; let cloudSetup = null;
async function netDown(bytes){ if(!NET) return; const start = Math.max(Date.now() + NET.rtt / 2, link.down); link.down = start + bytes * 1000 / NET.down; await sleep(link.down + NET.rtt / 2 - Date.now()); }
async function netUp(bytes){ if(!NET) return; const start = Math.max(Date.now(), link.up); link.up = start + bytes * 1000 / NET.up; await sleep(link.up + NET.rtt - Date.now()); }
const onCloud = () => { if(!NET) return Promise.resolve(); if(!cloudSetup) cloudSetup = sleep(NET.setup * NET.rtt); return cloudSetup; };

// ---------- the fake cloud: key → { value, updated }, shared by every device ----------
let cloud = new Map();
function seed(F, edit){ const docs = Object.assign({}, F.docs); if(edit) edit(docs); cloud = new Map(Object.entries(docs).filter(([, v]) => v != null).map(([k, v]) => [k, { value: v, updated: Date.parse(F.now) - 3600000 }])); }
const doc = k => cloud.has(k) ? parse(cloud.get(k).value) : null;
const put = (k, v) => cloud.set(k, { value: typeof v === 'string' ? v : JSON.stringify(v), updated: Date.now() });
const ops = []; // { who, op: 'get'|'set'|..., k, t, done }
const ctl = { down: new Set(), hold: new Map() }; // hold: label → { test: key → bool, p, release }
function holdReads(label, test){ let release; const p = new Promise(r => { release = r; }); ctl.hold.set(label, { test: test || (() => true), p, release }); }
function releaseReads(label){ const h = ctl.hold.get(label); ctl.hold.delete(label); if(h) h.release(); }
const failIf = who => { if(ctl.down.has(who)){ const e = new Error('unavailable: no signal (harness)'); e.code = 'unavailable'; throw e; } };
async function heldFor(who, k){ const h = ctl.hold.get(who); if(h && h.test(k)) await h.p; }
const locks = {};
async function lockKey(k){ const prev = locks[k] || Promise.resolve(); let release; const mine = new Promise(r => { release = r; }); locks[k] = prev.then(() => mine); await prev; const tm = setTimeout(release, 30000); return () => { clearTimeout(tm); release(); }; }
const held = {}; let txSeq = 0;
const api = {
  async get(who, k){ const o = { who, op: 'get', k, t: Date.now() }; ops.push(o); failIf(who); await heldFor(who, k); failIf(who); await onCloud(); const d = cloud.get(k); await netDown(d ? d.value.length + 60 : 60); o.done = Date.now(); return d ? { exists: true, value: d.value, updated: d.updated } : { exists: false }; },
  async set(who, k, v){ ops.push({ who, op: 'set', k, t: Date.now() }); failIf(who); await onCloud(); await netUp(v.length + 60); cloud.set(k, { value: v, updated: Date.now() }); return true; },
  async del(who, k){ ops.push({ who, op: 'del', k, t: Date.now() }); failIf(who); await onCloud(); cloud.delete(k); return true; },
  async commit(who, entries){ ops.push({ who, op: 'commit', k: entries.map(e => e[0]).join(','), t: Date.now() }); failIf(who); await onCloud(); await netUp(entries.reduce((s, [, v]) => s + v.length + 60, 0)); entries.forEach(([k, v]) => cloud.set(k, { value: v, updated: Date.now() })); return true; },
  async query(who, q){ ops.push({ who, op: 'query', k: q.from || '', t: Date.now() }); failIf(who); await onCloud();
    let keys = [...cloud.keys()].sort(); if(q.from != null) keys = keys.filter(k => k >= q.from); if(q.to != null) keys = keys.filter(k => k < q.to); if(q.after != null) keys = keys.filter(k => k > q.after); if(q.limit) keys = keys.slice(0, q.limit);
    return keys.map(k => ({ id: k, value: cloud.get(k).value, updated: cloud.get(k).updated })); },
  async txGet(who, k){ failIf(who); await heldFor(who, k); const release = await lockKey(k); const id = ++txSeq; held[id] = release; const d = await api.get(who, k); return { id, doc: d }; },
  async txEnd(who, id, k, v){ try{ if(v != null) await api.set(who, k, v); } finally { if(held[id]){ held[id](); delete held[id]; } } return true; },
  async signIn(who, email, pwd){ if(NET) await sleep(NET.auth * NET.rtt); return !!pwd && Object.values(EMAIL).includes(String(email || '').toLowerCase()); },
};
const writesBy = (who, from) => ops.filter(o => o.who === who && o.op !== 'get' && o.op !== 'query' && (from == null || o.t >= from));
const readsBy = (who, from) => ops.filter(o => o.who === who && (o.op === 'get' || o.op === 'query') && (from == null || o.t >= from));

// ---------- the sign-in: when each device's saved session is confirmed, and whether it still holds ----------
const auth = {}; // label → { mode: 'ok'|'ended', at: ms after the ask (P), gate: promise|null }
function holdAuth(label){ let release; const p = new Promise(r => { release = r; }); auth[label] = { gate: p, release, mode: 'ok' }; }
function releaseAuth(label, mode){ const a = auth[label]; if(!a) return; a.mode = mode || 'ok'; if(a.release) a.release(); }
async function confirmFor(label){ const a = auth[label]; if(a && a.gate) await a.gate; else if(NET) await sleep(NET.auth * NET.rtt); return a ? a.mode : 'ok'; }

// ---------- the Firebase stand-in (served at the SDK's addresses): its session kept on the phone, confirmed before it tells ----------
const FAKE_FB = `;(function(){
  var LS = '__fakefb_user', listeners = [], user = null, known = false, apiKey = null;
  // the real SDK keeps its session on the phone (IndexedDB, else web storage) under this key — kept here the web-storage way
  function saved(email){ try{ if(!apiKey) return; var k = 'firebase:authUser:' + apiKey + ':[DEFAULT]'; if(email) localStorage.setItem(k, JSON.stringify({ uid: 'u-' + email, email: email })); else localStorage.removeItem(k); }catch(err){} }
  try{ var e = localStorage.getItem(LS); if(e) user = { email: e, uid: 'u-' + e }; }catch(err){}
  function tell(){ if(window.__umWrap) window.__umWrap(); listeners.slice().forEach(function(cb){ try{ cb(user); }catch(err){ setTimeout(function(){ throw err; }); } }); }
  // the real SDK confirms a saved session with the sign-in service before it tells anyone (it reloads the user); a
  // session that no longer holds (a password changed on another device, a login disabled) is forgotten: "nobody"
  var started = Promise.resolve(user ? window.__fbConfirm(user.email) : 'none').then(function(r){
    if(r === 'ended'){ user = null; try{ localStorage.removeItem(LS); }catch(err){} saved(null); }
    window.__umConfirmAt = performance.now(); known = true; tell();
  });
  var auth = {
    get currentUser(){ return known ? user : null; },
    onAuthStateChanged: function(cb){ listeners.push(cb); if(known) setTimeout(function(){ if(window.__umWrap) window.__umWrap(); cb(user); }, 0); return function(){ listeners = listeners.filter(function(x){ return x !== cb; }); }; },
    signInWithEmailAndPassword: function(email, pwd){ return window.__fbSignIn(email, pwd).then(function(ok){
      if(!ok){ var er = new Error('wrong password'); er.code = 'auth/wrong-password'; throw er; }
      user = { email: email, uid: 'u-' + email }; try{ localStorage.setItem(LS, email); }catch(err){} saved(email); known = true;
      setTimeout(tell, 0); return { user: user }; }); },
    // (the real SDK queues a sign-out behind its start: asked before the session is confirmed, it first tells that session)
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

// ---------- what each page records (installed before any page script) ----------
function initScript(arg){
  const off = arg.off;
  const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off + FakeDate.shift()); else super(...a); } static now(){ return _D.now() + off + FakeDate.shift(); } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); }
    static shift(){ try{ return +(sessionStorage.getItem('__shift') || 0) || 0; }catch(e){ return 0; } } } window.Date = FakeDate;
  if(arg.lang){ try{ localStorage.setItem('ultramed_lang', arg.lang); }catch(e){} }
  // the 20-second round, driven by the harness
  const _si = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
  const U = window.__um = { marks: {}, frames: [], toasts: [], renderAll: 0, msRuns: [], mut: 0, mutLog: [], lines: [], timeline: [], alerts: [] };
  const now = () => performance.now();
  const mark = (n, t) => { if(U.marks[n] == null) U.marks[n] = Math.round(t == null ? now() : t); };
  U.mark = mark;
  // each function wrapped once, as soon as it exists: the sign-in can be confirmed while the app's scripts still load
  // (the source's files one by one) — loadAll there, renderAll and msRun not yet (review 2: wrapped all at once at that
  // moment, the figures were never seen, P2 "figures undefined")
  const WRAP = ['loadAll', 'loadErpSales', 'loadVisits', 'renderAll', 'msRun', 'showToast'];
  U.done = {};
  const once = (n, make) => { if(U.done[n] || typeof window[n] !== 'function') return; U.done[n] = true; window[n] = make(window[n]); };
  window.__umWrap = () => {
    if(U.wrapped) return;
    ['loadAll', 'loadErpSales', 'loadVisits'].forEach(n => once(n, f => function(){ window.__umWrap(); const t0 = now(); if(n === 'loadAll'){ U.loadAlls = (U.loadAlls || 0) + 1; if(U.loadAlls === 1) mark('loadAllStart', t0); }
      const p = f.apply(this, arguments); const end = () => { const t1 = now(); U.timeline.push([n, Math.round(t0), Math.round(t1)]); if(n === 'loadAll' && U.marks.loadAllEnd == null){ mark('loadAllEnd', t1); try{ msWhenReady().then(() => requestAnimationFrame(() => requestAnimationFrame(() => mark('upToDate')))); }catch(err){} } };
      if(p && typeof p.then === 'function') p.then(end, end); else end(); return p; }));
    once('renderAll', ra => function(){ U.renderAll++; if(U.marks.firstDraw == null) mark('firstDraw'); return ra.apply(this, arguments); });
    once('msRun', mr => function(){ const t0 = now(); try{ return mr.apply(this, arguments); } finally { U.msRuns.push([Math.round(t0), Math.round(now())]);
      try{ if(_msModel && _msModel.D && _msModel.key === msKey(msView()) && U.marks.figures == null){ mark('figures'); requestAnimationFrame(() => requestAnimationFrame(() => mark('figuresVisible'))); } }catch(err){} } });
    once('showToast', st => function(m, ms){ U.toasts.push(String(m)); return st.apply(this, arguments); });
    // (AL) every working out of the alerts: when, and whether the harness's tap on the bell asked for it (wrapped once)
    if(!U.alertsWrapped && window.UMCore && typeof UMCore.alertsFor === 'function'){ U.alertsWrapped = true; const af = UMCore.alertsFor; UMCore.alertsFor = function(){ U.alerts.push({ t: Math.round(now()), tap: !!window.__umTap, early: typeof _early !== 'undefined' && !!_early && _early.state === 'drawn' && !_cloudRead }); return af.apply(this, arguments); }; }
    U.wrapped = WRAP.every(n => U.done[n]) && !!U.alertsWrapped;
  };
  // every painted frame: what the screen shows (whose greeting, the app visible, the line, the home's figures)
  const ex = arg.expect || null;
  const frame = () => {
    const app = document.getElementById('app'), gate = document.getElementById('gate'), g = document.getElementById('greeting'), tc = document.getElementById('targetCard'), cl = document.getElementById('copyLine');
    const vis = el => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const num = sel => { const el = document.querySelector(sel); return el ? el.getAttribute('data-value') : null; };
    let view = null; try{ const v = msView(); view = v ? v.kind : null; }catch(e){}
    const hero = view === 'team' ? '#msSales' : '#targetCard';
    return { t: Math.round(now()), app: vis(app), gate: vis(gate), greet: g ? g.textContent : '', line: cl ? cl.textContent : null,
      wait: !!document.querySelector('#view-today .ms-wait'), sales: num(hero + ' [data-ms="sales"]'), goal: num(hero + ' [data-ms="of-target"]'), pct: num(hero + ' [data-ms="achievement"]'), remaining: num(hero + ' [data-ms="remaining"]'),
      who: typeof currentUser !== 'undefined' && currentUser ? currentUser.name : null };
  };
  const loop = () => { try{ const f = frame(); const last = U.frames[U.frames.length - 1]; if(!last || JSON.stringify(Object.assign({}, last, { t: 0 })) !== JSON.stringify(Object.assign({}, f, { t: 0 }))) U.frames.push(f); }catch(e){} requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // her own data on the Today screen: the greeting names her, her first follow-up shown, her month figure on the card
  let pend = false;
  const own = () => {
    pend = false;
    if(!ex || U.marks.ownDom != null) return;
    const app = document.getElementById('app'), g = document.getElementById('greeting'), due = document.getElementById('dueList'), tc = document.getElementById('targetCard');
    if(!app || app.style.display !== 'block' || !g || !due || !tc) return;
    if(g.textContent.indexOf(ex.greet) < 0) return;
    if(ex.dueMarker && due.textContent.indexOf(ex.dueMarker) < 0) return;
    if(!(tc.textContent.indexOf(ex.amount) >= 0 || [...document.querySelectorAll('[data-ms="sales"]')].some(e => e.getAttribute('data-value') !== '' && Math.abs(+e.getAttribute('data-value') - ex.raw) < 0.006))) return;
    mark('ownDom'); requestAnimationFrame(() => requestAnimationFrame(() => mark('ownVisible')));
  };
  const start = () => {
    const desc = n => { const e = n && n.nodeType === 1 ? n : n && n.parentElement; let s = ''; for(let x = e, i = 0; x && i < 3; x = x.parentElement, i++) s = (x.id ? '#' + x.id : x.tagName.toLowerCase() + (x.className && typeof x.className === 'string' ? '.' + x.className.split(' ')[0] : '')) + (s ? '>' + s : ''); return s; };
    new MutationObserver(ms => { if(!pend){ pend = true; requestAnimationFrame(own); } const a = document.getElementById('app'); if(a) ms.forEach(m => { if(a.contains(m.target)){ U.mut++; if(U.mutLog.length < 400) U.mutLog.push([Math.round(now()), m.type, desc(m.target), m.attributeName || '']); } }); })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  };
  if(document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
  document.addEventListener('DOMContentLoaded', () => { mark('dcl'); window.__umWrap(); });
}

// ---------- a device ----------
const PROFILES = { laptop: { viewport: { width: 1440, height: 900 }, cpu: 1 }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4 } };
const SHORT = n => String(n).replace(/^Dr\.\s*/, '').split(/\s+/)[0];
function expectFor(F, who){
  const role = F.people[who], today = F.today;
  const due = F.data.clinics.filter(c => c.cls !== 'Closed' && c.nextFollowUp && c.nextFollowUp <= today && (role !== 'rep' || c.rep === who)).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
  const own = due.filter(c => c.rep === who);
  const raw = Math.round(core.monthAchievement(who, F.data).amount * 100) / 100;
  return { who, role, greet: SHORT(who), dueMarker: own.length ? own[0].name : null, amount: core.money(raw), raw };
}
let browser;
async function mkDevice(label, opts){
  opts = opts || {};
  const prof = PROFILES[opts.profile || 'laptop'], F = opts.F || SMALL;
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: !!prof.isMobile, hasTouch: !!prof.hasTouch, locale: 'en-US', timezoneId: 'Asia/Kuwait' });
  await ctx.route(/^https?:\/\/(?!localhost[:/])/, route => {
    const url = route.request().url();
    if(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|firestore|auth)-compat\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: /auth-compat/.test(url) ? FAKE_FB : '/* stand-in */' });
    if(/fonts\.googleapis\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts stand-in */' });
    return route.abort();
  });
  const errors = [];
  for(const [n, fn] of Object.entries({ __fbGet: k => api.get(label, k), __fbSet: (k, v) => api.set(label, k, v), __fbDel: k => api.del(label, k), __fbCommit: e => api.commit(label, e), __fbQuery: q => api.query(label, q),
    __fbTxGet: k => api.txGet(label, k), __fbTxEnd: (id, k, v) => api.txEnd(label, id, k, v), __fbSignIn: (e, p) => api.signIn(label, e, p), __fbConfirm: () => confirmFor(label) })) await ctx.exposeFunction(n, fn);
  await ctx.addInitScript(initScript, { off: Date.parse(F.now) - Date.now(), lang: opts.lang || null, expect: opts.expect || null });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::ERR/i.test(m.text())) errors.push(label + ' console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.accept().catch(() => {}));
  if(prof.cpu > 1){ const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu }); }
  const ev = (fn, a) => page.evaluate(fn, a);
  const D = { label, ctx, page, ev, errors, F,
    goto: async () => { await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'commit' }); await page.waitForFunction(() => document.readyState !== 'loading', null, { timeout: 60000 }); },
    settled: () => page.waitForFunction(() => typeof _bootLoaded !== 'undefined' && _bootLoaded && typeof refreshRunning === 'function' && !refreshRunning() && window.__um && window.__um.marks.loadAllEnd != null && !_flushing, null, { timeout: 120000, polling: 100 }),
    // a new device: the sign-in screen, her e-mail and password, the start read from the cloud, the phone's copy written
    async firstOpen(who){
      auth[label] = null;
      await D.goto();
      await page.waitForSelector('#gateGrid .gate-tile', { timeout: 60000 });
      await page.click(`#gateGrid .gate-tile:has-text("${who}")`);
      const pw = await Promise.race([page.waitForSelector('#elEmail', { timeout: 30000 }).then(() => 'email'), page.waitForSelector('#gatePassword', { timeout: 30000 }).then(() => 'pw')]);
      if(pw === 'email'){ await page.fill('#elEmail', EMAIL[who]); await page.fill('#elPwd', 'invented-password'); }
      else await page.fill('#gatePassword', 'invented-password');
      await page.click('#modalInner button.btn');
      await page.waitForFunction(w => typeof currentUser !== 'undefined' && currentUser && currentUser.name === w, who, { timeout: 120000, polling: 100 });
      await D.settled(); await page.evaluate(() => msWhenReady());
      await sleep(300);
    },
    // the same device again (the app opened the next morning): the phone's copies are there; the sign-in confirmed when the harness says
    async restart(o){ o = o || {}; if(o.hold) holdAuth(label); else auth[label] = null; await D.goto(); },
    tick: async () => { await page.waitForFunction(() => typeof _flushing === 'undefined' || !_flushing, null, { timeout: 60000 }); await page.evaluate(async () => { await window.__bgTick(); }); await page.evaluate(() => msWhenReady()); },
    um: () => page.evaluate(() => { const U = window.__um; return { marks: U.marks, renderAll: U.renderAll, loadAlls: U.loadAlls || 0, mut: U.mut, mutLog: U.mutLog.slice(), toasts: U.toasts.slice(), frames: U.frames.slice(), msRuns: U.msRuns.slice(), timeline: U.timeline.slice(), alerts: (U.alerts || []).slice() }; }),
    state: () => page.evaluate(() => ({ who: typeof currentUser !== 'undefined' && currentUser ? currentUser.name : null, mu: Object.keys(_mirrorUsed).sort(), lf: Object.keys(_loadFailed).sort(),
      line: (document.getElementById('copyLine') || {}).textContent || null, early: typeof _early !== 'undefined' && _early ? _early.state : null, booted: _bootLoaded, outbox: outboxList(),
      gate: getComputedStyle(document.getElementById('gate')).display !== 'none', app: getComputedStyle(document.getElementById('app')).display !== 'none' && !document.body.classList.contains('um-cover') })),
  };
  return D;
}
// the early open drew her own screen (or nothing came within ms): the window is open while the sign-in is held
// the frame with her own data was painted before the next task began: the first figures' run after it bounds it (startup-speed's rule)
function ownPainted(u){ const m = u.marks; if(m.ownDom == null) return null; const next = (u.msRuns || []).find(x => x[0] >= m.ownDom); return next && m.ownVisible != null && next[0] < m.ownVisible ? next[0] : m.ownVisible; }
const waitOwn = (D, ms) => D.page.waitForFunction(() => window.__um && window.__um.marks.ownDom != null, null, { timeout: ms || 15000, polling: 50 }).then(() => true, () => false);
// the early open drew (on 87486c4 there is none: false after the wait)
const waitEarly = (D, ms) => D.page.waitForFunction(() => typeof _early !== 'undefined' && !!_early && _early.state === 'drawn', null, { timeout: ms || 8000, polling: 50 }).then(() => true, () => false);
const LINE_RE = /This phone's copy, saved\s+(\S.*?)\s+— updating from the cloud…/;

(async () => {
  await new Promise(r => server.listen(PORT, r));
  browser = await chromium.launch(launchOpts());
  const allErrors = [];
  const done = D => { allErrors.push(...D.errors); return D.ctx.close().catch(() => {}); };
  const today = SMALL.today, clinicsOf = who => SMALL.data.clinics.filter(c => c.rep === who && c.cls !== 'Closed');

  // =====================================================================================================
  // W — the window, what it says, what it counts as; N1 — nothing drawn again when nothing changed; S4 — nothing written
  // =====================================================================================================
  for(const who of (want('W') || want('S4') ? [M, G] : [])){
    seed(SMALL);
    const D = await mkDevice('W-' + SHORT(who), { expect: expectFor(SMALL, who) });
    await D.firstOpen(who);
    const copyAt = await D.ev(() => { try{ return JSON.parse(localStorage.getItem('um_copyAt')).at; }catch(e){ return null; } });
    const t0 = Date.now();
    await D.restart({ hold: true });
    const drew = await waitOwn(D);
    const inWin = await D.state();
    const readsHeld = readsBy(D.label, t0).length, writesHeld = writesBy(D.label, t0).length;
    // the line's time is the copy's own (when this phone last saved its copy from a read of the cloud)
    const lineTime = await D.ev(at => { try{ return copyTimeText(at); }catch(e){ return null; } }, copyAt);
    // every view in the window shows the line, and none says "up to date" or claims the cloud
    const views = await D.ev(async () => {
      const out = [];
      for(const v of ['today', 'clinics', 'calendar', 'reports', 'team', 'more', 'today']){
        try{ switchView(v); }catch(e){}
        await new Promise(r => setTimeout(r, 120));
        const t = document.body.innerText;
        out.push({ v, line: !!document.getElementById('copyLine'), upToDate: /up to date|synced|in sync/i.test(t), claim: (t.match(/[^\n]*\bfrom the cloud\b[^\n]*/gi) || []).filter(x => !/— updating from the cloud…/.test(x)) });
      }
      try{ openClinicDetail(clinics.find(c => c.rep === currentUser.name || currentUser.role === 'supervisor').id); }catch(e){}
      await new Promise(r => setTimeout(r, 150)); try{ closeModal(); }catch(e){}
      return out;
    });
    const writesView = writesBy(D.label, t0).length;
    if(want('W')){
      check(`W1 [${SHORT(who)}]: before the sign-in is confirmed her own screen is drawn from this phone's copy — greeting, follow-ups, month figure — and nothing is asked of the cloud`,
        drew && inWin.who === who && inWin.app && readsHeld === 0 && writesHeld === 0, { drew, inWin, readsHeld, writesHeld });
      check(`W2 [${SHORT(who)}]: every list drawn counts as served from the phone's copy, none as failed`,
        ['benchmarks', 'categoryGuides', 'clinics', 'dayPlans', 'erpMap', 'erpNotes', 'erpSales', 'events', 'products', 'recycleBin', 'rxTypes', 'staff', 'targets', 'tasks', 'visits'].every(k => inWin.mu.includes(k)) && !inWin.lf.length, { mu: inWin.mu, lf: inWin.lf });
      const m = LINE_RE.exec(inWin.line || '');
      check(`W3 [${SHORT(who)}]: the line says the screen is this phone's copy, when it was saved (${lineTime}: the copy's own time), and that it is updating`,
        !!m && m[1].trim() === lineTime, { line: inWin.line, lineTime });
      check(`W4 [${SHORT(who)}]: every view visited in the window shows the line; none says "up to date" or claims the cloud`,
        views.every(x => x.line && !x.upToDate && !x.claim.length), views);
    }
    if(want('S4')) check(`S4a [${SHORT(who)}]: viewing in the window writes nothing (every view, a clinic card)`, drew && writesView === 0, writesBy(D.label, t0).map(o => o.op + ' ' + o.k));
    await D.ev(() => { window.__um.mutLog.length = 0; });
    const before = await D.um();
    releaseAuth(D.label, 'ok');
    await D.settled(); await D.ev(() => msWhenReady()); await sleep(600);
    const after = await D.state(), u2 = await D.um();
    if(want('W')){
      check(`W5 [${SHORT(who)}]: once the read is in, every list is the cloud's (no copy flag, none failed) and the line is gone`, !after.mu.length && !after.lf.length && !after.line && after.early === 'drawn', after);
      // (the Team screen's chat and memories are read on their own when their screen opens — the tour opened it in the
      // window, and their read draws them when it lands: speed-rounds B2; left out here)
      // (the top bar's bell: the alerts are worked out once the start's read has ended — never in the window, AL1 — so its
      // number shows then; nothing else of the page moves)
      const moved = u2.mutLog.filter(x => !/^#view-team/.test(x[2]) && !/^div\.msg/.test(x[2]) && !/#alertsBell/.test(x[2]));
      check(`W6 [${SHORT(who)}]: nothing changed in the cloud: nothing is drawn again (no renderAll, nothing in the app's page changed after the copy's figures)`,
        u2.renderAll === before.renderAll && !moved.length, { renderAll: [before.renderAll, u2.renderAll], moved: moved.slice(0, 10) });
    }
    if(want('S4')) check(`S4b [${SHORT(who)}]: the daily open writes nothing to the cloud (the window and the start's read)`, drew && writesBy(D.label, t0).length === 0, writesBy(D.label, t0).map(o => o.op + ' ' + o.k));
    await done(D);
  }

  // =====================================================================================================
  // F — the start's read fails: the line says so; A — Arabic
  // =====================================================================================================
  if(want('F')){
    seed(SMALL);
    const D = await mkDevice('F-rep', { expect: expectFor(SMALL, M) });
    await D.firstOpen(M);
    await D.restart({ hold: true });
    await waitOwn(D);
    ctl.down.add(D.label);
    releaseAuth(D.label, 'ok');
    await D.settled(); await sleep(400);
    const s1 = await D.state();
    ctl.down.delete(D.label);
    await D.tick(); await sleep(300);
    const s2 = await D.state();
    check('F1: the start\'s read fails (no signal): the line says the screen is still this phone\'s copy and that it could not update, and it is tried again',
      /This phone's copy, saved .+ — could not update from the cloud; it is tried again/.test(s1.line || '') && s1.mu.length > 0, s1);
    check('F2: a later read from the cloud clears the line and the copy flags', !s2.line && !s2.mu.length && !s2.lf.length, s2);
    await done(D);
  }
  if(want('A')){
    seed(SMALL);
    const D = await mkDevice('A-rep', { lang: 'ar', expect: Object.assign(expectFor(SMALL, M), { greet: 'مريم', dueMarker: null }) });
    await D.firstOpen(M);
    await D.restart({ hold: true });
    const drew = await waitOwn(D);
    const s = await D.state();
    check('A1: in Arabic the line is Arabic — no English left (the time in digits)', drew && !!s.line && /نسخة هذا الهاتف/.test(s.line) && /جارٍ التحديث من السحابة/.test(s.line) && !/[A-Za-z]/.test(s.line), s);
    ctl.down.add(D.label); releaseAuth(D.label, 'ok'); await D.settled(); await sleep(300);
    const s2 = await D.state(); ctl.down.delete(D.label);
    check('A2: …and when the read fails, in Arabic too', /تعذّر التحديث من السحابة/.test(s2.line || '') && !/[A-Za-z]/.test(s2.line || ''), s2);
    await done(D);
  }

  // =====================================================================================================
  // N — another phone changed something of hers: the whole frame is swapped once
  // =====================================================================================================
  if(want('N')){
    seed(SMALL);
    const D = await mkDevice('N-rep', { expect: expectFor(SMALL, M) });
    await D.firstOpen(M);
    await D.restart({ hold: true });
    await waitOwn(D); await D.ev(() => msWhenReady()); await sleep(200);
    // meanwhile the supervisor raised her target on another device
    const tg = doc('targets'); tg[M].revenue = Math.round((tg[M].revenue || 10000) * 1.5); put('targets', tg);
    const f0 = (await D.um()).frames.length, r0 = (await D.um()).renderAll;
    releaseAuth(D.label, 'ok');
    await D.settled(); await D.ev(() => msWhenReady()); await sleep(700);
    const u = await D.um(), fr = u.frames.slice(f0).filter(f => f.app);
    const bad = fr.filter(f => { if(f.wait) return true; const s = +f.sales, g = +f.goal; if(g > 0 && f.pct != null && f.sales != null && Math.abs(+f.pct - s / g * 100) > 1.5) return true; return f.remaining != null && f.remaining !== '' && g > 0 && Math.abs(+f.remaining - Math.max(0, g - s)) > 1; });
    const goals = [...new Set(fr.map(f => f.goal).filter(x => x != null))];
    check('N1: another device changed her target while the copy was on screen: after the read the new target is drawn — every painted frame is one data state (never "Calculating…" over the copy\'s figures), the frame swapped once',
      goals.length === 2 && +goals[goals.length - 1] === tg[M].revenue && !bad.length && u.renderAll - r0 >= 1, { goals, want: tg[M].revenue, bad: bad.slice(0, 3), draws: u.renderAll - r0 });
    await done(D);
  }

  // =====================================================================================================
  // S2 — saves made in the window are an offline start's: lists merge three ways against the copy, a whole document is
  //      one compare-and-set against the copy's text (each changed meanwhile on another device)
  // =====================================================================================================
  if(want('S2')){
    // lists: a visit, a clinic edit, a day plan — Mariam's phone and her laptop
    seed(SMALL);
    const P = await mkDevice('S2-phone'), L = await mkDevice('S2-laptop');
    await P.firstOpen(M);
    await L.firstOpen(M);
    const live = doc('visits'), myClinic = clinicsOf(M)[0], other = clinicsOf(M)[1], third = clinicsOf(M)[2];
    const V = live.find(v => v && v.rep === M && !v.callOnly) || live.find(v => v && v.rep === M);
    // the laptop's changes, after the phone saved its copy
    await L.ev(async o => {
      const v = visits.find(x => x.id === o.v); v.notes = 'corrected on the laptop';
      const c = clinics.find(x => x.id === o.c); c.phone = '+000 1111 2222';
      dayPlans[o.d] = dayPlans[o.d] || {}; dayPlans[o.d][o.who] = (dayPlans[o.d][o.who] || []).concat([o.p1]);
      const a = await persistTold('visits'), b = await persistTold('clinics'), d = await persistTold('dayPlans');
      return [a.ok, b.ok, d.ok];
    }, { v: V.id, c: myClinic.id, d: today, who: M, p1: other.id });
    const t0 = Date.now();
    await P.restart({ hold: true });
    const drew = await waitEarly(P);
    // the phone, in the window: an order note on the visit, the clinic's notes, a clinic added to today's plan
    await P.ev(o => {
      try{
        const v = visits.find(x => x.id === o.v); v.products = (v.products || []).concat(['window-product']);
        const c = clinics.find(x => x.id === o.c); c.notes = 'edited on the phone in the first second';
        dayPlans[o.d] = dayPlans[o.d] || {}; dayPlans[o.d][o.who] = (dayPlans[o.d][o.who] || []).concat([o.p2]);
        window.__saves = Promise.all([persistTold('visits'), persistTold('clinics'), persistTold('dayPlans')]);
      }catch(e){ window.__saves = Promise.resolve([]); } // (nothing on screen to edit: no window)
    }, { v: V.id, c: myClinic.id, d: today, who: M, p2: third.id });
    const asked = writesBy(P.label, t0).length; // nothing reaches the cloud before the sign-in is confirmed
    releaseAuth(P.label, 'ok');
    const outs = await P.ev(async () => (await window.__saves).map(r => ({ ok: r.ok, queued: !!(r.outcome && r.outcome.queued) })));
    while(outs.length < 3) outs.push({ ok: false, none: true });
    await P.settled(); await P.tick();
    const cv = (doc('visits') || []).find(x => x.id === V.id) || {}, cc = (doc('clinics') || []).find(x => x.id === myClinic.id) || {}, cp = ((doc('dayPlans') || {})[today] || {})[M] || [];
    const ids = cp.map(e => typeof e === 'string' ? e : e && e.id);
    const shown = await P.ev(o => { const v = (visits || []).find(x => x.id === o.v) || {}, c = (clinics || []).find(x => x.id === o.c) || {}; const p = (((dayPlans || {})[o.d] || {})[o.who] || []).map(e => typeof e === 'string' ? e : e && e.id);
      return { notes: v.notes, products: v.products, phone: c.phone, cnotes: c.notes, plan: p }; }, { v: V.id, c: myClinic.id, d: today, who: M });
    check('S2a: a visit edited in the window lands with the laptop\'s correction and the phone\'s change (three-way, against the copy)',
      drew && asked === 0 && outs[0].ok && cv.notes === 'corrected on the laptop' && (cv.products || []).includes('window-product'), { drew, asked, out: outs[0], notes: cv.notes, products: cv.products });
    check('S2b: a clinic edited in the window lands with both changes', outs[1].ok && cc.phone === '+000 1111 2222' && cc.notes === 'edited on the phone in the first second', { out: outs[1], phone: cc.phone, notes: cc.notes });
    check('S2c: a day plan changed in the window lands with both clinics', outs[2].ok && ids.includes(other.id) && ids.includes(third.id), { out: outs[2], plan: ids });
    check('S2d: …and the phone\'s screen shows both changes of each', shown.notes === 'corrected on the laptop' && (shown.products || []).includes('window-product') && shown.phone === '+000 1111 2222' && shown.cnotes === 'edited on the phone in the first second' && shown.plan.includes(other.id) && shown.plan.includes(third.id), shown);
    await done(P); await done(L);
    // whole documents: the catalog and the targets — the supervisor's phone and his laptop. A whole document saved in
    // the window is an offline start's save (v126 speed, part 4): ONE compare-and-set against the exact text the copy on
    // screen came from — it lands while the cloud still holds that text; changed on another device since, it is refused
    // and said, nothing written (part 3 merged it with the other device's change: never, by the owner's rule)
    seed(SMALL);
    const P2 = await mkDevice('S2-sup-phone'), L2 = await mkDevice('S2-sup-laptop');
    await P2.firstOpen(G); await L2.firstOpen(G);
    const prods = doc('products'), pa = prods[0], pb = prods[1];
    await L2.ev(async o => { products.find(x => x.id === o.a).price = 77.5; targets[o.m].revenue = 22222; targets[o.r] = targets[o.r] || {}; targets[o.r].visits = 33;
      const a = await persistTold('products'), b = await persistTold('targets'); return [a.ok, b.ok]; }, { a: pa.id, m: M, r: R });
    const lapProducts = cloud.get('products').value, lapTargets = cloud.get('targets').value; // what the laptop saved, as text
    const t2 = Date.now();
    await P2.restart({ hold: true });
    const inWin2 = await waitEarly(P2);
    await P2.ev(o => { try{ window.__um.toasts.length = 0; products.find(x => x.id === o.b).name = 'Renamed in the first second'; targets[o.r] = targets[o.r] || {}; targets[o.r].revenue = 15000;
      window.__saves = Promise.all([persistTold('products'), persistTold('targets')]); }catch(e){ window.__saves = Promise.resolve([]); } }, { b: pb.id, r: R });
    releaseAuth(P2.label, 'ok');
    const outs2 = await P2.ev(async () => (await window.__saves).map(r => ({ ok: r.ok, refused: !!(r.outcome && r.outcome.refused) })));
    while(outs2.length < 2) outs2.push({ ok: false, none: true });
    const said2 = await P2.ev(() => ({ toasts: window.__um.toasts.slice(), bar: (document.getElementById('refusedPill') || {}).textContent || '' }));
    await P2.settled(); await P2.tick();
    const wrote2 = writesBy(P2.label, t2).filter(o => /(^|,)(products|targets)(,|$)/.test(o.k)).map(o => o.op + ' ' + o.k);
    const shown2 = await P2.ev(o => ({ price: (products.find(x => x.id === o.a) || {}).price, name: (products.find(x => x.id === o.b) || {}).name, m: (targets[o.m] || {}).revenue, r: (targets[o.r] || {}).revenue, rv: (targets[o.r] || {}).visits,
      bar: (document.getElementById('refusedPill') || {}).textContent || '' }), { a: pa.id, b: pb.id, m: M, r: R });
    const ELSEWHERE = /Changed on another device — reopen the app, then save again/;
    check('S2e: the catalog saved in the window, changed on another device since the copy: refused and said ("Changed on another device — reopen the app, then save again", the bar), nothing written — the cloud holds the laptop\'s catalog exactly',
      inWin2 && !outs2[0].ok && outs2[0].refused && said2.toasts.some(t => ELSEWHERE.test(t)) && /changed on another device/i.test(said2.bar) && cloud.get('products').value === lapProducts && !wrote2.some(w => /products/.test(w)),
      { inWin2, out: outs2[0], said: said2, wrote: wrote2, cloudIsLaptops: cloud.get('products').value === lapProducts });
    check('S2f: the targets saved in the window, changed on another device since the copy: refused and said, nothing written — the cloud holds the laptop\'s targets exactly (Mariam\'s 22,222, Renova\'s visits target 33, not the phone\'s 15,000)',
      !outs2[1].ok && outs2[1].refused && cloud.get('targets').value === lapTargets && !wrote2.some(w => /targets/.test(w)),
      { out: outs2[1], wrote: wrote2, cloud: { m: doc('targets')[M].revenue, r: (doc('targets')[R] || {}).revenue, rv: (doc('targets')[R] || {}).visits } });
    const cloudR2 = (doc('targets')[R] || {}).revenue;
    check('S2g: …and once the read is in the phone shows the cloud\'s documents (the laptop\'s price and targets; its refused change is not shown as saved), the bar still saying it was not saved',
      shown2.price === 77.5 && shown2.name === pb.name && shown2.m === 22222 && shown2.r === cloudR2 && shown2.r !== 15000 && shown2.rv === 33 && /changed on another device/i.test(shown2.bar), Object.assign({ cloudR: cloudR2 }, shown2));
    // the same target changed on both (a guard — refused on 7256c04 too): refused and said, the laptop's 11,111 kept
    await L2.tick();
    const l2ok = await L2.ev(async o => { targets[o.r] = targets[o.r] || {}; targets[o.r].revenue = 11111; return (await persistTold('targets')).ok; }, { r: R });
    await P2.restart({ hold: true });
    const inWin3 = await waitEarly(P2);
    await P2.ev(o => { try{ targets[o.r] = targets[o.r] || {}; targets[o.r].revenue = 15500; window.__saves = persistTold('targets'); }catch(e){ window.__saves = Promise.resolve({ ok: false, outcome: {} }); } }, { r: R });
    releaseAuth(P2.label, 'ok');
    const out3 = await P2.ev(async () => { const r = (await window.__saves) || {}; return { ok: r.ok, refused: !!(r.outcome && r.outcome.refused), bar: (document.getElementById('refusedPill') || {}).textContent || '', toasts: window.__um.toasts.slice(-3) }; });
    check('S2h: the same target changed on both: the phone\'s save is refused and said ("Changed on another device"), the laptop\'s 11,111 stays (a guard)',
      l2ok && inWin3 && !out3.ok && out3.refused && /changed on another device/i.test(out3.bar + ' ' + out3.toasts.join(' ')) && doc('targets')[R].revenue === 11111, Object.assign({ l2ok, inWin3, cloud: doc('targets')[R].revenue }, out3));
    await P2.settled(); await P2.tick();
    // A second edit made while a save is on its way is never dropped, on the screen or in the cloud: the cloud unchanged
    // since the copy, an edit and its save, a second edit and its save at once (before the first answered) — both land,
    // in order (the second against what the first landed); in the window (both wait for the sign-in), then once the read
    // is in (on 7256c04 the second was refused there as "Changed on another device", and its edit went at the next round)
    await P2.restart({ hold: true });
    const inWin4 = await waitEarly(P2);
    await P2.ev(o => { try{ window.__um.toasts.length = 0; targets[o.r] = targets[o.r] || {}; targets[o.r].revenue = 16000; window.__s1 = persistTold('targets'); targets[o.r].visits = 44; window.__s2 = persistTold('targets'); }
      catch(e){ window.__s1 = window.__s2 = Promise.resolve({ ok: false, outcome: {} }); } }, { r: R });
    releaseAuth(P2.label, 'ok');
    const w4 = await P2.ev(async o => { const a = await window.__s1, b = await window.__s2; const t = targets[o.r] || {}; return { ok1: a.ok, ok2: b.ok, mem: { r: t.revenue, rv: t.visits } }; }, { r: R });
    const c4 = doc('targets')[R] || {};
    await P2.settled(); await P2.tick();
    const after4 = await P2.ev(o => { const t = targets[o.r] || {}; return { r: t.revenue, rv: t.visits }; }, { r: R });
    const r5 = await P2.ev(async o => { targets[o.r].revenue = 17000; const s3 = persistTold('targets'); targets[o.r].visits = 55; const s4 = persistTold('targets');
      const a = await s3, b = await s4; const t = targets[o.r] || {};
      return { ok3: a.ok, ok4: b.ok, mem: { r: t.revenue, rv: t.visits }, toasts: window.__um.toasts.slice(), bar: (document.getElementById('refusedPill') || {}).textContent || '' }; }, { r: R });
    const c5 = doc('targets')[R] || {};
    await P2.tick();
    const after5 = await P2.ev(o => { const t = targets[o.r] || {}; return { r: t.revenue, rv: t.visits }; }, { r: R });
    check('S2i: a second edit made while a save is on its way is never dropped — its save started at once, both land in order and the cloud and the screen hold both edits, nothing said refused: in the window (16,000 and 44) and once the read is in (17,000 and 55)',
      inWin4 && w4.ok1 && w4.ok2 && c4.revenue === 16000 && c4.visits === 44 && w4.mem.r === 16000 && w4.mem.rv === 44 && after4.r === 16000 && after4.rv === 44
        && r5.ok3 && r5.ok4 && c5.revenue === 17000 && c5.visits === 55 && after5.r === 17000 && after5.rv === 55 && !r5.toasts.some(t => /another device/i.test(t)) && !r5.bar,
      { inWin4, window: Object.assign({ cloud: { r: c4.revenue, rv: c4.visits }, afterRound: after4 }, w4), afterRead: Object.assign({ cloud: { r: c5.revenue, rv: c5.visits }, afterRound: after5 }, r5) });
    // no answer from the cloud within 12 s (the first save may still land): the second save, started while the first is
    // still on its way, lands on top of it when the cloud answers — the first's text is this phone's own (on 7256c04: refused)
    holdReads(P2.label, k => k === 'targets');
    const r6 = await P2.ev(async o => { window.__um.toasts.length = 0; targets[o.r].revenue = 18000; const a = await persistTold('targets');
      targets[o.r].visits = 66; window.__s6 = persistTold('targets');
      return { ok5: a.ok, timeout: !!(a.outcome && a.outcome.timeout), toasts: window.__um.toasts.slice() }; }, { r: R });
    await sleep(300); releaseReads(P2.label);
    const r6b = await P2.ev(async o => { const b = await window.__s6; await new Promise(r => setTimeout(r, 300)); const t = targets[o.r] || {};
      return { ok6: b.ok, mem: { r: t.revenue, rv: t.visits }, toasts: window.__um.toasts.slice(), bar: (document.getElementById('refusedPill') || {}).textContent || '' }; }, { r: R });
    const c6 = doc('targets')[R] || {};
    check('S2j: no answer within 12 s (told as such: the screen says "No answer from the cloud yet"), and the second edit\'s save, started while the first was still on its way, lands on top of it when the cloud answers — the cloud and the screen hold both (18,000 and 66), nothing said refused',
      !r6.ok5 && r6.timeout && r6b.ok6 && c6.revenue === 18000 && c6.visits === 66 && r6b.mem.r === 18000 && r6b.mem.rv === 66 && !r6b.toasts.some(t => /another device/i.test(t)) && !r6b.bar,
      Object.assign({ cloud: { r: c6.revenue, rv: c6.visits } }, r6, r6b));
    // the other order (a guard — it held on 7256c04 too): the first save's answer is late, the second lands first; when the
    // first then reaches the cloud it writes nothing over the second (an earlier save never writes over a later one)
    let firstHeld = 0;
    holdReads(P2.label, k => k === 'targets' && firstHeld++ === 0);
    const r7 = await P2.ev(async o => { window.__um.toasts.length = 0; targets[o.r].revenue = 19000; const a = await persistTold('targets'); targets[o.r].visits = 77; const b = await persistTold('targets');
      return { ok7: a.ok, timeout: !!(a.outcome && a.outcome.timeout), ok8: b.ok }; }, { r: R });
    const c7a = doc('targets')[R] || {};
    releaseReads(P2.label);
    await sleep(500);
    const c7 = doc('targets')[R] || {};
    const r7b = await P2.ev(o => { const t = targets[o.r] || {}; return { mem: { r: t.revenue, rv: t.visits }, toasts: window.__um.toasts.slice(), bar: (document.getElementById('refusedPill') || {}).textContent || '' }; }, { r: R });
    check('S2k: the first save\'s answer late, the second landed first: when the first reaches the cloud it writes nothing over the second (19,000 and 77 stay), nothing said refused (a guard)',
      !r7.ok7 && r7.timeout && r7.ok8 && c7a.revenue === 19000 && c7a.visits === 77 && c7.revenue === 19000 && c7.visits === 77 && r7b.mem.r === 19000 && r7b.mem.rv === 77 && !r7b.toasts.some(t => /another device/i.test(t)) && !r7b.bar,
      Object.assign({ cloudBefore: { r: c7a.revenue, rv: c7a.visits }, cloud: { r: c7.revenue, rv: c7.visits } }, r7, r7b));
    await done(P2); await done(L2);
  }

  // =====================================================================================================
  // S3 — the window is never taken for a cloud read (the supervisor's phone; the sign-in confirmed, the start's reads held)
  // =====================================================================================================
  if(want('S3')){
    // a clinic without a name (the August restore's placeholder) and a doctor a visit met whom the clinic no longer lists
    const host = SMALL.data.clinics.find(c => c.rep === M && (c.doctors || []).length >= 1);
    seed(SMALL, docs => {
      const cl = parse(docs.clinics); cl.push({ id: 'c-nameless', name: '⚠️ Restored clinic — rename me', rep: M, cls: 'B', doctors: [] }); docs.clinics = JSON.stringify(cl);
      const lv = parse(docs.visits); lv.push({ id: 'v-nameless', date: SMALL.today, ts: Date.parse(SMALL.now) - 7200000, rep: M, clinicId: 'c-nameless', clinicName: '', doctorIds: [], notes: 'a visit of the nameless clinic', products: [] });
      lv.push({ id: 'v-lostdoc', date: SMALL.today, ts: Date.parse(SMALL.now) - 5400000, rep: M, clinicId: host.id, clinicName: host.name, doctorIds: ['d-lost'], doctorNames: { 'd-lost': 'Dr. Lost Example' }, notes: 'met a doctor the clinic no longer lists', products: [] });
      docs.visits = JSON.stringify(lv);
    });
    const D = await mkDevice('S3-sup');
    await D.firstOpen(G);
    // a delete this phone holds (the log lost it on an older app) long enough to be settled by a read of the list
    const goneId = 'c-gone-long-ago', at = Date.parse(SMALL.now) - 10 * 86400000;
    await D.ev(o => { const t = JSON.parse(localStorage.getItem('um_tombs') || '{}'); t.clinics = Object.assign({}, t.clinics || {}, { [o.id]: o.at }); localStorage.setItem('um_tombs', JSON.stringify(t));
      const h = JSON.parse(localStorage.getItem('um_tombsHeldAt') || '{}'); h.clinics = Object.assign({}, h.clinics || {}, { [o.id]: Date.now() - 600000 }); localStorage.setItem('um_tombsHeldAt', JSON.stringify(h));
      localStorage.removeItem('um_snapDay'); localStorage.removeItem('um_snapFail'); }, { id: goneId, at });
    // today's backup not taken yet; the factory KPI settings document gone from the cloud (the supervisor's phone writes it — after a read only)
    cloud.delete('snap_' + today); cloud.delete('benchmarks');
    const backups = [...cloud.keys()].filter(k => /^snap_/.test(k)).sort(), aBackup = backups[backups.length - 1].slice(5);
    const t0 = Date.now();
    holdReads(D.label, k => !/^snap_/.test(k)); // the start's reads wait; a backup asked for by the Restore answers
    await D.restart({ hold: false });
    await D.page.waitForFunction(() => typeof _early !== 'undefined' && _early && _early.state === 'drawn' && _early.confirmed, null, { timeout: 8000 }).catch(() => {});
    const r = await D.ev(async o => {
      const out = { inWindow: typeof _early !== 'undefined' && !!_early && _early.state === 'drawn' && !_early.done, restore: [], recovery: [], deviceCopy: [], nameless: '', lost: '' };
      if(!out.inWindow) return out; // (no window: nothing to try)
      out.snapOk = snapshotReadOk(); out.snapWhy = snapshotBlockedWhy(); await maybeSnapshot();
      out.sales = salesCheckComplete(); out.visits = visitsComplete();
      window.__um.toasts.length = 0;
      await restoreSnapshotNow(o.day); out.restore = window.__um.toasts.slice();
      window.__um.toasts.length = 0;
      await openClinicRecovery(); out.recovery = window.__um.toasts.slice(); try{ closeModal(); }catch(e){}
      window.__um.toasts.length = 0; restoreDeviceClinics('mirror'); out.deviceCopy = window.__um.toasts.slice(); try{ closeModal(); }catch(e){}
      // the nameless clinic named after a clinic already listed; the lost doctor named after a doctor the clinic lists
      const existing = clinics.find(c => c && c.rep === 'Mariam' && c.id !== o.host);
      openNamelessClinics(); await nameNamelessClinic('c-nameless', existing.name, 'typed');
      out.nameless = (document.querySelector('#modalInner [data-nameless="c-nameless"]') || {}).textContent || ''; try{ closeModal(); }catch(e){}
      const host = clinics.find(c => c.id === o.host);
      openLostDoctors(o.host); await nameLostDoctor(o.host, 'd-lost', host.doctors[0].name, o.host, 'typed');
      out.lost = (document.querySelector('#modalInner [data-lostdoc="' + o.host + '|d-lost"]') || {}).textContent || ''; try{ closeModal(); }catch(e){}
      out.held = (_tombsHeld.clinics && _tombsHeld.clinics.has(o.gone)) || false;
      return out;
    }, { day: aBackup, host: host.id, gone: goneId });
    const winWrites = writesBy(D.label, t0).map(o => o.op + ' ' + o.k);
    releaseReads(D.label);
    await D.settled(); await D.tick(); await sleep(500); // (a held delete is settled by the read after the one that held it)
    const after = await D.ev(async o => {
      const out = { snapOk: snapshotReadOk(), sales: salesCheckComplete(), visits: visitsComplete() };
      await maybeSnapshot();
      const existing = clinics.find(c => c && c.rep === 'Mariam' && c.id !== o.host);
      openNamelessClinics(); await nameNamelessClinic('c-nameless', existing.name, 'typed');
      out.nameless = (document.querySelector('#modalInner [data-nameless="c-nameless"]') || {}).textContent || ''; try{ closeModal(); }catch(e){}
      return out;
    }, { host: host.id });
    const logAfter = doc('tombs') || {}, snapAfter = cloud.has('snap_' + today);
    check('S3a: the daily backup is never taken from the window (a list on screen is the phone\'s copy) — taken once the read is in',
      r.inWindow && !r.snapOk && r.snapWhy === 'copy' && !winWrites.some(w => /snap_/.test(w)) && after.snapOk && snapAfter, { inWindow: r.inWindow, snapOk: r.snapOk, why: r.snapWhy, after: after.snapOk, snapAfter });
    check('S3b: the whole-day Restore stops in the window, nothing changed', r.inWindow && r.restore.some(t => /^Restore stopped/.test(t)) && !winWrites.some(w => !/snap_/.test(w)), { said: r.restore, winWrites });
    check('S3c: salesCheckComplete and visitsComplete are false in the window, true once the read is in', r.inWindow && !r.sales && !r.visits && after.sales && after.visits, { window: [r.sales, r.visits], after: [after.sales, after.visits] });
    check('S3d: the nameless-clinic flow does not move visits from the window ("did not load on this device"), and asks once the read is in',
      r.inWindow && /did not load on this device/.test(r.nameless) && /is already in the list/.test(after.nameless), { window: r.nameless.slice(0, 160), after: after.nameless.slice(0, 160) });
    check('S3e: the lost-doctor flow does not move visits from the window ("did not load on this device")', r.inWindow && /did not load on this device/.test(r.lost), r.lost.slice(0, 200));
    check('S3f: the clinic-recovery sheets open only on a list read from the cloud (Find missing clinics, Restore from this phone\'s copy)',
      r.inWindow && r.recovery.some(t => /did not load from the cloud/.test(t)) && r.deviceCopy.some(t => /did not load from the cloud/.test(t)), { recovery: r.recovery, deviceCopy: r.deviceCopy });
    check('S3g: a delete this phone holds is not settled from the window (nothing goes to the log) — the read from the cloud settles it',
      r.inWindow && !winWrites.some(w => /tombs/.test(w)) && !!((logAfter.clinics || {})[goneId]), { winWrites, inLog: !!((logAfter.clinics || {})[goneId]) });
    check('S3h: the factory KPI settings are not written from the window — only once the read found no document',
      r.inWindow && !winWrites.some(w => /benchmarks/.test(w)) && cloud.has('benchmarks'), { winWrites, after: cloud.has('benchmarks') });
    await done(D);
  }

  // =====================================================================================================
  // S5 — a sign-in that has ended: the sign-in screen, the queue kept, uploaded after the next sign-in
  // =====================================================================================================
  for(const why of (want('S5') ? ['a password changed on another device', 'a login disabled'] : [])){
    seed(SMALL);
    const D = await mkDevice('S5-' + why.split(' ')[1], { expect: expectFor(SMALL, M) });
    await D.firstOpen(M);
    // a change saved with no signal, before the app was closed: it waits in the queue on the phone
    ctl.down.add(D.label);
    const q = await D.ev(async () => { tasks.push({ id: 'task-queued-offline', text: 'queued with no signal', done: false, created: todayStr(), rep: currentUser.name }); const r = await persistTold('tasks'); return { queued: outboxList().includes('tasks'), ok: r.ok }; });
    ctl.down.delete(D.label);
    await D.restart({ hold: true });
    const drew = await waitOwn(D);
    releaseAuth(D.label, 'ended');
    await D.page.waitForFunction(() => getComputedStyle(document.getElementById('gate')).display !== 'none', null, { timeout: 15000 }).catch(() => {});
    await sleep(300);
    const ended = await D.ev(() => ({ gate: getComputedStyle(document.getElementById('gate')).display !== 'none', app: getComputedStyle(document.getElementById('app')).display !== 'none', outbox: outboxList(),
      onPhone: (localStorage.getItem('um_mirror:tasks') || '').indexOf('task-queued-offline') >= 0, remembered: localStorage.getItem('um_lastUser'), toasts: window.__um.toasts.slice(), line: !!document.getElementById('copyLine') }));
    // she signs in again on the sign-in screen: the queue uploads
    await D.page.click(`#gateGrid .gate-tile:has-text("${M}")`);
    await D.page.waitForSelector('#gatePassword, #elEmail', { timeout: 15000 });
    if(await D.page.$('#elEmail')){ await D.page.fill('#elEmail', EMAIL[M]); await D.page.fill('#elPwd', 'invented-password'); } else await D.page.fill('#gatePassword', 'invented-password');
    await D.page.click('#modalInner button.btn');
    await D.page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Mariam' && _bootLoaded && !refreshRunning(), null, { timeout: 60000 });
    for(let i = 0; i < 2; i++) await D.tick();
    const up = (doc('tasks') || []).some(t => t && t.id === 'task-queued-offline');
    check(`S5 [${why}]: the sign-in ended while her copy was on screen: the sign-in screen shows, the queued change stays on the phone (said), the phone forgets her for the next start, and the change uploads after she signs in again`,
      q.queued && drew && ended.gate && !ended.app && ended.outbox.includes('tasks') && ended.onPhone && !ended.remembered && !ended.line && ended.toasts.some(t => /sign in again/i.test(t)) && up, { q, drew, ended, up });
    await done(D);
  }

  // =====================================================================================================
  // S6 — another person never sees this person's copy
  // =====================================================================================================
  if(want('S6')){
    const mariamOn = fr => fr.filter(f => f.app && (/Mariam|مريم/.test(f.greet) || f.who === M));
    // a) the phone remembers Mariam, but the session Firebase keeps on it is Renova's
    seed(SMALL);
    const A = await mkDevice('S6a', { expect: expectFor(SMALL, R) });
    await A.firstOpen(M);
    await A.ev(e => { localStorage.setItem('__fakefb_user', e); const k = Object.keys(localStorage).find(x => /^firebase:authUser:/.test(x)); if(k) localStorage.setItem(k, JSON.stringify({ uid: 'u-' + e, email: e })); }, EMAIL[R]);
    await A.restart({ hold: true });
    await sleep(2500);
    const fa0 = (await A.um()).frames;
    releaseAuth(A.label, 'ok');
    await A.settled(); await sleep(400);
    const fa = (await A.um()).frames, sa = await A.state();
    // …and her next start draws Renova's own copy (the phone remembers her now)
    await A.restart({ hold: true });
    const nextR = await waitEarly(A), sn = await A.state();
    const fn = (await A.um()).frames;
    releaseAuth(A.label, 'ok'); await A.settled();
    check('S6a: the phone remembers Mariam but Firebase keeps Renova\'s session: nothing of Mariam\'s copy is drawn (no early open), Renova\'s screen comes with her read — and her next start draws her own copy',
      !mariamOn(fa).length && !fa0.some(f => f.app) && sa.who === R && !fa.some(f => f.line) && nextR && sn.who === R && !mariamOn(fn).length, { mariamFrames: mariamOn(fa).length, appBeforeRead: fa0.some(f => f.app), who: sa.who, nextR, next: sn.who });
    await done(A);
    // b) Mariam's copy on screen, her sign-in ended; Renova signs in on the sign-in screen
    seed(SMALL);
    const B = await mkDevice('S6b');
    await B.firstOpen(M);
    await B.restart({ hold: true });
    const drewB = await waitEarly(B);
    releaseAuth(B.label, 'ended');
    await B.page.waitForFunction(() => getComputedStyle(document.getElementById('gate')).display !== 'none', null, { timeout: 15000 }).catch(() => {});
    const fb0 = (await B.um()).frames.length;
    await B.page.click(`#gateGrid .gate-tile:has-text("${R}")`);
    await B.page.waitForSelector('#gatePassword, #elEmail', { timeout: 15000 });
    if(await B.page.$('#elEmail')){ await B.page.fill('#elEmail', EMAIL[R]); await B.page.fill('#elPwd', 'invented-password'); } else await B.page.fill('#gatePassword', 'invented-password');
    await B.page.click('#modalInner button.btn');
    await B.page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Renova' && _bootLoaded && !refreshRunning(), null, { timeout: 60000 });
    await sleep(400);
    const fb = (await B.um()).frames.slice(fb0);
    check('S6b: Mariam\'s copy was on screen and her sign-in ended; Renova signs in on the sign-in screen: no frame shows Mariam\'s screen to her, and none is drawn from the copy for Renova (no line)',
      drewB && !mariamOn(fb).length && !fb.some(f => f.line) && fb.some(f => f.app && /Renova/.test(f.greet)), { drewB, mariamFrames: mariamOn(fb).slice(0, 2) });
    await done(B);
    // c) Mariam signs out; Renova signs in on the same page (no reload)
    seed(SMALL);
    const C = await mkDevice('S6c');
    await C.firstOpen(M);
    await C.ev(() => switchUser());
    const fc0 = (await C.um()).frames.length;
    await C.page.click(`#gateGrid .gate-tile:has-text("${R}")`);
    await C.page.waitForSelector('#gatePassword, #elEmail', { timeout: 15000 });
    if(await C.page.$('#elEmail')){ await C.page.fill('#elEmail', EMAIL[R]); await C.page.fill('#elPwd', 'invented-password'); } else await C.page.fill('#gatePassword', 'invented-password');
    await C.page.click('#modalInner button.btn');
    await C.page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Renova' && _bootLoaded && !refreshRunning(), null, { timeout: 60000 });
    await sleep(400);
    const fc = (await C.um()).frames.slice(fc0);
    const rem = await C.ev(() => localStorage.getItem('um_lastUser'));
    check('S6c: Mariam signs out and Renova signs in on the same phone: no frame shows Mariam\'s screen while Renova\'s loads; the phone remembers Renova now',
      !mariamOn(fc).length && fc.some(f => f.app && /Renova/.test(f.greet)) && /Renova/.test(rem || ''), { mariamFrames: mariamOn(fc).slice(0, 2), remembered: rem });
    await done(C);
    // d) Mariam's copy on screen and the sign-in not confirmed yet: she taps Sign out (the phone handed to Renova). The SDK
    // finishes its start first and tells it was Mariam's session, then the sign-out — that late word is not a sign-in
    seed(SMALL);
    const D6 = await mkDevice('S6d');
    await D6.firstOpen(M);
    await D6.restart({ hold: true });
    const drewD = await waitEarly(D6);
    await D6.ev(() => { try{ switchUser(); }catch(e){} });
    const ud0 = await D6.um(), fd0 = ud0.frames.length, la0 = ud0.loadAlls || 0;
    releaseAuth(D6.label, 'ok');
    await sleep(1500);
    const ud = await D6.um(), fd = ud.frames.slice(fd0), sd = await D6.state(), laAfter = (ud.loadAlls || 0) - la0;
    const remD = await D6.ev(() => localStorage.getItem('um_lastUser'));
    check('S6d: her copy on screen and the sign-in not yet confirmed, Mariam taps Sign out: when the SDK then tells it was her session, the sign-in screen stays — nothing of hers loaded or shown after the tap, the phone does not remember her',
      drewD && laAfter === 0 && !mariamOn(fd).length && sd.gate && !sd.app && !remD, { drewD, loadsAfterTap: laAfter, mariamFrames: mariamOn(fd).slice(0, 2), gate: sd.gate, app: sd.app, remembered: remD });
    await done(D6);
    // e) her copy on screen, the sign-in confirmed and the start's read on its way: she taps Sign out; when the read then
    // comes in, nothing of hers is drawn, the sign-in screen stays, and nothing goes wrong
    seed(SMALL);
    const E6 = await mkDevice('S6e');
    await E6.firstOpen(M);
    holdReads(E6.label);
    await E6.restart({ hold: false });
    await E6.page.waitForFunction(() => typeof _early !== 'undefined' && _early && _early.state === 'drawn' && _early.confirmed && refreshRunning(), null, { timeout: 8000 }).catch(() => {});
    const drewE = await E6.ev(() => typeof _early !== 'undefined' && !!_early && _early.state === 'drawn' && _early.confirmed && refreshRunning());
    await E6.ev(() => { try{ switchUser(); }catch(e){} });
    const fe0 = (await E6.um()).frames.length, er0 = E6.errors.length;
    { const pr = doc('products'); pr[0].price = (+pr[0].price || 0) + 1; put('products', pr); } // (the read brings something new: the catalog is taken)
    releaseReads(E6.label);
    await E6.page.waitForFunction(() => !refreshRunning(), null, { timeout: 15000 }).catch(() => {});
    await sleep(600);
    const fe = (await E6.um()).frames.slice(fe0), se = await E6.state(), errE = E6.errors.slice(er0);
    check('S6e: her copy on screen, the sign-in confirmed and the start\'s read on its way, Mariam taps Sign out: when the read comes in nothing of hers is drawn and nothing goes wrong — the sign-in screen stays',
      drewE && !mariamOn(fe).length && se.gate && !se.app && !errE.length, { drewE, mariamFrames: mariamOn(fe).slice(0, 2), gate: se.gate, app: se.app, errors: errE.slice(0, 3) });
    await done(E6);
  }

  // =====================================================================================================
  // P — the time to her own data and to the figures (a heavy year; a 4x phone on 4G, a laptop on wifi)
  // =====================================================================================================
  if(want('P')){
    const HEAVY = fixture.build({ scale: +process.env.HEAVY_SCALE || 1 });
    const profs = (process.env.PROFILES || 'phone,laptop').split(',');
    const rows = [];
    for(const profName of profs) for(const who of [M, G]){
      seed(HEAVY);
      NET = NETS[profName]; link.down = link.up = Date.now(); cloudSetup = null;
      const D = await mkDevice(`P-${profName}-${SHORT(who)}`, { profile: profName, F: HEAVY, expect: expectFor(HEAVY, who) });
      await D.firstOpen(who);
      const first = await D.um();
      // the next morning: the same device; its sign-in confirmed after the sign-in service's round trips
      link.down = link.up = Date.now(); cloudSetup = null;
      const t0 = Date.now();
      await D.restart({ hold: false });
      await D.settled(); await D.ev(() => msWhenReady());
      await D.page.waitForFunction(() => window.__um.marks.upToDate != null && window.__um.marks.ownVisible != null, null, { timeout: 60000 }).catch(() => {});
      await sleep(500);
      const u = await D.um(), m = u.marks, c = await D.ev(() => window.__umConfirmAt);
      const salesEnd = (u.timeline.filter(x => x[0] === 'loadErpSales' && (m.loadAllStart == null || x[1] >= m.loadAllStart - 1))[0] || [])[2];
      rows.push({ prof: profName, who, own: ownPainted(u), figures: m.figuresVisible, upToDate: m.upToDate, confirm: c != null ? Math.round(c) : null, loadAllStart: m.loadAllStart, firstOwn: ownPainted(first) });
      check(`P1 [${profName}, ${SHORT(who)}]: the daily open draws her own data without waiting for the start's cloud read (own data ${m.ownDom} ms, the start took its sales files from the cloud at ${salesEnd} ms)`,
        m.ownDom != null && salesEnd != null && m.ownDom < salesEnd, { ownDom: m.ownDom, salesEnd });
      check(`P2 [${profName}, ${SHORT(who)}]: the figures are drawn from the copy before the start takes its lists from the cloud (figures ${m.figures} ms, the sales files taken at ${salesEnd} ms)`,
        m.figures != null && salesEnd != null && m.figures < salesEnd, { figures: m.figures, salesEnd });
      check(`P3 [${profName}, ${SHORT(who)}]: the first open (no copy on the phone) is as before: nothing drawn before its read, no line`,
        first.marks.ownDom != null && first.marks.loadAllStart != null && first.marks.ownDom > first.marks.loadAllStart && !first.frames.some(f => f.line), { first: first.marks });
      await done(D);
      NET = null;
    }
    console.log('\nthe daily open, ms from the navigation start (own data shown / figures shown / up to date; the sign-in confirmed at):');
    rows.forEach(r => console.log(`  ${r.prof.padEnd(6)} ${SHORT(r.who).padEnd(7)} ${String(r.own).padStart(6)} / ${String(r.figures).padStart(6)} / ${String(r.upToDate).padStart(6)}   (sign-in confirmed ${r.confirm}, read began ${r.loadAllStart}; first open's own data ${r.firstOwn})`));
  }

  // =====================================================================================================
  // AL — the alerts center in the early open's window (alerts-v126): nothing of the alerts between the copy's screen and
  // the start's read; what a card rests on is said; nothing claims the cloud
  // =====================================================================================================
  if(want('AL')){
    seed(SMALL);
    const D = await mkDevice('AL-rep', { expect: expectFor(SMALL, M) });
    await D.firstOpen(M);
    const copyAt = await D.ev(() => { try{ return JSON.parse(localStorage.getItem('um_copyAt')).at; }catch(e){ return null; } });
    await D.restart({ hold: true });
    const drew = await waitEarly(D) && await waitOwn(D);
    await D.ev(() => msWhenReady()); await sleep(1500);   // the copy's figures painted, and a moment for anything that would follow them
    const bell = () => D.ev(() => { const b = document.getElementById('alertsBellN'); return b && !b.hidden ? b.textContent : ''; });
    const w1 = await D.ev(() => ({ calls: window.__um.alerts.length, held: !!_early && _early.state === 'drawn' && !_cloudRead }));
    const badge1 = await bell();
    const lineTime = await D.ev(at => { try{ return copyTimeText(at); }catch(e){ return null; } }, copyAt);
    // what the sheet says, read as a person reads it (a tap on the bell)
    const readSheet = () => D.ev(async () => {
      window.__umTap = true; try{ openAlerts(); } finally { window.__umTap = false; }
      await new Promise(r => setTimeout(r, 200));
      const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '', box = document.getElementById('alertsCenter');
      const out = { sub: txt(document.querySelector('#modalInner .al-sub')), all: txt(document.getElementById('modalInner')), empty: box ? txt(box.querySelector('.al-empty')) : null,
        cards: box ? [...box.querySelectorAll('.al-card:not(.al-off)')].map(c => ({ id: c.dataset.alId, type: c.dataset.alType, why: [...c.querySelectorAll('.al-why > div')].map(txt) })) : [] };
      closeModal(); return out; });
    const win = await readSheet();
    const DATA_TYPES = /^(overdue|missed|request|noActivity|target|drop)$/, CLAIM = /up to date|synced|\buploaded\b|(?:is|are) in the cloud|reached the cloud|Nothing needs attention right now/i;
    const basisLine = "From this phone's copy, saved " + lineTime + ' — updating from the cloud.';
    const dataCards = win.cards.filter(c => DATA_TYPES.test(c.type) || /^photos-/.test(c.id));   // (the visit photo cards are made from the visits list too: alerts review F8)
    releaseAuth(D.label, 'ok');
    await D.settled(); await D.ev(() => msWhenReady()); await D.ev(() => typeof alertsWhenReady === 'function' ? alertsWhenReady().then(() => 1) : 1); await sleep(600);
    const u = await D.um(), badge2 = await bell();
    const aft = await readSheet();
    const auto = u.alerts.filter(x => !x.tap), firstAuto = auto.length ? auto[0].t : null;
    check('AL1: in the early open\'s window (her copy drawn, the sign-in held) the bell works nothing out by itself and shows no number — nothing of the alerts between the copy\'s screen and the start\'s read',
      drew && w1.held && w1.calls === 0 && badge1 === '', { drew, inWindow: w1, badge: badge1 });
    check(`AL2: the sheet opened in the window says it is this phone's copy, saved ${lineTime} (the line's words and the copy's own time), every card the lists make says so (${dataCards.length} cards), and nothing claims the cloud`,
      drew && win.sub.indexOf("This phone's copy, saved " + lineTime + ' — updating from the cloud…') >= 0 && dataCards.length > 0 && dataCards.every(c => c.why[c.why.length - 1] === basisLine) && !CLAIM.test(win.all),
      { sub: win.sub, lineTime, cards: win.cards.map(c => [c.id, c.why.slice(-1)[0]]), claim: (win.all.match(CLAIM) || [])[0] || null });
    check('AL3: once the read is in, the bell has its number — worked out after the start\'s read had ended — and no card speaks of a copy',
      badge2 !== '' && +badge2 === aft.cards.length && firstAuto != null && u.marks.loadAllEnd != null && firstAuto >= u.marks.loadAllEnd && !aft.cards.some(c => c.why.some(l => /this phone's copy/i.test(l))) && aft.sub.indexOf("This phone's copy") < 0,
      { badge: badge2, cards: aft.cards.length, firstAuto, loadAllEnd: u.marks.loadAllEnd, auto: auto.slice(0, 4), sub: aft.sub });
    await done(D);
  }

  console.log('\n' + results.join('\n'));
  if(allErrors.length) console.log('page errors:\n' + allErrors.slice(0, 12).join('\n'));
  check('no page errors', !allErrors.length, allErrors.slice(0, 6));
  console.log(results[results.length - 1]);
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED'); // the words tests/e2e/run-all.js reads
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
