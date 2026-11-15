// Saves told for what they did (v123, audit items 3, 4, 5, 8 and 10), each
// reproduced on a fake cloud before its fix:
//  A  a save the security rules refuse is never queued as "offline": it says
//     "Not allowed, not saved (ask the supervisor)"; what already waits in the
//     queue stays there and on the phone, not sent again by the round (v123
//     review); a refused read says "no access";
//  B  a document too large for the cloud is a distinct error, never queued:
//     a lasting bar names the month and what to do, the visit form keeps what
//     was typed, the phone keeps seeing the others' changes; memories stay
//     under the limit by leaving out the oldest previews (no entry lost); the
//     recycle bin is pruned on every write;
//  C  the daily backup is measured: above ~900 KB the visits keep their photo
//     ids without previews, too large is said and waited on for an hour, and
//     a whole-day Restore puts back the previews this phone holds;
//  D  two doctors of one name are never merged by themselves (no clinic write
//     at start or in 3 refreshes); the supervisor is offered them;
//  E  "+ Add clinic": a rep's clinic is hers, the supervisor picks, sales that
//     would move are asked first ("Count from this month"), a clinic the
//     rules refuse stays in the sheet, not on the list; a rename carries
//     the handover's previous owner; the visit form's "New clinic" and the
//     order form's "+ Add a new customer" run the same check (v123 review);
//  F  the Assistant sends nothing anywhere;
//  G  save actions never say "saved" for a save that did not land;
//  H  both halves of v123 together: a whole document refused by its
//     compare-and-set keeps the specific words, a save with no answer yet is
//     said as that, a catalog over the limit is never sent, the whole-day
//     Restore keeps today's data measured like the daily backup, the bin keeps
//     30 days in its three-way merge, the phone-copy restore says a refusal.
// Several phones share one cloud; the 20-second refresh is driven by hand.
// Clock pinned to Fri 13 Nov 2026, 10:00.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8286;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{ const u = req.url.split('?')[0]; const f = path.join(WWW, u==='/'?'index.html':u); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });

// ---- fake cloud (in Node: shared by every phone) ----
// deny: { re, ops: 'r' | 'w' | 'rw' } — the security rules refuse those reads / writes (permission-denied)
// The real cloud refuses a document above 1 MiB with its name and fields (invalid-argument): so does this one.
const cloud = {};
const LIMIT = 1048576 - 100;
const mode = { deny: null, offline: new Set(), reads: [], writes: [], tries: [] };
let held = false; const waiters = [];
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const off = who => { if(mode.offline.has(who)) throw new Error('boom-offline'); };
const denied = (k, op) => !!(mode.deny && mode.deny.re.test(k) && mode.deny.ops.includes(op));
const api = {
  get: async (who, k) => { off(who); mode.reads.push(who + '|' + k); if(denied(k, 'r')) return { __err: 'permission-denied' }; return k in cloud ? cloud[k] : null; },
  set: async (who, k, v) => { off(who);
    if(denied(k, 'w')){ mode.tries.push(who + '|' + k); return { __err: 'permission-denied' }; }
    if(Buffer.byteLength(v, 'utf8') > LIMIT){ mode.tries.push(who + '|' + k); return { __err: 'invalid-argument', msg: `Document 'state/${k}' cannot be written because its size (${Buffer.byteLength(v, 'utf8')} bytes) exceeds the maximum allowed size of 1,048,576 bytes.` }; }
    mode.writes.push(who + '|' + k); cloud[k] = v; return true; },
  setMany: async (who, e) => { off(who); for(const [k, v] of e){ if(denied(k, 'w')) return { __err: 'permission-denied' }; } e.forEach(([k, v]) => { mode.writes.push(who + '|' + k); cloud[k] = v; }); return true; },
  del: async (who, k) => { off(who); if(denied(k, 'w')) return { __err: 'permission-denied' }; delete cloud[k]; return true; },
  list: async (who, p) => { off(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,700):'')); if(!ok) failed++; }
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const DAY = 86400000;
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const TODAY = '2026-11-13', SNAP = 'snap_' + TODAY;
const NOT_ALLOWED = '🔒 Not allowed, not saved (ask the supervisor)';
const visit = (id, clinicId, rep, extra) => Object.assign({ id, clinicId, rep, date: TODAY, ts: CLOCK - 3600000, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: '' }, extra || {});
const thumb = (ch, n) => 'data:image/jpeg;base64,' + ch.repeat(n);

// ---- the account: three clinics, a handed-over one, and a sales file whose customer has no clinic yet ----
const row = (d, doc, sm, net, cust) => [d, doc, 0, 'P-1', 1, net, net, 0, sm, 'TEPE', cust, 'Clinics', 0, ''];
const ROWS = [row('2026-10-20', 'SO1', 'Ranova Sample Person', 120, 'Bright Smile Dental'), row('2026-11-05', 'SO2', 'Ranova Sample Person', 80, 'Bright Smile Dental'),
  row('2026-11-06', 'SO3', 'Mariam Sample', 50, 'Dental 5 Clinic')];
function seedCloud(extra){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] },
    { id: 'c3', name: 'Hilal Dental Center', rep: 'Mariam', cls: 'B', doctors: [{ id: 'd3', name: 'Dr. Noor' }] },
    { id: 'h1', name: 'Handed Clinic', rep: 'Renova', prevRep: 'Mariam', repSince: '2026-11-01', cls: 'B', doctors: [] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-11' }, Renova: { revenue: 12000, month: '2026-11' } });
  cloud.erpSales = JSON.stringify({ periods: [{ id: 'p-oct-nov', from: '2026-10-01', to: '2026-11-12', net: 250, rowCount: ROWS.length, importedAt: '2026-11-12T08:00:00.000Z', rev: 1,
      repMap: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, rowsRef: { key: 'erpRows:p-oct-nov:1', chunks: 1, count: ROWS.length } }],
    repMapGlobal: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, returnPolicy: 'erp',
    seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud['erpRows:p-oct-nov:1:0'] = JSON.stringify(ROWS);
  Object.assign(cloud, extra || {});
}

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {}, consoleLog = {}, outside = [];
  const mkPhone = async (label) => {
    const ctx = await browser.newContext(); await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => { outside.push(label + ' ' + r.request().method() + ' ' + r.request().url()); r.abort(); });
    const page = await ctx.newPage(); errors[label] = []; consoleLog[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { consoleLog[label].push(m.text().slice(0, 200));
      if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|save failed|update failed/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript((clock) => {
      // what the Firebase SDK throws: a FirebaseError with its code
      const fail = r => { if(r && r.__err){ const e = new Error(r.__err === 'permission-denied' ? 'Missing or insufficient permissions.' : (r.msg || r.__err)); e.code = r.__err; e.name = 'FirebaseError'; throw e; } return r; };
      window.storage = {
        get: async k => { const v = fail(await window.__cGet(k)); return v == null ? null : { value: v }; },
        set: async (k, v) => fail(await window.__cSet(k, v)), setMany: async e => fail(await window.__cSetMany(e)), delete: async k => fail(await window.__cDel(k)), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { await window.__cAcquire(); try{ const cur = fail(await window.__cGet(k)); const next = fn(cur == null ? null : cur); if(next == null) return null; fail(await window.__cSet(k, next)); return next; } finally { await window.__cRelease(); } },
      };
      const offs = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + offs); else super(...a); } static now(){ return _D.now() + offs; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    }, CLOCK);
    const boot = async (who, role) => {
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(350);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; _lastOfflineToast = 0; });
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); await page.waitForTimeout(120); };
    const ev = (fn, arg) => page.evaluate(fn, arg);
    return { page, boot, tick, ev, label, ctx };
  };
  const fill = (ph, o) => ph.ev(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId); document.getElementById('visitNotes').value = o.note; }, o);
  const writes = (who, key) => mode.writes.filter(w => w === who + '|' + key).length;
  const tries = (who, key) => mode.tries.filter(w => w === who + '|' + key).length;
  const cloudVisits = () => (parse(cloud.visits) || []);

  // ===================== A. a save the security rules refuse =====================
  {
    // A1 — the supervisor's target save, refused: never "🎯 Monthly targets saved", never queued
    seedCloud();
    const S = await mkPhone('A1-S'); await S.boot('Dr. Ghaith', 'supervisor');
    mode.deny = { re: /^targets$/, ops: 'w' };
    const a1 = await S.ev(async () => {
      openAdminPanel(); setAdminTab('team'); await new Promise(r => setTimeout(r, 60));
      const el = document.getElementById('tgRev0'); if(!el) return { err: 'no target input' };
      el.value = '5555'; window.__toasts = [];
      await saveTargets(); await new Promise(r => setTimeout(r, 60));
      return { toasts: window.__toasts.slice(), outbox: outboxList(), out: persistOutcome('targets') };
    });
    mode.deny = null;
    check('A1. the rules refuse the supervisor\'s target save: "Not allowed, not saved (ask the supervisor)", outcome {ok:false, refused:true}, never "🎯 Monthly targets saved", nothing queued, the cloud unchanged',
      a1.toasts && a1.toasts.includes(NOT_ALLOWED) && !a1.toasts.some(t => /targets saved/.test(t)) && a1.outbox.length === 0 && a1.out && a1.out.ok === false && a1.out.refused === true && parse(cloud.targets).Mariam.revenue === 10000, a1);
    await S.ctx.close();

    // A2 — a rep's visit, the rules refusing the visits: not queued, the form keeps what she typed, "not saved"
    seedCloud();
    const A = await mkPhone('A2-A'); await A.boot('Mariam', 'rep');
    mode.deny = { re: /^visits(Index|Arch:.*)?$/, ops: 'w' };
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'A2 refused visit' });
    await A.ev(async () => { window.__toasts = []; await saveVisit(); });
    const a2 = await A.ev(() => ({ inMem: visits.some(v => v && v.notes === 'A2 refused visit'), queued: outboxHas('visits'), view: activeView, notes: (document.getElementById('visitNotes') || {}).value, toasts: window.__toasts.slice() }));
    mode.deny = null;
    await A.tick();
    check('A2. a visit the rules refuse is never queued: "Visit not saved — not allowed (ask the supervisor)", off the lists, the form still holds what she typed, never "saved on this device", and nothing uploads later',
      !a2.inMem && !a2.queued && a2.view === 'log' && a2.notes === 'A2 refused visit' && a2.toasts.some(t => /Visit not saved — not allowed/.test(t)) && !a2.toasts.some(t => /محفوظة على هذا الجهاز|Saved on this device|on this phone/.test(t)) && !cloudVisits().some(v => v.notes === 'A2 refused visit'), a2);
    await A.ctx.close();

    // A3 — a change queued with no connection, then refused at upload (the login still reads the team's data:
    // the rules' "no"): it stays queued and on the phone — never thrown away (v123 review: it left the queue,
    // kept aside where nothing read it) — says "Not allowed", the 20-second round stops sending it, and
    // the bar's "Try again" sends it once the rules let it through
    seedCloud();
    const B = await mkPhone('A3-A'); await B.boot('Mariam', 'rep');
    mode.offline.add('A3-A');
    const q3 = await B.ev(async () => { tasks.push({ id: 'tA3', text: 'A3 offline task', done: false, created: todayStr(), rep: 'Mariam' }); const r = await persistFor('tasks'); return { r, queued: outboxHas('tasks') }; });
    mode.offline.delete('A3-A'); mode.deny = { re: /^tasks$/, ops: 'w' };
    await B.ev(() => { window.__toasts = []; });
    await B.tick();
    const a3 = await B.ev(() => ({ outbox: outboxList(), kept: /A3 offline task/.test(localStorage.getItem('um_mirror:tasks') || ''), onScreen: tasks.some(t => t && t.id === 'tA3'),
      bar: (document.getElementById('tooLargeBar') || {}).innerText || '', toasts: window.__toasts.slice() }));
    const t0 = tries('A3-A', 'tasks');
    await B.tick(); await B.tick();
    const t1 = tries('A3-A', 'tasks');
    mode.deny = null;
    await B.ev(async () => { await retryBlockedSaves(); });
    const sent = (parse(cloud.tasks) || []).some(t => t.id === 'tA3');
    // (round 3: its words were "Not allowed, not saved" — for a change that is kept on the phone and in the queue)
    check('A3. a queued change the rules refuse at upload stays queued and on the phone (never thrown away), says "Not allowed for this login — kept on this phone, not sent" (never "not saved") and the bar says it waits; the 20-second round stops sending it; "Try again" sends it',
      q3.queued && a3.outbox.includes('tasks') && a3.kept && a3.onScreen && /not allow this login/.test(a3.bar) && a3.toasts.some(t => /Not allowed for this login — kept on this phone, not sent/.test(t)) && !a3.toasts.some(t => /not saved/i.test(t)) && t1 === t0 && sent,
      { q3: q3.queued, a3, triesBefore: t0, triesAfter2Rounds: t1, sentByTryAgain: sent });
    await B.ctx.close();

    // A4 — a read the rules refuse says "no access" (never only "no connection")
    seedCloud();
    mode.deny = { re: /^targets$/, ops: 'r' };
    const C = await mkPhone('A4-A'); await C.boot('Mariam', 'rep');
    const a4 = await C.ev(() => ({ noAccess: !!(typeof _noAccess !== 'undefined' && _noAccess.targets), said: typeof _noAccessSaid !== 'undefined' && _noAccessSaid }));
    mode.deny = null;
    check('A4. a read the rules refuse is said: "No access to the team\'s data on this login — ask the supervisor"',
      a4.noAccess && a4.said && consoleLog['A4-A'].some(l => /read refused by the security rules: targets/.test(l)), a4);
    await C.ctx.close();

    // A5 — a chat message the rules refuse: never queued, the words go back in the box
    seedCloud();
    const D = await mkPhone('A5-A'); await D.boot('Mariam', 'rep');
    mode.deny = { re: /^chat$/, ops: 'w' };
    const a5 = await D.ev(async () => { switchView('team'); const inp = document.getElementById('chatInput'); inp.value = 'A5 refused message'; window.__toasts = []; await sendChat();
      return { inMem: chatMsgs.some(m => m && m.text === 'A5 refused message'), queued: outboxHas('chat'), input: inp.value, toasts: window.__toasts.slice() }; });
    mode.deny = null;
    check('A5. a chat message the rules refuse is not queued: "Not allowed…", off the list, and her words are back in the box',
      !a5.inMem && !a5.queued && a5.input === 'A5 refused message' && a5.toasts.includes(NOT_ALLOWED), a5);
    await D.ctx.close();
  }

  // ===================== B. a document too large for the cloud =====================
  {
    // B1 — this month's visits are full (photos): the visit is not saved, never queued; a lasting bar says which month and what to do
    seedCloud({ visits: JSON.stringify([visit('vBig', 'c1', 'Mariam', { notes: 'full month', photos: [{ id: 'pBig', thumb: thumb('A', 985000) }] })]) });
    const A = await mkPhone('B1-A'), S = await mkPhone('B1-S');
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'B1 visit ' + 'n'.repeat(20000) });
    await A.ev(async () => { window.__toasts = []; await saveVisit(); });
    const b1 = await A.ev(() => ({ inMem: visits.some(v => v && /^B1 visit/.test(v.notes || '')), queued: outboxHas('visits'), view: activeView, notes: ((document.getElementById('visitNotes') || {}).value || '').slice(0, 8),
      bar: (document.getElementById('tooLargeBar') || {}).textContent || '', toasts: window.__toasts.slice() }));
    check('B1. a visit that would make this month too large is not saved and never queued: the form keeps it, the visit screen says "Visit not saved", never "saved on this device"',
      !b1.inMem && !b1.queued && b1.view === 'log' && b1.notes === 'B1 visit' && b1.toasts.some(t => /Visit not saved — this month's visits are too large/.test(t)) && !b1.toasts.some(t => /محفوظة على هذا الجهاز|Saved on this device/.test(t)), { ...b1, bar: b1.bar.slice(0, 200) });
    check('B1b. …and a lasting bar names the month and what to do (remove some photos, then save again)',
      /November 2026/.test(b1.bar) && /too large for the cloud/.test(b1.bar) && /Remove some photos/.test(b1.bar), b1.bar);
    await A.ev(() => { window.__toasts = []; });
    await A.tick(); await A.tick();
    const b1c = await A.ev(() => ({ toasts: window.__toasts.slice(), outbox: outboxList(), bar: !!document.getElementById('tooLargeBar') }));
    check('B1c. nothing is retried every 20 seconds (no repeated "too large", nothing in the queue), and the bar stays',
      !b1c.toasts.some(t => /كبيرة جدًا|too large/.test(t)) && b1c.outbox.length === 0 && b1c.bar, b1c);
    // the supervisor makes room (removes the big photo) and logs a visit of his own: Mariam's phone still sees the others' changes
    await S.ev(async () => { await removeEditPhoto('vBig', 'pBig'); visits.push({ id: 'vSup', clinicId: 'c2', rep: 'Renova', date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'B1 other phone visit' }); await persist('visits'); });
    await A.tick();
    const seen = await A.ev(() => visits.some(v => v && v.notes === 'B1 other phone visit'));
    check('B1d. the phone keeps seeing the others\' changes (it never sat on its own copy of the visits)', seen, { seen, cloudHas: cloudVisits().some(v => v.notes === 'B1 other phone visit') });
    // B2 — the form is still filled: saved again once the month has room, it lands and the bar goes
    await A.ev(async () => { window.__toasts = []; await saveVisit(); });
    const b2 = await A.ev(() => ({ inMem: visits.some(v => v && /^B1 visit/.test(v.notes || '')), bar: !!document.getElementById('tooLargeBar'), view: activeView, toasts: window.__toasts.slice() }));
    check('B2. saved again from the same form once the month has room: it lands and the bar is gone', b2.inMem && !b2.bar && cloudVisits().some(v => /^B1 visit/.test(v.notes || '')), b2);
    await A.ctx.close(); await S.ctx.close();

    // B3 — the clinic list over the limit: the same — not queued, said for what it is
    const cl = parse((seedCloud(), cloud.clinics)); cl[0].notes = 'x'.repeat(999000);
    seedCloud({ clinics: JSON.stringify(cl) });
    const R = await mkPhone('B3-A'); await R.boot('Mariam', 'rep');
    const b3 = await R.ev(async () => { window.__toasts = []; await saveNoSaleReason('c3', 'B3 reason'); return { queued: outboxHas('clinics'), toasts: window.__toasts.slice(), bar: (document.getElementById('tooLargeBar') || {}).textContent || '' }; });
    check('B3. a clinic-list save over the limit is not queued: "Not saved: the clinic list is too large for the cloud…", never "📝 Reason saved" nor "saved on this device"',
      !b3.queued && b3.toasts.some(t => /the clinic list is too large for the cloud/.test(t)) && !b3.toasts.some(t => /Reason saved|Saved on this device/.test(t)) && /the clinic list/.test(b3.bar), b3);
    await R.ctx.close();

    // B4 — memories near the limit: a new one is shared, the oldest previews are left out, no memory is lost
    const mems = Array.from({ length: 60 }, (_, i) => ({ id: 'm' + i, thumb: thumb('B', 15000), cap: 'memory ' + i, tag: '', who: 'Renova', ts: CLOCK - (60 - i) * DAY }));
    seedCloud({ memories: JSON.stringify(mems) });
    const M = await mkPhone('B4-A'); await M.boot('Mariam', 'rep');
    const b4 = await M.ev(async () => {
      window._pendingMem = { id: 'mNew', full: 'data:image/jpeg;base64,' + 'F'.repeat(2000), thumb: 'data:image/jpeg;base64,' + 'C'.repeat(150000) };
      showModal('<input id="memCap" value="B4 memory"><div id="memTags"><div class="chip small on" data-tag="Team">Team</div></div><button id="memShareBtn" data-mem="mNew">Share</button>');
      window.__toasts = []; await saveMemory();
      return { toasts: window.__toasts.slice(), queued: outboxHas('memories') };
    });
    const cm = parse(cloud.memories) || [];
    check('B4. memories stay under the cloud\'s limit by leaving out the OLDEST previews: shared, every memory kept (61), the new one with its preview, the oldest without',
      b4.toasts.includes('📸 Memory shared with the team') && !b4.queued && cm.length === 61 && Buffer.byteLength(cloud.memories, 'utf8') < 1000000 && (cm.find(m => m.id === 'mNew') || {}).thumb && !(cm.find(m => m.id === 'm0') || {}).thumb && (cm.find(m => m.id === 'm0') || {}).cap === 'memory 0',
      { b4, n: cm.length, bytes: Buffer.byteLength(cloud.memories || '', 'utf8'), withoutPreview: cm.filter(m => !m.thumb).length });
    await M.ctx.close();

    // B5 — the recycle bin is pruned on every write (a 40-day-old entry goes when a rep deletes her visit)
    seedCloud({ visits: JSON.stringify([visit('vDel', 'c1', 'Mariam', { notes: 'to delete' })]), recycleBin: JSON.stringify({ clinics: [], products: [], visits: [{ id: 'old-bin', clinicId: 'c1', _deletedAt: CLOCK - 40 * DAY, _label: 'old' }] }) });
    const P = await mkPhone('B5-A'); await P.boot('Mariam', 'rep');
    await P.ev(async () => { await deleteVisit('vDel'); });
    const bin = parse(cloud.recycleBin) || {};
    check('B5. the recycle bin keeps 30 days on every write: the 40-day-old entry is gone, the visit just deleted is there',
      !(bin.visits || []).some(x => x.id === 'old-bin') && (bin.visits || []).some(x => x.id === 'vDel'), (bin.visits || []).map(x => x.id));
    await P.ctx.close();
  }

  // ===================== C. the daily backup =====================
  {
    // C1 — a backup that would pass the limit keeps the visits without their previews (the photo ids stay)
    const vis = ['1', '2', '3'].map(i => visit('vp' + i, 'c1', 'Mariam', { notes: 'photo visit ' + i, photos: [{ id: 'ph' + i, thumb: thumb('D', 330000) }] }));
    seedCloud({ visits: JSON.stringify(vis), products: JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: 'P' + i, name: 'Product ' + i + ' ' + 'z'.repeat(150), brand: 'TEPE', price: 1 }))) });
    const A = await mkPhone('C1-A'); await A.boot('Mariam', 'rep');
    await A.ev(async () => { try{ localStorage.removeItem('um_snapDay'); localStorage.removeItem('um_snapFail'); }catch(e){} tasks.push({ id: 'tC1', text: 'C1', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    await A.page.waitForTimeout(600);
    const snap = parse(cloud[SNAP]);
    check('C1. a daily backup that would pass the limit is saved without the visits\' photo previews — every visit and its photo ids kept, the size measured',
      !!snap && Buffer.byteLength(cloud[SNAP], 'utf8') < 1000000 && snap.visits.length === 3 && snap.visits.every(v => v.photos[0] && v.photos[0].id && !v.photos[0].thumb) && snap.slim && snap.slim.photos === 3,
      snap ? { bytes: Buffer.byteLength(cloud[SNAP], 'utf8'), slim: snap.slim, photos: snap.visits.map(v => v.photos) } : { snap: null, tries: tries('C1-A', SNAP) });
    await A.ctx.close();

    // C2 — too large even without previews: not written, said on the backups screen, and not tried again within the hour
    const big = parse((seedCloud(), cloud.clinics)); big.forEach(c => { c.notes = 'y'.repeat(270000); });
    seedCloud({ clinics: JSON.stringify(big) });
    const S = await mkPhone('C2-S'); await S.boot('Dr. Ghaith', 'supervisor');
    const save = () => S.ev(async () => { tasks.push({ id: 't' + Date.now() + Math.random(), text: 'C2', done: false, created: todayStr(), rep: 'Team' }); await persist('tasks'); await new Promise(r => setTimeout(r, 150)); });
    await S.ev(() => { try{ localStorage.removeItem('um_snapDay'); localStorage.removeItem('um_snapFail'); }catch(e){} });
    mode.reads = [];
    await save();
    const r0 = mode.reads.filter(x => x === 'C2-S|' + SNAP).length;
    await save(); await save();
    const r1 = mode.reads.filter(x => x === 'C2-S|' + SNAP).length;
    const shown = await S.ev(async () => { openExport(); await new Promise(r => setTimeout(r, 300)); return (document.getElementById('backupList') || {}).innerText || ''; });
    await S.ev(() => { const f = JSON.parse(localStorage.getItem('um_snapFail') || 'null'); if(f){ f.at -= 3600000 + 1000; localStorage.setItem('um_snapFail', JSON.stringify(f)); } closeModal(); }); // an hour later
    await save();
    const r2 = mode.reads.filter(x => x === 'C2-S|' + SNAP).length;
    check('C2. a backup too large even without previews is not written; this phone waits an hour before it tries again',
      !(SNAP in cloud) && r0 === 1 && r1 === 1 && r2 === 2, { r0, r1, r2, snap: SNAP in cloud });
    check('C2b. …and the backups screen says so: "Today\'s backup was not saved from this phone: it is too large for the cloud"',
      /Today's backup was not saved from this phone: it is too large for the cloud/.test(shown), shown.slice(0, 240));
    await S.ctx.close();

    // C3 — a whole-day Restore of a backup without previews keeps the previews this phone holds under the same photo ids
    const live = ['1', '2'].map(i => visit('vr' + i, 'c1', 'Mariam', { notes: 'restore ' + i, photos: [{ id: 'pr' + i, thumb: 'data:image/jpeg;base64,THUMB' + i }] }));
    seedCloud({ visits: JSON.stringify(live) });
    cloud['snap_2026-11-12'] = JSON.stringify({ clinics: parse(cloud.clinics), products: parse(cloud.products), visits: live.map(v => Object.assign({}, v, { photos: v.photos.map(p => ({ id: p.id })) })), tasks: [], slim: { photos: 2 }, ts: '2026-11-12T20:00:00.000Z' });
    const T = await mkPhone('C3-S'); await T.boot('Dr. Ghaith', 'supervisor');
    await T.ev(async () => { await restoreSnapshot('2026-11-12'); });
    const after = await T.ev(() => visits.filter(v => /^restore/.test(v.notes || '')).map(v => (v.photos || []).map(p => p.thumb || null)));
    const inCloud = cloudVisits().filter(v => /^restore/.test(v.notes || '')).map(v => (v.photos || []).map(p => p.thumb || null));
    check('C3. a whole-day Restore of a backup saved without previews keeps the preview this phone holds for each photo id (on screen and in the cloud)',
      JSON.stringify(after) === JSON.stringify([['data:image/jpeg;base64,THUMB1'], ['data:image/jpeg;base64,THUMB2']]) && JSON.stringify(inCloud) === JSON.stringify(after), { after, inCloud });
    await T.ctx.close();
  }

  // ===================== D. two doctors of one name =====================
  {
    const cl = parse((seedCloud(), cloud.clinics)); cl[0].doctors = [{ id: 'd1', name: 'Dr. Ahmed', phone: '111' }, { id: 'd1b', name: 'dr ahmed', phone: '222', stage: 'warm' }];
    seedCloud({ clinics: JSON.stringify(cl), visits: JSON.stringify([visit('vD1', 'c1', 'Mariam', { doctorIds: ['d1b'], doctorId: 'd1b' })]) });
    mode.writes = [];
    const S = await mkPhone('D1-S'); await S.boot('Dr. Ghaith', 'supervisor');
    const w0 = writes('D1-S', 'clinics') + writes('D1-S', 'visits');
    for(let i = 0; i < 3; i++) await S.tick();
    const w1 = writes('D1-S', 'clinics') + writes('D1-S', 'visits');
    const d1 = await S.ev(() => { const c = clinics.find(x => x.id === 'c1'); return { docs: c.doctors.map(d => [d.id, d.phone, d.stage || null]), visit: (visits.find(v => v.id === 'vD1') || {}).doctorIds }; });
    check('D1. two doctors of one name on the supervisor\'s phone: both kept (the second\'s phone and stage too), no clinic or visit write at start nor during 3 refreshes',
      w0 === 0 && w1 === 0 && JSON.stringify(d1.docs) === JSON.stringify([['d1', '111', null], ['d1b', '222', 'warm']]) && JSON.stringify(d1.visit) === '["d1b"]' && parse(cloud.clinics)[0].doctors.length === 2, { atStart: w0, in3Refreshes: w1, d1 });
    // the supervisor is offered them; "different people" stops the offer, for every phone
    const d2 = await S.ev(async () => {
      switchView('clinics'); renderClinics();
      const card = /possible duplicate doctors/.test((document.getElementById('namelessCard') || {}).innerText || '');
      if(typeof openDupDoctors !== 'function') return { card, missing: true }; // (v122: no such sheet)
      openDupDoctors('');
      const offered = document.querySelectorAll('#modalInner [data-dupdoc]').length;
      await keepDupDoctors('c1', UMCore.normDoctorName('Dr. Ahmed'), '');
      renderClinics();
      return { card, offered, after: document.querySelectorAll('#modalInner [data-dupdoc]').length, cardAfter: /possible duplicate doctors/.test((document.getElementById('namelessCard') || {}).innerText || '') };
    });
    check('D2. the supervisor is offered them on the Clinics screen; "Different people — keep both" is saved for every phone and the offer goes',
      d2.card && d2.offered === 1 && d2.after === 0 && !d2.cardAfter && JSON.stringify(parse(cloud.clinics)[0].distinctDoctors) === '["d1|d1b"]' && parse(cloud.clinics)[0].doctors.length === 2, d2);
    await S.ctx.close();
    const R = await mkPhone('D2-A');
    seedCloud({ clinics: JSON.stringify(cl) });
    await R.boot('Mariam', 'rep');
    const repCard = await R.ev(() => { switchView('clinics'); renderClinics(); return /possible duplicate doctors/.test((document.getElementById('namelessCard') || {}).innerText || ''); });
    check('D2b. a rep is not offered the merge (the supervisor decides)', !repCard, { repCard });
    await R.ctx.close();
  }

  // ===================== E. "+ Add clinic" and the rename =====================
  {
    // E1 — Renova (not first in the team list) adds a clinic: it is hers
    seedCloud();
    const R = await mkPhone('E1-R'); await R.boot('Renova', 'rep');
    const e1 = await R.ev(async () => {
      openAddClinic(); await new Promise(r => setTimeout(r, 30));
      const chips = [...document.querySelectorAll('#mClinicRep .chip')].map(c => c.dataset.rep);
      document.getElementById('mClinicName').value = 'Probe New Clinic'; await submitAddClinic(); await new Promise(r => setTimeout(r, 100));
      const c = clinics.find(x => x.name === 'Probe New Clinic');
      return { chips, savedRep: c && c.rep, visible: !!(c && canViewClinic(c)) };
    });
    check('E1. a rep\'s new clinic is hers: no other seller offered, saved under Renova and on her list',
      JSON.stringify(e1.chips) === '["Renova"]' && e1.savedRep === 'Renova' && e1.visible && (parse(cloud.clinics).find(c => c.name === 'Probe New Clinic') || {}).rep === 'Renova', e1);
    await R.ctx.close();
    // E6 — a new clinic the rules refuse: not left on her list (it would look added), the sheet still holds what she typed
    seedCloud();
    const R6 = await mkPhone('E6-R'); await R6.boot('Renova', 'rep');
    mode.deny = { re: /^clinics$/, ops: 'w' };
    const e6 = await R6.ev(async () => {
      openAddClinic(); await new Promise(r => setTimeout(r, 30));
      document.getElementById('mClinicName').value = 'E6 Refused Clinic'; window.__toasts = []; await submitAddClinic(); await new Promise(r => setTimeout(r, 60));
      return { inMem: clinics.some(c => c.name === 'E6 Refused Clinic'), open: document.getElementById('modalBack').classList.contains('show'),
        typed: (document.getElementById('mClinicName') || {}).value, queued: outboxHas('clinics'), ask: (document.getElementById('mClinicAsk') || {}).innerText || '', toasts: window.__toasts.slice() };
    });
    mode.deny = null;
    await R6.tick();
    check('E6. a new clinic the rules refuse is not left on her list: "Not allowed, not saved", the sheet stays open with what she typed and says so, nothing queued, nothing uploads later',
      !e6.inMem && e6.open && e6.typed === 'E6 Refused Clinic' && /Not allowed, not saved/.test(e6.ask) && !e6.queued && e6.toasts.includes(NOT_ALLOWED)
        && !e6.toasts.some(t => /New clinic added/.test(t)) && !parse(cloud.clinics).some(c => c.name === 'E6 Refused Clinic'), e6);
    await R6.ctx.close();
    // E4 — a rep adding a clinic whose name pulls another person's sales: the supervisor decides, nothing saved
    seedCloud();
    const R2 = await mkPhone('E4-M'); await R2.boot('Mariam', 'rep');
    const e4m = await R2.ev(async () => { openAddClinic(); document.getElementById('mClinicName').value = 'Bright Smile Dental'; await submitAddClinic();
      return { saved: clinics.some(c => c.name === 'Bright Smile Dental'), ask: (document.getElementById('mClinicAsk') || {}).innerText || '' }; });
    check('E4. Mariam adding a clinic whose name matches sales that count for Renova now: nothing saved, the supervisor adds it',
      !e4m.saved && /count for another person now/.test(e4m.ask) && /Renova/.test(e4m.ask) && !parse(cloud.clinics).some(c => c.name === 'Bright Smile Dental'), e4m);
    await R2.ctx.close();

    // E2 / E3 — the supervisor: nothing preselected; a name that pulls sales is asked first, "Count from this month" keeps the closed month
    seedCloud();
    const S = await mkPhone('E2-S'); await S.boot('Dr. Ghaith', 'supervisor');
    const e2 = await S.ev(async () => {
      openAddClinic(); await new Promise(r => setTimeout(r, 30));
      const on = document.querySelectorAll('#mClinicRep .chip.on').length;
      document.getElementById('mClinicName').value = 'Unpicked Clinic'; window.__toasts = []; await submitAddClinic();
      return { on, saved: clinics.some(c => c.name === 'Unpicked Clinic'), toasts: window.__toasts.slice() };
    });
    check('E2. the supervisor picks whose clinic it is: nothing preselected, and nothing saved until he does',
      e2.on === 0 && !e2.saved && e2.toasts.includes('Choose whose clinic this is'), e2);
    const e3 = await S.ev(async () => {
      closeModal(); openAddClinic();
      document.getElementById('mClinicName').value = 'Bright Smile Dental';
      document.querySelector('#mClinicRep .chip[data-rep="Mariam"]').click();
      await submitAddClinic();
      const asked = (document.getElementById('mClinicAsk') || {}).innerText || '';
      const savedBefore = clinics.some(c => c.name === 'Bright Smile Dental');
      const btn = [...document.querySelectorAll('#mClinicAsk [data-ask]')].find(b => /Count from this month/.test(b.textContent));
      if(btn) await submitAddClinic(btn.dataset.ask);
      const c = clinics.find(x => x.name === 'Bright Smile Dental');
      const p = erpPeriods()[0];
      const who = unpackErpRows(p.rows).filter(r => r.customer === 'Bright Smile Dental').map(r => [r.date, UMCore.erpRowRep(r, clinics, erpMap, p.repMap)]);
      return { asked, savedBefore, hadButton: !!btn, rep: c && c.rep, prevRep: c && c.prevRep, repSince: c && c.repSince, who };
    });
    check('E3. a name that makes sales count for another person is asked in the sheet first (2 lines, 1 in a closed month); "Count from this month" keeps October with Renova, November counts for Mariam',
      /2 sales lines would count for/.test(e3.asked) && /closed months/.test(e3.asked) && !e3.savedBefore && e3.hadButton && e3.rep === 'Mariam' && e3.prevRep === 'Renova' && e3.repSince === '2026-11-01'
        && JSON.stringify(e3.who) === JSON.stringify([['2026-10-20', 'Renova'], ['2026-11-05', 'Mariam']]) && (parse(cloud.clinics).find(c => c.name === 'Bright Smile Dental') || {}).prevRep === 'Renova', e3);
    // E5 — a rename carries the handover's previous owner (closed months stay with the renamed person)
    const e5 = await S.ev(async () => {
      closeModal();
      const i = staff.findIndex(s => s.name === 'Mariam'); openStaffForm(i); await new Promise(r => setTimeout(r, 30));
      document.getElementById('sfName').value = 'Mariam K'; window.__toasts = []; await saveStaff(i); await new Promise(r => setTimeout(r, 200));
      const h = clinics.find(c => c.id === 'h1');
      return { prevRep: h && h.prevRep, toasts: window.__toasts.slice() };
    });
    check('E5. renaming Mariam → "Mariam K" renames the previous owner of her handed-over clinic too (its earlier months keep counting for her)',
      e5.prevRep === 'Mariam K' && (parse(cloud.clinics).find(c => c.id === 'h1') || {}).prevRep === 'Mariam K' && e5.toasts.includes('✅ Team updated'), e5);
    await S.ctx.close();

    // E7 / E8 (v123 review) — the two other ways to make a clinic run the same check: the visit
    // form's "New clinic" and the order form's "+ Add a new customer" (they moved Renova's
    // October invoice to Mariam). A rep is stopped, the form keeps what she typed; the supervisor is asked.
    const whoGets = ph => ph.ev(() => { const p = erpPeriods()[0]; return unpackErpRows(p.rows).filter(r => r.customer === 'Bright Smile Dental').map(r => [r.date, UMCore.erpRowRep(r, clinics, erpMap, p.repMap)]); });
    const RENOVAS = JSON.stringify([['2026-10-20', 'Renova'], ['2026-11-05', 'Renova']]);
    seedCloud();
    const M7 = await mkPhone('E7-M'); await M7.boot('Mariam', 'rep');
    const e7 = await M7.ev(async () => {
      closeModal(); switchView('log'); prepLogView(); startNewClinic();
      document.getElementById('newClinicName').value = 'Bright Smile Dental';
      document.getElementById('visitNotes').value = 'E7 first visit at a new clinic';
      window.__toasts = []; await saveVisit();
      return { clinic: clinics.some(c => c.name === 'Bright Smile Dental'), visit: visits.some(v => v && v.notes === 'E7 first visit at a new clinic'), typed: document.getElementById('newClinicName').value,
        notes: document.getElementById('visitNotes').value, ask: (document.getElementById('newClinicAsk') || {}).innerText || '', toasts: window.__toasts.slice() };
    });
    const w7 = await whoGets(M7);
    check('E7. the visit form\'s "New clinic" checks the sales first: a name that pulls Renova\'s sales (October too) is not saved for Mariam — no clinic, no visit, the form keeps what she typed, the supervisor adds it',
      !e7.clinic && !e7.visit && e7.typed === 'Bright Smile Dental' && e7.notes === 'E7 first visit at a new clinic' && /count for another person now/.test(e7.ask) && /Renova/.test(e7.ask)
        && JSON.stringify(w7) === RENOVAS && !parse(cloud.clinics).some(c => c.name === 'Bright Smile Dental') && !cloudVisits().some(v => v.notes === 'E7 first visit at a new clinic'), { e7, who: w7 });
    await M7.ctx.close();
    seedCloud();
    const S7 = await mkPhone('E7-S'); await S7.boot('Dr. Ghaith', 'supervisor');
    const e7s = await S7.ev(async () => {
      closeModal(); switchView('log'); prepLogView(); setLogAsRep('Mariam'); startNewClinic();
      document.getElementById('newClinicName').value = 'Bright Smile Dental';
      document.getElementById('visitNotes').value = 'E7 the supervisor logs it for Mariam';
      await saveVisit();
      const asked = (document.getElementById('newClinicAsk') || {}).innerText || '';
      const savedBefore = clinics.some(c => c.name === 'Bright Smile Dental');
      const btn = [...document.querySelectorAll('#newClinicAsk [data-ask]')].find(b => /Count from this month/.test(b.textContent));
      if(btn) await saveVisit(btn.dataset.ask);
      const c = clinics.find(x => x.name === 'Bright Smile Dental');
      return { asked, savedBefore, hadButton: !!btn, rep: c && c.rep, prevRep: c && c.prevRep, repSince: c && c.repSince, visit: visits.some(v => v && v.notes === 'E7 the supervisor logs it for Mariam') };
    });
    const w7s = await whoGets(S7);
    check('E7s. …the supervisor logging it is asked first; "Count from this month" keeps October with Renova, the clinic and the visit are saved',
      /sales lines would count for/.test(e7s.asked) && !e7s.savedBefore && e7s.hadButton && e7s.rep === 'Mariam' && e7s.prevRep === 'Renova' && e7s.repSince === '2026-11-01' && e7s.visit
        && JSON.stringify(w7s) === JSON.stringify([['2026-10-20', 'Renova'], ['2026-11-05', 'Mariam']]) && (parse(cloud.clinics).find(c => c.name === 'Bright Smile Dental') || {}).prevRep === 'Renova', { e7s, who: w7s });
    await S7.ctx.close();
    seedCloud();
    const M8 = await mkPhone('E8-M'); await M8.boot('Mariam', 'rep');
    const e8 = await M8.ev(async () => {
      openStandaloneOrder(); startSoNewClinic();
      document.getElementById('soNewClinicName').value = 'Bright Smile Dental';
      soItems[productKey(products[0])] = 1;
      window.__toasts = []; await saveStandaloneOrder();
      return { clinic: clinics.some(c => c.name === 'Bright Smile Dental'), order: visits.some(v => v && v.orderOnly), open: document.getElementById('modalBack').classList.contains('show'),
        typed: (document.getElementById('soNewClinicName') || {}).value, ask: (document.getElementById('soNewClinicAsk') || {}).innerText || '' };
    });
    const w8 = await whoGets(M8);
    check('E8. the order form\'s "+ Add a new customer" checks the sales first: not saved for Mariam (no customer, no order), the form stays open with what she typed',
      !e8.clinic && !e8.order && e8.open && e8.typed === 'Bright Smile Dental' && /count for another person now/.test(e8.ask) && JSON.stringify(w8) === RENOVAS
        && !parse(cloud.clinics).some(c => c.name === 'Bright Smile Dental'), { e8, who: w8 });
    await M8.ctx.close();
    // E9–E12 (re-review 3) — the remaining ways to make a clinic run the same check. The call
    // log's "+ Add a new customer" made one with no check at all (Mariam's new customer took
    // Renova's October and November invoices, toast "🌟 New customer added"); so did the two
    // imports and "Re-create this clinic".
    seedCloud();
    const M9 = await mkPhone('E9-M'); await M9.boot('Mariam', 'rep');
    const e9 = await M9.ev(async () => {
      openCallLog(); startClNewClinic();
      document.getElementById('clNewClinicName').value = 'Bright Smile Dental';
      document.getElementById('clNotes').value = 'E9 first call with a new customer';
      window.__toasts = []; await saveCallLog();
      return { clinic: clinics.some(c => c.name === 'Bright Smile Dental'), call: visits.some(v => v && v.callOnly), open: document.getElementById('modalBack').classList.contains('show'),
        typed: (document.getElementById('clNewClinicName') || {}).value, notes: (document.getElementById('clNotes') || {}).value, ask: (document.getElementById('clNewClinicAsk') || {}).innerText || '', toasts: window.__toasts.slice() };
    });
    const w9 = await whoGets(M9);
    check('E9. the call log\'s "+ Add a new customer" checks the sales first: not saved for Mariam (no customer, no call, no "New customer added"), the form stays open with what she typed, Renova\'s invoices stay hers',
      !e9.clinic && !e9.call && e9.open && e9.typed === 'Bright Smile Dental' && e9.notes === 'E9 first call with a new customer' && /count for another person now/.test(e9.ask) && /Renova/.test(e9.ask)
        && !e9.toasts.some(t => /New customer added|logged/.test(t)) && JSON.stringify(w9) === RENOVAS && !parse(cloud.clinics).some(c => c.name === 'Bright Smile Dental') && !cloudVisits().some(v => v.callOnly), { e9, who: w9 });
    await M9.ctx.close();
    seedCloud();
    const S9 = await mkPhone('E9-S'); await S9.boot('Dr. Ghaith', 'supervisor');
    const e9s = await S9.ev(async () => {
      openCallLog(); startClNewClinic();
      document.getElementById('clNewClinicName').value = 'Bright Smile Dental';
      document.getElementById('clNotes').value = 'E9 the supervisor logs the call';
      await saveCallLog();
      const asked = (document.getElementById('clNewClinicAsk') || {}).innerText || '';
      const savedBefore = clinics.some(c => c.name === 'Bright Smile Dental');
      const btn = [...document.querySelectorAll('#clNewClinicAsk [data-ask]')].find(b => /Count from this month/.test(b.textContent));
      if(btn) await saveCallLog(btn.dataset.ask);
      const c = clinics.find(x => x.name === 'Bright Smile Dental');
      return { asked, savedBefore, hadButton: !!btn, rep: c && c.rep, prevRep: c && c.prevRep, repSince: c && c.repSince, call: visits.some(v => v && v.callOnly && v.notes === 'E9 the supervisor logs the call') };
    });
    const w9s = await whoGets(S9);
    check('E9s. …the supervisor logging the call is asked first; "Count from this month" keeps October with Renova, the customer and the call are saved',
      /sales lines would count for/.test(e9s.asked) && !e9s.savedBefore && e9s.hadButton && e9s.rep === 'Dr. Ghaith' && e9s.prevRep === 'Renova' && e9s.repSince === '2026-11-01' && e9s.call
        && JSON.stringify(w9s) === JSON.stringify([['2026-10-20', 'Renova'], ['2026-11-05', 'Dr. Ghaith']]) && (parse(cloud.clinics).find(c => c.name === 'Bright Smile Dental') || {}).prevRep === 'Renova', { e9s, who: w9s });
    await S9.ctx.close();
    // E10 — Admin → Manage clinics → Import: every account whose invoices would move is shown in the import's confirmation; none moves without the supervisor's tap
    seedCloud();
    const S10 = await mkPhone('E10-S'); await S10.boot('Dr. Ghaith', 'supervisor');
    const e10 = await S10.ev(async () => {
      openManageClinics();
      const chip = [...document.querySelectorAll('#ciRepChips .chip')].find(c => c.dataset.rep === 'Mariam'); if(chip) pickModalRep(chip);
      await handleClinicSheet({ files: [new File(['Clinic name,Phone\nBright Smile Dental,\nNew Horizon Dental,\n'], 'clinics.csv', { type: 'text/csv' })] });
      const found = _clinicImport ? _clinicImport.rows.map(x => x.data.name) : null;
      window.__toasts = []; await commitClinicImport();
      const asked = (document.getElementById('ciAsk') || {}).innerText || '';
      const rows = [...document.querySelectorAll('#ciAsk [data-bulkmove]')].map(r => r.innerText.replace(/\s+/g, ' '));
      const savedBefore = clinics.filter(c => /Bright Smile|New Horizon/.test(c.name)).map(c => c.name);
      // he unticks the clinic whose invoices would move and adds the rest
      _clinicImport.rows.find(x => x.data.name === 'Bright Smile Dental').include = false;
      await commitClinicImport();
      return { found, asked, rows, savedBefore, after: clinics.filter(c => /Bright Smile|New Horizon/.test(c.name)).map(c => c.name + ' → ' + c.rep), toasts: window.__toasts.slice() };
    });
    const w10 = await whoGets(S10);
    check('E10. the clinic import shows every account whose invoices would move (who they count for now → then, lines, closed months) before anything is saved; unticked, the rest is added and Renova\'s invoices stay hers',
      /Sales would then count for another person/.test(e10.asked) && e10.rows.length === 1 && /Bright Smile Dental: Renova → Mariam · 2 sales lines/.test(e10.rows[0]) && /1 in closed months/.test(e10.rows[0]) && /untick those clinics and add the rest/.test(e10.asked) && !e10.savedBefore.length
        && JSON.stringify(e10.after) === JSON.stringify(['New Horizon Dental → Mariam']) && JSON.stringify(w10) === RENOVAS && !parse(cloud.clinics).some(c => c.name === 'Bright Smile Dental') && parse(cloud.clinics).some(c => c.name === 'New Horizon Dental'), { e10, who: w10 });
    await S10.ctx.close();
    seedCloud();
    const S10b = await mkPhone('E10-S2'); await S10b.boot('Dr. Ghaith', 'supervisor');
    const e10b = await S10b.ev(async () => {
      openManageClinics();
      const chip = [...document.querySelectorAll('#ciRepChips .chip')].find(c => c.dataset.rep === 'Mariam'); if(chip) pickModalRep(chip);
      await handleClinicSheet({ files: [new File(['Clinic name,Phone\nBright Smile Dental,\nNew Horizon Dental,\n'], 'clinics.csv', { type: 'text/csv' })] });
      await commitClinicImport();
      const savedBefore = clinics.some(c => c.name === 'Bright Smile Dental');
      const btn = document.querySelector('#ciAsk [data-ask]');
      if(btn) await commitClinicImport(btn.dataset.ask);
      return { savedBefore, hadButton: !!btn, after: clinics.filter(c => /Bright Smile|New Horizon/.test(c.name)).map(c => c.name + ' → ' + c.rep) };
    });
    const w10b = await whoGets(S10b);
    check('E10b. …and with the supervisor\'s tap ("Add them") both are added and those invoices count for the new clinic\'s owner — never before the tap',
      !e10b.savedBefore && e10b.hadButton && e10b.after.length === 2 && JSON.stringify(w10b) === JSON.stringify([['2026-10-20', 'Mariam'], ['2026-11-05', 'Mariam']]), { e10b, who: w10b });
    await S10b.ctx.close();
    // E11 — the contact import makes a clinic for a name the list does not have
    seedCloud();
    const S11 = await mkPhone('E11-S'); await S11.boot('Dr. Ghaith', 'supervisor');
    const e11 = await S11.ev(async () => {
      openContactImport();
      await handleContactSheet({ files: [new File(['Doctor name,Clinic\nDr. Lina Sample,Bright Smile Dental\n'], 'contacts.csv', { type: 'text/csv' })] });
      const plan = _contactImport ? _contactImport.plan.map(x => x.action.type + ':' + (x.action.clinicName || '')) : null;
      const chip = [...document.querySelectorAll('#ciRep2 .chip')].find(c => c.dataset.rep === 'Mariam'); if(chip) pickModalRep(chip);
      window.__toasts = []; await commitContactImport();
      const asked = (document.getElementById('ciAsk2') || {}).innerText || '';
      const rows = [...document.querySelectorAll('#ciAsk2 [data-bulkmove]')].map(r => r.innerText.replace(/\s+/g, ' '));
      const savedBefore = clinics.some(c => c.name === 'Bright Smile Dental');
      const cancel = [...document.querySelectorAll('#ciAsk2 button')].find(b => !b.dataset.ask); if(cancel) cancel.click();
      return { plan, asked, rows, savedBefore, open: document.getElementById('modalBack').classList.contains('show'), askAfterCancel: (document.getElementById('ciAsk2') || {}).innerText || '', toasts: window.__toasts.slice() };
    });
    const w11 = await whoGets(S11);
    check('E11. the contact import shows the account whose invoices its new clinic would move before anything is saved; Cancel leaves everything as it was',
      /newClinic:Bright Smile Dental/.test((e11.plan || []).join()) && /Sales would then count for another person/.test(e11.asked) && e11.rows.length === 1 && /Bright Smile Dental: Renova → Mariam · 2 sales lines/.test(e11.rows[0]) && /add those clinics first/.test(e11.asked) && !e11.savedBefore && e11.open && !e11.askAfterCancel
        && JSON.stringify(w11) === RENOVAS && !parse(cloud.clinics).some(c => c.name === 'Bright Smile Dental'), { e11, who: w11 });
    await S11.ctx.close();
    // E12 — "Re-create this clinic" (a clinic visits still name, gone from the list): its name is checked like a new clinic's
    seedCloud({ visits: JSON.stringify([visit('vGone', 'cGone', 'Mariam', { clinicName: 'Bright Smile Dental', date: '2026-11-10', notes: 'a visit at a clinic no longer on the list' })]) });
    const S12 = await mkPhone('E12-S'); await S12.boot('Dr. Ghaith', 'supervisor');
    const e12 = await S12.ev(async () => {
      openRecreateClinic('cGone');
      const name = document.getElementById('rcName').value;
      const chip = [...document.querySelectorAll('#rcRepChips .chip')].find(c => c.dataset.rep === 'Mariam'); if(chip) pickModalRep(chip);
      await confirmRecreateClinic('cGone');
      const asked = (document.getElementById('rcAsk') || {}).innerText || '';
      const savedBefore = clinics.some(c => c.id === 'cGone');
      const btn = [...document.querySelectorAll('#rcAsk [data-ask]')].find(b => /Count from this month/.test(b.textContent));
      if(btn) await confirmRecreateAsked(btn.dataset.ask);
      const c = clinics.find(x => x.id === 'cGone');
      return { name, asked, savedBefore, hadButton: !!btn, rep: c && c.rep, prevRep: c && c.prevRep, repSince: c && c.repSince };
    });
    const w12 = await whoGets(S12);
    check('E12. re-creating a clinic whose name matches another person\'s sales is asked first; "Count from this month" keeps October with Renova, and the clinic is back under its own id',
      e12.name === 'Bright Smile Dental' && /sales lines would count for/.test(e12.asked) && !e12.savedBefore && e12.hadButton && e12.rep === 'Mariam' && e12.prevRep === 'Renova' && e12.repSince === '2026-11-01'
        && JSON.stringify(w12) === JSON.stringify([['2026-10-20', 'Renova'], ['2026-11-05', 'Mariam']]) && (parse(cloud.clinics).find(c => c.id === 'cGone') || {}).prevRep === 'Renova', { e12, who: w12 });
    await S12.ctx.close();
    // E13 (round 4, finding 2) — the order form's new customer, saved with no product first: the
    // clinic was put on the list before "Add at least one product" stopped the save, so the second
    // Save took it for an existing customer and never saved the clinics list (the order pointed at
    // a clinic no other phone — nor this one after a refresh — had)
    seedCloud();
    const M13 = await mkPhone('E13-M'); await M13.boot('Mariam', 'rep');
    const e13 = await M13.ev(async () => {
      openStandaloneOrder(); startSoNewClinic();
      document.getElementById('soNewClinicName').value = 'Fresh Smile Kids Clinic';
      document.getElementById('soNewClinicPhone').value = '12345';
      window.__toasts = []; await saveStandaloneOrder();                 // no product yet
      const first = { toasts: window.__toasts.slice(), onList: clinics.some(c => c.name === 'Fresh Smile Kids Clinic'), typed: (document.getElementById('soNewClinicName') || {}).value };
      soItems[productKey(products[0])] = 1;
      window.__toasts = []; await saveStandaloneOrder();
      return { first, second: window.__toasts.slice() };
    });
    await M13.tick(); await M13.tick();
    const order13 = cloudVisits().find(v => v && v.orderOnly), cl13 = parse(cloud.clinics).find(c => c.name === 'Fresh Smile Kids Clinic');
    const after13 = await M13.ev(() => { const v = visits.find(x => x && x.orderOnly); return { onPhone: clinics.filter(c => c.name === 'Fresh Smile Kids Clinic').map(c => c.id), label: v ? clinicLabel(v.clinicId, v) : null }; });
    check('E13. the order form\'s new customer saved before a product was added: "Add at least one product" adds no customer; the second Save adds the customer (with its phone) and the order together — both in the cloud, the order points at it, still there after a refresh',
      e13.first.toasts.some(t => /Add at least one product/.test(t)) && !e13.first.onList && e13.first.typed === 'Fresh Smile Kids Clinic'
        && e13.second.some(t => /New customer added/.test(t)) && !e13.second.some(t => /already exists/.test(t))
        && !!order13 && !!cl13 && order13.clinicId === cl13.id && cl13.phone === '12345' && after13.onPhone.join() === cl13.id && after13.label === 'Fresh Smile Kids Clinic',
      { e13, orderClinicId: order13 && order13.clinicId, inCloud: cl13 ? { id: cl13.id, phone: cl13.phone } : null, after: after13 });
    await M13.ctx.close();
    // E13b–d — the new customer's own save refused by the rules: the order, the call or the visit
    // was saved all the same, pointing at a clinic that was never saved (gone at the next refresh)
    for(const form of ['order', 'call', 'visit']){
      seedCloud();
      const P = await mkPhone('E13-' + form); await P.boot('Mariam', 'rep');
      mode.deny = { re: /^clinics$/, ops: 'w' };
      const r = await P.ev(async form => {
        const NAME = 'Fresh Smile Kids Clinic';
        if(form === 'order'){ openStandaloneOrder(); startSoNewClinic(); document.getElementById('soNewClinicName').value = NAME; soItems[productKey(products[0])] = 1; window.__toasts = []; await saveStandaloneOrder(); }
        if(form === 'call'){ openCallLog(); startClNewClinic(); document.getElementById('clNewClinicName').value = NAME; document.getElementById('clNotes').value = 'E13 first call'; window.__toasts = []; await saveCallLog(); }
        if(form === 'visit'){ closeModal(); switchView('log'); prepLogView(); startNewClinic(); document.getElementById('newClinicName').value = NAME; document.getElementById('visitNotes').value = 'E13 first visit'; window.__toasts = []; await saveVisit(); }
        const typed = (document.getElementById(form === 'order' ? 'soNewClinicName' : form === 'call' ? 'clNewClinicName' : 'newClinicName') || {}).value;
        return { toasts: window.__toasts.slice(), onList: clinics.some(c => c.name === NAME), record: visits.some(v => v && (v.orderOnly || v.callOnly || v.notes === 'E13 first visit')), typed };
      }, form);
      mode.deny = null;
      const inCloud = cloudVisits().some(v => v && (v.orderOnly || v.callOnly || v.notes === 'E13 first visit'));
      check(`E13${{ order: 'b', call: 'c', visit: 'd' }[form]}. [${form}] the rules refuse the new customer's save: the ${form} is not saved either (it would point at a clinic nobody has) — the words say not allowed, not saved; no customer on the list, the form keeps the name`,
        !inCloud && !r.record && !r.onList && r.typed === 'Fresh Smile Kids Clinic' && r.toasts.some(t => /Not allowed, not saved/.test(t)) && !r.toasts.some(t => /New customer added|Order saved|logged|Visit saved/i.test(t)),
        { r, inCloud });
      await P.ctx.close();
    }
  }

  // ===================== F. the Assistant =====================
  {
    seedCloud();
    const A = await mkPhone('F1-A'); await A.boot('Mariam', 'rep');
    const n0 = outside.length;
    const f1 = await A.ev(async () => {
      const fab = document.getElementById('aiFab');
      switchView('more'); renderMore();
      const tile = /Ask anything about your data/.test((document.getElementById('view-more') || document.body).innerText);
      openAssistant();
      const text = (document.getElementById('modalInner') || {}).innerText || '';
      if(typeof sendAssistant === 'function'){ const i = document.getElementById('aiInput'); if(i){ i.value = 'hello'; } try{ await sendAssistant(); }catch(e){} }
      await new Promise(r => setTimeout(r, 200));
      return { fabShown: !!(fab && getComputedStyle(fab).display !== 'none'), tile, text, endpoint: typeof AI_ENDPOINT !== 'undefined' };
    });
    check('F1. the Assistant sends nothing anywhere: no ✨ button, no More tile, no endpoint; opening it says it is not available',
      !f1.fabShown && !f1.tile && !f1.endpoint && /not available/.test(f1.text) && outside.length === n0, { f1, sent: outside.slice(n0) });
    await A.ctx.close();
  }

  // ===================== G. save actions tell the truth =====================
  {
    seedCloud();
    const A = await mkPhone('G-A'); await A.boot('Mariam', 'rep');
    mode.deny = { re: /^dayPlans$/, ops: 'w' };
    const g1 = await A.ev(async () => { window.__toasts = []; await addToPlan('c1'); return window.__toasts.slice(); });
    mode.deny = null;
    check('G1. "Add to today\'s plan" refused: never "Added to today\'s plan"', g1.includes(NOT_ALLOWED) && !g1.includes("Added to today's plan"), g1);
    mode.offline.add('G-A');
    const g2 = await A.ev(async () => { openEventForm(null, todayStr()); document.getElementById('evTitle').value = 'G2 event'; window.__toasts = []; _lastOfflineToast = 0; await saveEventForm(''); return window.__toasts.slice(); });
    mode.offline.delete('G-A');
    check('G2. an event saved with no connection says it is kept on this device (it is queued) — never "Event added 📅"', !g2.includes('Event added 📅') && g2.some(t => /Saved on this device/.test(t)), g2);
    await A.ctx.close();
    seedCloud();
    const S = await mkPhone('G-S'); await S.boot('Dr. Ghaith', 'supervisor');
    mode.deny = { re: /^targets$/, ops: 'w' };
    const g3 = await S.ev(async () => {
      const i = staff.findIndex(s => s.name === 'Renova'); openStaffForm(i); await new Promise(r => setTimeout(r, 30));
      document.getElementById('sfName').value = 'Renova B'; window.__toasts = []; await saveStaff(i); await new Promise(r => setTimeout(r, 200));
      return window.__toasts.slice();
    });
    mode.deny = null;
    check('G3. a rename whose target save is refused never says "✅ Team updated"', !g3.includes('✅ Team updated') && g3.includes(NOT_ALLOWED), g3);
    await S.ctx.close();
  }

  // ===================== H. both halves of v123 together =====================
  // The sync core (whole documents by one compare-and-set, the restore that
  // keeps today's data first) and the truthful saves (sizes, refusals, the
  // words a screen says) meet here; each check failed on their first merge.
  {
    // H1 — another device saved the targets first: the screen's last word is "Changed on another device", never a vaguer one
    seedCloud();
    const S1 = await mkPhone('H1-S1'), S2 = await mkPhone('H1-S2');
    await S1.boot('Dr. Ghaith', 'supervisor'); await S2.boot('Dr. Ghaith', 'supervisor');
    await S2.ev(async () => { targets.Mariam.revenue = 7777; await persist('targets'); });
    const h1 = await S1.ev(async () => {
      openAdminPanel(); setAdminTab('team'); await new Promise(r => setTimeout(r, 60));
      const el = document.getElementById('tgRev0'); if(!el) return { err: 'no target input' };
      el.value = '5555'; window.__toasts = [];
      await saveTargets(); await new Promise(r => setTimeout(r, 60));
      return { toasts: window.__toasts.slice(), pill: (document.getElementById('refusedPill') || {}).textContent || '' };
    });
    check('H1. a targets save refused because another device saved first: the last word on screen is "Changed on another device — reopen the app, then save again" (not replaced by a vaguer "Not saved"), the bar stays, never "saved", the other device\'s figure kept',
      !!h1.toasts && /^⚠️ Changed on another device/.test(h1.toasts[h1.toasts.length - 1] || '') && !h1.toasts.some(t => /targets saved|reopen the app, then try again/.test(t)) && /changed on another device/.test(h1.pill) && parse(cloud.targets).Mariam.revenue === 7777, h1);
    await S1.ctx.close(); await S2.ctx.close();

    // H2 — no answer from the cloud in time (the transaction may still land): said as that, never as "not saved"
    seedCloud();
    const S = await mkPhone('H2-S'); await S.boot('Dr. Ghaith', 'supervisor');
    const h2 = await S.ev(async () => {
      const real = window.storage.update;
      window.storage.update = (k, fn) => k === 'targets' ? Promise.reject(new Error('timeout')) : real(k, fn); // what withTimeout throws after 12 s
      openAdminPanel(); setAdminTab('team'); await new Promise(r => setTimeout(r, 60));
      document.getElementById('tgRev0').value = '6666'; window.__toasts = []; _lastOfflineToast = 0;
      await saveTargets(); await new Promise(r => setTimeout(r, 60));
      window.storage.update = real;
      return { toasts: window.__toasts.slice(), out: persistOutcome('targets') };
    });
    check('H2. a targets save with no answer from the cloud in time: "No answer from the cloud yet — … to see whether it was saved", never "Not saved — check the connection" nor "saved"',
      h2.toasts.some(t => /No answer from the cloud yet/.test(t)) && !h2.toasts.some(t => /Not saved — check the connection|targets saved/.test(t)) && !!h2.out && h2.out.timeout === true, h2);

    // H3 — a catalog over the cloud's limit: never sent (not even inside the transaction), said by the bar, nothing queued
    const t3 = tries('H2-S', 'products') + writes('H2-S', 'products');
    const h3 = await S.ev(async () => {
      products.push({ id: 'H3-BIG', name: 'H3 big product', brand: 'TEPE', price: 1, notes: 'q'.repeat(1100000) });
      window.__toasts = [];
      const r = await persistTold('products');
      products = products.filter(p => p.id !== 'H3-BIG');
      return { ok: r.ok, tooLarge: !!(r.outcome && r.outcome.tooLarge), queued: outboxHas('products'), toasts: window.__toasts.slice(), bar: (document.getElementById('tooLargeBar') || {}).textContent || '' };
    });
    const t3b = tries('H2-S', 'products') + writes('H2-S', 'products');
    check('H3. a product catalog over the cloud\'s limit is never sent (no 1 MB upload that the cloud refuses), the bar names the catalog, nothing queued',
      h3.ok === false && h3.tooLarge && !h3.queued && t3b === t3 && /the product catalog is too large for the cloud/.test(h3.bar) && !/H3-BIG/.test(cloud.products), { ...h3, sent: t3b - t3 });
    await S.ctx.close();

    // H4 — the whole-day Restore keeps today's data first: measured like the daily backup (above 900 KB without the previews), so a big month can still be restored
    const liveV = ['1', '2'].map(i => visit('vH4-' + i, 'c1', 'Mariam', { notes: 'H4 visit ' + i, photos: [{ id: 'pH4-' + i, thumb: thumb('H', 440000) }] }));
    const extraV = visit('vH4-new', 'c2', 'Renova', { notes: 'H4 visit after the backup' });
    const manyProducts = Array.from({ length: 700 }, (_, i) => ({ id: 'P' + i, name: 'Product ' + i + ' ' + 'z'.repeat(200), brand: 'TEPE', price: 1 }));
    seedCloud({ visits: JSON.stringify(liveV.concat([extraV])), products: JSON.stringify(manyProducts) });
    cloud['snap_2026-11-12'] = JSON.stringify({ clinics: parse(cloud.clinics), products: manyProducts, visits: liveV.map(v => Object.assign({}, v, { photos: v.photos.map(p => ({ id: p.id })) })), tasks: [], slim: { photos: 2 }, ts: '2026-11-12T20:00:00.000Z' });
    const T = await mkPhone('H4-S'); await T.boot('Dr. Ghaith', 'supervisor');
    const h4 = await T.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-12'); return { toasts: window.__toasts.slice(), mem: visits.map(v => v.id) }; });
    const kept = parse(cloud[SNAP]) || {};
    const keptBytes = Buffer.byteLength(cloud[SNAP] || '', 'utf8');
    const restored = cloudVisits();
    check('H4. a whole-day Restore while today\'s data is above 900 KB: today\'s data is kept first as today\'s backup without the photo previews (every visit and photo id kept), then the restore goes ahead and the restored visits keep their previews',
      kept.keptBeforeRestore === '2026-11-12' && kept.slim && kept.slim.photos === 2 && keptBytes < 1000000 && (kept.visits || []).map(v => v.id).sort().join() === 'vH4-1,vH4-2,vH4-new'
        && h4.toasts.some(t => /^✅ Restored 2026-11-12/.test(t)) && !restored.some(v => v.id === 'vH4-new') && restored.filter(v => /^vH4-\d$/.test(v.id)).every(v => v.photos[0].thumb && v.photos[0].thumb.length > 400000),
      { toasts: h4.toasts, kept: { by: kept.keptBeforeRestore, slim: kept.slim, bytes: keptBytes, visits: (kept.visits || []).map(v => v.id) }, restored: restored.map(v => [v.id, ((v.photos || [])[0] || {}).thumb ? 'thumb' : 'none']) });
    await T.ctx.close();

    // H5 — the recycle bin keeps 30 days in its three-way merge too: a 40-day-old entry another phone (an older app) wrote meanwhile goes, a recent one stays
    seedCloud({ visits: JSON.stringify([visit('vH5', 'c1', 'Mariam', { notes: 'H5 delete' })]) });
    const P = await mkPhone('H5-A'); await P.boot('Mariam', 'rep');
    cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [{ id: 'old-h5', clinicId: 'c1', _deletedAt: CLOCK - 40 * DAY, _label: 'old' }, { id: 'new-h5', clinicId: 'c1', _deletedAt: CLOCK - DAY, _label: 'recent' }] });
    await P.ev(async () => { await deleteVisit('vH5'); });
    const bin5 = ((parse(cloud.recycleBin) || {}).visits || []).map(x => x.id).sort();
    check('H5. a delete merges the bin with the cloud\'s and keeps 30 days: the entry another phone wrote yesterday stays, its 40-day-old one goes, the visit just deleted is there',
      JSON.stringify(bin5) === JSON.stringify(['new-h5', 'vH5']), bin5);
    await P.ctx.close();

    // H6 — "Restore from this phone's copy" refused by the rules: said for what it is, never "uploads when the connection is back"
    seedCloud();
    const S6 = await mkPhone('H6-S'); await S6.boot('Dr. Ghaith', 'supervisor');
    const oldCopy = JSON.stringify(parse(cloud.clinics).concat([{ id: 'cH6', name: 'H6 Lost Clinic', rep: 'Renova', cls: 'B', doctors: [] }]));
    await S6.ev(c => { localStorage.setItem('um_mirror_prev:clinics', c); }, oldCopy);
    mode.deny = { re: /^clinics$/, ops: 'w' };
    const h6 = await S6.ev(async () => {
      await restoreDeviceClinics('prev'); await new Promise(r => setTimeout(r, 100));
      devCopyToggle('cH6', true); window.__toasts = [];
      await applyDeviceCopy(); await new Promise(r => setTimeout(r, 200));
      return { toasts: window.__toasts.slice(), note: (document.getElementById('devCopyNote') || {}).innerText || '', queued: outboxHas('clinics') };
    });
    mode.deny = null;
    check('H6. the phone-copy restore refused by the rules: "Not allowed, not saved", never "not saved to the cloud yet" or "uploads when the connection is back", nothing queued',
      h6.toasts.includes(NOT_ALLOWED) && !h6.toasts.some(t => /not saved to the cloud yet|updated from this phone's copy/.test(t)) && /Not allowed, not saved/.test(h6.note) && !/uploads when the connection is back/.test(h6.note) && !h6.queued && !parse(cloud.clinics).some(c => c.id === 'cH6'), h6);
    await S6.ctx.close();
  }

  const pe = Object.keys(errors).filter(k => errors[k].length).map(k => k + ': ' + errors[k].slice(0, 3).join(' | '));
  check('no page errors', pe.length === 0, pe);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
