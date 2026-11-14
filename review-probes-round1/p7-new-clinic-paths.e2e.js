// P7: v123 stops "+ Add clinic" from moving sales: a rep adding a clinic whose
// name matches invoices that count for another person (closed months too) is
// refused ("The supervisor adds this clinic"). The same new clinic can also be
// created from the visit form ("New clinic") and from the order form ("+ Add a
// new customer"). Does either of those move October's invoice (a closed month)
// from Renova to Mariam?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9165);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const row = (d, doc, sm, net, cust) => [d, doc, 0, 'P-1', 1, net, net, 0, sm, 'TEPE', cust, 'Clinics', 0, ''];
const ROWS = [row('2026-10-20', 'SO1', 'Ranova Sample Person', 120, 'Bright Smile Dental'), row('2026-11-05', 'SO2', 'Ranova Sample Person', 80, 'Bright Smile Dental'), row('2026-11-06', 'SO3', 'Mariam Sample', 50, 'Dental 5 Clinic')];
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [{ id: 'p-oct-nov', from: '2026-10-01', to: '2026-11-12', net: 250, rowCount: ROWS.length, importedAt: '2026-11-12T08:00:00.000Z', rev: 1,
      repMap: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, rowsRef: { key: 'erpRows:p-oct-nov:1', chunks: 1, count: ROWS.length } }],
    repMapGlobal: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud['erpRows:p-oct-nov:1:0'] = JSON.stringify(ROWS);
}
const whoGetsOct = ph => ph.ev(() => { const p = erpPeriods()[0]; return unpackErpRows(p.rows).filter(r => r.customer === 'Bright Smile Dental').map(r => [r.date, UMCore.erpRowRep(r, clinics, erpMap, p.repMap)]); });
(async () => {
  await W.start();
  // 0 — control: "+ Add clinic" refuses it
  seed();
  const A0 = await W.mkPhone('P7-add'); await A0.boot('Mariam', 'rep');
  const r0 = await A0.ev(async () => { openAddClinic(); document.getElementById('mClinicName').value = 'Bright Smile Dental'; await submitAddClinic(); return { saved: clinics.some(c => c.name === 'Bright Smile Dental'), ask: ((document.getElementById('mClinicAsk') || {}).innerText || '').slice(0, 140) }; });
  check('P7 control. "+ Add clinic": refused for the rep, nothing moves', !r0.saved, r0);
  await A0.ctx.close();
  // 1 — the visit form's "New clinic"
  seed();
  const A = await W.mkPhone('P7-visit'); await A.boot('Mariam', 'rep');
  const before = await whoGetsOct(A);
  await A.ev(async () => {
    closeModal(); switchView('log'); prepLogView(); if(typeof startNewClinic === 'function') startNewClinic(); else newClinicMode = true;
    document.getElementById('newClinicName').value = 'Bright Smile Dental';
    document.getElementById('visitNotes').value = 'first visit at a new clinic';
    await saveVisit();
  });
  const after = await whoGetsOct(A);
  const c = (parse(cloud.clinics) || []).find(x => x.name === 'Bright Smile Dental');
  check('P7a. a new clinic created from the visit form never moves a closed month\'s invoice to another person',
    !c || JSON.stringify(after) === JSON.stringify(before) || (c.prevRep === 'Renova' && c.repSince === '2026-11-01'),
    { before, after, savedClinic: c ? { rep: c.rep, prevRep: c.prevRep || null, repSince: c.repSince || null } : null });
  await A.ctx.close();
  // 2 — the order form's "+ Add a new customer"
  seed();
  const B = await W.mkPhone('P7-order'); await B.boot('Mariam', 'rep');
  const b0 = await whoGetsOct(B);
  const info = await B.ev(async () => {
    openStandaloneOrder(); startSoNewClinic();
    document.getElementById('soNewClinicName').value = 'Bright Smile Dental';
    const pids = (products || []).map(p => productKey(p));
    soItems[pids[0]] = 1;
    try{ await saveStandaloneOrder(); }catch(e){ return 'threw: ' + e.message; }
    return 'ok';
  });
  const b1 = await whoGetsOct(B);
  const c2 = (parse(cloud.clinics) || []).find(x => x.name === 'Bright Smile Dental');
  check('P7b. a new customer created from the order form never moves a closed month\'s invoice to another person',
    !c2 || JSON.stringify(b1) === JSON.stringify(b0) || (c2.prevRep === 'Renova' && c2.repSince === '2026-11-01'),
    { info, before: b0, after: b1, savedClinic: c2 ? { rep: c2.rep, prevRep: c2.prevRep || null, repSince: c2.repSince || null } : null });
  await B.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
