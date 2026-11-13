// Invented data for the management dashboard harness (exec-dashboard.e2e.js):
// three sellers — Mariam and Renova with DSR targets, Dr. Ghaith who sells and
// has none — 30 clinics, a sales file for each of July, August, September and
// October 2026 (October runs to the 8th, "today" in the harness) and one for
// October 2025, visits and follow-ups. Nothing real: every name, invoice
// number and amount is made up, and the same file comes out on every run.
//
// Packed line, as the app stores it:
//   [date, invoice, type 0 invoice | 1 return, product, qty, gross, net, return, salesman, brand, customer, class, discount on return, the invoice a return refers to]
//
// `expected` is added up here, line by line, without the app's code: what each
// person invoiced in each month (a clinic is always invoiced by its owner's
// salesman in this file, so the owner rule and the salesman agree), per brand
// and per account. The harness holds the screen against these.
'use strict';

const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
const SALESMAN = { [M]: 'Mariam Sample', [R]: 'Renova Sample', [G]: 'Ghaith Al Sample' };
const REP_MAP = { 'Mariam Sample': M, 'Renova Sample': R, 'Ghaith Al Sample': G };
// product, the brand as the ERP writes it, unit price — two ERP spellings of one brand on purpose (the DSR calls it "Philips Sonicare")
const PRODUCTS = [
  ['Ortho Strips Sample Set', 'Intensiv', 42], ['Handpiece Sample 40L', 'Intensiv', 185], ['Sonic Brush Sample 4100', 'Philips Export BV', 49],
  ['Brush Heads Sample C3', 'Philips Sonicare', 11.5], ['Interdental Sample Mix', 'TePe', 3.25], ['Mini Flosser Sample', 'TePe', 2.4],
  ['Water Flosser Sample Cordless', 'WATERPIK', 35]];
const BRAND_KEY = { 'Intensiv': 'intensiv', 'Philips Export BV': 'philips', 'Philips Sonicare': 'philips', 'TePe': 'tepe', 'WATERPIK': 'waterpik' };
const WORDS = ['Amber', 'Birch', 'Cobalt', 'Dune', 'Ember', 'Fern', 'Garnet', 'Harbor', 'Indigo', 'Jasper', 'Kestrel', 'Lagoon', 'Maple', 'Nimbus', 'Opal',
  'Pebble', 'Quartz', 'Ripple', 'Saffron', 'Tundra', 'Umber', 'Velvet', 'Willow', 'Xylo', 'Yarrow', 'Zephyr', 'Aspen', 'Brook', 'Cedar', 'Delta'];
const KINDS = ['Dental Clinic', 'Dental Center', 'Smile Clinic', 'Dental Care'];
const CLS = ['A', 'B', 'A', 'C', 'B', 'D', 'A', 'B', 'C', 'F'];
const MONTHS = [['2025-10', 31], ['2026-07', 31], ['2026-08', 31], ['2026-09', 30], ['2026-10', 8]];   // October 2026: the file runs to the 8th
const TODAY = '2026-10-08';
const ONLINE = 'My Fatoorah', IGNORED = 'Marketing Samples Account', UNLINKED = 'Unlisted Trading Co';
const c2 = x => Math.round(x * 100) / 100;

function buildExecFixture(){
  let state = 20261008;
  const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  // 30 clinics: 12 Mariam, 11 Renova, 7 Dr. Ghaith; every first word is different, so no two form a branch family
  const clinics = WORDS.map((w, i) => {
    const rep = i % 30 < 12 ? M : i % 30 < 23 ? R : G;
    return { id: 'x-' + w.toLowerCase(), name: w + ' ' + KINDS[i % KINDS.length], rep, cls: CLS[i % CLS.length], doctors: [] };
  });
  const by = name => clinics.find(c => c.name.indexOf(name + ' ') === 0);
  // the clinics the checks name
  const under = by('Birch');        // Mariam: buys every month, and almost nothing in October → under-performing
  const potential = by('Quartz');   // Renova: never invoiced → high potential
  const newcomer = by('Nimbus');    // Renova: its first invoice ever is in October 2026 → a new customer
  const closed = by('Lagoon');      // Mariam: closed, never invoiced, an old follow-up that must not be listed
  under.cls = 'A'; potential.cls = 'A'; newcomer.cls = 'B'; closed.cls = 'Closed';
  const silent = new Set([potential.id, closed.id]);
  [['Amber', '2026-10-02'], ['Cobalt', '2026-10-05'], ['Maple', '2026-10-06'], ['Dune', TODAY], ['Opal', '2026-10-20'], ['Lagoon', '2026-10-01']]
    .forEach(([w, d]) => { by(w).nextFollowUp = d; });

  const rows = {};
  let inv = 41000;
  const line = (month, day, customer, salesman, p, qty, off, cls) => {
    const date = month + '-' + String(day).padStart(2, '0'), gross = c2(p[2] * qty), net = Math.round(gross * (1 - off) * 20) / 20;
    (rows[month] = rows[month] || []).push([date, 'SINV' + (++inv), 0, p[0], qty, gross, net, 0, salesman, p[1], customer, cls || 'Clinics', 0, '']);
    return rows[month][rows[month].length - 1];
  };
  MONTHS.forEach(([month, days]) => {
    clinics.forEach((c, i) => {
      if(silent.has(c.id)) return;
      if(c.id === newcomer.id && month !== '2026-10') return;
      if(month === '2025-10' && i % 3 === 0) return;                 // a year ago a third of them were not customers yet
      let n = 1 + Math.floor(rand() * 4);
      if(c.id === under.id) n = month === '2026-10' ? 1 : 5;
      else if(rand() < 0.18) return;                                 // skips a month now and then
      for(let k = 0; k < n; k++){
        const p = PRODUCTS[Math.floor(rand() * PRODUCTS.length)], qty = 1 + Math.floor(rand() * (p[2] > 100 ? 2 : 8));
        const day = c.id === under.id ? 1 + ((k * 2) % Math.min(days, 8)) : 1 + Math.floor(rand() * days);
        const one = c.id === under.id && month === '2026-10';
        line(month, day, c.name, SALESMAN[c.rep], one ? PRODUCTS[5] : c.id === under.id ? PRODUCTS[1] : p, one ? 2 : c.id === under.id ? 2 : qty, [0, 0, 0.1, 0.2][Math.floor(rand() * 4)]);
      }
    });
    // online, an account set to ignore, an account no clinic matches
    for(let k = 0; k < 3; k++) line(month, 1 + Math.floor(rand() * days), ONLINE, SALESMAN[M], PRODUCTS[2 + (k % 3)], 1 + k, 0, 'Online Customers');
    line(month, Math.min(days, 6), IGNORED, SALESMAN[M], PRODUCTS[4], 6, 0, 'Other Customers');
    line(month, Math.min(days, 7), UNLINKED, SALESMAN[R], PRODUCTS[6], 2, 0.1, 'Other Customers');
    // every salesman has a line on the file's last day, so each person's figure runs to that day
    [by('Amber'), by('Maple'), by('Yarrow')].forEach(c => line(month, days, c.name, SALESMAN[c.rep], PRODUCTS[3], 2, 0));
  });
  // a return in October of an October invoice: it stays in October
  const first = rows['2026-10'].find(r => r[10] === by('Cobalt').name) || line('2026-10', 3, by('Cobalt').name, SALESMAN[M], PRODUCTS[0], 2, 0);
  rows['2026-10'].push(['2026-10-07', 'SRT' + 5001, 1, first[3], -1, 0, -c2(first[6] / first[4]), c2(first[6] / first[4]), first[8], first[9], first[10], 'Clinics', 0, first[1]]);

  const periods = MONTHS.map(([month, days]) => ({ id: 'f' + month.replace('-', ''), from: month + '-01', to: month + '-' + String(days).padStart(2, '0'),
    net: c2(rows[month].reduce((s, r) => s + r[6], 0)), rowCount: rows[month].length, importedAt: month + '-28T08:00:00.000Z', repMap: REP_MAP, rev: 1, rows: rows[month] }));

  const targets = {
    [M]: { revenue: 9000, month: '2026-10', brands: { Intensiv: 3000, 'Philips Sonicare': 3500, TePe: 1500, Waterpik: 1000 } },
    [R]: { revenue: 7000, month: '2026-10', brands: { Intensiv: 2500, 'Philips Sonicare': 2500, TePe: 2000 } },
    _history: { '2026-09': { [M]: { revenue: 8500, brands: { Intensiv: 3000, 'Philips Sonicare': 3500 } }, [R]: { revenue: 6500 } }, '2026-08': { [M]: { revenue: 8000 } } } };

  // visits as the team would have logged them: field visits, one joint, a call and a phone order (neither is a field visit)
  let vn = 0;
  const visit = (date, rep, w, o) => Object.assign({ id: 'xv' + (++vn), ts: vn, date, rep, clinicId: by(w).id, doctorIds: [], products: [] }, o || {});
  const visits = [
    visit('2026-10-01', M, 'Amber', { orderTaken: true, orderTotal: 320 }), visit('2026-10-04', M, 'Birch'), visit('2026-10-05', M, 'Cobalt', { orderTaken: true, orderTotal: 145.5 }),
    visit('2026-10-06', M, 'Dune'), visit('2026-10-07', M, 'Ember'), visit('2026-10-06', M, 'Amber', { callOnly: true }),
    visit('2026-10-07', M, 'Fern', { orderOnly: true, orderTaken: true, orderTotal: 60 }),
    visit('2026-10-01', R, 'Maple', { orderTaken: true, orderTotal: 210 }), visit('2026-10-04', R, 'Nimbus'), visit('2026-10-05', R, 'Quartz'),
    visit('2026-10-06', R, 'Opal', { withRep: M }), visit('2026-10-05', G, 'Yarrow'), visit('2026-10-07', G, 'Zephyr', { orderTaken: true, orderTotal: 480 }),
    visit('2026-09-10', M, 'Amber', { orderTaken: true, orderTotal: 90 }), visit('2026-09-15', R, 'Quartz'), visit('2026-09-21', G, 'Aspen')];

  // what the files add up to, by plain arithmetic on the lines above
  const expected = {};
  MONTHS.forEach(([month]) => {
    const e = expected[month] = { byRep: { [M]: 0, [R]: 0, [G]: 0 }, byBrand: {}, byAccount: {}, ignored: 0, online: 0, total: 0 };
    rows[month].forEach(r => {
      const rep = REP_MAP[r[8]], cents = Math.round(r[6] * 100), b = BRAND_KEY[r[9]];
      e.byRep[rep] += cents; e.total += cents; e.byBrand[b] = (e.byBrand[b] || 0) + cents;
      if(r[10] === IGNORED) e.ignored += cents; else { e.byAccount[r[10]] = (e.byAccount[r[10]] || 0) + cents; if(r[10] === ONLINE) e.online += cents; }
    });
    const k = o => { Object.keys(o).forEach(x => { o[x] = o[x] / 100; }); return o; };
    k(e.byRep); k(e.byBrand); k(e.byAccount); e.ignored /= 100; e.online /= 100; e.total /= 100;
  });
  return { M, R, G, TODAY, repMap: REP_MAP, clinics, targets, visits, periods, erpMap: { [IGNORED]: '@ignore' }, expected,
    names: { under: under.name, potential: potential.name, newcomer: newcomer.name, closed: closed.name, online: ONLINE, ignored: IGNORED, unlinked: UNLINKED } };
}
module.exports = { buildExecFixture };
