// Review 2 of the speed change (v126, branch speed-v1, `git diff e3ce672..328e2bc`): checks that fail on 328e2bc.
// Each check says what a correct result is; the review's report (scratchpad/handover/speed-review-2.md) gives the
// scenario, the code and the fix.
//   V1  a visit another device moved from September to 1 October (its save landed whole, index included) stays in the
//       cloud at its corrected date when this phone, whose copy is from before the move, saves an edit of another visit
//       in the early open's window (its copy on screen, the sign-in not yet confirmed)
//   V2  the same when the edit is saved just after the sign-in is confirmed, while the start's read of the past months
//       is still on its way
//   V3  the same for a visit moved from October into the running month (the live document)
//   V4  the edit of one visit saved in the window writes only the documents that hold what it changed (here October),
//       not every past month the phone holds
//   V5  nothing held: the daily open as it comes (the past months over a phone's link) and the edit saved the moment
//       her visits are on screen — the moved visit stays where the other device put it (on v125 the screen shows her
//       visits only once the start's read is in)
//   H1  the supervisor viewed Mariam's screen, signed out, and Mariam signs in on the same page: no painted frame of her
//       screen says "Viewing: … · Back to the team" or greets the supervisor
//   H2  Mariam signs out while her start's read is on its way and Renova signs in on the sign-in screen before that read
//       is in: when it comes in, Renova's own screen is drawn — not left covered until the next 20-second round
// The sign-in is the app's own (03-gate.js) over a stand-in for the Firebase SDK that keeps its session on the phone and
// confirms it only when the harness says (as in speed-open.e2e.js); the cloud is a fake in Node; the clock is fixed; the
// 20-second round is driven by hand. Invented data (fixtures/heavy-year.js, scale 0.1). Port 8293. ONLY=V1,V2,… runs a subset.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts } = require('./_env.js');
const PORT = 8293;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const fixture = require('./fixtures/heavy-year.js');
const SMALL = fixture.build({ scale: 0.1 });
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
const EMAIL = { [M]: 'mariam@example.com', [R]: 'renova@example.com', [G]: 'ghaith@example.com' };
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  -> ' + JSON.stringify(info).slice(0, 900) : '')); if(!ok) failed++; }

// ---------- the site ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); }); });

// ---------- the fake cloud: key → { value, updated }, shared by every device ----------
let cloud = new Map();
function seed(F){ cloud = new Map(Object.entries(F.docs).filter(([, v]) => v != null).map(([k, v]) => [k, { value: v, updated: Date.parse(F.now) - 3600000 }])); }
const doc = k => cloud.has(k) ? parse(cloud.get(k).value) : null;
const ops = []; // { who, op, k, t }
// hold: label → { test(key, kind), p, release } — kind 'get' (a plain read) or 'tx' (a transaction's read)
const ctl = { hold: new Map(), slow: new Map() }; // slow: label → { test(key, kind), ms } (a phone's link: those reads take ms)
function holdReads(label, test){ let release; const p = new Promise(r => { release = r; }); ctl.hold.set(label, { test: test || (() => true), p, release }); }
function releaseReads(label){ const h = ctl.hold.get(label); ctl.hold.delete(label); if(h) h.release(); }
async function heldFor(who, k, kind){ const h = ctl.hold.get(who); if(h && h.test(k, kind)) await h.p; const s = ctl.slow.get(who); if(s && s.test(k, kind)) await sleep(s.ms); }
const locks = {};
async function lockKey(k){ const prev = locks[k] || Promise.resolve(); let release; const mine = new Promise(r => { release = r; }); locks[k] = prev.then(() => mine); await prev; const tm = setTimeout(release, 30000); return () => { clearTimeout(tm); release(); }; }
const held = {}; let txSeq = 0;
const api = {
  async get(who, k, kind){ ops.push({ who, op: 'get', k, t: Date.now() }); await heldFor(who, k, kind || 'get'); const d = cloud.get(k); return d ? { exists: true, value: d.value, updated: d.updated } : { exists: false }; },
  async set(who, k, v){ ops.push({ who, op: 'set', k, t: Date.now() }); cloud.set(k, { value: v, updated: Date.now() }); return true; },
  async del(who, k){ ops.push({ who, op: 'del', k, t: Date.now() }); cloud.delete(k); return true; },
  async commit(who, entries){ ops.push({ who, op: 'commit', k: entries.map(e => e[0]).join(','), t: Date.now() }); entries.forEach(([k, v]) => cloud.set(k, { value: v, updated: Date.now() })); return true; },
  async query(who, q){ ops.push({ who, op: 'query', k: q.from || '', t: Date.now() });
    let keys = [...cloud.keys()].sort(); if(q.from != null) keys = keys.filter(k => k >= q.from); if(q.to != null) keys = keys.filter(k => k < q.to); if(q.after != null) keys = keys.filter(k => k > q.after); if(q.limit) keys = keys.slice(0, q.limit);
    return keys.map(k => ({ id: k, value: cloud.get(k).value, updated: cloud.get(k).updated })); },
  async txGet(who, k){ await heldFor(who, k, 'tx'); const release = await lockKey(k); const id = ++txSeq; held[id] = release; const d = await api.get(who, k, 'txread'); return { id, doc: d }; },
  async txEnd(who, id, k, v){ try{ if(v != null) await api.set(who, k, v); } finally { if(held[id]){ held[id](); delete held[id]; } } return true; },
  async signIn(who, email, pwd){ return !!pwd && Object.values(EMAIL).includes(String(email || '').toLowerCase()); },
};
const writesBy = (who, from) => ops.filter(o => o.who === who && o.op !== 'get' && o.op !== 'query' && (from == null || o.t >= from));
const visitDocs = () => [...cloud.keys()].filter(k => k === 'visits' || k.startsWith('visitsArch:'));
const findVisit = id => visitDocs().map(k => { const v = (doc(k) || []).find(x => x && x.id === id); return v ? k + '@' + v.date : null; }).filter(Boolean);

// ---------- the sign-in: when each device's saved session is confirmed ----------
const auth = {}; // label → { gate: promise, release, mode }
function holdAuth(label){ let release; const p = new Promise(r => { release = r; }); auth[label] = { gate: p, release, mode: 'ok' }; }
function releaseAuth(label, mode){ const a = auth[label]; if(!a) return; a.mode = mode || 'ok'; if(a.release) a.release(); }
async function confirmFor(label){ const a = auth[label]; if(a && a.gate) await a.gate; return a ? a.mode : 'ok'; }

// ---------- the Firebase stand-in (served at the SDK's addresses; as speed-open.e2e.js) ----------
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

// ---------- what each page records (before any page script) ----------
function initScript(arg){
  const off = arg.off;
  const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  const _si = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  const U = window.__um = { frames: [], toasts: [] };
  // every painted frame of the home screen: whose greeting, the supervisor's "Viewing:" chip, the app visible or covered
  const frame = () => {
    const app = document.getElementById('app'), hello = document.getElementById('msHello'), whose = document.getElementById('msWhose'), g = document.getElementById('greeting');
    const vis = el => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
    const shown = !!app && getComputedStyle(app).display !== 'none' && !document.body.classList.contains('um-cover');
    return { app: shown, hello: hello ? hello.textContent.trim() : '', whose: whose && vis(whose) ? whose.textContent.trim() : '', greet: g ? g.textContent : '',
      who: typeof currentUser !== 'undefined' && currentUser ? currentUser.name : null };
  };
  const loop = () => { try{ const f = frame(); const last = U.frames[U.frames.length - 1]; if(!last || JSON.stringify(last) !== JSON.stringify(f)) U.frames.push(f); }catch(e){} requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  document.addEventListener('DOMContentLoaded', () => { const st = window.showToast; if(typeof st === 'function') window.showToast = function(m, ms){ U.toasts.push(String(m)); return st.apply(this, arguments); }; });
}

// ---------- a device ----------
let browser;
async function mkDevice(label){
  const F = SMALL;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Kuwait' });
  await ctx.route(/^https?:\/\/(?!localhost[:/])/, route => {
    const url = route.request().url();
    if(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|firestore|auth)-compat\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: /auth-compat/.test(url) ? FAKE_FB : '/* stand-in */' });
    if(/fonts\.googleapis\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts stand-in */' });
    return route.abort();
  });
  const errors = [];
  for(const [n, fn] of Object.entries({ __fbGet: k => api.get(label, k), __fbSet: (k, v) => api.set(label, k, v), __fbDel: k => api.del(label, k), __fbCommit: e => api.commit(label, e), __fbQuery: q => api.query(label, q),
    __fbTxGet: k => api.txGet(label, k), __fbTxEnd: (id, k, v) => api.txEnd(label, id, k, v), __fbSignIn: (e, p) => api.signIn(label, e, p), __fbConfirm: () => confirmFor(label) })) await ctx.exposeFunction(n, fn);
  await ctx.addInitScript(initScript, { off: Date.parse(F.now) - Date.now() });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  const ev = (fn, a) => page.evaluate(fn, a);
  const signInOnGate = async who => {
    await page.waitForSelector('#gateGrid .gate-tile', { timeout: 60000 });
    await page.click(`#gateGrid .gate-tile:has-text("${who}")`);
    const pw = await Promise.race([page.waitForSelector('#elEmail', { timeout: 30000 }).then(() => 'email'), page.waitForSelector('#gatePassword', { timeout: 30000 }).then(() => 'pw')]);
    if(pw === 'email'){ await page.fill('#elEmail', EMAIL[who]); await page.fill('#elPwd', 'invented-password'); }
    else await page.fill('#gatePassword', 'invented-password');
    await page.click('#modalInner button.btn');
    await page.waitForFunction(w => typeof currentUser !== 'undefined' && currentUser && currentUser.name === w && _bootLoaded && !refreshRunning(), who, { timeout: 120000, polling: 100 });
  };
  const D = { label, ctx, page, ev, errors,
    goto: async () => { await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'commit' }); await page.waitForFunction(() => document.readyState !== 'loading', null, { timeout: 60000 }); },
    settled: () => page.waitForFunction(() => typeof _bootLoaded !== 'undefined' && _bootLoaded && typeof refreshRunning === 'function' && !refreshRunning() && !_flushing && !_visitsSaving, null, { timeout: 120000, polling: 100 }),
    // a new device: the sign-in screen, the start read from the cloud, the phone's copy written and marked whole
    async firstOpen(who){ auth[label] = null; await D.goto(); await signInOnGate(who); await D.settled(); await ev(() => msWhenReady()); await sleep(300); },
    signInOnGate,
    // the same device again (the app opened the next morning): the sign-in confirmed when the harness says
    async restart(o){ o = o || {}; if(o.hold) holdAuth(label); else auth[label] = null; await D.goto(); },
    tick: async () => { await page.waitForFunction(() => typeof _flushing === 'undefined' || !_flushing, null, { timeout: 60000 }); await ev(async () => { await window.__bgTick(); }); await ev(() => msWhenReady()); },
  };
  return D;
}
const waitEarly = (D, ms) => D.page.waitForFunction(() => typeof _early !== 'undefined' && !!_early && _early.state === 'drawn', null, { timeout: ms || 8000, polling: 50 }).then(() => true, () => false);

(async () => {
  await new Promise(r => server.listen(PORT, r));
  browser = await chromium.launch(launchOpts());
  const allErrors = [];
  const done = D => { allErrors.push(...D.errors); return D.ctx.close().catch(() => {}); };
  const live0 = parse(SMALL.docs.visits), sep0 = parse(SMALL.docs['visitsArch:2026-09']), oct0 = parse(SMALL.docs['visitsArch:2026-10']);
  const pick = (arr, not) => arr.find(v => v && v.rep === M && !v.callOnly && !(v.photos || []).length && !(not || []).includes(v.id));

  // =====================================================================================================
  // V1–V4: a visit another device moved between documents since this phone's copy; this phone saves an edit of
  // another visit before the start's read of the visits is in (the early open's window, or the start's read itself)
  // =====================================================================================================
  const moveCase = async (id, o) => {
    seed(SMALL);
    const P = await mkDevice(id + '-phone'), L = await mkDevice(id + '-laptop');
    await P.firstOpen(M);
    await L.firstOpen(M);
    const X = o.from === 'sep' ? pick(sep0) : pick(oct0), Y = pick(oct0, [X.id]);
    // the laptop corrects X's date (Edit visit) and its save lands whole — every document and the index
    const moved = await L.ev(async a => { const v = visits.find(x => x.id === a.x); v.date = a.to; v.editedBy = 'Mariam'; v.editedAt = Date.now(); const r = await persistTold('visits'); return r.ok; }, { x: X.id, to: o.to });
    const before = findVisit(X.id);
    await done(L);
    const t0 = Date.now();
    await P.restart({ hold: true });
    const drew = o.when === 'shown' ? null : await waitEarly(P);
    const edit = a => { const v = visits.find(x => x.id === a.y); v.notes = (v.notes || '') + ' [edited on the phone]'; window.__save = persistTold('visits'); return true; };
    let started = false;
    if(o.when === 'shown'){
      // nothing held: the daily open as it comes, the past months over a phone's link (each read ~0.6 s); the edit is
      // saved the moment her own visits are on screen (on v125 that is after the start's read)
      ctl.slow.set(P.label, { test: (k, kind) => kind === 'get' && /^visitsArch:/.test(k), ms: 600 });
      releaseAuth(P.label, 'ok');
      await P.page.waitForFunction(a => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Mariam' && Array.isArray(visits) && visits.some(v => v && v.id === a)
        && getComputedStyle(document.getElementById('app')).display !== 'none' && !document.body.classList.contains('um-cover'), Y.id, { timeout: 60000, polling: 25 }).catch(() => {});
      started = await P.ev(edit, { y: Y.id }).catch(() => false);
    } else if(o.when === 'window'){
      started = await P.ev(edit, { y: Y.id }).catch(() => false);
      releaseAuth(P.label, 'ok');
    } else {
      // the sign-in confirmed, the start's read of the past months on its way (plain reads of them held): the edit saved now
      holdReads(P.label, (k, kind) => kind === 'get' && /^visitsArch:/.test(k));
      releaseAuth(P.label, 'ok');
      await P.page.waitForFunction(() => typeof _early !== 'undefined' && _early && _early.confirmed && typeof refreshRunning === 'function' && refreshRunning(), null, { timeout: 15000, polling: 50 }).catch(() => {});
      await sleep(300);
      started = await P.ev(edit, { y: Y.id }).catch(() => false);
      await sleep(300);
    }
    const out = started ? await P.ev(async () => { const r = await window.__save; return { ok: r.ok }; }) : { ok: false };
    releaseReads(P.label); ctl.slow.delete(P.label);
    await P.settled(); await P.tick(); await sleep(300);
    const where = findVisit(X.id), yNotes = ((doc('visitsArch:2026-10') || []).find(v => v.id === Y.id) || {}).notes || '';
    const shown = await P.ev(a => { const v = (visits || []).find(x => x && x.id === a); return v ? v.date : null; }, X.id);
    const wrote = [...new Set(writesBy(P.label, t0).map(w => w.k).filter(k => /^visitsArch:/.test(k)))].sort();
    await done(P);
    return { X, Y, moved, before, drew, out, where, yEdited: /edited on the phone/.test(yNotes), shown, wrote };
  };
  if(want('V1') || want('V4')){
    const r = await moveCase('V1', { from: 'sep', to: '2026-10-01', when: 'window' });
    if(want('V1')) check('V1: a visit another device moved from September to 1 October stays in the cloud (and on screen) at its corrected date after this phone saves an edit of another visit in the early open\'s window — expected only visitsArch:2026-10@2026-10-01',
      r.moved && r.drew && r.out.ok && r.yEdited && r.where.length === 1 && r.where[0] === 'visitsArch:2026-10@2026-10-01' && r.shown === '2026-10-01',
      { movedOnLaptop: r.moved, cloudBefore: r.before, drewInWindow: r.drew, saved: r.out.ok, otherEditLanded: r.yEdited, where: r.where, shownOnPhone: r.shown });
    if(want('V4')) check(`V4: the edit of one October visit saved in the window writes only the document that holds it (October), not every past month the phone holds — it wrote ${r.wrote.length}`,
      r.out.ok && r.wrote.length <= 1 && (!r.wrote.length || r.wrote[0] === 'visitsArch:2026-10'), { saved: r.out.ok, archiveDocsWritten: r.wrote });
  }
  if(want('V2')){
    const r = await moveCase('V2', { from: 'sep', to: '2026-10-01', when: 'read' });
    check('V2: …the same when the edit is saved just after the sign-in is confirmed, while the start\'s read of the past months is still on its way — expected only visitsArch:2026-10@2026-10-01',
      r.moved && r.drew && r.out.ok && r.yEdited && r.where.length === 1 && r.where[0] === 'visitsArch:2026-10@2026-10-01' && r.shown === '2026-10-01',
      { movedOnLaptop: r.moved, cloudBefore: r.before, saved: r.out.ok, otherEditLanded: r.yEdited, where: r.where, shownOnPhone: r.shown, archiveDocsWritten: r.wrote.length });
  }
  if(want('V5')){
    const r = await moveCase('V5', { from: 'sep', to: '2026-10-01', when: 'shown' });
    check('V5: nothing held — the daily open as it comes (the past months over a phone\'s link) and the edit saved the moment her visits are on screen: the visit another device moved stays at its corrected date (on v125 her visits show only once the start\'s read is in) — expected only visitsArch:2026-10@2026-10-01',
      r.moved && r.out.ok && r.yEdited && r.where.length === 1 && r.where[0] === 'visitsArch:2026-10@2026-10-01' && r.shown === '2026-10-01',
      { movedOnLaptop: r.moved, saved: r.out.ok, otherEditLanded: r.yEdited, where: r.where, shownOnPhone: r.shown, archiveDocsWritten: r.wrote.length });
  }
  if(want('V3')){
    const r = await moveCase('V3', { from: 'oct', to: '2026-11-02', when: 'window' });
    check('V3: a visit another device moved from October into the running month (2 November) stays in the live document at its corrected date after this phone saves an edit in the window — expected only visits@2026-11-02',
      r.moved && r.drew && r.out.ok && r.yEdited && r.where.length === 1 && r.where[0] === 'visits@2026-11-02' && r.shown === '2026-11-02',
      { movedOnLaptop: r.moved, cloudBefore: r.before, saved: r.out.ok, otherEditLanded: r.yEdited, where: r.where, shownOnPhone: r.shown });
  }

  // =====================================================================================================
  // H1: the supervisor's frame of Mariam's screen is not shown to Mariam when she signs in on the same page
  // =====================================================================================================
  if(want('H1')){
    seed(SMALL);
    const D = await mkDevice('H1');
    await D.firstOpen(G);
    await D.ev(async () => { switchView('today'); msOpenPerson('Mariam'); await msWhenReady(); });
    await sleep(400);
    const sup = await D.ev(() => ({ whose: (document.getElementById('msWhose') || {}).textContent || '', hello: (document.getElementById('msHello') || {}).textContent || '' }));
    await D.ev(() => switchUser());
    await sleep(300);
    const f0 = (await D.ev(() => window.__um.frames.length));
    await D.signInOnGate(M);
    await D.ev(() => msWhenReady()); await sleep(600);
    const frames = (await D.ev(() => window.__um.frames.slice())).slice(f0).filter(f => f.app && f.who === M);
    const bad = frames.filter(f => /Viewing:|Back to the team/.test(f.whose) || /Ghaith/.test(f.hello));
    check('H1: the supervisor viewed Mariam\'s screen and signed out; Mariam signs in on the same page — no frame shown to her says "Viewing: … · Back to the team" or greets the supervisor',
      /Viewing:/.test(sup.whose) && frames.length > 0 && !bad.length, { supervisorFrame: sup, framesShownToMariam: frames.length, bad: bad.slice(0, 3) });
    await done(D);
  }

  // =====================================================================================================
  // H2: Mariam signs out while her start's read is on its way, and Renova signs in on the sign-in screen before that
  // read is in: when it comes in, Renova's own screen is drawn (not left covered)
  // =====================================================================================================
  if(want('H2')){
    seed(SMALL);
    const D = await mkDevice('H2');
    await D.firstOpen(M);
    holdReads(D.label); // the start's reads wait (a slow link)
    await D.restart({ hold: false });
    // her sign-in confirmed and her start's read on its way (on 328e2bc after the early open drew her copy; on v125 without it)
    await D.page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Mariam' && typeof refreshRunning === 'function' && refreshRunning()
      && (typeof _early === 'undefined' || !_early || _early.confirmed), null, { timeout: 15000, polling: 50 }).catch(() => {});
    const inRead = await D.ev(() => typeof currentUser !== 'undefined' && !!currentUser && currentUser.name === 'Mariam' && refreshRunning());
    await D.ev(() => { try{ switchUser(); }catch(e){} });
    await sleep(300);
    // Renova signs in on the sign-in screen while that read is still held
    await D.page.click(`#gateGrid .gate-tile:has-text("${R}")`);
    const pw = await Promise.race([D.page.waitForSelector('#elEmail', { timeout: 15000 }).then(() => 'email'), D.page.waitForSelector('#gatePassword', { timeout: 15000 }).then(() => 'pw')]);
    if(pw === 'email'){ await D.page.fill('#elEmail', EMAIL[R]); await D.page.fill('#elPwd', 'invented-password'); } else await D.page.fill('#gatePassword', 'invented-password');
    await D.page.click('#modalInner button.btn');
    await D.page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && currentUser.name === 'Renova', null, { timeout: 15000, polling: 50 }).catch(() => {});
    await sleep(300);
    releaseReads(D.label);
    await D.page.waitForFunction(() => typeof refreshRunning === 'function' && !refreshRunning(), null, { timeout: 30000, polling: 50 }).catch(() => {});
    await sleep(1500); // (no 20-second round: the screen must not wait for one)
    const s = await D.ev(() => ({ who: typeof currentUser !== 'undefined' && currentUser ? currentUser.name : null, covered: document.body.classList.contains('um-cover'),
      note: (document.getElementById('coverNote') || {}).textContent || '', greet: (document.getElementById('greeting') || {}).textContent || '',
      app: getComputedStyle(document.getElementById('app')).display !== 'none' }));
    check('H2: Mariam signs out while her start\'s read is on its way and Renova signs in before that read is in: once it comes in, Renova\'s own screen is drawn — not left covered ("Loading...") until the next 20-second round',
      inRead && s.who === R && s.app && !s.covered && /Renova/.test(s.greet), Object.assign({ inRead }, s));
    await done(D);
  }

  console.log(results.join('\n'));
  if(allErrors.length) console.log('page errors:\n' + allErrors.slice(0, 10).join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED'); // the words tests/e2e/run-all.js reads
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
