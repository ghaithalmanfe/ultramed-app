// Q19: accessLost() after a refused save reads 'staff' from the server with a
// 6-second limit. On a slow link that read does not answer in time: is the
// rules' refusal then taken for "no access (signed out?)", and does the
// change stay on the phone either way?
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9743);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [] }, { id: 'c2', name: 'Hilal Dental', rep: 'Mariam', cls: 'B', doctors: [] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  seed();
  const A = await W.mkPhone('Q19-A'); await A.boot('Mariam', 'rep');
  mode.deny = { re: /^dayPlans$/, ops: 'w', who: new Set(['Q19-A']) }; // the rules refuse this one document for her login
  mode.hang.add('staff');                                              // and the access check's read does not answer (slow link)
  const first = await A.ev(async () => { window.__toasts = []; const d = todayStr(); dayPlans[d] = { Mariam: [{ id: 'c2', note: '', at: Date.now() }] }; const r = await persistTold('dayPlans');
    return { outcome: r.outcome, toasts: window.__toasts.slice(), parked: [..._saveParked.entries()], queued: outboxHas('dayPlans') }; });
  await A.ev(() => { window.__toasts = []; });
  await A.tick();
  const next = await A.ev(() => ({ toasts: window.__toasts.slice(), parked: [..._saveParked.entries()], queued: outboxHas('dayPlans'), onPhone: /c2/.test(localStorage.getItem('um_mirror:dayPlans') || '') }));
  check('Q19. a refusal while the access check is slow: the plan stays on the phone, and what the screen says is true (she is signed in)',
    first.queued && next.queued && next.onPhone && !first.toasts.some(t => /signed out\?/.test(t)), { firstSave: first, nextRound: next });
  await A.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
