// The 20-second round and the home screen's frames on a heavy year (the owner, 16 Nov: "astronomically fast, with
// no problems"). Invented data (fixtures/heavy-year.js: 300 clinics, 919 doctors, 3,631 visits, 20,903 sales lines,
// 300 chat messages, 45 memories), a fake cloud in Node (on the phone a 4G link: 150 ms round trip, 10 Mbit/s shared),
// a fixed clock moved by hand, the 20-second round driven by hand (window.__bgTick). PHONE = 390x844, CPU 4x slower
// (CDP); LAPTOP = 1440x900. Each check that measures a fix fails on 8f2dd7e (the start-up speed review's commit).
//   A  a round where nothing changed (1a)
//      R1  nothing is parsed, put together, written to the phone's copies or drawn again; the figures are not worked
//          out again; chat and memories are not read (their screen is closed)
//      R2  the screen does not move: scroll, an open sheet, typed text and focus stay as they are
//      R3  an unchanged read still counts as a read from the cloud: the read flags the daily backup and the whole-day
//          Restore ask for, today's backup taken from it, a held delete it confirms published to the log
//      R4  a round that brings a teammate's visit puts it on screen
//      R5  the clock: the hour's greeting and figures follow the hour, "min ago" follows the minutes, a new day draws all
//   B  chat and memories (1b)
//      B1  a round with their screen closed reads neither; B2 with it open (either tab) every round reads both and shows
//          another phone's message; B3 with it closed, once TEAM_PACE_MS has passed since the last real read; B4 a start
//          on a phone that keeps their copy reads neither and draws at once — the Team screen shows the copy, then reads
//      B5  a new device: the first paint does not wait for them (slow reads); B6 the Team screen opened before they are
//          in says it is loading, never "Start the conversation"; B7 "Refresh messages" reads both, says "Up to date"
//   C  the home screen's frames after an ordinary change (3) — every painted frame is whole (one data state: the target
//      card's ring and remaining agree with its target and achieved, the day's visits figure with Recent Activity) and
//      none says "Calculating…" over an earlier whole frame: C1 a round brings a teammate's visit (the team), C2 this
//      phone's own save (a rep logs a visit and comes back), C3 targets saved in Admin over the home screen, C4 back to
//      the team from a person's screen. "Calculating…" stays only for a view with no earlier frame.
// Env: ONLY=A,B,C (phases)  PROFILES=phone,laptop  HEAVY_SCALE=x  WWW=<dir>  VERBOSE=1
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const PORT = 8284;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const PROFS = (process.env.PROFILES || 'phone,laptop').split(',');
const VERBOSE = process.env.VERBOSE === '1';
const FIX = require('./fixtures/heavy-year.js').build({ scale: +process.env.HEAVY_SCALE || 1 });
const CLOCK = Date.parse(FIX.now);
const SUP = 'Dr. Ghaith', REP = 'Mariam', MATE = 'Renova';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); }); });
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 900) : '')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const PROFILES = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4, net: { rtt: 150, down: 1.25e6 } },
  laptop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, cpu: 1, net: null } };
const table = []; // the round's figures, before / after

// ---- the fake cloud: key → stored string, shared by the phones, survives reloads ----
let cloud = new Map();
const resetCloud = () => { cloud = new Map(Object.entries(FIX.docs)); };
let NET = null; const link = { down: 0 };
async function netDown(bytes){ if(!NET) return; const start = Math.max(Date.now() + NET.rtt / 2, link.down); link.down = start + bytes * 1000 / NET.down; await sleep(link.down + NET.rtt / 2 - Date.now()); }
const acct = { reads: 0, bytes: 0, keys: {} };
const slow = {}; // key → ms every read of it takes (B5)
const SLOW_TEAM_MS = 5000; // B5: chat and memories answer this late (a first paint that waits for them comes after it)
let lock = Promise.resolve();
const api = {
  get: async k => { if(slow[k]) await sleep(slow[k]); const v = cloud.has(k) ? cloud.get(k) : null; await netDown((v ? v.length : 0) + 60); acct.reads++; acct.bytes += v ? v.length : 0; acct.keys[k] = (acct.keys[k] || 0) + 1; return v; },
  set: async (k, v) => { cloud.set(k, v); return true; },
  setMany: async e => { e.forEach(([k, v]) => cloud.set(k, v)); return true; },
  del: async k => { cloud.delete(k); return true; },
  list: async p => [...cloud.keys()].filter(k => k.startsWith(p)),
  acquire: async () => { let rel; const mine = new Promise(r => { rel = r; }); const prev = lock; lock = prev.then(() => mine); await prev; api._rel = rel; return true; },
  release: async () => { if(api._rel){ const r = api._rel; api._rel = null; r(); } return true; },
};
const resetAcct = () => { acct.reads = 0; acct.bytes = 0; acct.keys = {}; };

async function mkDevice(browser, profName, label){
  const prof = PROFILES[profName];
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, locale: 'en-US', timezoneId: 'Asia/Kuwait' });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push(label + ' console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.accept().catch(() => {}));
  for(const [n, f] of Object.entries({ __cGet: api.get, __cSet: api.set, __cDel: api.del, __cList: api.list, __cSetMany: api.setMany, __cAcq: api.acquire, __cRel: api.release })) await page.exposeFunction(n, f);
  await page.addInitScript(({ clock, staff }) => {
    try{ if(!localStorage.getItem('ultramed_staff_cache')) localStorage.setItem('ultramed_staff_cache', staff); }catch(e){}
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
      setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
      update: async (k, fn) => { await window.__cAcq(); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRel(); } } };
    // the clock: fixed, moved by hand (sessionStorage __shift ms, kept across reloads)
    const shift = () => { try{ return +(sessionStorage.getItem('__shift') || 0) || 0; }catch(e){ return 0; } };
    const off = clock - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off + shift()); else super(...a); } static now(){ return _D.now() + off + shift(); } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    window.__shiftBy = ms => { sessionStorage.setItem('__shift', String(shift() + ms)); };
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    // what a round does: documents parsed (JSON.parse of a text over 4 KB), the phone's copies written, the screen drawn
    window.__w = { parses: 0, mirror: 0, renderAll: 0, msRun: 0, mut: 0 };
    const jp = JSON.parse; JSON.parse = function(s){ if(typeof s === 'string' && s.length > 4096) window.__w.parses++; return jp.apply(this, arguments); };
    const si = Storage.prototype.setItem; Storage.prototype.setItem = function(k){ if(/^um_mirror:/.test(String(k))) window.__w.mirror++; return si.apply(this, arguments); };
    document.addEventListener('DOMContentLoaded', () => {
      ['renderAll', 'msRun'].forEach(n => { const f = window[n]; if(typeof f === 'function') window[n] = function(){ window.__w[n]++; return f.apply(this, arguments); }; });
      new MutationObserver(ms => { window.__w.mut += ms.length; }).observe(document.getElementById('app'), { childList: true, subtree: true, characterData: true, attributes: true });
    });
    // the frames painted (C): read in each animation frame, just before it is painted
    window.__rec = { on: false, frames: [] };
    const num = sel => { const el = document.querySelector(sel); return el ? el.getAttribute('data-value') : null; };
    window.__frame = () => {
      const on = typeof activeView !== 'undefined' && activeView === 'today';
      const vk = (() => { try{ const v = msView(); return v ? v.kind : null; }catch(e){ return null; } })();
      const hero = vk === 'team' ? '#msSales' : '#targetCard';
      const rv = document.getElementById('recentVisits');
      return { on, view: vk, wait: on && !!document.querySelector('#view-today .ms-wait'),
        sales: num(hero + ' [data-ms="sales"]'), goal: num(hero + ' [data-ms="of-target"]'), pct: num(hero + ' [data-ms="achievement"]'), remaining: num(hero + ' [data-ms="remaining"]'),
        todayVisits: num('#msKpis [data-ms="today-visits"]'), recent: rv ? rv.textContent : '' };
    };
    const loop = () => { if(!window.__rec.on) return; window.__rec.frames.push(window.__frame()); requestAnimationFrame(loop); };
    window.__recStart = () => { window.__rec.frames = []; window.__rec.on = true; requestAnimationFrame(loop); };
    window.__recStop = () => { window.__rec.on = false; return window.__rec.frames; };
  }, { clock: CLOCK, staff: FIX.docs.staff });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  await cdp.send('Performance.enable');
  const busy = async () => { const m = {}; (await cdp.send('Performance.getMetrics')).metrics.forEach(x => { m[x.name] = x.value; }); return Math.round((m.TaskDuration || 0) * 1000); };
  const goto = async () => { await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForFunction(() => typeof selectUser === 'function'); };
  const boot = async (who, role) => { NET = prof.net; await goto(); await page.evaluate(async ({ who, role }) => { await selectUser(who, role); await msWhenReady(); }, { who, role }); await sleep(800); await page.evaluate(() => msWhenReady()); };
  // one 20-second round, measured: what it read, what it did, how long it took, the main thread's work
  const round = async () => {
    await page.waitForFunction(() => typeof _flushing === 'undefined' || !_flushing);
    resetAcct();
    const b0 = await busy();
    const r = await page.evaluate(async () => { Object.keys(window.__w).forEach(k => { window.__w[k] = 0; }); const t0 = performance.now(); await window.__bgTick(); const ms = performance.now() - t0; await msWhenReady();
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); return Object.assign({ ms: Math.round(ms), done: Math.round(performance.now() - t0) }, window.__w); });
    r.busy = (await busy()) - b0;
    r.reads = acct.reads; r.kb = Math.round(acct.bytes / 1024); r.team = Object.keys(acct.keys).filter(k => k === 'chat' || k === 'memories').sort();
    return r;
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  return { page, ctx, errors, boot, goto, round, ev, prof: profName };
}
const shiftClock = (D, ms) => D.ev(ms => window.__shiftBy(ms), ms);
const liveVisits = () => parse(cloud.get('visits')) || [];
// a field visit logged today on another phone (the visits document and the clinic's last visit / follow-up), as a save there writes them
function teammateVisit(rep, id){
  const cl = parse(cloud.get('clinics')); const c = cl.find(x => x.rep === rep && x.cls !== 'Closed');
  const live = liveVisits(), ts = Math.max(CLOCK, ...live.map(v => (v && v.ts) || 0)) + 60000; // the newest visit: first in Recent Activity
  live.push({ id, date: FIX.today, ts, rep, clinicId: c.id, clinicName: c.name, doctorIds: [], notes: 'logged on another phone', products: [] });
  cloud.set('visits', JSON.stringify(live));
  c.lastVisit = FIX.today; cloud.set('clinics', JSON.stringify(cl));
  return c;
}
// one painted frame whole: the ring and the remaining agree with the target and the achieved (S4), and (C1) the day's visits
// figure with Recent Activity — the new visit is in both or in neither
function frameBad(f, mark){
  if(!f.on) return null;
  if(f.wait) return 'calculating';
  const s = +f.sales, g = +f.goal;
  if(g > 0 && f.pct != null && f.sales != null){
    const r = f.remaining == null || f.remaining === '' ? null : +f.remaining;
    if(Math.abs(+f.pct - s / g * 100) > 1.5 || (r != null && Math.abs(r - Math.max(0, g - s)) > 1)) return 'mixed figures';
  }
  if(mark){ const inRecent = f.recent.indexOf(mark.name) >= 0, counted = +f.todayVisits === mark.after; if(f.todayVisits != null && inRecent !== counted) return 'mixed lists'; }
  return null;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const allErrors = [];
  // =====================================================================
  // A — a round where nothing changed
  // =====================================================================
  if(want('A')){
    for(const profName of PROFS){
      for(const [who, role] of [[SUP, 'supervisor'], [REP, 'rep']]){
        resetCloud();
        const D = await mkDevice(browser, profName, `A-${profName}-${role}`);
        await D.boot(who, role);
        const r1 = await D.round(), r2 = await D.round();
        const r = r2.done <= r1.done ? r2 : r1;
        table.push({ what: `round, nothing changed · ${profName} ${role}`, ms: r.done, busy: r.busy, reads: r.reads, kb: r.kb });
        if(VERBOSE) console.log(profName, who, JSON.stringify([r1, r2]));
        check(`R1 ${profName} ${role}: a round where nothing changed parses no document, puts nothing together, writes nothing to the phone's copies, draws nothing again and works out no figure (${r.reads} reads, ${r.kb} KB, ${r.done} ms, main thread ${r.busy} ms)`,
          [r1, r2].every(x => x.parses === 0 && x.mirror === 0 && x.renderAll === 0 && x.mut === 0 && x.msRun === 0), [r1, r2].map(x => ({ parses: x.parses, mirror: x.mirror, renderAll: x.renderAll, mutations: x.mut, msRun: x.msRun })));
        check(`R1 ${profName} ${role}: …and reads neither chat nor memories (their screen is closed)`, [r1, r2].every(x => !x.team.length), [r1.team, r2.team]);
        if(profName === 'laptop' && role === 'supervisor'){
          // R2: the screen does not move — the clinics list scrolled, a sheet open with text typed in it, the focus in it
          await D.ev(() => { switchView('clinics'); });
          await D.ev(() => msWhenReady());
          await D.ev(() => { window.scrollTo(0, 700); const c = clinics.find(x => (x.doctors || []).length) || clinics[0]; openClinicDetail(c.id);
            const inp = [...document.querySelectorAll('#modalInner input[type="text"], #modalInner textarea')].find(e => e.offsetParent) || null;
            const search = document.getElementById('clinicSearch');
            if(inp){ inp.focus(); inp.value = 'typed, not saved'; } else { search.focus(); search.value = 'typed'; }
            return null; });
          // the sheet's own parts that fill in after it opens (photos, accounts): settled first
          for(let i = 0, last = -1, same = 0; i < 40 && same < 3; i++){ const n = await D.ev(() => document.getElementById('modalInner').innerHTML.length); same = n === last ? same + 1 : 0; last = n; await sleep(200); }
          const before = await D.ev(() => { return { y: window.scrollY, sheet: document.getElementById('modalInner').innerHTML.length, open: document.getElementById('modalBack').classList.contains('show'), focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName), value: document.activeElement && document.activeElement.value }; });
          const rr = await D.round();
          const after = await D.ev(() => ({ y: window.scrollY, sheet: document.getElementById('modalInner').innerHTML.length, open: document.getElementById('modalBack').classList.contains('show'), focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName), value: document.activeElement && document.activeElement.value }));
          check(`R2: the screen does not move on a round where nothing changed — scroll, the open sheet, the text typed in it and the focus stay as they are`,
            before.open && after.open && after.y === before.y && after.sheet === before.sheet && after.focus === before.focus && after.value === before.value && rr.mut === 0, { before, after, mutations: rr.mut });
          await D.ev(() => { closeModal(); switchView('today'); window.scrollTo(0, 0); });
          // R3: an unchanged read still counts as a read from the cloud — the flags the daily backup and the Restore ask for, today's backup
          cloud.delete('snap_' + FIX.today);
          await D.ev(() => { try{ localStorage.removeItem('um_snapDay'); localStorage.removeItem('um_snapFail'); }catch(e){} });
          const rr2 = await D.round();
          const s3 = await D.ev(async () => { const notRead = ['clinics', 'tasks', 'visits'].filter(k => _loadFailed[k] || _mirrorUsed[k] || outboxHas(k));
            const why = snapshotBlockedWhy(); await maybeSnapshot(); return { notRead, why, failed: Object.keys(_loadFailed), mirror: Object.keys(_mirrorUsed) }; });
          check(`R3: after a round that read every list unchanged, the lists count as read from the cloud — the whole-day Restore's check passes and today's backup is taken from them`,
            rr2.renderAll === 0 && !s3.notRead.length && s3.why === null && !s3.failed.length && !s3.mirror.length && cloud.has('snap_' + FIX.today), Object.assign({ renderAll: rr2.renderAll }, s3));
        }
        if(profName === 'phone' && role === 'supervisor'){
          // R4: a round that brings a teammate's visit puts it on screen (the team's home screen)
          const c = teammateVisit(MATE, 'rr-teammate-visit');
          const rr = await D.round();
          const s4 = await D.ev(id => ({ inList: visits.some(v => v && v.id === id), recent: (document.getElementById('recentVisits') || {}).textContent || '' }), 'rr-teammate-visit');
          check(`R4: a round that brings a teammate's visit puts it on screen (${rr.done} ms with its figures)`, s4.inList && s4.recent.indexOf(c.name) >= 0 && rr.renderAll === 1, { inList: s4.inList, renderAll: rr.renderAll });
          table.push({ what: `round, a teammate's visit · phone supervisor`, ms: rr.done, busy: rr.busy, reads: rr.reads, kb: rr.kb });
        }
        if(profName === 'laptop' && role === 'rep'){
          // R5: the clock — a visit of hers logged a minute ago, then the minutes, the hour and the day move with nothing new in the cloud
          await D.ev(async () => { const c = clinics.find(x => x.rep === currentUser.name && x.cls !== 'Closed'); visits.push({ id: 'rr-mine-now', date: todayStr(), ts: Date.now() - 60000, rep: currentUser.name, clinicId: c.id, clinicName: c.name, doctorIds: [], notes: 'just now' }); await persistTold('visits'); renderAll(); });
          await D.round(); // the save's own refresh: the list taken anew
          await shiftClock(D, 5 * 60000);
          const m5 = await D.round();
          const ago = await D.ev(() => (document.getElementById('recentVisits') || {}).textContent || '');
          await shiftClock(D, 3 * 3600000);
          const h3 = await D.round();
          const greet = await D.ev(() => document.getElementById('greeting').textContent);
          await shiftClock(D, 24 * 3600000);
          const d1 = await D.round();
          const date = await D.ev(() => document.getElementById('dateLabel').textContent);
          check(`R5: with nothing new in the cloud the clock's words still move — "6 min ago" after five minutes, the afternoon's greeting and the hour's figures after three hours, every screen drawn again on a new day`,
            /6 min ago/.test(ago) && m5.renderAll === 0 && /Good afternoon/.test(greet) && h3.msRun >= 1 && d1.renderAll === 1 && /Wednesday/.test(date), { ago: ago.slice(0, 120), m5: m5.renderAll, greet, h3: h3.msRun, d1: d1.renderAll, date });
        }
        allErrors.push(...D.errors);
        await D.ctx.close();
      }
    }
    // R3b: a held delete confirmed by an unchanged read — a task this phone deleted 10 days ago that the log lost (an older
    // app's 7-day cut), held on this phone for 4 minutes before the start; once the hold has stood 5 minutes, a round whose
    // reads are all unchanged confirms it from the ids the tasks text holds, and the delete goes back to the log
    resetCloud();
    const H = await mkDevice(browser, 'laptop', 'A-held');
    const heldId = 'rr-held-task';
    await H.goto();
    await H.ev(({ id, clock }) => { localStorage.setItem('um_tombs', JSON.stringify({ tasks: { [id]: clock - 10 * 86400000 } })); localStorage.setItem('um_tombsMig123', '1');
      localStorage.setItem('um_tombsHeldAt', JSON.stringify({ tasks: { [id]: clock - 4 * 60000 } })); }, { id: heldId, clock: CLOCK });
    await H.boot(SUP, 'supervisor');
    const h1 = await H.ev(id => !!(_tombsHeld.tasks && _tombsHeld.tasks.has(id)), heldId);
    const r3a = await H.round();
    const inLog0 = !!((parse(cloud.get('tombs')) || {}).tasks || {})[heldId];
    await shiftClock(H, 2 * 60000);
    const r3b = await H.round();
    const inLog = !!((parse(cloud.get('tombs')) || {}).tasks || {})[heldId];
    check(`R3: a delete held on this phone is confirmed by a round whose reads are all unchanged once the hold has stood 5 minutes — back in the log (not before)`,
      h1 && r3a.renderAll === 0 && !inLog0 && inLog, { held: h1, firstRound: r3a.renderAll, before: inLog0, after: inLog, second: { renderAll: r3b.renderAll, parses: r3b.parses } });
    allErrors.push(...H.errors);
    await H.ctx.close();
  }
  // =====================================================================
  // B — chat and memories
  // =====================================================================
  if(want('B')){
    resetCloud();
    const D = await mkDevice(browser, 'laptop', 'B-rep');
    await D.boot(REP, 'rep');
    const b1 = [await D.round(), await D.round()];
    check(`B1: two rounds with the Team screen closed read neither chat nor memories`, b1.every(x => !x.team.length), b1.map(x => x.team));
    await D.ev(async () => { switchView('team'); setTeamTab('chat'); await loadTeam(); });
    const chat = parse(cloud.get('chat')); chat.push({ id: 'rr-other-phone-msg', who: MATE, text: 'Sent from another phone just now', ts: CLOCK + 1000 }); cloud.set('chat', JSON.stringify(chat));
    const b2 = await D.round();
    const shown = await D.ev(() => document.getElementById('chatList').textContent);
    await D.ev(() => setTeamTab('mem'));
    const b2m = await D.round();
    check(`B2: with the Team screen open every round reads chat and memories (either tab), and another phone's message is on screen after it`,
      b2.team.join() === 'chat,memories' && b2m.team.join() === 'chat,memories' && shown.indexOf('Sent from another phone just now') >= 0, { chatTab: b2.team, memTab: b2m.team, shown: shown.indexOf('Sent from another phone') >= 0 });
    const b2s = await D.round();
    check(`B2: …and a round that finds them unchanged draws nothing again (${b2s.mut} changes on screen)`, b2s.team.join() === 'chat,memories' && b2s.mut === 0 && b2s.renderAll === 0, { team: b2s.team, mutations: b2s.mut, renderAll: b2s.renderAll });
    await D.ev(() => { switchView('today'); });
    const chat2 = parse(cloud.get('chat')); chat2.push({ id: 'rr-other-phone-msg2', who: MATE, text: 'A second message from another phone', ts: CLOCK + 2000 }); cloud.set('chat', JSON.stringify(chat2));
    const b3a = await D.round();
    await shiftClock(D, 16 * 60000);
    const b3 = await D.round(), b3n = await D.round();
    const copy = await D.ev(() => (localStorage.getItem('um_mirror:chat') || '').indexOf('A second message from another phone') >= 0);
    check(`B3: with the Team screen closed they are read once 15 minutes have passed since the last real read (not before, not again on the next round), and the phone's copy has the new message`,
      !b3a.team.length && b3.team.join() === 'chat,memories' && !b3n.team.length && copy, { before: b3a.team, due: b3.team, next: b3n.team, copy });
    // B4: a start on this phone (it keeps their copy): neither is read; the Team screen shows the copy at once, then reads them
    resetAcct();
    await D.goto();
    await D.ev(async () => { await selectUser('Mariam', 'rep'); await msWhenReady(); });
    const startKeys = Object.keys(acct.keys).filter(k => k === 'chat' || k === 'memories');
    const atOnce = await D.ev(() => { switchView('team'); setTeamTab('chat'); return document.getElementById('chatList').textContent; });
    await sleep(300);
    const read4 = Object.keys(acct.keys).filter(k => k === 'chat' || k === 'memories').sort();
    check(`B4: a start on a phone that keeps their copy reads neither chat nor memories; the Team screen shows the copy at once, then reads both`,
      !startKeys.length && atOnce.indexOf('A second message from another phone') >= 0 && read4.join() === 'chat,memories', { atStart: startKeys, atOnce: atOnce.indexOf('A second message') >= 0, afterTap: read4 });
    // B7: "Refresh messages"
    resetAcct();
    await D.ev(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; });
    await D.ev(async () => { await refreshTeam(); });
    const t7 = await D.ev(() => window.__toasts.slice(-1)[0]);
    check(`B7: "Refresh messages" reads chat and memories from the cloud and says "Up to date"`, (acct.keys.chat || 0) >= 1 && (acct.keys.memories || 0) >= 1 && /Up to date/.test(t7 || ''), { reads: acct.keys, toast: t7 });
    allErrors.push(...D.errors);
    await D.ctx.close();
    // B5 + B6: a new device, chat and memories slow to answer
    resetCloud();
    const N = await mkDevice(browser, 'laptop', 'B-new');
    slow.chat = SLOW_TEAM_MS; slow.memories = SLOW_TEAM_MS;
    await N.goto();
    const b5 = await N.ev(async () => {
      let firstDraw = null; const ra = window.renderAll; window.renderAll = function(){ if(firstDraw == null) firstDraw = performance.now(); return ra.apply(this, arguments); };
      const t0 = performance.now(); const p = selectUser('Mariam', 'rep');
      // the Team screen opened as soon as the home screen is drawn, before chat and memories are in
      while(firstDraw == null && performance.now() - t0 < 20000) await new Promise(r => setTimeout(r, 20));
      switchView('team'); setTeamTab('chat');
      const early = document.getElementById('chatList').textContent;
      await p; const end = performance.now();
      await new Promise(r => setTimeout(r, 3000));
      return { firstDraw: Math.round(firstDraw - t0), end: Math.round(end - t0), early, later: document.getElementById('chatList').textContent.length };
    });
    delete slow.chat; delete slow.memories;
    // (against the reads' own delay, not a fixed time: a slower machine draws later and still well before they answer)
    check(`B5: on a new device the first paint does not wait for chat and memories (drawn at ${b5.firstDraw} ms, their reads answer after ${SLOW_TEAM_MS} ms)`, b5.firstDraw < SLOW_TEAM_MS - 500, b5);
    check(`B6: the Team screen opened before they are in says they are loading — never "Start the conversation" — and shows the messages once they are`,
      /Loading messages/.test(b5.early) && !/Start the conversation/.test(b5.early) && b5.later > 500, { early: b5.early.slice(0, 80), later: b5.later });
    allErrors.push(...N.errors);
    await N.ctx.close();
  }
  // =====================================================================
  // C — the home screen's frames after an ordinary change
  // =====================================================================
  if(want('C')){
    for(const profName of PROFS){
      // C1: the supervisor's team view, a round brings Mariam's visit
      resetCloud();
      const A = await mkDevice(browser, profName, `C1-${profName}`);
      await A.boot(SUP, 'supervisor');
      const before = await A.ev(() => window.__frame());
      const c = teammateVisit(REP, 'rr-c1-visit');
      await A.ev(() => window.__recStart());
      await A.round();
      await sleep(100);
      const fr = await A.ev(() => window.__recStop());
      const mark = { name: c.name, after: +before.todayVisits + 1 };
      const bad = fr.map(f => frameBad(f, mark)).filter(Boolean);
      const last = fr[fr.length - 1] || {};
      check(`C1 ${profName}: a round brings a teammate's visit — every frame painted is whole (the team's figures and Recent Activity of one state), none says "Calculating…" (${fr.length} frames)`,
        fr.length > 2 && !bad.length && +last.todayVisits === mark.after && last.recent.indexOf(c.name) >= 0, { bad: [...new Set(bad)], n: fr.length, before: before.todayVisits, after: last.todayVisits });
      // C3: targets saved in Admin over the home screen (the supervisor's)
      await A.ev(() => window.__recStart());
      await A.ev(async () => { Object.keys(targets).forEach(r => { if(r.charAt(0) !== '_' && targets[r] && targets[r].revenue > 0) targets[r].revenue = Math.round(targets[r].revenue * 0.7); }); await persist('targets'); renderTargetCard(); await msWhenReady(); });
      await sleep(100);
      const f3 = await A.ev(() => window.__recStop());
      const bad3 = f3.map(f => frameBad(f, null)).filter(Boolean);
      check(`C3 ${profName}: targets saved over the home screen — every frame painted is whole, none says "Calculating…" (${f3.length} frames)`, f3.length > 2 && !bad3.length, { bad: [...new Set(bad3)], n: f3.length });
      // C4: a person's screen opened (no earlier frame: "Calculating…" may show), then back to the team — its earlier frame at once
      await A.ev(async () => { msOpenPerson('Mariam'); await msWhenReady(); });
      await A.ev(() => window.__recStart());
      await A.ev(async () => { msOpenPerson(null); await msWhenReady(); });
      await sleep(60);
      const f4 = await A.ev(() => window.__recStop());
      const bad4 = f4.map(f => frameBad(f, null)).filter(Boolean);
      check(`C4 ${profName}: back to the team from a person's screen, nothing changed — the team's frame is drawn at once, never "Calculating…"`, f4.length > 0 && !bad4.length, { bad: [...new Set(bad4)], n: f4.length });
      allErrors.push(...A.errors);
      await A.ctx.close();
      // C2: a rep logs a visit and comes back to the home screen
      resetCloud();
      const B = await mkDevice(browser, profName, `C2-${profName}`);
      await B.boot(REP, 'rep');
      await B.ev(() => window.__recStart());
      const saved = await B.ev(async () => {
        switchView('log');
        const c = clinics.find(x => x.rep === currentUser.name && x.cls !== 'Closed' && (x.doctors || []).length);
        pickClinic(c.id); pickDoctorSeen(c.doctors[0].id);
        await saveVisit();
        if(activeView !== 'today') switchView('today');
        await msWhenReady();
        return { name: c.name, view: activeView, logged: visits.some(v => v && v.clinicId === c.id && v.date === todayStr()) };
      });
      await sleep(100);
      const f2 = await B.ev(() => window.__recStop());
      const bad2 = f2.map(f => frameBad(f, null)).filter(Boolean);
      check(`C2 ${profName}: her own visit saved, back on the home screen — every frame painted is whole, none says "Calculating…" (${f2.filter(f => f.on).length} frames on it)`,
        saved.logged && f2.some(f => f.on) && !bad2.length, { bad: [...new Set(bad2)], saved });
      allErrors.push(...B.errors);
      await B.ctx.close();
    }
  }
  check('no page or console error', !allErrors.length, allErrors.slice(0, 8));
  if(table.length){ console.log('\nwhat a round costs (ms to done incl. its figures · main thread ms · reads · KB)'); table.forEach(t => console.log(`  ${t.what.padEnd(46)} ${String(t.ms).padStart(6)} ${String(t.busy).padStart(6)} ${String(t.reads).padStart(4)} ${String(t.kb).padStart(6)}`)); }
  console.log('\n' + results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
