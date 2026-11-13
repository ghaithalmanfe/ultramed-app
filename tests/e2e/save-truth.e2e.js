// Saves told for what they did (v123, audit items 3, 4, 5, 8 and 10), each
// reproduced on a fake cloud before its fix:
//  A  a save the security rules refuse is never queued as "offline": it says
//     "Not allowed, not saved (ask the supervisor)", a queued copy leaves the
//     queue (kept aside on the phone), a refused read says "no access";
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
//     the handover's previous owner;
//  F  the Assistant sends nothing anywhere;
//  G  save actions never say "saved" for a save that did not land.
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

    // A3 — a change queued with no connection, then refused at upload: dropped from the queue (kept aside), never retried every 20 s
    seedCloud();
    const B = await mkPhone('A3-A'); await B.boot('Mariam', 'rep');
    mode.offline.add('A3-A');
    const q3 = await B.ev(async () => { tasks.push({ id: 'tA3', text: 'A3 offline task', done: false, created: todayStr(), rep: 'Mariam' }); const r = await persistFor('tasks'); return { r, queued: outboxHas('tasks') }; });
    mode.offline.delete('A3-A'); mode.deny = { re: /^tasks$/, ops: 'w' };
    await B.ev(() => { window.__toasts = []; });
    await B.tick();
    const a3 = await B.ev(() => ({ outbox: outboxList(), aside: localStorage.getItem('um_refused:tasks'), toasts: window.__toasts.slice() }));
    const t0 = tries('A3-A', 'tasks');
    await B.tick(); await B.tick();
    const t1 = tries('A3-A', 'tasks');
    mode.deny = null;
    check('A3. a queued change the rules refuse at upload leaves the queue (its copy kept aside on the phone), says "Not allowed", and the 20-second round stops sending it',
      q3.queued && a3.outbox.length === 0 && /A3 offline task/.test(a3.aside || '') && a3.toasts.includes(NOT_ALLOWED) && t1 === t0, { q3: q3.queued, a3, triesBefore: t0, triesAfter2Rounds: t1 });
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

  const pe = Object.keys(errors).filter(k => errors[k].length).map(k => k + ': ' + errors[k].slice(0, 3).join(' | '));
  check('no page errors', pe.length === 0, pe);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
