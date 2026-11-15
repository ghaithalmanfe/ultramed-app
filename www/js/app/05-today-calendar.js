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
    // a phone: the week as a rail of seven days (§7.5, agenda first) — the selected day's agenda follows it
    if(window.matchMedia && window.matchMedia('(max-width: 600px)').matches){
      body.innerHTML = `<div class="cal-rail">${dates.map((d, i) => {
        const info = calDayData(d), cls = ['cal-cell', 'rail', d===todayStr()?'today':'', d===calSelected?'sel':'', !UMCore.isWorkday(d)?'wkend':''].join(' ');
        return `<button class="${cls}" onclick="selectCalDay('${d}')"><span class="rd">${DOW[i]}</span><span>${parseInt(d.slice(8),10)}</span><span class="cal-dots">${calDots(info)}</span></button>`;
      }).join('')}</div>`;
      renderCalAgenda();
      return;
    }
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
      <div class="cal-acts">
        <button class="btn secondary" onclick="openAddEvent('${d}')">+ Event</button>
        <button class="btn secondary" onclick="calOpenPlanner('${d}')">+ Plan visits</button>
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
  const tile = (n, l) => `<div class="ins-tile"><div class="it-n">${n}</div><div class="it-l">${l}</div></div>`;
  const repRows = (calRepFilter==='all' && s.perRep.length>1)
    ? `<div style="margin-top:10px;">${s.perRep.map(r=>`
        <div class="row-between" style="font-size:12.5px; padding:5px 0; border-bottom:1px solid var(--line);">
          <span style="font-weight:600;">${esc(r.rep)}</span>
          <span style="color:var(--muted);">${r.visits} visit${r.visits===1?'':'s'} · ${r.contacts} contact${r.contacts===1?'':'s'} · ${r.orders} order${r.orders===1?'':'s'} · ${money(r.revenue)}</span>
        </div>`).join('')}</div>`
    : '';
  el.innerHTML = `
    <div style="font-weight:700; font-size:13px; margin:10px 0 8px;">${fmtDate(from)} – ${fmtDate(to)}${calRepFilter!=='all' ? ' · '+esc(calRepFilter) : ' · Whole team'}</div>
    <div class="ins-grid">
      ${tile(s.fieldVisits, 'Visits')}
      ${tile(s.orders, 'Orders')}
      ${tile(money(s.revenue), 'Orders logged in the app')}
      ${tile(s.conversion+'%', 'Conversion')}
    </div>
    <div class="ins-grid">
      ${tile(s.contacts, 'Contacts seen')}
      ${tile(s.clinicsCovered, 'Clinics covered')}
      ${tile(s.calls, 'Calls')}
      ${tile(s.planned, 'Planned visits')}
    </div>
    <div class="ins-grid">
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
  const r = await persistTold('events');
  closeModal();
  saveToast(r, 'events', id?'Event updated':'Event added 📅'); // "added" only when it landed
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
// Products / Playbook / Team / Report … are full screens reached from More on a phone — the More
// tab stays highlighted while inside them (the sidebar of a wide screen lists each one itself).
const MORE_CHILDREN = ['playbook', 'team', 'doctors', 'reports', 'calendar', 'more'];
// The phone's Sales tab opens the Sales group (openSalesHub); it stays highlighted inside its screens.
const SALES_CHILDREN = ['products', 'clanalysis'];
// ---- The shell (redesign): the top bar's title and the navigation's active item follow the view ----
// One <nav id="bottomNav"> serves every width (index.html): the phone shows its five tabs, a wide screen
// every destination. A button is active when its data-view is the open view — or, for the "More" tab,
// when the view is reached from More; the two Doctors entries (data-tab) follow the Doctors screen's tab.
const VIEW_TITLES = { today:'Today', log:'Log a visit', clinics:'Clinics', calendar:'Calendar', reports:'Report', more:'More',
  products:'Products', playbook:'Selling Playbook', team:'Team', clanalysis:'Clinic Sales Analysis', doctors:'Doctors Database' };
function syncNav(){
  const name = activeView, navName = SALES_CHILDREN.includes(name) ? 'sales' : MORE_CHILDREN.includes(name) ? 'more' : name;
  const tab = typeof ddTab === 'string' ? ddTab : 'db';
  document.querySelectorAll('nav.bottom button').forEach(b => {
    const v = b.dataset.view;
    const on = !!v && (v === name || v === navName) && (!b.dataset.tab || b.dataset.tab === tab);
    b.classList.toggle('active', on);
    if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  // the sidebar: the group holding the open screen opens by itself (the others stay as the person left them)
  document.querySelectorAll('nav.bottom .nav-group').forEach(g => {
    const has = !!g.querySelector('.nav-gb button.active');
    g.classList.toggle('has-active', has);
    if(has) navGroup(g.querySelector('.nav-gh'), true);
  });
}
// A sidebar group opens onto its entries (a tap on its name; `open` forces it open).
function navGroup(btn, open){
  const g = btn && btn.closest('.nav-group'); if(!g) return;
  const on = open === true ? true : !g.classList.contains('open');
  g.classList.toggle('open', on);
  btn.setAttribute('aria-expanded', on ? 'true' : 'false');
}
// A row of the More screen and of the phone's Sales sheet: its icon, name, one line about it; the whole row is the button.
function moreTile(icon, name, sub, action){
  return `
    <button class="navrow" onclick="${action}">
      <span class="ri">${icon}</span>
      <span class="rt"><span class="rn">${name}</span><span class="rs">${sub}</span></span>
      <svg class="svgi ui-chev" aria-hidden="true"><use href="#i-chev"/></svg>
    </button>`;
}
// The phone's Sales tab: the Sales group's entries, each one tap away (the sidebar lists them itself).
function openSalesHub(){
  showModal(`<h3 style="margin-top:0;">Sales</h3>
    <div class="navlist">${[
      moreTile(I('package'), 'Products & prices', 'Catalog, prices and specs', "closeModal(); switchView('products')"),
      moreTile(I('pie'), 'Clinic sales analysis', 'Per-clinic targets, purchases and next moves', "closeModal(); switchView('clanalysis')"),
      moreTile(I('activity'), 'Product movement', 'Every brand → its products ranked by real sales: fast, mid, slow', 'closeModal(); openProductMovement()'),
      moreTile(I('pill'), 'Prescriptions growth', 'Prescription pads given, by doctor and by center', "closeModal(); ddTab='rx'; switchView('doctors')")].join('')}</div>`);
}
// The bell: the follow-ups due of whoever is signed in (a rep: hers), the same count as the Today screen's.
function msBell(){
  const n = currentUser ? visibleDueClinics().length : 0, b = document.getElementById('bellCount');
  if(b){ b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); }
}
function bellOpen(){ if(activeView !== 'today') switchView('today'); msGo('msDueCard'); }
// Help & Support (the sidebar's last entry): the app's version, what this phone still has to send, and who to ask.
function openHelp(){
  let queued = [];
  try{ queued = outboxList(); }catch(e){}
  const online = navigator.onLine !== false;
  const sups = (staff || []).filter(s => s && s.role === 'supervisor' && s.active !== false).map(s => s.name);
  const names = { clinics: 'Clinics', visits: 'Visits', tasks: 'Tasks', events: 'Events', dayPlans: "Day's plans", products: 'Products & prices', targets: 'Targets', chat: 'Team chat', memories: 'Memories' };
  const list = queued.map(k => esc(trOf(names[k] || '') || names[k] || k)).join(uiLang === 'ar' ? '، ' : ', ');
  showModal(`<h3 style="margin-top:0;">${I('nhelp')} ${msT('Help & Support')}</h3>
    <div class="ms-how">
      <div class="kv"><span>${msT('App version')}</span><span data-notr>${esc(APP_REV)}</span></div>
      <div class="kv"><span>${msT('Connection')}</span><span>${msT(online ? 'Online' : 'Offline — changes are kept on this phone')}</span></div>
      <div class="kv"><span>${msT('Waiting to be sent')}</span><span>${queued.length ? `${msN(queued.length)} · ${list}` : msT('Nothing — everything has reached the cloud')}</span></div>
      <h4>${msT('Who to ask')}</h4>
      <div>${sups.length ? `${msT('Your supervisor:')} <b>${msNames(sups)}</b> — ${msT('write in the team chat, or call.')}` : msT('Write in the team chat.')}</div>
      <div class="ms-note">${msT('A red bar at the bottom of the screen says when something could not be sent, and what to do.')}</div>
    </div>
    <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
      <button class="btn secondary" onclick="closeModal(); switchView('team')">${I('chat')} ${msT('Team chat')}</button>
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>`);
}
// Ctrl+K / ⌘+K: the quick find of the top bar (a wide screen; the key's label follows the keyboard)
(function(){
  try{
    const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    document.addEventListener('DOMContentLoaded', () => { const k = document.getElementById('quickFindKey'); if(k) k.textContent = mac ? '⌘ K' : 'Ctrl K'; });
    document.addEventListener('keydown', e => {
      if(!(e.key === 'k' || e.key === 'K') || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const q = document.getElementById('quickFind');
      if(!q || !q.offsetParent || !currentUser) return;
      e.preventDefault(); q.focus(); q.select();
    });
  }catch(e){}
})();
// ---- Quick find (the top bar of a wide screen): clinics, doctors and products already on this phone ----
// Only what the role may see (a rep: her clinics and their doctors; the catalog is everyone's); each result opens
// the item's own screen. Ids reach the handler through data attributes only.
let _qfSel = -1;
function quickFind(q){
  const list = document.getElementById('quickFindList'); if(!list || !currentUser) return;
  const t = String(q || '').trim().toLowerCase();
  _qfSel = -1;
  if(t.length < 2){ list.hidden = true; list.innerHTML = ''; return; }
  const has = s => String(s == null ? '' : s).toLowerCase().includes(t);
  const cl = [], dr = [], pr = [];
  (clinics || []).forEach(c => { if(!c || !canViewClinic(c)) return;
    if(cl.length < 5 && has(c.name)) cl.push(c);
    (c.doctors || []).forEach(d => { if(d && dr.length < 5 && has(d.name)) dr.push({ c, d }); }); });
  (products || []).forEach(p => { if(p && pr.length < 5 && (has(p.name) || has(p.id) || has(p.brand))) pr.push(p); });
  const row = (k, attrs, icon, name, sub) => `<button class="qf-item" role="option" data-k="${k}" ${attrs} onmousedown="event.preventDefault()" onclick="quickFindOpen(this)"><span class="qf-ic">${I(icon)}</span><span class="qf-t"><span dir="auto">${esc(name)}</span>${sub ? `<span class="qf-s" dir="auto">${esc(sub)}</span>` : ''}</span></button>`;
  const sec = (title, rows) => rows.length ? `<div class="qf-h">${esc(trOf(title) || title)}</div>${rows.join('')}` : '';
  const html = sec('Clinics', cl.map(c => row('c', `data-id="${esc(c.id)}"`, 'building', c.name, c.area || '')))
    + sec('Doctors', dr.map(x => row('d', `data-c="${esc(x.c.id)}" data-id="${esc(x.d.id)}"`, 'stethoscope', x.d.name, x.c.name)))
    + sec('Products', pr.map(p => row('p', `data-id="${esc(productKey(p))}"`, 'package', p.name, p.brand || '')));
  list.innerHTML = html || `<div class="qf-none">${esc(trOf('Nothing found') || 'Nothing found')}</div>`;
  list.hidden = false;
}
function quickFindOpen(b){
  const k = b.dataset.k, id = b.dataset.id;
  qfClose(true);
  if(k === 'c') openClinicDetail(id);
  else if(k === 'd') openDoctorProfile(b.dataset.c, id);
  else if(k === 'p') openProductDetail(id);
}
function quickFindKey(e){
  const list = document.getElementById('quickFindList'); if(!list || list.hidden) return;
  const items = [...list.querySelectorAll('.qf-item')];
  if(e.key === 'Escape'){ qfClose(true); return; }
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); if(!items.length) return;
    _qfSel = (_qfSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((x, i) => x.classList.toggle('sel', i === _qfSel)); return; }
  if(e.key === 'Enter' && items.length){ e.preventDefault(); quickFindOpen(items[_qfSel >= 0 ? _qfSel : 0]); }
}
function qfClose(clear){
  const list = document.getElementById('quickFindList'); if(list){ list.hidden = true; list.innerHTML = ''; }
  if(clear === true){ const i = document.getElementById('quickFind'); if(i){ i.value = ''; i.blur(); } }
}
function syncShell(name){
  document.body.dataset.view = name;
  { const pv = document.getElementById('view-' + name); document.body.classList.toggle('has-ph', !!(pv && pv.querySelector(':scope > .page-head'))); }   // a screen with its own page head: the top bar keeps quick find, the bell, the account
  const t = document.getElementById('topTitle');
  if(t && VIEW_TITLES[name] && t.dataset.for !== name){ t.dataset.for = name; t.textContent = VIEW_TITLES[name]; }   // a new text node: the translator picks it up
  syncNav();
}
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
  syncShell(name);
  renderView(name);
}
function renderMore(){
  const el = document.getElementById('moreContent');
  if(!el) return;
  const sup = currentUser.role==='supervisor';
  const tile = moreTile;
  const group = (title, rows) => { const r = rows.filter(Boolean).join(''); return r ? `${title ? `<div class="section-title">${title}</div>` : ''}<div class="navlist">${r}</div>` : ''; };
  // the phone's bottom bar has Home · Customers · Log visit · Sales: the Calendar and the Report come first here
  el.innerHTML =
    group('', [
      tile(I('calendar'),'Calendar','Your plan, visits and events by day',"switchView('calendar')"),
      tile(I('chart'),'Report','Visits, orders and coverage for any period, with the sales coach',"switchView('reports')")]) +
    group('Overview', [
      tile(I('target'),'KPI scorecard','The 10 measures management follows, score out of 100','openKpiScorecard()'),
      tile(I('trend'),'Month by month','Sales, field work and KPI against earlier months','openMonthByMonth()'),
      tile(I('award'),'Achievements','Badges, streaks and milestones','openAchievements()')]) +
    group('Customers', [
      tile(I('stethoscope'),'Doctors database','Profiles, birthdays, follow-up rhythm & prescriptions',"ddTab='db'; switchView('doctors')"),
      tile(I('clipboard'),'Doctor records','Who is who in every clinic — fill one card per doctor','openDoctorRecords()')]) +
    group('Sales', [
      tile(I('package'),'Products & prices','Catalog, prices and specs',"switchView('products')"),
      tile(I('pie'),'Clinic sales analysis','Per-clinic targets, purchases and next moves',"switchView('clanalysis')"),
      tile(I('activity'),'Product movement','Every brand → its products ranked by real sales: fast, mid, slow','openProductMovement()'),
      tile(I('pill'),'Prescriptions growth','Prescription pads given, by doctor and by center',"ddTab='rx'; switchView('doctors')")]) +
    group('Field operations', [
      tile(I('chat'),'Team chat & memories','Messages and shared photos',"switchView('team')"),
      tile(I('flag'),'Requests, escalations & stands','Log client requests, escalations and stands','openClientLog()')]) +
    group('Intelligence', [
      tile(I('share'),'Export & share','CSV files and report sharing','openExport()'),
      tile(I('book'),'Selling playbook','Tips per doctor specialty',"switchView('playbook')"),
      tile(I('layers'),'Category guides','How to sell every category','openCategoryGuides()'),
      sup ? tile(I('file'),'Weekly management deck','PowerPoint for the Thursday meeting (supervisor)','openWeeklyDeck()') : '']) +
    group('Settings', [
      sup ? tile(I('download'),'ERP import','Sales & targets files (supervisor)','openErpImport()') : '',
      sup ? tile(I('settings'),'Admin panel','Team, targets & data (supervisor)','openAdminPanel()') : '',
      tile(I('globe'),'Account & language','Language, password, sign out','openAccountMenu()'),
      tile(I('nhelp'),'Help & Support','App version, what waits to be sent, who to ask','openHelp()')]) +
    `<div class="more-foot">UltraMed Clinical Sales Team · ${APP_REV}</div>`;
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
  // the picture's greeting: the first name, without a title ("Dr. Ghaith" → "Ghaith"; Arabic «غيث»)
  const words = String(currentUser.name).trim().split(/\s+/), title = /^(dr|prof|mr|mrs|ms)\.?$/i.test(words[0]) && words[1];
  const first = title ? words[1] : words[0];
  const arFull = wdArNames(currentUser.name), arFirst = arFull !== currentUser.name ? arFull.replace(/^د\.\s*/, '').split(/\s+/)[0] : first;
  document.getElementById('greeting').textContent = `${greet}, ${uiLang === 'ar' ? arFirst : first}`;
  const stamp = document.getElementById('headerStamp');
  stamp.childNodes[0].textContent = msInitials(msName(currentUser.name));
  stamp.classList.toggle('sup', currentUser.role==='supervisor');
  const adminBtn = document.getElementById('adminPanelBtn');
  if(adminBtn) adminBtn.style.display = currentUser.role==='supervisor' ? 'block' : 'none';
  const erpBtn = document.getElementById('erpImportBtn');
  if(erpBtn) erpBtn.style.display = currentUser.role==='supervisor' ? '' : 'none';
  const mgBtn = document.getElementById('manageClinicsBtn');
  if(mgBtn) mgBtn.style.display = currentUser.role==='supervisor' ? '' : 'none';
  // the shell: who is signed in (top bar), the supervisor's own entries (navigation), the title and active item
  const un = document.getElementById('topUserName'), ur = document.getElementById('topUserRole');
  if(un) un.textContent = msName(currentUser.name);
  if(ur) ur.textContent = currentUser.role === 'supervisor' ? 'Sales Manager' : 'Sales Representative';
  document.querySelectorAll('#bottomNav [data-sup]').forEach(el => { el.hidden = currentUser.role !== 'supervisor'; });
  syncShell(activeView);
  msBell();

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
  _msNudge.bdayToday = 0;
  const lr = msListRep();                         // a person's screen: her doctors
  const repFilter = lr || (currentUser.role==='supervisor' ? 'all' : currentUser.name);
  let docs = [];
  try{ docs = UMCore.doctorAnalytics({clinics: clinics.filter(c=>canViewClinic(c) && (!lr || c.rep===lr)), visits, today: todayStr(), repFilter}); }catch(e){}
  const bdays = docs.filter(d=>d.birthdayIn!=null && d.birthdayIn<=7).sort((a,b)=>a.birthdayIn-b.birthdayIn);
  const due = docs.filter(d=>d.cadenceStatus==='due').length;
  _msNudge.bdayToday = bdays.filter(d=>d.birthdayIn===0).length;    // the folded Tasks card names it (msFoldSums)
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
function crossInvoiceNote(rep, data){
  // A notice must never take the Today screen down with it: an older cached
  // core.js (a release race) or odd data shows no notice instead of a blank page.
  try{ return crossInvoiceNoteHTML(rep, data); }catch(e){ console.error('cross-invoice notice', e); return ''; }
}
function crossInvoiceNoteHTML(rep, data){
  const sup = currentUser.role==='supervisor';
  if(typeof UMCore.crossInvoices !== 'function') return '';
  const who = sup ? (rep || null) : currentUser.name;
  const list = UMCore.crossInvoices(data || digestData()).filter(x => !who || x.issuer===who || x.owner===who);
  if(!list.length) return '';
  const inv = d => `<div style="padding:3px 0 3px 10px; border-inline-start:2px solid var(--amber, #E0A800); margin:3px 0;">
      <div><b data-notr>${esc(d.doc)}</b> · ${fmtDate(d.date)} · <b>${msKd(d.net)}</b></div>
      ${(d.items || []).map(it => `<div style="color:var(--muted);"><span dir="auto">${esc(it.product || '—')}</span>${it.brand ? ' · <span dir="auto">' + esc(it.brand) + '</span>' : ''} · ${+it.qty || 0} × · ${msKd(it.net)}</div>`).join('')}
    </div>`;
  // .ms-cx: on a rep's phone the only place another person's name may show (the owner's rule, v100: the invoices
  // she issued at another rep's clinic, and another rep's at hers — never anyone's month figure)
  return `<div class="ms-cx" onclick="event.stopPropagation()" style="margin-top:8px; padding:8px 10px; border-radius:10px; background:var(--amber-dim, #FFF4D6); font-size:12px; line-height:1.55; cursor:default;">
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
// A number as it is. A negative keeps its minus before its digits in the Arabic screen too (a left-to-right
// isolate): right to left, a bare "-14%" reads "14%-".
function msN(x){ const s = String(x); return /(^|[\s(=])-\d/.test(s) ? `<span data-notr dir="ltr">${s}</span>` : `<span data-notr>${s}</span>`; }
function msKd(n){ const x = Number(n) || 0, s = UMCore.groupThousands(x.toFixed(2)); return `<span class="ms-m">${x < 0 ? `<span data-notr dir="ltr">${s}</span>` : s} <span>KD</span></span>`; }  // money(): "12,989.00 KD" (grouped), the currency its own word (د.ك in Arabic)
function msPct(p){ return p == null ? '—' : msN(p + '%'); }
function msNames(list){ return (list || []).map(msWho).join(uiLang === 'ar' ? '، ' : ', '); }   // "Mariam, Renova" — «مريم، رانوفا»
// The month's figures could not be worked out (execDashboard threw: odd data, an older cached core.js): said, never "Calculating…" for ever.
function msWait(m){ return m && m.failed ? `<div class="ms-note warn">${msT("The month's figures could not be worked out on this device.")}</div>` : `<div class="ms-note ms-wait">${msT('Calculating the month…')}</div>`; }
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
// Everything the figures of this view read, as one string: a save, a refresh
// that brought something new, a sales file loading in, a settings change or a
// new day each change it. Photos are left out (a visit's thumbnails are not
// figures). A person's view reads her own records only — her clinics in full,
// the visits she was on or that were at her clinics, her events and plans —
// and of everyone else's clinics only what decides whose an invoice is (name,
// owner, handover, shared …): a teammate's visit (which moves that clinic's
// follow-up and last visit) changes none of her figures, so her phone works
// none of them out again.
const MS_SIG_SKIP = (k, x) => k === 'lastVisit' || k === 'nextFollowUp' || k === 'doctors' || k === 'notes' || k === 'profileNotes' ? undefined : x;
function msSig(v){
  const out = [todayStr(), new Date().getHours(), msKey(v), currentUser ? currentUser.name + '|' + currentUser.role : ''];
  const team = v.kind === 'team', inV = r => !!r && v.reps.indexOf(r) >= 0, mine = new Set();
  try{
    out.push(JSON.stringify(targets || {}));
    out.push(JSON.stringify(erpSales || {}, (k, x) => k === 'rows' && Array.isArray(x) ? x.length : x));
    out.push(JSON.stringify(erpMap || {}));
    out.push(JSON.stringify((typeof BENCHMARKS !== 'undefined' && BENCHMARKS && BENCHMARKS.kpi) || {}));
    (clinics || []).forEach(c => { if(!c) return;
      if(team || !c.rep || inV(c.rep) || inV(c.prevRep)){ mine.add(c.id); out.push(JSON.stringify(c)); } else out.push(JSON.stringify(c, MS_SIG_SKIP)); });
    const lo = (() => { const d0 = msMonth() + '-01', w0 = UMCore.getWeekDates(todayStr())[0]; return w0 < d0 ? w0 : d0; })();
    Object.keys(dayPlans || {}).forEach(d => { if(d < lo) return; const p = dayPlans[d] || {};
      out.push(d + '=' + JSON.stringify(team ? p : v.reps.map(r => p[r] || null))); });
  }catch(e){ out.push('x' + Date.now()); }                       // cannot fingerprint: compute again
  (visits || []).forEach(x => { if(!x || !(team || inV(x.rep) || inV(x.withRep) || mine.has(x.clinicId))) return;
    out.push([x.id, x.date, x.rep, x.withRep || '', x.clinicId, x.ts || '', x.callOnly ? 1 : 0, x.orderOnly ? 1 : 0, x.orderTaken ? 1 : 0, x.orderTotal || 0,
    (x.doctorIds || []).join(','), x.doctorId || '', (x.products || []).length, x.noOrderReason ? 1 : 0, x.notes && String(x.notes).trim() ? 1 : 0].join('~')); });
  (events || []).forEach(e => { if(e && e.kind && (team || inV(e.rep))) out.push([e.id, e.kind, e.type || '', e.rep || '', e.at || '', e.resolvedAt || '', e.removed || '', (e.checks || []).join(','), e.clinicId || ''].join('~')); });
  return out.join('\u0001');
}
// The KPI scores of the months that are over (and of the same days of the month before) are kept between refreshes
// only while EVERYTHING kpiScorecard reads for them is unchanged: the people, the KPI settings, the targets, the sales
// files (their index: a file's rows never change under its key), the ERP links, the clinics, the requests / escalations
// / stands, the visits and the day plans dated before the running month, and the day (the months, the same days). One
// thing moves with the clock alone — a client request still open is late once the agreed hours have passed — so nothing
// is kept while a request of the month before could still be inside those hours (the first day or so of a month).
// A clinic's last visit and next follow-up are left out of the fingerprint: no KPI measure reads them (kpiScorecard and
// the sales attribution read a clinic's owner, class, doctors, name and sharing), and every visit saved today moves them.
// null = keep nothing. The key is a fingerprint (length + hash) of those lists as text; photos are not KPI inputs.
let _msKpiPast = null;
function msKpiPastKey(v, S){
  try{
    const today = todayStr(), m0 = today.slice(0, 7) + '-01';
    const lim = (Number(S && S.responseHours) || 24) * 3600000;
    if(lim > 20 * 86400000 || Date.now() - new Date(m0 + 'T00:00:00').getTime() < lim + 3600000) return null;
    const txt = [today, v.reps.join('|'), JSON.stringify(S || {}), JSON.stringify(targets || {}),
      JSON.stringify(erpSales || {}, (k, x) => k === 'rows' && Array.isArray(x) ? x.length : x), JSON.stringify(erpMap || {}),
      JSON.stringify(clinics || [], (k, x) => k === 'lastVisit' || k === 'nextFollowUp' ? undefined : x), JSON.stringify(events || []),
      JSON.stringify((visits || []).filter(x => x && x.date < m0), (k, x) => k === 'photos' ? undefined : x),
      JSON.stringify(Object.keys(dayPlans || {}).filter(d => d < m0).sort().map(d => [d, dayPlans[d]]))].join('\u0001');
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for(let i = 0; i < txt.length; i++){ const c = txt.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return txt.length + ':' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }catch(e){ return null; }
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
  // the advisor's coach point: the Report's sales coach over the month so far, for the view's people — the first
  // point to act on or watch that is not the target (the target card says it) nor the follow-ups (the advisor lists
  // them), and only one whose words the Arabic screen has too
  try{
    const ins = UMCore.coachInsights({ erpMtd: UMCore.erpMtd(data), from: msMonth() + '-01', to: todayStr(), today: todayStr(),
      repFilter: v.kind === 'person' ? v.rep : 'all', visits, clinics, targets: blendedTargets(), dayPlans });
    const hasAr = t => !window.UMI18N || !!UMI18N.tr(t);
    m.coach = (ins || []).filter(i => i && (i.level === 'act' || i.level === 'watch') && !/^target-/.test(i.key || '') && i.key !== 'followups' && i.title && hasAr(i.title))[0] || null;
  }catch(e){ console.error('main screen: coach', e); m.coach = null; }
  // the first figure card: the KPI score month by month (its sparkline) and against the same days of last month (its ▲/▼)
  // (the months that are over, and the same days of the month before, are kept while everything they are made of is
  // unchanged — msKpiPastKey — so a refresh works out the running month only)
  try{
    const S2 = typeof kpiSettings === 'function' ? kpiSettings() : null, pk = msKpiPastKey(v, S2);
    const hit = pk != null && _msKpiPast && _msKpiPast.key === pk ? _msKpiPast : null;
    const K = UMCore.homeKpiMonths(Object.assign({}, data, { today: todayStr() }), { reps: v.reps, months: 6, settings: S2, rows, known: hit ? hit.months : null, knownSame: hit ? hit.same : null });
    m.H = { kpi: K, kpiKept: !!hit };
    if(pk != null){ const past = {}; K.months.slice(0, -1).forEach(x => { past[x.month] = x.score; }); _msKpiPast = { key: pk, months: past, same: { to: K.sameDays.to, score: K.sameDays.score } }; }
    else _msKpiPast = null;
  }catch(e){ console.error('main screen: KPI months', e); m.H = {}; _msKpiPast = null; }
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
// One value per data state and language: computed once, then reused while msSig stays the same (the parts kept
// as HTML carry names and dates in the screen's language, so a language switch draws them again).
function msMemo(sig, key, fn){
  const s = sig + '\u0002' + uiLang;
  if(_msMemo.sig !== s) _msMemo = { sig: s, v: Object.create(null) };
  if(!(key in _msMemo.v)) _msMemo.v[key] = fn();
  return _msMemo.v[key];
}
// The data of this state with one shared pass of the sales lines (UMCore.erpShare: each customer matched once, each
// file's rows read once) for the parts drawn at once — each person's month, the invoices on another rep's clinic, the week.
function msDigest(sig){ return msMemo(sig, 'dd', () => { const d = digestData(); try{ d.erpShare = UMCore.erpShare(d); }catch(e){} return d; }); }
// The month's lines of everyone, once per data state: each person's month figure reads it (monthAchievement with
// its map is bestMonthRevenue's very figure — one pass instead of one per person).
function msMtd(sig){ return msMemo(sig, 'mtd', () => { try{ return UMCore.erpMtd(msDigest(sig)); }catch(e){ console.error('main screen: month lines', e); return null; } }); }
function msPeople(v, sig){ const mtd = msMtd(sig); return v.reps.map(r => msMemo(sig, 'pm\u0001' + r, () => msPersonMonth(r, mtd))); }
// The week so far of the view's people (UMCore.execWeek: the month card's rules), once per data state.
function msWeek(v, sig){ return msMemo(sig, 'wk', () => { try{ return UMCore.execWeek(msDigest(sig), { rep: v.kind === 'person' ? v.rep : 'all', reps: v.reps, mtd: msMtd(sig) || undefined }); }catch(e){ console.error('main screen: the week', e); return null; } }); }
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
const MS_STATE = { reached: 'Target reached', ahead: 'Ahead of pace', on: 'On pace', behind: 'Behind pace' };   // the target card's rows: the pill's words, one word per state on the screen
function msExpected(wd){ return wd && wd.total > 0 && wd.done > 0 ? Math.round(wd.done / wd.total * 100) : null; }
function msBar(pct, exp, thin){
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return `<div class="ms-bar${thin ? ' thin' : ''}"><i style="width:${w}%;"></i>${exp != null ? `<b style="inset-inline-start:${Math.max(0, Math.min(100, exp))}%;"></b>` : ''}</div>`;
}
// A person's month as the Today card always showed it (bestMonthRevenue — given the month's lines of everyone,
// `mtd`, it is the same call on the same data), with the working days to the day her figure runs to.
function msPersonMonth(r, mtd){
  const bm = mtd ? UMCore.monthAchievement(r, digestData(), mtd) : bestMonthRevenue(r), t = targets[r] || {};
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
  const P = msPeople(v, sig), tt = v.kind === 'team' ? msTeamTotal(v, P, sig) : null;   // a person's screen has no team total
  msHead(v, m, P);
  const set = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
  set('msSales', v.kind === 'team' ? msHeroHTML(v, m, P, tt) : '');
  renderTargetCard(v, m, P, sig);
  set('msKpis', msKpisHTML(v, m, sig));
  set('msAdvisor', msAdvisorHTML(v, m));
  set('msStatus', msStatusHTML(v, m, P));
  const week = msWeekLine(v, msWeek(v, sig));
  set('msWork', v.kind === 'team' ? msTeamWorkHTML(v, m, week) : msVisitsHTML(v, m, week));
  set('msNext', v.kind === 'team' ? msNeedsHTML(v, m) : msNextHTML(v));
  set('msChart', msChartHTML(v, m));
  set('msDaily', msDailyHTML(v, m));
  set('msBrands', msBrandsHTML(v, m, P));
  set('msCust', msCustHTML(v, m));
  set('msRows', msRowsHTML(v, m));
  const plan = document.getElementById('planLink');
  if(plan) plan.style.display = v.kind === 'person' && !v.own ? 'none' : '';    // "Plan today" plans the day of whoever is signed in
  // the quick task says whose it will be: the whole team's on the team view, that person's on her screen (addTask)
  const inp = document.getElementById('newTaskInput');
  if(inp){ const ph = currentUser.role !== 'supervisor' || (v.kind === 'person' && v.own) ? 'Add a quick task...' : v.kind === 'team' ? 'Add a quick task for the whole team...' : `Add a quick task for ${msName(v.rep)}...`;
    inp.setAttribute('placeholder', trOf(ph) || ph); }
}
function msHead(v, m, P){
  const set = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
  const g = document.getElementById('greeting');
  // the picture's greeting: "Good morning, Ghaith" and the waving hand (an image, the same on every phone and PC)
  set('msHello', `<span>${g ? esc(g.textContent) : ''}</span><img class="ms-wave" src="img/hand.webp" alt="👋" width="56" height="56">`);
  const own = v.kind === 'person' && v.own;
  set('msSubtitle', msT(v.kind === 'team' ? "Here's your performance overview for this month" : own ? "Here's your performance overview for this month" : "Here's this person's performance overview for this month"));
  // the period the screen shows: this month (its figures are the month's); earlier months open in the month reports
  const mName = (() => { try{ return new Date(todayStr() + 'T00:00:00').toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric' }); }catch(e){ return msMonth(); } })();
  set('msPeriod', `<button class="ms-period" onclick="openMonthReports()" aria-label="${esc(trOf('Months') || 'Months')}: ${esc(mName)}" title="${esc(mName)}">${I('cal2')}<span>${msT('This Month')}</span><svg class="svgi ms-pchev" aria-hidden="true"><use href="#i-chevd"/></svg></button>`);
  // the supervisor on a person's screen (opened from her leaderboard row): whose it is, and the way back to the team
  const whose = document.getElementById('msWhose');
  if(whose){
    const other = v.kind === 'person' && !v.own;
    whose.style.display = other ? '' : 'none';
    whose.innerHTML = other ? `<span class="ms-vchip"><span>${msT('Viewing:')} <b>${msWho(v.rep)}</b></span><button class="ms-back" onclick="msOpenPerson(null)">${msT('Back to the team')}</button></span>` : '';
  }
}
// The source of the month's figures in words (the target card's ⓘ): the ERP files to the day they reach (the people's
// files may stop on different days: then the earliest and the latest, said as such), the DSR targets, the working days.
function msSourceLine(v, P){
  const meas = P.filter(p => p.measured), cuts = meas.map(p => p.bm.asOf).sort(), asOf = cuts[cuts.length - 1] || null, first = cuts[0] || null;
  const wd = UMCore.monthWorkdays(msMonth(), asOf);
  const own = v.kind === 'person' && v.own;
  return [
    asOf ? `${msT(own ? 'Your invoiced sales from the ERP files to' : 'Invoiced sales from the ERP files to')} <b>${msDay(first !== asOf ? first : asOf)}</b>${first !== asOf ? ` – <b>${msDay(asOf)}</b> (${msT('each person to the day her file reaches')})` : ''}`
         : msT(P.some(p => p.bm.basis === 'erp') ? 'The sales files of this month hold no line of these people yet' : 'No ERP sales file for this month yet'),
    msT(own ? 'your target from the DSR' : v.kind === 'team' ? 'targets from the DSR' : 'target from the DSR'),
    msT(asOf ? `working days: ${wd.done} of ${wd.total} done` : `working days this month: ${wd.total}`)
  ].join(' · ');
}

// ---- the month against the target (the team's card; a person's card is the target card itself) ----
// The card is of ONE set of people from top to bottom: those with a target and a sales figure (execDashboard's
// achievement — what its %, remaining, per working day and forecast are worked out for). Its amount is theirs, its
// "of" their target; someone selling with no target is said on a line of their own with the amount, the team's
// whole figure beside it; someone with a target and no sales figure is named. With no target at all, the amount
// is everyone's month figure, with no percentage.
// ---- the target card (the owner's picture): the ring, the month against the target, what is left ----
// The card is of ONE set of people from top to bottom: those with a target and a sales figure (execDashboard's
// achievement — what its %, remaining and per working day are worked out for). Its amount is theirs, its target
// theirs; someone selling with no target is said on a line of their own with the amount, the team's whole figure
// beside it; someone with a target and no sales figure is named. With no target at all, the amount is everyone's
// month figure, with no percentage. Amounts as the picture writes them: whole KWD with thousands separators (the ⓘ
// and the leaderboard's details keep the fils); the ring's % to one decimal (execDashboard's pct1).
function msWhole(n){ const x = Math.round(Number(n) || 0); return x < 0 ? `<span data-notr dir="ltr">${'-' + Math.abs(x).toLocaleString('en-US')}</span>` : `<span data-notr>${x.toLocaleString('en-US')}</span>`; }
function msKwd(n){ return `${msWhole(n)} <small>${msT('KWD')}</small>`; }
// a label whose English word means something else elsewhere in the app (the dictionary is one entry per English string)
function msLab(en, ar){ return uiLang === 'ar' ? `<span data-notr>${ar}</span>` : `<span>${en}</span>`; }
// the yellow calendar of the picture (a flat icon, drawn here: its colours are its own)
function msCalY(){ return `<svg class="ms-cal" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="17.5" rx="3.2" fill="#F5C445"/><path d="M2.5 9.2h19V7.2A3.2 3.2 0 0 0 18.3 4H5.7a3.2 3.2 0 0 0-3.2 3.2z" fill="#E6A928"/><rect x="6.6" y="2" width="2.3" height="4.6" rx="1.1" fill="#F5C445"/><rect x="15.1" y="2" width="2.3" height="4.6" rx="1.1" fill="#F5C445"/><g fill="#7B5A12"><rect x="6.3" y="11.6" width="2.6" height="2.4" rx=".6"/><rect x="10.7" y="11.6" width="2.6" height="2.4" rx=".6"/><rect x="15.1" y="11.6" width="2.6" height="2.4" rx=".6"/><rect x="6.3" y="15.6" width="2.6" height="2.4" rx=".6"/><rect x="10.7" y="15.6" width="2.6" height="2.4" rx=".6"/></g></svg>`; }
// the picture's faded rising bars and arrow at the card's end (decoration only: it shows no figure)
function msHeroDeco(){
  return `<svg class="ms-hdeco" viewBox="0 0 156 166" aria-hidden="true" focusable="false"><defs><linearGradient id="msDecoG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8BEABD" stop-opacity=".85"/><stop offset=".55" stop-color="#4FC08E" stop-opacity=".42"/><stop offset="1" stop-color="#3FA77D" stop-opacity=".04"/></linearGradient></defs>`
    + [[19, 27], [48, 44], [77, 60], [106, 80], [135, 102]].map(([x, h]) => `<rect x="${x}" y="${166 - h}" width="20" height="${h}" rx="2" fill="url(#msDecoG)"/>`).join('')
    + `<path d="M1 128 31 104l22 7 31-37 22 7 38-48" fill="none" stroke="#8CF0BF" stroke-opacity=".95" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M131 30.5 146 18l-1.8 19.6z" fill="#86EBBA" fill-opacity=".9"/></svg>`;
}
function msHeroHTML(v, m, P, tt){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D);
  const r2 = n => Math.round(n * 100) / 100;
  // the month figures: bestMonthRevenue per person; the team = the sum over the people shown
  const meas = P.filter(p => p.measured), all = meas.length ? r2(meas.reduce((s, p) => s + p.bm.amount, 0)) : null;
  const pair = meas.filter(p => p.goal), noT = meas.filter(p => !p.goal), unmeas = P.filter(p => p.goal && !p.measured);
  const amount = pair.length ? r2(pair.reduce((s, p) => s + p.bm.amount, 0)) : all;
  const goal = pair.length ? r2(pair.reduce((s, p) => s + p.goal, 0)) : meas.length ? null : team ? (tt || teamTargetNow()).goal : (P[0] && P[0].goal);
  const why = P.length && P.every(p => p.bm.basis === 'none') ? 'No ERP sales file for this month yet'
    : team ? 'The sales files of this month hold no line of these people yet.' : 'The sales files of this month hold no line of this person yet.';
  const noGoal = meas.length && P.some(p => p.goal) ? 'No sales target for the people with a sales figure' : 'No sales target on file for this month';
  // what the card's figures leave out, in words
  const notes = [];
  if(team){
    unmeas.forEach(p => notes.push(`${msWho(p.rep)}: ${msT('a target but no sales figure in the files, so not in the percentage.')}`));
    if(pair.length) noT.forEach(p => notes.push(`${msWho(p.rep)}: ${msKd(p.bm.amount)} ${msT('invoiced, no target, so not in these figures.')}`));
    if(pair.length && noT.length) notes.push(`${msT('All invoiced sales of the team:')} <b data-ms="sales-all" data-value="${all}">${msKd(all)}</b>`);
  }
  if(amount == null) notes.unshift(`<span>${msT(why)}</span>`);
  else if(!D) notes.unshift(m && m.failed ? `<span>${msT("The month's figures could not be worked out on this device.")}</span>` : `<span>${msT('Calculating the month…')}</span>`);
  if(!(goal > 0) && amount != null) notes.push(`<span data-ms="no-goal">${msT(noGoal)}</span>`);
  const A = D ? (msOf(D.achievement) || {}) : {}, Pd = D ? (msOf(D.perDay) || {}) : {}, wd = msOf(Pd.workdays) || {};
  const exp = msExpected(wd), pace = D && A.pct != null ? msPace(A.achieved, A.target, wd.done, wd.total) : null;
  const pct = A.pct != null ? A.pct : null, pct1 = A.pct1 != null ? A.pct1 : pct;
  // the ring: achieved ÷ target (execDashboard's figure, one decimal), drawn up to 100 % (beyond, full; the figure says how far)
  const R = 86.5, C = 2 * Math.PI * R, f = pct == null ? 0 : Math.max(0, Math.min(100, pct1)) / 100;
  const ring = `<div class="ms-hring${pct == null ? ' none' : ''}"><svg class="ms-ring" viewBox="0 0 190 190" aria-hidden="true"><defs><linearGradient id="msRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8CF1BB"/><stop offset=".5" stop-color="#74EBA9"/><stop offset="1" stop-color="#62E59D"/></linearGradient></defs>`
    + `<circle class="trk" cx="95" cy="95" r="${R}" stroke-width="17"/>`
    + (f > 0 ? `<circle class="val" cx="95" cy="95" r="${R}" stroke-width="17" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 95 95)"/>` : '') + `</svg>`
    + `<div class="ms-rc"${pct == null ? '' : ` data-ms="achievement" data-value="${pct}"`}><strong>${pct == null ? '—' : msN(String(pct1) + '%')}</strong><span>${msT('Target Achieved')}</span></div></div>`;
  const val = (k, n, cls) => n != null ? `<span class="ms-hv ${cls || ''}"${k ? ` data-ms="${k}" data-value="${n}"` : ''}>${msKwd(n)}</span>` : `<span class="ms-hv none ${cls || ''}"${k ? ` data-ms="${k}" data-value=""` : ''}>—</span>`;
  const left = wd.left != null ? wd.left : null;
  const remaining = D && D.remaining != null ? D.remaining : null, perDay = D && Pd.amount != null ? Pd.amount : null;
  // the days line: the working days (Sun–Thu) left after the day the files reach — what "Daily Required" divides by
  const daysTx = left != null && D ? msT(msCount(left, 'Work Day Left', 'Work Days Left')) : null;
  const perNone = D && A.pct != null && perDay == null ? (remaining === 0 ? 'Target reached' : remaining > 0 && left === 0 ? 'no working day left' : null) : null;
  const m1 = `<div class="ms-hcol m1">
      <span class="ms-hl htgt">${msT(team && pair.length && unmeas.length ? 'Target of the people with a sales figure' : 'Monthly Target')}</span>${goal > 0 ? `<span class="ms-hv htgt" data-ms="of-target" data-value="${goal}">${msKwd(goal)}</span>` : `<span class="ms-hv htgt none" data-ms="of-target" data-value="">—</span>`}
      <span class="ms-hl hach">${msLab('Achieved', 'المحقق منذ بداية الشهر')}</span>${amount != null ? `<span class="ms-hv hach" data-ms="sales" data-value="${amount}">${msKwd(amount)}</span>` : `<span class="ms-hv hach none" data-ms="sales" data-value="">—</span>`}
      <div class="ms-hbar" role="img" aria-label="${esc(pct == null ? '—' : pct1 + '%')}"><i style="width:${pct == null ? 0 : Math.max(0, Math.min(100, pct1))}%;"></i></div>
      <div class="ms-hrem">${val('', remaining)}<span class="ms-hl">${msT('Remaining')}</span></div>
    </div>`;
  const m2 = `<div class="ms-hcol m2">
      <span class="ms-hl">${msT('Remaining')}</span>${val('remaining', remaining)}
      <div class="ms-hdays">${msCalY()}<span>${daysTx || '—'}</span></div>
      <span class="ms-hl hdr">${msT('Daily Required')}</span>${perDay != null ? `<span class="ms-hv" data-ms="perday" data-value="${perDay}">${msKwd(perDay)}</span>` : `<span class="ms-hv none" data-ms="perday" data-value="">—${perNone ? ` <small>${msT(perNone)}</small>` : ''}</span>`}
    </div>`;
  const foot = `<div class="ms-hfoot"><span class="ms-hd">${msCalY()}<span>${daysTx || '—'}</span></span><span class="ms-hd">${I('clock')}<span>${perDay != null ? `${msWhole(perDay)} ${msT('KWD / Day')}` : '—'}</span></span></div>`;
  // the pace in words, for a screen reader (the pace card below the picture shows it): one word per state (MS_PILL)
  const paceTx = pace ? `<span class="sr">${exp != null ? `<span>${msT('expected by')} ${msDate(wd.asOf)}: ${msPct(exp)}</span> ` : ''}<span class="ms-pill ${MS_PILL[pace][0]}" data-ms="pace" data-value="${pace}">${msT(MS_PILL[pace][1])}</span></span>` : '';
  return `${msInfo('sales')}<div class="ms-hin">${msHeroDeco()}<div class="ms-hringw">${ring}</div><i class="ms-hsep" aria-hidden="true"></i>${m1}<i class="ms-hsep" aria-hidden="true"></i>${m2}</div>${foot}${paceTx}`
    + (notes.length ? `<div class="ms-hnote${amount == null && P.every(p => p.bm.basis === 'none') ? ' warn' : ''}">${notes.join('<br>')}</div>` : '');
}
// The forecast against the target, in words: the month-end figure at the pace so far minus the target (display
// arithmetic of execDashboard's forecast and target) — an estimate, never a result. (The pace card says it.)
function msFcNote(D){
  const A = msOf(D && D.achievement) || {}, F = msOf(D && D.forecast);
  if(!F || F.closed || A.pct == null || F.forTarget == null || !(A.target > 0)) return '';
  const diff = Math.round((F.forTarget - A.target) * 100) / 100;
  return `<div class="ms-fcnote">${I('trend')}<span><span>${msT('At the current pace:')}</span> <b>${msKd(Math.abs(diff))}</b> <span>${msT(diff >= 0 ? 'above the target' : 'short of the target')}</span> · <span>${msT('an estimate, not a result')}</span></span></div>`;
}

// ---- the target card: the team's people rows, or a person's own month ----
// Six harnesses read this card's words — "<achieved> of <target> · <state>",
// "Achieved: <source> · target: DSR", the stale-target note, the Team line,
// "Months" and the invoices on another rep's clinic — so it keeps them all.
// ---- the target card: the team's leaderboard, or a person's own month ----
// Six harnesses read this card's words — "<name> <pct>% <achieved> KD of <target> KD · <state>", "Achieved: <source> ·
// target: DSR", the stale-target note, the Team line, "Months" and the invoices on another rep's clinic — so it keeps
// them all: the picture's compact rows show rank, initials, name, bar, %, the amount in KWD and the field visits of the
// month; each row's full words follow it (on screen once "View All" opens the details; read out by a screen reader
// always). #targetCard is display:contents: its cards are the grid's own (the cross-invoice notice below the picture).
let _msLbAll = false;
function msLbToggle(btn){
  _msLbAll = !_msLbAll;
  const c = btn && btn.closest('.ms-people');
  if(c) c.classList.toggle('ms-all', _msLbAll);
  if(btn){ btn.setAttribute('aria-expanded', _msLbAll ? 'true' : 'false'); const t = btn.querySelector('span'); if(t){ t.textContent = _msLbAll ? 'Show less' : 'View All'; translateTree(t); } }
}
// initials as the picture writes them: a title ("Dr.") left out, the first letters of up to two words
function msInitials(name){ const w = String(name || '').trim().split(/\s+/).filter(x => !/^(dr|prof|mr|mrs|ms|د)\.?$/i.test(x)); return (w.length ? w : [String(name || '?')]).slice(0, 2).map(x => x.charAt(0)).join('').toUpperCase(); }
function renderTargetCard(v, m, P, sig){
  const el = document.getElementById('targetCard');
  if(!el) return;
  // called on its own after a change (targets saved in the Admin panel over the main screen): the whole screen
  // follows, so the sales card, the chart and the brands never keep the old targets beside the new rows
  if(!v && activeView === 'today' && currentUser){ renderToday(); return; }
  v = v || msView();
  if(!v){ el.innerHTML = ''; return; }
  m = m || msModelFor(v);
  sig = sig || msSig(v);                                   // called on its own (after a change): the data as it is now
  P = P || msPeople(v, sig);
  if(v.kind === 'person'){
    const p = P[0], t = p.t, vN = t.visits > 0 ? msFieldVisits(p.rep) : 0;
    // her target card (the hero); the invoices on another rep's clinic follow it, in a card of their own below the picture
    const cx = msMemo(sig, 'cx\u0001' + p.rep, () => crossInvoiceNote(p.rep, msDigest(sig)));
    const stale = staleTargetNote(p.rep);
    el.innerHTML = `<div class="ms-card ms-sales ms-hero">${msHeroHTML(v, m, P)}
      ${t.visits > 0 || stale ? `<div class="ms-hstrip">${t.visits > 0 ? `<span style="white-space:nowrap;">Visits ${vN}/${t.visits} (${Math.round(vN / t.visits * 100)}%)</span>` : ''}${stale}</div>` : ''}
      <div class="ms-fine ms-src2">Achieved: ${esc(p.bm.src)} · target: DSR</div></div>${cx ? `<div class="ms-card ms-cxcard">${cx}</div>` : ''}`;
    return;
  }
  const monthName = new Date(todayStr() + 'T00:00:00').toLocaleDateString(uiLocale(), { month: 'long' });
  const D = m && msOf(m.D), by = D && Array.isArray(D.byPerson) ? D.byPerson : [];
  const srcs = P.filter(p => p.goal || p.t.visits > 0).map(p => p.bm.src), oneSrc = srcs.length > 1 && srcs.every(s => s === srcs[0]);
  const stale = P.map(p => staleTargetNote(p.rep)), oneStale = stale.length > 1 && stale.every(s => s && s === stale[0]);
  // ranked by achievement (people with a sales target and a figure, highest first; the crown for the first), then those
  // with a target and no figure yet, a visits target only, none — each row's words as before
  const tier = p => p.goal ? (p.measured ? 0 : 1) : p.t.visits > 0 ? 2 : 3;
  const order = P.map((p, i) => ({ p, i })).sort((a, b) => tier(a.p) - tier(b.p) || (tier(a.p) === 0 ? b.p.pct - a.p.pct : 0) || a.i - b.i);
  let rank = 0;
  const rows = order.map(({ p, i }) => {
    const r = p.rep, t = p.t, extra = msPersonExtra(by.find(x => x && x.rep === r)), vN = msFieldVisits(r);
    const rk = tier(p) === 0 ? ++rank : null;
    const rkHTML = `<span class="rk${rk === 1 ? ' first' : rk && rk % 2 === 1 ? ' ring' : ''}" data-notr aria-hidden="true">${rk === 1 ? I('crown') : rk || ''}</span>`;
    const head = (pctTx, bar, amt) => `<div class="ms-person ms-lb open" data-person="${esc(r)}" role="button" tabindex="0" onclick="msOpenPerson(this.dataset.person)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();msOpenPerson(this.dataset.person);}">${rkHTML}<span class="av" data-notr aria-hidden="true">${esc(msInitials(msName(r)))}</span><div class="n" aria-hidden="true">${msWho(r)}</div>${bar}<div class="p${pctTx == null ? ' none' : ''}" aria-hidden="true">${pctTx == null ? '—' : msN(pctTx + '%')}</div><div class="a" aria-hidden="true">${amt}</div><div class="v" aria-hidden="true" title="${esc(trOf('field visits this month') || 'field visits this month')}">${msN(vN)}</div>`;
    const lbBar = pct => `<div class="bar" aria-hidden="true"><i style="width:${pct == null ? 0 : Math.max(0, Math.min(100, pct))}%;"></i></div>`;
    const tail = `${extra}${oneSrc ? '' : `<div class="ms-fine">Achieved: ${esc(p.bm.src)} · target: DSR</div>`}${oneStale ? '' : stale[i] ? `<div class="ms-fine">${stale[i]}</div>` : ''}`;
    if(p.goal){
      const st = p.measured ? msPace(p.bm.amount, p.goal, p.wd.done, p.wd.total) : null;
      return head(p.pct, lbBar(p.pct), p.measured ? msKwd(p.bm.amount) : '—') + `<div class="det"><div class="s"><span>${msWho(r)}</span> <span data-notr>${p.pct}%</span> ${msKd(p.bm.amount)} <span>of</span> ${msKd(p.goal)} · <span>${st ? MS_STATE[st] : 'no figure yet'}</span>${t.visits > 0 ? ` · <span style="white-space:nowrap;">Visits ${vN}/${t.visits} (${Math.round(vN / t.visits * 100)}%)</span>` : ''}</div>${tail}</div></div>`;
    }
    if(t.visits > 0){                                   // a visits-only target still deserves its row — and its sales, which the team figure counts
      const vp = Math.round(vN / t.visits * 100);
      return head(vp, lbBar(vp), p.measured ? msKwd(p.bm.amount) : '—') + `<div class="det"><div class="s"><span>${msWho(r)}</span> <span data-notr>${vp}%</span> ${p.measured ? `${msKd(p.bm.amount)} · ` : ''}<span>Visits ${vN} of ${t.visits} this month</span> · <span>no sales target set</span></div>${extra}</div></div>`;
    }
    return head(null, '<div class="bar none" aria-hidden="true"></div>', p.measured ? msKwd(p.bm.amount) : '—') + `<div class="det"><div class="s"><span>${msWho(r)}</span> ${p.measured ? `${msKd(p.bm.amount)} · ` : ''}<span>no sales target set</span></div>${extra}</div></div>`;
  });
  const tt = msTeamTotal(v, P, sig), withGoal = P.filter(p => p.goal);
  let teamRow = '';
  if(tt && tt.pct != null && tt.n >= 1){
    const meas = withGoal.filter(p => p.measured), asOf = meas.map(p => p.bm.asOf).sort().pop() || null, wd = UMCore.monthWorkdays(msMonth(), asOf);
    const st = asOf ? msPace(tt.ach, tt.goal, wd.done, wd.total) : null;
    // teamTargetNow (the app-wide rule) counts someone with a target and no sales figure as 0: said, so its % and the sales card's can be told apart
    const zero = meas.length ? withGoal.filter(p => !p.measured) : [];
    teamRow = `<div class="ms-person team ms-lbx"><div class="n">Team</div> <div class="p">${tt.pct}%</div>
      <div class="s">${msKd(tt.ach)} <span>of</span> ${msKd(tt.goal)} · <span>${st ? MS_STATE[st] : 'no figure yet'}</span> · <span>${tt.n} rep${tt.n === 1 ? '' : 's'}</span>${zero.length ? ` · ${msNames(zero.map(p => p.rep))} <span>counted as 0 (no figure in the files)</span>` : ''}</div></div>`;
  }
  const meas = withGoal.filter(p => p.measured), asOf = meas.map(p => p.bm.asOf).sort().pop() || null, wdT = UMCore.monthWorkdays(msMonth(), asOf), expT = msExpected(wdT);
  const cx = msMemo(sig, 'cx', () => crossInvoiceNote(null, msDigest(sig)));
  el.innerHTML = `<div class="ms-card ms-people${_msLbAll ? ' ms-all' : ''}">
    <div class="ms-ct"><span class="ms-ttl"><span>${msT('Team Leaderboard')} <small>${msT('(Your Team)')}</small></span></span><span class="ms-act"><button class="ms-va" aria-expanded="${_msLbAll}" onclick="event.stopPropagation(); msLbToggle(this)"><span>${_msLbAll ? 'Show less' : 'View All'}</span>${I('arrowr')}</button>${msInfo('sales')}</span></div>
    <div class="ms-lbhint">${msT('Tap a name to open their screen')} · <span>${monthName} target</span></div>
    <div class="ms-lbw">${rows.join('')}</div>${teamRow}
    ${!withGoal.length && !P.some(p => p.t.visits > 0) ? `<div class="ms-note">${msT('Set sales and visit targets per rep in the admin panel to see live progress here.')} <span class="link" onclick="openAdminPanel()">${msT('Admin panel')}</span></div>` : ''}
    <div class="ms-lbx">${expT != null && withGoal.length ? `<div class="ms-fine">${msT('Expected by')} ${msDate(wdT.asOf)}: ${msPct(expT)} ${msT('of the target (the working days so far)')}.</div>` : ''}
    ${oneSrc ? `<div class="ms-fine">Achieved: ${esc(srcs[0])} · target: DSR</div>` : ''}${oneStale ? `<div class="ms-fine">${stale[0]}</div>` : ''}
    <button class="chip small" onclick="event.stopPropagation(); openMonthReports()">${I('book')} Months</button></div>
  </div>${cx ? `<div class="ms-card ms-cxcard">${cx}</div>` : ''}`;
}
// what the team's figures add for one person: her growth on the same days of last month (execDashboard's
// byPerson[i].sameDays — the growth her own screen shows), field visits and orders logged in the app
function msPersonExtra(b){
  if(!b) return '';
  const parts = [];
  const sd = msOf(b.sameDays), g = sd ? msGrowthMark(sd.growth, sd.fromZero) : null;
  if(g) parts.push(sd.fromZero ? msT('from zero against the same days last month') : `<span data-ms="person-growth" data-r="${esc(b.rep)}" data-value="${Math.round(sd.growth * 100)}">${g}</span> ${msT('vs the same days last month')}`);
  if(b.visits != null) parts.push(msT(msCount(b.visits, 'field visit', 'field visits')));
  if(b.orders != null) parts.push(msT(msCount(b.orders, 'order logged in the app', 'orders logged in the app')));
  return parts.length ? `<div class="ms-fine">${parts.join(' · ')}</div>` : '';
}

// ---- field work ----
// The team: field visits, conversion, orders logged in the app (never called sales), new customers.
function msTeamWorkHTML(v, m, week){
  week = week || '';
  const D = m && msOf(m.D), Vi = D && msOf(D.visits), O = D && msOf(D.orders), C = D && msOf(D.conversion), N = D && msOf(D.newCustomers);
  let html = `<div class="ms-ct"><span class="ms-ttl"><span class="ms-tile t-blue">${I('calendar')}</span><span>${msT('Visits & orders')}</span></span>${msInfo('work')}</div>`;
  if(!D) return html + msWait(m) + week;
  // new customers: counted only for the people whose month before the files hold (else every account would look new) — the others named
  const blocked = N && N.measurable && Array.isArray(N.blocked) ? N.blocked : [];
  const n = Vi ? Vi.count : null;
  html += `<div class="ms-big" data-ms="visits" data-value="${n == null ? '' : n}">${n == null ? '—' : `${msN(n)} <small>${esc(msUnit(n, 'field visit', 'field visits'))}</small>`}</div>
    <div class="ms-of">${msT('this month, the whole team')}</div>
    <div class="ms-stats">
      <div><span class="ms-l">${msT('Conversion to an order')}</span><b data-ms="conversion" data-value="${C && C.pct != null ? C.pct : ''}">${C && C.pct != null ? msPct(C.pct) : '—'}</b></div>
      <div><span class="ms-l">${msT('Orders logged in the app')}</span><b data-ms="orders" data-value="${O ? O.count : ''}">${O ? msT(msCount(O.count, 'order', 'orders')) : '—'}</b>${O ? `<em data-ms="orders-value" data-value="${O.value}">${msKd(O.value)}</em>` : ''}</div>
      <div><span class="ms-l">${msT('New customers')}</span><b data-ms="newcustomers" data-value="${N && N.measurable ? N.count : ''}">${N && N.measurable ? msN(N.count) : '—'}</b>${N && !N.measurable ? `<em>${msT('not measured yet')}</em>` : blocked.length ? `<em>${msT('without')} ${msNames(blocked)}</em>` : ''}</div>
    </div>
    <div class="ms-note">${msT('Orders logged in the app are not invoiced sales: sales come from the ERP files only.')}</div>`;
  return html + week;
}
// A person: visits a day, doctors met and new accounts — the KPI scorecard's own figures: the numbers its
// items carry behind their words (n), the same ones More → KPI scorecard writes out. No numbers: hidden.
function msKpiNums(m){
  const K = m && msOf(m.K), W = m && msOf(m.W), S = (m && m.S) || {};
  const num = x => { const n = parseFloat(x); return isFinite(n) ? n : null; };
  const nOf = (c, k) => { const it = c && Array.isArray(c.items) ? c.items.find(x => x && x.key === k) : null; return it ? msOf(it.n) : null; };
  const visitsOf = c => { const n = nOf(c, 'visits'); return n && n.perDay != null ? { perDay: n.perDay, count: n.count, days: n.workdays } : null; };
  const doc = nOf(K, 'doctors'), nb = nOf(K, 'newbiz');
  return { month: visitsOf(K), week: visitsOf(W), goal: num(S.visitsPerDay), total: K ? K.total : null,
    doctors: doc && doc.met != null ? doc.met : null, doctorsBy: doc && doc.goal != null ? doc.goal : null, doctorsGoal: num(S.doctorsPerMonth),
    accounts: nb && nb.accounts != null ? nb.accounts : null, accountsGoal: num(S.newAccounts), card: K };
}
function msVisitsHTML(v, m, week){
  week = week || '';
  const own = v.own;
  let html = `<div class="ms-ct"><span class="ms-ttl"><span class="ms-tile t-green">${I('activity')}</span><span>${msT(own ? 'My visits' : 'Visits')}</span></span>${msInfo('visits')}</div>`;
  if(!m) return html + msWait(m) + week;
  const k = msKpiNums(m), mo = k.month;
  if(!mo) return html + `<div class="ms-note">${msT('The KPI scorecard could not be read on this device.')}</div>` + week;
  const up = k.goal != null ? mo.perDay >= k.goal : null;
  // new accounts: the KPI's count, said only where the files can tell (execDashboard's rule: they hold her month
  // before — in her first month every account would look new); else not measured yet
  const NC = m.D && msOf(m.D.newCustomers), accOk = !!NC && NC.measurable && k.accounts != null;
  html += `<div class="ms-big" data-ms="perday-visits" data-value="${mo.perDay}">${msN(mo.perDay.toFixed(1))} <small>${msT('visits a day')}</small></div>
    <div class="ms-of">${k.goal != null ? `${msT(`goal ${k.goal} a day`)} · ` : ''}${msT(`${mo.count} visits in ${mo.days} working days`)}</div>
    ${up != null ? `<div><span class="ms-pill ${up ? 'good' : 'warn'}">${msT(up ? 'Above goal' : 'Below goal')}</span></div>` : ''}
    <div class="ms-stats">
      <div><span class="ms-l">${msT('This week')}</span>${k.week ? `<b data-ms="week-visits" data-value="${k.week.count}">${msT(msCount(k.week.count, 'visit', 'visits'))}</b><em>${msT(`${k.week.perDay.toFixed(1)} a day`)}</em>` : '<b>—</b>'}</div>
      <div><span class="ms-l">${msT('Doctors')}</span>${k.doctors != null ? `<b data-ms="doctors" data-value="${k.doctors}">${k.doctorsGoal != null ? msT(`${k.doctors} of ${k.doctorsGoal}`) : msN(k.doctors)}</b>${k.doctorsBy != null ? `<em>${msT(`expected ${k.doctorsBy}`)}</em>` : ''}` : '<b>—</b>'}</div>
      <div><span class="ms-l">${msT('New accounts')}</span>${accOk ? `<b data-ms="accounts" data-value="${k.accounts}">${k.accountsGoal != null ? msT(`${k.accounts} of ${k.accountsGoal}`) : msN(k.accounts)}</b>` : `<b>—</b>${NC && !NC.measurable ? `<em>${msT('not measured yet')}</em>` : ''}`}</div>
    </div>`;
  return html + week;
}
// The week so far (Sunday to today), under the month's figures and by their rules (UMCore.execWeek): the invoiced
// sales of the people the files hold, the field visits they were on, the orders they logged. Someone the files do
// not hold is named, never a 0; with nobody held, the line says so in words.
function msWeekWhy(v, missing){
  const why = (missing || []).map(x => x.why);
  return why.length && why.every(w => w === 'nofile') ? 'no invoiced sales figure (no sales file for this month yet)'
    : why.length && why.every(w => w === 'short') ? 'no invoiced sales figure (the sales files do not reach the start of the week)'
    : v.kind === 'team' ? 'no invoiced sales figure (the sales files hold none of these people)' : 'no invoiced sales figure (the sales files hold no line of this person)';
}
function msWeekLine(v, W){
  if(!W) return '';
  const S = W.sales;
  const lead = S && S.measured ? `<span>Sales this week (ERP-verified)</span>: <span data-ms="week-sales" data-value="${S.amount}">${msKd(S.amount)}</span>${S.missing.length ? ` (${msT('without')} ${msNames(S.missing.map(x => x.rep))})` : ''} · ` : '<span>This week</span>: ';
  return `<div class="ms-week" id="heroCard">${lead}<span>${msCount(W.visits, 'visit', 'visits')}</span> · <span data-ms="week-orders" data-value="${W.orders}">${msCount(W.orders, 'order logged in the app', 'orders logged in the app')}</span> (${msKd(W.value)})${S && !S.measured ? ` · <span>${msWeekWhy(v, S.missing)}</span>` : ''}</div>`;
}

// ---- the sales advisor (redesign): what the app itself works out for the view — no AI is connected ----
// Its first line is the amount a working day the target needs (execDashboard's perDay); then the follow-ups due and the
// customers to act on (execDashboard.act); then the first point of the Report's sales coach (UMCore.coachInsights, m.coach).
// ---- the sales advisor (the picture's card with its robot): what the app itself works out for the view — no AI ----
// Two lines: the amount a working day the target needs (execDashboard's perDay) and the follow-ups due; "View
// Recommendations" opens the whole advice: the follow-ups, the customers to act on (execDashboard.act) and the first
// point of the Report's sales coach (UMCore.coachInsights, m.coach). The robot is an illustration.
function msAdvHead(){ return `<div class="ms-ct"><span class="ms-ttl"><span class="ms-tile t-lime">${I('bulb')}</span><span>${msT('Sales advisor')}</span></span>${msInfo('act')}</div>`; }
function msAdvLead(m){
  const D = m && msOf(m.D); if(!D) return '';
  const A = msOf(D.achievement) || {}, Pd = msOf(D.perDay) || {}, wd = msOf(Pd.workdays) || {};
  if(A.pct == null) return '';
  if(D.remaining === 0) return `<div class="ms-lead">${I('check')}<span>${msT('Target reached')}</span></div>`;
  if(Pd.amount == null) return '';
  return `<div class="ms-lead">${I('target')}<span><span>${msT('To reach the target:')}</span> <b>${msKd(Pd.amount)}</b> <span>${msT('per working day')}</span>${wd.left != null ? ` · <span>${msT(msCount(wd.left, 'day left', 'days left'))}</span>` : ''}</span></div>`;
}
function msAdvTip(m){
  const c = m && m.coach; if(!c) return '';
  return `<div class="ms-tip">${I('activity')}<span><span class="k">${msT('Sales coach')}</span> · <span>${msT(c.title)}</span></span></div>`;
}
function msAdvDue(v){ const all = visibleDueClinics(); return v.kind === 'person' ? all.filter(c => c.rep === v.rep) : all; }
function msAdvisorHTML(v, m){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own, D = m && msOf(m.D);
  const A = D ? (msOf(D.achievement) || {}) : {}, Pd = D ? (msOf(D.perDay) || {}) : {};
  const due = msAdvDue(v), over = due.filter(c => followStatus(c.nextFollowUp) === 'overdue').length;
  let lead;
  if(!D) lead = m && m.failed ? msT("The month's figures could not be worked out on this device.") : msT('Calculating the month…');
  else if(A.pct == null) lead = msT(D.sales && D.sales.measured ? 'No sales target on file for this month' : 'No sales figure for this month yet.');
  else if(D.remaining === 0) lead = msT(team ? 'The team target is reached this month.' : own ? 'Your target is reached this month.' : 'The target is reached this month.');
  else if(Pd.amount != null) lead = `<span>${msT('You need')}</span> <b>${msKwd(Pd.amount)}</b> <span>${msT(team ? 'in daily sales to reach the team target.' : own ? 'in daily sales to reach your target.' : 'in daily sales to reach the target.')}</span>`;
  else lead = msT('No working day left this month.');
  const second = due.length ? msT(due.length === 1 ? (over ? 'One clinic has a follow-up overdue.' : 'One clinic has a follow-up due today.') : over ? `${due.length} clinics have follow-ups due (${over} overdue).` : `${due.length} clinics have follow-ups due today.`)
    : m && m.coach ? `${msT('Sales coach')}: ${msT(m.coach.title)}` : msT('No follow-ups due — all caught up.');
  return `<div class="ms-ct"><span class="ms-ttl"><span class="ms-advic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 3.2l1.9 5.2a3 3 0 0 0 1.8 1.8l5.2 1.9-5.2 1.9a3 3 0 0 0-1.8 1.8l-1.9 5.2-1.9-5.2a3 3 0 0 0-1.8-1.8l-5.2-1.9 5.2-1.9a3 3 0 0 0 1.8-1.8z" fill="#F0D45C" stroke="#0E5A44" stroke-width="2" stroke-linejoin="round"/><circle cx="5.2" cy="18.9" r="1.5" fill="#3FA77D"/></svg></span><span>${msT('Sales Advisor')}</span></span>${msInfo('act')}</div>
    <div class="ms-advb" onclick="if(window.matchMedia('(max-width: 1023px)').matches) msAdvisorSheet()">
      <img class="ms-robot" src="img/robot.svg" alt="" width="128" height="147">
      <div class="ms-advt"><span class="ms-advh" hidden>${msT('Sales Advisor')}</span><p data-ms="adv-lead">${lead}</p><p>${second}</p>
        <button class="ms-advbtn" onclick="event.stopPropagation(); msAdvisorSheet()"><span>${msT('View Recommendations')}</span>${I('arrowr')}</button></div>
      <svg class="svgi ms-advgo" aria-hidden="true"><use href="#i-chev"/></svg>
    </div>`;
}
// The whole advice of the view: the amount a working day, the follow-ups due, the customers to act on, the coach's point.
function msAdvisorSheet(){
  const v = msView(); if(!v) return;
  const m = msModelFor(v), D = m && msOf(m.D), act = D && msOf(D.act);
  const due = msAdvDue(v), team = v.kind === 'team';
  const dueRows = due.slice(0, 6).map(c => { const ov = followStatus(c.nextFollowUp) === 'overdue';
    return `<button class="ms-item" data-c="${esc(c.id)}" onclick="closeModal(); confirmFollowUp(this.dataset.c)"><span class="ms-dot ${ov ? 'bad' : 'warn'}"></span><div class="t"><div>${msData(c.name)}</div><div class="s">${ov ? `${msT('Follow-up overdue since')} ${msDate(c.nextFollowUp)}` : msT('Follow-up due today')}${team && c.rep ? ' · ' + msWho(c.rep) : ''}</div></div>${msChev()}</button>`; }).join('');
  const u = act && act.measurable && Array.isArray(act.under) ? act.under : [], p = act && act.measurable && Array.isArray(act.potential) ? act.potential : [];
  showModal(`<h3 style="margin-top:0;">${I('spark2')} ${msT('Sales Advisor')}</h3>
    <div class="ms-how ms-advsheet">
      <div class="ms-note" style="margin-top:0;">${msT('Worked out by the app from its own figures: the sales files, the targets, your visits and follow-ups.')}</div>
      ${msAdvLead(m)}
      <h4>${msT('Follow-ups due')} (${due.length})</h4>
      <div class="ms-items">${dueRows || `<div class="ms-note">${msT('All caught up')}</div>`}</div>${due.length > 6 ? `<button class="ms-more" onclick="closeModal(); msGo('msDueCard')">${msT('See all')} ${msChev()}</button>` : ''}
      <h4>${msT('Customers to act on')} (${u.length + p.length})</h4>
      ${act && act.measurable ? `<div class="ms-items">${u.slice(0, 3).map(x => msActItem(x, 'under', v)).concat(p.slice(0, 3).map(x => msActItem(x, 'potential', v))).join('') || `<div class="ms-note">${msT('Nobody under-performing, no A or B clinic waiting')}</div>`}</div>${u.length + p.length > 6 ? `<button class="ms-more" onclick="msActSheet()">${msT('See all')} ${msChev()}</button>` : ''}`
        : `<div class="ms-note">${msT(D ? 'Not measured: no sales figure for this month yet' : 'Calculating the month…')}</div>`}
      ${msAdvTip(m)}
    </div>
    <button class="btn secondary" onclick="closeModal()">Close</button>`);
}
// ---- the pace card: on pace or behind, with the real figures, the forecast note, and the month's report one tap away ----
function msStatusHTML(v, m, P){
  const D = m && msOf(m.D); if(!D) return '';
  const A = msOf(D.achievement) || {}, Pd = msOf(D.perDay) || {}, wd = msOf(Pd.workdays) || {};
  const exp = msExpected(wd), pace = A.pct != null ? msPace(A.achieved, A.target, wd.done, wd.total) : null;
  const tone = pace === 'behind' ? 'warn' : pace ? 'good' : 'none';
  const title = pace ? MS_STATE[pace] : D.sales && D.sales.measured ? 'No sales target on file for this month' : 'No sales figure for this month yet.';
  const sub = A.pct != null ? `${msPct(A.pct)} ${msT('achieved')}${exp != null ? ` · ${msT('expected by')} ${msDate(wd.asOf)}: ${msPct(exp)}` : ''}` : '';
  return `<div class="ms-st ${tone}"><span class="ms-stic">${I(pace === 'behind' ? 'alert' : pace ? 'trend' : 'info')}</span>
    <div class="ms-stt">${msT(title)}</div>${sub ? `<div class="ms-sts">${sub}</div>` : ''}${msFcNote(D)}
    <button class="ms-stb" onclick="renderMonthClose('${msMonth()}')"><span>${msT('View detailed report')}</span>${msChev()}</button></div>`;
}
// ---- your next actions (the phone's list in the picture; a person's card beside the chart on a laptop) ----
// A planned clinic is visited by a field visit that day with the person on it (UMCore.planVisitKeys, the missed plans'
// and the e-mail's rule). No time is shown: a plan entry carries when it was planned, not an appointment.
function planDoneKeys(day){ return UMCore.planVisitKeys(visits.filter(x => x && x.date === day)); }
function msAct(icon, title, sub, attrs, cls){ return `<button class="ms-ac"${attrs || ''}><span class="ic${cls ? ' ' + cls : ''}">${I(icon)}</span><div class="t"><div>${title}</div><div class="s">${sub}</div></div></button>`; }
function msNextHead(v){
  const own = v.kind === 'team' || v.own;
  return `<div class="ms-ct"><span class="ms-ttl"><span>${msT(own ? 'Your Next Actions' : 'Next Actions')}</span></span><span class="ms-act"><button class="ms-va" onclick="msGo('msPlanCard')"><span>${msT('View All')}</span>${I('arrowr')}</button></span></div>`;
}
function msNextHTML(v){
  const r = v.rep, own = v.own, today = todayStr(), keys = planDoneKeys(today);
  const entries = ((dayPlans[today] || {})[r] || []).map(e => ({ id: planEntryId(e), note: planEntryNote(e) })).filter(e => clinics.some(c => c.id === e.id));
  const done = entries.filter(e => keys.has(today + '|' + r + '|' + e.id));
  const left = entries.filter(e => !done.includes(e));
  const rows = [];
  left.slice(0, 3).forEach(e => { const c = clinics.find(x => x.id === e.id);
    rows.push(msAct('pin', `${msT('Visit:')} ${msData(c.name)}`, `${msT('Today')} · ${msT("in today's plan")}${e.note ? ` · ${msData(e.note)}` : ''}`, own ? ` data-c="${esc(c.id)}" onclick="quickLogFrom(this.dataset.c)"` : ` data-c="${esc(c.id)}" onclick="openClinicDetail(this.dataset.c)"`)); });
  const fu = visibleDueClinics().filter(x => x.rep === r);
  fu.slice(0, Math.max(1, 3 - rows.length)).forEach(c => { const ov = followStatus(c.nextFollowUp) === 'overdue';
    rows.push(msAct('cal2', `${msT('Follow-up:')} ${msData(c.name)}`, ov ? `${msT('Overdue since')} ${msDate(c.nextFollowUp)}` : msT('Today'), ` data-c="${esc(c.id)}" onclick="confirmFollowUp(this.dataset.c)"`, ov ? 'warn' : '')); });
  const task = visibleTasks().filter(t => !t.done && (t.rep === r || t.rep === 'Team') && t.dueDate && ['overdue', 'today'].includes(followStatus(t.dueDate)))[0];
  if(task && rows.length < 4) rows.push(msAct('clip2', `<span dir="auto">${esc(task.text || task.title || '')}</span>`, msT(followStatus(task.dueDate) === 'overdue' ? 'Task · overdue' : 'Task · today'), ` onclick="msGo('msTaskCard')"`));
  let html = msNextHead(v);
  html += entries.length ? `<div class="ms-sum2">${msT(`Today's plan: ${done.length} of ${entries.length} done`)}</div>` : '';
  html += rows.length ? `<div class="ms-acts">${rows.join('')}</div>` : `<div class="ms-note">${msT(entries.length ? "All of today's plan is visited" : 'No plan for today yet')}</div>`;
  if(own && !left.length) html += `<button class="ms-btn" onclick="switchView('log')">${I('plus')} ${msT('Log a visit')}</button>${entries.length ? '' : `<button class="ms-btn ghost" onclick="openPlanDay()">${I('compass')} ${msT('Plan today')}</button>`}`;
  return html;
}
// The team: the follow-ups due, the customers to act on — the supervisor's next actions (with his own plan when he has one).
function msNeedsHTML(v, m){
  const due = visibleDueClinics(), over = due.filter(c => followStatus(c.nextFollowUp) === 'overdue').length;
  const D = m && msOf(m.D), act = D && msOf(D.act), rows = [];
  const me = currentUser.name, today = todayStr(), keys = planDoneKeys(today);
  if(REPS.includes(me)){
    const next = ((dayPlans[today] || {})[me] || []).map(planEntryId).filter(id => clinics.some(c => c.id === id) && !keys.has(today + '|' + me + '|' + id))[0];
    if(next){ const c = clinics.find(x => x.id === next); rows.push(msAct('pin', `${msT('Visit:')} ${msData(c.name)}`, `${msT('Today')} · ${msT("in today's plan")}`, ` data-c="${esc(c.id)}" onclick="quickLogFrom(this.dataset.c)"`)); }
  }
  // the first follow-ups due (overdue first), each a tap from its confirmation; the count of all of them under the list
  due.slice().sort((x, y) => (followStatus(x.nextFollowUp) === 'overdue' ? 0 : 1) - (followStatus(y.nextFollowUp) === 'overdue' ? 0 : 1) || String(x.nextFollowUp).localeCompare(String(y.nextFollowUp))).slice(0, 2).forEach(c => {
    const ov = followStatus(c.nextFollowUp) === 'overdue';
    rows.push(msAct('cal2', `${msT('Follow-up:')} ${msData(c.name)}`, `${ov ? `${msT('Overdue since')} ${msDate(c.nextFollowUp)}` : msT('Today')}${c.rep ? ' · ' + msWho(c.rep) : ''}`, ` data-c="${esc(c.id)}" onclick="confirmFollowUp(this.dataset.c)"`, ov ? 'warn' : ''));
  });
  let more = '';
  if(act && act.measurable){
    const u = Array.isArray(act.under) ? act.under : [], p = Array.isArray(act.potential) ? act.potential : [];
    if(u[0]) rows.push(msActRow(u[0], 'under', v));
    if(p[0]) rows.push(msActRow(p[0], 'potential', v));
    if(!u.length && !p.length) rows.push(`<div class="ms-ac static"><span class="ic">${I('check')}</span><div class="t"><div>${msT('No customer to act on')}</div><div class="s">${msT('Nobody under-performing, no A or B clinic waiting')}</div></div></div>`);
    if(u.length + p.length) more = `<button class="ms-more" onclick="msActSheet()">${[u.length ? msT(`${u.length} under-performing`) : '', p.length ? msT(msCount(p.length, 'opportunity', 'opportunities')) : ''].filter(Boolean).join(' · ')} — ${msT('see all')} ${msChev()}</button>`;
  } else if(D && act && !act.measurable) rows.push(`<div class="ms-ac static"><span class="ic">${I('info')}</span><div class="t"><div>${msT('Customers to act on')}</div><div class="s">${msT('Not measured: no sales figure for this month yet')}</div></div></div>`);
  const dueLine = `<button class="ms-more" onclick="msGo('msDueCard')">${msT(due.length ? msCount(due.length, 'follow-up due', 'follow-ups due') : 'No follow-ups due')} · ${msT(due.length ? `${over} overdue · ${due.length - over} today` : 'All caught up')} ${msChev()}</button>`;
  return msNextHead(v) + `<div class="ms-acts">${rows.join('')}</div>${dueLine}${more}${!D ? msWait(m) : ''}`;
}
// one customer to act on, as an action row (the same words and the same tap as msActItem)
function msActRow(x, kind, v){
  const team = v.kind === 'team', open = x.clinicId != null ? x.clinicId : x.id;
  const who = team ? (x.owner || x.rep ? ' · ' + msWho(x.owner || x.rep) : '') : '';
  const sub = kind === 'under'
    ? `${msT('Under-performing')}${who} · ${x.current > 0 ? `${msKd(x.current)} ${msT('this month, against an average of')} ${msKd(x.average)}` : `${msT('no invoice this month, average')} ${msKd(x.average)}`}`
    : `${msT('Opportunity')}${who} · ${msT(x.bought ? `bought in ${x.bought} of the last ${x.months} months` : x.months ? `no invoice in the last ${x.months} months` : 'no invoice this month')}${x.lastVisit ? ` · ${msT('last visit')} ${msDate(x.lastVisit)}` : ''}`;
  return msAct(kind === 'under' ? 'trend' : 'target', `${x.cls ? `<span class="ms-cls" data-notr>${esc(x.cls)}</span> ` : ''}${msData(x.name)}`, sub, open != null ? ` data-c="${esc(String(open))}" onclick="openClinicDetail(this.dataset.c)"` : '', kind === 'under' ? 'warn' : '');
}
// ---- the four figure cards (the picture's row): the KPI score, today's field visits, the follow-ups due, the forecast ----
// Each the screen's own figure, a tap from its list; a ▲/▼ only against a fair comparison, a sparkline only from a
// series the core rebuilds truthfully (UMCore.homeKpiMonths, homeVisitDays, homeForecastDays — their last point is the
// card's number); none where the app cannot rebuild one (the follow-ups).
function IF(name){ return `<svg class="svgf" aria-hidden="true"><use href="#i-${name}"/></svg>`; }   // a solid icon (the picture's filled ones)
function msGoCal(){ calAnchor = todayStr(); calSelected = todayStr(); switchView('calendar'); }
// a small line chart (null = no point: the line breaks there, never drops to 0)
function msSpark(vals){
  let arr = (vals || []).slice(); while(arr.length && (arr[0] == null || !isFinite(arr[0]))) arr.shift();   // months before any score: not drawn (never as 0)
  const pts = arr.map((v, i) => v == null || !isFinite(v) ? null : { i, v: Number(v) });
  const real = pts.filter(Boolean); if(real.length < 2) return '';
  const W = 104, H = 40, n = Math.max(1, pts.length - 1), lo = Math.min.apply(null, real.map(p => p.v)), hi = Math.max.apply(null, real.map(p => p.v));
  const x = i => (i / n * (W - 4) + 2).toFixed(1), y = v => (hi === lo ? H / 2 : H - 4 - (v - lo) / (hi - lo) * (H - 12)).toFixed(1);
  const segs = []; let cur = [];
  pts.forEach(p => { if(p) cur.push(p); else if(cur.length){ segs.push(cur); cur = []; } }); if(cur.length) segs.push(cur);
  const line = segs.filter(s => s.length > 1).map(s => 'M' + s.map(p => x(p.i) + ' ' + y(p.v)).join('L')).join('');
  const area = segs.filter(s => s.length > 1).map(s => 'M' + x(s[0].i) + ' ' + H + 'L' + s.map(p => x(p.i) + ' ' + y(p.v)).join('L') + 'L' + x(s[s.length - 1].i) + ' ' + H + 'Z').join('');
  return `<svg class="ms-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><linearGradient id="msSpG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22B07A" stop-opacity=".22"/><stop offset="1" stop-color="#22B07A" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#msSpG)"/><path d="${line}" fill="none" stroke="#22B07A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
// ▲ +4 / ▼ −2 / = 0 against the comparison named in the title (points for a score, visits for the visits)
function msDelta(d, title){
  if(d == null || !isFinite(d)) return '';
  const cls = d > 0 ? '' : d < 0 ? ' down' : ' flat', s = d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0';
  return `<span class="ms-kd${cls}" title="${esc(trOf(title) || title)}"><span class="tri" aria-hidden="true">${d > 0 ? '▲' : d < 0 ? '▼' : '='}</span><span data-notr dir="ltr">${s}</span><span class="sr"> ${msT(title)}</span></span>`;
}
function msKpisHTML(v, m, sig){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own, D = m && msOf(m.D), H = (m && m.H) || {};
  const A = D ? (msOf(D.achievement) || {}) : {}, F = D ? msOf(D.forecast) : null;
  const wait = `<span class="ms-wait">${msT(m && m.failed ? 'Not worked out on this device' : 'Calculating…')}</span>`;
  const card = (cls, icon, label, small, value, below, spark, action, k, kv, title) => `<button class="ms-kc${cls ? ' ' + cls : ''}${spark ? ' sp' : ''}" onclick="${action}"${title ? ` title="${esc(trOf(title) || title)}"` : ''}><span class="ms-kic">${icon.charAt(0) === 'n' ? IF(icon) : I(icon)}</span><span class="ms-kb"><span class="ms-kl">${Array.isArray(label) ? `<span class="kl-d">${msT(label[0])}</span><span class="kl-m">${msT(label[1])}</span>` : `<span>${msT(label)}</span>`}${small ? `<small>${msT(small)}</small>` : ''}</span><span class="ms-kv"${k ? ` data-ms="${k}" data-value="${kv == null ? '' : kv}"` : ''}>${value}</span>${below || ''}</span>${spark || ''}</button>`;
  const out = [];
  // 1 — the KPI score (the scorecard's 10 measures): the team = the average of the people of REPS who have one
  const K = msOf(H.kpi), score = K ? K.current : null;
  out.push(card('', 'users', team ? 'Team Performance' : own ? 'My Performance' : 'Performance', team ? '(Your Team)' : '', score != null ? msN(score + '%') : '—',
    K ? (K.delta != null ? msDelta(K.delta, 'points against the same days last month') : `<span class="ms-ks">${msT(score != null ? 'KPI score out of 100' : 'No visit logged this month yet')}</span>`) : `<span class="ms-ks">${m ? '—' : wait}</span>`,
    K ? msSpark(K.months.map(x => x.score)) : '', team ? 'openKpiScorecard()' : 'msKpi()', 'kpi', score, 'KPI score out of 100 (the KPI scorecard), month by month'));
  // 2 — today's field visits of the view's people (a joint visit once; calls and phone orders are not visits)
  const VD = UMCore.homeVisitDays(visits || [], v.reps, todayStr(), 10);
  out.push(card('', 'ncal', "Today's Visits", '', msN(VD.today), msDelta(VD.today - VD.weekAgo, 'against the same day last week'), msSpark(VD.days.map(x => x.count)), 'msGoCal()', 'today-visits', VD.today, 'Field visits logged today; the line: each working day of the last two weeks'));
  // 3 — the follow-ups due (overdue + today), "Needs Attention" only when one is overdue; no sparkline (no history to rebuild it from)
  const due = team ? visibleDueClinics() : visibleDueClinics().filter(c => c.rep === v.rep), over = due.filter(c => followStatus(c.nextFollowUp) === 'overdue').length;
  out.push(card(over ? 'att' : '', 'clip2', 'Pending Follow-ups', '', msN(due.length),
    over ? `<span class="ms-chip warn">${I('alert')}<span>${msT('Needs Attention')}</span></span><span class="sr"> ${msT(`${over} overdue · ${due.length - over} today`)}</span>` : `<span class="ms-ks">${msT(due.length ? `${due.length} today` : 'All caught up')}</span>`,
    '', "msGo('msDueCard')", 'due', due.length));
  // 4 — the forecast: the month-end figure at the pace so far, as a % of the target — an estimate, never a result
  const withT = A.pct != null && F && F.pct != null && F.forTarget != null, fc = F && !F.closed ? (withT ? F.forTarget : F.amount) : null;
  let fSpark = '';
  if(fc != null){
    const Dy = msOf(D.daily), Pr = Dy && msOf(Dy.pair), days = withT && Pr ? Pr.days : Dy && Dy.days;
    const FD = days ? UMCore.homeForecastDays(msMonth(), days) : [], last = FD.length ? FD[FD.length - 1].forecast : null;
    if(last != null && Math.abs(last - fc) <= 0.05 * Math.max(1, (F.people || []).length)) fSpark = msSpark(FD.map(x => x.forecast));   // only when it ends on the card's own figure
  }
  const fVal = fc == null ? '—' : withT ? msN(F.pct + '%') : msKwd(fc);
  out.push(card('fc', 'trend2', ['Sales Forecast', 'Forecast'], '', fVal,
    fc != null ? `<span class="ms-ks">≈ ${msKwd(fc)}</span><span class="ms-ks ms-est">${msT('estimate')}</span>` : `<span class="ms-ks">${!D ? wait : msT(F && F.closed ? 'The month is closed' : 'No sales figure for this month yet.')}</span>`,
    fSpark, "msHow('sales')", 'forecast', fc, 'The month-end figure at the pace so far (an estimate, not a result) — the ⓘ shows the working'));
  return out.join('');
}

// ---- Sales Performance (the picture's weekly bars): the invoiced sales to each week's end against the target pace ----
// UMCore.homeWeeks over execDashboard's day-by-day lines: of the people with a target and a sales figure (the
// target card's people), or — with no target — everyone's lines and no target line. The running week's bar is the
// month's figure, marked with its amount; a week still to come has no bar, only its point on the target line.
function msNiceStep(raw){ const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))), q = raw / p; return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => q <= s + 1e-9) * p; }
function msK(v){ const k = v / 1000; return uiLang === 'ar' ? Math.round(v).toLocaleString('en-US') : v >= 1000 ? (Math.round(k * 10) / 10).toLocaleString('en-US') + 'K' : String(Math.round(v)); }   // Arabic: the whole number (no Latin K)
function msChartHTML(v, m){
  const D = m && msOf(m.D);
  const keys = `<span class="ms-keys"><span><i></i>${msT('Sales')}</span><span><i class="t"></i>${msT('Target')}</span></span>`;
  let html = `<div class="ms-ct"><span class="ms-ttl"><span>${msT('Sales Performance')}</span></span><span class="ms-act">${keys}${msInfo('chart')}</span></div>`;
  if(!D) return html + msWait(m);
  const Dy = msOf(D.daily), A = msOf(D.achievement) || {}, Pr = Dy && msOf(Dy.pair);
  const withT = A.pct != null && !!Pr && Array.isArray(Pr.days) && Pr.days.length > 0;
  if(!Dy || !Dy.measured || !Array.isArray(Dy.days) || !Dy.days.length)
    return html + `<div class="ms-note">${msT(Dy ? 'No sales figure for this month yet, so no weekly bars.' : 'The weekly figures are not available on this device yet.')}</div>`;
  const W = UMCore.homeWeeks(msMonth(), withT ? Pr.days : Dy.days, withT ? A.target : null);
  return html + `<div class="ms-wk">${msWeeksSVG(W)}</div>` + (withT && ((A.noTarget || []).length || (A.notMeasured || []).length) ? `<div class="ms-fine">${msT('Drawn for the people with a target and a sales figure:')} ${msNames(A.people || [])}.</div>` : '');
}
function msWeeksSVG(W){
  const rtl = uiLang === 'ar', VW = 552, top = 18, base = 197;
  const vals = []; W.forEach(w => { if(w.achieved != null) vals.push(w.achieved); if(w.pace != null) vals.push(w.pace); });
  const step = msNiceStep(Math.max(1, Math.max.apply(null, vals.concat([1]))) / 4), maxY = step * 4;
  const y = val => base - Math.max(0, Math.min(1, val / maxY)) * (base - top), f1 = n => Math.round(n * 10) / 10;
  // the amounts' gutter: 50 px in English ("24K"), wider in Arabic (the whole number) — the labels never reach the plot
  const g = rtl ? 66 : 50;
  const cx = i => rtl ? VW - (g + [29, 162, 300, 436][i]) : [79, 215, 360, 500][i];
  const axX = rtl ? VW - g : g, labX = rtl ? VW - g + 8 : g - 24;
  let svg = `<svg viewBox="0 0 ${VW} 230" role="img" aria-label="${esc(trOf('Invoiced sales at the end of each week against the target pace') || 'Invoiced sales at the end of each week against the target pace')}"><defs>`
    + `<linearGradient id="msBarG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B7F68"/><stop offset="1" stop-color="#1E7360"/></linearGradient>`
    + `<linearGradient id="msBarG2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A8D75"/><stop offset="1" stop-color="#227763"/></linearGradient></defs>`;
  for(let k = 0; k <= 4; k++){
    const yy = f1(y(step * k));
    svg += `<line x1="${rtl ? 0 : axX}" y1="${yy}" x2="${rtl ? axX : VW}" y2="${yy}" stroke="${k === 0 ? '#DCE3E8' : '#EEF2F5'}"/><text class="ax" x="${labX}" y="${f1(yy + 5)}" direction="ltr" text-anchor="${rtl ? 'start' : 'end'}" data-notr>${msK(step * k)}</text>`;
  }
  svg += `<line x1="${axX}" y1="${top - 6}" x2="${axX}" y2="${base}" stroke="#DCE3E8"/>`;
  W.forEach((w, i) => { if(w.achieved != null){ const h = Math.max(1, base - y(w.achieved)); svg += `<rect class="bar${w.current ? ' cur' : ''}" data-v="${w.achieved}" x="${f1(cx(i) - 28.5)}" y="${f1(base - h)}" width="57" height="${f1(h)}" rx="2.5"><title>${esc(msK(w.achieved))}</title></rect>`; } });
  const pts = W.map((w, i) => w.pace != null ? { x: cx(i), y: y(w.pace), v: w.pace } : null).filter(Boolean);
  if(pts.length > 1) svg += `<polyline class="tl" points="${pts.map(p => f1(p.x) + ',' + f1(p.y)).join(' ')}"/>`;
  pts.forEach(p => { svg += `<circle class="td" data-v="${p.v}" cx="${f1(p.x)}" cy="${f1(p.y)}" r="4.6"/>`; });
  W.forEach((w, i) => { svg += `<text class="xl" x="${f1(cx(i))}" y="223" text-anchor="middle">${esc('W' + w.week)}</text>`; });
  // the running week's amount over its bar (the picture's dark label)
  const ci = W.findIndex(w => w.current);
  if(ci >= 0){
    const w = W[ci], label = Math.round(w.achieved).toLocaleString('en-US'), bw = label.length * 8.6 + 22, bx = f1(cx(ci) - bw / 2), by = Math.max(2, Math.min(y(w.achieved), w.pace != null ? y(w.pace) : 1e9) - 40);
    svg += `<g class="tip"><rect x="${bx}" y="${f1(by)}" width="${f1(bw)}" height="27" rx="7" fill="#093A30"/><path d="M${f1(cx(ci) - 6)} ${f1(by + 26.5)}l6 7 6-7z" fill="#093A30"/><text class="tipt" x="${f1(cx(ci))}" y="${f1(by + 18.5)}" text-anchor="middle" data-notr>${label}</text></g>`;
  }
  return svg + '</svg>';
}
// A person's advisor (her own figures only): her follow-ups due, her first customer to act on, the coach's point.
// ---- the pace card: on pace or behind, with the real figures, and the month's detailed report one tap away ----
// ---- the four figures under the target card: the month against the target (a person: her performance score),
// today's field visits, the follow-ups due, the forecast — each the screen's own figure, a tap from its list ----
// ---- what needs action ----
// The team: follow-ups due (overdue + today) and the customers to act on.
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
  if(!act){ showToast(m && m.failed ? "The month's figures could not be worked out on this device." : 'Calculating the month…'); return; }
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
// A planned clinic is visited by a field visit that day with the person on it — the one who logged it or the
// colleague on a joint visit; a call or a phone order is not a visit (UMCore.planVisitKeys: the missed plans and
// the e-mail count the same). The keys 'date|person|clinicId' of the plans fulfilled on a day.
// A person: the next clinic of today's plan, with logging a visit one tap away, then a follow-up and a task.

// ---- laptop: the month day by day, the brands, the customers ----
// The cumulative invoiced sales against the straight line to the target, and
// the forecast at the pace so far. Time runs with the reading direction (right
// to left in Arabic); the axis says which day is where.
function msDailyHTML(v, m){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D);
  const title = team ? 'Sales day by day against the target' : own ? 'My sales day by day against my target' : 'Sales day by day against the target';
  const keys = `<span class="ms-keys"><span><i></i>${msT('Achieved so far')}</span><span><i class="t"></i>${msT('Line to the target')}</span><span><i class="f"></i>${msT('Forecast')}</span></span>`;
  let html = `<div class="ms-ct"><span class="ms-ttl"><span class="ms-tile t-green">${I('chart')}</span><span>${msT(title)}</span></span><span class="ms-act">${keys}${msInfo('chart')}</span></div>`;
  if(!D) return html + msWait(m);
  const Dy = msOf(D.daily), A = msOf(D.achievement) || {}, F = msOf(D.forecast);
  // the chart is of the sales card's people: with a target, those with a target and a sales figure — their days,
  // their target, their forecast; with no target at all, everyone's days and projection, and no line to a target
  const Pr = Dy && msOf(Dy.pair), withT = A.pct != null && !!Pr && Array.isArray(Pr.days) && Pr.days.length > 0;
  if(Dy && Dy.measured && Array.isArray(Dy.days) && Dy.days.length){
    const fc = F && !F.closed ? (withT ? F.forTarget : F.amount) : null;
    html += msChartSVG(D, withT ? Pr.days : Dy.days, Dy.to, withT ? A.target : null, fc != null ? fc : null);
    const out = (A.noTarget || []).concat(A.notMeasured || []);
    if(withT && out.length) html += `<div class="ms-fine">${msT('Drawn for the people with a target and a sales figure:')} ${msNames(A.people || [])}.</div>`;
  }
  else html += `<div class="ms-note">${msT(Dy ? 'No sales figure for this month yet, so no day by day.' : 'The day-by-day figures are not available on this device yet.')}</div>`;
  // underneath: against earlier months (team), or what she logged in the app (a person)
  const cells = [msCmpCell(msOf(D.sameDays), 'Same days last month', 'cmp', false)];
  if(team){
    if(msOf(D.lastYear)) cells.push(msCmpCell(D.lastYear, 'Same month last year', 'cmp-year', true));
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
// A growth against an earlier figure as the core gives it: ▲ / ▼ and the percentage, "from zero", or nothing.
function msGrowthMark(growth, fromZero){
  if(fromZero) return msT('from zero');
  if(growth == null) return null;
  const p = Math.round(growth * 100);
  return `<span class="${p >= 0 ? 'ms-up' : 'ms-down'}">${msN((p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '%')}</span>`;
}
function msGrowth(g){ return g && g.measured ? msGrowthMark(g.growth, g.fromZero) : null; }
// A month in a few words: "Sep" (the month before), "Oct 2025" (a year before) — Arabic month names in the Arabic screen.
function msMon(m, year){ try{ return new Date(m + '-01T00:00:00').toLocaleDateString(uiLocale(), year ? { month: 'short', year: 'numeric' } : { month: 'short' }); }catch(e){ return m; } }
// against an earlier month: the growth, and in the design's few words what it is compared with ("7,247.31 KD · days 1–8 Sep");
// files that stop on different days are said so, and whoever is not in the comparison is named
function msCmpCell(g, label, key, year){
  if(!g) return `<div><span class="ms-l">${msT(label)}</span><b>—</b></div>`;
  const val = msGrowth(g), day = parseInt(String(g.to || '').slice(8, 10), 10) || '';
  let sub;
  if(g.measured){
    sub = `${msKd(g.previous)} · ${g.mixed ? `${esc(msMon(g.month, year))} · ${msT('each person to the day her file reaches')}` : `${msT(`days 1–${day}`)} ${esc(msMon(g.month, year))}`}`;
    if(Array.isArray(g.left) && g.left.length) sub += ` · ${msT('without')} ${msNames(g.left)}`;
  }
  // nothing to compare: this month has no sales figure yet (that month may well be in the files), or that month
  // holds none of the people measured now (no file covers it, or a person's first month)
  else sub = g.why === 'nocurrent' ? msT('No sales figure for this month yet, so nothing to compare') : `${msT('No sales figure for')} ${esc(monthLabel(g.month))}`;
  return `<div><span class="ms-l">${msT(label)}</span><b data-ms="${key}" data-value="${g.measured && g.growth != null ? Math.round(g.growth * 100) : ''}">${val || '—'}</b><em>${sub}</em></div>`;
}
// days: the cumulative line's days, to: the last of them, goal: the target the line runs to (null: none), fc: the forecast
function msChartSVG(D, days, to, goal, fc){
  const rtl = uiLang === 'ar', W = 640, H = 236, top = 30, base = 192;
  const L = rtl ? 22 : 62, R = rtl ? 578 : 618;                       // the amounts' axis on the reading start
  const n = D.days || 30, from = D.from;
  const x = day => { const f = (day - 1) / Math.max(1, n - 1); return rtl ? R - f * (R - L) : L + f * (R - L); };
  let cum = 0; const pts = days.map(d => { cum += Number(d.net) || 0; return { day: parseInt(String(d.date).slice(8, 10), 10), v: cum }; });
  const last = pts[pts.length - 1];
  const top0 = Math.max(goal || 0, fc || 0, last.v, 1) * 1.08;
  const y = val => base - (Math.max(0, val) / top0) * (base - top);
  const f1 = vv => Math.round(vv * 10) / 10;
  const line = pts.map(p => `${f1(x(p.day))},${f1(y(p.v))}`).join(' ');
  const area = `${f1(x(1))},${base} ${line} ${f1(x(last.day))},${base}`;
  const amt = vv => (Math.round(vv)).toLocaleString('en-US');
  const lbl = (xx, yy, txt, cls) => `<text x="${f1(xx)}" y="${f1(yy)}" text-anchor="middle" font-size="12.5" ${cls || 'fill="#5C6962"'} data-notr>${txt}</text>`;
  const endX = x(n);
  // the amounts' scale: round steps (1, 2, 2.5 or 5 × a power of ten), a faint line each
  const raw = top0 / 4, p10 = Math.pow(10, Math.floor(Math.log10(raw))), q = raw / p10, step = (q <= 1 ? 1 : q <= 2 ? 2 : q <= 2.5 ? 2.5 : q <= 5 ? 5 : 10) * p10;
  let grid = '';
  for(let t = 0; t <= top0 + 1e-9; t += step){
    const yy = f1(y(t)), ax = rtl ? R + 8 : L - 10;
    grid += `<line x1="${L}" y1="${yy}" x2="${R}" y2="${yy}" stroke="${t === 0 ? '#D5DED8' : '#EDF1EE'}"/><text class="ax" x="${ax}" y="${f1(yy + 4)}" text-anchor="${rtl ? 'start' : 'end'}" font-size="11.5" fill="#7A867F" data-notr>${amt(t)}</text>`;
  }
  // the two end labels: when they would meet, the smaller value's label goes under its own line, clear of it
  // (the label reaches 44 px in from the month's end, where its line has come down by the slope × 44)
  const near = goal && fc && Math.abs(y(goal) - y(fc)) < 18;
  const under = (yEnd, x0, y0) => yEnd + 44 * Math.max(0, (y0 - yEnd) / Math.max(1, Math.abs(endX - x0))) + 12;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(trOf('Cumulative invoiced sales against the straight line to the target') || 'Cumulative invoiced sales against the straight line to the target')}">
    <defs><linearGradient id="msAreaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E7A55" stop-opacity=".26"/><stop offset="1" stop-color="#1E7A55" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <line x1="${f1(x(last.day))}" y1="${top - 4}" x2="${f1(x(last.day))}" y2="${base}" stroke="#C9D3CD" stroke-dasharray="2 4"/>
    <polygon points="${area}" fill="url(#msAreaG)"/>`;
  if(goal) svg += `<line x1="${f1(x(1))}" y1="${base}" x2="${f1(endX)}" y2="${f1(y(goal))}" stroke="#9AA8A0" stroke-width="2" stroke-dasharray="6 6"/>` + lbl(endX + (rtl ? 24 : -24), near && goal < fc ? under(y(goal), x(1), base) : y(goal) - 8, amt(goal));
  if(fc) svg += `<line x1="${f1(x(last.day))}" y1="${f1(y(last.v))}" x2="${f1(endX)}" y2="${f1(y(fc))}" stroke="#1E7A55" stroke-width="2.2" stroke-dasharray="3 6" stroke-linecap="round"/>` + `<circle cx="${f1(endX)}" cy="${f1(y(fc))}" r="4.5" fill="#fff" stroke="#1E7A55" stroke-width="2" stroke-dasharray="2 2"/>` + lbl(endX + (rtl ? 24 : -24), near && fc <= goal ? under(y(fc), x(last.day), y(last.v)) : y(fc) - 10, amt(fc), 'fill="#1E7A55" font-weight="600"');
  // the latest value, marked: the figure so far in a dark label over its point
  const lv = amt(last.v), bw = lv.length * 7.6 + 18, bx = Math.max(L + bw / 2, Math.min(R - bw / 2, x(last.day))), by = Math.max(14, y(last.v) - 26);
  svg += `<polyline points="${line}" fill="none" stroke="#1E7A55" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${f1(x(last.day))}" cy="${f1(y(last.v))}" r="5.5" fill="#fff" stroke="#1E7A55" stroke-width="3"/>
    <rect x="${f1(bx - bw / 2)}" y="${f1(by - 13)}" width="${f1(bw)}" height="23" rx="7" fill="#022917"/>`
    + `<text x="${f1(bx)}" y="${f1(by + 3)}" text-anchor="middle" font-size="12.5" fill="#FFFFFF" font-weight="600" data-notr>${lv}</text>`
    + `<text x="${f1(x(1))}" y="216" text-anchor="middle" font-size="12" fill="#5C6962">${msDate(from)}</text>`
    + (last.day > 3 && last.day < n - 3 ? `<text x="${f1(x(last.day))}" y="216" text-anchor="middle" font-size="12" font-weight="600" fill="#17201B">${msDate(to)}</text>` : '')
    + `<text x="${f1(endX)}" y="216" text-anchor="middle" font-size="12" fill="#5C6962">${msDate(D.from.slice(0, 8) + String(n).padStart(2, '0'))}</text></svg>`;
  return svg;
}
// The brands: sold against the brand's target (the DSR's split), on the same pace line.
function msBrandsHTML(v, m, P){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D), B = D && msOf(D.byBrand);
  let html = `<div class="ms-ct"><span class="ms-ttl"><span class="ms-tile t-lime">${I('package')}</span><span>${msT(team ? 'Brands — sold against the brand target' : own ? 'My brands — sold against my brand target' : 'Brands — sold against the brand target')}</span></span>${msInfo('brands')}</div>`;
  if(!D) return html + msWait(m);
  const rows = B && Array.isArray(B.rows) ? B.rows.filter(b => b && (b.net || b.target)) : [];
  if(!rows.length) return html + `<div class="ms-note">${msT(B && B.total == null ? 'No sales figure for this month yet.' : 'No brand sold and no brand target this month.')}</div>`;
  const wd = msOf((msOf(D.perDay) || {}).workdays), exp = msExpected(wd);
  const name = k => (m.brands && m.brands[k]) || k;
  // the percentage is what the people with this brand's target sold of it ÷ their targets (achieved ÷ goal);
  // what others sold of it (no target of theirs) is said beside it, never put into the percentage
  html += rows.slice(0, 5).map(b => {
    const of = b.pct != null ? `${msKd(b.achieved)} ${msT('of')} ${msKd(b.goal)}${b.net != null && Math.round(b.net * 100) !== Math.round(b.achieved * 100) ? ` · ${msT('sold in all')} ${msKd(b.net)}` : ''}`
      : `${b.net != null ? msKd(b.net) : '—'}${b.target != null ? ` · ${msT('target')} ${msKd(b.target)}` : ` · ${msT('no brand target')}`}`;
    return `<div class="ms-person" data-brand="${esc(b.brand)}"><div class="n">${msData(name(b.brand))}</div> ${b.pct != null ? msBar(b.pct, exp, true) : '<div></div>'} <div class="p${b.pct == null ? ' none' : ''}" data-ms="brand-pct" data-value="${b.pct == null ? '' : b.pct}">${b.pct != null ? msPct(b.pct) : '—'}</div>
      <div class="s">${of}</div></div>`;
  }).join('');
  if(rows.length > 5) html += `<div class="ms-fine">${msT(msCount(rows.length - 5, 'more brand in the month report', 'more brands in the month report'))}</div>`;
  if(exp != null) html += `<div class="ms-fine">${msT('The dark line = expected by')} ${msDate(wd.asOf)} (${msPct(exp)}).${B.total != null ? ` ${msT('Total')} ${msKd(B.total)}.` : ''}</div>`;
  return html;
}
// The customers: the biggest this month (the Clinics screen's list), and a person's customers to act on.
function msCustHTML(v, m){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own;
  const D = m && msOf(m.D), C = D && msOf(D.customers), act = D && msOf(D.act);
  const acc = C && Array.isArray(C.accounts) ? C.accounts.filter(a => a && !a.channel && a.net > 0) : [];
  // no file holds the month (no totals): no sales figure — never "no customer invoiced", which only a file could say
  const none = msT(!C || !C.totals || C.totals.total == null ? 'No sales figure for this month yet.' : 'No customer invoiced this month yet.');
  const big = list => `<div class="ms-items">${list.map(a => `<button class="ms-item"${a.clinicId != null ? ` data-c="${esc(String(a.clinicId))}" onclick="openClinicDetail(this.dataset.c)"` : ' disabled'}>${a.cls ? `<span class="ms-cls" data-notr>${esc(a.cls)}</span>` : ''}<div class="t"><div>${msData(a.name)}</div>${team && Array.isArray(a.reps) && a.reps.length ? `<div class="s">${a.reps.map(msWho).join(' + ')}</div>` : ''}</div><b>${msKd(a.net)}</b></button>`).join('')}</div>`;
  if(team){
    let html = `<div class="ms-ct"><span class="ms-ttl"><span class="ms-tile t-gold">${I('building')}</span><span>${msT('Biggest customers this month')}</span></span>${msInfo('cust')}</div>`;
    if(!D) return html + msWait(m);
    html += acc.length ? big(acc.slice(0, 5)) : `<div class="ms-note">${none}</div>`;
    return html + `<button class="ms-more" onclick="switchView('clinics')">${msT('All customers')} ${msChev()}</button>`;
  }
  let html = `<div class="ms-ct"><span class="ms-ttl"><span class="ms-tile t-gold">${I('building')}</span><span>${msT(own ? 'My customers to act on' : 'Customers to act on')}</span></span>${msInfo('pcust')}</div>`;
  if(!D) return html + msWait(m);
  const u = act && act.measurable ? act.under || [] : [], p = act && act.measurable ? act.potential || [] : [];
  html += act && act.measurable
    ? (u.length + p.length ? `<div class="ms-items">${u.slice(0, 2).map(x => msActItem(x, 'under', v)).concat(p.slice(0, 2).map(x => msActItem(x, 'potential', v))).join('')}</div>` : `<div class="ms-note">${msT('Nobody under-performing, no A or B clinic waiting')}</div>`)
    : `<div class="ms-note">${msT('Not measured: no sales figure for this month yet')}</div>`;
  if(u.length + p.length > 4) html += `<button class="ms-more" onclick="msActSheet()">${msT('See all')} ${msChev()}</button>`;
  html += `<div class="ms-sub">${msT(own ? 'My biggest customers this month' : 'Biggest customers this month')}</div>`;
  html += acc.length ? big(acc.slice(0, 3)) : `<div class="ms-note">${none}</div>`;
  return html;
}

// ---- phone: the rest, one tap away ----
function msRowsHTML(v, m){
  const team = v.kind === 'team', own = v.kind === 'person' && v.own, r = v.rep;
  const D = m && msOf(m.D), rows = [];
  const dr = team ? '' : ` data-r="${esc(r)}"`;                        // a name reaches a handler only through a data attribute
  const row = (title, sub, action, attrs) => `<button class="ms-item" onclick="${action}"${attrs || ''}><div class="t"><div>${msT(title)}</div><div class="s">${sub}</div></div>${msChev()}</button>`;
  const wait = m && m.failed ? `<span>${msT('Not worked out on this device')}</span>` : `<span class="ms-wait">${msT('Calculating…')}</span>`;
  if(!team){
    const k = m ? msKpiNums(m) : null;
    rows.push(row('Performance score (KPI)', k && k.total != null ? msT(`${k.total} of 100`) : m ? '—' : wait, 'msKpi()', ' data-row="kpi"'));
  }
  const sd = D && msOf(D.sameDays), g = msGrowth(sd);
  rows.push(row(own ? 'My sales day by day' : 'Sales day by day', D ? (g ? `${g} ${msT('vs the same days last month')}` : msT(sd && !sd.measured ? (sd.why === 'nocurrent' ? 'No sales figure for this month yet.' : 'No sales figure for the month before') : 'In the Report tab')) : wait, `msGoReports(this.dataset.r)`, dr));
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
  const m = msModelFor(v), D = m && msOf(m.D), sig = msSig(v);
  const kv = (a, b) => `<div class="kv"><span>${a}</span><span>${b}</span></div>`;
  const sec = (t, src, formula, view) => `<h4>${msT(t)}</h4><div><b>${msT('Source')}:</b> ${msT(src)}</div>${formula ? `<div><b>${msT('Formula')}:</b> ${msT(formula)}</div>` : ''}${view ? `<div style="margin-top:4px;">${view}</div>` : ''}`;
  const f2 = n => UMCore.groupThousands((Number(n) || 0).toFixed(2));   // the sums are written as the amounts are shown
  const dayOf = s => parseInt(String(s || '').slice(8, 10), 10) || '';
  const GROWTH = 'Growth % = (this month − the earlier month on the same days) ÷ the earlier month × 100. From nothing to something is said as "from zero", never as a percentage.';
  // against an earlier month, with this view's numbers: whose this month is, the earlier month (person by person when
  // the files stop on different days), who is not in it and why — or why there is nothing to compare
  const cmpView = (g, noneText) => {
    if(!g) return '';
    if(!g.measured) return `<div>${msT(g.why === 'nocurrent' ? 'No sales figure for this month yet, so nothing to compare with' : noneText)}</div>`;
    let h = kv(`${msT('This month')} (${msNames(g.people)})`, msKd(g.current));
    if(g.mixed) h += (g.people || []).map(r => { const b = g.byRep && g.byRep[r]; return b ? kv(`${msWho(r)}: ${msT('days 1 to')} ${msN(dayOf(b.to))} ${esc(monthLabel(g.month))}`, msKd(b.previous)) : ''; }).join('') + kv(msT('Total'), msKd(g.previous));
    else h += kv(`${msT('days 1 to')} ${msN(dayOf(g.to))} ${esc(monthLabel(g.month))}`, msKd(g.previous));
    if(Array.isArray(g.left) && g.left.length) h += `<div>${msNames(g.left)}: ${msT('no sales figure for')} ${esc(monthLabel(g.month))}${msT(', so not in this comparison')}</div>`;
    return h;
  };
  // the week so far (UMCore.execWeek), the line under the month's figures
  const weekSec = () => {
    const W = msWeek(v, sig); if(!W) return '';
    const why = x => x.why === 'nofile' ? `${msT('no sales file for')} ${esc(monthLabel(x.month))}` : x.why === 'short' ? msT('the sales files do not reach the start of the week') : `${msT('not in the sales files of')} ${esc(monthLabel(x.month))}`;
    return sec('This week (Sunday to today)', 'Field visits and orders as logged in the app, by the rules of the month above; invoiced sales from the ERP files, for the people the files hold this month.', '',
      kv(msT('Field visits'), msN(W.visits)) + kv(msT('Orders logged in the app'), `${msN(W.orders)} · ${msKd(W.value)}`)
      + (W.sales ? (W.sales.measured ? kv(`${msT('Invoiced sales')} (${msNames(W.sales.people)})`, msKd(W.sales.amount)) : '') + W.sales.missing.map(x => `<div>${msWho(x.rep)}: ${why(x)}</div>`).join('')
        : `<div>${msT('No sales file reaches into this week.')}</div>`));
  };
  // the month's customers (execDashboard.customers: the Clinics screen's list, the month figure's lines)
  const custSec = () => {
    const C = D && msOf(D.customers); if(!C) return '';
    const T = C.totals || {}, top = (Array.isArray(C.accounts) ? C.accounts.filter(a => a && !a.channel && a.net > 0) : []).slice(0, v.kind === 'team' ? 5 : 3);
    return sec('Biggest customers this month', 'The ERP sales files of this month — the same lines as the month figure — by customer account, as the Clinics screen lists them. Online and channel accounts are not in this list.', '',
      T.total == null ? `<div>${msT('No sales figure for this month yet.')}</div>`
        : kv(`${msT('The accounts shown')} (${msN(top.length)})`, msKd(top.reduce((x, a) => x + a.net, 0))) + kv(msT('All clinic accounts this month'), msKd(T.clinics))
          + kv(msT('Online and channel accounts'), msKd(T.channels)) + (T.ignored ? kv(msT('Accounts kept out of the list'), msKd(T.ignored)) : '') + kv(msT('Total invoiced this month'), msKd(T.total)));
  };
  let body = '';
  if(id === 'sales'){
    const P = msPeople(v, sig);
    body += `<div class="ms-src" data-ms="source">${I('info')}<span>${msSourceLine(v, P)}</span></div>`;   // where the card's numbers come from (it was the line under the greeting)
    body += sec('Invoiced sales', 'The ERP sales files only: every invoice line, returns deducted. A line counts for the owner of the clinic; on a shared account, for the salesman who issued it.',
      'The sum of the net invoiced value from day 1 of the month to the last day the sales files cover.',
      P.map(p => kv(msWho(p.rep), p.measured ? `${msKd(p.bm.amount)} · ${msT('files to')} ${msDate(p.bm.asOf)}` : `— · ${msT(p.bm.basis === 'none' ? 'no sales file for this month' : 'not in the sales files of this month')}`)).join('')
        + (P.length > 1 ? kv(msT('Total'), P.some(p => p.measured) ? msKd(P.filter(p => p.measured).reduce((s, p) => s + p.bm.amount, 0)) : '—') : ''));
    body += sec('Sales target', 'The DSR targets file. It gives the targets only: its achieved column is never used.', '',
      P.map(p => kv(msWho(p.rep), p.goal ? msKd(p.goal) : msT('no target on file'))).join(''));
    if(D){
      const A = msOf(D.achievement) || {}, Pd = msOf(D.perDay) || {}, wd = msOf(Pd.workdays) || {}, F = msOf(D.forecast);
      const some = (A.noTarget || []).length || (A.notMeasured || []).length;
      body += sec('Achievement', 'Invoiced sales from the ERP files and the target from the DSR, counting only the people who have both.', 'Achievement % = invoiced sales ÷ target × 100',
        A.pct != null ? `<div>${msN(`${f2(A.achieved)} ÷ ${f2(A.target)} × 100 = ${A.pct}%`)}</div>${some ? kv(msT('People counted'), msNames(A.people)) : ''}` : `<div>${msT('Needs a sales target and a sales figure for the same person')}</div>`);
      body += sec('Remaining to target', 'The same target and invoiced sales as the achievement percentage.', 'Remaining = max(target − invoiced sales, 0)',
        D.remaining != null ? `<div>${msN(`${f2(A.target)} − ${f2(A.achieved)}`)} = ${msKd(D.remaining)}</div>` : '');
      body += sec('Needed per working day', 'The remaining target, and the working days (Sunday to Thursday) after the last day the sales files cover.', 'Needed per working day = remaining ÷ working days left',
        (Pd.amount != null ? `<div>${msN(`${f2(D.remaining)} ÷ ${wd.left}`)} = ${msKd(Pd.amount)}</div>` : D.remaining > 0 && wd.left === 0 ? `<div>${msT('no working day left')}</div>` : '')
        + `<div class="ms-fine">${msT(`Working days of the month: ${wd.total} · done: ${wd.done} · left: ${wd.left}`)}</div>`);
      const exp = msExpected(wd);
      if(exp != null) body += sec('Expected by now (the dark line)', 'The working days (Sunday to Thursday) from day 1 to the last day the sales files cover, against the working days of the month.',
        'Expected % = working days done ÷ working days of the month × 100. On pace from 90% of the expected figure, ahead from 100% (the rule of the management report).', `<div>${msN(`${wd.done} ÷ ${wd.total} × 100 = ${exp}%`)}</div>`);
      // each person's line with her own invoiced figure in it; the card's "% of target" worked out for the people with a target
      if(F) body += sec('Forecast for the month', 'The pace of invoiced sales so far in the ERP files, person by person — the formula of the management report.',
        'Forecast = invoiced so far ÷ working days done × working days of the month, for each person, then added up. A projection, not a sale.',
        F.amount != null ? Object.keys(F.byRep || {}).map(r => { const x = F.byRep[r], b = (Array.isArray(D.byPerson) ? D.byPerson : []).find(p => p && p.rep === r);
            return kv(msWho(r), `${msN(`${f2(b ? b.amount : 0)} ÷ ${Math.max(1, x.done)} × ${x.total}`)} = ${msKd(x.amount)}`); }).join('') + kv(msT('Total'), msKd(F.amount))
          + (F.pct != null && F.forTarget != null && F.target != null ? kv(`${msT('% of target')} (${msNames(A.people)})`, msN(`${f2(F.forTarget)} ÷ ${f2(F.target)} × 100 = ${F.pct}%`)) : '') : '');
      const sd = msOf(D.sameDays);
      if(sd) body += sec('Against the same days of the month before', 'The ERP sales files of both months, for the people measured in both.', GROWTH,
        cmpView(sd, 'No sales figure for the month before (no sales file covers it, or the files hold none of these people), so nothing to compare with'));
    }
  } else if(id === 'work'){
    const Vi = D && msOf(D.visits), O = D && msOf(D.orders), C = D && msOf(D.conversion), N = D && msOf(D.newCustomers);
    body += sec('Field visits', 'Visits as logged in the app — not calls and not phone orders. A joint visit counts once for the team.', '', Vi ? kv(msT('This month'), msN(Vi.count)) : '');
    body += sec('Conversion to an order', 'The field visits a person led that took an order, against the field visits she led (a joint visit\'s order is its leader\'s).', 'Conversion % = led visits with an order ÷ led visits × 100',
      C && C.pct != null ? `<div>${msN(`${C.withOrder} ÷ ${C.visits} × 100 = ${C.pct}%`)}</div>` : '');
    body += sec('Orders logged in the app', 'Every visit or phone order with an order, for the person who logged it. These are not invoiced sales: invoiced sales come from the ERP files only.', '',
      O ? kv(msT('Orders'), msN(O.count)) + kv(msT('Value logged'), msKd(O.value)) : '');
    body += sec('New customers', 'The ERP sales files: an account whose first invoice in all the saved files falls in this month. Online and channel accounts are not counted.', 'The number of those accounts for the people of the view.',
      N ? (N.measurable ? kv(msT('This month'), msN(N.count)) + (Array.isArray(N.blocked) && N.blocked.length ? `<div>${msNames(N.blocked)}: ${msT('not counted — the sales files do not hold the month before, so every account would look new')}</div>` : '')
        : `<div>${msT('Needs sales files that start at least a month earlier, or every account would look new')}</div>`) : '');
    body += weekSec();
  } else if(id === 'visits'){
    const k = m ? msKpiNums(m) : null, NC = D && msOf(D.newCustomers);
    body += sec('Visits a day, doctors and new accounts', 'The KPI scorecard (More → KPI scorecard) for this person, this month, with the KPI settings of the supervisor.',
      'Visits a day = field visits ÷ working days so far (a joint visit counts for both people). Doctors = different doctors met on field visits.',
      k && k.month ? kv(msT('Visits a day'), `${msN(k.month.perDay.toFixed(1))} · ${msT(`${k.month.count} visits in ${k.month.days} working days`)}`)
        + (k.goal != null ? kv(msT('Goal'), msT(`goal ${k.goal} a day`)) : '')
        + (k.doctors != null ? kv(msT('Doctors'), `${k.doctorsGoal != null ? msT(`${k.doctors} of ${k.doctorsGoal}`) : msN(k.doctors)}${k.doctorsBy != null ? ' · ' + msT(`expected ${k.doctorsBy}`) : ''}`) : '')
        + (k.accounts != null && NC && NC.measurable ? kv(msT('New accounts'), k.accountsGoal != null ? msT(`${k.accounts} of ${k.accountsGoal}`) : msN(k.accounts)) : '')
        + (NC && !NC.measurable ? `<div>${msT('New accounts: not measured yet — they are counted only when the sales files hold the month before for this person; otherwise every account would look new.')}</div>` : '')
        + (k.total != null ? kv(msT('Performance score (KPI)'), msT(`${k.total} of 100`)) : '') : '');
    body += weekSec();
  } else if(id === 'chart'){
    const Dy = D && msOf(D.daily), sd = D && msOf(D.sameDays), ly = D && msOf(D.lastYear), Y = D && msOf(D.ytd), A = D && msOf(D.achievement) || {};
    const Pr = Dy && msOf(Dy.pair), withT = A.pct != null && !!Pr && Array.isArray(Pr.days) && Pr.days.length > 0, days = withT ? Pr.days : Dy && Dy.days;
    // Sales Performance (the weekly bars), with this view's numbers week by week
    const Wk = Dy && Dy.measured && Array.isArray(days) && days.length ? UMCore.homeWeeks(msMonth(), days, withT ? A.target : null) : null;
    body += sec('Sales Performance (the weekly bars)', 'The ERP sales files: the same lines as the month figure, of the people with a target and a sales figure (with no target: everyone\'s).',
      'W1 = days 1–7, W2 = 8–14, W3 = 15–21, W4 = day 22 to the end of the month. A bar = the invoiced sales from day 1 to the last day of its week (the running week: to the last day the files cover — the month figure). The dashed line = the target × the working days (Sunday to Thursday) from day 1 to that day ÷ the working days of the month.',
      Wk ? Wk.map(w => kv(`<span>${esc('W' + w.week)}</span> (${msDate(w.from)} – ${msDate(w.to)})`, `${w.achieved != null ? msKd(w.achieved) : '—'}${w.pace != null ? ` · ${msT('target pace')} ${msKd(w.pace)}` : ''}`)).join('') : '');
    body += sec('Sales day by day', 'The ERP sales files: the net invoiced value of each day, from day 1 to the last day the sales files cover, added up day after day.',
      'The straight line runs from 0 on day 1 to the target on the last day of the month; the dotted line is the month-end forecast at the pace so far.',
      Dy && Dy.measured && Array.isArray(days) ? kv(msT('Days'), msN(days.length)) + kv(withT ? `${msT('Total')} (${msNames(A.people)})` : msT('Total'), msKd(days.reduce((a, d) => a + (Number(d.net) || 0), 0)))
        + (withT ? kv(msT('Sales target'), msKd(A.target)) : '') : '');
    const cmp = (t, g, none) => sec(t, 'The ERP sales files of both months, for the people measured in both.', GROWTH, cmpView(g, none));
    body += cmp('Against the same days of the month before', sd, 'No sales figure for the month before (no sales file covers it, or the files hold none of these people), so nothing to compare with');
    if(ly) body += cmp('Against the same month a year before', ly, 'No sales figure for that month a year before (no sales file covers it, or the files hold none of these people), so nothing to compare with');
    if(Y){
      const L = msOf(Y.like) || {};
      body += sec('Year to date', "The ERP sales files of each month and that month's own DSR target, from January to this month.",
        "Year to date = the sum of the months' invoiced sales. The percentage counts only the months and people that have both a sales figure and a target.",
        (Y.sales != null ? kv(msT('Invoiced sales'), msKd(Y.sales)) : '') + (L.pct != null ? kv(msT('Where a month has both'), `${msKd(L.sales)} ${msT('of')} ${msKd(L.target)} = ${msPct(L.pct)}`) : ''));
    }
  } else if(id === 'brands'){
    const B = D && msOf(D.byBrand), rows = B && Array.isArray(B.rows) ? B.rows.filter(b => b && (b.net || b.target)) : [];
    const name = k => (m && m.brands && m.brands[k]) || k;
    body += sec('Brands', 'The month\'s invoiced lines by brand (returns deducted), and the brand targets of the DSR.', 'Brand % = sold of the brand ÷ the brand\'s target × 100, for the people who have both.',
      rows.map(b => kv(msData(name(b.brand)), b.pct != null ? `${msN(`${f2(b.achieved)} ÷ ${f2(b.goal)} × 100 = ${b.pct}%`)}${b.net != null && Math.round(b.net * 100) !== Math.round(b.achieved * 100) ? ` · ${msT('sold in all')} ${msKd(b.net)}` : ''}`
        : `${b.net != null ? msKd(b.net) : '—'} · ${msT(b.target != null ? 'no sales figure for the people with its target' : 'no brand target')}`)).join('')
        + (B && B.total != null ? kv(msT('Total'), msKd(B.total)) : ''));
  } else if(id === 'act' || id === 'pcust'){
    // this view's counts, and the months the customers were compared with
    const act = D && msOf(D.act), on = act && act.measurable;
    const months = on && Array.isArray(act.prior) ? act.prior.map(p => esc(monthLabel(p.month))).join(uiLang === 'ar' ? '، ' : ', ') : '';
    const notYet = act && !on ? `<div>${msT('Not measured: no sales figure for this month yet')}</div>` : '';
    body += sec('Under-performing', 'The ERP sales files of this month and the 3 months before.', 'Bought in at least 2 of the 3 months before, and this month less than half of their average on the same days.',
      on ? kv(msT('Under-performing'), msN((act.under || []).length)) + (months ? `<div>${msT('Compared with the same days of')} ${months} (${msT(`days 1–${act.day}`)}).</div>` : '') : notYet);
    body += sec('High potential', 'The clinic list (class) and the ERP sales files.', 'A clinic graded A or B with no paid invoice this month, and one in at most 1 of the 3 months before.',
      on ? kv(msT('High potential'), msN((act.potential || []).length)) : notYet);
    if(id === 'pcust') body += custSec();
  } else if(id === 'cust'){
    body += custSec();
  }
  if(!D && id !== 'visits') body += msWait(m);
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
  const r = await persistTold('dayPlans');
  closeModal();
  saveToast(r, 'dayPlans', `📅 Moved to ${fmtDate(newDate)}`);
  renderMissedPlans();
  msPlanChanged();
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
  msPlanChanged();
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
  msBell();

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
  const recent = visibleVisits().filter(x => !r || x.rep === r || x.withRep === r).sort((a,b)=>b.date.localeCompare(a.date) || (b.ts||0) - (a.ts||0)).slice(0,3);
  if(recent.length===0){
    rv.innerHTML = `<div class="empty">🌱 Your first logged visit starts the story.</div>`;
  } else {
    // the picture's Recent Activity: what was logged (a field visit, a call, an order logged in the app — never a sale), where, how long ago
    rv.innerHTML = `<div class="ms-tl">${recent.map(x=>{
      const clinic = clinics.find(c=>c.id===x.clinicId), name = clinic ? clinic.name : clinicLabel(x.clinicId, x);
      const kind = x.callOnly ? ['phone', 'Call logged'] : x.orderTaken ? ['cart', 'Order logged in the app'] : ['ncal', 'Visit logged'];
      return `<div class="card ms-tli">
        <span class="ms-tile">${kind[0] === 'ncal' ? IF(kind[0]) : I(kind[0])}</span>
        <div class="ms-tlt">
          <div class="clinic-name"><span class="k">${msT(kind[1])}</span><span class="d" data-notr> – </span><span class="nm" dir="auto">${esc(name)}</span></div>
          <div class="clinic-sub">${x.callOnly?(CHANNEL_LABELS[x.channel]||'📞')+' · ':''}${fmtDate(x.date)}${x.orderTaken ? ' · '+msKd(x.orderTotal) : ''}${sup?' · '+msWho(x.rep):''}${rxShortHTML(x)}</div>
        </div>
        <span class="ms-ago">${msAgo(x)}</span>
      </div>`;
    }).join('')}</div>`;
  }
}
// how long ago a visit was logged: minutes or hours on its day (its own time stamp), else days
function msAgo(x){
  const today = todayStr();
  if(x.date === today && x.ts > 0 && x.ts <= Date.now()){
    const min = Math.max(0, Math.round((Date.now() - x.ts) / 60000));
    if(min < 60) return msT(min < 2 ? 'just now' : `${min} min ago`);
    if(min < 24 * 60) return msT(`${Math.floor(min / 60)}h ago`);
  }
  const d = Math.round((new Date(today + 'T00:00:00') - new Date(x.date + 'T00:00:00')) / 86400000);
  return msT(d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`);
}
// phone: what each folded card holds, in one line — the plan (done, and the planned visits missed lately), the
// follow-ups, the tasks with a doctor's birthday today and the doctor cards to complete, the last visit — so
// nothing inside a fold waits unseen for a tap
var _msNudge = { cards: 0, bdayToday: 0 };                // what the doctor-cards nudge and the occasions card hold (they fill it as they draw; a var: 10-doctors-products.js writes it)
function msFoldSums(v, due){
  const set = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
  const today = todayStr(), dayObj = dayPlans[today] || {}, keys = planDoneKeys(today);
  const planOf = r => { const e = (dayObj[r] || []).map(planEntryId).filter(id => clinics.some(c => c.id === id)); return { n: e.length, done: e.filter(id => keys.has(today + '|' + r + '|' + id)).length }; };
  const lr = v.kind === 'person' ? v.rep : null;
  // the missed planned visits renderMissedPlans lists for this view (before it keeps 8)
  let missed = 0;
  try{ missed = UMCore.missedPlans(dayPlans, visits, today, { daysBack: 14 }).filter(x => currentUser.role === 'supervisor' ? (!lr || x.rep === lr) : x.rep === currentUser.name).length; }catch(e){}
  const miss = missed ? ` · ${msT(`${missed} missed`)}` : '';
  if(v.kind === 'person'){ const p = planOf(v.rep); set('msPlanSum', msT(p.n ? `${p.done} of ${p.n} done` : 'No plan yet') + miss); }
  else { const parts = repsForPlan().map(r => ({ r, p: planOf(r) })).filter(x => x.p.n);        // the people the plan list shows
    set('msPlanSum', (parts.length ? parts.map(x => `${msWho(x.r)} ${msT(`${x.p.done} of ${x.p.n}`)}`).join(' · ') : msT('No plan yet')) + miss); }
  const over = due.filter(c => followStatus(c.nextFollowUp) === 'overdue').length;
  set('msDueSum', due.length ? `${msT(msCount(due.length, 'due', 'due'))}${over ? ' · ' + msT(`${over} overdue`) : ''}` : msT('None due'));
  const open = visibleTasks().filter(t => !t.done && (!lr || t.rep === lr || t.rep === 'Team')).length, N = _msNudge || {};
  set('msTaskSum', msT(open ? msCount(open, 'open task', 'open tasks') : 'No open tasks')
    + (N.bdayToday ? ` · 🎂 ${msT(msCount(N.bdayToday, 'birthday today', 'birthdays today'))}` : '')
    + (N.cards ? ` · ${msT(msCount(N.cards, 'doctor card to complete', 'doctor cards to complete'))}` : ''));
  const last = visibleVisits().filter(x => !lr || x.rep === lr || x.withRep === lr).sort((a, b) => b.date.localeCompare(a.date))[0];
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
  // the supervisor on the team view: a task for the whole team; on a person's screen (his own included): that person's —
  // it shows on her phone and nobody else's (the placeholder says whose it will be)
  const lr = currentUser.role==='supervisor' ? msListRep() : null;
  tasks.push({id:uid(), text:val, done:false, created:todayStr(), rep: currentUser.role==='supervisor' ? (lr || 'Team') : currentUser.name});
  inp.value='';
  await persist('tasks');
  renderToday();
}
async function toggleTask(id){ const t = tasks.find(x=>x.id===id); if(t){ t.done = !t.done; if(t.done && navigator.vibrate) navigator.vibrate(10); await persist('tasks'); renderToday(); } }
async function deleteTask(id){ tomb('tasks', id); tasks = tasks.filter(x=>x.id!==id); await persist('tasks'); renderToday(); }

// ---- TODAY'S PLAN ----
// A plan changed (planned from the main screen, a missed visit moved or cleared, the planner closed): on the main
// screen everything that reads the plan follows at once — the next step, the plan row, the KPI — not only the list.
function msPlanChanged(){ if(activeView === 'today' && currentUser) renderToday(); else renderPlanList(); }
function repsForPlan(){ return currentUser.role==='supervisor' ? [currentUser.name, ...REPS.filter(r=>r!==currentUser.name)] : [currentUser.name]; }
function planEntryId(e){ return typeof e==='string' ? e : e.id; }
function planEntryNote(e){ return typeof e==='string' ? '' : (e.note||''); }
function renderPlanList(){
  const el = document.getElementById('planList');
  const today = todayStr(), keys = planDoneKeys(today);
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
      const visitedToday = keys.has(today + '|' + r + '|' + cid);      // a field visit she was on (planDoneKeys)
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
    <button class="btn" onclick="closeModal(); msPlanChanged();">Done</button>
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
  msPlanChanged();
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
    <button class="btn secondary" onclick="closeModal(); msPlanChanged();">Close</button>
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
    <button class="btn" onclick="closeModal(); msPlanChanged(); renderCalendar(); if(document.getElementById('pvRangeLabel')) renderWeekMonthPlan();">Done</button>
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

