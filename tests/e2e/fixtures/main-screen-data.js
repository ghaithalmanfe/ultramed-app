// Invented data for the main-screen harnesses (main-screen.e2e.js, main-screen-cases.e2e.js):
// 3 people, 17 clinics, 12 months of sales lines (Nov 2025 – 8 Oct 2026), two months of visits,
// the DSR targets of each month. Every clinic, salesman, product and document number is made
// up; nothing here comes from the company's files.
//   seed(cloud, opts) fills a fake cloud; with no option it is the main harness's data.
//   opts (each optional):
//     noOctober         no October sales file (a month no file covers yet)
//     renovaNotInFiles  the October file holds no line of Renova's and does not know her salesman
//     renovaNew         her first month: the files before October hold no line of hers
//     cross             two invoices on another rep's clinic this month (Renova's salesman at Harbor, Mariam's at Mira)
//     negBrand          Mariam's Curaprox this month is a return (-123.45 KD)
//     noErp             no sales file at all
//     noSell            the supervisor does not sell (sells: false)
//     extraRep          a fourth person (a rep) by that name
//     extraClinics      more clinics (records)
//     noTargets         nobody has a target this month
//     visitsOnly        Renova's target is visits only
//     staleTarget       Mariam's target is September's
//     yearVisits        a year of visits (Nov 2025 – 8 Oct 2026), not two months
//     jointRenovaMariam a joint visit on 7 Oct led by Renova, with Mariam, that took a 777 KD order
//     extraVisits       more visits (records)
//     teamTask          a task for the whole team
//     ghaithPlan        the supervisor's own plan today (Hilal)
//     missed            plans of 6 Oct that were never visited (Mariam: Pearl, Renova: Coral)
//   setFiles(cloud, periods, repMapGlobal) replaces the sales files; filePeriods() = the 12 files as periods.
const path = require('path');
const { WWW } = require('../_env.js');
const core = require(path.join(WWW, 'js/core.js'));

const G = 'Dr. Ghaith', M = 'Mariam', R = 'Renova';
const SM = { [M]: 'Mariam Example', [R]: 'Renova Example', [G]: 'Ghaith Example' };
const repMap = { [SM[M]]: M, [SM[R]]: R, [SM[G]]: G };
const CL = [['m1', 'Harbor', M, 'A'], ['m2', 'Opal', M, 'A'], ['m3', 'Willow', M, 'B'], ['m4', 'Cedar', M, 'B'], ['m5', 'Pearl', M, 'C'], ['m6', 'Lagoon', M, 'B'],
  ['r1', 'Mira', R, 'A'], ['r2', 'Jasmine', R, 'A'], ['r3', 'Dune', R, 'B'], ['r4', 'Falcon', R, 'B'], ['r5', 'Coral', R, 'C'], ['r6', 'Marina', R, 'B'],
  ['g1', 'Hilal', G, 'A'], ['g2', 'Summit', G, 'A'], ['g3', 'Oasis', G, 'B'], ['g4', 'Noor', G, 'C']]
  .concat([['r7', 'Lotus', R, 'B']])
  .map(([id, w, rep, cls]) => ({ id, name: w + ' Sample Dental Clinic', rep, cls }));
const PROD = [['Intensiv', 'Intensiv Ortho-Strips', 38], ['Intensiv', 'Intensiv Swingle Handpiece', 145], ['TePe', 'TePe Interdental Brush Pack', 9], ['TePe', 'TePe Angle Brush', 7.5],
  ['Philips', 'Philips Sonicare 4100', 21], ['Philips', 'Philips Zoom Kit', 96], ['Curaprox', 'Curaprox CS 5460', 3.2], ['Curaprox', 'Curaprox Perio Plus', 6.4]];
function rng(seed){ let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
function monthRows(month, lastDay, rand){
  const rows = []; let n = 0;
  for(let d = 1; d <= lastDay; d++){
    const date = month + '-' + String(d).padStart(2, '0'), dow = new Date(date + 'T00:00:00').getDay();
    if(dow === 5 || dow === 6) continue;                                   // Fri, Sat: the weekend
    for(let i = 0; i < 90; i++){
      const who = rand(), rep = who < 0.42 ? M : who < 0.8 ? R : G, mine = CL.filter(c => c.rep === rep);
      const c = mine[Math.floor(rand() * rand() * mine.length)];          // each person's first clinics buy most
      if(month === '2026-10' && (c.id === 'm4' || c.id === 'r4')) continue; // two clinics stop buying in October
      if(c.id === 'g2' || c.id === 'r7') continue;                        // an A clinic that never buys (an opportunity); a clinic whose first invoice comes this month (below)
      const p = PROD[Math.floor(rand() * PROD.length)], qty = 1 + Math.floor(rand() * 4), net = Math.round(p[2] * qty * 13) / 100;   // a realistic month against the targets
      rows.push([date, 'SINV' + month.replace('-', '').slice(2) + '-' + (++n), 0, p[1], qty, net, net, 0, SM[rep], p[0], c.name, 'Clinics', 0, '']);   // an invented document number
    }
  }
  if(month === '2026-10') rows.push(['2026-10-06', 'SINV2610-new', 0, 'Philips Zoom Kit', 3, 288, 288, 0, SM[R], 'Philips', 'Lotus Sample Dental Clinic', 'Clinics', 0, '']);   // a new customer this month
  return rows;
}
const rand = rng(20261008);
const files = MONTHS.map(m => { const last = m === '2026-10' ? 8 : new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); return { m, last, rows: monthRows(m, last, rand) }; });
const LINES = files.reduce((s, f) => s + f.rows.length, 0);
const brands = t => ({ Intensiv: Math.round(t * 0.42), TePe: Math.round(t * 0.14), Philips: Math.round(t * 0.34), Curaprox: Math.round(t * 0.10) });
const tg = (rev, month) => ({ revenue: rev, month, brands: brands(rev) });
const SEEDS = { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true };
function seed(cloud, opts){
  opts = opts || {};
  const notHers = f => Object.assign({}, f, { rows: f.rows.filter(r => r[8] !== SM[R]), repMap: { [SM[M]]: M, [SM[G]]: G } });
  let use = files.filter(f => !opts.noOctober || f.m !== '2026-10').map(f => (opts.renovaNotInFiles && f.m === '2026-10') || (opts.renovaNew && f.m < '2026-10') ? notHers(f) : f);
  if(opts.cross) use = use.map(f => f.m !== '2026-10' ? f : Object.assign({}, f, { rows: f.rows.concat([
    ['2026-10-05', 'SINV2610-x1', 0, 'TePe Angle Brush', 2, 77.5, 77.5, 0, SM[R], 'TePe', 'Harbor Sample Dental Clinic', 'Clinics', 0, ''],
    ['2026-10-06', 'SINV2610-x2', 0, 'Philips Zoom Kit', 1, 96.25, 96.25, 0, SM[M], 'Philips', 'Mira Sample Dental Clinic', 'Clinics', 0, '']]) }));
  if(opts.negBrand) use = use.map(f => f.m !== '2026-10' ? f : Object.assign({}, f, { rows: f.rows.filter(r => !(r[8] === SM[M] && r[9] === 'Curaprox')).concat([
    ['2026-10-07', 'SRET2610-n1', 0, 'Curaprox CS 5460', -40, -123.45, -123.45, 0, SM[M], 'Curaprox', 'Harbor Sample Dental Clinic', 'Clinics', 0, '']]) }));
  const split = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: opts.renovaNotInFiles ? { [SM[M]]: M, [SM[G]]: G } : repMap, seeds: SEEDS,
    periods: use.map(f => ({ id: 'f' + f.m, from: f.m + '-01', to: f.m + '-' + String(f.last).padStart(2, '0'), net: Math.round(f.rows.reduce((s, r) => s + r[6], 0) * 100) / 100, rowCount: f.rows.length,
      importedAt: f.m + '-' + String(Math.min(f.last, 28)).padStart(2, '0') + 'T08:00:00.000Z', repMap: f.repMap || repMap, rev: 1, rows: f.rows })) });
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  if(!opts.noErp){
    cloud.erpSales = JSON.stringify(split.index);
    Object.keys(split.docs).forEach(k => { cloud[k] = JSON.stringify(split.docs[k]); });
  }
  cloud.erpMap = '{}';
  const sup = { name: G, role: 'supervisor', email: 'ghaith@example.com' }; if(opts.noSell) sup.sells = false;
  const staff = [{ name: M, role: 'rep', email: 'mariam@example.com' }, { name: R, role: 'rep', email: 'renova@example.com' }, sup];
  if(opts.extraRep) staff.push({ name: opts.extraRep, role: 'rep', email: 'extra@example.com' });
  cloud.staff = JSON.stringify(staff);
  const fu = { m2: '2026-10-05', m3: '2026-10-08', r2: '2026-10-01', r3: '2026-10-07', g3: '2026-10-12', m6: '2026-09-28' };
  cloud.clinics = JSON.stringify(CL.map(c => Object.assign({}, c, { market: 'A', phone: '', notes: '', nextFollowUp: fu[c.id] || null,
    doctors: [{ id: c.id + 'd1', name: 'Dr. Example ' + c.id.toUpperCase(), title: 'Dentist' }, { id: c.id + 'd2', name: 'Dr. Example ' + c.id.toUpperCase() + ' B', title: 'Dentist' }] })).concat(opts.extraClinics || []));
  const hist = {}; MONTHS.slice(0, -1).forEach((m, i) => { hist[m] = { [M]: tg(7000 + i * 150, m), [R]: tg(6500 + i * 120, m), [G]: tg(3000 + i * 60, m) }; });
  const T = { [M]: Object.assign(tg(9000, '2026-10'), { visits: 80 }), [R]: tg(8000, '2026-10'), [G]: tg(4000, '2026-10'), _history: hist };
  if(opts.noTargets){ delete T[M]; delete T[R]; delete T[G]; }
  if(opts.visitsOnly) T[R] = { revenue: 0, visits: 60, month: '2026-10' };
  if(opts.staleTarget) T[M].month = '2026-09';
  cloud.targets = JSON.stringify(T);
  const visits = []; let vn = 0; const vr = rng(77);
  (opts.yearVisits ? MONTHS : ['2026-09', '2026-10']).forEach(m => { const last = m === '2026-10' ? 8 : new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
    for(let d = 1; d <= last; d++){ const date = m + '-' + String(d).padStart(2, '0'), dow = new Date(date + 'T00:00:00').getDay(); if(dow === 5 || dow === 6) continue;
      [M, R, G].forEach(rep => { const mine = CL.filter(c => c.rep === rep), k = rep === G ? (vr() < 0.5 ? 1 : 0) : 3 + Math.floor(vr() * 3);
        for(let i = 0; i < k; i++){ const c = mine[Math.floor(vr() * mine.length)], order = vr() < 0.3, total = order ? Math.round(40 + vr() * 260) : 0;
          if(date === '2026-10-08' && c.id === 'm1') continue;               // today's first planned clinic is not visited yet
          visits.push({ id: 'v' + (++vn), clinicId: c.id, rep, withRep: null, date, ts: new Date(date + 'T09:00:00').getTime() + i * 3600000, products: ['p1'], orderTaken: order,
            orders: order ? [{ id: 'o' + vn, items: [], total, net: total, gross: total, discountPct: 0 }] : [], orderItems: [], orderGross: total, orderDiscount: 0, orderTotal: total,
            doctorId: c.id + 'd1', doctorIds: [c.id + (i % 2 ? 'd2' : 'd1')], nextFollowUp: null, notes: '', noOrderReason: order ? '' : 'Stock still available' }); } }); } });
  visits.push({ id: 'vtoday', clinicId: 'm3', rep: M, withRep: null, date: '2026-10-08', ts: new Date('2026-10-08T08:30:00').getTime(), products: ['p1'], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorId: 'm3d1', doctorIds: ['m3d1'], notes: 'today', noOrderReason: 'Stock still available' });
  // joint visits this month: Dr. Ghaith on two of Mariam's visits and one of Renova's — one record each, counted once for the team
  [[M, '2026-10-05'], [M, '2026-10-06'], [R, '2026-10-07']].forEach(([rep, date]) => { const v = visits.find(x => x.rep === rep && x.date === date && !x.withRep); if(v) v.withRep = G; });
  if(opts.jointRenovaMariam) visits.push({ id: 'vjoint', clinicId: 'r1', rep: R, withRep: M, date: '2026-10-07', ts: new Date('2026-10-07T11:00:00').getTime(), products: ['p1'], orderTaken: true,
    orders: [{ id: 'oj', items: [], total: 777, net: 777, gross: 777, discountPct: 0 }], orderItems: [], orderGross: 777, orderDiscount: 0, orderTotal: 777, doctorId: 'r1d1', doctorIds: ['r1d1'], notes: '', noOrderReason: '' });
  (opts.extraVisits || []).forEach(v => visits.push(v));
  cloud.visits = JSON.stringify(visits);
  const tasks = [{ id: 't1', text: 'Send the brush price list', rep: M, dueDate: '2026-10-08', done: false, created: '2026-10-06' }, { id: 't2', text: 'Confirm the demo date', rep: R, dueDate: '2026-10-07', done: false, created: '2026-10-05' }];
  if(opts.teamTask) tasks.push({ id: 't3', text: 'Bring the new catalog', rep: 'Team', dueDate: '2026-10-08', done: false, created: '2026-10-06' });
  cloud.tasks = JSON.stringify(tasks);
  cloud.events = '[]';
  const plans = { '2026-10-08': { [M]: [{ id: 'm1', note: '', at: new Date('2026-10-07T18:00:00').getTime() }, { id: 'm3', note: '', at: new Date('2026-10-07T18:00:00').getTime() }], [R]: [{ id: 'r1', note: '', at: new Date('2026-10-07T18:05:00').getTime() }] } };
  if(opts.ghaithPlan) plans['2026-10-08'][G] = [{ id: 'g1', note: '', at: new Date('2026-10-07T18:10:00').getTime() }];
  if(opts.missed) plans['2026-10-06'] = { [M]: [{ id: 'm5', note: 'bring samples', at: 1 }], [R]: [{ id: 'r5', note: '', at: 1 }] };
  cloud.dayPlans = JSON.stringify(plans);
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.benchmarks = JSON.stringify({ coverage: 70, priority: 90, conversion: 25, tasks: 85 });
}
// The sales files as periods (fresh copies of their rows), and a way to save another set of them.
const filePeriods = () => files.map(f => ({ id: 'f' + f.m, from: f.m + '-01', to: f.m + '-' + String(f.last).padStart(2, '0'), rows: f.rows.map(r => r.slice()) }));
function setFiles(cloud, periods, repMapGlobal){
  Object.keys(cloud).filter(k => /^erpRows:/.test(k)).forEach(k => delete cloud[k]);
  const split = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: repMapGlobal || repMap, seeds: SEEDS,
    periods: periods.map((f, i) => ({ id: f.id || ('f' + i), from: f.from, to: f.to, net: Math.round(f.rows.reduce((s, r) => s + r[6], 0) * 100) / 100, rowCount: f.rows.length,
      importedAt: f.importedAt || (f.to + 'T08:00:00.000Z'), repMap: f.repMap || repMap, rev: 1, rows: f.rows })) });
  cloud.erpSales = JSON.stringify(split.index);
  Object.keys(split.docs).forEach(k => { cloud[k] = JSON.stringify(split.docs[k]); });
}
// change the saved targets: f(targets)
const setTargets = (cloud, f) => { const t = JSON.parse(cloud.targets); f(t); cloud.targets = JSON.stringify(t); };
module.exports = { core, G, M, R, SM, repMap, CL, PROD, rng, MONTHS, monthRows, files, LINES, brands, tg, seed, filePeriods, setFiles, setTargets };
