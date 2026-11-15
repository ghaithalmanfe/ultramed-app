// Phones (360 and 390 px), English and Arabic, the supervisor and a rep: every view and the sheets they open
// (the screenshot sweep's steps of the redesign's integration pass) — no page that pans sideways, no tap target
// under 44 × 44 px, nothing lying over a target in view, no page or console error. The rules are tools/audit.js (shared with the sweep tool
// tools/shots.js): a ::before / ::after hit area counts, a checkbox is measured by its label, an element that
// takes no taps (pointer-events: none) is not a target. Invented data only (tests/e2e/fixtures/main-screen-data.js),
// a fixed clock (Thursday 8 October 2026, 10:00), a fake cloud; nothing leaves localhost.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const { audit } = require('./tools/audit.js');
const { G, M, seed } = require('./fixtures/main-screen-data.js');
const PORT = 8279;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 1600) : '')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// every view, then the sheets (sup: the supervisor's only); "gate" = the sign-in screen, before signing in
const STEPS = [
  { "name": "gate", "gate": true },
  {"name":"today","view":"today"},
  {"name":"log","view":"log"},
  {"name":"clinics","view":"clinics"},
  {"name":"calendar","view":"calendar"},
  {"name":"reports","view":"reports"},
  {"name":"more","view":"more"},
  {"name":"products","view":"products"},
  {"name":"playbook","view":"playbook"},
  {"name":"team","view":"team"},
  {"name":"clanalysis","view":"clanalysis"},
  {"name":"doctors","view":"doctors"},
  {"name":"log-filled","js":"(()=>{ switchView('log'); const rep = (currentUser.role === 'supervisor' ? logAsRep : currentUser.name); const c = clinics.find(x => x.rep === rep && x.cls !== 'Closed' && (x.doctors||[]).length) || clinics.find(x => (x.doctors||[]).length); pickClinic(c.id); pickDoctorSeen(c.doctors[0].id); products.filter(p => p.price > 0).slice(0,2).forEach(p => toggleProductChip(productKey(p))); setRx(true); const t = rxActiveTypes()[0]; if(t){ rxPut('log', c.doctors[0].id, t.id, 3); renderRxStep(); } setOrder(true); setDraftDiscount(draftOrders[0].id, 10); pickQuickDate(7); document.getElementById('visitNotes').value = 'Asked for the new brush catalogue; bring samples next time.'; lvPaint(); scrollTo(0,0); })()"},
  {"name":"order-only","js":"switchView('log'); openStandaloneOrder()"},
  {"name":"call-log","js":"closeModal(); openCallLog()"},
  {"name":"edit-visit","js":"closeModal(); openEditVisit(visits.filter(v => !v.callOnly && !v.orderOnly && canEditVisit(v)).sort((a,b)=>(b.ts||0)-(a.ts||0))[0].id)"},
  {"name":"delete-confirm","js":"closeModal(); confirmDeleteVisit(visits.filter(v => !v.callOnly && !v.orderOnly && canEditVisit(v)).sort((a,b)=>(b.ts||0)-(a.ts||0))[0].id)"},
  {"name":"visit-log","js":"closeModal(); openVisitLog()"},
  {"name":"photo-gallery","js":"(()=>{ const mk = c => { const cv = document.createElement('canvas'); cv.width = cv.height = 160; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0,0,160,160); g.fillStyle='rgba(255,255,255,.45)'; g.beginPath(); g.arc(80,80,42,0,7); g.fill(); return cv.toDataURL('image/jpeg', .7); }; const vs = visits.filter(v => !v.callOnly && !v.orderOnly).slice(-2); if(vs[0]) vs[0].photos = [{id:'shot-a', thumb: mk('#2F8F6F')}, {id:'shot-b', thumb: mk('#0B5A45'), pending: true, dev: 'other', at: Date.now()}]; if(vs[1]) vs[1].photos = [{id:'shot-c', thumb: mk('#57B795')}, {id:'shot-d', thumb: mk('#8FC9B2'), lost: true}]; closeModal(); openPhotoGallery(); })()"},
  {"name":"lightbox","js":"(()=>{ closeModal(); const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; const g = cv.getContext('2d'); g.fillStyle = '#2F8F6F'; g.fillRect(0,0,320,240); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(160,120,60,0,7); g.fill(); const v = visits.filter(x => !x.callOnly && !x.orderOnly).slice(-1)[0]; v.photos = [{ id: 'lbshot', thumb: cv.toDataURL('image/jpeg', .8) }]; showLightbox('lbshot', 'Harbor Sample Dental Clinic · Oct 8'); })()"},
  {"name":"clinic-card","js":"(()=>{ const c = clinics.find(x => (x.doctors||[]).length >= 2 && x.cls !== 'Closed' && visits.some(v => v.clinicId === x.id)) || clinics[0]; switchView('clinics'); openClinicDetail(c.id); })()"},
  {"name":"add-clinic","js":"closeModal(); openAddClinic()"},
  {"name":"rx-growth","js":"closeModal(); ddTab='rx'; switchView('doctors'); renderDoctorsDb(); scrollTo(0,0)"},
  {"name":"doctor-profile","js":"(()=>{ const c = clinics.find(x => (x.doctors||[]).length && visits.some(v => v.clinicId === x.id)); switchView('doctors'); openDoctorProfile(c.id, c.doctors[0].id); })()"},
  {"name":"doctor-records","js":"closeModal(); openDoctorRecords()"},
  {"name":"rx-types","js":"closeModal(); openRxTypes()","sup":true},
  {"name":"data-entry","js":"closeModal(); openDataEntry()","sup":true},
  {"name":"cal-week","js":"closeModal(); switchView('calendar'); setCalMode('week'); calGoToday(); scrollTo(0,0)"},
  {"name":"cal-agenda","js":"(()=>{ closeModal(); switchView('calendar'); setCalMode('month'); calGoToday(); const el = document.getElementById('calAgendaTitle'); el.scrollIntoView({block:'start'}); scrollBy(0, -90); })()"},
  {"name":"cal-insights","js":"(()=>{ closeModal(); switchView('calendar'); calRangePreset('month'); const d = document.querySelector('.cal-ins'); d.open = true; d.scrollIntoView({block:'start'}); scrollBy(0,-90); })()"},
  {"name":"chat","js":"(async ()=>{ const mk = (c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 240; const g = cv.getContext('2d'); const gr = g.createLinearGradient(0,0,240,240); gr.addColorStop(0, c); gr.addColorStop(1, '#0B3F35'); g.fillStyle = gr; g.fillRect(0,0,240,240); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(120,110,54,0,7); g.fill(); return cv.toDataURL('image/jpeg', .8); }; const t = Date.now(), H = 3600000; closeModal(); teamTab='chat'; switchView('team'); try{ await loadTeam(); }catch(e){} await new Promise(r => setTimeout(r, 900)); chatMsgs = [ {id:'c1', who:'Renova', text:'Morning! Harbor clinic asked for the new brush catalogue.', ts:t-27*H}, {id:'c2', who:'Dr. Ghaith', text:'Great — bring samples on Thursday.', ts:t-26*H}, {id:'c3', who:'Mariam', text:'Done at Opal today, order of 169 KD.', ts:t-3*H}, {id:'c4', who:'Mariam', text:'', photoId:'cp1', thumb: mk('#2F8F6F'), ts:t-3*H+60000}, {id:'c5', who:'Dr. Ghaith', text:'Well done 👏', ts:t-2*H}, {id:'c6', who:'Renova', text:'', photoId:'cp2', ts:t-H} ]; renderChat(); scrollTo(0, document.body.scrollHeight); })()"},
  {"name":"memories","js":"(async ()=>{ const mk = (c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 240; const g = cv.getContext('2d'); const gr = g.createLinearGradient(0,0,240,240); gr.addColorStop(0, c); gr.addColorStop(1, '#0B3F35'); g.fillStyle = gr; g.fillRect(0,0,240,240); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(120,110,54,0,7); g.fill(); return cv.toDataURL('image/jpeg', .8); }; const t = Date.now(), D = 86400000; closeModal(); switchView('team'); setTeamTab('mem'); try{ await loadTeam(); }catch(e){} await new Promise(r => setTimeout(r, 900)); memories = [ {id:'m1', who:'Mariam', cap:'Launch day at the dental show', thumb: mk('#2F8F6F'), ts:t-D}, {id:'m2', who:'Renova', cap:'Team lunch after the training', thumb: mk('#57B795'), ts:t-3*D}, {id:'m3', who:'Dr. Ghaith', cap:'The new stand at Harbor', thumb: mk('#0B5A45'), ts:t-6*D}, {id:'m4', who:'Mariam', cap:'Road trip to Jahra', thumb: mk('#8FC9B2'), ts:t-9*D} ]; renderMemories(); scrollTo(0,0); })()"},
  {"name":"kpi-team","js":"closeModal(); _kpiRep='all'; _kpiPeriod='month'; openKpiScorecard()","sup":true},
  {"name":"kpi-person","js":"closeModal(); _kpiRep=REPS[0]; openKpiScorecard()"},
  {"name":"month-by-month","js":"closeModal(); _mbmRep='all'; openMonthByMonth()"},
  {"name":"requests","js":"(()=>{ const t = new Date(Date.now() - 5*3600000).toISOString(); const c = clinics.filter(x => x.cls !== 'Closed'); events.push({id:'rq1', kind:'issue', type:'request', clinicId:c[0].id, rep:c[0].rep, text:'Needs the price list for loupes', at:t, createdBy:'Dr. Ghaith'}, {id:'rq2', kind:'issue', type:'escalation', clinicId:c[1].id, rep:c[1].rep, text:'Called the office about a late delivery', via:'the manager', at:t, createdBy:'Dr. Ghaith'}, {id:'st1', kind:'stand', clinicId:c[2].id, rep:c[2].rep, brand:'Philips Sonicare counter stand', at:t, checks:[], createdBy:'Dr. Ghaith'}); closeModal(); openClientLog(); })()"},
  {"name":"erp-links","js":"closeModal(); openErpLinks({})","sup":true},
  {"name":"erp-editor","js":"(()=>{ closeModal(); const a = UMCore.erpAccounts(digestData()).accounts.filter(a => a.clinicId && a.invoices > 0)[0]; openErpLinkEdit(a.name); })()","sup":true},
  {"name":"erp-preview","js":"(()=>{ closeModal(); const acc = UMCore.erpAccounts(digestData()).accounts.filter(a => a.clinicId && a.invoices > 0).sort((a,b) => b.invoices - a.invoices); const a = acc.find(x => { const c = clinics.find(y => y.id === x.clinicId); return c && clinics.some(o => o.rep && c.rep && o.rep !== c.rep && o.cls !== 'Closed'); }) || acc[0]; const c = clinics.find(y => y.id === a.clinicId); const o = clinics.find(x => x.rep && x.rep !== c.rep && x.cls !== 'Closed'); window.__pvA = a.name; openErpLinkPreviewFor(a.name, o.id); })()","sup":true},
  {"name":"product-detail","js":"(()=>{ closeModal(); const p = products.find(x => x.price != null) || products[0]; openProductDetail(productKey(p)); })()"},
  {"name":"catalog-gaps","js":"closeModal(); openCatalogGaps()","sup":true},
  {"name":"duplicates","js":"closeModal(); openProductDups()","sup":true},
  {"name":"playbook-sheet","js":"closeModal(); openPlaybook(SPECIALTIES[0])"},
  {"name":"report-chart","js":"(()=>{ closeModal(); switchView('reports'); const c = document.getElementById('chartsWrap'); c.scrollIntoView({block:'start'}); scrollBy(0,-80); })()"},
  {"name":"report-coach","js":"(()=>{ closeModal(); switchView('reports'); const c = document.getElementById('coachCard'); c.scrollIntoView({block:'start'}); scrollBy(0,-120); })()"},
  {"name":"report-score","js":"(()=>{ closeModal(); switchView('reports'); const c = document.getElementById('teamCompareCard'); c.scrollIntoView({block:'start'}); scrollBy(0,-90); })()"},
  {"name":"month-close","js":"closeModal(); openMonthReports()"},
  {"name":"pro-report","js":"closeModal(); showProReport()","wait":1200},
  {"name":"analysis","js":"(()=>{ closeModal(); try{ hideProReport(); }catch(e){} switchView('clanalysis'); scrollTo(0,0); })()"},
  {"name":"coverage","js":"closeModal(); try{ hideProReport(); }catch(e){} openCoverageBoard()","sup":true},
  {"name":"erp-import","js":"closeModal(); openErpImport()","sup":true},
  {"name":"dsr-upload","js":"(async ()=>{ closeModal(); const keep = persist; persist = async () => true; try{ const t = {}, matched = []; REPS.forEach(r => { if(targets[r]){ t[r] = JSON.parse(JSON.stringify(targets[r])); matched.push({ rep: r, name: r, revenue: t[r].revenue || 0, brands: t[r].brands || {} }); } }); await applyTargetsFile({ targets: t, matched, unmatched: [] }); } finally { persist = keep; } })()","wait":1200,"sup":true},
  {"name":"admin-team","js":"closeModal(); openAdminPanel(); setAdminTab('team')","sup":true},
  {"name":"admin-territory","js":"closeModal(); openAdminPanel(); setAdminTab('territory')","sup":true},
  {"name":"recycle-bin","js":"closeModal(); openAdminPanel(); setAdminTab('data')","sup":true},
  {"name":"backups","js":"(()=>{ closeModal(); openExport(); setTimeout(() => { const t = [...document.querySelectorAll('#modalInner .section-title')].find(e => /Automatic backups/.test(e.textContent)); if(t) t.scrollIntoView({block:'start'}); }, 600); })()","wait":1200,"sup":true},
  {"name":"find-missing","js":"closeModal(); openClinicRecovery()","wait":1200,"sup":true},
  {"name":"weekly-deck","js":"closeModal(); openWeeklyDeck()","sup":true},
  {"name":"bars","js":"(()=>{ closeModal(); switchView('today'); _erpDirty = true; renderErpDirtyPill(); refusedSave('clinics', REFUSED_ELSEWHERE); })()","sup":true},
];

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const cloud = {};
  const api = {
    get: async k => k in cloud ? cloud[k] : null,
    set: async (k, v) => { cloud[k] = v; return true; },
    setMany: async e => { e.forEach(([k, v]) => { cloud[k] = v; }); return true; },
    del: async k => { delete cloud[k]; return true; },
    list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  };
  const found = {};   // "<who> <lang>" → { wide: [], small: [], errors: [] }
  for(const [who, role] of [[G, 'supervisor'], [M, 'rep']]){
    for(const lang of ['en', 'ar']){
      const key = (role === 'rep' ? 'rep' : 'supervisor') + ' ' + lang, f = found[key] = { pages: 0, wide: [], small: [], covered: [], errors: [] };
      for(const w of [360, 390]){
        seed(cloud, {});
        const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
        await blockFirebase(ctx);
        await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
        await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
        await page.addInitScript(({ lang, staff }) => {
          try{ localStorage.setItem('ultramed_lang', lang); localStorage.setItem('ultramed_staff_cache', staff); }catch(e){}
          window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
            setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
          const off = new Date('2026-10-08T10:00:00').getTime() - Date.now();
          const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
        }, { lang, staff: cloud.staff });
        await page.goto(`http://localhost:${PORT}/index.html`);
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        await sleep(300);
        let signedIn = false;
        for(const st of STEPS){
          if(st.sup && role !== 'supervisor') continue;
          if(!st.gate && !signedIn){ await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role }); await sleep(1500); signedIn = true; }
          if(st.view) await page.evaluate(v => { closeModal(); switchView(v); scrollTo(0, 0); }, st.view).catch(e => errors.push('step ' + st.name + ': ' + e.message.split('\n')[0]));
          if(st.js) await page.evaluate(async js => { const r = (0, eval)(js); if(r && typeof r.then === 'function') await r; }, st.js).catch(e => errors.push('step ' + st.name + ': ' + e.message.split('\n')[0]));
          await page.evaluate(() => typeof msWhenReady === 'function' ? msWhenReady() : null).catch(() => {});
          await sleep(st.wait || 200);
          const a = await page.evaluate(audit, { phone: true, width: w });
          const at = `${st.name}@${w}`;
          f.pages++;
          if(a.scrollWidth > a.vw || a.wide.length) f.wide.push(at + ': ' + (a.scrollWidth > a.vw ? `scrollWidth ${a.scrollWidth} > ${a.vw} ` : '') + a.wide.slice(0, 3).join(' | '));
          a.small.forEach(s => f.small.push(at + ': ' + s));
          a.covered.forEach(s => f.covered.push(at + ': ' + s));
          errors.splice(0).forEach(e => f.errors.push(at + ': ' + e));
          await page.evaluate(() => { closeModal(); const lb = document.getElementById('lightbox'); if(lb) lb.classList.remove('show'); try{ hideProReport(); }catch(e){} }).catch(() => {});
        }
        await ctx.close();
      }
    }
  }
  for(const [key, f] of Object.entries(found)){
    check(`${key} at 360 and 390 px (${f.pages} pages: every view and its sheets): no page pans sideways`, f.pages > 60 && f.wide.length === 0, f.wide.slice(0, 12));
    check(`${key}: every tap target is at least 44 × 44 px`, f.small.length === 0, f.small.slice(0, 20));
    check(`${key}: nothing lies over a tap target in view (the chrome the page scrolls under excepted)`, f.covered.length === 0, f.covered.slice(0, 12));
    check(`${key}: no page or console error`, f.errors.length === 0, f.errors.slice(0, 10));
  }
  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
