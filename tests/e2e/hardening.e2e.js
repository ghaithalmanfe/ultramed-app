// v80 hardening checks in a real browser against the worktree build.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, salesFixture } = require('./_env.js');
const PORT = 8177;
const SALES_B64 = fs.readFileSync(salesFixture()).toString('base64');
const SEED = JSON.parse(fs.readFileSync(WWW + '/sales-seed-aug26.json', 'utf8'));
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});
const cloud = {};
const mode = { failSet: null, failGet: null, sets: [], gets: [] };
const api = {
  get: async k => { mode.gets.push(k); if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { mode.sets.push(k); if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set'); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  // atomic like a Firestore batch: refuse everything if any key is set to fail
  setMany: async entries => { entries.forEach(([k]) => mode.sets.push(k)); if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); if(mode.delaySetMs) await new Promise(r => setTimeout(r, mode.delaySetMs)); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,400):'')); if(!ok) failed++; }

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext();
  await ctx.route('**/gstatic.com/**', r => r.abort());
  const page = await ctx.newPage();
  const errors = []; const dialogs = [];
  let acceptDialogs = false;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|boom-(set|get)|rows unreadable|save failed/i.test(m.text())) errors.push('console: '+m.text()); });
  page.on('dialog', async d => { dialogs.push(d.message()); if(acceptDialogs) await d.accept(); else await d.dismiss(); });
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
  });
  const boot = async (who='Dr. Ghaith', role='supervisor') => {
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(300);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };
  const state = () => page.evaluate(() => ({
    periods: erpPeriods().map(p => ({ id: p.id, from: p.from, to: p.to, rows: (p.rows||[]).length, missing: !!p.rowsMissing })),
    broken: _erpBroken.slice(), dirty: _erpDirty, loadFailed: !!_loadFailed.erpSales,
    nudge: (document.getElementById('erpNudge')||{}).innerText || '',
    pill: (document.getElementById('erpDirtyPill')||{}).textContent || '',
    status: (document.getElementById('erpStatus')||{}).textContent || '',
    modal: (document.getElementById('modalInner')||{}).innerText || '',
    target: (document.getElementById('targetCard')||{}).innerText || '',
    mirrorBytes: (localStorage.getItem('um_mirror:erpSales')||'').length,
  }));
  const importFile = () => page.evaluate(async (b64) => {
    const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer;
    openErpImport();
    await erpImportXlsx(buf, 'Ultramed_Sales3_28.xlsx');
    await new Promise(r => setTimeout(r, 300));
  }, SALES_B64);
  const cloudKeys = () => Object.keys(cloud).filter(k => /^erp/.test(k)).sort();

  // ---------- setup: legacy account + a September DSR whose as-of is 14/9 ----------
  cloud.clinics = JSON.stringify([{id:'c1',name:'Dental 8 Clinic',rep:'Mariam',cls:'A'},{id:'c2',name:'Crown Dental Center',rep:'Renova',cls:'A'}]);
  cloud.erpSales = JSON.stringify({ periods: [{ id:'seed_sales3_aug26', from: SEED.from, to: SEED.to, net: SEED.net, rowCount: SEED.rowCount, repMap: SEED.repMap, rows: SEED.rows }],
    repMapGlobal: SEED.repMap, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud.targets = JSON.stringify({ Mariam: { revenue: 10000, achieved: 3000, achievedAsOf: '2026-09-14' }, Renova: { revenue: 12000, achieved: 4000, achievedAsOf: '2026-09-14' } });
  // returns booked as in the ERP file, so the expectation below is a plain sum
  cloud.erpSales = JSON.stringify(Object.assign(JSON.parse(cloud.erpSales), { returnPolicy: 'erp' }));
  await boot();
  let s = await state();
  check('Today card names its source and as-of date', /Source: DSR/.test(s.target) && /as of/.test(s.target), s.target.split('\n').slice(0,6));
  const pctBefore = await page.evaluate(() => targetPctMap());
  // Independent expectation straight from the xlsx: the DSR basis is EVERY
  // line of the rep's salesman (all customers, channels included), net.
  const core = require(WWW + '/js/core.js');
  const sheets = await core.readXlsx(Buffer.from(SALES_B64, 'base64'));
  const toCsv = rows => rows.map(r => (r||[]).map(v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(',')).join('\n');
  const fileRows = core.parseErpCsv(toCsv(sheets[0].rows)).rows;
  const after14 = sm => Math.round(fileRows.filter(r => r.salesman === sm && r.date > '2026-09-14').reduce((t, r) => t + r.net, 0) * 100) / 100;
  const expected = { Mariam: Math.round((3000 + after14('Mariam Zohair')) * 100) / 100, Renova: Math.round((4000 + after14('Ranova Ayman Mohammed')) * 100) / 100 };

  // ---------- 1) import → Today moves, and the note says before → after ----------
  await importFile();
  s = await state();
  const pctAfter = await page.evaluate(() => targetPctMap());
  check('Sep file saved (2 periods)', s.periods.length===2 && s.periods[1].rows===146, s.periods);
  check('Today % moved after the upload (DSR 14/9 + invoices 15–21/9)', pctAfter.Mariam.pct > pctBefore.Mariam.pct && /DSR .* \+ ERP/.test(pctAfter.Mariam.src), { before: pctBefore, after: pctAfter });
  check('achieved = DSR + EVERY invoice line after the DSR date (channels included), to the cent', pctAfter.Mariam.amount===expected.Mariam && pctAfter.Renova.amount===expected.Renova, { shown: { Mariam: pctAfter.Mariam.amount, Renova: pctAfter.Renova.amount }, expected });
  const brandChk = await page.evaluate(() => { const b = erpBrandMtd('Renova'); const sum = Object.values(b.byBrand).reduce((a, x) => a + x, 0); return { sum: Math.round(sum * 100) / 100, mtd: erpMtdMap().Renova.amount, brands: Object.keys(b.byBrand) }; });
  check('brand MTD rows sum exactly to the rep\'s headline MTD (same basis)', Math.abs(brandChk.sum - brandChk.mtd) < 0.01, brandChk);

  // ---------- 1b) team total % everywhere target figures appear ----------
  const expTeamPct = Math.round((pctAfter.Mariam.amount + pctAfter.Renova.amount) / 22000 * 100);
  check('upload note carries the team total', /الفريق/.test(s.modal) && new RegExp('الفريق: \\d+% → ' + expTeamPct + '%').test(s.modal), s.modal.split('\n').filter(l=>/الفريق/.test(l)));
  const team = await page.evaluate(() => {
    const grab = () => (document.getElementById('modalInner')||{}).innerText || '';
    const out = { tt: teamTargetNow(), today: (document.getElementById('targetCard')||{}).innerText || '' };
    try{ closeModal(); renderMonthClose('2026-09'); out.month = grab(); closeModal(); }catch(e){ out.month = 'ERR ' + e.message; }
    try{ switchView('reports'); out.cmp = (document.getElementById('teamCompareCard')||{}).innerText || ''; out.sc = (document.getElementById('scorecards')||{}).innerText || ''; switchView('today'); }catch(e){ out.cmp = 'ERR ' + e.message; }
    try{ const cover = buildMasterReportBody('en', 'full'); out.cover = (cover.match(/Achieved sales[^<]*<span class="num">(\d+)%<\/span> of target/) || [])[1] || null; }catch(e){ out.cover = 'ERR ' + e.message; }
    return out;
  });
  check('teamTargetNow = sum achieved ÷ sum target', team.tt.goal===22000 && team.tt.pct===expTeamPct && team.tt.n===2, team.tt);
  check('Today card shows the Team row with that %', /Team/.test(team.today) && new RegExp('\\b' + expTeamPct + '%').test(team.today) && /2 reps/.test(team.today), team.today.split('\n').slice(-3));
  check('month report shows the team card with that %', /نسبة تحقيق الفريق/.test(team.month) && new RegExp(expTeamPct + '%').test(team.month), team.month.split('\n').slice(0,8));
  check('reports: team comparison has a Team row with that %', /Team/.test(team.cmp) && new RegExp(expTeamPct + '%').test(team.cmp), team.cmp.split('\n').slice(-4));
  check('reports: scorecards end with the Team target card', /Team · \w+ target/.test(team.sc) && new RegExp(expTeamPct + '%').test(team.sc), team.sc.split('\n').slice(-6));
  check('PDF cover: achieved sales KPI states the % of target', team.cover === String(expTeamPct), { cover: team.cover, expTeamPct });
  check('import note on the report modal shows the Today % before → after', /شاشة اليوم الآن/.test(s.modal) && new RegExp(pctBefore.Mariam.pct + '% → ' + pctAfter.Mariam.pct + '%').test(s.modal), s.modal.split('\n').slice(0,4));
  check('Today card source now says DSR + ERP', /DSR .* \+ ERP/.test(s.target), s.target.split('\n').slice(0,6));
  check('cloud index carries savedAt and is small', !!JSON.parse(cloud.erpSales).savedAt && cloud.erpSales.length < 3000, { bytes: cloud.erpSales.length });

  // ---------- 2) DSR file name sanity ----------
  const dsrDates = await page.evaluate(() => [dsrDateFromName('DSR 2026-09-21.xlsx'), dsrDateFromName('DSR_21.09.26.xlsx'), dsrDateFromName('DSR_21.09.27.xlsx'), dsrDateFromName('DSR_01.01.26.xlsx'), dsrDateFromName('DSR.xlsx')]);
  check('DSR as-of from file name: iso ok, dmy ok, future → null, 8 months old → null', JSON.stringify(dsrDates)===JSON.stringify(['2026-09-21','2026-09-21',null,null,null]), dsrDates);

  // ---------- 3) older file after newer → asks, dismiss = cancelled ----------
  // craft an older cumulative CSV (Sep 1–10, Mariam only) and push it through the auto path
  const olderCsv = 'Date,Type,Invoice#,Account,Customer Class,Product,Quantity,Sales Gross,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name\n2026-09-03,SalesInvoice,SINVOLD1,Dental 8 Clinic,Clinics,P,1,100,0,0,100,TEPE,Mariam Zohair\n';
  dialogs.length = 0;
  const beforeOld = await state();
  await page.evaluate(async (csv) => { openErpImport(); await erpAutoImport(csv); }, olderCsv);
  s = await state();
  check('an older file than what is stored asks first; dismissed → nothing changes', dialogs.length===1 && /أقدم/.test(s.status) && JSON.stringify(s.periods)===JSON.stringify(beforeOld.periods), { dialogs, status: s.status });
  acceptDialogs = true; dialogs.length = 0;
  await page.evaluate(async (csv) => { openErpImport(); await erpAutoImport(csv); }, olderCsv);
  s = await state();
  check('…accepted → the older file replaces Mariam\'s rows (Renova\'s stay)', dialogs.length===1 && s.periods.length===3 && s.periods.some(p=>p.rows===1), s.periods);
  acceptDialogs = false;
  await importFile(); s = await state();
  check('re-uploading the full Sep file restores the 146-line period', s.periods.length===2 && s.periods.some(p=>p.rows===146), s.periods);

  // ---------- 4) double upload guard ----------
  const dbl = await page.evaluate(async (b64) => {
    const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer;
    openErpImport();
    const a = erpImportXlsx(buf, 'Ultramed_Sales3_28.xlsx');
    await new Promise(r => setTimeout(r, 30));
    const b = erpImportXlsx(buf.slice(0), 'Ultramed_Sales3_28.xlsx');
    await Promise.all([a, b]);
    await new Promise(r => setTimeout(r, 300));
    return { periods: erpPeriods().length, keys: null };
  }, SALES_B64);
  s = await state();
  const refKeys = () => JSON.parse(cloud.erpSales).periods.map(p => p.rowsRef && p.rowsRef.key);
  check('two overlapping uploads at once → still exactly 2 periods, the index references one Sep chunk (present)', dbl.periods===2 && refKeys().length===2 && refKeys().every(k => (k + ':0') in cloud), { periods: dbl.periods, refs: refKeys() });

  // ---------- 5) unreadable rows at boot with no mirror → warning card + retry, saving still allowed for other periods ----------
  await page.evaluate(() => localStorage.removeItem('um_mirror:erpSales'));
  mode.failGet = /^erpRows:seed_/;
  await boot(); s = await state();
  check('August chunks unreadable → period listed as missing, warning card with retry, September intact', s.broken.length===1 && s.periods.find(p=>p.id==='seed_sales3_aug26').missing && s.periods.find(p=>p.rows===146) && /لم تُحمَّل/.test(s.nudge) && !s.loadFailed, { broken: s.broken, nudge: s.nudge.slice(0,80) });
  const idxBefore = JSON.parse(cloud.erpSales);
  const okSave = await page.evaluate(async () => { erpSales.returnPolicy = 'erp'; return persist('erpSales'); });
  const idxAfter = JSON.parse(cloud.erpSales);
  check('a save while August rows are missing keeps August\'s stored reference untouched and its chunks in the cloud', okSave && JSON.stringify(idxAfter.periods.find(p=>p.id==='seed_sales3_aug26').rowsRef)===JSON.stringify(idxBefore.periods.find(p=>p.id==='seed_sales3_aug26').rowsRef) && cloudKeys().some(k=>/^erpRows:seed_/.test(k)), { ref: idxAfter.periods[0].rowsRef });
  mode.failGet = null;
  const retried = await page.evaluate(() => retryErpRows());
  s = await state();
  check('retry button reloads the rows and clears the warning', retried && s.broken.length===0 && s.periods.every(p=>p.rows>0) && !/لم تُحمَّل/.test(s.nudge), s.periods);

  // ---------- 6) small edit fails to save → red pill, tap retries ----------
  mode.failSet = /^erpSales$/;
  await page.evaluate(() => setReturnPolicy('origin'));
  await page.waitForTimeout(200);
  s = await state();
  check('return-policy change that could not be saved shows the unsaved pill', s.dirty && /غير محفوظة/.test(s.pill), s.pill);
  mode.failSet = null;
  await page.evaluate(() => document.getElementById('erpDirtyPill').click());
  await page.waitForTimeout(400);
  s = await state();
  check('tapping the pill retries and clears it', !s.dirty && s.pill==='' && JSON.parse(cloud.erpSales).returnPolicy==='origin', { pill: s.pill, policy: JSON.parse(cloud.erpSales).returnPolicy });

  // ---------- 7) index unreadable at boot and no mirror → everything refused, banner says so ----------
  await page.evaluate(() => localStorage.removeItem('um_mirror:erpSales'));
  mode.failGet = /^erpSales$/;
  await boot(); s = await state();
  const refused = await page.evaluate(async () => !(await persist('erpSales')));
  check('index unreadable (no mirror) → banner, save refused, nothing written', s.loadFailed && /لم تُحمَّل من السحابة/.test(s.nudge) && refused && JSON.parse(cloud.erpSales).periods.length===2, { nudge: s.nudge.slice(0,60) });
  mode.failGet = null;

  // ---------- 8) mirror survives a quota failure by shrinking ----------
  await boot();
  const mirror = await page.evaluate(() => {
    const orig = localStorage.setItem.bind(localStorage); let calls = 0;
    localStorage.setItem = (k, v) => { calls++; if(k==='um_mirror:erpSales' && v.length > 20000) throw new Error('QuotaExceededError'); return orig(k, v); };
    const ok = erpMirrorSave(erpSales);
    localStorage.setItem = orig;
    const m = JSON.parse(localStorage.getItem('um_mirror:erpSales'));
    return { ok, calls, bytes: JSON.stringify(m).length, periods: m.periods.map(p => (p.rows||[]).length) };
  });
  check('mirror falls back to a smaller copy instead of vanishing when storage is full', mirror.ok && mirror.bytes <= 20000, mirror);

  // ---------- 9) two devices imported overlapping Sep files ----------
  const mkRow = (d, sm, net) => [d, 'X' + d + sm, 0, 'P', 1, net, net, 0, sm, 'TEPE', 'Dental 8 Clinic', 'Clinics', 0, ''];
  const mtdBase = await page.evaluate(() => erpMtdMap());
  // (a) the other device's file is OLDER than ours → it must lose entirely
  let idx = JSON.parse(cloud.erpSales);
  cloud['erpRows:dev2old:1:0'] = JSON.stringify([mkRow('2026-09-10', 'Mariam Zohair', 999)]);
  idx.periods.push({ id: 'dev2old', from: '2026-09-02', to: '2026-09-21', net: 999, rowCount: 1, importedAt: '2026-09-20T00:00:00.000Z', rev: 1, repMap: { 'Mariam Zohair': 'Mariam' }, rowsRef: { key: 'erpRows:dev2old:1', chunks: 1, count: 1 } });
  cloud.erpSales = JSON.stringify(idx);
  await page.evaluate(() => setReturnPolicy('origin'));
  await page.waitForTimeout(300);
  s = await state();
  let mtdNow = await page.evaluate(() => erpMtdMap());
  check('older overlapping file from another device is tombstoned, MTD unchanged', !s.periods.some(p=>p.id==='dev2old') && !!JSON.parse(cloud.erpSales).removed.dev2old && JSON.stringify(mtdNow)===JSON.stringify(mtdBase), { periods: s.periods.map(p=>p.id), mtd: mtdNow });
  // (b) the other device's file is NEWER → our Sep period loses Mariam's rows to it
  idx = JSON.parse(cloud.erpSales);
  cloud['erpRows:dev2new:1:0'] = JSON.stringify([mkRow('2026-09-10', 'Mariam Zohair', 500)]);
  idx.periods.push({ id: 'dev2new', from: '2026-09-01', to: '2026-09-21', net: 500, rowCount: 1, importedAt: '2027-01-01T00:00:00.000Z', rev: 1, repMap: { 'Mariam Zohair': 'Mariam' }, rowsRef: { key: 'erpRows:dev2new:1', chunks: 1, count: 1 } });
  cloud.erpSales = JSON.stringify(idx);
  await page.evaluate(() => setReturnPolicy('erp'));
  await page.waitForTimeout(300);
  s = await state();
  mtdNow = await page.evaluate(() => erpMtdMap());
  const sepLocal = await page.evaluate(() => { const p = erpPeriods().find(x => x.from >= '2026-09-01' && x.id !== 'dev2new'); return p && { rows: p.rows.length, salesmen: [...new Set(p.rows.map(r => r[8]))] }; });
  check('newer overlapping file from another device wins Mariam\'s days; our period keeps only Renova', s.periods.some(p=>p.id==='dev2new') && sepLocal && sepLocal.salesmen.length===1 && sepLocal.salesmen[0]==='Ranova Ayman Mohammed' && mtdNow.Mariam.amount===500, { sepLocal, mtd: mtdNow });
  await page.evaluate(() => setReturnPolicy('origin')); await page.waitForTimeout(300); // same policy as the baseline
  await importFile(); s = await state(); // our fresh upload is now the newest → takes the month back
  mtdNow = await page.evaluate(() => erpMtdMap());
  check('re-uploading our file (newest import) takes the month back and tombstones the other device\'s file', !s.periods.some(p=>p.id==='dev2new') && JSON.stringify(mtdNow)===JSON.stringify(mtdBase), { periods: s.periods.map(p=>p.id), mtd: mtdNow });

  // ---------- 10) commit lands AFTER the app gave up: screen follows the cloud, re-upload never duplicates ----------
  await page.evaluate(() => { ERP_WRITE_MS = 300; });
  mode.delaySetMs = 1200;
  const before10 = await state();
  await importFile();
  s = await state();
  check('slow commit → ❌ and rollback while the app waits', /❌/.test(s.status) && JSON.stringify(s.periods)===JSON.stringify(before10.periods), s.status);
  await page.waitForTimeout(1800);
  mode.delaySetMs = 0;
  s = await state();
  const sepCount = () => JSON.parse(cloud.erpSales).periods.filter(p => p.from >= '2026-09-01').length;
  check('…the late commit lands → screen re-reads the cloud (one Sep period, no duplicate)', s.periods.length===2 && sepCount()===1 && s.periods.some(p=>p.rows===146), { periods: s.periods, sep: sepCount() });
  await importFile(); s = await state();
  check('…and a re-upload after that still yields exactly one Sep period', s.periods.length===2 && sepCount()===1, { periods: s.periods.map(p=>p.id), sep: sepCount() });
  await page.evaluate(() => { ERP_WRITE_MS = 45000; });

  // ---------- 11) two-phase orphan deletion ----------
  const orph = JSON.parse(cloud.erpSales).orphans || {};
  const orphanKeys = Object.keys(orph);
  check('replaced chunks are recorded as orphans and still present in the cloud', orphanKeys.length>0 && orphanKeys.every(k => k in cloud), { orphans: orphanKeys.length });
  await page.evaluate(() => { Object.keys(erpSales.orphans||{}).forEach(k => { erpSales.orphans[k] = Date.now() - 8*24*3600000; }); erpSales.returnPolicy = 'origin'; return persist('erpSales'); });
  await page.waitForTimeout(300);
  check('…and are deleted once the grace period has passed', orphanKeys.every(k => !(k in cloud)) && Object.keys(JSON.parse(cloud.erpSales).orphans||{}).length===0, { stillThere: orphanKeys.filter(k => k in cloud).length });

  // ---------- 12) doctors: one person, one record ----------
  // seed a clinic with duplicates + a visit pointing at the duplicate id
  cloud.clinics = JSON.stringify([
    {id:'c1',name:'Dental 8 Clinic',rep:'Mariam',cls:'A', doctors:[{id:'d1',name:'Dr. Ahmed'},{id:'d2',name:'dr ahmed',title:'Periodontist'},{id:'d3',name:'Dr. Sara'}]},
    {id:'c2',name:'Crown Dental Center',rep:'Renova',cls:'A'}]);
  cloud.visits = JSON.stringify([{id:'v1', clinicId:'c1', rep:'Mariam', date:'2026-09-15', ts: 1, doctorIds:['d2'], doctorId:'d2', products:[], orderTaken:false}]);
  await boot();
  const docs = await page.evaluate(() => {
    const c = clinics.find(x => x.id === 'c1');
    const v = visits.find(x => x.id === 'v1');
    return { names: c.doctors.map(d => d.name), title: c.doctors[0].title, visitDocs: v.doctorIds, cloudDocs: null };
  });
  check('duplicate doctor records collapse at boot (fields merged), the visit follows the survivor', JSON.stringify(docs.names)===JSON.stringify(['Dr. Ahmed','Dr. Sara']) && docs.title==='Periodontist' && JSON.stringify(docs.visitDocs)===JSON.stringify(['d1']), docs);
  check('…and the clean lists were written back to the cloud', JSON.parse(cloud.clinics).find(c=>c.id==='c1').doctors.length===2 && JSON.parse(cloud.visits)[0].doctorIds[0]==='d1', { cloudDoctors: JSON.parse(cloud.clinics).find(c=>c.id==='c1').doctors.map(d=>d.name) });
  const quick = await page.evaluate(async () => {
    switchView('log'); prepLogView('c1');
    openQuickAddDoctor('c1');
    document.getElementById('newDocName').value = 'Dr. Noor, DR AHMED / د. علي';
    await quickAddDoctorSave('c1');
    const c = clinics.find(x => x.id === 'c1');
    return { names: c.doctors.map(d => d.name), selected: selectedDoctorIds.slice(), chips: (document.getElementById('doctorPickChips')||{}).innerText || '' };
  });
  check('quick-add: three names in one box → two new doctors, the existing "Ahmed" reused, all three selected', JSON.stringify(quick.names)===JSON.stringify(['Dr. Ahmed','Dr. Sara','Dr. Noor','د. علي']) && quick.selected.length===3 && quick.selected.includes('d1'), quick);
  // a stale device that still has the old 3-record clinic saves it: the merge keeps the union without twins
  const stale = JSON.parse(cloud.clinics); stale.find(c=>c.id==='c1').doctors = [{id:'d1',name:'Dr. Ahmed'},{id:'d9',name:'Dr. Zain'}];
  const merged = await page.evaluate((staleList) => { const r = mergeById('clinics', staleList, JSON.parse(localStorage.getItem('um_mirror:clinics')||'[]')); return r.merged.find(c=>c.id==='c1').doctors.map(d=>d.name); }, stale);
  check('clinic merge unions doctors from both devices (by id, then by person) — nobody lost, nobody twice', merged.includes('Dr. Zain') && merged.includes('Dr. Noor') && merged.filter(n=>/ahmed/i.test(n)).length===1, merged);

  // ---------- 13) month rollover: targets are stamped with their month and flagged when stale ----------
  const stale2 = await page.evaluate(() => { targets.Mariam.month = '2026-08'; renderToday(); return { note: (document.getElementById('targetCard')||{}).innerText || '', nudge: (document.getElementById('erpNudge')||{}).innerText || '' }; });
  check('a target from an earlier month is flagged on the Today card and a month-inputs card asks for this month\'s DSR', /Target is from August 2026/.test(stale2.note) && /المدخلات الشهرية مطلوبة/.test(stale2.nudge), { note: stale2.note.split('\n').filter(l=>/Target is/.test(l)), nudge: stale2.nudge.slice(0,60) });

  check('no page errors', errors.length===0, errors.slice(0,5));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
