// Q11b: the same as Q11 for a VISIT the supervisor brought back from the
// recycle bin on v122 (deleted on Mariam's phone 20 days ago, on 24 Oct,
// restored 10 days later). Mariam's phone: v122 queued a removed plan entry
// and a visit with no signal this morning (its queue: tombs, tasks,
// visits); the app updates to v123 and opens WITH signal.
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9723);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const DAY = 86400000;
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const emptyLog = () => ({ visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} });
const visit = (id, date, notes, extra) => Object.assign({ id, clinicId: 'c1', rep: 'Mariam', date, ts: new Date(date + 'T09:00:00').getTime(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['d1'], notes }, extra || {});
const VB = visit('vBack', '2026-10-24', 'visit brought back from the recycle bin');
const VO = visit('vOct', '2026-10-27', 'another October visit');
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }, { id: 'c2', name: 'Hilal Dental', rep: 'Mariam', cls: 'B', doctors: [] }]);
  cloud.visits = '[]';
  cloud['visitsArch:2026-10'] = JSON.stringify([VB, VO]);
  cloud.visitsIndex = JSON.stringify({ v: 1, months: { '2026-10': { n: 2, rev: CLOCK - 10 * DAY } }, updated: CLOCK - 10 * DAY });
  cloud.events = '[]'; cloud.chat = '[]'; cloud.memories = '[]'; cloud.tasks = JSON.stringify([{ id: 'tDone', text: 'call the clinic', done: false, created: '2026-11-10', rep: 'Mariam' }]);
  cloud.dayPlans = JSON.stringify({ '2026-11-13': { Mariam: [{ id: 'c1', note: '', at: CLOCK - 3600000 }, { id: 'c2', note: '', at: CLOCK - 3600000 }] } });
  cloud.tombs = JSON.stringify(emptyLog()); // as v122 writes it
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
const fill = (ph, o) => ph.ev(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId); document.getElementById('visitNotes').value = o.note; }, o);
(async () => {
  await W.start();
  seed();
  const M = await W.mkPhone('Q11b-M', { old: true, ls: { um_tombs: JSON.stringify({ visits: { vBack: CLOCK - 20 * DAY } }) } });
  await M.boot('Mariam', 'rep');
  const v122 = await M.ev(() => ({ shows: visits.some(v => v && v.id === 'vBack') }));
  // this morning, no signal, still on v122: she removes a task and logs a visit
  mode.offline.add('Q11b-M');
  await M.ev(async () => { await deleteTask('tDone'); });
  await fill(M, { clinicId: 'c1', docId: 'd1', note: 'logged with no signal on v122' });
  await M.ev(async () => { await saveVisit(); });
  const q122 = await M.ev(() => outboxList());
  // the app updates to v123 and opens with signal
  mode.offline.delete('Q11b-M');
  M.setVer('v123');
  await M.boot('Mariam', 'rep');
  await M.tick(); await M.tick();
  const arch = (parse(cloud['visitsArch:2026-10']) || []).map(v => v.id);
  const log = parse(cloud.tombs) || {};
  const m = await M.ev(() => ({ shows: visits.some(v => v && v.id === 'vBack'), outbox: outboxList() }));
  check('Q11b.1 (v122 queue uploaded by v123 at its first start) the October visit brought back from the recycle bin is still in the cloud and not in the delete log',
    arch.includes('vBack') && !((log.visits || {}).vBack), { v122Shows: v122.shows, v122Queue: q122, octoberArchive: arch, logVisits: log.visits, mariam: m, liveVisits: (parse(cloud.visits) || []).map(v => v.notes) });
  const S = await W.mkPhone('Q11b-S'); await S.boot('Dr. Ghaith', 'supervisor');
  const sSees = await S.ev(() => visits.some(v => v && v.id === 'vBack'));
  check('Q11b.2 the supervisor\'s phone still shows that visit', sSees, { supervisorSees: sSees });
  await M.ctx.close(); await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
