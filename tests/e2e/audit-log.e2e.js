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
// ---- fake cloud (Node side: survives reloads). failSet / failGet: matching keys throw; hangSet: a write that never answers ----
const cloud = {};
const mode = { failSet: null, failGet: null, hangSet: null };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => {
    if(mode.hangSet && mode.hangSet.test(k)) return new Promise(() => {});
    if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set');
    cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0, 700):'')); if(!ok) failed++; }
const J = k => { try{ return JSON.parse(cloud[k]); }catch(e){ return null; } };
const NOV = 'auditLog:2026-11', OCT = 'auditLog:2026-10';
const log = () => ((J(NOV) || {}).entries || []);
const G = 'Dr. Ghaith', M = 'Mariam', R = 'Renova';
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  Object.assign(mode, { failSet: null, failGet: null, hangSet: null });
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
    if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-(set|get)|update failed|set refused/i.test(t)) errors.push('console: ' + t.slice(0, 200)); });
  page.on('dialog', d => d.accept());
  for(const [n, f] of Object.entries({ __cGet: api.get, __cSet: api.set, __cDel: api.del, __cList: api.list, __cSetMany: api.setMany })) await page.exposeFunction(n, f);
  await page.addInitScript(() => {
    // with update(): the read-merge-write the app runs as a Firestore transaction (here a read then a write)
    window.storage = {
      get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.__cSet(k, v),
      update: async (k, fn) => { const v = await window.__cGet(k); const next = fn(v); if(next == null) return null; if(await window.__cSet(k, next) === false) throw new Error('set refused'); return next; },
      setMany: async entries => window.__cSetMany(entries),
      delete: async k => window.__cDel(k),
      list: async p => ({ keys: await window.__cList(p) }),
    };
    // Wed 11 Nov 2026 from 10:00, ticking; each boot a minute later than the one before, so time only moves forward
    let step = 0; try{ step = +localStorage.getItem('__h_clock') || 0; }catch(e){}
    const off = new Date(2026, 10, 11, 10, 0, 0).getTime() + step * 60000 - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
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

  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
