// P6: a refresh on Mariam's phone reads the visits (the supervisor's correction
// of V1 is in them), then — while a slower read of the same refresh (the sales
// index) is still on its way — she ticks a task, so the refresh keeps the
// lists on screen ("a save ran while it read"). Her screen still shows V1's
// old notes; the visits' merge base has moved to the corrected copy. She logs
// another visit within the next 20 seconds. Does the supervisor's correction
// of V1 survive in the cloud?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9163);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const DAY = 86400000;
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const visit = (id, extra) => Object.assign({ id, clinicId: 'c1', rep: 'Mariam', date: '2026-11-12', ts: CLOCK - DAY, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'original notes' }, extra || {});
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] }]);
  cloud.visits = JSON.stringify([visit('V1')]);
  cloud.tasks = JSON.stringify([{ id: 't1', text: 'call back', done: false, created: '2026-11-12', rep: 'Mariam' }]);
  cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
const fill = (ph, o) => ph.ev(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId); document.getElementById('visitNotes').value = o.note; }, o);
(async () => {
  await W.start();
  seed();
  const A = await W.mkPhone('P6-A'), S = await W.mkPhone('P6-S');
  await A.boot('Mariam', 'rep'); await S.boot('Dr. Ghaith', 'supervisor');
  await S.ev(async () => { const v = visits.find(x => x.id === 'V1'); v.notes = 'corrected by the supervisor'; await persist('visits'); });
  // Mariam's 20-second refresh: the sales index answers slowly
  mode.slowGet.erpSales = 2500;
  const tick = A.ev(async () => { await window.__bgTick(); });
  await A.page.waitForFunction(() => typeof _visitsLoaded === 'string' && _visitsLoaded.includes('corrected by the supervisor'), null, { timeout: 10000 });
  await A.ev(async () => { const t = tasks.find(x => x.id === 't1'); t.done = true; await persist('tasks'); }); // she ticks a task meanwhile
  await tick;
  const mem = await A.ev(() => (visits.find(v => v.id === 'V1') || {}).notes);
  // within the next 20 seconds she logs a visit
  await fill(A, { clinicId: 'c1', docId: 'd1', note: 'next visit' });
  await A.ev(async () => { await saveVisit(); });
  const v1 = (parse(cloud.visits) || []).find(v => v.id === 'V1') || {};
  check('P6. a refresh that kept the screen\'s lists (a save ran while it read) never lets the next visit save undo another phone\'s correction',
    v1.notes === 'corrected by the supervisor', { v1OnHerScreenAfterRefresh: mem, v1NotesInCloudAfterHerSave: v1.notes, visitsInCloud: (parse(cloud.visits) || []).length });
  await A.ctx.close(); await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
