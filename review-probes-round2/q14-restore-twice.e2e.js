// Q14: two whole-day Restores of EARLIER days on the same day (the first day
// picked turns out to be damaged too). A clinic was added this morning, before
// either restore. The first restore keeps "the data as it is now" as today's
// backup (it holds the morning clinic). The second asks for a full backup to
// this device first (today has its backup now), then keeps "the data as it is
// now" as today's backup again — over the first restore's kept copy.
// Is the morning clinic still in the cloud anywhere the app can bring it back from?
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9727);
const CLOCK = new Date('2026-11-13T15:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const TODAY = '2026-11-13';
const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [] }));
const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id }));
const morning = { id: 'kMorning', name: 'New Smile Clinic (added this morning)', rep: 'Mariam', cls: 'B', doctors: [{ id: 'dm', name: 'Dr. Noor' }], isNew: true, addedOn: TODAY };
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify(broken.concat([morning]));
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud['snap_2026-11-12'] = JSON.stringify({ clinics: broken.slice(0, 3), products: [], visits: [], tasks: [], ts: '2026-11-12T05:00:00.000Z' }); // damaged already
  cloud['snap_2026-11-11'] = JSON.stringify({ clinics: good, products: [], visits: [], tasks: [], ts: '2026-11-11T05:00:00.000Z' });
}
const holders = () => Object.keys(cloud).filter(k => /^snap_/.test(k) && ((parse(cloud[k]) || {}).clinics || []).some(c => c && c.id === 'kMorning'))
  .concat(((parse(cloud.clinics) || []).some(c => c && c.id === 'kMorning')) ? ['clinics'] : []);
(async () => {
  await W.start();
  seed();
  const S = await W.mkPhone('Q14'); await S.boot('Dr. Ghaith', 'supervisor');
  await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} });
  await S.ev(async () => { window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; window.__toasts = []; await restoreSnapshot('2026-11-12'); });
  const first = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice() }));
  const afterFirst = holders();
  // the first day was damaged too: restore the day before
  await S.ev(async () => { window.__asked = []; window.__toasts = []; await restoreSnapshot('2026-11-11'); });
  const modal = await S.ev(() => (document.getElementById('modalInner') || {}).textContent || '');
  await S.ev(() => { _fullBackupSavedAt = Date.now(); closeModal(); }); // he downloads the full backup, as asked
  await S.ev(async () => { window.__asked = []; window.__toasts = []; await restoreSnapshot('2026-11-11'); });
  const second = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice() }));
  const afterSecond = holders();
  const missing = await S.ev(() => { try{ const snaps = {}; Object.keys(localStorage); return null; }catch(e){ return null; } });
  check('Q14. after two restores of earlier days, the clinic added this morning is still in the cloud (live list or a daily backup) for "Find missing clinics"',
    afterSecond.length > 0, { firstAsked: (first.asked[0] || '').slice(0, 220), firstToasts: first.toasts, heldAfterFirst: afterFirst,
      secondModal: modal.slice(0, 200), secondAsked: (second.asked[0] || '').slice(0, 260), secondToasts: second.toasts, heldAfterSecond: afterSecond,
      todaysBackup: ((parse(cloud['snap_' + TODAY]) || {}).clinics || []).length + ' clinics, keptBeforeRestore ' + (parse(cloud['snap_' + TODAY]) || {}).keptBeforeRestore });
  await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
