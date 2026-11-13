// The change log ("سجل التغييرات", 17-audit-log.js): every change leaves one
// entry in auditLog:YYYY-MM — who, role, when, the action, which record, the
// changed fields before → after (small, never a whole document, never a
// password or a token), the reason, and what the save did. Checked here: a
// rep's visit add / edit (with a reason) / delete (with a reason); the
// supervisor's clinic edit, handover, shared toggle, team change, targets,
// price, recycle-bin restore; ERP links (a confirmed one stays in erpMapLog
// only and shows on the screen; one that did not land is logged as not
// saved); saves that fail are logged as not saved and the person is told the
// truth; a change log that cannot be written never blocks or slows the
// change itself, and its entries go up once when the cloud is back; a rep
// sees her own entries only; the screen filters by person, kind and month,
// says when a month could not be read, and speaks Arabic. Port 8241.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8241;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ---- fake cloud (Node side: survives reloads). failSet / failGet: matching keys throw; hangSet: a write that never answers;
// gate: a sales commit (setMany) that waits until the harness lets it through; auditUpdates: the change log's appends counted ----
const cloud = {};
const mode = { failSet: null, failGet: null, hangSet: null, gate: null, auditUpdates: 0 };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => {
    if(mode.hangSet && mode.hangSet.test(k)) return new Promise(() => {});
    if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set');
    cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(mode.gate) await mode.gate; if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
  count: async k => { if(/^auditLog:/.test(k)) mode.auditUpdates++; return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0, 700):'')); if(!ok) failed++; }
const J = k => { try{ return JSON.parse(cloud[k]); }catch(e){ return null; } };
const NOV = 'auditLog:2026-11', OCT = 'auditLog:2026-10';
const log = () => ((J(NOV) || {}).entries || []);
const G = 'Dr. Ghaith', M = 'Mariam', R = 'Renova';
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  Object.assign(mode, { failSet: null, failGet: null, hangSet: null, gate: null });
  cloud.staff = JSON.stringify([{ name: M, role: 'rep', email: 'mariam@example.com' }, { name: R, role: 'rep', email: 'renova@example.com' },
    { name: G, role: 'supervisor', email: 'ghaith@example.com', sells: false }]);
  cloud.clinics = JSON.stringify([
    { id: 'm1', name: 'Dental 8 Clinic', rep: M, cls: 'A', phone: '', doctors: [{ id: 'm1-d1', name: 'Dr. Huda Ali', title: 'Orthodontist' }] },
    { id: 'm2', name: 'Smile Care Clinic', rep: M, cls: 'B', phone: '', doctors: [{ id: 'm2-d1', name: 'Dr. Sara Nasser' }] },
    { id: 'r1', name: 'Crown Dental Center', rep: R, cls: 'A', doctors: [] }]);
  cloud.products = JSON.stringify([{ id: 'P1', name: 'Sonicare 4300', brand: 'Philips', price: 30 }]);
  cloud.visits = JSON.stringify([]);
  cloud.targets = JSON.stringify({ [M]: { revenue: 1000, visits: 20, month: '2026-11' }, [R]: { revenue: 1200, visits: 20, month: '2026-11' } });
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.erpMap = JSON.stringify({ 'Conflict Co': 'm2' });
  // the one-time repair sweeps of earlier releases have run, as on the team's phones
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: {}, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, periods: [] });
  cloud.erpSales = JSON.stringify(sp.index); Object.keys(sp.docs).forEach(k => { cloud[k] = JSON.stringify(sp.docs[k]); });
  cloud[OCT] = JSON.stringify({ v: 1, month: '2026-10', entries: [{ eid: 'oct1', at: '2026-10-20T07:00:00.000Z', by: R, role: 'rep', action: 'visit.add', key: 'visits', id: 'vOct',
    label: 'Crown Dental Center · 2026-10-20', before: null, after: { date: '2026-10-20', notes: 'October visit' }, reason: null, ok: true, res: 'saved' }], dropped: 0, trimmed: 0 });
}

(async()=>{
  const server = http.createServer((req,res)=>{
    const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
  });
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort()); // hermetic
  const page = await ctx.newPage();
  const errors = [], tripwire = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { const t = m.text();
    if(m.type() === 'error' && /the change log is appended by auditRecord/.test(t)){ tripwire.push(t); return; }
    if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-(set|get)|update failed|set refused|erpSales save failed Error: timeout/i.test(t)) errors.push('console: ' + t.slice(0, 200)); });
  page.on('dialog', d => d.accept());
  for(const [n, f] of Object.entries({ __cGet: api.get, __cSet: api.set, __cDel: api.del, __cList: api.list, __cSetMany: api.setMany, __cCount: api.count })) await page.exposeFunction(n, f);
  await page.addInitScript(() => {
    // with update(): the read-merge-write the app runs as a Firestore transaction (here a read then a write)
    window.storage = {
      get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.__cSet(k, v),
      update: async (k, fn) => { await window.__cCount(k); const v = await window.__cGet(k); const next = fn(v); if(next == null) return null; if(await window.__cSet(k, next) === false) throw new Error('set refused'); return next; },
      setMany: async entries => window.__cSetMany(entries),
      delete: async k => window.__cDel(k),
      list: async p => ({ keys: await window.__cList(p) }),
    };
    // Wed 11 Nov 2026 from 10:00, ticking; each boot a minute later than the one before, so time only moves forward
    let step = 0; try{ step = +localStorage.getItem('__h_clock') || 0; }catch(e){}
    const off = new Date(2026, 10, 11, 10, 0, 0).getTime() + step * 60000 - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    // the 20-second background refresh runs only when a check asks for it (window.__bgTick): no flush lands in the middle of a count
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
  });
  let boots = 0;
  const boot = async (who, role, local) => {
    await page.goto(`http://localhost:${PORT}/index.html`); await sleep(120);
    local = Object.assign({ __h_clock: String(++boots) }, local || {});
    await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local);
    await page.goto(`http://localhost:${PORT}/index.html`); await sleep(200);
    await page.evaluate(async ({ who, role }) => { await selectUser(who, role); window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); real(m, ms); }; }, { who, role });
    await sleep(250);
    await page.evaluate(async () => { await auditFlush(); });
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const toasts = () => ev(() => (window.__toasts || []).splice(0));
  const flush = () => ev(async () => { await auditFlush(); });
  const logVisit = (clinicId, docIds, notes) => ev(async ({ clinicId, docIds, notes }) => {
    closeModal(); switchView('log'); prepLogView(clinicId); pickClinic(clinicId); docIds.forEach(id => pickDoctorSeen(id));
    document.getElementById('visitNotes').value = notes; window._lastVisitSaveAt = 0; _lastOfflineToast = 0;
    const t0 = Date.now(); await saveVisit(); const ms = Date.now() - t0;
    const v = visits.filter(x => x.notes === notes).slice(-1)[0];
    return { id: v ? v.id : null, ms };
  }, { clinicId, docIds, notes });
  const entry = pred => log().filter(pred).slice(-1)[0] || null;
  const small = e => !!e && JSON.stringify(e).length <= core.AUDIT_LIMITS.entry;
  // the Change log sheet as the person sees it
  const openLog = () => ev(async () => {
    openChangeLog();
    for(let i = 0; i < 60 && !document.querySelector('#clBody [data-audit], #clEmpty, #clReadErr'); i++) await new Promise(r => setTimeout(r, 50));
    const cards = [...document.querySelectorAll('#clBody [data-audit]')].map(c => ({ eid: c.dataset.audit, action: c.dataset.action, res: c.dataset.res, t: c.innerText.replace(/\s+/g, ' ').trim() }));
    return { cards, people: !!document.getElementById('clPeople'), text: document.getElementById('modalInner').innerText.replace(/\s+/g, ' '),
      dir: document.getElementById('modalInner').getAttribute('dir'), readErr: !!document.getElementById('clReadErr'), empty: !!document.getElementById('clEmpty') };
  });
  const sheetNow = () => ev(() => ({ cards: [...document.querySelectorAll('#clBody [data-audit]')].map(c => ({ eid: c.dataset.audit, action: c.dataset.action, res: c.dataset.res, t: c.innerText.replace(/\s+/g, ' ').trim() })),
    text: document.getElementById('modalInner').innerText.replace(/\s+/g, ' ') }));

  // ================= 1) a rep's visit: logged, edited with a reason, deleted with a reason =================
  seed();
  await boot(M, 'rep');
  const v1 = await logVisit('m1', ['m1-d1'], 'audit visit one');
  await flush();
  let e = entry(x => x.action === 'visit.add' && x.id === v1.id);
  check('visit logged → one entry: Mariam, rep, saved, the visit\'s date / who was met / notes',
    !!e && e.by === M && e.role === 'rep' && e.ok === true && e.res === 'saved' && e.key === 'visits' && e.before === null &&
    e.after.date === '2026-11-11' && JSON.stringify(e.after.met) === '["Dr. Huda Ali"]' && e.after.notes === 'audit visit one' && /^Dental 8 Clinic · 2026-11-11$/.test(e.label || '') && /^2026-11-11T/.test(e.at), e);
  check('the entry is small: the changed fields only, never the whole visit', small(e) && !('ts' in (e.after || {})) && !('orders' in (e.after || {})) && !('doctorIds' in (e.after || {})), e);
  await ev(async id => { openEditVisit(id); document.getElementById('evNotes').value = 'audit visit one — fixed'; document.getElementById('evReason').value = 'typo in the notes'; await saveEditVisit(id); }, v1.id);
  await flush();
  e = entry(x => x.action === 'visit.edit' && x.id === v1.id);
  check('visit edited → before → after of the notes only, with the reason typed', !!e && e.ok && JSON.stringify(e.before) === '{"notes":"audit visit one"}' && JSON.stringify(e.after) === '{"notes":"audit visit one — fixed"}' && e.reason === 'typo in the notes', e);
  const hist = await ev(id => (visits.find(v => v.id === id).editHistory || []).slice(-1)[0], v1.id);
  check('the visit\'s own edit history keeps the reason too', hist && hist.reason === 'typo in the notes', hist);
  const v2 = await logVisit('m2', ['m2-d1'], 'audit visit two');
  await ev(async id => { confirmDeleteVisit(id); document.getElementById('dvReason').value = 'logged twice'; await deleteVisit(id); }, v2.id);
  await flush();
  e = entry(x => x.action === 'visit.delete' && x.id === v2.id);
  check('visit deleted → what it held as "before", nothing after, the reason, saved; it is in the recycle bin',
    !!e && e.ok && e.after === null && e.before.notes === 'audit visit two' && e.before.date === '2026-11-11' && e.reason === 'logged twice' && (J('recycleBin').visits || []).some(x => x.id === v2.id), e);
  check('a save with nothing changed leaves no entry', await ev(async id => { const n = auditPending().length; openEditVisit(id); await saveEditVisit(id); return auditPending().length === n; }, v1.id));

  // ================= 2) the supervisor's changes =================
  await boot(G, 'supervisor');
  await ev(async () => { openEditClinic('m2'); document.getElementById('ecName').value = 'Smile Care Center'; document.getElementById('ecPhone').value = '22223333'; await saveEditClinic('m2'); });
  await ev(async () => { await reassignClinic('m2', 'Renova'); });
  await ev(async () => { await toggleSharedClinic('r1'); });
  await ev(async () => { await updateProductPrice('P1', '27.5'); });
  await ev(async () => { openAdminPanel(); setAdminTab('team'); document.getElementById('tgRev0').value = '1500'; await saveTargets(); });
  await ev(async () => { const i = staff.findIndex(s => s.name === 'Dr. Ghaith'); openStaffForm(i); document.querySelector('#sfSells .chip').classList.add('on'); await saveStaff(i); });
  await ev(async () => { const i = staff.findIndex(s => s.name === 'Renova'); openStaffForm(i); document.getElementById('sfEmail').value = 'renova.new@example.com'; await saveStaff(i); });
  await flush();
  e = entry(x => x.action === 'clinic.edit' && x.id === 'm2');
  check('clinic edited → name and phone before → after, by the supervisor', !!e && e.by === G && e.role === 'supervisor' && e.ok &&
    JSON.stringify(e.before) === '{"name":"Smile Care Clinic","phone":null}' && JSON.stringify(e.after) === '{"name":"Smile Care Center","phone":"22223333"}', e);
  e = entry(x => x.action === 'clinic.handover' && x.id === 'm2');
  check('clinic handed over → owner Mariam → Renova, from the 1st of the month', !!e && e.ok && e.before.rep === M && e.after.rep === R && e.after.prevRep === M && e.after.repSince === '2026-11-01', e);
  e = entry(x => x.action === 'clinic.shared' && x.id === 'r1');
  check('shared account switched on → No → Yes, shared from Nov 1', !!e && e.ok && e.before.shared === false && e.after.shared === true && e.after.sharedSince === '2026-11-01', e);
  e = entry(x => x.action === 'product.price' && x.id === 'P1');
  check('price changed → 30 → 27.5', !!e && e.ok && e.before.price === 30 && e.after.price === 27.5, e);
  e = entry(x => x.action === 'target.set');
  check('monthly targets → only Mariam\'s sales target, 1000 → 1500', !!e && e.ok && JSON.stringify(e.before) === '{"revenue":{"Mariam":1000}}' && JSON.stringify(e.after) === '{"revenue":{"Mariam":1500}}', e);
  e = entry(x => x.action === 'staff.role' && x.id === G);
  check('"Also sells" switched on → logged as a permission change', !!e && e.ok && e.before.sells === false && e.after.sells === true, e);
  e = entry(x => x.action === 'staff.edit' && x.id === R);
  check('a login e-mail change is logged masked — the address itself is never kept', !!e && e.ok && e.before.email === 'r•••@example.com' && e.after.email === 'r•••@example.com', e);
  const raw = cloud[NOV] || '';
  check('no e-mail address, password or token anywhere in the change log', !/[a-z0-9._-]{2,}@example\.com/i.test(raw) && !/password|token/i.test(raw), raw.match(/[a-z0-9._-]+@example\.com/ig));
  check('every entry stays small', log().every(small), log().map(x => JSON.stringify(x).length));
  // restore from the recycle bin
  await ev(async () => { await restoreFromBin('visits', recycleBin.visits.findIndex(x => x.notes === 'audit visit two')); });
  await flush();
  e = entry(x => x.action === 'restore.bin' && x.id === v2.id);
  check('restored from the recycle bin → logged, saved, with what came back', !!e && e.ok && e.key === 'visits' && e.after.notes === 'audit visit two' && (J('visits') || []).some(x => x.id === v2.id), e);
  // ERP links: a confirmed one is kept in its own log only; one that did not land is in the change log
  const links = await ev(async () => { const a = await saveErpLink('Smile Dental W.L.L', 'm1', null, null); await new Promise(r => setTimeout(r, 200)); const b = await saveErpLink('Conflict Co', 'm1', null, null); return { a, b }; });
  await flush();
  const mapLog = J('erpMapLog') || [];
  check('a confirmed ERP link → in erpMapLog, not written a second time in the change log', links.a.ok && mapLog.some(x => x.n === 'Smile Dental W.L.L' && x.t === 'm1') && !log().some(x => x.action === 'erpLink.change' && x.id === 'Smile Dental W.L.L'), { links, mapLog });
  e = entry(x => x.action === 'erpLink.change' && x.id === 'Conflict Co');
  check('an ERP link refused (changed elsewhere first) → logged as not saved, conflict', links.b.conflict && !!e && e.ok === false && e.res === 'conflict' && e.before.link === null && e.after.link === 'Dental 8 Clinic', e);

  // ================= 3) saves that fail: logged as not saved, the person told the truth =================
  await toasts();
  mode.failSet = /^clinics$/;
  await ev(async () => { _lastOfflineToast = 0; openEditClinic('m1'); document.getElementById('ecPhone').value = '99990000'; await saveEditClinic('m1'); });
  mode.failSet = null;
  let t = await toasts();
  await flush();
  e = entry(x => x.action === 'clinic.edit' && x.id === 'm1');
  check('a clinic save that did not reach the cloud → logged "kept on this device", not ok', !!e && e.ok === false && e.res === 'queued' && e.after.phone === '99990000', e);
  check('… and the person is told it is on this device — not "Clinic updated"', t.length > 0 && !/Clinic updated/.test(t[t.length - 1]) && /Saved on this device/.test(t[t.length - 1]), t);
  mode.failSet = /^targets$/;
  await ev(async () => { openAdminPanel(); setAdminTab('team'); document.getElementById('tgRev1').value = '1800'; await saveTargets(); });
  mode.failSet = null;
  t = await toasts();
  await flush();
  e = log().filter(x => x.action === 'target.set').slice(-1)[0];
  check('a targets save that failed → logged as not saved', !!e && e.ok === false && e.res === 'failed' && e.after.revenue.Renova === 1800, e);
  check('… and the person sees "Not saved", never "Monthly targets saved"', t.length > 0 && /Not saved/.test(t[t.length - 1]) && !t.some(x => /targets saved/.test(x)), t);
  await ev(async () => { await flushOutbox(); });
  await flush();
  check('when the queued clinic list uploads, the change log says so', log().some(x => x.action === 'sync.upload' && x.key === 'clinics' && x.ok) && (J('clinics') || []).find(c => c.id === 'm1').phone === '99990000');
  // a rep's visit saved while the cloud is unreachable
  await boot(M, 'rep');
  mode.failSet = /^visits$/;
  const v3 = await logVisit('m1', ['m1-d1'], 'offline visit');
  mode.failSet = null;
  t = await toasts();
  await flush();
  e = entry(x => x.action === 'visit.add' && x.id === v3.id);
  check('a visit kept on the phone (no connection) → logged "kept on this device", and the toast says so', !!e && e.res === 'queued' && e.ok === false && t.some(x => /محفوظة على هذا الجهاز/.test(x)), { e, t });

  // ================= 4) the change log failing never blocks the change =================
  seed();
  await boot(M, 'rep');
  await toasts();
  mode.failSet = /^auditLog:/;
  const v4 = await logVisit('m1', ['m1-d1'], 'visit while the log is down');
  t = await toasts();
  await flush();
  const q4 = await ev(() => auditPending().map(x => x.e.eid));
  check('the change log cannot be written → the visit is saved all the same and the toast says saved', (J('visits') || []).some(x => x.id === v4.id) && t.length > 0 && !/⚠️|📴/.test(t[t.length - 1]), t);
  check('… its entry waits on the phone, not in the cloud', q4.length === 1 && !log().some(x => x.id === v4.id), q4);
  mode.failSet = null;
  await flush(); await flush();
  check('the cloud is back → the entry lands, once, and leaves the phone\'s queue', log().filter(x => x.id === v4.id).length === 1 && (await ev(() => auditPending().length)) === 0, log().map(x => x.id));
  // a write that never answers: the change is not slowed down
  await ev(() => { AUDIT_WRITE_MS = 1200; });
  mode.hangSet = /^auditLog:/;
  const v5 = await logVisit('m1', ['m1-d1'], 'visit while the log hangs');
  t = await toasts();
  check('a change-log write that never answers does not slow the save', (J('visits') || []).some(x => x.id === v5.id) && v5.ms < 1000 && t.length > 0 && !/⚠️|📴/.test(t[t.length - 1]), { ms: v5.ms, t });
  mode.hangSet = null;
  await sleep(1400);
  await flush();
  check('… and its entry lands once the cloud answers again', log().filter(x => x.id === v5.id).length === 1, log().map(x => x.id));
  // a fault inside the change log itself: the save and its toast still happen
  const v6 = await ev(async () => {
    const real = UMCore.auditEntry; UMCore.auditEntry = () => { throw new Error('change log bug'); };
    try{ closeModal(); switchView('log'); prepLogView('m1'); pickClinic('m1'); pickDoctorSeen('m1-d1'); document.getElementById('visitNotes').value = 'visit with a broken log'; window._lastVisitSaveAt = 0; await saveVisit(); }
    finally{ UMCore.auditEntry = real; }
    return (visits.filter(x => x.notes === 'visit with a broken log')[0] || {}).id || null;
  });
  t = await toasts();
  check('a fault inside the change log never stops the save or its toast', !!v6 && (J('visits') || []).some(x => x.id === v6) && t.length > 0 && !/⚠️|📴/.test(t[t.length - 1]), t);
  // the app never writes the change log whole
  const before = cloud[NOV];
  const refused = await ev(async () => persist('auditLog:2026-11'));
  check('persist() refuses to write a change-log document whole', refused === false && cloud[NOV] === before && tripwire.length === 1, tripwire);

  // ================= 5) who sees what =================
  seed();
  await boot(M, 'rep');
  await logVisit('m1', ['m1-d1'], 'mariam visit'); await flush(); // landed before this phone is wiped for the next person
  await boot(R, 'rep');
  await ev(async () => { closeModal(); openCallLog('r1'); document.getElementById('clNotes').value = 'renova call'; await saveCallLog(); }); await flush();
  await boot(G, 'supervisor');
  await ev(async () => { openEditClinic('m1'); document.getElementById('ecPhone').value = '55554444'; await saveEditClinic('m1'); });
  await ev(async () => { await saveErpLink('Smile Dental W.L.L', 'm1', null, null); });
  await flush();
  const byOf = new Map(log().map(x => [x.eid, x.by]));
  await boot(M, 'rep');
  let s = await openLog();
  check('a rep sees her own entries only — no one else\'s, no person filter', s.cards.length >= 1 && s.cards.every(c => byOf.get(c.eid) === M) && !s.people && !s.cards.some(c => c.action === 'erpLink.change'), s.cards);
  const asked = await ev(() => { clPick('by', 'Dr. Ghaith'); return [...document.querySelectorAll('#clBody [data-audit]')].map(c => c.dataset.audit); });
  check('… asking for another person\'s entries changes nothing', asked.length >= 1 && asked.every(id => byOf.get(id) === M), asked);
  await boot(G, 'supervisor');
  s = await openLog();
  const actions = s.cards.map(c => c.action);
  check('the supervisor sees everyone\'s entries, newest first, with the person filter', s.people && [M, R, G].every(p => s.cards.some(c => byOf.get(c.eid) === p)) && actions[0] === 'erpLink.change', actions);
  check('… a confirmed ERP link change shows from the ERP account-link log', s.cards.some(c => c.action === 'erpLink.change' && /From the ERP account-link log/.test(c.t) && /Dental 8 Clinic/.test(c.t)), s.cards.filter(c => c.action === 'erpLink.change'));
  const edit = s.cards.find(c => c.action === 'clinic.edit');
  check('… before → after in plain words', !!edit && /Clinic edited/.test(edit.t) && /Phone: — → 55554444/.test(edit.t) && /Saved/.test(edit.t) && /Dr\. Ghaith · Supervisor/.test(edit.t), edit);
  let f = await ev(() => { document.querySelector('#clPeople [data-by="Renova"]').click(); return [...document.querySelectorAll('#clBody [data-audit]')].map(c => c.dataset.audit); });
  check('filter by person → Renova\'s only', f.length >= 1 && f.every(id => byOf.get(id) === R), f);
  f = await ev(() => { document.querySelector('#clPeople [data-by="all"]').click(); document.querySelector('#clGroups [data-g="clinics"]').click(); return [...document.querySelectorAll('#clBody [data-audit]')].map(c => c.dataset.action); });
  check('filter by kind → clinic changes only', f.length >= 1 && f.every(a => /^clinic\./.test(a)), f);
  f = await ev(async () => { document.querySelector('#clGroups [data-g="all"]').click(); clPickMonth('2026-10'); for(let i = 0; i < 40 && !document.querySelector('#clBody [data-audit="oct1"]'); i++) await new Promise(r => setTimeout(r, 50)); return [...document.querySelectorAll('#clBody [data-audit]')].map(c => c.dataset.audit); });
  check('pick a month → that month\'s document', JSON.stringify(f) === '["oct1"]', f);
  mode.failGet = /^auditLog:2026-11$/;
  s = await openLog();
  mode.failGet = null;
  check('a month that cannot be read says so — never "no changes"', s.readErr && !s.empty, s.text.slice(0, 300));
  // offline entries show, marked, until they land
  mode.failSet = /^auditLog:/;
  await ev(async () => { await toggleSharedClinic('r1'); });
  s = await openLog();
  mode.failSet = null;
  const waiting = s.cards.find(c => c.action === 'clinic.shared');
  check('an entry still on the phone shows, marked as waiting to upload', !!waiting && /waiting to upload to the change log/.test(waiting.t) && /changes recorded on this phone are waiting/.test(s.text), waiting);
  await flush();

  // ================= 6) Arabic =================
  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  s = await openLog();
  const card = s.cards.find(c => c.action === 'clinic.edit') || {};
  check('Arabic: the sheet, the actions, the fields and the results speak Arabic; names stay as typed; it reads right to left',
    /سجل التغييرات/.test(s.text) && /من غيّر ماذا ومتى/.test(s.text) && /تعديل عيادة/.test(card.t || '') && /الهاتف/.test(card.t || '') && /تم الحفظ/.test(card.t || '') &&
    /55554444/.test(card.t || '') && /Dental 8 Clinic/.test(card.t || '') && /←/.test(card.t || '') && s.dir === 'rtl', { card, text: s.text.slice(0, 400) });
  const more = await ev(async () => { switchView('more'); await new Promise(r => setTimeout(r, 50)); return document.getElementById('moreContent').innerText; });
  check('Arabic: More shows "سجل التغييرات"', /سجل التغييرات/.test(more), more.slice(0, 200));
  await boot(M, 'rep');
  const moreRep = await ev(() => { switchView('more'); return document.getElementById('moreContent').innerText; });
  check('a rep has the Change log in More too', /Change log/.test(moreRep) && /Your changes and whether each save landed/.test(moreRep));

  // ================= 7) v121/v122 flows on a rep's phone: clinics without a name, doctors without a name, uploads that settle =================
  const PH = id => ({ id, name: '⚠️ Restored clinic — rename me', rep: R, cls: 'B', doctors: [] });
  seed();
  cloud.clinics = JSON.stringify([
    { id: 'm1', name: 'Dental 8 Clinic', rep: M, cls: 'A', doctors: [{ id: 'm1-d1', name: 'Dr. Huda Ali' }] },
    { id: 'r1', name: 'Crown Dental Center', rep: R, cls: 'A', doctors: [{ id: 'dA', name: 'Dr. Amal Saleh' }] },
    { id: 'r2', name: 'Gulf Smile Clinic', rep: R, cls: 'B', doctors: [] },
    PH('p1'), PH('p2'), PH('p3'), PH('p4')]);
  cloud.visits = JSON.stringify([
    { id: 'w1', clinicId: 'p1', rep: R, date: '2026-11-02', notes: 'asked for whitening kits' },
    { id: 'w2', clinicId: 'p2', rep: R, date: '2026-11-03' }, { id: 'w3', clinicId: 'p3', rep: R, date: '2026-11-04' },
    { id: 'w4', clinicId: 'p4', rep: R, date: '2026-11-04' },
    { id: 'x1', clinicId: 'r1', rep: R, date: '2026-11-05', doctorIds: ['dB'], doctorId: 'dB', doctorNames: { dB: 'Dr. Basma Adel' } },
    { id: 'x2', clinicId: 'r1', rep: R, date: '2026-11-06', doctorIds: ['dE'], doctorId: 'dE' },
    { id: 'x3', clinicId: 'r1', rep: R, date: '2026-11-07', doctorIds: ['dG'], doctorId: 'dG' }]);
  cloud.tasks = JSON.stringify([
    { id: 't1', text: 'Follow up: Pearl Dental', done: false, created: '2026-11-02', rep: R, dueDate: '2026-11-09', clinicId: 'p1', kind: 'followup' },
    { id: 't4', text: 'Follow up: Gulf Smile', done: false, created: '2026-11-04', rep: R, dueDate: '2026-11-10', clinicId: 'p4', kind: 'followup' }]);
  await boot(R, 'rep');
  const confirmTap = () => ev(async () => { const b = document.querySelector('#modalInner button[data-ask]'); if(!b) throw new Error('no confirm button'); b.click(); await new Promise(r => setTimeout(r, 350)); });
  await ev(async () => { openNamelessClinics(); await nameNamelessClinic('p1', 'Pearl Dental', 'task'); });
  await flush();
  e = entry(x => x.action === 'restore.nameless' && x.id === 'p1');
  check('nameless clinic named from the app\'s follow-up task → one entry: Renova, saved, the name and where it came from',
    !!e && e.by === R && e.ok && e.after.name === 'Pearl Dental' && e.after.source === 'task' && e.label === 'Pearl Dental', e);
  const n0 = log().length;
  await ev(async () => { openNamelessClinics(); await nameNamelessClinic('p2', 'gulf smile clinic', 'typed'); });
  await flush();
  check('… a name another clinic has is asked first: no entry until the second tap', log().length === n0 && !log().some(x => x.action === 'restore.namelessMove'));
  await confirmTap(); await flush();
  e = entry(x => x.action === 'restore.namelessMove' && x.id === 'p2');
  check('… the second tap: "joined a listed clinic", its visit moved, saved', !!e && e.ok && e.after.movedTo === 'Gulf Smile Clinic' && e.after.visits === 1 && e.label === 'Gulf Smile Clinic', e);
  // kept on this phone, then uploaded: the entry says so, and leaves "Not saved only"
  mode.failSet = /^clinics$/;
  await ev(async () => { _lastOfflineToast = 0; openNamelessClinics(); await nameNamelessClinic('p3', 'Coral Dental', 'typed'); });
  mode.failSet = null;
  await flush();
  e = entry(x => x.action === 'restore.nameless' && x.id === 'p3');
  check('named with no connection → "kept on this device", not saved', !!e && e.ok === false && e.res === 'queued' && e.after.source === 'typed', e);
  await ev(async () => { await flushOutbox(); }); await flush();
  let upE = log().filter(x => x.action === 'sync.upload' && x.key === 'clinics').slice(-1)[0];
  check('… the queue sends the clinic list → one "Offline changes uploaded" entry naming the entry it settles', !!upE && !!e && upE.ok && (upE.settles || []).includes(e.eid) && upE.after.count === 1, upE);
  // a change over several lists: only the tasks did not land → it waits for the tasks alone
  mode.failSet = /^tasks$/;
  await ev(async () => { _lastOfflineToast = 0; openNamelessClinics(); await nameNamelessClinic('p4', 'Gulf Smile Clinic', 'typed'); });
  await confirmTap();
  mode.failSet = null;
  await flush();
  const e4 = entry(x => x.action === 'restore.namelessMove' && x.id === 'p4');
  check('a move whose tasks did not land → "kept on this device", waiting for the tasks only', !!e4 && e4.res === 'queued' && JSON.stringify(e4.waits) === '["tasks"]', e4);
  await ev(async () => { await flushOutbox(); }); await flush();
  upE = log().filter(x => x.action === 'sync.upload' && x.key === 'tasks').slice(-1)[0];
  check('… the tasks go up → the upload entry settles it', !!upE && !!e4 && (upE.settles || []).includes(e4.eid), upE);
  // doctors without a name
  await ev(async () => { openLostDoctors('r1'); await nameLostDoctor('r1', 'dB', 'Dr. Basma Adel', 'r1', 'visit'); });
  await flush();
  e = entry(x => x.action === 'restore.doctor' && x.id === 'r1|dB');
  check('doctor without a name named → back under the same id: the name, from a visit\'s record, its visits, saved',
    !!e && e.ok && e.key === 'clinics' && e.after.name === 'Dr. Basma Adel' && e.after.source === 'visit' && e.after.visits === 1 && /Dr\. Basma Adel · Crown Dental Center/.test(e.label || ''), e);
  await ev(async () => { openLostDoctors('r1'); await nameLostDoctor('r1', 'dE', 'dr amal saleh', 'r1', 'typed'); });
  const askedMove = log().some(x => x.action === 'restore.doctorMove');
  await confirmTap(); await flush();
  e = entry(x => x.action === 'restore.doctorMove' && x.id === 'r1|dE');
  check('a name the clinic already lists: asked first, then "visits moved to a listed doctor", saved', !askedMove && !!e && e.ok && e.key === 'visits' && e.after.movedTo === 'Dr. Amal Saleh' && e.after.visits === 1, e);
  await ev(async () => { openLostDoctors('r1'); await markDoctorGone('r1', 'dG', 'r1'); });
  await flush();
  e = entry(x => x.action === 'doctor.gone' && x.id === 'r1|dG');
  check('"left the clinic or removed on purpose" → an entry on the delete log, saved', !!e && e.ok && e.key === 'tombs' && e.after.visits === 1, e);
  s = await openLog();
  const p3e = entry(x => x.action === 'restore.nameless' && x.id === 'p3');
  const p3card = (p3e && s.cards.find(c => c.eid === p3e.eid)) || {};
  check('the screen: the entry kept on the phone says when it went up since; the name\'s source in words',
    /Uploaded since/.test(p3card.t || '') && /Taken from: typed by hand/.test(p3card.t || '') && /Kept on this device/.test(p3card.t || ''), p3card);
  const notSaved = await ev(() => { clPick('failed', true); return [...document.querySelectorAll('#clBody [data-audit]')].map(c => c.dataset.audit); });
  check('… and "Not saved only" leaves out the changes that went up since', !!p3e && !!e4 && !notSaved.includes(p3e.eid) && !notSaved.includes(e4.eid), notSaved);

  // ================= 8) the supervisor: types, sales lines, guides, photos, saves with no answer, refused, memory only, sales, restores =================
  seed();
  cloud.visits = JSON.stringify([{ id: 'v8', clinicId: 'm1', rep: M, date: '2026-11-10', doctorIds: ['m1-d1'], doctorId: 'm1-d1', notes: 'demo kit left' }]);
  cloud.recycleBin = JSON.stringify({ clinics: [{ id: 'b1', name: 'Old Pearl Clinic', rep: M, cls: 'B', doctors: [], _deletedAt: Date.now() - 86400000, _label: 'Old Pearl Clinic' }], products: [], visits: [] });
  cloud['snap_2026-11-10'] = JSON.stringify({ clinics: [{ id: 'm1', name: 'Dental 8 Clinic', rep: M, cls: 'A', doctors: [{ id: 'm1-d1', name: 'Dr. Huda Ali' }] }, { id: 'm2', name: 'Smile Care Clinic', rep: M, cls: 'B', doctors: [] }],
    products: [{ id: 'P1', name: 'Sonicare 4300', brand: 'Philips', price: 30 }], visits: [], tasks: [] });
  cloud['snap_2026-11-09'] = JSON.stringify({ clinics: JSON.parse(cloud.clinics), products: [], visits: [], tasks: [] });
  cloud['snap_2026-10-30'] = JSON.stringify({ clinics: [], products: [], visits: [], tasks: [] });
  await boot(G, 'supervisor');
  // prescription types
  await ev(async () => { openRxTypes(); await new Promise(r => setTimeout(r, 150)); document.getElementById('rxtNewName').value = 'Sample pads form'; await saveRxTypes(); });
  await flush();
  e = entry(x => x.action === 'doctor.rxTypes');
  check('prescription types saved → an entry: the types before → after, saved', !!e && e.ok && e.after.types.includes('Sample pads form') && !e.before.types.includes('Sample pads form') && e.before.types.length === 2, e);
  // a sales line marked; then a mark that did not reach the cloud
  await toasts();
  await ev(async () => { await saveRetKind('ret|9000001|Sonicare 4300', 'exchange', null); });
  await flush();
  e = entry(x => x.action === 'sales.lineKind' && x.id === 'ret|9000001|Sonicare 4300');
  check('a sales line marked as an exchange → before → after, saved', !!e && e.ok && e.before.lineKind === 'return' && e.after.lineKind === 'exchange' && /Sonicare 4300 · 9000001/.test(e.label || ''), e);
  await toasts();
  mode.failSet = /^erpNotes$/;
  await ev(async () => { _lastOfflineToast = 0; await saveErpNoteKind('foc|9000002|Sonicare 4300', 'deal', null); });
  mode.failSet = null;
  t = await toasts(); await flush();
  e = entry(x => x.action === 'sales.lineKind' && x.id === 'foc|9000002|Sonicare 4300');
  check('a mark that did not reach the cloud → not saved, and the toast says so — never "Marked: bonus"', !!e && e.ok === false && e.res === 'failed' && t.length && /Not saved/.test(t[t.length - 1]) && !/Marked: bonus/.test(t[t.length - 1]), { e, t });
  // a selling guide
  await toasts();
  await ev(async () => { openEditCategoryGuide('Whitening'); document.getElementById('cgSell').value = 'Visible results in a week'; await saveCategoryGuide('Whitening'); });
  t = await toasts(); await flush();
  e = entry(x => x.action === 'product.guide' && x.id === 'Whitening');
  check('a selling guide saved → before → after, saved, "Guide saved"', !!e && e.ok && e.after.sell === 'Visible results in a week' && t.some(x => /Guide saved/.test(x)), { e, t });
  mode.failSet = /^categoryGuides$/;
  await ev(async () => { _lastOfflineToast = 0; openEditCategoryGuide('Whitening'); document.getElementById('cgHow').value = 'Show the shade guide'; await saveCategoryGuide('Whitening'); });
  mode.failSet = null;
  t = await toasts(); await flush();
  e = entry(x => x.action === 'product.guide' && x.id === 'Whitening' && x.after && x.after.how);
  check('a guide that did not reach the cloud → not saved, never "Guide saved"', !!e && e.ok === false && !t.some(x => /Guide saved/.test(x)) && t.some(x => /Not saved/.test(x)), { e, t });
  // Edit visit → a photo added, then removed (v122: marked waiting, kept on the phone, never waits for the upload)
  await ev(() => { const mk = () => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; const x = c.getContext('2d'); x.fillStyle = '#3a3'; x.fillRect(0, 0, 40, 30); return c.toDataURL('image/jpeg', 0.8); };
    window.pickImage = cb => { window.__picked = Promise.resolve(cb({ id: uid(), full: mk(), thumb: mk() })); }; });
  await ev(async () => { openEditVisit('v8'); addEditPhoto('v8'); await window.__picked; });
  await flush();
  e = entry(x => x.action === 'visit.edit' && x.id === 'v8' && x.after && x.after.photos === 1);
  check('Edit visit → a photo added: photos 0 → 1, saved', !!e && e.ok && e.before.photos === 0, e);
  await ev(async () => { const v = visits.find(x => x.id === 'v8'); await removeEditPhoto('v8', v.photos[0].id); });
  await flush();
  e = entry(x => x.action === 'visit.edit' && x.id === 'v8' && x.after && x.after.photos === 0);
  check('… and removed: photos 1 → 0, saved', !!e && e.ok && e.before.photos === 1, e);
  // a whole-document save the cloud never answers: "no confirmation", never "not saved"
  await toasts();
  mode.hangSet = /^targets$/;
  await ev(async () => { _lastOfflineToast = 0; openAdminPanel(); setAdminTab('team'); document.getElementById('tgRev0').value = '1700'; await saveTargets(); });
  mode.hangSet = null;
  t = await toasts(); await flush();
  e = log().filter(x => x.action === 'target.set').slice(-1)[0];
  check('a targets save with no answer → "no confirmation from the cloud", and the toast says the same — not "Not saved"',
    !!e && e.res === 'timeout' && e.ok === false && t.length && /No answer from the cloud yet/.test(t[t.length - 1]), { e, t });
  // refused before any write (the factory-list guard): said so — not "check the connection"
  await toasts();
  await ev(async () => { _seedClinics = true; try{ openEditClinic('m2'); document.getElementById('ecPhone').value = '24440000'; await saveEditClinic('m2'); } finally { _seedClinics = false; } });
  t = await toasts(); await flush();
  e = entry(x => x.action === 'clinic.edit' && x.id === 'm2');
  check('a save the app refused before it wrote → "Not saved — refused", and the toast says reopen the app', !!e && e.res === 'refused' && t.length && /reopen the app/.test(t[t.length - 1]), { e, t });
  // the phone's storage full and no connection: in the app's memory only — said so; then it uploads
  await ev(() => { const real = window.__realSet = window.__realSet || Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){ if(/^um_outbox$|^um_mirror:/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; });
  mode.failSet = /^clinics$/;
  await ev(async () => { openEditClinic('m1'); document.getElementById('ecPhone').value = '25550000'; await saveEditClinic('m1'); });
  mode.failSet = null;
  await ev(() => { Storage.prototype.setItem = window.__realSet; });
  await flush();
  e = entry(x => x.action === 'clinic.edit' && x.id === 'm1');
  check('a full phone with no connection → "only in the app\'s memory", not "kept on this device"', !!e && e.res === 'memory' && e.ok === false, e);
  await ev(async () => { await flushOutbox(); }); await flush();
  const memE = e;
  check('… it uploads → the upload entry settles it', !!memE && log().some(x => x.action === 'sync.upload' && x.key === 'clinics' && (x.settles || []).includes(memE.eid)) && (J('clinics') || []).find(c => c.id === 'm1').phone === '25550000');
  // entries made in one moment go up together (the month document is read and written whole)
  await flush(); mode.auditUpdates = 0;
  await ev(async () => { await toggleSharedClinic('r1'); await toggleSharedClinic('r1'); await updateProductPrice('P1', '29'); });
  await sleep(2600);
  check('three changes in a moment → their entries go up in ONE write of the month document', mode.auditUpdates === 1 && log().filter(x => x.action === 'clinic.shared' && x.id === 'r1').length >= 2, mode.auditUpdates);
  // sales: a commit the app stopped waiting for is "no confirmation"; its late landing is recorded
  await ev(() => { ERP_WRITE_MS = 600; });
  let open; mode.gate = new Promise(r => { open = r; });
  await ev(async () => { _lastOfflineToast = 0; await setReturnPolicy('erp'); });
  await flush();
  e = entry(x => x.action === 'sales.returns');
  check('a sales save with no answer in time → "no confirmation from the cloud" (it may still land)', !!e && e.res === 'timeout', e);
  open(); mode.gate = null; await sleep(500); await flush();
  e = entry(x => x.action === 'sync.late' && x.key === 'erpSales');
  check('… it lands late → "a save with no confirmation reached the cloud"', !!e && e.ok && (J('erpSales') || {}).returnPolicy === 'erp', e);
  await ev(() => { ERP_WRITE_MS = 45000; });
  // the retry pill: a tap that saved what had not been saved
  mode.failSet = /^erpSales$/;
  await ev(async () => { _lastOfflineToast = 0; await setSalesmanMap('Sample Salesman', 'Mariam'); });
  mode.failSet = null;
  await ev(async () => { const pill = document.getElementById('erpDirtyPill'); if(pill) await pill.onclick(); });
  await flush();
  check('a sales mapping that did not land → not saved; the retry pill saves it → "Unsaved sales changes saved"',
    log().some(x => x.action === 'sales.salesman' && x.id === 'Sample Salesman' && x.ok === false) && log().some(x => x.action === 'sales.retry' && x.ok) && (((J('erpSales') || {}).repMapGlobal || {})['Sample Salesman'] === 'Mariam'));
  // the whole-day restore: another month is refused (in the log, with why), the same month says what it removed, a failure says how far it got
  await ev(async () => { await restoreSnapshot('2026-10-30'); });
  await flush();
  e = entry(x => x.action === 'restore.backup' && x.id === '2026-10-30');
  check('a backup of another month: refused — in the log as "Not saved — refused", with the reason', !!e && e.res === 'refused' && e.reason === '#restore-other-month', e);
  await ev(async () => { await restoreSnapshot('2026-11-10'); });
  await flush();
  e = entry(x => x.action === 'restore.backup' && x.id === '2026-11-10');
  check('a whole day restored → saved, with what it removed (Crown Dental Center, this month\'s visit)', !!e && e.ok && e.after.removedClinics === 1 && e.after.removedVisits === 1 && e.after.clinics === 2, e);
  mode.failSet = /^tasks$/;
  await ev(async () => { await restoreSnapshot('2026-11-10'); });
  mode.failSet = null;
  await flush();
  e = log().filter(x => x.action === 'restore.backup' && x.id === '2026-11-10').slice(-1)[0];
  check('a restore that stopped half-way → not saved, and which documents it had written before it stopped', !!e && e.ok === false && JSON.stringify(e.after && e.after.written) === '["clinics","products"]', e);
  // clinics brought back: from the Admin sheet (the recycle bin) and from the daily backups
  await ev(async () => { openMissingClinics(); await restoreTickedMissingClinics(); });
  await flush();
  e = entry(x => x.action === 'restore.clinics' && x.after && Array.isArray(x.after.source));
  check('Admin → missing clinics brought back → the clinics and where they came from (the recycle bin), saved', !!e && e.ok && JSON.stringify(e.after.source) === '["bin"]' && /Old Pearl Clinic/.test(JSON.stringify(e.after.clinics)), e);
  await ev(async () => { await openClinicRecovery(); await restoreMissingClinics(); });
  await flush();
  e = entry(x => x.action === 'restore.clinics' && x.after && x.after.source === 'backup');
  check('Find missing clinics → brought back from a daily backup, saved', !!e && e.ok && /Crown Dental Center/.test(JSON.stringify(e.after.clinics)), e);
  s = await openLog();
  const refusedCard = s.cards.find(c => c.action === 'restore.backup' && /refused/.test(c.t)) || {};
  check('the screen: the refused restore says why in words; no code shown', /A backup of another month: restoring it would erase this month's visits/.test(refusedCard.t || '') && !/#restore/.test(refusedCard.t || ''), refusedCard);
  const memCard = s.cards.find(c => c.res === 'memory') || {};
  check('… "only in the app\'s memory" shown as such, with its upload since', /Only in the app's memory/.test(memCard.t || '') && /Uploaded since/.test(memCard.t || ''), memCard);
  const lineCard = s.cards.find(c => c.action === 'sales.lineKind' && c.res === 'saved') || {};
  check('… a line mark in words: Real return → Exchange — not a return', /Marked as: Real return → Exchange — not a return/.test(lineCard.t || ''), lineCard);

  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  s = await openLog();
  const arRefused = s.cards.find(c => c.action === 'restore.backup' && c.res === 'refused') || {};
  const arLine = s.cards.find(c => c.action === 'sales.lineKind' && c.res === 'saved') || {};
  check('Arabic: the refused restore and why, and a line mark, read in Arabic',
    /نسخة احتياطية من شهر آخر/.test(arRefused.t || '') && /لم يُحفظ/.test(arRefused.t || '') && /التصنيف: مرتجع فعلي ← تبديل — ليس مرتجعاً/.test(arLine.t || ''), { arRefused, arLine });

  // ================= 9) a full phone: the change log's waiting entries give their room to a visit =================
  seed();
  await boot(M, 'rep');
  mode.failSet = /^auditLog:/;
  for(let i = 0; i < 6; i++) await ev(async i => { await saveNoSaleReason('m1', 'reason number ' + i + ' ' + 'x'.repeat(60)); }, i);
  const before9 = await ev(() => auditPending().length);
  mode.failSet = /^auditLog:|^visits$/; // the change log still cannot be written: its entries are still on the phone when the visit is saved
  const f9 = await ev(async () => {
    const real = window.__realSet = window.__realSet || Storage.prototype.setItem;
    const used = () => { let n = 0; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; };
    const quota = used() + 60;
    Storage.prototype.setItem = function(k, val){ const old = localStorage.getItem(k); if(used() - (old != null ? k.length + old.length : 0) + k.length + String(val).length > quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, val); };
    const v = { id: 'vFull', clinicId: 'm1', rep: 'Mariam', date: '2026-11-11', ts: Date.now(), doctorIds: ['m1-d1'], doctorId: 'm1-d1', notes: 'visit on a full phone' };
    visits.push(v); const r = await persistFor('visits');
    Storage.prototype.setItem = real;
    return { outcome: r.outcome, onPhone: JSON.parse(localStorage.getItem('um_mirror:visits') || '[]').some(x => x.id === 'vFull'), bar: !!document.getElementById('memOnlyBar'), waiting: auditPending().length };
  });
  mode.failSet = null;
  check('a full phone: the change log\'s waiting entries make room — the visit and its queue entry are kept on the phone, no red bar', f9.onPhone && f9.outcome.mirrored === true && !f9.bar, f9);
  check('… the entries are not lost: still waiting (in the app\'s memory), and they go up once the cloud answers', before9 >= 6 && f9.waiting >= before9, { before9, waiting: f9.waiting });
  await ev(async () => { await flushOutbox(); }); await flush();
  check('… everything lands: the visit, and every entry once', (J('visits') || []).some(x => x.id === 'vFull') && log().filter(x => x.action === 'clinic.edit' && x.id === 'm1').length === 6 && (await ev(() => auditPending().length)) === 0, log().length);

  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
