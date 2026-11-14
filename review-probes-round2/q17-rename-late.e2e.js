// Q17: a rename (Admin → Team) whose team-list save gets no answer in time
// (12 s) but lands in the cloud later — after the supervisor closed the app.
// The other lists are renamed only by the late landing's onLate, in that
// session. After he reopens: is anything left half-renamed?
const { makeWorld } = require('./_w2.js');
const PORT = +(process.env.PORT || 9733);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [] }, { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = JSON.stringify({ Renova: { revenue: 12000, month: '2026-11' } });
  cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  seed();
  const S = await W.mkPhone('Q17-S'); await S.boot('Dr. Ghaith', 'supervisor');
  mode.slowWrite.staff = 16000; // the team list's write lands 16 s later (a slow link)
  const p = S.ev(async () => { const idx = staff.findIndex(s => s.name === 'Renova'); openStaffForm(idx); await new Promise(r => setTimeout(r, 200));
    document.getElementById('sfName').value = 'Renova K.'; await saveStaff(idx); return window.__toasts.slice(); }).catch(e => 'page closed: ' + e.message);
  await S.page.waitForTimeout(13500);       // "no answer yet" said; he closes the app
  const toastsBefore = await S.ev(() => window.__toasts.slice()).catch(() => null);
  await S.page.goto('about:blank');
  await S.page.waitForTimeout(4000);         // the write lands meanwhile
  const staffNames = (parse(cloud.staff) || []).map(s => s.name);
  await S.boot('Dr. Ghaith', 'supervisor');  // he opens the app again
  const st = await S.ev(() => ({ team: staff.map(s => s.name), reps: REPS.slice(), renovaClinics: clinics.filter(c => c.rep === 'Renova').length, renovaKClinics: clinics.filter(c => c.rep === 'Renova K.').length, targets: Object.keys(targets) }));
  check('Q17. a rename whose team-list save landed only after the app was closed leaves nothing half-renamed (her clinics and target follow her new name)',
    st.renovaKClinics === 1 && st.targets.includes('Renova K.'), { toastsBeforeClose: toastsBefore, cloudTeamAfterLanding: staffNames, afterReopen: st, cloudClinics: (parse(cloud.clinics) || []).map(c => c.rep), cloudTargets: Object.keys(parse(cloud.targets) || {}) });
  await p.catch(() => {});
  await S.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
