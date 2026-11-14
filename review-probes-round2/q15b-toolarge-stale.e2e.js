// Q15: a queued list the cloud refuses for a phone that still has access is
// now kept and parked (v123 review, R1). While it is parked, does this phone
// still show the team's changes (the 20-second refresh)?
// Setup: Mariam's phone queues its day plan with no signal; when the signal
// is back the cloud refuses that one document for her login (reads still
// work) — e.g. rules published with a mistake, or MIN_APP_REV raised while
// this phone writes without rev (Q13). Meanwhile the supervisor renames a
// clinic and adds a task for her.
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9739);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }, { id: 'c2', name: 'Hilal Dental', rep: 'Mariam', cls: 'B', doctors: [] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  seed();
  const A = await W.mkPhone('Q15-A'); await A.boot('Mariam', 'rep');
  mode.offline.add('Q15-A');
  await A.ev(async () => { const d = todayStr(); dayPlans[d] = dayPlans[d] || {}; dayPlans[d].Mariam = [{ id: 'c2', note: 'x'.repeat(1100000), at: Date.now() }]; await persist('dayPlans'); });
  mode.offline.delete('Q15-A');
  await A.tick();
  const parked = await A.ev(() => ({ outbox: outboxList(), parked: typeof _saveParked !== 'undefined' ? [..._saveParked.entries()] : null, blocked: [..._saveBlocked], bar: (document.getElementById('tooLargeBar') || {}).textContent || null }));
  // the supervisor renames c1 and gives her a task
  const S = await W.mkPhone('Q15-S'); await S.boot('Dr. Ghaith', 'supervisor');
  await S.ev(async () => { const c = clinics.find(x => x.id === 'c1'); c.name = 'Dental 5 Clinic (Salmiya)'; await persist('clinics'); tasks.push({ id: 'tS', text: 'call Dr. Ahmed today', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
  const reads0 = mode.reads.filter(r => r === 'Q15-A|clinics').length;
  for(let i = 0; i < 6; i++) await A.tick(); // two minutes of refreshes
  const seen = await A.ev(() => ({ name: (clinics.find(x => x.id === 'c1') || {}).name, task: tasks.some(t => t && t.id === 'tS'), stuck: _stuckTicks }));
  const reads = mode.reads.filter(r => r === 'Q15-A|clinics').length - reads0;
  check('Q15b. while one list too large for the cloud waits on this phone, the phone still shows the team\'s changes within a few refreshes',
    seen.name === 'Dental 5 Clinic (Salmiya)' && seen.task, { parkedState: parked, afterSixTicks: seen, clinicReadsDuringSixTicks: reads });
  await A.ctx.close(); await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
