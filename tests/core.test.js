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
  test('phone calls and remote orders never count as field visits', () => {
    const vs = [
      { rep: 'Mariam', clinicId: 'c1', orderTaken: false },                 // field visit
      { rep: 'Mariam', clinicId: 'c1', callOnly: true, channel: 'call' },   // phone call
      { rep: 'Mariam', clinicId: 'c3', orderOnly: true, orderTaken: true, orderTotal: 40 }, // remote order
    ];
    const s = core.computeScoreForVisits('Mariam', vs, CLINICS);
    assert.equal(s.visits, 1);          // only the field visit
    assert.equal(s.calls, 1);
    assert.equal(s.remoteOrders, 1);
    assert.equal(s.orders, 1);          // the remote order still counts as an order
    assert.equal(s.revenue, 40);        // and its revenue is kept
    assert.equal(s.conversion, 0);      // the one field visit closed no order
  });
  test('a joint visit is credited to BOTH reps but its revenue is not double-counted', () => {
    const vs = [
      { rep: 'Mariam', withRep: 'Renova', clinicId: 'c1', orderTaken: true, orderTotal: 200 },
    ];
    const m = core.computeScoreForVisits('Mariam', vs, CLINICS);
    const r = core.computeScoreForVisits('Renova', vs, CLINICS);
    assert.equal(m.visits, 1);          // lead
    assert.equal(r.visits, 1);          // colleague also gets the visit
    assert.equal(m.revenue, 200);       // money stays with the lead
    assert.equal(r.revenue, 0);         // colleague does not double-count it
  });
  test('an accidental duplicate visit is counted once', () => {
    const dup = { rep: 'Mariam', clinicId: 'c1', date: '2026-08-10', orderTaken: false, notes: 'intro' };
    const s = core.computeScoreForVisits('Mariam', [dup, { ...dup }], CLINICS);
    assert.equal(s.visits, 1);
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
  test('matchCustomer keeps branches separate and reports ambiguity instead of guessing', () => {
    const branches = [
      { id: 'sal', name: 'Aline Clinic - Salmiya', rep: 'Renova' },
      { id: 'haw', name: 'Aline Clinic - Hawally', rep: 'Renova' },
      { id: 'noor', name: 'Al-Noor Dental Center', rep: 'Renova' },
    ];
    // A branch-specific name resolves to that exact branch.
    assert.equal(core.matchCustomer('Aline Clinic Salmiya', branches, {}).clinicId, 'sal');
    assert.equal(core.matchCustomer('Aline Clinic Hawally', branches, {}).clinicId, 'haw');
    // A bare parent name tying two branches of ONE family resolves to the
    // family (counted once under its primary branch) — the supervisor asked
    // that multi-branch clinics never split or double across branches.
    const fam = core.matchCustomer('Aline Clinic', branches, {});
    assert.equal(fam.method, 'family');
    assert.equal(fam.clinicId, 'haw'); // deterministic: sorted first branch id
    assert.equal(fam.branches, 2);
    // A tie across DIFFERENT owners is still ambiguous — never guessed.
    const twoReps = [
      { id: 'a1', name: 'Shifa Clinic - Salmiya', rep: 'Mariam' },
      { id: 'a2', name: 'Shifa Clinic - Hawally', rep: 'Renova' },
    ];
    const amb = core.matchCustomer('Shifa Clinic', twoReps, {});
    assert.equal(amb.clinicId, null);
    assert.equal(amb.ambiguous, true);
    // A spacing/spelling variant matches via the de-spaced fallback.
    assert.equal(core.matchCustomer('Alnoor Medical Co', branches, {}).clinicId, 'noor');
    // A manual override always beats an otherwise-ambiguous name.
    assert.equal(core.matchCustomer('Aline Clinic', branches, { 'Aline Clinic': 'haw' }).clinicId, 'haw');
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
  test('a matched clinic\'s sales go to the clinic owner, not the invoice salesman', () => {
    // Smart Clinic belongs to Mariam, but the ERP invoice was booked under a
    // salesman that maps to Renova. Territory attribution credits Mariam.
    const cl = [{ id: 'smart', name: 'Smart Dental Clinic', rep: 'Mariam', cls: 'A' }];
    const rows = [{ date: '2026-08-10', doc: 'SINV9', type: 'invoice', net: 300, sret: 0,
      salesman: 'Renova Ayman', customer: 'Smart Dental Clinic', brand: 'TEPE', cls: 'Clinics' }];
    const rm = { 'Renova Ayman': 'Renova', 'Mariam Z': 'Mariam' };
    assert.equal(core.erpRowRep(rows[0], cl, {}, rm), 'Mariam');
    const rec = core.reconcileErp({ rows, visits: [], clinics: cl, erpMap: {}, repMap: rm, from: '2026-08-01', to: '2026-08-31' });
    const mariam = rec.perRep.find(r => r.rep === 'Mariam');
    const renova = rec.perRep.find(r => r.rep === 'Renova');
    assert.ok(mariam && mariam.erp.net === 300);   // credited to the owner
    assert.ok(!renova);                            // not to the invoice salesman's rep
  });
  test('an unmatched / channel customer still falls back to the salesman mapping', () => {
    const cl = [{ id: 'smart', name: 'Smart Dental Clinic', rep: 'Mariam' }];
    const rm = { 'Renova Ayman': 'Renova' };
    // My Fatoorah is a channel, no clinic → salesman decides the rep.
    assert.equal(core.erpRowRep({ salesman: 'Renova Ayman', customer: 'My Fatoorah' }, cl, {}, rm), 'Renova');
    // A never-added clinic name → salesman decides.
    assert.equal(core.erpRowRep({ salesman: 'Renova Ayman', customer: 'Brand New Place' }, cl, {}, rm), 'Renova');
  });
  test('a phone call is NOT a field visit, so it never fakes a visit→invoice link', () => {
    const rec = core.reconcileErp({ ...opts,
      visits: [{ date: '2026-08-10', rep: 'Mariam', clinicId: 'c1', callOnly: true }] });
    const mariam = rec.perRep.find(r => r.rep === 'Mariam');
    assert.equal(mariam.matched.length, 0);                 // call ≠ visit
    assert.ok(mariam.invoicedNoVisit.some(x => x.clinicId === 'c1')); // Bayan: invoiced, not visited
  });
  test('a joint visit credits the non-lead rep in reconciliation too', () => {
    // Pharmacy Plus (c2) is Renova's clinic → its invoice attributes to Renova;
    // the visit is led by Mariam with Renova joining, so Renova is credited.
    const rec = core.reconcileErp({ ...opts,
      rows: [{ date: '2026-08-10', doc: 'S1', type: 'invoice', net: 100, sret: 0, salesman: 'Mariam Zohair', customer: 'Pharmacy Plus', brand: 'TEPE', cls: 'Clinics' }],
      visits: [{ date: '2026-08-10', rep: 'Mariam', withRep: 'Renova', clinicId: 'c2', orderTaken: false }] });
    const renova = rec.perRep.find(r => r.rep === 'Renova');
    assert.ok(renova);
    assert.equal(renova.matched.length, 1);        // owned by Renova + jointly visited → matched
    assert.equal(renova.invoicedNoVisit.length, 0);
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
    assert.equal(c.visits, 1);              // one FIELD visit (the call does not count)
    assert.equal(c.calls, 1);              // the call is kept as a sub-metric
    assert.equal(c.orders, 1);
    assert.equal(c.revenue, 120);
    assert.equal(c.contacts, 2);           // 2 doctors on the field visit (call contact excluded)
    assert.equal(c.lastDate, '2026-08-10'); // last FIELD visit, not the later call
    assert.equal(c.detail.length, 1);
  });
  test('a clinic that was only phoned is NOT covered and reads as never-visited', () => {
    const o = { ...opts,
      clinics: [{ id: 'p1', name: 'Phoned Only', rep: 'Mariam', cls: 'A' }],
      visits: [{ rep: 'Mariam', clinicId: 'p1', date: '2026-08-12', callOnly: true }],
      dayPlans: {} };
    const cov = core.clinicCoverage(o);
    assert.equal(cov.stats.visitedCount, 0);
    assert.equal(cov.stats.coveragePct, 0);
    const p1 = cov.needsVisit.find(x => x.id === 'p1');
    assert.ok(p1);
    assert.equal(p1.reasons[0].key, 'never-visited'); // phone contact ≠ a visit
    assert.equal(p1.lastVisit, null);
  });
  test('needsVisit lists the right reasons, most urgent first', () => {
    const cov = core.clinicCoverage(opts);
    const byId = Object.fromEntries(cov.needsVisit.map(c => [c.id, c]));
    assert.equal(byId.c2.reasons[0].key, 'overdue');
    assert.equal(byId.c7.reasons[0].key, 'missed-plan');
    assert.equal(byId.c3.reasons[0].key, 'never-visited');
    assert.equal(byId.c4.reasons[0].key, 'dormant');
    assert.ok(byId.c4.reasons[0].days >= 60);
    // c5 has never been visited at all — that outranks its upcoming follow-up,
    // and applies to every class (dormancy used to be judged for A/B only).
    assert.equal(byId.c5.reasons[0].key, 'never-visited');
    assert.ok(byId.c5.reasons.some(r => r.key === 'due-soon'));
    assert.equal(byId.c6, undefined); // closed clinics never appear
    assert.equal(byId.c1, undefined); // visited clinics are not "needed"
    // ordering: overdue, missed-plan, never-visited (A before C), dormant
    assert.deepEqual(cov.needsVisit.map(c => c.id), ['c2', 'c7', 'c3', 'c5', 'c4']);
  });
  test('every active clinic is either visited or listed — the counts reconcile', () => {
    // c8: visited before the window, not dormant yet, no follow-up flags —
    // used to vanish from both lists, making visited + unvisited ≠ total.
    const o = { ...opts,
      clinics: [...opts.clinics, { id: 'c8', name: 'Quiet Recent', rep: 'Mariam', cls: 'D' }],
      visits: [...opts.visits, { rep: 'Mariam', clinicId: 'c8', date: '2026-08-01' }] };
    const cov = core.clinicCoverage(o);
    const c8 = cov.needsVisit.find(c => c.id === 'c8');
    assert.ok(c8, 'c8 must appear in the unvisited list');
    assert.equal(c8.reasons[0].key, 'not-covered');
    assert.equal(c8.lastVisit, '2026-08-01');
    assert.equal(cov.stats.visitedCount + cov.stats.needsCount, cov.stats.totalClinics);
  });
  test('stats add up and coverage % is right', () => {
    const cov = core.clinicCoverage(opts);
    assert.equal(cov.stats.totalClinics, 6); // closed excluded
    assert.equal(cov.stats.visitedCount, 1);
    assert.equal(cov.stats.coveragePct, 17);
    assert.equal(cov.stats.needsCount, 5);
    assert.equal(cov.stats.revenue, 120);
    assert.equal(cov.stats.contacts, 2); // field-visit contacts only (the call's contact is excluded)
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

describe('DSR achieved sales (MTD)', () => {
  const fs = require('fs');
  const DSR = '/root/.claude/uploads/e7014514-068b-5bb6-b42f-579bf8c47791/089d4563-DSR_11.08.26_.xlsx';
  const available = fs.existsSync(DSR);
  test('erpNum reads leading-minus negatives (regression)', () => {
    assert.equal(core.erpNum('-78.4'), -78.4);
    assert.equal(core.erpNum('-0.005'), -0.005);
    assert.equal(core.erpNum('78.4'), 78.4);
  });
  test('extracts official achieved totals and per-brand MTD from the real file', { skip: !available }, async () => {
    const sheets = await core.readXlsx(fs.readFileSync(DSR));
    const tg = core.parseDsrTargets(sheets, ['Renova', 'Mariam'], { asOf: '2026-08-11' });
    assert.equal(tg.targets.Mariam.achieved, 803.88);
    assert.equal(tg.targets.Renova.achieved, 3567.981);
    assert.equal(tg.targets.Mariam.achievedAsOf, '2026-08-11');
    assert.equal(tg.targets.Mariam.achievedBrands['Intensiv'], 420);
    assert.equal(tg.targets.Renova.achievedBrands['UNIVET'], 600);
    // targets from the previous behavior are unchanged
    assert.equal(tg.targets.Mariam.revenue, 11621.92);
    assert.equal(tg.targets.Renova.revenue, 12563.08);
  });
  test('coach prefers the official achieved figure with as-of pacing', () => {
    const today = '2026-08-25';
    const base = { from: '2026-08-01', to: today, today, repFilter: 'all',
      visits: [], clinics: [], dayPlans: {} };
    // No official figure: 0 logged revenue → far behind.
    const plain = core.coachInsights({ ...base, targets: { Mariam: { revenue: 1000 } } })
      .find(i => i.key === 'target-Mariam');
    assert.equal(plain.level, 'act');
    // Official figure says she already passed the prorated pace at its as-of date.
    const official = core.coachInsights({ ...base, targets: {
      Mariam: { revenue: 1000, achieved: 500, achievedAsOf: '2026-08-11' } } })
      .find(i => i.key === 'target-Mariam');
    assert.equal(official.level, 'good'); // 500 ≥ 1000*11/31≈355
    assert.match(official.detail, /official DSR figure/);
    // A stale as-of (previous month) is ignored.
    const stale = core.coachInsights({ ...base, targets: {
      Mariam: { revenue: 1000, achieved: 500, achievedAsOf: '2026-07-11' } } })
      .find(i => i.key === 'target-Mariam');
    assert.equal(stale.level, 'act');
  });
  test('a current-month DSR is authoritative even over fresher ERP sales', () => {
    const today = '2026-08-25';
    const base = { from: '2026-08-01', to: today, today, repFilter: 'all',
      visits: [], clinics: [], dayPlans: {},
      targets: { Mariam: { revenue: 1000, achieved: 200, achievedAsOf: '2026-08-11' } } };
    // ERP upload covers LATER dates — the DSR still wins: it is the company's
    // official reconciled figure, and raw invoices may include rows it excludes.
    const dsrWins = core.coachInsights({ ...base,
      erpMtd: { Mariam: { amount: 600, asOf: '2026-08-20' } } })
      .find(i => i.key === 'target-Mariam');
    assert.match(dsrWins.detail, /200\.00 KD \(official DSR figure\)/);
    // No current-month DSR → ERP sales fill in.
    const erpFills = core.coachInsights({ ...base,
      targets: { Mariam: { revenue: 1000 } },
      erpMtd: { Mariam: { amount: 600, asOf: '2026-08-20' } } })
      .find(i => i.key === 'target-Mariam');
    assert.match(erpFills.detail, /600\.00 KD \(from uploaded sales\)/);
  });
});

describe('report helpers: forecast, returns, coach data payloads', () => {
  test('forecastMonthEnd projects straight-line pace', () => {
    assert.equal(core.forecastMonthEnd(1000, 10, 31), 3100);
    assert.equal(core.forecastMonthEnd(0, 10, 31), 0);
    assert.equal(core.forecastMonthEnd(500, 0, 31), 0); // day zero → no projection
  });
  test('return value is NET of the return line discount (Discount. Sales Ret)', () => {
    // The real bug: SRT0009165 line — 37.5 gross return with a 3.75 discount.
    // Counting the gross made the return LARGER than the discounted order.
    const srt = { type: 'return', sret: 37.5, dsret: 3.75, net: -33.75 };
    assert.equal(core.returnValue(srt), 33.75);
    // SRT line with no net figure → gross minus its discount.
    const srtNoNet = { type: 'return', sret: 10, dsret: 1, net: 0 };
    assert.equal(core.returnValue(srtNoNet), 9);
    // Legacy shape: a "Sales Return" column on an invoice line.
    assert.equal(core.returnValue({ type: 'invoice', sret: 20, dsret: 2, net: 80 }), 18);
    // Old saved rows have no dsret at all — unchanged behavior.
    assert.equal(core.returnValue({ type: 'return', sret: 15, net: -15 }), 15);
    assert.equal(core.returnValue({ type: 'invoice', net: 50 }), 0);
  });
  test('parser captures the return-discount column without confusing it with the sales discount', () => {
    const csv = [
      'Date,Type,Invoice#,Product,Quantity,Sales Gross,Discount Sales,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Account,Customer Class,Name',
      '2026-08-05,SalesReturn,SRT0009165,Waterpik Ion,-3,0,0,0,37.5,3.75,-33.75,WATERPIK,Lulu Trading,Hypermarkets,Mr. Sundeep Kohli',
      '2026-08-06,SalesInvoice,SINV0075029,Waterpik Cordless,1,35,7,28,0,0,28,WATERPIK,My Fatoorah,Online Customers ,Ranova Ayman',
    ].join('\n');
    const res = core.parseErpCsv(csv);
    assert.equal(res.error, null);
    const ret = res.rows.find(r => r.doc === 'SRT0009165');
    assert.equal(ret.sret, 37.5);
    assert.equal(ret.dsret, 3.75);
    assert.equal(core.returnValue(ret), 33.75);
    // The invoice line's own discount column must NOT leak into dsret.
    const inv = res.rows.find(r => r.doc === 'SINV0075029');
    assert.equal(inv.dsret, 0);
    assert.equal(inv.net, 28);
    // erpTotals' returned value is net of the discount too.
    assert.equal(core.erpTotals(res.rows).sret, 33.75);
  });
  test('multi-branch clinic: sales and returns unify to ONE family line, counted once', () => {
    const clinics = [
      { id: 'b1', name: 'Aline Clinic - Salmiya', rep: 'Renova' },
      { id: 'b2', name: 'Aline Clinic - Hawally', rep: 'Renova' },
      { id: 'x1', name: 'New Smile Center', rep: 'Renova' },
      { id: 'x2', name: 'New Dawn Clinic', rep: 'Renova' },
    ];
    const fams = core.clinicFamilies(clinics);
    // Aline branches form one family; "New X"/"New Y" never merge on a 3-char word.
    assert.equal(fams.byClinic['b1'], fams.byClinic['b2']);
    assert.ok(fams.byClinic['b1']);
    assert.equal(fams.byClinic['x1'], undefined);
    assert.equal(fams.byClinic['x2'], undefined);
    // The family label is the real name word, not noise like "Dr.".
    assert.equal(fams.fams[fams.byClinic['b1']].label, 'Aline');
    // A doctor's CLINIC and his PHARMACY are different entities, never branches.
    const nael = core.clinicFamilies([
      { id: 'n1', name: 'Dr. Nael Al Hazeem Dental Center - Sharq', rep: 'Mariam' },
      { id: 'n2', name: 'Dr. Nael Al Hazeem Pharmacy ( Al Soor )', rep: 'Mariam' },
    ]);
    assert.equal(nael.byClinic['n1'], undefined);
    assert.equal(nael.byClinic['n2'], undefined);
    // Arabic generic words never form a family: عيادة النور ≠ عيادة السلام.
    const ar = core.clinicFamilies([
      { id: 'a1', name: 'عيادة النور', rep: 'Mariam' },
      { id: 'a2', name: 'عيادة السلام', rep: 'Mariam' },
    ]);
    assert.equal(ar.byClinic['a1'], undefined);
    // Real Arabic branches DO unify: عيادة الين السالمية / عيادة الين حولي.
    const arFam = core.clinicFamilies([
      { id: 'f1', name: 'عيادة الين السالمية', rep: 'Renova' },
      { id: 'f2', name: 'عيادة الين حولي', rep: 'Renova' },
    ]);
    assert.equal(arFam.byClinic['f1'], arFam.byClinic['f2']);
    assert.ok(arFam.byClinic['f1']);
    // Clinics with NO rep never auto-cluster.
    const norep = core.clinicFamilies([
      { id: 'u1', name: 'Noor Clinic A' },
      { id: 'u2', name: 'Noor Clinic B', rep: '' },
    ]);
    assert.equal(norep.byClinic['u1'], undefined);
    // Different owners never form a family (checked via matchCustomer tie above).
    // Returns to two branches roll up to one line whose amount is the plain sum
    // — each row counted exactly once, no doubling.
    const rows = [
      { date: '2026-08-10', doc: 'SRT1', type: 'return', net: -30, sret: 30, customer: 'Aline Clinic Salmiya', brand: 'X' },
      { date: '2026-08-11', doc: 'SRT2', type: 'return', net: -20, sret: 20, customer: 'Aline Clinic Hawally', brand: 'X' },
    ];
    const ra = core.returnsAnalysis(rows, { clinics, erpMap: {} });
    assert.equal(ra.total, 50);
    assert.equal(ra.byCustomer.length, 1);
    assert.match(ra.byCustomer[0].name, /^Aline \(2\)$/);
    assert.equal(ra.byCustomer[0].amount, 50);
    // Without clinics context the old per-customer behavior is unchanged.
    assert.equal(core.returnsAnalysis(rows).byCustomer.length, 2);
    // A parent-named invoice attributes to the family owner exactly once.
    const rep = core.erpRowRep({ customer: 'Aline Clinic', salesman: 'Someone' }, clinics, {}, {});
    assert.equal(rep, 'Renova');
  });
  test('file-type routing: the DSR workbook and the sales-detail export never cross-parse', () => {
    // Real sales-detail header (Ultramed_Sales3): recognized as ERP sales.
    const salesCsv = [
      ',Date,Type,,Invoice#,Date of Stock Issue,Stock Issue #,Code,Account,Customer Class,Code,AltCode,Product,Quantity,Sales Gross,Discount Sales,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name,Remarks,',
      ',2026-08-01 00:00:00,SalesInvoice,Credit,SINV0075029,2026-08-01,MIV1,080042,My Fatoorah,Online Customers ,WP,05,Waterpik,1,35,7,28,0,0,28,WATERPIK,Ranova Ayman Mohammed,notes,',
    ].join('\n');
    assert.equal(core.parseErpCsv(salesCsv).error, null);
    // Real DSR sheet shape: rejected by the sales parser (no per-row date/doc),
    // accepted by the targets parser — so the xlsx router can never mix them up.
    const dsrSheets = [{ title: 'Sheet2', rows: [
      ['Salesman ', 'Brand', 'Target', 'MTD Sales 26', 'Achieved vs. Target'],
      ['Mariam Zohair', 'B&L Biotech', 780, '', 0],
      ['Mariam Zohair Total', '', 11621.92, 5298.36, 0.46],
      ['Ranova Ayman', 'B&L Biotech', 1520, 643.5, 0.42],
      ['Ranova Ayman Total', '', 12563.08, 7501.41, 0.6],
    ]}];
    const dsrCsv = dsrSheets[0].rows.map(r => r.join(',')).join('\n');
    assert.equal(core.parseErpCsv(dsrCsv).error, 'NO_HEADER');
    const tg = core.parseDsrTargets(dsrSheets, ['Mariam', 'Renova'], { asOf: '2026-08-23' });
    assert.equal(tg.error, null);
    assert.equal(tg.targets.Mariam.achieved, 5298.36);
    assert.equal(tg.targets.Renova.achieved, 7501.41);
    // And a DSR-shaped text never parses as a targets file by the SALES path.
    assert.equal(core.parseErpFile(dsrCsv).error, 'UNRECOGNIZED');
  });
  test('brand aliases join every real DSR target name to its ERP invoice spelling', () => {
    // The guidance can only cover ALL products if the DSR's target names and
    // the ERP's invoice brand names normalize to the same key — these are the
    // real pairs from the shipped files, locked so a rename never splits them.
    const pairs = [
      ['Philips Sonicare', 'Philips Export BV'],
      ['BHF', 'Beverly Hills Formula'],
      ['EverBrands', 'EverBrands'],
      ['Combo/ Bundle/ Kit', 'Combo/Bundle/Kit'],
      ['Tepe', 'TEPE'],
      ['The Breath Co.', 'The Breath Co.'],
      ['Waterpik', 'WATERPIK'],
      ['HiSmile', 'Hismile'],
      ['Flash', 'FLASH'],
      ['UNDO', 'UNDO'],
      ['UNIVET', 'UNIVET'],
      ['Intensiv', 'Intensiv'],
      ['SCHEU', 'SCHEU'],
      ['B&L Biotech', 'B&L Biotech'],
    ];
    pairs.forEach(([dsr, erp]) => {
      assert.equal(core.normBrand(dsr), core.normBrand(erp),
        `DSR '${dsr}' and ERP '${erp}' must share one brand key`);
    });
    // Every one of these target brands therefore accumulates sold value in
    // guidance; a brand with no sales this month simply shows a full gap.
  });
  test('unitSellPlan turns a brand gap into concrete product units covering the gap', () => {
    const clinicRows = [
      { type: 'invoice', brand: 'WATERPIK', product: 'Cordless Plus', qty: 2, net: 46 },   // 23/unit, clinic re-buys this
    ];
    const allRows = [
      { type: 'invoice', brand: 'WATERPIK', product: 'Cordless Plus', qty: 20, net: 460 },
      { type: 'invoice', brand: 'WATERPIK', product: 'Cordless Freedom', qty: 30, net: 600 }, // 20/unit, market best seller
      { type: 'return',  brand: 'WATERPIK', product: 'Cordless Plus', qty: -5, net: -115 },   // returns never suggest units
      { type: 'invoice', brand: 'TEPE', product: 'Mini Flosser', qty: 50, net: 75 },          // other brand ignored
    ];
    const plan = core.unitSellPlan({ brand: 'Waterpik', gap: 120, clinicRows, allRows, products: [] });
    assert.ok(plan.length >= 1);
    // The clinic's own repeat product leads the plan.
    assert.equal(plan[0].product, 'Cordless Plus');
    assert.equal(plan[0].mine, true);
    // Units are whole numbers and the plan covers the whole gap.
    plan.forEach(x => { assert.ok(Number.isInteger(x.units) && x.units >= 1); });
    const total = plan.reduce((s2, x) => s2 + x.amount, 0);
    assert.ok(total >= 120, `plan total ${total} must cover the 120 gap`);
    // A small gap yields ONE line, not a scatter of one-unit suggestions.
    const small = core.unitSellPlan({ brand: 'Waterpik', gap: 25, clinicRows, allRows, products: [] });
    assert.equal(small.length, 1);
    assert.equal(small[0].units, Math.ceil(25 / small[0].price));
    // No ERP history at all -> catalog fallback with list prices.
    const cat = core.unitSellPlan({ brand: 'Silonn', gap: 50, clinicRows: [], allRows: [],
      products: [{ name: 'Silonn Flosser X', brand: 'Silonn', price: 12 }] });
    assert.equal(cat.length, 1);
    assert.equal(cat[0].product, 'Silonn Flosser X');
    assert.equal(cat[0].units, 5); // ceil(50/12)
    // Zero or negative gap -> no plan.
    assert.deepEqual(core.unitSellPlan({ brand: 'Waterpik', gap: 0, clinicRows, allRows }), []);
  });
  test('crossSellPlan reads the buying profile and proves every suggestion', () => {
    const products = [
      { id: 'wp-plus',  name: 'Waterpik Cordless Plus',    brand: 'Waterpik', cat: 'Water Flosser',       price: 23 },
      { id: 'wp-pro',   name: 'Waterpik Aquarius Pro',     brand: 'Waterpik', cat: 'Water Flosser',       price: 62 },
      { id: 'tepe-mix', name: 'TePe Angle Mixed Pack',     brand: 'TePe',     cat: 'Interdental Brushes', price: 3 },
      { id: 'son-4300', name: 'Sonicare ProtectiveClean 4300', brand: 'Philips', cat: 'Electric Toothbrush', price: 35 },
    ];
    const clinics = [
      { id: 'me',   name: 'Bayan Dental Center', cls: 'A', rep: 'Mariam' },
      { id: 'peer', name: 'Apex Dental Center',  cls: 'A', rep: 'Mariam' },
      { id: 'far',  name: 'Joury Clinic',        cls: 'D', rep: 'Renova' },
    ];
    const row = (customer, product, brand, qty, net, date) =>
      ({ type: 'invoice', customer, product, brand, qty, net, date, doc: 'INV' });
    const erpRows = [
      // this clinic: two water-flosser orders of the entry model
      row('Bayan Dental Center', 'Waterpik Cordless Plus', 'WATERPIK', 2, 46, '2026-07-05'),
      row('Bayan Dental Center', 'Waterpik Cordless Plus', 'WATERPIK', 1, 23, '2026-07-20'),
      // a comparable A-class clinic: the premium model AND a category this one never buys
      row('Apex Dental Center', 'Waterpik Aquarius Pro', 'WATERPIK', 3, 186, '2026-07-10'),
      row('Apex Dental Center', 'TePe Angle Mixed Pack', 'TEPE', 40, 120, '2026-07-11'),
      row('Joury Clinic',       'TePe Angle Mixed Pack', 'TEPE', 10, 30,  '2026-07-12'),
      // returns never count as a purchase
      { type: 'return', customer: 'Bayan Dental Center', product: 'Waterpik Cordless Plus',
        brand: 'WATERPIK', qty: -1, net: -23, date: '2026-07-21', doc: 'SRT' },
    ];
    const plan = core.crossSellPlan({ clinicId: 'me', clinics, products, erpRows, erpMap: {}, today: '2026-09-10' });

    // what they buy today
    assert.equal(plan.bought.length, 1);
    assert.equal(plan.bought[0].product, 'Waterpik Cordless Plus');
    assert.equal(plan.bought[0].units, 3);          // the return is excluded
    assert.equal(plan.bought[0].net, 69);
    assert.equal(plan.bought[0].times, 2);
    assert.equal(plan.catsBought, 1);

    // up-sell: the premium model inside the category they already buy
    assert.equal(plan.upsell.length, 1);
    assert.equal(plan.upsell[0].product, 'Waterpik Aquarius Pro');
    assert.equal(plan.upsell[0].price, 62);
    assert.equal(plan.upsell[0].from, 23);
    assert.equal(plan.upsell[0].buyers, 1);
    assert.match(plan.upsell[0].reason, /step up, and 1 other clinic takes it/);

    // cross-sell: a category comparable clinics buy and this one never has
    assert.equal(plan.cross.length, 1);
    assert.equal(plan.cross[0].cat, 'Interdental Brushes');
    assert.equal(plan.cross[0].product, 'TePe Angle Mixed Pack');
    assert.equal(plan.cross[0].price, 3);
    // Only the comparable buyer counts: the D-class clinic buys interdental
    // brushes too, but shares no class and no category with this one.
    assert.equal(plan.cross[0].peers, 1);
    assert.match(plan.cross[0].reason, /never has/);

    // lapsed: a repeat purchase that stopped
    assert.equal(plan.lapsed.length, 1);
    assert.equal(plan.lapsed[0].product, 'Waterpik Cordless Plus');
    assert.equal(plan.lapsed[0].daysSince, core.daysBetween('2026-07-20', '2026-09-10'));
    assert.match(plan.lapsed[0].reason, /due a re-order/);

    // a clinic still inside its re-order rhythm is not called lapsed
    const fresh = core.crossSellPlan({ clinicId: 'me', clinics, products, erpRows, erpMap: {}, today: '2026-07-25' });
    assert.equal(fresh.lapsed.length, 0);
  });
  test('crossSellPlan falls back to app-logged orders and never throws on empty data', () => {
    const products = [
      { id: 'a', name: 'TePe Angle Mixed Pack', brand: 'TePe', cat: 'Interdental Brushes', price: 3 },
      { id: 'b', name: 'Waterpik Cordless Plus', brand: 'Waterpik', cat: 'Water Flosser', price: 23 },
    ];
    const clinics = [{ id: 'me', name: 'A Clinic', cls: 'B' }, { id: 'p2', name: 'B Clinic', cls: 'B' }];
    const visits = [
      { clinicId: 'me', date: '2026-08-01', orders: [{ items: [{ productId: 'a', qty: 10 }] }] },
      { clinicId: 'p2', date: '2026-08-02', orders: [{ items: [{ productId: 'b', qty: 2 }] }] },
    ];
    const plan = core.crossSellPlan({ clinicId: 'me', clinics, products, visits, erpRows: [], erpMap: {}, today: '2026-08-10' });
    assert.equal(plan.bought[0].product, 'TePe Angle Mixed Pack');
    assert.equal(plan.cross.length, 1);
    assert.equal(plan.cross[0].cat, 'Water Flosser');

    // no data at all, and an unknown clinic id: empty, not broken
    const none = core.crossSellPlan({ clinicId: 'me', clinics, products, erpRows: [], erpMap: {}, today: '2026-08-10' });
    assert.deepEqual([none.bought, none.cross, none.upsell, none.lapsed], [[], [], [], []]);
    const missing = core.crossSellPlan({ clinicId: 'nope', clinics, products, erpRows: [], erpMap: {} });
    assert.deepEqual([missing.bought, missing.cross, missing.upsell, missing.lapsed], [[], [], [], []]);
    assert.deepEqual(core.crossSellPlan({}).bought, []);
  });
  test('matchCatalogProduct bridges free-text invoice names to the catalog', () => {
    const products = [
      { name: 'Waterpik Cordless Plus Water Flosser', brand: 'Waterpik', cat: 'Water Flosser', price: 23 },
      { name: 'TePe Angle Mixed Pack', brand: 'TePe', cat: 'Interdental Brushes', price: 3 },
    ];
    assert.equal(core.matchCatalogProduct('WATERPIK CORDLESS PLUS', products).cat, 'Water Flosser');
    assert.equal(core.matchCatalogProduct('Tepe angle mixed', products).cat, 'Interdental Brushes');
    assert.equal(core.matchCatalogProduct('Completely Unrelated Item', products), null);
    assert.equal(core.matchCatalogProduct('', products), null);
  });
  test('allocateClinicTargets splits brand targets by sales history with class fallback', () => {
    const clinics = [
      { id: 'c1', name: 'Alpha Dental', rep: 'Renova', cls: 'A' },
      { id: 'c2', name: 'Beta Clinic', rep: 'Renova', cls: 'B' },
      { id: 'c3', name: 'Gamma Center', rep: 'Renova', cls: 'C' },
      { id: 'x1', name: 'Other Rep Clinic', rep: 'Mariam', cls: 'A' },
      { id: 'z1', name: 'Old Place', rep: 'Renova', cls: 'Closed' },
    ];
    const rows = [
      // Waterpik history: Alpha 300, Beta 100 -> shares 75% / 25%, Gamma 0.
      { type: 'invoice', customer: 'Alpha Dental', brand: 'WATERPIK', net: 300 },
      { type: 'invoice', customer: 'Beta Clinic', brand: 'Waterpik', net: 100 },
      // Returns never count as sales weight.
      { type: 'return', customer: 'Gamma Center', brand: 'WATERPIK', net: -50, sret: 50 },
    ];
    const res = core.allocateClinicTargets({ rep: 'Renova', clinics, erpRows: rows, erpMap: {},
      brandTargets: { 'Waterpik': 400, 'Tepe': 60 } });
    // History-weighted split for Waterpik.
    assert.equal(res.byClinic['c1'].byBrand['Waterpik'], 300);
    assert.equal(res.byClinic['c2'].byBrand['Waterpik'], 100);
    assert.equal(res.byClinic['c3'].byBrand['Waterpik'], undefined);
    // No Tepe history anywhere -> class weights A3/B2/C1 over 60 = 30/20/10.
    assert.equal(res.byClinic['c1'].byBrand['Tepe'], 30);
    assert.equal(res.byClinic['c2'].byBrand['Tepe'], 20);
    assert.equal(res.byClinic['c3'].byBrand['Tepe'], 10);
    // Per-clinic totals add up; other reps' and Closed clinics get nothing.
    assert.equal(res.byClinic['c1'].total, 330);
    assert.equal(res.byClinic['x1'], undefined);
    assert.equal(res.byClinic['z1'], undefined);
    assert.equal(res.totals.target, 460);
    // The whole target is distributed: sums across clinics equal each brand target.
    const wSum = ['c1','c2','c3'].reduce((s2, id) => s2 + (res.byClinic[id].byBrand['Waterpik'] || 0), 0);
    assert.equal(wSum, 400);
  });
  test('exchange lines leave the returns figures and report as their own bucket', () => {
    const rows = [
      { type: 'return', doc: 'SRT1', net: -100, sret: 100, customer: 'Alpha', brand: 'X', product: 'P1' },
      { type: 'return', doc: 'SRT2', net: -40, sret: 40, customer: 'Beta', brand: 'X', product: 'P2' },
    ];
    const isExchange = r => r.doc === 'SRT2';
    const ra = core.returnsAnalysis(rows, { isExchange });
    assert.equal(ra.total, 100);            // exchange excluded from returns
    assert.equal(ra.count, 1);
    assert.equal(ra.exchange.total, 40);    // ...and reported separately
    assert.equal(ra.exchange.count, 1);
    assert.equal(ra.exchange.detail[0].doc, 'SRT2');
    assert.ok(!ra.byCustomer.some(c => c.name === 'Beta'));
    // erpTotals splits the same way
    const t = core.erpTotals(rows, { isExchange });
    assert.equal(t.sret, 100);
    assert.equal(t.exchanged, 40);
    // without the flag callback nothing changes
    assert.equal(core.returnsAnalysis(rows).total, 140);
  });
  test('doctorAnalytics: cadence, birthday countdown, handover buckets, visit log', () => {
    const today = '2026-08-30'; // Sunday — week starts today
    const clinics = [
      { id: 'c1', name: 'Star Dental', rep: 'Mariam', doctors: [
        { id: 'd1', name: 'Dr. Sara', title: 'Orthodontist', cadence: 'weekly', birthday: '1990-09-05',
          handovers: [
            { id: 'h1', date: '2026-08-30', kind: 'prescription', what: 'Rx pads', qty: 3 },
            { id: 'h2', date: '2026-08-25', kind: 'prescription', what: 'Rx pads', qty: 2 }, // previous week
            { id: 'h3', date: '2026-07-20', kind: 'prescription', what: 'Rx pads', qty: 4 }, // previous month
            { id: 'h4', date: '2026-08-10', kind: 'sample', what: 'Waterpik tips', qty: 5 },
            { id: 'h5', date: '2026-08-12', kind: 'gift', what: 'Mug' },
          ] },
        { id: 'd2', name: 'Dr. Omar', title: '', cadence: 'monthly' }, // never visited -> due
      ] },
      { id: 'c2', name: 'Other Rep Clinic', rep: 'Renova', doctors: [{ id: 'd3', name: 'Dr. X' }] },
    ];
    const visits = [
      { id: 'v1', clinicId: 'c1', rep: 'Mariam', date: '2026-08-10', doctorIds: ['d1'], ts: 1 },
      { id: 'v1dup', clinicId: 'c1', rep: 'Mariam', date: '2026-08-10', doctorIds: ['d1'], ts: 2 }, // double-save
      { id: 'v2', clinicId: 'c1', rep: 'Mariam', date: '2026-08-15', doctorIds: ['d1'], callOnly: true, channel: 'call', ts: 3 },
    ];
    const rows = core.doctorAnalytics({ clinics, visits, today, repFilter: 'Mariam' });
    assert.equal(rows.length, 2); // Renova's doctor filtered out
    const sara = rows.find(d => d.id === 'd1');
    // visits deduped; field + call split; last visit
    assert.equal(sara.fieldVisits, 1);
    assert.equal(sara.calls, 1);
    assert.equal(sara.lastVisit, '2026-08-15');
    // weekly cadence, last seen 15 days ago -> 8 days overdue
    assert.equal(sara.cadenceStatus, 'due');
    assert.equal(sara.overdueDays, 8);
    // birthday Sep 5 is 6 days away
    assert.equal(sara.birthdayIn, 6);
    // handover buckets: qty-aware, week/month windows
    assert.equal(sara.handovers.prescription, 9);
    assert.equal(sara.handovers.rxWeek, 3);
    assert.equal(sara.handovers.rxLastWeek, 2);
    assert.equal(sara.handovers.rxMonth, 5);
    assert.equal(sara.handovers.rxLastMonth, 4);
    assert.equal(sara.handovers.sample, 5);
    assert.equal(sara.handovers.gift, 1);
    // never-visited monthly doctor is due
    const omar = rows.find(d => d.id === 'd2');
    assert.equal(omar.cadenceStatus, 'due');
    assert.equal(omar.lastVisit, null);
  });
  test('doctorAnalytics counts legacy single-doctorId visits and shares multi-doctor visits', () => {
    const clinics = [
      { id: 'c1', name: 'Star Dental', rep: 'Mariam', doctors: [
        { id: 'd1', name: 'Dr. Sara' }, { id: 'd2', name: 'Dr. Omar' } ] },
    ];
    const visits = [
      // old record: doctorId only, no doctorIds array
      { id: 'v1', clinicId: 'c1', rep: 'Mariam', date: '2026-08-10', doctorId: 'd1', ts: 1 },
      // one visit where BOTH doctors were seen — must appear in both reports
      { id: 'v2', clinicId: 'c1', rep: 'Mariam', date: '2026-08-20', doctorIds: ['d1', 'd2'], ts: 2 },
    ];
    const rows = core.doctorAnalytics({ clinics, visits, today: '2026-08-30' });
    const sara = rows.find(d => d.id === 'd1');
    const omar = rows.find(d => d.id === 'd2');
    assert.equal(sara.fieldVisits, 2);        // legacy + shared
    assert.equal(sara.visitLog.length, 2);
    assert.equal(omar.fieldVisits, 1);        // the shared visit shows for him too
    assert.equal(omar.visitLog[0].date, '2026-08-20');
  });
  test('rxGrowth aggregates prescriptions per doctor and clinic with growth %', () => {
    const today = '2026-08-30';
    const clinics = [
      { id: 'c1', name: 'Star Dental', rep: 'Mariam', doctors: [
        { id: 'd1', name: 'Dr. Sara', handovers: [
          { date: '2026-08-30', kind: 'prescription', qty: 6 },
          { date: '2026-08-25', kind: 'prescription', qty: 3 } ] },
        { id: 'd2', name: 'Dr. Omar', handovers: [
          { date: '2026-08-30', kind: 'prescription', qty: 2 },
          { date: '2026-08-05', kind: 'gift' } ] }, // gifts never count as rx
      ] },
    ];
    const g = core.rxGrowth({ clinics, visits: [], today, repFilter: 'all' });
    assert.equal(g.byDoctor.length, 2);
    assert.equal(g.byDoctor[0].name, 'Dr. Sara'); // sorted by month volume
    assert.equal(g.byDoctor[0].week, 6);
    assert.equal(g.byDoctor[0].lastWeek, 3);
    assert.equal(g.byDoctor[0].weekGrowth, 100); // 3 -> 6
    assert.equal(g.byClinic.length, 1);
    assert.equal(g.byClinic[0].month, 11);
    assert.equal(g.byClinic[0].doctors, 2);
    assert.equal(g.totals.week, 8);
    assert.equal(g.totals.lastWeek, 3);
  });
  test('parseContactRows: Arabic/English headers, serial birthdays, specialty mapping', () => {
    const SP = ['General Dentist','Orthodontist','Periodontist','Pedodontist','Prosthodontist','Endodontist','Oral Surgeon','Hygienist','Clinic Manager'];
    const rows = [
      ['اسم الطبيب','العيادة','رقم الهاتف','التخصص','تاريخ الميلاد','ملاحظات'],
      ['د. سارة العلي','عيادة النجمة','99887766','تقويم','31356','تحب Waterpik'],
      ['Dr. Omar Khalid','Star Dental','55443322','General','05/09/1990',''],
      ['د. فهد','', '11112222','جراح','',''],           // no clinic — still parsed
      ['','عيادة بلا اسم','','','',''],                 // no name — skipped
    ];
    const res = core.parseContactRows(rows, SP);
    assert.equal(res.error, null);
    assert.equal(res.contacts.length, 3);
    assert.equal(res.skipped, 1);
    const sara = res.contacts[0];
    assert.equal(sara.name, 'د. سارة العلي');
    assert.equal(sara.clinic, 'عيادة النجمة');
    assert.equal(sara.title, 'Orthodontist');          // Arabic alias mapped
    assert.equal(sara.birthday, '1985-11-05');         // Excel serial converted
    assert.equal(res.contacts[1].title, 'General Dentist');
    assert.equal(res.contacts[1].birthday, '1990-09-05'); // DD/MM/YYYY
    assert.equal(res.contacts[2].title, 'Oral Surgeon');
    // date shapes
    assert.equal(core.parseDateLoose('1985-11-05 00:00:00'), '1985-11-05');
    assert.equal(core.parseDateLoose(''), '');
    assert.equal(core.parseDateLoose('garbage'), '');
    // a sheet with no recognizable header
    assert.equal(core.parseContactRows([['a','b'],['c','d']], SP).error, 'NO_HEADER');
  });
  test('returnsAnalysis groups returned value by brand and customer', () => {
    const rows = [
      { sret: 100, brand: 'Hismile', customer: 'Trolley' },
      { sret: 50, brand: 'Hismile', customer: 'Lulu' },
      { sret: 30, brand: 'FLASH', customer: 'Trolley' },
      { sret: 0, brand: 'TEPE', customer: 'X' }, // not a return
    ];
    const r = core.returnsAnalysis(rows);
    assert.equal(r.total, 180);
    assert.equal(r.count, 3);
    assert.deepEqual(r.byBrand[0], { name: 'Hismile', amount: 150 });
    assert.deepEqual(r.byCustomer[0], { name: 'Trolley', amount: 130 });
  });
  test('returnsAnalysis names each returning clinic in the per-line detail', () => {
    const rows = [
      { date: '2026-08-10', doc: 'SRT1', type: 'return', net: -25, sret: 0, brand: 'FLASH', product: 'Strips', qty: 2, customer: 'Joury Clinic' },
      { date: '2026-08-12', doc: 'SINV5', type: 'invoice', net: 100, sret: 40, brand: 'TEPE', product: 'Brush', qty: 1, customer: 'Lulu Dental' },
      { date: '2026-08-13', doc: 'SINV6', type: 'invoice', net: 80, sret: 0, brand: 'TEPE', product: 'Brush', qty: 4, customer: 'Lulu Dental' },
    ];
    const d = core.returnsAnalysis(rows).detail;
    assert.equal(d.length, 2);
    assert.equal(d[0].customer, 'Lulu Dental');  // biggest return first
    assert.equal(d[0].amount, 40);
    assert.equal(d[1].customer, 'Joury Clinic');
    assert.equal(d[1].product, 'Strips');
    assert.equal(d[1].amount, 25);
  });
  test('isFocRow flags marketing and zero-net lines, never returns or paid sales', () => {
    assert.equal(core.isFocRow({ type: 'invoice', brand: 'Tepe - Marketing', qty: 1, net: 0, sret: 0 }), true);  // marketing brand, no revenue → giveaway
    assert.equal(core.isFocRow({ type: 'invoice', brand: 'Tepe - Marketing', qty: 1, net: 5, sret: 0 }), false); // marketing brand that EARNED net → a real sale, not free
    assert.equal(core.isFocRow({ type: 'invoice', brand: 'TEPE', qty: 3, net: 0, sret: 0 }), true);
    assert.equal(core.isFocRow({ type: 'invoice', brand: 'TEPE', qty: 3, net: 9, sret: 0 }), false);
    assert.equal(core.isFocRow({ type: 'return', brand: 'Tepe - Marketing', qty: 1, net: -5, sret: 0 }), false);
    assert.equal(core.isFocRow({ type: 'invoice', brand: 'TEPE', qty: 1, net: 0, sret: 3 }), false);
  });
  test('focAnalysis tracks marketing-brand rows and zero-net giveaways per clinic', () => {
    const rows = [
      { type: 'invoice', brand: 'Tepe - Marketing', product: 'Sample Kit', qty: 10, gross: 30, net: 0, sret: 0, customer: 'Joury Clinic' },
      { type: 'invoice', brand: 'TEPE', product: 'Brush', qty: 5, gross: 15, net: 0, sret: 0, customer: 'Joury Clinic' },   // bonus goods: qty with zero net
      { type: 'invoice', brand: 'TEPE', product: 'Brush', qty: 3, gross: 9, net: 9, sret: 0, customer: 'Lulu Dental' },     // paid — not FOC
      { type: 'invoice', brand: 'TEPE', product: 'Brush', qty: 1, gross: 3, net: 0, sret: 3, customer: 'Lulu Dental' },     // return line — not FOC
      { type: 'return', brand: 'FLASH', product: 'Strips', qty: 2, gross: 0, net: -10, sret: 0, customer: 'Lulu Dental' },  // return doc — not FOC
    ];
    const f = core.focAnalysis(rows);
    assert.equal(f.count, 2);
    assert.equal(f.totalQty, 15);
    assert.equal(f.grossValue, 45);
    assert.equal(f.byCustomer.length, 1);
    assert.equal(f.byCustomer[0].name, 'Joury Clinic');
    assert.equal(f.byCustomer[0].qty, 15);
    assert.deepEqual(f.byProduct[0], { name: 'Sample Kit', qty: 10, gross: 30 });
  });
  test('parseClinicRows reads Arabic headers, skips totals, normalizes class & phone', () => {
    const r = core.parseClinicRows([
      ['اسم العيادة', 'رقم الهاتف', 'المندوبة', 'الفئة'],
      ['عيادة الابتسامة', '9988-7766', 'Mariam', 'a'],
      ['المجموع', '', '', ''],
    ]);
    assert.equal(r.error, null);
    assert.equal(r.clinics.length, 1);
    assert.deepEqual(r.clinics[0], {name: 'عيادة الابتسامة', phone: '99887766', contact: '', rep: 'Mariam', cls: 'A', market: null, account: null});
    assert.equal(r.skipped, 1);
  });
  test('parseClinicRows handles a headerless name+phone list', () => {
    const r = core.parseClinicRows([['عيادة النور', '55443322'], ['Pearl Clinic', '']]);
    assert.equal(r.clinics.length, 2);
    assert.equal(r.clinics[0].phone, '55443322');
    assert.equal(r.clinics[1].name, 'Pearl Clinic');
  });
  test('parseClinicRows drops a lone label row atop a bare list', () => {
    const r = core.parseClinicRows([['اسم العيادة'], ['عيادة السلام']]);
    assert.deepEqual(r.clinics.map(c => c.name), ['عيادة السلام']);
  });
  test('focLinesAnnotated separates deal bonuses from samples', () => {
    const rows = [
      {doc: 'S1', type: 'invoice', net: 50, qty: 2, gross: 55, sret: 0, brand: 'TEPE', product: 'Brush', customer: 'A'},
      {doc: 'S1', type: 'invoice', net: 0, qty: 1, gross: 5, sret: 0, brand: 'TEPE', product: 'Brush free', customer: 'A'},
      {doc: 'S2', type: 'invoice', net: 0, qty: 5, gross: 10, sret: 0, brand: 'TEPE', product: 'Samples', customer: 'B'},
      {doc: 'S3', type: 'invoice', net: 20, qty: 1, gross: 20, sret: 0, brand: 'Tepe - Marketing', product: 'Kit', customer: 'C'}, // marketing brand but EARNED net 20 → a real sale, not free
      {doc: 'S4', type: 'invoice', net: 0, qty: 3, gross: 12, sret: 0, brand: 'Tepe - Marketing', product: 'Free kit', customer: 'D'}, // marketing brand, no revenue → giveaway
    ];
    const ann = core.focLinesAnnotated(rows);
    assert.deepEqual(ann.map(r => [r.product, r.kindDefault]),
      [['Brush free', 'deal'], ['Samples', 'sample'], ['Free kit', 'sample']]);
  });
  test('returnsAnalysis also counts SRT return docs valued only as negative net', () => {
    const rows = [
      { doc: 'SRT9', type: 'return', net: -25, sret: 0, brand: 'FLASH', customer: 'Joury' },
      { doc: 'SRT9', type: 'return', net: -5, sret: 0, brand: 'FLASH', customer: 'Joury' },
      { doc: 'SINV1', type: 'invoice', net: 100, sret: 10, brand: 'TEPE', customer: 'Lulu' },
      { doc: 'SINV2', type: 'invoice', net: 80, sret: 0, brand: 'TEPE', customer: 'Lulu' }, // clean sale
    ];
    const r = core.returnsAnalysis(rows);
    assert.equal(r.total, 40);       // 25 + 5 from the SRT doc + 10 from the sret column
    assert.equal(r.count, 3);
    assert.equal(r.docCount, 2);     // SRT9 and SINV1
    assert.deepEqual(r.byBrand[0], { name: 'FLASH', amount: 30 });
  });
  test('returnValue never double-counts a row that has both sret and negative net', () => {
    assert.equal(core.returnValue({ type: 'return', net: -30, sret: 30 }), 30);
    assert.equal(core.returnValue({ type: 'return', net: -30, sret: 0 }), 30);
    assert.equal(core.returnValue({ type: 'invoice', net: 100, sret: 12 }), 12);
    assert.equal(core.returnValue({ type: 'invoice', net: 100, sret: 0 }), 0);
  });
  test('coach insights now carry structured data for localization', () => {
    const today = '2026-08-12';
    const out = core.coachInsights({
      from: '2026-08-01', to: today, today, repFilter: 'all',
      visits: [], dayPlans: {},
      clinics: [{ id: 'c1', name: 'Alpha', rep: 'Mariam', cls: 'A', nextFollowUp: '2026-08-05' }],
      targets: { Mariam: { revenue: 1000 } },
    });
    const fu = out.find(i => i.key === 'followups');
    assert.equal(fu.data.count, 1);
    assert.deepEqual(fu.data.names, ['Alpha']);
    const tg = out.find(i => i.key === 'target-Mariam');
    assert.equal(tg.data.state, 'behind');
    assert.equal(tg.data.goal, 1000);
    assert.ok(tg.data.perDay > 0);
  });
});
