// The v126 speed work in core.js gives the very answers it gave before, on invented data the shape of a heavy year
// (tests/e2e/fixtures/heavy-year.js at a quarter of its size): each fast path against a straightforward reference.
//   - one pass's customer matcher (erpMatcher: each name matched once, the clinics' names normalized once) and
//     erpRowRep with it = matchCustomer / erpRowRep line by line
//   - the returns context kept per set of files (erpCtxOf) = returnContext of every line; built again when a file's
//     rows are replaced, a file is added or one stops loading
//   - normBrand, fmtDate (kept per text) = the formula
//   - unitSellPlan (the lines of a brand indexed per list) = the plan worked out over every line
//   - doctorAnalytics (each clinic's visits grouped once) = every visit looked at for every doctor
//   - matchCatalogProduct (a product's tokens kept beside it) = tokenized each time, and follows a rename
//   - monthlyTrend (one shared pass of the lines, each month's wins handed to the KPI scorecard) = without them
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const U = require(path.join(__dirname, '..', 'www', 'js', 'core.js'));
const F = require('./e2e/fixtures/heavy-year.js').build({ scale: 0.25 });

const parse = s => JSON.parse(s);
const clinics = parse(F.docs.clinics), erpMap = parse(F.docs.erpMap || '{}'), targets = parse(F.docs.targets);
const index = parse(F.docs.erpSales), chunks = {};
Object.keys(F.docs).filter(k => k.startsWith('erpRows:')).forEach(k => { chunks[k] = parse(F.docs[k]); });
const erpSales = U.erpAssemble(index, chunks).sales;
const vIdx = parse(F.docs.visitsIndex), arch = {};
Object.keys(vIdx.months || {}).forEach(m => { arch[m] = parse(F.docs[U.visitsArchKey(m)]); });
const visits = U.visitsAssemble(parse(F.docs.visits), arch, F.today);
const allRows = () => { const out = []; (erpSales.periods || []).forEach(p => { if(p && !p.rowsMissing) U.unpackErpRows(p.rows).forEach(r => out.push(r)); }); return out; };
const data = () => ({ today: F.today, targets, erpSales, clinics, erpMap, visits, tasks: parse(F.docs.tasks), events: parse(F.docs.events), dayPlans: parse(F.docs.dayPlans) });

test('speed (v126): one matcher per pass gives matchCustomer\'s answer for every customer, and erpRowRep the same person', () => {
  const rows = allRows();
  assert.ok(rows.length > 3000, 'enough lines');
  const match = U.erpMatcher(clinics, erpMap);
  const names = [...new Set(rows.map(r => (r.customer || '').trim()))].concat(['', '(no name)', 'constructor', '__proto__', 'My Fatoorah']);
  names.forEach(n => assert.deepStrictEqual(match(n), U.matchCustomer(n, clinics, erpMap), n));
  (erpSales.periods || []).forEach(p => U.unpackErpRows(p.rows).slice(0, 400).forEach(r => {
    assert.strictEqual(U.erpRowRep(r, clinics, erpMap, p.repMap || {}, match), U.erpRowRep(r, clinics, erpMap, p.repMap || {}));
  }));
});

test('speed (v126): the returns context is kept per set of files and built again when a file\'s lines change', () => {
  const es = JSON.parse(JSON.stringify(erpSales));
  const fresh = () => { const all = []; es.periods.filter(p => p && !p.rowsMissing).forEach(p => U.unpackErpRows(p.rows).forEach(r => all.push(r))); return U.returnContext(all); };
  const c1 = U.erpCtxOf(es);
  assert.deepStrictEqual(c1, fresh());
  assert.strictEqual(U.erpCtxOf(es), c1, 'the same files: kept');
  // a file's rows replaced (a purge: a new array, one line fewer)
  const p0 = es.periods.find(p => p.rows && p.rows.length > 2);
  const invoice = p0.rows.findIndex(a => !a[2]);
  p0.rows = p0.rows.filter((a, i) => i !== invoice);
  const c2 = U.erpCtxOf(es);
  assert.notStrictEqual(c2, c1); assert.deepStrictEqual(c2, fresh());
  // a file added (an upload)
  es.periods.push({ id: 'added', from: '2026-11-01', to: '2026-11-03', rows: [['2026-11-02', 'INV-ADDED-1', 0, 'Brush', 1, 5, 5, 0, 'Someone', 'TePe', 'Added customer', 'A', 0, null]] });
  const c3 = U.erpCtxOf(es);
  assert.notStrictEqual(c3, c2); assert.deepStrictEqual(c3, fresh());
  // a file whose rows did not load leaves the context
  es.periods[es.periods.length - 1].rowsMissing = true;
  assert.deepStrictEqual(U.erpCtxOf(es), fresh());
});

test('speed (v126): normBrand and fmtDate keep their answers', () => {
  // the memo is keyed by the very text the formula reads (String(s || '')): the first answer is the formula's, every
  // later one the same; an alias and a plain name as before
  const spellings = ['Waterpik', 'WATERPIK', ' TePe ', 'Te-Pe', 'tepe', 'Philips', 'Philips Sonicare', '', null, undefined, 0, false, 'Intensiv', 'constructor', 'GC', 'gc '];
  spellings.forEach(s => { const a = U.normBrand(s), b = U.normBrand(s), c = U.normBrand(String(s || '')); assert.strictEqual(a, b); assert.strictEqual(a, c); });
  assert.strictEqual(U.normBrand(''), ''); assert.strictEqual(U.normBrand(null), ''); assert.strictEqual(U.normBrand(0), U.normBrand(''));
  assert.strictEqual(U.normBrand('Some New Brand '), 'some new brand');
  allRows().slice(0, 2000).forEach(r => assert.strictEqual(U.normBrand(r.brand), U.normBrand(String(r.brand || ''))));
  ['2026-11-24', '2026-01-01', '2025-12-31', null, undefined, 'x'].forEach(d => {
    const want = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    assert.strictEqual(U.fmtDate(d), want); assert.strictEqual(U.fmtDate(d), want);
  });
});

test('speed (v126): unitSellPlan over lines indexed per brand = the plan worked out over every line', () => {
  const rows = allRows();
  // the plan as it was: every line of both lists looked at (the reference)
  const ref = opts => {
    const target = U.normBrand(opts.brand), gap = opts.gap || 0;
    if(!(gap > 0)) return [];
    const stats = {};
    const add = (list, mine) => (list || []).forEach(r => {
      if(r.type === 'return' || !(r.net > 0) || !(r.qty > 0)) return;
      if(U.normBrand(r.brand) !== target) return;
      const pn = (r.product || '').trim(); if(!pn) return;
      const a = stats[pn] || (stats[pn] = { q: 0, v: 0, mine: false }); a.q += r.qty; a.v += r.net; if(mine) a.mine = true;
    });
    add(opts.clinicRows, true); add(opts.allRows, false);
    let cands = Object.keys(stats).map(pn => ({ product: pn, price: Math.round(stats[pn].v / stats[pn].q * 100) / 100, popularity: stats[pn].q, mine: stats[pn].mine })).filter(x => x.price > 0);
    cands.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.popularity - a.popularity);
    if(!cands.length) cands = (opts.products || []).filter(pr => U.normBrand(pr.brand) === target && pr.price > 0).slice(0, 2).map(pr => ({ product: pr.name, price: pr.price, popularity: 0, mine: false }));
    if(!cands.length) return [];
    let chosen = cands.slice(0, 3);
    if(gap < chosen[0].price * 1.5) chosen = [chosen[0]];
    const popSum = chosen.reduce((s2, c) => s2 + Math.max(1, c.popularity), 0);
    return chosen.map(c => { const share = gap * Math.max(1, c.popularity) / popSum, units = Math.max(1, Math.ceil(share / c.price)); return { product: c.product, price: c.price, units, amount: Math.round(units * c.price * 100) / 100, mine: c.mine }; });
  };
  const products = parse(F.docs.products);
  const byClinic = {};
  const match = U.erpMatcher(clinics, erpMap);
  rows.forEach(r => { const m = match((r.customer || '').trim()); if(m.clinicId) (byClinic[m.clinicId] = byClinic[m.clinicId] || []).push(r); });
  const brands = [...new Set(rows.map(r => r.brand))].slice(0, 8).concat(['NoSuchBrand']);
  let n = 0;
  clinics.slice(0, 40).forEach(c => brands.forEach(b => [50, 400, 2500].forEach(gap => {
    const opts = { brand: b, gap, clinicRows: byClinic[c.id] || [], allRows: rows, products };
    assert.deepStrictEqual(U.unitSellPlan(opts), ref(opts), c.id + ' ' + b + ' ' + gap); n++;
  })));
  assert.ok(n > 300);
  // a list that grows (a file's rows added) is summed again: a new product of the brand, and more of an old one
  const b0 = brands[0], old = rows.find(r => r.brand === b0 && r.net > 0 && r.qty > 0 && (r.product || '').trim() && r.type !== 'return');
  rows.push(Object.assign({}, old, { product: 'Speed test product', qty: 900, net: 90000 }), Object.assign({}, old, { qty: 7, net: 12.345 }));
  clinics.slice(0, 10).forEach(c => [50, 2500].forEach(gap => {
    const opts = { brand: b0, gap, clinicRows: byClinic[c.id] || [], allRows: rows, products };
    assert.deepStrictEqual(U.unitSellPlan(opts), ref(opts), 'grown ' + c.id + ' ' + gap);
  }));
  assert.ok(U.unitSellPlan({ brand: b0, gap: 2500, clinicRows: [], allRows: rows, products }).some(x => x.product === 'Speed test product'));
});

test('speed (v126): doctorAnalytics with each clinic\'s visits grouped once = every visit looked at for every doctor', () => {
  const opts = { clinics, visits, today: F.today, repFilter: 'all' };
  const out = U.doctorAnalytics(opts);
  const uniq = U.dedupeVisits(visits).unique;
  let n = 0;
  out.forEach(d => {
    const c = clinics.find(x => x.id === d.clinicId);
    const dv = uniq.filter(v => { if(v.clinicId !== c.id) return false; const ids = (Array.isArray(v.doctorIds) && v.doctorIds.length) ? v.doctorIds : (v.doctorId ? [v.doctorId] : []); return ids.indexOf(d.id) >= 0; });
    const dates = dv.map(v => v.date).sort();
    assert.strictEqual(d.lastVisit, dates.length ? dates[dates.length - 1] : null);
    assert.strictEqual(d.fieldVisits, dv.filter(U.isFieldVisit).length);
    assert.strictEqual(d.calls, dv.filter(v => v.callOnly).length);
    assert.deepStrictEqual(d.visitLog.map(v => v.id), dv.sort((a, b) => b.date.localeCompare(a.date)).map(v => v.id));
    n++;
  });
  assert.ok(n > 100, 'doctors compared: ' + n);
});

test('speed (v126): the catalog match keeps each product\'s tokens and follows a rename', () => {
  const products = parse(F.docs.products);
  const ref = (name, list) => { const nt = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean); if(!nt.length) return null; let best = null, bestScore = 0;
    list.forEach(pr => { const pt = ((pr.name || '') + ' ' + (pr.brand || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/); const ov = nt.filter(t => pt.indexOf(t) >= 0).length;
      const score = ov / Math.max(1, Math.max(nt.length, Math.min(pt.length, nt.length + 2))); if(ov >= Math.min(2, nt.length) && score > bestScore){ best = pr; bestScore = score; } }); return bestScore >= 0.5 ? best : null; };
  const names = [...new Set(allRows().map(r => r.product))].slice(0, 300);
  names.forEach(nm => assert.strictEqual(U.matchCatalogProduct(nm, products), ref(nm, products), nm));
  const p = products[0], before = U.matchCatalogProduct(p.name, products);
  assert.strictEqual(before, ref(p.name, products));
  p.name = 'Renamed Product Zeta Omega'; // a product renamed in place: its tokens follow
  assert.strictEqual(U.matchCatalogProduct('Renamed Product Zeta Omega', products), ref('Renamed Product Zeta Omega', products));
  assert.strictEqual(U.matchCatalogProduct('Renamed Product Zeta Omega', products), p);
});

test('speed (v126): monthlyTrend with one shared pass and the months\' wins handed down = without them', () => {
  const d = data(), S = Object.assign({}, U.KPI_DEFAULTS || {});
  const reps = Object.keys(F.people);
  const a = U.monthlyTrend(d, { reps, months: 4, settings: S });
  // the reference: a caller's own pass, and every scorecard working its wins out itself (the pass handed in is used as it is)
  const d2 = Object.assign({}, d, { erpShare: U.erpShare(d) });
  const b = U.monthlyTrend(d2, { reps, months: 4, settings: S });
  assert.deepStrictEqual(a, b);
  const rows = U.erpAttributedRows(d);
  a.months.forEach(m => reps.forEach(rep => {
    const k1 = U.kpiScorecard(d, { rep, from: m.from, to: m.to, settings: S, rows });
    const k2 = U.kpiScorecard(d, { rep, from: m.from, to: m.to, settings: S, rows, wins: { rows, from: m.from, to: m.to, clinics: d.clinics, w: U.erpWinsInRange(rows, m.from, m.to, d.clinics) } });
    assert.deepStrictEqual(k2, k1);
    if(m.byRep[rep].kpi != null) assert.strictEqual(m.byRep[rep].kpi, k1.total);
    // the month's figure as each erpMtd worked it out on its own, with no shared pass (the way monthlyTrend read it before)
    const own = U.monthAchievement(rep, Object.assign({}, d, { today: m.to }));
    if(m.byRep[rep].sales != null) assert.strictEqual(m.byRep[rep].sales, Math.round(own.amount * 1000) / 1000, m.month + ' ' + rep);
    if(m.byRep[rep].sameDays != null && m.sameTo !== m.to) assert.strictEqual(m.byRep[rep].sameDays, Math.round(U.monthAchievement(rep, Object.assign({}, d, { today: m.sameTo })).amount * 1000) / 1000);
  }));
  assert.ok(a.months.some(m => reps.some(r => m.byRep[r].sales != null)), 'some month has a sales figure');
});
