// P1b: a shared phone. Mariam's offline changes are uploading when she taps
// Sign out (the supervisor takes the phone). Requests sent after the sign-out
// carry no login, so the cloud refuses them (permission-denied) until the next
// person signs in. Does the rest of her queue survive and upload under the
// next login, as on v122?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9153);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
const fill = (ph, o) => ph.ev(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId); document.getElementById('visitNotes').value = o.note; }, o);
(async () => {
  await W.start();
  seed();
  const P = await W.mkPhone('P1b'); await P.boot('Mariam', 'rep');
  mode.offline.add('P1b');
  await P.ev(async () => { tasks.push({ id: 'tP1b', text: 'P1b task logged offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
  await fill(P, { clinicId: 'c1', docId: 'd1', note: 'P1b visit logged offline' });
  await P.ev(async () => { await saveVisit(); });
  const q = await P.ev(() => outboxList());
  mode.offline.delete('P1b');
  // signal back: the upload starts; the first list takes a few seconds (a slow office network)
  const first = q[0];
  mode.slowWrite[first] = 2500;
  const flush = P.ev(async () => { await flushOutbox(); });
  await P.page.waitForTimeout(600);
  // she signs out while it uploads; requests from now on carry no login
  await P.ev(() => { switchUser(); });
  mode.deny = { re: /.*/, ops: 'rw', who: new Set(['P1b']) };
  await flush.catch(() => {});
  const afterSignout = await P.ev(() => ({ outbox: outboxList(), aside: Object.keys(localStorage).filter(k => /^um_refused:/.test(k)) }));
  // the supervisor signs in on the same phone
  mode.deny = null;
  await P.ev(async () => { await selectUser('Dr. Ghaith', 'supervisor'); });
  await P.page.waitForTimeout(400);
  for(let i = 0; i < 3; i++) await P.tick();
  const visitInCloud = (parse(cloud.visits) || []).some(v => v.notes === 'P1b visit logged offline');
  const taskInCloud = (parse(cloud.tasks) || []).some(t => t.id === 'tP1b');
  const end = await P.ev(() => ({ outbox: outboxList(), visitOnScreen: visits.some(v => v && v.notes === 'P1b visit logged offline'), taskOnScreen: tasks.some(t => t && t.id === 'tP1b') }));
  check('P1b. a rep signs out on a shared phone while her offline changes upload: what had not uploaded yet stays queued and uploads under the next login (the visit and the task reach the cloud)',
    visitInCloud && taskInCloud, { queued: q, firstSlow: first, afterSignout, end, visitInCloud, taskInCloud });
  await P.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
