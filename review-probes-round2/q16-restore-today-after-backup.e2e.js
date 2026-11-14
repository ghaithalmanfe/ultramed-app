// Q16: restoring TODAY's backup now asks for a full backup to this device
// first, and accepts one taken within the last hour; the restore's question
// then says "the data as it is now is in the full backup you saved to this
// device". A rep logs a visit AFTER that full backup was taken (minutes
// later), then the supervisor restores today's backup.
// Is the rep's visit anywhere afterwards — the cloud, today's backup, the file?
const { makeWorld } = require('./_w2.js');
const fs = require('fs'), path = require('path'), os = require('os');
const PORT = +(process.env.PORT || 9731);
const CLOCK = new Date('2026-11-13T15:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
const TODAY = '2026-11-13', SNAP = 'snap_' + TODAY;
const good = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, name: 'Good clinic ' + i, rep: i % 2 ? 'Renova' : 'Mariam', cls: 'A', doctors: [{ id: 'dk' + i, name: 'Dr. K' + i }] }));
const broken = good.slice(0, 6).map(c => Object.assign({}, c, { name: 'Broken name ' + c.id }));
const visit = (id, clinicId, rep, notes, ts) => ({ id, clinicId, rep, date: TODAY, ts, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['d' + clinicId], notes });
const mv = visit('vMorning', 'k1', 'Renova', 'morning visit', CLOCK - 6 * 3600000);
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify(broken);
  cloud.visits = JSON.stringify([mv]);
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = '{}'; cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud[SNAP] = JSON.stringify({ clinics: good, products: [], visits: [mv], tasks: [], ts: TODAY + 'T05:00:00.000Z' }); // this morning's backup: the good copy
}
(async () => {
  await W.start();
  seed();
  const S = await W.mkPhone('Q16-S', { acceptDownloads: true }); await S.boot('Dr. Ghaith', 'supervisor');
  await S.ev(() => { try{ localStorage.setItem('um_snapDay', '2026-11-13'); }catch(e){} });
  // 1. he taps Restore on today's backup: asked for a full backup first
  await S.ev(async () => { await restoreSnapshot('2026-11-13'); });
  const asked = await S.ev(() => /full backup/i.test((document.getElementById('modalInner') || {}).textContent || ''));
  // 2. the full backup, read and downloaded
  const ready = await S.ev(async () => { await openFullBackup(); const t0 = Date.now(); while(Date.now() - t0 < 60000 && !document.querySelector('[data-backup-download], [data-backup-failed]')) await new Promise(r => setTimeout(r, 50)); return !!document.querySelector('[data-backup-download]'); });
  let file = null;
  if(ready){
    const [dl] = await Promise.all([S.page.waitForEvent('download', { timeout: 30000 }), S.page.click('[data-backup-download]')]);
    const p = path.join(os.tmpdir(), 'q16-backup.json'); await dl.saveAs(p); file = fs.readFileSync(p, 'utf8');
  }
  // 3. a few minutes later Renova logs a visit (her phone, v123)
  const R = await W.mkPhone('Q16-R'); await R.boot('Renova', 'rep');
  await R.ev(async () => { visits.push({ id: 'vAfternoon', clinicId: 'k3', rep: 'Renova', date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: ['dk3'], notes: 'afternoon visit, logged after the full backup' }); await persist('visits'); });
  const inCloudBefore = (parse(cloud.visits) || []).some(v => v.id === 'vAfternoon');
  // 4. he taps Restore again
  await S.ev(async () => { closeModal(); window.__asked = []; window.confirm = m => { window.__asked.push(String(m)); return true; }; window.__toasts = []; await restoreSnapshot('2026-11-13'); });
  const out = await S.ev(() => ({ asked: window.__asked.slice(), toasts: window.__toasts.slice() }));
  await R.tick(); await R.tick();
  const live = (parse(cloud.visits) || []).some(v => v.id === 'vAfternoon');
  const snap = ((parse(cloud[SNAP]) || {}).visits || []).some(v => v.id === 'vAfternoon');
  const inFile = !!file && file.includes('vAfternoon');
  const onRenova = await R.ev(() => visits.some(v => v && v.id === 'vAfternoon'));
  check('Q16. a visit logged after the full backup and before the restore of today\'s backup is kept somewhere (cloud, today\'s backup or the file the restore relies on)',
    live || snap || inFile || onRenova, { askedForFullBackup: asked, fullBackupDownloaded: ready && !!file, visitReachedCloudBeforeRestore: inCloudBefore,
      restoreQuestion: (out.asked[0] || '').slice(0, 420), toasts: out.toasts, afterRestore: { liveVisits: live, todaysBackup: snap, inFullBackupFile: inFile, onRenovasPhone: onRenova } });
  await S.ctx.close(); await R.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
