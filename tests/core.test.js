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

describe('coachInsights', () => {
  const today = '2026-08-12';
  const range = { from: '2026-08-01', to: '2026-08-12' };
  // Mariam: 6 field visits, 1 order, 0 contacts, 4 fruitless visits to c3.
  // Renova: 6 field visits, 5 orders (500 KD, all at c5), a doctor met each time.
  const DATA = {
    clinics: [
      { id: 'c1', name: 'Alpha Dental', rep: 'Mariam', cls: 'A', nextFollowUp: '2026-08-05' }, // overdue
      { id: 'c2', name: 'Beta Clinic', rep: 'Renova', cls: 'B' },                              // never visited → dormant
      { id: 'c3', name: 'Gamma Center', rep: 'Mariam', cls: 'C' },
      { id: 'c5', name: 'Delta Smiles', rep: 'Renova', cls: 'B' },
    ],
    visits: [
      { rep: 'Mariam', clinicId: 'c3', date: '2026-08-03' },
      { rep: 'Mariam', clinicId: 'c3', date: '2026-08-04' },
      { rep: 'Mariam', clinicId: 'c3', date: '2026-08-05' },
      { rep: 'Mariam', clinicId: 'c3', date: '2026-08-06' },
      { rep: 'Mariam', clinicId: 'c1', date: '2026-08-07' },
      { rep: 'Mariam', clinicId: 'c1', date: '2026-08-10', orderTaken: true, orderTotal: 100 },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-03', orderTaken: true, orderTotal: 100, doctorId: 'd1' },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-04', orderTaken: true, orderTotal: 100, doctorId: 'd1' },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-05', orderTaken: true, orderTotal: 100, doctorId: 'd1' },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-06', orderTaken: true, orderTotal: 100, doctorId: 'd1' },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-07', orderTaken: true, orderTotal: 100, doctorId: 'd1' },
      { rep: 'Renova', clinicId: 'c5', date: '2026-08-10', doctorId: 'd1' },
    ],
    targets: { Mariam: { revenue: 1000 }, Renova: { revenue: 400 } },
    dayPlans: { '2026-08-10': { Mariam: [{ id: 'c9', note: '' }] } },
  };
  const teamOpts = { ...range, today, repFilter: 'all', ...DATA };

  test('flags the whole playbook on the team view', () => {
    const keys = core.coachInsights(teamOpts).map(i => i.key);
    ['followups', 'dormant', 'missed', 'target-Mariam', 'stuck', 'concentration', 'jointcoach', 'contacts']
      .forEach(k => assert.ok(keys.includes(k), 'missing ' + k));
  });
  test('urgent items always come before watch and good items', () => {
    const out = core.coachInsights(teamOpts);
    const rank = { act: 0, watch: 1, good: 2 };
    for(let i = 1; i < out.length; i++) assert.ok(rank[out[i].level] >= rank[out[i - 1].level]);
  });
  test('a rep behind the monthly target is an act item with the daily rate', () => {
    const t = core.coachInsights(teamOpts).find(i => i.key === 'target-Mariam');
    assert.equal(t.level, 'act');
    assert.match(t.detail, /KD\/day/);
  });
  test('a rep past the monthly target is celebrated', () => {
    const t = core.coachInsights(teamOpts).find(i => i.key === 'target-Renova');
    assert.equal(t.level, 'good');
    assert.equal(t.icon, '🏆');
  });
  test('the joint-visit pairing names coach and trainee correctly', () => {
    const j = core.coachInsights(teamOpts).find(i => i.key === 'jointcoach');
    assert.ok(j.detail.indexOf('Renova watches') === -1); // Renova is the top rep here
    assert.match(j.detail, /Mariam watches how Renova/);
  });
  test('filtering to one rep drops the other rep and team-only insights', () => {
    const out = core.coachInsights({ ...teamOpts, repFilter: 'Mariam' });
    const keys = out.map(i => i.key);
    assert.ok(keys.includes('conversion')); // 1 order / 6 visits = 17% < 30%
    assert.equal(out.find(i => i.key === 'conversion').level, 'act');
    assert.ok(!keys.includes('jointcoach'));
    assert.ok(!keys.includes('target-Renova'));
  });
  test('quiet data still returns one reassuring insight', () => {
    const out = core.coachInsights({ from: null, to: null, today, repFilter: 'all',
      visits: [], clinics: [], targets: {}, dayPlans: {} });
    assert.equal(out.length, 1);
    assert.equal(out[0].key, 'allgood');
    assert.equal(out[0].level, 'good');
  });
});

// ---------- ERP import & reconciliation ----------

describe('ERP parsing helpers', () => {
  test('erpNum handles ERP number formats', () => {
    assert.equal(core.erpNum('1,234.500'), 1234.5);
    assert.equal(core.erpNum('(6.763-)'), -6.763);
    assert.equal(core.erpNum('(1.00-)'), -1);
    assert.equal(core.erpNum('98.700'), 98.7);
    assert.equal(core.erpNum(''), 0);
    assert.equal(core.erpNum('abc'), 0);
  });
  test('erpDate normalizes dd-mm-yyyy and passes ISO through', () => {
    assert.equal(core.erpDate('01-08-2026'), '2026-08-01');
    assert.equal(core.erpDate('1/8/2026'), '2026-08-01');
    assert.equal(core.erpDate('2026-08-13'), '2026-08-13');
    assert.equal(core.erpDate('nonsense'), null);
  });
  test('parseCsvText honors quoted commas and newlines', () => {
    const rows = core.parseCsvText('a,"b,c","line1\nline2"\nd,e,f');
    assert.deepEqual(rows[0], ['a', 'b,c', 'line1\nline2']);
    assert.deepEqual(rows[1], ['d', 'e', 'f']);
  });
});

describe('parseErpCsv', () => {
  const CSV = [
    'Some Report Title,,,,,,,,,,',
    'Date,Invoice#,Product,Quantity,Sales Gross,Name,Sales Return Amount,Net Sales,Brand,Customer,Class',
    '01-08-2026,SINV0075029,Waterpik Cordless Plus BLACK,1.00,35.000,Ranova Ayman Mohammed,0.000,28.000,WATERPIK,My Fatoorah,Online Customers',
    '01-08-2026,SINV0075032,Mini Flosser INT,11.00,26.400,Mr. Sundeep Kohli,0.000,15.840,TEPE,"Trolley General Trading Company W.L.L",Hypermarkets and Supermarkets',
    '13-08-2026,SRT0009253,Pap+ Toothpaste,(1.00-),0.000,Mr. Sundeep Kohli,7.500,(6.763-),Hismile,"Lulu Trading & Contracting Co. W.L.L",Hypermarkets and Supermarkets',
    ',,,,,,,,,,',
  ].join('\n');
  test('detects the header row and parses data rows', () => {
    const res = core.parseErpCsv(CSV);
    assert.equal(res.error, null);
    assert.equal(res.rows.length, 3);
    const [a, , c] = res.rows;
    assert.equal(a.date, '2026-08-01');
    assert.equal(a.doc, 'SINV0075029');
    assert.equal(a.net, 28);
    assert.equal(a.salesman, 'Ranova Ayman Mohammed');
    assert.equal(a.customer, 'My Fatoorah');
    assert.equal(c.type, 'return');
    assert.equal(c.net, -6.763);
    assert.equal(c.sret, 7.5);
  });
  test('rejects text with no recognizable header', () => {
    assert.equal(core.parseErpCsv('hello,world\n1,2').error, 'NO_HEADER');
  });
});

describe('parseErpPdfText', () => {
  // Verbatim text as extracted from the real EXceed PDF report.
  const PDF_TEXT = `Date Invoice# Account Product Quantity Sales Gross Discount Sales Sales Amount NameSales Return
Amount
01-08-2026 SINV0075029 080042 Waterpik Cordless Plus
BLACK 1.00 35.000 7.000 28.000 Ranova Ayman Mohammed0.000 0.000 28.000 WATERPIKMy Fatoorah WP-462ME 05/0032Online CustomersSalesInvoice Credit 01-08-2026 MIV0052005
13-08-2026 SRT0009253 060011 Pap+ Toothpaste (1.00-) 0.000 0.000 0.000 Mr. Sundeep Kohli7.500 0.737 (6.763-) HismileLulu Trading & Contracting
Co. W.L.L (Sup# 11050963) 10016-WT 73/0011Hypermarkets and
SupermarketsSalesReturn
Credit`;
  test('parses invoice and return lines from PDF-extracted text', () => {
    const res = core.parseErpPdfText(PDF_TEXT);
    assert.equal(res.error, null);
    assert.equal(res.rows.length, 2);
    const [inv, ret] = res.rows;
    assert.equal(inv.date, '2026-08-01');
    assert.equal(inv.doc, 'SINV0075029');
    assert.equal(inv.net, 28);
    assert.equal(inv.salesman, 'Ranova Ayman Mohammed');
    assert.equal(inv.brand, 'WATERPIK');
    assert.equal(inv.customer, 'My Fatoorah');
    assert.equal(inv.cls, 'Online Customers');
    assert.equal(ret.type, 'return');
    assert.equal(ret.net, -6.763);
    assert.equal(ret.sret, 7.5);
    assert.equal(ret.brand, 'Hismile');
  });
  test('parseErpFile falls back from CSV to PDF text', () => {
    assert.equal(core.parseErpFile(PDF_TEXT).rows.length, 2);
    assert.equal(core.parseErpFile('garbage').error, 'UNRECOGNIZED');
  });
});

describe('rep and customer matching', () => {
  test('guessRepMap maps ERP salesman names to app reps (fuzzy)', () => {
    const map = core.guessRepMap(
      ['Ranova Ayman Mohammed', 'Mariam Zohair', 'Mr. Sundeep Kohli'],
      ['Renova', 'Mariam']);
    assert.equal(map['Ranova Ayman Mohammed'], 'Renova'); // 1 edit away
    assert.equal(map['Mariam Zohair'], 'Mariam');
    assert.equal(map['Mr. Sundeep Kohli'], null); // not on the field team
  });
  test('matchCustomer: channels, fuzzy clinic names, manual overrides', () => {
    const clinics = [
      { id: 'c1', name: 'Dr. Nael Al Hazeem Pharmacy ( Al Soor )' },
      { id: 'c2', name: 'Bayan Dental Center' },
    ];
    assert.equal(core.matchCustomer('My Fatoorah HX', clinics, {}).channel, true);
    assert.equal(core.matchCustomer('Dr. Nael Al Hazeem Pharmacy ( Al Soor ) WF', clinics, {}).clinicId, 'c1');
    assert.equal(core.matchCustomer('Bayan Dental Center', clinics, {}).clinicId, 'c2');
    assert.equal(core.matchCustomer('Totally Unknown Co', clinics, {}).clinicId, null);
    assert.equal(core.matchCustomer('X', clinics, { 'X': 'c2' }).clinicId, 'c2');
    assert.equal(core.matchCustomer('X', clinics, { 'X': '@channel' }).channel, true);
    assert.equal(core.matchCustomer('X', clinics, { 'X': '@ignore' }).ignored, true);
  });
  test('dedupeVisits collapses identical double-saves', () => {
    const v = { date: '2026-08-10', rep: 'Mariam', clinicId: 'c2', orderTotal: 0, notes: '' };
    const res = core.dedupeVisits([v, { ...v }, { ...v }, { ...v, clinicId: 'c1' }]);
    assert.equal(res.unique.length, 2);
    assert.equal(res.dupCount, 2);
  });
});

describe('reconcileErp', () => {
  const clinics = [
    { id: 'c1', name: 'Bayan Dental Center', rep: 'Mariam', cls: 'A' },
    { id: 'c2', name: 'Pharmacy Plus', rep: 'Renova', cls: 'A' },
    { id: 'c3', name: 'Light Dental', rep: 'Mariam', cls: 'B' },
  ];
  const rows = [
    { date: '2026-08-10', doc: 'SINV1', type: 'invoice', net: 100, sret: 0, salesman: 'Mariam Zohair', customer: 'Bayan Dental Center', brand: 'TEPE', cls: 'Clinics' },
    { date: '2026-08-11', doc: 'SINV2', type: 'invoice', net: 260, sret: 0, salesman: 'Mariam Zohair', customer: 'Light Dental ( Dr. Noor )', brand: 'Intensiv', cls: 'Clinics' },
    { date: '2026-08-11', doc: 'SINV3', type: 'invoice', net: 500, sret: 0, salesman: 'Ranova Ayman Mohammed', customer: 'My Fatoorah', brand: 'Univet', cls: 'Online Customers' },
    { date: '2026-08-12', doc: 'SRT1', type: 'return', net: -30, sret: 30, salesman: 'Ranova Ayman Mohammed', customer: 'Joury Clinic', brand: 'FLASH', cls: 'Clinics' },
  ];
  const visits = [
    { date: '2026-08-10', rep: 'Mariam', clinicId: 'c1', orderTaken: true, orderTotal: 95 },
    { date: '2026-08-10', rep: 'Mariam', clinicId: 'c1', orderTaken: true, orderTotal: 95 }, // duplicate save
    { date: '2026-08-11', rep: 'Renova', clinicId: 'c2', orderTaken: false },
  ];
  const repMap = { 'Mariam Zohair': 'Mariam', 'Ranova Ayman Mohammed': 'Renova' };
  const opts = { rows, visits, clinics, erpMap: {}, repMap, from: '2026-08-06', to: '2026-08-13' };

  test('matches visited+invoiced clinics and computes linkage', () => {
    const rec = core.reconcileErp(opts);
    const mariam = rec.perRep.find(r => r.rep === 'Mariam');
    assert.equal(mariam.erp.net, 360);
    // Bayan: visited AND invoiced → matched.
    assert.equal(mariam.matched.length, 1);
    assert.equal(mariam.matched[0].clinicId, 'c1');
    assert.equal(mariam.matched[0].net, 100);
    // Light Dental: invoiced (fuzzy-matched to c3) but never visited.
    assert.ok(mariam.invoicedNoVisit.some(x => x.clinicId === 'c3' && x.net === 260));
    assert.equal(rec.dupRows, 1);
  });
  test('channel sales are separated, not counted as unmatched clinics', () => {
    const rec = core.reconcileErp(opts);
    const renova = rec.perRep.find(r => r.rep === 'Renova');
    assert.equal(renova.erp.channelNet, 500);
    assert.equal(renova.erp.net, 470); // 500 - 30 return
    assert.ok(rec.unmatchedCustomers.includes('Joury Clinic'));
    assert.ok(!rec.unmatchedCustomers.includes('My Fatoorah'));
  });
  test('visited clinics with no invoice are listed as pipeline', () => {
    const rec = core.reconcileErp(opts);
    const renova = rec.perRep.find(r => r.rep === 'Renova');
    assert.ok(renova.visitedNoInvoice.some(x => x.clinicId === 'c2'));
  });
  test('manual @ignore mapping removes a customer from the reckoning', () => {
    const rec = core.reconcileErp({ ...opts, erpMap: { 'Joury Clinic': '@ignore' } });
    assert.ok(!rec.unmatchedCustomers.includes('Joury Clinic'));
  });
});

describe('clinicCoverage', () => {
  const today = '2026-08-13';
  const opts = {
    from: '2026-08-06', to: today, today, repFilter: 'all',
    clinics: [
      { id: 'c1', name: 'Visited Clinic', rep: 'Mariam', cls: 'A', nextFollowUp: '2026-08-20' },
      { id: 'c2', name: 'Overdue Clinic', rep: 'Mariam', cls: 'B', nextFollowUp: '2026-08-10' },
      { id: 'c3', name: 'Never Clinic', rep: 'Renova', cls: 'A' },
      { id: 'c4', name: 'Dormant Clinic', rep: 'Renova', cls: 'B' },
      { id: 'c5', name: 'Due Soon Clinic', rep: 'Mariam', cls: 'C', nextFollowUp: '2026-08-18' },
      { id: 'c6', name: 'Closed Clinic', rep: 'Mariam', cls: 'Closed', nextFollowUp: '2026-08-01' },
      { id: 'c7', name: 'Missed Plan Clinic', rep: 'Renova', cls: 'C' },
    ],
    visits: [
      { rep: 'Mariam', clinicId: 'c1', date: '2026-08-10', orderTaken: true, orderTotal: 120, doctorIds: ['d1', 'd2'] },
      { rep: 'Mariam', clinicId: 'c1', date: '2026-08-12', callOnly: true, contactName: 'Dr. X' },
      { rep: 'Renova', clinicId: 'c4', date: '2026-06-01' }, // long ago → dormant
    ],
    dayPlans: { '2026-08-11': { Renova: [{ id: 'c7', note: '' }] } },
  };
  test('aggregates a visited clinic with orders, calls and contacts', () => {
    const cov = core.clinicCoverage(opts);
    assert.equal(cov.visited.length, 1);
    const c = cov.visited[0];
    assert.equal(c.id, 'c1');
    assert.equal(c.visits, 2);
    assert.equal(c.calls, 1);
    assert.equal(c.orders, 1);
    assert.equal(c.revenue, 120);
    assert.equal(c.contacts, 3); // 2 doctors + 1 named call contact
    assert.equal(c.lastDate, '2026-08-12');
    assert.equal(c.detail.length, 2);
  });
  test('needsVisit lists the right reasons, most urgent first', () => {
    const cov = core.clinicCoverage(opts);
    const byId = Object.fromEntries(cov.needsVisit.map(c => [c.id, c]));
    assert.equal(byId.c2.reasons[0].key, 'overdue');
    assert.equal(byId.c7.reasons[0].key, 'missed-plan');
    assert.equal(byId.c3.reasons[0].key, 'never-visited');
    assert.equal(byId.c4.reasons[0].key, 'dormant');
    assert.ok(byId.c4.reasons[0].days >= 60);
    assert.equal(byId.c5.reasons[0].key, 'due-soon');
    assert.equal(byId.c6, undefined); // closed clinics never appear
    assert.equal(byId.c1, undefined); // visited clinics are not "needed"
    // ordering: overdue before missed-plan before never before dormant before due-soon
    assert.deepEqual(cov.needsVisit.map(c => c.id), ['c2', 'c7', 'c3', 'c4', 'c5']);
  });
  test('stats add up and coverage % is right', () => {
    const cov = core.clinicCoverage(opts);
    assert.equal(cov.stats.totalClinics, 6); // closed excluded
    assert.equal(cov.stats.visitedCount, 1);
    assert.equal(cov.stats.coveragePct, 17);
    assert.equal(cov.stats.needsCount, 5);
    assert.equal(cov.stats.revenue, 120);
    assert.equal(cov.stats.contacts, 3);
  });
  test('rep filter narrows both lists', () => {
    const cov = core.clinicCoverage({ ...opts, repFilter: 'Renova' });
    assert.equal(cov.visited.length, 0);
    assert.deepEqual(cov.needsVisit.map(c => c.id).sort(), ['c3', 'c4', 'c7']);
  });
  test('a joint visit covers the clinic for the secondary rep too', () => {
    const cov = core.clinicCoverage({ ...opts, repFilter: 'Renova',
      visits: [...opts.visits, { rep: 'Mariam', withRep: 'Renova', clinicId: 'c3', date: '2026-08-12' }] });
    assert.ok(cov.visited.some(c => c.id === 'c3'));
    assert.ok(!cov.needsVisit.some(c => c.id === 'c3'));
  });
});

describe('erpWeeklyTrend', () => {
  const repMap = { 'Ranova Ayman Mohammed': 'Renova', 'Mariam Zohair': 'Mariam' };
  const rows = [
    { date: '2026-08-03', net: 100, salesman: 'Ranova Ayman Mohammed' }, // week Aug 2–8
    { date: '2026-08-05', net: 50, salesman: 'Mariam Zohair' },
    { date: '2026-08-10', net: 200, salesman: 'Ranova Ayman Mohammed' }, // week Aug 9–15
    { date: '2026-08-12', net: -20, salesman: 'Ranova Ayman Mohammed' }, // a return
    { date: '2026-08-11', net: 999, salesman: 'Mr. Sundeep Kohli' },     // unmapped → skipped
  ];
  test('groups net by Sun–Sat week and by rep, skipping unmapped salesmen', () => {
    const t = core.erpWeeklyTrend(rows, repMap);
    assert.equal(t.length, 2);
    assert.equal(t[0].from, '2026-08-02');
    assert.equal(t[0].to, '2026-08-08');
    assert.equal(t[0].byRep.Renova, 100);
    assert.equal(t[0].byRep.Mariam, 50);
    assert.equal(t[0].total, 150);
    assert.equal(t[1].byRep.Renova, 180); // 200 - 20 return
    assert.equal(t[1].total, 180);
    assert.ok(!('Mariam' in t[1].byRep));
  });
  test('weeks come out in chronological order', () => {
    const t = core.erpWeeklyTrend(rows.slice().reverse(), repMap);
    assert.ok(t[0].from < t[1].from);
  });
  test('empty input gives an empty trend', () => {
    assert.deepEqual(core.erpWeeklyTrend([], repMap), []);
    assert.deepEqual(core.erpWeeklyTrend(rows, {}), []);
  });
});

describe('parseTargetsFile', () => {
  const REPS = ['Renova', 'Mariam'];
  test('reads a CSV with name and target columns', () => {
    const csv = 'Salesman Name,Monthly Target,Visits Target\nRanova Ayman Mohammed,"12,000",60\nMariam Zohair,4000,40\nMr. Sundeep Kohli,30000,0\n';
    const res = core.parseTargetsFile(csv, REPS);
    assert.equal(res.error, null);
    assert.equal(res.targets.Renova.revenue, 12000);
    assert.equal(res.targets.Renova.visits, 60);
    assert.equal(res.targets.Mariam.revenue, 4000);
    assert.deepEqual(res.unmatched, ['Mr. Sundeep Kohli']);
  });
  test('reads plain "name amount" lines', () => {
    const res = core.parseTargetsFile('Renova 12000\nMariam: 4,000\n', REPS);
    assert.equal(res.error, null);
    assert.equal(res.targets.Renova.revenue, 12000);
    assert.equal(res.targets.Mariam.revenue, 4000);
  });
  test('rejects a wall of ambiguous number lines', () => {
    const wall = Array.from({length: 20}, (_, i) => `Row Item ${'x'.repeat(1)} ${i + 1}00`).join('\n')
      .replace(/Row Item x (\d+)/g, 'Rowitem $1'); // letters + trailing number, 20 lines
    const res = core.parseTargetsFile(wall, REPS);
    assert.equal(res.error, 'AMBIGUOUS');
  });
  test('no matchable names → NO_MATCH, gibberish → NO_TARGETS', () => {
    assert.equal(core.parseTargetsFile('Somebody Else 900', REPS).error, 'NO_MATCH');
    assert.equal(core.parseTargetsFile('total garbage without numbers', REPS).error, 'NO_TARGETS');
  });
});

// ---------- XLSX reading & DSR targets (validated on the real DSR file) ----------

describe('readXlsx + parseDsrTargets (real DSR workbook)', () => {
  const fs = require('fs');
  const DSR = '/root/.claude/uploads/e7014514-068b-5bb6-b42f-579bf8c47791/089d4563-DSR_11.08.26_.xlsx';
  const available = fs.existsSync(DSR);
  test('reads the workbook sheets and cells', { skip: !available }, async () => {
    const sheets = await core.readXlsx(fs.readFileSync(DSR));
    assert.equal(sheets.length, 2);
    assert.ok(sheets[1].rows.some(r => (r || []).includes('Mariam Zohair')));
  });
  test('extracts per-rep totals and brand targets', { skip: !available }, async () => {
    const sheets = await core.readXlsx(fs.readFileSync(DSR));
    const tg = core.parseDsrTargets(sheets, ['Renova', 'Mariam']);
    assert.equal(tg.error, null);
    assert.equal(tg.targets.Mariam.revenue, 11621.92);
    assert.equal(tg.targets.Renova.revenue, 12563.08);
    assert.equal(tg.targets.Mariam.brands['Intensiv'], 4700);
    assert.equal(tg.targets.Renova.brands['UNIVET'], 2533);
    // channel blocks (not people) are skipped, not force-matched
    assert.ok(tg.unmatched.includes('Pharmacy'));
    assert.ok(!('Pharmacy' in tg.targets));
  });
});

describe('parseDsrTargets (synthetic block layout)', () => {
  const sheets = [{ name: 'S', rows: [
    ['Salesman ', 'Brand', 'Target', 'MTD'],
    ['Mariam Zohair', 'Intensiv', '4700', ''],
    ['', 'Tepe', '138', ''],
    ['Mariam Zohair Total', '', '4838', ''],
    ['Ranova Ayman', 'UNIVET', '2533', ''],
    ['Ranova Ayman Total', '', '', ''], // empty total → falls back to brand sum
  ]}];
  test('closes blocks on Total rows and sums when the total is missing', () => {
    const tg = core.parseDsrTargets(sheets, ['Renova', 'Mariam']);
    assert.equal(tg.targets.Mariam.revenue, 4838);
    assert.equal(tg.targets.Mariam.brands['Tepe'], 138);
    assert.equal(tg.targets.Renova.revenue, 2533);
  });
  test('empty sheets error cleanly', () => {
    assert.equal(core.parseDsrTargets([{ name: 'S', rows: [] }], ['Mariam']).error, 'NO_TARGETS');
  });
});

describe('normBrand', () => {
  test('unifies DSR and ERP brand spellings', () => {
    assert.equal(core.normBrand('Philips Sonicare'), core.normBrand('Philips Export BV'));
    assert.equal(core.normBrand('BHF'), core.normBrand('Beverly Hills'));
    assert.equal(core.normBrand('Shenzen'), core.normBrand('Shenzhen'));
    assert.equal(core.normBrand('Tepe'), core.normBrand('TEPE'));
    assert.equal(core.normBrand('EverBrands'), core.normBrand('EverSmile'));
  });
  test('unknown brands pass through lowercased', () => {
    assert.equal(core.normBrand('Some New Brand'), 'some new brand');
  });
});
