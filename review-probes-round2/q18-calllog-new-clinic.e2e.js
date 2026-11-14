// Q18: R5 at its root — every way a clinic is made runs the "+ Add clinic"
// sales check (v123 review: the visit form's "New clinic" and the order form's
// "+ Add a new customer"). The call log (Log a call → "+ Add a new customer")
// makes a clinic too. Mariam logs a call with a new customer whose name is an
// ERP customer whose invoices count for Renova today (one of them October's,
// a closed month). Same seed as save-truth.e2e.js section E.
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9735);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const row = (d, doc, sm, net, cust) => [d, doc, 0, 'P-1', 1, net, net, 0, sm, 'TEPE', cust, 'Clinics', 0, ''];
const ROWS = [row('2026-10-20', 'SO1', 'Ranova Sample Person', 120, 'Bright Smile Dental'), row('2026-11-05', 'SO2', 'Ranova Sample Person', 80, 'Bright Smile Dental'),
  row('2026-11-06', 'SO3', 'Mariam Sample', 50, 'Dental 5 Clinic')];
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-11' }, Renova: { revenue: 12000, month: '2026-11' } });
  cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [{ id: 'p-oct-nov', from: '2026-10-01', to: '2026-11-12', net: 250, rowCount: ROWS.length, importedAt: '2026-11-12T08:00:00.000Z', rev: 1,
      repMap: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, rowsRef: { key: 'erpRows:p-oct-nov:1', chunks: 1, count: ROWS.length } }],
    repMapGlobal: { 'Ranova Sample Person': 'Renova', 'Mariam Sample': 'Mariam' }, returnPolicy: 'erp',
    seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud['erpRows:p-oct-nov:1:0'] = JSON.stringify(ROWS);
}
(async () => {
  await W.start();
  seed();
  const M = await W.mkPhone('Q18-M'); await M.boot('Mariam', 'rep');
  const before = await M.ev(() => { const p = erpPeriods()[0]; return unpackErpRows(p.rows).filter(r => r.customer === 'Bright Smile Dental').map(r => [r.date, UMCore.erpRowRep(r, clinics, erpMap, p.repMap)]); });
  const out = await M.ev(async () => {
    openCallLog(); await new Promise(r => setTimeout(r, 50)); startClNewClinic();
    document.getElementById('clNewClinicName').value = 'Bright Smile Dental';
    document.getElementById('clNotes').value = 'Called the new customer';
    window.__toasts = []; await saveCallLog(); await new Promise(r => setTimeout(r, 300));
    const p = erpPeriods()[0];
    return { clinic: (clinics.find(c => c.name === 'Bright Smile Dental') || {}).rep || null, toasts: window.__toasts.slice(),
      who: unpackErpRows(p.rows).filter(r => r.customer === 'Bright Smile Dental').map(r => [r.date, UMCore.erpRowRep(r, clinics, erpMap, p.repMap)]) };
  });
  const inCloud = (parse(cloud.clinics) || []).find(c => c.name === 'Bright Smile Dental');
  check('Q18. a rep\'s call log with a new customer never takes another person\'s invoices (a closed month\'s too): stopped like "+ Add clinic", the supervisor adds it',
    !inCloud && JSON.stringify(out.who) === JSON.stringify(before), { creditedBefore: before, creditedAfter: out.who, newClinicOwner: out.clinic, savedToCloud: !!inCloud, toasts: out.toasts });
  await M.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
