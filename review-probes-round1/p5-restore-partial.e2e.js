// P5: v123's whole-day Restore "keeps the data as it is now as today's backup"
// before it replaces anything — taken from the phone's memory. On the
// supervisor's laptop whose read of the visits failed at start (slow
// connection, no copy on it yet), memory holds no visits. He restores
// yesterday's backup (no backup today yet, so no full-backup step). Are the
// reps' visits of this morning still anywhere afterwards?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9161);
const CLOCK = new Date('2026-11-13T11:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const visit = (id, rep, date, notes) => ({ id, clinicId: 'c1', rep, date, ts: new Date(date + 'T09:00:00').getTime(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes });
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [] }, { id: 'c2', name: 'Hilal Dental Center', rep: 'Renova', cls: 'B', doctors: [] }]);
  cloud.visits = JSON.stringify([visit('vY', 'Mariam', '2026-11-12', 'yesterday'), visit('vT1', 'Mariam', '2026-11-13', 'this morning, Mariam'), visit('vT2', 'Renova', '2026-11-13', 'this morning, Renova')]);
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud['snap_2026-11-12'] = JSON.stringify({ clinics: parse(cloud.clinics), products: [], visits: [visit('vY', 'Mariam', '2026-11-12', 'yesterday')], tasks: [], ts: '2026-11-12T17:00:00.000Z' });
}
(async () => {
  await W.start();
  seed();
  const S = await W.mkPhone('P5-S');
  mode.hang.add('visits');      // the live month's read never answers (the app gives up after 8 s)
  await S.boot('Dr. Ghaith', 'supervisor');
  const st = await S.ev(() => ({ failed: !!_loadFailed.visits, onScreen: visits.length }));
  await S.ev(async () => { window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; await restoreSnapshot('2026-11-12'); });
  const asked = await S.ev(() => window.__asked);
  const live = (parse(cloud.visits) || []).map(v => v.id);
  const kept = ((parse(cloud['snap_2026-11-13']) || {}).visits || []).map(v => v.id);
  const lost = ['vT1', 'vT2'].filter(id => !live.includes(id) && !kept.includes(id));
  check('P5. a whole-day Restore on a phone whose visits did not load: this morning\'s visits are either kept in today\'s backup or not touched (the restore refuses)',
    lost.length === 0, { visitsReadFailedAtStart: st.failed, visitsOnScreen: st.onScreen, confirmText: asked[0], liveVisitsAfter: live, keptAsTodaysBackup: kept, lostEverywhere: lost });
  await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
