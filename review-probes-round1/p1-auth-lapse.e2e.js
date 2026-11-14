// P1: offline changes queued on a rep's phone, then the phone's sign-in session
// lapses (password changed on another device / login disabled / sign-out while
// the queue uploads): every request is refused with permission-denied for a
// while, then access is back. Does the queued work survive?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9151);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const TODAY = '2026-11-13';
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Ahmed' }] },
    { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [{ id: 'd2', name: 'Dr. Sara' }] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, month: '2026-11' } });
  cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
const fill = (ph, o) => ph.ev(o => { closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId); document.getElementById('visitNotes').value = o.note; }, o);
(async () => {
  await W.start();
  for(const variant of ['in-place re-sign-in', 'app reopened next day']){
    seed();
    const A = await W.mkPhone('P1-' + variant.slice(0, 3)); await A.boot('Mariam', 'rep');
    // 1. no signal in the field: a visit and a day-plan entry are kept on the phone and queued
    mode.offline.add(A.label);
    await fill(A, { clinicId: 'c1', docId: 'd1', note: 'P1 visit logged with no signal' });
    await A.ev(async () => { window.__toasts = []; await saveVisit(); });
    await A.ev(async () => { tasks.push({ id: 'tP1', text: 'P1 follow-up logged offline', done: false, created: todayStr(), rep: 'Mariam' }); await persist('tasks'); });
    const q = await A.ev(() => ({ outbox: outboxList(), toasts: window.__toasts.slice(), onScreen: visits.some(v => v && v.notes === 'P1 visit logged with no signal') }));
    // 2. signal is back, but this phone's session has lapsed: every request refused (permission-denied)
    mode.offline.delete(A.label);
    mode.deny = { re: /.*/, ops: 'rw', who: new Set([A.label]) };
    await A.ev(() => { window.__toasts = []; });
    await A.tick(); await A.tick();
    const during = await A.ev(() => ({ outbox: outboxList(), toasts: window.__toasts.slice(), onScreen: visits.some(v => v && v.notes === 'P1 visit logged with no signal'), aside: Object.keys(localStorage).filter(k => /^um_refused:/.test(k)) }));
    // 3. she signs in again (or the token is refreshed): access is back
    mode.deny = null;
    if(variant === 'app reopened next day'){ await A.boot('Mariam', 'rep'); }
    for(let i = 0; i < 3; i++) await A.tick();
    const after = await A.ev(() => ({ outbox: outboxList(), onScreen: visits.some(v => v && v.notes === 'P1 visit logged with no signal'), task: tasks.some(t => t && t.id === 'tP1') }));
    const inCloud = (parse(cloud.visits) || []).some(v => v.notes === 'P1 visit logged with no signal');
    const taskInCloud = (parse(cloud.tasks) || []).some(t => t.id === 'tP1');
    check(`P1 [${variant}] a visit and a task queued offline survive a lapsed sign-in session and upload once access is back`,
      q.outbox.includes('visits') && inCloud && taskInCloud && after.onScreen,
      { queuedFirst: q.outbox, toastsWhenQueued: q.toasts, duringLapse: during, afterAccessBack: after, visitInCloud: inCloud, taskInCloud });
    await A.ctx.close();
  }
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
