const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/js/core.js');

// ---------- formatting / small helpers ----------

describe('money', () => {
  test('formats with 2 decimals and KD suffix', () => {
    assert.equal(core.money(12.5), '12.50 KD');
    assert.equal(core.money(0), '0.00 KD');
  });
  test('treats null/undefined as zero', () => {
    assert.equal(core.money(null), '0.00 KD');
    assert.equal(core.money(undefined), '0.00 KD');
  });
});

describe('esc (HTML escaping)', () => {
  test('escapes all dangerous characters', () => {
    assert.equal(core.esc(`<img src=x onerror="alert('1')">&`),
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;');
  });
  test('handles null/undefined/empty', () => {
    assert.equal(core.esc(null), '');
    assert.equal(core.esc(undefined), '');
    assert.equal(core.esc(''), '');
  });
  test('leaves safe text untouched', () => {
    assert.equal(core.esc('Dr. Ahmed - Salmiya Clinic'), 'Dr. Ahmed - Salmiya Clinic');
  });
});

describe('safeUrl', () => {
  test('allows http and https', () => {
    assert.equal(core.safeUrl('https://example.com/x'), 'https://example.com/x');
    assert.equal(core.safeUrl('  http://a.b  '), 'http://a.b');
  });
  test('blocks javascript:, data: and everything else', () => {
    assert.equal(core.safeUrl('javascript:alert(1)'), '');
    assert.equal(core.safeUrl('data:text/html;base64,xx'), '');
    assert.equal(core.safeUrl('example.com'), '');
    assert.equal(core.safeUrl(null), '');
  });
});

describe('initials / slugify / uid', () => {
  test('initials takes first letters of first two words', () => {
    assert.equal(core.initials('Mariam Ali'), 'MA');
    assert.equal(core.initials('Renova'), 'R');
    assert.equal(core.initials('a b c'), 'AB');
  });
  test('slugify lowercases and collapses non-alphanumerics', () => {
    assert.equal(core.slugify('Ultra Med  X-2!'), 'ultra-med-x-2-');
  });
  test('uid returns non-empty unique-ish strings', () => {
    const a = core.uid(), b = core.uid();
    assert.ok(a.length > 5);
    assert.notEqual(a, b);
  });
});

// ---------- dates ----------

describe('dates', () => {
  test('localDateStr pads month and day', () => {
    assert.equal(core.localDateStr(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(core.localDateStr(new Date(2026, 11, 31)), '2026-12-31');
  });
  test('todayStr uses the LOCAL calendar date (UTC bug regression)', () => {
    // Computed two ways around the call so the test can't flake at midnight.
    const before = core.localDateStr(new Date());
    const today = core.todayStr();
    const after = core.localDateStr(new Date());
    assert.ok([before, after].includes(today),
      `todayStr()=${today} should match the local date (${before}/${after}), not the UTC date`);
  });
  test('daysBetween counts calendar days', () => {
    assert.equal(core.daysBetween('2026-08-01', '2026-08-07'), 6);
    assert.equal(core.daysBetween('2026-08-07', '2026-08-01'), -6);
    assert.equal(core.daysBetween('2026-08-07', '2026-08-07'), 0);
    // across a month boundary and a leap day
    assert.equal(core.daysBetween('2024-02-28', '2024-03-01'), 2);
  });
  test('getWeekDates returns Sunday-to-Saturday containing the anchor', () => {
    const week = core.getWeekDates('2026-08-05'); // a Wednesday
    assert.equal(week.length, 7);
    assert.equal(week[0], '2026-08-02'); // Sunday
    assert.equal(week[6], '2026-08-08'); // Saturday
    assert.ok(week.includes('2026-08-05'));
  });
  test('getMonthDates handles leap February and month lengths', () => {
    const feb24 = core.getMonthDates('2024-02-10');
    assert.equal(feb24.length, 29);
    assert.equal(feb24[0], '2024-02-01');
    assert.equal(feb24[28], '2024-02-29');
    assert.equal(core.getMonthDates('2026-02-01').length, 28);
    assert.equal(core.getMonthDates('2026-08-15').length, 31);
  });
});

describe('followStatus', () => {
  const today = '2026-08-07';
  test('classifies overdue / today / upcoming / none', () => {
    assert.equal(core.followStatus('2026-08-01', today), 'overdue');
    assert.equal(core.followStatus('2026-08-07', today), 'today');
    assert.equal(core.followStatus('2026-08-08', today), 'upcoming');
    assert.equal(core.followStatus(null, today), 'none');
    assert.equal(core.followStatus('', today), 'none');
  });
});

// ---------- persistence ----------

describe('safeParse', () => {
  test('parses valid JSON', () => {
    assert.deepEqual(core.safeParse('[1,2]', []), [1, 2]);
    assert.deepEqual(core.safeParse('{"a":1}', {}), { a: 1 });
  });
  test('returns the fallback for corrupt JSON instead of throwing', () => {
    assert.deepEqual(core.safeParse('{broken', ['fallback']), ['fallback']);
    assert.equal(core.safeParse('', null), null);
  });
  test('returns the fallback for missing values', () => {
    assert.equal(core.safeParse(null, 'x'), 'x');
    assert.equal(core.safeParse(undefined, 'x'), 'x');
  });
});

// ---------- CSV ----------

describe('csvEscape', () => {
  test('plain values pass through', () => {
    assert.equal(core.csvEscape('hello'), 'hello');
    assert.equal(core.csvEscape(12.5), '12.5');
  });
  test('null/undefined become empty', () => {
    assert.equal(core.csvEscape(null), '');
    assert.equal(core.csvEscape(undefined), '');
  });
  test('quotes values containing commas, quotes, newlines', () => {
    assert.equal(core.csvEscape('a,b'), '"a,b"');
    assert.equal(core.csvEscape('say "hi"'), '"say ""hi"""');
    assert.equal(core.csvEscape('line1\nline2'), '"line1\nline2"');
  });
  test('neutralizes spreadsheet formula injection', () => {
    assert.equal(core.csvEscape('=CMD()'), "'=CMD()");
    assert.equal(core.csvEscape('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(core.csvEscape('=1+1,x'), '"\'=1+1,x"');
    assert.equal(core.csvEscape('+cmd|payload'), "'+cmd|payload");
  });
  test('leaves plain signed numbers (e.g. phone numbers) untouched', () => {
    assert.equal(core.csvEscape('+96512345678'), '+96512345678');
    assert.equal(core.csvEscape('-5.5'), '-5.5');
  });
});

// ---------- order math ----------

const PRODUCTS = [
  { id: 'p1', name: 'Gel A', price: 2.5 },
  { id: 'p2', name: 'Cream B', price: 10 },
  { id: 'p3', name: 'Sample C', price: null }, // price not set
  { id: 'p4', _key: 'k4', name: 'Serum D', price: 4 },
];

describe('orderGross / orderNet', () => {
  test('sums price x quantity', () => {
    const o = { qty: { p1: 2, p2: 1 }, discountPct: 0 };
    assert.equal(core.orderGross(o, PRODUCTS), 15);
    assert.equal(core.orderNet(o, PRODUCTS), 15);
  });
  test('ignores products with no price and unknown products', () => {
    const o = { qty: { p1: 1, p3: 5, ghost: 9 }, discountPct: 0 };
    assert.equal(core.orderGross(o, PRODUCTS), 2.5);
  });
  test('applies percentage discount with 2-decimal rounding', () => {
    const o = { qty: { p2: 1 }, discountPct: 15 };
    assert.equal(core.orderNet(o, PRODUCTS), 8.5);
    // Pins current float behavior: 2.5 * 0.67 computes as 1.67499999...,
    // so the half-fils case rounds DOWN. If rounding policy ever changes
    // (e.g. to always round half up), update this expectation deliberately.
    const o2 = { qty: { p1: 1 }, discountPct: 33 };
    assert.equal(core.orderNet(o2, PRODUCTS), 1.67);
  });
  test('handles 100% discount and missing discountPct', () => {
    assert.equal(core.orderNet({ qty: { p2: 2 }, discountPct: 100 }, PRODUCTS), 0);
    assert.equal(core.orderNet({ qty: { p2: 2 } }, PRODUCTS), 20);
  });
  test('empty order totals zero', () => {
    assert.equal(core.orderGross({ qty: {} }, PRODUCTS), 0);
    assert.equal(core.orderNet({ qty: {} }, PRODUCTS), 0);
  });
});

describe('orderTotals (standalone orders)', () => {
  test('returns rounded gross, discount and net', () => {
    const t = core.orderTotals({ p1: 3, p2: 1 }, 10, PRODUCTS); // gross 17.5
    assert.deepEqual(t, { gross: 17.5, disc: 1.75, net: 15.75 });
  });
  test('no discount', () => {
    assert.deepEqual(core.orderTotals({ p2: 2 }, 0, PRODUCTS), { gross: 20, disc: 0, net: 20 });
  });
  test('finds products by _key like the app does', () => {
    const t = core.orderTotals({ k4: 2 }, 0, PRODUCTS);
    assert.equal(t.gross, 8);
  });
  test('rounding stays consistent: disc + net equals gross to the fils', () => {
    const t = core.orderTotals({ p1: 1 }, 33, PRODUCTS); // 2.5 gross
    assert.equal(Math.round((t.disc + t.net) * 100) / 100, t.gross);
  });
});

// ---------- rep scoring ----------

const CLINICS = [
  { id: 'c1', rep: 'Mariam', cls: 'A', nextFollowUp: '2026-08-01' }, // overdue
  { id: 'c2', rep: 'Mariam', cls: 'B', nextFollowUp: '2026-08-20' },
  { id: 'c3', rep: 'Mariam', cls: 'C', nextFollowUp: null },
  { id: 'c4', rep: 'Mariam', cls: 'Closed', nextFollowUp: '2026-01-01' }, // ignored
  { id: 'c5', rep: 'Renova', cls: 'A', nextFollowUp: null },
];
const VISITS = [
  { rep: 'Mariam', clinicId: 'c1', orderTaken: true, orderTotal: 100 },
  { rep: 'Mariam', clinicId: 'c1', orderTaken: false },
  { rep: 'Mariam', clinicId: 'c3', orderTaken: true, orderTotal: 50.5 },
  { rep: 'Renova', clinicId: 'c5', orderTaken: false },
];
const TASKS = [
  { rep: 'Mariam', done: true },
  { rep: 'Mariam', done: false },
  { rep: 'Renova', done: false },
];

describe('computeScoreForVisits', () => {
  test('computes visits, orders, revenue, coverage and priority coverage', () => {
    const s = core.computeScoreForVisits('Mariam', VISITS, CLINICS);
    assert.equal(s.visits, 3);
    assert.equal(s.orders, 2);
    assert.equal(s.revenue, 150.5);
    assert.equal(s.conversion, 67); // 2/3 rounded
    assert.equal(s.assignedCount, 3); // Closed clinic excluded
    assert.equal(s.covered, 2); // c1, c3
    assert.equal(s.coveragePct, 67);
    assert.equal(s.priorityAssignedCount, 2); // A + B
    assert.equal(s.priorityCovered, 1); // only c1
    assert.equal(s.priorityPct, 50);
  });
  test('a rep with no visits and no clinics gets zeros, not NaN', () => {
    const s = core.computeScoreForVisits('Nobody', VISITS, CLINICS);
    assert.equal(s.visits, 0);
    assert.equal(s.conversion, 0);
    assert.equal(s.coveragePct, 0);
    assert.equal(s.priorityPct, 0);
  });
});

describe('computeRepScore', () => {
  test('adds overdue follow-ups and task completion', () => {
    const s = core.computeRepScore('Mariam', { visits: VISITS, clinics: CLINICS, tasks: TASKS, today: '2026-08-07' });
    assert.equal(s.rep, 'Mariam');
    assert.equal(s.overdue, 1); // c1 overdue; c4 is Closed so ignored
    assert.equal(s.tasksTotal, 2);
    assert.equal(s.tasksDone, 1);
    assert.equal(s.taskPct, 50);
    assert.equal(s.visits, 3); // score fields carried through
  });
  test('rep with no tasks gets 0% not NaN', () => {
    const s = core.computeRepScore('Nobody', { visits: [], clinics: [], tasks: [], today: '2026-08-07' });
    assert.equal(s.taskPct, 0);
    assert.equal(s.overdue, 0);
  });
});

describe('calendarDayItems', () => {
  const DATA = {
    dayPlans: {
      '2026-08-10': {
        Mariam: [{ id: 'c1', note: 'bring samples' }, 'c2'], // legacy bare-string entry
        Renova: [{ id: 'c5', note: '' }],
      },
    },
    visits: [
      { rep: 'Mariam', clinicId: 'c1', date: '2026-08-10', orderTaken: true, orderTotal: 40 },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-11' },
    ],
    clinics: [
      { id: 'c1', rep: 'Mariam', cls: 'A', nextFollowUp: '2026-08-10' },
      { id: 'c9', rep: 'Mariam', cls: 'Closed', nextFollowUp: '2026-08-10' }, // closed → hidden
      { id: 'c5', rep: 'Renova', cls: 'B', nextFollowUp: '2026-08-12' },
    ],
    tasks: [
      { id: 't1', rep: 'Mariam', dueDate: '2026-08-10', done: false, text: 'call back' },
      { id: 't2', rep: 'Mariam', dueDate: '2026-08-10', done: true, text: 'done already' },
      { id: 't3', rep: 'Team', dueDate: '2026-08-10', done: false, text: 'team task' },
    ],
    events: [
      { id: 'e1', title: 'Dental conf', date: '2026-08-10', rep: 'all' },
      { id: 'e2', title: 'Renova 1:1', date: '2026-08-10', rep: 'Renova' },
    ],
  };
  test('aggregates everything for a day with rep=all', () => {
    const r = core.calendarDayItems('2026-08-10', 'all', DATA);
    assert.equal(r.planned.length, 3);
    assert.equal(r.visits.length, 1);
    assert.equal(r.followUps.length, 1); // closed clinic excluded
    assert.equal(r.tasks.length, 2); // done task excluded
    assert.equal(r.events.length, 2);
    assert.equal(r.total, 9);
  });
  test('filters by rep, keeping whole-team items visible', () => {
    const r = core.calendarDayItems('2026-08-10', 'Mariam', DATA);
    assert.equal(r.planned.length, 2);
    assert.deepEqual(r.planned.map(p => p.clinicId), ['c1', 'c2']);
    assert.equal(r.planned[1].note, ''); // legacy string entry normalized
    assert.equal(r.visits.length, 1);
    assert.equal(r.followUps.length, 1);
    assert.equal(r.tasks.length, 2); // own + Team task
    assert.equal(r.events.length, 1); // team-wide event only, not Renova's
    assert.equal(r.events[0].id, 'e1');
  });
  test('an empty day returns zero total, not errors', () => {
    const r = core.calendarDayItems('2026-08-20', 'all', DATA);
    assert.equal(r.total, 0);
  });
  test('tolerates missing collections', () => {
    const r = core.calendarDayItems('2026-08-10', 'all', {});
    assert.equal(r.total, 0);
  });
});

describe('inRange / filterVisitsByRange', () => {
  test('inclusive on both ends, lexicographic-safe', () => {
    assert.equal(core.inRange('2026-08-05', '2026-08-01', '2026-08-10'), true);
    assert.equal(core.inRange('2026-08-01', '2026-08-01', '2026-08-10'), true);
    assert.equal(core.inRange('2026-08-10', '2026-08-01', '2026-08-10'), true);
    assert.equal(core.inRange('2026-07-31', '2026-08-01', '2026-08-10'), false);
    assert.equal(core.inRange('2026-08-11', '2026-08-01', '2026-08-10'), false);
  });
  test('open-ended bounds: null from or to means unbounded', () => {
    assert.equal(core.inRange('2020-01-01', null, '2026-08-10'), true);
    assert.equal(core.inRange('2030-01-01', '2026-08-01', null), true);
    assert.equal(core.inRange('', '2026-08-01', null), false); // missing date never matches
  });
  test('filterVisitsByRange keeps only in-range visits', () => {
    const vs = [{ date: '2026-08-01' }, { date: '2026-08-05' }, { date: '2026-08-20' }];
    assert.deepEqual(core.filterVisitsByRange(vs, '2026-08-02', '2026-08-10').map(v => v.date), ['2026-08-05']);
    assert.equal(core.filterVisitsByRange(vs, null, null).length, 3);
  });
});

describe('rangeSummary', () => {
  const DATA = {
    visits: [
      { rep: 'Mariam', clinicId: 'c1', date: '2026-08-03', orderTaken: true, orderTotal: 100, orderDiscount: 5, doctorIds: ['d1', 'd2'] },
      { rep: 'Mariam', clinicId: 'c2', date: '2026-08-04' },
      { rep: 'Mariam', clinicId: 'c1', date: '2026-08-05', callOnly: true, contactName: 'Dr. Sara' },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-05', orderTaken: true, orderTotal: 50, doctorId: 'd9' },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-20', orderTaken: true, orderTotal: 999 }, // outside range
    ],
    clinics: [
      { id: 'c1', rep: 'Mariam', cls: 'A', nextFollowUp: '2026-08-06' },
      { id: 'c5', rep: 'Renova', cls: 'B', nextFollowUp: '2026-09-01' }, // outside range
      { id: 'c9', rep: 'Mariam', cls: 'Closed', nextFollowUp: '2026-08-06' }, // closed → excluded
    ],
    tasks: [
      { rep: 'Mariam', done: false, dueDate: '2026-08-04', text: 'x' },
      { rep: 'Mariam', done: true, dueDate: '2026-08-04', text: 'done' },
    ],
    events: [
      { id: 'e1', title: 'Conf', date: '2026-08-05', rep: 'all' },
      { id: 'e2', title: 'Later', date: '2026-09-09', rep: 'all' },
    ],
    dayPlans: {
      '2026-08-03': { Mariam: [{ id: 'c1', note: '' }, { id: 'c2', note: '' }] },
      '2026-08-25': { Mariam: [{ id: 'c1', note: '' }] }, // outside range
    },
  };
  test('aggregates a whole-team range correctly', () => {
    const s = core.rangeSummary('2026-08-01', '2026-08-07', 'all', DATA);
    assert.equal(s.totalActivity, 4);
    assert.equal(s.fieldVisits, 3); // call excluded
    assert.equal(s.calls, 1);
    assert.equal(s.orders, 2);
    assert.equal(s.revenue, 150);
    assert.equal(s.discount, 5);
    assert.equal(s.clinicsCovered, 3); // c1, c2, c5
    assert.equal(s.conversion, 67); // 2 orders / 3 field visits
    assert.equal(s.planned, 2);
    assert.equal(s.events, 1);
    assert.equal(s.followUpsDue, 1); // closed clinic excluded
    assert.equal(s.tasksDue, 1); // done task excluded
    assert.equal(s.perRep.length, 2);
    assert.equal(s.perRep[0].rep, 'Mariam'); // sorted by revenue desc
    assert.equal(s.contacts, 4); // 2 doctors + 1 phone contact + 1 doctor
    assert.equal(s.perRep.find(r => r.rep === 'Mariam').contacts, 3);
    assert.equal(s.perRep.find(r => r.rep === 'Renova').contacts, 1);
  });
  test('filters by a single rep', () => {
    const s = core.rangeSummary('2026-08-01', '2026-08-07', 'Renova', DATA);
    assert.equal(s.totalActivity, 1);
    assert.equal(s.contacts, 1);
    assert.equal(s.revenue, 50);
    assert.equal(s.events, 1); // team-wide event still visible
    assert.equal(s.planned, 0);
  });
  test('empty range returns zeros, not NaN', () => {
    const s = core.rangeSummary('2025-01-01', '2025-01-31', 'all', DATA);
    assert.equal(s.totalActivity, 0);
    assert.equal(s.conversion, 0);
    assert.equal(s.perRep.length, 0);
  });
});

describe('contactCount', () => {
  test('multi-doctor visit counts every doctor seen', () => {
    assert.equal(core.contactCount({ doctorIds: ['d1', 'd2', 'd3'] }), 3);
  });
  test('doctorIds wins over legacy doctorId when both exist', () => {
    assert.equal(core.contactCount({ doctorIds: ['d1', 'd2'], doctorId: 'd1' }), 2);
  });
  test('legacy single-doctor visit counts as one contact', () => {
    assert.equal(core.contactCount({ doctorId: 'd1' }), 1);
  });
  test('an empty doctorIds array falls back to legacy doctorId', () => {
    assert.equal(core.contactCount({ doctorIds: [], doctorId: 'd1' }), 1);
  });
  test('a phone call with a named contact counts as one contact', () => {
    assert.equal(core.contactCount({ callOnly: true, contactName: 'Dr. Sara' }), 1);
  });
  test('a visit with nobody recorded counts zero contacts', () => {
    assert.equal(core.contactCount({}), 0);
    assert.equal(core.contactCount({ callOnly: true }), 0);
  });
});

describe('missedPlans', () => {
  const today = '2026-08-07';
  const dayPlans = {
    '2026-08-04': { Mariam: [{ id: 'c1', note: 'samples' }, 'c2'], Renova: [{ id: 'c5', note: '' }] },
    '2026-08-07': { Mariam: [{ id: 'c3', note: '' }] },   // today → not missed yet
    '2026-08-20': { Mariam: [{ id: 'c4', note: '' }] },   // future → not missed
    '2026-07-01': { Mariam: [{ id: 'c9', note: '' }] },   // older than 14 days → ignored
  };
  const visits = [
    { rep: 'Mariam', clinicId: 'c1', date: '2026-08-04' }, // done as planned
    { rep: 'Renova', clinicId: 'c5', date: '2026-08-05' }, // done, but a day late → still missed for the 4th
  ];
  test('finds planned entries with no matching same-day visit', () => {
    const list = core.missedPlans(dayPlans, visits, today, { daysBack: 14 });
    assert.deepEqual(list.map(m => m.rep + ':' + m.clinicId), ['Mariam:c2', 'Renova:c5']);
    assert.equal(list[0].date, '2026-08-04');
    assert.equal(list[0].note, ''); // legacy string entry normalized
  });
  test('today, future, and too-old plans are excluded', () => {
    const list = core.missedPlans(dayPlans, visits, today, { daysBack: 14 });
    assert.ok(!list.some(m => ['c3', 'c4', 'c9'].includes(m.clinicId)));
  });
  test('empty inputs are safe', () => {
    assert.deepEqual(core.missedPlans({}, [], today, {}), []);
    assert.deepEqual(core.missedPlans(null, null, today, null), []);
  });
});

describe('calendarDayItems joint visits', () => {
  test('a joint visit appears for both participants', () => {
    const data = {
      visits: [{ rep: 'Mariam', withRep: 'Renova', clinicId: 'c1', date: '2026-08-10' }],
      clinics: [], tasks: [], events: [], dayPlans: {},
    };
    assert.equal(core.calendarDayItems('2026-08-10', 'Mariam', data).visits.length, 1);
    assert.equal(core.calendarDayItems('2026-08-10', 'Renova', data).visits.length, 1);
    assert.equal(core.calendarDayItems('2026-08-10', 'Nobody', data).visits.length, 0);
  });
});

describe('pctDelta', () => {
  test('normal percentage changes', () => {
    assert.equal(core.pctDelta(150, 100), 50);
    assert.equal(core.pctDelta(75, 100), -25);
    assert.equal(core.pctDelta(100, 100), 0);
  });
  test('zero baseline never divides by zero', () => {
    assert.equal(core.pctDelta(50, 0), 100);
    assert.equal(core.pctDelta(0, 0), 0);
  });
});

describe('dormantClinics', () => {
  const CLINICS = [
    { id: 'c1', name: 'Alpha', rep: 'Mariam', cls: 'A' },
    { id: 'c2', name: 'Beta', rep: 'Mariam', cls: 'B' },
    { id: 'c3', name: 'Gamma', rep: 'Renova', cls: 'C' },     // C class → not priority
    { id: 'c4', name: 'Delta', rep: 'Renova', cls: 'A' },
    { id: 'c5', name: 'Closed1', rep: 'Mariam', cls: 'Closed' }, // closed → excluded
  ];
  const VISITS = [
    { clinicId: 'c1', date: '2026-06-01' }, // 67 days before "today"
    { clinicId: 'c1', date: '2026-08-05' }, // most recent visit wins → fresh
    { clinicId: 'c2', date: '2026-06-20' }, // 48 days → dormant
    { clinicId: 'c3', date: '2026-01-01' }, // dormant but class C → excluded
  ];
  const today = '2026-08-07';
  test('finds quiet priority clinics, never-visited first', () => {
    const list = core.dormantClinics(CLINICS, VISITS, today, { days: 30 });
    assert.deepEqual(list.map(c => c.id), ['c4', 'c2']); // c4 never visited → first
    assert.equal(list[0].lastVisit, null);
    assert.equal(list[0].daysSince, null);
    assert.equal(list[1].daysSince, 48);
  });
  test('a recent visit resets the clock', () => {
    const list = core.dormantClinics(CLINICS, VISITS, today, { days: 30 });
    assert.ok(!list.some(c => c.id === 'c1')); // visited 2 days ago
  });
  test('threshold is configurable', () => {
    const list = core.dormantClinics(CLINICS, VISITS, today, { days: 60 });
    assert.deepEqual(list.map(c => c.id), ['c4']); // 48-day c2 no longer counts
  });
  test('closed and non-priority clinics never appear', () => {
    const list = core.dormantClinics(CLINICS, [], today, { days: 30 });
    assert.ok(!list.some(c => c.id === 'c3' || c.id === 'c5'));
    assert.equal(list.length, 3); // c1, c2, c4 all never-visited
  });
});

describe('calcStreak', () => {
  const today = '2026-08-07';
  test('counts consecutive days ending today', () => {
    assert.equal(core.calcStreak(['2026-08-07', '2026-08-06', '2026-08-05'], today), 3);
  });
  test("today not yet logged doesn't break yesterday's streak", () => {
    assert.equal(core.calcStreak(['2026-08-06', '2026-08-05'], today), 2);
  });
  test('a gap ends the streak', () => {
    assert.equal(core.calcStreak(['2026-08-07', '2026-08-05', '2026-08-04'], today), 1);
  });
  test('streak broken more than one day ago counts as zero', () => {
    assert.equal(core.calcStreak(['2026-08-04', '2026-08-03'], today), 0);
  });
  test('no visits means no streak', () => {
    assert.equal(core.calcStreak([], today), 0);
  });
  test('streak counting crosses month boundaries', () => {
    assert.equal(core.calcStreak(['2026-08-01', '2026-07-31', '2026-07-30'], '2026-08-01'), 3);
  });
});
