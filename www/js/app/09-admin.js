// admin panel, full visit log, photos, missing-clinic finder, manage clinics
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- ADMIN PANEL (supervisor only) ----
function requireAdmin(){
  if(!currentUser || currentUser.role!=='supervisor'){ showToast('Supervisor only'); return false; }
  return true;
}
function openAdminPanel(){
  if(!requireAdmin()) return;
  showModal(`
    <h3 style="margin-top:0;">${I('settings')} Admin panel</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Supervisor tools — team oversight and data management.</p>
    <div class="chip-row" style="margin-bottom:14px;">
      <div class="chip small on" id="apTabTeam" onclick="setAdminTab('team')">Team</div>
      <div class="chip small" id="apTabTerritory" onclick="setAdminTab('territory')">Territory</div>
      <div class="chip small" id="apTabPrices" onclick="setAdminTab('prices')">Catalog</div>
      <div class="chip small" id="apTabData" onclick="setAdminTab('data')">Data</div>
      <div class="chip small" id="apTabMail" onclick="setAdminTab('mail')">📧 Email reports</div>
    </div>
    <div id="apBody"></div>
    <button class="btn secondary" onclick="closeModal(); openExport();">Export &amp; backups</button>
    <button class="btn" onclick="closeModal()">Done</button>
  `);
  setAdminTab('team');
}
function setAdminTab(tab){
  if(tab==='staff' || tab==='bin') tab = tab==='staff' ? 'team' : 'data';
  ['team','territory','prices','data','mail'].forEach(t=>{
    const el = document.getElementById('apTab'+t.charAt(0).toUpperCase()+t.slice(1));
    if(el) el.classList.toggle('on', t===tab);
  });
  const body = document.getElementById('apBody');
  if(!body) return;
  if(tab==='team'){ body.innerHTML = adminTeamHTML(); renderAdminStaff(); }
  if(tab==='territory'){ body.innerHTML = adminTerritoryHTML(); renderAdminTerritory(); }
  if(tab==='prices'){ body.innerHTML = adminPricesHTML(); renderAdminPrices(); }
  if(tab==='data'){ body.innerHTML = adminDataHTML(); }
  if(tab==='mail'){ body.innerHTML = adminMailHTML(); refreshMailStatus(); }
}
// -- Email reports tab: the automatic morning / end-of-day digests --
// The digests are sent by GitHub Actions; "send now" is that workflow's Run button.
const MAIL_WORKFLOW_URL = 'https://github.com/ghaithalmanfe/ultramed-app/actions/workflows/daily-report.yml';
function adminMailHTML(){
  const people = staff.filter(s=>s && s.email);
  return `
    <p style="color:rgba(255,255,255,.7); font-size:13px; margin-top:0;" dir="auto">يُرسَل تلقائيًا ملخصان كل يوم عمل (الأحد–الخميس): <b>الصباح 07:30</b> و<b>نهاية اليوم 18:30</b> بتوقيت الكويت. كل مندوبة تستلم يومها، والمشرف يستلم الفريق. الأرقام هي نفسها التي تظهر في شاشة اليوم.</p>
    <div class="card" id="mailStatusCard"><div style="color:var(--muted); font-size:13px;">⏳ جارٍ قراءة حالة الإرسال…</div></div>
    <div class="section-title">Recipients · المستلمون</div>
    <div class="card">${people.length ? people.map(s=>`<div class="report-line"><span>${esc(s.name)} <span style="color:var(--muted); font-size:11.5px;">· ${s.role==='supervisor'?'الفريق':'يومها'}</span></span><span class="v" dir="ltr" style="font-size:12px;">${esc(s.email)}</span></div>`).join('') : '<div class="empty">لا توجد إيميلات في قائمة الفريق — أضفها من تبويب Team.</div>'}</div>
    <div class="section-title">Preview · معاينة</div>
    <div class="chip-row" style="margin-bottom:10px;">
      <div class="chip small" onclick="previewDigest('morning')">☀️ ملخص الصباح (الفريق)</div>
      <div class="chip small" onclick="previewDigest('evening')">🌙 ملخص المساء (الفريق)</div>
      ${REPS.map(r=>`<div class="chip small" onclick="previewDigest('evening','${esc(r)}')">🌙 ${esc(r)}</div>`).join('')}
    </div>
    <div class="section-title">Send now · إرسال الآن</div>
    <a class="btn secondary" id="mailSendNow" href="${MAIL_WORKFLOW_URL}" target="_blank" rel="noopener">▶️ أرسل الآن من GitHub</a>
    <div id="mailSendResult" style="font-size:12.5px; color:var(--muted); margin-top:6px;" dir="auto">تفتح صفحة الإرسال في GitHub: اضغط <b>Run workflow</b> واختر morning أو evening. بعد دقيقة يظهر الإرسال في البطاقة أعلاه.</div>`;
}
async function refreshMailStatus(){
  const el = document.getElementById('mailStatusCard');
  if(!el) return;
  let log = null;
  try{ const r = await withTimeout(window.storage.get('mailLog', true), 8000); log = r ? UMCore.safeParse(r.value, null) : null; }catch(e){}
  if(!document.getElementById('mailStatusCard')) return;
  if(!log || !log.last){
    el.innerHTML = `<div style="font-weight:700; font-size:13.5px;">لم يُرسَل أي تقرير بعد</div>
      <div style="color:var(--muted); font-size:12.5px; margin-top:4px;" dir="auto">الإرسال يبدأ بعد إضافة أربعة أسرار في GitHub (Settings ← Secrets and variables ← Actions): بيانات دخول للقراءة، مفتاح Resend، وعنوان المرسل. ثم جرّب "أرسل الآن".</div>`;
    return;
  }
  const L = log.last;
  const when = new Date(L.at).toLocaleString('ar-KW-u-nu-latn', { timeZone: 'Asia/Kuwait', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<div style="font-weight:700; font-size:13.5px;">آخر إرسال: ${L.kind==='morning'?'☀️ الصباح':'🌙 المساء'} — ${when}${L.manual?' (يدوي)':''}</div>
    <div style="font-size:12.5px; margin-top:4px;">${L.sent} ${L.sent===1?'رسالة وصلت':'رسائل وصلت'}${L.failed?` · <span style="color:var(--coral-ink);">${L.failed} فشلت</span>`:''}</div>
    ${(L.to||[]).map(t=>`<div class="report-line" style="font-size:12px;"><span>${esc(t.name||'')} <span dir="ltr" style="color:var(--muted);">${esc(t.to)}</span></span><span class="v">${t.ok?'✅':'❌ '+esc(t.error||'')}</span></div>`).join('')}
    ${(log.history||[]).length>1?`<div style="color:var(--muted); font-size:11.5px; margin-top:6px;">${(log.history||[]).slice(1,6).map(h=>`${h.kind==='morning'?'☀️':'🌙'} ${h.today} · ${h.sent}✅${h.failed?' '+h.failed+'❌':''}`).join(' · ')}</div>`:''}`;
}
function previewDigest(kind, rep){
  const d = UMCore.dailyDigest({ kind, data: digestData(), reps: REPS, rep: rep || null });
  showModal(`
    <h3 style="margin-top:0;">${kind==='morning'?'☀️':'🌙'} ${esc(d.subject)}</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;" dir="auto">هكذا تصل الرسالة بالضبط، بأرقام هذه اللحظة.</p>
    <div class="card" style="background:#fff; color:#111; max-height:60vh; overflow:auto;">${d.html}</div>
    <button class="btn secondary" onclick="openAdminPanel(); setAdminTab('mail')">Back</button>
  `);
}
// -- Team tab (performance + roster management in one place) --
function adminTeamHTML(){
  return `<div id="apStaffList"></div>
    <button class="btn secondary" onclick="openStaffForm()">+ Add team member</button>
    <div class="section-title">Evaluation targets</div>
    <p style="color:rgba(255,255,255,.55); font-size:12.5px; margin-top:-6px;">These targets drive every rep's scorecard, the coaching guidance under it, and the professional report — set them once here and they apply team-wide.</p>
    <div class="card">
      <label>Clinic coverage target (%)</label>
      <input type="number" min="0" max="100" id="bmCoverage" value="${BENCHMARKS.coverage}">
      <label>Priority (A/B) clinic coverage target (%)</label>
      <input type="number" min="0" max="100" id="bmPriority" value="${BENCHMARKS.priority}">
      <label>Conversion rate target (%)</label>
      <input type="number" min="0" max="100" id="bmConversion" value="${BENCHMARKS.conversion}">
      <label>Task completion target (%)</label>
      <input type="number" min="0" max="100" id="bmTasks" value="${BENCHMARKS.tasks}">
      <button class="btn secondary small" onclick="saveBenchmarks()">Save targets</button>
    </div>
    <div class="section-title">Monthly targets per rep</div>
    <p style="color:rgba(255,255,255,.55); font-size:12.5px; margin-top:-6px;">Set a monthly sales and/or visit goal for each rep. Progress bars appear on their Today screen and reset every month. Leave 0 to hide.</p>
    <div class="card">
      ${REPS.map((r,i)=>{
        const t = targets[r] || {};
        const tp = targetPct(r);
        return `<div style="font-weight:700; font-size:13.5px; margin:${i?'14px':'0'} 0 4px;">${esc(r)}${tp?` <span style="font-weight:600; font-size:12px; color:var(--muted);">· ${tp.pct}% achieved this month (${money(tp.amount)})</span>`:''}</div>
        <div style="display:flex; gap:10px;">
          <div style="flex:1;"><label style="font-size:12px;">Sales (KD)</label><input type="number" min="0" id="tgRev${i}" value="${t.revenue||0}"></div>
          <div style="flex:1;"><label style="font-size:12px;">Visits</label><input type="number" min="0" id="tgVis${i}" value="${t.visits||0}"></div>
        </div>`;
      }).join('')}
      ${(()=>{ const tt = teamTargetNow(); return tt.pct != null ? `<div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--line); font-weight:700; font-size:13.5px;">Team total <span style="font-weight:600; font-size:12px; color:var(--muted);">· ${tt.pct}% achieved this month (${money(tt.ach)} of ${money(tt.goal)})</span></div>` : ''; })()}
      <button class="btn secondary small" style="margin-top:12px;" onclick="saveTargets()">Save monthly targets</button>
    </div>`;
}
async function saveTargets(){
  const clamp = v => Math.max(0, parseFloat(v)||0);
  REPS.forEach((r,i)=>{
    targets[r] = Object.assign({}, targets[r] || {}, {
      month: todayStr().slice(0, 7), // set by hand this month
      revenue: clamp(document.getElementById('tgRev'+i).value),
      visits: Math.round(clamp(document.getElementById('tgVis'+i).value)),
    });
  });
  await persist('targets');
  showToast('🎯 Monthly targets saved');
  renderTargetCard();
}
async function saveBenchmarks(){
  const clamp = v => Math.max(0, Math.min(100, parseInt(v)||0));
  BENCHMARKS = {
    coverage: clamp(document.getElementById('bmCoverage').value),
    priority: clamp(document.getElementById('bmPriority').value),
    conversion: clamp(document.getElementById('bmConversion').value),
    tasks: clamp(document.getElementById('bmTasks').value),
  };
  await persist('benchmarks');
  showToast('✅ Evaluation targets updated');
  if(document.getElementById('scorecards')) renderScorecards();
}
function renderAdminStaff(){
  const el = document.getElementById('apStaffList');
  if(!el) return;
  el.innerHTML = adminTeamStatsHTML();
}
function adminTeamStatsHTML(){
  const today = todayStr();
  const wk = new Date(); wk.setDate(wk.getDate()-7);
  const mo = new Date(); mo.setDate(mo.getDate()-30);
  let html = '';
  REPS.forEach((r,ri)=>{
    const rVisits = visits.filter(v=>v.rep===r);
    const wkV = rVisits.filter(v=>new Date(v.date+'T00:00:00')>=wk);
    const moV = rVisits.filter(v=>new Date(v.date+'T00:00:00')>=mo);
    const moRev = moV.reduce((s,v)=>s+(v.orderTotal||0),0);
    const myClinics = clinics.filter(c=>c.rep===r && c.cls!=='Closed');
    const covered = new Set(moV.map(v=>v.clinicId)).size;
    const coverage = myClinics.length ? Math.round(covered/myClinics.length*100) : 0;
    const overdue = myClinics.filter(c=>followStatus(c.nextFollowUp)==='overdue').length;
    const openTasks = tasks.filter(t=>t.rep===r && !t.done).length;
    const last = rVisits.length ? rVisits.map(v=>v.date).sort().slice(-1)[0] : null;
    const daysSince = last ? daysBetween(last, today) : null;
    const stale = daysSince===null || daysSince>3;
    const person = staff.find(s=>s.name===r);
    html += `<div class="card" style="margin-bottom:10px; border-inline-start:4px solid ${stale?'var(--coral)':'var(--sage)'};">
      <div class="row-between" style="margin-bottom:4px;">
        <div class="clinic-name">${esc(r)}${person&&person.role==='supervisor'?' <span class="rep-tag">supervisor</span>':''}</div>
        <button class="chip small" style="flex-shrink:0;" onclick="openStaffForm(${staff.indexOf(person)})">Edit</button>
      </div>
      <div class="row-between" style="margin-bottom:10px;">
        <span class="clinic-sub">${person?esc(person.email):''}</span>
        <span class="badge ${stale?'overdue':'done'}">${last?('Last visit '+fmtDate(last)):'No visits yet'}</span>
      </div>
      <div class="kpi-grid" style="margin-bottom:0;">
        <div class="kpi"><div class="n">${wkV.length}</div><div class="l">Visits this week</div></div>
        <div class="kpi"><div class="n">${moV.length}</div><div class="l">Visits 30 days</div></div>
        <div class="kpi"><div class="n">${money(moRev)}</div><div class="l">Sales 30 days</div></div>
        <div class="kpi"><div class="n">${coverage}%</div><div class="l">Coverage 30 days</div></div>
        <div class="kpi"><div class="n">${myClinics.length}</div><div class="l">Clinics assigned</div></div>
        <div class="kpi"><div class="n" style="${overdue?'color:var(--coral-ink);':''}">${overdue}</div><div class="l">Overdue follow-ups</div></div>
      </div>
      ${openTasks?`<div style="font-size:12.5px; color:var(--muted); margin-top:8px;">${openTasks} open task${openTasks===1?'':'s'}</div>`:''}
    </div>`;
  });
  const unassigned = clinics.filter(c=>!c.rep || !REPS.includes(c.rep)).length;
  if(unassigned) html += `<div class="card" style="background:var(--amber-dim);"><strong>${unassigned}</strong> clinic${unassigned===1?'':'s'} not assigned to any rep — see Territory tab.</div>`;
  return html;
}
// -- Territory tab (reassign clinics between reps) --
function adminTerritoryHTML(){
  return `
    <p style="color:var(--muted); font-size:12.5px; margin-top:0;">Move a clinic to a different rep. Visit history stays with the clinic.</p>
    <input type="text" id="apTerrSearch" placeholder="Search clinics..." oninput="renderAdminTerritory()" style="margin-bottom:10px;">
    <div class="chip-row" style="margin-bottom:10px;" id="apTerrFilter">
      <div class="chip small on" data-f="all" onclick="setTerrFilter(this,'all')">All</div>
      ${REPS.map(r=>`<div class="chip small" data-f="${esc(r)}" onclick="setTerrFilter(this,'${esc(r)}')">${esc(r)}</div>`).join('')}
      <div class="chip small" data-f="__none" onclick="setTerrFilter(this,'__none')">Unassigned</div>
    </div>
    <div id="apTerrBody"></div>`;
}
let terrFilter = 'all';
function setTerrFilter(el, val){
  terrFilter = val;
  el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  renderAdminTerritory();
}
function renderAdminTerritory(){
  const q = (document.getElementById('apTerrSearch')?.value||'').toLowerCase().trim();
  let list = clinics.filter(c=>c.cls!=='Closed');
  if(terrFilter==='__none') list = list.filter(c=>!c.rep || !REPS.includes(c.rep));
  else if(terrFilter!=='all') list = list.filter(c=>c.rep===terrFilter);
  if(q) list = list.filter(c=>c.name.toLowerCase().includes(q));
  list = list.sort((a,b)=>a.name.localeCompare(b.name)).slice(0,40);
  const el = document.getElementById('apTerrBody');
  if(!el) return; // the sheet was closed (or another tab opened) before the save finished
  if(!list.length){ el.innerHTML = `<div class="empty">No clinics match.</div>`; return; }
  el.innerHTML = list.map(c=>{
    const vCount = visits.filter(v=>v.clinicId===c.id).length;
    return `<div class="card" style="margin-bottom:8px; border-inline-start:4px solid ${clsColor(c.cls)};">
      <div class="clinic-name">${esc(c.name)}</div>
      <div class="clinic-sub" style="margin-bottom:8px;">${vCount} visit${vCount===1?'':'s'} · currently ${c.rep&&REPS.includes(c.rep)?esc(c.rep):'<span style="color:var(--coral-ink);">unassigned</span>'}</div>
      <div class="chip-row">
        ${REPS.map(r=>`<div class="chip small ${c.rep===r?'on':''}" onclick="reassignClinic('${c.id}','${esc(r)}')">${esc(r)}</div>`).join('')}
      </div>
    </div>`;
  }).join('') + (clinics.filter(c=>c.cls!=='Closed').length>40 && !q ? `<div style="text-align:center; color:var(--muted); font-size:12.5px; padding:6px;">Search to narrow down</div>` : '');
}
async function reassignClinic(clinicId, newRep){
  if(!requireAdmin()) return;
  const c = clinics.find(x=>x.id===clinicId);
  if(!c || c.rep===newRep) return;
  const prev = c.rep;
  c.rep = newRep;
  await persist('clinics');
  showToast(`${c.name} → ${newRep}`);
  renderAdminTerritory();
  renderAll();
}
// -- Data tab = health checks + recycle bin --
function adminDataHTML(){
  const n = binCount();
  return `
    <div class="chip-row" style="margin-bottom:12px;">
      <div class="chip small on" id="apDataHealth" onclick="setDataSub('health')">Health checks</div>
      <div class="chip small" id="apDataBin" onclick="setDataSub('bin')">Recycle bin${n?' ('+n+')':''}</div>
    </div>
    <div id="apDataBody">${adminHealthHTML()}</div>`;
}
function setDataSub(sub){
  const h = document.getElementById('apDataHealth'), b = document.getElementById('apDataBin');
  if(h) h.classList.toggle('on', sub==='health');
  if(b) b.classList.toggle('on', sub==='bin');
  const body = document.getElementById('apDataBody');
  if(body) body.innerHTML = sub==='health' ? adminHealthHTML() : adminBinHTML();
}
function dupProductIds(){
  const counts = {};
  products.forEach(p=>{ counts[p.id]=(counts[p.id]||0)+1; });
  return Object.entries(counts).filter(([id,n])=>n>1).map(([id,n])=>`${id} (×${n})`);
}
function adminHealthHTML(){
  const active = clinics.filter(c=>c.cls!=='Closed');
  const never = active.filter(c=>!visits.some(v=>v.clinicId===c.id));
  const noFollow = active.filter(c=>!c.nextFollowUp);
  const overdue = active.filter(c=>followStatus(c.nextFollowUp)==='overdue');
  const noClass = active.filter(c=>!c.cls);
  const noContact = active.filter(c=>!c.contact && !c.phone && !(c.doctors||[]).length);
  const dupes = [];
  const seen = {};
  active.forEach(c=>{
    const k = c.name.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(seen[k]) dupes.push(c.name+' / '+seen[k]); else seen[k]=c.name;
  });
  const row = (label, items, color) => {
    const n = items.length;
    return `<div class="card" style="margin-bottom:8px; ${n?'border-inline-start:4px solid '+color+';':''}">
      <div class="row-between">
        <div style="flex:1;">
          <div class="clinic-name">${label}</div>
          ${n?`<div style="font-size:12px; color:var(--muted); margin-top:5px;">${esc(items.slice(0,4).map(x=>typeof x==='string'?x:x.name).join(', '))}${n>4?' +'+(n-4)+' more':''}</div>`:'<div class="clinic-sub">All good ✅</div>'}
        </div>
        <strong style="${n?'color:'+color+';':'color:var(--sage-ink);'} font-size:19px;">${n}</strong>
      </div>
    </div>`;
  };
  return `
    <p style="color:var(--muted); font-size:12.5px; margin-top:0;">Gaps worth fixing. Numbers count active clinics only.</p>
    ${row('Never visited', never, 'var(--coral-ink)')}
    ${row('Overdue follow-ups', overdue, 'var(--coral-ink)')}
    ${row('No follow-up date set', noFollow, 'var(--amber-ink)')}
    ${row('No class assigned (A–F)', noClass, 'var(--amber-ink)')}
    ${row('No contact or doctor on file', noContact, 'var(--amber-ink)')}
    ${row('Possible duplicate clinics', dupes, 'var(--amber-ink)')}
    ${row('Products sharing a product code', dupProductIds(), 'var(--coral-ink)')}
    <div class="card" style="background:var(--teal-dim); margin-top:10px;">
      <div class="row-between"><span style="font-size:13px;">Active clinics</span><strong>${active.length}</strong></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:4px;"><span>Closed</span><span>${clinics.length-active.length}</span></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Total visits logged</span><span>${visits.length}</span></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Products in catalog</span><span>${products.length}</span></div>
    </div>`;
}
// -- Prices tab --
function adminPricesHTML(){
  return `
    <p style="color:var(--muted); font-size:12.5px; margin-top:0;">Update a price and it applies to all future orders. Past orders keep their original value.</p>
    <input type="text" id="apPriceSearch" placeholder="Search product or brand..." oninput="renderAdminPrices()" style="margin-bottom:10px;">
    <div id="apPriceBody"></div>`;
}
function renderAdminPrices(){
  const q = (document.getElementById('apPriceSearch')?.value||'').toLowerCase().trim();
  let list = products;
  if(q) list = list.filter(p=>p.name.toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q));
  list = list.slice(0, q?60:25);
  const el = document.getElementById('apPriceBody');
  if(!list.length){ el.innerHTML = `<div class="empty">No products match.</div>`; return; }
  el.innerHTML = list.map(p=>`
    <div class="qty-row">
      <div class="pname">${esc(p.name)}<br><span style="color:var(--muted); font-size:11.5px;">${esc(p.brand||'')} · ${esc(p.id)}</span></div>
      <input type="number" step="0.01" min="0" value="${p.price!=null?p.price:''}" onchange="updateProductPrice('${esc(productKey(p))}', this.value)" style="width:82px;">
    </div>`).join('') + (!q && products.length>25 ? `<div style="text-align:center; color:var(--muted); font-size:12.5px; padding:8px;">Showing 25 of ${products.length} — search to find others</div>` : '');
}
async function updateProductPrice(key, val){
  if(!requireAdmin()) return;
  const p = findProduct(key);
  if(!p) return;
  const n = parseFloat(val);
  if(isNaN(n) || n<0){ showToast('Enter a valid price'); return; }
  p.price = Math.round(n*100)/100;
  await persist('products');
  showToast(`${p.name.slice(0,28)} → ${money(p.price)}`);
}

// ---- FULL VISIT LOG ----
let visitLogRange = 30;
function openVisitLog(){
  visitLogRange = 30;
  showModal(`
    <h3 style="margin-top:0;">${currentUser.role==='supervisor'?'Team visit log':'My visit log'}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Every visit you've logged, newest first.</p>
    <div class="chip-row" style="margin-bottom:12px;">
      <div class="chip small" id="vlWeek" onclick="setVisitLogRange(7)">This week</div>
      <div class="chip small on" id="vlMonth" onclick="setVisitLogRange(30)">This month</div>
      <div class="chip small" id="vlQuarter" onclick="setVisitLogRange(90)">Quarter</div>
      <div class="chip small" id="vlAll" onclick="setVisitLogRange(9999)">All time</div>
    </div>
    <input type="text" id="vlSearch" placeholder="Search clinic or notes..." oninput="renderVisitLog()" style="margin-bottom:12px;">
    <div id="vlSummary"></div>
    <div id="vlBody"></div>
    <button class="btn secondary" onclick="openPhotoGallery()">${I('camera')} Photo gallery</button>
    <button class="btn secondary" onclick="copyVisitLog()">Copy log as text</button>
    <button class="btn" onclick="closeModal()">Done</button>
  `);
  renderVisitLog();
}
function setVisitLogRange(days){
  visitLogRange = days;
  ['vlWeek','vlMonth','vlQuarter','vlAll'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.remove('on');
  });
  const map = {7:'vlWeek',30:'vlMonth',90:'vlQuarter',9999:'vlAll'};
  const active = document.getElementById(map[days]);
  if(active) active.classList.add('on');
  renderVisitLog();
}
function visitLogRows(){
  let rows = visibleVisits();
  if(visitLogRange!==9999){
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-visitLogRange);
    rows = rows.filter(v=>new Date(v.date+'T00:00:00') >= cutoff);
  }
  const q = (document.getElementById('vlSearch')?.value||'').toLowerCase().trim();
  if(q){
    rows = rows.filter(v=>{
      const c = clinics.find(x=>x.id===v.clinicId);
      return (c && c.name.toLowerCase().includes(q)) || (v.notes||'').toLowerCase().includes(q);
    });
  }
  return rows.sort((a,b)=>b.date.localeCompare(a.date));
}
function renderVisitLog(){
  const rows = visitLogRows();
  const fieldVisits = rows.filter(isFieldVisit);
  const orderOnly = rows.filter(v=>v.orderOnly);
  const calls = rows.filter(v=>v.callOnly);
  const orders = rows.filter(v=>v.orderTaken);
  const revenue = rows.reduce((s,v)=>s+(v.orderTotal||0),0);
  const uniqueClinics = new Set(rows.map(v=>v.clinicId)).size;
  document.getElementById('vlSummary').innerHTML = `
    <div class="card" style="background:var(--teal-dim); margin-bottom:12px;">
      <div class="row-between"><span style="font-size:13px;">Field visits</span><strong>${fieldVisits.length}</strong></div>
      ${orderOnly.length?`<div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:4px;"><span>Phone/remote orders</span><span>${orderOnly.length}</span></div>`:''}
      ${calls.length?`<div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:4px;"><span>${I('phone')} Calls logged</span><span>${calls.length}</span></div>`:''}
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:4px;"><span>Contacts seen</span><span>${rows.reduce((s,v)=>s+UMCore.contactCount(v),0)}</span></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:4px;"><span>Clinics covered</span><span>${uniqueClinics}</span></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Orders taken</span><span>${orders.length}</span></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Sales</span><span>${money(revenue)}</span></div>
    </div>`;
  const el = document.getElementById('vlBody');
  if(rows.length===0){
    el.innerHTML = `<div class="empty">No visits in this period.</div>`;
    return;
  }
  let html = '', lastDate = '';
  rows.forEach(v=>{
    if(v.date !== lastDate){
      lastDate = v.date;
      const d = new Date(v.date+'T00:00:00');
      html += `<div class="doc-group-head">${d.toLocaleDateString(uiLocale(),{weekday:'short', month:'short', day:'numeric'})}</div>`;
    }
    const c = clinics.find(x=>x.id===v.clinicId);
    const prods = (v.products||[]).map(id=>productName(id)).filter(Boolean);
    const canEdit = canEditVisit(v);
    html += `<div class="card" style="margin-bottom:8px; border-inline-start:4px solid ${clsColor(c?c.cls:null)};">
      <div class="row-between">
        <div style="flex:1; cursor:pointer;" onclick="closeModal(); openClinicDetail('${v.clinicId}')">
          <div class="clinic-name">${esc(c?c.name:clinicLabel(v.clinicId, v))}${v.orderOnly?' <span class="rep-tag">order only</span>':''}${v.callOnly?` <span class="rep-tag">${CHANNEL_LABELS[v.channel]||'📞 Call'}</span>`:''}</div>
          <div class="clinic-sub">${v.orderTaken?'🛒 '+money(v.orderTotal):(v.callOnly?(v.contactName?'With '+esc(v.contactName)+(v.contactRole?' ('+esc(v.contactRole)+')':''):'Call logged'):'Visit only')}${currentUser.role==='supervisor'?' · '+esc(v.rep):''}${jointTag(v)}</div>
          ${contactNames(v,c)?`<div style="font-size:12px; color:var(--muted); margin-top:4px;">👥 ${esc(contactNames(v,c))}</div>`:''}
          ${prods.length?`<div style="font-size:12px; color:var(--muted); margin-top:5px;">${esc(prods.slice(0,3).join(', '))}${prods.length>3?' +'+(prods.length-3)+' more':''}</div>`:''}
          ${v.notes?`<div dir="auto" style="font-size:12.5px; margin-top:6px; padding-top:6px; border-top:1px dashed var(--line);">${esc(v.notes)}</div>`:''}
          ${(v.photos&&v.photos.length)?`<div class="photo-row">${v.photos.map(ph=>`<img class="photo-thumb" src="${ph.thumb}" onclick="event.stopPropagation(); showLightbox('${ph.id}','${esc(c?c.name:'Visit photo')}')">`).join('')}</div>`:''}
        </div>
        ${canEdit?`<button class="chip small" style="flex-shrink:0; margin-inline-start:8px;" onclick="event.stopPropagation(); openEditVisit('${v.id}')">Edit</button>`:''}
      </div>
    </div>`;
  });
  el.innerHTML = html;
}
// ---- PHOTO GALLERY ----
function openPhotoGallery(){
  const withPhotos = visibleVisits().filter(v=>v.photos && v.photos.length).sort((a,b)=>b.date.localeCompare(a.date));
  const cname = id => clinicLabel(id);
  showModal(`
    <h3 style="margin-top:0;">${I('camera')} Visit photos</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${withPhotos.reduce((s,v)=>s+v.photos.length,0)} photo${withPhotos.reduce((s,v)=>s+v.photos.length,0)===1?'':'s'} across ${withPhotos.length} visit${withPhotos.length===1?'':'s'}. Tap any photo to view it full size.</p>
    ${withPhotos.length===0 ? '<div class="empty">No photos yet — attach them when logging a visit.</div>' :
      withPhotos.map(v=>`
        <div style="margin-bottom:14px;">
          <div style="font-size:12.5px; font-weight:700; margin-bottom:6px;">${fmtDate(v.date)} · ${esc(cname(v.clinicId))}${currentUser.role==='supervisor'?' · '+esc(v.rep):''}${jointTag(v)}</div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">
            ${v.photos.map(ph=>`<img src="${ph.thumb}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px; cursor:pointer;" onclick="showLightbox('${ph.id}','${esc(cname(v.clinicId))} · ${fmtDate(v.date)}')">`).join('')}
          </div>
        </div>`).join('')}
    <button class="btn" onclick="closeModal()">Done</button>
  `);
}
function copyVisitLog(){
  const rows = visitLogRows();
  const label = visitLogRange===7?'This week':visitLogRange===30?'This month':visitLogRange===90?'This quarter':'All time';
  let text = `UltraMed Visit Log — ${label} — ${currentUser.role==='supervisor'?'Team':currentUser.name}\n\n`;
  rows.forEach(v=>{
    const c = clinics.find(x=>x.id===v.clinicId);
    text += `${v.date} · ${clinicNameOf(v.clinicId)}${v.orderTaken?' · '+money(v.orderTotal):''}${currentUser.role==='supervisor'?' · '+v.rep:''}\n`;
    if(v.notes) text += `   ${v.notes}\n`;
  });
  text += `\nTotal: ${rows.length} visits · ${money(rows.reduce((s,v)=>s+(v.orderTotal||0),0))}`;
  navigator.clipboard.writeText(text).then(()=>showToast('📋 Log copied')).catch(()=>showToast('Could not copy'));
}

function renderDoctorRows(c){
  if(!c.doctors.length) return `<div style="color:var(--muted); font-size:13px;">No doctors added yet.</div>`;
  return c.doctors.map(d=>{
    const pb = SPECIALTY_PLAYBOOK[d.title];
    return `<div class="doc-row row-between">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:34px; height:34px; border-radius:50%; background:${pb?pb.color+'1F':'var(--paper)'}; display:flex; align-items:center; justify-content:center; font-size:16px;">${pb?pb.icon:'👤'}</div>
        <div><div class="dname">${esc(d.name)}</div>${d.title?`<div class="dsub" style="color:${pb?pb.color:'var(--muted)'}; font-weight:600;">${esc(d.title)}</div>`:''}${docBadges(d)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:4px;">
        ${canViewClinic(c)?`<button class="chip small" onclick="event.stopPropagation(); _drBack=null; openDoctorRecord('${c.id}','${d.id}')">${I('pencil')} Card</button>`:''}
        ${pb?`<button class="chip small" onclick="event.stopPropagation(); openPlaybook('${d.title}')">Tips</button>`:''}
        <button class="del" onclick="removeDoctor('${c.id}','${d.id}')">&times;</button>
      </div>
    </div>`;
  }).join('');
}
// Adds every name typed in the box ("Dr. A, Dr. B" is two doctors, never one),
// reuses a record that already exists for that person instead of creating a
// twin, and returns the ids involved so the caller can select them.
function addDoctorsToClinic(c, input, title){
  const names = UMCore.splitDoctorNames(input);
  const ids = []; let added = 0, reused = 0;
  names.forEach(name => {
    const key = UMCore.normDoctorName(name);
    let d = (c.doctors || []).find(x => UMCore.normDoctorName(x.name) === key);
    if(d){ reused++; if(title && !d.title) d.title = title; }
    else { d = { id: uid(), name, title: title || '', phone:'', birthday:'', cadence:'', notes:'', handovers:[] }; c.doctors.push(d); added++; }
    ids.push(d.id);
  });
  return { ids, added, reused };
}
async function addDoctor(clinicId){
  const name = document.getElementById('newDocName').value.trim();
  if(!name){ showToast('Enter a doctor name'); return null; }
  const tEl = document.querySelector('#newDocTitleChips .chip.on');
  const title = tEl ? tEl.dataset.title : '';
  const c = clinics.find(x=>x.id===clinicId);
  if(!c || !canViewClinic(c)){ showToast('🔒 Not your clinic'); return null; }
  const r = addDoctorsToClinic(c, name, title);
  if(!r.ids.length){ showToast('Enter a doctor name'); return null; }
  if(r.added) await persist('clinics');
  // The clinic-detail sheet has this list; the quick-add sheet from Log visit doesn't
  const dl = document.getElementById('docListInModal');
  if(dl) dl.innerHTML = renderDoctorRows(c);
  document.getElementById('newDocName').value='';
  document.querySelectorAll('#newDocTitleChips .chip').forEach(c=>c.classList.remove('on'));
  showToast(r.added === 0 ? `👤 ${r.reused === 1 ? 'This doctor is already on the list — selected' : r.reused + ' doctors already on the list — selected'}`
    : r.added > 1 ? `🤝 ${r.added} doctors added${r.reused ? ` · ${r.reused} already listed` : ''}`
    : title ? '🤝 Doctor added — relationships compound'
    : '🤝 Added — tag their specialty in the Playbook so they count there');
  return r;
}
async function removeDoctor(clinicId, docId){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c || !canViewClinic(c)){ showToast('🔒 Not your clinic'); return; }
  c.doctors = c.doctors.filter(d=>d.id!==docId);
  tomb('doctors', clinicId + '|' + docId); // a stale copy of the clinic (this device or another) must not bring the doctor back
  await persist('clinics');
  const dl = document.getElementById('docListInModal'); if(dl) dl.innerHTML = renderDoctorRows(c);
}
async function saveProfileNotes(clinicId){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c || !canViewClinic(c)){ showToast('🔒 Not your clinic'); return; }
  c.profileNotes = document.getElementById('profileNotesEdit').value.trim();
  await persist('clinics');
  showToast('📝 Saved — future you will thank you');
}
async function addToPlan(clinicId){
  const today = todayStr();
  dayPlans[today] = dayPlans[today] || {};
  const arr = new Set(dayPlans[today][currentUser.name] || []);
  arr.add(clinicId);
  dayPlans[today][currentUser.name] = [...arr];
  await persist('dayPlans');
  closeModal();
  renderPlanList();
  showToast('Added to today\'s plan');
}
// Resolve a clinic name for display even after the clinic was deleted: the
// live list first, then the name stamped on the visit at delete time, then
// the recycle bin — "Unknown" only when the name is truly gone.
function clinicLabel(id, v){ return clinicNameOf(id, v); }
// Deleting a clinic stamps its name onto its logged visits, so their history
// stays readable forever — even after the recycle bin is purged.
async function stampVisitClinicName(id, name){
  let changed = false;
  visits.forEach(v=>{ if(v.clinicId===id && !v.clinicName){ v.clinicName = name; changed = true; } });
  if(changed) await persist('visits');
}
async function deleteClinic(id){
  if(!requireAdmin()) return;
  const c = clinics.find(x=>x.id===id);
  if(!c) return;
  const vCount = visits.filter(v=>v.clinicId===id).length;
  showModal(`
    <h3 style="margin-top:0;">Remove ${esc(c.name)}?</h3>
    ${vCount?`<div class="card" style="background:var(--amber-dim); margin-bottom:12px;">This clinic has <strong>${vCount}</strong> logged visit${vCount===1?'':'s'}. They stay in your reports.</div>`:''}
    <p style="color:var(--muted); font-size:13px;">It moves to the recycle bin and can be restored within ${BIN_DAYS} days.</p>
    <button class="btn" style="background:var(--coral);" onclick="confirmDeleteClinic('${id}')">Yes, remove</button>
    <button class="btn secondary" onclick="openClinicDetail('${id}')">Cancel</button>
  `);
}
async function confirmDeleteClinic(id){
  const c = clinics.find(x=>x.id===id);
  if(!c) return;
  if(!await moveToBin('clinics', c, c.name)) return; // no safety copy → no delete
  await stampVisitClinicName(id, c.name);
  tomb('clinics', id);
  clinics = clinics.filter(x=>x.id!==id);
  await persist('clinics');
  closeModal();
  renderAll();
  if(document.getElementById('clinicList')) renderClinics();
  showToast('Moved to recycle bin');
}

// ---- MISSING-CLINIC FINDER ----
// When backups can't bring a clinic back, the app still knows its name from
// somewhere: the recycle bin, the names stamped on its visits, the original
// factory list, or the customers inside the uploaded invoice files. This
// screen shows every name the system has ever seen that is NOT in the current
// list, and restores whichever ones the supervisor ticks — history intact
// where the original id survives.
function _mcNorm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g,' ').replace(/\s+/g,' ').trim(); }
function missingClinicCandidates(){
  const out = [];
  const seen = new Set();
  const haveNames = new Set(storedClinics().map(c=>_mcNorm(c.name)));
  const haveIds = new Set(storedClinics().map(c=>c.id));
  const take = (cand)=>{ const n=_mcNorm(cand.name); if(!n || haveNames.has(n) || seen.has(n) || isPlaceholderClinic(cand)) return; seen.add(n); out.push(cand); };
  // 1. the recycle bin — full clinic objects, deliberately deleted or swept there in the chaos
  (((recycleBin||{}).clinics)||[]).forEach(b=>{
    if(!b || haveIds.has(b.id)) return;
    take({src:'bin', label:'🗑️ في سلة المحذوفات', obj:b, name:b.name, rep:b.rep||'', key:'bin:'+b.id});
  });
  // 2. names stamped on visits whose clinic no longer exists — history rejoins on restore
  const stamped = {};
  visits.forEach(v=>{
    if(!v || !v.clinicId || haveIds.has(v.clinicId) || !v.clinicName) return;
    const s = (stamped[v.clinicId] = stamped[v.clinicId] || {name:v.clinicName, n:0, rep:v.rep||''}); s.n++;
  });
  Object.keys(stamped).forEach(id=>{
    const s = stamped[id];
    take({src:'visits', label:`🚗 له ${s.n} زيارة مسجلة`, id, name:s.name, rep:s.rep, key:'vis:'+id});
  });
  // 3. the original factory list
  CLINICS_SEED.forEach(c=>{
    if(haveIds.has(c.id)) return;
    take({src:'seed', label:'📋 من القائمة الأصلية', obj:c, name:c.name, rep:c.rep||'', key:'seed:'+c.id});
  });
  // 4. invoice customers that match no clinic (may include non-clinic accounts — unticked by default)
  const custs = {};
  erpPeriods().forEach(p=>erpViewRows(p).forEach(r=>{
    const cu = (r.customer||'').trim(); if(!cu) return;
    const key = _mcNorm(cu); if(!key || custs[key]) { if(custs[key]) custs[key].n++; return; }
    const m = UMCore.matchCustomer(cu, clinics, erpMap);
    if(m.clinicId || m.ignored || m.channel){ custs[key] = {skip:true, n:1}; return; }
    custs[key] = {name:cu, n:1, rep: UMCore.erpRowRep(r, clinics, erpMap, p.repMap||{}) || ''};
  }));
  Object.values(custs).forEach(cu=>{ if(!cu.skip) take({src:'erp', label:`🧾 عميل بالفواتير (${cu.n} سطر)`, name:cu.name, rep:cu.rep, key:'erp:'+_mcNorm(cu.name)}); });
  return out;
}
let _mcCands = [], _mcChecked = new Set();
function openMissingClinics(){
  if(!requireAdmin()) return;
  _mcCands = missingClinicCandidates();
  // bin / visits / factory candidates are almost certainly real clinics — pre-ticked
  _mcChecked = new Set(_mcCands.filter(x=>x.src!=='erp').map(x=>x.key));
  const ORDER = {bin:0, visits:1, seed:2, erp:3};
  _mcCands.sort((a,b)=>ORDER[a.src]-ORDER[b.src] || a.name.localeCompare(b.name));
  showModal(`
    <h3 style="margin-top:0;">🔍 العيادات الناقصة</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;">كل اسم يعرفه النظام وغير موجود في قائمتك الحالية. علّم ما تريد إرجاعه — عملاء الفواتير غير معلّمين تلقائيًا لأن بعضهم قد لا يكون عيادة.</p>
    ${_mcCands.length ? `
    <div class="chip-row" style="margin:8px 0;">
      <div class="chip small" onclick="_mcCands.forEach(x=>_mcChecked.add(x.key)); renderMcList();">تعليم الكل</div>
      <div class="chip small" onclick="_mcChecked.clear(); renderMcList();">إلغاء الكل</div>
    </div>
    <div id="mcList" style="max-height:300px; overflow-y:auto;"></div>
    <label style="margin-top:10px; font-size:12px;">مندوبة العيادات التي بلا مندوبة معروفة</label>
    <div class="chip-row" id="mcRep">${REPS.map((r,i)=>`<div class="chip small ${i===0?'on':''}" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>
    <button class="btn" style="margin-top:10px;" onclick="restoreMissingClinics()">✅ إرجاع المعلَّم (<span id="mcCount">0</span>)</button>`
    : `<div class="card" style="margin-top:8px;">🏆 لا يوجد أي اسم ناقص — كل ما يعرفه النظام موجود في قائمتك.</div>`}
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal()">إغلاق</button>
  `);
  renderMcList();
}
function renderMcList(){
  const el = document.getElementById('mcList');
  if(!el) return;
  el.innerHTML = _mcCands.map(x=>`
    <div class="row-between" style="padding:7px 4px; border-bottom:1px solid var(--line);">
      <label style="display:flex; align-items:center; gap:10px; flex:1; font-size:13px;">
        <input type="checkbox" ${_mcChecked.has(x.key)?'checked':''} onchange="if(this.checked)_mcChecked.add('${x.key}'); else _mcChecked.delete('${x.key}'); const c=document.getElementById('mcCount'); if(c)c.textContent=_mcChecked.size;">
        <span><b>${esc(x.name)}</b><br><span style="color:var(--muted); font-size:11px;">${x.label}${x.rep?' · '+esc(x.rep):''}</span></span>
      </label>
    </div>`).join('');
  const c = document.getElementById('mcCount');
  if(c) c.textContent = _mcChecked.size;
}
async function restoreMissingClinics(){
  if(!requireAdmin()) return;
  const picked = _mcCands.filter(x=>_mcChecked.has(x.key));
  if(!picked.length){ showToast('لم تعلّم شيئًا'); return; }
  const repEl = document.querySelector('#mcRep .chip.on');
  const fallbackRep = repEl ? repEl.dataset.rep : (REPS[0]||'');
  let binTouched = false;
  picked.forEach(x=>{
    const rep = x.rep || fallbackRep;
    if(x.src==='bin'){
      clinics.push(normalizeClinic(Object.assign({}, x.obj)));
      untomb('clinics', x.obj.id);
      recycleBin.clinics = (recycleBin.clinics||[]).filter(b=>!(b && b.id===x.obj.id));
      binTouched = true;
    } else if(x.src==='visits'){
      clinics.push(normalizeClinic({id:x.id, name:x.name, rep, cls:'B', notes:'رجعت من سجل الزيارات', addedOn:todayStr()}));
      untomb('clinics', x.id);
    } else if(x.src==='seed'){
      clinics.push(normalizeClinic(Object.assign({}, x.obj)));
      untomb('clinics', x.obj.id);
    } else {
      clinics.push(normalizeClinic({id:uid(), name:x.name, rep, cls:'B', notes:'أُنشئت من عملاء الفواتير', addedOn:todayStr()}));
    }
  });
  await persist('clinics');
  if(binTouched) await persist('recycleBin');
  closeModal();
  renderAll();
  if(document.getElementById('clinicList')) renderClinics();
  showToast(`✅ رجعت ${picked.length} عيادة`);
}

// ---- MANAGE CLINICS: bulk import from Excel/CSV + bulk delete ----
let _clinicImport = null;     // parsed preview {rows:[{data, dup, include}], defaultRep}
let _mgSelected = new Set();  // ids picked for bulk delete
function openManageClinics(){
  if(!requireAdmin()) return;
  _clinicImport = null; _mgSelected = new Set();
  showModal(`
    <h3 style="margin-top:0;">${I('settings')} Manage clinics</h3>
    <button class="btn" style="margin:6px 0 4px; background:var(--teal);" onclick="openMissingClinics()">🔍 العيادات الناقصة — افحص وأرجِع</button>
    <div class="section-title" style="margin-top:6px;">📥 Import clinics from Excel / CSV</div>
    <p style="color:var(--muted); font-size:12.5px; margin:0 0 8px;">Any sheet works: Arabic or English headers (اسم العيادة، رقم الهاتف، المندوبة…) — or just a plain list of names with phone numbers next to them. Duplicates are detected by name.</p>
    <label style="font-size:12px;">Assign imported clinics to</label>
    <div class="chip-row" id="ciRepChips" style="margin-bottom:8px;">${REPS.map((r,i)=>`<div class="chip small ${i===0?'on':''}" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>
    <p style="color:var(--muted); font-size:11.5px; margin:0 0 8px;">Used when the sheet has no rep column — a rep column in the file wins.</p>
    <input type="file" id="clinicSheet" accept=".xlsx,.xls,.csv,text/csv" onchange="handleClinicSheet(this)">
    <div id="ciPreview" style="margin-top:10px;"></div>

    <div class="section-title" style="margin-top:22px;">🗑️ Bulk delete</div>
    <p style="color:var(--muted); font-size:12.5px; margin:0 0 8px;">Deleted clinics go to the recycle bin (restorable for ${typeof BIN_DAYS!=='undefined'?BIN_DAYS:30} days). Their visit history stays in the log.</p>
    <input type="text" id="mgSearch" placeholder="Search clinics…" oninput="renderMgList()">
    <div class="chip-row" style="margin:8px 0;">
      <div class="chip small" onclick="mgSelectVisible(true)">Select all shown</div>
      <div class="chip small" onclick="mgSelectVisible(false)">Clear selection</div>
    </div>
    <div id="mgList" style="max-height:280px; overflow-y:auto;"></div>
    <button class="btn" style="background:var(--coral); margin-top:10px;" onclick="bulkDeleteClinics()">Delete selected (<span id="mgCount">0</span>)</button>
  `);
  renderMgList();
}
function mgVisible(){
  const q = (document.getElementById('mgSearch')?.value||'').toLowerCase().trim();
  return clinics.filter(c=>!q || c.name.toLowerCase().includes(q));
}
function renderMgList(){
  const el = document.getElementById('mgList');
  if(!el) return;
  el.innerHTML = mgVisible().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`
    <div class="row-between" style="padding:8px 4px; border-bottom:1px solid var(--line);">
      <label style="display:flex; align-items:center; gap:10px; flex:1; font-size:13.5px;">
        <input type="checkbox" ${_mgSelected.has(c.id)?'checked':''} onchange="mgToggle('${c.id}', this.checked)">
        <span><b>${esc(c.name)}</b> <span style="color:var(--muted); font-size:11.5px;">· ${esc(c.rep||'—')} · ${c.cls||'—'} · ${visits.filter(v=>v.clinicId===c.id).length} visits</span></span>
      </label>
    </div>`).join('') || '<div class="empty">No clinics match.</div>';
  const cnt = document.getElementById('mgCount');
  if(cnt) cnt.textContent = _mgSelected.size;
}
function mgToggle(id, on){ if(on) _mgSelected.add(id); else _mgSelected.delete(id); const c=document.getElementById('mgCount'); if(c) c.textContent=_mgSelected.size; }
function mgSelectVisible(on){ mgVisible().forEach(c=>{ if(on) _mgSelected.add(c.id); else _mgSelected.delete(c.id); }); renderMgList(); }
async function bulkDeleteClinics(){
  if(!requireAdmin()) return;
  if(!_mgSelected.size){ showToast('Nothing selected'); return; }
  if(!confirm(`Delete ${_mgSelected.size} clinic(s)? They move to the recycle bin and can be restored for a while.`)) return;
  const removed = new Set();
  for(const id of _mgSelected){
    const c = clinics.find(x=>x.id===id);
    if(!c) continue;
    if(!await moveToBin('clinics', c, c.name)) break; // the bin is unreachable: stop here, nothing else is deleted
    await stampVisitClinicName(id, c.name); tomb('clinics', id); removed.add(id);
  }
  if(removed.size < _mgSelected.size) showToast(`⚠️ ${removed.size} of ${_mgSelected.size} moved to the bin — retry the rest when the connection is back`);
  clinics = clinics.filter(c=>!removed.has(c.id));
  _mgSelected = new Set();
  if(!removed.size){ renderMgList(); return; }
  await persist('clinics', {allowShrink:true}); // explicit, confirmed bulk delete
  renderMgList(); renderAll();
  if(document.getElementById('clinicList')) renderClinics();
  showToast('🗑️ Moved to recycle bin');
}
async function handleClinicSheet(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const prev = document.getElementById('ciPreview');
  prev.innerHTML = '<div style="color:var(--muted); font-size:13px;">Reading file…</div>';
  try{
    let rows = null;
    if(/\.(xlsx|xls)$/i.test(f.name)){
      const sheets = await UMCore.readXlsx(await f.arrayBuffer());
      // pick the sheet that yields the most clinics
      let best = null;
      for(const sh of sheets){
        const r = UMCore.parseClinicRows(sh.rows);
        if(!r.error && (!best || r.clinics.length > best.clinics.length)) best = r;
      }
      if(!best){ prev.innerHTML = '<div style="color:var(--coral-ink); font-size:13px;">No clinic names recognized in this file.</div>'; return; }
      rows = best;
    } else {
      const text = await f.text();
      rows = UMCore.parseClinicRows(UMCore.parseCsvText(text));
      if(rows.error){ prev.innerHTML = '<div style="color:var(--coral-ink); font-size:13px;">No clinic names recognized in this file.</div>'; return; }
    }
    const norm = n => UMCore.normClinicName(n);
    const existing = new Map(clinics.map(c=>[norm(c.name), c]));
    const list = rows.clinics.map(d=>({data:d, dup: existing.get(norm(d.name)) || null, include: true}));
    _clinicImport = { rows: list };
    const dups = list.filter(x=>x.dup).length;
    prev.innerHTML = `
      <div class="card" style="background:var(--teal-dim);">
        <div style="font-weight:700; font-size:13.5px;">Found ${list.length} clinics — ${list.length-dups} new · ${dups} already exist</div>
        <div style="font-size:12px; color:var(--muted); margin-top:3px;">Existing clinics are skipped; tick "update" to refresh their phone & contact from the sheet.</div>
        <label style="display:flex; gap:8px; align-items:center; font-size:12.5px; margin-top:8px;"><input type="checkbox" id="ciUpdateDups"> Update phone/contact for existing clinics</label>
      </div>
      <div style="max-height:220px; overflow-y:auto; margin-top:8px;">
        ${list.slice(0,60).map((x,i)=>`
          <div class="row-between" style="padding:7px 4px; border-bottom:1px solid var(--line); font-size:13px;">
            <label style="display:flex; gap:9px; align-items:center; flex:1;">
              <input type="checkbox" checked onchange="_clinicImport.rows[${i}].include=this.checked">
              <span><b>${esc(x.data.name)}</b><span style="color:var(--muted); font-size:11.5px;"> ${x.data.phone?'· '+esc(x.data.phone):''}${x.data.rep?' · '+esc(x.data.rep):''}${x.data.cls?' · '+x.data.cls:''}</span></span>
            </label>
            ${x.dup?'<span class="rep-tag" style="flex-shrink:0;">exists</span>':'<span style="color:var(--sage-ink); font-size:11px; flex-shrink:0;">new</span>'}
          </div>`).join('')}
        ${list.length>60?`<div style="color:var(--muted); font-size:12px; text-align:center; padding:6px;">+${list.length-60} more (all included)</div>`:''}
      </div>
      <button class="btn" style="margin-top:10px;" onclick="commitClinicImport()">Add clinics</button>`;
  }catch(e){
    console.error(e);
    prev.innerHTML = '<div style="color:var(--coral-ink); font-size:13px;">Could not read this file — save it as .xlsx or .csv and retry.</div>';
  }
}
async function commitClinicImport(){
  if(!requireAdmin() || !_clinicImport) return;
  const repEl = document.querySelector('#ciRepChips .chip.on');
  const defaultRep = repEl ? repEl.dataset.rep : REPS[0];
  const updateDups = !!document.getElementById('ciUpdateDups')?.checked;
  const repByLower = new Map(REPS.map(r=>[r.toLowerCase(), r]));
  let added = 0, updated = 0, skipped = 0;
  _clinicImport.rows.forEach(x=>{
    if(!x.include){ skipped++; return; }
    const d = x.data;
    if(x.dup){
      if(updateDups){
        if(d.phone) x.dup.phone = d.phone;
        if(d.contact) x.dup.contact = d.contact;
        updated++;
      } else skipped++;
      return;
    }
    const rep = repByLower.get((d.rep||'').toLowerCase()) || defaultRep;
    clinics.push(normalizeClinic({id:uid(), name:d.name, rep, cls:d.cls, market:d.market,
      account:d.account, phone:d.phone, contact:d.contact, notes:'', isNew:false, addedOn:todayStr()}));
    added++;
  });
  await persist('clinics');
  closeModal();
  renderAll();
  if(document.getElementById('clinicList')) renderClinics();
  showToast(`✅ ${added} added${updated?` · ${updated} updated`:''}${skipped?` · ${skipped} skipped`:''}`);
}

