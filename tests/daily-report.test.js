const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/js/core.js');
const report = require('../scripts/daily-report/report.js');

const pack = r => [r.date, r.doc, r.type === 'return' ? 1 : 0, r.product, r.qty, r.gross, r.net, r.sret, r.salesman, r.brand, r.customer, r.cls, r.dsret || 0, r.ref || ''];
const today = '2026-09-24';
const data = () => ({
  today,
  targets: { Mariam: { revenue: 10000, achieved: 3000, achievedAsOf: '2026-09-23', month: '2026-09' }, Renova: { revenue: 12000, achieved: 4000, achievedAsOf: '2026-09-23', month: '2026-09' } },
  erpSales: { periods: [{ id: 'sep', from: '2026-09-01', to: '2026-09-22', repMap: { 'Mariam Zohair': 'Mariam', 'Ranova Ayman Mohammed': 'Renova' }, rows: [
    pack({ date: '2026-09-10', doc: 'SINV1', type: 'invoice', product: 'P', qty: 1, gross: 100, net: 80, sret: 0, salesman: 'Mariam Zohair', brand: 'TEPE', customer: 'My Fatoorah', cls: 'Online Customers' }),
    pack({ date: '2026-09-15', doc: 'SINV2', type: 'invoice', product: 'P', qty: 1, gross: 100, net: 90, sret: 0, salesman: 'Mariam Zohair', brand: 'TEPE', customer: 'Dental 8 Clinic', cls: 'Clinics' }),
    pack({ date: '2026-09-20', doc: 'SINV3', type: 'invoice', product: 'P', qty: 1, gross: 100, net: 60.5, sret: 0, salesman: 'Mariam Zohair', brand: 'TEPE', customer: 'My Fatoorah', cls: 'Online Customers' }),
    pack({ date: '2026-09-21', doc: 'SINV4', type: 'invoice', product: 'P', qty: 1, gross: 100, net: 70, sret: 0, salesman: 'Ranova Ayman Mohammed', brand: 'TEPE', customer: 'Crown Dental Center', cls: 'Dental Centers' }),
  ] }], repMapGlobal: { 'Mariam Zohair': 'Mariam', 'Ranova Ayman Mohammed': 'Renova' }, returnPolicy: 'erp' },
  clinics: [
    { id: 'c1', name: 'Dental 8 Clinic', rep: 'Mariam', cls: 'A', nextFollowUp: '2026-09-20', doctors: [] },
    { id: 'c2', name: 'Smile Care', rep: 'Mariam', cls: 'B', nextFollowUp: today, doctors: [] },
    { id: 'c3', name: 'Crown Dental Center', rep: 'Renova', cls: 'A', doctors: [] },
  ],
  erpMap: {},
  visits: [
    { id: 'v1', clinicId: 'c1', rep: 'Mariam', date: today, orderTaken: true, orderTotal: 45.5, orders: [], orderItems: [], doctorIds: ['d1'], nextFollowUp: '2026-10-01' },
    { id: 'v2', clinicId: 'c3', rep: 'Renova', withRep: 'Mariam', date: today, orderTaken: false, noOrderReason: 'Budget/approval pending', orders: [], orderItems: [], doctorIds: [] },
    { id: 'v3', clinicId: 'c1', rep: 'Mariam', date: today, callOnly: true, orderTaken: false, orders: [], orderItems: [], doctorIds: [] },
  ],
  tasks: [{ id: 't1', text: 'Send price list', rep: 'Mariam', done: false, dueDate: '2026-09-23' }],
  events: [],
  dayPlans: { [today]: { Mariam: [{ id: 'c1', note: 'bring samples' }, { id: 'c2', note: '' }] }, '2026-09-25': { Renova: [{ id: 'c3', note: '' }] }, '2026-09-18': { Renova: [{ id: 'c3', note: '' }] } },
  staff: [{ name: 'Mariam', role: 'rep', email: 'mariam@x.com' }, { name: 'Renova', role: 'rep', email: 'renova@x.com' }, { name: 'Dr. Ghaith', role: 'supervisor', email: 'boss@x.com' }],
});

describe('daily digest: figures are the app\'s figures', () => {
  test('one source, never a sum: the newer of DSR (file-name date) and ERP (last day covered) wins', () => {
    // DSR 23 Sep is newer than the sales file (covers to 22 Sep) → DSR alone
    const a = core.monthAchievement('Mariam', data());
    assert.equal(a.amount, 3000); assert.equal(a.basis, 'dsr'); assert.equal(a.src, 'DSR Sep 23');
    assert.equal(a.alt.basis, 'erp'); assert.equal(a.alt.amount, 80 + 90 + 60.5); assert.equal(a.alt.asOf, '2026-09-22');
    const team = core.teamAchievement(['Mariam', 'Renova'], data());
    assert.equal(team.goal, 22000); assert.equal(team.ach, 7000); assert.equal(team.pct, 32);
    // DSR 14 Sep is older than the sales file → the sales file alone, the whole month from it
    const d2 = data(); d2.targets.Mariam.achievedAsOf = '2026-09-14';
    const b = core.monthAchievement('Mariam', d2);
    assert.equal(b.amount, 230.5); assert.equal(b.basis, 'erp'); assert.equal(b.src, 'ERP to Sep 22'); assert.equal(b.alt.amount, 3000);
    // same date → DSR (the official one)
    const d3 = data(); d3.targets.Mariam.achievedAsOf = '2026-09-22';
    assert.equal(core.monthAchievement('Mariam', d3).basis, 'dsr'); assert.equal(core.monthAchievement('Mariam', d3).why, 'same-day');
    // the sales file does not reach back to the 1st → it cannot stand alone, DSR stays
    const d4 = data(); d4.targets.Mariam.achievedAsOf = '2026-09-14'; d4.erpSales.periods[0].from = '2026-09-10';
    const c = core.monthAchievement('Mariam', d4);
    assert.equal(c.basis, 'dsr'); assert.equal(c.why, 'erp-partial'); assert.match(c.alt.src, /partial month/);
    // a file covers every salesman to its last date, even a rep with no invoice that day
    const r = core.monthAchievement('Renova', d2);
    assert.equal(r.basis, 'dsr'); // Renova's DSR is still 23 Sep in d2
    const d5 = data(); d5.targets.Renova.achievedAsOf = '2026-09-20';
    assert.equal(core.monthAchievement('Renova', d5).asOf, '2026-09-22'); assert.equal(core.monthAchievement('Renova', d5).amount, 70);
  });
  test('morning digest for a rep: target line, plan with notes, follow-ups, missed plans, tasks', () => {
    const d = core.dailyDigest({ kind: 'morning', data: data(), reps: ['Mariam', 'Renova'], rep: 'Mariam' });
    assert.match(d.subject, /ملخص الصباح/); assert.match(d.subject, /Mariam/);
    assert.match(d.text, /Mariam: 30% — 3000\.00 KD من 10000\.00 KD \(المصدر: DSR Sep 23\) · ERP Sep 22: 230\.50 KD \(2%\) — لم يُجمع/);
    assert.match(d.text, /Dental 8 Clinic — bring samples/);
    assert.match(d.text, /Smile Care — اليوم/);
    assert.match(d.text, /Dental 8 Clinic — متأخرة منذ Sep 20/);
    assert.match(d.text, /Send price list/);
    assert.doesNotMatch(d.text, /Renova/); // her own day only
    assert.match(d.html, /dir="rtl"/);
  });
  test('evening digest for the supervisor: team %, per-rep tallies, plan vs reality, tomorrow', () => {
    const d = core.dailyDigest({ kind: 'evening', data: data(), reps: ['Mariam', 'Renova'] });
    assert.match(d.text, /الفريق: 32% — 7000\.00 KD من 22000\.00 KD \(2 مندوبات\)/);
    assert.match(d.text, /Mariam — حصيلة اليوم/);
    assert.match(d.text, /زيارات ميدانية: 2 · مكالمات: 1 · طلبات هاتفية: 0 · طلبات: 1 · مبيعات مسجلة: 45\.50 KD/); // joint visit counts for Mariam too
    assert.match(d.text, /مخطط: 2 · تمت: 1 · لم تتم: Smile Care/);
    assert.match(d.text, /Budget\/approval pending/);
    assert.match(d.text, /Dental 8 Clinic → Oct 1/);
    assert.match(d.text, /Renova — خطة الغد \(1\)/);
    assert.match(d.text, /Crown Dental Center/);
  });
  test('a stale target is flagged instead of shown as this month\'s', () => {
    const dd = data(); dd.targets.Mariam.month = '2026-08'; dd.targets.Mariam.achievedAsOf = '2026-08-30';
    const d = core.dailyDigest({ kind: 'morning', data: dd, reps: ['Mariam'], rep: 'Mariam' });
    assert.match(d.text, /التارغت من شهر سابق/);
  });
});

describe('daily report run (fake cloud + fake mailer)', () => {
  const env = { REPORT_LOGIN_EMAIL: 'boss@x.com', REPORT_LOGIN_PASSWORD: 'pw', RESEND_API_KEY: 'k', MAIL_FROM: 'UltraMed <reports@x.com>' };
  const fakeIo = (sent, written) => ({
    signIn: async () => 'tok',
    loadData: async (tok, today) => Object.assign(data(), { today }),
    sendMail: async (key, from, to, subject, html, text) => { sent.push({ to, subject, from }); if(to === 'renova@x.com') throw new Error('bounced'); return 'id-' + sent.length; },
    readDocs: async () => ({ mailLog: { history: [{ kind: 'morning' }] } }),
    writeDoc: async (tok, key, value) => { written[key] = value; },
  });
  test('sends one digest per recipient (reps their own, supervisor the team) and logs the outcome', async () => {
    const sent = [], written = {};
    const r = await report.run('morning', { env, now: new Date('2026-09-24T04:30:00Z'), io: fakeIo(sent, written) });
    assert.equal(r.today, '2026-09-24');
    assert.equal(sent.length, 3);
    assert.deepEqual(sent.map(s => s.to).sort(), ['boss@x.com', 'mariam@x.com', 'renova@x.com']);
    assert.match(sent.find(s => s.to === 'boss@x.com').subject, /الفريق/);
    assert.match(sent.find(s => s.to === 'mariam@x.com').subject, /Mariam/);
    assert.equal(r.sent, 2); assert.equal(r.failed, 1);
    assert.equal(written.mailLog.last.kind, 'morning');
    assert.equal(written.mailLog.history.length, 2);
    assert.equal(r.to.find(t => t.to === 'renova@x.com').error, 'bounced');
  });
  test('weekends are skipped on the schedule but not for a manual send; override address wins', async () => {
    const sent = [], written = {};
    const fri = new Date('2026-09-25T04:30:00Z'); // Friday in Kuwait
    const r = await report.run('morning', { env, now: fri, io: fakeIo(sent, written) });
    assert.equal(r.skipped, 'weekend'); assert.equal(sent.length, 0);
    const r2 = await report.run('evening', { env: Object.assign({ MAIL_TO_OVERRIDE: 'test@x.com' }, env), now: fri, manual: true, io: fakeIo(sent, written) });
    assert.equal(sent.length, 3); assert.ok(sent.every(s => s.to === 'test@x.com'));
    assert.equal(r2.manual, true);
  });
  test('Kuwait date: 22:30 UTC is already the next day in Kuwait', () => {
    assert.equal(report.kuwaitToday(new Date('2026-09-24T22:30:00Z')), '2026-09-25');
    assert.equal(report.kuwaitToday(new Date('2026-09-24T04:30:00Z')), '2026-09-24');
  });
  test('the public run log never carries an e-mail address', async () => {
    const sent = [], written = {};
    const io = fakeIo(sent, written);
    io.sendMail = async (key, from, to) => { if(to === 'renova@x.com') throw new Error('Invalid `to` field: renova@x.com'); return 'ok'; };
    const r = await report.run('evening', { env, now: new Date('2026-09-24T15:30:00Z'), io });
    const txt = report.summarize(r);
    assert.match(txt, /evening digest for 2026-09-24: 2 sent, 1 failed/);
    assert.match(txt, /FAIL Renova — Invalid `to` field: <address>/);
    assert.doesNotMatch(txt, /@/);
  });
  test('missing configuration fails loudly, never silently', async () => {
    await assert.rejects(() => report.run('morning', { env: {}, manual: true, now: new Date('2026-09-24T04:30:00Z') }), /NO_LOGIN/);
    await assert.rejects(() => report.run('morning', { env: { REPORT_LOGIN_EMAIL: 'a', REPORT_LOGIN_PASSWORD: 'b' }, manual: true, now: new Date('2026-09-24T04:30:00Z') }), /NO_RESEND_KEY/);
  });
});

describe('daily report reads the split visits storage', () => {
  test('this month\'s document plus every archived month, assembled once', async () => {
    const docs = { visits: [{ id: 's1', date: '2026-09-24', rep: 'Mariam', clinicId: 'c1' }], visitsIndex: { months: { '2026-08': { n: 1, rev: 5 }, '2026-07': { n: 1, rev: 4 } } },
      'visitsArch:2026-08': [{ id: 'a1', date: '2026-08-03', rep: 'Mariam', clinicId: 'c1' }], 'visitsArch:2026-07': [{ id: 'j1', date: '2026-07-03', rep: 'Renova', clinicId: 'c3' }],
      clinics: [], tasks: [], dayPlans: {}, events: [], targets: {}, staff: [], erpSales: { periods: [] }, erpMap: {} };
    const origFetch = global.fetch;
    global.fetch = async (url, init) => {
      const names = JSON.parse(init.body).documents.map(n => decodeURIComponent(n.split('/').pop()));
      return { ok: true, json: async () => names.map(n => n in docs ? { found: { name: 'x/' + n, fields: { value: { stringValue: JSON.stringify(docs[n]) } } } } : { missing: n }) };
    };
    try{
      const data = await report.loadData('tok', '2026-09-24');
      assert.deepEqual(data.visits.map(v => v.id).sort(), ['a1', 'j1', 's1']);
    } finally { global.fetch = origFetch; }
  });
});
