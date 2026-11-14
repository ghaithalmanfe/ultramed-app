// P8: Admin → Team, the supervisor renames "Renova" to "Ranova". The rename
// rewrites clinics, visits, tasks, plans, events, targets and the sales map,
// then saves the team list. v123 saves the team list by compare-and-set: if
// his laptop changed it a moment earlier (here: added a person), the team list
// is refused ("Changed on another device"). Are the other lists left renamed?
const { makeWorld } = require('./_world.js');
const PORT = +(process.env.PORT || 9167);
const CLOCK = new Date('2026-11-13T10:00:00').getTime();
const W = makeWorld(PORT, CLOCK);
const { cloud, mode, check, parse } = W;
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = W.twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Dental 5 Clinic', rep: 'Mariam', cls: 'A', doctors: [] }, { id: 'c2', name: 'Summit Dental Center', rep: 'Renova', cls: 'A', doctors: [] }]);
  cloud.visits = JSON.stringify([{ id: 'v1', clinicId: 'c2', rep: 'Renova', date: '2026-11-12', ts: CLOCK - 86400000, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'Renova visit' }]);
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.chat = '[]'; cloud.memories = '[]';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.products = JSON.stringify([{ id: 'p1', name: 'Test brush', brand: 'TEPE', price: 4 }]);
  cloud.targets = JSON.stringify({ Renova: { revenue: 12000, month: '2026-11' } });
  cloud.benchmarks = '{}'; cloud.categoryGuides = '{}'; cloud.erpNotes = '{}'; cloud.erpMap = '{}';
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: {}, returnPolicy: 'erp', seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
}
(async () => {
  await W.start();
  seed();
  const S = await W.mkPhone('P8-S'); await S.boot('Dr. Ghaith', 'supervisor');
  // his laptop added someone to the team a moment ago (this phone has not refreshed since)
  const st = parse(cloud.staff); st.push({ name: 'Noor', role: 'rep', email: 'noor@example.com' }); cloud.staff = JSON.stringify(st);
  const out = await S.ev(async () => {
    openAdminPanel(); setAdminTab('staff'); await new Promise(r => setTimeout(r, 50));
    const idx = staff.findIndex(s => s.name === 'Renova'); openStaffForm(idx); await new Promise(r => setTimeout(r, 30));
    document.getElementById('sfName').value = 'Ranova';
    window.__toasts = []; await saveStaff(idx); await new Promise(r => setTimeout(r, 100));
    return { toasts: window.__toasts.slice() };
  });
  const staffNames = (parse(cloud.staff) || []).map(s => s.name);
  const c2 = (parse(cloud.clinics) || []).find(c => c.id === 'c2') || {};
  const v1 = (parse(cloud.visits) || [])[0] || {};
  const tg = Object.keys(parse(cloud.targets) || {});
  check('P8. a rename whose team-list save is refused leaves nothing half-renamed (clinics, visits and targets keep the name the team list has)',
    staffNames.includes(c2.rep) && staffNames.includes(v1.rep) && tg.every(n => staffNames.includes(n) || n === '_history'),
    { toasts: out.toasts, teamListInCloud: staffNames, clinicOwner: c2.rep, visitRep: v1.rep, targetsFor: tg });
  // Renova signs in on her phone: are her clinic and her target hers?
  const R = await W.mkPhone('P8-R'); await R.boot('Renova', 'rep');
  const mine = await R.ev(() => ({ myClinics: clinics.filter(c => canViewClinic(c)).map(c => c.name), myTarget: !!(targets.Renova && targets.Renova.revenue) }));
  check('P8b. …and Renova (still "Renova" on the team list) still sees her clinic and her target', mine.myClinics.includes('Summit Dental Center') && mine.myTarget, mine);
  await S.ctx.close(); await R.ctx.close();
  await W.finish();
})().catch(e => { console.error(e); process.exit(1); });
