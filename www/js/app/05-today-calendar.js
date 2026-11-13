// calendar, targets, missed plans, dormant clinics, today plan, planner
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- CALENDAR ----
const EVENT_TYPES = ['Meeting','Training','Conference','Marketing','Personal','Other'];
function calDayData(d){
  return UMCore.calendarDayItems(d, calRepFilter, {visits, clinics, tasks, events, dayPlans});
}
function setCalRepFilter(r){ calRepFilter = ownRepOnly(r); renderAll(); renderCalendar(); }
function setCalMode(m){
  calMode = m;
  document.getElementById('calModeMonth').classList.toggle('on', m==='month');
  document.getElementById('calModeWeek').classList.toggle('on', m==='week');
  renderCalendar();
}
function shiftCal(dir){
  const d = new Date(calAnchor+'T00:00:00');
  if(calMode==='month') d.setMonth(d.getMonth()+dir, 1);
  else d.setDate(d.getDate()+dir*7);
  calAnchor = localDateStr(d);
  renderCalendar();
}
function calGoToday(){ calAnchor = todayStr(); calSelected = todayStr(); renderCalendar(); }
function selectCalDay(d){ calSelected = d; renderCalendar(); }
function calDots(info){
  const dots = [];
  // planned = hollow (not done yet), everything else = filled
  if(info.planned.length) dots.push('background:transparent; box-shadow:inset 0 0 0 1.5px var(--green);');
  if(info.visits.length) dots.push('background:var(--sage);');
  if(info.followUps.length) dots.push('background:var(--amber);');
  if(info.tasks.length) dots.push('background:var(--purple);');
  if(info.events.length) dots.push('background:#3478F6;');
  return dots.map(c=>`<i style="${c}"></i>`).join('');
}
function renderCalendar(){
  if(!calAnchor) calAnchor = todayStr();
  if(!calSelected) calSelected = todayStr();
  const body = document.getElementById('calBody');
  if(!body) return;
  const label = document.getElementById('calRangeLabel');
  const DOW = uiLang === 'ar' ? ['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت']
                             : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if(calMode==='month'){
    const dates = getMonthDates(calAnchor);
    const first = new Date(dates[0]+'T00:00:00');
    label.textContent = first.toLocaleDateString(uiLocale(),{month:'long', year:'numeric'});
    let html = `<div class="cal-dow">${DOW.map(d=>`<span>${d}</span>`).join('')}</div><div class="cal-grid">`;
    for(let i=0;i<first.getDay();i++) html += `<button class="cal-cell other" tabindex="-1"></button>`;
    for(const d of dates){
      const info = calDayData(d);
      const n = parseInt(d.slice(8),10);
      const wkend = !UMCore.isWorkday(d); // Fri/Sat — the weekend
      const cls = ['cal-cell', d===todayStr()?'today':'', d===calSelected?'sel':'', wkend?'wkend':''].join(' ');
      html += `<button class="${cls}" onclick="selectCalDay('${d}')"><span>${n}</span><span class="cal-dots">${calDots(info)}</span></button>`;
    }
    html += '</div>';
    body.innerHTML = html;
  } else {
    const dates = getWeekDates(calAnchor);
    const f = new Date(dates[0]+'T00:00:00'), l = new Date(dates[6]+'T00:00:00');
    label.textContent = `${f.toLocaleDateString(uiLocale(),{month:'short',day:'numeric'})} – ${l.toLocaleDateString(uiLocale(),{month:'short',day:'numeric'})}`;
    body.innerHTML = dates.map(d=>{
      const info = calDayData(d);
      const dt = new Date(d+'T00:00:00');
      const isSel = d===calSelected, isToday = d===todayStr();
      const counts = [
        info.planned.length ? `<span style="color:var(--green);">${info.planned.length} planned</span>` : '',
        info.visits.length ? `<span style="color:var(--sage-ink);">${info.visits.length} visited</span>` : '',
        info.followUps.length ? `<span style="color:var(--amber-ink);">${info.followUps.length} follow-up${info.followUps.length>1?'s':''}</span>` : '',
        info.tasks.length ? `<span style="color:var(--purple-ink);">${info.tasks.length} task${info.tasks.length>1?'s':''}</span>` : '',
        info.events.length ? `<span style="color:#3478F6;">${info.events.length} event${info.events.length>1?'s':''}</span>` : '',
      ].filter(Boolean).join(' · ');
      return `<div class="card clickable" onclick="selectCalDay('${d}')" style="margin-bottom:6px; padding:10px 14px; ${isSel?'border-color:var(--green); border-width:1.5px;':''}">
        <div class="row-between">
          <div>
            <div style="font-weight:700; font-size:13.5px;">${dt.toLocaleDateString(uiLocale(),{weekday:'short', month:'short', day:'numeric'})}${isToday?' · Today':''}</div>
            <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${counts || 'Nothing scheduled'}</div>
          </div>
          <span class="cal-dots" style="height:auto;">${calDots(info)}</span>
        </div>
      </div>`;
    }).join('');
  }
  renderCalAgenda();
}
function renderCalAgenda(){
  const el = document.getElementById('calAgenda');
  if(!el) return;
  const d = calSelected;
  const dt = new Date(d+'T00:00:00');
  document.getElementById('calAgendaTitle').textContent = dt.toLocaleDateString(uiLocale(),{weekday:'long', month:'long', day:'numeric'});
  const info = calDayData(d);
  const cname = id => clinicLabel(id);
  const repTag = r => calRepFilter==='all' ? ` <span style="color:var(--muted); font-weight:400;">· ${esc(r)}</span>` : '';
  const rows = [];
  info.events.forEach(ev=>{
    rows.push(`<div class="cal-item clickable" onclick="openEditEvent('${ev.id}')">
      <span class="tag" style="background:#E8F0FE; color:#3478F6;">EVENT</span>
      <div style="flex:1;">
        <div style="font-size:14px; font-weight:600;">${esc(ev.title)}${ev.rep==='all'?' <span style="color:var(--muted); font-weight:400;">· Whole team</span>':repTag(ev.rep)}</div>
        <div style="font-size:12px; color:var(--muted);">${ev.time?esc(ev.time)+' · ':''}${esc(ev.type)}${ev.notes?' · '+esc(ev.notes):''}</div>
      </div>
    </div>`);
  });
  info.planned.forEach(p=>{
    rows.push(`<div class="cal-item clickable" onclick="calOpenPlanner('${d}')">
      <span class="tag" style="background:var(--green-dim); color:var(--green);">PLAN</span>
      <div style="flex:1;">
        <div style="font-size:14px; font-weight:600;">${esc(cname(p.clinicId))}${repTag(p.rep)}</div>
        ${p.note?`<div style="font-size:12px; color:var(--muted);">${esc(p.note)}</div>`:''}
      </div>
    </div>`);
  });
  info.followUps.forEach(c=>{
    rows.push(`<div class="cal-item clickable" onclick="openClinicDetail('${c.id}')">
      <span class="tag" style="background:var(--amber-dim); color:var(--amber-ink);">FOLLOW-UP</span>
      <div style="flex:1;">
        <div style="font-size:14px; font-weight:600;">${esc(c.name)}${repTag(c.rep)}</div>
        <div style="font-size:12px; color:var(--muted);">${statusLabel(c.nextFollowUp)}</div>
      </div>
    </div>`);
  });
  info.visits.forEach(v=>{
    const kind = v.callOnly ? 'CALL' : v.orderOnly ? 'ORDER' : 'VISITED';
    rows.push(`<div class="cal-item clickable" onclick="openClinicDetail('${v.clinicId}')">
      <span class="tag" style="background:var(--sage-dim); color:var(--sage-ink);">${kind}</span>
      <div style="flex:1;">
        <div style="font-size:14px; font-weight:600;">${esc(cname(v.clinicId))}${repTag(v.rep)}${jointTag(v)}</div>
        <div style="font-size:12px; color:var(--muted);">${v.orderTaken?'Order taken · '+money(v.orderTotal||0):(v.callOnly?'Remote follow-up':'No order')}${rxShortHTML(v)}</div>
        ${(v.photos&&v.photos.length)?`<div class="photo-row">${v.photos.map(ph=>`<img class="photo-thumb" src="${ph.thumb}" data-cap="${esc(cname(v.clinicId))}" onclick="event.stopPropagation(); showLightbox('${ph.id}', this.dataset.cap)">`).join('')}</div>${photoWaitHTML(v)}`:''}
      </div>
    </div>`);
  });
  info.tasks.forEach(t=>{
    rows.push(`<div class="cal-item">
      <span class="tag" style="background:var(--purple-dim); color:var(--purple-ink);">TASK</span>
      <div style="flex:1;">
        <div style="font-size:14px; font-weight:600;">${esc(t.text)}${repTag(t.rep)}</div>
      </div>
      <button class="chip small" style="flex-shrink:0;" onclick="calDoneTask('${t.id}')">Done</button>
    </div>`);
  });
  el.innerHTML = `
    <div class="card">
      <div style="display:flex; gap:8px; margin-bottom:${rows.length?'6px':'0'};">
        <button class="btn secondary" style="flex:1; padding:10px;" onclick="openAddEvent('${d}')">+ Event</button>
        <button class="btn secondary" style="flex:1; padding:10px;" onclick="calOpenPlanner('${d}')">+ Plan visits</button>
      </div>
      ${rows.join('') || `<div style="color:var(--muted); font-size:13px; text-align:center; padding:8px 0 2px;">Nothing scheduled this day yet.</div>`}
    </div>`;
}
function calRangePreset(kind){
  const today = todayStr();
  let from, to;
  if(kind==='week'){ const w = getWeekDates(today); from = w[0]; to = w[6]; }
  else if(kind==='month'){ const m = getMonthDates(today); from = m[0]; to = m[m.length-1]; }
  else if(kind==='lastmonth'){
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1);
    const m = getMonthDates(localDateStr(d)); from = m[0]; to = m[m.length-1];
  }
  else{ // next7
    from = today;
    const d = new Date(); d.setDate(d.getDate()+6); to = localDateStr(d);
  }
  document.getElementById('calFrom').value = from;
  document.getElementById('calTo').value = to;
  renderCalRangeSummary();
}
function renderCalRangeSummary(){
  const from = document.getElementById('calFrom').value;
  const to = document.getElementById('calTo').value;
  const el = document.getElementById('calRangeResult');
  const det = el && el.closest('details');
  if(det) det.open = true; // results must never land inside a folded section
  if(!from || !to){ showToast('Pick both dates'); return; }
  if(from > to){ showToast('"From" must be before "To"'); return; }
  const s = UMCore.rangeSummary(from, to, calRepFilter, {visits, clinics, tasks, events, dayPlans});
  const tile = (n, l) => `<div style="background:var(--paper); border-radius:10px; padding:10px 6px; text-align:center;">
    <div style="font-size:19px; font-weight:800; color:var(--green);">${n}</div>
    <div style="font-size:10.5px; color:var(--muted); line-height:1.3;">${l}</div></div>`;
  const repRows = (calRepFilter==='all' && s.perRep.length>1)
    ? `<div style="margin-top:10px;">${s.perRep.map(r=>`
        <div class="row-between" style="font-size:12.5px; padding:5px 0; border-bottom:1px solid var(--line);">
          <span style="font-weight:600;">${esc(r.rep)}</span>
          <span style="color:var(--muted);">${r.visits} visit${r.visits===1?'':'s'} · ${r.contacts} contact${r.contacts===1?'':'s'} · ${r.orders} order${r.orders===1?'':'s'} · ${money(r.revenue)}</span>
        </div>`).join('')}</div>`
    : '';
  el.innerHTML = `
    <div style="font-weight:700; font-size:13px; margin:10px 0 8px;">${fmtDate(from)} – ${fmtDate(to)}${calRepFilter!=='all' ? ' · '+esc(calRepFilter) : ' · Whole team'}</div>
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">
      ${tile(s.fieldVisits, 'Visits')}
      ${tile(s.orders, 'Orders')}
      ${tile(money(s.revenue), 'Sales')}
      ${tile(s.conversion+'%', 'Conversion')}
    </div>
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:6px;">
      ${tile(s.contacts, 'Contacts seen')}
      ${tile(s.clinicsCovered, 'Clinics covered')}
      ${tile(s.calls, 'Calls')}
      ${tile(s.planned, 'Planned visits')}
    </div>
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:6px;">
      ${tile(s.events, 'Events')}
      ${tile(s.followUpsDue, 'Follow-ups due')}
      ${tile(s.tasksDue, 'Open tasks due')}
    </div>
    ${repRows}
    <button class="btn secondary" style="margin-top:12px; padding:11px;" onclick="openReportForRange('${from}','${to}')">Open this period in Report →</button>`;
}
async function calDoneTask(id){
  const t = tasks.find(x=>x.id===id);
  if(t){ t.done = true; await persist('tasks'); renderToday(); renderCalendar(); }
}
function calOpenPlanner(d){
  planViewRep = (calRepFilter!=='all') ? calRepFilter : currentUser.name;
  openDatePlanner(d);
}
function openAddEvent(dateStr){ openEventForm(null, dateStr); }
function openEditEvent(id){
  const ev = events.find(e=>e.id===id);
  if(!ev) return;
  if(currentUser.role!=='supervisor' && ev.rep!==currentUser.name){ showToast('🔒 Only its owner can edit this event'); return; }
  openEventForm(ev, ev.date);
}
function openEventForm(ev, dateStr){
  const isNew = !ev;
  const repOpts = currentUser.role==='supervisor'
    ? ['all', ...REPS].map(r=>`<option value="${esc(r)}" ${ev&&ev.rep===r?'selected':(!ev&&r==='all'?'selected':'')}>${r==='all'?'Whole team':esc(r)}</option>`).join('')
    : `<option value="${esc(currentUser.name)}" selected>${esc(currentUser.name)}</option>`;
  showModal(`
    <h3 style="margin-top:0;">${isNew?'New event':'Edit event'}</h3>
    <label>Title</label>
    <input type="text" id="evTitle" placeholder="e.g. Dental conference, team meeting..." value="${ev?esc(ev.title):''}">
    <label>Date</label>
    <input type="date" id="evDate" value="${dateStr}">
    <label>Time (optional)</label>
    <input type="time" id="evTime" value="${ev&&ev.time?esc(ev.time):''}">
    <label>Type</label>
    <select id="evType">${EVENT_TYPES.map(t=>`<option value="${esc(t)}" ${ev&&ev.type===t?'selected':''}>${t}</option>`).join('')}</select>
    <label>Who is it for?</label>
    <select id="evRep">${repOpts}</select>
    <label>Notes (optional)</label>
    <input type="text" id="evNotes" dir="auto" placeholder="Location, agenda, what to bring..." value="${ev&&ev.notes?esc(ev.notes):''}">
    <button class="btn" onclick="saveEventForm('${ev?ev.id:''}')">${isNew?'Add to calendar':'Save changes'}</button>
    ${isNew?'':`<button class="btn secondary" style="margin-top:8px; color:var(--coral-ink);" onclick="deleteEvent('${ev.id}')">Delete event</button>`}
  `);
}
async function saveEventForm(id){
  const title = document.getElementById('evTitle').value.trim();
  const date = document.getElementById('evDate').value;
  if(!title){ showToast('Give the event a title'); return; }
  if(!date){ showToast('Pick a date'); return; }
  const data = {
    title, date,
    time: document.getElementById('evTime').value || '',
    type: document.getElementById('evType').value,
    rep: document.getElementById('evRep').value,
    notes: document.getElementById('evNotes').value.trim(),
  };
  if(id){
    const ev = events.find(e=>e.id===id);
    if(ev) Object.assign(ev, data);
  } else {
    events.push(Object.assign({id:uid(), createdBy: currentUser.name, created: todayStr()}, data));
  }
  await persist('events');
  closeModal();
  showToast(id?'Event updated':'Event added 📅');
  calSelected = date;
  renderCalendar();
}
async function deleteEvent(id){
  const ev = events.find(e=>e.id===id);
  if(ev && currentUser.role!=='supervisor' && ev.rep!==currentUser.name){ showToast('🔒 Only its owner can delete this event'); return; }
  if(!confirm('Delete this event?')) return;
  tomb('events', id);
  events = events.filter(e=>e.id!==id);
  await persist('events');
  closeModal();
  renderCalendar();
}

let activeView = 'today';
// Products / Playbook / Team are full screens reached from More — the More
// nav button stays highlighted while inside them.
const MORE_CHILDREN = ['products', 'playbook', 'team', 'clanalysis', 'doctors', 'more'];
function renderView(name){
  if(name==='today') renderToday();
  if(name==='log') prepLogView();
  if(name==='calendar') renderCalendar();
  if(name==='clinics') setClinicMode(clinicMode);
  if(name==='products') renderProducts();
  if(name==='playbook') renderPlaybookGrid();
  if(name==='clanalysis') renderClinicAnalysis();
  if(name==='doctors') renderDoctorsDb();
  if(name==='team'){ setTeamTab(teamTab); loadTeam().then(()=>{ if(teamTab==='mem') renderMemories(); else renderChat(); }); }
  if(name==='reports') renderReports();
  if(name==='more') renderMore();
}
function switchView(name){
  activeView = name;
  // The full greeting header belongs to Today; other views keep a slim strip
  document.body.classList.toggle('not-today', name!=='today');
  document.body.classList.toggle('on-today', name==='today');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  const navName = MORE_CHILDREN.includes(name) ? 'more' : name;
  document.querySelectorAll('nav.bottom button').forEach(b=>b.classList.toggle('active', b.dataset.view===navName));
  renderView(name);
}
function renderMore(){
  const el = document.getElementById('moreContent');
  if(!el) return;
  const sup = currentUser.role==='supervisor';
  const tile = (icon, name, sub, action) => `
    <div class="card clickable" style="padding:13px 15px; margin-bottom:8px;" onclick="${action}">
      <div style="display:flex; align-items:center; gap:13px;">
        <div style="font-size:21px; width:30px; text-align:center;">${icon}</div>
        <div style="flex:1;">
          <div style="font-weight:700; font-size:14.5px;">${name}</div>
          <div style="color:var(--muted); font-size:12px;">${sub}</div>
        </div>
        <span style="color:var(--muted);">›</span>
      </div>
    </div>`;
  el.innerHTML = `
    <div class="section-title">Reference</div>
    ${tile(I('package'),'Products & prices','Catalog, prices and specs',"switchView('products')")}
    ${tile(I('target'),'Clinic sales analysis','Per-clinic targets, purchases and next moves',"switchView('clanalysis')")}
    ${tile(I('chart'),'Product movement','Every brand → its products ranked by real sales: fast, mid, slow','openProductMovement()')}
    ${tile(I('stethoscope'),'Doctors database','Profiles, birthdays, follow-up rhythm & prescriptions',"switchView('doctors')")}
    ${tile(I('clipboard'),'Doctor records','Who is who in every clinic — fill one card per doctor','openDoctorRecords()')}
    ${tile(I('book'),'Selling playbook','Tips per doctor specialty',"switchView('playbook')")}
    ${tile(I('layers'),'Category guides','How to sell every category','openCategoryGuides()')}
    <div class="section-title">Team</div>
    ${tile(I('chat'),'Team chat & memories','Messages and shared photos',"switchView('team')")}
    ${tile(I('award'),'Achievements','Badges, streaks and milestones','openAchievements()')}
    <div class="section-title">Tools</div>
    ${tile(I('share'),'Export & share','CSV files and report sharing','openExport()')}
    ${sup ? tile(I('chart'),'Weekly management deck','PowerPoint for the Thursday meeting (supervisor)','openWeeklyDeck()') : ''}
    ${tile(I('target'),'KPI scorecard','The 10 measures management follows, score out of 100','openKpiScorecard()')}
    ${tile(I('chart'),'Month by month','Sales, field work and KPI against earlier months','openMonthByMonth()')}
    ${tile(I('clipboard'),'Requests, escalations & stands','Log client requests, escalations and stands','openClientLog()')}
    ${tile(I('bot'),'Assistant','Ask anything about your data','openAssistant()')}
    ${sup ? tile(I('download'),'ERP import','Sales & targets files (supervisor)','openErpImport()') : ''}
    ${sup ? tile(I('settings'),'Admin panel','Team, targets & data (supervisor)','openAdminPanel()') : ''}
    <div style="text-align:center; color:rgba(255,255,255,.5); font-size:11px; margin-top:14px;">UltraMed Clinical Sales Team · ${APP_REV}</div>`;
}

function followStatus(dateStr){ return UMCore.followStatus(dateStr, todayStr()); }
function statusLabel(dateStr){
  const s = followStatus(dateStr);
  if(s==='none') return 'No follow-up set';
  if(s==='overdue') return `Overdue · was due ${fmtDate(dateStr)}`;
  if(s==='today') return 'Due today';
  return `Due ${fmtDate(dateStr)}`;
}

function renderAll(){
  const now = new Date();
  document.getElementById('dateLabel').textContent =
    now.toLocaleDateString(uiLang==='ar' ? 'ar-KW-u-nu-latn' : 'en-US', {weekday:'long', month:'long', day:'numeric'});
  const hr = now.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  // "Dr. Ghaith" must greet as "Dr. Ghaith", not a bare "Dr."
  const firstWord = currentUser.name.split(' ')[0];
  const shortName = /^(dr|prof|mr|mrs|ms)\.?$/i.test(firstWord) ? currentUser.name : firstWord;
  document.getElementById('greeting').textContent = `${greet}, ${uiLang === 'ar' ? wdArNames(shortName) : shortName}`;
  const stamp = document.getElementById('headerStamp');
  stamp.childNodes[0].textContent = initials(currentUser.name);
  stamp.classList.toggle('sup', currentUser.role==='supervisor');
  const adminBtn = document.getElementById('adminPanelBtn');
  if(adminBtn) adminBtn.style.display = currentUser.role==='supervisor' ? 'block' : 'none';
  const erpBtn = document.getElementById('erpImportBtn');
  if(erpBtn) erpBtn.style.display = currentUser.role==='supervisor' ? '' : 'none';
  const mgBtn = document.getElementById('manageClinicsBtn');
  if(mgBtn) mgBtn.style.display = currentUser.role==='supervisor' ? '' : 'none';
  const fab = document.getElementById('aiFab');
  if(fab) fab.style.display = 'flex';

  const chipsFor = (containerId, current, setter) => {
    const el = document.getElementById(containerId);
    const opts = currentUser.role==='supervisor' ? ['all', ...REPS] : [currentUser.name];
    const seen = new Set();
    el.innerHTML = opts.filter(o=>{ if(seen.has(o)) return false; seen.add(o); return true; })
      .map(o=>`<div class="chip small ${current===o?'on':''}" onclick="${setter}('${o}')">${o==='all'?'All':o}</div>`).join('');
  };
  chipsFor('clinicRepFilter', clinicRepFilter, 'setClinicRepFilter');
  chipsFor('reportRepFilter', reportRepFilter, 'setReportRepFilter');
  chipsFor('calRepFilter', calRepFilter, 'setCalRepFilter');

  // Only the open tab re-renders — repainting all eight views on every save
  // made each interaction slower as the data grew. The visit form is state,
  // not a projection, so on the Log tab only its history list refreshes.
  if(activeView === 'log') renderLogHistory();
  else renderView(activeView);
}
function setClinicRepFilter(v){ clinicRepFilter=ownRepOnly(v); renderAll(); setClinicMode(clinicMode); }
function setReportRepFilter(v){ reportRepFilter=ownRepOnly(v); renderAll(); renderReports(); }

function visibleDueClinics(){
  let list = clinics.filter(c => c.cls !== 'Closed' && ['overdue','today'].includes(followStatus(c.nextFollowUp)));
  if(currentUser.role==='rep') list = list.filter(c=>c.rep===currentUser.name);
  return list.sort((a,b)=> (a.nextFollowUp||'').localeCompare(b.nextFollowUp||''));
}
function visibleTasks(){
  if(currentUser.role==='supervisor') return tasks;
  return tasks.filter(t=>t.rep===currentUser.name || t.rep==='Team');
}
function visibleVisits(){
  if(currentUser.role==='supervisor') return visits;
  return visits.filter(v=>v.rep===currentUser.name || v.withRep===currentUser.name);
}
// ---- ACCOUNT SEPARATION ----
// Reps are hard-scoped to their own book of business: they can neither see
// nor act on another rep's clinics or data. The supervisor sees everything.
function canViewClinic(c){ return currentUser.role==='supervisor' || !c || !c.rep || c.rep===currentUser.name; }
// A rep filter value coming from the UI (or console) collapses to the rep's
// own name for non-supervisors, so no setter can widen their view.
function ownRepOnly(v){ return currentUser.role==='supervisor' ? v : currentUser.name; }
// Both participants of a joint visit (and the supervisor) may edit it.
function canEditVisit(v){
  return currentUser.role==='supervisor' || v.rep===currentUser.name || v.withRep===currentUser.name;
}
function jointTag(v){ return v.withRep ? ` <span style="color:var(--muted);">🤝 with ${esc(v.withRep)}</span>` : ''; }
function contactNames(v, clinic){
  const ids = Array.isArray(v.doctorIds) && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : []);
  if(!ids.length) return '';
  const docs = (clinic && clinic.doctors) || [];
  return ids.map(id=>{ const d = docs.find(x=>x.id===id); return d ? d.name : null; }).filter(Boolean).join(', ');
}
// Records flagged orderOnly are phone/remote orders, not field visits.
// They count toward revenue but must not inflate visit counts.
function isFieldVisit(v){ return UMCore.isFieldVisit(v); }
function visibleFieldVisits(){ return visibleVisits().filter(isFieldVisit); }

// ---- MONTHLY TARGETS ----
// Birthdays coming up + doctors whose follow-up rhythm is overdue — the
// "care by occasion" surface, one tap from the home screen.
function renderOccasionsCard(){
  const el = document.getElementById('occasionsCard');
  if(!el) return;
  const lr = msListRep();                         // a person's screen: her doctors
  const repFilter = lr || (currentUser.role==='supervisor' ? 'all' : currentUser.name);
  let docs = [];
  try{ docs = UMCore.doctorAnalytics({clinics: clinics.filter(c=>canViewClinic(c) && (!lr || c.rep===lr)), visits, today: todayStr(), repFilter}); }catch(e){}
  const bdays = docs.filter(d=>d.birthdayIn!=null && d.birthdayIn<=7).sort((a,b)=>a.birthdayIn-b.birthdayIn);
  const due = docs.filter(d=>d.cadenceStatus==='due').length;
  if(!bdays.length && !due){ el.innerHTML=''; return; }
  el.innerHTML = `<div class="card clickable" style="margin-bottom:14px; border-inline-start:4px solid var(--gold);" onclick="switchView('doctors')">
    <div style="font-weight:700; font-size:13.5px;">${I('gift')} Occasions & follow-ups</div>
    ${bdays.slice(0,3).map(d=>`<div style="font-size:12.5px; padding:2px 0;">🎂 <b dir="auto">${esc(d.name)}</b> <span dir="auto">(${esc(d.clinicName)})</span> — <span>${d.birthdayIn===0?'birthday TODAY!':'in '+d.birthdayIn+' day'+(d.birthdayIn===1?'':'s')}</span></div>`).join('')}
    ${due?`<div style="font-size:12.5px; padding:2px 0;">⏰ <span>${due} doctor${due===1?'':'s'} overdue for a scheduled visit</span></div>`:''}
    <div style="color:var(--muted); font-size:11px; margin-top:3px;">Open the doctors database ›</div>
  </div>`;
}
// Someone invoiced at a clinic that belongs to another rep: the sale counts
// for the clinic's owner (shared accounts aside) — say so, invoice by clinic.
// `rep`: one person's screen shows the invoices she issued or that count for her.
function crossInvoiceNote(rep){
  // A notice must never take the Today screen down with it: an older cached
  // core.js (a release race) or odd data shows no notice instead of a blank page.
  try{ return crossInvoiceNoteHTML(rep); }catch(e){ console.error('cross-invoice notice', e); return ''; }
}
function crossInvoiceNoteHTML(rep){
  const sup = currentUser.role==='supervisor';
  if(typeof UMCore.crossInvoices !== 'function') return '';
  const who = sup ? (rep || null) : currentUser.name;
  const list = UMCore.crossInvoices(digestData()).filter(x => !who || x.issuer===who || x.owner===who);
  if(!list.length) return '';
  const inv = d => `<div style="padding:3px 0 3px 10px; border-inline-start:2px solid var(--amber, #E0A800); margin:3px 0;">
      <div><b data-notr>${esc(d.doc)}</b> · ${fmtDate(d.date)} · <b>${msKd(d.net)}</b></div>
      ${(d.items || []).map(it => `<div style="color:var(--muted);"><span dir="auto">${esc(it.product || '—')}</span>${it.brand ? ' · <span dir="auto">' + esc(it.brand) + '</span>' : ''} · ${+it.qty || 0} × · ${msKd(it.net)}</div>`).join('')}
    </div>`;
  return `<div onclick="event.stopPropagation()" style="margin-top:8px; padding:8px 10px; border-radius:10px; background:var(--amber-dim, #FFF4D6); font-size:12px; line-height:1.55; cursor:default;">
    <div style="font-weight:700;">⚠️ <span>Invoices on another rep's clinic this month</span></div>
    ${list.map(x => `<details style="margin-top:4px;">
      <summary style="cursor:pointer;"><b>${msWho(x.issuer)}</b> <span>invoiced at</span> <b dir="auto">${esc(x.clinic)}</b> · ${x.invoices} × · ${msKd(x.net)} · <span>counted for the clinic owner:</span> <b>${msWho(x.owner)}</b></summary>
      ${(x.details || []).map(inv).join('')}
    </details>`).join('')}
    <div style="color:var(--muted); margin-top:3px;"><span>Tap a line to see its invoices.</span></div>
  </div>`;
}

// ---- MAIN SCREEN (Today), v123 ----
// The calm design the owner chose (13 Nov): one screen in two roles. A rep sees
// her own month and day only — the view { rep: her, reps: [her] } — never the
// team, a team total or another person. The supervisor sees the team: the
// team's month and one row per person of REPS (himself included when he
// sells); the person switch opens that person's own screen, the same cards she
// sees on her phone. Laptop (≥ 1024 px): the cards in rows beside the side
// rail; phone: the cards stacked, the rest one tap away (index.html CSS).
// Every figure has one code path: the month figure is bestMonthRevenue
// (UMCore.monthAchievement), the targets the DSR's, achievement / remaining /
// per working day / forecast / same days come from UMCore.execDashboard for the
// view, visits a day / doctors / new accounts / the KPI score from
// UMCore.kpiScorecard as More → KPI scorecard shows them. Those two heavy calls
// run once per change of their inputs (msSig), just after the screen is drawn,
// and the cards fill in. A field the core does not give yet hides its part.
// Nothing here writes to storage.
let _msPerson = null, _msFor = null;                    // the supervisor's person switch (null = the team), and whose session it belongs to
let _msModel = null, _msJob = null, _msTimer = null, _msWaiters = [];
let _msMemo = { sig: null, v: Object.create(null) };    // the cheap parts of one data state (each person's month, the team line, the week), reused until the data changes
const _msOpen = Object.create(null);                   // phone: the folded cards opened in this session

// ---- words, names, numbers ----
function msName(r){ return uiLang === 'ar' ? wdArNames(r) : String(r == null ? '' : r); }
function msWho(r){ return `<span data-notr>${esc(msName(r))}</span>`; }                 // a person's name, Arabic in the Arabic screen
function msData(s){ return `<span dir="auto">${esc(String(s == null ? '' : s))}</span>`; } // a clinic, brand or product: data, never translated
function msT(s){ return `<span>${s}</span>`; }                                          // fixed wording: its own text node, found in the dictionary
function msN(x){ return `<span data-notr>${x}</span>`; }                                // a number as it is
function msKd(n){ return `<span class="ms-m">${(Number(n) || 0).toFixed(2)} <span>KD</span></span>`; }  // money(): "91.00 KD", the currency its own word
function msPct(p){ return p == null ? '—' : msN(p + '%'); }
function msDate(d){ return d ? esc(fmtDate(d)) : '—'; }
function msDay(d){ try{ return esc(new Date(d + 'T00:00:00').toLocaleDateString(uiLocale(), { weekday: 'short', day: 'numeric', month: 'short' })); }catch(e){ return msDate(d); } }
// A counted noun: "38 field visits" — the Arabic form agrees with the number (i18n PATTERNS).
function msCount(n, one, many){ return `${n} ${n === 1 ? one : many}`; }
// The noun alone, to sit beside a big number: the dictionary's agreeing form, without the number.
function msUnit(n, one, many){ const s = msCount(n, one, many), t = trOf(s); return t ? t.replace(/^\S+\s+/, '') : (n === 1 ? one : many); }
function msChev(){ return '<svg class="svgi ms-chev" aria-hidden="true"><use href="#i-chev"/></svg>'; }
function msInfo(id){ return `<button class="ms-i" onclick="event.stopPropagation(); msHow('${id}')" aria-label="How it is calculated">${I('info')}</button>`; }
function msOf(x){ return x && typeof x === 'object' ? x : null; }   // a core field read defensively
function msMonth(){ return todayStr().slice(0, 7); }

// ---- the view: the team, or one person ----
function msView(){
  if(!currentUser) return null;
  const me = currentUser.name;
  if(_msFor !== me){ _msFor = me; _msPerson = null; }
  if(currentUser.role !== 'supervisor') return { kind: 'person', rep: me, reps: [me], own: true };   // a rep: hers, whatever the UI sends
  if(_msPerson && REPS.includes(_msPerson)) return { kind: 'person', rep: _msPerson, reps: [_msPerson], own: _msPerson === me };
  _msPerson = null;
  return { kind: 'team', rep: null, reps: REPS.slice(), own: false };
}
function msKey(v){ return v ? v.kind + '|' + (v.rep || '') + '|' + v.reps.join('|') : ''; }
function msOpenPerson(r){
  if(!currentUser || currentUser.role !== 'supervisor') return;      // a rep's screen is hers only (ownRepOnly)
  const p = ownRepOnly(r || null);
  _msPerson = p && REPS.includes(p) ? p : null;
  renderToday();
  try{ window.scrollTo(0, 0); }catch(e){}
}
// The lists of the screen (plan, follow-ups, tasks, visits) follow the view: one person's own, or everyone the role may see.
function msListRep(){ const v = msView(); return v && v.kind === 'person' ? v.rep : null; }

// ---- the figures: computed once per change of their inputs ----
// Everything the two heavy calls read, as one string: a save, a refresh that
// brought something new, a sales file loading in, a settings change or a new
// day each change it. Photos are left out (a visit's thumbnails are not figures).
function msSig(v){
  const out = [todayStr(), new Date().getHours(), msKey(v), currentUser ? currentUser.name + '|' + currentUser.role : ''];
  try{
    out.push(JSON.stringify(targets || {}));
    out.push(JSON.stringify(erpSales || {}, (k, x) => k === 'rows' && Array.isArray(x) ? x.length : x));
    out.push(JSON.stringify(erpMap || {}));
    out.push(JSON.stringify((typeof BENCHMARKS !== 'undefined' && BENCHMARKS && BENCHMARKS.kpi) || {}));
    out.push(JSON.stringify(clinics || []));
    const lo = (() => { const d0 = msMonth() + '-01', w0 = UMCore.getWeekDates(todayStr())[0]; return w0 < d0 ? w0 : d0; })();
    Object.keys(dayPlans || {}).forEach(d => { if(d >= lo) out.push(d + '=' + JSON.stringify(dayPlans[d])); });
  }catch(e){ out.push('x' + Date.now()); }                       // cannot fingerprint: compute again
  (visits || []).forEach(x => { if(x) out.push([x.id, x.date, x.rep, x.withRep || '', x.clinicId, x.ts || '', x.callOnly ? 1 : 0, x.orderOnly ? 1 : 0, x.orderTaken ? 1 : 0, x.orderTotal || 0,
    (x.doctorIds || []).join(','), x.doctorId || '', (x.products || []).length, x.noOrderReason ? 1 : 0, x.notes && String(x.notes).trim() ? 1 : 0].join('~')); });
  (events || []).forEach(e => { if(e && e.kind) out.push([e.id, e.kind, e.type || '', e.rep || '', e.at || '', e.resolvedAt || '', e.removed || '', (e.checks || []).join(','), e.clinicId || ''].join('~')); });
  return out.join('\u0001');
}
// The view's figures. Sales lines are attributed once and shared by both calls
// (the same lines More → KPI scorecard and the management sheet read).
function msBuild(v){
  const data = digestData();
  try{ data.erpShare = UMCore.erpShare(data); }catch(e){}
  let rows;
  try{ rows = UMCore.erpAttributedRows(data); }catch(e){ console.error('main screen: sales lines', e); rows = undefined; }
  const m = { key: msKey(v), view: v, D: null, K: null, W: null, S: null, brands: msBrandNames() };
  try{ m.D = UMCore.execDashboard(data, { rep: v.kind === 'person' ? v.rep : 'all', reps: v.reps, rows }); }
  catch(e){ console.error('main screen: execDashboard', e); m.failed = true; }
  if(v.kind === 'person' && typeof kpiSettings === 'function' && typeof kpiRange === 'function'){
    const S = kpiSettings(), base = Object.assign({}, data, { today: todayStr() });
    const card = p => { const r = kpiRange(p); return UMCore.kpiScorecard(base, { rep: v.rep, from: r.from, to: r.to, settings: S, rows }); };
    m.S = S;
    try{ m.K = card('month'); }catch(e){ console.error('main screen: KPI', e); }
    try{ m.W = card('week'); }catch(e){ console.error('main screen: KPI week', e); }
  }
  return m;
}
// A brand as the company writes it — the DSR's spelling when a target names it,
// else the sales files' — for the keys the figures use (UMCore.normBrand).
function msBrandNames(){
  const out = Object.create(null), seen = Object.create(null);
  const put = raw => { const s = String(raw == null ? '' : raw).trim(); if(!s || seen[s]) return; seen[s] = 1; const k = UMCore.normBrand(s); if(k && !out[k]) out[k] = s; };
  const fromT = x => { if(x && x.brands) Object.keys(x.brands).forEach(put); };
  try{
    Object.keys(targets || {}).forEach(r => { if(r.charAt(0) !== '_') fromT(targets[r]); });
    const hist = (targets && targets._history) || {};
    Object.keys(hist).sort().reverse().forEach(mm => Object.keys(hist[mm] || {}).forEach(r => fromT(hist[mm][r])));
    erpPeriods().forEach(p => { if(p && Array.isArray(p.rows)) p.rows.forEach(a => { if(Array.isArray(a) && a[9] != null) put(a[9]); }); });
  }catch(e){}
  return out;
}
// One value per data state: computed once, then reused while msSig stays the same.
function msMemo(sig, key, fn){
  if(_msMemo.sig !== sig) _msMemo = { sig, v: Object.create(null) };
  if(!(key in _msMemo.v)) _msMemo.v[key] = fn();
  return _msMemo.v[key];
}
function msPeople(v, sig){ return v.reps.map(r => msMemo(sig, 'pm\u0001' + r, () => msPersonMonth(r))); }
// The team line: teamTargetNow's own sum (teamTargetTotal) over the same month figures, when the view is the team.
function msTeamTotal(v, P, sig){
  return msMemo(sig, 'tt', () => v.kind === 'team' && v.reps.length === REPS.length && v.reps.every((r, i) => r === REPS[i])
    ? teamTargetTotal(P.map(p => p.goal ? { goal: p.goal, ach: p.bm.amount } : null)) : teamTargetNow());
}
// The model to draw now: the fresh one, else the last one of the same view
// while its successor is computed (a moment), else none (the cards wait).
function msEnsure(v, sig){
  sig = sig || msSig(v);
  const key = msKey(v);
  if(_msModel && _msModel.sig === sig) return _msModel;
  if(!_msJob || _msJob.sig !== sig){
    _msJob = { sig, key };
    clearTimeout(_msTimer);
    _msTimer = setTimeout(msRun, 0);
  }
  return _msModel && _msModel.key === key ? _msModel : null;
}
function msModelFor(v){ return _msModel && v && _msModel.key === msKey(v) ? _msModel : null; }
function msRun(){
  _msTimer = null;
  const job = _msJob; _msJob = null;
  try{
    const v = msView();
    if(!job || !v || !currentUser) return;
    if(msKey(v) !== job.key){ if(activeView === 'today') renderToday(); return; }   // the view changed meanwhile: its own run follows (if any is needed)
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const sig = msSig(v), m = msBuild(v);
    m.sig = sig; m.ms = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);
    _msModel = m;
    if(activeView === 'today') msPaint(v, m, sig);
  }catch(e){ console.error('main screen', e); }
  finally{ msSettle(); }                                    // whoever waits is told, whatever happened
}
function msSettle(){ if(_msJob || _msTimer) return; const w = _msWaiters; _msWaiters = []; w.forEach(f => { try{ f(_msModel); }catch(e){} }); }
// Settles once the figures on screen are those of the data as it is now (the harness waits on it).
function msWhenReady(){ return (_msJob || _msTimer) ? new Promise(res => _msWaiters.push(res)) : Promise.resolve(_msModel); }

// ---- pace: the management report's rule (13-exports.js) ----
// Expected by now = working days (Sun–Thu) from day 1 to the day the figure
// runs to ÷ the working days of the month. On pace from 90 % of that.
function msPace(ach, goal, done, total){
  if(!(goal > 0) || ach == null || !(total > 0)) return null;
  if(ach >= goal) return 'reached';
  const pace = Math.round(ach / (goal * Math.max(1, done) / total) * 100);
  return pace >= 100 ? 'ahead' : pace >= 90 ? 'on' : 'behind';
}
const MS_PILL = { reached: ['good', 'Target reached'], ahead: ['good', 'Ahead of pace'], on: ['good', 'On pace'], behind: ['warn', 'Behind pace'] };
const MS_STATE = { reached: 'Achieved', ahead: 'On pace', on: 'On pace', behind: 'Behind' };   // the target card's word, as it always read
function msExpected(wd){ return wd && wd.total > 0 && wd.done > 0 ? Math.round(wd.done / wd.total * 100) : null; }
function msBar(pct, exp, thin){
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return `<div class="ms-bar${thin ? ' thin' : ''}"><i style="width:${w}%;"></i>${exp != null ? `<b style="inset-inline-start:${Math.max(0, Math.min(100, exp))}%;"></b>` : ''}</div>`;
}
// A person's month as the Today card always showed it (bestMonthRevenue), with
// the working days to the day her figure runs to.
function msPersonMonth(r){
  const bm = bestMonthRevenue(r), t = targets[r] || {};
  const measured = bm.basis === 'erp' && !!bm.asOf;
  const wd = UMCore.monthWorkdays(msMonth(), measured ? bm.asOf : null);
  return { rep: r, bm, t, measured, wd, goal: t.revenue > 0 ? t.revenue : null, pct: t.revenue > 0 ? Math.round(bm.amount / t.revenue * 100) : null };
}
// field visits of the month (no calls, no phone orders); a joint visit counts for both people — the card's "Visits n/m"
function msFieldVisits(r){ const m0 = msMonth() + '-01', t = todayStr(); return visits.filter(v => isFieldVisit(v) && (v.rep === r || v.withRep === r) && v.date >= m0 && v.date <= t).length; }

// ---- drawing ----
// The parts that follow the figures (heading, cards, rows); the lists below
// them are drawn by renderToday and keep their inputs across a redraw.
function msPaint(v, m, sig){
  v = v || msView(); if(!v) return;
  sig = sig || msSig(v);
  const grid = document.getElementById('msGrid');
  if(!grid) return;
  grid.classList.toggle('ms-vteam', v.kind === 'team');
  grid.classList.toggle('ms-vperson', v.kind === 'person');
  const P = msPeople(v, sig), tt = msTeamTotal(v, P, sig);
  msHead(v, m, P);
  const set = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
  set('msSales', v.kind === 'team' ? msSalesHTML(v, m, P, tt) : '');
  renderTargetCard(v, m, P, sig);
  const week = msMemo(sig, 'wk', () => msWeekLine(v));
  set('msWork', v.kind === 'team' ? msTeamWorkHTML(v, m, week) : msVisitsHTML(v, m, week));
  set('msNext', v.kind === 'team' ? msNeedsHTML(v, m) : msNextHTML(v));
  set('msChart', msChartHTML(v, m));
  set('msBrands', msBrandsHTML(v, m, P));
  set('msCust', msCustHTML(v, m));
  set('msRows', msRowsHTML(v, m));
  const plan = document.getElementById('planLink');
  if(plan) plan.style.display = v.kind === 'person' && !v.own ? 'none' : '';    // "Plan today" plans the day of whoever is signed in
}
function msHead(v, m, P){
  const set = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
  const g = document.getElementById('greeting'), dl = document.getElementById('dateLabel');
  set('msHello', g ? esc(g.textContent) : '');
  set('msDate', dl ? esc(dl.textContent) : '');
  // where the numbers come from, and the working days counted to the day the sales files reach
  const meas = P.filter(p => p.measured), asOf = meas.map(p => p.bm.asOf).sort().pop() || null;
  const wd = UMCore.monthWorkdays(msMonth(), asOf);
  const own = v.kind === 'person' && v.own;
  const segs = [
    asOf ? `${msT(own ? 'Your invoiced sales from the ERP files to' : 'Invoiced sales from the ERP files to')} <b>${msDay(asOf)}</b>`
         : msT(P.some(p => p.bm.basis === 'erp') ? 'The sales files of this month hold no line of these people yet' : 'No ERP sales file for this month yet'),
    msT(own ? 'your target from the DSR' : v.kind === 'team' ? 'targets from the DSR' : 'target from the DSR'),
    msT(asOf ? `working days: ${wd.done} of ${wd.total} done` : `working days this month: ${wd.total}`)
  ];
  set('msSource', `${I('info')}<span>${segs.join(' · ')}</span>`);
  // the person switch: the team and each person, himself included (Arabic names in the Arabic screen)
  const sw = document.getElementById('msSwitch');
  if(sw){
    sw.innerHTML = currentUser.role === 'supervisor' && REPS.length
      ? [`<button role="tab" class="${v.kind === 'team' ? 'on' : ''}" aria-selected="${v.kind === 'team'}" onclick="msOpenPerson(null)">Team</button>`]
        .concat(REPS.map(r => `<button role="tab" class="${v.rep === r ? 'on' : ''}" aria-selected="${v.rep === r}" data-r="${esc(r)}" onclick="msOpenPerson(this.dataset.r)">${msWho(r)}</button>`)).join('')
      : '';
  }
  const whose = document.getElementById('msWhose');
  if(whose){
    const other = v.kind === 'person' && !v.own;
    whose.style.display = other ? '' : 'none';
    whose.innerHTML = other ? `<span>${msT('Showing the screen of')} <b>${msWho(v.rep)}</b></span><button class="ms-back" onclick="msOpenPerson(null)">${msT('Back to the team')}</button>` : '';
  }
  // laptop: the KPI score of a person's screen, and the account button
  const K = m && msOf(m.K), due = visibleDueClinics().length > 0;
  const kpi = v.kind === 'person'
    ? `<button class="ms-kpi" onclick="msKpi()"><span>${msT('Performance score')}</span> <b>${K && K.total != null ? msN(K.total) : '—'}</b> <span>${msT('of 100')}</span> ${I('info')}</button>` : '';
  set('msWho', `${kpi}<button class="ms-av" onclick="openAccountMenu()" aria-label="Account menu"><span data-notr>${esc(initials(currentUser.name))}</span><span class="dot${due ? ' show' : ''}"></span></button>`);
}

// ---- the month against the target (the team's card; a person's card is the target card itself) ----
function msSalesHTML(v, m, P, tt){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D);
  // the month figure: bestMonthRevenue per person, the team = the sum over the people shown
  const meas = P.filter(p => p.measured), amount = meas.length ? Math.round(meas.reduce((s, p) => s + p.bm.amount, 0) * 100) / 100 : null;
  const goal = team ? (tt || teamTargetNow()).goal : (P[0] && P[0].goal);
  const why = P.length && P.every(p => p.bm.basis === 'none') ? 'No ERP sales file for this month yet'
    : team ? 'The sales files of this month hold no line of these people yet.' : 'The sales files of this month hold no line of this person yet.';
  const title = team ? 'Team sales this month' : own ? 'My sales this month' : 'Sales this month';
  const ofT = team ? 'of the team target' : own ? 'of my target' : 'of the target';
  let html = `<div class="ms-ct"><span>${msT(title)}</span><span class="ms-act">${team ? '' : `<button class="chip small" onclick="event.stopPropagation(); openMonthReports()">${I('book')} Months</button>`}${msInfo('sales')}</span></div>
    <div class="ms-big${amount == null ? ' none' : ''}" data-ms="sales" data-value="${amount == null ? '' : amount}">${amount == null ? '—' : `${msN(amount.toFixed(2))} <small>KD</small>`}</div>
    <div class="ms-of">${goal > 0 ? `${msT(ofT)} ${msKd(goal)}` : msT(team ? 'No sales target on file for this month' : 'No sales target on file for this month')}${!team && P[0] && P[0].t.visits > 0 ? ` · <span style="white-space:nowrap;">Visits ${msFieldVisits(P[0].rep)}/${P[0].t.visits} (${Math.round(msFieldVisits(P[0].rep) / P[0].t.visits * 100)}%)</span>` : ''}</div>`;
  if(amount == null){
    html += `<div class="ms-note">${msT(why)}</div>`;
    return html + msSalesStats(null, goal);
  }
  if(!D){ return html + `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>`; }
  const A = msOf(D.achievement) || {}, Pd = msOf(D.perDay) || {}, wd = msOf(Pd.workdays) || {};
  const exp = msExpected(wd), pace = A.pct != null ? msPace(A.achieved, A.target, wd.done, wd.total) : null;
  if(A.pct != null){
    html += msBar(A.pct, exp, false)
      + `<div class="ms-legend"><span data-ms="achievement" data-value="${A.pct}"><strong>${msPct(A.pct)}</strong> ${msT('achieved')}</span>${exp != null ? `<span>${msT('expected by')} ${msDate(wd.asOf)}: ${msPct(exp)}</span>` : ''}</div>`
      + (pace ? `<div><span class="ms-pill ${MS_PILL[pace][0]}" data-ms="pace" data-value="${pace}">${msT(MS_PILL[pace][1])}</span></div>` : '');
  }
  html += msSalesStats(D, goal);
  // what the percentage leaves out, in words
  const notes = [];
  (A.notMeasured || []).forEach(r => notes.push(`${msWho(r)}: ${msT('a target but no sales figure in the files, so not in the percentage.')}`));
  (A.noTarget || []).forEach(r => notes.push(`${msWho(r)}: ${msT('invoiced sales but no target, so not in the percentage.')}`));
  if(notes.length) html += `<div class="ms-note">${notes.join('<br>')}</div>`;
  return html;
}
function msSalesStats(D, goal){
  const dash = k => `<b data-ms="${k}" data-value="">—</b>`;
  if(!D) return `<div class="ms-stats"><div><span class="ms-l">${msT('Remaining')}</span>${dash('remaining')}</div><div><span class="ms-l">${msT('Per working day')}</span>${dash('perday')}</div><div><span class="ms-l">${msT('Month-end forecast')}</span>${dash('forecast')}</div></div>`;
  const A = msOf(D.achievement) || {}, Pd = msOf(D.perDay) || {}, wd = msOf(Pd.workdays) || {}, F = msOf(D.forecast);
  const left = wd.left != null ? wd.left : null;
  const remaining = D.remaining != null ? `<b data-ms="remaining" data-value="${D.remaining}">${msKd(D.remaining)}</b>` : dash('remaining');
  const perDay = Pd.amount != null ? `<b data-ms="perday" data-value="${Pd.amount}">${msKd(Pd.amount)}</b>` : dash('perday');
  const perSub = Pd.amount != null && left != null ? `<em>${msT(msCount(left, 'working day left', 'working days left'))}</em>`
    : D.remaining === 0 && A.pct != null ? `<em>${msT('Target reached')}</em>` : '';
  const cells = [`<div><span class="ms-l">${msT('Remaining')}</span>${remaining}</div>`, `<div><span class="ms-l">${msT('Per working day')}</span>${perDay}${perSub}</div>`];
  if(F) cells.push(`<div><span class="ms-l">${msT('Month-end forecast')}</span>${F.amount != null ? `<b data-ms="forecast" data-value="${F.amount}">${msKd(F.amount)}</b>${F.pct != null ? `<em>${msT(F.pct + '% of the target')}</em>` : ''}` : dash('forecast')}</div>`);
  return `<div class="ms-stats${cells.length === 2 ? ' two' : ''}">${cells.join('')}</div>`;
}

// ---- the target card: the team's people rows, or a person's own month ----
// Six harnesses read this card's words — "<achieved> of <target> · <state>",
// "Achieved: <source> · target: DSR", the stale-target note, the Team line,
// "Months" and the invoices on another rep's clinic — so it keeps them all.
function renderTargetCard(v, m, P, sig){
  const el = document.getElementById('targetCard');
  if(!el) return;
  v = v || msView();
  if(!v){ el.innerHTML = ''; return; }
  m = m || msModelFor(v);
  sig = sig || msSig(v);                                   // called on its own (after a change): the data as it is now
  P = P || msPeople(v, sig);
  if(v.kind === 'person'){
    const p = P[0];
    el.innerHTML = `<div class="ms-card ms-sales">${msSalesHTML(v, m, P)}
      <div class="ms-fine">Achieved: ${esc(p.bm.src)} · target: DSR</div>${staleTargetNote(p.rep)}${msMemo(sig, 'cx\u0001' + p.rep, () => crossInvoiceNote(p.rep))}</div>`;
    return;
  }
  const monthName = new Date(todayStr() + 'T00:00:00').toLocaleDateString(uiLocale(), { month: 'long' });
  const D = m && msOf(m.D), by = D && Array.isArray(D.byPerson) ? D.byPerson : [];
  const srcs = P.filter(p => p.goal || p.t.visits > 0).map(p => p.bm.src), oneSrc = srcs.length > 1 && srcs.every(s => s === srcs[0]);
  const stale = P.map(p => staleTargetNote(p.rep)), oneStale = stale.length > 1 && stale.every(s => s && s === stale[0]);
  const rows = P.map((p, i) => {
    const r = p.rep, t = p.t, extra = msPersonExtra(by.find(x => x && x.rep === r));
    const head = `<div class="ms-person open" data-person="${esc(r)}" onclick="msOpenPerson(this.dataset.person)">`;
    if(p.goal){
      const exp = msExpected(p.wd), st = p.measured ? msPace(p.bm.amount, p.goal, p.wd.done, p.wd.total) : null;
      const vN = t.visits > 0 ? msFieldVisits(r) : 0;
      return head + `<div class="n">${msWho(r)}</div> ${msBar(p.pct, exp, true)} <div class="p">${p.pct}%</div>
        <div class="s">${msKd(p.bm.amount)} <span>of</span> ${msKd(p.goal)} · <span>${st ? MS_STATE[st] : 'no figure yet'}</span>${t.visits > 0 ? ` · <span style="white-space:nowrap;">Visits ${vN}/${t.visits} (${Math.round(vN / t.visits * 100)}%)</span>` : ''}</div>
        ${extra}${oneSrc ? '' : `<div class="ms-fine">Achieved: ${esc(p.bm.src)} · target: DSR</div>`}${oneStale ? '' : stale[i] ? `<div class="ms-fine">${stale[i]}</div>` : ''}</div>`;
    }
    if(t.visits > 0){                                   // a visits-only target still deserves its row
      const vN = msFieldVisits(r), vp = Math.round(vN / t.visits * 100);
      return head + `<div class="n">${msWho(r)}</div> ${msBar(vp, null, true)} <div class="p">${vp}%</div>
        <div class="s">Visits ${vN} of ${t.visits} this month · no sales target set</div>${extra}</div>`;
    }
    return head + `<div class="n">${msWho(r)}</div> <div></div> <div class="p none">—</div>
      <div class="s">${p.measured ? `${msKd(p.bm.amount)} · ` : ''}<span>no sales target set</span></div>${extra}</div>`;
  });
  const tt = msTeamTotal(v, P, sig), withGoal = P.filter(p => p.goal);
  let teamRow = '';
  if(tt && tt.pct != null && tt.n >= 1){
    const meas = withGoal.filter(p => p.measured), asOf = meas.map(p => p.bm.asOf).sort().pop() || null, wd = UMCore.monthWorkdays(msMonth(), asOf);
    const st = asOf ? msPace(tt.ach, tt.goal, wd.done, wd.total) : null;
    teamRow = `<div class="ms-person team"><div class="n">Team</div> ${msBar(tt.pct, msExpected(wd), true)} <div class="p">${tt.pct}%</div>
      <div class="s">${msKd(tt.ach)} <span>of</span> ${msKd(tt.goal)} · <span>${st ? MS_STATE[st] : 'no figure yet'}</span> · <span>${tt.n} rep${tt.n === 1 ? '' : 's'}</span></div></div>`;
  }
  const meas = withGoal.filter(p => p.measured), asOf = meas.map(p => p.bm.asOf).sort().pop() || null, wdT = UMCore.monthWorkdays(msMonth(), asOf), expT = msExpected(wdT);
  el.innerHTML = `<div class="ms-card ms-people">
    <div class="ms-ct"><span>${I('target')} ${monthName} target</span><span class="ms-act"><span class="ms-hint">${msT('Tap a name to open their screen')}</span><button class="chip small" onclick="event.stopPropagation(); openMonthReports()">${I('book')} Months</button>${msInfo('sales')}</span></div>
    ${rows.join('')}${teamRow}
    ${!withGoal.length && !P.some(p => p.t.visits > 0) ? `<div class="ms-note">${msT('Set sales and visit targets per rep in the admin panel to see live progress here.')} <span class="link" onclick="openAdminPanel()">${msT('Admin panel')}</span></div>` : ''}
    ${expT != null && withGoal.length ? `<div class="ms-fine">${msT('The dark line on each bar = expected by')} ${msDate(wdT.asOf)} (${msPct(expT)}).</div>` : ''}
    ${oneSrc ? `<div class="ms-fine">Achieved: ${esc(srcs[0])} · target: DSR</div>` : ''}${oneStale ? `<div class="ms-fine">${stale[0]}</div>` : ''}
    ${msMemo(sig, 'cx', () => crossInvoiceNote())}
  </div>`;
}
// what the team's figures add for one person: field visits and orders logged in the app (and the same days, when the core says it)
function msPersonExtra(b){
  if(!b) return '';
  const parts = [];
  const sd = msOf(b.sameDays), g = sd && (sd.growth != null || sd.fromZero) ? sd : null;
  if(g) parts.push(g.fromZero ? msT('from zero against the same days last month') : `<span class="${g.growth >= 0 ? 'ms-up' : 'ms-down'}">${msN((g.growth >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(g.growth * 100)) + '%')}</span> ${msT('vs the same days last month')}`);
  if(b.visits != null) parts.push(msT(msCount(b.visits, 'field visit', 'field visits')));
  if(b.orders != null) parts.push(msT(msCount(b.orders, 'order logged in the app', 'orders logged in the app')));
  return parts.length ? `<div class="ms-fine">${parts.join(' · ')}</div>` : '';
}

// ---- field work ----
// The team: field visits, conversion, orders logged in the app (never called sales), new customers.
function msTeamWorkHTML(v, m, week){
  week = week == null ? msWeekLine(v) : week;
  const D = m && msOf(m.D), Vi = D && msOf(D.visits), O = D && msOf(D.orders), C = D && msOf(D.conversion), N = D && msOf(D.newCustomers);
  let html = `<div class="ms-ct"><span>${msT('Visits & orders')}</span>${msInfo('work')}</div>`;
  if(!D) return html + `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>` + week;
  const n = Vi ? Vi.count : null;
  html += `<div class="ms-big" data-ms="visits" data-value="${n == null ? '' : n}">${n == null ? '—' : `${msN(n)} <small>${esc(msUnit(n, 'field visit', 'field visits'))}</small>`}</div>
    <div class="ms-of">${msT('this month, the whole team')}</div>
    <div class="ms-stats">
      <div><span class="ms-l">${msT('Conversion to an order')}</span><b data-ms="conversion" data-value="${C && C.pct != null ? C.pct : ''}">${C && C.pct != null ? msPct(C.pct) : '—'}</b></div>
      <div><span class="ms-l">${msT('Orders logged in the app')}</span><b data-ms="orders" data-value="${O ? O.count : ''}">${O ? msT(msCount(O.count, 'order', 'orders')) : '—'}</b>${O ? `<em data-ms="orders-value" data-value="${O.value}">${msKd(O.value)}</em>` : ''}</div>
      <div><span class="ms-l">${msT('New customers')}</span><b data-ms="newcustomers" data-value="${N && N.measurable ? N.count : ''}">${N && N.measurable ? msN(N.count) : '—'}</b>${N && !N.measurable ? `<em>${msT('not measured yet')}</em>` : ''}</div>
    </div>
    <div class="ms-note">${msT('Orders logged in the app are not invoiced sales: sales come from the ERP files only.')}</div>`;
  return html + week;
}
// A person: visits a day, doctors met and new accounts — the KPI scorecard's own figures.
function msKpiNums(m){
  const K = m && msOf(m.K), W = m && msOf(m.W), S = (m && m.S) || {};
  const item = (c, k) => c && Array.isArray(c.items) ? c.items.find(x => x && x.key === k) : null;
  const num = x => { const n = parseFloat(x); return isFinite(n) ? n : null; };
  const visitsOf = c => {                       // "6.3 a day (38 in 6 working days)"
    const it = item(c, 'visits'); if(!it) return null;
    if(msOf(it.n) && it.n.perDay != null) return { perDay: it.n.perDay, count: it.n.count, days: it.n.workdays };
    const x = String(it.value || '').match(/^([\d.]+) a day \((\d+) in (\d+) working days?\)$/);
    return x ? { perDay: num(x[1]), count: +x[2], days: +x[3] } : null;
  };
  const doc = item(K, 'doctors'), nb = item(K, 'newbiz');
  const docMet = doc ? (msOf(doc.n) && doc.n.met != null ? doc.n.met : (String(doc.value || '').match(/^(\d+) doctors met/) || [])[1]) : null;
  const docExp = doc ? (msOf(doc.n) && doc.n.goal != null ? doc.n.goal : (String(doc.target || '').match(/^(\d+) doctors in the period/) || [])[1]) : null;
  const acc = nb ? (msOf(nb.n) && nb.n.accounts != null ? nb.n.accounts : (String(nb.value || '').match(/(\d+) new accounts?$/) || [])[1]) : null;
  return { month: visitsOf(K), week: visitsOf(W), goal: num(S.visitsPerDay), total: K ? K.total : null,
    doctors: docMet != null ? +docMet : null, doctorsBy: docExp != null ? +docExp : null, doctorsGoal: num(S.doctorsPerMonth),
    accounts: acc != null ? +acc : null, accountsGoal: num(S.newAccounts), card: K };
}
function msVisitsHTML(v, m, week){
  week = week == null ? msWeekLine(v) : week;
  const own = v.own;
  let html = `<div class="ms-ct"><span>${msT(own ? 'My visits' : 'Visits')}</span>${msInfo('visits')}</div>`;
  if(!m) return html + `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>` + week;
  const k = msKpiNums(m), mo = k.month;
  if(!mo) return html + `<div class="ms-note">${msT('The KPI scorecard could not be read on this device.')}</div>` + week;
  const up = k.goal != null ? mo.perDay >= k.goal : null;
  html += `<div class="ms-big" data-ms="perday-visits" data-value="${mo.perDay}">${msN(mo.perDay.toFixed(1))} <small>${msT('visits a day')}</small></div>
    <div class="ms-of">${k.goal != null ? `${msT(`goal ${k.goal} a day`)} · ` : ''}${msT(`${mo.count} visits in ${mo.days} working days`)}</div>
    ${up != null ? `<div><span class="ms-pill ${up ? 'good' : 'warn'}">${msT(up ? 'Above goal' : 'Below goal')}</span></div>` : ''}
    <div class="ms-stats">
      <div><span class="ms-l">${msT('This week')}</span>${k.week ? `<b data-ms="week-visits" data-value="${k.week.count}">${msT(msCount(k.week.count, 'visit', 'visits'))}</b><em>${msT(`${k.week.perDay.toFixed(1)} a day`)}</em>` : '<b>—</b>'}</div>
      <div><span class="ms-l">${msT('Doctors')}</span>${k.doctors != null ? `<b data-ms="doctors" data-value="${k.doctors}">${k.doctorsGoal != null ? msT(`${k.doctors} of ${k.doctorsGoal}`) : msN(k.doctors)}</b>${k.doctorsBy != null ? `<em>${msT(`expected ${k.doctorsBy}`)}</em>` : ''}` : '<b>—</b>'}</div>
      <div><span class="ms-l">${msT('New accounts')}</span>${k.accounts != null ? `<b data-ms="accounts" data-value="${k.accounts}">${k.accountsGoal != null ? msT(`${k.accounts} of ${k.accountsGoal}`) : msN(k.accounts)}</b>` : '<b>—</b>'}</div>
    </div>`;
  return html + week;
}
// The week's line the old hero showed (Sun–Thu): invoiced (when a sales file covers the week) and as logged in the app.
function msWeekLine(v){
  const rep = v.kind === 'person' ? v.rep : null;
  const wkStartD = new Date(); wkStartD.setDate(wkStartD.getDate() - wkStartD.getDay());
  const wkStart = UMCore.localDateStr(wkStartD);
  const wk = visibleVisits().filter(x => x.date >= wkStart && (!rep || x.rep === rep || x.withRep === rep));
  const wkField = wk.filter(x => !x.callOnly && !x.orderOnly);      // calls and phone orders are not visits
  const wkRev = wk.reduce((a, x) => a + (x.orderTotal || 0), 0);
  const wkOrders = wk.filter(x => x.orderTaken).length;
  const erpWk = erpRevenueForRange(wkStart, todayStr(), rep || (currentUser.role === 'rep' ? currentUser.name : 'all'));
  return `<div class="ms-week" id="heroCard">${erpWk != null ? `<span>Sales this week (ERP-verified)</span>: ${msKd(erpWk)} · ` : '<span>This week</span>: '}<span>${msCount(wkField.length, 'visit', 'visits')}</span> · <span>${msCount(wkOrders, 'order logged in the app', 'orders logged in the app')}</span> (${msKd(wkRev)})</div>`;
}

// ---- what needs action ----
// The team: follow-ups due (overdue + today) and the customers to act on.
function msNeedsHTML(v, m){
  const due = visibleDueClinics(), over = due.filter(c => followStatus(c.nextFollowUp) === 'overdue').length;
  const D = m && msOf(m.D), act = D && msOf(D.act);
  const items = [];
  items.push(`<button class="ms-item" onclick="msGo('msDueCard')"><span class="ms-dot ${over ? 'bad' : due.length ? 'warn' : 'grey'}"></span><div class="t"><div>${msT(due.length ? msCount(due.length, 'follow-up due', 'follow-ups due') : 'No follow-ups due')}</div><div class="s">${msT(due.length ? `${over} overdue · ${due.length - over} today` : 'All caught up')}</div></div>${msChev()}</button>`);
  if(act && act.measurable){
    const u = Array.isArray(act.under) ? act.under : [], p = Array.isArray(act.potential) ? act.potential : [];
    if(u[0]) items.push(msActItem(u[0], 'under', v));
    if(p[0]) items.push(msActItem(p[0], 'potential', v));
    if(!u.length && !p.length) items.push(`<div class="ms-item static"><span class="ms-dot grey"></span><div class="t"><div>${msT('No customer to act on')}</div><div class="s">${msT('Nobody under-performing, no A or B clinic waiting')}</div></div></div>`);
    let html = `<div class="ms-ct"><span>${msT('Needs you today')}</span>${msInfo('act')}</div><div class="ms-items">${items.join('')}</div>`;
    if(u.length + p.length) html += `<button class="ms-more" onclick="msActSheet()">${[u.length ? msT(`${u.length} under-performing`) : '', p.length ? msT(msCount(p.length, 'opportunity', 'opportunities')) : ''].filter(Boolean).join(' · ')} — ${msT('see all')} ${msChev()}</button>`;
    return html;
  }
  if(D && act && !act.measurable) items.push(`<div class="ms-item static"><span class="ms-dot grey"></span><div class="t"><div>${msT('Customers to act on')}</div><div class="s">${msT('Not measured: no sales figure for this month yet')}</div></div></div>`);
  return `<div class="ms-ct"><span>${msT('Needs you today')}</span>${msInfo('act')}</div><div class="ms-items">${items.join('')}</div>${!D ? `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>` : ''}`;
}
function msActItem(x, kind, v){
  const team = v.kind === 'team', open = x.clinicId != null ? x.clinicId : x.id;
  const who = team ? (x.owner || x.rep ? ' · ' + msWho(x.owner || x.rep) : '') : '';
  const sub = kind === 'under'
    ? `${msT('Under-performing')}${who} · ${x.current > 0 ? `${msKd(x.current)} ${msT('this month, against an average of')} ${msKd(x.average)}` : `${msT('no invoice this month, average')} ${msKd(x.average)}`}`
    : `${msT('Opportunity')}${who} · ${msT(x.bought ? `bought in ${x.bought} of the last ${x.months} months` : x.months ? `no invoice in the last ${x.months} months` : 'no invoice this month')}${x.lastVisit ? ` · ${msT('last visit')} ${msDate(x.lastVisit)}` : ''}`;
  return `<button class="ms-item"${open != null ? ` data-c="${esc(String(open))}" onclick="openClinicDetail(this.dataset.c)"` : ''}><span class="ms-dot ${kind === 'under' ? 'warn' : ''}"></span><div class="t"><div>${x.cls ? `<span class="ms-cls" data-notr>${esc(x.cls)}</span> ` : ''}${msData(x.name)}</div><div class="s">${sub}</div></div>${msChev()}</button>`;
}
// Every customer to act on, with the rule in words (the management dashboard's lists).
function msActSheet(){
  const v = msView(), m = msModelFor(v), act = m && m.D && msOf(m.D.act);
  if(!act){ showToast('Calculating the month…'); return; }
  const u = act.under || [], p = act.potential || [];
  showModal(`<h3 style="margin-top:0;">${msT('Customers to act on')}</h3>
    <div class="ms-how">
      <h4>${msT('Under-performing')} (${u.length})</h4>
      <div class="ms-note" style="margin-top:0;">${msT('Bought in at least 2 of the 3 months before, and this month less than half of their average on the same days.')}</div>
      <div class="ms-items">${u.map(x => msActItem(x, 'under', v)).join('') || `<div class="ms-note">${msT('None.')}</div>`}</div>
      <h4>${msT('High potential')} (${p.length})</h4>
      <div class="ms-note" style="margin-top:0;">${msT('A clinic graded A or B with no paid invoice this month, and one in at most 1 of the 3 months before.')}</div>
      <div class="ms-items">${p.map(x => msActItem(x, 'potential', v)).join('') || `<div class="ms-note">${msT('None.')}</div>`}</div>
    </div>
    <button class="btn secondary" onclick="closeModal()">Close</button>`);
}
// A person: the next clinic of today's plan, with logging a visit one tap away, then a follow-up and a task.
function msNextHTML(v){
  const r = v.rep, own = v.own, today = todayStr();
  const entries = ((dayPlans[today] || {})[r] || []).map(e => ({ id: planEntryId(e), note: planEntryNote(e) })).filter(e => clinics.some(c => c.id === e.id));
  const done = entries.filter(e => visits.some(x => x.clinicId === e.id && x.rep === r && x.date === today));
  const next = entries.find(e => !done.includes(e)), c = next ? clinics.find(x => x.id === next.id) : null;
  let html = `<div class="ms-ct"><span>${msT(own ? 'My next step' : 'Next step')}</span>${entries.length ? `<span class="ms-hint">${msT(`Today's plan: ${done.length} of ${entries.length} done`)}</span>` : ''}</div>`;
  if(c){
    html += `<div class="ms-next">${c.cls ? `<span class="ms-cls" data-notr>${esc(c.cls)}</span>` : ''}<span class="nm">${msData(c.name)}</span></div>
      <div class="ms-of">${msT("In today's plan · not visited yet")}${next.note ? ` · ${msData(next.note)}` : ''}</div>
      ${own ? `<button class="ms-btn" data-c="${esc(c.id)}" onclick="quickLogFrom(this.dataset.c)">${I('plus')} ${msT('Log a visit')}</button>` : ''}`;
  } else {
    html += `<div class="ms-of">${msT(entries.length ? "All of today's plan is visited" : 'No plan for today yet')}</div>
      ${own ? `<button class="ms-btn" onclick="switchView('log')">${I('plus')} ${msT('Log a visit')}</button>${entries.length ? '' : `<button class="ms-btn ghost" onclick="openPlanDay()">${I('compass')} ${msT('Plan today')}</button>`}` : ''}`;
  }
  const then = [];
  const fu = visibleDueClinics().filter(x => x.rep === r)[0];
  if(fu){
    const ov = followStatus(fu.nextFollowUp) === 'overdue';
    then.push(`<button class="ms-item" data-c="${esc(fu.id)}" onclick="confirmFollowUp(this.dataset.c)"><span class="ms-dot ${ov ? 'bad' : 'warn'}"></span><div class="t"><div>${msData(fu.name)}</div><div class="s">${ov ? `${msT('Follow-up overdue since')} ${msDate(fu.nextFollowUp)}` : msT('Follow-up due today')}</div></div>${msChev()}</button>`);
  }
  const task = visibleTasks().filter(t => !t.done && (t.rep === r || t.rep === 'Team') && t.dueDate && ['overdue', 'today'].includes(followStatus(t.dueDate)))[0];
  if(task) then.push(`<button class="ms-item" onclick="msGo('msTaskCard')"><span class="ms-dot warn"></span><div class="t"><div dir="auto">${esc(task.text || task.title || '')}</div><div class="s">${msT(followStatus(task.dueDate) === 'overdue' ? 'Task · overdue' : 'Task · today')}</div></div>${msChev()}</button>`);
  if(then.length) html += `<div class="ms-sub">${msT('Then')}</div><div class="ms-items">${then.join('')}</div>`;
  return html;
}

// ---- laptop: the month day by day, the brands, the customers ----
// The cumulative invoiced sales against the straight line to the target, and
// the forecast at the pace so far. Time runs with the reading direction (right
// to left in Arabic); the axis says which day is where.
function msChartHTML(v, m){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D);
  const title = team ? 'Sales day by day against the target' : own ? 'My sales day by day against my target' : 'Sales day by day against the target';
  const keys = `<span class="ms-keys"><span><i></i>${msT('Achieved so far')}</span><span><i class="t"></i>${msT('Line to the target')}</span><span><i class="f"></i>${msT('Forecast')}</span></span>`;
  let html = `<div class="ms-ct"><span>${msT(title)}</span><span class="ms-act">${keys}${msInfo('chart')}</span></div>`;
  if(!D) return html + `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>`;
  const Dy = msOf(D.daily), A = msOf(D.achievement) || {}, F = msOf(D.forecast), T = msOf(D.target) || {};
  if(Dy && Dy.measured && Array.isArray(Dy.days) && Dy.days.length) html += msChartSVG(D, Dy, A, F, T);
  else html += `<div class="ms-note">${msT(Dy ? 'No sales figure for this month yet, so no day by day.' : 'The day-by-day figures are not available on this device yet.')}</div>`;
  // underneath: against earlier months (team), or what she logged in the app (a person)
  const cells = [msCmpCell(msOf(D.sameDays), 'Same days last month', 'No sales file for the month before')];
  if(team){
    if(msOf(D.lastYear)) cells.push(msCmpCell(D.lastYear, 'Same month last year', 'No sales file for that month a year before'));
    const Y = msOf(D.ytd);
    if(Y){
      const L = msOf(Y.like) || {};
      cells.push(`<div><span class="ms-l">${msT('Year to date')}</span>${L.pct != null ? `<b data-ms="ytd" data-value="${L.pct}">${msPct(L.pct)}</b><em>${msKd(L.sales)} ${msT('of')} ${msKd(L.target)}</em>` : Y.sales != null ? `<b data-ms="ytd-sales" data-value="${Y.sales}">${msKd(Y.sales)}</b><em>${msT('no target saved for these months')}</em>` : `<b>—</b><em>${msT('No sales file covers any month of this year')}</em>`}</div>`);
    }
  } else {
    const O = msOf(D.orders), C = msOf(D.conversion);
    if(O) cells.push(`<div><span class="ms-l">${msT(own ? 'Orders I logged in the app' : 'Orders logged in the app')}</span><b data-ms="orders" data-value="${O.count}">${msT(msCount(O.count, 'order', 'orders'))}</b><em>${msKd(O.value)} · ${msT('not invoiced sales')}</em></div>`);
    if(C) cells.push(`<div><span class="ms-l">${msT('Conversion to an order')}</span><b data-ms="conversion" data-value="${C.pct == null ? '' : C.pct}">${msPct(C.pct)}</b><em>${msT(own ? 'of my field visits' : 'of the field visits')}</em></div>`);
  }
  return html + `<div class="ms-stats${cells.length === 2 ? ' two' : ''}">${cells.join('')}</div>`;
}
function msGrowth(g){
  if(!g || !g.measured) return null;
  if(g.fromZero) return msT('from zero');
  if(g.growth == null) return null;
  const p = Math.round(g.growth * 100);
  return `<span class="${p >= 0 ? 'ms-up' : 'ms-down'}">${msN((p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '%')}</span>`;
}
function msCmpCell(g, label, none){
  if(!g) return `<div><span class="ms-l">${msT(label)}</span><b>—</b></div>`;
  const val = msGrowth(g);
  const sub = g.measured ? `${msKd(g.previous)} · ${msT('days 1 to')} ${msN(parseInt(String(g.to || '').slice(8, 10), 10) || '')} ${esc(monthLabel(g.month))}` : msT(none);
  return `<div><span class="ms-l">${msT(label)}</span><b data-ms="cmp" data-value="${g.measured && g.growth != null ? Math.round(g.growth * 100) : ''}">${val || '—'}</b><em>${sub}</em></div>`;
}
function msChartSVG(D, Dy, A, F, T){
  const rtl = uiLang === 'ar', W = 600, H = 220, L = 34, R = 566, top = 26, base = 182;
  const n = D.days || 30, from = D.from;
  const x = day => { const f = (day - 1) / Math.max(1, n - 1); return rtl ? R - f * (R - L) : L + f * (R - L); };
  let cum = 0; const pts = Dy.days.map(d => { cum += Number(d.net) || 0; return { day: parseInt(String(d.date).slice(8, 10), 10), v: cum }; });
  const last = pts[pts.length - 1], goal = T.amount != null ? T.amount : null, fc = F && F.amount != null && !F.closed ? F.amount : null;
  const top0 = Math.max(goal || 0, fc || 0, last.v, 1) * 1.08;
  const y = val => base - (Math.max(0, val) / top0) * (base - top);
  const f1 = vv => Math.round(vv * 10) / 10;
  const line = pts.map(p => `${f1(x(p.day))},${f1(y(p.v))}`).join(' ');
  const area = `${f1(x(1))},${base} ${line} ${f1(x(last.day))},${base}`;
  const amt = vv => (Math.round(vv)).toLocaleString('en-US');
  const lbl = (xx, yy, txt, cls) => `<text x="${f1(xx)}" y="${f1(yy)}" text-anchor="middle" font-size="12.5" ${cls || 'fill="#5C6962"'} data-notr>${txt}</text>`;
  const endX = x(n);
  // the two end labels: when they would meet, the smaller value's label goes under its own line, clear of it
  // (the label reaches 44 px in from the month's end, where its line has come down by the slope × 44)
  const near = goal && fc && Math.abs(y(goal) - y(fc)) < 18;
  const under = (yEnd, x0, y0) => yEnd + 44 * Math.max(0, (y0 - yEnd) / Math.max(1, Math.abs(endX - x0))) + 12;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(trOf('Cumulative invoiced sales against the straight line to the target') || 'Cumulative invoiced sales against the straight line to the target')}">
    <line x1="${L}" y1="${base}" x2="${R}" y2="${base}" stroke="#D5DED8"/>
    <line x1="${L}" y1="${f1(y(top0 / 2))}" x2="${R}" y2="${f1(y(top0 / 2))}" stroke="#EDF1EE"/>
    <line x1="${f1(x(last.day))}" y1="${top - 4}" x2="${f1(x(last.day))}" y2="${base}" stroke="#C9D3CD" stroke-dasharray="2 4"/>
    <polygon points="${area}" fill="#1E7A55" fill-opacity=".10"/>`;
  if(goal) svg += `<line x1="${f1(x(1))}" y1="${base}" x2="${f1(endX)}" y2="${f1(y(goal))}" stroke="#9AA8A0" stroke-width="2" stroke-dasharray="6 6"/>` + lbl(endX + (rtl ? 24 : -24), near && goal < fc ? under(y(goal), x(1), base) : y(goal) - 8, amt(goal));
  if(fc) svg += `<line x1="${f1(x(last.day))}" y1="${f1(y(last.v))}" x2="${f1(endX)}" y2="${f1(y(fc))}" stroke="#1E7A55" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>` + lbl(endX + (rtl ? 24 : -24), near && fc <= goal ? under(y(fc), x(last.day), y(last.v)) : y(fc) - 8, amt(fc), 'fill="#1E7A55" font-weight="600"');
  svg += `<polyline points="${line}" fill="none" stroke="#1E7A55" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${f1(x(last.day))}" cy="${f1(y(last.v))}" r="5" fill="#fff" stroke="#1E7A55" stroke-width="3"/>`
    + lbl(x(last.day), y(last.v) - 12, amt(last.v), 'fill="#17201B" font-weight="700" font-size="14"')
    + `<text x="${f1(x(1))}" y="204" text-anchor="middle" font-size="12" fill="#5C6962">${msDate(from)}</text>`
    + (last.day > 3 && last.day < n - 3 ? `<text x="${f1(x(last.day))}" y="204" text-anchor="middle" font-size="12" font-weight="600" fill="#17201B">${msDate(Dy.to)}</text>` : '')
    + `<text x="${f1(endX)}" y="204" text-anchor="middle" font-size="12" fill="#5C6962">${msDate(D.from.slice(0, 8) + String(n).padStart(2, '0'))}</text></svg>`;
  return svg;
}
// The brands: sold against the brand's target (the DSR's split), on the same pace line.
function msBrandsHTML(v, m, P){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D), B = D && msOf(D.byBrand);
  let html = `<div class="ms-ct"><span>${msT(team ? 'Brands — sold against the brand target' : own ? 'My brands — sold against my brand target' : 'Brands — sold against the brand target')}</span>${msInfo('brands')}</div>`;
  if(!D) return html + `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>`;
  const rows = B && Array.isArray(B.rows) ? B.rows.filter(b => b && (b.net || b.target)) : [];
  if(!rows.length) return html + `<div class="ms-note">${msT(B && B.total == null ? 'No sales figure for this month yet.' : 'No brand sold and no brand target this month.')}</div>`;
  const wd = msOf((msOf(D.perDay) || {}).workdays), exp = msExpected(wd);
  const name = k => (m.brands && m.brands[k]) || k;
  html += rows.slice(0, 5).map(b => `<div class="ms-person"><div class="n">${msData(name(b.brand))}</div> ${b.pct != null ? msBar(b.pct, exp, true) : '<div></div>'} <div class="p${b.pct == null ? ' none' : ''}">${b.pct != null ? msPct(b.pct) : '—'}</div>
      <div class="s">${b.net != null ? msKd(b.net) : '—'}${b.target != null ? ` ${msT('of')} ${msKd(b.target)}` : ` · ${msT('no brand target')}`}</div></div>`).join('');
  if(rows.length > 5) html += `<div class="ms-fine">${msT(msCount(rows.length - 5, 'more brand in the month report', 'more brands in the month report'))}</div>`;
  if(exp != null) html += `<div class="ms-fine">${msT('The dark line = expected by')} ${msDate(wd.asOf)} (${msPct(exp)}).${B.total != null ? ` ${msT('Total')} ${msKd(B.total)}.` : ''}</div>`;
  return html;
}
// The customers: the biggest this month (the Clinics screen's list), and a person's customers to act on.
function msCustHTML(v, m){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D), C = D && msOf(D.customers), act = D && msOf(D.act);
  const acc = C && Array.isArray(C.accounts) ? C.accounts.filter(a => a && !a.channel && a.net > 0) : [];
  const big = list => `<div class="ms-items">${list.map(a => `<button class="ms-item"${a.clinicId != null ? ` data-c="${esc(String(a.clinicId))}" onclick="openClinicDetail(this.dataset.c)"` : ' disabled'}>${a.cls ? `<span class="ms-cls" data-notr>${esc(a.cls)}</span>` : ''}<div class="t"><div>${msData(a.name)}</div>${team && Array.isArray(a.reps) && a.reps.length ? `<div class="s">${a.reps.map(msWho).join(' + ')}</div>` : ''}</div><b>${msKd(a.net)}</b></button>`).join('')}</div>`;
  if(team){
    let html = `<div class="ms-ct"><span>${msT('Biggest customers this month')}</span></div>`;
    if(!D) return html + `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>`;
    html += acc.length ? big(acc.slice(0, 5)) : `<div class="ms-note">${msT(C ? 'No customer invoiced this month yet.' : 'No sales figure for this month yet.')}</div>`;
    return html + `<button class="ms-more" onclick="switchView('clinics')">${msT('All customers')} ${msChev()}</button>`;
  }
  let html = `<div class="ms-ct"><span>${msT(own ? 'My customers to act on' : 'Customers to act on')}</span>${msInfo('act')}</div>`;
  if(!D) return html + `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>`;
  const u = act && act.measurable ? act.under || [] : [], p = act && act.measurable ? act.potential || [] : [];
  html += act && act.measurable
    ? (u.length + p.length ? `<div class="ms-items">${u.slice(0, 2).map(x => msActItem(x, 'under', v)).concat(p.slice(0, 2).map(x => msActItem(x, 'potential', v))).join('')}</div>` : `<div class="ms-note">${msT('Nobody under-performing, no A or B clinic waiting')}</div>`)
    : `<div class="ms-note">${msT('Not measured: no sales figure for this month yet')}</div>`;
  if(u.length + p.length > 4) html += `<button class="ms-more" onclick="msActSheet()">${msT('See all')} ${msChev()}</button>`;
  html += `<div class="ms-sub">${msT(own ? 'My biggest customers this month' : 'Biggest customers this month')}</div>`;
  html += acc.length ? big(acc.slice(0, 3)) : `<div class="ms-note">${msT(C ? 'No customer invoiced this month yet.' : 'No sales figure for this month yet.')}</div>`;
  return html;
}

// ---- phone: the rest, one tap away ----
function msRowsHTML(v, m){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own, r = v.rep;
  const D = m && msOf(m.D), rows = [];
  const dr = team ? '' : ` data-r="${esc(r)}"`;                        // a name reaches a handler only through a data attribute
  const row = (title, sub, action, attrs) => `<button class="ms-item" onclick="${action}"${attrs || ''}><div class="t"><div>${msT(title)}</div><div class="s">${sub}</div></div>${msChev()}</button>`;
  const wait = `<span class="ms-wait">${msT('Calculating…')}</span>`;
  if(!team){
    const k = m ? msKpiNums(m) : null;
    rows.push(row('Performance score (KPI)', k && k.total != null ? msT(`${k.total} of 100`) : m ? '—' : wait, 'msKpi()', ' data-row="kpi"'));
  }
  const sd = D && msOf(D.sameDays), g = msGrowth(sd);
  rows.push(row(own ? 'My sales day by day' : 'Sales day by day', D ? (g ? `${g} ${msT('vs the same days last month')}` : msT(sd && !sd.measured ? 'No sales file for the month before' : 'In the Report tab')) : wait, `msGoReports(this.dataset.r)`, dr));
  const B = D && msOf(D.byBrand), bp = B && Array.isArray(B.rows) ? B.rows.filter(b => b && b.pct != null).map(b => b.pct) : [];
  rows.push(row(own ? 'My brands' : 'Brands', D ? (bp.length ? msT(bp.length === 1 ? `${bp[0]}% of the brand target` : `between ${Math.min.apply(null, bp)}% and ${Math.max.apply(null, bp)}% of the brand targets`) : msT('In the month report')) : wait, `renderMonthClose('${msMonth()}')`));
  const C = D && msOf(D.customers), act = D && msOf(D.act);
  const top = C && Array.isArray(C.accounts) ? C.accounts.filter(a => a && !a.channel && a.net > 0)[0] : null;
  const nAct = act && act.measurable ? (act.under || []).length + (act.potential || []).length : 0;
  rows.push(row(own ? 'My customers' : 'Customers', D ? [nAct ? msT(msCount(nAct, 'to act on', 'to act on')) : '', top ? `${msT('biggest:')} ${msData(top.name)}` : ''].filter(Boolean).join(' · ') || msT('Who bought this month, on the Clinics screen') : wait,
    nAct ? 'msActSheet()' : 'msGoClinics(this.dataset.r)', dr));
  if(!team){
    const O = D && msOf(D.orders);
    rows.push(row(own ? 'My orders in the app' : 'Orders in the app', O ? `${msT(msCount(O.count, 'order', 'orders'))} · ${msKd(O.value)} · ${msT('not invoiced sales')}` : D ? '—' : wait, `msGoReports(this.dataset.r)`, dr));
  }
  return `<div class="ms-items">${rows.join('')}</div>`;
}
// ---- taps ----
function msFold(id){
  if(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) return;   // a laptop shows every card open
  const el = document.getElementById(id); if(!el) return;
  _msOpen[id] = !el.classList.contains('open');
  el.classList.toggle('open', _msOpen[id]);
}
function msGo(id){
  const el = document.getElementById(id); if(!el) return;
  if(!el.classList.contains('open') && !(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches)){ _msOpen[id] = true; el.classList.add('open'); }
  try{ el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }catch(e){ el.scrollIntoView(); }
}
function msKpi(){ const v = msView(); if(v && v.kind === 'person'){ _kpiRep = v.rep; _kpiPeriod = 'month'; } openKpiScorecard(); }
function msGoReports(r){ if(r && currentUser.role === 'supervisor') reportRepFilter = r; switchView('reports'); }
function msGoClinics(r){ if(r && currentUser.role === 'supervisor') clinicRepFilter = r; switchView('clinics'); }

// ---- "How it is calculated": the source, the formula and this view's own numbers ----
function msHow(id){
  const v = msView(); if(!v) return;
  const m = msModelFor(v), D = m && msOf(m.D);
  const kv = (a, b) => `<div class="kv"><span>${a}</span><span>${b}</span></div>`;
  const sec = (t, src, formula, view) => `<h4>${msT(t)}</h4><div><b>${msT('Source')}:</b> ${msT(src)}</div>${formula ? `<div><b>${msT('Formula')}:</b> ${msT(formula)}</div>` : ''}${view ? `<div style="margin-top:4px;">${view}</div>` : ''}`;
  const f2 = n => (Number(n) || 0).toFixed(2);
  let body = '';
  if(id === 'sales'){
    const P = msPeople(v, msSig(v));
    body += sec('Invoiced sales', 'The ERP sales files only: every invoice line, returns deducted. A line counts for the owner of the clinic; on a shared account, for the salesman who issued it.',
      'The sum of the net invoiced value from day 1 of the month to the last day the sales files cover.',
      P.map(p => kv(msWho(p.rep), p.measured ? `${msKd(p.bm.amount)} · ${msT('files to')} ${msDate(p.bm.asOf)}` : `— · ${msT(p.bm.basis === 'none' ? 'no sales file for this month' : 'not in the sales files of this month')}`)).join('')
        + (P.length > 1 ? kv(msT('Total'), P.some(p => p.measured) ? msKd(P.filter(p => p.measured).reduce((s, p) => s + p.bm.amount, 0)) : '—') : ''));
    body += sec('Sales target', 'The DSR targets file. It gives the targets only: its achieved column is never used.', '',
      P.map(p => kv(msWho(p.rep), p.goal ? msKd(p.goal) : msT('no target on file'))).join(''));
    if(D){
      const A = msOf(D.achievement) || {}, Pd = msOf(D.perDay) || {}, wd = msOf(Pd.workdays) || {}, F = msOf(D.forecast);
      body += sec('Achievement', 'Invoiced sales from the ERP files and the target from the DSR, counting only the people who have both.', 'Achievement % = invoiced sales ÷ target × 100',
        A.pct != null ? `<div>${msN(`${f2(A.achieved)} ÷ ${f2(A.target)} × 100 = ${A.pct}%`)}</div>` : `<div>${msT('Needs a sales target and a sales figure for the same person')}</div>`);
      body += sec('Remaining to target', 'The same target and invoiced sales as the achievement percentage.', 'Remaining = max(target − invoiced sales, 0)',
        D.remaining != null ? `<div>${msN(`${f2(A.target)} − ${f2(A.achieved)}`)} = ${msKd(D.remaining)}</div>` : '');
      body += sec('Needed per working day', 'The remaining target, and the working days (Sunday to Thursday) after the last day the sales files cover.', 'Needed per working day = remaining ÷ working days left',
        (Pd.amount != null ? `<div>${msN(`${f2(D.remaining)} ÷ ${wd.left}`)} = ${msKd(Pd.amount)}</div>` : '')
        + `<div class="ms-fine">${msT(`Working days of the month: ${wd.total} · done: ${wd.done} · left: ${wd.left}`)}</div>`);
      const exp = msExpected(wd);
      if(exp != null) body += sec('Expected by now (the dark line)', 'The working days (Sunday to Thursday) from day 1 to the last day the sales files cover, against the working days of the month.',
        'Expected % = working days done ÷ working days of the month × 100. On pace from 90% of the expected figure, ahead from 100% (the rule of the management report).', `<div>${msN(`${wd.done} ÷ ${wd.total} × 100 = ${exp}%`)}</div>`);
      if(F) body += sec('Month-end forecast', 'The pace of invoiced sales so far in the ERP files, person by person — the formula of the management report.',
        'Forecast = invoiced so far ÷ working days done × working days of the month, for each person, then added up. A projection, not a sale.',
        F.amount != null ? Object.keys(F.byRep || {}).map(r => { const x = F.byRep[r]; return kv(msWho(r), `${msN(`÷ ${Math.max(1, x.done)} × ${x.total}`)} = ${msKd(x.amount)}`); }).join('') + kv(msT('Total'), msKd(F.amount)) : '');
      const sd = msOf(D.sameDays);
      if(sd) body += sec('Against the same days of the month before', 'The ERP sales files of both months, for the people measured in both.',
        'Growth % = (this month − the earlier month on the same days) ÷ the earlier month × 100. From nothing to something is said as "from zero", never as a percentage.',
        sd.measured ? kv(msT('This month'), msKd(sd.current)) + kv(`${msT('days 1 to')} ${msN(parseInt(String(sd.to || '').slice(8, 10), 10) || '')} ${esc(monthLabel(sd.month))}`, msKd(sd.previous)) : `<div>${msT('No sales file for the month before, so nothing to compare with')}</div>`);
    }
  } else if(id === 'work'){
    const Vi = D && msOf(D.visits), O = D && msOf(D.orders), C = D && msOf(D.conversion), N = D && msOf(D.newCustomers);
    body += sec('Field visits', 'Visits as logged in the app — not calls and not phone orders. A joint visit counts once for the team.', '', Vi ? kv(msT('This month'), msN(Vi.count)) : '');
    body += sec('Conversion to an order', 'The field visits a person led that took an order, against the field visits she led (a joint visit\'s order is its leader\'s).', 'Conversion % = led visits with an order ÷ led visits × 100',
      C && C.pct != null ? `<div>${msN(`${C.withOrder} ÷ ${C.visits} × 100 = ${C.pct}%`)}</div>` : '');
    body += sec('Orders logged in the app', 'Every visit or phone order with an order, for the person who logged it. These are not invoiced sales: invoiced sales come from the ERP files only.', '',
      O ? kv(msT('Orders'), msN(O.count)) + kv(msT('Value logged'), msKd(O.value)) : '');
    body += sec('New customers', 'The ERP sales files: an account whose first invoice in all the saved files falls in this month. Online and channel accounts are not counted.', 'The number of those accounts for the people of the view.',
      N ? (N.measurable ? kv(msT('This month'), msN(N.count)) : `<div>${msT('Needs sales files that start at least a month earlier, or every account would look new')}</div>`) : '');
  } else if(id === 'visits'){
    const k = m ? msKpiNums(m) : null;
    body += sec('Visits a day, doctors and new accounts', 'The KPI scorecard (More → KPI scorecard) for this person, this month, with the KPI settings of the supervisor.',
      'Visits a day = field visits ÷ working days so far (a joint visit counts for both people). Doctors = different doctors met on field visits.',
      k && k.month ? kv(msT('Visits a day'), `${msN(k.month.perDay.toFixed(1))} · ${msT(`${k.month.count} visits in ${k.month.days} working days`)}`)
        + (k.goal != null ? kv(msT('Goal'), msT(`goal ${k.goal} a day`)) : '')
        + (k.doctors != null ? kv(msT('Doctors'), `${k.doctorsGoal != null ? msT(`${k.doctors} of ${k.doctorsGoal}`) : msN(k.doctors)}${k.doctorsBy != null ? ' · ' + msT(`expected ${k.doctorsBy}`) : ''}`) : '')
        + (k.accounts != null ? kv(msT('New accounts'), k.accountsGoal != null ? msT(`${k.accounts} of ${k.accountsGoal}`) : msN(k.accounts)) : '')
        + (k.total != null ? kv(msT('Performance score (KPI)'), msT(`${k.total} of 100`)) : '') : '');
  } else if(id === 'chart'){
    const Dy = D && msOf(D.daily), sd = D && msOf(D.sameDays), ly = D && msOf(D.lastYear), Y = D && msOf(D.ytd);
    body += sec('Sales day by day', 'The ERP sales files: the net invoiced value of each day, from day 1 to the last day the sales files cover, added up day after day.',
      'The straight line runs from 0 on day 1 to the target on the last day of the month; the dotted line is the month-end forecast at the pace so far.',
      Dy && Dy.measured && Array.isArray(Dy.days) ? kv(msT('Days'), msN(Dy.days.length)) + kv(msT('Total'), msKd(Dy.days.reduce((a, d) => a + (Number(d.net) || 0), 0))) : '');
    const cmp = (t, g, none) => sec(t, 'The ERP sales files of both months, for the people measured in both.',
      'Growth % = (this month − the earlier month on the same days) ÷ the earlier month × 100. From nothing to something is said as "from zero", never as a percentage.',
      g ? (g.measured ? kv(msT('This month'), msKd(g.current)) + kv(`${msT('days 1 to')} ${msN(parseInt(String(g.to || '').slice(8, 10), 10) || '')} ${esc(monthLabel(g.month))}`, msKd(g.previous)) : `<div>${msT(none)}</div>`) : '');
    body += cmp('Against the same days of the month before', sd, 'No sales file for the month before, so nothing to compare with');
    if(ly) body += cmp('Against the same month a year before', ly, 'No sales file for that month a year before, so nothing to compare with');
    if(Y){
      const L = msOf(Y.like) || {};
      body += sec('Year to date', "The ERP sales files of each month and that month's own DSR target, from January to this month.",
        "Year to date = the sum of the months' invoiced sales. The percentage counts only the months and people that have both a sales figure and a target.",
        (Y.sales != null ? kv(msT('Invoiced sales'), msKd(Y.sales)) : '') + (L.pct != null ? kv(msT('Where a month has both'), `${msKd(L.sales)} ${msT('of')} ${msKd(L.target)} = ${msPct(L.pct)}`) : ''));
    }
  } else if(id === 'brands'){
    body += sec('Brands', 'The month\'s invoiced lines by brand (returns deducted), and the brand targets of the DSR.', 'Brand % = sold of the brand ÷ the brand\'s target × 100, for the people who have both.', '');
  } else if(id === 'act'){
    body += sec('Under-performing', 'The ERP sales files of this month and the 3 months before.', 'Bought in at least 2 of the 3 months before, and this month less than half of their average on the same days.', '');
    body += sec('High potential', 'The clinic list (class) and the ERP sales files.', 'A clinic graded A or B with no paid invoice this month, and one in at most 1 of the 3 months before.', '');
  }
  if(!D && id !== 'visits') body += `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>`;
  showModal(`<h3 style="margin-top:0;">${I('info')} ${msT('How it is calculated')}</h3><div class="ms-how">${body}</div><button class="btn secondary" onclick="closeModal()">Close</button>`);
}

// ---- MISSED PLANNED VISITS ----
function renderMissedPlans(){
  const el = document.getElementById('missedList');
  const title = document.getElementById('missedTitle');
  if(!el || !title) return;
  let list = UMCore.missedPlans(dayPlans, visits, todayStr(), {daysBack:14});
  if(currentUser.role!=='supervisor') list = list.filter(m=>m.rep===currentUser.name);
  const lr = msListRep();
  if(lr) list = list.filter(m=>m.rep===lr);      // a person's screen: her plans
  list = list.slice(0,8);
  if(list.length===0){ title.style.display='none'; el.innerHTML=''; return; }
  title.style.display='';
  const cname = id => clinicLabel(id);
  el.innerHTML = list.map(m=>`
    <div class="card" style="margin-bottom:8px;">
      <div class="row-between">
        <div style="flex:1; cursor:pointer;" onclick="openClinicDetail('${m.clinicId}')">
          <div class="clinic-name" dir="auto">${esc(cname(m.clinicId))}</div>
          <div class="clinic-sub"><span>Planned ${fmtDate(m.date)}</span>${currentUser.role==='supervisor' && !lr?' · '+msWho(m.rep):''}${m.note?` · <span dir="auto">${esc(m.note)}</span>`:''} · <span>not visited</span></div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0; margin-inline-start:8px;">
          <button class="chip small" onclick="openReschedulePlan('${m.date}','${esc(m.rep)}','${m.clinicId}')">${I('calendar')} Reschedule</button>
          <button class="chip small" onclick="removeMissedPlan('${m.date}','${esc(m.rep)}','${m.clinicId}')">✕</button>
        </div>
      </div>
    </div>`).join('');
}
function openReschedulePlan(date, rep, clinicId){
  const c = clinics.find(x=>x.id===clinicId);
  const d = new Date(); d.setDate(d.getDate()+1);
  showModal(`
    <h3 style="margin-top:0;">Reschedule planned visit</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${esc(c?c.name:'Clinic')} — was planned for ${fmtDate(date)}.</p>
    <label>New date</label>
    <input type="date" id="rsDate" value="${localDateStr(d)}" min="${todayStr()}">
    <button class="btn" onclick="saveReschedulePlan('${date}','${esc(rep)}','${clinicId}')">Move visit</button>
  `);
}
async function saveReschedulePlan(oldDate, rep, clinicId){
  const newDate = document.getElementById('rsDate').value;
  if(!newDate){ showToast('Pick a date'); return; }
  const dayObj = dayPlans[oldDate];
  if(!dayObj || !dayObj[rep]) { closeModal(); return; }
  const entry = dayObj[rep].find(e=>planEntryId(e)===clinicId);
  dayObj[rep] = dayObj[rep].filter(e=>planEntryId(e)!==clinicId);
  if(dayObj[rep].length===0){ delete dayObj[rep]; tomb('dayPlans', oldDate+'|'+rep); }
  if(Object.keys(dayObj).length===0) delete dayPlans[oldDate];
  dayPlans[newDate] = dayPlans[newDate] || {};
  dayPlans[newDate][rep] = dayPlans[newDate][rep] || [];
  if(!dayPlans[newDate][rep].some(e=>planEntryId(e)===clinicId)){
    dayPlans[newDate][rep].push(typeof entry==='string' ? {id:clinicId, note:''} : (entry || {id:clinicId, note:''}));
  }
  await persist('dayPlans');
  closeModal();
  showToast(`📅 Moved to ${fmtDate(newDate)}`);
  renderMissedPlans();
  renderPlanList();
  renderCalendar();
}
async function removeMissedPlan(date, rep, clinicId){
  const dayObj = dayPlans[date];
  if(dayObj && dayObj[rep]){
    dayObj[rep] = dayObj[rep].filter(e=>planEntryId(e)!==clinicId);
    if(dayObj[rep].length===0){ delete dayObj[rep]; tomb('dayPlans', date+'|'+rep); }
    if(Object.keys(dayObj).length===0) delete dayPlans[date];
    await persist('dayPlans');
  }
  renderMissedPlans();
  renderCalendar();
}

// ---- DORMANT CLINICS ----
function renderDormant(){
  const el = document.getElementById('dormantList');
  const title = document.getElementById('dormantTitle');
  if(!el || !title) return;
  let list = UMCore.dormantClinics(clinics, visits, todayStr(), {days:30});
  if(currentUser.role!=='supervisor') list = list.filter(c=>c.rep===currentUser.name);
  const total = list.length;
  list = list.slice(0,6);
  if(list.length===0){ title.style.display='none'; el.innerHTML=''; return; }
  title.style.display='';
  el.innerHTML = list.map(c=>`
    <div class="card clickable" onclick="openClinicDetail('${c.id}')" style="margin-bottom:8px;">
      <div class="row-between">
        <div>
          <div class="clinic-name">${esc(c.name)}</div>
          <div class="clinic-sub">Class ${esc(c.cls)}${currentUser.role==='supervisor'?' · '+esc(c.rep):''} · ${c.lastVisit ? c.daysSince+' days since last visit' : 'Never visited'}</div>
        </div>
        <span class="badge overdue">${c.lastVisit ? c.daysSince+'d' : 'new'}</span>
      </div>
    </div>`).join('')
    + (total>6 ? `<div style="color:var(--muted); font-size:12px; text-align:center; padding:4px 0;">+ ${total-6} more priority clinic${total-6===1?'':'s'} going quiet</div>` : '');
}

function renderToday(){
  renderErpNudge();
  renderDocCardsNudge();
  document.body.classList.toggle('on-today', activeView === 'today');
  const v = msView();
  if(!v) return;
  const all = visibleDueClinics();
  const due = v.kind === 'person' ? all.filter(c => c.rep === v.rep) : all;   // a person's screen: her follow-ups
  const tts = document.getElementById('tileTeamSub');
  if(tts) tts.textContent = (chatMsgs.length?chatMsgs.length+' messages':'Chat and photos') + (memories.length?' · '+memories.length+' memories':'');
  const hasAlerts = all.length>0;
  document.getElementById('headerDot').classList.toggle('show', hasAlerts);
  document.getElementById('navDotToday').classList.toggle('show', hasAlerts);

  renderWelcome();
  renderFocusCard();
  renderOccasionsCard();
  renderMissedPlans();
  renderDormant();
  renderStreak();
  renderBadges();
  renderPlanList();
  renderDueList(due);
  renderTasks();
  renderRecentVisits(v);
  msFoldSums(v, due);
  ['msPlanCard', 'msDueCard', 'msTaskCard', 'msRecentCard'].forEach(id => { const el = document.getElementById(id); if(el) el.classList.toggle('open', !!_msOpen[id]); });
  // the figures: the last ones of this view at once, the fresh ones a moment later (msRun)
  let m = null, sig = null;
  try{ sig = msSig(v); m = msEnsure(v, sig); }catch(e){ console.error('main screen', e); }
  msPaint(v, m, sig);
}
function renderDueList(due){
  const dueList = document.getElementById('dueList');
  if(!dueList) return;
  const sup = currentUser.role==='supervisor' && !msListRep();
  if(due.length===0){
    dueList.innerHTML = `<div class="empty"><div class="big">✅ All caught up</div>Zero overdue follow-ups. That is discipline — well done.</div>`;
  } else {
    dueList.innerHTML = due.map(c => `
      <div class="card clickable" onclick="confirmFollowUp('${c.id}')">
        <div class="row-between">
          <div class="row-between" style="gap:10px;">
            <span class="cls cls-${c.cls}" data-notr>${c.cls||'-'}</span>
            <div>
              <div class="clinic-name" dir="auto">${esc(c.name)}</div>
              <div class="clinic-sub"><span>${statusLabel(c.nextFollowUp)}</span>${sup?' · '+msWho(c.rep):''}</div>
            </div>
          </div>
          <span class="badge ${followStatus(c.nextFollowUp)}">${followStatus(c.nextFollowUp)==='overdue'?'Overdue':'Today'}</span>
        </div>
      </div>`).join('');
  }
}
function renderRecentVisits(v){
  const rv = document.getElementById('recentVisits');
  if(!rv) return;
  const r = v && v.kind === 'person' ? v.rep : null, sup = currentUser.role==='supervisor' && !r;
  const recent = visibleVisits().filter(x => !r || x.rep === r || x.withRep === r).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  if(recent.length===0){
    rv.innerHTML = `<div class="empty">🌱 Your first logged visit starts the story.</div>`;
  } else {
    rv.innerHTML = recent.map(x=>{
      const clinic = clinics.find(c=>c.id===x.clinicId);
      return `<div class="card">
        <div class="row-between">
          <div>
            <div class="clinic-name">${x.callOnly?(CHANNEL_LABELS[x.channel]||'📞')+' ':''}<span dir="auto">${esc(clinic ? clinic.name : clinicLabel(x.clinicId, x))}</span></div>
            <div class="clinic-sub">${fmtDate(x.date)}${x.orderTaken ? ' · '+msKd(x.orderTotal) : ''}${sup?' · '+msWho(x.rep):''}${rxShortHTML(x)}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }
}
// phone: what each folded card holds, in one line
function msFoldSums(v, due){
  const set = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
  const today = todayStr(), dayObj = dayPlans[today] || {};
  const planOf = r => { const e = (dayObj[r] || []).map(planEntryId).filter(id => clinics.some(c => c.id === id)); return { n: e.length, done: e.filter(id => visits.some(x => x.clinicId === id && x.rep === r && x.date === today)).length }; };
  if(v.kind === 'person'){ const p = planOf(v.rep); set('msPlanSum', msT(p.n ? `${p.done} of ${p.n} done` : 'No plan yet')); }
  else { const parts = v.reps.map(r => ({ r, p: planOf(r) })).filter(x => x.p.n); set('msPlanSum', parts.length ? parts.map(x => `${msWho(x.r)} ${msT(`${x.p.done} of ${x.p.n}`)}`).join(' · ') : msT('No plan yet')); }
  const over = due.filter(c => followStatus(c.nextFollowUp) === 'overdue').length;
  set('msDueSum', due.length ? `${msT(msCount(due.length, 'due', 'due'))}${over ? ' · ' + msT(`${over} overdue`) : ''}` : msT('None due'));
  const r = v.kind === 'person' ? v.rep : null;
  const open = visibleTasks().filter(t => !t.done && (!r || t.rep === r || t.rep === 'Team')).length;
  set('msTaskSum', msT(open ? msCount(open, 'open task', 'open tasks') : 'No open tasks'));
  const last = visibleVisits().filter(x => !r || x.rep === r || x.withRep === r).sort((a, b) => b.date.localeCompare(a.date))[0];
  set('msRecentSum', last ? `${msData(clinicLabel(last.clinicId, last))} · <span style="white-space:nowrap;">${msDate(last.date)}</span>` : msT('No visits logged yet.'));
}

function renderTasks(){
  const list = document.getElementById('taskList');
  const lr = msListRep();                         // a person's screen: her tasks and the team's
  const vis = lr ? visibleTasks().filter(t=>t.rep===lr || t.rep==='Team') : visibleTasks();
  const open = vis.filter(t=>!t.done);
  const done = vis.filter(t=>t.done);
  const ordered = [...open, ...done];
  if(ordered.length===0){
    list.innerHTML = `<div style="color:var(--muted); font-size:13.5px; padding:6px 0;">✨ Clear head, clear road. No open tasks.</div>`;
    return;
  }
  list.innerHTML = ordered.map(t=>{
    const dueBadge = (t.dueDate && !t.done) ? `<span class="badge ${followStatus(t.dueDate)}" style="margin-inline-start:6px;">${statusLabel(t.dueDate).split('·')[0].trim()}</span>` : '';
    const clickable = t.kind==='followup' && t.clinicId;
    return `
    <div class="task-item" style="padding:7px 0;">
      <div class="task-check ${t.done?'checked':''}" onclick="toggleTask('${t.id}')">${t.done?'✓':''}</div>
      <div class="task-text ${t.done?'done':''}" ${clickable?`style="cursor:pointer;" onclick="confirmFollowUp('${t.clinicId}')"`:''}>${t.source==='email'?'<span style="color:var(--purple-ink);">✉ </span>':''}<span dir="auto">${esc(t.text)}</span>${dueBadge}${currentUser.role==='supervisor' && !lr && t.rep!=='Team' ? ' <span style=\"color:var(--muted); font-weight:500;\">— '+msWho(t.rep)+'</span>' : ''}</div>
      <button class="del" onclick="deleteTask('${t.id}')">&times;</button>
    </div>`;
  }).join('');
}

async function addTask(){
  const inp = document.getElementById('newTaskInput');
  const val = inp.value.trim();
  if(!val) return;
  tasks.push({id:uid(), text:val, done:false, created:todayStr(), rep: currentUser.role==='supervisor' ? 'Team' : currentUser.name});
  inp.value='';
  await persist('tasks');
  renderToday();
}
async function toggleTask(id){ const t = tasks.find(x=>x.id===id); if(t){ t.done = !t.done; if(t.done && navigator.vibrate) navigator.vibrate(10); await persist('tasks'); renderToday(); } }
async function deleteTask(id){ tomb('tasks', id); tasks = tasks.filter(x=>x.id!==id); await persist('tasks'); renderToday(); }

// ---- TODAY'S PLAN ----
function repsForPlan(){ return currentUser.role==='supervisor' ? [currentUser.name, ...REPS.filter(r=>r!==currentUser.name)] : [currentUser.name]; }
function planEntryId(e){ return typeof e==='string' ? e : e.id; }
function planEntryNote(e){ return typeof e==='string' ? '' : (e.note||''); }
function renderPlanList(){
  const el = document.getElementById('planList');
  const today = todayStr();
  const dayObj = dayPlans[today] || {};
  const lr = msListRep();                         // a person's screen: her plan only
  const repsToShow = lr ? [lr] : repsForPlan();
  let html = '';
  repsToShow.forEach(r=>{
    const entries = dayObj[r] || [];
    if(entries.length===0) return;
    if(currentUser.role==='supervisor' && !lr) html += `<div class="doc-group-head">${msWho(r)}</div>`;
    entries.forEach(entry=>{
      const cid = planEntryId(entry);
      const note = planEntryNote(entry);
      const c = clinics.find(x=>x.id===cid);
      if(!c) return;
      const visitedToday = visits.some(v=>v.clinicId===cid && v.rep===r && v.date===today);
      html += `<div class="card ${visitedToday?'dim':''}" ${visitedToday?'':`onclick="quickLogFrom('${cid}')"`}>
        <div class="row-between">
          <div class="row-between clickable" style="gap:10px;">
            <div class="plan-check ${visitedToday?'done':''}">${visitedToday?'✓':''}</div>
            <div>
              <div class="clinic-name" dir="auto">${esc(c.name)}</div>
              <div class="clinic-sub">${visitedToday?'Visited today':(note?`<span dir="auto">${esc(note)}</span>`:'Tap to log visit')}</div>
            </div>
          </div>
          <span class="cls cls-${c.cls}" data-notr>${c.cls||'-'}</span>
        </div>
      </div>`;
    });
  });
  if(!html){
    el.innerHTML = `<div class="empty"><div class="big">${I('compass')} Plan beats improvise</div>Pick 5–8 clinics and own the day.</div>`;
  } else {
    el.innerHTML = html;
  }
}
function openPlanDay(){
  const today = todayStr();
  const dayObj = dayPlans[today] || {};
  // Entries are {id, note} objects (legacy plans may hold bare ids) — keep the
  // originals so notes survive, and select by clinic id.
  const entries = (dayObj[currentUser.name] || []).map(e => typeof e==='string' ? {id:e, note:''} : e);
  const mine = new Set(entries.map(planEntryId));
  const pool = currentUser.role==='supervisor' ? clinics.filter(c=>c.cls!=='Closed') : clinics.filter(c=>c.rep===currentUser.name && c.cls!=='Closed');
  const myClinics = pool.sort((a,b)=>{
    const order = {overdue:0, today:1, upcoming:2, none:3};
    return order[followStatus(a.nextFollowUp)] - order[followStatus(b.nextFollowUp)];
  });
  showModal(`
    <h3 style="margin-top:0;">Plan today's visits</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Tap clinics to add or remove them from today's plan.</p>
    <input type="text" id="planSearch" placeholder="Search your clinics..." oninput="renderPlanPicker()" style="margin-bottom:10px;">
    <div class="chip-row" id="planPicker"></div>
    <button class="btn" onclick="closeModal(); renderPlanList();">Done</button>
  `);
  window._planMine = mine;
  window._planEntries = entries;
  window._planClinics = myClinics;
  renderPlanPicker();
}
function renderPlanPicker(){
  const q = (document.getElementById('planSearch').value||'').toLowerCase();
  const el = document.getElementById('planPicker');
  const list = window._planClinics.filter(c=>c.name.toLowerCase().includes(q));
  el.innerHTML = list.map(c=>`<div class="chip small ${window._planMine.has(c.id)?'on':''}" onclick="togglePlanClinic('${c.id}')">${esc(c.name)}</div>`).join('');
}
async function togglePlanClinic(id){
  const today = todayStr();
  let entries = (window._planEntries || []).map(e => typeof e==='string' ? {id:e, note:''} : e);
  if(window._planMine.has(id)){ window._planMine.delete(id); entries = entries.filter(e=>planEntryId(e)!==id); }
  else { window._planMine.add(id); if(!entries.some(e=>planEntryId(e)===id)) entries.push({id, note:'', at: Date.now()}); } // `at`: when it was planned (KPI: plan before the first visit)
  window._planEntries = entries;
  dayPlans[today] = dayPlans[today] || {};
  if(entries.length) dayPlans[today][currentUser.name] = entries;
  else {
    delete dayPlans[today][currentUser.name];
    if(Object.keys(dayPlans[today]).length===0) delete dayPlans[today];
  }
  await persist('dayPlans');
  renderPlanPicker();
  renderPlanList();
}

// ---- WEEKLY / MONTHLY VISIT PLANNER ----
let planViewMode = 'week';
let planViewAnchor = todayStr();
let planViewRep = null;
function localDateStr(d){ return UMCore.localDateStr(d); }
function getWeekDates(anchor){ return UMCore.getWeekDates(anchor); }
function getMonthDates(anchor){ return UMCore.getMonthDates(anchor); }
function openWeekMonthPlan(){
  planViewMode = 'week';
  planViewAnchor = todayStr();
  planViewRep = currentUser.role==='supervisor' ? (planViewRep || currentUser.name) : currentUser.name;
  showModal(`
    <h3 style="margin-top:0;">Visit plan</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Plan clinics ahead by day, with notes.</p>
    ${currentUser.role==='supervisor' ? `<label>Viewing schedule for</label>
    <div class="chip-row" id="pvRepChips" style="margin-bottom:14px;">${[currentUser.name, ...REPS.filter(r=>r!==currentUser.name)].map(r=>`<div class="chip small ${planViewRep===r?'on':''}" data-rep="${esc(r)}" onclick="setPlanViewRep('${esc(r)}')">${esc(r)}</div>`).join('')}</div>` : ''}
    <div class="toggle-row" style="margin-bottom:14px;">
      <div class="chip on" id="pvModeWeek" onclick="setPlanViewMode('week')">Weekly</div>
      <div class="chip" id="pvModeMonth" onclick="setPlanViewMode('month')">Monthly</div>
    </div>
    <div class="row-between" style="margin-bottom:12px;">
      <button class="btn ghost small" style="margin:0; padding:8px 14px;" onclick="shiftPlanView(-1)">&larr;</button>
      <div id="pvRangeLabel" style="font-weight:700; font-size:14.5px;"></div>
      <button class="btn ghost small" style="margin:0; padding:8px 14px;" onclick="shiftPlanView(1)">&rarr;</button>
    </div>
    <div id="pvBody"></div>
    <button class="btn secondary" onclick="closeModal(); renderPlanList();">Close</button>
  `);
  renderWeekMonthPlan();
}
function setPlanViewRep(rep){
  rep = ownRepOnly(rep);
  planViewRep = rep;
  document.querySelectorAll('#pvRepChips .chip').forEach(c=>c.classList.toggle('on', c.dataset.rep===rep));
  if(document.getElementById('pvBody')) renderWeekMonthPlan();
}
function setPlanViewMode(mode){
  planViewMode = mode;
  document.getElementById('pvModeWeek').classList.toggle('on', mode==='week');
  document.getElementById('pvModeMonth').classList.toggle('on', mode==='month');
  renderWeekMonthPlan();
}
function shiftPlanView(dir){
  const d = new Date(planViewAnchor+'T00:00:00');
  if(planViewMode==='week') d.setDate(d.getDate()+dir*7); else d.setMonth(d.getMonth()+dir, 1); // day 1: the 31st must not skip a month
  planViewAnchor = localDateStr(d);
  renderWeekMonthPlan();
}
function renderWeekMonthPlan(){
  const dates = planViewMode==='week' ? getWeekDates(planViewAnchor) : getMonthDates(planViewAnchor);
  const first = new Date(dates[0]+'T00:00:00'), last = new Date(dates[dates.length-1]+'T00:00:00');
  document.getElementById('pvRangeLabel').textContent = planViewMode==='week'
    ? `${first.toLocaleDateString(uiLocale(),{month:'short',day:'numeric'})} – ${last.toLocaleDateString(uiLocale(),{month:'short',day:'numeric'})}`
    : first.toLocaleDateString(uiLocale(),{month:'long', year:'numeric'});
  const el = document.getElementById('pvBody');
  el.innerHTML = dates.map(d=>{
    const dayObj = dayPlans[d] || {};
    const mine = dayObj[planViewRep] || [];
    const dow = new Date(d+'T00:00:00').toLocaleDateString(uiLocale(),{weekday:'short'});
    const dnum = new Date(d+'T00:00:00').toLocaleDateString(uiLocale(),{month:'short',day:'numeric'});
    const isToday = d===todayStr();
    return `<div class="card clickable" onclick="openDatePlanner('${d}')" style="${isToday?'border-color:var(--teal); border-width:1.5px;':''} margin-bottom:8px;">
      <div class="row-between">
        <div>
          <div class="clinic-name">${dow}, ${dnum}${isToday?' · Today':''}</div>
          <div class="clinic-sub">${mine.length ? mine.length+' clinic'+(mine.length===1?'':'s')+' planned' : 'No visits planned'}</div>
        </div>
        <span class="badge ${mine.length?'upcoming':'none'}">${mine.length||''}</span>
      </div>
    </div>`;
  }).join('');
}
function openDatePlanner(dateStr, repOverride){
  // A supervisor plans on behalf of a rep — never under their own name, which
  // no screen would ever show. Reps can only plan for themselves.
  let rep = repOverride || planViewRep || currentUser.name;
  if(currentUser.role === 'supervisor' && !REPS.includes(rep)) rep = REPS[0];
  rep = ownRepOnly(rep);
  planViewRep = rep;
  const dayObj = dayPlans[dateStr] || {};
  const mine = (dayObj[rep] || []).map(e => typeof e==='string' ? {id:e, note:''} : {...e});
  const repClinics = clinics.filter(c=>c.rep===rep && c.cls!=='Closed').sort((a,b)=>a.name.localeCompare(b.name));
  showModal(`
    <h3 style="margin-top:0;">${fmtDate(dateStr)} plan${currentUser.role==='supervisor'?' — '+esc(rep):''}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Tap a clinic to add it, then add an optional note.</p>
    ${currentUser.role==='supervisor' ? `<label>Plan for</label><div class="chip-row" id="dpRepChips" style="margin-bottom:8px;">${REPS.map(r=>`<div class="chip small ${r===rep?'on':''}" data-rep="${esc(r)}" onclick="openDatePlanner('${dateStr}','${esc(r)}')">${esc(r)}</div>`).join('')}</div>` : ''}
    <input type="text" id="dpSearch" placeholder="Search clinics..." oninput="renderDatePlanPicker()" style="margin-bottom:10px;">
    <div class="chip-row" id="dpPicker"></div>
    <div class="section-title" style="margin-top:18px;">Planned</div>
    <div id="dpSelected"></div>
    <button class="btn" onclick="closeModal(); renderPlanList(); renderCalendar(); if(document.getElementById('pvRangeLabel')) renderWeekMonthPlan();">Done</button>
  `);
  window._dpDate = dateStr;
  window._dpRep = rep;
  window._dpMine = mine;
  window._dpClinics = repClinics;
  renderDatePlanPicker();
  renderDatePlanSelected();
}
function renderDatePlanPicker(){
  const q = (document.getElementById('dpSearch').value||'').toLowerCase();
  const el = document.getElementById('dpPicker');
  const mineIds = new Set(window._dpMine.map(e=>e.id));
  const list = window._dpClinics.filter(c=>c.name.toLowerCase().includes(q) && !mineIds.has(c.id));
  el.innerHTML = list.map(c=>`<div class="chip small" onclick="addDatePlanClinic('${c.id}')">${esc(c.name)}</div>`).join('') || `<div style="color:var(--muted); font-size:13px;">No more clinics match.</div>`;
}
async function saveDatePlan(){
  const d = window._dpDate;
  dayPlans[d] = dayPlans[d] || {};
  dayPlans[d][window._dpRep] = window._dpMine;
  await persist('dayPlans');
}
async function addDatePlanClinic(id){
  window._dpMine.push({id, note:'', at: Date.now()});
  await saveDatePlan();
  renderDatePlanPicker();
  renderDatePlanSelected();
}
async function removeDatePlanClinic(id){
  window._dpMine = window._dpMine.filter(e=>e.id!==id);
  await saveDatePlan();
  renderDatePlanPicker();
  renderDatePlanSelected();
}
async function updateDatePlanNote(id, note){
  const e = window._dpMine.find(e=>e.id===id);
  if(e) e.note = note;
  await saveDatePlan();
}
function renderDatePlanSelected(){
  const el = document.getElementById('dpSelected');
  if(!window._dpMine.length){ el.innerHTML = `<div style="color:var(--muted); font-size:13px;">No clinics planned yet.</div>`; return; }
  el.innerHTML = window._dpMine.map(e=>{
    const c = clinics.find(x=>x.id===e.id);
    if(!c) return '';
    return `<div class="card" style="margin-bottom:8px;">
      <div class="row-between">
        <div class="clinic-name">${esc(c.name)}</div>
        <button class="del" onclick="removeDatePlanClinic('${e.id}')">&times;</button>
      </div>
      <input type="text" placeholder="Note (optional) — e.g. discuss new order" value="${esc(e.note)}" onchange="updateDatePlanNote('${e.id}', this.value)" style="margin-top:8px; font-size:13px;">
    </div>`;
  }).join('');
}

