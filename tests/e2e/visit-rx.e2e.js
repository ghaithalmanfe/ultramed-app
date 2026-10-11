// Prescriptions given on a visit, by type (v114). The owner: "Add also the
// option of making the visit log for prescription giving, the prescription
// contain most of our products and we have more than one type of
// prescriptions." His answers (11 Oct 2026): until the supervisor sets his own
// list the types are the two printed forms, "Ultramed fast moving products"
// and "Tepe prescription"; reps count PADS (sheets per pad unknown).
// P0 reproduces what could not be done, or was untrue, before (R1–R9, kept as
// checks). Then: logging on the phone, typed quantities, edit / re-date /
// delete / restore, a joint visit, refused saves, Arabic, the supervisor's
// types editor (compare-and-set), the built-in forms, and the edges (merged
// and removed doctors, same-day visits, calls, the background refresh, the
// KPI, an unreadable month, phone width). RX_ONLY=P0,P3 runs some phases only.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const PORT = 8206;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = (process.env.RX_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
// ---- fake cloud (Node side: survives reloads; can refuse, throw or be unreadable per key) ----
// No `update` method: storageUpdate goes get → fn → set, so failSet / falseSet hit visit saves
// too, and a change "made on another device" between the read and the write is visible.
const cloud = {};
const mode = { failSet: null, falseSet: null, failGet: null, hangSet: null, sets: [] };
let actor = null; const typeWrites = [], repTypeWrites = []; // writes of state/rxTypes since the last reseed, with who was signed in; and any from a rep, ever
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { mode.sets.push(k); if(k === 'rxTypes'){ typeWrites.push(actor); if(actor !== 'supervisor') repTypeWrites.push(actor); }
    if(mode.hangSet && mode.hangSet.test(k)) return new Promise(() => {}); // never answers
    if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set');
    if(mode.falseSet && mode.falseSet.test(k)) return false;
    cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async e => { e.forEach(([k]) => { mode.sets.push(k); if(k === 'rxTypes'){ typeWrites.push(actor); if(actor !== 'supervisor') repTypeWrites.push(actor); } });
    if(mode.failSet && e.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set');
    e.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,700):'')); if(!ok) failed++; }
// a phase whose hooks are missing (before the feature) shows as one red line; the run continues
async function phase(id, name, fn){
  if(ONLY.length && !ONLY.includes(id)) return;
  results.push('— ' + id + ' ' + name);
  try{ await fn(); }catch(e){ check(id + ' ' + name + ': phase crashed', false, String(e && e.message || e).split('\n')[0].slice(0, 300)); }
}
const J = k => { try{ return JSON.parse(cloud[k]); }catch(e){ return null; } };
const copies = id => [...(J('visits') || []), ...(J('visitsArch:2026-09') || [])].filter(v => v && v.id === id);
const sig = v => ((v && v.rx) || []).map(l => [l.type, l.name, l.qty, l.doctorId].join('|'));

// ---- seed. Clock Tue 13 Oct 2026 10:00: week = 11–13 Oct against 4–6 Oct; month = 1–13 Oct against 1–13 Sep ----
const G = 'Dr. Ghaith', M = 'Mariam', R = 'Renova';
const T = { ortho: { id: 'tortho', name: 'Ortho care prescription', active: true },
  white: { id: 'twhite', name: 'Whitening prescription', active: true },
  impl: { id: 'timpl', name: 'وصفة العناية بالزراعة', active: true },   // typed in Arabic: data
  kids: { id: 'tkids', name: 'Kids prescription', active: false } };   // retired
const TYPES = (types) => ({ v: 1, rev: 3, by: G, at: '2026-10-01T09:00:00', types: types || [T.ortho, T.white, T.impl, T.kids] });
const line = (t, qty, doctorId) => ({ type: t.id, name: t.name, qty, doctorId });
const CLINICS = () => [
  { id: 'm1', name: 'Dental 8 Clinic', rep: M, cls: 'A', dealType: 'prescription', doctors: [
    { id: 'm1-d1', name: 'Dr. Huda Ali', title: 'Orthodontist', handovers: [{ id: 'h1', date: '2026-10-12', kind: 'prescription', what: 'Rx pads', qty: 2, by: M }] },
    { id: 'm1-d2', name: 'Dr. Omar Saleh', title: 'General Dentist' }] },
  { id: 'm2', name: 'Smile Care Clinic', rep: M, cls: 'B', doctors: [{ id: 'm2-d1', name: 'Dr. Sara Nasser' }] },
  { id: 'r1', name: 'Crown Dental Center', rep: R, cls: 'A', doctors: [{ id: 'r1-d1', name: 'Dr. Faisal Adel' }] }];
const V = (id, clinicId, rep, date, doctorIds, rx, x) => Object.assign({ id, clinicId, rep, withRep: null, date, ts: new Date(date + 'T09:00:00').getTime(),
  doctorIds, doctorId: doctorIds[0] || null, products: [], orderTaken: false, orders: [], orderItems: [], orderGross: 0, orderDiscount: 0, orderTotal: 0,
  notes: 'seed ' + id, nextFollowUp: null, noOrderReason: null, rx }, x || {});
const SEP = () => [V('vS1', 'm1', M, '2026-09-20', ['m1-d1'], [line(T.ortho, 4, 'm1-d1')])];
const OCT = () => [V('vO1', 'm1', M, '2026-10-05', ['m1-d1', 'm1-d2'], [line(T.ortho, 2, 'm1-d1'), line(T.white, 1, 'm1-d2')]),
  V('vO2', 'r1', R, '2026-10-12', ['r1-d1'], [line(T.white, 3, 'r1-d1')]),
  V('vC1', 'm1', M, '2026-10-12', ['m1-d1'], [line(T.ortho, 9, 'm1-d1')], { callOnly: true, channel: 'call', products: undefined, orders: undefined })]; // a call: never counts
// Baseline: Huda all 8 / month 4 / week 2 / same days last week 2 · Omar 1/1/0/1 · Faisal 3/3/3/0
//           Mariam's page 9/5/2/3 · team 12/8/5/3 · by type: Ortho 6, Whitening 4, profile entries 2
function reseed(o = {}){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = JSON.stringify([{ name: M, role: 'rep', email: 'm@x.com' }, { name: R, role: 'rep', email: 'r@x.com' }, { name: G, role: 'supervisor', email: 'g@x.com' }]); // he sells (default)
  cloud.clinics = JSON.stringify(o.clinics || CLINICS());
  cloud.visits = JSON.stringify(o.oct || OCT());
  cloud['visitsArch:2026-09'] = JSON.stringify(o.sep || SEP());
  cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-09': { n: (o.sep || SEP()).length, rev: 1 } } });
  if(o.rxTypes !== null) cloud.rxTypes = JSON.stringify(o.rxTypes || TYPES());
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.erpSales = JSON.stringify({ periods: [], seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  Object.assign(mode, { failSet: null, falseSet: null, failGet: null, hangSet: null }); mode.sets.length = 0; typeWrites.length = 0;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort()); // hermetic
  const page = await ctx.newPage();
  const errors = [], dialogs = [], guard = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { const t = m.text();
    if(m.type() === 'error' && /rxTypes is saved by saveRxTypes/.test(t)){ guard.push(t); return; } // the persist('rxTypes') tripwire
    if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-(set|get)|set failed|update failed/i.test(t)) errors.push('console: ' + t.slice(0, 200)); });
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
  for(const [n, f] of Object.entries({ __cGet: api.get, __cSet: api.set, __cDel: api.del, __cList: api.list, __cSetMany: api.setMany })) await page.exposeFunction(n, f);
  await page.addInitScript(() => {
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
      setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
    const off = new Date(2026, 9, 13, 10, 0, 0).getTime() - Date.now(); // Tue 13 Oct 2026, 10:00, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  // A fresh phone each time (nothing on the device), signed in; every toast is recorded.
  const boot = async (who, role, local) => {
    actor = role;
    await page.goto(`http://localhost:${PORT}/index.html`); await sleep(120);
    await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local || null);
    await page.goto(`http://localhost:${PORT}/index.html`); await sleep(200);
    await page.evaluate(async ({ who, role }) => { await selectUser(who, role); window.__toasts = []; const real = showToast; window.showToast = m => { window.__toasts.push(String(m)); real(m); }; }, { who, role });
    await sleep(200);
  };
  const toasts = () => page.evaluate(() => (window.__toasts || []).splice(0));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const form = async (clinicId, docIds, yes = true) => {
    await ev(({ clinicId, docIds }) => { closeModal(); switchView('log'); prepLogView(clinicId); pickClinic(clinicId); docIds.forEach(id => pickDoctorSeen(id)); }, { clinicId, docIds });
    if(yes && await page.locator('#rxYes').count()){ await page.locator('#rxYes').tap(); await sleep(60); }
  };
  const box = (scope, doc, type) => page.locator(`${scope} [data-rx-doc="${doc}"] [data-rx-type="${type}"] input.rx-qty`);
  const typeQty = async (doc, type, val, scope = '#rxWrap') => { const b = box(scope, doc, type); await b.tap(); await b.fill(String(val)); await b.press('Enter'); await sleep(50); };
  const save = async notes => {
    await toasts();
    const v = await ev(async notes => { document.getElementById('visitNotes').value = notes; window._lastVisitSaveAt = 0; _lastOfflineToast = 0;
      await saveVisit(); await new Promise(r => setTimeout(r, 250));
      return JSON.parse(JSON.stringify(visits.filter(x => x.notes === notes).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null)); }, notes);
    return { v, toasts: await toasts() };
  };
  // The figures through the app's own code path (the one ledger) and as the Prescriptions tab shows them.
  const figs = () => ev(() => {
    const repFilter = currentUser.role === 'supervisor' ? 'all' : currentUser.name;
    const types = typeof rxTypesDoc !== 'undefined' ? rxTypesDoc : null, broken = typeof _visitsBroken !== 'undefined' ? _visitsBroken : [];
    const g = UMCore.rxGrowth({ clinics: ddPool(), visits, today: todayStr(), repFilter, types, brokenMonths: broken });
    const da = UMCore.doctorAnalytics({ clinics: ddPool(), visits, today: todayStr(), repFilter });
    const doc = id => { const d = da.find(x => x.id === id); return d ? { week: d.handovers.rxWeek, prevWeek: d.handovers.rxPrevWeek, month: d.handovers.rxMonth, total: d.handovers.prescription } : null; };
    closeModal(); switchView('doctors'); ddTab = 'rx'; renderDoctorsDb();
    const q = s => document.querySelector('#ddBody ' + s);
    const num = el => el ? +el.textContent.replace(/[^\d]/g, '') : null;
    const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    const sum = (list, k) => (list || []).reduce((s, x) => s + (x[k] || 0), 0);
    const W = g.windows || {}, inW = (r, a, b) => r.date >= W[a] && r.date <= W[b];
    const keys = { week: ['weekFrom', 'weekTo'], prevWeek: ['prevWeekFrom', 'prevWeekTo'], month: ['monthFrom', 'monthTo'], prevMonth: ['prevMonthFrom', 'prevMonthTo'] };
    const outside = k => (g.rows || []).filter(r => (r.doctorId == null || !r.listed) && (k === 'total' || inW(r, keys[k][0], keys[k][1]))).reduce((s, r) => s + r.qty, 0);
    const inv = ['week', 'prevWeek', 'month', 'prevMonth', 'total'].every(k => { const t = g.totals[k];
      return t === sum(g.byClinic, k) && t === sum(g.byType, k) && t === sum(g.byDoctor, k) + outside(k); });
    return { totals: g.totals, byType: (g.byType || []).map(t => [t.type, t.name, t.total]), inv,
      huda: doc('m1-d1'), omar: doc('m1-d2'), sara: doc('m2-d1'), faisal: doc('r1-d1'),
      screen: { week: num(q('[data-rx-total="week"]')), month: num(q('[data-rx-total="month"]')), all: num(q('[data-rx-total="all"]')) },
      row: id => null, faisalRow: txt(q('[data-rx-doctor="r1|r1-d1"]')), omarRow: txt(q('[data-rx-doctor="m1|m1-d2"]')), m1Row: txt(q('[data-rx-center="m1"]')),
      monthTile: txt((q('[data-rx-total="month"]') || {}).closest ? q('[data-rx-total="month"]').closest('.rx-tile') : null),
      text: (document.getElementById('ddBody') || {}).innerText || '' };
  });
  const xlsx = (fn, args) => ev(({ fn, args }) => { let cap = null; const real = window.downloadXlsx; window.downloadXlsx = (f, rows) => { cap = rows; }; try{ window[fn](...(args || [])); } finally { window.downloadXlsx = real; } return cap; }, { fn, args });
  const modalText = code => ev(code => { (0, eval)(code); const t = (document.getElementById('modalInner') || {}).innerText || ''; return t.replace(/[ \t]+/g, ' '); }, code);
  const logV1 = async () => { await form('m1', ['m1-d1', 'm1-d2']); await typeQty('m1-d1', 'tortho', 5); await typeQty('m1-d1', 'twhite', 2); return save('rx visit 1'); };
  const offered = (doc, scope = '#rxWrap') => ev(({ doc, scope }) => [...document.querySelectorAll(`${scope} [data-rx-doc="${doc}"] [data-rx-type]`)].map(e => e.dataset.rxType), { doc, scope });

  // ======================= P0 — reproduce first (red before the feature) =======================
  await phase('P0', 'reproduce', async () => {
    reseed(); await boot(M, 'rep'); await form('m1', ['m1-d1', 'm1-d2']);
    const r1 = await ev(() => { const w = document.querySelector('#view-log #rxWrap');
      return { step: !!w, blocks: w ? [...w.querySelectorAll('.rx-doc')].map(b => b.dataset.rxDoc) : [], types: w ? [...w.querySelectorAll('[data-rx-doc="m1-d1"] [data-rx-type]')].map(e => e.dataset.rxType) : [] }; });
    check('R1 the visit form has a "Prescriptions given?" step: after Yes, one block per person met and a row per active type (retired Kids not offered)',
      r1.step && JSON.stringify(r1.blocks) === '["m1-d1","m1-d2"]' && JSON.stringify(r1.types) === '["tortho","twhite","timpl"]', r1);
    const f = await figs();
    check('R2 the seeded visit lines count on the Doctors page (Huda 8 / month 4 / week 2; Mariam 9 / 5 / 2 on the tiles; the call\'s 9 never)',
      f.huda && f.huda.total === 8 && f.huda.month === 4 && f.huda.week === 2 && f.omar.total === 1 && f.screen.all === 9 && f.screen.month === 5 && f.screen.week === 2, { huda: f.huda, omar: f.omar, screen: f.screen });
    const csv = await ev(() => { closeModal();
      const mk = (id, rx) => ({ id, clinicId: 'm1', rep: 'Mariam', withRep: null, date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [],
        orderGross: 0, orderDiscount: 0, orderTotal: 0, doctorId: 'm1-d1', doctorIds: ['m1-d1'], nextFollowUp: null, notes: '', noOrderReason: null, rx });
      visits.push(mk('r3a', [{ type: 'tortho', name: 'Ortho care prescription', qty: 1, doctorId: 'm1-d1' }]), mk('r3b', [{ type: 'twhite', name: 'Whitening prescription', qty: 1, doctorId: 'm1-d1' }]));
      const rows = buildVisitsCSV(null); visits = visits.filter(v => v.id !== 'r3a' && v.id !== 'r3b');
      return { head: rows[0], today: rows.filter(r => r[0] === todayStr() && r[5] === 'Dental 8 Clinic').length }; });
    check('R3 two same-day visits that differ only in their prescriptions are two rows in the visits CSV, with the pads columns',
      csv.today === 2 && csv.head.includes('Prescription pads given') && csv.head.includes('Prescription pads detail'), csv);
    // R4 — duplicate doctor records merged at the supervisor's boot: the lines follow the survivor
    reseed({ clinics: CLINICS().map(c => c.id !== 'm2' ? c : Object.assign({}, c, { doctors: [{ id: 'm2-d1', name: 'Dr. Sara Nasser' }, { id: 'm2-d2', name: 'dr sara nasser' }] })),
      oct: OCT().concat([V('vD', 'm2', M, '2026-10-12', ['m2-d2'], [line(T.ortho, 4, 'm2-d2')])]) });
    await boot(G, 'supervisor'); await sleep(300);
    const vD = copies('vD')[0], f4 = await figs();
    check('R4 merged duplicate doctors: the cloud copy of the visit names the survivor in its lines too, and Sara counts 4',
      vD && JSON.stringify(vD.doctorIds) === '["m2-d1"]' && vD.rx && vD.rx[0].doctorId === 'm2-d1' && f4.sara && f4.sara.total === 4, { vD: vD && { doctorIds: vD.doctorIds, rx: vD.rx }, sara: f4.sara });
    // R5 — an edit the cloud refuses must not end on "✅ Changes saved"
    reseed(); await boot(M, 'rep'); mode.failSet = /^visits/;
    await ev(() => { openEditVisit('vO1'); document.getElementById('evNotes').value = 'edited offline'; _lastOfflineToast = 0; window.__toasts.length = 0; });
    await ev(() => saveEditVisit('vO1')); await sleep(150); const t5 = await toasts(); mode.failSet = null;
    check('R5 a refused edit never ends on "✅ Changes saved" — it says the changes are kept on this device', t5.length && t5[t5.length - 1] !== '✅ Changes saved' && t5.some(t => /📴|on this device|على هذا الجهاز/.test(t)), t5);
    // R6 — growth from nothing is not "▲ 100%" (Faisal: 0 the same days last week, 3 this week)
    reseed(); await boot(G, 'supervisor'); const f6 = await figs();
    check('R6 the Prescriptions tab never shows "▲ 100%" (nor a 0% growth) when the previous figure is 0 — it says "from zero"',
      !/▲ ?100%/.test(f6.text) && /from zero/.test(f6.faisalRow) && !/\b0%/.test(f6.faisalRow), { row: f6.faisalRow });
    // R7 — the Prescriptions tab in Arabic
    await boot(G, 'supervisor', { ultramed_lang: 'ar' }); const f7 = await figs(); await sleep(80);
    const ar7 = await ev(() => document.getElementById('ddBody').innerText);
    check('R7 the Prescriptions tab in Arabic has no English labels left', !/Prescriptions distributed|THIS WEEK|THIS MONTH|By doctor|By center|By type|Same days|from zero|This week|This month|All time|\bpads?\b|Export/i.test(ar7) && /بريسكريبشن/.test(ar7), ar7.slice(0, 300));
    // R8 / R9 — the doctor profile: no new "Prescription" entries; a handover save tells the truth
    await boot(M, 'rep');
    const kinds = await ev(() => { openDoctorProfile('m1', 'm1-d1'); return { all: [...document.querySelectorAll('#hoKind .chip[data-kind]')].map(c => c.dataset.kind), on: (document.querySelector('#hoKind .chip.on') || {dataset: {}}).dataset.kind }; });
    check('R8 the profile no longer offers "Prescription" for new entries (they are logged with the visit); Sample is preselected', kinds.all.length && !kinds.all.includes('prescription') && kinds.on === 'sample', kinds);
    mode.failSet = /^clinics$/;
    await ev(() => { document.getElementById('hoWhat').value = 'Toothbrush samples'; document.getElementById('hoQty').value = '3'; _lastOfflineToast = 0; window.__toasts.length = 0; });
    await ev(() => addHandover('m1', 'm1-d1')); await sleep(150); const t9 = await toasts(); mode.failSet = null;
    check('R9 a handover the cloud refuses never says "سُجِّل التسليم" — it says it is kept on this device', !t9.some(t => /سُجِّل التسليم/.test(t)) && t9.some(t => /Handover kept on this device|على هذا الجهاز/.test(t)), t9);
  });

  // ======================= P1 — logging (Mariam) =======================
  await phase('P1', 'logging', async () => {
    reseed(); await boot(M, 'rep'); await form('m1', ['m1-d1', 'm1-d2']);
    const pad = await ev(() => [...document.querySelectorAll('#rxWrap input.rx-qty')].map(i => i.getAttribute('inputmode') + '|' + i.getAttribute('aria-label')));
    check('a block per person met, a box per active type, numeric keypad (2 × 3 = 6)', pad.length === 6 && pad.every(k => /^numeric\|/.test(k)), pad);
    const s = await logV1(), v = s.v;
    check('stored: each type with its current name, the pads, the person who got them; nothing for Omar; no zero lines',
      v && JSON.stringify(sig(v)) === JSON.stringify(['tortho|Ortho care prescription|5|m1-d1', 'twhite|Whitening prescription|2|m1-d1']), v && v.rx);
    check('…once in the cloud, with the same lines', copies(v.id).length === 1 && JSON.stringify(sig(copies(v.id)[0])) === JSON.stringify(sig(v)));
    check('the save says logged (no offline / not-saved wording)', s.toasts.length && !s.toasts.some(t => /📴|⚠️|لم تُحفظ|على هذا الجهاز/.test(t)), s.toasts);
    const h = await modalText(`openClinicDetail('m1')`), hAt = h.search(/visit history/i), hist = hAt >= 0 ? h.slice(hAt) : ''; // the title is upper-cased by CSS
    check('the clinic history shows who got which form and how many pads', /Dr\. Huda Ali: Ortho care prescription ×5, Whitening prescription ×2/.test(hist), hist.slice(0, 400));
    const sh = await ev(() => { closeModal(); switchView('today'); return { recent: document.getElementById('recentVisits').innerText, log: (switchView('log'), document.getElementById('logHistory').innerText) }; });
    check('the short lists say "7 pads" (Today\'s recent visits, my visit log)', /7 pads/.test(sh.recent) && /7 pads/.test(sh.log), sh);
    let f = await figs();
    check('counted once: Huda week 9, month 11, all 15; Omar (met, given nothing) still 1', f.huda.week === 9 && f.huda.month === 11 && f.huda.total === 15 && f.omar.total === 1, { huda: f.huda, omar: f.omar });
    check('Mariam: week 9 / month 12 / all 16, and the tiles show the same', f.totals.week === 9 && f.totals.month === 12 && f.totals.total === 16 && f.screen.week === 9 && f.screen.month === 12 && f.screen.all === 16, { t: f.totals, s: f.screen });
    check('the rows add up in every window (doctors + at the clinic + no longer listed = centers = types = total)', f.inv, f.totals);
    const rxRows = await xlsx('exportRxXlsx') || [], hu = rxRows.find(r => r[0] === 'Dr. Huda Ali');
    const every = rxRows.findIndex(r => /EVERY PRESCRIPTION/.test(String(r[0]))), lines = every >= 0 ? rxRows.slice(every + 2) : [];
    check('the prescriptions Excel agrees (pads: week 9, month 11, all 15) and lists every line it counted (16 pads, the call\'s never)', hu && hu[3] === 9 && hu[6] === 11 && hu[9] === 15 && /Pads/.test(String(rxRows[0]))
      && lines.some(r => r[2] === 'Dr. Huda Ali' && r[3] === 'Ortho care prescription' && r[4] === 5 && r[6] === 'Visit') && lines.reduce((s, r) => s + (+r[4] || 0), 0) === 16, { hu, head: rxRows[0], lines: lines.slice(0, 3) });
    const prof = await modalText(`openDoctorProfile('m1','m1-d1')`);
    check('the profile: "11 / 15" and the visit\'s lines listed read-only', /11 \/ 15/.test(prof) && /from the visit — edit it there|من الزيارة/.test(prof) && /Ortho care prescription ×5/.test(prof), prof.slice(0, 500));
    const rep = await xlsx('exportDoctorReportXlsx', ['m1', 'm1-d1']) || [], at = rep.findIndex(r => /PRESCRIPTION/.test(String(r[0])));
    const repRows = at >= 0 ? rep.slice(at + 2).filter(r => r.length > 2 && /^\d{4}-/.test(r[0]) && (r[4] === 'Visit' || r[4] === 'Doctor profile')) : [];
    check('the doctor report: its PRESCRIPTIONS section sums to the total (15 pads), handovers keep samples and gifts only',
      at >= 0 && repRows.reduce((s, r) => s + r[2], 0) === 15 && rep.some(r => r[0] === 'Prescription pads (total)' && r[1] === 15), { at, repRows });
    check('nothing copied into the doctor card (it would count twice)', J('clinics').find(c => c.id === 'm1').doctors.find(d => d.id === 'm1-d1').handovers.length === 1);
    const csv = await ev(() => buildVisitsCSV(null)); const row = csv.find(r => r.includes('rx visit 1')), hi = csv[0].indexOf('Prescription pads given');
    check('the visits CSV carries the pads given and the detail', hi > 0 && row && row[hi] === 7 && /Dr\. Huda Ali: Ortho care prescription ×5, Whitening prescription ×2/.test(row[hi + 1]), { head: csv[0].slice(-3), row: row && row.slice(-3) });
    const vl = await ev(async () => { closeModal(); openVisitLog();
      const sum = document.getElementById('vlSummary').innerText.replace(/\s+/g, ' ');
      const card = [...document.querySelectorAll('#vlBody .card')].map(c => c.innerText.replace(/\s+/g, ' ')).find(t => /rx visit 1/.test(t)) || '';
      document.getElementById('vlSearch').value = 'whitening'; renderVisitLog();
      const found = document.querySelectorAll('#vlBody .card').length;
      let copied = null;
      try{ Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { copied = t; return Promise.resolve(); } } }); }catch(e){}
      copyVisitLog(); await new Promise(r => setTimeout(r, 50)); closeModal();
      return { sum, card, found, copied }; });
    check('the visit log: "Prescription pads given 14" this month (7 + 3 + 4; the call never), the card shows who got what, a search finds the type, "copy as text" carries the lines',
      /Prescription pads given\s*14\b/.test(vl.sum) && /Dr\. Huda Ali: Ortho care prescription ×5, Whitening prescription ×2/.test(vl.card) && vl.found === 2 && /Prescription pads: Dr\. Huda Ali: Ortho care prescription ×5, Whitening prescription ×2/.test(vl.copied || ''), vl);
    await form('m1', ['m1-d1'], false);
    const next = await ev(() => ({ no: document.getElementById('rxNo').classList.contains('on'), hidden: document.getElementById('rxBlocks').style.display === 'none', draft: JSON.stringify(rxDrafts.log) }));
    await page.locator('#rxYes').tap(); await sleep(50);
    const zeros = await ev(() => [...document.querySelectorAll('#rxWrap input.rx-qty')].map(i => +i.value));
    check('the next form starts at No, with an empty draft (every box 0)', next.no && next.hidden && next.draft === '{}' && zeros.length === 3 && zeros.every(n => n === 0), { next, zeros });
    await boot(G, 'supervisor'); f = await figs();
    check('supervisor: the team week 12, month 15, all 19', f.totals.week === 12 && f.totals.month === 15 && f.totals.total === 19 && f.screen.all === 19, f.totals);
  });

  // ======================= P2 — typed quantities, people, clinic =======================
  await phase('P2', 'input', async () => {
    reseed(); await boot(M, 'rep'); await form('m1', ['m1-d1', 'm1-d2']);
    const q = [];
    for(const val of ['-4', '2.9', '99999']){ await typeQty('m1-d1', 'tortho', val); q.push(+(await box('#rxWrap', 'm1-d1', 'tortho').inputValue())); }
    for(const val of ['abc', '']){ q.push(await ev(v => { const el = document.querySelector('#rxWrap [data-rx-doc="m1-d1"] [data-rx-type="tortho"] input.rx-qty');
      el.focus(); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); el.blur(); return +el.value; }, val)); }
    check('typed pads are cleaned: −4→0, 2.9→2, 99999→999, letters→0, empty→0', JSON.stringify(q) === '[0,2,999,0,0]', q);
    const b = box('#rxWrap', 'm1-d1', 'tortho'); await b.tap(); await b.fill('7');
    await page.locator('#rxWrap [data-rx-doc="m1-d1"] [data-rx-type="tortho"] button.rx-plus').tap(); await sleep(60);
    const tap = await ev(() => ({ shown: document.querySelector('#rxWrap [data-rx-doc="m1-d1"] [data-rx-type="tortho"] input.rx-qty').value, draft: rxDrafts.log['m1-d1'], minus: document.querySelector('#rxWrap [data-rx-doc="m1-d1"] [data-rx-type="tortho"] button.rx-minus').disabled, total: document.getElementById('rxTotal-log').innerText }));
    check('type 7 then tap + straight away → 8 (the tap is not swallowed); the total follows', tap.shown === '8' && tap.draft.tortho === 8 && !tap.minus && /8 pads/.test(tap.total), tap);
    await typeQty('m1-d2', 'twhite', 4); await toasts();
    await page.locator('#doctorPickChips .chip', { hasText: 'Dr. Omar Saleh' }).tap(); await sleep(60);
    const un = await ev(() => ({ blocks: [...document.querySelectorAll('#rxWrap .rx-doc')].map(b => b.dataset.rxDoc), draft: Object.keys(rxDrafts.log) }));
    const unT = await toasts();
    check('un-tapping Omar drops his typed pads, with a toast', JSON.stringify(un.blocks) === '["m1-d1"]' && !un.draft.includes('m1-d2') && unT.some(t => /typed for that person were cleared/.test(t)), { un, unT });
    let s = await save('untapped');
    check('…and the visit stores Huda\'s 8 only', s.v && JSON.stringify(sig(s.v)) === '["tortho|Ortho care prescription|8|m1-d1"]', s.v && s.v.rx);
    await form('m1', ['m1-d1']); await typeQty('m1-d1', 'tortho', 3); await toasts();
    await page.locator('#selectedClinicCard button.chip', { hasText: 'Change' }).tap(); await sleep(60);
    const chT = await toasts();
    await ev(() => { pickClinic('m2'); pickDoctorSeen('m2-d1'); });
    const after = await ev(() => ({ blocks: [...document.querySelectorAll('#rxWrap .rx-doc')].map(b => b.dataset.rxDoc), vals: [...document.querySelectorAll('#rxWrap input.rx-qty')].map(i => +i.value) }));
    s = await save('changed clinic');
    check('changing the clinic clears what was typed for the first one (toast), nothing reaches the new visit', chT.some(t => /previous clinic were cleared/.test(t)) && JSON.stringify(after.blocks) === '["m2-d1"]' && after.vals.every(n => n === 0) && s.v && !s.v.rx, { chT, after, rx: s.v && s.v.rx });
    await form('m1', ['m1-d1']); await page.locator('#rxAddClinic-log').tap(); await sleep(60);
    await typeQty('', 'twhite', 2); s = await save('left at reception');
    const f = await figs(), c1 = await ev(() => { const g = UMCore.rxGrowth({ clinics: ddPool(), visits, today: todayStr(), repFilter: currentUser.name, types: rxTypesDoc }); return g.byClinic.find(c => c.clinicId === 'm1'); });
    check('forms left at the clinic (no one person): stored with no doctor, counted for the clinic and the team, for no doctor; the rows add up',
      s.v && JSON.stringify(sig(s.v)) === '["twhite|Whitening prescription|2|"]' && f.totals.total === 9 + 8 + 2 && f.huda.total === 8 + 8 && c1.unnamed === 2 && f.inv && /incl\. 2 pads left at the clinic/.test(f.m1Row), { t: f.totals, huda: f.huda, c1, row: f.m1Row });
  });

  // ======================= P3 — edit, re-date, delete, restore =======================
  await phase('P3', 'edit, re-date, delete, restore', async () => {
    reseed(); await boot(M, 'rep'); const v = (await logV1()).v;
    await ev(id => openEditVisit(id), v.id);
    const sheet = await ev(() => ({ blocks: [...document.querySelectorAll('#evRx .rx-doc')].map(b => b.dataset.rxDoc), vals: [...document.querySelectorAll('#evRx [data-rx-doc="m1-d1"] input.rx-qty')].map(i => +i.value) }));
    check('the edit sheet shows the lines (Huda 5 and 2; Omar 0)', JSON.stringify(sheet.blocks) === '["m1-d1","m1-d2"]' && JSON.stringify(sheet.vals) === '[5,2,0]', sheet);
    await typeQty('m1-d1', 'tortho', 3, '#evRx'); await typeQty('m1-d1', 'twhite', 0, '#evRx'); await toasts();
    await ev(id => saveEditVisit(id), v.id); await sleep(150); const et = await toasts();
    let f = await figs();
    check('edit: Huda month 11→7, all 15→11; the cloud holds Ortho ×3 only; "✅ Changes saved"', f.huda.month === 7 && f.huda.total === 11 && JSON.stringify(sig(copies(v.id)[0])) === '["tortho|Ortho care prescription|3|m1-d1"]' && et.includes('✅ Changes saved'), { huda: f.huda, et });
    const eh = await modalText(`showEditHistory(${JSON.stringify(v.id)})`);
    check('the edit history shows what was given before (×5, ×2)', /Prescriptions were:/.test(eh) && /Ortho care prescription ×5/.test(eh) && /Whitening prescription ×2/.test(eh), eh.slice(0, 300));
    await ev(id => { closeModal(); openEditVisit(id); }, v.id);
    await page.locator('#editDocChips .chip', { hasText: 'Dr. Omar Saleh' }).tap(); await sleep(60);
    await ev(id => saveEditVisit(id), v.id); await sleep(150);
    const eh2 = await modalText(`showEditHistory(${JSON.stringify(v.id)})`), first = eh2.split(/Edited by/)[1] || '';
    check('a change of the people met is recorded with who was met before ("Doctors met were: Dr. Huda Ali, Dr. Omar Saleh"); the pads are untouched', /Doctors met were: Dr\. Huda Ali, Dr\. Omar Saleh/.test(first) && !/Prescriptions were:/.test(first) && JSON.stringify(sig(copies(v.id)[0])) === '["tortho|Ortho care prescription|3|m1-d1"]', first.slice(0, 300));
    await ev(async id => { openEditVisit(id); document.getElementById('evDate').value = '2026-09-30'; await saveEditVisit(id); }, v.id); await sleep(150);
    f = await figs(); const home = { live: (J('visits') || []).filter(x => x.id === v.id).length, sep: (J('visitsArch:2026-09') || []).filter(x => x.id === v.id).length };
    check('re-dated to 30 Sep: out of this month (7→4), all kept (11), once in the September archive', f.huda.month === 4 && f.huda.total === 11 && home.live === 0 && home.sep === 1, { h: f.huda, home });
    const del = await modalText(`confirmDeleteVisit(${JSON.stringify(v.id)})`);
    check('the delete confirmation shows what goes to the bin', /Ortho care prescription ×3/.test(del), del.slice(0, 300));
    await ev(id => deleteVisit(id), v.id); await sleep(100); f = await figs();
    check('deleted: Huda back to 8', f.huda.total === 8, f.huda);
    await boot(G, 'supervisor');
    await ev(async id => { await restoreFromBin('visits', recycleBin.visits.findIndex(x => x.id === id));
      recycleBin.visits.push(Object.assign({}, visits.find(x => x.id === id), { _deletedAt: Date.now(), _label: 'stale' })); await restoreFromBin('visits', recycleBin.visits.length - 1); }, v.id);
    await sleep(150); f = await figs();
    check('restored once — a second restore never duplicates (11, one cloud copy)', f.huda.total === 11 && copies(v.id).length === 1, { huda: f.huda, n: copies(v.id).length });
  });

  // ======================= P4 — joint visit =======================
  await phase('P4', 'joint visit', async () => {
    reseed(); await boot(M, 'rep'); await form('m1', ['m1-d1']); await ev(() => setJointRep('Renova')); await typeQty('m1-d1', 'tortho', 2);
    const v = (await save('joint rx')).v;
    await boot(G, 'supervisor'); let f = await figs(); const team1 = f.totals.total;
    await boot(R, 'rep');
    const sh = await ev(id => { openEditVisit(id); return { rows: document.querySelectorAll('#evRx [data-rx-type]').length, del: /Delete this visit/.test(document.getElementById('modalInner').innerText) }; }, v.id);
    await typeQty('m1-d1', 'tortho', 1, '#evRx'); await ev(id => saveEditVisit(id), v.id); await sleep(150);
    const her = await figs(); await boot(G, 'supervisor'); f = await figs();
    check('joint visit: once for the team (12 → 14 → 13 after her edit); the partner may edit the lines, not delete; her own page stays 3',
      team1 === 14 && sh.rows > 0 && !sh.del && f.totals.total === 13 && her.totals.total === 3 && copies(v.id)[0].rx[0].qty === 1, { team1, sh, team: f.totals.total, her: her.totals.total });
  });

  // ======================= P5 — refused saves =======================
  await phase('P5', 'refused saves', async () => {
    reseed(); await boot(M, 'rep');
    mode.failSet = /^visits/; await form('m1', ['m1-d1']); await typeQty('m1-d1', 'tortho', 5); let s = await save('offline rx');
    const queued = await ev(() => outboxHas('visits'));
    check('the cloud refuses: no "logged", the phone says it kept the visit, the cloud holds nothing, queued',
      s.v && copies(s.v.id).length === 0 && queued && s.toasts.some(t => /الزيارة محفوظة على هذا الجهاز/.test(t)) && !s.toasts.some(t => /✅|logged|captured|books|momentum|Saved —/i.test(t)), s.toasts);
    mode.failSet = null; await ev(() => flushOutbox()); await sleep(300); let f = await figs();
    check('back online: it lands once and counts once (Huda 8 → 13)', copies(s.v.id).length === 1 && f.huda.total === 13, f.huda);
    mode.failSet = /^visits/; await ev(id => openEditVisit(id), s.v.id); await typeQty('m1-d1', 'tortho', 1, '#evRx'); await toasts();
    await ev(async id => { _lastOfflineToast = 0; await saveEditVisit(id); }, s.v.id); await sleep(100); const e = await toasts();
    check('a refused edit ends on the 📴 edit message, never "✅ Changes saved"', e[e.length - 1] === '📴 Changes kept on this device — they upload automatically when back online', e);
    mode.failSet = null; await ev(() => flushOutbox()); await sleep(300);
    check('…and the edit lands once back online (cloud: Ortho ×1)', JSON.stringify(sig(copies(s.v.id)[0])) === '["tortho|Ortho care prescription|1|m1-d1"]', copies(s.v.id)[0] && copies(s.v.id)[0].rx);
    mode.failSet = /^clinics$/; await form('m1', ['m1-d1']); await typeQty('m1-d1', 'twhite', 4); s = await save('clinics refused'); mode.failSet = null;
    check('a refused clinics save in the same tap cannot lose the lines (the visit reaches the cloud with them)', s.v && copies(s.v.id).length === 1 && JSON.stringify(sig(copies(s.v.id)[0])) === '["twhite|Whitening prescription|4|m1-d1"]', s.v && copies(s.v.id));
    await ev(() => flushOutbox()); await sleep(200);
    f = await figs(); const before = f.huda.total;
    mode.failSet = /^recycleBin$/; await toasts(); await ev(id => deleteVisit(id), s.v.id); await sleep(150); const d = await toasts(); mode.failSet = null; f = await figs();
    check('a delete whose bin copy fails: nothing deleted, said so; the count is unchanged', d.some(t => /لم يُحذف شيء/.test(t)) && f.huda.total === before && copies(s.v.id).length === 1, { d, before, now: f.huda.total });
    await ev(() => { closeModal(); openDoctorProfile('m1', 'm1-d1'); document.getElementById('hoWhat').value = 'Floss samples'; _seedClinics = true; window.__toasts.length = 0; }); // the clinics save is refused outright (nothing queued)
    await ev(() => addHandover('m1', 'm1-d1')); await sleep(150); const rt = await toasts();
    const kept = await ev(() => { _seedClinics = false; const d = clinics.find(c => c.id === 'm1').doctors.find(x => x.id === 'm1-d1'); const shown = /Floss samples/.test(document.getElementById('modalInner').innerText); closeModal(); return { n: d.handovers.filter(h => h.what === 'Floss samples').length, shown }; });
    check('a handover that could not be saved anywhere is taken back and said so ("⚠️ Not saved — the handover was not added…"), never "سُجِّل التسليم"', rt.includes('⚠️ Not saved — the handover was not added. Try again with a connection.') && !rt.some(t => /سُجِّل التسليم/.test(t)) && kept.n === 0 && !kept.shown, { rt, kept });
  });

  // ======================= P6 — Arabic =======================
  await phase('P6', 'Arabic', async () => {
    reseed({ rxTypes: TYPES([T.ortho, T.white, T.impl, T.kids, { id: 'tother', name: 'Other', active: true }]) }); // "Other" is a dictionary word
    await boot(M, 'rep', { ultramed_lang: 'ar' }); await form('m1', ['m1-d1']); await sleep(80);
    const ar = await ev(() => { const w = document.getElementById('rxWrap'), left = [];
      const walk = document.createTreeWalker(w, NodeFilter.SHOW_TEXT);
      for(let n = walk.nextNode(); n; n = walk.nextNode()){ const t = n.nodeValue.trim(); if(t && !n.parentElement.closest('[dir="auto"]') && /[A-Za-z]/.test(t)) left.push(t); }
      w.querySelectorAll('[aria-label],[placeholder],[title]').forEach(el => ['aria-label', 'placeholder', 'title'].forEach(a => { const v = el.getAttribute(a); if(v && /[A-Za-z]/.test(v)) left.push(a + '=' + v); }));
      return { dir: document.documentElement.dir, head: w.querySelector('.step-h').innerText.replace(/\s+/g, ' '), left,
        names: [...w.querySelectorAll('[data-rx-doc="m1-d1"] [data-rx-type] .pname [dir="auto"]')].map(e => e.innerText.trim()) }; });
    check('the step in the team\'s word (بريسكريبشن), in pads (دفاتر), right to left; no English left apart from data', ar.dir === 'rtl' && /سلّمت بريسكريبشن؟/.test(ar.head) && /الدفاتر/.test(ar.head) && !ar.left.length, ar);
    check('type names are data, untouched ("Other" is not أخرى; the Arabic name as typed)', JSON.stringify(ar.names) === JSON.stringify(['Ortho care prescription', 'Whitening prescription', 'وصفة العناية بالزراعة', 'Other']), ar.names);
    await typeQty('m1-d1', 'timpl', 2); const s = await save('ar rx'); await sleep(80);
    const rv = await ev(() => document.getElementById('recentVisits').innerText);
    check('the short line in Arabic: "2 دفتران"', /2 دفتران/.test(rv), rv.slice(0, 200));
    const hist = await modalText(`openClinicDetail('m1')`);
    check('the clinic history keeps the name as typed: "وصفة العناية بالزراعة ×2"', /وصفة العناية بالزراعة ×2/.test(hist), hist.slice(-300));
    await ev(() => { closeModal(); openDoctorProfile('m1', 'm1-d1'); }); await sleep(120); // the translation runs as the nodes arrive
    const prAr = await ev(() => { const m = document.getElementById('modalInner'), left = [];
      const walk = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
      for(let n = walk.nextNode(); n; n = walk.nextNode()){ const t = n.nodeValue.trim(); if(t && !n.parentElement.closest('[dir="auto"]') && /Prescription|Sample|Gift|from the visit|logged with the visit|pads?\b/.test(t)) left.push(t); }
      const txt = m.innerText; closeModal(); return { left, rx: /💊 بريسكريبشن/.test(txt), fromVisit: /من الزيارة — عدّله من هناك/.test(txt), note: /البريسكريبشن يُسجَّل مع الزيارة/.test(txt), kinds: /🧪 عينة/.test(txt) }; });
    check('the profile in Arabic: the old entry reads "💊 بريسكريبشن", the visit lines "من الزيارة — عدّله من هناك", the note and the kinds translated', !prAr.left.length && prAr.rx && prAr.fromVisit && prAr.note && prAr.kinds, prAr);
    await boot(G, 'supervisor', { ultramed_lang: 'ar' }); await figs(); await sleep(100);
    await ev(() => openRxTypes()); await sleep(120);
    const edAr = await ev(() => { const m = document.getElementById('modalInner'), left = [];
      const walk = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
      for(let n = walk.nextNode(); n; n = walk.nextNode()){ const t = n.nodeValue.trim(); if(t && !n.parentElement.closest('[dir="auto"]') && /[A-Za-z]{2,}/.test(t.replace(/Dr\. Ghaith/g, ''))) left.push(t); }
      m.querySelectorAll('[placeholder],[aria-label]').forEach(el => ['placeholder', 'aria-label'].forEach(a => { const v = el.getAttribute(a); if(v && /[A-Za-z]{2,}/.test(v)) left.push(a + '=' + v); }));
      const head = (m.querySelector('h3') || {}).innerText || ''; closeModal(); return { left, head }; });
    check('the types editor in Arabic: no English left apart from the type names and who changed it', !edAr.left.length && /أنواع البريسكريبشن/.test(edAr.head), edAr);
    await figs();
    const tab = await ev(() => { const b = document.getElementById('ddBody'), left = [];
      const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for(let n = walk.nextNode(); n; n = walk.nextNode()){ const t = n.nodeValue.trim(); if(t && !n.parentElement.closest('[dir="auto"]') && /[A-Za-z]{2,}/.test(t.replace(/\bExcel\b/g, ''))) left.push(t); } // "Excel" is kept in Latin across the app
      return { left, other: !!b.querySelector('[data-rx-bytype="tother"] [dir="auto"]') && b.querySelector('[data-rx-bytype="tother"] [dir="auto"]').innerText.trim() }; });
    check('the Prescriptions tab in Arabic: no English labels left; the type "Other" stays "Other"', !tab.left.length && tab.other === 'Other', tab);
  });

  // ======================= P7 — the supervisor's types editor =======================
  await phase('P7', 'types editor', async () => {
    reseed(); await boot(M, 'rep'); await toasts(); await ev(() => openRxTypes());
    check('a rep: "Supervisor only"', (await toasts()).includes('Supervisor only'));
    await boot(G, 'supervisor'); mode.falseSet = /^rxTypes$/;
    await ev(() => openRxTypes()); await page.locator('#rxtNewName').fill('Sensitivity prescription'); await page.locator('#rxtAdd').tap(); await sleep(50); await toasts();
    await page.locator('#rxtSave').tap(); await sleep(400);
    const bad = await ev(() => ({ mem: rxTypes().map(t => t.name), open: !!document.getElementById('rxtSave'), still: [...document.querySelectorAll('#rxtList input.rxt-name')].map(i => i.value) }));
    const bt = await toasts(); mode.falseSet = null;
    check('the cloud refuses: nothing added (memory, cloud), "Not saved…", no ✅, the editor stays open with the edit',
      !bad.mem.includes('Sensitivity prescription') && !J('rxTypes').types.some(t => /Sensitivity/.test(t.name)) && J('rxTypes').rev === 3 && bt.some(t => /^Not saved — check the connection/.test(t)) && !bt.some(t => /✅/.test(t)) && bad.open && bad.still.includes('Sensitivity prescription'), { bad, bt });
    await ev(() => { closeModal(); openRxTypes(); });
    const c = J('rxTypes'); c.rev = 4; c.types.push({ id: 'tcloud', name: 'Cloud-added type', active: true }); cloud.rxTypes = JSON.stringify(c); // another device saved meanwhile
    await page.locator('[data-rxt="twhite"] input.rxt-name').fill('Whitening plus'); await toasts(); await page.locator('#rxtSave').tap(); await sleep(400);
    const ct = await toasts(), cv = await ev(() => [...document.querySelectorAll('#rxtList input.rxt-name')].map(i => i.value));
    check('a conflict (rev 4 saved elsewhere): said so, nothing written, the editor reopened on the cloud\'s list', ct.some(t => /^Changed on another device/.test(t)) && J('rxTypes').rev === 4 && !JSON.stringify(J('rxTypes')).includes('Whitening plus') && cv.includes('Cloud-added type') && !cv.includes('Whitening plus'), { ct, cv });
    reseed(); await boot(G, 'supervisor'); await ev(() => openRxTypes());
    await page.locator('[data-rxt="twhite"] input.rxt-name').fill('Whitening & care prescription');
    await page.locator('[data-rxt="tortho"] button.rxt-retire').tap(); await sleep(50);
    await page.locator('#rxtNewName').fill('Sensitivity prescription'); await page.locator('#rxtAdd').tap(); await sleep(50); await toasts();
    await page.locator('#rxtNewName').fill('  whitening & CARE prescription '); await page.locator('#rxtAdd').tap(); await sleep(50); const dup = await toasts();
    const kept = await ev(() => [...document.querySelectorAll('#rxtList input.rxt-name')].map(i => i.value));
    await page.locator('#rxtSave').tap(); await sleep(400); const st = await toasts();
    const L = J('rxTypes'), byId = id => L.types.find(t => t.id === id);
    check('a duplicate name is refused; the typed rename survived the redraws', dup.some(t => /same name/.test(t)) && kept.includes('Whitening & care prescription') && kept.filter(n => /whitening/i.test(n)).length === 1, { dup, kept });
    check('saved by compare-and-set: rev 3→4, ids kept on rename, Ortho retired (not deleted), Sensitivity once, who and when',
      st.includes('✅ Prescription types saved') && L.rev === 4 && L.v === 1 && byId('twhite').name === 'Whitening & care prescription' && byId('tortho').active === false && byId('tkids').active === false
      && L.types.filter(t => /sensitivity/i.test(t.name)).length === 1 && L.by === G && /^2026-10-13T10:/.test(L.at) && typeWrites.length === 1 && typeWrites.every(a => a === 'supervisor'), { st, L });
    await ev(() => { closeModal(); openRxTypes(); });
    for(const id of ['twhite', 'timpl']) { await page.locator(`[data-rxt="${id}"] button.rxt-retire`).tap(); await sleep(40); }
    await toasts(); const lastId = await ev(() => document.querySelector('#rxtList [data-rxt] button.rxt-retire').closest('[data-rxt]').dataset.rxt);
    await page.locator(`[data-rxt="${lastId}"] button.rxt-retire`).tap(); await sleep(40); const lt = await toasts();
    await page.locator('#rxtSave').tap(); await sleep(300); const lt2 = await toasts();
    check('retiring every type is refused: "Keep at least one active type"', lt.includes('Keep at least one active type') && J('rxTypes').types.filter(t => t.active !== false).length === 1 && J('rxTypes').rev === 5, { lt, lt2, rev: J('rxTypes').rev });
    reseed(); await boot(G, 'supervisor'); await ev(() => openRxTypes());
    await page.locator('[data-rxt="twhite"] input.rxt-name').fill('Whitening & care prescription'); await page.locator('[data-rxt="tortho"] button.rxt-retire').tap();
    await page.locator('#rxtNewName').fill('Sensitivity prescription'); await page.locator('#rxtAdd').tap(); await page.locator('#rxtSave').tap(); await sleep(400);
    const sid = J('rxTypes').types.find(t => /Sensitivity/.test(t.name)).id;
    await boot(M, 'rep'); await form('m1', ['m1-d1']);
    check('the rep\'s form follows the list: active types only, in order (never retired ones)', JSON.stringify(await offered('m1-d1')) === JSON.stringify(['twhite', 'timpl', sid]), await offered('m1-d1'));
    const h = await modalText(`openClinicDetail('m1')`);
    check('history shows the current names by id (vO1: "Ortho care prescription ×2", "Whitening & care prescription ×1")', /Ortho care prescription ×2/.test(h) && /Whitening & care prescription ×1/.test(h), h.slice(-400));
    const f = await figs(); check('a rename or a retired type moves no figure (Huda 8, Omar 1)', f.huda.total === 8 && f.omar.total === 1, f);
    const rs = await ev(() => { openEditVisit('vO1'); const r = document.querySelector('#evRx [data-rx-doc="m1-d1"] [data-rx-type="tortho"]'); return r ? r.innerText.replace(/\s+/g, ' ') : null; });
    check('the edit sheet still shows the retired type on vO1, marked "(retired)"', rs && /Ortho care prescription/.test(rs) && /\(retired\)/.test(rs), rs);
    reseed(); await boot(M, 'rep'); await form('m1', ['m1-d1']);
    const repShortcut = await ev(() => !!document.getElementById('rxEditTypes'));
    await boot(G, 'supervisor'); await form('m1', ['m1-d1']);
    const sc = await ev(() => !!document.getElementById('rxEditTypes'));
    await page.locator('#rxEditTypes').tap(); await sleep(100);
    await page.locator('#rxtNewName').fill('Gum care prescription'); await page.locator('#rxtAdd').tap(); await sleep(50);
    await page.locator('#rxtSave').tap(); await sleep(400);
    const nid = (J('rxTypes').types.find(t => t.name === 'Gum care prescription') || {}).id, nowOffered = await offered('m1-d1');
    check('"Edit types" sits in the form for the supervisor only; after saving, the open form offers the new type at once', !repShortcut && sc && nid && nowOffered.includes(nid), { repShortcut, sc, nid, nowOffered });
    mode.hangSet = /^rxTypes$/; await ev(() => { closeModal(); openRxTypes(); });
    await page.locator('#rxtNewName').fill('Late type'); await page.locator('#rxtAdd').tap(); await sleep(50); await toasts();
    await page.locator('#rxtSave').tap(); await sleep(300);
    const mid = await ev(() => { const b = document.getElementById('rxtSave'); return { text: b && b.textContent, disabled: !!(b && b.disabled), saving: _rxSaving }; });
    await sleep(8000); const tt = await toasts(); mode.hangSet = null;
    const late = await ev(() => { const b = document.getElementById('rxtSave'); return { mem: rxTypes().map(t => t.name), open: !!b, btn: b && b.textContent, still: [...document.querySelectorAll('#rxtList input.rxt-name')].map(i => i.value) }; });
    check('no answer from the cloud: "Saving…" while it waits (a second tap does nothing), then "No answer from the cloud yet…"; memory unchanged, the editor still open with the edit',
      mid.text === 'Saving…' && mid.disabled && mid.saving && tt.some(t => /^No answer from the cloud yet/.test(t)) && !late.mem.includes('Late type') && late.open && late.btn === 'Save' && late.still.includes('Late type'), { mid, tt, late });
    await ev(() => closeModal());
    check('no rep phone ever wrote state/rxTypes', !repTypeWrites.length, repTypeWrites);
  });

  // ======================= P8 — before the supervisor sets the list =======================
  await phase('P8', 'defaults', async () => {
    reseed({ rxTypes: null }); await boot(M, 'rep'); await form('m1', ['m1-d1']);
    const def = await ev(() => [...document.querySelectorAll('#rxWrap [data-rx-doc="m1-d1"] [data-rx-type]')].map(e => e.dataset.rxType + '|' + e.querySelector('.pname').innerText.trim()));
    check('no list yet: the two printed forms, in order', JSON.stringify(def) === JSON.stringify(['ultramed|Ultramed fast moving products', 'tepe|Tepe prescription']), def);
    await typeQty('m1-d1', 'tepe', 3); const s = await save('default rx');
    check('…saving stores {type:"tepe", name:"Tepe prescription", qty:3, doctorId:"m1-d1"}', s.v && JSON.stringify(s.v.rx) === JSON.stringify([{ type: 'tepe', name: 'Tepe prescription', qty: 3, doctorId: 'm1-d1' }]), s.v && s.v.rx);
    check('…and nothing writes state/rxTypes (boot or save)', !('rxTypes' in cloud) && !mode.sets.includes('rxTypes'), mode.sets.filter(k => /rx/i.test(k)));
    reseed(); const before = cloud.rxTypes; mode.failGet = /^rxTypes$/; await boot(M, 'rep'); await form('m1', ['m1-d1']);
    const nl = await ev(() => ({ types: [...document.querySelectorAll('#rxWrap [data-rx-doc="m1-d1"] [data-rx-type]')].map(e => e.dataset.rxType), note: (document.getElementById('rxTypesNote') || {}).innerText || '' }));
    await typeQty('m1-d1', 'ultramed', 2); const s2 = await save('unreadable types'); mode.failGet = null;
    check('the list cannot be read on a fresh phone: the two forms plus a note; the visit saves; the cloud list is untouched',
      JSON.stringify(nl.types) === '["ultramed","tepe"]' && /did not load/.test(nl.note) && s2.v && s2.v.rx && s2.v.rx[0].qty === 2 && copies(s2.v.id).length === 1 && cloud.rxTypes === before, { nl, rx: s2.v && s2.v.rx });
    reseed(); await boot(M, 'rep'); const e0 = errors.length;
    await ev(() => { delete UMCore.cleanVisitRx; }); await form('m1', ['m1-d1']);
    const st = await ev(() => ({ note: !!document.getElementById('rxStaleNote'), inputs: document.querySelectorAll('#rxWrap input.rx-qty').length }));
    const s3 = await save('stale core');
    check('an old cached core.js: a "reopen the app" note, no boxes, the visit still saves, no page errors', st.note && st.inputs === 0 && s3.v && !s3.v.rx && copies(s3.v.id).length === 1 && errors.length === e0, { st, errs: errors.slice(e0) });
  });

  // ======================= P9 — edges =======================
  await phase('P9', 'edges', async () => {
    reseed(); await boot(M, 'rep'); await ev(() => removeDoctor('m1', 'm1-d2')); await sleep(150);
    let f = await figs();
    check('a removed doctor: his pads stay in the clinic and team totals (Mariam 9), shown as "incl. 1 pad to a doctor no longer listed"; the rows add up',
      f.totals.total === 9 && /incl\. 1 pad to a doctor no longer listed/.test(f.m1Row) && f.inv && !f.omarRow, { t: f.totals.total, row: f.m1Row });
    reseed(); await boot(M, 'rep');
    await form('m1', ['m1-d1']); await typeQty('m1-d1', 'tortho', 1); await save('');
    await form('m1', ['m1-d1']); await typeQty('m1-d1', 'twhite', 1); await save(''); f = await figs();
    const n2 = await ev(() => buildVisitsCSV(null).filter(r => r[0] === todayStr() && r[5] === 'Dental 8 Clinic').length);
    check('a second same-day visit with other lines is its own visit (Huda 8 → 10; two CSV rows)', f.huda.total === 10 && n2 === 2, { huda: f.huda, n2 });
    await ev(async () => { const l = visits.slice().sort((a, b) => b.ts - a.ts)[0]; visits.push(Object.assign(JSON.parse(JSON.stringify(l)), { id: uid() })); await persist('visits'); }); f = await figs();
    check('…an exact double-save still counts once (10)', f.huda.total === 10, f.huda);
    const ui = await ev(() => { openCallLog('m1'); const a = !!document.querySelector('#modalInner [data-rx-type], #modalInner #rxWrap'); closeModal(); openStandaloneOrder('m1'); const b = !!document.querySelector('#modalInner [data-rx-type], #modalInner #rxWrap'); closeModal(); return { a, b }; });
    check('calls and phone orders offer no prescriptions', !ui.a && !ui.b, ui);
    await form('m1', ['m1-d1']); await typeQty('m1-d1', 'tortho', 4); await ev(() => loadAll()); await sleep(100);
    const kept = await ev(() => +document.querySelector('#rxWrap [data-rx-doc="m1-d1"] [data-rx-type="tortho"] input.rx-qty').value);
    const s = await save('after refresh');
    check('the background refresh mid-form keeps what was typed (and saves it)', kept === 4 && s.v && JSON.stringify(sig(s.v)) === '["tortho|Ortho care prescription|4|m1-d1"]', { kept, rx: s.v && s.v.rx });
    reseed(); await boot(M, 'rep');
    await ev(() => { closeModal(); switchView('log'); prepLogView(); startNewClinic(); });
    await page.locator('#rxYes').tap(); await sleep(60);
    await typeQty('', 'twhite', 2); await toasts(); await ev(() => cancelNewClinic()); const cn = await toasts();
    const cleared = await ev(() => JSON.stringify(rxDrafts.log));
    await ev(() => { startNewClinic(); document.getElementById('newClinicName').value = 'Pearl Dental'; }); await sleep(60);
    const nb = await ev(() => ({ blocks: [...document.querySelectorAll('#rxWrap .rx-doc')].map(b => b.dataset.rxDoc), add: !!document.getElementById('rxAddClinic-log') }));
    await typeQty('', 'tortho', 3); const sn = await save('new customer rx');
    const nc = await ev(() => { const c = clinics.find(x => x.name === 'Pearl Dental'); const g = UMCore.rxGrowth({ clinics: ddPool(), visits, today: todayStr(), repFilter: currentUser.name, types: rxTypesDoc });
      const r = c && g.byClinic.find(x => x.clinicId === c.id); return { id: c && c.id, row: r && { total: r.total, unnamed: r.unnamed, doctors: r.doctors } }; });
    check('a new customer created in the form: only "the clinic (no one person)" is offered (cancelling clears what was typed, with a toast); the pads count for the new clinic, for no doctor',
      cn.some(t => /previous clinic were cleared/.test(t)) && cleared === '{}' && JSON.stringify(nb.blocks) === '[""]' && !nb.add && sn.v && JSON.stringify(sig(sn.v)) === '["tortho|Ortho care prescription|3|"]'
      && sn.v.clinicId === nc.id && nc.row && nc.row.total === 3 && nc.row.unnamed === 3 && nc.row.doctors === 0, { cn, cleared, nb, rx: sn.v && sn.v.rx, nc });
    const k = await ev(() => { const c = kpiCards([currentUser.name], 'month'); const it = c[0].items.find(i => i.key === 'rx'); return it ? String(it.value) : null; });
    check('the KPI "rx" item is still My Fatoorah sales (KD), not pads handed out', k != null && /^KD/.test(k), k);
    reseed(); mode.failGet = /^visitsArch:2026-09$/; await boot(G, 'supervisor'); f = await figs(); mode.failGet = null;
    const inc = await ev(() => { const el = document.getElementById('rxIncomplete'); return el ? el.innerText : null; });
    check('September unreadable: the tab says so; the month tile shows "—" against September, never a growth',
      inc && /2026-09/.test(inc) && /Same days last month: —/.test(f.monthTile) && !/[▲▼]/.test(f.monthTile) && !/from zero/.test(f.monthTile), { inc, tile: f.monthTile });
    reseed({ rxTypes: TYPES([T.ortho, T.white, Object.assign({}, T.impl, { name: 'Orthodontic retainer care prescription XL' }), T.kids]) });
    await boot(M, 'rep'); await form('m1', ['m1-d1', 'm1-d2']);
    const w = await ev(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, rx: document.getElementById('rxWrap').scrollWidth, rows: document.querySelectorAll('#rxWrap [data-rx-type]').length,
      btn: (() => { const b = document.querySelector('#rxWrap button.rx-plus').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })() }));
    check('phone width (390): 2 blocks × 3 rows and a 40-character name fit — no sideways scroll; the steppers stay thumb-sized', w.doc <= 390 && w.body <= 390 && w.rx <= 390 && w.rows === 6 && w.btn[0] >= 34 && w.btn[1] >= 34, w);
  });

  if(!ONLY.length || ONLY.includes('P0') || ONLY.includes('P7')) check('persist("rxTypes") was never called (the tripwire stayed silent)', guard.length === 0, guard.slice(0, 3));
  check('no native dialogs', dialogs.length === 0, dialogs);
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
