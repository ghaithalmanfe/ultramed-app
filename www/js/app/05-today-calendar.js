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
        <div style="font-size:12px; color:var(--muted);">${v.orderTaken?'Order taken · '+money(v.orderTotal||0):(v.callOnly?'Remote follow-up':'No order')}</div>
        ${(v.photos&&v.photos.length)?`<div class="photo-row">${v.photos.map(ph=>`<img class="photo-thumb" src="${ph.thumb}" onclick="event.stopPropagation(); showLightbox('${ph.id}','${esc(cname(v.clinicId))}')">`).join('')}</div>`:''}
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
    ${tile(I('package'),'Products & prices','118 products, 13 brands',"switchView('products')")}
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
  document.getElementById('greeting').textContent = `${greet}, ${shortName}`;
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
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  let docs = [];
  try{ docs = UMCore.doctorAnalytics({clinics: clinics.filter(c=>canViewClinic(c)), visits, today: todayStr(), repFilter}); }catch(e){}
  const bdays = docs.filter(d=>d.birthdayIn!=null && d.birthdayIn<=7).sort((a,b)=>a.birthdayIn-b.birthdayIn);
  const due = docs.filter(d=>d.cadenceStatus==='due').length;
  if(!bdays.length && !due){ el.innerHTML=''; return; }
  el.innerHTML = `<div class="card clickable" style="margin-bottom:14px; border-inline-start:4px solid var(--gold);" onclick="switchView('doctors')">
    <div style="font-weight:700; font-size:13.5px;">${I('gift')} Occasions & follow-ups</div>
    ${bdays.slice(0,3).map(d=>`<div style="font-size:12.5px; padding:2px 0;">🎂 <b>${esc(d.name)}</b> (${esc(d.clinicName)}) — ${d.birthdayIn===0?'birthday TODAY!':'in '+d.birthdayIn+' day'+(d.birthdayIn===1?'':'s')}</div>`).join('')}
    ${due?`<div style="font-size:12.5px; padding:2px 0;">⏰ <b>${due}</b> doctor${due===1?'':'s'} overdue for a scheduled visit</div>`:''}
    <div style="color:var(--muted); font-size:11px; margin-top:3px;">Open the doctors database ›</div>
  </div>`;
}
function renderTargetCard(){
  const el = document.getElementById('targetCard');
  if(!el) return;
  const reps = currentUser.role==='supervisor' ? REPS : [currentUser.name];
  const withTargets = reps.filter(r=>{ const t=targets[r]; return t && (t.revenue>0 || t.visits>0); });
  if(withTargets.length===0){
    el.innerHTML = currentUser.role==='supervisor'
      ? `<div class="card clickable" onclick="openAdminPanel()" style="margin-bottom:14px;">
          <div style="font-weight:700; font-size:14px;">${I('target')} Monthly targets</div>
          <div style="color:var(--muted); font-size:12.5px; margin-top:2px;">Set sales and visit targets per rep in the admin panel to see live progress here.</div>
        </div>` : '';
    return;
  }
  const monthName = new Date(todayStr()+'T00:00:00').toLocaleDateString(uiLocale(),{month:'long'});
  // One compact line per rep — the detailed breakdown lives in Report.
  el.innerHTML = `<div class="card clickable" style="margin-bottom:14px;" onclick="switchView('reports')">
    <div class="row-between" style="margin-bottom:6px;">
      <div style="font-weight:700; font-size:13.5px;">${I('target')} ${monthName} target</div>
      <span style="display:flex; gap:8px; align-items:center;">
        <button class="chip small" onclick="event.stopPropagation(); openMonthReports()">${I('book')} Months</button>
        <span style="color:var(--muted); font-size:11.5px;">details ›</span>
      </span>
    </div>
    ${withTargets.map(r=>{
      const t = targets[r];
      const sup = currentUser.role==='supervisor';
      const mStart = todayStr().slice(0,7)+'-01';
      // field visits only (no calls, no phone orders); a joint visit counts for both reps
      const vN = visits.filter(v=>isFieldVisit(v) && (v.rep===r || v.withRep===r) && v.date>=mStart && v.date<=todayStr()).length;
      const vTxt = t.visits>0 ? ` · <span style="white-space:nowrap;">Visits ${vN}/${t.visits} (${Math.round(vN/t.visits*100)}%)</span>` : '';
      if(!(t.revenue>0)){
        // a visits-only target still deserves its row
        const vp = Math.round(vN/t.visits*100);
        return `<div style="padding:5px 0;">
          <div style="display:flex; align-items:center; gap:10px;">
            ${sup?`<div style="width:58px; font-size:12.5px; font-weight:700; flex-shrink:0;">${esc(r)}</div>`:''}
            <div style="flex:1; height:6px; border-radius:3px; background:var(--paper); overflow:hidden;"><div style="width:${Math.min(100,vp)}%; height:100%; border-radius:3px; background:var(--teal);"></div></div>
            <div style="font-size:16px; font-weight:800; flex-shrink:0; min-width:48px; text-align:end;">${vp}%</div>
          </div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px; ${sup?'padding-inline-start:68px;':''}">Visits ${vN} of ${t.visits} this month · no sales target set</div>
        </div>`;
      }
      const bm = bestMonthRevenue(r);
      const pct = Math.round(bm.amount/t.revenue*100);
      const state = pct>=100 ? ['Achieved','var(--sage-ink)','var(--sage)'] : pct>=60 ? ['On pace','var(--sage-ink)','var(--teal)'] : ['Behind','var(--amber-ink)','var(--amber)'];
      return `<div style="padding:5px 0;">
        <div style="display:flex; align-items:center; gap:10px;">
          ${sup?`<div style="width:58px; font-size:12.5px; font-weight:700; flex-shrink:0;">${esc(r)}</div>`:''}
          <div style="flex:1; height:6px; border-radius:3px; background:var(--paper); overflow:hidden;"><div style="width:${Math.min(100,pct)}%; height:100%; border-radius:3px; background:${state[2]};"></div></div>
          <div style="font-size:16px; font-weight:800; color:${state[1]}; flex-shrink:0; min-width:48px; text-align:end;">${pct}%</div>
        </div>
        <div style="font-size:11.5px; color:var(--muted); margin-top:2px; ${sup?'padding-inline-start:68px;':''}">${money(bm.amount)} of ${money(t.revenue)} · ${state[0]}${vTxt}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:1px; ${sup?'padding-inline-start:68px;':''}">Source: ${esc(bm.src)}${bm.asOf ? ` · as of ${fmtDate(bm.asOf)}` : ''}</div>
        ${sup ? `<div style="padding-inline-start:68px;">${staleTargetNote(r)}</div>` : staleTargetNote(r)}
      </div>`;
    }).join('')}
    ${currentUser.role==='supervisor' ? teamTargetRow(teamTargetNow()) : ''}
  </div>`;
}

// ---- MISSED PLANNED VISITS ----
function renderMissedPlans(){
  const el = document.getElementById('missedList');
  const title = document.getElementById('missedTitle');
  if(!el || !title) return;
  let list = UMCore.missedPlans(dayPlans, visits, todayStr(), {daysBack:14});
  if(currentUser.role!=='supervisor') list = list.filter(m=>m.rep===currentUser.name);
  list = list.slice(0,8);
  if(list.length===0){ title.style.display='none'; el.innerHTML=''; return; }
  title.style.display='';
  const cname = id => clinicLabel(id);
  el.innerHTML = list.map(m=>`
    <div class="card" style="margin-bottom:8px;">
      <div class="row-between">
        <div style="flex:1; cursor:pointer;" onclick="openClinicDetail('${m.clinicId}')">
          <div class="clinic-name">${esc(cname(m.clinicId))}</div>
          <div class="clinic-sub">Planned ${fmtDate(m.date)}${currentUser.role==='supervisor'?' · '+esc(m.rep):''}${m.note?' · '+esc(m.note):''} · not visited</div>
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
  const due = visibleDueClinics();
  // The work week runs Sunday→Thursday (Fri/Sat are the weekend), so "this
  // week" means since the most recent Sunday — not a rolling 7 days.
  const wkStartD = new Date(); wkStartD.setDate(wkStartD.getDate() - wkStartD.getDay());
  const wkStart = UMCore.localDateStr(wkStartD);
  const wk = visibleVisits().filter(v => v.date >= wkStart);
  const wkField = wk.filter(v => !v.callOnly && !v.orderOnly); // calls and phone orders are not visits
  const wkRev = wk.reduce((a,v)=>a+(v.orderTotal||0),0);
  const wkOrders = wk.filter(v=>v.orderTaken).length;
  // ERP-verified revenue is the real number when an imported period covers
  // this week; the app-logged figure drops to the subtitle for comparison.
  const erpWk = erpRevenueForRange(wkStart, todayStr(),
    currentUser.role==='rep' ? currentUser.name : 'all');
  document.getElementById('heroCard').innerHTML = `
    <div class="htitle">Sales this week${erpWk!=null?' (ERP-verified)':''}</div>
    <div class="hbig">${money(erpWk!=null?erpWk:wkRev)}</div>
    <div class="hsub">${wkField.length} visit${wkField.length===1?'':'s'} · ${wkOrders} order${wkOrders===1?'':'s'}${erpWk!=null?` · ${money(wkRev)} logged in app`:''}</div>
    <div class="hero-stats">
      <div><div class="n">${due.length}</div><div class="l">DUE</div></div>
      <div><div class="n">${wkField.length?Math.round(wkField.filter(v=>v.orderTaken).length/wkField.length*100):0}%</div><div class="l">CONVERSION</div></div>
      <div><div class="n">${visibleTasks().filter(t=>!t.done).length}</div><div class="l">TASKS</div></div>
    </div>`;
  const tts = document.getElementById('tileTeamSub');
  if(tts) tts.textContent = (chatMsgs.length?chatMsgs.length+' messages':'Chat and photos') + (memories.length?' \u00b7 '+memories.length+' memories':'');
  const hasAlerts = due.length>0;
  document.getElementById('headerDot').classList.toggle('show', hasAlerts);
  document.getElementById('navDotToday').classList.toggle('show', hasAlerts);

  renderWelcome();
  renderFocusCard();
  renderOccasionsCard();
  renderTargetCard();
  renderMissedPlans();
  renderDormant();
  renderStreak();
  renderBadges();
  renderPlanList();

  const dueList = document.getElementById('dueList');
  if(due.length===0){
    dueList.innerHTML = `<div class="empty"><div class="big">✅ All caught up</div>Zero overdue follow-ups. That is discipline — well done.</div>`;
  } else {
    dueList.innerHTML = due.map(c => `
      <div class="card clickable" onclick="confirmFollowUp('${c.id}')">
        <div class="row-between">
          <div class="row-between" style="gap:10px;">
            <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
            <div>
              <div class="clinic-name">${esc(c.name)}</div>
              <div class="clinic-sub">${statusLabel(c.nextFollowUp)}${currentUser.role==='supervisor'?' · '+esc(c.rep):''}</div>
            </div>
          </div>
          <span class="badge ${followStatus(c.nextFollowUp)}">${followStatus(c.nextFollowUp)==='overdue'?'Overdue':'Today'}</span>
        </div>
      </div>`).join('');
  }

  renderTasks();

  const recent = [...visibleVisits()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  const rv = document.getElementById('recentVisits');
  if(recent.length===0){
    rv.innerHTML = `<div class="empty">🌱 Your first logged visit starts the story.</div>`;
  } else {
    rv.innerHTML = recent.map(v=>{
      const clinic = clinics.find(c=>c.id===v.clinicId);
      return `<div class="card">
        <div class="row-between">
          <div>
            <div class="clinic-name">${v.callOnly?(CHANNEL_LABELS[v.channel]||'📞')+' ':''}${esc(clinic ? clinic.name : clinicLabel(v.clinicId, v))}</div>
            <div class="clinic-sub">${fmtDate(v.date)}${v.orderTaken ? ' · '+money(v.orderTotal) : ''}${currentUser.role==='supervisor'?' · '+esc(v.rep):''}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }
}

function renderTasks(){
  const list = document.getElementById('taskList');
  const vis = visibleTasks();
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
      <div class="task-text ${t.done?'done':''}" ${clickable?`style="cursor:pointer;" onclick="confirmFollowUp('${t.clinicId}')"`:''}>${t.source==='email'?'<span style="color:var(--purple-ink);">✉ </span>':''}${esc(t.text)}${dueBadge}${currentUser.role==='supervisor' && t.rep!=='Team' ? ' <span style=\"color:var(--muted); font-weight:500;\">— '+esc(t.rep)+'</span>' : ''}</div>
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
  const repsToShow = repsForPlan();
  let html = '';
  repsToShow.forEach(r=>{
    const entries = dayObj[r] || [];
    if(entries.length===0) return;
    if(currentUser.role==='supervisor') html += `<div class="doc-group-head">${esc(r)}</div>`;
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
              <div class="clinic-name">${esc(c.name)}</div>
              <div class="clinic-sub">${visitedToday?'Visited today':(note?esc(note):'Tap to log visit')}</div>
            </div>
          </div>
          <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
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
  else { window._planMine.add(id); if(!entries.some(e=>planEntryId(e)===id)) entries.push({id, note:''}); }
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
  window._dpMine.push({id, note:''});
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

