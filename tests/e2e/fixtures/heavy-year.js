// Invented data the size of a heavy year for the team, for the start-up speed
// harness (startup-speed.e2e.js). Nothing here is real: every clinic, doctor,
// customer, salesman, product, message and document number is made up, and
// the numbers are generated when the harness runs (the source holds none).
//   build(opts) → { docs: {cloud key: stored string}, people, today, now, counts, bytes }
//   opts.scale  multiplies the volumes (default 1 = a heavy year: 300 clinics
//               with 919 doctors, 3,631 visits, 20,903 sales lines in 26 chunk
//               documents); 0.25 is a lighter account (the phone's copies fit
//               in its web storage).
// The team: two reps and a supervisor who sells (the staff names the code's
// own staff seed uses; the addresses are invented). The account is in its
// steady state: every one-time pass already ran (the seeds flags), the sales
// files hold only the team's salesmen (an ignored salesman's lines are
// dropped at import), every month is under the cloud's 1 MB document cap.
'use strict';
const fs = require('fs'), path = require('path');
const { WWW } = require('../_env.js');
const core = require(path.join(WWW, 'js', 'core.js'));

const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
const PEOPLE = [M, R, G];
const SALESMAN = { [M]: 'Mariam Example Person', [R]: 'Renova Example Person', [G]: 'Ghaith Example Person' };
const TODAY = '2026-11-24';                 // a Tuesday; the running month is November
const NOW = '2026-11-24T09:15:00';          // local time on the phones
const ARCH_MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const LIVE_MONTH = '2026-11';
const ERP_LAST_DAY = 22;                    // the newest sales file reaches 22 November
const CAP = 1000000;                        // the cloud's document cap (bytes of the stored string)

// Clinic names: an invented first word each (two syllables + n — distinctive, like a real
// clinic's name, so a customer matches one clinic, not a crowd), a kind, and a few branch
// families ("<word> Dental Center <area>") as real territories have.
const SYL = ['ka', 've', 'lo', 'mi', 'ra', 'to', 'su', 'ne', 'di', 'po', 'la', 'ri', 'zo', 'mu', 'fe', 'ta', 'no', 'be', 'si', 'gu'];
const word = i => { const w = SYL[i % 20] + SYL[Math.floor(i / 20) % 20] + (i >= 400 ? SYL[Math.floor(i / 400) % 20] : '') + 'n'; return w[0].toUpperCase() + w.slice(1); };
const KINDS = ['Dental Clinic', 'Dental Center', 'Smile Clinic', 'Medical Center', 'Dental Care', 'Ortho Clinic'];
const AREAS = ['North', 'Marina', 'Hilltop', 'Seaside'];
const GIVEN = ['Lana', 'Omar', 'Sara', 'Yousef', 'Huda', 'Khaled', 'Noor', 'Fahad', 'Dana', 'Tariq', 'Reem', 'Bader', 'Mona', 'Salem', 'Hala', 'Nasser'];
const FAMILY = ['Example', 'Sampleson', 'Testwell', 'Placeholder', 'Fictional', 'Madeup', 'Invented', 'Notreal'];
const TITLES = ['Dentist', 'Dentist', 'Orthodontist', 'Periodontist', 'Hygienist', 'Clinic manager', 'Receptionist'];
const BRANDS = [['Intensiv', 38], ['TePe', 6], ['Philips', 24], ['Curaprox', 4], ['Waterpik', 31], ['GC', 9], ['FLASH', 5], ['HiSmile', 8]];
const CHANNELS = [['My Fatoorah', 'Online Customers'], ['Sample Pharmacy One', 'Pharmacy'], ['Sample Pharmacy Two', 'Pharmacy'], ['Sample Pharmacy Three', 'Pharmacy'],
  ['Sample Hypermarket One', 'Hypermarkets and Supermarkets'], ['Sample Hypermarket Two', 'Hypermarkets and Supermarkets'], ['Sample Hospital One', 'Hospitals']];
const CHAT_EN = ['Reached the clinic, the manager is in a meeting', 'Order confirmed for next week', 'Can someone check the stock of the new brushes?',
  'Doctor asked for samples of the strips', 'Stand photo from this morning', 'Meeting moved to 2 pm', 'The DSR is out, please check your targets',
  'Great visit, they want a demo', 'Traffic is heavy today, I will be late', 'Price list updated in the products tab'];
const CHAT_AR = ['وصلت العيادة والمديرة في اجتماع', 'تم تأكيد الطلب للأسبوع القادم', 'ممكن أحد يتأكد من المخزون؟', 'الدكتور طلب عينات',
  'صورة الستاند من الصباح', 'الاجتماع الساعة الثانية', 'نزل تقرير المبيعات، راجعوا الأهداف', 'زيارة ممتازة ويريدون عرضًا', 'الطريق زحمة اليوم'];
const NOTES = ['Discussed the new range', 'Left samples at reception', 'Doctor busy, will call back', 'Asked about the price list', 'Stock still available',
  'Wants a demo next month', 'Talked about the strips', 'Manager approves orders on Thursdays', '', '', ''];

function rng(seed){ let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pad = n => String(n).padStart(2, '0');
const r3 = x => Math.round(x * 1000) / 1000;
const r2 = x => Math.round(x * 100) / 100;
function daysOf(month, last){
  const [y, m] = month.split('-').map(Number), n = last || new Date(y, m, 0).getDate(), out = [];
  for(let d = 1; d <= n; d++){ const iso = month + '-' + pad(d); const dow = new Date(iso + 'T00:00:00').getDay(); out.push({ iso, work: dow !== 5 && dow !== 6 }); }
  return out;
}
function shiftDay(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
const ms = (iso, hh, mm) => new Date(iso + 'T' + pad(hh || 9) + ':' + pad(mm || 0) + ':00').getTime();

function build(opts){
  opts = opts || {};
  const scale = opts.scale > 0 ? opts.scale : 1;
  const rand = rng(20261124);
  const pick = a => a[Math.floor(rand() * a.length)];
  const S = n => Math.max(1, Math.round(n * scale));
  const docs = {};
  const put = (k, v) => { const s = JSON.stringify(v); if(s.length > CAP && !/^snap_|^photo:/.test(k)) throw new Error('fixture document over the cloud cap: ' + k + ' ' + s.length); docs[k] = s; return s; };
  // a real JPEG stands in for every photo thumbnail (a product photo the site already ships)
  const jpg = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'www', 'img', 'deck', 'p', 'magnetic-adapter-ita.jpg'));
  const THUMB = 'data:image/jpeg;base64,' + jpg.toString('base64');

  // ---- clinics (with doctors), owners 43% / 43% / 14% ----
  const nClinics = S(300);
  const clinics = [];
  const CLS = ['A', 'A', 'B', 'B', 'B', 'C', 'C', 'D', 'D', 'F'];
  for(let i = 0; i < nClinics; i++){
    const rep = i % 30 > 0 && i % 30 <= 2 ? clinics[i - (i % 30)].rep : (i % 7 < 3 ? M : i % 7 < 6 ? R : G);
    // every 30th clinic opens a branch family of 2–3 (same first word, same owner, an area each)
    const fam = clinics.length && i % 30 > 0 && i % 30 <= 2 ? clinics[i - (i % 30)] : null;
    const name = fam ? fam.name.replace(/ North$/, '') + ' ' + AREAS[i % 30] : i % 30 === 0 ? word(i) + ' Dental Center North' : word(i) + ' ' + KINDS[(i * 7) % KINDS.length];
    const id = 'c' + pad(Math.floor(i / 100)) + pad(i % 100);
    const nd = 1 + Math.floor(rand() * 5);
    const doctors = [];
    for(let d = 0; d < nd; d++){
      const doc = { id: id + 'd' + d, name: 'Dr. ' + pick(GIVEN) + ' ' + pick(FAMILY) + ' ' + String.fromCharCode(65 + d), title: pick(TITLES), phone: '', notes: rand() < 0.2 ? 'Prefers visits after 4 pm' : '' };
      if(rand() < 0.3) doc.birthday = '19' + (70 + Math.floor(rand() * 25)) + '-' + pad(1 + Math.floor(rand() * 12)) + '-' + pad(1 + Math.floor(rand() * 28));
      doctors.push(doc);
    }
    const cls = i % 97 === 13 ? 'Closed' : CLS[Math.floor(rand() * CLS.length)];
    const c = { id, name, rep, cls, market: pick(['A', 'B', 'C', 'D']), notes: rand() < 0.15 ? pick(['Potential', 'Working on reactivation', 'Prescription', 'Stock move']) : '',
      phone: '', contact: '', doctors, addedOn: '2025-0' + (1 + (i % 9)) + '-1' + (i % 9), lastVisit: null, nextFollowUp: null, dealType: pick(['prescription', 'direct', 'both', null]) };
    if(i % 61 === 7){ c.shared = true; c.sharedSince = '2026-01-01'; }
    if(i % 53 === 11){ c.prevRep = rep === M ? R : M; c.repSince = '2026-06-01'; }
    clinics.push(c);
  }
  const mine = p => clinics.filter(c => c.rep === p && c.cls !== 'Closed');

  // ---- products (an invented catalog) ----
  const products = [];
  for(let i = 0; i < S(220); i++){
    const [brand, price] = BRANDS[i % BRANDS.length];
    products.push({ id: 'SKU-' + String(1000 + i), name: brand + ' Sample Item ' + (i + 1), brand, cat: pick(['Interdental', 'Brush heads', 'Ortho care', 'Whitening', 'IPR', 'Flossers']),
      price: r2(price * (0.6 + rand())), stock: rand() < 0.85, desc: 'Invented product for the start-up harness. ' + 'Gentle, effective, clinically minded. '.repeat(1 + Math.floor(rand() * 4)), img: '' });
  }

  // ---- visits: a year in the month archives, November in the live document ----
  const visits = [];
  let vn = 0;
  const dayCount = { [M]: 6, [R]: 6, [G]: 1 };
  const monthsAll = ARCH_MONTHS.concat([LIVE_MONTH]);
  const photoDocs = [];
  monthsAll.forEach(month => {
    const last = month === LIVE_MONTH ? Number(TODAY.slice(8)) : 0;
    let photosLeft = S(6);
    daysOf(month, last).forEach(({ iso, work }) => {
      if(!work) return;
      PEOPLE.forEach(p => {
        const k = Math.max(0, Math.round(dayCount[p] * scale * (0.6 + rand() * 0.8)));
        const list = mine(p);
        for(let i = 0; i < k; i++){
          if(iso === TODAY && i > 0) break;                     // the morning: one visit so far
          const c = list[Math.floor(rand() * rand() * list.length)];
          const docIds = c.doctors.slice(0, 1 + Math.floor(rand() * Math.min(2, c.doctors.length))).map(d => d.id);
          const kind = rand();
          const order = kind < 0.3;
          const items = order ? Array.from({ length: 2 + Math.floor(rand() * 3) }, () => { const pr = pick(products); return { productId: pr.id, qty: 1 + Math.floor(rand() * 6), price: pr.price }; }) : [];
          const gross = r2(items.reduce((s, it) => s + it.qty * it.price, 0)), disc = order && rand() < 0.4 ? 10 : 0, net = r2(gross * (1 - disc / 100));
          const v = { id: 'v' + month.replace('-', '') + '-' + (++vn), clinicId: c.id, rep: p, withRep: p !== G && rand() < 0.05 ? G : null, date: iso, ts: ms(iso, 9 + i, Math.floor(rand() * 59)),
            products: items.length ? items.map(it => it.productId) : [pick(products).id, pick(products).id], orderTaken: order,
            orders: order ? [{ id: 'o' + vn, items, discountPct: disc, gross, discountAmount: r2(gross - net), total: net, notes: '' }] : [],
            orderItems: items, orderGross: gross, orderDiscount: r2(gross - net), orderTotal: net,
            doctorId: docIds[0] || null, doctorIds: docIds, nextFollowUp: null, notes: pick(NOTES), noOrderReason: order ? null : pick(['Stock still available', 'Budget next month', 'Decision maker away']) };
          v.doctorNames = {}; docIds.forEach(id => { v.doctorNames[id] = c.doctors.find(d => d.id === id).name; });
          if(kind > 0.96) v.callOnly = true; else if(kind > 0.93 && !order) v.orderOnly = true;
          if(rand() < 0.1) v.rx = [{ type: 'ultramed', name: 'Ultramed fast moving products', qty: 1 + Math.floor(rand() * 3), doctorId: docIds[0] || null }];
          if(rand() < 0.15) v.mood = pick(['happy', 'neutral', 'unhappy']);
          if(photosLeft > 0 && rand() < 0.06){
            photosLeft--;
            const pid = 'ph' + month.replace('-', '') + '-' + vn;
            const ph = { id: pid, thumb: THUMB };
            if(month === LIVE_MONTH && photosLeft % 2 === 0){ ph.pending = true; ph.dev = 'dev-sample-other-phone'; ph.at = ms(shiftDay(iso, 0), 15); } // another phone's, still on its way
            else photoDocs.push(pid);
            v.photos = [ph];
          }
          visits.push(v);
        }
      });
    });
  });
  // follow-ups: every clinic's next visit, some overdue or due today (the Today list)
  clinics.forEach((c, i) => {
    const vs = visits.filter(v => v.clinicId === c.id);
    if(vs.length) c.lastVisit = vs[vs.length - 1].date;
    const r = rand();
    c.nextFollowUp = c.cls === 'Closed' ? null : r < 0.07 ? shiftDay(TODAY, -1 - Math.floor(rand() * 20)) : r < 0.1 ? TODAY : r < 0.7 ? shiftDay(TODAY, 1 + Math.floor(rand() * 40)) : null;
  });
  // three doctors a visit names that their clinic no longer lists (the "doctors without a name" line)
  for(let i = 0; i < 3; i++){ const v = visits[100 + i * 37]; if(v) v.doctorIds = (v.doctorIds || []).concat(['lost-doc-' + i]); }

  const live = visits.filter(v => v.date >= LIVE_MONTH + '-01');
  put('visits', live);
  const index = { months: {}, v: 1, updated: ms('2026-11-23', 18) };
  ARCH_MONTHS.forEach((m, i) => {
    const arr = visits.filter(v => v.date.slice(0, 7) === m);
    put(core.visitsArchKey(m), arr);
    index.months[m] = { n: arr.length, rev: ms(m + '-28', 20) + i };
  });
  put('visitsIndex', index);
  photoDocs.slice(0, 10).forEach(pid => { docs['photo:' + pid] = THUMB + 'A'.repeat(60000); }); // the full photos that landed (a few)

  // ---- the ERP sales files: 12 months + November to the 22nd, the team's salesmen only ----
  const repMap = {}; PEOPLE.forEach(p => { repMap[SALESMAN[p]] = p; });
  const perDay = { [M]: 32, [R]: 30, [G]: 14 };
  const periods = [];
  let inv = 0;
  monthsAll.forEach(month => {
    const last = month === LIVE_MONTH ? ERP_LAST_DAY : 0;
    const rows = [];
    daysOf(month, last).forEach(({ iso, work }) => {
      if(!work) return;
      PEOPLE.forEach(p => {
        const n = Math.max(1, Math.round(perDay[p] * scale * (0.7 + rand() * 0.6)));
        const list = mine(p);
        let doc = null, lines = 0;
        for(let i = 0; i < n; i++){
          if(!doc || lines >= 1 + Math.floor(rand() * 4)){ doc = 'SINV' + month.slice(2).replace('-', '') + '-' + (++inv); lines = 0; }
          lines++;
          const toChannel = rand() < 0.18;
          const cl = list[Math.floor(rand() * rand() * list.length)];
          const famName = / Dental Center (North|Marina|Hilltop|Seaside)$/.test(cl.name) && rand() < 0.15 ? cl.name.replace(/ (North|Marina|Hilltop|Seaside)$/, '') : null;
          const cust = toChannel ? pick(CHANNELS) : [famName || cl.name, 'Clinics'];
          const pr = pick(products), qty = 1 + Math.floor(rand() * 8);
          const gross = r3(pr.price * qty), net = r3(gross * (0.78 + rand() * 0.2));
          if(rand() < 0.04) rows.push([iso, 'SRT' + month.slice(2).replace('-', '') + '-' + inv, 1, pr.name, qty, 0, -net, net, SALESMAN[p], pr.brand, cust[0], cust[1], r3(gross - net), '']);
          else rows.push([iso, doc, 0, pr.name, qty, gross, net, 0, SALESMAN[p], pr.brand, cust[0], cust[1], 0, '']);
        }
      });
    });
    const to = month + '-' + pad(last || new Date(+month.slice(0, 4), +month.slice(5), 0).getDate());
    periods.push({ id: 'f' + month, from: month + '-01', to, net: r3(rows.reduce((s, r) => s + r[6], 0)), rowCount: rows.length,
      importedAt: shiftDay(to, 1) + 'T07:30:00.000Z', repMap: Object.assign({}, repMap), rev: ms(shiftDay(to, 1), 7), rows });
  });
  const erpSales = { periods, repMapGlobal: Object.assign({}, repMap), returnPolicy: 'origin',
    seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, removed: {} };
  const split = core.erpSplitForStorage(erpSales);
  put('erpSales', split.index);
  Object.keys(split.docs).forEach(k => put(k, split.docs[k]));
  const erpMap = { 'My Fatoorah': '@channel', 'Sample Pharmacy One': '@channel', 'Sample Hypermarket One': '@channel', 'Sample Hospital One': '@ignore' };
  put('erpMap', erpMap);
  put('erpNotes', {});

  // ---- targets: this month's DSR figures, and every earlier month's in the history ----
  const monthNet = (m, p) => periods.filter(x => x.id === 'f' + m).reduce((s, x) => s + x.rows.filter(r => r[8] === SALESMAN[p]).reduce((a, r) => a + r[6], 0), 0);
  const brandSplit = t => { const o = {}; BRANDS.forEach(([b], i) => { o[b] = Math.round(t * [0.3, 0.12, 0.2, 0.06, 0.12, 0.08, 0.06, 0.06][i]); }); return o; };
  const targets = { _history: {} };
  ARCH_MONTHS.forEach(m => { targets._history[m] = {}; PEOPLE.forEach(p => { const t = Math.round(monthNet(m, p) * 1.12 / 100) * 100; targets._history[m][p] = { revenue: t, visits: p === G ? 20 : 110, month: m, brands: brandSplit(t) }; }); });
  PEOPLE.forEach(p => { const t = Math.round(monthNet('2026-10', p) * 1.1 / 100) * 100; targets[p] = { revenue: t, visits: p === G ? 20 : 110, month: LIVE_MONTH, brands: brandSplit(t) }; });
  put('targets', targets);

  // ---- tasks, day plans, events (requests, escalations, stands) ----
  const tasks = [];
  for(let i = 0; i < S(520); i++){
    const p = PEOPLE[i % 3], c = pick(mine(p)), due = shiftDay(TODAY, -Math.floor(rand() * 330) + 10);
    const t = { id: 't' + i, text: rand() < 0.5 ? 'Follow up: ' + c.name : pick(['Send the price list', 'Bring samples', 'Confirm the demo date', 'Collect the payment', 'Check the stand']),
      rep: rand() < 0.04 ? 'Team' : p, dueDate: due, done: due < shiftDay(TODAY, -2) ? rand() < 0.93 : false, created: shiftDay(due, -3) };
    if(/^Follow up: /.test(t.text)) t.clinicId = c.id;
    tasks.push(t);
  }
  put('tasks', tasks);
  const dayPlans = {};
  monthsAll.forEach(month => daysOf(month, month === LIVE_MONTH ? Number(TODAY.slice(8)) : 0).forEach(({ iso, work }) => {
    if(!work || iso < '2026-02-01') return;               // plans began in February
    dayPlans[iso] = {};
    PEOPLE.forEach(p => { const list = mine(p); dayPlans[iso][p] = Array.from({ length: p === G ? 1 : 4 + Math.floor(rand() * 3) }, () => ({ id: pick(list).id, note: rand() < 0.2 ? 'bring samples' : '', at: ms(shiftDay(iso, -1), 18, Math.floor(rand() * 59)) })); });
  }));
  put('dayPlans', dayPlans);
  const events = [];
  for(let i = 0; i < S(260); i++){
    const p = PEOPLE[i % 3], c = pick(mine(p)), day = shiftDay(TODAY, -Math.floor(rand() * 360));
    const kind = rand();
    const e = { id: 'e' + i, kind: kind < 0.75 ? 'issue' : 'stand', clinicId: c.id, rep: p, createdBy: p, at: day + 'T1' + Math.floor(rand() * 9) + ':10:00', text: pick(NOTES) || 'Asked for a call back' };
    if(e.kind === 'issue'){ e.type = kind < 0.5 ? 'request' : 'escalation'; if(e.type === 'escalation') e.via = 'the manager'; if(rand() < 0.7) e.resolvedAt = shiftDay(day, 3) + 'T10:00:00'; }
    else { e.brand = pick(BRANDS)[0] + ' counter stand'; e.checks = [day, shiftDay(day, 30)].filter(d => d <= TODAY); }
    events.push(e);
  }
  put('events', events);

  // ---- the team's chat and memories ----
  const chat = [];
  for(let i = 0; i < 300; i++){
    const p = PEOPLE[Math.floor(rand() * 3)], day = shiftDay(TODAY, -Math.floor((300 - i) * 1.2));
    const m = { id: 'm' + i, who: p, text: rand() < 0.5 ? pick(CHAT_AR) : pick(CHAT_EN), ts: ms(day, 8 + Math.floor(rand() * 10), Math.floor(rand() * 59)) };
    if(i % 25 === 3){ m.photoId = 'chatph' + i; m.thumb = THUMB; }
    chat.push(m);
  }
  put('chat', chat);
  const memories = [];
  for(let i = 0; i < S(45); i++) memories.push({ id: 'mem' + i, thumb: THUMB, cap: pick(['Stand day', 'Team lunch', 'New display', 'Conference booth', 'Training']), tag: pick(['', 'win', 'team', 'event']), who: PEOPLE[i % 3], ts: ms(shiftDay(TODAY, -i * 7), 13) });
  put('memories', memories);

  // ---- the recycle bin and the team's delete log ----
  const nowMs = ms(TODAY, 9, 15);
  const binClinics = [], binVisits = [];
  for(let i = 0; i < S(12); i++) binClinics.push({ id: 'cdel' + i, name: 'Deleted ' + word(700 + i) + ' Clinic', rep: PEOPLE[i % 3], cls: 'C', doctors: [], _deletedAt: nowMs - (1 + i * 2) * 86400000, _label: 'Deleted ' + word(700 + i) + ' Clinic' });
  for(let i = 0; i < S(15); i++) binVisits.push({ id: 'vdel' + i, clinicId: clinics[i].id, rep: clinics[i].rep, date: shiftDay(TODAY, -1 - i), ts: nowMs - (1 + i) * 86400000, products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], _deletedAt: nowMs - (1 + i) * 86400000, _label: 'Visit' });
  put('recycleBin', { clinics: binClinics, products: [], visits: binVisits });
  const tombs = { visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} };
  binVisits.filter((v, i) => i < 6).forEach(v => { tombs.visits[v.id] = v._deletedAt; });
  binClinics.filter((c, i) => i < 3).forEach(c => { tombs.clinics[c.id] = c._deletedAt; });
  clinics.slice(0, 40).forEach((c, i) => { tombs.doctors[c.id + '|gone' + i] = nowMs - (10 + i) * 86400000; });
  put('tombs', tombs);

  // ---- everything else the account holds ----
  put('staff', [{ name: M, role: 'rep', email: 'mariam@example.com' }, { name: R, role: 'rep', email: 'renova@example.com' }, { name: G, role: 'supervisor', email: 'ghaith@example.com' }]);
  put('clinics', clinics);
  put('products', products);
  put('benchmarks', { coverage: 70, priority: 90, conversion: 25, tasks: 85 });
  put('categoryGuides', {});
  put('rxTypes', { rev: 1, types: [{ id: 'ultramed', name: 'Ultramed fast moving products', active: true }, { id: 'tepe', name: 'Tepe prescription', active: true }] });
  // the daily backups of the last twelve days (never read at start since v119)
  for(let i = 1; i <= 12; i++){
    const d = shiftDay(TODAY, -i);
    docs['snap_' + d] = JSON.stringify({ clinics, products, visits: live.filter(v => v.date <= d), tasks, erpIndex: split.index, ts: d + 'T07:00:00.000Z' });
  }

  const bytes = {}; Object.keys(docs).forEach(k => { const g = k.replace(/:.*$/, ':*').replace(/^snap_.*/, 'snap_*'); bytes[g] = (bytes[g] || 0) + docs[k].length; });
  return {
    docs, people: { [M]: 'rep', [R]: 'rep', [G]: 'supervisor' }, salesman: SALESMAN, today: TODAY, now: NOW, scale,
    // the in-memory picture the app should arrive at (for the harness's own checks)
    data: { today: TODAY, targets, erpSales, clinics, erpMap, visits, tasks, events, dayPlans },
    counts: { clinics: clinics.length, doctors: clinics.reduce((s, c) => s + c.doctors.length, 0), visits: visits.length, liveVisits: live.length,
      archMonths: ARCH_MONTHS.length, salesFiles: periods.length, salesLines: periods.reduce((s, p) => s + p.rows.length, 0), salesChunks: Object.keys(split.docs).length,
      tasks: tasks.length, planDays: Object.keys(dayPlans).length, events: events.length, chat: chat.length, memories: memories.length, products: products.length,
      photoMarks: visits.filter(v => v.photos).length, binClinics: binClinics.length, binVisits: binVisits.length, backups: 12, docs: Object.keys(docs).length },
    bytes,
  };
}
module.exports = { build, PEOPLE, SALESMAN, TODAY, NOW };
