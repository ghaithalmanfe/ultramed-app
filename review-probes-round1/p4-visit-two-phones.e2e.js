// P4: two phones edit the same visit. Mariam (no signal) adds a product she
// forgot; meanwhile the supervisor corrects the visit's notes. v123 merges
// visits three ways, field by field — but only while the phone keeps the base
// it read this session. After the app was closed and reopened with no signal
// (the usual case for a day in the field), the base is a fingerprint per
// visit: does the supervisor's correction survive her upload?
//  also: the same with a day plan (she removes one clinic, he adds another to the same day)
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9159);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const DAY = 86400000;
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const visit = (id, extra) => Object.assign({ id, clinicId: 'c1', rep: 'Mariam', date: '2026-11-11', ts: CLOCK - 2 * DAY, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['d1'], notes: 'original notes' }, extra || {});
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Hilal Dental Center', rep: 'Mariam', cls: 'B', doctors: [] },
    { id: 'c3', name: 'Summit Dental Center', rep: 'Mariam', cls: 'B', doctors: [] }]);
  cloud.visits = JSON.stringify([visit('V1'), visit('V2', { notes: 'other visit', clinicId: 'c2' })]);
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.dayPlans = JSON.stringify({ '2026-11-15': { Mariam: [{ id: 'c1', note: '', at: CLOCK - DAY }, { id: 'c2', note: '', at: CLOCK - DAY }] } });
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  for(const reopened of [false, true]){
    seed();
    const A = await W.mkPhone('P4-A' + (reopened ? 'r' : '')), S = await W.mkPhone('P4-S' + (reopened ? 'r' : ''));
    await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
    mode.offline.add(A.label);
    // Mariam, no signal: adds the product she forgot to V1, and takes c2 off Sunday's plan
    await A.ev(async () => {
      const v = visits.find(x => x.id === 'V1'); v.products = ['p1']; await persist('visits');
      dayPlans['2026-11-15'].Mariam = dayPlans['2026-11-15'].Mariam.filter(e => e.id !== 'c2'); await persist('dayPlans');
    });
    if(reopened){ await A.boot('Mariam', 'rep'); } // the app was closed and opened again, still no signal
    // the supervisor corrects V1's notes and adds c3 to her Sunday plan
    await S.ev(async () => {
      const v = visits.find(x => x.id === 'V1'); v.notes = 'corrected by the supervisor'; await persist('visits');
      dayPlans['2026-11-15'].Mariam.push({ id: 'c3', note: 'please visit', at: Date.now() }); await persist('dayPlans');
    });
    mode.offline.delete(A.label);
    await A.tick(); await A.tick();
    const v1 = (parse(cloud.visits) || []).find(v => v.id === 'V1') || {};
    const plan = ((parse(cloud.dayPlans) || {})['2026-11-15'] || {}).Mariam || [];
    check(`P4 [${reopened ? 'app reopened offline' : 'same session'}] visit: her product AND his corrected notes both stay`,
      JSON.stringify(v1.products) === '["p1"]' && v1.notes === 'corrected by the supervisor', { products: v1.products, notes: v1.notes });
    check(`P4 [${reopened ? 'app reopened offline' : 'same session'}] day plan: her removal of c2 AND his added c3 both stay`,
      plan.map(e => e.id).join(',') === 'c1,c3', plan.map(e => e.id));
    await A.ctx.close(); await S.ctx.close();
  }
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
