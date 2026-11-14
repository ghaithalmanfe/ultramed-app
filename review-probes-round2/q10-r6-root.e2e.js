// Q10: R6 at its root. A task deleted 9 days ago on Renova's v123 phone (her
// phone keeps the delete); a phone still on v122 deletes another task and
// rewrites the shared log with its 7-day cutoff (the 9-day delete is dropped).
// Renova's phone just goes on refreshing (she deletes nothing more). Mariam's
// phone, offline since before the first delete, comes back and uploads its
// old copy of the tasks. Does the task deleted 9 days ago come back?
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9725);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const DAY = 86400000;
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const task = (id, text) => ({ id, text, done: false, created: '2026-11-01', rep: 'Mariam' });
const emptyLog = () => ({ visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} });
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }]);
  cloud.visits = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.tasks = JSON.stringify([task('tOld', 'deleted 9 days ago'), task('tKeep', 'open task'), task('tNew', 'deleted today on the old phone')]);
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  seed();
  // Mariam's phone (v123) last had a connection before tOld was deleted
  const C = await W.mkPhone('Q10-C'); await C.boot('Mariam', 'rep');
  mode.offline.add('Q10-C');
  await C.ev(async () => { tasks.push({ id: 'tC', text: 'added offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
  // 9 days ago Renova's v123 phone deleted tOld: the list lost it, the log has it, her phone keeps it
  cloud.tasks = JSON.stringify((parse(cloud.tasks) || []).filter(t => t.id !== 'tOld'));
  cloud.tombs = JSON.stringify(Object.assign(emptyLog(), { tasks: { tOld: CLOCK - 9 * DAY } }, { revived: {}, rev: 123 }));
  const R = await W.mkPhone('Q10-R', { ls: { um_tombs: JSON.stringify({ tasks: { tOld: CLOCK - 9 * DAY } }) } }); await R.boot('Renova', 'rep');
  // a phone still on v122 deletes tNew today (real v122 code: its log write keeps 7 days)
  const O = await W.mkPhone('Q10-O', { old: true }); await O.boot('Dr. Ghaith', 'supervisor');
  await O.ev(async () => { await deleteTask('tNew'); });
  await O.page.waitForTimeout(600);
  const logAfterOld = parse(cloud.tombs) || {};
  // Renova's phone refreshes as usual
  await R.tick(); await R.tick();
  const rHolds = await R.ev(() => ({ tombed: tombSet('tasks').has('tOld'), held: typeof _tombsHeld !== 'undefined' && _tombsHeld.tasks ? [..._tombsHeld.tasks] : null }));
  // Mariam's phone is back
  mode.offline.delete('Q10-C');
  await C.tick(); await C.tick();
  const t1 = (parse(cloud.tasks) || []).map(x => x.id);
  await R.tick(); await R.tick();
  const rAfter = await R.ev(() => ({ tombed: tombSet('tasks').has('tOld'), shows: tasks.some(t => t && t.id === 'tOld') }));
  const t2 = (parse(cloud.tasks) || []).map(x => x.id);
  check('Q10.1 the task deleted 9 days ago stays deleted when the phone that was offline uploads (the deleting phone, on v123, holds the delete)', !t1.includes('tOld'),
    { logAfterV122Write: Object.keys(logAfterOld.tasks || {}), logRevAfterV122Write: logAfterOld.rev, renovaHolds: rHolds, cloudTasksAfterUpload: t1 });
  check('Q10.2 the deleting phone never takes the deleted task back on its screen', !rAfter.shows, { renovaAfter: rAfter, cloudTasksLater: t2 });
  await C.ctx.close(); await R.ctx.close(); await O.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
