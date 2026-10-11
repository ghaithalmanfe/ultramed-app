// The Clinics screen's ERP card against the Today figure (v115). The owner saw
// one figure on the Clinics dashboard and another on the Today screen. The
// card now reads the month figure's own lines (the files that overlap the
// month, lines dated in the month, returns of an earlier month's invoice
// counted in that month) and says on screen how it adds up to the Today
// figure: clinics + online / channels + ignored accounts = each person's month.
// Port 8214.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8214;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const cloud = {};
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const G = 'Dr. Ghaith', M = 'Mariam', R = 'Renova', GS = 'Ghaith Al Manfe', MS = 'Mariam Zohair', RS = 'Renova Ayman';
const row = (d, doc, cust, net, sm) => [d, doc, 0, 'Intensiv Ortho-Strips', 1, net, net, 0, sm, 'Intensiv', cust, 'Clinics', 0, ''];
const ret = (d, doc, cust, net, sm, ref) => [d, doc, 1, 'Intensiv Ortho-Strips', -1, 0, net, -net, sm, 'Intensiv', cust, 'Clinics', 0, ref];
// A file that runs from mid-September into October, then an October file.
const SEPOCT = [row('2026-09-20','SINV8001','Dental 8 Clinic',100,MS), row('2026-09-25','SINV8002','Meena Dental',70,RS),
  row('2026-10-01','SINV8003','My Fatoorah',12,MS), row('2026-10-02','SINV8004','Dental 8 Clinic',40,MS)];
const OCT = [row('2026-10-05','SINV8101','Dental 8 Clinic',25,MS), row('2026-10-06','SINV8102','Meena Dental',30,RS),
  row('2026-10-06','SINV8103','Marketing Philips',5,MS), row('2026-10-06','SINV8104','Unknown Trading Co',9,MS),
  row('2026-10-05','SINV8105','Bayan Dental Center',50,GS),
  ret('2026-10-07','SRET8106','Dental 8 Clinic',-20,MS,'SINV8001')];   // returns September's invoice: counted in September
const repMap = { [GS]: G, [MS]: M, [RS]: R };
const sum = rows => Math.round(rows.reduce((s, r) => s + r[6], 0) * 1000) / 1000;
const split = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: repMap,
  seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true },
  periods: [
    { id: 'sepoct', from: '2026-09-15', to: '2026-10-03', net: sum(SEPOCT), rowCount: SEPOCT.length, importedAt: '2026-10-04T08:00:00.000Z', repMap, rev: 1, rows: SEPOCT },
    { id: 'oct', from: '2026-10-04', to: '2026-10-08', net: sum(OCT), rowCount: OCT.length, importedAt: '2026-10-08T08:00:00.000Z', repMap, rev: 1, rows: OCT }] });
function seed(o = {}){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.erpSales = JSON.stringify(split.index);
  Object.keys(split.docs).forEach(k => { cloud[k] = JSON.stringify(split.docs[k]); });
  cloud.erpMap = JSON.stringify({ 'Marketing Philips': '@ignore' });
  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:R, role:'rep', email:'r@x.com'}, Object.assign({name:G, role:'supervisor', email:'g@x.com'}, o.gSells === false ? { sells: false } : {})]); // he sells (no target)
  cloud.clinics = JSON.stringify([
    {id:'m1', name:'Dental 8 Clinic', rep:M, cls:'A', doctors:[]},
    {id:'m2', name:'Bright Smile Clinic', rep:M, cls:'B', doctors:[]},
    {id:'r1', name:'Meena Dental', rep:R, cls:'B', doctors:[]},
    {id:'g1', name:'Bayan Dental Center', rep:G, cls:'A', doctors:[]}]);
  cloud.targets = JSON.stringify(Object.assign({ [M]: { revenue: 1000, month: '2026-10' }, [R]: { revenue: 1000, month: '2026-10' } }, o.targets || {}));
  // an order typed in a visit: the "logged" figure must never read as invoiced sales
  cloud.visits = JSON.stringify([{ id: 'v1', clinicId: 'm1', rep: M, date: '2026-10-05', orderTaken: true, orderTotal: 500, orders: [{ total: 500, items: [] }] }]);
}
const kd = s => { const m = String(s || '').replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*KD/); return m ? +m[1] : null; };

(async()=>{
  const server = http.createServer((req,res)=>{
    const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
  });
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: '+m.text()); });
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
  await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
  await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(() => {
    window.storage = {
      get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.__cSet(k, v),
      setMany: async entries => window.__cSetMany(entries),
      delete: async k => window.__cDel(k),
      list: async p => ({ keys: await window.__cList(p) }),
    };
    let at = null; try{ at = localStorage.getItem('__h_now'); }catch(e){}
    const off = (at ? new Date(at).getTime() : new Date(2026, 9, 8, 10, 0, 0).getTime()) - Date.now();   // 8 Oct 2026, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async (who, role, local) => {
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(150);
    await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local || null);
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };
  // The Clinics dashboard for one rep filter: the ERP card's tiles, its list and its reconciliation.
  const clinicsCard = rep => page.evaluate(async rep => {
    switchView('clinics'); if(rep) setClinicRepFilter(rep); setClinicMode('dash'); erpDashTab = 'bought'; renderClinicDash();
    await new Promise(r => setTimeout(r, 60));
    const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    const card = [...document.querySelectorAll('#clinicDash .chartcard')].find(c => /Customer sales|مبيعات العملاء/.test(c.innerText));
    const tiles = card ? [...card.querySelectorAll('.kpi4 .k')].map(k => ({ n: txt(k.querySelector('.kn')), l: txt(k.querySelector('.kl')) })) : [];
    const rec = document.getElementById('erpDashRecon');
    const part = p => { const e = rec && rec.querySelector(`[data-part="${p}"]`); return e ? txt(e) : null; };
    const list = [...document.querySelectorAll('#clinicDash .clinic-name')].map(e => ({ name: txt(e), row: txt(e.closest('.card')) }));
    const top = [...document.querySelectorAll('#clinicDash > .kpi4 .k')].map(k => txt(k));
    return { sub: card ? txt(card.querySelector('.csub')) : '', tiles, rec: txt(rec), parts: { clinics: part('clinics'), channels: part('channels'), ignored: part('ignored'), total: part('total') },
      people: rec ? [...rec.querySelectorAll('[data-person]')].map(e => ({ rep: e.dataset.person, t: txt(e) })) : [], team: part('team'), list, top, filter: clinicRepFilter };
  }, rep || null);
  const today = () => page.evaluate(() => { renderToday(); return document.getElementById('targetCard').innerText.replace(/\s+/g, ' '); });
  const ach = () => page.evaluate(() => { const d = digestData(); return { m: UMCore.monthAchievement('Mariam', d).amount, r: UMCore.monthAchievement('Renova', d).amount, g: UMCore.monthAchievement('Dr. Ghaith', d).amount }; });
  const tileKD = (c, re) => { const t = c.tiles.find(x => re.test(x.l)); return t ? (kd(t.l) != null ? kd(t.l) : kd(t.n)) : null; };

  seed();
  await boot(G, 'supervisor');
  const a = await ach();
  check('fixture: October figures — Mariam 91 (65 at Dental 8 + 9 unlinked + 12 online + 5 ignored), Renova 30, Dr. Ghaith 50', a.m === 91 && a.r === 30 && a.g === 50, a);
  const tdy = await today();
  check('Today card: Mariam 91.00 KD of 1000.00 KD, Renova 30.00 KD, Team 121.00 KD (only people with a target)', /Mariam \d+% 91\.00 KD of 1000\.00 KD/.test(tdy) && /Renova \d+% 30\.00 KD of 1000\.00 KD/.test(tdy) && /121\.00 KD of 2000\.00 KD/.test(tdy), tdy.slice(0, 400));

  // ---- one rep: the card adds up to her Today figure ----
  let c = await clinicsCard(M);
  const bought = tileKD(c, /^Bought/), chan = tileKD(c, /Online \/ channels/), ign = kd(c.parts.ignored) || 0;
  check('REPRO: Clinics card for Mariam — Bought + online / channels + ignored = her Today figure (91)', bought != null && chan != null && Math.round((bought + chan + ign) * 100) / 100 === 91, { bought, chan, ign, tiles: c.tiles });
  const d8 = c.list.find(x => /^Dental 8 Clinic/.test(x.name));
  check('REPRO: Dental 8 Clinic shows October only: 65.00 KD (no September invoice, no return of a September invoice)', !!d8 && kd(d8.row) === 65, d8);
  check('the card says which days it reads: this month, sales files to Oct 8 (as the Today card)', /This month/.test(c.sub) && /sales files to Oct 8/.test(c.sub), c.sub);
  check('reconciliation: clinics 74 + online / channels 12 + ignored accounts 5', kd(c.parts.clinics) === 74 && kd(c.parts.channels) === 12 && kd(c.parts.ignored) === 5, c.parts);
  check('reconciliation total: 91.00 KD — the same figure as the Today screen', kd(c.parts.total) === 91 && /Today screen/.test(c.parts.total || ''), c.parts.total);
  check('the Bought tile is the clinics line of the reconciliation (74.00 KD, 2 accounts)', bought === 74 && c.tiles.some(t => /^Bought/.test(t.l) && t.n === '2'), c.tiles);
  check('the order typed in a visit is not called sales: the top tile says it is logged in visits', !c.top.some(t => /Total sales/.test(t)) && c.top.some(t => /500\.00 KD/.test(t) && /logged in visits/i.test(t)), c.top);
  // ---- everyone ----
  c = await clinicsCard('all');
  check('all: clinics 154 + online / channels 12 + ignored 5 = 171', kd(c.parts.clinics) === 154 && kd(c.parts.channels) === 12 && kd(c.parts.ignored) === 5 && kd(c.parts.total) === 171, c.parts);
  const pp = Object.fromEntries(c.people.map(x => [x.rep, kd(x.t)]));
  check('all: each person as on the Today screen — Mariam 91, Renova 30, Dr. Ghaith 50', pp[M] === 91 && pp[R] === 30 && pp[G] === 50, c.people);
  check('all: says the Team line on the Today screen counts only team members with a sales target (121.00 KD)', /121\.00 KD/.test(c.team || '') && /team members with a sales target/.test(c.team || ''), c.team);
  check('all: Dr. Ghaith (no sales target) — says only that the Today screen has no sales figure for him', /no sales target — no sales figure on the Today screen/.test((c.people.find(x => x.rep === G) || {}).t || ''), c.people);
  // a figure that would not match the Today screen is said, never claimed equal
  const offc = await page.evaluate(() => { const real = UMCore.monthAchievement; UMCore.monthAchievement = (...a) => { const b = real(...a); return Object.assign({}, b, { amount: b.amount + 1 }); };
    try{ setClinicRepFilter('Mariam'); renderClinicDash(); return bestMonthRevenue('Mariam').amount + ' | ' + document.getElementById('erpDashRecon').innerText.replace(/\s+/g, ' '); } finally { UMCore.monthAchievement = real; } });
  check('a figure that differs from the Today screen is said, never claimed equal', /The Today screen shows 92\.00 KD/.test(offc) && /please report this difference/.test(offc) && !/the Today screen figure/.test(offc), offc);
  // ---- a rep sees her own ----
  await boot(M, 'rep');
  c = await clinicsCard();
  check('as Mariam: her card adds up to 91.00 KD, her Today figure', c.filter === M && kd(c.parts.total) === 91 && kd(c.parts.clinics) === 74, { filter: c.filter, parts: c.parts });
  check('as Mariam: no one else\'s figure in her reconciliation', !/Renova|Dr\. Ghaith/.test(c.rec), c.rec);
  // ---- management report: the buyers table reads the same month ----
  await boot(G, 'supervisor');
  const mr = await page.evaluate(() => { reportRepFilter = 'Mariam'; const html = buildMasterReportBody('en', 'full'); const m = html.match(/<td>Dental 8 Clinic<\/td><td>Mariam<\/td><td><span class="num">(\d+)<\/span><\/td><td>([^<]+)</); return m ? { inv: +m[1], val: m[2] } : null; });
  check('management report: Dental 8 Clinic in "Accounts that bought" = 65.00 (October only)', !!mr && /65\.00/.test(mr.val), mr);
  // ---- the DSR gives the targets and their brand split only (owner's rule): its achieved column is never shown ----
  const dsr = await page.evaluate(async () => { const keep = JSON.stringify(targets); const realPersist = window.persist; window.persist = async () => true;
    try{ await applyTargetsFile({ targets: { Renova: { revenue: 1000, achieved: 777.77, achievedAsOf: '2026-10-07', brands: { Intensiv: 600, Tepe: 400 } } },
      matched: [{ rep: 'Renova', name: 'Ranova Ayman', revenue: 1000, achieved: 777.77, brandCount: 2 }], unmatched: [] });
      return document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); }
    finally { window.persist = realPersist; targets = JSON.parse(keep); try{ closeModal(); }catch(e){} } });
  check('DSR upload sheet: target and brand targets only — the DSR\'s own achieved (777.77) is not shown, and it says achieved comes from ERP', !/777\.77/.test(dsr) && /1000\.00 KD/.test(dsr) && /2 brand targets/.test(dsr) && /Achieved always comes from the ERP sales files/.test(dsr), dsr.slice(0, 600));
  // ---- Arabic ----
  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  c = await clinicsCard(M);
  check('Arabic: the reconciliation is translated (مبيعات الشهر … شاشة اليوم)', /مبيعات الشهر/.test(c.rec) && /شاشة اليوم/.test(c.rec) && /متجاهَلة/.test(c.rec), c.rec);
  // ---- early in a month with no sales file yet: the last month with a file, said so ----
  await boot(G, 'supervisor', { __h_now: '2026-11-03T10:00:00' });
  c = await clinicsCard(M);
  check('3 Nov, no November file: the card shows October and says why', /October 2026/.test(c.sub) && /the last month with a sales file/.test(c.sub) && /No sales file for this month yet: the Today screen shows 0/.test(c.rec), { sub: c.sub, rec: c.rec });
  check('3 Nov: the reconciliation is October\'s figure (91.00 KD), not the Today figure', kd(c.parts.total) === 91 && /October/.test(c.parts.total || '') && !/Today screen/.test(c.parts.total || ''), c.parts.total);
  c = await clinicsCard('all');
  check('3 Nov, everyone: October per person, each checked against the Months report', kd(c.parts.total) === 171 && /Each person's figure is the one in the Months report/.test(c.rec) && !/Today screen/.test(c.parts.total || '') && !c.team, { total: c.parts.total, team: c.team, rec: c.rec.slice(0, 300) });
  const nov = await today();
  check('3 Nov: the Today card shows 0.00 KD for Mariam (no file for this month yet)', /Mariam \d+% 0\.00 KD of 1000\.00 KD/.test(nov), nov.slice(0, 300));
  c = await clinicsCard(G);
  check('3 Nov, Dr. Ghaith (no sales target): "no sales file yet", never "the Today screen shows 0"', /No sales file for this month yet\./.test(c.rec) && !/shows 0/.test(c.rec), c.rec.slice(-260));
  // ---- someone the files still credit but who is off the team list (Also sells off, target kept) ----
  seed({ gSells: false, targets: { [G]: { revenue: 500, month: '2026-10' } } });
  await boot(G, 'supervisor');
  c = await clinicsCard('all');
  const gRow = (c.people.find(x => x.rep === G) || {}).t || '';
  check('off the team list: his 50 KD is listed and said to be off the Today screen; no "each as on the Today screen"', kd(gRow) === 50 && /not on the team list — not on the Today screen/.test(gRow) && !/Each person's figure/.test(c.rec), { gRow, rec: c.rec.slice(0, 400) });
  check('off the team list: the Team note names team members (121.00 KD), not a missing target', /team members with a sales target: 121\.00 KD/.test(c.team || ''), c.team);
  const t2 = await today();
  check('off the team list: the Today card does not list him', !/Dr\. Ghaith/.test(t2) && /121\.00 KD of 2000\.00 KD/.test(t2), t2.slice(0, 300));
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
