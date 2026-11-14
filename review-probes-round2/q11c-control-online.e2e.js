// Q11: a delete this phone made long ago on v122, of a record the team brought
// back since (v122 restores it ≥7 days after the delete: the deleting phone's
// v122 never prunes its own um_tombs entries older than 7 days). The phone
// updates to v123 (120-day tombstones) and opens with no signal; it removes a
// task and adds one, offline; then the signal is back.
// Does the record that was brought back stay — on this phone's screen, in the
// delete log, in the cloud's list, on the supervisor's phone?
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9737);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const DAY = 86400000;
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const task = (id, text, extra) => Object.assign({ id, text, done: false, created: '2026-10-20', rep: 'Mariam' }, extra || {});
const emptyLog = () => ({ visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} });
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }]);
  cloud.visits = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  // tBack: deleted on Mariam's phone 20 days ago, brought back 10 days ago (a whole-day restore on v122): in the list, not in the log
  cloud.tasks = JSON.stringify([task('tKeep', 'open task'), task('tBack', 'brought back by the supervisor 10 days ago')]);
  cloud.tombs = JSON.stringify(emptyLog()); // as v122 writes it: no rev, no revived
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  seed();
  // Mariam's phone, still on v122: its own delete of tBack 20 days ago is in its um_tombs
  const M = await W.mkPhone('Q11-M', { old: true, ls: { um_tombs: JSON.stringify({ tasks: { tBack: CLOCK - 20 * DAY } }) } });
  await M.boot('Mariam', 'rep');
  await M.tick(); await M.tick();
  const onV122 = await M.ev(() => ({ shows: tasks.some(t => t && t.id === 'tBack'), umTombs: localStorage.getItem('um_tombs') }));
  check('Q11.0 (setup, real v122 code) v122 shows the task brought back and keeps its own 20-day-old delete in um_tombs', onV122.shows && /tBack/.test(onV122.umTombs || ''), onV122);
  // the app updates to v123 on this phone; it opens in the field with no signal
  M.setVer('v123');
  await M.boot('Mariam', 'rep'); // (control: the first v123 start WITH signal, nothing queued)
  mode.offline.add('Q11-M');
  const offlineStart = await M.ev(() => ({ appRev: APP_REV, shows: tasks.some(t => t && t.id === 'tBack'), tombed: tombSet('tasks').has('tBack') }));
  check('Q11.1 v123, (control) opened with signal: the task the team brought back still shows', offlineStart.shows, offlineStart);
  // offline: she ticks off one task (removes it) and adds another
  await M.ev(async () => { await deleteTask('tKeep'); });
  await M.ev(async () => { tasks.push({ id: 'tNew', text: 'added in the field', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
  const queue = await M.ev(() => outboxList());
  // the signal is back
  mode.offline.delete('Q11-M');
  await M.tick(); await M.tick();
  const log = parse(cloud.tombs) || {};
  const cloudTasks = (parse(cloud.tasks) || []).map(t => t.id);
  const mAfter = await M.ev(() => ({ shows: tasks.some(t => t && t.id === 'tBack'), held: typeof _tombsHeld !== 'undefined' && _tombsHeld.tasks ? [..._tombsHeld.tasks] : null, outbox: outboxList() }));
  check('Q11.2 after the upload the delete log does not delete the task the team brought back again', !((log.tasks || {}).tBack), { queueWhenOffline: queue, logTasks: log.tasks, logRev: log.rev, logRevived: log.revived });
  check('Q11.3 after the upload the cloud\'s task list still holds the task the team brought back', cloudTasks.includes('tBack'), { cloudTasks, mariamAfter: mAfter });
  // the supervisor's phone (v123) opens and ticks off a task
  const S = await W.mkPhone('Q11-S'); await S.boot('Dr. Ghaith', 'supervisor');
  await S.ev(async () => { tasks.push({ id: 'tS', text: 'supervisor task', done: false, created: todayStr(), rep: 'Dr. Ghaith' }); await persist('tasks'); });
  await S.tick();
  const sSees = await S.ev(() => tasks.some(t => t && t.id === 'tBack'));
  const finalTasks = (parse(cloud.tasks) || []).map(t => t.id);
  check('Q11.4 the supervisor\'s phone still shows it, and after his next save the cloud still holds it', sSees && finalTasks.includes('tBack'), { supervisorSees: sSees, cloudTasksFinal: finalTasks });
  await M.ctx.close(); await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
