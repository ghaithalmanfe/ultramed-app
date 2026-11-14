// P9: the daily backup is written by the first phone that saves something that
// day (maybeSnapshot), from that phone's memory. It is skipped when a list came
// from the phone's own copy — but not when a read FAILED with no copy on the
// phone (a new phone, or one whose site data was cleared). Under the v123 rules
// no team phone can replace today's backup once it exists.
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9169);
const CLOCK = new Date('2026-11-13T08:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const TODAY = '2026-11-13', SNAP = 'snap_' + TODAY;
const visit = (id, rep, date, notes) => ({ id, clinicId: 'c1', rep, date, ts: new Date(date + 'T09:00:00').getTime(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes });
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [] }]);
  cloud.visits = JSON.stringify(Array.from({ length: 12 }, (_, i) => visit('v' + i, i % 2 ? 'Renova' : 'Mariam', '2026-11-' + String(2 + i).padStart(2, '0'), 'visit ' + i)));
  cloud.tasks = JSON.stringify([{ id: 't1', text: 'open task', done: false, created: '2026-11-10', rep: 'Mariam' }]);
  cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  seed();
  const A = await W.mkPhone('P9-A');
  mode.hang.add('visits');                       // her first read of this month's visits never answers (the app gives up after 8 s)
  await A.boot('Mariam', 'rep');
  const st = await A.ev(() => ({ failed: !!_loadFailed.visits, mirror: Object.keys(_mirrorUsed), onScreen: visits.length }));
  await A.ev(async () => { tasks.push({ id: 'tA', text: 'first save of the day', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
  await A.page.waitForTimeout(800);
  const snap = parse(cloud[SNAP]);
  check('P9. the day\'s backup is never written from a phone whose read of this month\'s visits failed (it would hold none of them)',
    !snap || (snap.visits || []).length === 12, { visitsReadFailed: st.failed, mirrorUsed: st.mirror, visitsOnScreen: st.onScreen, todaysBackupVisits: snap ? (snap.visits || []).length : null, cloudVisits: (parse(cloud.visits) || []).length });
  await A.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
