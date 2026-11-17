// "Save customer" in Log a visit (the owner's report of 17 Nov, reproduced first): a new customer typed in step 1 was
// made only when "Save visit" was tapped (saveNewClinicFirst), so step 2 could never list or add the people met there —
// it said "Pick the clinic in step 1 first — its doctors will appear here to tap." Now "Save customer" saves the new
// clinic first, on its own, through the same path (the name, the "+ Add clinic" sales check asked in the card first,
// saveNewClinicFirst), and the form then shows it as if it had been picked from the list.
//  N1  (the report — red before the fix) Save customer → step 2 offers the new clinic's people: "+ Add doctor", and the
//      contact person typed offered as a person met (it is the clinic's contact: never made a doctor by itself)
//  N2  …the people met added there (the contact offered, one more by "+ Add doctor"), then Save visit: one clinic, the
//      visit on it with both, everything in the cloud
//  N3  …someone met is then required, as for any clinic on the list; "Cancel" leaves the customer (it is real), clears
//      the visit form and says so
//  N4  refused by the rules: off the list, nothing queued, the form keeps everything typed, the words say not allowed;
//      too large for the cloud: the same with its words; a doctor added there that the rules refuse: off the clinic, the
//      sheet keeps the name, nobody picked as met
//  N5  offline: kept on this phone and queued, said so (never "saved"); people added offline; once back it all lands
//      and the note says saved — refused by the rules at upload instead, the note and "Cancel" say it is not sent
//  N6  a double tap — two calls, a real second tap while a slow cloud saves, "Save visit" meanwhile: one clinic
//  N7  "Save visit" without "Save customer": as before (the clinic first, then the visit); the sales question asked in
//      the card first (a rep is stopped; the supervisor's "Count from this month"); the supervisor's new customer is
//      the "Logging as" person's; the new customer's save refused by a guard before any write (neither saved nor
//      queued) stops the visit too (it was saved pointing at that clinic)
//  N8  Arabic: «حفظ الزبون», the hint, the note, the toasts, the chips — no English left
//  N9  the phone (390 px): no sideways pan, every target at least 44 px, nothing lying over one, before and after
// Invented data only (clinic and people names marked "Sample"); a fake cloud; the clock pinned to Fri 13 Nov 2026, 10:00.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const { audit } = require('./tools/audit.js');
const PORT = 8303;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server = http.createServer((req,res)=>{ const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(WWW, u==='/'?'index.html':u); if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; } fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });

// ---- fake cloud (in Node: shared by every phone) ----
// deny: { re, ops } — the security rules refuse those reads / writes (permission-denied); offline: phones with no
// connection; slow: ms a write takes (a weak link — a second tap lands while the first save is on its way)
const cloud = {};
const LIMIT = 1048576 - 100;
const mode = { deny: null, offline: new Set(), slow: 0 };
let held = false; const waiters = [];
const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
const off = who => { if(mode.offline.has(who)) throw new Error('boom-offline'); };
const denied = (k, op) => !!(mode.deny && mode.deny.re.test(k) && mode.deny.ops.includes(op));
const api = {
  get: async (who, k) => { off(who); if(denied(k, 'r')) return { __err: 'permission-denied' }; return k in cloud ? cloud[k] : null; },
  set: async (who, k, v) => { off(who);
    if(mode.slow) await new Promise(r => setTimeout(r, mode.slow));
    if(denied(k, 'w')) return { __err: 'permission-denied' };
    if(Buffer.byteLength(v, 'utf8') > LIMIT) return { __err: 'invalid-argument', msg: `Document 'state/${k}' cannot be written because its size (${Buffer.byteLength(v, 'utf8')} bytes) exceeds the maximum allowed size of 1,048,576 bytes.` };
    cloud[k] = v; return true; },
  setMany: async (who, e) => { off(who); for(const [k] of e){ if(denied(k, 'w')) return { __err: 'permission-denied' }; } e.forEach(([k, v]) => { cloud[k] = v; }); return true; },
  del: async (who, k) => { off(who); if(denied(k, 'w')) return { __err: 'permission-denied' }; delete cloud[k]; return true; },
  list: async (who, p) => { off(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,900):'')); if(!ok) failed++; }
const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const TODAY = '2026-11-13';
const NOT_ALLOWED = '🔒 Not allowed, not saved (ask the supervisor)';
const OFFLINE_WORDS = '📴 Saved on this device — uploads automatically when back online';
const PICK_FIRST = 'Pick the clinic in step 1 first — its doctors will appear here to tap.';
const NAME = 'Cedar Sample Dental', CONTACT = 'Dr. Lamia Sample', SECOND = 'Dr. Second Sample';

// ---- the account (invented): three clinics, and a sales file with an account that has no clinic yet (Renova's) ----
const row = (d, doc, sm, net, cust) => [d, doc, 0, 'P-1', 1, net, net, 0, sm, 'TEPE', cust, 'Clinics', 0, ''];
const ROWS = [row('2026-10-20', 'SO1', 'Ranova Sample Person', 120, 'Bright Smile Dental'), row('2026-11-05', 'SO2', 'Ranova Sample Person', 80, 'Bright Smile Dental'),
  row('2026-11-06', 'SO3', 'Mariam Sample', 50, 'Dental 5 Clinic')];
function seedCloud(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] },
    { id: 'c3', name: 'Hilal Dental Center', rep: 'Mariam', cls: 'B', doctors: [{ id: 'd3', name: 'Dr. Noor' }] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-11' }, Renova: { revenue: 12000, month: '2026-11' } });
  cloud.erpSales = JSON.stringify({ periods: [{ id: 'p-oct-nov', from: '2026-10-01', to: '2026-11-12', net: 250, rowCount: ROWS.length, importedAt: '2026-11-12T08:00:00.000Z', rev: 1,
      repMap: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, rowsRef: { key: 'erpRows:p-oct-nov:1', chunks: 1, count: ROWS.length } }],
    repMapGlobal: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, returnPolicy: 'erp',
    seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud['erpRows:p-oct-nov:1:0'] = JSON.stringify(ROWS);
}
const cloudClinics = () => parse(cloud.clinics) || [];
const cloudVisits = () => parse(cloud.visits) || [];
const named = n => cloudClinics().filter(c => c && c.name === n);

// What the form shows, read from the screen and the form's own state (the same names before and after the fix).
function formState(x){
  const q = s => document.querySelector(s);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const txt = el => el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '';
  const chips = [...document.querySelectorAll('#doctorPickChips .chip')];
  const c = selectedClinicId ? clinics.find(k => k.id === selectedClinicId) : null;
  return {
    newMode: !!newClinicMode, sel: selectedClinicId, selName: c ? c.name : null, met: selectedDoctorIds.slice(),
    card: shown(q('#selectedClinicCard')) ? txt(q('#selectedClinicCard')) : '', fields: shown(q('#newClinicFields')),
    note: shown(q('#lvSavedNote')) ? txt(q('#lvSavedNote')) : '', noteState: shown(q('#lvSavedNote')) ? q('#lvSavedNote').dataset.state : null, cancel: shown(q('#lvSavedCancel')),
    step2: txt(q('#doctorPickChips')), addDoctor: chips.some(ch => /^openQuickAddDoctor\('[^']+'\)$/.test(ch.getAttribute('onclick') || '')),
    sug: shown(q('#lvContactSug')) ? txt(q('#lvContactSug')) : '', chipsOn: chips.filter(ch => ch.classList.contains('on')).map(ch => txt(ch)),
    tag2: txt(q('#lvTag2')), prog: q('#lvProgText') ? q('#lvProgText').dataset.n + ' of ' + q('#lvProgText').dataset.m : '',
    typed: { name: (q('#newClinicName') || {}).value, contact: (q('#newClinicContact') || {}).value, phone: (q('#newClinicPhone') || {}).value },
    clsOn: (q('#newClinicClsChips .chip.on') || { dataset: {} }).dataset.cls || null, acctOn: (q('#newClinicAcctChips .chip.on') || { dataset: {} }).dataset.acct || null,
    notes: (q('#visitNotes') || {}).value, prods: typeof selectedProducts !== 'undefined' ? selectedProducts.length : 0, ask: txt(q('#newClinicAsk')),
    inMem: clinics.filter(k => k && k.name === (x && x.name)).map(k => ({ id: k.id, rep: k.rep, contact: k.contact, phone: k.phone, cls: k.cls, account: k.account, isNew: k.isNew, doctors: (k.doctors || []).map(d => d.name), prevRep: k.prevRep || null, repSince: k.repSince || null })),
    queued: outboxHas('clinics'), view: activeView, modal: document.getElementById('modalBack').classList.contains('show'),
    toasts: (window.__toasts || []).slice(), shownToasts: (window.__toastsShown || []).slice() };
}

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {}, outside = [];
  const mkPhone = async (label, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await blockFirebase(ctx);
    // anything else leaving this machine is recorded (the Firebase SDK's own script tags are blocked above: not data sent)
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => { if(!/gstatic\.com\/firebasejs\//.test(r.request().url())) outside.push(label + ' ' + r.request().url()); r.abort(); });
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|save failed|update failed/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript(({ clock, lang }) => {
      try{ localStorage.setItem('ultramed_lang', lang); }catch(e){}
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
    }, { clock: CLOCK, lang: opts.lang || 'en' });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const boot = async (who, role) => {
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await ev(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(350);
      // every toast: as written (English) and as shown (the screen's language)
      await ev(() => { window.__toasts = []; window.__toastsShown = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); const r = real(m, ms); window.__toastsShown.push(document.getElementById('toast').textContent); return r; }; _lastOfflineToast = 0; });
    };
    // a save of the form has settled (its guard is free) and the screen has drawn
    const settle = async () => { await page.waitForFunction(() => typeof _visitSaveBusy === 'undefined' || _visitSaveBusy.size === 0, null, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(150); };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await ev(async () => { await window.__bgTick(); }); await page.waitForTimeout(150); };
    const has = async sel => { const l = page.locator(sel); return (await l.count()) > 0 && await l.first().isVisible(); };
    const tap = async (sel, o) => { if(!await has(sel)) return false; await page.locator(sel).first().tap(Object.assign({ timeout: 5000 }, o || {})); return true; };
    // the log view, "+ Add a new customer", the fields filled as a person types them
    const typeCustomer = async (name, contact) => {
      await ev(() => { closeModal(); switchView('log'); scrollTo(0, 0); window.__toasts = []; window.__toastsShown = []; });
      await tap('#newClinicBtn');
      await page.fill('#newClinicName', name);
      if(contact) await page.fill('#newClinicContact', contact);
      await page.fill('#newClinicPhone', '12345');
      await tap('#newClinicClsChips .chip[data-cls="B"]');
      await tap('#newClinicAcctChips .chip');
      await page.waitForTimeout(60);
    };
    const saveCustomer = async () => { const ok = await tap('#newClinicSaveBtn'); if(ok) await settle(); return ok; };
    const state = name => ev(formState, { name });
    return { page, ctx, ev, boot, settle, tick, has, tap, typeCustomer, saveCustomer, state, label };
  };
  // the "Add doctor" sheet: its Save button (moved into the sheet's foot), and the sheet closing
  const saveDoctorSheet = async P => { await P.tap('#modalContent button[onclick^="quickAddDoctorSave"]'); await P.page.waitForTimeout(250); };

  // ===================== N1 / N2 — Save customer, then the people met, then the visit =====================
  seedCloud();
  {
    const P = await mkPhone('N1'); await P.boot('Mariam', 'rep');
    await P.typeCustomer(NAME, CONTACT);
    const before = await P.state(NAME);
    const btnBox = await P.page.locator('#newClinicSaveBtn').boundingBox().catch(() => null);
    const layoutBefore = await P.ev(audit, { phone: true, width: 390 });
    const hadButton = await P.saveCustomer();
    const s1 = await P.state(NAME);
    const c1 = named(NAME);
    const layoutAfter = await P.ev(audit, { phone: true, width: 390 });
    check('N1. (the report) a new customer typed in step 1 — name, contact person, phone, class, account type — has a "Save customer" button; tapped, the customer is saved (hers, everything typed, in the cloud) and the form shows it as picked: step 2 offers its people to tap — "+ Add doctor", and the contact typed ("+ Add ' + CONTACT + '") — never "Pick the clinic in step 1 first"',
      hadButton && !!btnBox && btnBox.height >= 44 && before.step2 !== PICK_FIRST && /Save customer/.test(before.step2)
        && s1.inMem.length === 1 && c1.length === 1 && c1[0].rep === 'Mariam' && c1[0].contact === CONTACT && c1[0].phone === '12345' && c1[0].cls === 'B' && c1[0].account === 'Credit account' && c1[0].isNew === true && c1[0].addedOn === TODAY
        && !s1.newMode && s1.sel === c1[0].id && !s1.fields && s1.card.includes(NAME) && /New customer saved/.test(s1.note) && s1.noteState === 'saved' && s1.cancel
        && s1.step2 !== PICK_FIRST && !/Pick the clinic in step 1 first/.test(s1.step2) && s1.addDoctor && s1.sug === '+ Add ' + CONTACT
        && s1.toasts.includes('🌟 New customer saved — now tap who you met in step 2') && s1.tag2 === 'Required' && s1.prog === '1 of 2' && !s1.queued,
      { hadButton, btnH: btnBox && Math.round(btnBox.height), step2Before: before.step2, s1: Object.assign({}, s1, { inMem: s1.inMem }), cloud: c1 });
    check('N1b. the contact person stays the clinic\'s contact: it is not made a doctor by itself (no doctor on the clinic, on the phone or in the cloud, until a tap adds one)',
      hadButton && c1.length === 1 && (c1[0].doctors || []).length === 0 && s1.inMem.length === 1 && s1.inMem[0].doctors.length === 0, { cloud: c1.map(c => c.doctors), mem: s1.inMem });
    check('N9. the phone (390 px), the new customer typed and then saved: no sideways pan, every tap target at least 44 × 44 px, nothing lying over one',
      hadButton && [layoutBefore, layoutAfter].every(a => a.scrollWidth <= a.vw && !a.wide.length && !a.small.length && !a.covered.length),
      { before: { w: layoutBefore.scrollWidth, wide: layoutBefore.wide.slice(0, 4), small: layoutBefore.small.slice(0, 6), covered: layoutBefore.covered.slice(0, 4) },
        after: { w: layoutAfter.scrollWidth, wide: layoutAfter.wide.slice(0, 4), small: layoutAfter.small.slice(0, 6), covered: layoutAfter.covered.slice(0, 4) } });

    // N2 — the contact offered: the "Add doctor" sheet opens with the name filled in, nothing saved before "Save doctor"
    const sugTapped = await P.tap('#lvContactSug');
    const sheet = await P.ev(() => ({ open: document.getElementById('modalBack').classList.contains('show'), name: (document.getElementById('newDocName') || {}).value }));
    const docsWhileAsked = (named(NAME)[0] || { doctors: [] }).doctors.length;
    await P.tap('#newDocTitleChips .chip');
    await saveDoctorSheet(P);
    const s2 = await P.state(NAME);
    // one more person met, by "+ Add doctor"
    await P.tap('#doctorPickChips .chip[onclick^="openQuickAddDoctor"]:not(#lvContactSug)');
    if(await P.has('#newDocName')) await P.page.fill('#newDocName', SECOND);
    await saveDoctorSheet(P);
    const s3 = await P.state(NAME);
    const cl3 = named(NAME)[0] || { doctors: [] };
    check('N2. the contact offered in step 2 opens the same "Add doctor" sheet with the name filled in (nothing added before "Save doctor"); saved, the doctor is on the new clinic (the cloud too) and picked as met, and the offer goes; "+ Add doctor" adds one more, picked too',
      sugTapped && sheet.open && sheet.name === CONTACT && docsWhileAsked === 0 && !s2.modal && s2.inMem[0] && s2.inMem[0].doctors.join() === CONTACT && s2.met.length === 1 && s2.chipsOn.some(t => t.includes(CONTACT)) && !s2.sug
        && s2.toasts.some(t => /Doctor added/.test(t)) && !s3.modal && s3.met.length === 2 && cl3.doctors.map(d => d.name).join('|') === CONTACT + '|' + SECOND && s3.prog === '2 of 2',
      { sugTapped, sheet, docsWhileAsked, s2: { met: s2.met, on: s2.chipsOn, sug: s2.sug, toasts: s2.toasts.slice(-3) }, s3: { met: s3.met, prog: s3.prog }, cloud: cl3.doctors });
    // …then the visit itself: a product, a note, "Save visit"
    await P.tap('#productChips .chip');
    await P.page.fill('#visitNotes', 'N2 first visit at the new customer');
    await P.ev(() => { window.__toasts = []; });
    await P.tap('button.lv-save'); await P.settle();
    const s4 = await P.state(NAME);
    const v = cloudVisits().find(x => x && x.notes === 'N2 first visit at the new customer'), cl4 = named(NAME);
    check('N2b. "Save visit" then saves the visit on the new clinic with both people met (their names kept on the visit), one clinic of that name in the cloud, and the form goes to Today',
      !!v && cl4.length === 1 && v.clinicId === cl4[0].id && v.rep === 'Mariam' && (v.doctorIds || []).length === 2 && JSON.stringify(Object.values(v.doctorNames || {}).sort()) === JSON.stringify([CONTACT, SECOND].sort())
        && (v.products || []).length === 1 && s4.view === 'today' && !s4.toasts.some(t => /not saved|Not saved/.test(t)),
      { visit: v && { clinicId: v.clinicId, doctorIds: v.doctorIds, doctorNames: v.doctorNames, products: v.products }, clinics: cl4.map(c => c.id), view: s4.view, toasts: s4.toasts });
    await P.ctx.close();
  }

  // ===================== N3 — someone met required then; Cancel keeps the customer =====================
  seedCloud();
  {
    const P = await mkPhone('N3'); await P.boot('Mariam', 'rep');
    await P.typeCustomer(NAME, CONTACT);
    const ok = await P.saveCustomer();
    await P.page.fill('#visitNotes', 'N3 notes typed');
    await P.ev(() => { window.__toasts = []; });
    await P.tap('button.lv-save'); await P.settle();
    const s1 = await P.state(NAME);
    const err2 = await P.ev(() => { const e = document.getElementById('lvErr2'); return e && !e.hidden ? e.innerText.trim() : ''; });
    check('N3. once the customer is saved it is a clinic on the list: "Save visit" with nobody tapped in step 2 stops with "Add the doctor you met first (+ Add doctor)" — nothing saved, the form kept',
      ok && s1.toasts.includes('👨‍⚕️ Add the doctor you met first (+ Add doctor)') && /Add the doctor you met first/.test(err2) && !cloudVisits().length && s1.view === 'log' && s1.notes === 'N3 notes typed' && s1.sel === (named(NAME)[0] || {}).id,
      { ok, toasts: s1.toasts, err2, visits: cloudVisits().length, view: s1.view });
    await P.ev(() => { window.__toasts = []; });
    const cancelled = await P.tap('#lvSavedCancel');
    await P.page.waitForTimeout(120);
    const s2 = await P.state(NAME);
    check('N3b. "Cancel" after a saved customer leaves the customer (on the phone and in the cloud — it is real), clears the visit form (no clinic, no fields, no notes; step 2 back to "Pick the clinic in step 1 first") and says so; no visit',
      cancelled && s2.inMem.length === 1 && named(NAME).length === 1 && !s2.sel && !s2.newMode && !s2.fields && s2.notes === '' && s2.step2 === PICK_FIRST && !s2.note
        && s2.toasts.includes('The new customer stays on the clinic list — the visit form was cleared, no visit was logged') && !cloudVisits().length && s2.view === 'log',
      { cancelled, s2: { inMem: s2.inMem.length, sel: s2.sel, newMode: s2.newMode, fields: s2.fields, notes: s2.notes, step2: s2.step2, note: s2.note, view: s2.view, toasts: s2.toasts }, cloud: named(NAME).length, visits: cloudVisits().length });
    await P.ctx.close();
  }

  // ===================== N4 — refused, too large; a doctor refused =====================
  seedCloud();
  {
    const P = await mkPhone('N4'); await P.boot('Mariam', 'rep');
    await P.typeCustomer(NAME, CONTACT);
    await P.tap('#productChips .chip');
    await P.page.fill('#visitNotes', 'N4 notes typed');
    mode.deny = { re: /^clinics$/, ops: 'w' };
    const ok = await P.saveCustomer();
    const s1 = await P.state(NAME);
    mode.deny = null;
    await P.tick();
    check('N4. the rules refuse the new customer\'s save: it is off the list (nothing on the phone, nothing queued, nothing in the cloud), the form keeps everything typed (name, contact, phone, class, account type, product, notes) and says "Not allowed, not saved" — never "saved"',
      ok && s1.inMem.length === 0 && !s1.queued && !named(NAME).length && s1.newMode && s1.fields && s1.typed.name === NAME && s1.typed.contact === CONTACT && s1.typed.phone === '12345'
        && s1.clsOn === 'B' && s1.acctOn === 'Credit account' && s1.prods === 1 && s1.notes === 'N4 notes typed' && /Not allowed, not saved/.test(s1.ask) && /What you typed is still here/.test(s1.ask)
        && s1.toasts.includes(NOT_ALLOWED) && !s1.toasts.some(t => /New customer saved/.test(t)) && !s1.sel && !s1.note,
      { ok, s1: { inMem: s1.inMem, queued: s1.queued, newMode: s1.newMode, typed: s1.typed, cls: s1.clsOn, acct: s1.acctOn, prods: s1.prods, notes: s1.notes, ask: s1.ask, toasts: s1.toasts } });
    // allowed again: the same tap saves it, once
    const ok2 = await P.saveCustomer();
    const s2 = await P.state(NAME);
    check('N4b. …allowed again, the same "Save customer" saves it once, with what was typed',
      ok2 && named(NAME).length === 1 && s2.inMem.length === 1 && s2.sel === named(NAME)[0].id && named(NAME)[0].contact === CONTACT, { inCloud: named(NAME).length, sel: s2.sel });
    // a doctor added there that the rules refuse: not left on the clinic, not picked as met; the sheet keeps the name
    mode.deny = { re: /^clinics$/, ops: 'w' };
    await P.ev(() => { window.__toasts = []; });
    await P.tap('#doctorPickChips .chip[onclick^="openQuickAddDoctor"]:not(#lvContactSug)');
    if(await P.has('#newDocName')) await P.page.fill('#newDocName', 'Dr. Refused Sample');
    await saveDoctorSheet(P);
    const s3 = await P.state(NAME);
    const sheet3 = await P.ev(() => ({ name: (document.getElementById('newDocName') || {}).value }));
    mode.deny = null;
    await saveDoctorSheet(P);
    const s4 = await P.state(NAME);
    check('N4c. a doctor added in step 2 whose save the rules refuse is not left on the clinic or picked as met: the sheet stays open with the name typed, the words say not allowed; allowed again, "Save doctor" adds and picks them',
      s3.modal && sheet3.name === 'Dr. Refused Sample' && s3.inMem[0] && s3.inMem[0].doctors.length === 0 && s3.met.length === 0 && s3.toasts.includes(NOT_ALLOWED) && !s3.toasts.some(t => /Doctor added|Added —/.test(t))
        && (named(NAME)[0] || { doctors: [] }).doctors.length === 1 && !s4.modal && s4.met.length === 1 && s4.inMem[0].doctors.join() === 'Dr. Refused Sample',
      { s3: { modal: s3.modal, name: sheet3.name, docs: s3.inMem[0] && s3.inMem[0].doctors, met: s3.met, toasts: s3.toasts }, after: { modal: s4.modal, met: s4.met, cloud: (named(NAME)[0] || {}).doctors } });
    await P.ctx.close();
  }
  seedCloud();
  {
    const P = await mkPhone('N4d'); await P.boot('Mariam', 'rep');
    // the clinics document close to the cloud's limit (a long profile note): this customer would take it over
    await P.ev(() => { const big = clinics.find(c => c.id === 'c3'); const base = UMCore.utf8Len(JSON.stringify(storedClinics())); big.profileNotes = (big.profileNotes || '') + 'x'.repeat(Math.max(0, DOC_MAX_BYTES - 150 - base)); });
    await P.typeCustomer(NAME, CONTACT);
    await P.page.fill('#visitNotes', 'N4d notes typed');
    const ok = await P.saveCustomer();
    const s1 = await P.state(NAME);
    check('N4d. too large for the cloud: the new customer is off the list (nothing queued, nothing in the cloud), the form keeps everything typed and says the clinics list is too large — never "saved"',
      ok && s1.inMem.length === 0 && !s1.queued && !named(NAME).length && s1.newMode && s1.typed.name === NAME && s1.notes === 'N4d notes typed' && /too large for the cloud/.test(s1.ask) && /What you typed is still here/.test(s1.ask)
        && !s1.toasts.some(t => /New customer saved/.test(t)) && !s1.sel,
      { ok, s1: { inMem: s1.inMem.length, queued: s1.queued, typed: s1.typed, ask: s1.ask, toasts: s1.toasts } });
    await P.ctx.close();
  }

  // ===================== N5 — offline =====================
  seedCloud();
  {
    const P = await mkPhone('N5'); await P.boot('Mariam', 'rep');
    mode.offline.add('N5');
    await P.typeCustomer(NAME, CONTACT);
    const ok = await P.saveCustomer();
    const s1 = await P.state(NAME);
    check('N5. offline: the new customer is kept on this phone and queued — the words say so ("Saved on this device — uploads automatically when back online", the note too), never "New customer saved"; nothing in the cloud yet; the form shows it as picked and step 2 offers its people',
      ok && s1.inMem.length === 1 && s1.queued && !named(NAME).length && s1.toasts.includes(OFFLINE_WORDS) && !s1.toasts.some(t => /New customer saved/.test(t))
        && s1.noteState === 'kept' && s1.note.includes('Saved on this device') && !/New customer saved/.test(s1.note) && s1.sel === s1.inMem[0].id && s1.addDoctor && s1.sug === '+ Add ' + CONTACT,
      { ok, s1: { inMem: s1.inMem.length, queued: s1.queued, toasts: s1.toasts, note: s1.note, state: s1.noteState, sel: s1.sel, addDoctor: s1.addDoctor, sug: s1.sug } });
    await P.tap('#lvContactSug'); await saveDoctorSheet(P);
    const s2 = await P.state(NAME);
    mode.offline.delete('N5');
    await P.tick(); await P.page.waitForTimeout(150);
    const s3 = await P.state(NAME);
    const cl = named(NAME);
    check('N5b. …the person met added offline is kept and picked too; once back online the round uploads it all: the customer with that doctor in the cloud, and the note now says it is saved',
      s2.met.length === 1 && s2.queued && !s2.modal && cl.length === 1 && cl[0].doctors.map(d => d.name).join() === CONTACT && !s3.queued && s3.noteState === 'saved' && /New customer saved/.test(s3.note),
      { s2: { met: s2.met, queued: s2.queued }, cloud: cl.map(c => c.doctors), s3: { queued: s3.queued, note: s3.note, state: s3.noteState } });
    // the visit itself with no connection: queued, then uploaded, pointing at the customer and the person met
    mode.offline.add('N5');
    await P.page.fill('#visitNotes', 'N5 visit with no signal');
    await P.tap('button.lv-save'); await P.settle();
    const queuedVisit = await P.ev(() => outboxHas('visits'));
    mode.offline.delete('N5');
    await P.tick();
    const v = cloudVisits().find(x => x && x.notes === 'N5 visit with no signal');
    check('N5c. …and the visit saved with no connection uploads when it is back: on the new customer, with the person met',
      queuedVisit && !!v && v.clinicId === (cl[0] || {}).id && (v.doctorIds || []).length === 1 && named(NAME).length === 1, { queuedVisit, visit: v && { clinicId: v.clinicId, doctorIds: v.doctorIds } });
    await P.ctx.close();
  }

  // N5d — kept offline, then the rules refuse the queued clinics at upload: the note stops saying "uploads by itself"
  seedCloud();
  {
    const P = await mkPhone('N5d'); await P.boot('Mariam', 'rep');
    mode.offline.add('N5d');
    await P.typeCustomer(NAME, CONTACT);
    const ok = await P.saveCustomer();
    const s1 = await P.state(NAME);
    mode.offline.delete('N5d'); mode.deny = { re: /^clinics$/, ops: 'w' };
    await P.tick();
    const s2 = await P.state(NAME);
    await P.ev(() => { window.__toasts = []; });
    const cancelled = await P.tap('#lvSavedCancel'); await P.page.waitForTimeout(120);
    const s3 = await P.state(NAME);
    mode.deny = null;
    check('N5d. kept offline, then refused by the rules at upload: the note now says it waits on this phone, not sent (never "uploads automatically"); "Cancel" says the same of the customer — kept on this phone, not in the cloud',
      ok && s1.noteState === 'kept' && s2.noteState === 'parked-refused' && /not sent/.test(s2.note) && !/uploads automatically/.test(s2.note) && s2.queued && !named(NAME).length
        && cancelled && s3.toasts.includes('The new customer stays on this phone, not sent (the red bar says why) — the visit form was cleared, no visit was logged') && s3.inMem.length === 1 && !s3.sel,
      { ok, s1: s1.noteState, s2: { state: s2.noteState, note: s2.note, queued: s2.queued }, cancelled, s3: { toasts: s3.toasts, inMem: s3.inMem.length } });
    await P.ctx.close();
  }

  // ===================== N6 — a double tap never makes two clinics =====================
  seedCloud();
  {
    const P = await mkPhone('N6'); await P.boot('Mariam', 'rep');
    await P.typeCustomer(NAME, CONTACT);
    const a = await P.ev(async () => { window.__toasts = []; try{ await Promise.all([saveNewCustomer(), saveNewCustomer()]); return { ran: true, toasts: window.__toasts.slice() }; }catch(e){ return { err: e.message }; } });
    const memA = await P.ev(n => clinics.filter(c => c.name === n).length, NAME);
    check('N6. two "Save customer" calls at once: one clinic (on the phone and in the cloud); the second says "Already saving…"',
      a.ran && memA === 1 && named(NAME).length === 1 && a.toasts.includes('Already saving…'), { a, memA, cloud: named(NAME).length });
    // a real second tap while a slow cloud is still saving the first
    const N2 = 'Juniper Sample Clinic';
    await P.typeCustomer(N2, '');
    mode.slow = 700;
    await P.tap('#newClinicSaveBtn');
    const lockedDuring = await P.ev(() => ({ cls: document.getElementById('view-log').classList.contains('nc-saving'), note: (document.getElementById('newCustSavingNote') || {}).innerText || '' }));
    await P.page.locator('#newClinicSaveBtn').tap({ force: true, timeout: 1500 }).catch(() => {});
    await P.ev(() => { try{ saveNewCustomer(); }catch(e){} }); // (and one more, as a stray Enter would)
    await P.settle(); mode.slow = 0; await P.page.waitForTimeout(150);
    const memB = await P.ev(n => clinics.filter(c => c.name === n).length, N2);
    check('N6b. a real double tap on a slow connection: the fields lock and say "Saving the customer…" while it saves — one clinic',
      memB === 1 && named(N2).length === 1 && lockedDuring.cls && /Saving the customer/.test(lockedDuring.note), { memB, cloud: named(N2).length, lockedDuring });
    // "Save visit" tapped while "Save customer" is still saving: nothing twice
    const N3 = 'Laurel Sample Clinic';
    await P.typeCustomer(N3, '');
    mode.slow = 500;
    const c = await P.ev(async () => { window.__toasts = []; const x = saveNewCustomer(); const y = saveVisit(); await Promise.all([x, y]); return { toasts: window.__toasts.slice() }; }).catch(e => ({ err: e.message }));
    mode.slow = 0; await P.settle();
    const s3 = await P.state(N3);
    check('N6c. "Save visit" tapped while "Save customer" saves says "Already saving…": one clinic, no visit, and the form shows the customer as picked',
      !c.err && named(N3).length === 1 && s3.inMem.length === 1 && c.toasts.includes('Already saving…') && !cloudVisits().length && s3.sel === s3.inMem[0].id, { c, cloud: named(N3).length, sel: s3.sel });
    await P.ctx.close();
  }

  // ===================== N7 — Save visit without Save customer; the sales question; whose it is =====================
  seedCloud();
  {
    const P = await mkPhone('N7'); await P.boot('Mariam', 'rep');
    await P.typeCustomer(NAME, CONTACT);
    await P.page.fill('#visitNotes', 'N7 first visit, saved in one go');
    await P.ev(() => { window.__toasts = []; });
    await P.tap('button.lv-save'); await P.settle();
    const s = await P.state(NAME);
    const cl = named(NAME), v = cloudVisits().find(x => x && x.notes === 'N7 first visit, saved in one go');
    check('N7. "Save visit" without "Save customer" works as before: the clinic first, then the visit on it (step 2 optional for a new customer), one clinic, the form goes to Today',
      cl.length === 1 && !!v && v.clinicId === cl[0].id && (v.doctorIds || []).length === 0 && cl[0].contact === CONTACT && cl[0].rep === 'Mariam' && s.view === 'today' && !s.toasts.some(t => /not saved|Not saved/.test(t)),
      { clinics: cl.length, visit: v && { clinicId: v.clinicId, doctorIds: v.doctorIds }, view: s.view, toasts: s.toasts });
    await P.ctx.close();
  }
  seedCloud();
  {
    const P = await mkPhone('N7-M'); await P.boot('Mariam', 'rep');
    await P.typeCustomer('Bright Smile Dental', '');
    const ok = await P.saveCustomer();
    const s = await P.state('Bright Smile Dental');
    check('N7b. "Save customer" runs the "+ Add clinic" sales check: a name that pulls Renova\'s invoices is not saved for Mariam — the card under the name says the supervisor adds it, the form keeps the name',
      ok && s.inMem.length === 0 && !named('Bright Smile Dental').length && /count for another person now/.test(s.ask) && /Renova/.test(s.ask) && s.typed.name === 'Bright Smile Dental' && s.newMode,
      { ok, ask: s.ask, inMem: s.inMem.length });
    await P.ctx.close();
  }
  seedCloud();
  {
    const P = await mkPhone('N7-S'); await P.boot('Dr. Ghaith', 'supervisor');
    await P.ev(() => { closeModal(); switchView('log'); setLogAsRep('Mariam'); });
    await P.typeCustomer('Bright Smile Dental', '');
    await P.ev(() => setLogAsRep('Mariam'));
    const ok = await P.saveCustomer();
    const asked = await P.state('Bright Smile Dental');
    const tapped = await P.tap('#newClinicAsk [data-ask]:has-text("Count from this month")');
    await P.settle();
    const s = await P.state('Bright Smile Dental');
    const cl = named('Bright Smile Dental');
    check('N7c. the supervisor saving that customer for Mariam is asked in the card first (nothing saved before the answer); "Count from this month" saves it — Mariam\'s, October stays with Renova — and the form shows it as picked',
      ok && asked.inMem.length === 0 && /sales lines would count for/.test(asked.ask) && tapped && cl.length === 1 && cl[0].rep === 'Mariam' && cl[0].prevRep === 'Renova' && cl[0].repSince === '2026-11-01'
        && s.sel === cl[0].id && !s.newMode && s.addDoctor,
      { ok, ask: asked.ask, tapped, cloud: cl.map(c => ({ rep: c.rep, prevRep: c.prevRep, repSince: c.repSince })), sel: s.sel });
    await P.ev(() => { closeModal(); switchView('log'); setLogAsRep('Renova'); });
    await P.typeCustomer('Opal Sample Clinic', '');
    await P.ev(() => setLogAsRep('Renova'));
    await P.saveCustomer();
    const op = named('Opal Sample Clinic');
    check('N7d. the supervisor\'s new customer is the "Logging as" person\'s (Renova\'s here)', op.length === 1 && op[0].rep === 'Renova', op.map(c => c.rep));
    await P.ctx.close();
  }

  // N7e — the new customer's save refused by a guard before any write (here: the clinic list on screen is not the
  // account's — a start that went wrong): neither saved nor queued, so the visit must not be saved pointing at it
  seedCloud();
  {
    const P = await mkPhone('N7e'); await P.boot('Mariam', 'rep');
    await P.typeCustomer(NAME, CONTACT);
    await P.page.fill('#visitNotes', 'N7e visit at a clinic nobody has');
    await P.ev(() => { _seedClinics = true; window.__toasts = []; });
    await P.tap('button.lv-save'); await P.settle();
    const s = await P.state(NAME);
    const inMemVisit = await P.ev(() => visits.some(v => v && v.notes === 'N7e visit at a clinic nobody has'));
    await P.ev(() => { _seedClinics = false; });
    check('N7e. the new customer\'s save refused by a guard before any write (neither saved nor queued): the visit is not saved either — the clinic is off the list, the form keeps what was typed and says it was not saved',
      !inMemVisit && !cloudVisits().some(v => v && v.notes === 'N7e visit at a clinic nobody has') && s.inMem.length === 0 && !s.queued && s.newMode && s.typed.name === NAME
        && s.notes === 'N7e visit at a clinic nobody has' && /Not saved/.test(s.ask) && s.view === 'log',
      { inMemVisit, s: { inMem: s.inMem.length, queued: s.queued, newMode: s.newMode, typed: s.typed, ask: s.ask, view: s.view, toasts: s.toasts } });
    await P.ctx.close();
  }

  // ===================== N8 — Arabic =====================
  seedCloud();
  {
    const P = await mkPhone('N8', { lang: 'ar' }); await P.boot('Mariam', 'rep');
    await P.ev(() => { closeModal(); switchView('log'); scrollTo(0, 0); });
    await P.tap('#newClinicBtn');
    const before = await P.ev(() => ({ btn: (document.getElementById('newClinicSaveBtn') || {}).innerText || '', hint: document.getElementById('doctorPickChips').innerText.trim() }));
    await P.typeCustomer(NAME, CONTACT);
    await P.ev(() => { window.__toasts = []; window.__toastsShown = []; });
    const ok = await P.saveCustomer();
    const s = await P.state(NAME);
    const ar = await P.ev(({ data }) => {
      const pick = sel => [...document.querySelectorAll(sel)];
      const clean = el => { const k = el.cloneNode(true); k.querySelectorAll('[dir="auto"], .cls').forEach(x => x.remove()); let t = k.innerText || k.textContent || ''; data.forEach(d => { t = t.split(d).join(''); }); return t.replace(/\s+/g, ' ').trim(); };
      const parts = { note: pick('#lvSavedNote'), cancel: pick('#lvSavedCancel'), chips: pick('#doctorPickChips'), heads: pick('#lvStep1 .step-h, #doctorPickWrap .step-h') }, out = {};
      Object.keys(parts).forEach(k => { out[k] = parts[k].map(clean).join(' | '); });
      out.left = Object.values(out).filter(t => /[A-Za-z]{2,}/.test(t));
      return out;
    }, { data: [NAME, CONTACT, 'Mariam'] });
    check('N8. Arabic: the button reads «حفظ الزبون», step 2 says to save the customer first; saved, the toast, the note, «إلغاء» and the chips are Arabic («+ إضافة» + the contact, «+ إضافة طبيب») — no English left',
      ok && before.btn.trim() === 'حفظ الزبون' && before.hint === 'اضغط «حفظ الزبون» في الخطوة 1 أولاً — ثم أضف هنا من قابلتهم.'
        && s.shownToasts.includes('🌟 حُفظ الزبون الجديد — اضغط الآن على من قابلته في الخطوة 2') && /حُفظ الزبون الجديد/.test(ar.note) && /اضغط الآن على من قابلته في الخطوة 2/.test(ar.note)
        && ar.cancel === 'إلغاء' && /\+ إضافة طبيب/.test(ar.chips) && s.sug === '+ إضافة ' + CONTACT && !ar.left.length,
      { ok, before, toasts: s.shownToasts, ar, sug: s.sug });
    await P.ctx.close();
  }

  const allErr = Object.entries(errors).flatMap(([k, v]) => v.map(e => k + ': ' + e));
  check('no page errors, nothing sent outside this machine', allErr.length === 0 && outside.length === 0, { errors: allErr.slice(0, 6), outside: outside.slice(0, 4) });
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
