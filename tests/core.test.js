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
  test('keeps a CR as &#13; — an HTML attribute would turn it into a line feed (a name carried in data-* must come back exactly)', () => {
    assert.equal(core.esc('Smile Clinic\r\nFintas'), 'Smile Clinic&#13;\nFintas');
    assert.equal(core.esc('A\rB'), 'A&#13;B');
    assert.equal(core.esc('A\nB\tC'), 'A\nB\tC');
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
    erpMtd: { Mariam: { amount: 100, asOf: '2026-08-10', covered: '2026-08-10' }, Renova: { amount: 500, asOf: '2026-08-10', covered: '2026-08-10' } },
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
  test('guessRepMap: a supervisor who also sells is found by a name part, titles never match', () => {
    const map = core.guessRepMap(
      ['Ghaith Al Manfe', 'Dr. John Shahatah', 'Reem Omar', 'Mariam Zohair'],
      ['Mariam', 'Renova', 'Dr. Ghaith']);
    assert.equal(map['Ghaith Al Manfe'], 'Dr. Ghaith');   // "Ghaith" part of "Dr. Ghaith"
    assert.equal(map['Dr. John Shahatah'], null);         // "Dr." alone is not a match
    assert.equal(map['Reem Omar'], null);
    assert.equal(map['Mariam Zohair'], 'Mariam');
  });
  test('two files (the girls\' and his): a sale counts for the clinic owner, and every cross-invoice is listed', () => {
    const cl = [{ id: 'b', name: 'Bayan Dental Center', rep: 'Dr. Ghaith', prevRep: 'Mariam', repSince: '2026-10-01' },
      { id: 'moh', name: 'Ministry Of Health', rep: 'Mariam', shared: true, sharedSince: '2026-10-01' },
      { id: 'n', name: 'Dr. Nael Al Hazeem Dental Center - Sharq', rep: 'Dr. Ghaith', prevRep: 'Mariam', repSince: '2026-10-01' }];
    const row = (d, doc, sm, cust, net) => [d, doc, 0, 'x', 1, net, net, 0, sm, 'Intensiv', cust, 'Clinics', 0, ''];
    const data = { today: '2026-10-07', clinics: cl, erpMap: {}, erpSales: { periods: [
      { id: 'girls', from: '2026-10-01', to: '2026-10-05', repMap: { 'Mariam Zohair': 'Mariam', 'Ranova Ayman': 'Renova' },
        rows: [row('2026-10-02', 'S1', 'Mariam Zohair', 'Bayan Dental Center', 200), row('2026-10-03', 'S2', 'Mariam Zohair', 'Bayan Dental Center', 33.75),
               row('2026-10-03', 'S5', 'Mariam Zohair', 'Ministry Of Health', 50), row('2026-09-30', 'S0', 'Mariam Zohair', 'Bayan Dental Center', 999)] },
      { id: 'his', from: '2026-10-05', to: '2026-10-05', repMap: { 'Ghaith Al Manfe': 'Dr. Ghaith' },
        rows: [row('2026-10-05', 'S3', 'Ghaith Al Manfe', 'My Fatoorah', 12), row('2026-10-05', 'S4', 'Ghaith Al Manfe', 'Dr. Nael Al Hazeem Dental Center - Sharq', 9.25),
               row('2026-10-05', 'S6', 'Ghaith Al Manfe', 'Ministry Of Health', 100)] }] } };
    assert.equal(core.monthAchievement('Dr. Ghaith', data).amount, 12 + 9.25 + 233.75 + 100); // his + Mariam's at Bayan (his clinic) + his at the shared ministry
    assert.equal(core.monthAchievement('Mariam', data).amount, 50);                          // only her ministry invoice (shared → issuer)
    const x = core.crossInvoices(data);
    assert.equal(x.length, 1); // September line and the shared ministry are not listed
    const { details, ...head } = x[0];
    assert.deepEqual(head, { clinicId: 'b', clinic: 'Bayan Dental Center', issuer: 'Mariam', owner: 'Dr. Ghaith', invoices: 2, net: 233.75, from: '2026-10-02', to: '2026-10-03' });
    assert.deepEqual(details.map(d => [d.doc, d.date, d.net]), [['S1', '2026-10-02', 200], ['S2', '2026-10-03', 33.75]]);
    assert.deepEqual(details[0].items, [{ product: 'x', brand: 'Intensiv', qty: 1, net: 200 }]);
  });
  test('kpiScorecard: a sample is not a discount; nothing to measure scores "—", never a free 100% or 40%', () => {
    const row = (d, doc, cust, gross, net, rep) => [d, doc, 0, 'Strip', 1, gross, net, 0, rep || 'Mariam Zohair', 'Intensiv', cust, 'Clinics', 0, ''];
    const clinics = [{ id: 'a', name: 'Alpha Dental', rep: 'Mariam', cls: 'A', doctors: [] }, { id: 'b', name: 'Beta Clinic', rep: 'Mariam', cls: 'B', doctors: [] }];
    const data = { today: '2026-10-08', clinics, erpMap: {}, targets: {},
      erpSales: { periods: [{ id: 'p', from: '2026-09-01', to: '2026-10-08', repMap: { 'Mariam Zohair': 'Mariam', 'Ghaith Al Manfe': 'Dr. Ghaith' }, rows: [
        row('2026-10-02', 'S1', 'Alpha Dental', 90, 70), row('2026-10-03', 'S2', 'Beta Clinic', 80, 65),
        row('2026-10-04', 'SMP', 'Beta Clinic', 4, 0)] }] },       // an all-free sample document
      visits: [], dayPlans: {}, events: [] };
    const k = core.kpiScorecard(data, { rep: 'Mariam', to: '2026-10-08' });
    const d = k.items.find(i => i.key === 'discount');
    assert.equal(d.score, 1);                                       // 2 of 2 paid invoices within their limits; the sample is left out
    assert.ok(/^average 20\.6% · 0 of 2 invoices over the limit$/.test(d.value), d.value);
    assert.equal(k.items.find(i => i.key === 'doctors').score, null);   // no field visit logged: nothing to measure
    const g = core.kpiScorecard(data, { rep: 'Dr. Ghaith', to: '2026-10-08' });
    assert.equal(g.items.find(i => i.key === 'issues').score, null);    // no sales and no escalation: not a free 100%
  });
  test('kpiScorecard: the 10 management measures, each from the app\'s own data', () => {
    // packed ERP row: [date, doc, type(1=return), product, qty, gross, net, sret, salesman, brand, customer, cls, dsret, ref]
    const row = (d, doc, cust, gross, net, product, brand, type) => [d, doc, type ? 1 : 0, product || 'P', 1, gross, net, 0, 'Mariam Zohair', brand || 'Intensiv', cust, 'Clinics', 0, ''];
    const clinics = [
      { id: 'a', name: 'Alpha Dental', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. One', influence: 'decider' }, { id: 'd2', name: 'Dr. Two' }] },
      { id: 'b', name: 'Beta Clinic', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd3', name: 'Dr. Three' }] },
      { id: 'c', name: 'Gamma Clinic', rep: 'Mariam', cls: 'B', doctors: [] },
      { id: 'moh', name: 'Ministry Of Health', rep: 'Renova', shared: true, sharedWith: ['Renova', 'Mariam'], doctors: [] },
      { id: 'h', name: 'Royale Hayat Hospital', rep: 'Mariam', cls: 'B', doctors: [] }];
    const T = (d, h) => new Date(d + 'T' + h + ':00').getTime();
    const data = { today: '2026-10-08', clinics, erpMap: {},
      targets: { Mariam: { revenue: 1000, brands: { Intensiv: 600, 'Philips Sonicare': 400 } } },
      erpSales: { periods: [{ id: 'p', from: '2026-08-01', to: '2026-10-08', repMap: { 'Mariam Zohair': 'Mariam' }, rows: [
        row('2026-08-10', 'S0', 'Alpha Dental', 100, 60),
        row('2026-09-05', 'F1', 'My Fatoorah', 20, 20, 'Strip'),
        row('2026-10-01', 'S1', 'Alpha Dental', 300, 190),                 // 36.7% – A account, within 40%
        row('2026-10-04', 'S2', 'Gamma Clinic', 100, 60),                  // 40% – B account, over 35%; Gamma's first order ever
        row('2026-10-05', 'S3', 'Alpha Dental', 50, 50, 'Sonic 4300', 'Philips'), // new product for Alpha
        row('2026-10-06', 'S4', 'Beta Clinic', 80, 56),                    // first order ever: new account, 30%
        row('2026-10-07', 'R1', 'Alpha Dental', 0, -9, 'Strip', 'Intensiv', true), // a return: 9 of 386 sold = 2.3%
        row('2026-10-07', 'F2', 'My Fatoorah', 30, 30, 'Strip')] }] },
      visits: [
        { id: 'v1', date: '2026-10-04', ts: T('2026-10-04', '09:00'), rep: 'Mariam', clinicId: 'a', doctorIds: ['d1', 'd2'], products: ['x'] },
        { id: 'v2', date: '2026-10-05', ts: T('2026-10-05', '09:00'), rep: 'Mariam', clinicId: 'moh', doctorIds: [], products: [] },  // incomplete report
        { id: 'v3', date: '2026-10-06', ts: T('2026-10-06', '10:00'), rep: 'Renova', withRep: 'Mariam', clinicId: 'b', doctorIds: ['d3'], orderTaken: true },
        { id: 'v4', date: '2026-10-07', ts: T('2026-10-07', '09:00'), rep: 'Mariam', clinicId: 'c', doctorIds: ['x'], noOrderReason: 'stocked' }],
      dayPlans: { '2026-10-04': { Mariam: [{ id: 'a', at: T('2026-10-04', '08:00') }] }, '2026-10-05': { Mariam: [{ id: 'moh', at: T('2026-10-05', '11:00') }] },
        '2026-10-07': { Mariam: ['c'] } },                                 // 6 Oct: led no visit (joint only) → not counted
      events: [
        { id: 'e1', kind: 'issue', type: 'escalation', rep: 'Mariam', clinicId: 'a', at: '2026-10-05T10:00:00', text: 'called the office' },
        { id: 'e2', kind: 'issue', type: 'request', rep: 'Mariam', clinicId: 'b', at: '2026-10-05T10:00:00', resolvedAt: '2026-10-05T18:00:00' },
        { id: 'e3', kind: 'issue', type: 'request', rep: 'Mariam', clinicId: 'c', at: '2026-10-06T10:00:00', resolvedAt: '2026-10-08T10:00:00' },
        { id: 'e4', kind: 'stand', rep: 'Mariam', clinicId: 'a', at: '2026-09-20', checks: ['2026-10-03'] }] };
    const k = core.kpiScorecard(data, { rep: 'Mariam', to: '2026-10-08', nowMs: T('2026-10-08', '12:00') });
    const it = Object.fromEntries(k.items.map(x => [x.key, x]));
    assert.equal(k.items.reduce((a, x) => a + x.weight, 0), 100);
    assert.equal(k.workdays, 6);                                           // Thu 1, Sun 4 – Thu 8 Oct
    assert.match(it.sales.value, /^38% achieved · on pace for 146%/);      // 190+60+50+56+30−9 = 377 of 1000 by 8 Oct
    assert.match(it.visits.value, /^0\.7 a day \(4 in 6 working days\)/); // the joint visit counts for her too
    assert.match(it.discipline.value, /67% days planned before the first visit · 67% complete visit reports/); // 5 Oct planned after the visit; v2 incomplete
    assert.match(it.doctors.value, /^4 doctors met · decision maker known in 1 of 2 A accounts/);
    assert.match(it.discount.value, /1 of 4 invoices over the limit/); assert.equal(it.discount.over[0].doc, 'S2');
    assert.match(it.issues.value, /^1 escalation · returns 2\.3% of sales/);
    assert.match(it.rx.value, /KD 30 · \+50% on the same days last month/); assert.equal(it.rx.score, 1);
    assert.match(it.gov.value, /^50% of 1 government accounts visited per week/); // Ministry seen in week 2 only; the private hospital is not government
    assert.match(it.newbiz.value, /^1 new product placement · 2 new accounts/);
    assert.match(it.response.value, /^1 of 2 answered within 24h/);
    assert.deepEqual(k.stands, { active: 1, checked: 1 });
    // doctors target scales with the period: 60 a month × 6 of 22 working days = 16. Plain-id plan entries (older data) have no time: a plan existed, not a miss
    assert.match(it.discipline.value, /^67%/);
    assert.equal(k.total, Math.round((0.85 * 30 + (4 / 6 / 5) * 10 + (2 / 3) * 10 + (0.6 * 4 / 16 + 0.4 * 0.5) * 10 + 0.75 * 10 + it.issues.score * 10 + 5 + 0.5 * 5 + 5 + 0.5 * 5)));
  });
  test('weeklyReport: the Thursday deck figures – sales, month to date, wins, field work, next week', () => {
    const row = (d, doc, sm, cust, net, product, brand, qty) => [d, doc, 0, product || 'P', qty == null ? 1 : qty, net, net, 0, sm, brand || 'Intensiv', cust, 'Clinics', 0, ''];
    const clinics = [
      { id: 'a', name: 'Alpha Dental', rep: 'Mariam', cls: 'A', doctors: [{ id: 'd1', name: 'Dr. One' }], nextFollowUp: '2026-10-13' },
      { id: 'b', name: 'Beta Clinic', rep: 'Mariam', cls: 'A' },
      { id: 'g', name: 'Gamma Center', rep: 'Dr. Ghaith', cls: 'B' },
      { id: 'n', name: 'New Smile', rep: 'Dr. Ghaith', cls: 'C' }];
    const data = { today: '2026-10-08', clinics, erpMap: {},
      targets: { Mariam: { revenue: 1000, brands: { Intensiv: 600, 'Philips Sonicare': 400 } }, 'Dr. Ghaith': { revenue: 2000, brands: { Intensiv: 2000 } } },
      erpSales: { periods: [{ id: 'p', from: '2026-07-01', to: '2026-10-08', repMap: { 'Mariam Zohair': 'Mariam', 'Ghaith Al Manfe': 'Dr. Ghaith' }, rows: [
        row('2026-07-10', 'S0', 'Ghaith Al Manfe', 'Gamma Center', 50, 'Strip'),            // Gamma last bought in July
        row('2026-09-28', 'S1', 'Mariam Zohair', 'Alpha Dental', 100, 'Strip'),             // last week
        row('2026-10-01', 'S2', 'Mariam Zohair', 'Alpha Dental', 70, 'Strip'),              // this month, before the week
        row('2026-10-05', 'S3', 'Mariam Zohair', 'Alpha Dental', 40, 'Strip'),              // this week, known product
        row('2026-10-05', 'S3', 'Mariam Zohair', 'Alpha Dental', 25, 'Sonic 4300', 'Philips'), // this week, NEW product for Alpha
        row('2026-10-06', 'S4', 'Ghaith Al Manfe', 'New Smile', 90, 'Strip'),               // first ever invoice
        row('2026-10-07', 'S5', 'Ghaith Al Manfe', 'Gamma Center', 30, 'Strip'),            // back after 3 months
        row('2026-10-07', 'S6', 'Ghaith Al Manfe', 'Beta Clinic', 0, 'Sample paste', 'Hismile'), // a free sample
        row('2026-10-07', 'S7', 'Ghaith Al Manfe', 'My Fatoorah', 12, 'Strip'),             // channel: sales yes, wins no
        row('2026-10-07', 'S8', 'Mariam Zohair', 'Marketing Philips', 0, 'Demo brush', 'Philips')]}] }, // internal marketing stock: never a win, never listed
      visits: [
        { id: 'v1', date: '2026-10-05', rep: 'Mariam', clinicId: 'a', doctorIds: ['d1'], products: ['x', 'y'], orderTaken: true, orderTotal: 40, nextFollowUp: '2026-10-13', photos: [{ id: 'p' }] },
        { id: 'v2', date: '2026-10-06', rep: 'Dr. Ghaith', withRep: 'Mariam', clinicId: 'n', products: ['x'] },
        { id: 'v3', date: '2026-10-07', rep: 'Mariam', clinicId: 'b', callOnly: true },
        { id: 'v0', date: '2026-10-01', rep: 'Mariam', clinicId: 'b' }],
      dayPlans: { '2026-10-12': { Mariam: ['b'] }, '2026-10-14': { 'Dr. Ghaith': [{ id: 'g', note: '' }] } } };
    const w = core.weeklyReport(data, { end: '2026-10-08', reps: ['Mariam', 'Dr. Ghaith'] });
    assert.deepEqual([w.from, w.to, w.prevFrom, w.prevTo, w.nextFrom, w.nextTo], ['2026-10-04', '2026-10-08', '2026-09-27', '2026-10-01', '2026-10-11', '2026-10-17']);
    const M = w.perRep.Mariam, G = w.perRep['Dr. Ghaith'];
    assert.equal(M.week, 65); assert.equal(M.prevWeek, 170);     // last week = Sep 27 – Oct 1: 100 + 70
    assert.equal(G.week, 132);                                   // 90 + 30 + 0 + 12 (channels count in sales)
    assert.equal(M.mtd, 135); assert.equal(M.pct, 0.135);        // Oct 1–8: 70 + 40 + 25
    assert.equal(w.team.week, 197); assert.equal(w.team.target, 3000);
    assert.deepEqual(w.wins.newAccounts.map(x => [x.account, x.rep, x.net]), [['New Smile', 'Dr. Ghaith', 90]]);
    assert.deepEqual([w.wins.newAccounts[0].doc, w.wins.newAccounts[0].products.map(p => p.product)], ['S4', ['Strip']]);
    assert.equal(w.wins.placements[0].doc, 'S3');
    assert.deepEqual(w.wins.reactivated.map(x => [x.account, x.lastBefore]), [['Gamma Center', '2026-07-10']]);
    assert.deepEqual(w.wins.placements.map(x => [x.account, x.product, x.net]), [['Alpha Dental', 'Sonic 4300', 25]]);
    assert.deepEqual(w.wins.samples.map(x => [x.account, x.items]), [['Beta Clinic', ['Sample paste']]]);
    assert.equal(w.wins.invoices.length, 5); assert.equal(w.wins.invoices[0].net, 90);
    assert.deepEqual([M.fieldVisits, M.calls, M.joint, M.clinics, M.doctorsMet, M.productsPresented, M.followUps, M.orders, M.orderValue, M.photos],
      [2, 1, 1, 2, 1, 2, 1, 1, 40, 1]);                          // the joint visit counts for both
    assert.deepEqual([M.aVisited, M.aTotal, M.aMissing], [2, 2, []]);
    assert.deepEqual(w.brands.find(b => b.brand === 'intensiv'), { brand: 'intensiv', week: 172, mtd: 242, target: 2600, prevMonth: 100 });
    assert.deepEqual(w.weeks.map(x => [x.from, x.to, x.byRep.Mariam]), [['2026-10-01', '2026-10-03', 70], ['2026-10-04', '2026-10-08', 65]]);
    assert.deepEqual(w.next.Mariam.planned, [{ date: '2026-10-12', clinic: 'Beta Clinic' }]);
    assert.deepEqual(w.next.Mariam.followUps, [{ date: '2026-10-13', clinic: 'Alpha Dental' }]);
    assert.equal(w.visits.length, 3); assert.deepEqual(w.visits[0].doctors, ['Dr. One']);
    assert.equal(w.salesCovered, true);
    // the last 8 weeks: this one (Oct 4–8) last, each earlier one Sunday–Saturday
    assert.deepEqual(w.products.slice(0, 2).map(x => [x.product, x.net, x.accounts]), [['Strip', 172, 4], ['Sonic 4300', 25, 1]]); // best sellers of the week; the zero-value sample and the marketing move are not
    assert.deepEqual(w.photos.map(p => [p.id, p.clinic, p.rep]), [['p', 'Alpha Dental', 'Mariam']]);
    assert.equal(w.history.length, 8);
    assert.deepEqual([w.history[7].from, w.history[7].to, w.history[7].current, w.history[6].from, w.history[6].to], ['2026-10-04', '2026-10-08', true, '2026-09-27', '2026-10-03']);
    assert.deepEqual([w.history[7].sales, w.history[7].invoices, w.history[7].accounts, w.history[6].sales], [197, 4, 3, 170]); // invoices with a value; My Fatoorah is not an account
    assert.equal(w.history[7].newAccounts, 1);               // files from 10 Jul: a month of history before this week
    assert.equal(w.history[0].newAccounts, 0);               // week of 16 Aug: files from 10 Jul are a month earlier, so measurable (none)
    assert.equal(core.weeklyReport(Object.assign({}, data, { today: '2026-10-08' }), { end: '2026-07-16', reps: ['Mariam'] }).history[7].newAccounts, null); // 12–16 Jul: files only from 10 Jul
    assert.ok(!w.wins.samples.some(x => /Marketing/.test(x.account)) && !w.wins.invoices.some(i => i.doc === 'S8'));
    const hl = core.weeklyHighlights(w);
    assert.equal(hl[0], 'Best sales week of the last 8: KD 197 invoiced.');
    assert.ok(hl.some(t => /^1 new account placed a first order: New Smile/.test(t)));
    assert.ok(!hl.some(t => /0 of|down|below/i.test(t)));   // achievements only
    // a weaker week: no "best", no growth line — the true positives remain
    const w2 = JSON.parse(JSON.stringify(w)); w2.history[7].sales = 5; w2.history[6].sales = 170; w2.team.week = 5; w2.team.prevWeek = 170;
    w2.history[7].byRep = { Mariam: 5, 'Dr. Ghaith': 0 };
    const hl2 = core.weeklyHighlights(w2);
    assert.ok(!hl2.some(t => /^Best sales week|^Sales up|above the average/.test(t)) && hl2.some(t => /new account/.test(t)));
  });
  test('weeklyReport: a week with no sales file of a person is no figure for that person, never a record "best week of 8"', () => {
    const row = (d, doc, sm, net) => [d, doc, 0, 'P', 1, net, net, 0, sm, 'Intensiv', sm === 'Mariam Zohair' ? 'Alpha' : 'Gamma Clinic', 'Clinics', 0, '']; // Gamma is not in the app: the salesman's
    const data = { today: '2026-10-08', clinics: [{ id: 'a', name: 'Alpha', rep: 'Mariam', cls: 'A' }], erpMap: {},
      erpSales: { periods: [
        { id: 'girls', from: '2026-07-01', to: '2026-10-08', repMap: { 'Mariam Zohair': 'Mariam' }, rows: [row('2026-08-20', 'S1', 'Mariam Zohair', 100), row('2026-10-06', 'S2', 'Mariam Zohair', 50)] },
        { id: 'his', from: '2026-10-05', to: '2026-10-05', repMap: { 'Ghaith Al Manfe': 'Dr. Ghaith' }, rows: [row('2026-10-05', 'S3', 'Ghaith Al Manfe', 530)] }] } };
    const w = core.weeklyReport(data, { end: '2026-10-08', reps: ['Mariam', 'Dr. Ghaith'] });
    assert.equal(w.history[7].byRep['Dr. Ghaith'], 530);
    assert.ok(w.history.slice(0, 7).every(h => h.byRep['Dr. Ghaith'] === null), w.history.map(h => h.byRep['Dr. Ghaith']));  // his file covers 5 Oct only
    assert.ok(w.history.slice(0, 7).every(h => h.byRep.Mariam !== null));                                                    // hers covers every week
    const hl = core.weeklyHighlights(w);
    assert.ok(!hl.some(t => /Best week of the last 8 for Dr\. Ghaith/.test(t)), hl);
  });
  test('weeklyReport: an earlier week counts for a person only when that person\'s files cover every day of it', () => {
    const row = (d, doc, net) => [d, doc, 0, 'P', 1, net, net, 0, 'Ghaith Al Manfe', 'Intensiv', 'Gamma Clinic', 'Clinics', 0, ''];
    const data = { today: '2026-10-08', clinics: [], erpMap: {},
      erpSales: { periods: [{ id: 'his', from: '2026-10-01', to: '2026-10-08', repMap: { 'Ghaith Al Manfe': 'Dr. Ghaith' }, rows: [row('2026-10-01', 'S1', 269), row('2026-10-05', 'S2', 530)] }] } };
    const w = core.weeklyReport(data, { end: '2026-10-08', reps: ['Dr. Ghaith'] });
    assert.equal(w.history[6].from, '2026-09-27');
    assert.equal(w.history[6].byRep['Dr. Ghaith'], null);          // his file starts 1 Oct: 27 Sep – 3 Oct is not covered, so no "up from KD 269"
    assert.equal(w.history[6].repCovered['Dr. Ghaith'], false);
    assert.equal(w.history[7].byRep['Dr. Ghaith'], 530);           // this week may be partial: it can only understate
    assert.equal(w.salesTo, '2026-10-08');
  });
  test('weeklyReport: team field counts are distinct — one clinic on one day is one visit, however many logged it', () => {
    const clinics = [{ id: 'l', name: 'Light Dental', rep: 'Mariam', cls: 'B', doctors: [{ id: 'n', name: 'Dr. Noor' }] }, { id: 'b', name: 'Blue Dental', rep: 'Renova', cls: 'B', doctors: [{ id: 'a', name: 'Dr. Abir' }] }];
    const data = { today: '2026-10-08', clinics, erpMap: {}, erpSales: { periods: [] },
      visits: [
        { id: 'v1', date: '2026-10-07', rep: 'Mariam', clinicId: 'l', doctorIds: ['n'], products: ['p1'], nextFollowUp: '2026-10-14' },
        { id: 'v2', date: '2026-10-07', rep: 'Dr. Ghaith', withRep: 'Mariam', clinicId: 'l', doctorIds: ['n'], products: ['p1', 'p2'], nextFollowUp: '2026-10-10' },  // the same visit, logged again as his joint visit
        { id: 'v3', date: '2026-10-07', rep: 'Renova', clinicId: 'b', doctorIds: ['a'], products: ['p2'] }] };
    const w = core.weeklyReport(data, { end: '2026-10-08', reps: ['Mariam', 'Renova', 'Dr. Ghaith'] });
    assert.deepEqual([w.team.fieldVisits, w.team.clinics, w.team.doctorsMet, w.team.productsPresented, w.team.followUpClinics], [2, 2, 2, 2, 1]);
    assert.deepEqual([w.perRep.Mariam.fieldVisits, w.perRep.Mariam.logged, w.perRep['Dr. Ghaith'].fieldVisits, w.perRep['Dr. Ghaith'].logged], [1, 1, 1, 1]);
    assert.equal(w.history[7].fieldVisits, 2);
  });
  test('weeklyStory: the real-week shape — true wins lead; weak sales, a small brand target, samples and the presenter\'s one-file week never become headlines', () => {
    const R = (d, doc, sm, cust, net, product, brand, gross) => [d, doc, 0, product || 'P', 1, gross == null ? net : gross, net, 0, sm, brand || 'Intensiv', cust, 'Clinics', 0, ''];
    const M = 'Mariam Zohair', N = 'Ranova Ayman Mohammed', G = 'Ghaith Al Manfe';
    const clinics = [
      { id: 'l', name: 'Light Dental', rep: 'Mariam', cls: 'B', doctors: [{ id: 'n', name: 'Dr. Noor' }] },
      { id: 'j', name: 'Jibla Dental Center', rep: 'Renova', cls: 'A', doctors: [] },
      { id: 'h', name: 'Dr. Nael Al Hazeem Dental Center', rep: 'Dr. Ghaith', cls: 'A', doctors: [{ id: 'm', name: 'Dr. Maha' }] },
      { id: 'b', name: 'Bayan Dental Center', rep: 'Dr. Ghaith', cls: 'A', doctors: [] }];
    const girls = [];
    ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].forEach((d, i) => {
      girls.push(R(d, 'G' + i, M, 'Light Dental', 2000, 'Strip')); girls.push(R(d, 'H' + i, N, 'Jibla Dental Center', 2400, 'Sonic', 'Philips')); });
    girls.push(R('2026-10-05', 'SINV1', M, 'Light Dental', 25, 'IPR gauge'));                // a first-time product at Light Dental
    girls.push(R('2026-10-06', 'SINV2', N, 'Salwa', 154.8, 'Imprelon S+', 'SCHEU'));         // a new account (not in the app: the salesman's)
    const his = [R('2026-10-01', 'SINV0', G, 'Dr. Nael Al Hazeem Dental Center', 269, 'Strip'), R('2026-10-05', 'SINV3', G, 'Dr. Nael Al Hazeem Dental Center', 520, 'Swingle'),
      R('2026-10-07', 'SINV4', G, 'Bayan Dental Center', 0, 'Sample mouthwash', 'The Breath Co.', 2)];
    const data = { today: '2026-10-08', clinics, erpMap: {},
      targets: { Mariam: { revenue: 4640, month: '2026-10', brands: { Intensiv: 600 } }, Renova: { revenue: 10147, month: '2026-10', brands: { SCHEU: 100, Philips: 4000 } }, 'Dr. Ghaith': { revenue: 9416, month: '2026-10', brands: { Intensiv: 2750 } } },
      erpSales: { periods: [{ id: 'girls', from: '2026-08-01', to: '2026-10-08', repMap: { [M]: 'Mariam', [N]: 'Renova' }, rows: girls }, { id: 'his', from: '2026-10-01', to: '2026-10-08', repMap: { [G]: 'Dr. Ghaith' }, rows: his }] },
      visits: [{ id: 'v1', date: '2026-10-05', rep: 'Mariam', clinicId: 'l', doctorIds: ['n'], products: ['p'], nextFollowUp: '2026-10-12' }, { id: 'v2', date: '2026-10-06', rep: 'Dr. Ghaith', clinicId: 'h', doctorIds: ['m'], products: ['q'] }] };
    const W = core.weeklyReport(data, { end: '2026-10-08', reps: ['Mariam', 'Renova', 'Dr. Ghaith'] });
    const S = core.weeklyStory(W, { presenter: 'Dr. Ghaith', brandName: b => b === 'scheu' ? 'SCHEU' : b });
    const keys = S.headline.map(i => i.key);
    assert.ok(!keys.some(k => /^sales/.test(k)), keys);                                        // sales fell: not a headline
    assert.ok(S.headline.some(i => i.kind === 'newbiz' && i.big === '2' && /Salwa/.test(i.detail)), S.headline.map(i => i.text)); // the new account and the first-time product; the sample is no win
    assert.ok(!S.headline.some(i => /SCHEU/.test(i.headline)) && S.also.some(i => i.key === 'brand-small:scheu' && i.big === 'KD 155'));  // R6
    assert.ok(S.headline.filter(i => i.rep === 'Dr. Ghaith').length <= 1);                   // R11
    assert.ok(S.headline.every(i => i.big !== '0' && !/^0 /.test(i.big)));                     // R10
    assert.equal(S.close, S.headline);                                                         // R12
    assert.ok(S.all.some(i => i.key === 'seeds' && i.big === '1'));                            // samples are seeds
    const g = S.people['Dr. Ghaith'];
    assert.ok(g && !/best sales week|up from/.test(g.signature.line), g && g.signature);        // his file covers one week only
    assert.equal(g.signature.big, 'KD 520');                                                   // the week's largest invoice
    assert.ok(S.people.Renova.signature.line.startsWith('first order from a new account, Salwa'));
    assert.ok(S.excluded.some(t => /^المبيعات/.test(t) && /\(A5\)$/.test(t)));               // the left-out sales figure is named, with its appendix page
    assert.ok(S.excluded.some(t => /من المستهدف/.test(t)));
  });
  // the real week 4–8 Oct (the documents as exported) with two months of history before it
  function realWeekData(){
    // [date, doc, type, product, qty, gross, net, sret, salesman, brand, customer, class, dsret, ref]
    const R = (d, doc, sm, cust, net, product, brand, gross) => [d, doc, 0, product || 'P', 1, gross == null ? net : gross, net, 0, sm, brand || 'Intensiv', cust, 'Clinics', 0, ''];
    const M = 'Mariam Zohair', N = 'Ranova Ayman Mohammed', G = 'Ghaith Al Manfe';
    const clinics = [
      { id: 'l', name: 'Light Dental', rep: 'Mariam', cls: 'B', doctors: [{ id: 'n', name: 'Dr. Noor' }] },
      { id: 'j', name: 'Jibla Dental Center', rep: 'Renova', cls: 'A', doctors: [] },
      { id: 'k', name: 'Kaifan Dental', rep: 'Renova', cls: 'A', doctors: [] },
      { id: 'u', name: 'Blue Dental', rep: 'Renova', cls: 'B', doctors: [{ id: 'q', name: 'Dr. Q' }] },
      { id: 'f', name: 'Farwaniya Hospital Polyclinic', rep: 'Renova', cls: 'B', doctors: [] },
      { id: 'h', name: 'Dr. Nael Al Hazeem Dental Center', rep: 'Dr. Ghaith', prevRep: 'Mariam', repSince: '2026-10-01', cls: 'A', doctors: [{ id: 'm', name: 'Dr. Maha' }] },
      { id: 'b', name: 'Bayan Dental Center', rep: 'Dr. Ghaith', cls: 'A', doctors: [] },
      { id: 's', name: 'Skydental Centre', rep: 'Dr. Ghaith', cls: 'B', doctors: [] }];
    const girls = [];
    ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].forEach((d, i) => {
      girls.push(R(d, 'G' + i, M, 'Light Dental', 700, 'Strip', 'Intensiv', 900)); girls.push(R(d, 'H' + i, N, 'Jibla Dental Center', 1100, 'Sonic', 'Philips', 1400));
      girls.push(R(d, 'K' + i, N, 'Kaifan Dental', 300, 'Foil', 'SCHEU', 380)); girls.push(R(d, 'NH' + i, M, 'Dr. Nael Al Hazeem Dental Center', 60, 'Strip', 'Intensiv', 80)); });
    girls.push(R('2026-09-29', 'SKY0', M, 'Skydental Centre', 40, 'Strip'));
    // this week (the real documents)
    girls.push(R('2026-10-05', 'SINV0077150', M, 'Light Dental', 105, 'Strip', 'Intensiv', 130), R('2026-10-05', 'SINV0077150', M, 'Light Dental', 25, 'IPR gauge', 'Intensiv', 30));
    girls.push(R('2026-10-05', 'MF1', M, 'My Fatoorah', 20, 'Strip'));
    girls.push(R('2026-10-06', 'SINV0077191', N, 'Salwa', 154.8, 'Imprelon S+', 'SCHEU', 190));          // a first order: Salwa is not in the app
    girls.push(R('2026-10-06', 'IC1', N, 'Individual - Customers', 15.3, 'Brush', 'Philips'), R('2026-10-07', 'MF3', N, 'My Fatoorah', 14, 'Brush', 'Philips'));
    girls.push(R('2026-10-06', 'SINV0077188', N, 'Pharmacy plus', 0, 'Sonicare 1100', 'Philips', 18));    // a sample: an all-free document
    const his = [R('2026-10-01', 'SINV0', G, 'Dr. Nael Al Hazeem Dental Center', 269, 'Strip'),
      R('2026-10-05', 'SINV0077225', G, 'Dr. Nael Al Hazeem Dental Center', 380, 'Swingle', 'Intensiv', 560), R('2026-10-05', 'SINV0077225', G, 'Dr. Nael Al Hazeem Dental Center', 105, 'Strip', 'Intensiv', 150),
      R('2026-10-05', 'SINV0077225', G, 'Dr. Nael Al Hazeem Dental Center', 35, 'OS60/3', 'Intensiv', 50),
      R('2026-10-05', 'SINV0077225', G, 'Dr. Nael Al Hazeem Dental Center', 0, 'Ortho-Strips Opener', 'Intensiv', 6),   // free inside the paid invoice: a deal, not a sample
      R('2026-10-05', 'SINV0077226', G, 'Dr. Nael Al Hazeem Dental Center', 9.25, 'GP Pellet', 'B&L Biotech', 12),
      R('2026-10-05', 'MF2', G, 'My Fatoorah', 12, 'Strip'),
      ['2026-10-06', 'SRT0009635', 1, 'Strip', 1, 11.25, -11.25, 11.25, G, 'Intensiv', 'Skydental Centre', 'Clinics', 0, ''],
      R('2026-10-07', 'SINV0077218', G, 'Bayan Dental Center', 0, 'Mouthwash', 'The Breath Co.', 4)];
    const data = { today: '2026-10-08', clinics, erpMap: {},
      targets: { Mariam: { revenue: 4640, month: '2026-10', brands: { Intensiv: 600 } }, Renova: { revenue: 10147, month: '2026-10', brands: { SCHEU: 100, Philips: 4000 } }, 'Dr. Ghaith': { revenue: 9416, month: '2026-10', brands: { Intensiv: 2750 } },
        _history: { '2026-09': { Mariam: { revenue: 9100, month: '2026-09' }, Renova: { revenue: 11571, month: '2026-09' } }, '2026-08': { Mariam: { revenue: 11551, month: '2026-08' }, Renova: { revenue: 12634, month: '2026-08' } } } },
      erpSales: { periods: [{ id: 'girls', from: '2026-08-01', to: '2026-10-08', repMap: { [M]: 'Mariam', [N]: 'Renova' }, rows: girls }, { id: 'his', from: '2026-10-01', to: '2026-10-08', repMap: { [G]: 'Dr. Ghaith' }, rows: his }] },
      visits: [
        { id: 'v1', date: '2026-10-05', rep: 'Mariam', clinicId: 'l', doctorIds: ['n'], products: ['p'], nextFollowUp: '2026-10-12' },
        { id: 'v2', date: '2026-10-05', rep: 'Renova', clinicId: 'f', products: ['p'] },
        { id: 'v3', date: '2026-10-06', rep: 'Renova', clinicId: 'u', doctorIds: ['q'], products: ['p'], orderTaken: true, orderTotal: 198 },
        { id: 'v4', date: '2026-10-07', rep: 'Dr. Ghaith', withRep: 'Mariam', clinicId: 'l', doctorIds: ['n'] },
        { id: 'v5', date: '2026-10-06', rep: 'Dr. Ghaith', clinicId: 'h', doctorIds: ['m'], products: ['q'] }],
      dayPlans: { '2026-10-12': { Mariam: ['l'] }, '2026-10-13': { 'Dr. Ghaith': ['b'] } } };
    const reps = ['Mariam', 'Renova', 'Dr. Ghaith'];
    return { data, reps, clinics };
  }
  test('weeklyPages: the real week 4–8 Oct — the money ties to the ERP, samples are all-free documents, the month has a named plan', () => {
    const { data, reps, clinics } = realWeekData();
    const W = core.weeklyReport(data, { end: '2026-10-08', reps });
    // the money ties out: 8 invoices with value + 2 sample documents + 1 return = the week
    assert.equal(W.team.week, 864.1);
    assert.deepEqual([W.mix.invoices, W.mix.withValue, W.mix.zeroDocs, W.mix.returnDocs, W.mix.returnsNet], [8, 875.35, 2, 1, -11.25]);
    assert.deepEqual([W.mix.accounts, W.mix.channelAccounts], [3, 2]);                   // 3 clinics + 2 channel accounts, not "3 accounts"
    assert.equal(Math.round((W.mix.existing + W.mix.newAccounts + W.mix.channel + W.mix.other + W.mix.returns) * 100) / 100, 864.1);
    assert.deepEqual([W.mix.existing, W.mix.newAccounts, W.mix.channel, W.mix.returns], [659.25, 154.8, 61.3, -11.25]);
    assert.equal(W.mix.top.account, 'Dr. Nael Al Hazeem Dental Center'); assert.ok(W.mix.top.share > 0.6 && W.mix.top.share < 0.62);
    // samples are all-free documents (2), the free line inside SINV0077225 is part of that deal
    assert.deepEqual(W.free.samples.list.map(x => x.doc), ['SINV0077188', 'SINV0077218']);
    assert.deepEqual([W.free.deals.docs, W.free.deals.gross, W.free.deals.list[0].doc], [1, 6, 'SINV0077225']);
    // his files start 1 Oct: his first-time products are not claimed (the four weeks before are not covered)
    assert.deepEqual(W.wins.placements.filter(x => reps.includes(x.rep)).map(x => [x.rep, x.product]), [['Mariam', 'IPR gauge']]);
    assert.equal(W.mix.firstTime, 25);
    assert.deepEqual(W.fieldOrders.map(o => [o.clinic, o.value, o.invoiced]), [['Blue Dental', 198, false]]);
    assert.deepEqual(W.team.govSites, ['Farwaniya Hospital Polyclinic']);
    assert.ok(W.checks.some(c => c.key === 'no-plan:Renova'));                               // Renova has nothing saved for next week
    assert.ok(W.checks.some(c => c.key === 'sample-no-visit:b'));                            // Bayan: samples but no visit logged this month
    const trend = core.monthlyTrend(data, { reps, end: '2026-10-08', months: 3 });
    const S = core.weeklyStory(W, { presenter: 'Dr. Ghaith', trend, ask: 'Approve two Sonicare demo units for Jibla and Kaifan' });
    const PG = S.pages;
    assert.deepEqual(PG.money.tiles.map(t => t.key), ['week', 'month', 'newbiz', 'price']);  // R13: the same four tiles every week
    assert.equal(PG.money.tiles[0].big, 'KD 864');
    assert.ok(/^last week KD [\d,]+/.test(PG.money.tiles[0].detail), PG.money.tiles[0].detail);   // a fixed yardstick every week
    assert.equal(PG.money.tiles[2].big, 'KD 180');                                         // Salwa 154.80 + the IPR gauge 25
    assert.equal(PG.money.recon, 'ERP 4–8 Oct: 8 invoices with value (KD 875.35) + 2 sample documents (KD 0) + 1 return (−KD 11.25) = KD 864.10');
    assert.equal(PG.money.title, 'KD 864 invoiced, all clinic invoices within discount limits');
    assert.ok(PG.money.concentration && PG.money.concentration.net === 529.25);
    assert.deepEqual(PG.money.mix.map(m => m.key), ['existing', 'newAccounts', 'channel', 'returns']);
    // the closed month (day 8): September for the two people with a file and a target
    assert.ok(PG.closed && /^September closed at \d+% of target: KD [\d,]+ of KD 20,671$/.test(PG.closed.title), PG.closed && PG.closed.title);
    const gc = PG.closed.people.find(p => p.rep === 'Dr. Ghaith');
    assert.ok(gc.noTarget && !PG.closed.team.people.includes('Dr. Ghaith'));               // his clinics' September sales count, but he had no September target
    // the month: the gap in KD and working days, and a plan with names
    assert.deepEqual([PG.plan.workdays.total, PG.plan.workdays.done, PG.plan.workdays.left], [21, 6, 15]);
    assert.ok(/^October: KD [\d,]+ to go in 15 working days — the plan$/.test(PG.plan.title), PG.plan.title);
    assert.ok(PG.plan.levers.some(l => l.key === 'orders' && l.big === 'KD 198'));
    assert.ok(PG.plan.levers.some(l => l.key === 'key' && /still to visit in October/.test(l.text)));
    assert.equal(PG.plan.ask, 'Approve two Sonicare demo units for Jibla and Kaifan');
    // new business in KD; the cover never leads with the presenter's own sale (R11)
    assert.equal(PG.newBiz.title, 'KD 180 new business: 1 new account, 1 first-time product');
    assert.equal(PG.cover, 'KD 180 of new business: new account Salwa and 1 first-time product');
    // the people: the same rows for everyone, money first
    const g = PG.people.find(p => p.rep === 'Dr. Ghaith'), r = PG.people.find(p => p.rep === 'Renova');
    assert.deepEqual([g.money.big, r.money.big], ['KD 530', 'KD 184']);
    assert.ok(/^New account Salwa/.test(r.signature.line) && r.signature.proof === 'SINV0077191');
    assert.ok(/^Order at Dr\. Nael/.test(g.signature.line) && g.signature.big === 'KD 520');
    assert.ok(PG.people.every(p => p.money && p.month && 'facts' in p));
    // price: the samples (2 documents, list value) and the returns against the limit
    assert.deepEqual([PG.price.samples.docs, PG.price.samples.gross, PG.price.returns.week], [2, 22, 1.3]);
    // the close: commitments and the recap in page 2's words (R12)
    assert.ok(PG.close.commits.length >= 2 && PG.close.recap.startsWith('This week: KD 864 invoiced · KD 180 new business'));
    assert.equal(S.all.find(i => i.key === 'seeds').big, '2');
    // the panel's rules: the plan says the fair yardstick and the plain arithmetic; the people share one month line
    assert.equal(PG.plan.sameDays, 'Same days of September: KD 2,160 · September closed at KD 8,680');
    assert.ok(/^Needed: KD [\d,]+ a working day · so far: KD [\d,]+ a working day$/.test(PG.plan.perDayLine), PG.plan.perDayLine);
    assert.ok(PG.people.every(p => /^October to date: /.test(p.month.text)), PG.people.map(p => p.month.text));
    assert.equal(PG.people.find(p => p.rep === 'Dr. Ghaith').closedLine, 'September closed: KD 40 (no target)');
    assert.ok(/^Next week: 3 key accounts, 1 prospect and KD 198 to invoice$/.test(PG.next.title), PG.next.title);
    assert.ok(/^Key accounts: 1 of the 3 booked; visit the rest, first Jibla Dental Center \(KD 9,900\)/.test(PG.close.commits[0].text), PG.close.commits[0].text);
    assert.equal(S.momentum.length, 0);                                                         // the week's sales do not lead: no 8-week page
  });
  test('weeklyPages: an invoice above its discount limit is never the hero or a signature; the cover rule; the month counts to the ERP cut-off', () => {
    const { data, reps } = realWeekData();
    const W = core.weeklyReport(data, { end: '2026-10-08', reps });
    const trend = core.monthlyTrend(data, { reps, end: '2026-10-08', months: 3 });
    // Salwa's first order (SINV0077191) above its limit: the hero and Renova's signature move on to an invoice within limits
    const W1 = JSON.parse(JSON.stringify(W)); W1.margin.over = [{ doc: 'SINV0077191', account: 'Salwa', pct: 45, limit: 35 }];
    const P1 = core.weeklyStory(W1, { presenter: 'Dr. Ghaith', trend }).pages;
    assert.notEqual(P1.newBiz.wins[0].doc, 'SINV0077191');
    assert.ok(P1.newBiz.wins.find(w => w.doc === 'SINV0077191').overLimit);
    assert.ok(!/Salwa/.test((P1.people.find(p => p.rep === 'Renova').signature || {}).line || ''));
    // the presenter's own new business above half the figure: the cover falls back to the week's money line
    const P2 = core.weeklyStory(W, { presenter: 'Renova', trend }).pages;
    assert.equal(P2.cover, P2.money.title);
    // a closed month that rose in KD and % leads the cover on days 1–10
    const T3 = JSON.parse(JSON.stringify(trend)), sep = T3.months[T3.months.length - 2], aug = T3.months[T3.months.length - 3];
    reps.forEach(r => { if(sep.byRep[r] && aug.byRep[r]){ aug.byRep[r].sales = 100; aug.byRep[r].target = 1000; aug.byRep[r].pct = 0.1; sep.byRep[r].target = 1000; sep.byRep[r].sales = 900; sep.byRep[r].pct = 0.9; } });
    const P3 = core.weeklyStory(W, { presenter: 'Dr. Ghaith', trend: T3 }).pages;
    assert.ok(/^September closed at 90% of target: KD [\d,]+ of KD [\d,]+ \(August 10%\)$/.test(P3.cover), P3.cover);
    // the ERP stops on 7 Oct: day 7, 5 of 21 working days gone, 16 left
    const W4 = JSON.parse(JSON.stringify(W)); W4.salesTo = '2026-10-07';
    const P4 = core.weeklyStory(W4, { presenter: 'Dr. Ghaith', trend }).pages;
    assert.deepEqual([P4.plan.day, P4.plan.workdays.done, P4.plan.workdays.left], [7, 5, 16]);
  });
  test('storyGate: rises, records, streaks and materiality follow the deck rules R2–R6', () => {
    const g = core.storyGate;
    assert.equal(g.rise(17, 14, false), true); assert.equal(g.rise(15, 14, false), false);        // +1 is not a rise
    assert.equal(g.rise(4600, 4484, true), false); assert.equal(g.rise(5000, 4484, true), true);   // +2.6% is not; +11.5% and +KD 516 is
    assert.equal(g.rise(5, null, false), false);                                                    // no baseline, no rise
    assert.equal(g.record([null, null, null, null, null, null, 269, 530]), false);                  // one earlier week: no "best of 8"
    assert.equal(g.record([7, 25, 13, 14, 31, 11, 14, 17]), false);
    assert.equal(g.record([7, 25, 13, 14, 31, 11, 14, 32]), true);
    assert.equal(g.record([0, 0, 0, 5, 6]), false);                                                 // a single earlier week above zero is no record
    assert.equal(g.streak([null, null, 5, 16, 12, 6, 28, 3]), 6); assert.equal(g.streak([3, 0, 2]), 1); assert.equal(g.streak([3, 4, null]), 0);
    assert.equal(g.material(100, 24204), false); assert.equal(g.material(1500, 24204), true); assert.equal(g.material(1300, 24204), true);
    assert.equal(g.rank([7, 25, 13, 14, 31, 11, 14, 17]), 3);
    assert.equal(g.pctOk(14, false), true); assert.equal(g.pctOk(9, false), false); assert.equal(g.pctOk(200, true), false);
  });
  test('teamSalesLikeForLike: weeks compare the same people only', () => {
    const W = { reps: ['Mariam', 'Renova', 'Dr. Ghaith'], history: [
      { byRep: { Mariam: 100, Renova: 200, 'Dr. Ghaith': null } }, { byRep: { Mariam: 150, Renova: null, 'Dr. Ghaith': null } }, { byRep: { Mariam: 50, Renova: 60, 'Dr. Ghaith': 530 } }] };
    const t = core.teamSalesLikeForLike(W);                         // the people covered this week AND last week: Mariam only
    assert.deepEqual(t.people, ['Mariam']); assert.deepEqual(t.values, [100, 150, 50]);
  });
  test('foldProducts: lines that share one photo become one family; clinics counted once', () => {
    const P = [{ product: 'OS40M Strips', brand: 'intensiv', qty: 3, net: 105, accountKeys: ['a', 'b'] }, { product: 'Swingle', brand: 'intensiv', qty: 1, net: 380, accountKeys: ['a'] },
      { product: 'OS80XC Strips', brand: 'intensiv', qty: 2, net: 70, accountKeys: ['b'] }, { product: 'Imprelon S+', brand: 'scheu', qty: 1, net: 155, accountKeys: ['s'] }];
    const f = core.foldProducts(P, p => /Strips/.test(p.product) ? { key: 'strips', display: 'Intensiv Ortho-Strips' } : null);
    assert.deepEqual(f.map(x => [x.display, x.qty, x.net, x.accounts, x.members.length]), [['Swingle', 1, 380, 1, 1], ['Intensiv Ortho-Strips', 5, 175, 2, 2], ['Imprelon S+', 1, 155, 1, 1]]);
  });
  test('weeklyReport: margin kept, expansion pipeline and satisfaction signals', () => {
    const row = (d, doc, cust, gross, net, type) => [d, doc, type ? 1 : 0, 'P', 1, gross, net, 0, 'Mariam Zohair', 'Intensiv', cust, 'Clinics', 0, ''];
    const clinics = [{ id: 'a', name: 'Alpha', rep: 'Mariam', cls: 'A' }, { id: 'b', name: 'Beta', rep: 'Mariam', cls: 'B' }, { id: 'c', name: 'Gamma', rep: 'Mariam', cls: 'B' }, { id: 'z', name: 'Zeta', rep: 'Mariam', cls: 'C' }];
    const T = (d, h) => d + 'T' + h + ':00';
    const data = { today: '2026-10-08', clinics, erpMap: {},
      erpSales: { periods: [{ id: 'p', from: '2026-07-01', to: '2026-10-08', repMap: { 'Mariam Zohair': 'Mariam' }, rows: [
        row('2026-07-05', 'S0', 'Alpha', 100, 80), row('2026-07-06', 'S00', 'Beta', 100, 80),
        row('2026-09-28', 'S1', 'Alpha', 100, 70),                       // last week: 30%
        row('2026-10-05', 'S2', 'Alpha', 100, 80),                       // A: 20%, within 40
        row('2026-10-06', 'S3', 'Beta', 50, 40),                         // B: 20%, within 35
        row('2026-10-06', 'S4', 'Beta', 20, 0),                          // an all-free document: a sample, not a sale
        row('2026-10-07', 'R1', 'Beta', 0, -6, true)] }] },             // a return: 6 of 120 sold = 5%
      visits: [{ id: 'v1', date: '2026-10-05', rep: 'Mariam', clinicId: 'a', mood: 'pleased' }, { id: 'v2', date: '2026-10-06', rep: 'Mariam', clinicId: 'z', mood: 'pleased' },
        { id: 'v3', date: '2026-10-07', rep: 'Mariam', clinicId: 'z', mood: 'neutral' }, { id: 'v4', date: '2026-10-07', rep: 'Mariam', clinicId: 'c', mood: 'pleased' }],
      events: [{ id: 'e1', kind: 'issue', type: 'request', rep: 'Mariam', clinicId: 'a', at: T('2026-10-05', '09:00'), resolvedAt: T('2026-10-05', '15:00') }] };
    const w = core.weeklyReport(data, { end: '2026-10-08', reps: ['Mariam'] });
    assert.deepEqual([w.margin.invoices, w.margin.discount, w.margin.withinLimit], [2, 20, 1]);           // (150 − 120) / 150
    assert.equal(w.history[6].discount, 30); assert.equal(w.margin.avgPrev, 30);
    assert.deepEqual([w.expansion.territory, w.expansion.active], [4, 2]);
    assert.deepEqual(w.expansion.pipeline.map(p => [p.clinic, p.visits]), [['Zeta', 2], ['Gamma', 1]]);   // visited, no invoice in 90 days
    assert.deepEqual(w.satisfaction.repeatAccounts, ['Alpha', 'Beta']);
    assert.deepEqual([w.satisfaction.requests, w.satisfaction.answeredOnTime, w.satisfaction.returnsPct], [1, 1, 5]);
    assert.deepEqual(w.satisfaction.moods, { pleased: 3, neutral: 1, concerned: 0 });
    const hl = core.weeklyHighlights(w);
    assert.ok(hl.some(t => /^More margin kept: average discount 20% against 30%/.test(t)), hl);
    assert.ok(hl.some(t => /^Every invoice within the discount limits \(2 invoices/.test(t)));
    assert.ok(hl.some(t => /^Doctors pleased on 3 of 4 visits/.test(t)));
    assert.ok(hl.some(t => /^2 clinics in the pipeline/.test(t)));
    assert.ok(hl.some(t => /^Every client request answered on time \(1\)/.test(t)));
  });
  test('catalogGaps: the Intensiv list and products of brands the catalog lacks, priced from the invoices; services never', () => {
    const products = [{ id: 'p1', name: 'Sonicare 4100', brand: 'Philips' }, { id: 'OS40M-DS/3', name: 'Old strip name', brand: 'Intensiv' }];
    const R = (product, brand, qty, gross, date, type) => ({ product, brand, qty, gross, net: gross, date: date || '2026-10-01', type: type || 'invoice' });
    const rows = [
      R('OS80XC Intensiv Ortho-Strips Coarse, Double-Sided REDUCTION', 'Intensiv', 2, 70, '2026-09-20'),
      R('Bio Gel A', 'B&L Biotech', 1, 9), R('Bio Gel A', 'B&L Biotech', 2, 18, '2026-10-03'), R('Bio Gel A', 'B&L Biotech', 1, 12), R('Bio Gel A', 'B&L Biotech', 1, 0),
      R('Bio Gel A', 'B&L Biotech', -1, -9, '2026-10-04', 'return'),
      R('Sonicare 4300', 'Philips Export BV', 1, 49),                    // Philips is in the catalog: not offered
      R('Inspection Fee for Intensiv Handpiece', 'Maintenance ', 1, 10), R('Delivery', 'Delivery Charge', 1, 2), R('Kit A', 'Combo/Bundle/Kit', 1, 30),
      R('Tepe poster', 'Tepe - Marketing Materials / Items', 1, 0)];
    const builtIn = [{ id: 'OS40M-DS/3', name: 'OS40M Intensiv Ortho-Strips Coarse, Double-Sided CONTOURING', brand: 'Intensiv', price: 35 },
      { id: 'OS80XC-DS/3', name: 'OS80XC Intensiv Ortho-Strips Coarse, Double-Sided REDUCTION', brand: 'Intensiv', price: 35 }];
    const g = core.catalogGaps(products, rows, builtIn);
    assert.deepEqual(g.map(x => [x.product.brand, x.product.name, x.product.price, x.source, x.sold]), [
      ['B&L Biotech', 'Bio Gel A', 9, 'erp', 5],                            // usual price 9 (twice) over 12; the return is not "sold"
      ['Intensiv', 'OS80XC Intensiv Ortho-Strips Coarse, Double-Sided REDUCTION', 35, 'list', 2]]); // OS40M is in by its code
    assert.equal(g[0].last, '2026-10-03'); assert.equal(g[1].last, '2026-09-20');
    assert.equal(g[0].product.id, 'erp-bio-gel-a');
    g[1].product.price = 1; assert.equal(builtIn[1].price, 35);          // a copy, never the list itself
    assert.deepEqual(core.catalogGaps(products.concat(g.map(x => x.product)), rows, builtIn), []);
  });
  test('monthlyTrend: month by month with each month\'s own target, same-day comparison, no invented zeros', () => {
    const row = (d, doc, cust, net, product) => [d, doc, 0, product || 'P', 1, net, net, 0, 'Mariam Zohair', 'Intensiv', cust, 'Clinics', 0, ''];
    const clinics = [{ id: 'a', name: 'Alpha Dental', rep: 'Mariam', cls: 'A', doctors: [] }, { id: 'b', name: 'Beta Clinic', rep: 'Mariam', cls: 'B', doctors: [] }];
    const data = { today: '2026-10-08', clinics, erpMap: {},
      targets: { Mariam: { revenue: 1000, month: '2026-10' }, _history: { '2026-09': { Mariam: { revenue: 800 } }, '2026-08': { Mariam: { revenue: 900 } } } },
      erpSales: { periods: [{ id: 'p', from: '2026-08-01', to: '2026-10-08', repMap: { 'Mariam Zohair': 'Mariam' }, rows: [
        row('2026-08-03', 'S1', 'Alpha Dental', 100), row('2026-08-20', 'S2', 'Alpha Dental', 200),
        row('2026-09-02', 'S3', 'Alpha Dental', 150), row('2026-09-06', 'S4', 'Beta Clinic', 50), row('2026-09-25', 'S5', 'Alpha Dental', 300),
        row('2026-10-01', 'S6', 'Alpha Dental', 100), row('2026-10-05', 'S7', 'Alpha Dental', 80, 'Sonic 4300')] }] },
      visits: [
        { id: 'v1', date: '2026-08-04', rep: 'Mariam', clinicId: 'a', doctorIds: ['d1'] }, { id: 'v2', date: '2026-08-11', rep: 'Mariam', clinicId: 'a', doctorIds: ['d1'] },
        { id: 'v3', date: '2026-09-07', rep: 'Mariam', clinicId: 'b' }, { id: 'v4', date: '2026-09-08', rep: 'Mariam', clinicId: 'b', callOnly: true },
        { id: 'v5', date: '2026-10-04', rep: 'Mariam', clinicId: 'a', doctorIds: ['d1'] }, { id: 'v6', date: '2026-10-05', rep: 'Mariam', clinicId: 'a', doctorIds: ['d2'] },
        { id: 'v7', date: '2026-10-06', rep: 'Mariam', clinicId: 'b' }] };
    const tr = core.monthlyTrend(data, { reps: ['Mariam', 'Renova'], months: 4, settings: {} });
    assert.deepEqual(tr.months.map(m => m.month), ['2026-08', '2026-09', '2026-10']);   // July: no file, no visit → dropped
    const M = tr.months.map(m => m.byRep.Mariam);
    assert.deepEqual(M.map(x => x.sales), [300, 500, 180]);
    assert.deepEqual(M.map(x => x.target), [900, 800, 1000]);                           // each month's own DSR target
    assert.deepEqual(M.map(x => x.sameDays), [100, 200, 180]);                          // 1st–8th of each month
    assert.deepEqual(M.map(x => x.fieldVisits), [2, 1, 3]);                             // the call is not a field visit
    assert.deepEqual(M.map(x => x.doctorsMet), [1, 0, 2]);
    assert.deepEqual(M.map(x => x.newAccounts), [null, 1, 0]);                          // first month of the files: not measurable
    assert.deepEqual(M.map(x => x.placements), [null, 0, 1]);
    assert.equal(M[2].perDay, 0.5); assert.equal(tr.months[2].partial, true); assert.equal(tr.months[1].partial, false);
    assert.equal(typeof M[2].kpi, 'number'); assert.equal(tr.months[0].byRep.Renova.kpi, null);   // nothing logged: no score
    assert.ok(tr.months.every(m => m.byRep.Renova.sales === null));                     // her salesman is in no file: no figure, never 0
    assert.equal(tr.months[1].team.pct, 0.625);
    assert.deepEqual(core.targetOf(data, 'Mariam', '2026-07'), {});
  });
  test('a sales file holding only one salesman never reports the others as "0 to date"', () => {
    const row = (d, sm, net) => [d, 'SINV' + d + sm.length, 0, 'x', 1, net, net, 0, sm, 'Intensiv', 'Some Customer', 'Clinics', 0, ''];
    const data = (repMap, rows) => ({ today: '2026-10-07', clinics: [], erpMap: {}, erpSales: { periods: [{ id: 'p', from: '2026-10-05', to: '2026-10-05', repMap, rows }] } });
    // his own export: Mariam's salesman is not in it at all
    let d = data({ 'Ghaith Al Manfe': 'Dr. Ghaith' }, [row('2026-10-05', 'Ghaith Al Manfe', 21.25)]);
    assert.equal(core.monthAchievement('Dr. Ghaith', d).amount, 21.25);
    let m = core.monthAchievement('Mariam', d);
    assert.equal(m.amount, 0); assert.doesNotMatch(m.src, /^ERP to/); assert.match(m.src, /no invoice/i); assert.equal(m.complete, false);
    // a team export that carries her salesman but no line of hers that day: a true zero
    d = data({ 'Ghaith Al Manfe': 'Dr. Ghaith', 'Mariam Zohair': 'Mariam' }, [row('2026-10-05', 'Ghaith Al Manfe', 21.25)]);
    m = core.monthAchievement('Mariam', d);
    assert.equal(m.amount, 0); assert.equal(m.src, 'ERP to Oct 5');
  });
  test('clinic distribution file: repeated headers, shared owners, totals and summary blocks skipped', () => {
    const H = ['Name', 'Account', 'Previous rep', 'Now with', 'Avg / month (KD)'];
    const sheets = [{ name: 'Clinic distribution', rows: [
      ['Clinic distribution – October'], [],
      H, ['Ghaith', 'Bayan Dental Center', 'Mariam', 'Ghaith', 2382], ['Ghaith', 'Aline Dental Centers', 'Renova', 'Ghaith', 1284],
      ['Ghaith', 'NHC - Dr. Nael Al Hazeem Dental Centers', 'Mariam', 'Ghaith', 374], ['Ghaith total (3 accounts)', null, null, null, 4040],
      H, ['Mariam', 'Dr. Nael Al Hazeem Pharmacy ( Al Soor )', 'Mariam', 'Mariam', 172], ['Mariam', 'Gulf Clinic', 'Mariam', 'Mariam', 90],
      ['Renova', 'Dr.Teeth Dental Care Center Shaab', 'Renova', 'Renova', 2], ['Renova', 'Meena Dental Speciality Center', 'Renova', 'Renova', 2],
      H, ['Shared', 'Ministry Of Health', 'Mariam', 'Mariam + Ghaith', 600], ['Shared', 'Jahra Hospital (MOH)', '—', 'Renova + Ghaith', 0],
      ['Shared', 'Nowhere Clinic', 'Mariam', 'Somebody Else', 0],
      ['Name', 'Accounts', 'Avg / month (KD)', 'Share'], ['Ghaith', 5, 5433, 0.48], ['Team', 57, 11161, 1]] }];
    const reps = ['Mariam', 'Renova', 'Dr. Ghaith'];
    const d = core.parseDistribution(sheets, reps);
    assert.equal(d.rows.length, 9);                                            // summary block and totals ignored
    assert.deepEqual(d.rows.find(r => r.account === 'Ministry Of Health').owners, ['Mariam', 'Dr. Ghaith']);
    assert.equal(d.rows.find(r => r.account === 'Ministry Of Health').shared, true);
    assert.deepEqual(d.badOwners, [{ account: 'Nowhere Clinic', owner: 'Somebody Else' }]);
    const clinics = [
      { id: 'b', name: 'Bayan Dental Center', rep: 'Mariam' },
      { id: 'a1', name: 'Aline Dental Center Jahra', rep: 'Renova' }, { id: 'a2', name: 'Aline Dental Center Shaab', rep: 'Renova' },
      { id: 'n1', name: 'Dr. Nael Al Hazeem Dental Center - Sharq', rep: 'Mariam' }, { id: 'np', name: 'Dr. Nael Al Hazeem Pharmacy ( Al Soor )', rep: 'Mariam' },
      { id: 'g', name: 'Gulf Clinic', rep: 'Mariam' }, { id: 'gm', name: 'Gulf Medical Service', rep: 'Renova' },
      { id: 't', name: 'Dr. Teeth Dental Care, Mangaf', rep: 'Mariam' }, { id: 'me', name: 'Meena Dental', rep: 'Renova' },
      { id: 'moh', name: 'Ministry Of Health', rep: 'Mariam' }, { id: 'ih', name: 'International Hospital', rep: 'Renova' },
      { id: 'x', name: 'Closed Clinic', rep: 'Mariam', cls: 'Closed' }];
    const plan = core.planDistribution(d, clinics, {}, '2026-10-01');
    const ch = Object.fromEntries(plan.changes.map(c => [c.clinicId, c]));
    assert.deepEqual(Object.keys(ch).sort(), ['a1', 'a2', 'b', 'moh', 'n1']);  // both Aline branches, the NHC clinic, the ministry
    assert.equal(ch.n1.to, 'Dr. Ghaith'); assert.equal(ch.moh.shared, true); assert.equal(ch.moh.to, 'Mariam');
    assert.ok(!ch.np && !ch.t && !ch.gm && !ch.ih);                             // pharmacy, other Dr. Teeth branch, look-alikes untouched
    assert.deepEqual(plan.missing.map(m => m.account).sort(), ['Dr.Teeth Dental Care Center Shaab', 'Jahra Hospital (MOH)']);
    assert.ok(plan.same.some(x => x.clinicId === 'me'));                        // "Meena Dental" already Renova's: no change, not missing
    const n = core.applyDistributionPlan(plan, clinics, reps);
    assert.equal(n, 5);
    const c = id => clinics.find(x => x.id === id);
    assert.deepEqual([c('b').rep, c('b').prevRep, c('b').repSince], ['Dr. Ghaith', 'Mariam', '2026-10-01']);
    assert.deepEqual([c('moh').rep, c('moh').shared, c('moh').sharedSince, c('moh').prevRep], ['Mariam', true, '2026-10-01', undefined]);
    assert.equal(c('np').rep, 'Mariam');
    // applying the same file again changes nothing
    assert.equal(core.planDistribution(d, clinics, {}, '2026-10-01').changes.length, 0);
  });
  test('a shared account counts each invoice for whoever issued it (from sharedSince)', () => {
    const cl = [{ id: 'moh', name: 'Ministry Of Health', rep: 'Mariam', shared: true, sharedSince: '2026-10-01' }];
    const rm = { 'Ghaith Al Manfe': 'Dr. Ghaith', 'Mariam Zohair': 'Mariam' };
    const row = (d, sm) => ({ customer: 'Ministry Of Health', salesman: sm, date: d, net: 10 });
    assert.equal(core.erpRowRep(row('2026-10-05', 'Ghaith Al Manfe'), cl, {}, rm), 'Dr. Ghaith'); // his invoice is his
    assert.equal(core.erpRowRep(row('2026-10-05', 'Mariam Zohair'), cl, {}, rm), 'Mariam');
    assert.equal(core.erpRowRep(row('2026-10-05', 'Someone Else'), cl, {}, rm), null);           // not the team's: nobody's
    assert.equal(core.erpRowRep(row('2026-09-20', 'Ghaith Al Manfe'), cl, {}, rm), 'Mariam');    // before sharing: the owner's, closed months never move
    assert.equal(core.erpRowRep(row('2026-10-05', 'Ghaith Al Manfe'), [{ id: 'moh', name: 'Ministry Of Health', rep: 'Mariam' }], {}, rm), 'Mariam'); // not shared: territory rule
  });
  test('a clinic handed over keeps lines before repSince with the previous rep', () => {
    const cl = [{ id: 'b', name: 'Bayan Dental Center', rep: 'Dr. Ghaith', prevRep: 'Mariam', repSince: '2026-10-01' }];
    const row = d => ({ customer: 'Bayan Dental Center', salesman: 'Mariam Zohair', date: d, net: 10 });
    assert.equal(core.erpRowRep(row('2026-09-30'), cl, {}, {}), 'Mariam');   // September stays hers
    assert.equal(core.erpRowRep(row('2026-10-01'), cl, {}, {}), 'Dr. Ghaith'); // October is his
    assert.equal(core.clinicRepOn({ rep: 'Renova' }, '2026-01-01'), 'Renova');  // no handover → owner
    assert.equal(core.clinicRepOn({ rep: 'Renova', repSince: '2026-10-01' }, '2026-09-01'), 'Renova'); // no prevRep → owner
    // month-to-date follows the same rule: a September file is still Mariam's
    const data = { today: '2026-09-28', clinics: cl, erpMap: {}, erpSales: { periods: [{ id: 'p', from: '2026-09-01', to: '2026-09-27',
      repMap: { 'Mariam Zohair': 'Mariam' }, rows: [[ '2026-09-20', 'SINV1', 0, 'x', 1, 100, 80, 0, 'Mariam Zohair', 'Intensiv', 'Bayan Dental Center', 'Clinics', 0, '' ]] }] } };
    const mtd = core.erpMtd(data);
    assert.equal(mtd.Mariam && mtd.Mariam.amount, 80);
    assert.equal(mtd['Dr. Ghaith'], undefined);
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
  test('customers named like built-in object properties are listed and counted — no crash, nothing leaks into every object (v113 safety)', () => {
    const names = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
    const rows = names.map((n, i) => ({ date: '2026-10-07', doc: 'SINV' + i, type: 'invoice', net: 10 + i, sret: 0, salesman: 'Mariam Zohair', customer: n, brand: 'TEPE', cls: 'Clinics' }));
    const rec = core.reconcileErp({ rows, visits: [], clinics: [], erpMap: {}, repMap: { 'Mariam Zohair': 'Mariam' }, from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(rec.unmatchedCustomers.slice().sort(), names.slice().sort());
    const mariam = rec.perRep.find(r => r.rep === 'Mariam');
    assert.equal(mariam.erp.net, 60);
    assert.deepEqual(mariam.invoicedNoVisit.map(x => [x.customer, x.net]).sort(), names.map((n, i) => [n, 10 + i]).sort());
    assert.deepEqual([({}).net, ({}).sret, ({}).docs], [undefined, undefined, undefined]);
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
  test('coach measures the target ONLY from the ERP sales files, paced to the day they cover', () => {
    const today = '2026-08-25';
    const base = { from: '2026-08-01', to: today, today, repFilter: 'all', visits: [], clinics: [], dayPlans: {} };
    // No sales file → no verdict (the DSR achieved column is never used, app orders neither)
    const none = core.coachInsights({ ...base, targets: { Mariam: { revenue: 1000, achieved: 900, achievedAsOf: '2026-08-20' } } })
      .find(i => i.key === 'target-Mariam');
    assert.equal(none, undefined);
    // ERP covering to 11 Aug: 500 ≥ the prorated pace at that day → good
    const ok = core.coachInsights({ ...base, targets: { Mariam: { revenue: 1000 } }, erpMtd: { Mariam: { amount: 500, asOf: '2026-08-11', covered: '2026-08-11' } } })
      .find(i => i.key === 'target-Mariam');
    assert.equal(ok.level, 'good');
    assert.match(ok.detail, /ERP sales files/);
  });
  test('a DSR achieved figure never replaces or adds to the ERP figure', () => {
    const today = '2026-08-25';
    const t = core.coachInsights({ from: '2026-08-01', to: today, today, repFilter: 'all', visits: [], clinics: [], dayPlans: {},
      targets: { Mariam: { revenue: 1000, achieved: 200, achievedAsOf: '2026-08-24' } },
      erpMtd: { Mariam: { amount: 600, asOf: '2026-08-20', covered: '2026-08-20' } } }).find(i => i.key === 'target-Mariam');
    assert.match(t.detail, /^600\.00 KD \(ERP sales files\)/);
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
    // Updated on purpose in v114 (same-days windows, house rule since v105):
    // this week (Sun 30 Aug) is compared with the same days of last week —
    // Sun 23 Aug only — so h2 on 25 Aug is outside it. It was rxLastWeek 2
    // (the whole previous week).
    assert.equal(sara.handovers.rxPrevWeek, 0);
    assert.equal(sara.handovers.rxMonth, 5);
    // Updated on purpose in v114: the same days of last month (1–30 Jul)
    // instead of the whole of July — h3 on 20 Jul is inside both. It was rxLastMonth 4.
    assert.equal(sara.handovers.rxPrevMonth, 4);
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
    // Updated on purpose in v114 (same-days windows): today is Sunday 30 Aug,
    // so the comparison is Sunday 23 Aug only — the 25 Aug entry is outside it
    // (it was lastWeek 3, the whole previous week), and growth from 0 is no
    // percentage at all (it was 100: 3 → 6).
    assert.equal(g.byDoctor[0].prevWeek, 0);
    assert.equal(g.byDoctor[0].weekGrowth, null);
    assert.equal(g.byClinic.length, 1);
    assert.equal(g.byClinic[0].month, 11);
    assert.equal(g.byClinic[0].doctors, 2);
    assert.equal(g.totals.week, 8);
    // Updated on purpose in v114, same reason (it was totals.lastWeek 3).
    assert.equal(g.totals.prevWeek, 0);
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
      erpMtd: { Mariam: { amount: 50, asOf: '2026-08-11', covered: '2026-08-11' } },
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

// ---------- prescriptions given on a visit, by type (v114) ----------
describe('prescriptions given on a visit, by type (v114)', () => {
  // The browser harness's seed (tests/e2e/visit-rx.e2e.js). Clock Tue 13 Oct
  // 2026: this week = 11–13 Oct against the same days of last week (4–6 Oct);
  // this month = 1–13 Oct against 1–13 Sep.
  const TODAY = '2026-10-13';
  const T = {
    ortho: { id: 'tortho', name: 'Ortho care prescription', active: true },
    white: { id: 'twhite', name: 'Whitening prescription', active: true },
    impl: { id: 'timpl', name: 'وصفة العناية بالزراعة', active: true },
    kids: { id: 'tkids', name: 'Kids prescription', active: false }, // retired
  };
  const TYPES = { v: 1, rev: 3, by: 'Dr. Ghaith', at: '2026-10-01T09:00:00', types: [T.ortho, T.white, T.impl, T.kids] };
  const L = (t, qty, doctorId) => ({ type: t.id, name: t.name, qty, doctorId });
  const clinicsSeed = () => [
    { id: 'm1', name: 'Dental 8 Clinic', rep: 'Mariam', dealType: 'prescription', doctors: [
      { id: 'm1-d1', name: 'Dr. Huda Ali', handovers: [{ id: 'h1', date: '2026-10-12', kind: 'prescription', what: 'Rx pads', qty: 2, by: 'Mariam' }] },
      { id: 'm1-d2', name: 'Dr. Omar Saleh' }] },
    { id: 'm2', name: 'Smile Care Clinic', rep: 'Mariam', doctors: [{ id: 'm2-d1', name: 'Dr. Sara Nasser' }] },
    { id: 'r1', name: 'Crown Dental Center', rep: 'Renova', doctors: [{ id: 'r1-d1', name: 'Dr. Faisal Adel' }] },
  ];
  const V = (id, clinicId, rep, date, doctorIds, rx, extra) => Object.assign({ id, clinicId, rep, date, doctorIds,
    doctorId: doctorIds[0] || null, notes: 'seed ' + id, orderTotal: 0, orders: [], rx }, extra || {});
  const visitsSeed = () => [
    V('vS1', 'm1', 'Mariam', '2026-09-20', ['m1-d1'], [L(T.ortho, 4, 'm1-d1')]),
    V('vO1', 'm1', 'Mariam', '2026-10-05', ['m1-d1', 'm1-d2'], [L(T.ortho, 2, 'm1-d1'), L(T.white, 1, 'm1-d2')]),
    V('vO2', 'r1', 'Renova', '2026-10-12', ['r1-d1'], [L(T.white, 3, 'r1-d1')]),
    V('vC1', 'm1', 'Mariam', '2026-10-12', ['m1-d1'], [L(T.ortho, 9, 'm1-d1')], { callOnly: true, channel: 'call' }), // never counts
  ];
  const figs = o => ({ week: o.week, prevWeek: o.prevWeek, month: o.month, prevMonth: o.prevMonth, total: o.total });
  const grow = (repFilter, extra) => core.rxGrowth(Object.assign({ clinics: clinicsSeed(), visits: visitsSeed(), today: TODAY, repFilter, types: TYPES }, extra || {}));
  const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

  test('the new helpers are exported', () => {
    ['rxQty', 'rxTypeList', 'rxTypeName', 'rxTypesProblem', 'visitRxLines', 'cleanVisitRx', 'rxSig', 'rxText',
      'remapVisitDoctors', 'rxWindows', 'rxLedger'].forEach(n => assert.equal(typeof core[n], 'function', n));
    assert.equal(core.RX_MAX, 999);
    // the owner's two printed forms (11 Oct 2026) are the list until the supervisor saves his own
    assert.deepEqual(core.RX_DEFAULT_TYPES.map(t => ({ ...t })), [
      { id: 'ultramed', name: 'Ultramed fast moving products', active: true },
      { id: 'tepe', name: 'Tepe prescription', active: true }]);
  });

  test('rxQty: a whole number from 0 to 999, cleaned like an order quantity', () => {
    assert.deepEqual(['-4', '2.9', '99999', 'abc', '', null, '12 pcs', 3].map(q => core.rxQty(q)), [0, 2, 999, 0, 0, 0, 12, 3]);
    assert.equal(core.rxQty(undefined), 0);
    assert.equal(core.rxQty(' 7 '), 7);
    assert.equal(core.rxQty(999), 999);
  });

  test('rxTypeList: the owner\'s two forms when missing or damaged; order, first id, trimmed names, active by default, other fields kept', () => {
    const general = [{ id: 'ultramed', name: 'Ultramed fast moving products', active: true }, { id: 'tepe', name: 'Tepe prescription', active: true }];
    [null, undefined, 'junk', 42, {}, { types: 'x' }, { types: [] }, [], [null, 5, 'a', { name: 'no id' }, { id: '   ', name: 'blank id' }]]
      .forEach(doc => assert.deepEqual(core.rxTypeList(doc), general, JSON.stringify(doc)));
    // the default is a fresh copy each time — changing one never changes the next
    const g1 = core.rxTypeList(null); g1[0].name = 'changed';
    assert.equal(core.rxTypeList(null)[0].name, 'Ultramed fast moving products');
    assert.equal(core.RX_DEFAULT_TYPES[0].name, 'Ultramed fast moving products');
    const doc = { v: 1, rev: 2, types: [
      { id: ' b ', name: '  Ortho care prescription ' },
      { id: 'a', name: 'Kids prescription', active: false, brands: ['TEPE'] },
      { id: 'b', name: 'a second "b" — the first one wins' },
      { id: 'c', name: '   ' },
    ] };
    const list = core.rxTypeList(doc);
    assert.deepEqual(list, [
      { id: 'b', name: 'Ortho care prescription', active: true },
      { id: 'a', name: 'Kids prescription', active: false, brands: ['TEPE'] },
      { id: 'c', name: 'Prescription', active: true },
    ]);
    assert.equal(doc.types[0].id, ' b '); // the document itself is not touched
    assert.deepEqual(core.rxTypeList(doc.types), list); // a bare list works the same
    // every type retired: returned as it is — nothing is quietly switched back on
    assert.deepEqual(core.rxTypeList([{ id: 'x', name: 'X', active: false }]), [{ id: 'x', name: 'X', active: false }]);
  });

  test('rxTypeName: the current name by id, else the name saved on the line, else "Prescription"', () => {
    const list = [{ id: 'tortho', name: 'Ortho care prescription', active: true }];
    assert.equal(core.rxTypeName('tortho', list, 'an older name'), 'Ortho care prescription');
    assert.equal(core.rxTypeName('tortho', { types: list }, ''), 'Ortho care prescription');
    assert.equal(core.rxTypeName('tgone', list, 'Kids prescription'), 'Kids prescription');
    assert.equal(core.rxTypeName('tgone', list, '  '), 'Prescription');
    assert.equal(core.rxTypeName('tepe', null, null), 'Tepe prescription'); // the built-in list
  });

  test('rxTypesProblem: empty, too long, the same name twice (case and spaces ignored), none active; a good list passes', () => {
    assert.equal(core.rxTypesProblem([{ id: 'a', name: 'Ortho' }, { id: 'b', name: '   ' }]), 'name-empty');
    assert.equal(core.rxTypesProblem([{ id: 'a', name: 'x'.repeat(41) }]), 'name-long');
    assert.equal(core.rxTypesProblem([{ id: 'a', name: ' ' + 'x'.repeat(40) + ' ' }]), null);
    assert.equal(core.rxTypesProblem([{ id: 'a', name: 'Whitening & care prescription' }, { id: 'b', name: '  whitening &   CARE prescription ' }]), 'name-duplicate');
    assert.equal(core.rxTypesProblem([{ id: 'a', name: 'Ortho' }, { id: 'b', name: 'ortho', active: false }]), 'name-duplicate'); // a retired name is still taken
    assert.equal(core.rxTypesProblem([{ id: 'a', name: 'Ortho', active: false }]), 'no-active');
    assert.equal(core.rxTypesProblem([]), 'no-active');
    assert.equal(core.rxTypesProblem([{ id: 'a', name: 'Ortho', active: false }, { id: 'b', name: 'Kids' }]), null);
    assert.equal(core.rxTypesProblem({ types: [{ id: 'a', name: 'Ortho' }] }), null); // the document works too
  });

  test('cleanVisitRx: whole quantities, known types, only people met (or the clinic), one line each, in order, current names', () => {
    const types = core.rxTypeList([T.ortho, T.white, T.kids]);
    const out = core.cleanVisitRx([
      { type: 'twhite', qty: '2.9', doctorId: 'd2' },                    // a decimal → 2
      { type: 'tortho', qty: 3, doctorId: 'd1', name: 'an older name' },
      { type: 'tortho', qty: '4', doctorId: 'd1' },                      // the same type and person → summed
      { type: 'tkids', qty: 1, doctorId: 'd1' },                         // retired: still saved on this visit
      { type: 'tzzz', qty: 1, doctorId: 'd1' },                          // a type nobody knows → dropped
      { type: 'tortho', qty: 1, doctorId: 'dX' },                        // a person not met → dropped
      { type: 'tortho', qty: -2, doctorId: 'd1' },                       // negative → nothing
      { type: 'tortho', qty: 0, doctorId: 'd2' },                        // zero → nothing
      { type: 'twhite', qty: 'abc', doctorId: 'd1' },                    // junk → nothing
      { type: '', qty: 5, doctorId: 'd1' },                              // no type → nothing
      null, 'junk',
      { type: 'tortho', qty: 5, doctorId: null },                        // the clinic (no one person): always allowed
      { type: 'twhite', qty: '99999', doctorId: '' },                    // '' is the clinic too; capped at 999
    ], { types, doctorIds: ['d1', 'd2'] });
    // people in the order met, the clinic last; types in the list's order
    assert.deepEqual(out, [
      { type: 'tortho', name: 'Ortho care prescription', qty: 7, doctorId: 'd1' },
      { type: 'tkids', name: 'Kids prescription', qty: 1, doctorId: 'd1' },
      { type: 'twhite', name: 'Whitening prescription', qty: 2, doctorId: 'd2' },
      { type: 'tortho', name: 'Ortho care prescription', qty: 5, doctorId: null },
      { type: 'twhite', name: 'Whitening prescription', qty: 999, doctorId: null },
    ]);
    // lines summed never pass 999
    assert.deepEqual(core.cleanVisitRx([{ type: 'tortho', qty: 600, doctorId: 'd1' }, { type: 'tortho', qty: 600, doctorId: 'd1' }], { types, doctorIds: ['d1'] }),
      [{ type: 'tortho', name: 'Ortho care prescription', qty: 999, doctorId: 'd1' }]);
    // a new customer created in the form: nobody on file, the clinic block only
    assert.deepEqual(core.cleanVisitRx([{ type: 'tortho', qty: 2, doctorId: null }, { type: 'tortho', qty: 2, doctorId: 'd1' }], { types, doctorIds: [] }),
      [{ type: 'tortho', name: 'Ortho care prescription', qty: 2, doctorId: null }]);
    // editing a visit whose type this phone does not know: kept, under the name it was saved with
    const keep = [{ type: 'tother', name: 'Implant care prescription', qty: 2, doctorId: 'd1' }];
    assert.deepEqual(core.cleanVisitRx([{ type: 'tother', qty: 3, doctorId: 'd1' }, { type: 'tortho', qty: 1, doctorId: 'd1' }], { types, doctorIds: ['d1'], keep }), [
      { type: 'tortho', name: 'Ortho care prescription', qty: 1, doctorId: 'd1' },
      { type: 'tother', name: 'Implant care prescription', qty: 3, doctorId: 'd1' },
    ]);
    assert.deepEqual(core.cleanVisitRx([{ type: 'tother', qty: 3, doctorId: 'd1' }], { types, doctorIds: ['d1'] }), []); // …but not without it
    // no list on this phone: the built-in list (the owner's two forms) only
    assert.deepEqual(core.cleanVisitRx([{ type: 'tepe', qty: 3, doctorId: 'd1' }, { type: 'tortho', qty: 1, doctorId: 'd1' }], { doctorIds: ['d1'] }),
      [{ type: 'tepe', name: 'Tepe prescription', qty: 3, doctorId: 'd1' }]);
    assert.deepEqual(core.cleanVisitRx(null, { types, doctorIds: ['d1'] }), []);
  });

  test('visitRxLines: field visits only; quantities as whole numbers; junk lines dropped', () => {
    const rx = [{ type: 'tortho', name: 'Ortho care prescription', qty: '3', doctorId: 'd1' }, { type: 'twhite', name: 'Whitening prescription', qty: 1, doctorId: '' },
      { type: 'tortho', name: 'x', qty: 0, doctorId: 'd1' }, { name: 'no type', qty: 2, doctorId: 'd1' }, null, 'junk'];
    assert.deepEqual(core.visitRxLines({ id: 'v', date: TODAY, rx }), [
      { type: 'tortho', name: 'Ortho care prescription', qty: 3, doctorId: 'd1' },
      { type: 'twhite', name: 'Whitening prescription', qty: 1, doctorId: null },
    ]);
    assert.deepEqual(core.visitRxLines({ id: 'c', callOnly: true, rx }), []);   // a call
    assert.deepEqual(core.visitRxLines({ id: 'o', orderOnly: true, rx }), []);  // a phone order
    assert.deepEqual(core.visitRxLines({ id: 'n' }), []);
    assert.deepEqual(core.visitRxLines({ id: 'bad', rx: 'x' }), []);
    assert.deepEqual(core.visitRxLines(null), []);
  });

  test('dedupeVisits: different prescriptions = another visit; an exact copy is still one; visits without lines group exactly as before', () => {
    const a = { id: 'v1', date: '2026-10-11', rep: 'Mariam', clinicId: 'c1', notes: '', orderTotal: 0, orders: [], doctorIds: ['d1'] };
    const b = Object.assign({}, a, { id: 'v2', rx: [{ type: 't1', name: 'Ortho', qty: 20, doctorId: 'd1' }] });
    assert.deepEqual(core.dedupeVisits([a, b]).unique.map(v => v.id), ['v1', 'v2']);
    const c = Object.assign({}, b, { id: 'v3', rx: [{ type: 't1', name: 'Ortho', qty: 21, doctorId: 'd1' }] });
    assert.equal(core.dedupeVisits([b, c]).unique.length, 2);
    // a double-save: the same lines (a renamed type does not make it another visit)
    const copy = Object.assign({}, b, { id: 'v2b', rx: b.rx.map(l => Object.assign({}, l, { name: 'renamed since' })) });
    assert.deepEqual(core.dedupeVisits([b, copy]), { unique: [b], dupCount: 1 });
    // the order of the lines does not matter
    assert.equal(core.rxSig([{ type: 'b', qty: 2, doctorId: 'd' }, { type: 'a', qty: 1, doctorId: null }]), 'a::1,b:d:2');
    assert.equal(core.rxSig([{ type: 'a', qty: 1, doctorId: null }, { type: 'b', qty: 2, doctorId: 'd' }]), 'a::1,b:d:2');
    // calls never carry prescriptions: lines on a call do not split it
    const call = { id: 'k1', date: '2026-10-11', rep: 'Mariam', clinicId: 'c1', callOnly: true, notes: '' };
    assert.equal(core.dedupeVisits([call, Object.assign({}, call, { id: 'k2', rx: b.rx })]).unique.length, 1);
    // without lines: exactly the key used before v114 (200 synthetic visits)
    const oldDedupe = visits => { const seen = {}, unique = []; let dup = 0;
      visits.forEach(v => { const key = [v.date, v.rep, v.clinicId, v.callOnly ? 1 : 0, v.orderTotal || 0, (v.notes || ''), (v.orders || []).length].join('|');
        if(seen[key]){ dup++; return; } seen[key] = 1; unique.push(v); });
      return { unique, dupCount: dup }; };
    const vs = [];
    for(let i = 0; i < 200; i++) vs.push({ id: 'v' + i, date: '2026-10-0' + (1 + i % 5), rep: i % 3 ? 'Mariam' : 'Renova', clinicId: 'c' + (i % 4),
      callOnly: i % 7 === 0, orderTotal: (i % 6) * 10, notes: i % 9 ? '' : 'x', orders: i % 11 ? [] : [{ id: 'o' }] });
    const now = core.dedupeVisits(vs), before = oldDedupe(vs);
    assert.ok(before.dupCount > 0);
    assert.deepEqual(now.unique.map(v => v.id), before.unique.map(v => v.id));
    assert.equal(now.dupCount, before.dupCount);
  });

  test('rxLedger: one row per line from the visits plus the old profile entries — samples, gifts, calls and phone orders never', () => {
    const clinics = clinicsSeed();
    clinics[0].doctors[0].handovers.push(
      { id: 'h2', date: '2026-10-10', kind: 'sample', what: 'tips', qty: 5, by: 'Mariam' },
      { id: 'h3', date: '2026-10-10', kind: 'gift', what: 'mug', by: 'Mariam' },
      { id: 'h4', date: '2026-10-09', kind: 'prescription', what: 'pads', qty: '3', by: 'Renova' },
      { date: '2026-10-08', kind: 'prescription', what: 'pads', qty: 0 });
    const visits = visitsSeed().concat([
      V('vP1', 'm1', 'Mariam', '2026-10-12', ['m1-d1'], [L(T.ortho, 7, 'm1-d1')], { orderOnly: true }),   // a phone order: never
      V('vJ1', 'm1', 'Mariam', '2026-10-13', ['m1-d1'], [L(T.white, 2, 'm1-d1')], { withRep: 'Renova' }), // joint: one record
      V('vX1', 'zz', 'Mariam', '2026-10-13', ['zz-d1'], [L(T.ortho, 5, 'zz-d1')]),                         // a clinic not in the list
    ]);
    const all = core.rxLedger({ clinics, visits }, { repFilter: 'all' });
    assert.deepEqual(all.map(r => r.id).sort(), ['h1', 'h4', 'm1|m1-d1|4', 'vJ1:0', 'vO1:0', 'vO1:1', 'vO2:0', 'vS1:0']);
    const row = id => all.find(r => r.id === id);
    assert.deepEqual(row('h1'), { source: 'profile', id: 'h1', visitId: null, date: '2026-10-12', clinicId: 'm1', doctorId: 'm1-d1', listed: true,
      type: null, name: null, qty: 2, rep: 'Mariam', withRep: null });
    assert.equal(row('h4').qty, 3);            // '3' counts as 3
    assert.equal(row('h4').rep, 'Renova');     // whoever handed it over
    assert.equal(row('m1|m1-d1|4').qty, 1);    // an old entry without a quantity counts as one, as before
    assert.deepEqual(row('vO1:1'), { source: 'visit', id: 'vO1:1', visitId: 'vO1', date: '2026-10-05', clinicId: 'm1', doctorId: 'm1-d2', listed: true,
      type: 'twhite', name: 'Whitening prescription', qty: 1, rep: 'Mariam', withRep: null });
    // a joint visit: one row, credited to the person who logged it
    assert.deepEqual([row('vJ1:0').rep, row('vJ1:0').withRep, all.filter(r => r.visitId === 'vJ1').length], ['Mariam', 'Renova', 1]);
    // the owner filter: the clinic's current owner, whoever handed them over (as the Doctors page)
    assert.deepEqual(core.rxLedger({ clinics, visits }, { repFilter: 'Renova' }).map(r => r.id), ['vO2:0']);
    assert.deepEqual(core.rxLedger({ clinics, visits }, { repFilter: 'Mariam' }).map(r => r.id).sort(), ['h1', 'h4', 'm1|m1-d1|4', 'vJ1:0', 'vO1:0', 'vO1:1', 'vS1:0']);
    assert.equal(core.rxLedger({ clinics, visits }).length, all.length); // no filter = everyone
    // a line to the clinic, and one to a doctor no longer on file
    const extra = core.rxLedger({ clinics, visits: [V('vU', 'm1', 'Mariam', TODAY, ['m1-gone'], [L(T.ortho, 2, null), L(T.white, 1, 'm1-gone')])] });
    assert.deepEqual(extra.filter(r => r.source === 'visit').map(r => [r.doctorId, r.listed]), [[null, false], ['m1-gone', false]]);
  });

  test('rxWindows: this week from Sunday and this month from the 1st, each against the same days before', () => {
    assert.deepEqual(core.rxWindows('2026-10-11'), { weekFrom: '2026-10-11', weekTo: '2026-10-11', prevWeekFrom: '2026-10-04', prevWeekTo: '2026-10-04',
      monthFrom: '2026-10-01', monthTo: '2026-10-11', prevMonthFrom: '2026-09-01', prevMonthTo: '2026-09-11' });
    assert.deepEqual(core.rxWindows('2026-10-12'), { weekFrom: '2026-10-11', weekTo: '2026-10-12', prevWeekFrom: '2026-10-04', prevWeekTo: '2026-10-05',
      monthFrom: '2026-10-01', monthTo: '2026-10-12', prevMonthFrom: '2026-09-01', prevMonthTo: '2026-09-12' });
    assert.deepEqual(core.rxWindows('2026-10-31'), { weekFrom: '2026-10-25', weekTo: '2026-10-31', prevWeekFrom: '2026-10-18', prevWeekTo: '2026-10-24',
      monthFrom: '2026-10-01', monthTo: '2026-10-31', prevMonthFrom: '2026-09-01', prevMonthTo: '2026-09-30' });
    assert.deepEqual(core.rxWindows('2026-03-30'), { weekFrom: '2026-03-29', weekTo: '2026-03-30', prevWeekFrom: '2026-03-22', prevWeekTo: '2026-03-23',
      monthFrom: '2026-03-01', monthTo: '2026-03-30', prevMonthFrom: '2026-02-01', prevMonthTo: '2026-02-28' });
    // rxGrowth on those windows: on Monday 12 Oct, Sun–Mon against Sun–Mon of last week — not 1 against
    // the whole of last week (6), which used to show −83% when the same days were equal
    const clinics = [{ id: 'c1', name: 'C1', rep: 'Mariam', doctors: [{ id: 'd1', name: 'Dr A', handovers: [
      { date: '2026-10-11', kind: 'prescription', qty: 1 }, { date: '2026-10-04', kind: 'prescription', qty: 1 }, { date: '2026-10-06', kind: 'prescription', qty: 5 },
      { date: '2026-09-30', kind: 'prescription', qty: 2 }, { date: '2026-02-28', kind: 'prescription', qty: 3 }, { date: '2026-03-01', kind: 'prescription', qty: 4 }] }] }];
    const at = today => core.rxGrowth({ clinics, visits: [], today, repFilter: 'all' }).totals;
    assert.deepEqual([at('2026-10-12').week, at('2026-10-12').prevWeek, at('2026-10-12').weekGrowth], [1, 1, 0]);
    assert.deepEqual([at('2026-10-11').week, at('2026-10-11').prevWeek], [1, 1]);
    assert.equal(at('2026-10-31').prevMonth, 2);   // 30 Sep is inside 1–30 Sep
    assert.equal(at('2026-10-29').prevMonth, 0);   // …but not inside 1–29 Sep
    assert.deepEqual([at('2026-03-30').month, at('2026-03-30').prevMonth], [4, 3]); // 1 Mar against 1–28 Feb
  });

  test('rxGrowth: the harness baseline — totals, by doctor, by center, by type; growth only against something', () => {
    const team = grow('all');
    assert.deepEqual(team.windows, core.rxWindows(TODAY));
    assert.deepEqual(figs(team.totals), { week: 5, prevWeek: 3, month: 8, prevMonth: 0, total: 12 });
    assert.equal(team.totals.weekGrowth, 67);     // 3 → 5
    assert.equal(team.totals.monthGrowth, null);  // from 0: no percentage (it was 100)
    assert.deepEqual(team.totals.incomplete, { week: false, prevWeek: false, month: false, prevMonth: false, total: false });
    // by doctor: the doctors on file, by this month then all time
    assert.deepEqual(team.byDoctor.map(d => d.doctorId), ['m1-d1', 'r1-d1', 'm1-d2']);
    const doc = id => team.byDoctor.find(d => d.doctorId === id);
    assert.deepEqual(figs(doc('m1-d1')), { week: 2, prevWeek: 2, month: 4, prevMonth: 0, total: 8 }); // the call's 9 never
    assert.deepEqual(figs(doc('m1-d2')), { week: 0, prevWeek: 1, month: 1, prevMonth: 0, total: 1 });
    assert.deepEqual(figs(doc('r1-d1')), { week: 3, prevWeek: 0, month: 3, prevMonth: 0, total: 3 });
    assert.deepEqual([doc('m1-d1').weekGrowth, doc('m1-d2').weekGrowth, doc('r1-d1').weekGrowth], [0, -100, null]);
    assert.deepEqual([doc('m1-d1').name, doc('m1-d1').clinicId, doc('m1-d1').clinicName, doc('m1-d1').rep], ['Dr. Huda Ali', 'm1', 'Dental 8 Clinic', 'Mariam']);
    // by center
    assert.deepEqual(team.byClinic.map(c => [c.clinicId, c.name, c.rep, c.doctors, c.unnamed, c.unlisted, c.week, c.prevWeek, c.weekGrowth, c.month, c.total]),
      [['m1', 'Dental 8 Clinic', 'Mariam', 2, 0, 0, 2, 3, -33, 5, 9], ['r1', 'Crown Dental Center', 'Renova', 1, 0, 0, 3, 0, null, 3, 3]]);
    // by type: every active type (at 0 too), a retired one only with lines, the profile entries apart
    assert.deepEqual(team.byType.map(t => [t.type, t.name, t.active, t.week, t.month, t.total]), [
      ['tortho', 'Ortho care prescription', true, 0, 2, 6],
      ['twhite', 'Whitening prescription', true, 3, 4, 4],
      ['timpl', 'وصفة العناية بالزراعة', true, 0, 0, 0],
      [null, 'Type not recorded (doctor profile)', null, 2, 2, 2]]);
    // the rows, newest first, for the export
    assert.equal(team.rows.length, 5);
    assert.deepEqual(team.rows.map(r => r.date), team.rows.map(r => r.date).sort().reverse());
    // Mariam's own page: her clinics only (Faisal is Renova's)
    const mar = grow('Mariam');
    assert.deepEqual(figs(mar.totals), { week: 2, prevWeek: 3, month: 5, prevMonth: 0, total: 9 });
    assert.deepEqual(mar.byDoctor.map(d => d.doctorId), ['m1-d1', 'm1-d2']);
    // nothing in any window: no growth at all, never 0% or 100%
    const later = grow('all', { today: '2026-12-15' });
    assert.deepEqual([later.totals.week, later.totals.weekGrowth, later.totals.month, later.totals.monthGrowth, later.totals.total], [0, null, 0, null, 12]);
  });

  test('rxGrowth: a visit logged today counts once, for the doctor who received the forms', () => {
    const visits = visitsSeed().concat([V('vN1', 'm1', 'Mariam', TODAY, ['m1-d1', 'm1-d2'], [L(T.ortho, 5, 'm1-d1'), L(T.white, 2, 'm1-d1')])]);
    const mar = grow('Mariam', { visits });
    const huda = mar.byDoctor.find(d => d.doctorId === 'm1-d1'), omar = mar.byDoctor.find(d => d.doctorId === 'm1-d2');
    assert.deepEqual([huda.week, huda.month, huda.total, omar.total], [9, 11, 15, 1]); // Omar was met but given nothing
    assert.deepEqual([mar.totals.week, mar.totals.month, mar.totals.total], [9, 12, 16]);
    const team = grow('all', { visits });
    assert.deepEqual([team.totals.week, team.totals.month, team.totals.total], [12, 15, 19]);
  });

  test('rxGrowth: every view adds up — doctors + left at the clinic + no longer listed = centers = types = total, in every window', () => {
    const clinics = clinicsSeed();
    const visits = visitsSeed().concat([
      V('vU1', 'm1', 'Mariam', '2026-10-12', ['m1-d1', 'm1-gone'],
        [L(T.ortho, 1, 'm1-d1'), L(T.white, 3, 'm1-gone'), L({ id: 'general', name: 'General prescription' }, 2, null)]),
      V('vU2', 'r1', 'Renova', '2026-09-08', ['r1-d1'], [L(T.kids, 4, 'r1-d1'), L({ id: 'tlost', name: 'Lost type' }, 1, null)]),
    ]);
    ['all', 'Mariam', 'Renova'].forEach(repFilter => {
      const g = core.rxGrowth({ clinics, visits, today: TODAY, repFilter, types: TYPES });
      ['week', 'prevWeek', 'month', 'prevMonth', 'total'].forEach(w => {
        const inW = r => w === 'total' || (r.date >= g.windows[w + 'From'] && r.date <= g.windows[w + 'To']);
        const rest = sum(g.rows.filter(r => r.doctorId == null || !r.listed), r => inW(r) ? r.qty : 0);
        const at = repFilter + ' ' + w;
        assert.equal(sum(g.byClinic, c => c[w]), g.totals[w], at);
        assert.equal(sum(g.byType, t => t[w]), g.totals[w], at);
        assert.equal(sum(g.byDoctor, d => d[w]) + rest, g.totals[w], at);
        assert.equal(sum(g.rows, r => inW(r) ? r.qty : 0), g.totals[w], at);
      });
      assert.equal(sum(g.byDoctor, d => d.total) + sum(g.byClinic, c => c.unnamed) + sum(g.byClinic, c => c.unlisted), g.totals.total, repFilter);
    });
    const g = core.rxGrowth({ clinics, visits, today: TODAY, repFilter: 'all', types: TYPES });
    const m1 = g.byClinic.find(c => c.clinicId === 'm1'), r1 = g.byClinic.find(c => c.clinicId === 'r1');
    assert.deepEqual([m1.doctors, m1.unnamed, m1.unlisted, m1.total], [2, 2, 3, 15]);
    assert.deepEqual([r1.doctors, r1.unnamed, r1.unlisted, r1.total], [1, 1, 0, 8]);
    assert.ok(!g.byDoctor.some(d => d.doctorId === 'm1-gone' || d.doctorId == null));
    // by type: the retired Kids shows because it has lines; types this list does not know keep their saved names
    assert.deepEqual(g.byType.map(t => [t.type, t.name, t.active, t.total]), [
      ['tortho', 'Ortho care prescription', true, 7],
      ['twhite', 'Whitening prescription', true, 7],
      ['timpl', 'وصفة العناية بالزراعة', true, 0],
      ['tkids', 'Kids prescription', false, 4],
      ['general', 'General prescription', null, 2],
      ['tlost', 'Lost type', null, 1],
      [null, 'Type not recorded (doctor profile)', null, 2]]);
    // a renamed type shows its current name; the lines keep the id
    const renamed = { types: [T.ortho, Object.assign({}, T.white, { name: 'Whitening & care prescription' }), T.impl, T.kids] };
    const g2 = core.rxGrowth({ clinics, visits, today: TODAY, repFilter: 'all', types: renamed });
    assert.deepEqual(g2.byType.filter(t => t.type === 'twhite').map(t => [t.name, t.total]), [['Whitening & care prescription', 7]]);
  });

  test('rxGrowth: a month whose visits did not load makes every window touching it incomplete — no growth there', () => {
    const visits = visitsSeed().concat([V('vS2', 'm1', 'Mariam', '2026-09-05', ['m1-d1'], [L(T.ortho, 2, 'm1-d1')])]);
    const ok = grow('all', { visits });
    assert.equal(ok.totals.monthGrowth, 300); // 2 → 8
    const g = grow('all', { visits, brokenMonths: ['2026-09'] });
    assert.deepEqual(g.totals.incomplete, { week: false, prevWeek: false, month: false, prevMonth: true, total: true });
    assert.equal(g.totals.monthGrowth, null);
    assert.equal(g.totals.weekGrowth, 67); // the week does not touch September
    assert.ok(g.byDoctor.length && g.byDoctor.every(d => d.monthGrowth === null));
    assert.ok(g.byClinic.every(c => c.monthGrowth === null));
    assert.deepEqual(figs(g.totals), figs(ok.totals)); // the figures themselves are what loaded
    // on Thu 1 Oct this week reaches back into September too
    const early = grow('all', { visits, today: '2026-10-01', brokenMonths: ['2026-09'] });
    assert.deepEqual(early.totals.incomplete, { week: true, prevWeek: true, month: false, prevMonth: true, total: true });
    assert.equal(early.totals.weekGrowth, null);
  });

  test('a re-dated visit moves to its new window; the total stays', () => {
    const visits = visitsSeed();
    const before = grow('Mariam', { visits });
    visits.find(v => v.id === 'vO1').date = '2026-09-30';
    const after = grow('Mariam', { visits });
    assert.deepEqual(figs(before.totals), { week: 2, prevWeek: 3, month: 5, prevMonth: 0, total: 9 });
    assert.deepEqual(figs(after.totals), { week: 2, prevWeek: 0, month: 2, prevMonth: 0, total: 9 });
  });

  test('doctorAnalytics: a visit line counts for its own doctor only, an old profile entry once, "3" as 3', () => {
    const clinics = [{ id: 'c1', name: 'C1', rep: 'Mariam', doctors: [
      { id: 'd1', name: 'Dr A', handovers: [{ date: '2026-10-10', kind: 'prescription', qty: '3' }, { date: '2026-10-09', kind: 'prescription', qty: 2 },
        { date: '2026-10-08', kind: 'sample', what: 'tips', qty: '4' }, { date: '2026-10-07', kind: 'gift', what: 'mug' }] },
      { id: 'd2', name: 'Dr B' }] }];
    const visits = [
      { id: 'v1', clinicId: 'c1', rep: 'Mariam', date: '2026-10-11', doctorIds: ['d1', 'd2'], notes: '', rx: [{ type: 'general', name: 'General prescription', qty: 5, doctorId: 'd1' }] },
      { id: 'v2', clinicId: 'c1', rep: 'Mariam', date: '2026-10-11', doctorIds: ['d1'], notes: '', callOnly: true, rx: [{ type: 'general', qty: 9, doctorId: 'd1' }] },
    ];
    const rows = core.doctorAnalytics({ clinics, visits, today: '2026-10-11' });
    const a = rows.find(d => d.id === 'd1').handovers, b = rows.find(d => d.id === 'd2');
    assert.deepEqual(a, { prescription: 10, rxWeek: 5, rxPrevWeek: 0, rxMonth: 10, rxPrevMonth: 0, sample: 4, gift: 1, other: 0, count: 5, last: '2026-10-11' });
    assert.equal(b.handovers.prescription, 0); // met on the same visit, given nothing
    assert.equal(b.fieldVisits, 1);           // …but the visit is still in his log
  });

  test('remapVisitDoctors: a merged duplicate doctor is re-pointed in who was met and in the prescription lines', () => {
    const v = { id: 'v', doctorIds: ['dX', 'd2', 'd1'], doctorId: 'dX', rx: [
      { type: 't1', name: 'T1', qty: 2, doctorId: 'd1' },
      { type: 't1', name: 'T1', qty: 3, doctorId: 'dX' },
      { type: 't2', name: 'T2', qty: 1, doctorId: 'dX' },
      { type: 't1', name: 'T1', qty: 4, doctorId: 'd2' },
      { type: 't1', name: 'T1', qty: 1, doctorId: null }] };
    assert.equal(core.remapVisitDoctors(v, { dX: 'd1' }), true);
    assert.deepEqual(v.doctorIds, ['d1', 'd2']);
    assert.equal(v.doctorId, 'd1');
    assert.deepEqual(v.rx, [
      { type: 't1', name: 'T1', qty: 5, doctorId: 'd1' },  // the colliding lines are merged
      { type: 't2', name: 'T2', qty: 1, doctorId: 'd1' },
      { type: 't1', name: 'T1', qty: 4, doctorId: 'd2' },
      { type: 't1', name: 'T1', qty: 1, doctorId: null }]);
    assert.equal(core.remapVisitDoctors(v, { dX: 'd1' }), false); // nothing left to move
    // only a line names the duplicate; the person's lines stay together, in the order met
    const w = { id: 'w', doctorIds: ['d1', 'd2'], rx: [{ type: 't1', qty: 1, doctorId: 'd1' }, { type: 't1', qty: 1, doctorId: 'd2' }, { type: 't2', qty: 1, doctorId: 'dX' }] };
    assert.equal(core.remapVisitDoctors(w, { dX: 'd1' }), true);
    assert.deepEqual(w.rx.map(l => l.type + ':' + l.doctorId), ['t1:d1', 't2:d1', 't1:d2']);
    // merged lines never pass 999
    const big = { id: 'b', doctorIds: ['d1', 'dX'], rx: [{ type: 't1', qty: 600, doctorId: 'd1' }, { type: 't1', qty: 600, doctorId: 'dX' }] };
    assert.equal(core.remapVisitDoctors(big, { dX: 'd1' }), true);
    assert.deepEqual([big.doctorIds, big.rx], [['d1'], [{ type: 't1', qty: 999, doctorId: 'd1' }]]);
    // a visit that names nobody in the map is untouched
    const other = { id: 'o', doctorIds: ['d1'], doctorId: 'd1', rx: [{ type: 't1', qty: 1, doctorId: 'd1' }] };
    const snap = JSON.stringify(other);
    assert.equal(core.remapVisitDoctors(other, { dX: 'd1' }), false);
    assert.equal(JSON.stringify(other), snap);
  });

  test('rxText: one line for the CSV, Excel and copy — the clinic and a doctor no longer listed named plainly', () => {
    const list = [T.ortho, T.white, { id: 'general', name: 'General prescription', active: true }];
    const names = { 'm1-d1': 'Dr. Huda Ali' };
    const doctorName = id => names[id] || null;
    assert.equal(core.rxText([
      { type: 'tortho', name: 'an older name', qty: 5, doctorId: 'm1-d1' },
      { type: 'twhite', name: 'Whitening prescription', qty: 2, doctorId: 'm1-d1' },
      { type: 'general', name: 'General prescription', qty: 1, doctorId: null },
    ], { list, doctorName }), 'Dr. Huda Ali: Ortho care prescription ×5, Whitening prescription ×2; the clinic (no one person): General prescription ×1');
    assert.equal(core.rxText([{ type: 'tgone', name: 'Kids prescription', qty: 3, doctorId: 'm1-d9' }], { list, doctorName }), 'a doctor no longer listed: Kids prescription ×3');
    assert.equal(core.rxText([], { list, doctorName }), '');
    assert.equal(core.rxText(null), '');
  });
});

// ---------- Arabic UI dictionary ----------
describe('UMI18N dictionary', () => {
  const i18n = require('../www/js/i18n.js');
  test('every entry is a real Arabic translation of a non-empty English key', () => {
    const keys = Object.keys(i18n.AR);
    assert.ok(keys.length > 700, `expected a full dictionary, got ${keys.length}`);
    keys.forEach(k => {
      assert.ok(k.trim().length > 0, 'empty key');
      assert.ok(/[؀-ۿ]/.test(i18n.AR[k]), `no Arabic in translation of ${JSON.stringify(k)}`);
    });
  });
  test('tr() matches exact strings, wrapped whitespace, and numeric patterns', () => {
    assert.equal(i18n.tr('Save visit'), 'حفظ الزيارة');
    assert.equal(i18n.tr('  Save visit \n'), 'حفظ الزيارة');
    assert.equal(i18n.tr("No ERP sales file imported yet.\n      Import this week's file to keep coaching based on real invoices. Tap to import →"),
      'لم يُستورد ملف مبيعات ERP بعد. استورد ملف هذا الأسبوع ليبقى التوجيه مبنياً على فواتير حقيقية. اضغط للاستيراد ←');
    assert.equal(i18n.tr('· last visit 5d ago · follow-up 3 سبتمبر'), '· آخر زيارة قبل 5 يوم · متابعة 3 سبتمبر');
    assert.equal(i18n.tr('Mariam · never visited'), 'Mariam · لم تُزر أبداً');
    assert.equal(i18n.tr('Class B · 17 (24%)'), 'فئة B · 17 (24%)');
    assert.equal(i18n.tr('Good evening, Dr. Ghaith'), 'مساء الخير، Dr. Ghaith');
    assert.equal(i18n.tr('3 visits · 1 order'), '3 زيارة · 1 طلبية');
  });
  test('a leading emoji or arrow is kept and the words behind it are translated', () => {
    assert.equal(i18n.tr('📞 Call'), '📞 مكالمة');
    assert.equal(i18n.tr('👨‍⚕️ Doctors by specialty'), '👨‍⚕️ الأطباء حسب التخصص');
    assert.equal(i18n.tr('⏳ Not visited in this window (72)'), '⏳ لم تُزر في هذه الفترة (72)');
    // arrows point into the text, so they flip for right-to-left
    assert.equal(i18n.tr('→ Clear open tasks at the start of each day before new ones pile on top.'),
      '← أنجز المهام المفتوحة في بداية كل يوم قبل أن تتراكم فوقها مهام جديدة.');
    assert.equal(i18n.tr('🦷 Bright Smile Dental'), null);
  });
  test('dot-separated status lines translate each segment and keep names', () => {
    assert.equal(i18n.tr('Renova · ⭕ no visits yet'), 'Renova · ⭕ لا زيارات بعد');
    assert.equal(i18n.tr('Mariam · 3 visits · 📞 1 call · last 3 سبتمبر · Credit'), 'Mariam · 3 زيارة · 📞 1 مكالمة · آخر زيارة 3 سبتمبر · آجل');
    assert.equal(i18n.tr('Bayan Dental · Salmiya'), null);
  });
  test('multi-line blocks are translated line by line, untranslated lines kept', () => {
    assert.equal(i18n.tr('Save visit\nBayan Dental Center\n  Cancel'), 'حفظ الزيارة\nBayan Dental Center\n  إلغاء');
    assert.equal(i18n.tr('Bayan Dental Center\nOther Clinic'), null);
  });
  test('sales-coach cards keep clinic names and figures, translate the words around them', () => {
    assert.equal(i18n.tr('3 overdue follow-ups'), '3 متابعة متأخرة');
    assert.equal(i18n.tr('3lagy Pharmacy (never visited), Al Seef Hospital (12d) +27 more. Class A/B clinics buy the most — put them in next week’s plan.'),
      '3lagy Pharmacy (لم تُزر أبداً), Al Seef Hospital (قبل 12 يوم) +27 أخرى. عيادات الفئة A/B تشتري الأكثر — ضعها في خطة الأسبوع القادم.');
    assert.equal(i18n.tr('300.00 KD (from uploaded sales) of 1000.00 KD so far. Needs about 50 KD/day for the remaining 14 working days (Sun–Thu) — steer the visits toward clinics that already order.'),
      '300.00 KD (من ملف المبيعات المرفوع) من 1000.00 KD حتى الآن. تحتاج نحو 50 د.ك/يوم لبقية 14 يوم عمل (الأحد–الخميس) — وجّه الزيارات نحو العيادات التي تشتري بالفعل.');
    assert.equal(i18n.tr('0 doctors · Mariam'), '0 أطباء · Mariam');
  });
  test('data is never translated: names, numbers, unknown text return null', () => {
    assert.equal(i18n.tr('Bayan Dental Center'), null);
    assert.equal(i18n.tr('12.50 KD'), null);
    assert.equal(i18n.tr(''), null);
    assert.equal(i18n.tr(null), null);
    assert.equal(i18n.tr('Waterpik Cordless Plus'), null);
  });
  // v114: prescriptions given on a visit. The team's word for the printed
  // forms is بريسكريبشن; the owner counts them in PADS (دفاتر), with Arabic
  // number agreement (1 دفتر، 2 دفتران، 3–10 دفاتر، 11–99 دفتراً; beyond 99 by
  // the last two digits). The forms' own names are data and never translated.
  test('prescriptions given: the team\'s word, pads with number agreement, type names untouched', () => {
    assert.match(i18n.tr('Prescriptions given?'), /بريسكريبشن/);
    assert.equal(i18n.tr('Prescriptions given?'), 'سلّمت بريسكريبشن؟');
    assert.match(i18n.tr('the pads you left today'), /الدفاتر/);
    assert.deepEqual(['1 pad', '2 pads', '7 pads', '10 pads', '11 pads', '99 pads', '100 pads', '102 pads', '103 pads', '111 pads'].map(t => i18n.tr(t)),
      ['1 دفتر', '2 دفتران', '7 دفاتر', '10 دفاتر', '11 دفتراً', '99 دفتراً', '100 دفتر', '102 دفتر', '103 دفاتر', '111 دفتراً']);
    assert.equal(i18n.tr('Same days last week: 5'), 'نفس الأيام من الأسبوع الماضي: 5');
    assert.equal(i18n.tr('Same days last month: —'), 'نفس الأيام من الشهر الماضي: —'); // a window whose visits did not all load
    assert.equal(i18n.tr('💊 3 pads this month'), '💊 3 دفاتر هذا الشهر');
    assert.equal(i18n.tr('incl. 2 pads left at the clinic'), 'منها 2 دفتران للعيادة (بدون شخص محدد)');
    assert.equal(i18n.tr('incl. 1 pad to a doctor no longer listed'), 'منها 1 دفتر لطبيب لم يعد في القائمة');
    assert.equal(i18n.tr('12 pads logged'), 'سُجّل 12 دفتراً');
    assert.equal(i18n.tr('⚠️ Visits of 2026-09 did not load — figures that include them are incomplete.'), '⚠️ زيارات 2026-09 لم تُحمَّل — الأرقام اللي تشملها ناقصة.');
    assert.equal(i18n.tr('📴 Changes kept on this device — they upload automatically when back online'), '📴 التعديلات محفوظة على هذا الجهاز — تُرفع تلقائياً عند عودة الاتصال');
    // the printed forms' names (the two built-in ones included) are never dictionary words
    core.RX_DEFAULT_TYPES.forEach(t => assert.equal(i18n.tr(t.name), null, t.name));
  });
  // v114 review fixes: the types editor (an unread list, a late landing, a save
  // finishing after Cancel) and the edit sheet's person not marked as met.
  test('prescriptions given: the review fixes\' lines are in Arabic', () => {
    // "Last changed by" is translated alone — the name and the date sit in their
    // own isolated spans (one translated sentence split the date around a Latin name)
    assert.equal(i18n.tr('Last changed by'), 'آخر تعديل:');
    assert.equal(i18n.tr('Last changed by Dr. Ghaith · 1 أكتوبر'), null);
    assert.equal(i18n.tr('(not marked as met)'), '(غير محدد ضمن من قابلتهم)');
    assert.equal(i18n.tr('Try again'), 'إعادة المحاولة');
    assert.match(i18n.tr('Loading the prescription types…'), /جارٍ تحميل أنواع البريسكريبشن/);
    assert.match(i18n.tr('The prescription types could not be loaded — saving is paused until they load. Check the connection, then tap Try again.'), /^تعذّر تحميل أنواع البريسكريبشن — الحفظ متوقف/);
    assert.match(i18n.tr('Your earlier save reached the cloud after all — reopened with the saved list. Nothing else was saved.'), /وصل حفظك السابق إلى السحابة/);
    assert.match(i18n.tr('Your earlier save reached the cloud after all — nothing else was saved.'), /وصل حفظك السابق إلى السحابة/);
    assert.equal(i18n.tr('Changed on another device — nothing was saved.'), 'تغيّرت القائمة من جهاز آخر — ولم يُحفظ شيء.');
    assert.match(i18n.tr('Prescription types not saved — check the connection and make the change again.'), /لم تُحفظ أنواع البريسكريبشن/);
    assert.match(i18n.tr('The previous save is still on its way — tap Save again in a moment.'), /الحفظ السابق ما زال جارياً/);
  });
});

describe('contact workbook import', () => {
  const SPEC = ['General Dentist','Orthodontist','Periodontist','Hygienist','Clinic Manager'];
  const clinics = [
    { id: 'a', name: 'Aline Dental Center Jahra', doctors: [] },
    { id: 'b', name: 'Bayan Dental Center', doctors: [] },
    { id: 'g1', name: 'Gulf Clinic', doctors: [] },
    { id: 'g2', name: 'Gulf Medical Service', doctors: [] },
    { id: 's1', name: 'SN Jabriya', doctors: [] },
    { id: 's2', name: 'SN Clinic 360', doctors: [] },
    { id: 'n1', name: 'Dr. Nael Al Hazeem Dental Center - Sharq', doctors: [] },
    { id: 'n2', name: 'Dr. Nael Al Hazeem Pharmacy ( Al Soor )', doctors: [] },
    { id: 'ih', name: 'International Hospital', doctors: [] },
    { id: 'rh', name: 'Royale Hayat Hospital', doctors: [] },
  ];
  test('a hygienist sheet with a title row, "Hygienist" and "Contact Number" columns parses', () => {
    const rows = [
      ['ULTRAMED Dental Hygienist Data List'],
      ['SR#', 'Clinic Name', 'Location', 'Hygienist', 'Contact Number'],
      ['1', 'Aline Dental Clinic', 'Jahra', 'Ms.Maram', ' +965 90023457', 'For Tepe Practice Box'],
      ['2', 'Bayan Dental Center', 'Salmiya', 'Mr.Ejay', ' +965 65076372'],
    ];
    const r = core.parseContactRows(rows, SPEC, { clinics });
    assert.equal(r.error, null);
    assert.equal(r.contacts.length, 2);
    assert.deepEqual([r.contacts[0].name, r.contacts[0].title, r.contacts[0].phone, r.contacts[0].area, r.contacts[0].notes],
      ['Ms. Maram', 'Hygienist', '+96590023457', 'Jahra', 'For Tepe Practice Box']);
    assert.equal(r.contacts[1].name, 'Mr. Ejay');
  });
  test('several people columns each pair with the phone column to their right', () => {
    const rows = [
      ['SR#', 'Clinic Name', 'Doctor', 'DOC. Phone Number', 'Hygienist', 'Contact Number'],
      ['1', 'Bayan Dental Center', 'Dr. Sara', '99001122', 'Ms. Karen', '99003344'],
    ];
    const r = core.parseContactRows(rows, SPEC, { clinics });
    assert.equal(r.contacts.length, 2);
    assert.deepEqual([r.contacts[0].name, r.contacts[0].phone, r.contacts[0].title], ['Dr. Sara', '99001122', '']);
    assert.deepEqual([r.contacts[1].name, r.contacts[1].phone, r.contacts[1].title], ['Ms. Karen', '99003344', 'Hygienist']);
  });
  test('a name cell that carries the role and the clinic is split', () => {
    assert.deepEqual(core.splitPersonHint('Maram Aline Hygenist', clinics), { name: 'Maram', hint: 'Aline', area: '', title: 'Hygienist' });
    assert.deepEqual(core.splitPersonHint('Dr Aseel Yousfan Hygenist Nael Hazem', clinics).name, 'Dr Aseel Yousfan');
    assert.equal(core.splitPersonHint('Dana El Shatty Kuwait Hospital Hyg', clinics).hint, 'Kuwait Hospital');
    assert.equal(core.splitPersonHint('Dr Ghoson Al Ali Moh Hygenist', clinics).name, 'Dr Ghoson Al Ali');
    assert.equal(core.clinicDisplayName(core.splitPersonHint('Dr Ghoson Al Ali Moh Hygenist', clinics).hint), 'Ministry Of Health');
    const area = core.splitPersonHint('iane Bayan Hygenist Jahra', clinics);
    assert.deepEqual([area.name, area.hint, area.area], ['iane', 'Bayan', 'Jahra']);
    assert.deepEqual([core.splitPersonHint('Sen Clinic Hygenist', clinics).name, core.splitPersonHint('Sen Clinic Hygenist', clinics).hint], ['Sen', '']); // "Clinic" alone names nothing
    assert.equal(core.splitPersonHint('Nourah Dental Hygenist', clinics).hint, '');        // "Dental" says nothing
  });
  test('a report column full of sentences is never taken for names, and clinic lists are skipped', () => {
    const sheets = [
      { name: 'Visits', rows: [
        ['Date', 'Hygienist', 'Clinic Name', 'Location', 'Visit with the Hygienist'],
        ['46145', 'Ms. Karen', 'Bayan Dental Center', 'Al-hamra', 'Pushing The Breath Co. mouthwash to the team. They liked it and asked for samples next week.'],
        ['46146', 'Ms. Roma and Ms. Jadi', 'Maidan Dental Clinic', 'Sabah Salem', 'During our meet-and-greet we introduced the range. The doctor asked about prices.'],
      ]},
      { name: 'Clinic location', rows: [['Account', 'Rep', 'Location'], ['Bayan Dental Center', 'Mariam', 'Salmiya'], ['New Smile', 'Ranova', 'Salmiya']] },
    ];
    const wb = core.parseContactWorkbook(sheets, SPEC, { clinics });
    assert.deepEqual(wb.contacts.map(c => c.name), ['Ms. Karen', 'Ms. Roma', 'Ms. Jadi']);
    assert.equal(wb.perSheet[1].error, 'CLINIC_LIST');
    const reps = core.parseClinicRepSheet(sheets, ['Mariam', 'Renova']);
    assert.equal(reps.reps[core.normClinicName('New Smile')], 'Renova');   // "Ranova" → Renova
    assert.equal(reps.areas[core.normClinicName('New Smile')], 'Salmiya');
  });
  test('the same person across sheets becomes one contact; two people on one line stay two', () => {
    const list = [
      { name: 'Ms.Mary Grace', clinic: 'Bayan Dental Center', area: 'Salmiya', phone: '+96551146942', title: 'Hygienist', notes: '' },
      { name: 'Ms.Grace', clinic: 'Bayan', area: 'Jahra', phone: '+965 51146942', title: 'Hygienist', notes: '' },
      { name: 'Ms. Khaira', clinic: 'Prestige Clinic', area: 'Salmiya', phone: '', title: 'Hygienist', notes: '' },
      { name: 'Ms. Khairiya', clinic: 'Prestige Clinic', area: 'Salmiya', phone: '+96596609869', title: 'Hygienist', notes: '' },
      { name: 'Ms.Joy', clinic: 'Crown Dental Center', area: '', phone: '+96560981918', title: 'Hygienist', notes: '' },
      { name: 'Ms.Claire', clinic: 'Crown Dental Center', area: '', phone: '+96560981918', title: 'Hygienist', notes: '' },
    ];
    const out = core.dedupeContacts(list, (hint) => core.matchClinicHint(hint, '', clinics).clinicId);
    assert.deepEqual(out.map(c => c.name), ['Ms.Mary Grace', 'Ms. Khaira', 'Ms.Joy', 'Ms.Claire']);
    assert.equal(out[0].notes, 'Also Jahra');
    assert.equal(out[1].phone, '+96596609869');
  });
  test('clinic hints resolve branch-aware and never on shared generic words', () => {
    assert.equal(core.matchClinicHint('Gulf Clinic', '', clinics).clinicId, 'g1');
    assert.equal(core.matchClinicHint('SN', 'Jabriya', clinics).clinicId, 's1');
    assert.equal(core.matchClinicHint('SN', '360Mall', clinics).clinicId, 's2');
    assert.equal(core.matchClinicHint('NHC (Dr. Nael Alhazeem Center)', 'Hawally', clinics).clinicId, 'n1');
    assert.equal(core.matchClinicHint('Royal Hyatt', 'Jabriya', clinics).clinicId, 'rh');
    assert.equal(core.matchClinicHint('Kuwait Hospital', '', clinics).clinicId, null);
    assert.equal(core.matchClinicHint('Alien dental Clinic', 'Jahra', clinics).clinicId, 'a');
    assert.equal(core.matchClinicHint('Dental', '', clinics).clinicId, null);
  });
  test('"Ms. A, Ms.B and Ms.C" is three people', () => {
    assert.deepEqual(core.splitPeople('Ms. Bidya, Ms.Abby and Ms.Moly'), ['Ms. Bidya', 'Ms.Abby', 'Ms.Moly']);
    assert.deepEqual(core.splitPeople('Ms. Rose Ann'), ['Ms. Rose Ann']);
  });
});

describe('doctor records — decision map', () => {
  const today = '2026-09-02';
  test('completeness counts the five record fields', () => {
    assert.deepEqual(core.doctorRecordCompleteness({}), {pct: 0, missing: ['title','role','influence','stage','phone']});
    assert.equal(core.doctorRecordCompleteness({title:'Orthodontist', role:'owner', influence:'decider', stage:'warm', phone:'9'}).pct, 100);
    assert.equal(core.doctorRecordCompleteness({title:'Orthodontist', role:'owner'}).pct, 40);
  });
  test('a clinic with no records asks for the basics', () => {
    const m = core.clinicDecisionMap({id:'c', doctors:[]}, {today});
    assert.equal(m.total, 0);
    assert.match(m.gaps[0], /No doctors recorded/);
    assert.match(m.steps[0], /who signs the orders/);
  });
  test('gaps: no decision maker, unknown roles, missing phones', () => {
    const c = {id:'c', doctors:[{id:'a', name:'Dr. A', title:'Dentist'}, {id:'b', name:'Ms. B', role:'hygienist', influence:'influencer', stage:'warm', phone:'9'}]};
    const m = core.clinicDecisionMap(c, {today});
    assert.ok(m.gaps.some(g => /No decision maker identified/.test(g)));
    assert.ok(m.gaps.some(g => /1 doctor with unknown role or influence: Dr\. A/.test(g)));
    assert.ok(m.gaps.some(g => /1 without a phone number: Dr\. A/.test(g)));
  });
  test('steps follow the decision maker and the champion', () => {
    const c = {id:'c', doctors:[
      {id:'own', name:'Dr. Owner', role:'owner', influence:'decider', stage:'met', phone:'1'},
      {id:'hyg', name:'Ms. Champ', role:'hygienist', influence:'influencer', stage:'champion', phone:'2'},
      {id:'blk', name:'Dr. Wall', role:'dentist', influence:'user', stage:'blocked', phone:'3'},
    ]};
    const analytics = [{id:'own', lastVisit:'2026-06-01'}, {id:'hyg', lastVisit:'2026-08-30'}];
    const m = core.clinicDecisionMap(c, {today, analytics});
    assert.equal(m.deciders.length, 1); assert.equal(m.champions.length, 1); assert.equal(m.blocked.length, 1);
    assert.deepEqual(m.gaps, []);
    assert.ok(m.steps.some(s => /Decision maker Dr\. Owner not seen for 93 days/.test(s)));
    assert.ok(m.steps.some(s => /Ask Ms\. Champ \(champion\) to introduce you to Dr\. Owner/.test(s)));
    assert.ok(m.steps.some(s => /Do not push Dr\. Wall — work through Ms\. Champ/.test(s)));
    assert.ok(m.steps.some(s => /Second visit for Dr\. Owner within two weeks/.test(s)));
  });
  test('a never-met decision maker is the first thing to fix', () => {
    const c = {id:'c', doctors:[{id:'m', name:'Dr. Boss', role:'manager', influence:'decider', stage:'new', phone:'1'}]};
    const m = core.clinicDecisionMap(c, {today});
    assert.match(m.steps[0], /Meet the decision maker Dr\. Boss/);
  });
  test('coach flags clinics without a known decision maker and stale decision makers', () => {
    const clinics = [
      {id:'c1', name:'Alpha Dental', rep:'Mariam', cls:'A', doctors:[{id:'d1', name:'Dr. One', influence:'user'}]},
      {id:'c2', name:'Beta Dental', rep:'Mariam', cls:'B', doctors:[{id:'d2', name:'Dr. Two', influence:'decider', stage:'warm'}]},
      {id:'c3', name:'Gamma Dental', rep:'Mariam', cls:'C', doctors:[]},
    ];
    const visits = [{id:'v1', clinicId:'c2', rep:'Mariam', date:'2026-06-01', doctorIds:['d2']}];
    const out = core.coachInsights({today, repFilter:'all', visits, clinics, targets:{}, dayPlans:{}});
    const dm = out.find(i => i.key === 'decision-map');
    assert.ok(dm, 'decision-map insight present');
    assert.equal(dm.data.count, 1); // Alpha only — Gamma has no doctors at all, Beta has a decider
    assert.match(dm.title, /1 clinic with no known decision maker/);
    const st = out.find(i => i.key === 'deciders-stale');
    assert.ok(st && st.data.count === 1 && /Dr\. Two \(Beta Dental\)/.test(st.detail), 'stale decider flagged');
  });
});

describe('returns of earlier invoices', () => {
  test('the referenced invoice is read from the remarks column', () => {
    assert.equal(core.erpRefFromRemarks('Philip SINV0076017'), 'SINV0076017');
    assert.equal(core.erpRefFromRemarks('RETURN UNDER # 708329//708313'), null);
    assert.equal(core.erpRefFromRemarks('ref sinv 0076017 damaged'), 'SINV0076017');
  });
  test('parseErpCsv keeps the reference on return rows', () => {
    const csv = 'Date,Type,Invoice#,Account,Product,Quantity,Sales Gross,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name,Remarks\n' +
      '2026-09-01,SalesInvoice,SINV0076020,City Center,Brush,5,49.5,42.075,0,0,42.075,Philips,Mr. Sundeep Kohli,LPO 1\n' +
      '2026-09-02,SalesReturn,SRT0009410,Medico Denta Company,Diamond Clean,-2,0,0,138,27.6,-110.4,Philips,Ranova Ayman Mohammed,Philip SINV0076017\n';
    const r = core.parseErpCsv(csv);
    assert.equal(r.error, null);
    assert.equal(r.rows[0].ref, null);
    assert.equal(r.rows[1].ref, 'SINV0076017');
  });
  test("a return of last month's invoice moves to that month under the origin policy", () => {
    const rows = [
      {date:'2026-08-29', doc:'SINV0076017', type:'invoice', net:150, salesman:'R'},
      {date:'2026-09-01', doc:'SINV0076020', type:'invoice', net:42, salesman:'S'},
      {date:'2026-09-02', doc:'SRT0009410', type:'return', ref:'SINV0076017', net:-110.4, sret:138, salesman:'R'},
      {date:'2026-09-03', doc:'SRT0009417', type:'return', ref:null, net:-2100, sret:2100, salesman:'S'},
    ];
    const ctx = core.returnContext(rows);
    assert.deepEqual(core.returnOrigin(rows[2], ctx), {prior:true, date:'2026-08-29', known:true});
    assert.equal(core.returnOrigin(rows[3], ctx), null);
    const view = core.applyReturnPolicy(rows, 'origin', ctx);
    assert.equal(view[2].date, '2026-08-29'); assert.equal(view[2].origDate, '2026-09-02'); assert.equal(view[2].priorReturn, true);
    assert.equal(view[3].date, '2026-09-03');
    assert.equal(core.applyReturnPolicy(rows, 'erp', ctx)[2].date, '2026-09-02');
  });
  test('an invoice number below the month\'s first invoice counts as the month before, even when that invoice is not stored', () => {
    const rows = [
      {date:'2026-09-01', doc:'SINV0076020', type:'invoice', net:42, salesman:'S'},
      {date:'2026-09-02', doc:'SRT0009410', type:'return', ref:'SINV0076017', net:-110.4, sret:138, salesman:'R'},
      {date:'2026-09-04', doc:'SRT0009419', type:'return', ref:'SINV0076100', net:-10, sret:10, salesman:'R'},
    ];
    const ctx = core.returnContext(rows);
    assert.deepEqual(core.returnOrigin(rows[1], ctx), {prior:true, date:'2026-08-31', known:false});
    assert.equal(core.returnOrigin(rows[2], ctx), null); // a September invoice number → stays in September
    const t = core.erpTotals(core.applyReturnPolicy(rows, 'origin', ctx).filter(r => r.date >= '2026-09-01'));
    assert.equal(Math.round(t.bySalesman.R.net * 100) / 100, -10);
  });
});


describe('product movement — brand → products ranked by real sales', () => {
  const R = (date, doc, product, qty, net, extra) => Object.assign({ date, doc, type: doc.startsWith('SRT') ? 'return' : 'invoice', product, qty, net, brand: 'Breath', customer: 'Trolley' }, extra || {});
  const rows = [
    // Alpha: 5 invoices in Jan..Mar under an old and a new code → merged, fast by frequency? 5 inv / 3 mo = 1.67 → mid
    R('2026-01-05', 'SINV1', 'Alpha Mouthwash', 10, 50), R('2026-01-20', 'SINV2', 'Alpha Mouthwash', 10, 50),
    R('2026-02-05', 'SINV3', 'Alpha Mouthwash IME', 20, 100), R('2026-03-01', 'SINV4', 'Alpha Mouthwash IME', 20, 100), R('2026-03-30', 'SINV5', 'Alpha Mouthwash IME', 20, 100),
    R('2026-02-06', 'SRT1', 'Alpha Mouthwash', -3, -15, { ref: 'SINV1' }),          // return against an invoice
    R('2026-03-06', 'SRT2', 'Alpha Mouthwash', -2, -10, { ref: null }),              // stock return, no invoice
    R('2026-03-07', 'SRT3', 'Alpha Mouthwash IME', -4, 0),                            // free goods coming back → not a return
    R('2026-03-08', 'SINV6', 'Alpha Mouthwash IME', 6, 0),                            // free goods to a customer
    // Beta: sold every few days → fast
    ...Array.from({ length: 14 }, (_, i) => R('2026-0' + (1 + Math.floor(i / 5)) + '-' + String(1 + (i % 5) * 5).padStart(2, '0'), 'SINV' + (100 + i), 'Beta Floss', 2, 6)),
    // Gamma: one invoice in three months → slow
    R('2026-01-10', 'SINV200', 'Gamma Kit', 1, 300),
    // Delta: free only → no sale
    R('2026-02-10', 'SINV201', 'Delta Sample', 3, 0),
    // Marketing / non-product lines are ignored
    R('2026-02-11', 'SINV202', 'Vanity bag', 50, 0, { brand: 'Tepe - Marketing Materials / Items' }),
    R('2026-02-12', 'SINV203', 'Alpha Mouthwash IME', 40, 0, { customer: 'Marketing and Advertisement' }),
    R('2026-02-13', 'SINV204', 'Delivery/Pick Up Charge', 1, 2, { brand: 'Delivery Charge' }),
  ];
  const m = core.productMovement(rows);
  const brand = m.brands[0];
  const by = n => brand.products.find(p => p.name === n);

  test('period, counts and non-product exclusion', () => {
    assert.equal(m.from, '2026-01-01'); assert.equal(m.to, '2026-03-30');
    assert.equal(m.brands.length, 1); assert.equal(m.products, 4); assert.equal(m.sold, 3);
    assert.deepEqual(m.counts, { fast: 1, mid: 1, slow: 1, none: 1 });
    assert.equal(brand.brand, 'Breath');
  });
  test('old and new codes of one product merge under the best-selling name', () => {
    const a = by('Alpha Mouthwash IME');
    assert.ok(a, 'merged product exists');
    assert.deepEqual(a.otherNames, ['Alpha Mouthwash']);
    assert.equal(a.paid, 80);
    assert.ok(a.flags.some(f => f.k === 'merged'));
    assert.equal(brand.products.filter(p => /alpha/i.test(p.name)).length, 1);
  });
  test('paid, FOC and the two kinds of returns are kept apart', () => {
    const a = by('Alpha Mouthwash IME');
    assert.equal(a.retInv, 3); assert.equal(a.retNoInv, 2); assert.equal(a.ret, 5);
    assert.equal(a.netUnits, 75);
    assert.equal(a.focNet, 2);         // 6 free out, 4 free back
    assert.equal(a.kd, 375);           // 400 paid − 15 − 10
    assert.equal(a.price, 5);
    assert.equal(a.invoices, 5); assert.equal(a.customers, 1);
  });
  test('classes follow invoice frequency: fast, mid, slow, none', () => {
    assert.equal(by('Beta Floss').cls, 'fast');          // 14 invoices in under 3 months
    assert.equal(by('Alpha Mouthwash IME').cls, 'mid');  // 5 invoices / ~2.8 months
    assert.equal(by('Gamma Kit').cls, 'slow');           // 1 invoice
    assert.equal(by('Delta Sample').cls, 'none');
    assert.ok(by('Delta Sample').flags.some(f => f.k === 'focOnly'));
  });
  test('ranking is by paid units with unsold products last; A/B/C is cumulative within the brand', () => {
    assert.deepEqual(brand.products.map(p => p.name), ['Alpha Mouthwash IME', 'Beta Floss', 'Gamma Kit', 'Delta Sample']);
    assert.deepEqual(brand.products.map(p => p.rank), [1, 2, 3, 4]);
    assert.equal(by('Alpha Mouthwash IME').abc, 'A');
    assert.equal(by('Gamma Kit').abc, 'C');
    assert.equal(by('Delta Sample').abc, null);
    assert.ok(Math.abs(brand.products.reduce((s, p) => s + p.share, 0) - 1) < 1e-9);
  });
  test('a brand with one product puts it in A', () => {
    const one = core.productMovement([R('2026-01-05', 'SINV1', 'Solo', 3, 9, { brand: 'Solo Brand' })]);
    assert.equal(one.brands[0].products[0].abc, 'A');
  });
  test('velocity uses the data span when the data is shorter than the floor', () => {
    const short = core.productMovement([R('2026-08-01', 'SINV1', 'X', 10, 10), R('2026-08-20', 'SINV2', 'X', 10, 10), R('2026-09-06', 'SINV3', 'X', 10, 10)]);
    const x = short.brands[0].products[0];
    assert.ok(x.window > 1.1 && x.window < 1.3, 'window ≈ 1.2 months, not 3');
    assert.equal(x.cls, 'mid'); // 3 invoices / 1.18 months ≈ 2.5 per month
  });
  test('heavy stock returns flag the product but do not hide its movement', () => {
    const rows2 = [
      ...Array.from({ length: 30 }, (_, i) => R('2026-0' + (1 + Math.floor(i / 10)) + '-' + String(1 + (i % 10) * 2).padStart(2, '0'), 'SINV' + i, 'Powder', 5, 20)),
      R('2026-03-25', 'SRT9', 'Powder', -160, -600, { ref: null }),
      R('2026-06-30', 'SINV999', 'Anchor', 1, 1, { brand: 'Other' }), // stretches the data to > 92 days
    ];
    const noRefs = core.productMovement(rows2);
    const p0 = noRefs.brands.find(b => b.brand === 'Breath').products[0];
    assert.equal(p0.cls, 'fast');
    assert.equal(noRefs.hasRefs, false);
    assert.ok(p0.flags.some(f => f.k === 'returns' && f.noInv === false && f.pct === 107), 'no "without invoice" claim when the data carries no references');
    assert.ok(p0.flags.some(f => f.k === 'exceed'));
    assert.ok(p0.flags.some(f => f.k === 'stale'));
    const withRefs = core.productMovement(rows2.concat([R('2026-04-02', 'SRT10', 'Anchor', -1, -1, { brand: 'Other', ref: 'SINV999' })]));
    assert.equal(withRefs.hasRefs, true);
    const p1 = withRefs.brands.find(b => b.brand === 'Breath').products[0];
    assert.ok(p1.flags.some(f => f.k === 'returns' && f.noInv === true), 'with references in the data, an unreferenced return is a stock return');
  });
  test('a product sold once is slow even when the data covers a few weeks', () => {
    const m = core.productMovement([R('2026-08-01', 'SINV1', 'Once', 4, 40), R('2026-08-03', 'SINV2', 'Twice', 1, 5), R('2026-08-20', 'SINV3', 'Twice', 1, 5)]);
    assert.equal(m.provisional, true);
    assert.equal(m.brands[0].products.find(p => p.name === 'Once').cls, 'slow');
    assert.equal(m.brands[0].products.find(p => p.name === 'Twice').cls, 'mid');
  });
  test('supervisor-marked exchanges are not returns', () => {
    const rows = [R('2026-01-05', 'SINV1', 'X', 5, 50), R('2026-01-20', 'SINV2', 'X', 5, 50), R('2026-02-01', 'SRT1', 'X', -5, -50, { ref: 'SINV1' })];
    const plain = core.productMovement(rows).brands[0].products[0];
    const swapped = core.productMovement(rows, { isExchange: r => r.doc === 'SRT1' }).brands[0].products[0];
    assert.equal(plain.ret, 5);
    assert.equal(swapped.ret, 0); assert.equal(swapped.exchanged, 5);
    assert.ok(swapped.flags.some(f => f.k === 'exchanged'));
    assert.equal(swapped.kd, 50); // the swap line still nets against revenue like everywhere else in the app
  });
  test('a return of free goods (sret fully discounted) is not a return', () => {
    const rows = [R('2026-01-05', 'SINV1', 'X', 5, 50), R('2026-01-06', 'SINV2', 'X', 2, 0), R('2026-01-20', 'SRT1', 'X', -2, 0, { sret: 4.4, dsret: 4.4 }), R('2026-01-21', 'SRT2', 'X', -1, 0, { sret: 10, dsret: 1 })];
    const p = core.productMovement(rows).brands[0].products[0];
    assert.equal(p.focBack, 2); assert.equal(p.focNet, 0);
    assert.equal(p.ret, 1);          // the second line is a real return valued only in the return column
    assert.equal(p.kd, 41);          // 50 − 9
  });
  test('a paid line without a quantity still counts as a sale', () => {
    const p = core.productMovement([R('2026-01-05', 'SINV1', 'X', undefined, 50), R('2026-01-15', 'SINV2', 'X', 0, 70)]).brands[0].products[0];
    assert.equal(p.hasPaid, true); assert.equal(p.cls, 'mid'); assert.equal(p.invoices, 2); assert.equal(p.kd, 120);
  });
  test('rows with unusable dates are dropped instead of breaking the screen', () => {
    const m = core.productMovement([R('05-01-2026', 'SINV1', 'Bad', 1, 5), R('2026-01-05', 'SINV2', 'Good', 1, 5)]);
    assert.equal(m.rows, 1); assert.equal(m.brands[0].products[0].name, 'Good');
  });
  test('a launch is measured over at least two months and flagged new', () => {
    const rows = [R('2026-01-05', 'SINV0', 'Old', 1, 5), R('2026-08-30', 'SINV00', 'Old', 1, 5)];
    for(let i = 0; i < 8; i++) rows.push(R('2026-07-' + String(12 + i * 6).padStart(2, '0').slice(-2) < '2026-07-32' ? '2026-07-' + String(12 + i * 6 > 31 ? 31 : 12 + i * 6).padStart(2, '0') : '2026-08-01', 'SINVL' + i, 'Launch', 3, 30));
    const p = core.productMovement(rows).brands[0].products.find(x => x.name === 'Launch');
    assert.ok(p.window >= 2 - 1e-9 && p.window < 2.01, 'floor of two months applies to a 7-week launch: ' + p.window);
    assert.equal(p.cls, 'fast'); // 8 invoices / 2 months
    assert.ok(p.flags.some(f => f.k === 'new'));
  });
  test('spelling-only variants are not reported as other codes; unicode names keep their identity', () => {
    const m = core.productMovement([R('2026-01-05', 'SINV1', 'Alpha Mouthwash', 1, 5), R('2026-01-06', 'SINV2', 'alpha  mouthwash', 1, 5), R('2026-01-07', 'SINV3', 'غسول ألفا', 1, 5), R('2026-01-08', 'SINV4', 'خيط بيتا', 1, 5)]);
    const names = m.brands[0].products.map(p => p.name).sort();
    assert.deepEqual(names, ['Alpha Mouthwash', 'خيط بيتا', 'غسول ألفا']);
    assert.deepEqual(m.brands[0].products.find(p => p.name === 'Alpha Mouthwash').otherNames, []);
  });
  test('empty input is safe', () => {
    const e = core.productMovement([]);
    assert.deepEqual(e.brands, []); assert.equal(e.products, 0);
  });
});
// ---------- ERP sales storage split (index + row chunks) ----------

describe('ERP storage split', () => {
  const row = i => ['2026-09-0' + (1 + (i % 9)), 'SINV' + i, 0, 'P' + i, 1, 2, 2, 0, 'Mariam Zohair', 'TEPE', 'Clinic ' + i, 'Clinics', 0];
  const mk = (id, n, rev) => ({ id, from: '2026-09-01', to: '2026-09-21', net: n * 2, rowCount: n, repMap: {}, rev, rows: Array.from({ length: n }, (_, i) => row(i)) });

  test('splits rows out of the index into chunk docs and assembles them back identically', () => {
    const sales = { periods: [mk('a', 5, 7), mk('b', 0, 0)], repMapGlobal: { 'Mariam Zohair': 'Mariam' }, seeds: { x: true } };
    const { index, docs } = core.erpSplitForStorage(sales, 2);
    assert.equal(index.periods.length, 2);
    assert.ok(!('rows' in index.periods[0]), 'index carries no rows');
    assert.deepEqual(index.periods[0].rowsRef, { key: 'erpRows:a:7', chunks: 3, count: 5 });
    assert.deepEqual(index.periods[1].rowsRef, { key: 'erpRows:b:0', chunks: 1, count: 0 });
    assert.deepEqual(Object.keys(docs).sort(), ['erpRows:a:7:0', 'erpRows:a:7:1', 'erpRows:a:7:2', 'erpRows:b:0:0']);
    assert.equal(docs['erpRows:a:7:2'].length, 1);
    assert.deepEqual(core.erpChunkKeys(index).sort(), Object.keys(docs).sort());
    const back = core.erpAssemble(index, docs);
    assert.deepEqual(back.missing, []);
    assert.deepEqual(back.sales.periods[0].rows, sales.periods[0].rows);
    assert.deepEqual(back.sales.periods[1].rows, []);
    assert.deepEqual(back.sales.repMapGlobal, sales.repMapGlobal);
    assert.deepEqual(back.sales.seeds, sales.seeds);
    // the index is small: a ~250 KB month collapses to a header line
    assert.ok(JSON.stringify(index).length < 400);
  });
  test('the revision is part of the chunk key, so changed rows never reuse a stale doc', () => {
    assert.equal(core.erpRowsKey({ id: 'p1' }), 'erpRows:p1:0');
    assert.equal(core.erpRowsKey({ id: 'p1', rev: 1758400000000 }), 'erpRows:p1:1758400000000');
  });
  test('a period whose chunks are unreadable is flagged, not silently emptied', () => {
    const { index, docs } = core.erpSplitForStorage({ periods: [mk('a', 3, 1), mk('b', 3, 1)] }, 2);
    delete docs['erpRows:b:1:1'];
    const back = core.erpAssemble(index, docs);
    assert.deepEqual(back.missing, ['b']);
    assert.equal(back.sales.periods[0].rows.length, 3);
    assert.equal(back.sales.periods[0].rowsMissing, undefined);
    assert.equal(back.sales.periods[1].rowsMissing, true);
    assert.deepEqual(back.sales.periods[1].rows, []);
    // a truncated chunk set (count mismatch) is missing too
    const d2 = core.erpSplitForStorage({ periods: [mk('c', 3, 1)] }, 2).docs;
    d2['erpRows:c:1:1'] = [];
    assert.deepEqual(core.erpAssemble(core.erpSplitForStorage({ periods: [mk('c', 3, 1)] }, 2).index, d2).missing, ['c']);
  });
  test('legacy inline rows pass through untouched and need no chunk reads', () => {
    const legacy = { periods: [mk('old', 4)] };
    assert.deepEqual(core.erpChunkKeys(legacy), []);
    const back = core.erpAssemble(legacy, {});
    assert.deepEqual(back.missing, []);
    assert.equal(back.sales.periods[0].rows.length, 4);
    // and splits normally on the next save
    assert.equal(core.erpSplitForStorage(legacy).index.periods[0].rowsRef.key, 'erpRows:old:0');
  });
  test('merge-on-save keeps a period only the cloud has, honours tombstones from both sides, local wins on shared ids', () => {
    const now = 1758400000000;
    const local = { periods: [{ id: 'aug', rev: 1 }, { id: 'sep21', rev: 5 }], removed: { sep14: now - 1000 }, repMapGlobal: { A: 'Mariam' }, seeds: { s1: true } };
    const cloud = { periods: [{ id: 'aug', rev: 0 }, { id: 'sep14', rev: 2 }, { id: 'other', rev: 3 }], removed: { gone: now - 5000 }, repMapGlobal: { A: 'Renova', B: 'Renova' }, seeds: { s2: true } };
    const r = core.erpMergeIndex(local, cloud, now);
    assert.equal(r.added, 1);
    assert.deepEqual(r.merged.periods.map(p => p.id + ':' + p.rev), ['aug:1', 'sep21:5', 'other:3']);
    assert.deepEqual(r.merged.removed, { sep14: now - 1000, gone: now - 5000 });
    assert.deepEqual(r.merged.repMapGlobal, { A: 'Mariam', B: 'Renova' });
    assert.deepEqual(r.merged.seeds, { s1: true, s2: true });
    // a cloud tombstone deletes our stale local copy of that period
    const r2 = core.erpMergeIndex({ periods: [{ id: 'sep14' }] }, { periods: [], removed: { sep14: now } }, now);
    assert.deepEqual(r2.merged.periods, []);
    // tombstones older than 60 days are pruned
    const r3 = core.erpMergeIndex({ periods: [], removed: { ancient: now - 61 * 86400000 } }, null, now);
    assert.deepEqual(r3.merged.removed, {});
  });
});

// ---------- v80 hardening: byte-bounded chunks, rowsMissing pass-through, rev-wins merge, Type-column returns, r-less xlsx cells ----------

describe('ERP storage hardening', () => {
  const row = i => ['2026-09-0' + (1 + (i % 9)), 'SINV' + i, 0, 'P' + i, 1, 2, 2, 0, 'Mariam Zohair', 'TEPE', 'Clinic ' + i, 'Clinics', 0];
  test('chunks are bounded by JSON size as well as row count', () => {
    const fat = Array.from({ length: 50 }, (_, i) => row(i).concat(['x'.repeat(5000)]));
    const parts = core.erpChunkRows(fat, 1200, 20000);
    assert.ok(parts.length > 10, 'fat rows split into many chunks: ' + parts.length);
    parts.forEach(p => assert.ok(JSON.stringify(p).length <= 20000 + 5200, 'chunk stays under the byte cap'));
    assert.equal(parts.flat().length, 50);
    assert.deepEqual(core.erpChunkRows([], 10, 100), [[]]);
    const { index, docs } = core.erpSplitForStorage({ periods: [{ id: 'f', rev: 1, rows: fat }] }, 1200, 20000);
    assert.equal(index.periods[0].rowsRef.chunks, parts.length);
    assert.deepEqual(core.erpAssemble(index, docs).sales.periods[0].rows, fat);
  });
  test('a period whose rows are missing keeps its stored reference and emits no documents', () => {
    const p = { id: 'm', rev: 3, rowCount: 40, rows: [], rowsMissing: true, rowsRef: { key: 'erpRows:m:3', chunks: 2, count: 40 } };
    const { index, docs } = core.erpSplitForStorage({ periods: [p, { id: 'ok', rev: 1, rows: [row(1)] }] });
    assert.deepEqual(index.periods[0].rowsRef, { key: 'erpRows:m:3', chunks: 2, count: 40 });
    assert.equal('rowsMissing' in index.periods[0], false);
    assert.deepEqual(Object.keys(docs), ['erpRows:ok:1:0']);
    assert.deepEqual(core.erpChunkKeys(index).sort(), ['erpRows:m:3:0', 'erpRows:m:3:1', 'erpRows:ok:1:0']);
  });
  test('merge: the higher revision wins a shared id and arrives as a header to be fetched', () => {
    const now = 1758400000000;
    const local = { periods: [{ id: 'a', rev: 1, rows: [row(1)] }, { id: 'b', rev: 9, rows: [row(2)] }] };
    const cloud = { periods: [{ id: 'a', rev: 5, rowsRef: { key: 'erpRows:a:5', chunks: 1, count: 3 } }, { id: 'b', rev: 2, rowsRef: { key: 'erpRows:b:2', chunks: 1, count: 1 } }] };
    const r = core.erpMergeIndex(local, cloud, now);
    assert.equal(r.added, 1);
    assert.equal(r.merged.periods[0].rev, 5);
    assert.equal(Array.isArray(r.merged.periods[0].rows), false, 'cloud winner is a bare header');
    assert.equal(r.merged.periods[1].rev, 9, 'local newer copy kept');
  });
  test('a SalesReturn typed row counts as a return even without the SRT document prefix', () => {
    const csv = 'Date,Type,Invoice#,Account,Product,Quantity,Sales Gross,Sales Return Amount,Net Sales,Brand,Name\n' +
      '2026-09-05,SalesInvoice,INV100,Clinic A,P1,2,10,0,10,TEPE,Mariam Zohair\n' +
      '2026-09-06,SalesReturn,CN200,Clinic A,P1,-1,0,5,-5,TEPE,Mariam Zohair\n';
    const p = core.parseErpCsv(csv);
    assert.equal(p.error, null);
    assert.deepEqual(p.rows.map(r => r.type), ['invoice', 'return']);
    const t = core.erpTotals(p.rows);
    assert.equal(t.invoiceCount, 1); assert.equal(t.returnCount, 1);
  });
  test('readXlsx: cells without r= addresses are read sequentially, self-closing rows do not swallow neighbours', async () => {
    // minimal stored (uncompressed) zip built by hand — the reader validates no CRC
    const entries = [
      ['xl/workbook.xml', '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
      ['xl/sharedStrings.xml', '<sst><si><t>Date</t></si><si><r><t>Net </t></r><r><t>Sales</t></r></si><si><t>hello</t></si></sst>'],
      ['xl/worksheets/sheet1.xml', '<worksheet><sheetData>' +
        '<row r="1"><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>' +   // no r= on cells → A1, B1
        '<row r="2" spans="1:2"/>' +                                       // self-closing row
        '<row r="3"><c r="B3"><v>42</v></c><c t="inlineStr"><is><t>x</t></is></c></row>' + // B3 then sequential C3
        '<row><c t="s"><v>2</v></c></row>' +                               // no r= on row → row 4
        '</sheetData></worksheet>'],
    ];
    const parts = [], cd = []; let off = 0;
    const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
    const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
    entries.forEach(([name, xml]) => {
      const data = Buffer.from(xml, 'utf8'), nm = Buffer.from(name);
      const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(data.length), u32(data.length), u16(nm.length), u16(0), nm, data]);
      cd.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(data.length), u32(data.length), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nm]));
      parts.push(local); off += local.length;
    });
    const cdBuf = Buffer.concat(cd);
    const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cdBuf.length), u32(off), u16(0)]);
    const zip = Buffer.concat(parts.concat([cdBuf, eocd]));
    const sheets = await core.readXlsx(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
    assert.equal(sheets.length, 1);
    assert.deepEqual(sheets[0].rows[0], ['Date', 'Net Sales']);
    assert.deepEqual(sheets[0].rows[1], []);
    assert.deepEqual(sheets[0].rows[2], ['', '42', 'x']);
    assert.deepEqual(sheets[0].rows[3], ['hello']);
  });
});

describe('ERP storage: a missing period (rows:[] + rowsMissing) is never mistaken for legacy inline rows', () => {
  test('erpChunkKeys lists its chunks and erpAssemble fills it once the docs are readable', () => {
    const missing = { id: 'm', rev: 2, rows: [], rowsMissing: true, rowsRef: { key: 'erpRows:m:2', chunks: 1, count: 1 } };
    assert.deepEqual(core.erpChunkKeys({ periods: [missing] }), ['erpRows:m:2:0']);
    const back = core.erpAssemble({ periods: [missing] }, { 'erpRows:m:2:0': [['2026-09-01', 'SINV1', 0, 'P', 1, 1, 1, 0, 'Mariam Zohair', 'TEPE', 'C', 'Clinics', 0]] });
    assert.deepEqual(back.missing, []);
    assert.equal(back.sales.periods[0].rows.length, 1);
    assert.equal(back.sales.periods[0].rowsMissing, undefined);
    // still unreadable → still missing, still not silently emptied
    const again = core.erpAssemble({ periods: [missing] }, {});
    assert.deepEqual(again.missing, ['m']);
    // a genuine legacy period (rows inline, no rowsRef) is untouched
    assert.deepEqual(core.erpChunkKeys({ periods: [{ id: 'l', rows: [[1]] }] }), []);
  });
});

describe('ERP no-overlap invariant (erpEnforceNoOverlap)', () => {
  const R = (date, sm, net) => [date, 'D' + date + sm, 0, 'P', 1, net, net, 0, sm, 'TEPE', 'Clinic', 'Clinics', 0];
  const P = (id, importedAt, rows, extra) => Object.assign({ id, importedAt, rev: 1, from: rows.reduce((a, r) => !a || r[0] < a ? r[0] : a, null), to: rows.reduce((a, r) => !a || r[0] > a ? r[0] : a, null), rows, rowCount: rows.length, repMap: {} }, extra || {});
  const now = 1758400000000;
  test('two devices imported the same week: the later import wins, the earlier one is tombstoned', () => {
    const a = P('a', '2026-09-21T10:00:00Z', [R('2026-09-02', 'Mariam Zohair', 100), R('2026-09-21', 'Mariam Zohair', 50)]);
    const b = P('b', '2026-09-21T09:00:00Z', [R('2026-09-05', 'Mariam Zohair', 999)]);
    const r = core.erpEnforceNoOverlap({ periods: [b, a], removed: {} }, now);
    assert.equal(r.changed, 1);
    assert.deepEqual(r.sales.periods.map(p => p.id), ['a']);
    assert.deepEqual(r.sales.removed, { b: now });
  });
  test('partial overlap strips only the winner\'s salesmen inside the winner\'s span; stays idempotent', () => {
    const old = P('old', '2026-10-01T00:00:00Z', [R('2026-09-01', 'S', 10), R('2026-09-15', 'S', 20), R('2026-09-30', 'S', 30), R('2026-09-15', 'T', 5)]);
    const nu = P('nu', '2026-10-02T00:00:00Z', [R('2026-09-10', 'S', 1), R('2026-09-20', 'S', 2)]);
    const r = core.erpEnforceNoOverlap({ periods: [old, nu] }, now);
    assert.equal(r.changed, 1);
    const o = r.sales.periods.find(p => p.id === 'old');
    assert.deepEqual(o.rows.map(x => x[0] + x[8]), ['2026-09-01S', '2026-09-30S', '2026-09-15T'], 'S on the 15th (inside 10–20) removed, T untouched');
    assert.equal(o.net, 45); assert.equal(o.rowCount, 3); assert.equal(o.rev, now);
    assert.equal(o.importedAt, '2026-10-01T00:00:00Z', 'precedence stamp never changes');
    const again = core.erpEnforceNoOverlap(r.sales, now + 1);
    assert.equal(again.changed, 0, 'second pass changes nothing');
    assert.equal(again.sales.periods.find(p => p.id === 'nu').rows.length, 2, 'the winner keeps its rows on the re-run');
  });
  test('different salesmen never interfere', () => {
    const a = P('a', '2026-09-21T10:00:00Z', [R('2026-09-02', 'Mariam Zohair', 100)]);
    const b = P('b', '2026-09-21T09:00:00Z', [R('2026-09-05', 'Ranova Ayman Mohammed', 999)]);
    const r = core.erpEnforceNoOverlap({ periods: [a, b] }, now);
    assert.equal(r.changed, 0); assert.equal(r.sales.periods.length, 2);
  });
  test('a newer period whose rows are not on this device still claims its salesmen (from who-is-who) and is never stripped itself', () => {
    const readable = P('r', '2026-09-20T00:00:00Z', [R('2026-09-05', 'Mariam Zohair', 100), R('2026-09-06', 'Ranova Ayman Mohammed', 7)]);
    const missing = P('m', '2026-09-21T00:00:00Z', [], { rows: [], rowsMissing: true, rowsRef: { key: 'erpRows:m:1', chunks: 1, count: 9 }, from: '2026-09-01', to: '2026-09-21', repMap: { 'Mariam Zohair': 'Mariam' } });
    const r = core.erpEnforceNoOverlap({ periods: [readable, missing] }, now);
    assert.equal(r.changed, 1);
    assert.deepEqual(r.sales.periods.find(p => p.id === 'r').rows.map(x => x[8]), ['Ranova Ayman Mohammed']);
    const m = r.sales.periods.find(p => p.id === 'm');
    assert.equal(m.rowsMissing, true); assert.equal(m.rowsRef.key, 'erpRows:m:1');
  });
  test('erpMergeIndex merges orphan sightings, earliest sighting wins', () => {
    const r = core.erpMergeIndex({ periods: [], orphans: { k1: 5000, k2: 9000 } }, { periods: [], orphans: { k2: 7000, k3: 1000 } }, now);
    assert.deepEqual(r.merged.orphans, { k1: 5000, k2: 7000, k3: 1000 });
  });
});

describe('v84: date order, grouped exports, who-is-who stamps, salesman keys', () => {
  test('erpDate validates fields, floors time-of-day serials, and honours a per-file month-first order', () => {
    assert.equal(core.erpDate('21/09/2026'), '2026-09-21');
    assert.equal(core.erpDate('9/21/2026'), null, 'month 21 is impossible day-first → rejected, not garbage');
    assert.equal(core.erpDate('9/21/2026', { mdy: true }), '2026-09-21');
    assert.equal(core.erpDate('2026-9-5'), '2026-09-05');
    assert.equal(core.erpDate('46286.75'), '2026-09-21', 'an afternoon time never rolls into the next day');
    assert.deepEqual(core.erpDateOrder(['21/09/2026', '9/21/2026']), { mdy: false }, 'a first field >12 anywhere proves day-first, even against a conflicting line');
    assert.deepEqual(core.erpDateOrder(['9/21/2026', '9/1/2026']), { mdy: true });
    assert.deepEqual(core.erpDateOrder(['1/2/2026']), { mdy: false }, 'ambiguous → the ERP\'s own day-first');
  });
  test('a US-locale CSV (M/D/YYYY) parses to the right dates instead of a garbage span', () => {
    const csv = 'Date,Invoice#,Account,Product,Quantity,Net Sales,Brand,Name\n9/21/2026,SINV1,C,P,1,10,TEPE,Mariam Zohair\n9/2/2026,SINV2,C,P,1,5,TEPE,Mariam Zohair\n';
    const p = core.parseErpCsv(csv);
    assert.equal(p.mdy, true);
    assert.deepEqual(p.rows.map(r => r.date), ['2026-09-21', '2026-09-02']);
  });
  test('grouped export: product lines under an invoice inherit its date/invoice/customer; a totals row is still skipped', () => {
    const csv = 'Date,Invoice#,Account,Product,Quantity,Net Sales,Brand,Name\n' +
      '21/09/2026,SINV1,Clinic A,P1,1,10,TEPE,Mariam Zohair\n,,,P2,2,20,TEPE,\n,,,P3,1,5,TEPE,\n' +
      '20/09/2026,SINV2,Clinic B,P1,1,7,TEPE,Mariam Zohair\n,,,,999,42,,\n';
    const p = core.parseErpCsv(csv);
    assert.equal(p.rows.length, 4); assert.equal(p.inherited, 2); assert.equal(p.dropped, 0);
    assert.deepEqual(p.rows.map(r => r.doc), ['SINV1', 'SINV1', 'SINV1', 'SINV2']);
    assert.deepEqual(p.rows.slice(0, 3).map(r => r.customer), ['Clinic A', 'Clinic A', 'Clinic A']);
    assert.deepEqual(p.rows.slice(0, 3).map(r => r.salesman), ['Mariam Zohair', 'Mariam Zohair', 'Mariam Zohair']);
    assert.equal(core.erpTotals(p.rows).net, 42);
    // a data line with a product but truly no date anywhere before it is counted as dropped
    const p2 = core.parseErpCsv('Date,Invoice#,Account,Product,Quantity,Net Sales,Brand,Name\n,,,P9,1,10,TEPE,X\n21/09/2026,SINV1,C,P1,1,10,TEPE,X\n');
    assert.equal(p2.dropped, 1); assert.equal(p2.rows.length, 1);
  });
  test('merge: the most recent who-is-who decision wins per name (repMapAt), not the local copy', () => {
    const now = 1758400000000;
    const local = { periods: [], repMapGlobal: { X: 'Mariam', Y: 'Renova' }, repMapAt: { X: now - 5000 } };
    const cloud = { periods: [], repMapGlobal: { X: null, Y: 'Mariam', Z: null }, repMapAt: { X: now - 1000, Z: now } };
    const r = core.erpMergeIndex(local, cloud, now);
    assert.deepEqual(r.merged.repMapGlobal, { X: null, Y: 'Renova', Z: null }, 'X: cloud is newer; Y: unstamped tie → local; Z: cloud only');
    assert.deepEqual(r.merged.repMapAt, { X: now - 1000, Z: now });
  });
  test('overlap invariant keys on the rep a name maps to, so a re-spelled ERP name is the same person', () => {
    const now = 1758400000000;
    const R = (date, sm, net) => [date, 'D' + date + sm, 0, 'P', 1, net, net, 0, sm, 'TEPE', 'Clinic', 'Clinics', 0];
    const old = { id: 'old', importedAt: '2026-09-10T00:00:00Z', rev: 1, from: '2026-09-01', to: '2026-09-10', repMap: { 'Mariam Zohair': 'Mariam' }, rows: [R('2026-09-05', 'Mariam Zohair', 100)] };
    const nu = { id: 'nu', importedAt: '2026-09-21T00:00:00Z', rev: 2, from: '2026-09-01', to: '2026-09-21', repMap: { 'Mariam  Zohair': 'Mariam' }, rows: [R('2026-09-05', 'Mariam  Zohair', 100), R('2026-09-20', 'Mariam  Zohair', 50)] };
    const keyOf = (row, p) => { const rep = (p.repMap || {})[row[8]]; return rep ? 'rep:' + rep : 'sm:' + row[8]; };
    const raw = core.erpEnforceNoOverlap({ periods: [old, nu] }, now);
    assert.equal(raw.changed, 0, 'raw names differ → nothing detected without the key');
    const keyed = core.erpEnforceNoOverlap({ periods: [old, nu] }, now, { keyOf, nameKey: (n, p) => keyOf([,,,,,,,, n], p) });
    assert.equal(keyed.changed, 1);
    assert.deepEqual(keyed.sales.periods.map(p => p.id), ['nu'], 'the older spelling\'s period is superseded');
  });
});

describe('v85: doctors — one person, one record', () => {
  test('names normalize across Dr./د. prefixes, case and spacing', () => {
    assert.equal(core.normDoctorName('Dr. Ahmed  Al-Sabah'), 'ahmed al sabah');
    assert.equal(core.normDoctorName('DR AHMED AL SABAH'), 'ahmed al sabah');
    assert.equal(core.normDoctorName('د. نور الخالد'), 'نور الخالد');
    assert.equal(core.normDoctorName('الدكتورة نور الخالد'), 'نور الخالد');
    assert.equal(core.normDoctorName(''), '');
  });
  test('several names typed in one box become several doctors', () => {
    assert.deepEqual(core.splitDoctorNames('Dr. Ahmed, Dr. Sara / Dr Ali & Dr. Noor and Dr. Omar'), ['Dr. Ahmed', 'Dr. Sara', 'Dr Ali', 'Dr. Noor', 'Dr. Omar']);
    assert.deepEqual(core.splitDoctorNames('د. نور و د. علي'), ['د. نور', 'د. علي']);
    assert.deepEqual(core.splitDoctorNames('  Dr. Single  '), ['Dr. Single']);
    assert.deepEqual(core.splitDoctorNames(''), []);
  });
  test('duplicates collapse into the first record, fields merge, visits get a remap', () => {
    const r = core.dedupeDoctors([
      { id: 'a', name: 'Dr. Ahmed', title: '', phone: '' },
      { id: 'b', name: 'Dr. Sara', title: 'Orthodontist' },
      { id: 'c', name: 'dr ahmed', title: 'Periodontist', phone: '555', notes: 'prefers mornings', handovers: [{ x: 1 }] },
      { id: 'd', name: 'DR. AHMED ' },
    ]);
    assert.deepEqual(r.doctors.map(d => d.id), ['a', 'b']);
    assert.deepEqual(r.remap, { c: 'a', d: 'a' });
    assert.equal(r.doctors[0].title, 'Periodontist'); assert.equal(r.doctors[0].phone, '555');
    assert.equal(r.doctors[0].notes, 'prefers mornings'); assert.equal(r.doctors[0].handovers.length, 1);
  });
  test('two devices\' lists merge by id then by person — nothing lost, nobody twice', () => {
    const m = core.mergeDoctorLists([{ id: 'a', name: 'Dr. Ahmed' }], [{ id: 'a', name: 'Dr. Ahmed' }, { id: 'z', name: 'Dr. Zain' }, { id: 'q', name: 'DR AHMED' }]);
    assert.deepEqual(m.doctors.map(d => d.id), ['a', 'z']);
    assert.deepEqual(m.remap, { q: 'a' });
  });
});

describe('v86: whole-app audit fixes', () => {
  test('a joint visit satisfies the partner\'s planned visit too', () => {
    const plans = { '2026-09-10': { Mariam: [{ id: 'c1', note: '' }], Renova: [{ id: 'c1', note: '' }] } };
    const visits = [{ date: '2026-09-10', rep: 'Mariam', withRep: 'Renova', clinicId: 'c1' }];
    assert.deepEqual(core.missedPlans(plans, visits, '2026-09-21'), []);
    const solo = [{ date: '2026-09-10', rep: 'Mariam', clinicId: 'c1' }];
    assert.deepEqual(core.missedPlans(plans, solo, '2026-09-21').map(m => m.rep), ['Renova']);
  });
  test('contacts: same family name at the same clinic is NOT the same person', () => {
    const list = [
      { name: 'Dr. Ahmed Al-Sabah', clinic: 'Dental 8', phone: '' },
      { name: 'Dr. Noura Al-Sabah', clinic: 'Dental 8', phone: '' },
      { name: 'Dr Ahmad Al Sabah', clinic: 'Dental 8', phone: '' },   // a typo of the first
    ];
    const out = core.dedupeContacts(list, null);
    assert.deepEqual(out.map(c => c.name), ['Dr. Ahmed Al-Sabah', 'Dr. Noura Al-Sabah']);
    assert.equal(core.sameFirstName('Mohammed Ali', 'Mohamed Ali'), true);
    assert.equal(core.sameFirstName('Ahmed Ali', 'Noura Ali'), false);
    // a shared phone still merges (same person, name typed differently)
    const byPhone = core.dedupeContacts([{ name: 'Dr. Sara Q', clinic: 'A', phone: '99887766' }, { name: 'Sara Q.', clinic: 'B', phone: '+965 99887766' }], null);
    assert.equal(byPhone.length, 1);
  });
  test('day plans merge three ways: my changed lists win, untouched lists follow the cloud', () => {
    const base  = { '2026-09-22': { Mariam: [{ id: 'c1', note: '' }, { id: 'c2', note: '' }], Renova: [{ id: 'c9', note: '' }] } };
    // the other device removed c2 from Mariam's list and added a plan for Renova on the 23rd
    const cloud = { '2026-09-22': { Mariam: [{ id: 'c1', note: '' }], Renova: [{ id: 'c9', note: '' }] }, '2026-09-23': { Renova: [{ id: 'c5', note: 'call first' }] } };
    // this device (unaware) changed Renova's 22nd list only
    const local = { '2026-09-22': { Mariam: [{ id: 'c1', note: '' }, { id: 'c2', note: '' }], Renova: [{ id: 'c9', note: '' }, { id: 'c7', note: '' }] } };
    const r = core.mergeDayPlans3(local, cloud, base, new Set());
    assert.deepEqual(r.merged['2026-09-22'].Mariam.map(e => e.id), ['c1']);          // the removal sticks
    assert.deepEqual(r.merged['2026-09-22'].Renova.map(e => e.id), ['c9', 'c7']);    // my change wins
    assert.deepEqual(r.merged['2026-09-23'].Renova.map(e => e.id), ['c5']);          // their new plan arrives
    assert.equal(r.recovered, 2);
    // a list I deleted stays deleted even though the cloud still holds it
    const del = core.mergeDayPlans3({ '2026-09-22': { Renova: [{ id: 'c9', note: '' }] } }, cloud, base, new Set());
    assert.equal(del.merged['2026-09-22'].Mariam, undefined);
    assert.equal(del.merged['2026-09-22'].Renova.length, 1);
    // no base (first save after an offline boot): local lists win, cloud fills the gaps
    const nb = core.mergeDayPlans3(local, cloud, null, new Set());
    assert.deepEqual(nb.merged['2026-09-22'].Mariam.map(e => e.id), ['c1', 'c2']);
    assert.deepEqual(nb.merged['2026-09-23'].Renova.map(e => e.id), ['c5']);
    // a tombstoned date|rep never comes back from the cloud
    const tb = core.mergeDayPlans3({}, cloud, null, new Set(['2026-09-23|Renova']));
    assert.equal(tb.merged['2026-09-23'], undefined);
  });
  test('recycle bin union keeps every entry once, newest deletion wins', () => {
    const cloud = { clinics: [{ id: 'a', _deletedAt: 1 }], visits: [{ id: 'v1', _deletedAt: 5 }] };
    const local = { clinics: [{ id: 'a', _deletedAt: 9 }, { id: 'b', _deletedAt: 2 }], products: [{ id: 'p', _deletedAt: 3 }] };
    const m = core.mergeRecycleBin(cloud, local);
    assert.deepEqual(m.clinics.map(x => x.id + ':' + x._deletedAt), ['a:9', 'b:2']);
    assert.deepEqual(m.visits.map(x => x.id), ['v1']);
    assert.deepEqual(m.products.map(x => x.id), ['p']);
  });
});

describe('v90: visits — one live document plus one archive per past month', () => {
  const today = '2026-09-25';
  test('partition: this month and undated/future visits stay live, older months go to their archive', () => {
    const vs = [{ id: 'a', date: '2026-09-02' }, { id: 'b', date: '2026-08-30' }, { id: 'c', date: '2026-07-01' }, { id: 'd', date: '2026-08-01' }, { id: 'e' }, { id: 'f', date: '2026-10-03' }];
    const p = core.visitsPartition(vs, today);
    assert.deepEqual(p.live.map(v => v.id), ['a', 'e', 'f']);
    assert.deepEqual(Object.keys(p.months).sort(), ['2026-07', '2026-08']);
    assert.deepEqual(p.months['2026-08'].map(v => v.id), ['b', 'd']);
    assert.equal(core.visitsArchKey('2026-08'), 'visitsArch:2026-08');
    assert.equal(core.visitHome({ date: 'bad' }, today), 'live');
  });
  test('assemble: every document once, duplicates resolved to the copy living where its date says', () => {
    const live = [{ id: 'a', date: '2026-09-02', notes: 'live' }, { id: 'x', date: '2026-08-05', notes: 'moved to Aug, live copy not tidied yet' }];
    const arch = { '2026-08': [{ id: 'b', date: '2026-08-30' }, { id: 'x', date: '2026-08-05', notes: 'aug copy' }], '2026-07': [{ id: 'c', date: '2026-07-01' }, { id: 'y', date: '2026-09-09', notes: 'date edited to Sep, still in Jul doc' }] };
    const all = core.visitsAssemble(live, arch, today);
    assert.deepEqual(all.map(v => v.id).sort(), ['a', 'b', 'c', 'x', 'y']);
    assert.equal(all.find(v => v.id === 'x').notes, 'aug copy');
    assert.equal(all.find(v => v.id === 'y').notes, 'date edited to Sep, still in Jul doc');
    // a plain legacy account: everything in the live document, no archives
    assert.equal(core.visitsAssemble([{ id: 'a', date: '2026-07-01' }], {}, today).length, 1);
  });
  test('stray ids: a document sheds a visit only once its new home provably holds it', () => {
    const homes = { a: 'live', x: '2026-08', y: 'live' };
    const stored = new Set(['live|a', '2026-08|x']); // y not confirmed in its home yet
    const has = (doc, id) => stored.has(doc + '|' + id);
    assert.deepEqual(core.visitsStrayIds('live', [{ id: 'a' }, { id: 'x' }], homes, has), ['x']);
    assert.deepEqual(core.visitsStrayIds('2026-07', [{ id: 'y' }], homes, has), []);
    assert.deepEqual(core.visitsStrayIds('2026-08', [{ id: 'x' }], homes, has), []);
  });
});

describe('ERP account links (v113)', () => {
  // The owner's case: Aline has three branches, all his; a fourth (Khairan)
  // opened before it was in the app, so its ERP account was linked by hand to
  // Salmiya. Mariam owns Dental 8. September is closed; today is 11 October.
  const G = 'Dr. Ghaith', M = 'Mariam', GS = 'Ghaith Al Manfe', MS = 'Mariam Zohair';
  const KH = 'Aline Dental Clinic - Khairan';
  // packed ERP row: [date, doc, type(1=return), product, qty, gross, net, sret, salesman, brand, customer, cls, dsret, ref]
  const row = (d, doc, cust, net, sm, gross) => [d, doc, 0, 'Intensiv Ortho-Strips', 1, gross == null ? net : gross, net, 0, sm || GS, 'Intensiv', cust, 'Clinics', 0, ''];
  const ret = (d, doc, cust, net, sm, ref) => [d, doc, 1, 'Intensiv Ortho-Strips', -1, 0, net, -net, sm || GS, 'Intensiv', cust, 'Clinics', 0, ref];
  const repMap = { [GS]: G, [MS]: M };
  const SEP = [row('2026-09-14', 'SINV7001', 'Aline Dental Clinic - Salmiya', 100), row('2026-09-21', 'SINV7002', KH, 60, GS, 96), // 37.5% off
    row('2026-09-22', 'SINV7003', 'Dental 8 Clinic', 25, MS)];
  const OCT = [row('2026-10-04', 'SINV7101', 'Aline Dental Clinic - Salmiya', 50), row('2026-10-05', 'SINV7102', 'Aline Dental Clinic - Hawally', 30),
    row('2026-10-06', 'SINV7103', KH, 80), row('2026-10-07', 'SINV7104', KH, 15.5), row('2026-10-06', 'SINV7105', 'Dental 8 Clinic', 40, MS)];
  const CLINICS = [
    { id: 'al1', name: 'Aline Dental Clinic - Salmiya', rep: G, cls: 'A' }, { id: 'al2', name: 'Aline Dental Clinic - Hawally', rep: G, cls: 'B' },
    { id: 'al3', name: 'Aline Dental Clinic - Jabriya', rep: G, cls: 'B' }, { id: 'm1', name: 'Dental 8 Clinic', rep: M, cls: 'A' }];
  const MAP = { [KH]: 'al1', 'Marketing Philips': '@ignore' };
  const fixture = (o = {}) => ({ today: '2026-10-11', targets: {}, clinics: o.clinics || CLINICS, erpMap: o.erpMap || MAP,
    erpSales: { returnPolicy: 'origin', periods: [
      { id: 'sep', from: '2026-09-01', to: '2026-09-30', repMap, rows: SEP.concat(o.sep || []) },
      { id: 'oct', from: '2026-10-01', to: '2026-10-08', repMap, rows: OCT.concat(o.oct || []) }].concat(o.periods || []) } });
  const at = (d, day) => Object.assign({}, d, { today: day });
  const ach = (rep, d, day) => core.monthAchievement(rep, day ? at(d, day) : d).amount;
  const nb = extra => Object.assign({ id: 'zz-new', name: KH, rep: G, cls: 'A' }, extra || {});
  // The rule the preview promises: for every month M and every person P,
  // Σ moves to P − Σ moves from P = monthAchievement(P) after − before, as of the end of M.
  const assertInvariant = (data, pv, label) => {
    assert.equal(pv.error, null, label);
    const after = Object.assign({}, data, pv.draft), months = new Set(pv.moves.map(m => m.month));
    data.erpSales.periods.forEach(p => core.unpackErpRows(p.rows).forEach(r => months.add(r.date.slice(0, 7))));
    const people = new Set([G, M].concat(pv.moves.map(m => m.from), pv.moves.map(m => m.to)).filter(Boolean));
    for(const mo of months){
      const end = core.getMonthDates(mo + '-01').slice(-1)[0];
      for(const P of people){
        const moved = pv.moves.filter(m => m.month === mo).reduce((s, m) => s + (m.to === P ? m.net : 0) - (m.from === P ? m.net : 0), 0);
        const delta = ach(P, after, end) - ach(P, data, end);
        assert.ok(Math.abs(moved - delta) < 0.005, `${label}: ${mo} ${P}: moves ${moved} vs monthAchievement ${delta}`);
      }
    }
  };

  test('erpRowRep: a link to a clinic counts for its owner; a link to a removed clinic counts for the salesman who issued it', () => {
    const r = { customer: KH, salesman: MS, date: '2026-10-06', net: 80 };      // Mariam issued it
    assert.equal(core.erpRowRep(r, CLINICS, { [KH]: 'al1' }, repMap), G);       // his branch → his
    assert.equal(core.erpRowRep(r, CLINICS, { [KH]: 'm1' }, repMap), M);
    assert.equal(core.erpRowRep(r, CLINICS, { [KH]: 'gone1' }, repMap), M);     // removed clinic → the issuer
    assert.equal(core.erpRowRep(Object.assign({}, r, { salesman: 'Someone Else' }), CLINICS, { [KH]: 'gone1' }, repMap), null);
    assert.equal(core.erpRowRep(Object.assign({}, r, { customer: '  ' + KH + ' ' }), CLINICS, { [KH]: 'al1' }, repMap), G); // matched trimmed
    // erpRepOfMatch is the same rule on a match already made (the split of v113)
    const lines = core.unpackErpRows(SEP.concat(OCT)).concat([r, Object.assign({}, r, { salesman: 'Someone Else' })]);
    for(const map of [MAP, {}, { [KH]: 'm1' }, { [KH]: 'gone1' }, { [KH]: '@channel', 'Dental 8 Clinic': '@ignore' }]){
      for(const l of lines) assert.equal(core.erpRepOfMatch(core.matchCustomer((l.customer || '').trim(), CLINICS, map), l, CLINICS, repMap), core.erpRowRep(l, CLINICS, map, repMap));
    }
  });

  test('erpAccounts: every status, where each account counts, and the order (removed clinic first, then the ones to link, then the most KD)', () => {
    const clinics = CLINICS.concat([{ id: 'sh1', name: 'Shifa Clinic - Salmiya', rep: M, cls: 'B' }, { id: 'sh2', name: 'Shifa Clinic - Hawally', rep: G, cls: 'B' },
      { id: 'sm1', name: 'Smile Dental Clinic', rep: G, cls: 'Closed' }]);
    const erpMap = Object.assign({ 'Old Aline Branch': 'gone1', 'Online Shop Kuwait': '@channel', 'Closed Account Nobody Buys': 'al2' }, MAP);
    const data = fixture({ clinics, erpMap,
      sep: [row('2026-09-23', 'SINV7004', 'Aline Dental Clinic', 20)],
      oct: [ret('2026-10-08', 'SRET7101', KH, -10, GS, 'SINV7103'), row('2026-10-02', 'SINV7120', 'Old Aline Branch', 5), row('2026-10-02', 'SINV7121', 'Old Aline Branch', 3, MS),
        row('2026-10-02', 'SINV7122', 'Shifa Clinic', 12, MS), row('2026-10-02', 'SINV7123', 'Totally Unknown Co', 7, 'Stranger'),
        row('2026-10-02', 'SINV7124', 'My Fatoorah', 9), row('2026-10-02', 'SINV7125', 'Online Shop Kuwait', 3), row('2026-10-02', 'SINV7126', 'Marketing Philips', 0, GS, 30),
        row('2026-10-02', 'SINV7127', 'Alinesalmiya Dental', 1), row('2026-10-02', 'SINV7128', 'Smile Dental Clinic', 4),
        row('2026-10-02', 'SINV7129', 'ALINE DENTAL CLINIC - KHAIRAN', 6), row('2026-10-02', 'SINV7130', 'Aline Dental Clinic-Khairan', 2),
        row('2026-10-02', 'SINV7131', '', 11), row('2026-10-02', 'SINV7132', '   ', 1)] });
    const res = core.erpAccounts(data), by = n => res.accounts.find(a => a.name === n);
    const st = n => { const a = by(n); return [a.status, a.clinicId, a.byHand, a.link]; };
    assert.deepEqual(st(KH), ['hand', 'al1', true, 'al1']);
    assert.deepEqual(st('Old Aline Branch'), ['gone', null, true, 'gone1']);
    assert.deepEqual(st('Aline Dental Clinic - Salmiya'), ['name', 'al1', false, null]);            // token match
    assert.deepEqual(st('Alinesalmiya Dental'), ['name', 'al1', false, null]);                      // fuzzy match
    assert.deepEqual(st('Aline Dental Clinic'), ['family', 'al1', false, null]);                    // the group name lands on the first branch
    assert.deepEqual([by('Aline Dental Clinic').familyLabel, by('Aline Dental Clinic').branches], ['Aline', 3]);
    assert.deepEqual(st('My Fatoorah'), ['channel', null, false, null]);
    assert.deepEqual(st('Online Shop Kuwait'), ['channel', null, true, '@channel']);
    assert.deepEqual(st('Marketing Philips'), ['ignored', null, true, '@ignore']);
    assert.deepEqual(st('Shifa Clinic'), ['ambiguous', null, false, null]);
    assert.deepEqual(by('Shifa Clinic').candidates, ['sh1', 'sh2']);
    assert.deepEqual(st('Totally Unknown Co'), ['none', null, false, null]);
    assert.deepEqual([by('Smile Dental Clinic').closed, by(KH).closed], [true, false]);
    assert.deepEqual([by('Marketing Philips').internal, by('My Fatoorah').channelName, by('Online Shop Kuwait').channelName, by(KH).internal], [true, true, false, false]);
    assert.deepEqual(res.accounts.map(a => a.name), [
      'Old Aline Branch',                                                                          // removed clinic
      'Shifa Clinic', 'Totally Unknown Co', 'ALINE DENTAL CLINIC - KHAIRAN', 'Aline Dental Clinic-Khairan', // need a link, most KD first
      'Aline Dental Clinic - Salmiya', KH, 'Dental 8 Clinic', 'Aline Dental Clinic - Hawally', 'Aline Dental Clinic', 'My Fatoorah',
      'Smile Dental Clinic', 'Online Shop Kuwait', 'Alinesalmiya Dental', 'Marketing Philips']);
  });

  test('erpAccounts: invoices, returns, KD, dates and people; nameless lines apart; stale links; spelling variants', () => {
    const data = fixture({ erpMap: Object.assign({ 'Old Aline Branch': 'gone1', 'Closed Account Nobody Buys': 'al2' }, MAP),
      oct: [ret('2026-10-08', 'SRET7101', KH, -10, GS, 'SINV7103'), row('2026-10-02', 'SINV7120', 'Old Aline Branch', 5), row('2026-10-02', 'SINV7121', 'Old Aline Branch', 3, MS),
        row('2026-10-02', 'SINV7123', 'Totally Unknown Co', 7, 'Stranger'), row('2026-10-02', 'SINV7129', 'ALINE DENTAL CLINIC - KHAIRAN', 6),
        row('2026-10-02', 'SINV7130', 'Aline Dental Clinic-Khairan', 2), row('2026-10-02', 'SINV7131', '', 11), row('2026-10-02', 'SINV7132', '   ', 1)] });
    const res = core.erpAccounts(data), by = n => res.accounts.find(a => a.name === n);
    const k = by(KH);
    assert.deepEqual([k.lines, k.invoices, k.returns, k.net, k.first, k.last, k.monthNet], [4, 3, 1, 145.5, '2026-09-21', '2026-10-08', 85.5]);
    assert.deepEqual(k.people, [{ rep: G, net: 145.5 }]);
    assert.deepEqual(by('Old Aline Branch').people, [{ rep: G, net: 5 }, { rep: M, net: 3 }]);   // a removed clinic: each issuer
    assert.deepEqual(by('Totally Unknown Co').people, [{ rep: null, net: 7 }]);                   // a salesman outside the team
    assert.deepEqual(by('Dental 8 Clinic').people, [{ rep: M, net: 65 }]);
    assert.deepEqual(k.variants, ['ALINE DENTAL CLINIC - KHAIRAN', 'Aline Dental Clinic-Khairan']);
    assert.deepEqual(by('Aline Dental Clinic-Khairan').variants, ['ALINE DENTAL CLINIC - KHAIRAN', KH]);
    assert.deepEqual(by('Dental 8 Clinic').variants, []);
    assert.deepEqual(res.nameless, { lines: 2, net: 12, link: null });                            // never listed, never linkable
    assert.ok(!res.accounts.some(a => !a.name.trim()));
    assert.deepEqual(res.stale, [{ name: 'Closed Account Nobody Buys', link: 'al2', status: 'hand' }, { name: 'Marketing Philips', link: '@ignore', status: 'ignored' }]);
    assert.deepEqual([res.files, res.rowsMissing], [2, 0]);
    // every KD once: the accounts plus the nameless lines are the files' total, each account's people its net
    const total = data.erpSales.periods.reduce((s, p) => s + core.unpackErpRows(p.rows).reduce((t, r) => t + r.net, 0), 0);
    assert.ok(Math.abs(res.accounts.reduce((s, a) => s + a.net, 0) + res.nameless.net - total) < 1e-9);
    res.accounts.forEach(a => assert.ok(Math.abs(a.people.reduce((s, x) => s + x.net, 0) - a.net) < 1e-9, a.name));
    // a file whose rows did not load is skipped and counted apart; no files at all is not an error
    const miss = core.erpAccounts(fixture({ periods: [{ id: 'aug', from: '2026-08-01', to: '2026-08-31', repMap, rows: [], rowsMissing: true }] }));
    assert.deepEqual([miss.files, miss.rowsMissing], [2, 1]);
    const none = core.erpAccounts({ today: '2026-10-11', clinics: CLINICS, erpMap: { '': 'm1' } });
    assert.deepEqual([none.accounts, none.stale, none.files, none.nameless], [[], [], 0, { lines: 0, net: 0, link: 'm1' }]);
  });

  test("the owner's case: a new branch takes the account — September 1 × 60 (closed), October 2 × 95.5, and nobody's month changes", () => {
    const data = fixture();
    const pv = core.erpLinkPreview(data, { name: KH, to: 'zz-new', addClinic: nb() }, { settings: {} });
    assert.equal(pv.error, null);
    assert.deepEqual(pv.months, [{ month: '2026-09', invoices: 1, net: 60, closed: true }, { month: '2026-10', invoices: 2, net: 95.5, closed: false }]);
    assert.deepEqual([pv.lines, pv.invoices, pv.net, pv.first, pv.last], [3, 3, 155.5, '2026-09-21', '2026-10-07']);
    assert.deepEqual(pv.moves, []);
    assert.deepEqual(pv.people, [{ rep: G, net: 155.5 }]);
    assert.deepEqual([pv.before.value, pv.before.status, pv.before.clinicId, pv.after.value, pv.after.status, pv.after.clinicId], ['al1', 'hand', 'al1', 'zz-new', 'hand', 'zz-new']);
    assert.deepEqual([pv.others, pv.limitFlips, pv.ledger], [[], [], { returns: 0, free: 0 }]); // class copied (A): 37.5% stays within 40%
    assert.deepEqual(pv.outside, { lines: 0, net: 0 });
    // nobody's sales and no discount check change — but the new branch's first invoice (21 Sep) is a new account in closed September
    assert.deepEqual(pv.closedMonths, { sales: [], discount: [], wins: ['2026-09'] });
    // the draft is what the screen runs monthAchievement on; the input is untouched
    assert.deepEqual(pv.draft.erpMap, { [KH]: 'zz-new', 'Marketing Philips': '@ignore' });
    assert.deepEqual(pv.draft.clinics.map(c => c.id), ['al1', 'al2', 'al3', 'm1', 'zz-new']);
    assert.deepEqual([data.erpMap[KH], data.clinics.length], ['al1', 4]);
    const after = Object.assign({}, data, pv.draft);
    for(const rep of [G, M]) for(const day of ['2026-09-30', '2026-10-11']) assert.equal(ach(rep, after, day), ach(rep, data, day), rep + ' ' + day);
    assert.deepEqual([ach(G, data), ach(G, data, '2026-09-30'), ach(M, data), ach(M, data, '2026-09-30')], [175.5, 160, 40, 25]);
    // a retry after the branch already landed: it is in the list once, the preview is the same
    const again = core.erpLinkPreview(Object.assign({}, data, { clinics: CLINICS.concat([nb()]) }), { name: KH, to: 'zz-new', addClinic: nb() });
    assert.deepEqual([again.error, again.draft.clinics.filter(c => c.id === 'zz-new').length, again.moves.length], [null, 1, 0]);
  });

  test("to another rep's clinic: each month that changes hands, closed months flagged — and the moves equal the change in monthAchievement", () => {
    const data = fixture();
    const pv = core.erpLinkPreview(data, { name: KH, to: 'm1' });
    assert.deepEqual(pv.moves, [{ month: '2026-09', from: G, to: M, net: 60, invoices: 1, closed: true }, { month: '2026-10', from: G, to: M, net: 95.5, invoices: 2, closed: false }]);
    assert.deepEqual(pv.people, [{ rep: M, net: 155.5 }]);
    const after = Object.assign({}, data, pv.draft);
    assert.deepEqual([ach(G, after, '2026-09-30'), ach(M, after, '2026-09-30'), ach(G, after), ach(M, after)], [100, 85, 80, 135.5]);
    assertInvariant(data, pv, 'cross-rep');
    // The invariant over many changes, on files with a family name, a line Mariam issued at his branch, a salesman
    // outside the team, and a return of a September invoice booked in the October file: the origin policy dates it
    // back to September, which the October file does not cover, so it counts in no month figure — and in no move.
    const rich = fixture({ sep: [row('2026-09-23', 'SINV7004', 'Aline Dental Clinic', 20)],
      oct: [row('2026-10-08', 'SINV7106', KH, 10, MS), ret('2026-10-03', 'SRET7001', KH, -12, GS, 'SINV7002'), row('2026-10-02', 'SINV7107', 'Totally Unknown Co', 7, 'Stranger')] });
    const handed = CLINICS.map(c => c.id === 'm1' ? Object.assign({}, c, { rep: G, prevRep: M, repSince: '2026-10-01' }) : c);
    const shared = CLINICS.map(c => c.id === 'm1' ? Object.assign({}, c, { shared: true, sharedSince: '2026-10-01' }) : c);
    const cases = [
      [rich, { name: KH, to: 'm1' }], [rich, { name: KH, to: null }], [rich, { name: KH, to: '@channel' }], [rich, { name: KH, to: '@ignore' }],
      [rich, { name: KH, to: 'zz-new', addClinic: nb({ rep: M }) }], [rich, { name: KH, to: 'zz-new', addClinic: nb() }],
      [rich, { name: 'Dental 8 Clinic', to: 'al1' }], [rich, { name: 'Aline Dental Clinic', to: 'm1' }], [rich, { name: 'Totally Unknown Co', to: 'al2' }],
      [Object.assign({}, rich, { clinics: handed }), { name: KH, to: 'm1' }], [Object.assign({}, rich, { clinics: shared }), { name: KH, to: 'm1' }]];
    cases.forEach(([d, change], i) => assertInvariant(d, core.erpLinkPreview(d, change), 'case ' + i + ' ' + JSON.stringify(change.to)));
    const rx = core.erpLinkPreview(rich, { name: KH, to: 'm1' });
    // the month rows follow the month figures' rule, like the moves: the return dated back to September from the
    // October file counts in no month, so it is not in September's row — it is told apart, with its KD
    assert.deepEqual(rx.months.map(m => [m.month, m.invoices, m.net]), [['2026-09', 1, 60], ['2026-10', 3, 105.5]]);
    assert.deepEqual(rx.outside, { lines: 1, net: -12 });
    assert.equal(rx.net, 153.5);                                                     // every line once: the months plus the line outside them
    assert.deepEqual(rx.moves.map(m => [m.month, m.from, m.to, m.net]), [['2026-09', G, M, 60], ['2026-10', G, M, 105.5]]);
    assert.deepEqual(rx.ledger, { returns: 1, free: 0 });
    assert.deepEqual(pv.outside, { lines: 0, net: 0 });
    // the closed months each kind of change reaches: September's sales, and the first invoice of Dental 8 (22 → 21 Sep)
    assert.deepEqual(pv.closedMonths, { sales: ['2026-09'], discount: [], wins: ['2026-09'] });
  });

  test('automatic matching: with no branch the account counts for the salesman who issued each invoice; once the Khairan clinic exists it matches by name', () => {
    const pv = core.erpLinkPreview(fixture(), { name: KH, to: null });
    assert.deepEqual([pv.after.value, pv.after.status, pv.after.clinicId, pv.after.method], [null, 'none', null, 'none']);
    assert.deepEqual([pv.moves, pv.people], [[], [{ rep: G, net: 155.5 }]]);       // his own salesman issued every line
    assert.equal(pv.draft.erpMap[KH], undefined);
    const withMariamLine = fixture({ oct: [row('2026-10-08', 'SINV7106', KH, 10, MS)] });
    assert.deepEqual(core.erpLinkPreview(withMariamLine, { name: KH, to: null }).moves, [{ month: '2026-10', from: G, to: M, net: 10, invoices: 1, closed: false }]);
    const withKh = CLINICS.concat([{ id: 'al4', name: KH, rep: G, cls: 'B' }]);
    const pv2 = core.erpLinkPreview(fixture({ clinics: withKh }), { name: KH, to: null });
    assert.deepEqual([pv2.after.status, pv2.after.clinicId, pv2.after.method], ['name', 'al4', 'token']);
    assert.equal(core.matchCustomer(KH, withKh, MAP).clinicId, 'al1');              // the bug in one line: the old link outlives the new branch
  });

  test('a handover on the target keeps lines before repSince with prevRep; a shared target counts each line for its issuer from sharedSince', () => {
    const extra = { oct: [row('2026-10-08', 'SINV7106', KH, 10, MS)] };           // Mariam issued one October line at his branch
    const handed = fixture(Object.assign({ clinics: CLINICS.map(c => c.id === 'm1' ? Object.assign({}, c, { rep: G, prevRep: M, repSince: '2026-10-01' }) : c) }, extra));
    const ph = core.erpLinkPreview(handed, { name: KH, to: 'm1' });
    assert.deepEqual(ph.moves.map(m => [m.month, m.from, m.to, m.net]), [['2026-09', G, M, 60]]);   // September was still Mariam's clinic; October is his
    assertInvariant(handed, ph, 'handover');
    const shared = fixture(Object.assign({ clinics: CLINICS.map(c => c.id === 'm1' ? Object.assign({}, c, { shared: true, sharedSince: '2026-10-01' }) : c) }, extra));
    const ps = core.erpLinkPreview(shared, { name: KH, to: 'm1' });
    assert.deepEqual(ps.moves.map(m => [m.month, m.from, m.to, m.net]), [['2026-09', G, M, 60], ['2026-10', G, M, 10]]); // October: whoever issued it
    assertInvariant(shared, ps, 'shared');
  });

  test('a new branch under another rep turns the group name "Aline Dental Clinic" ambiguous and lists it; with the same rep and type words nothing else changes', () => {
    const data = fixture({ sep: [row('2026-09-23', 'SINV7004', 'Aline Dental Clinic', 20)] });
    const other = { name: 'Aline Dental Clinic', before: { status: 'family', clinicId: 'al1' }, after: { status: 'ambiguous', clinicId: null }, net: 20 };
    const pm = core.erpLinkPreview(data, { name: KH, to: 'zz-new', addClinic: nb({ rep: M }) });
    assert.deepEqual(pm.others, [other]);
    assert.deepEqual(pm.moves.map(m => [m.month, m.from, m.to, m.net]), [['2026-09', G, M, 60], ['2026-10', G, M, 95.5]]); // the group line still counts for its issuer (him)
    assert.deepEqual(core.erpLinkPreview(data, { name: KH, to: 'zz-new', addClinic: nb() }).others, []);                     // joins the family: Aline (4)
    assert.deepEqual(core.erpLinkPreview(data, { name: KH, to: 'zz-new', addClinic: nb({ name: 'Aline Center - Khairan' }) }).others, [other]); // other type words
    assert.deepEqual(core.erpLinkPreview(data, { name: KH, to: 'al2' }).others, []);   // no new clinic: no other account can change
    // a spelling variant nobody linked matches the new branch by name once it exists — listed, and its KD moves
    const variant = fixture({ oct: [row('2026-10-02', 'SINV7129', 'ALINE DENTAL CLINIC - KHAIRAN', 6, MS)] });
    const pv = core.erpLinkPreview(variant, { name: KH, to: 'zz-new', addClinic: nb() });
    assert.deepEqual(pv.others, [{ name: 'ALINE DENTAL CLINIC - KHAIRAN', before: { status: 'none', clinicId: null }, after: { status: 'name', clinicId: 'zz-new' }, net: 6 }]);
    assert.deepEqual(pv.moves.map(m => [m.month, m.from, m.to, m.net]), [['2026-10', M, G, 6]]);   // Mariam issued it; now it counts for the branch's owner
    assertInvariant(variant, pv, 'variant');
  });

  test('limitFlips: the new branch in class B turns SINV7002 (37.5% off) from within 40% to over 35%, in closed September', () => {
    const flip = { doc: 'SINV7002', date: '2026-09-21', pct: 37.5, net: 60, before: { limit: 40, within: true }, after: { limit: 35, within: false }, closed: true };
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: KH, to: 'zz-new', addClinic: nb({ cls: 'B' }) }, { settings: {} }).limitFlips, [flip]);
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: KH, to: 'al2' }).limitFlips, [flip]);                   // Hawally is class B
    // same rep, so no sales move: the closed month changes only in its discount check (and Hawally's first invoice, 5 Oct → 21 Sep)
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: KH, to: 'al2' }).closedMonths, { sales: [], discount: ['2026-09'], wins: ['2026-09'] });
    // the supervisor's limits, read as weeklyReport reads them (an empty value keeps the default)
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: KH, to: 'al2' }, { settings: { discountOther: 38 } }).limitFlips, []);
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: KH, to: 'al2' }, { settings: { discountOther: '' } }).limitFlips, [flip]);
    // channel accounts leave the discount check: every invoice of the account goes out of it
    const ch = core.erpLinkPreview(fixture(), { name: KH, to: '@channel' }).limitFlips;
    assert.deepEqual(ch.map(f => [f.doc, f.before && f.before.within, f.after, f.closed]), [['SINV7002', true, null, true], ['SINV7103', true, null, false], ['SINV7104', true, null, false]]);
  });

  test("firstInvoice: the new branch's first invoice (21 Sep) — new-account wins follow it", () => {
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: KH, to: 'zz-new', addClinic: nb() }).firstInvoice,
      [{ key: 'c:zz-new', label: KH, before: null, after: '2026-09-21' }]);
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: KH, to: null }).firstInvoice,               // unlinked: an account by its own name
      [{ key: 'n:aline dental clinic - khairan', label: KH, before: null, after: '2026-09-21' }]);
    // a branch's own first invoice moves with its account
    assert.deepEqual(core.erpLinkPreview(fixture(), { name: 'Aline Dental Clinic - Salmiya', to: 'al2' }).firstInvoice, [
      { key: 'c:al2', label: 'Aline Dental Clinic - Hawally', before: '2026-10-05', after: '2026-09-14' },
      { key: 'c:al1', label: 'Aline Dental Clinic - Salmiya', before: '2026-09-14', after: '2026-09-21' }]);
    // an account nobody linked becomes a branch with its own name: its key changes (n: → c:), its first date does not —
    // one name, one date, so nothing is reported and no closed month is touched
    const free = fixture({ erpMap: { 'Marketing Philips': '@ignore' } });
    const same = core.erpLinkPreview(free, { name: KH, to: 'zz-new', addClinic: nb({ cls: 'B' }) });   // class B: SINV7002 stays over 35%, as with no clinic
    assert.deepEqual([same.firstInvoice, same.firstProduct, same.closedMonths], [[], [], { sales: [], discount: [], wins: [] }]);
    // under another name the branch is another name: both are told
    assert.deepEqual(core.erpLinkPreview(free, { name: KH, to: 'zz-new', addClinic: nb({ name: 'Aline Dental Clinic - Khairan Mall' }) }).firstInvoice, [
      { key: 'n:aline dental clinic - khairan', label: KH, before: '2026-09-21', after: null },
      { key: 'c:zz-new', label: 'Aline Dental Clinic - Khairan Mall', before: null, after: '2026-09-21' }]);
  });

  test('firstProduct: a first-time product moves between branches that both bought before — a closed month\'s wins change with no new account', () => {
    // August: Salmiya and Hawally each bought a handpiece, so neither branch's first invoice moves when Khairan does
    const rowP = (d, doc, cust, net, product) => [d, doc, 0, product, 1, net, net, 0, GS, 'Intensiv', cust, 'Clinics', 0, ''];
    const aug = { id: 'aug', from: '2026-08-01', to: '2026-08-31', repMap, rows: [rowP('2026-08-10', 'SINV6001', 'Aline Dental Clinic - Salmiya', 20, 'Intensiv Handpiece'),
      rowP('2026-08-11', 'SINV6002', 'Aline Dental Clinic - Hawally', 20, 'Intensiv Handpiece')] };
    const pv = core.erpLinkPreview(fixture({ periods: [aug] }), { name: KH, to: 'al2' });
    assert.deepEqual(pv.firstInvoice, []);
    // Hawally's first Ortho-Strips: its own 5 Oct invoice before, Khairan's 21 Sep after (Salmiya keeps its own 14 Sep)
    assert.deepEqual(pv.firstProduct, [{ key: 'c:al2', label: 'Aline Dental Clinic - Hawally', before: '2026-10-05', after: '2026-09-21', product: 'Intensiv Ortho-Strips' }]);
    assert.deepEqual(pv.closedMonths.wins, ['2026-09']);
  });

  test('guards: a Closed clinic is never a new target (CLOSED_CLINIC); a link already on one can still move away', () => {
    const closed = CLINICS.concat([{ id: 'al0', name: 'Aline Dental Clinic - Jahra', rep: G, cls: 'Closed' }]);
    const d = fixture({ clinics: closed });
    const pv = core.erpLinkPreview(d, { name: KH, to: 'al0' });
    assert.deepEqual([pv.error, pv.before.clinicId, pv.after, pv.draft], ['CLOSED_CLINIC', 'al1', null, null]);
    assert.equal(core.erpLinkPreview(d, { name: 'My Fatoorah', to: 'al0' }).error, 'NOT_A_CLINIC_ACCOUNT');   // not a clinic account first
    const onClosed = fixture({ clinics: closed, erpMap: { [KH]: 'al0' } });
    assert.equal(core.erpLinkPreview(onClosed, { name: KH, to: 'al0' }).error, 'SAME');
    const away = core.erpLinkPreview(onClosed, { name: KH, to: 'al1' });
    assert.deepEqual([away.error, away.before.closed, away.after.clinicId], [null, true, 'al1']);
  });

  test('guards: NO_NAME, SAME, NO_CLINIC, NOT_A_CLINIC_ACCOUNT', () => {
    const d = fixture(), err = c => core.erpLinkPreview(d, c).error;
    assert.equal(err({ name: '', to: 'al2' }), 'NO_NAME');
    assert.equal(err({ name: '   ', to: 'al2' }), 'NO_NAME');
    assert.equal(err({ name: '(no name)', to: 'al2' }), 'NO_NAME');
    assert.equal(err({ name: KH, to: 'al1' }), 'SAME');
    assert.equal(err({ name: '  ' + KH + ' ', to: 'al1' }), 'SAME');                 // names are trimmed
    assert.equal(err({ name: 'Dental 8 Clinic', to: null }), 'SAME');               // no link already: automatic
    assert.equal(err({ name: 'Marketing Philips', to: '@ignore' }), 'SAME');
    assert.equal(err({ name: KH, to: 'nope' }), 'NO_CLINIC');
    assert.equal(err({ name: KH, to: '@auto' }), 'NO_CLINIC');                      // only @channel and @ignore are not clinics
    assert.equal(err({ name: KH, to: 42 }), 'NO_CLINIC');
    assert.equal(err({ name: KH, to: 'zz-new', addClinic: { name: KH, rep: G } }), 'NO_CLINIC'); // a new branch needs its id
    assert.equal(err({ name: 'My Fatoorah', to: 'al1' }), 'NOT_A_CLINIC_ACCOUNT');
    assert.equal(err({ name: 'Marketing Philips', to: 'al1' }), 'NOT_A_CLINIC_ACCOUNT');
    assert.equal(err({ name: 'Marketing Philips', to: 'zz-new', addClinic: nb({ name: 'Marketing Philips' }) }), 'NOT_A_CLINIC_ACCOUNT');
    assert.equal(err({ name: 'My Fatoorah', to: '@ignore' }), null);                // not a clinic: allowed
    assert.equal(err({ name: 'Marketing Philips', to: null }), null);
    // an error keeps where it counts now for the screen, and nothing else
    const s = core.erpLinkPreview(d, { name: KH, to: 'al1' });
    assert.deepEqual([s.name, s.before.clinicId, s.before.status, s.after, s.draft, s.moves, s.lines], [KH, 'al1', 'hand', null, null, [], 0]);
    assert.equal(core.erpLinkPreview(d, { name: '', to: 'al1' }).before, null);
    // a link with no invoice in the saved files: allowed, 0 lines (it applies to future uploads)
    const stale = core.erpLinkPreview(Object.assign({}, d, { erpMap: { 'Closed Account Nobody Buys': 'al2' } }), { name: 'Closed Account Nobody Buys', to: 'al3' });
    assert.deepEqual([stale.error, stale.lines, stale.months, stale.moves, stale.after.clinicId], [null, 0, [], [], 'al3']);
  });

  test('safety: accounts named "__proto__" or "constructor" — the draft map holds their own keys, and an own "__proto__" link read from the cloud survives another account\'s change', () => {
    const d = fixture({ oct: [row('2026-10-07', 'SINV7151', '__proto__', 33), row('2026-10-07', 'SINV7152', 'constructor', 7)] });
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
    const pv = core.erpLinkPreview(d, { name: '__proto__', to: 'al2' });
    assert.equal(pv.error, null);
    assert.deepEqual([pv.after.status, pv.after.clinicId], ['hand', 'al2']);
    assert.equal(own(pv.draft.erpMap, '__proto__'), 'al2');
    assert.equal(own(JSON.parse(JSON.stringify(pv.draft.erpMap)), '__proto__'), 'al2');            // what a save would write
    const acc = core.erpAccounts(Object.assign({}, d, pv.draft)).accounts.find(a => a.name === '__proto__');
    assert.deepEqual([acc.status, acc.clinicId, acc.byHand, acc.link], ['hand', 'al2', true, 'al2']);
    assertInvariant(d, pv, '__proto__ → Hawally');
    const pc = core.erpLinkPreview(d, { name: 'constructor', to: 'al3' });
    assert.deepEqual([pc.error, pc.after.status, pc.after.clinicId, own(pc.draft.erpMap, 'constructor')], [null, 'hand', 'al3', 'al3']);
    // the cloud copy already links "__proto__" (JSON.parse keeps it as an own key): another account's change keeps it
    const d2 = Object.assign({}, d, { erpMap: JSON.parse('{"__proto__":"al3","' + KH + '":"al1"}') });
    assert.equal(core.erpAccounts(d2).accounts.find(a => a.name === '__proto__').clinicId, 'al3');
    const p2 = core.erpLinkPreview(d2, { name: KH, to: 'al2' });
    assert.equal(p2.error, null);
    assert.deepEqual([own(p2.draft.erpMap, '__proto__'), own(p2.draft.erpMap, KH)], ['al3', 'al2']);
    // and taking the "__proto__" link out removes exactly that key
    const p3 = core.erpLinkPreview(d2, { name: '__proto__', to: null });
    assert.deepEqual([p3.error, own(p3.draft.erpMap, '__proto__'), own(p3.draft.erpMap, KH), p3.after.status], [null, undefined, 'al1', 'none']);
  });

  test('erpBranchCandidates: where it counts now, its branch family, the automatic matches, the same first word — Closed clinics left out', () => {
    assert.deepEqual(core.erpBranchCandidates(KH, CLINICS, MAP), ['al1', 'al2', 'al3']);   // Salmiya, Hawally, Jabriya
    const closed = CLINICS.concat([{ id: 'al0', name: 'Aline Dental Clinic - Jahra', rep: G, cls: 'Closed' }]);
    assert.deepEqual(core.erpBranchCandidates(KH, closed, MAP), ['al1', 'al2', 'al3']);
    assert.deepEqual(core.erpBranchCandidates(KH, closed, { [KH]: 'al0' }), ['al0', 'al1', 'al2', 'al3']);  // except the one it counts at now
    // linked to the wrong rep's clinic: that one first, then the Aline branches by name
    assert.deepEqual(core.erpBranchCandidates(KH, CLINICS, { [KH]: 'm1' }), ['m1', 'al2', 'al3', 'al1']);
    // the same first word outside the family (another rep) comes after it
    const kids = CLINICS.concat([{ id: 'ak1', name: 'Aline Kids Center', rep: M, cls: 'B' }]);
    assert.deepEqual(core.erpBranchCandidates(KH, kids, MAP), ['al1', 'al2', 'al3', 'ak1']);
    // no link and a tie across reps: the tied clinics
    const shifa = CLINICS.concat([{ id: 'sh1', name: 'Shifa Clinic - Salmiya', rep: M }, { id: 'sh2', name: 'Shifa Clinic - Hawally', rep: G }]);
    assert.deepEqual(core.erpBranchCandidates('Shifa Clinic', shifa, {}), ['sh1', 'sh2']);
    // at most 8; a first word under 4 letters is not a clue
    const many = Array.from({ length: 12 }, (_, i) => ({ id: 'b' + String(i).padStart(2, '0'), name: 'Aline Dental Clinic - Area ' + i, rep: G }));
    assert.equal(core.erpBranchCandidates(KH, many, {}).length, 8);
    // (neither name matches its clinic automatically: one shared word of two is not enough)
    assert.deepEqual(core.erpBranchCandidates('SN Clinic 360', CLINICS.concat([{ id: 'sn1', name: 'SN Smile Center', rep: M }]), {}), []);
    assert.deepEqual(core.erpBranchCandidates('Noor Clinic 360', CLINICS.concat([{ id: 'nr1', name: 'Noor Smile Center', rep: M }]), {}), ['nr1']);
  });

  test('i18n: the long-list line keeps its numbers in Arabic; the screens\' fixed words are in the dictionary', () => {
    const i18n = require('../www/js/i18n.js');
    assert.equal(i18n.tr('Showing 40 of 75 — search to find the others'), 'يظهر 40 من 75 — ابحث لإيجاد البقية');
    assert.equal(i18n.tr('Showing 40 of 1203 — search to find the others'), 'يظهر 40 من 1203 — ابحث لإيجاد البقية');
    assert.equal(i18n.tr("Where do this account's invoices count?"), 'على أي فرع تُحسب فواتير هذا الحساب؟');
    assert.equal(i18n.tr('I understand that closed months change.'), 'أفهم أن أرقام الأشهر المغلقة ستتغير.');
    assert.equal(i18n.tr('⚠️ Not saved — nothing changed. Check the connection and tap Save again.'), '⚠️ لم يُحفظ — لم يتغير شيء. تحقق من الاتصال واضغط «حفظ» مرة أخرى.');
    assert.equal(i18n.tr(KH), null);                                                   // an account name is data
  });

  test('i18n: a toast said after the person left names the new branch — a link not saved after the branch was added, and what Undo did to the branch', () => {
    const i18n = require('../www/js/i18n.js'), S = 'Smile Care Fintas';
    assert.equal(i18n.tr(`⚠️ The new branch ${S} was added, but the link was not saved — ${S}: ${S} (by name).`),
      `⚠️ أُضيف الفرع الجديد ${S}، لكن الربط لم يُحفظ — ${S}: ${S} (بالاسم).`);
    assert.equal(i18n.tr(`⏳ The new branch ${S} was added; the link has no confirmation from the cloud yet — ${S}: ${S} (by name).`),
      `⏳ أُضيف الفرع الجديد ${S}، ولم يصل تأكيد حفظ الربط من السحابة بعد — ${S}: ${S} (بالاسم).`);
    assert.equal(i18n.tr(`↩️ Undone — ${S}: not linked. The new branch ${S} was removed (it is in the recycle bin).`),
      `↩️ تم التراجع — ${S}: غير مربوط. الفرع الجديد ${S} حُذف (موجود في سلة المحذوفات).`);
    assert.equal(i18n.tr(`↩️ Undone — ${S}: not linked. The new branch ${S} was removed on this device — the removal uploads when the connection is back.`),
      `↩️ تم التراجع — ${S}: غير مربوط. الفرع الجديد ${S} حُذف على هذا الجهاز — يصل الحذف إلى السحابة عند عودة الاتصال.`);
    assert.equal(i18n.tr(`↩️ Undone — ${S}: ${S} (by name). The new branch ${S} stays in the clinic list: it has a logged visit. The branch matches this account's name, so it still takes it — remove the branch from its clinic card to go back.`),
      `↩️ تم التراجع — ${S}: ${S} (بالاسم). الفرع الجديد ${S} يبقى في قائمة العيادات: عليه زيارة مسجلة. اسم الفرع يطابق اسم هذا الحساب، فما زال يأخذه — للعودة كما كان احذف الفرع من بطاقة العيادة.`);
    // the reason names another account (a dot inside its name), and other accounts still count differently
    assert.equal(i18n.tr(`↩️ Undone — ${KH}: Aline Dental Clinic - Salmiya (by hand). The new branch ${KH} stays in the clinic list: another ERP account counts there: Dr. Ali Clinic. Other accounts that still count differently because of the branch: 2.`),
      `↩️ تم التراجع — ${KH}: Aline Dental Clinic - Salmiya (ربط يدوي). الفرع الجديد ${KH} يبقى في قائمة العيادات: حساب فواتير آخر يُحسب عليه: Dr. Ali Clinic. حسابات أخرى ما زالت تُحسب بشكل مختلف بسبب الفرع: 2.`);
    assert.equal(i18n.tr(`↩️ Undone — ${S}: not linked.`), `↩️ تم التراجع — ${S}: غير مربوط.`);          // no branch: unchanged
    assert.equal(i18n.tr('No ERP account counts here in the files loaded on this device.'), 'لا يُحسب أي حساب فواتير على هذا الفرع في الملفات المحمّلة على هذا الجهاز.');
  });
});
