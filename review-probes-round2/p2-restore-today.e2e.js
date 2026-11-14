// P2: the whole-day Restore of TODAY's own backup (the usual case for a
// same-day incident: this morning's automatic backup is the good copy).
// v123 first keeps "today's data" as today's backup — which is the very backup
// being restored. Is this morning's good copy still in the cloud afterwards,
// and can the restore be done again if it fails half-way?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9155);
const CLOCK = new Date('2026-11-13T15:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const TODAY = '2026-11-13', SNAP = 'snap_' + TODAY;
const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [] }));
const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id, rep: 'Renova' }));
const visit = (id, clinicId, rep, notes) => ({ id, clinicId, rep, date: TODAY, ts: CLOCK - 7200000, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes });
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify(broken);                    // the incident this afternoon
  cloud.visits = JSON.stringify([visit('v1', 'k1', 'Renova', 'morning visit')]);
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  // this morning's automatic backup: the good list
  cloud[SNAP] = JSON.stringify({ clinics: good, products: parse(cloud.products), visits: [visit('v1', 'k1', 'Renova', 'morning visit')], tasks: [], ts: TODAY + 'T05:00:00.000Z' });
}
const snapClinics = () => ((parse(cloud[SNAP]) || {}).clinics || []);
(async () => {
  await W.start();
  // A — the restore works; is this morning's good copy still a backup?
  seed();
  const S = await W.mkPhone('P2a'); await S.boot('Dr. Ghaith', 'supervisor');
  await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} });
  await S.ev(async () => { await restoreSnapshot('2026-11-13'); });
  const liveA = (parse(cloud.clinics) || []).length, snapA = snapClinics();
  check('P2a. after restoring today\'s backup, this morning\'s good copy is still kept as a backup in the cloud',
    liveA === 20 && snapA.length === 20 && snapA.every(c => /^Good/.test(c.name)),
    { liveClinicsAfter: liveA, todaysBackupNowHolds: snapA.length + ' clinics, e.g. ' + (snapA[0] || {}).name, keptBeforeRestore: (parse(cloud[SNAP]) || {}).keptBeforeRestore });
  await S.ctx.close();

  // B — the connection drops right after the first step; the supervisor taps Restore again
  seed();
  const T = await W.mkPhone('P2b'); await T.boot('Dr. Ghaith', 'supervisor');
  await T.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} });
  mode.onWrite = (who, k) => { if(who === 'P2b' && k === SNAP){ mode.offline.add('P2b'); mode.onWrite = null; } };
  await T.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
  const t1 = await T.ev(() => window.__toasts.slice());
  mode.offline.delete('P2b');
  await T.tick(); await T.tick();
  await T.ev(async () => { window.__toasts = []; await restoreSnapshot('2026-11-13'); });
  const t2 = await T.ev(() => window.__toasts.slice());
  const live = parse(cloud.clinics) || [];
  check('P2b. a restore of today\'s backup that fails half-way can be done again: the second try brings back this morning\'s 20 good clinics',
    live.length === 20 && live.every(c => /^Good/.test(c.name)),
    { firstTry: t1, secondTry: t2, liveClinics: live.length, firstName: (live[0] || {}).name, todaysBackupHolds: snapClinics().length });
  await T.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
