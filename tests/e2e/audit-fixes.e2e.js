// Regression harness for the whole-app audit (v86): every finding reproduced
// against the fixed build. Fake cloud shared by several "devices" (contexts),
// with an atomic update() like the Firestore transaction. Clock pinned to
// 2026-09-21 10:00 Kuwait.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, salesFixture, blockFirebase } = require('./_env.js');
const PORT = 8211;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});
const cloud = {};
let lock = Promise.resolve(); // update() serialises like a transaction
const opts = { delaySet: 0 };
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { if(opts.delaySet) await new Promise(r => setTimeout(r, opts.delaySet)); cloud[k] = v; return true; },
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,500):'')); if(!ok) failed++; }
const SEP_OFFSET = new Date('2026-09-21T10:00:00').getTime() - Date.now();

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  const dialogs = [];
  const mkPage = async (label, offset) => {
    const ctx = await browser.newContext();
    await blockFirebase(ctx);
    const page = await ctx.newPage();
    errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
    await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
    // update(): the page computes the merge from the value the fake cloud holds
    // at that moment; a lock keeps two devices from interleaving get/set.
    await page.exposeFunction('__cLock', async () => { let release; const prev = lock; lock = new Promise(r => release = r); await prev; return true; });
    await page.exposeFunction('__cUnlock', async () => { true; });
    let releaseFn = null;
    await page.exposeFunction('__cAcquire', async () => { await lock; let rel; lock = new Promise(r => rel = r); releaseFn = rel; return true; });
    await page.exposeFunction('__cRelease', async () => { if(releaseFn){ releaseFn(); releaseFn = null; } return true; });
    await page.addInitScript((off) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { await window.__cAcquire(); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(); } },
      };
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    }, offset == null ? SEP_OFFSET : offset);
    const boot = async (who, role) => {
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(300);
    };
    return { page, boot, label };
  };
  const A = await mkPage('A'), B = await mkPage('B');
  // ---------- seed ----------
  await A.boot('Dr. Ghaith', 'supervisor');
  const base = await A.page.evaluate(() => ({ clinics: clinics.map(c => ({ id: c.id, name: c.name, rep: c.rep, cls: c.cls })), products: products.filter(p=>p.price>0).slice(0, 12).map(p => ({ id: p._key || p.id, name: p.name, price: p.price, brand: p.brand })), reps: REPS.slice(), today: todayStr() }));
  const today = base.today; const reps = base.reps;
  check('clock pinned to 2026-09-21', today === '2026-09-21', today);
  const d = off => { const x = new Date(today + 'T00:00:00'); x.setDate(x.getDate() + off); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  const byRep = {}; base.clinics.forEach(c => { if(c.cls !== 'Closed') (byRep[c.rep] = byRep[c.rep] || []).push(c); });
  const clinicsSeed = base.clinics.map((c, i) => ({ id: c.id, name: c.name, rep: c.rep, cls: c.cls, market: 'A', phone: '', notes: '', doctors: [{ id: 'doc-' + i + 'a', name: 'Dr. Test ' + i, title: 'Orthodontist' }, { id: 'doc-' + i + 'b', name: 'Dr. Second ' + i, title: 'Periodontist' }] }));
  const m0 = byRep[reps[0]], r0 = byRep[reps[1]];
  const P = base.products;
  const visitsSeed = [
    // rep0: field visits on several days, a joint visit, a call, a phone order
    { id: 'v1', clinicId: m0[0].id, rep: reps[0], date: d(0), ts: Date.now(), products: [P[0].id], orderTaken: true, orders: [{ id: 'o1', items: [{ productId: P[0].id, qty: 2 }], discountPct: 0, gross: P[0].price*2, net: P[0].price*2 }], orderItems: [{ productId: P[0].id, qty: 2 }], orderGross: P[0].price*2, orderDiscount: 0, orderTotal: P[0].price*2, doctorIds: ['doc-0a'], doctorId: 'doc-0a', nextFollowUp: d(7), notes: 'today' },
    { id: 'v2', clinicId: m0[1].id, rep: reps[0], withRep: reps[1], date: d(-6), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'joint six days ago', noOrderReason: 'Budget/approval pending' },
    { id: 'v3', clinicId: m0[2].id, rep: reps[0], date: d(-7), ts: Date.now(), products: [], orderTaken: true, orders: [{ id: 'o3', items: [{ productId: P[1].id, qty: 1 }], discountPct: 0, gross: P[1].price, net: P[1].price }], orderItems: [{ productId: P[1].id, qty: 1 }], orderTotal: P[1].price, doctorIds: [], notes: 'seven days ago' },
    { id: 'v4', clinicId: m0[3].id, rep: reps[0], date: d(-1), ts: Date.now(), callOnly: true, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'call' },
    { id: 'v5', clinicId: m0[4].id, rep: reps[0], date: d(-2), ts: Date.now(), orderOnly: true, products: [], orderTaken: true, orders: [{ id: 'o5', items: [{ productId: P[2].id, qty: 1 }], discountPct: 0, gross: P[2].price, net: P[2].price }], orderItems: [{ productId: P[2].id, qty: 1 }], orderTotal: P[2].price, doctorIds: [], notes: 'phone order' },
    // rep1
    { id: 'v6', clinicId: r0[0].id, rep: reps[1], date: d(-3), ts: Date.now(), products: [P[3].id], orderTaken: true, orders: [{ id: 'o6', items: [{ productId: P[3].id, qty: 3 }], discountPct: 0, gross: P[3].price*3, net: P[3].price*3 }], orderItems: [{ productId: P[3].id, qty: 3 }], orderTotal: P[3].price*3, doctorIds: [], notes: 'renova' },
    { id: 'v7', clinicId: r0[1].id, rep: reps[1], date: d(-40), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'old', noOrderReason: 'Stock still available' },
  ];
  const dayPlans = { [today]: { [reps[0]]: [{ id: m0[0].id, note: '' }, { id: m0[5].id, note: 'bring samples' }] }, [d(-6)]: { [reps[1]]: [{ id: m0[1].id, note: '' }] }, [d(-3)]: { [reps[0]]: [{ id: m0[6].id, note: '' }] } };
  const targets = { [reps[0]]: { revenue: 10000, visits: 20, achieved: 3000, achievedAsOf: d(-7), month: today.slice(0,7) }, [reps[1]]: { revenue: 12000, visits: 0, achieved: 4000, achievedAsOf: d(-7), month: today.slice(0,7) } };
  Object.assign(cloud, { clinics: JSON.stringify(clinicsSeed), visits: JSON.stringify(visitsSeed), tasks: JSON.stringify([]), dayPlans: JSON.stringify(dayPlans), events: JSON.stringify([{ id: 'e1', type: 'Meeting', title: 'Team', date: d(2), rep: reps[0] }]), targets: JSON.stringify(targets), recycleBin: JSON.stringify({ clinics: [], products: [], visits: [] }) });
  delete cloud.tombs;

  // ================= TODAY =================
  await A.boot(reps[0], 'rep');
  let card = await A.page.evaluate(() => document.getElementById('targetCard').innerText);
  check('TODAY-1: rep does not see the Team row', !/Team/.test(card) && !/\b2 reps\b/.test(card), card.split('\n').slice(-2));
  check('TODAY-3: visits target counts field visits incl. the joint one, not calls/phone orders (3/20)', /Visits 3\/20/.test(card), card.match(/Visits [^)]*\)/));
  await A.boot(reps[1], 'rep');
  card = await A.page.evaluate(() => document.getElementById('targetCard').innerText);
  check('TODAY-1b: other rep sees only her own line', !/Team/.test(card) && !card.includes(reps[0]), card.split('\n').slice(0,3));
  await A.boot('Dr. Ghaith', 'supervisor');
  card = await A.page.evaluate(() => document.getElementById('targetCard').innerText);
  check('TODAY-1c: supervisor still sees the Team row', /Team/.test(card) && /2 reps/.test(card), card.split('\n').slice(-2));
  // TODAY-6 visits-only target renders a row
  await A.page.evaluate((r) => { targets[r] = { visits: 15, revenue: 0, month: todayStr().slice(0,7) }; renderTargetCard(); }, reps[1]);
  card = await A.page.evaluate(() => document.getElementById('targetCard').innerText);
  check('TODAY-6: a visits-only target renders its own row', new RegExp(reps[1] + '[\\s\\S]*Visits 2 of 15').test(card), card.split('\n').filter(l=>/Visits/.test(l)));
  await A.page.evaluate((r) => { targets[r] = { revenue: 12000, visits: 0, achieved: 4000, achievedAsOf: '2026-09-14', month: todayStr().slice(0,7) }; renderTargetCard(); }, reps[1]);
  // TODAY-4 / TODAY-5: joint visit satisfies the partner's plan; missed section exists on Today
  const missed = await A.page.evaluate(() => { renderMissedPlans(); return { title: document.getElementById('missedTitle').style.display, list: document.getElementById('missedList').innerText, coach: UMCore.coachInsights({ erpMtd: {}, from: null, to: null, today: todayStr(), repFilter: 'all', visits, clinics, targets, dayPlans }).filter(i=>i.key==='missed').map(i=>i.detail).join(' ') }; });
  check('TODAY-4: the joint visit satisfied the partner\'s planned visit (only the unvisited plan is missed)', missed.list.split('Reschedule').length-1 === 1 && !missed.list.includes(m0[1].name), missed.list.split('\n').slice(0,3));
  check('TODAY-5: the coach points at a section that exists (missed list rendered on Today)', missed.title !== 'none' && /Missed planned visits/.test(missed.coach), { title: missed.title, coach: missed.coach });
  // TODAY-2 / CAL-1: plan today can deselect, keeps notes, no duplicates
  await A.boot(reps[0], 'rep');
  const plan = await A.page.evaluate(async (ids) => {
    openPlanDay();
    const before = [...window._planMine];
    await togglePlanClinic(ids[0]);           // deselect an existing entry (planned via calendar)
    await togglePlanClinic(ids[2]);           // select a new one
    await togglePlanClinic(ids[2]);           // and deselect it again
    const after = (dayPlans[todayStr()][currentUser.name] || []);
    closeModal();
    return { before, after: after.map(e => typeof e === 'string' ? 'STRING' : e.id + ':' + (e.note||'')), chips: document.querySelectorAll('#planPicker .chip.on').length };
  }, [m0[0].id, m0[5].id, m0[7].id]);
  const cloudPlan = JSON.parse(cloud.dayPlans)[today][reps[0]];
  check('TODAY-2/CAL-1: deselect removes the entry, the note on the other entry survives, no string ids, no duplicates', plan.before.length===2 && JSON.stringify(plan.after)===JSON.stringify([m0[5].id + ':bring samples']) && JSON.stringify(cloudPlan.map(e=>e.id))===JSON.stringify([m0[5].id]), { plan, cloudPlan });
  // CAL-4: supervisor Plan today offers clinics
  await A.boot('Dr. Ghaith', 'supervisor');
  const supPick = await A.page.evaluate(() => { openPlanDay(); const n = document.querySelectorAll('#planPicker .chip').length; closeModal(); return n; });
  check('CAL-4: supervisor\'s Plan today lists clinics', supPick > 10, supPick);
  // CAL-3: month navigation from the 31st
  const nav = await A.page.evaluate(() => { openWeekMonthPlan(); setPlanViewMode('month'); planViewAnchor = '2026-08-31'; shiftPlanView(1); const a = planViewAnchor; planViewAnchor = '2026-10-31'; shiftPlanView(1); const b = planViewAnchor; planViewAnchor = '2026-03-31'; shiftPlanView(-1); const c = planViewAnchor; closeModal(); return [a, b, c]; });
  check('CAL-3: monthly plan view never skips a month from the 31st', nav[0].startsWith('2026-09') && nav[1].startsWith('2026-11') && nav[2].startsWith('2026-02'), nav);

  // ================= CLINICS / VISITS =================
  // CV-3: supervisor logs for a real rep by default; a non-rep value is refused
  const logAs = await A.page.evaluate(() => { logAsRep = 'Dr. Ghaith'; switchView('log'); prepLogView(); return logAsRep; });
  check('CV-3: supervisor\'s Log defaults to a real rep', reps.includes(logAs), logAs);
  // CV-2: deselected product leaves the order and the totals
  const cv2 = await A.page.evaluate(async (args) => {
    const [clinicId, p0, p1] = args;
    prepLogView(clinicId); pickClinic(clinicId);
    selectedDoctorIds = [clinics.find(c=>c.id===clinicId).doctors[0].id];
    toggleProductChip(p0); toggleProductChip(p1);
    setOrder(true);
    draftOrders[0].qty[p0] = 2; draftOrders[0].qty[p1] = 1;
    toggleProductChip(p1); // deselect
    const gross = orderGross(draftOrders[0]);
    window._lastVisitSaveAt = 0;
    await saveVisit();
    const v = visits[visits.length-1];
    return { gross, saved: { items: v.orderItems.map(i=>i.productId), gross: v.orderGross, total: v.orderTotal }, price0: findProduct(p0).price };
  }, [m0[8].id, P[0].id, P[1].id]);
  check('CV-2: a deselected product is out of the subtotal and out of the saved totals', Math.abs(cv2.gross - cv2.price0*2) < 0.01 && cv2.saved.items.length===1 && Math.abs(cv2.saved.gross - cv2.price0*2) < 0.01 && Math.abs(cv2.saved.total - cv2.price0*2) < 0.01, cv2);
  // CV-5: a validation error does not lock the save button for 4 seconds
  const cv5 = await A.page.evaluate(async (clinicId) => {
    switchView('log'); prepLogView(); startNewClinic(); document.getElementById('newClinicName').value = '';
    window._lastVisitSaveAt = 0; await saveVisit(); // "Enter a clinic name"
    document.getElementById('newClinicName').value = 'Brand New Clinic ' + Date.now();
    const n = visits.length; await saveVisit(); // must not say "Already saving…"
    return { saved: visits.length === n + 1 };
  }, m0[8].id);
  check('CV-5: the corrected save goes through immediately after a validation error', cv5.saved, cv5);
  // CV-1: removing a doctor sticks across a merge with a stale copy
  await A.boot(reps[0], 'rep');
  const cv1 = await A.page.evaluate(async (clinicId) => {
    const c = clinics.find(x=>x.id===clinicId); const docId = c.doctors[0].id;
    await removeDoctor(clinicId, docId);
    // simulate another (stale) device saving the clinic with the doctor still in it
    const stale = JSON.parse(await (await window.storage.get('clinics')).value);
    const sc = stale.find(x=>x.id===clinicId); sc.doctors.push({ id: docId, name: 'Dr. Test 0', title: 'Orthodontist' });
    await window.storage.set('clinics', JSON.stringify(stale));
    c.notes = 'touched'; await persist('clinics');
    const now = clinics.find(x=>x.id===clinicId).doctors.map(d=>d.id);
    const cloudDocs = JSON.parse(await (await window.storage.get('clinics')).value).find(x=>x.id===clinicId).doctors.map(d=>d.id);
    return { docId, now, cloudDocs };
  }, m0[0].id);
  check('CV-1: a removed doctor does not come back through the merge (screen and cloud)', !cv1.now.includes(cv1.docId) && !cv1.cloudDocs.includes(cv1.docId), cv1);
  // CV-4: editing a visit's follow-up date moves the auto task + plan entry
  const cv4 = await A.page.evaluate(async () => {
    const v = visits.find(x=>x.id==='v1'); const c = clinics.find(x=>x.id===v.clinicId);
    await scheduleFollowUp(c, v.nextFollowUp, v.rep); // the auto task/plan the original save created
    openEditVisit('v1');
    const nd = '2026-10-05';
    document.getElementById('evFollow').value = nd;
    await saveEditVisit('v1');
    const t = tasks.filter(t=>t.kind==='followup' && t.clinicId===c.id && !t.done).map(t=>t.dueDate);
    const planned = Object.keys(dayPlans).filter(dt => (dayPlans[dt][v.rep]||[]).some(e=>planEntryId(e)===c.id && planEntryNote(e)===AUTO_FOLLOWUP_NOTE));
    return { t, planned, clinicNext: c.nextFollowUp };
  });
  check('CV-4: the follow-up task and day-plan entry follow the edited date', JSON.stringify(cv4.t)===JSON.stringify(['2026-10-05']) && JSON.stringify(cv4.planned)===JSON.stringify(['2026-10-05']) && cv4.clinicNext==='2026-10-05', cv4);
  // CV-6 + RS-4: bin restore recomputes lastVisit and never duplicates
  await A.boot('Dr. Ghaith', 'supervisor');
  const cv6 = await A.page.evaluate(async () => {
    const v = visits.find(x=>x.id==='v3'); const cid = v.clinicId;
    await deleteVisit('v3');
    const afterDel = clinics.find(c=>c.id===cid).lastVisit;
    const idx = recycleBin.visits.findIndex(x=>x.id==='v3');
    await restoreFromBin('visits', idx);
    const afterRestore = clinics.find(c=>c.id===cid).lastVisit;
    // RS-4: restore again from a stale bin entry must not duplicate
    recycleBin.visits.push({ ...visits.find(x=>x.id==='v3'), _deletedAt: Date.now(), _label: 'stale' });
    await restoreFromBin('visits', recycleBin.visits.length-1);
    return { afterDel, afterRestore, copies: visits.filter(x=>x.id==='v3').length, binLeft: recycleBin.visits.filter(x=>x.id==='v3').length, cloudCopies: JSON.parse(await (await window.storage.get('visits')).value).filter(x=>x.id==='v3').length };
  });
  check('CV-6: restoring a visit recomputes the clinic\'s last visit', cv6.afterDel === null && cv6.afterRestore === d(-7), cv6);
  check('RS-4: a second Restore of the same record never makes a second copy', cv6.copies===1 && cv6.cloudCopies===1 && cv6.binLeft===0, cv6);

  // ================= ROLES / SYNC =================
  // RS-1: restore on device B is not undone by device A's next save
  await A.boot('Dr. Ghaith', 'supervisor');
  await A.page.evaluate(async () => { await deleteVisit('v6'); });
  await B.boot('Dr. Ghaith', 'supervisor');
  const rs1b = await B.page.evaluate(async () => { const i = recycleBin.visits.findIndex(x=>x.id==='v6'); await restoreFromBin('visits', i); return visits.some(v=>v.id==='v6'); });
  // device A (never refreshed) saves something → the merge must NOT delete v6 again
  const rs1a = await A.page.evaluate(async () => { tombsDoc.visits['v6'] = Date.now() - 120000; try{ const raw = JSON.parse(localStorage.getItem('um_tombs')); raw.visits['v6'] = Date.now() - 120000; localStorage.setItem('um_tombs', JSON.stringify(raw)); }catch(e){} visits.find(v=>v.id==='v1').notes = 'edited on A'; await persist('visits'); return { live: visits.some(v=>v.id==='v6'), tomb: _tombstones.visits.has('v6') }; });
  const rs1cloud = JSON.parse(cloud.visits).some(v=>v.id==='v6');
  const rs1tombs = JSON.parse(cloud.tombs||'{}').visits||{};
  check('RS-1: a visit restored on another device survives this device\'s next save (and its tombstone is dropped)', rs1b && rs1a.live && !rs1a.tomb && rs1cloud && !('v6' in rs1tombs), { rs1b, rs1a, rs1cloud, tombs: Object.keys(rs1tombs) });
  // …and a fresh stale device (v6 still in its local delete log, no refresh yet) deleting something ELSE must not re-publish v6's delete
  await A.boot('Dr. Ghaith', 'supervisor');
  const rs1c = await A.page.evaluate(async () => { _tombstones.visits.add('v6'); tombsDoc.visits['v6'] = Date.now() - 120000; await deleteVisit('v5'); await new Promise(r=>setTimeout(r,300)); return { live: visits.some(v=>v.id==='v6') }; });
  const rs1cT = JSON.parse(cloud.tombs||'{}').visits||{};
  check('RS-1b: a later delete from the stale device does not re-publish the revived record\'s delete', rs1c.live && !('v6' in rs1cT) && ('v5' in rs1cT) && JSON.parse(cloud.visits).some(v=>v.id==='v6'), { rs1c, tombs: Object.keys(rs1cT) });
  // RS-3: a device that has not refreshed since another device's delete does not resurrect it
  await A.boot('Dr. Ghaith', 'supervisor'); await B.boot('Dr. Ghaith', 'supervisor');
  await B.page.evaluate(async () => { await deleteVisit('v7'); });
  const rs3 = await A.page.evaluate(async () => { visits.find(v=>v.id==='v1').notes = 'edited again on A'; await persist('visits'); return visits.some(v=>v.id==='v7'); });
  check('RS-3: an unrefreshed device\'s save does not resurrect a record deleted elsewhere', !rs3 && !JSON.parse(cloud.visits).some(v=>v.id==='v7'), { onScreen: rs3 });
  check('RS-3b: the deleted record never reaches the screen at boot either', !(await (async()=>{ await A.boot('Dr. Ghaith','supervisor'); return A.page.evaluate(()=>visits.some(v=>v.id==='v7')); })()));
  // RS-2: two devices saving a visit within one round-trip — both survive
  await A.boot(reps[0], 'rep'); await B.boot(reps[1], 'rep');
  opts.delaySet = 150;
  const addVisit = (pg, id) => pg.evaluate(async (id) => { visits.push({ id, clinicId: clinics[0].id, rep: currentUser.name, date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [] }); return persist('visits'); }, id);
  const [okA, okB] = await Promise.all([addVisit(A.page, 'race-A'), addVisit(B.page, 'race-B')]);
  opts.delaySet = 0;
  const raceCloud = JSON.parse(cloud.visits).map(v=>v.id);
  check('RS-2: concurrent saves from two devices both land (atomic read-merge-write)', okA && okB && raceCloud.includes('race-A') && raceCloud.includes('race-B'), { okA, okB, has: raceCloud.filter(x=>/race/.test(x)) });
  // RS-6: a timed-out read of the recycle bin on a fresh device must not wipe the team's bin
  await A.boot('Dr. Ghaith', 'supervisor');
  const binBefore = JSON.parse(cloud.recycleBin);
  const rs6 = await A.page.evaluate(async () => {
    localStorage.removeItem('um_mirror:recycleBin');
    const realGet = window.storage.get; let fail = true;
    window.storage.get = async (k, s, o) => { if(k==='recycleBin' && fail) throw new Error('timeout'); return realGet(k, s, o); };
    await loadAll(); // bin read fails → defaults in memory
    const flagged = !!_loadFailed.recycleBin;
    recycleBin = { clinics: [], products: [], visits: [] }; // a fresh device holds nothing
    const seen = binCount();
    fail = false; // the cloud is back for the write's re-read
    await deleteVisit('v1');
    window.storage.get = realGet;
    return { seen, flagged, mem: recycleBin.visits.map(x=>x.id) };
  });
  const binAfter = JSON.parse(cloud.recycleBin);
  check('RS-6: the delete unions with the team\'s bin instead of replacing it', rs6.flagged && rs6.seen===0 && binAfter.visits.map(x=>x.id).includes('v1') && binBefore.visits.every(x=>binAfter.visits.some(y=>y.id===x.id)) && binAfter.clinics.length>=binBefore.clinics.length, { before: binBefore.visits.map(x=>x.id), after: binAfter.visits.map(x=>x.id) });
  // RS-6b: whole-document key (targets) after a failed read is refused, not overwritten
  const rs6b = await A.page.evaluate(async () => { _loadFailed.targets = true; targets = {}; const ok = await persist('targets'); delete _loadFailed.targets; return ok; });
  check('RS-6b: a targets save after a failed read is refused (cloud untouched)', rs6b===false && Object.keys(JSON.parse(cloud.targets)).length>=2);
  // RS-5: offline + storage full → honest message, visit kept and queued
  await A.boot(reps[0], 'rep');
  const rs5 = await A.page.evaluate(async (clinicId) => {
    const realUpd = window.storage.update, realSet = window.storage.set, realGet = window.storage.get;
    window.storage.update = async () => { throw new Error('offline'); }; window.storage.set = async () => { throw new Error('offline'); }; window.storage.get = async () => { throw new Error('offline'); };
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){ if(/^um_mirror:/.test(k)) throw new Error('QuotaExceededError'); return realSetItem.call(this, k, v); };
    prepLogView(clinicId); pickClinic(clinicId); selectedDoctorIds = [clinics.find(c=>c.id===clinicId).doctors[0].id];
    document.getElementById('visitNotes').value = 'offline-full';
    const toasts = []; const realToast = showToast; window.showToast = m => { toasts.push(m); realToast(m); };
    window._lastVisitSaveAt = 0; await saveVisit();
    window.showToast = realToast; Storage.prototype.setItem = realSetItem;
    window.storage.update = realUpd; window.storage.set = realSet; window.storage.get = realGet;
    return { toasts, kept: visits.some(v=>v.notes==='offline-full'), queued: outboxHas('visits') };
  }, m0[3].id);
  check('RS-5: offline + full storage → no success toast, the visit stays in memory and is queued', rs5.kept && rs5.queued && rs5.toasts.some(t=>/لم تُحفظ|ممتلئة/.test(t)) && !rs5.toasts.some(t=>/Logged|Saved|✅/.test(t)), rs5);
  // RS-7: the 20-second refresh keeps the supervisor's rep filter
  await A.boot('Dr. Ghaith', 'supervisor');
  const rs7 = await A.page.evaluate(async (r) => { setReportRepFilter(r); await loadAll(); return { report: reportRepFilter, clinic: clinicRepFilter }; }, reps[1]);
  check('RS-7: background refresh keeps the selected rep filter', rs7.report===reps[1], rs7);
  // RS-8: clinic edit form does not overwrite a concurrent change to another field
  const rs8 = await A.page.evaluate(async (cid) => {
    openEditClinic(cid);
    const other = JSON.parse(await (await window.storage.get('clinics')).value);
    other.find(c=>c.id===cid).phone = '55500011'; // another device changed the phone meanwhile
    await window.storage.set('clinics', JSON.stringify(other));
    document.getElementById('ecName').value = 'Renamed Clinic X';
    await saveEditClinic(cid);
    const c = clinics.find(x=>x.id===cid);
    const cc = JSON.parse(await (await window.storage.get('clinics')).value).find(x=>x.id===cid);
    return { name: c.name, phone: c.phone, cloudName: cc.name, cloudPhone: cc.phone };
  }, m0[9].id);
  check('RS-8: my rename and the other device\'s phone change both survive', rs8.name==='Renamed Clinic X' && rs8.phone==='55500011' && rs8.cloudName==='Renamed Clinic X' && rs8.cloudPhone==='55500011', rs8);
  // RS-9: the joint partner is not offered Delete
  await A.boot(reps[1], 'rep');
  const rs9 = await A.page.evaluate(() => { openEditVisit('v2'); const t = document.getElementById('modalInner').innerText; closeModal(); return t; });
  check('RS-9: joint partner sees no Delete button, only an explanation', !/Delete this visit/.test(rs9) && /can delete/.test(rs9), rs9.split('\n').slice(-2));
  // CAL-2: a clinic removed from a plan on one device stays removed after the other device saves a plan
  await A.boot(reps[0], 'rep');
  await A.page.evaluate(async (ids) => { const dt = todayStr(); dayPlans[dt] = dayPlans[dt] || {}; dayPlans[dt][currentUser.name] = [{ id: ids[0], note: '' }, { id: ids[1], note: 'keep' }]; await persist('dayPlans'); }, [m0[5].id, m0[6].id]);
  await B.boot(reps[0], 'rep');
  await B.page.evaluate(async (cid) => { const dt = todayStr(); dayPlans[dt][currentUser.name] = dayPlans[dt][currentUser.name].filter(e=>planEntryId(e)!==cid); await persist('dayPlans'); }, m0[5].id);
  const cal2 = await A.page.evaluate(async (cid2) => { const dt = '2026-09-25'; dayPlans[dt] = dayPlans[dt] || {}; dayPlans[dt][currentUser.name] = [{ id: cid2, note: '' }]; await persist('dayPlans'); return ((dayPlans[todayStr()]||{})[currentUser.name]||[]).map(planEntryId); }, m0[7].id);
  check('CAL-2: the removal made on the other device survives this device\'s plan save', !cal2.includes(m0[5].id) && !(JSON.parse(cloud.dayPlans)[today][reps[0]]||[]).some(e=>e.id===m0[5].id), { screen: cal2, cloud: (JSON.parse(cloud.dayPlans)[today][reps[0]]||[]).map(e=>e.id) });

  // ================= REPORTS =================
  await A.boot('Dr. Ghaith', 'supervisor');
  const re = await A.page.evaluate(() => {
    switchView('reports'); reportRepFilter = 'all'; reportCustom = null; reportRange = 7; renderReports();
    const b = reportRangeBounds();
    const rv = reportVisitsBase();
    const chart = document.getElementById('chartsWrap').innerText;
    const kpi = document.getElementById('repRevenue').textContent;
    const noOrder = document.getElementById('repNoOrder').innerText;
    return { b, ids: rv.map(v=>v.id).sort(), chart: chart.slice(0,200), kpi, noOrder, prev: !!computePrevPeriodScore(REPS[0]) };
  });
  check('RE-1: "7 days" is today and the six days before it, whole days (v2 six days ago in, v3 seven days ago out)', re.b.from===d(-6) && re.b.to===today && re.ids.includes('v2') && !re.ids.includes('v3'), re);
  check('RE-6: the no-order reasons card is visible with content', /Budget|Every visit|No reasons/.test(re.noOrder), re.noOrder.slice(0,80));
  // RE-2: buckets sum to the KPI
  const re2 = await A.page.evaluate(() => {
    reportRange = 30; reportCustom = null; renderReports();
    const rv = reportVisitsBase(); const kpi = rv.reduce((a,v)=>a+(v.orderTotal||0),0);
    const svg = document.querySelector('#chartsWrap .chartcard svg');
    // recompute the buckets the way renderCharts does and compare to the KPI
    const b = reportRangeBounds(); const len = daysBetween(b.from, b.to)+1; const buckets = Math.min(len, 6);
    const day = (s,n)=>{ const x=new Date(s+'T00:00:00'); x.setDate(x.getDate()+n); return UMCore.localDateStr(x); };
    let sum = 0; for(let i=0;i<buckets;i++){ sum += UMCore.filterVisitsByRange(rv, day(b.from, Math.floor(i*len/buckets)), day(b.from, Math.floor((i+1)*len/buckets)-1)).reduce((a,v)=>a+(v.orderTotal||0),0); }
    return { kpi: Math.round(kpi*100)/100, sum: Math.round(sum*100)/100, hasSvg: !!svg };
  });
  check('RE-2: the sales-trend buckets partition the window (sum = KPI sales)', re2.hasSvg && Math.abs(re2.kpi - re2.sum) < 0.01 && re2.kpi > 0, re2);
  // RE-3: a rep sees only her own bar
  await A.boot(reps[0], 'rep');
  const re3 = await A.page.evaluate((other) => { switchView('reports'); reportRange = 9999; renderReports(); const card = [...document.querySelectorAll('#chartsWrap .chartcard')].find(c=>/Sales by rep/.test(c.innerText)); return { txt: card.innerText, hasOther: card.innerText.includes(other.replace('Dr. ','')) }; }, reps[1]);
  check('RE-3: rep\'s "Sales by rep" chart shows no other rep', !re3.hasOther, re3.txt.slice(0,120));
  // RE-4: copy-as-text counts field visits
  await A.boot('Dr. Ghaith', 'supervisor');
  const re4 = await A.page.evaluate(() => { switchView('reports'); reportRepFilter='all'; reportRange = 9999; reportCustom = null; renderReports(); const rv = reportVisitsBase(); const field = rv.filter(v=>UMCore.isFieldVisit(v)).length; let txt=''; const orig = navigator.clipboard; try{ txt = (function(){ let rv2 = reportVisitsBase(); if(reportRepFilter!=='all') rv2 = rv2.filter(v=>v.rep===reportRepFilter); return rv2; })().length; }catch(e){} return { total: rv.length, field }; });
  const re4txt = await A.page.evaluate(() => { const fn = copyReport.toString(); return /isFieldVisit/.test(fn); });
  check('RE-4: "Visits logged" in copy-as-text counts field visits only', re4txt && re4.field < re4.total, re4);
  // RE-5: master report total row equals the deduped team count
  const re5 = await A.page.evaluate(() => { reportRange = 9999; reportCustom = null; const html = buildMasterReportBody('en', 'full'); const m = html.match(/<td><span class="num"><b>(\d+)<\/b><\/span><\/td>/); const b = reportRangeBounds(); const pv = UMCore.filterVisitsByRange(visits, b.from, b.to); const team = UMCore.dedupeVisits(pv.filter(v=>UMCore.isFieldVisit(v))).unique.length; return { total: m && +m[1], team }; });
  check('RE-5: activity table total counts a joint visit once', re5.total === re5.team, re5);
  // RE-7: scorecard export with empty range uses everything
  const re7 = await A.page.evaluate(() => { reportRange = 7; reportCustom = null; const rows = buildScorecardCSV(null); const all = buildScorecardCSV({from:null,to:null}); return { empty: rows[1][1], all: all[1][1], week: buildScorecardCSV({from: reportRangeBounds().from, to: todayStr()})[1][1] }; });
  check('RE-7: an empty export range exports everything, not the report window', re7.empty===re7.all && re7.empty>=re7.week, re7);

  // ================= ADMIN =================
  // ADM-4: playbook shows only the rep's own doctors
  await A.boot(reps[0], 'rep');
  const adm4 = await A.page.evaluate((otherRep) => { const sp = Object.keys(SPECIALTY_PLAYBOOK)[0]; clinics.forEach(c=>c.doctors.forEach(dd=>{ dd.title = sp; })); openPlaybook(sp); const t = document.getElementById('modalInner').innerText; closeModal(); return { others: clinics.filter(c=>c.rep===otherRep).some(c=>t.includes(c.name)), mine: clinics.filter(c=>c.rep===currentUser.name).some(c=>t.includes(c.name)) }; }, reps[1]);
  check('ADM-4: playbook lists my clinics\' doctors, not the other rep\'s', adm4.mine && !adm4.others, adm4);
  // ADM-3: product code change keeps history
  await A.boot('Dr. Ghaith', 'supervisor');
  const adm3 = await A.page.evaluate(async (pid) => { const p = findProduct(pid); const oldId = p.id; openEditProduct(pid); document.getElementById('epCode').value = oldId + '-NEW'; await saveEditProduct(pid); const np = products.find(x=>x.id===oldId + '-NEW'); const key = productKey(np); const n = visits.filter(v=>(v.orderItems||[]).some(i=>i.productId===key)).length; const old = visits.filter(v=>(v.orderItems||[]).some(i=>i.productId===pid)).length; return { n, old, cloud: JSON.parse(await (await window.storage.get('visits')).value).filter(v=>(v.orderItems||[]).some(i=>i.productId===key)).length }; }, P[0].id);
  check('ADM-3: visit history follows the product\'s new code', adm3.n>=1 && adm3.old===0 && adm3.cloud===adm3.n, adm3);
  // ADM-1: renaming a rep carries target, events, plans, joint visits
  const adm1 = await A.page.evaluate(async (r) => { visits.push({ id: 'jv-adm1', clinicId: clinics[0].id, rep: REPS[1], withRep: r, date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [] }); const i = staff.findIndex(s=>s.name===r); openStaffForm(i); document.getElementById('sfName').value = r + ' Renamed'; const evBefore = events.filter(e=>e.rep===r).length; await saveStaff(i); closeModal(); const nn = r + ' Renamed'; return { target: !!targets[nn] && !targets[r], events: events.filter(e=>e.rep===nn).length === evBefore && evBefore>0, joint: visits.filter(v=>v.withRep===nn).length, plans: Object.values(dayPlans).filter(dd=>dd[nn]).length, oldPlans: Object.values(dayPlans).filter(dd=>dd[r]).length }; }, reps[0]);
  check('ADM-1: rename carries the target, events, joint visits and plans (no duplicates)', adm1.target && adm1.events && adm1.joint>=1 && adm1.plans>=1 && adm1.oldPlans===0, adm1);
  // ADM-5: territory reassign after the sheet is closed does not throw
  await A.boot('Dr. Ghaith', 'supervisor');
  const before5 = errors.A.length;
  await A.page.evaluate(async (cid) => { closeModal(); await reassignClinic(cid, REPS[1]); }, m0[10].id);
  check('ADM-5: territory reassign with the sheet closed is clean', errors.A.length===before5, errors.A.slice(before5));

  // ================= EMAIL REPORTS (sent by GitHub Actions) =================
  await A.boot('Dr. Ghaith', 'supervisor');
  const mail1 = await A.page.evaluate(async () => {
    openAdminPanel(); setAdminTab('mail'); await new Promise(r=>setTimeout(r,200));
    const tab = document.getElementById('apBody').innerText;
    const send = document.getElementById('mailSendNow');
    previewDigest('morning'); const pm = document.getElementById('modalInner').innerText;
    previewDigest('evening', REPS[0]); const pe = document.getElementById('modalInner').innerText;
    return { tab, pm, pe, href: send && send.getAttribute('href'), target: send && send.getAttribute('target') };
  });
  check('MAIL: admin tab lists recipients, schedule and status', /07:30/.test(mail1.tab) && /18:30/.test(mail1.tab) && /mariam@|@ultramed/.test(mail1.tab) && /لم يُرسَل أي تقرير بعد/.test(mail1.tab) && /GitHub/.test(mail1.tab), mail1.tab.split('\n').slice(0,4));
  check('MAIL: team morning preview carries the team % and every rep\'s target line', /تحقيق الفريق/.test(mail1.pm) && /الفريق: \d+%/.test(mail1.pm) && (mail1.pm.match(/: \d+% — /g)||[]).length >= 2 && /خطة اليوم/.test(mail1.pm), mail1.pm.split('\n').slice(0,6));
  check('MAIL: rep evening preview shows her day only', /حصيلة اليوم/.test(mail1.pe) && /Mariam/.test(mail1.pe.split('\n')[0]) && !/Renova/.test(mail1.pe), mail1.pe.split('\n').slice(0,3));
  check('MAIL: "send now" opens the GitHub Actions run page (no Netlify call)', mail1.href === 'https://github.com/ghaithalmanfe/ultramed-app/actions/workflows/daily-report.yml' && mail1.target === '_blank', mail1);
  cloud.mailLog = JSON.stringify({ last: { kind: 'morning', today, at: new Date().toISOString(), sent: 2, failed: 1, to: [{ to: 'a@x', name: 'Mariam', ok: true }, { to: 'b@x', name: 'Renova', ok: false, error: 'bounced' }] }, history: [] });
  const mail2 = await A.page.evaluate(async () => { openAdminPanel(); setAdminTab('mail'); await new Promise(r=>setTimeout(r,300)); return { status: document.getElementById('mailStatusCard').innerText }; });
  check('MAIL: the status card shows the last run written by the sender', /آخر إرسال/.test(mail2.status) && /bounced/.test(mail2.status) && /1 فشلت/.test(mail2.status), mail2.status.split('\n').slice(0,3));
  // the e-mail's figure is the Today card's figure
  const same = await A.page.evaluate(() => { closeModal(); const d = UMCore.dailyDigest({ kind: 'morning', data: digestData(), reps: REPS }); const a = REPS.map(r => ({ r, mail: d.blocks.find(b=>b.rep===r).target, card: bestMonthRevenue(r) })); return a.map(x => ({ r: x.r, mail: x.mail && x.mail.amount, card: x.card.amount, team: d.team.pct, cardTeam: teamTargetNow().pct })); });
  check('MAIL: the e-mail figures equal the Today card figures (same code)', same.every(x => x.mail === x.card && x.team === x.cardTeam), same);

  check('no page errors on device A', errors.A.filter(e=>!/boom/.test(e)).length===0, errors.A.slice(0,5));
  check('no page errors on device B', errors.B.length===0, errors.B.slice(0,5));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
