// P3: an older app version still open after the release (the first open of
// every phone after a deploy runs the cached v122 — cache-first service worker).
//  a) v123 keeps deletes 120 days so an old phone copy cannot bring a record back.
//     A v122 phone that deletes anything rewrites the shared delete log with its
//     7-day cutoff; do the v123 phones then forget the older deletes, so a phone
//     that was offline for 10 days puts a task deleted 9 days ago back?
//  b) v123 never merges two same-name doctors by itself; the supervisor's
//     "Different people — keep both" is kept on the clinic. Does a supervisor
//     device still on v122 merge them anyway (and re-point the visits)?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9157);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const DAY = 86400000;
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const task = (id, text) => ({ id, text, done: false, created: '2026-11-01', rep: 'Mariam' });
function seed(extra){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }]);
  cloud.visits = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.tasks = JSON.stringify([task('tOld', 'deleted 9 days ago'), task('tKeep', 'open task'), task('tNew', 'deleted today on the old phone')]);
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  Object.assign(cloud, extra || {});
}
(async () => {
  await W.start();
  for(const withOld of [false, true]){
    seed();
    // Mariam's phone (v123) last had a connection before tOld was deleted: tOld is in its copy
    const C = await W.mkPhone('P3a-C' + (withOld ? '-old' : '')); await C.boot('Mariam', 'rep');
    mode.offline.add(C.label);
    await C.ev(async () => { tasks.push({ id: 'tC', text: 'added offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    // meanwhile: tOld was deleted 9 days ago (the shared log has it), tasks no longer hold it
    cloud.tasks = JSON.stringify((parse(cloud.tasks) || []).filter(t => t.id !== 'tOld'));
    cloud.tombs = JSON.stringify({ visits: {}, tasks: { tOld: CLOCK - 9 * DAY }, clinics: {}, events: {}, dayPlans: {}, doctors: {} });
    // Renova's phone (v123 phone, a v123 tab — or a v122 one: the first open after the deploy) deletes tNew today
    const R = await W.mkPhone('P3a-R' + (withOld ? '-old' : ''), { old: withOld }); await R.boot('Renova', 'rep');
    await R.ev(async () => { await deleteTask('tNew'); });
    await R.page.waitForTimeout(500);
    const log = parse(cloud.tombs) || {};
    // Mariam's phone is back online: its queue uploads
    mode.offline.delete(C.label);
    await C.tick(); await C.tick();
    const t = (parse(cloud.tasks) || []).map(x => x.id);
    check(`P3a [${withOld ? 'a v122 phone deleted something' : 'control: a v123 phone deleted it'}] a task deleted 9 days ago stays deleted when a phone that was offline 10 days uploads`,
      !t.includes('tOld') && t.includes('tC') && !t.includes('tNew'),
      { cloudTasks: t, sharedLogTasks: Object.keys(log.tasks || {}) });
    await C.ctx.close(); await R.ctx.close();
  }
  // b) two same-name doctors the supervisor marked "different people" on v123
  const docs = [{ id: 'd1', name: 'Dr. Ahmed', phone: '111' }, { id: 'd1b', name: 'dr ahmed', phone: '222', stage: 'warm' }];
  const v = { id: 'vD', clinicId: 'c1', rep: 'Mariam', date: '2026-11-12', ts: CLOCK - DAY, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['d1b'], doctorId: 'd1b', notes: 'met the second Dr. Ahmed' };
  seed({ clinics: JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: docs, distinctDoctors: ['d1|d1b'] }]), visits: JSON.stringify([v]) });
  const before = { clinics: cloud.clinics, visits: cloud.visits };
  const S = await W.mkPhone('P3b-S-old', { old: true }); await S.boot('Dr. Ghaith', 'supervisor');
  await S.page.waitForTimeout(800);
  const c1 = (parse(cloud.clinics) || [])[0] || {};
  const vv = (parse(cloud.visits) || [])[0] || {};
  check('P3b. a supervisor device still on v122 opens: the two doctors the supervisor kept apart on v123 stay two records, the visit keeps naming the second',
    (c1.doctors || []).length === 2 && JSON.stringify(vv.doctorIds) === '["d1b"]',
    { cloudDoctorsAfter: (c1.doctors || []).map(d => [d.id, d.phone, d.stage || null]), distinctDoctors: c1.distinctDoctors, visitDoctorIds: vv.doctorIds, clinicsWritten: cloud.clinics !== before.clinics, visitsWritten: cloud.visits !== before.visits });
  await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
